// entregas.js — ENTREGAS ONLINE de uma atividade (hoje: vídeo do StopMotion RAN).
//
// O QUE E'
//   Na planilha de notas, o botão 🎬 de uma atividade abre esta janela. O professor cria um
//   LINK DE ENTREGA (com QR) e manda para a turma. O aluno abre o link no site do StopMotion
//   (https://stopmotionran.vercel.app/?tarefa=CODIGO), vê o nome da tarefa e, ao terminar a
//   animação, toca em "Enviar ao professor": o vídeo vai para o Google Drive do professor
//   (pelo Apps Script que ele publicou) e o StopMotion registra a entrega aqui.
//   De volta à planilha, o professor vê quem entregou e quando, abre o vídeo e lança a nota.
//
// ONDE MORA CADA COISA
//   trabalho.entregaOnline        { codigo, criadaEm } — no caderno do professor (data.trabalhos),
//                                 com os vínculos entrega -> estudante (vinculos).
//   entregas_tarefas/<CODIGO>     o que o aluno precisa ver: título, turma, prazo, aberta e o
//                                 endereço do Apps Script de destino. NADA de dado de estudante.
//                                 Lido pelo código (get), nunca listado.
//     entregas/<id>               o que o aluno mandou: nome, turma, projeto, link do vídeo e a
//                                 hora do SERVIDOR. O aluno cria; só o professor lê e apaga.
//   O nome que o aluno digita no StopMotion é casado com a lista da turma aqui, no aparelho
//   do professor; a lista da turma nunca sai do caderno.

(function () {
'use strict';

const LS_SITE = 'entregas_site_stopmotion';
const LS_DESTINO = 'entregas_destino_drive';
const SITE_PADRAO = 'https://stopmotionran.vercel.app/';
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I: o aluno digita sem errar

let aberto = null;          // id da atividade na janela
let entregasCache = [];     // entregas lidas do banco para a atividade aberta
let estadoLeitura = '';     // '', 'lendo', 'erro:<mensagem>'

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function lsGet(k, padrao) { try { return localStorage.getItem(k) || padrao; } catch (_) { return padrao; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } }

function uidAtual() {
    try {
        const u = window.firebase && firebase.auth && firebase.auth().currentUser;
        if (u && u.uid) return u.uid;
    } catch (_) { /* sem auth */ }
    return '';
}
function temBanco() { return typeof db !== 'undefined' && !!db; }
function agoraServidor() {
    return (window.firebase && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date();
}

function trabalho() { return (data.trabalhos || []).find(t => t.id == aberto) || null; }
function turmaDo(t) { return (data.turmas || []).find(x => x.id == t.id_turma) || null; }
function tarefaRef(codigo) { return db.collection('entregas_tarefas').doc(codigo); }

function siteStopMotion() {
    let s = lsGet(LS_SITE, SITE_PADRAO).trim();
    if (!/\/$/.test(s)) s += '/';
    return s;
}
function linkDoAluno(codigo) { return siteStopMotion() + '?tarefa=' + encodeURIComponent(codigo); }

function gerarCodigo() {
    const bytes = new Uint8Array(8);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('');
}

// ---------------------------------------------------------------------------
// Casar o nome digitado pelo aluno com a lista da turma
// ---------------------------------------------------------------------------
function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const LIGACOES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function partes(s) { return normalizar(s).split(' ').filter(p => p && !LIGACOES.has(p)); }

// Pontua de 0 a 1: o primeiro nome tem de bater; cada outro nome igual soma. Só o primeiro
// nome ("Mariana") vale quando ninguém mais da turma tem esse nome (empate não casa).
function pontuar(digitado, completo) {
    const a = partes(digitado), b = partes(completo);
    if (!a.length || !b.length) return 0;
    if (a.join(' ') === b.join(' ')) return 1;
    if (a[0] !== b[0]) return 0;
    const resto = a.slice(1).filter(p => b.slice(1).includes(p)).length;
    return 0.5 + 0.5 * (resto / Math.max(1, a.length - 1));
}

// Devolve o estudante só quando há um vencedor claro (nada de chute entre dois "João").
function melhorEstudante(nome, estudantes) {
    const notas = estudantes.map(e => ({ e, p: pontuar(nome, e.nome_completo) })).filter(x => x.p >= 0.5)
        .sort((x, y) => y.p - x.p);
    if (!notas.length) return null;
    if (notas.length > 1 && notas[1].p === notas[0].p) return null;
    return notas[0].e;
}

function estudanteDaEntrega(t, en, estudantes) {
    const v = (t.entregaOnline && t.entregaOnline.vinculos) || {};
    if (Object.prototype.hasOwnProperty.call(v, en.id)) {
        if (v[en.id] === '') return null;     // professor marcou "não é da turma"
        return estudantes.find(e => String(e.id) === String(v[en.id])) || null;
    }
    return melhorEstudante(en.nome, estudantes);
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------
function dadosPublicos(t, aberta) {
    const tu = turmaDo(t);
    return {
        donoUid: uidAtual(),
        tipo: 'stopmotion',
        titulo: String(t.titulo || 'Atividade').slice(0, 80),
        turma: tu ? String(tu.nome || '').slice(0, 40) : '',
        disciplina: tu ? String(tu.disciplina || '').slice(0, 40) : '',
        prazo: (t.entregaOnline && t.entregaOnline.prazo) || '',
        aberta: !!aberta,
        destinoUrl: lsGet(LS_DESTINO, '').trim().slice(0, 300),
        atualizadaEm: agoraServidor()
    };
}

async function criarLink() {
    const t = trabalho();
    if (!t) return;
    if (!temBanco() || !uidAtual()) { alert('Para criar o link é preciso estar conectado à internet e com a sessão ativa.'); return; }
    let codigo = '';
    for (let i = 0; i < 5 && !codigo; i++) {
        const tentativa = gerarCodigo();
        try {
            await tarefaRef(tentativa).set(Object.assign(dadosPublicos(t, true), { criadaEm: agoraServidor() }));
            codigo = tentativa;
        } catch (e) {
            console.warn('[Entregas] código ' + tentativa + ' recusado:', e && e.code);
            if (e && e.code && e.code !== 'permission-denied') break;
        }
    }
    if (!codigo) {
        alert('Não consegui criar o link. Verifique a internet. Se acabou de atualizar o sistema, o administrador precisa publicar as Regras novas do banco (firestore.rules).');
        return;
    }
    t.entregaOnline = { codigo, aberta: true, prazo: '', vinculos: {}, criadaEm: new Date().toISOString() };
    await persistirDados();
    render();
    lerEntregas();
}

// Regrava a parte pública (título, prazo, aberta, destino) depois de uma mudança.
async function publicar() {
    const t = trabalho();
    if (!t || !t.entregaOnline) return;
    await persistirDados();
    if (!temBanco() || !uidAtual()) { alert('Sem internet: a mudança fica no caderno e vai para o link quando você abrir esta janela conectado.'); return; }
    try { await tarefaRef(t.entregaOnline.codigo).set(dadosPublicos(t, t.entregaOnline.aberta !== false), { merge: true }); }
    catch (e) { alert('Não consegui atualizar o link: ' + ((e && e.message) || e)); }
}

async function lerEntregas() {
    const t = trabalho();
    if (!t || !t.entregaOnline) return;
    if (!temBanco() || !uidAtual()) { estadoLeitura = 'erro:Sem internet ou sem sessão: não dá para ver as entregas agora.'; render(); return; }
    estadoLeitura = 'lendo';
    render();
    try {
        const snap = await tarefaRef(t.entregaOnline.codigo).collection('entregas').get();
        entregasCache = snap.docs.map(d => {
            const x = d.data() || {};
            const em = x.em && x.em.toDate ? x.em.toDate() : (x.em ? new Date(x.em) : null);
            return { id: d.id, nome: x.nome || '', turma: x.turma || '', projeto: x.projeto || '', arquivoUrl: x.arquivoUrl || '', quadros: x.quadros || 0, segundos: x.segundos || 0, em };
        }).sort((a, b) => (b.em ? b.em.getTime() : 0) - (a.em ? a.em.getTime() : 0));
        estadoLeitura = '';
    } catch (e) {
        estadoLeitura = 'erro:' + (e && e.code === 'permission-denied'
            ? 'O banco recusou a leitura. O administrador precisa publicar as Regras novas (firestore.rules).'
            : 'Não consegui ler as entregas: ' + ((e && e.message) || e));
    }
    render();
}

// ---------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------
function fmtData(d) {
    if (!d) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function valorNota(t, estudanteId) {
    const n = (data.notas || []).find(x => x.id_trabalho == t.id && String(x.id_estudante) === String(estudanteId));
    return n && n.valor != null ? String(n.valor) : '';
}

function htmlLista(t) {
    if (estadoLeitura === 'lendo') return '<p class="empty-state" style="margin:8px 0;">Lendo as entregas…</p>';
    if (estadoLeitura.startsWith('erro:')) return `<p style="color:#b91c1c; font-size:13px;">${esc(estadoLeitura.slice(5))}</p>`;

    const estudantes = estudantesPlanilhaTrabalhos();
    // Mais recente de cada estudante (o aluno pode reenviar); entregas sem estudante ficam todas.
    const porEstudante = new Map();
    const semDono = [];
    entregasCache.forEach(en => {
        const e = estudanteDaEntrega(t, en, estudantes);
        if (!e) { semDono.push(en); return; }
        const k = String(e.id);
        if (!porEstudante.has(k)) porEstudante.set(k, { e, ultima: en, total: 0 });
        porEstudante.get(k).total += 1;
    });
    const faltam = estudantes.filter(e => !porEstudante.has(String(e.id)));
    const opcoes = sel => `<option value="">— não é da turma —</option>` + estudantes.map(e =>
        `<option value="${esc(String(e.id))}" ${sel != null && String(sel) === String(e.id) ? 'selected' : ''}>${esc(e.nome_completo)}</option>`).join('');

    const linhaVideo = en => en.arquivoUrl
        ? `<a href="${esc(en.arquivoUrl)}" target="_blank" rel="noopener" class="btn btn-xs btn-secondary">▶ Ver vídeo</a>`
        : '<span style="font-size:11px; color:#5f6b7f;">sem link</span>';
    const detalhes = en => `${esc(fmtData(en.em))}${en.projeto ? ' · “' + esc(en.projeto) + '”' : ''}${en.segundos ? ' · ' + esc(String(Math.round(en.segundos))) + ' s' : ''}`;

    return `
        <p style="font-size:13px; margin:4px 0 8px;"><strong>${porEstudante.size}</strong> de ${estudantes.length} entregaram${semDono.length ? ` · <strong style="color:#b45309;">${semDono.length}</strong> sem estudante ligado` : ''}.</p>
        ${semDono.length ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:8px 10px; margin-bottom:10px;">
            <p style="font-size:12px; margin:0 0 6px; color:#9a3412;">Não reconheci o nome destas entregas. Escolha o estudante:</p>
            ${semDono.map(en => `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:4px 0; border-bottom:1px dashed #fed7aa; font-size:13px;">
                <span style="flex:1; min-width:140px;"><strong>${esc(en.nome)}</strong>${en.turma ? ' (' + esc(en.turma) + ')' : ''}<br><span style="font-size:11px; color:#5f6b7f;">${detalhes(en)}</span></span>
                ${linhaVideo(en)}
                <select style="margin:0; max-width:220px;" onchange="entregasVincular('${esc(en.id)}', this.value)">${opcoes(null)}</select>
            </div>`).join('')}
        </div>` : ''}
        <div style="max-height:46vh; overflow:auto; border:1px solid #e3e8ef; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead><tr style="background:#f6f8fb;"><th style="text-align:left; padding:6px 8px;">Estudante</th><th style="text-align:left; padding:6px 8px;">Entrega</th><th style="padding:6px 8px;">Nota</th></tr></thead>
            <tbody>
            ${[...porEstudante.values()].sort((a, b) => a.e.nome_completo.localeCompare(b.e.nome_completo)).map(({ e, ultima, total }) => `
                <tr style="border-top:1px solid #e3e8ef;">
                    <td style="padding:6px 8px;">${esc(e.nome_completo)}${normalizar(ultima.nome) !== normalizar(e.nome_completo) ? `<br><span style="font-size:11px; color:#5f6b7f;">digitou “${esc(ultima.nome)}” · <a href="#" onclick="entregasDesvincular('${esc(ultima.id)}'); return false;">não é</a></span>` : ''}</td>
                    <td style="padding:6px 8px;">${linhaVideo(ultima)} <span style="font-size:11px; color:#5f6b7f;">${detalhes(ultima)}${total > 1 ? ' · ' + total + ' envios' : ''}</span></td>
                    <td style="padding:6px 8px; text-align:center;"><input type="text" value="${esc(valorNota(t, e.id))}" placeholder="-" style="width:56px; text-align:center; margin:0;" onchange="salvarNota(${esc(JSON.stringify(t.id))}, '${esc(String(e.id))}', this.value)"></td>
                </tr>`).join('')}
            ${faltam.map(e => `
                <tr style="border-top:1px solid #e3e8ef; color:#7a869a;">
                    <td style="padding:6px 8px;">${esc(e.nome_completo)}</td>
                    <td style="padding:6px 8px; font-size:12px;">ainda não entregou</td>
                    <td style="padding:6px 8px; text-align:center;"><input type="text" value="${esc(valorNota(t, e.id))}" placeholder="-" style="width:56px; text-align:center; margin:0;" onchange="salvarNota(${esc(JSON.stringify(t.id))}, '${esc(String(e.id))}', this.value)"></td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>`;
}

function render() {
    const t = trabalho();
    const modal = document.getElementById('modalNovoTrabalho');
    if (!t || !modal) return;
    const eo = t.entregaOnline;
    const destino = lsGet(LS_DESTINO, '');

    const config = `
        <details style="margin-top:12px; font-size:12px;" ${destino ? '' : 'open'}>
            <summary style="cursor:pointer; font-weight:bold;">⚙️ Para onde vão os vídeos</summary>
            <p style="margin:6px 0; color:#5f6b7f;">Os vídeos vão para o seu Google Drive pelo Apps Script de entregas do StopMotion. Cole aqui o endereço do seu Apps Script publicado (termina em <code>/exec</code>). Em branco, vale o destino padrão do site do StopMotion.</p>
            <input type="url" id="entregasDestino" value="${esc(destino)}" placeholder="https://script.google.com/macros/s/…/exec" style="width:100%; margin:0 0 6px;">
            <label style="display:block; margin:0 0 6px;">Endereço do site do StopMotion
                <input type="url" id="entregasSite" value="${esc(siteStopMotion())}" style="width:100%; margin:2px 0 0;">
            </label>
            <button type="button" class="btn btn-xs btn-secondary" onclick="entregasSalvarConfig()">Salvar</button>
        </details>`;

    let corpo;
    if (!eo) {
        corpo = `
            <p style="font-size:13px; color:#3d4759;">Crie um link para a turma entregar o vídeo de <strong>stop motion</strong> desta atividade. O aluno abre o link, faz a animação no StopMotion RAN e toca em <strong>Enviar ao professor</strong>. A entrega aparece aqui e você lança a nota.</p>
            <button type="button" class="btn btn-primary" onclick="entregasCriarLink()">🎬 Criar link de entrega</button>
            ${config}`;
    } else {
        const link = linkDoAluno(eo.codigo);
        const aberta = eo.aberta !== false;
        corpo = `
            <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start;">
                <div id="entregasQr" style="background:#fff; padding:6px; border:1px solid #e3e8ef; border-radius:8px; width:142px; height:142px;"></div>
                <div style="flex:1; min-width:200px;">
                    <p style="font-size:12px; color:#5f6b7f; margin:0 0 4px;">Link para os alunos (código <strong style="letter-spacing:1px;">${esc(eo.codigo)}</strong>)</p>
                    <input type="text" readonly value="${esc(link)}" onclick="this.select()" style="width:100%; margin:0 0 6px; font-size:12px;">
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-xs btn-secondary" onclick="entregasCopiarLink(this)">📋 Copiar link</button>
                        <a class="btn btn-xs btn-secondary" href="${esc(link)}" target="_blank" rel="noopener">Abrir</a>
                        <button type="button" class="btn btn-xs btn-secondary" onclick="entregasLer()">↻ Atualizar entregas</button>
                    </div>
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:8px; font-size:13px;">
                        <label style="display:inline-flex; gap:6px; align-items:center; margin:0; cursor:pointer;">
                            <input type="checkbox" role="switch" ${aberta ? 'checked' : ''} onchange="entregasAbrirFechar(this.checked)"> Recebendo entregas
                        </label>
                        <label style="display:inline-flex; gap:6px; align-items:center; margin:0;">Prazo
                            <input type="date" value="${esc(eo.prazo || '')}" style="margin:0;" onchange="entregasPrazo(this.value)">
                        </label>
                    </div>
                </div>
            </div>
            <h4 style="margin:14px 0 4px;">Entregas</h4>
            ${htmlLista(t)}
            ${config}`;
    }

    modal.querySelector('.modal-content').innerHTML = `
        <h3 style="margin-bottom:4px;">🎬 Entrega online — ${esc(t.titulo)}</h3>
        ${corpo}
        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
            <button type="button" class="btn btn-secondary" onclick="entregasFechar()">Fechar</button>
        </div>`;
    if (eo) desenharQr(linkDoAluno(eo.codigo));
}

function desenharQr(texto) {
    const alvo = document.getElementById('entregasQr');
    if (!alvo) return;
    const pintar = () => {
        try { alvo.innerHTML = ''; new window.QRCode(alvo, { text: texto, width: 130, height: 130 }); }
        catch (_) { alvo.style.display = 'none'; }
    };
    if (window.QRCode) { pintar(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = pintar;
    s.onerror = () => { alvo.style.display = 'none'; };
    document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Ações (chamadas pelo HTML)
// ---------------------------------------------------------------------------
window.abrirEntregasOnline = function (trabalhoId) {
    aberto = trabalhoId;
    entregasCache = [];
    estadoLeitura = '';
    render();
    showModal('modalNovoTrabalho');
    const t = trabalho();
    if (t && t.entregaOnline) lerEntregas();
};
window.entregasFechar = function () {
    closeModal('modalNovoTrabalho');
    aberto = null;
    if (typeof renderTrabalhos === 'function') renderTrabalhos();
};
window.entregasCriarLink = criarLink;
window.entregasLer = lerEntregas;
window.entregasAbrirFechar = async function (ligado) {
    const t = trabalho();
    if (!t || !t.entregaOnline) return;
    t.entregaOnline.aberta = !!ligado;
    await publicar();
};
window.entregasPrazo = async function (valor) {
    const t = trabalho();
    if (!t || !t.entregaOnline) return;
    t.entregaOnline.prazo = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : '';
    await publicar();
};
window.entregasSalvarConfig = async function () {
    const d = (document.getElementById('entregasDestino') || {}).value || '';
    const s = (document.getElementById('entregasSite') || {}).value || '';
    if (d && !/^https:\/\/script\.google(usercontent)?\.com\//.test(d.trim())) { alert('O endereço do Apps Script começa com https://script.google.com/'); return; }
    if (s && !/^https:\/\//.test(s.trim())) { alert('O endereço do site precisa começar com https://'); return; }
    lsSet(LS_DESTINO, d.trim());
    lsSet(LS_SITE, s.trim() || SITE_PADRAO);
    const t = trabalho();
    if (t && t.entregaOnline) await publicar();
    render();
};
window.entregasVincular = async function (entregaId, estudanteId) {
    const t = trabalho();
    if (!t || !t.entregaOnline) return;
    t.entregaOnline.vinculos = t.entregaOnline.vinculos || {};
    t.entregaOnline.vinculos[entregaId] = estudanteId ? idEstudanteGravado(estudanteId) : '';
    await persistirDados();
    render();
};
window.entregasDesvincular = function (entregaId) { return window.entregasVincular(entregaId, ''); };
window.entregasCopiarLink = function (botao) {
    const t = trabalho();
    if (!t || !t.entregaOnline) return;
    const link = linkDoAluno(t.entregaOnline.codigo);
    const ok = () => { if (botao) { const o = botao.textContent; botao.textContent = '✓ Copiado'; setTimeout(() => { botao.textContent = o; }, 1500); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, () => prompt('Copie o link:', link));
    else prompt('Copie o link:', link);
};

// Para os testes
window.ENTREGAS = { pontuar, melhorEstudante, normalizar, gerarCodigo };

})();
