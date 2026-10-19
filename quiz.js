// quiz.js — A ABA "NA MOSCA!": quiz ao vivo em sala, dentro de Ferramentas.
//
// O QUE E'
//   O professor monta um quiz (multipla escolha, verdadeiro ou falso, enquete; tempo por
//   pergunta; imagem; "vale dobro"), abre uma SALA e projeta o PIN. Os alunos entram pelo
//   celular em jogar.html, com o PIN e um apelido — sem conta, sem instalar nada. Cada
//   pergunta tem cronometro; quem acerta mais rapido ganha mais pontos (a regra esta' em
//   quiz_operacoes.js). Entre as perguntas aparece o placar, no fim o podio, e o professor
//   fica com o relatorio: quem acertou o que, e quais perguntas a turma mais errou.
//
// ONDE MORA CADA COISA
//   quizzes/<id>              o quiz do professor, com o gabarito. So' o dono le.
//                             (copia tambem no aparelho, para abrir sem rede)
//   quiz_salas/<PIN>          a sala ao vivo: estado, a pergunta da vez SEM gabarito
//                             (o gabarito so' entra depois que o tempo acaba), placar.
//     jogadores/<id>          apelido e pontos de cada aluno. O aluno cria; so' o
//                             professor da sala altera.
//     respostas/<id>_<n>      uma resposta por aluno por pergunta, com a hora do
//                             SERVIDOR (o aluno nao consegue mentir o tempo, e a
//                             Regra recusa resposta fora do tempo).
//   Ao encerrar, a sala e tudo dentro dela sao apagados. O relatorio fica so' no aparelho
//   do professor (e no CSV que ele baixar): apelido de aluno nao precisa morar na nuvem.
//
// O PORTAO PREMIUM e' o mesmo das outras abas: o catalogo aparece para todos, criar quiz,
// gerar com IA e abrir sala pedem o plano Professor.

(function () {
'use strict';

const Q = () => window.QUIZOPS;
const CORES = ['#7c3aed', '#0d9488', '#ea580c', '#db2777'];
const LETRAS = ['A', 'B', 'C', 'D'];
const MAX_BYTES_QUIZ = 900 * 1024;     // o Firestore aceita 1 MB por documento
const IMG_LADO = 800;

let qzQuizzes = null;          // lista carregada
let qzEditando = null;         // quiz aberto no editor
let qzVista = 'lista';         // 'lista' | 'editor'
let qzAviso = '';
let qzPartida = null;          // estado da partida em andamento (ver iniciarPartida)

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uidAtual() {
    try {
        const u = window.firebase && firebase.auth && firebase.auth().currentUser;
        if (u && u.uid) return u.uid;
    } catch (_) { /* sem auth */ }
    return (typeof currentUser !== 'undefined' && currentUser && (currentUser.uid || currentUser.id)) ? String(currentUser.uid || currentUser.id) : '';
}

function temBanco() { return typeof db !== 'undefined' && !!db; }
function agoraServidor() {
    return (window.firebase && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date();
}

function qzPodeUsar(nome) {
    if (typeof exigirPremium !== 'function') return true;
    return exigirPremium('Ferramentas — Na Mosca! (' + nome + ')');
}
function qzEhPremium() { return (typeof ehPremium === 'function') ? ehPremium() : true; }
function qzSeloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}

function linkDoAluno(pin) {
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    return base + 'jogar.html' + (pin ? '?pin=' + pin : '');
}

// ---------------------------------------------------------------------------
// Guardar e carregar os quizzes
// ---------------------------------------------------------------------------

function chaveLocal() { return 'sisprof_quizzes_' + (uidAtual() || 'anon'); }

function lerLocal() {
    try { const s = localStorage.getItem(chaveLocal()); return s ? JSON.parse(s) : []; } catch (_) { return []; }
}
function gravarLocal(lista) {
    try { localStorage.setItem(chaveLocal(), JSON.stringify(lista)); } catch (e) { console.warn('[Quiz] copia local nao coube:', e); }
}

async function carregarQuizzes() {
    let lista = lerLocal().map(q => Q().normalizarQuiz(q));
    const uid = uidAtual();
    if (temBanco() && uid) {
        try {
            const snap = await db.collection('quizzes').where('donoUid', '==', uid).get();
            const daNuvem = snap.docs.map(d => Q().normalizarQuiz(Object.assign({}, d.data(), { id: d.id })));
            // Junta: vale o mais recente de cada id (o aparelho pode ter salvo sem rede).
            const mapa = {};
            lista.concat(daNuvem).forEach(q => { if (!mapa[q.id] || q.atualizadoEm >= mapa[q.id].atualizadoEm) mapa[q.id] = q; });
            lista = Object.values(mapa);
            gravarLocal(lista);
        } catch (e) {
            console.warn('[Quiz] nao li os quizzes da nuvem, usando a copia do aparelho:', e);
        }
    }
    qzQuizzes = lista.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
    return qzQuizzes;
}

async function salvarQuiz(quiz) {
    const q = Q().normalizarQuiz(Object.assign({}, quiz, { atualizadoEm: Date.now() }));
    const tamanho = JSON.stringify(q).length;
    if (tamanho > MAX_BYTES_QUIZ) {
        throw new Error('O quiz ficou grande demais (' + Math.round(tamanho / 1024) + ' KB) por causa das imagens. Tire algumas imagens e tente de novo.');
    }
    const lista = (qzQuizzes || lerLocal()).filter(x => x.id !== q.id);
    lista.unshift(q);
    qzQuizzes = lista;
    gravarLocal(lista);
    let naNuvem = false;
    const uid = uidAtual();
    if (temBanco() && uid) {
        try {
            await db.collection('quizzes').doc(q.id).set(Object.assign({}, q, { donoUid: uid }));
            naNuvem = true;
        } catch (e) {
            console.warn('[Quiz] salvo so no aparelho:', e);
        }
    }
    return { quiz: q, naNuvem };
}

async function excluirQuiz(id) {
    qzQuizzes = (qzQuizzes || []).filter(q => q.id !== id);
    gravarLocal(qzQuizzes);
    if (temBanco()) { try { await db.collection('quizzes').doc(id).delete(); } catch (e) { console.warn('[Quiz] exclusao na nuvem falhou:', e); } }
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

function container() { return document.getElementById('tabFerramentasQuiz'); }

const ESTILO = `
<style>
  #tabFerramentasQuiz .qz-topo { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:16px 0 10px; }
  #tabFerramentasQuiz .qz-marca { font-size:26px; font-weight:800; letter-spacing:-0.5px; color:#1c2536; }
  #tabFerramentasQuiz .qz-marca span { color:#7c3aed; }
  #tabFerramentasQuiz .qz-grade { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px; }
  #tabFerramentasQuiz .qz-cartao { background:#fff; border:1px solid #e3e8ef; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:8px; }
  #tabFerramentasQuiz .qz-cartao h4 { margin:0; font-size:16px; color:#1c2536; }
  #tabFerramentasQuiz .qz-meta { font-size:12px; color:#5f6b7f; }
  #tabFerramentasQuiz .qz-botoes { display:flex; gap:6px; flex-wrap:wrap; margin-top:auto; }
  #tabFerramentasQuiz .qz-p { background:#fff; border:1px solid #e3e8ef; border-radius:12px; padding:14px; margin-bottom:12px; }
  #tabFerramentasQuiz .qz-p-cab { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
  #tabFerramentasQuiz .qz-num { background:#1c2536; color:#fff; border-radius:999px; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; }
  #tabFerramentasQuiz textarea, #tabFerramentasQuiz input[type=text], #tabFerramentasQuiz select { padding:8px; border:1px solid #cdd5e1; border-radius:6px; font-size:14px; font-family:inherit; box-sizing:border-box; }
  #tabFerramentasQuiz .qz-ops { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-top:8px; }
  #tabFerramentasQuiz .qz-op { display:flex; align-items:center; gap:6px; border-radius:8px; padding:6px; border:2px solid transparent; }
  #tabFerramentasQuiz .qz-op .qz-letra { color:#fff; font-weight:800; border-radius:6px; width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; flex:none; }
  #tabFerramentasQuiz .qz-op input[type=text] { flex:1; min-width:0; }
  #tabFerramentasQuiz .qz-op.certa { border-color:#16a34a; background:#f0fdf4; }
  #tabFerramentasQuiz .qz-img { max-width:200px; max-height:120px; border-radius:8px; display:block; margin-top:8px; }
  #tabFerramentasQuiz .qz-aviso { background:#fffbeb; border:1px solid #f6ad55; color:#7b341e; border-radius:8px; padding:10px 12px; font-size:13px; margin:10px 0; }
  #tabFerramentasQuiz .qz-ok { background:#f0fdf4; border:1px solid #86efac; color:#14532d; border-radius:8px; padding:10px 12px; font-size:13px; margin:10px 0; }
  #qzPalco { position:fixed; inset:0; z-index:9000; background:#160f2e; color:#fff; overflow:auto; font-family:inherit; }
  #qzPalco .pc-barra { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 18px; flex-wrap:wrap; }
  #qzPalco .pc-btn { background:#fff; color:#160f2e; border:none; border-radius:10px; padding:12px 20px; font-size:17px; font-weight:800; cursor:pointer; }
  #qzPalco .pc-btn.sec { background:rgba(255,255,255,0.14); color:#fff; font-weight:600; font-size:14px; padding:8px 14px; }
  #qzPalco .pc-btn:disabled { opacity:0.5; cursor:default; }
  #qzPalco .pc-centro { max-width:1100px; margin:0 auto; padding:10px 20px 40px; text-align:center; }
  #qzPalco .pc-pin { font-size:clamp(56px, 12vw, 130px); font-weight:900; letter-spacing:8px; line-height:1; margin:8px 0; }
  #qzPalco .pc-tag { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.12); border-radius:999px; padding:6px 14px; margin:4px; font-size:16px; font-weight:600; }
  #qzPalco .pc-tag button { background:none; border:none; color:#fca5a5; cursor:pointer; font-size:14px; }
  #qzPalco .pc-pergunta { font-size:clamp(22px, 3.6vw, 40px); font-weight:800; background:#fff; color:#160f2e; border-radius:14px; padding:18px 22px; margin:10px 0 16px; }
  #qzPalco .pc-ops { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; text-align:left; }
  #qzPalco .pc-op { border-radius:12px; padding:18px; font-size:clamp(18px, 2.4vw, 26px); font-weight:700; display:flex; align-items:center; gap:12px; position:relative; }
  #qzPalco .pc-op .lt { background:rgba(0,0,0,0.22); border-radius:8px; min-width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; }
  #qzPalco .pc-op.apagada { opacity:0.35; }
  #qzPalco .pc-op .cont { margin-left:auto; font-size:18px; background:rgba(0,0,0,0.22); border-radius:999px; padding:2px 12px; }
  #qzPalco .pc-relogio { width:86px; height:86px; border-radius:50%; border:6px solid #a78bfa; display:inline-flex; align-items:center; justify-content:center; font-size:34px; font-weight:900; }
  #qzPalco .pc-img { max-height:34vh; max-width:100%; border-radius:12px; margin-bottom:10px; }
  #qzPalco .pc-linha { display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.1); border-radius:10px; padding:12px 18px; margin:8px auto; max-width:640px; font-size:22px; font-weight:700; }
  #qzPalco .pc-podio { display:flex; justify-content:center; align-items:flex-end; gap:14px; margin:30px 0; }
  #qzPalco .pc-degrau { width:min(28vw, 220px); border-radius:12px 12px 0 0; display:flex; flex-direction:column; justify-content:flex-start; align-items:center; padding:14px 6px; font-weight:800; }
  #qzPalco .pc-degrau .nm { font-size:clamp(16px, 2.4vw, 24px); word-break:break-word; }
  #qzPalco .pc-degrau .pt { font-size:15px; opacity:0.85; margin-top:4px; }
  #qzPalco .pc-degrau .md { font-size:44px; }
  #qzPalco table { width:100%; border-collapse:collapse; background:#fff; color:#1c2536; border-radius:10px; overflow:hidden; font-size:14px; text-align:left; }
  #qzPalco th, #qzPalco td { padding:8px 10px; border-bottom:1px solid #e3e8ef; }
  #qzPalco th { background:#f6f8fb; }
  @media print {
    body > *:not(#qzPalco) { display:none !important; }
    #qzPalco { position:static; background:#fff; color:#000; }
    #qzPalco .pc-barra, #qzPalco .pc-nao-imprimir { display:none !important; }
  }
</style>`;

function renderQuiz() {
    const el = container();
    if (!el) return;
    if (!Q()) {
        el.innerHTML = '<div class="card" style="margin:20px 0;">O Na Mosca! não carregou. Recarregue a página; se continuar assim, avise o suporte.</div>';
        return;
    }
    if (qzVista === 'editor' && qzEditando) { desenharEditor(); return; }
    desenharLista();
    if (qzQuizzes === null) carregarQuizzes().then(() => { if (qzVista === 'lista') desenharLista(); });
}

// Ícone do Na Mosca! no mesmo estilo dos outros (icones.js); sem ele, volta o emoji.
function qzIconeMarca() {
    return window.iconeSisProf ? iconeSisProf('alvo', 'ico-texto') : '🎯 ';
}

function desenharLista() {
    const el = container();
    if (!el) return;
    const premium = qzEhPremium();
    const lista = qzQuizzes || [];
    el.innerHTML = ESTILO + `
        <div class="qz-topo">
            <div class="qz-marca">${qzIconeMarca()}Na <span>Mosca!</span></div>
            <div style="color:#5f6b7f; font-size:14px; flex:1; min-width:220px;">Quiz ao vivo: você projeta, a turma responde pelo celular com um PIN, e quem acerta mais rápido pontua mais.</div>
        </div>
        ${premium ? '' : `<div class="qz-aviso">Criar quizzes e abrir salas faz parte do plano Professor ${qzSeloPro()}.</div>`}
        ${qzAviso ? `<div class="qz-ok">${esc(qzAviso)}</div>` : ''}
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
            <button class="btn btn-primary" onclick="qzNovo()">➕ Novo quiz ${premium ? '' : qzSeloPro()}</button>
            <button class="btn btn-secondary" onclick="qzAbrirGerador(true)">✨ Criar com IA ${premium ? '' : qzSeloPro()}</button>
            <a class="btn btn-secondary" href="${esc(linkDoAluno(''))}" target="_blank" rel="noopener">📱 Página do aluno</a>
        </div>
        ${qzQuizzes === null ? '<p class="empty-state">Carregando seus quizzes...</p>' : (lista.length ? `
        <div class="qz-grade">
            ${lista.map(q => `
                <div class="qz-cartao">
                    <h4>${esc(q.titulo || 'Sem título')}</h4>
                    <div class="qz-meta">${q.perguntas.length} pergunta(s)${q.disciplina ? ' · ' + esc(q.disciplina) : ''}${q.serie ? ' · ' + esc(q.serie) : ''}</div>
                    ${q.descricao ? `<div class="qz-meta">${esc(q.descricao)}</div>` : ''}
                    <div class="qz-botoes">
                        <button class="btn btn-success" onclick="qzIniciar('${esc(q.id)}')">▶️ Abrir sala</button>
                        <button class="btn btn-secondary" onclick="qzEditar('${esc(q.id)}')">✏️ Editar</button>
                        <button class="btn btn-secondary" onclick="qzDuplicar('${esc(q.id)}')" title="Duplicar">📄</button>
                        <button class="btn btn-danger" onclick="qzExcluir('${esc(q.id)}')" title="Excluir">🗑️</button>
                    </div>
                </div>`).join('')}
        </div>` : `
        <div class="card" style="text-align:center; padding:30px;">
            <p style="font-size:16px; margin-top:0;">Você ainda não tem quizzes.</p>
            <p style="font-size:13px; color:#5f6b7f;">Crie um do zero ou peça à IA perguntas sobre um tema ou sobre um material da sua Biblioteca.</p>
        </div>`)}
        ${desenharRelatoriosAntigos()}
        <p style="font-size:12px; color:#5f6b7f; margin-top:18px;">Dica: peça aos alunos que usem apelidos, não o nome completo. Ao encerrar a sala, os apelidos e respostas são apagados da nuvem; o relatório fica só neste aparelho.</p>`;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function qzNovo() {
    if (!qzPodeUsar('criar quiz')) return;
    qzEditando = Q().novoQuiz();
    qzVista = 'editor'; qzAviso = '';
    desenharEditor();
}

function qzEditar(id) {
    const q = (qzQuizzes || []).find(x => x.id === id);
    if (!q) return;
    qzEditando = JSON.parse(JSON.stringify(q));
    qzVista = 'editor'; qzAviso = '';
    desenharEditor();
}

async function qzDuplicar(id) {
    if (!qzPodeUsar('duplicar quiz')) return;
    const q = (qzQuizzes || []).find(x => x.id === id);
    if (!q) return;
    const copia = JSON.parse(JSON.stringify(q));
    copia.id = Q().novoId(); copia.titulo = (q.titulo || 'Quiz') + ' (cópia)'; copia.criadoEm = Date.now();
    copia.perguntas.forEach(p => { p.id = Q().novoId(); });
    try { await salvarQuiz(copia); } catch (e) { alert(e.message); }
    desenharLista();
}

async function qzExcluir(id) {
    const q = (qzQuizzes || []).find(x => x.id === id);
    if (!q || !confirm('Excluir o quiz "' + (q.titulo || 'Sem título') + '"? Isso não pode ser desfeito.')) return;
    await excluirQuiz(id);
    desenharLista();
}

function qzVoltar() {
    if (qzEditando && !confirm('Sair do editor? O que não foi salvo será perdido.')) return;
    qzEditando = null; qzVista = 'lista';
    desenharLista();
}

function desenharEditor() {
    const el = container();
    const q = qzEditando;
    if (!el || !q) return;
    el.innerHTML = ESTILO + `
        <div class="qz-topo">
            <button class="btn btn-secondary" onclick="qzVoltar()">← Voltar</button>
            <div class="qz-marca" style="font-size:20px;">${qzIconeMarca()}Editar quiz</div>
            <div style="flex:1"></div>
            <button class="btn btn-secondary" onclick="qzAbrirGerador(false)">✨ Mais perguntas com IA</button>
            <button class="btn btn-primary" onclick="qzSalvar()">💾 Salvar</button>
        </div>
        <div id="qzAvisoEditor"></div>
        <div class="qz-p">
            <input type="text" placeholder="Título do quiz (ex.: Frações — revisão)" value="${esc(q.titulo)}" oninput="qzCampo('titulo', this.value)" style="width:100%; font-size:17px; font-weight:700; margin-bottom:8px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="text" placeholder="Disciplina" value="${esc(q.disciplina)}" oninput="qzCampo('disciplina', this.value)" style="flex:1; min-width:160px;">
                <input type="text" placeholder="Série / ano" value="${esc(q.serie)}" oninput="qzCampo('serie', this.value)" style="flex:1; min-width:120px;">
            </div>
            <input type="text" placeholder="Descrição (opcional)" value="${esc(q.descricao)}" oninput="qzCampo('descricao', this.value)" style="width:100%; margin-top:8px;">
        </div>
        ${q.perguntas.map((p, i) => desenharPerguntaEditor(p, i, q.perguntas.length)).join('')}
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:6px 0 30px;">
            <button class="btn btn-secondary" onclick="qzAddPergunta('multipla')">➕ Múltipla escolha</button>
            <button class="btn btn-secondary" onclick="qzAddPergunta('vf')">➕ Verdadeiro ou falso</button>
            <button class="btn btn-secondary" onclick="qzAddPergunta('enquete')">➕ Enquete</button>
            <div style="flex:1"></div>
            <button class="btn btn-primary" onclick="qzSalvar()">💾 Salvar</button>
        </div>`;
}

function desenharPerguntaEditor(p, i, total) {
    const multi = p.tipo !== 'enquete';
    const T = Q().TIPOS;
    return `
    <div class="qz-p" data-pergunta="${i}">
        <div class="qz-p-cab">
            <span class="qz-num">${i + 1}</span>
            <select onchange="qzTipo(${i}, this.value)">
                ${Object.keys(T).map(t => `<option value="${t}" ${p.tipo === t ? 'selected' : ''}>${T[t].nome}</option>`).join('')}
            </select>
            <label style="font-size:13px;">⏱️ <select onchange="qzPCampo(${i}, 'tempo', Number(this.value))">
                ${Q().TEMPOS.map(t => `<option value="${t}" ${p.tempo === t ? 'selected' : ''}>${t} s</option>`).join('')}
            </select></label>
            ${p.tipo === 'enquete' ? '' : `<label style="font-size:13px;">🏅 <select onchange="qzPCampo(${i}, 'pontos', Number(this.value))">
                <option value="1" ${p.pontos === 1 ? 'selected' : ''}>Pontos normais</option>
                <option value="2" ${p.pontos === 2 ? 'selected' : ''}>Vale dobro</option>
                <option value="0" ${p.pontos === 0 ? 'selected' : ''}>Sem pontos</option>
            </select></label>`}
            <div style="flex:1"></div>
            <button class="btn btn-secondary" style="padding:4px 8px;" onclick="qzMover(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
            <button class="btn btn-secondary" style="padding:4px 8px;" onclick="qzMover(${i}, 1)" ${i === total - 1 ? 'disabled' : ''} title="Descer">↓</button>
            <button class="btn btn-secondary" style="padding:4px 8px;" onclick="qzDuplicarPergunta(${i})" title="Duplicar">📄</button>
            <button class="btn btn-danger" style="padding:4px 8px;" onclick="qzRemoverPergunta(${i})" title="Excluir">🗑️</button>
        </div>
        <textarea rows="2" placeholder="Escreva a pergunta" oninput="qzPCampo(${i}, 'texto', this.value)" style="width:100%; font-size:15px;">${esc(p.texto)}</textarea>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px;">
            <label class="btn btn-secondary" style="padding:4px 10px; font-size:13px; cursor:pointer;">🖼️ ${p.imagem ? 'Trocar imagem' : 'Pôr imagem'}
                <input type="file" accept="image/*" style="display:none;" onchange="qzImagem(${i}, this)">
            </label>
            ${p.imagem ? `<button class="btn btn-secondary" style="padding:4px 10px; font-size:13px;" onclick="qzPCampo(${i}, 'imagem', ''); qzRedesenhar()">Tirar imagem</button>` : ''}
        </div>
        ${p.imagem ? `<img class="qz-img" src="${p.imagem}" alt="">` : ''}
        <div class="qz-ops">
            ${p.opcoes.map((o, k) => `
                <div class="qz-op ${multi && p.corretas.includes(k) ? 'certa' : ''}">
                    <span class="qz-letra" style="background:${CORES[k]}">${LETRAS[k]}</span>
                    ${p.tipo === 'vf' ? `<span style="flex:1; font-weight:600;">${esc(o)}</span>` :
                      `<input type="text" value="${esc(o)}" placeholder="Alternativa ${LETRAS[k]}${k >= 2 ? ' (opcional)' : ''}" oninput="qzOpcao(${i}, ${k}, this.value)">`}
                    ${multi ? `<label title="Marcar como certa" style="font-size:12px; display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="${p.tipo === 'vf' ? 'radio' : 'checkbox'}" name="qzc${i}" ${p.corretas.includes(k) ? 'checked' : ''} onchange="qzCerta(${i}, ${k}, this.checked)"> certa</label>` : ''}
                </div>`).join('')}
        </div>
    </div>`;
}

function qzRedesenhar() {
    const y = window.scrollY;
    desenharEditor();
    window.scrollTo(0, y);
}

function qzCampo(campo, valor) { if (qzEditando) qzEditando[campo] = valor; }
function qzPCampo(i, campo, valor) { const p = qzEditando && qzEditando.perguntas[i]; if (p) p[campo] = valor; }
function qzOpcao(i, k, valor) { const p = qzEditando && qzEditando.perguntas[i]; if (p) p.opcoes[k] = valor; }

function qzCerta(i, k, marcada) {
    const p = qzEditando && qzEditando.perguntas[i];
    if (!p) return;
    if (p.tipo === 'vf') p.corretas = [k];
    else p.corretas = marcada ? Array.from(new Set(p.corretas.concat(k))).sort() : p.corretas.filter(c => c !== k);
    qzRedesenhar();
}

function qzTipo(i, tipo) {
    const p = qzEditando && qzEditando.perguntas[i];
    if (!p) return;
    const nova = Q().novaPergunta(tipo);
    nova.id = p.id; nova.texto = p.texto; nova.tempo = p.tempo; nova.imagem = p.imagem;
    if (tipo !== 'vf' && p.tipo !== 'vf') { nova.opcoes = p.opcoes.slice(); while (nova.opcoes.length < 4) nova.opcoes.push(''); nova.corretas = tipo === 'enquete' ? [] : (p.corretas.length ? p.corretas : [0]); }
    if (tipo !== 'enquete') nova.pontos = p.pontos == null ? 1 : p.pontos;
    qzEditando.perguntas[i] = nova;
    qzRedesenhar();
}

function qzAddPergunta(tipo) {
    if (!qzEditando) return;
    if (qzEditando.perguntas.length >= Q().MAX_PERGUNTAS) { alert('O limite é ' + Q().MAX_PERGUNTAS + ' perguntas por quiz.'); return; }
    qzEditando.perguntas.push(Q().novaPergunta(tipo));
    desenharEditor();
    const ultimo = container().querySelector('.qz-p[data-pergunta="' + (qzEditando.perguntas.length - 1) + '"] textarea');
    if (ultimo) { ultimo.scrollIntoView({ block: 'center' }); ultimo.focus(); }
}

function qzMover(i, d) {
    const ps = qzEditando && qzEditando.perguntas;
    if (!ps || i + d < 0 || i + d >= ps.length) return;
    const t = ps[i]; ps[i] = ps[i + d]; ps[i + d] = t;
    qzRedesenhar();
}
function qzDuplicarPergunta(i) {
    const ps = qzEditando && qzEditando.perguntas;
    if (!ps) return;
    const c = JSON.parse(JSON.stringify(ps[i])); c.id = Q().novoId();
    ps.splice(i + 1, 0, c);
    qzRedesenhar();
}
function qzRemoverPergunta(i) {
    const ps = qzEditando && qzEditando.perguntas;
    if (!ps) return;
    if ((ps[i].texto || '').trim() && !confirm('Excluir a pergunta ' + (i + 1) + '?')) return;
    ps.splice(i, 1);
    if (!ps.length) ps.push(Q().novaPergunta('multipla'));
    qzRedesenhar();
}

// A imagem e' reduzida aqui, no aparelho: lado maior de 800 px, JPEG. Uma foto de
// celular de 4 MB vira uns 80 KB — cabe no documento e chega rapido no celular do aluno.
async function reduzirImagem(arquivo) {
    const url = URL.createObjectURL(arquivo);
    try {
        const img = await new Promise((ok, erro) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => erro(new Error('Não consegui ler essa imagem.')); im.src = url; });
        const esc = Math.min(1, IMG_LADO / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * esc));
        c.height = Math.max(1, Math.round(img.naturalHeight * esc));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.72);
    } finally { URL.revokeObjectURL(url); }
}

async function qzImagem(i, input) {
    const f = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { alert('Escolha um arquivo de imagem.'); return; }
    try {
        qzPCampo(i, 'imagem', await reduzirImagem(f));
        qzRedesenhar();
    } catch (e) { alert(e.message); }
}

async function qzSalvar() {
    if (!qzEditando) return;
    if (!qzPodeUsar('salvar quiz')) return;
    const caixa = document.getElementById('qzAvisoEditor');
    const quiz = Q().normalizarQuiz(qzEditando);
    if (!quiz.titulo) {
        if (caixa) caixa.innerHTML = '<div class="qz-aviso">Dê um título ao quiz antes de salvar.</div>';
        window.scrollTo(0, 0);
        return;
    }
    try {
        const r = await salvarQuiz(quiz);
        const pend = Q().problemasDoQuiz(r.quiz);
        qzEditando = null; qzVista = 'lista';
        qzAviso = 'Quiz "' + r.quiz.titulo + '" salvo' + (r.naNuvem ? '.' : ' neste aparelho (a nuvem não respondeu; ele sobe quando você salvar de novo com internet).') +
            (pend.length ? ' Atenção: ainda falta arrumar ' + pend.length + ' coisa(s) antes de abrir a sala.' : '');
        desenharLista();
        window.scrollTo(0, 0);
    } catch (e) {
        if (caixa) caixa.innerHTML = '<div class="qz-aviso">' + esc(e.message) + '</div>';
        window.scrollTo(0, 0);
    }
}

// ---------------------------------------------------------------------------
// Gerar perguntas com IA (opcionalmente a partir de um material da Biblioteca)
// ---------------------------------------------------------------------------

let qzGeradorNovoQuiz = false;
let qzMateriais = null;

async function qzAbrirGerador(novoQuiz) {
    if (!qzPodeUsar('gerar com IA')) return;
    qzGeradorNovoQuiz = !!novoQuiz;
    let fundo = document.getElementById('qzGerador');
    if (fundo) fundo.remove();
    fundo = document.createElement('div');
    fundo.id = 'qzGerador';
    fundo.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:8500; display:flex; align-items:center; justify-content:center; padding:16px;';
    const q = qzEditando || {};
    fundo.innerHTML = `
        <div style="background:#fff; border-radius:14px; padding:20px; width:min(560px, 100%); max-height:92vh; overflow:auto; color:#1c2536;">
            <h3 style="margin-top:0;">✨ Gerar perguntas com IA</h3>
            <p style="font-size:13px; color:#5f6b7f; margin-top:0;">A IA sugere as perguntas; você revisa e corrige no editor antes de usar.</p>
            <label style="display:block; font-size:13px; font-weight:600;">Tema</label>
            <input id="qzgTema" type="text" placeholder="Ex.: ciclo da água, frações equivalentes" style="width:100%; padding:8px; border:1px solid #cdd5e1; border-radius:6px; box-sizing:border-box; margin-bottom:8px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <div style="flex:1; min-width:140px;"><label style="font-size:13px; font-weight:600;">Disciplina</label>
                    <input id="qzgDisc" type="text" value="${esc(q.disciplina || '')}" style="width:100%; padding:8px; border:1px solid #cdd5e1; border-radius:6px; box-sizing:border-box;"></div>
                <div style="flex:1; min-width:110px;"><label style="font-size:13px; font-weight:600;">Série / ano</label>
                    <input id="qzgSerie" type="text" value="${esc(q.serie || '')}" style="width:100%; padding:8px; border:1px solid #cdd5e1; border-radius:6px; box-sizing:border-box;"></div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                <div><label style="font-size:13px; font-weight:600;">Quantas</label><br>
                    <select id="qzgQtd" style="padding:8px; border:1px solid #cdd5e1; border-radius:6px;">${[5, 8, 10, 12, 15, 20].map(n => `<option ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
                <div><label style="font-size:13px; font-weight:600;">Tipo</label><br>
                    <select id="qzgTipos" style="padding:8px; border:1px solid #cdd5e1; border-radius:6px;">
                        <option value="multipla">Múltipla escolha</option><option value="misto">Misturar com V ou F</option><option value="vf">Só verdadeiro ou falso</option>
                    </select></div>
            </div>
            <label style="display:block; font-size:13px; font-weight:600; margin-top:10px;">Usar um material da Biblioteca (opcional)</label>
            <select id="qzgMaterial" style="width:100%; padding:8px; border:1px solid #cdd5e1; border-radius:6px;"><option value="">Carregando materiais...</option></select>
            <div id="qzgMsg" style="font-size:13px; margin-top:10px;"></div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
                <button class="btn btn-secondary" onclick="document.getElementById('qzGerador').remove()">Cancelar</button>
                <button class="btn btn-primary" id="qzgBtn" onclick="qzGerar()">✨ Gerar</button>
            </div>
        </div>`;
    document.body.appendChild(fundo);
    const sel = document.getElementById('qzgMaterial');
    try {
        if (qzMateriais === null && temBanco()) {
            const snap = await db.collection('materiais_apoio').orderBy('createdAt', 'desc').limit(300).get();
            qzMateriais = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(m => (m.textoExtraido || m.descricao || '').length > 30);
        }
    } catch (e) { console.warn('[Quiz] Biblioteca indisponivel:', e); qzMateriais = []; }
    if (sel) {
        const ms = qzMateriais || [];
        sel.innerHTML = '<option value="">Não usar material — só o tema</option>' +
            ms.map(m => `<option value="${esc(m.id)}">${esc((m.titulo || m.fileName || 'Material').slice(0, 80))}${m.serie ? ' · ' + esc(m.serie) : ''}${m.disciplina ? ' · ' + esc(m.disciplina) : ''}</option>`).join('');
    }
}

async function qzGerar() {
    const v = id => (document.getElementById(id) || {}).value || '';
    const msg = document.getElementById('qzgMsg');
    const btn = document.getElementById('qzgBtn');
    const material = (qzMateriais || []).find(m => m.id === v('qzgMaterial'));
    if (!v('qzgTema').trim() && !material) { msg.innerHTML = '<span style="color:#b91c1c;">Escreva um tema ou escolha um material.</span>'; return; }
    if (typeof chamarIAEstruturada !== 'function') { msg.innerHTML = '<span style="color:#b91c1c;">O assistente de IA não carregou. Recarregue a página.</span>'; return; }
    const prompt = Q().promptGerarPerguntas({
        tema: v('qzgTema') || (material && material.titulo), disciplina: v('qzgDisc'), serie: v('qzgSerie'),
        quantidade: v('qzgQtd'), tipos: v('qzgTipos'),
        material: material ? [material.titulo, material.descricao, material.textoExtraido].filter(Boolean).join('\n') : ''
    });
    btn.disabled = true;
    msg.innerHTML = 'Pedindo as perguntas à IA... ⏳';
    try {
        const resposta = await chamarIAEstruturada(prompt, null);
        const novas = Q().perguntasDaIA(resposta);
        if (!novas.length) throw new Error('A IA não devolveu perguntas que eu conseguisse usar. Tente de novo ou mude o tema.');
        if (qzGeradorNovoQuiz || !qzEditando) {
            qzEditando = Q().novoQuiz();
            qzEditando.titulo = (v('qzgTema') || (material && material.titulo) || 'Quiz').slice(0, 100);
            qzEditando.disciplina = v('qzgDisc'); qzEditando.serie = v('qzgSerie');
            qzEditando.perguntas = novas;
        } else {
            // A pergunta em branco que o editor cria sozinho nao precisa ficar na frente.
            qzEditando.perguntas = qzEditando.perguntas.filter(p => (p.texto || '').trim()).concat(novas).slice(0, Q().MAX_PERGUNTAS);
        }
        qzVista = 'editor';
        document.getElementById('qzGerador').remove();
        desenharEditor();
        const caixa = document.getElementById('qzAvisoEditor');
        if (caixa) caixa.innerHTML = '<div class="qz-ok">A IA sugeriu ' + novas.length + ' pergunta(s). Confira cada uma (principalmente a alternativa certa) e clique em Salvar.</div>';
    } catch (e) {
        msg.innerHTML = '<span style="color:#b91c1c;">' + esc(e.message || String(e)) + '</span>';
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// A PARTIDA (o lado do professor)
// ---------------------------------------------------------------------------

function sala() { return db.collection('quiz_salas').doc(qzPartida.pin); }

async function qzIniciar(id) {
    if (!qzPodeUsar('abrir sala')) return;
    const quiz = (qzQuizzes || []).find(x => x.id === id);
    if (!quiz) return;
    const pend = Q().problemasDoQuiz(quiz);
    if (pend.length) { alert('Antes de abrir a sala, arrume:\n\n• ' + pend.slice(0, 8).join('\n• ') + (pend.length > 8 ? '\n• ...' : '')); return; }
    if (!temBanco() || !uidAtual()) { alert('Para abrir uma sala é preciso estar conectado à internet e com a sessão ativa.'); return; }

    qzPartida = {
        quiz, pin: '', estado: 'abrindo', indice: -1, jogadores: {}, historico: [],
        respostas: [], abertaEmMs: 0, fimLocal: 0, timer: null, ouvintes: [], fechando: false, relatorio: null
    };
    desenharPalco();
    let pin = '';
    for (let t = 0; t < 6 && !pin; t++) {
        const tentativa = Q().gerarPin();
        try {
            await db.collection('quiz_salas').doc(tentativa).set({
                hostUid: uidAtual(), titulo: quiz.titulo, estado: 'sala', indice: -1, total: quiz.perguntas.length,
                pergunta: null, gabarito: null, distribuicao: null, placar: [], podio: [],
                criadaEm: agoraServidor(), abertaEm: null
            });
            pin = tentativa;
        } catch (e) {
            // PIN ocupado por outra sala (a Regra recusa) ou banco fora: tenta outro.
            console.warn('[Quiz] PIN ' + tentativa + ' recusado:', e && e.code);
            if (e && e.code && e.code !== 'permission-denied') break;
        }
    }
    if (!pin) {
        qzPartida.estado = 'erro';
        qzPartida.erro = 'Não consegui abrir a sala. Verifique a internet. Se acabou de atualizar o sistema, o administrador precisa publicar as Regras novas do banco (firestore.rules).';
        desenharPalco();
        return;
    }
    qzPartida.pin = pin;
    qzPartida.estado = 'sala';
    ouvirSala();
    desenharPalco();
}

function ouvirSala() {
    const p = qzPartida;
    p.ouvintes.push(sala().collection('jogadores').onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
            const d = ch.doc.data() || {};
            if (ch.type === 'removed') { delete p.jogadores[ch.doc.id]; return; }
            if (!p.jogadores[ch.doc.id]) {
                p.jogadores[ch.doc.id] = { apelido: Q().limparApelido(d.apelido) || 'Jogador', pontos: 0, acertos: 0, sequencia: 0 };
            }
        });
        if (p.estado === 'sala' || p.estado === 'pergunta') desenharPalco();
        if (p.estado === 'pergunta') talvezTodosResponderam();
    }, e => console.warn('[Quiz] ouvinte de jogadores:', e)));
    p.ouvintes.push(sala().onSnapshot(s => {
        const d = s.data();
        if (d && d.abertaEm && d.abertaEm.toMillis) p.abertaEmMs = d.abertaEm.toMillis();
    }, () => {}));
}

function pararOuvintes() {
    if (!qzPartida) return;
    qzPartida.ouvintes.forEach(f => { try { f(); } catch (_) { /* ja' parou */ } });
    qzPartida.ouvintes = [];
    if (qzPartida.ouvinteRespostas) { try { qzPartida.ouvinteRespostas(); } catch (_) {} qzPartida.ouvinteRespostas = null; }
    clearInterval(qzPartida.timer);
}

async function qzRemoverJogador(id) {
    if (!qzPartida || !confirm('Tirar "' + ((qzPartida.jogadores[id] || {}).apelido || '') + '" da sala?')) return;
    try { await sala().collection('jogadores').doc(id).delete(); } catch (e) { alert('Não consegui tirar: ' + e.message); }
}

async function qzProximaPergunta() {
    const p = qzPartida;
    if (!p || p.fechando) return;
    const i = p.indice + 1;
    if (i >= p.quiz.perguntas.length) { await finalizarPartida(); return; }
    const pp = Q().perguntaPublica(p.quiz.perguntas[i]);
    p.indice = i; p.atual = pp; p.respostas = []; p.abertaEmMs = 0;
    p.estado = 'pergunta';
    if (p.ouvinteRespostas) { p.ouvinteRespostas(); p.ouvinteRespostas = null; }
    try {
        await sala().update({ estado: 'pergunta', indice: i, pergunta: pp.publica, gabarito: null, distribuicao: null, abertaEm: agoraServidor() });
    } catch (e) {
        alert('Não consegui mostrar a pergunta aos alunos: ' + e.message);
        p.estado = 'sala'; p.indice = i - 1; desenharPalco(); return;
    }
    p.fimLocal = Date.now() + pp.publica.tempo * 1000;
    p.ouvinteRespostas = sala().collection('respostas').where('indice', '==', i).onSnapshot(snap => {
        p.respostas = snap.docs.map(d => d.data());
        const cont = document.getElementById('pcRespostas');
        if (cont) cont.textContent = p.respostas.length;
        talvezTodosResponderam();
    }, e => console.warn('[Quiz] ouvinte de respostas:', e));
    clearInterval(p.timer);
    p.timer = setInterval(() => {
        const r = Math.max(0, Math.ceil((p.fimLocal - Date.now()) / 1000));
        const rel = document.getElementById('pcRelogio');
        if (rel) rel.textContent = r;
        if (r <= 0) { clearInterval(p.timer); qzRevelar(); }
    }, 250);
    desenharPalco();
}

function talvezTodosResponderam() {
    const p = qzPartida;
    if (!p || p.estado !== 'pergunta') return;
    const n = Object.keys(p.jogadores).length;
    const quem = new Set(p.respostas.map(r => r.jogadorId).filter(id => p.jogadores[id]));
    if (n > 0 && quem.size >= n) { clearInterval(p.timer); qzRevelar(); }
}

async function qzRevelar() {
    const p = qzPartida;
    if (!p || p.estado !== 'pergunta' || p.fechando) return;
    p.fechando = true;
    clearInterval(p.timer);
    // Espera um instante pelas respostas que ainda estao a caminho.
    await new Promise(r => setTimeout(r, 900));
    try {
        if (!p.abertaEmMs) {
            const s = await sala().get();
            const d = s.data() || {};
            if (d.abertaEm && d.abertaEm.toMillis) p.abertaEmMs = d.abertaEm.toMillis();
        }
        const snap = await sala().collection('respostas').where('indice', '==', p.indice).get();
        const respostas = snap.docs.map(d => {
            const r = d.data();
            const em = r.em && r.em.toMillis ? r.em.toMillis() : 0;
            return { jogadorId: r.jogadorId, escolha: r.escolha, ms: (em && p.abertaEmMs) ? em - p.abertaEmMs : p.atual.publica.tempo * 1000 };
        });
        const r = Q().fecharPergunta({ jogadores: p.jogadores, respostas, publica: p.atual.publica, gabarito: p.atual.gabarito });
        p.jogadores = r.jogadores;
        p.historico.push({ publica: p.atual.publica, gabarito: p.atual.gabarito, detalhes: r.detalhes, distribuicao: r.distribuicao });
        p.distribuicao = r.distribuicao;
        const rank = Q().ranking(Object.keys(p.jogadores).map(id => Object.assign({ id }, p.jogadores[id])));
        const pos = {}; rank.forEach(j => { pos[j.id] = j.posicao; });

        // Cada aluno fica sabendo do proprio resultado pelo proprio documento.
        const ids = Object.keys(p.jogadores);
        for (let k = 0; k < ids.length; k += 400) {
            const lote = db.batch();
            ids.slice(k, k + 400).forEach(id => {
                const j = p.jogadores[id], d = r.detalhes[id];
                lote.update(sala().collection('jogadores').doc(id), {
                    pontos: j.pontos, acertos: j.acertos, sequencia: j.sequencia,
                    ultimo: { indice: p.indice, respondeu: d.respondeu, acertou: d.acertou, ganhou: d.ganhou, posicao: pos[id] || 0, total: ids.length }
                });
            });
            await lote.commit().catch(e => console.warn('[Quiz] resultado dos alunos:', e));
        }
        await sala().update({ estado: 'revelada', gabarito: p.atual.gabarito, distribuicao: r.distribuicao });
    } catch (e) {
        console.error('[Quiz] fechar pergunta:', e);
        alert('Problema ao fechar a pergunta: ' + e.message);
    }
    p.estado = 'revelada';
    p.fechando = false;
    desenharPalco();
}

function top(n) {
    return Q().ranking(Object.keys(qzPartida.jogadores).map(id => Object.assign({ id }, qzPartida.jogadores[id]))).slice(0, n);
}

async function qzPlacar() {
    const p = qzPartida;
    if (!p) return;
    p.estado = 'placar';
    desenharPalco();
    try { await sala().update({ estado: 'placar', placar: top(5).map(j => ({ apelido: j.apelido, pontos: j.pontos })) }); }
    catch (e) { console.warn('[Quiz] placar:', e); }
}

async function finalizarPartida() {
    const p = qzPartida;
    if (!p) return;
    if (p.ouvinteRespostas) { p.ouvinteRespostas(); p.ouvinteRespostas = null; }
    clearInterval(p.timer);
    p.estado = 'fim';
    p.relatorio = Q().montarRelatorio({ titulo: p.quiz.titulo, jogadores: p.jogadores, historico: p.historico });
    guardarRelatorio(p.relatorio);
    desenharPalco();
    try {
        const t = top(10).map(j => ({ apelido: j.apelido, pontos: j.pontos }));
        await sala().update({ estado: 'fim', podio: t.slice(0, 3), placar: t });
    } catch (e) { console.warn('[Quiz] fim:', e); }
}

// Apaga a sala e tudo dentro dela (jogadores e respostas).
async function apagarSala(pin) {
    const ref = db.collection('quiz_salas').doc(pin);
    for (const sub of ['respostas', 'jogadores']) {
        const snap = await ref.collection(sub).get();
        for (let k = 0; k < snap.docs.length; k += 400) {
            const lote = db.batch();
            snap.docs.slice(k, k + 400).forEach(d => lote.delete(d.ref));
            await lote.commit();
        }
    }
    await ref.delete();
}

async function qzEncerrar() {
    const p = qzPartida;
    if (!p) return;
    const emJogo = p.estado !== 'fim' && p.estado !== 'erro' && p.estado !== 'abrindo';
    if (emJogo && !confirm('Encerrar a partida agora? A sala será fechada para os alunos.')) return;
    if (emJogo && p.historico.length) {
        p.relatorio = Q().montarRelatorio({ titulo: p.quiz.titulo, jogadores: p.jogadores, historico: p.historico });
        guardarRelatorio(p.relatorio);
    }
    pararOuvintes();
    if (p.pin) {
        try {
            if (emJogo) await sala().update({ estado: 'fim', podio: [], placar: [] }).catch(() => {});
            await apagarSala(p.pin);
        } catch (e) { console.warn('[Quiz] apagar sala:', e); }
    }
    qzPartida = null;
    const palco = document.getElementById('qzPalco');
    if (palco) palco.remove();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
    desenharLista();
}

function qzTelaCheia() {
    const el = document.getElementById('qzPalco');
    try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el && el.requestFullscreen) el.requestFullscreen();
    } catch (_) { /* navegador sem tela cheia */ }
}

// ---------------------------------------------------------------------------
// Relatorios guardados no aparelho
// ---------------------------------------------------------------------------

function chaveRelatorios() { return 'sisprof_quiz_relatorios_' + (uidAtual() || 'anon'); }
function lerRelatorios() { try { return JSON.parse(localStorage.getItem(chaveRelatorios()) || '[]'); } catch (_) { return []; } }
function guardarRelatorio(rel) {
    const lista = lerRelatorios();
    rel.id = rel.id || Q().novoId();
    lista.unshift(rel);
    try { localStorage.setItem(chaveRelatorios(), JSON.stringify(lista.slice(0, 20))); } catch (e) { console.warn('[Quiz] relatorio nao coube no aparelho:', e); }
}

function desenharRelatoriosAntigos() {
    const lista = lerRelatorios();
    if (!lista.length) return '';
    return `<h3 style="margin:26px 0 8px;">📊 Relatórios das últimas partidas</h3>
        <div class="qz-grade">${lista.map(r => `
            <div class="qz-cartao">
                <h4>${esc(r.titulo)}</h4>
                <div class="qz-meta">${new Date(r.data).toLocaleString('pt-BR')} · ${r.jogadores.length} jogador(es)${r.mediaAcerto != null ? ' · ' + r.mediaAcerto + '% de acerto' : ''}</div>
                <div class="qz-botoes">
                    <button class="btn btn-secondary" onclick="qzVerRelatorio('${esc(r.id)}')">Ver</button>
                    <button class="btn btn-secondary" onclick="qzBaixarCsv('${esc(r.id)}')">⬇️ CSV</button>
                    <button class="btn btn-danger" onclick="qzApagarRelatorio('${esc(r.id)}')" title="Apagar">🗑️</button>
                </div>
            </div>`).join('')}</div>`;
}

function acharRelatorio(id) {
    if (qzPartida && qzPartida.relatorio && (!id || qzPartida.relatorio.id === id)) return qzPartida.relatorio;
    return lerRelatorios().find(r => r.id === id);
}

function qzBaixarCsv(id) {
    const rel = acharRelatorio(id);
    if (!rel) return;
    const blob = new Blob([Q().relatorioCsv(rel)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'na-mosca-' + String(rel.titulo || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + String(rel.data).slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function qzApagarRelatorio(id) {
    if (!confirm('Apagar este relatório deste aparelho?')) return;
    try { localStorage.setItem(chaveRelatorios(), JSON.stringify(lerRelatorios().filter(r => r.id !== id))); } catch (_) {}
    desenharLista();
}

function qzVerRelatorio(id) {
    const rel = acharRelatorio(id);
    if (!rel) return;
    let palco = document.getElementById('qzPalco');
    if (!palco) { palco = document.createElement('div'); palco.id = 'qzPalco'; document.body.appendChild(palco); }
    palco.innerHTML = ESTILO + `
        <div class="pc-barra"><strong>🎯 Na Mosca! — relatório</strong>
            <div style="display:flex; gap:8px;">
                <button class="pc-btn sec" onclick="window.print()">🖨️ Imprimir</button>
                <button class="pc-btn sec" onclick="qzBaixarCsv('${esc(rel.id)}')">⬇️ CSV</button>
                <button class="pc-btn sec" onclick="document.getElementById('qzPalco').remove()">Fechar</button>
            </div></div>
        <div class="pc-centro" style="text-align:left;">${htmlRelatorio(rel)}</div>`;
}

function htmlRelatorio(rel) {
    const letra = i => LETRAS[i] || '?';
    return `
        <h2 style="margin:6px 0;">${esc(rel.titulo)}</h2>
        <p style="opacity:0.8; margin-top:0;">${new Date(rel.data).toLocaleString('pt-BR')} · ${rel.jogadores.length} jogador(es)${rel.mediaAcerto != null ? ' · média de acerto ' + rel.mediaAcerto + '%' : ''}</p>
        ${rel.maisErradas.length ? `<p><strong>Para retomar:</strong> a turma mais errou ${rel.maisErradas.map(n => 'a pergunta ' + n).join(', ')}.</p>` : ''}
        <h3>Por aluno</h3>
        <div style="overflow:auto;"><table>
            <tr><th>#</th><th>Apelido</th><th>Pontos</th><th>Acertos</th>${rel.perguntas.map(p => `<th>P${p.numero}</th>`).join('')}</tr>
            ${rel.jogadores.map(j => `<tr><td>${j.posicao}</td><td>${esc(j.apelido)}</td><td>${j.pontos}</td><td>${j.acertos}/${j.avaliadas}</td>
                ${j.respostas.map((r, i) => {
                    if (!r || !r.respondeu) return '<td style="color:#94a3b8;">—</td>';
                    const enq = rel.perguntas[i].tipo === 'enquete';
                    return `<td style="color:${enq ? '#1c2536' : (r.acertou ? '#15803d' : '#b91c1c')}; font-weight:700;">${letra(r.escolha)}${enq ? '' : (r.acertou ? ' ✓' : ' ✗')}</td>`;
                }).join('')}</tr>`).join('')}
        </table></div>
        <h3>Por pergunta</h3>
        <div style="overflow:auto;"><table>
            <tr><th>#</th><th>Pergunta</th><th>Gabarito</th><th>Acerto</th><th>Responderam</th><th>Tempo médio</th></tr>
            ${rel.perguntas.map(p => `<tr><td>${p.numero}</td><td>${esc(p.texto)}<div style="font-size:12px; color:#5f6b7f;">${p.opcoes.map((o, i) => letra(i) + ') ' + esc(o) + ' [' + (p.distribuicao[i] || 0) + ']').join(' · ')}</div></td>
                <td>${p.gabarito.map(letra).join(', ') || '—'}</td><td>${p.pctAcerto == null ? 'enquete' : p.pctAcerto + '%'}</td>
                <td>${p.responderam}/${p.jogadores}</td><td>${p.tempoMedioSeg == null ? '—' : String(p.tempoMedioSeg).replace('.', ',') + ' s'}</td></tr>`).join('')}
        </table></div>`;
}

// ---------------------------------------------------------------------------
// O palco: a tela que vai no projetor
// ---------------------------------------------------------------------------

function desenharQr(pin) {
    const alvo = document.getElementById('pcQr');
    if (!alvo) return;
    const pintar = () => {
        try { alvo.innerHTML = ''; new window.QRCode(alvo, { text: linkDoAluno(pin), width: 180, height: 180 }); }
        catch (_) { alvo.innerHTML = ''; }
    };
    if (window.QRCode) { pintar(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = pintar;
    s.onerror = () => { alvo.style.display = 'none'; };
    document.head.appendChild(s);
}

function opcoesPalco(pub, gabarito, dist) {
    const revelada = Array.isArray(gabarito);
    return `<div class="pc-ops">${pub.opcoes.map((o, k) => `
        <div class="pc-op ${revelada && pub.tipo !== 'enquete' && !gabarito.includes(k) ? 'apagada' : ''}" style="background:${CORES[k]}">
            <span class="lt">${revelada && pub.tipo !== 'enquete' && gabarito.includes(k) ? '✓' : LETRAS[k]}</span>
            <span>${esc(o)}</span>
            ${dist ? `<span class="cont">${dist[k] || 0}</span>` : ''}
        </div>`).join('')}</div>`;
}

function desenharPalco() {
    const p = qzPartida;
    if (!p) return;
    let palco = document.getElementById('qzPalco');
    if (!palco) { palco = document.createElement('div'); palco.id = 'qzPalco'; document.body.appendChild(palco); }
    const nJog = Object.keys(p.jogadores).length;
    const barra = `
        <div class="pc-barra">
            <div style="font-weight:800; font-size:18px;">🎯 Na Mosca! <span style="opacity:0.7; font-weight:500;">· ${esc(p.quiz.titulo)}</span></div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                ${p.pin ? `<span style="opacity:0.85;">PIN <strong>${p.pin}</strong> · 👥 ${nJog}</span>` : ''}
                <button class="pc-btn sec" onclick="qzTelaCheia()">⛶ Tela cheia</button>
                <button class="pc-btn sec" onclick="qzEncerrar()">${p.estado === 'fim' ? 'Fechar e apagar a sala' : 'Encerrar'}</button>
            </div>
        </div>`;
    let corpo = '';
    const ehUltima = p.indice >= p.quiz.perguntas.length - 1;

    if (p.estado === 'abrindo') {
        corpo = '<h2>Abrindo a sala...</h2>';
    } else if (p.estado === 'erro') {
        corpo = `<h2>Não deu para abrir a sala</h2><p style="font-size:18px;">${esc(p.erro)}</p>`;
    } else if (p.estado === 'sala') {
        const link = linkDoAluno('');
        corpo = `
            <div style="display:flex; gap:30px; justify-content:center; align-items:center; flex-wrap:wrap; margin-top:10px;">
                <div>
                    <div style="font-size:20px; opacity:0.85;">Entre em <strong>${esc(link.replace(/^https?:\/\//, ''))}</strong></div>
                    <div style="font-size:18px; opacity:0.85; margin-top:6px;">e digite o PIN</div>
                    <div class="pc-pin">${p.pin}</div>
                </div>
                <div id="pcQr" style="background:#fff; padding:10px; border-radius:12px; width:180px; height:180px;"></div>
            </div>
            <div style="margin:20px 0; font-size:20px;">👥 ${nJog} na sala ${nJog ? '' : '— esperando a turma entrar...'}</div>
            <div>${Object.keys(p.jogadores).map(id => `<span class="pc-tag">${esc(p.jogadores[id].apelido)} <button title="Tirar da sala" onclick="qzRemoverJogador('${esc(id)}')">✕</button></span>`).join('')}</div>
            <div style="margin-top:26px;"><button class="pc-btn" onclick="qzProximaPergunta()" ${nJog ? '' : 'disabled'}>▶️ Começar (${p.quiz.perguntas.length} perguntas)</button></div>`;
    } else if (p.estado === 'pergunta' || p.estado === 'revelada') {
        const pub = p.atual.publica;
        const revelada = p.estado === 'revelada';
        corpo = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <span class="pc-tag">Pergunta ${p.indice + 1} de ${p.quiz.perguntas.length}${pub.pontos === 2 ? ' · ⭐ vale dobro' : ''}${pub.tipo === 'enquete' ? ' · enquete' : ''}</span>
                ${revelada ? '' : `<span class="pc-relogio" id="pcRelogio">${Math.max(0, Math.ceil((p.fimLocal - Date.now()) / 1000))}</span>`}
                <span class="pc-tag">✋ <span id="pcRespostas">${p.respostas.length}</span>/${nJog} responderam</span>
            </div>
            <div class="pc-pergunta">${esc(pub.texto)}</div>
            ${pub.imagem ? `<img class="pc-img" src="${pub.imagem}" alt="">` : ''}
            ${opcoesPalco(pub, revelada ? p.atual.gabarito : null, revelada ? p.distribuicao : null)}
            <div style="margin-top:22px;">
                ${revelada
                    ? `<button class="pc-btn" onclick="qzPlacar()">🏆 Ver placar</button>
                       <button class="pc-btn sec" onclick="qzProximaPergunta()">${ehUltima ? 'Ir para o pódio' : 'Pular placar →'}</button>`
                    : `<button class="pc-btn sec" onclick="qzRevelar()" ${p.fechando ? 'disabled' : ''}>${p.fechando ? 'Fechando...' : '⏭️ Encerrar tempo'}</button>`}
            </div>`;
    } else if (p.estado === 'placar') {
        const t = top(5);
        corpo = `<h2 style="font-size:36px; margin:10px 0 20px;">🏆 Placar</h2>
            ${t.map(j => `<div class="pc-linha"><span>${j.posicao}º ${esc(j.apelido)}</span><span>${j.pontos}</span></div>`).join('') || '<p>Ninguém pontuou ainda.</p>'}
            <div style="margin-top:24px;"><button class="pc-btn" onclick="qzProximaPergunta()">${ehUltima ? '🥇 Ver o pódio' : '▶️ Próxima pergunta'}</button></div>`;
    } else if (p.estado === 'fim') {
        const t = top(3);
        const degrau = (j, h, cor, md) => j ? `<div class="pc-degrau" style="height:${h}px; background:${cor};"><span class="md">${md}</span><span class="nm">${esc(j.apelido)}</span><span class="pt">${j.pontos} pts</span></div>` : '';
        corpo = `<h2 style="font-size:38px; margin:10px 0 0;">🎉 Pódio</h2>
            <div class="pc-podio">${degrau(t[1], 180, '#0d9488', '🥈')}${degrau(t[0], 240, '#7c3aed', '🥇')}${degrau(t[2], 140, '#ea580c', '🥉')}</div>
            <div class="pc-nao-imprimir" style="margin-bottom:20px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button class="pc-btn sec" onclick="qzVerRelatorioAtual()">📊 Ver relatório</button>
                <button class="pc-btn sec" onclick="qzBaixarCsv()">⬇️ Baixar CSV</button>
                <button class="pc-btn" onclick="qzEncerrar()">Fechar e apagar a sala</button>
            </div>
            <div id="pcRelatorio" style="text-align:left; display:none;">${p.relatorio ? htmlRelatorio(p.relatorio) : ''}</div>`;
    }
    palco.innerHTML = ESTILO + barra + `<div class="pc-centro">${corpo}</div>`;
    if (p.estado === 'sala') desenharQr(p.pin);
}

function qzVerRelatorioAtual() {
    const r = document.getElementById('pcRelatorio');
    if (r) { r.style.display = r.style.display === 'none' ? 'block' : 'none'; if (r.style.display === 'block') r.scrollIntoView({ behavior: 'smooth' }); }
}

// O aviso de "sair da pagina" no meio da partida: fechar a aba deixaria a turma esperando.
window.addEventListener('beforeunload', ev => {
    if (qzPartida && qzPartida.pin && qzPartida.estado !== 'fim') { ev.preventDefault(); ev.returnValue = ''; }
});

Object.assign(window, {
    renderQuiz, qzNovo, qzEditar, qzDuplicar, qzExcluir, qzVoltar, qzSalvar,
    qzCampo, qzPCampo, qzOpcao, qzCerta, qzTipo, qzAddPergunta, qzMover, qzDuplicarPergunta, qzRemoverPergunta, qzImagem, qzRedesenhar,
    qzAbrirGerador, qzGerar,
    qzIniciar, qzRemoverJogador, qzProximaPergunta, qzRevelar, qzPlacar, qzEncerrar, qzTelaCheia,
    qzVerRelatorio, qzVerRelatorioAtual, qzBaixarCsv, qzApagarRelatorio,
    // so' leitura, para os testes e para o console de suporte
    qzEstado: () => ({ editando: qzEditando, vista: qzVista, partida: qzPartida })
});

})();
