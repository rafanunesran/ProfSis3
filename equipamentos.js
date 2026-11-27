// equipamentos.js — A ABA "EQUIPAMENTOS": agenda de notebooks, tablets e afins da escola.
//
// O QUE E'
//   A escola tem um lote de notebooks/tablets que os professores dividem. Aqui:
//     📅 Agenda      ver o que esta' livre em cada aula do dia e reservar (com reserva
//                    para troca); a reserva aparece no Inicio, embaixo da aula da turma.
//     🖥️ Cadastro    os equipamentos da escola ("Notebook 01 a 30, Carrinho 1") e quais
//                    estao com defeito.
//     📊 Relatório   quem usou o que no dia, com as trocas e os defeitos. Imprime e CSV.
//   Na aula, "📲 Link para os alunos" abre um painel com QR code: o estudante abre
//   equipamento.html no celular ou no proprio notebook, toca o NUMERO dele na chamada e o
//   equipamento que pegou. Se der problema, "Não funciona" e escolhe outro: o equipamento
//   fica marcado com defeito e sai da agenda ate' alguem marcar como consertado.
//   "✍️ Lançar" e' o mesmo painel para o professor preencher a mao.
//
// ONDE MORA CADA COISA (nada aqui tem nome de estudante)
//   app_data/equip_school_<escola>                    { equipamentos: [...] }
//   app_data/equip_reservas_school_<escola>_<AAAA-MM> { reservas: [...] }
//   app_data/equip_uso_school_<escola>_<AAAA-MM-DD>   { usos: { <reserva>: { registros } } }
//   equip_sessoes/<codigo>  (+ registros/<id>)        o link da aula; ver firestore.rules
//   data.equipNumeros (no aparelho, cifrado como todo campo pessoal): o numero da chamada
//     de cada estudante no dia da aula, para o relatorio continuar certo se a lista mudar.
//   Conta sem escola usa os mesmos nomes com "user_<uid>" no lugar de "school_<escola>".
//
// As contas (livre/ocupado, trocas, relatorio) estao em equipamentos_operacoes.js.

(function () {
'use strict';

const E = () => window.EQUIPOPS;

const st = {
    vista: 'agenda',          // 'agenda' | 'cadastro' | 'relatorio'
    dia: '',
    cadastro: null,           // [equipamentos]
    reservas: {},             // { 'AAAA-MM': [reservas] }
    usos: {},                 // { 'AAAA-MM-DD': { reservaId: { registros } } }
    carregando: false,
    erro: '',
    aula: null                // painel da aula aberto (ver abrirPainelAula)
};

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function arg(v) { return "'" + String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;') + "'"; }

function uidAtual() {
    try {
        const u = window.firebase && firebase.auth && firebase.auth().currentUser;
        if (u && u.uid) return u.uid;
    } catch (_) { /* sem auth */ }
    return (typeof currentUser !== 'undefined' && currentUser && (currentUser.uid || currentUser.id)) ? String(currentUser.uid || currentUser.id) : '';
}
function meuNome() { return (typeof currentUser !== 'undefined' && currentUser && (currentUser.nome || currentUser.email)) || 'Professor(a)'; }
function temBanco() { return typeof db !== 'undefined' && !!db; }
function dono() {
    const s = (typeof currentUser !== 'undefined' && currentUser && currentUser.schoolId) ? String(currentUser.schoolId) : '';
    return s ? 'school_' + s : 'user_' + (uidAtual() || 'local');
}
function idCadastro() { return 'equip_' + dono(); }
function idReservas(mes) { return 'equip_reservas_' + dono() + '_' + mes; }
function idUso(dia) { return 'equip_uso_' + dono() + '_' + dia; }
function hoje() { return E().dataLocal(); }

function linkDoAluno(codigo) {
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    return base + 'equipamento.html' + (codigo ? '?c=' + codigo : '');
}

// ---------------------------------------------------------------------------
// Banco: ler e mudar um documento compartilhado SEM apagar o que o colega gravou
// ---------------------------------------------------------------------------

async function lerDoc(id) {
    if (temBanco()) {
        const s = await db.collection('app_data').doc(id).get();
        return s.exists ? (s.data() || {}) : {};
    }
    return (typeof getData === 'function' ? await getData('app_data', id) : null) || {};
}

// fn(copia) devolve o documento novo (ou null para nao gravar). Com Firestore vai numa
// transacao: dois professores reservando ao mesmo tempo nao se sobrescrevem, e a
// conferencia de choque de horario e' feita com o que esta' gravado NAQUELE instante.
async function mudarDoc(id, fn) {
    const limpar = o => JSON.parse(JSON.stringify(o));
    const conferir = o => { if (typeof assertSemDadosPessoais === 'function') assertSemDadosPessoais('app_data', id, o); };
    if (temBanco() && typeof db.runTransaction === 'function') {
        const ref = db.collection('app_data').doc(id);
        return db.runTransaction(async t => {
            const s = await t.get(ref);
            const novo = fn(limpar(s.exists ? (s.data() || {}) : {}));
            if (!novo) return null;
            const pronto = limpar(novo);
            conferir(pronto);
            t.set(ref, pronto);
            return pronto;
        });
    }
    const novo = fn(limpar(await lerDoc(id)));
    if (!novo) return null;
    const pronto = limpar(novo);
    conferir(pronto);
    if (temBanco()) await db.collection('app_data').doc(id).set(pronto);
    else if (typeof saveData === 'function') await saveData('app_data', id, pronto);
    return pronto;
}

async function carregarCadastro(forcar) {
    if (st.cadastro && !forcar) return st.cadastro;
    const d = await lerDoc(idCadastro());
    st.cadastro = Array.isArray(d.equipamentos) ? d.equipamentos : [];
    return st.cadastro;
}
async function carregarReservas(mes, forcar) {
    if (st.reservas[mes] && !forcar) return st.reservas[mes];
    const d = await lerDoc(idReservas(mes));
    st.reservas[mes] = Array.isArray(d.reservas) ? d.reservas : [];
    return st.reservas[mes];
}
async function carregarUsos(dia, forcar) {
    if (st.usos[dia] && !forcar) return st.usos[dia];
    const d = await lerDoc(idUso(dia));
    st.usos[dia] = (d && typeof d.usos === 'object' && d.usos) ? d.usos : {};
    return st.usos[dia];
}
function reservasDoDia(dia) { return (st.reservas[E().mesDe(dia)] || []).filter(r => r.data === dia); }

async function gravarCadastro(fn) {
    const novo = await mudarDoc(idCadastro(), d => {
        const lista = Array.isArray(d.equipamentos) ? d.equipamentos : [];
        const r = fn(lista);
        if (!r) return null;
        return { equipamentos: r, atualizadoEm: Date.now() };
    });
    if (novo) st.cadastro = novo.equipamentos;
    return novo;
}

// ---------------------------------------------------------------------------
// Grade da escola: as aulas do dia (para "reservar a 3ª aula" sem digitar hora)
// ---------------------------------------------------------------------------

function blocosDoDia(dia) {
    const dados = (typeof data !== 'undefined' && data) ? data : {};
    const exc = (dados.schoolExceptions || []).find(e => e.data === dia);
    const blocos = exc ? (exc.blocos || []) : (dados.schoolGrade || []).filter(g => g.diaSemana == new Date(dia + 'T12:00:00').getDay());
    return blocos.filter(b => b && b.inicio && b.fim).slice().sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
}
function minhaAulaNoBloco(bloco) {
    const dados = (typeof data !== 'undefined' && data) ? data : {};
    const a = (dados.horariosAulas || []).find(x => x.id_bloco == bloco.id && x.tipo === 'aula' && x.id_turma);
    return a ? (dados.turmas || []).find(t => t.id == a.id_turma) || null : null;
}
function minhasTurmas() {
    const dados = (typeof data !== 'undefined' && data) ? data : {};
    return (dados.turmas || []).slice().sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }));
}
function nomeTurma(t) { return t ? (t.nome || 'Turma') + (t.disciplina ? ' · ' + t.disciplina : '') : ''; }

// Estudantes ativos da turma na ordem da chamada (alfabetica). O numero e' a posicao.
function listaDaChamada(turmaId) {
    const dados = (typeof data !== 'undefined' && data) ? data : {};
    const ativo = e => (typeof estudanteAtivo === 'function') ? estudanteAtivo(e) : (!e.status || e.status === 'Ativo');
    return (dados.estudantes || []).filter(e => e.id_turma == turmaId && ativo(e))
        .sort((a, b) => String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR', { sensitivity: 'base' }));
}

// Fotografia "numero -> id do estudante" da reserva, guardada no aparelho (campo pessoal).
function numerosDaReserva(r, criar) {
    const dados = (typeof data !== 'undefined' && data) ? data : null;
    if (!dados) return null;
    if (!dados.equipNumeros || typeof dados.equipNumeros !== 'object') dados.equipNumeros = {};
    if (dados.equipNumeros[r.id]) return dados.equipNumeros[r.id];
    if (!criar || !r.turmaId) return null;
    const mapa = {};
    listaDaChamada(r.turmaId).forEach((e, i) => { mapa[i + 1] = e.id; });
    if (!Object.keys(mapa).length) return null;
    dados.equipNumeros[r.id] = { dia: r.data, mapa };
    // guarda so' os ultimos 120 dias
    const limite = E().dataLocal(new Date(Date.now() - 120 * 86400000));
    Object.keys(dados.equipNumeros).forEach(k => { if ((dados.equipNumeros[k].dia || '') < limite) delete dados.equipNumeros[k]; });
    if (typeof persistirDados === 'function') { try { persistirDados(); } catch (_) {} }
    return dados.equipNumeros[r.id];
}
function nomeDoNumero(r, num) {
    if (!r || r.profUid !== uidAtual()) return '';
    const dados = (typeof data !== 'undefined' && data) ? data : {};
    const foto = numerosDaReserva(r, false);
    let id = foto && foto.mapa ? foto.mapa[num] : null;
    if (id == null) { const l = listaDaChamada(r.turmaId); id = l[num - 1] ? l[num - 1].id : null; }
    const e = id == null ? null : (dados.estudantes || []).find(x => x.id == id);
    return e ? e.nome_completo : '';
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

function container() { return document.getElementById('tabFerramentasEquip'); }

const ESTILO = `
<style>
#tabFerramentasEquip { padding-bottom: 30px; }
.eq-topo { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin: 14px 0 8px; }
.eq-topo h2 { margin:0; font-size: 22px; }
.eq-sub { display:flex; gap:6px; flex-wrap:wrap; }
.eq-sub button { border:1px solid #d5dce6; background:#fff; color:#3d4759; padding:7px 12px; border-radius:999px; font-weight:600; cursor:pointer; font-size:14px; }
.eq-sub button.ativo { background: var(--accent, #2563c9); border-color: var(--accent, #2563c9); color:#fff; }
.eq-dia { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin: 6px 0 12px; }
.eq-dia input[type=date] { width:auto; margin:0; }
.eq-tab { width:100%; border-collapse: collapse; font-size: 14px; }
.eq-tab th, .eq-tab td { border-bottom: 1px solid #e3e8ef; padding: 7px 6px; text-align:left; vertical-align: middle; }
.eq-tab th { font-size: 12px; color:#5f6b7f; font-weight:700; }
.eq-cel { display:inline-block; min-width: 92px; padding: 5px 8px; border-radius: 8px; font-weight:700; cursor:pointer; border:1px solid transparent; background:none; font-size:13px; text-align:left; }
.eq-cel.ok { background:#e8f6ee; color:#1f6b43; border-color:#bfe5cf; }
.eq-cel.pouco { background:#fff6e0; color:#8a5a00; border-color:#f3dfa6; }
.eq-cel.zero { background:#fde8e8; color:#9b1c1c; border-color:#f5c2c2; }
.eq-cel small { display:block; font-weight:500; opacity:.8; }
.eq-res { border:1px solid #e3e8ef; border-left: 4px solid #9aa5b5; border-radius: 10px; padding: 10px 12px; margin: 8px 0; background:#fff; }
.eq-res.minha { border-left-color: var(--accent, #2563c9); }
.eq-res .l1 { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; font-weight:700; }
.eq-res .l2 { font-size: 13px; color:#3d4759; margin-top: 3px; }
.eq-res .acoes { display:flex; gap:6px; flex-wrap:wrap; margin-top: 8px; }
.eq-aviso { background:#fff6e0; border:1px solid #f3dfa6; color:#6b4500; padding:8px 10px; border-radius:8px; font-size:13px; margin-top:8px; }
.eq-chips { display:flex; flex-wrap:wrap; gap:6px; }
.eq-chip { border:1px solid #d5dce6; background:#fff; border-radius: 8px; padding: 5px 8px; font-size: 13px; cursor:pointer; color:#1c2536; }
.eq-chip.livre { background:#fff; }
.eq-chip.usar { background: var(--accent, #2563c9); border-color: var(--accent, #2563c9); color:#fff; font-weight:700; }
.eq-chip.troca { background:#fff; border: 2px dashed var(--accent, #2563c9); color:#1c2536; font-weight:700; }
.eq-chip.reservado { background:#eef1f5; color:#8a94a6; cursor:not-allowed; text-decoration: line-through; }
.eq-chip.defeito { background:#fde8e8; color:#9b1c1c; cursor:not-allowed; }
.eq-legenda { font-size:12px; color:#5f6b7f; margin: 6px 0; }
.eq-grupo { margin: 14px 0 6px; font-weight:800; color:#1c2536; }
.eq-linha { display:grid; grid-template-columns: 1fr auto; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid #eef1f5; }
.eq-vazio { color:#5f6b7f; font-size:14px; padding: 10px 0; }
.eq-modal { position:fixed; inset:0; background: rgba(15,23,42,.55); z-index: 1000; display:flex; align-items:flex-start; justify-content:center; overflow:auto; padding: 24px 12px; }
.eq-modal .caixa { background:#fff; border-radius: 14px; width: min(720px, 100%); padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
.eq-modal .caixa h3 { margin: 0 0 10px; }
.eq-form { display:grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.eq-form > div { display:flex; flex-direction:column; gap:4px; }
.eq-form .cheio { grid-column: 1 / -1; }
.eq-form .rot { font-size: 13px; font-weight:700; color:#3d4759; }
.eq-form input, .eq-form select, .eq-form textarea { margin:0; }
.eq-rodape { display:flex; justify-content:flex-end; gap:8px; margin-top: 14px; flex-wrap:wrap; }
.eq-erro { color:#b91c1c; font-size: 13px; min-height: 16px; }
/* painel da aula */
.eq-aula { position:fixed; inset:0; z-index: 995; background:#f6f8fb; overflow:auto; }
.eq-aula .barra { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding: 10px 16px; background:#fff; border-bottom:1px solid #e3e8ef; }
.eq-aula .barra strong { font-size: 17px; }
.eq-aula .corpo { display:grid; grid-template-columns: 300px 1fr; gap: 16px; padding: 16px; max-width: 1200px; margin: 0 auto; }
.eq-aula .lado { background:#fff; border:1px solid #e3e8ef; border-radius: 12px; padding: 14px; text-align:center; align-self:start; }
.eq-aula .qr { width: 220px; height: 220px; margin: 6px auto; background:#fff; }
.eq-aula .codigo { font-size: 30px; font-weight: 800; letter-spacing: 3px; }
.eq-aula .link { font-size: 12px; word-break: break-all; color:#3d4759; }
.eq-aula .tabela { background:#fff; border:1px solid #e3e8ef; border-radius: 12px; padding: 6px 12px 12px; }
.eq-aula select { margin:0; min-width: 150px; padding: 5px; }
.eq-tag { display:inline-block; font-size: 11px; font-weight:700; border-radius: 999px; padding: 2px 8px; margin: 1px 2px; }
.eq-tag.def { background:#fde8e8; color:#9b1c1c; }
.eq-tag.tro { background:#eef1f5; color:#3d4759; }
.eq-tag.prof { background:#e8eefc; color:#1b4488; }
.eq-tag.conf { background:#fff6e0; color:#6b4500; }
.eq-placar { font-size: 14px; color:#3d4759; margin: 8px 0; }
.eq-projetar .tabela td:nth-child(3), .eq-projetar .tabela th:nth-child(3), .eq-projetar .tabela td:nth-child(4), .eq-projetar .tabela th:nth-child(4) { display:none; }
.eq-projetar .tabela { font-size: 18px; }
@media (max-width: 760px) {
  .eq-form { grid-template-columns: 1fr; }
  .eq-aula .corpo { grid-template-columns: 1fr; }
  .eq-tab .esconder-cel { display:none; }
}
</style>`;

function renderEquipamentos() {
    const el = container();
    if (!el) return;
    if (!st.dia) st.dia = hoje();
    el.innerHTML = ESTILO + `
        <div class="eq-topo">
            <h2>💻 Equipamentos</h2>
            <div class="eq-sub">
                <button type="button" class="${st.vista === 'agenda' ? 'ativo' : ''}" onclick="eqVista('agenda')">📅 Agenda</button>
                <button type="button" class="${st.vista === 'cadastro' ? 'ativo' : ''}" onclick="eqVista('cadastro')">🖥️ Equipamentos da escola</button>
                <button type="button" class="${st.vista === 'relatorio' ? 'ativo' : ''}" onclick="eqVista('relatorio')">📊 Relatório do dia</button>
            </div>
        </div>
        <div id="eqConteudo"><p class="eq-vazio">Carregando...</p></div>`;
    desenharVista();
}

async function desenharVista() {
    const alvo = document.getElementById('eqConteudo');
    if (!alvo) return;
    try {
        await carregarCadastro();
        if (st.vista !== 'cadastro') await carregarReservas(E().mesDe(st.dia));
        if (st.vista === 'relatorio') await carregarUsos(st.dia);
    } catch (e) {
        console.error('[Equipamentos]', e);
        alvo.innerHTML = `<div class="eq-aviso">Não consegui carregar a agenda de equipamentos (${esc(e && e.message || e)}). Confira a internet e tente de novo.
            <br><button class="btn btn-sm btn-secondary" style="margin-top:6px" onclick="eqRecarregar()">Tentar de novo</button></div>`;
        return;
    }
    if (st.vista === 'cadastro') alvo.innerHTML = htmlCadastro();
    else if (st.vista === 'relatorio') alvo.innerHTML = htmlRelatorio();
    else alvo.innerHTML = htmlAgenda();
}

function seletorDia() {
    return `<div class="eq-dia">
        <button type="button" class="btn btn-sm btn-secondary" onclick="eqMudarDia(-1)" aria-label="Dia anterior">◀</button>
        <input type="date" value="${esc(st.dia)}" onchange="eqIrDia(this.value)" aria-label="Dia">
        <button type="button" class="btn btn-sm btn-secondary" onclick="eqMudarDia(1)" aria-label="Próximo dia">▶</button>
        ${st.dia !== hoje() ? `<button type="button" class="btn btn-sm btn-secondary" onclick="eqIrDia('${hoje()}')">Hoje</button>` : ''}
        <span style="font-size:13px; color:#5f6b7f;">${esc(new Date(st.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</span>
        <button type="button" class="btn btn-sm btn-secondary" style="margin-left:auto" onclick="eqRecarregar()" title="Buscar de novo o que os colegas reservaram">🔄 Atualizar</button>
    </div>`;
}

// --- 📅 Agenda ---------------------------------------------------------------

function tiposCadastrados() {
    const t = [];
    (st.cadastro || []).forEach(e => { if (t.indexOf(e.tipo) === -1) t.push(e.tipo); });
    return t;
}
function nomeTipo(t) { const x = E().TIPOS[t]; return x ? x.icone + ' ' + x.nome : t; }

function htmlAgenda() {
    if (!(st.cadastro || []).length) {
        return `<div class="card" style="margin:0;">
            <h3 style="margin-top:0;">Comece cadastrando os equipamentos da escola</h3>
            <p style="font-size:14px; color:#3d4759;">Ex.: "Notebook 01 a 30, Carrinho 1" e "Tablet 01 a 20". O cadastro é da escola: qualquer professor vê e reserva.</p>
            <button class="btn btn-primary" onclick="eqVista('cadastro')">🖥️ Cadastrar equipamentos</button>
        </div>`;
    }
    const dia = st.dia;
    const reservas = st.reservas[E().mesDe(dia)] || [];
    const tipos = tiposCadastrados();
    const blocos = blocosDoDia(dia);
    const linhaDisp = (ini, fim, rotulo, turma) => {
        const cont = E().contarPorTipo(E().disponibilidade(st.cadastro, reservas, dia, ini, fim));
        return `<tr>
            <td><strong>${esc(ini)}–${esc(fim)}</strong>${rotulo ? `<br><small style="color:#5f6b7f">${esc(rotulo)}</small>` : ''}</td>
            ${tipos.map(t => {
                const c = cont[t] || { total: 0, livres: 0, defeito: 0 };
                const cls = c.livres === 0 ? 'zero' : (c.livres < c.total / 3 ? 'pouco' : 'ok');
                return `<td><button type="button" class="eq-cel ${cls}" title="Reservar neste horário"
                    onclick="eqNovaReserva({data:'${dia}', inicio:'${esc(ini)}', fim:'${esc(fim)}', tipo:'${esc(t)}'${turma ? ', turmaId:' + arg(turma.id) : ''}})">
                    ${c.livres} ${c.livres === 1 ? 'livre' : 'livres'} <small>de ${c.total}${c.defeito ? ' · ' + c.defeito + ' c/ defeito' : ''}</small></button></td>`;
            }).join('')}
        </tr>`;
    };
    const aulas = blocos.filter(b => !b.tipo);
    const tabela = aulas.length ? `
        <div style="overflow-x:auto;"><table class="eq-tab">
            <thead><tr><th>Aula</th>${tipos.map(t => `<th>${esc(nomeTipo(t))}</th>`).join('')}</tr></thead>
            <tbody>${aulas.map(b => { const t = minhaAulaNoBloco(b); return linhaDisp(b.inicio, b.fim, (b.label ? b.label + ' · ' : '') + (t ? 'sua aula: ' + nomeTurma(t) : ''), t); }).join('')}</tbody>
        </table></div>
        <p class="eq-legenda">Toque num número para reservar naquele horário.</p>`
        : `<p class="eq-vazio">A grade da escola não tem aulas neste dia. Use "➕ Reservar" e escolha o horário.</p>`;

    const doDia = reservas.filter(r => r.data === dia).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    const eu = uidAtual();
    const cards = doDia.length ? doDia.map(r => htmlCardReserva(r, eu, reservas)).join('') : '<p class="eq-vazio">Nenhuma reserva neste dia.</p>';
    return seletorDia() + `
        <div class="card" style="margin:0 0 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <h3 style="margin:0;">Disponível em cada aula</h3>
                <button class="btn btn-primary btn-sm" onclick="eqNovaReserva({data:'${dia}'})">➕ Reservar</button>
            </div>
            ${tabela}
        </div>
        <div class="card" style="margin:0;">
            <h3 style="margin:0 0 6px;">Reservas do dia</h3>
            ${cards}
        </div>`;
}

function htmlCardReserva(r, eu, reservas) {
    const minha = r.profUid === eu;
    const trocas = E().trocasPrevistas(r, st.cadastro, reservas);
    const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
    const aviso = trocas.length ? `<div class="eq-aviso">⚠️ ${trocas.map(t => esc(E().rotuloDe(t.de, porId)) + ' está com defeito' +
        (t.para ? ' → trocar por ' + esc(E().rotuloDe(t.para, porId)) : ' e não há outro livre')).join('; ')}.
        ${minha && trocas.some(t => t.para) ? `<button class="btn btn-sm btn-warning" style="margin-left:6px" onclick="eqAplicarTrocas(${arg(r.id)})">Trocar agora</button>` : ''}</div>` : '';
    return `<div class="eq-res${minha ? ' minha' : ''}" data-reserva="${esc(r.id)}">
        <div class="l1"><span>${esc(r.inicio)}–${esc(r.fim)} · ${esc(r.turmaNome || 'Sem turma')}</span><span style="font-weight:500; color:#5f6b7f;">${minha ? 'Sua reserva' : esc(r.profNome)}</span></div>
        <div class="l2">${esc(E().resumirIds(r.equipIds, st.cadastro)) || '—'} <span style="color:#5f6b7f">(${(r.equipIds || []).length})</span>
            ${(r.reservaTroca || []).length ? ` · <span title="Ficam separados para trocar o que der defeito">🔁 troca: ${esc(E().resumirIds(r.reservaTroca, st.cadastro))}</span>` : ''}</div>
        ${r.obs ? `<div class="l2">📝 ${esc(r.obs)}</div>` : ''}
        ${aviso}
        ${minha ? `<div class="acoes">
            <button class="btn btn-sm btn-primary" onclick="eqAbrirAula(${arg(r.id)}, true)">📲 Link para os alunos</button>
            <button class="btn btn-sm btn-secondary" onclick="eqAbrirAula(${arg(r.id)}, false)">✍️ Lançar à mão</button>
            <button class="btn btn-sm btn-secondary" onclick="eqEditarReserva(${arg(r.id)})">✏️ Editar</button>
            <button class="btn btn-sm btn-danger" onclick="eqCancelarReserva(${arg(r.id)})">🗑️ Cancelar</button>
        </div>` : ''}
    </div>`;
}

// --- Reservar ----------------------------------------------------------------

let form = null;  // estado do formulario de reserva aberto

async function eqNovaReserva(pre) {
    pre = pre || {};
    const dia = pre.data || st.dia || hoje();
    try { await carregarCadastro(); await carregarReservas(E().mesDe(dia)); }
    catch (e) { alert('Não consegui carregar a agenda: ' + (e && e.message || e)); return; }
    if (!(st.cadastro || []).length) { eqVista('cadastro'); return; }
    const tipos = tiposCadastrados();
    let turmaId = pre.turmaId != null ? String(pre.turmaId) : '';
    let ini = pre.inicio || '', fim = pre.fim || '';
    if (!ini) {
        // sem horario: a proxima aula minha do dia, ou a primeira aula
        const agora = E().horaLocal();
        const blocos = blocosDoDia(dia).filter(b => !b.tipo);
        const meu = blocos.find(b => minhaAulaNoBloco(b) && (dia !== hoje() || b.fim > agora)) || blocos.find(b => dia !== hoje() || b.fim > agora) || blocos[0];
        if (meu) { ini = meu.inicio; fim = meu.fim; if (!turmaId) { const t = minhaAulaNoBloco(meu); if (t) turmaId = String(t.id); } }
    } else if (!turmaId) {
        const b = blocosDoDia(dia).find(x => x.inicio === ini);
        const t = b ? minhaAulaNoBloco(b) : null;
        if (t) turmaId = String(t.id);
    }
    const turma = minhasTurmas().find(t => String(t.id) === turmaId);
    const qtd = turma ? Math.max(1, listaDaChamada(turma.id).length) : 10;
    form = {
        id: '', data: dia, inicio: ini, fim: fim, turmaId, tipo: pre.tipo || tipos[0],
        qtd, troca: E().trocaSugerida(qtd), equipIds: [], reservaTroca: [], obs: '', manual: false
    };
    autoEscolher();
    desenharForm();
}

function eqEditarReserva(id) {
    const r = reservasDoDia(st.dia).find(x => x.id === id) || Object.values(st.reservas).flat().find(x => x.id === id);
    if (!r) return;
    const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
    const primeiro = porId[(r.equipIds || [])[0]];
    form = {
        id: r.id, data: r.data, inicio: r.inicio, fim: r.fim, turmaId: String(r.turmaId || ''),
        tipo: primeiro ? primeiro.tipo : tiposCadastrados()[0],
        qtd: (r.equipIds || []).length, troca: (r.reservaTroca || []).length,
        equipIds: (r.equipIds || []).slice(), reservaTroca: (r.reservaTroca || []).slice(), obs: r.obs || '', manual: true, criadoEm: r.criadoEm
    };
    desenharForm();
}

function dispDoForm() {
    const reservas = st.reservas[E().mesDe(form.data)] || [];
    if (!E().horaValida(form.inicio) || !E().horaValida(form.fim) || form.inicio >= form.fim) return [];
    return E().disponibilidade(st.cadastro, reservas, form.data, form.inicio, form.fim, form.id || null);
}

function autoEscolher() {
    const disp = dispDoForm();
    const r = E().escolherLivres(disp, form.tipo, parseInt(form.qtd, 10) || 0, parseInt(form.troca, 10) || 0);
    form.equipIds = r.equipIds;
    form.reservaTroca = r.reservaTroca;
    form.faltaram = r.faltaram;
}

function desenharForm(msg) {
    let m = document.getElementById('eqModalReserva');
    if (!m) {
        m = document.createElement('div');
        m.id = 'eqModalReserva';
        m.className = 'eq-modal';
        m.addEventListener('click', ev => { if (ev.target === m) eqFecharForm(); });
        document.body.appendChild(m);
    }
    const blocos = blocosDoDia(form.data).filter(b => !b.tipo);
    const blocoIni = blocos.findIndex(b => b.inicio === form.inicio);
    const blocoFim = blocos.findIndex(b => b.fim === form.fim);
    const disp = dispDoForm();
    const livresTipo = disp.filter(d => d.estado === 'livre' && d.equip.tipo === form.tipo).length;
    const doTipo = disp.filter(d => d.equip.tipo === form.tipo || form.equipIds.includes(d.equip.id) || form.reservaTroca.includes(d.equip.id));
    const chips = doTipo.map(d => {
        const id = d.equip.id;
        const cls = form.equipIds.includes(id) ? 'usar' : (form.reservaTroca.includes(id) ? 'troca' : d.estado);
        const titulo = d.estado === 'reservado' ? 'Reservado: ' + (d.reserva.turmaNome || '') + ' · ' + (d.reserva.profNome || '') : (d.estado === 'defeito' ? 'Com defeito' : '');
        return `<button type="button" class="eq-chip ${cls}" ${d.estado !== 'livre' && cls !== 'usar' && cls !== 'troca' ? 'disabled' : ''} title="${esc(titulo)}" onclick="eqAlternarChip(${arg(id)})">${cls === 'troca' ? '🔁 ' : ''}${esc(d.equip.rotulo)}</button>`;
    }).join('');
    const tiposOpc = tiposCadastrados().map(t => `<option value="${esc(t)}" ${t === form.tipo ? 'selected' : ''}>${esc(nomeTipo(t))}</option>`).join('');
    const turmasOpc = '<option value="">— sem turma —</option>' + minhasTurmas().map(t => `<option value="${esc(t.id)}" ${String(t.id) === form.turmaId ? 'selected' : ''}>${esc(nomeTurma(t))}</option>`).join('');
    const optBlocos = (sel, campo) => '<option value="-1">Outro horário</option>' + blocos.map((b, i) =>
        `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(b.inicio)}–${esc(b.fim)}${(() => { const t = minhaAulaNoBloco(b); return t ? ' · ' + esc(t.nome) : ''; })()}</option>`).join('');
    m.innerHTML = `<div class="caixa" role="dialog" aria-label="Reservar equipamentos">
        <h3>${form.id ? '✏️ Editar reserva' : '➕ Reservar equipamentos'}</h3>
        <div class="eq-form">
            <div><span class="rot">Dia</span><input type="date" value="${esc(form.data)}" onchange="eqCampo('data', this.value)"></div>
            <div><span class="rot">Turma</span><select onchange="eqCampo('turmaId', this.value)">${turmasOpc}</select></div>
            ${blocos.length ? `<div><span class="rot">Da aula</span><select onchange="eqBloco('ini', this.value)">${optBlocos(blocoIni)}</select></div>
            <div><span class="rot">Até a aula</span><select onchange="eqBloco('fim', this.value)">${optBlocos(blocoFim)}</select></div>` : ''}
            <div><span class="rot">Início</span><input type="time" value="${esc(form.inicio)}" onchange="eqCampo('inicio', this.value)"></div>
            <div><span class="rot">Fim</span><input type="time" value="${esc(form.fim)}" onchange="eqCampo('fim', this.value)"></div>
            <div><span class="rot">Equipamento</span><select onchange="eqCampo('tipo', this.value)">${tiposOpc}</select></div>
            <div><span class="rot">Quantos (${livresTipo + form.equipIds.filter(id => doTipo.some(d => d.equip.id === id && d.estado !== 'livre')).length} livres neste horário)</span>
                <input type="number" min="0" max="200" value="${esc(form.qtd)}" onchange="eqCampo('qtd', this.value)"></div>
            <div class="cheio"><span class="rot">🔁 Reserva para troca (fica separada para o que der defeito)</span>
                <input type="number" min="0" max="20" value="${esc(form.troca)}" onchange="eqCampo('troca', this.value)" style="max-width:120px"></div>
            <div class="cheio"><span class="rot">Quais (toque para mudar: destacado = usar, 🔁 = reserva para troca)</span>
                <div class="eq-chips">${chips || '<span class="eq-vazio">Escolha um horário válido.</span>'}</div>
                <div class="eq-legenda">${form.equipIds.length} para usar${form.reservaTroca.length ? ' + ' + form.reservaTroca.length + ' para troca' : ''}${form.faltaram ? ` · <strong style="color:#b91c1c">faltaram ${form.faltaram}</strong>` : ''}. Riscado = já reservado; vermelho = com defeito.</div></div>
            <div class="cheio"><span class="rot">Observação (opcional)</span><input type="text" maxlength="300" value="${esc(form.obs)}" placeholder="Ex.: atividade no Khan Academy, levar carregadores" oninput="eqCampo('obs', this.value, true)"></div>
        </div>
        <div class="eq-erro" id="eqErroForm">${esc(msg || '')}</div>
        <div class="eq-rodape">
            <button class="btn btn-secondary" onclick="eqFecharForm()">Cancelar</button>
            <button class="btn btn-primary" id="eqSalvarReserva" onclick="eqSalvarReserva()">💾 Salvar reserva</button>
        </div>
    </div>`;
}

async function eqCampo(campo, valor, semRedesenhar) {
    if (!form) return;
    form[campo] = valor;
    if (campo === 'data') {
        try { await carregarReservas(E().mesDe(valor)); } catch (_) {}
    }
    if (campo === 'turmaId' && !form.manual) {
        const n = listaDaChamada(valor).length;
        if (n) { form.qtd = n; form.troca = E().trocaSugerida(n); }
    }
    if (campo === 'qtd' && !form.manual) form.troca = E().trocaSugerida(valor);
    if (['data', 'inicio', 'fim', 'tipo', 'qtd', 'troca', 'turmaId'].includes(campo)) {
        if (form.manual && ['qtd', 'troca', 'tipo'].includes(campo)) form.manual = false;
        if (!form.manual) autoEscolher();
        else {
            // manteve a escolha a mao: tira o que deixou de estar livre no horario novo
            const disp = dispDoForm();
            const pode = new Set(disp.filter(d => d.estado === 'livre').map(d => d.equip.id));
            form.equipIds = form.equipIds.filter(id => pode.has(id));
            form.reservaTroca = form.reservaTroca.filter(id => pode.has(id));
        }
    }
    if (!semRedesenhar) desenharForm();
}

function eqBloco(qual, idx) {
    const blocos = blocosDoDia(form.data).filter(b => !b.tipo);
    const b = blocos[parseInt(idx, 10)];
    if (!b) { desenharForm(); return; }
    if (qual === 'ini') {
        form.inicio = b.inicio;
        if (!form.fim || form.fim <= b.inicio) form.fim = b.fim;
        if (!form.turmaId) { const t = minhaAulaNoBloco(b); if (t) form.turmaId = String(t.id); }
    } else {
        form.fim = b.fim;
        if (!form.inicio || form.inicio >= b.fim) form.inicio = b.inicio;
    }
    eqCampo('inicio', form.inicio);
}

function eqAlternarChip(id) {
    if (!form) return;
    form.manual = true;
    if (form.equipIds.includes(id)) { form.equipIds = form.equipIds.filter(x => x !== id); form.reservaTroca.push(id); }
    else if (form.reservaTroca.includes(id)) { form.reservaTroca = form.reservaTroca.filter(x => x !== id); }
    else form.equipIds.push(id);
    form.qtd = form.equipIds.length;
    form.troca = form.reservaTroca.length;
    desenharForm();
}

function eqFecharForm() {
    form = null;
    const m = document.getElementById('eqModalReserva');
    if (m) m.remove();
}

async function eqSalvarReserva() {
    if (!form) return;
    const turma = minhasTurmas().find(t => String(t.id) === String(form.turmaId));
    const r = E().normalizarReserva({
        id: form.id || undefined, data: form.data, inicio: form.inicio, fim: form.fim,
        profUid: uidAtual(), profNome: meuNome(),
        turmaId: turma ? turma.id : '', turmaNome: turma ? nomeTurma(turma) : '',
        equipIds: form.equipIds, reservaTroca: form.reservaTroca, obs: form.obs, criadoEm: form.criadoEm
    });
    const prob = E().problemasDaReserva(r);
    if (prob.length) { desenharForm(prob.join(' ')); return; }
    const bt = document.getElementById('eqSalvarReserva');
    if (bt) { bt.disabled = true; bt.textContent = 'Salvando...'; }
    const mes = E().mesDe(r.data);
    let choque = null;
    try {
        const novo = await mudarDoc(idReservas(mes), d => {
            choque = null;   // a transacao pode rodar esta funcao mais de uma vez
            const lista = Array.isArray(d.reservas) ? d.reservas : [];
            const ocupado = E().ocupadosNoHorario(lista, r.data, r.inicio, r.fim, r.id);
            const ruins = r.equipIds.concat(r.reservaTroca).filter(id => ocupado[id]);
            if (ruins.length) { choque = { ids: ruins, outra: ocupado[ruins[0]] }; return null; }
            const outras = lista.filter(x => x.id !== r.id);
            // ninguem edita a reserva do colega
            const antiga = lista.find(x => x.id === r.id);
            if (antiga && antiga.profUid && antiga.profUid !== r.profUid) { choque = { alheia: true }; return null; }
            outras.push(r);
            return { reservas: outras, atualizadoEm: Date.now() };
        });
        if (novo) st.reservas[mes] = novo.reservas;
    } catch (e) {
        console.error('[Equipamentos] salvar reserva', e);
        desenharForm('Não consegui salvar: ' + (e && e.message || e));
        return;
    }
    if (choque) {
        await carregarReservas(mes, true).catch(() => {});
        const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
        if (choque.alheia) { desenharForm('Esta reserva é de outro professor.'); return; }
        form.manual = false;
        autoEscolher();
        desenharForm('Alguém acabou de reservar ' + choque.ids.map(id => E().rotuloDe(id, porId)).join(', ') +
            (choque.outra ? ' (' + (choque.outra.turmaNome || '') + ' · ' + (choque.outra.profNome || '') + ')' : '') +
            '. Escolhi outros livres: confira e salve de novo.');
        return;
    }
    st.dia = r.data;
    eqFecharForm();
    redesenhar();
    atualizarInicio();
}

async function eqCancelarReserva(id) {
    const r = reservasDoDia(st.dia).find(x => x.id === id);
    if (!r || !confirm('Cancelar a reserva de ' + r.inicio + '–' + r.fim + ' (' + (r.turmaNome || 'sem turma') + ')?')) return;
    const mes = E().mesDe(r.data);
    try {
        const novo = await mudarDoc(idReservas(mes), d => {
            const lista = Array.isArray(d.reservas) ? d.reservas : [];
            return { reservas: lista.filter(x => !(x.id === id && x.profUid === uidAtual())), atualizadoEm: Date.now() };
        });
        if (novo) st.reservas[mes] = novo.reservas;
    } catch (e) { alert('Não consegui cancelar: ' + (e && e.message || e)); return; }
    redesenhar();
    atualizarInicio();
}

async function eqAplicarTrocas(id) {
    const r = reservasDoDia(st.dia).find(x => x.id === id);
    if (!r) return;
    const mes = E().mesDe(r.data);
    try {
        const novo = await mudarDoc(idReservas(mes), d => {
            const lista = Array.isArray(d.reservas) ? d.reservas : [];
            const atual = lista.find(x => x.id === id);
            if (!atual) return null;
            const trocas = E().trocasPrevistas(atual, st.cadastro, lista);
            const nova = E().aplicarTrocas(atual, trocas);
            return { reservas: lista.map(x => x.id === id ? nova : x), atualizadoEm: Date.now() };
        });
        if (novo) st.reservas[mes] = novo.reservas;
    } catch (e) { alert('Não consegui trocar: ' + (e && e.message || e)); return; }
    redesenhar();
}

// --- 🖥️ Cadastro ------------------------------------------------------------

function htmlCadastro() {
    const lista = E().ordenarEquipamentos(st.cadastro || []);
    const grupos = {};
    lista.forEach(e => { (grupos[e.grupo || 'Sem grupo'] = grupos[e.grupo || 'Sem grupo'] || []).push(e); });
    const tiposOpc = Object.keys(E().TIPOS).map(t => `<option value="${t}">${esc(nomeTipo(t))}</option>`).join('');
    const comDefeito = lista.filter(e => !E().funciona(e));
    return `
        <div class="card" style="margin:0 0 14px;">
            <h3 style="margin:0 0 8px;">➕ Adicionar equipamentos</h3>
            <div class="eq-form">
                <div><span class="rot">Tipo</span><select id="eqLoteTipo" onchange="document.getElementById('eqLoteBase').placeholder = this.options[this.selectedIndex].text.replace(/^\\S+\\s/, '')">${tiposOpc}</select></div>
                <div><span class="rot">Nome</span><input id="eqLoteBase" type="text" maxlength="30" placeholder="Notebook"></div>
                <div><span class="rot">Do número</span><input id="eqLoteDe" type="number" min="0" value="1"></div>
                <div><span class="rot">Até o número</span><input id="eqLoteAte" type="number" min="0" value="30"></div>
                <div class="cheio"><span class="rot">Grupo / carrinho / sala (opcional)</span><input id="eqLoteGrupo" type="text" maxlength="30" placeholder="Ex.: Carrinho 1"></div>
            </div>
            <div class="eq-rodape"><button class="btn btn-primary" onclick="eqAdicionarLote()">Adicionar</button></div>
            <p class="eq-legenda">Ex.: Nome "Notebook", do 1 ao 30 → Notebook 01 … Notebook 30. Use o número que está na etiqueta do aparelho.</p>
        </div>
        ${comDefeito.length ? `<div class="eq-aviso" style="margin-bottom:14px;">🔧 Com defeito agora: ${comDefeito.map(e => esc(e.rotulo)).join(', ')}. Eles não entram nas reservas até alguém marcar como consertado.</div>` : ''}
        <div class="card" style="margin:0;">
            <h3 style="margin:0 0 4px;">Equipamentos da escola (${lista.length})</h3>
            ${lista.length ? Object.keys(grupos).map(g => `
                <div class="eq-grupo">${esc(g)} <span style="font-weight:500; color:#5f6b7f; font-size:13px;">(${grupos[g].length})</span></div>
                ${grupos[g].map(e => `<div class="eq-linha">
                    <div><strong>${esc(e.rotulo)}</strong> <span style="font-size:12px; color:#5f6b7f;">${esc(nomeTipo(e.tipo))}</span>
                        ${!E().funciona(e) ? `<br><span class="eq-tag def">com defeito</span> <span style="font-size:12px; color:#5f6b7f;">${esc((e.defeito && e.defeito.obs) || '')}</span>` : ''}</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                        ${E().funciona(e)
                            ? `<button class="btn btn-sm btn-secondary" onclick="eqMarcarDefeito(${arg(e.id)})">🔧 Defeito</button>`
                            : `<button class="btn btn-sm btn-success" onclick="eqMarcarConsertado(${arg(e.id)})">✅ Consertado</button>`}
                        <button class="btn btn-sm btn-secondary" onclick="eqRenomear(${arg(e.id)})" title="Renomear">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="eqExcluirEquip(${arg(e.id)})" title="Excluir">🗑️</button>
                    </div></div>`).join('')}`).join('')
            : '<p class="eq-vazio">Nenhum equipamento cadastrado ainda.</p>'}
        </div>`;
}

async function eqAdicionarLote() {
    const v = id => (document.getElementById(id) || {}).value;
    const tipo = v('eqLoteTipo');
    const opc = { tipo, base: v('eqLoteBase') || E().TIPOS[tipo].nome, de: v('eqLoteDe'), ate: v('eqLoteAte'), grupo: v('eqLoteGrupo') };
    let n = 0;
    try {
        await gravarCadastro(lista => {
            const novos = E().gerarLote(opc, lista);
            n = novos.length;
            return novos.length ? lista.concat(novos) : null;
        });
    } catch (e) { alert('Não consegui salvar: ' + (e && e.message || e)); return; }
    if (!n) alert('Nada novo para adicionar: esses nomes já estão cadastrados.');
    redesenhar();
}

async function mudarEquip(id, fn) {
    try {
        await gravarCadastro(lista => {
            const i = lista.findIndex(e => e.id === id);
            if (i < 0) return null;
            const novo = fn(Object.assign({}, lista[i]));
            if (novo === null) return null;
            const copia = lista.slice();
            if (novo === false) copia.splice(i, 1); else copia[i] = novo;
            return copia;
        });
    } catch (e) { alert('Não consegui salvar: ' + (e && e.message || e)); }
    redesenhar();
    atualizarInicio();
}

function eqMarcarDefeito(id, obs) {
    const texto = obs != null ? obs : prompt('O que aconteceu? (opcional)\nEx.: não liga, tela quebrada, sem carregador', '');
    if (texto === null) return;
    return mudarEquip(id, e => Object.assign(e, { situacao: 'defeito', defeito: { obs: String(texto).slice(0, 200), em: Date.now(), por: meuNome() } }));
}
function eqMarcarConsertado(id) {
    return mudarEquip(id, e => { e.situacao = 'ok'; delete e.defeito; return e; });
}
function eqRenomear(id) {
    const e = (st.cadastro || []).find(x => x.id === id);
    if (!e) return;
    const nome = prompt('Novo nome:', e.rotulo);
    if (nome == null) return;
    const grupo = prompt('Grupo / carrinho (pode deixar em branco):', e.grupo || '');
    if (grupo == null) return;
    return mudarEquip(id, x => { x.rotulo = E().limparRotulo(nome) || x.rotulo; x.grupo = E().limparRotulo(grupo); return x; });
}
function eqExcluirEquip(id) {
    const e = (st.cadastro || []).find(x => x.id === id);
    if (!e || !confirm('Excluir "' + e.rotulo + '" do cadastro da escola?')) return;
    return mudarEquip(id, () => false);
}

// --- 📊 Relatório ------------------------------------------------------------

function montarRelatorio() {
    return E().relatorioDoDia(st.dia, st.reservas[E().mesDe(st.dia)] || [], st.usos[st.dia] || {}, st.cadastro, nomeDoNumero);
}

function htmlRelatorio() {
    const rel = montarRelatorio();
    const corpo = rel.blocos.length ? rel.blocos.map(b => {
        const r = b.reserva;
        const minha = r.profUid === uidAtual();
        return `<div class="eq-res${minha ? ' minha' : ''}">
            <div class="l1"><span>${esc(r.inicio)}–${esc(r.fim)} · ${esc(r.turmaNome || 'Sem turma')}</span><span style="font-weight:500; color:#5f6b7f;">${esc(r.profNome)}</span></div>
            <div class="l2">Reservados: ${esc(E().resumirIds(r.equipIds, st.cadastro)) || '—'}${b.troca.length ? ' · troca: ' + esc(E().resumirIds(r.reservaTroca, st.cadastro)) : ''}</div>
            ${b.linhas.length ? `<div style="overflow-x:auto;"><table class="eq-tab" style="margin-top:6px;">
                <thead><tr><th>Nº</th><th>Estudante</th><th>Equipamento</th><th>Trocas</th></tr></thead>
                <tbody>${b.linhas.map(l => `<tr><td>${l.num}</td><td>${esc(l.nome || '—')}</td><td>${esc(l.equip || 'devolveu')}</td>
                    <td>${l.trocas.map(t => `<span class="eq-tag ${/defeito/.test(t) ? 'def' : 'tro'}">${esc(t)}</span>`).join('')}${l.origem === 'prof' ? '<span class="eq-tag prof">lançado pelo professor</span>' : ''}</td></tr>`).join('')}</tbody>
            </table></div>` : '<div class="l2" style="color:#5f6b7f;">Ninguém informou o uso nesta aula.</div>'}
            ${b.defeitos.length ? `<div class="eq-aviso">🔧 Relatado com defeito: ${b.defeitos.map(esc).join(', ')}</div>` : ''}
            ${b.conflitos.length ? `<div class="eq-aviso">⚠️ Mesmo equipamento em dois números: ${b.conflitos.map(c => esc(c.equip) + ' (nº ' + c.nums.join(', ') + ')').join('; ')}</div>` : ''}
        </div>`;
    }).join('') : '<p class="eq-vazio">Nenhuma reserva neste dia.</p>';
    return seletorDia() + `
        <div class="card" style="margin:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <h3 style="margin:0;">Uso dos equipamentos</h3>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-sm btn-secondary" onclick="eqImprimirRelatorio()">🖨️ Imprimir / PDF</button>
                    <button class="btn btn-sm btn-secondary" onclick="eqBaixarCsv()">⬇️ Planilha (CSV)</button>
                </div>
            </div>
            <p class="eq-placar">${rel.totalReservas} reserva(s) · ${rel.totalUsados} equipamento(s) em uso informados${rel.defeitos.length ? ' · 🔧 defeito: ' + rel.defeitos.map(esc).join(', ') : ''}</p>
            <p class="eq-legenda">O nome do estudante aparece só nas suas turmas (ele fica no seu aparelho). Nas turmas dos colegas aparece o número da chamada.</p>
            ${corpo}
        </div>`;
}

function eqImprimirRelatorio() {
    const rel = montarRelatorio();
    const dataBr = new Date(rel.data + 'T12:00:00').toLocaleDateString('pt-BR');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Uso de equipamentos - ${esc(dataBr)}</title>
        <style>body{font-family:Arial,sans-serif;font-size:12px;margin:18px;color:#111}h1{font-size:17px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 4px;border-bottom:1px solid #999;padding-bottom:2px}
        table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left}th{background:#eee}.p{margin:2px 0}</style></head><body>
        <h1>Relatório de uso de equipamentos — ${esc(dataBr)}</h1>
        <p class="p">${rel.totalReservas} reserva(s) · ${rel.totalUsados} equipamento(s) em uso informados${rel.defeitos.length ? ' · Defeito relatado: ' + rel.defeitos.map(esc).join(', ') : ''}</p>
        ${rel.blocos.map(b => `<h2>${esc(b.reserva.inicio)}–${esc(b.reserva.fim)} · ${esc(b.reserva.turmaNome || 'Sem turma')} · ${esc(b.reserva.profNome)}</h2>
            <p class="p">Reservados: ${esc(E().resumirIds(b.reserva.equipIds, st.cadastro))}${b.troca.length ? ' · Reserva para troca: ' + esc(E().resumirIds(b.reserva.reservaTroca, st.cadastro)) : ''}</p>
            ${b.linhas.length ? `<table><tr><th>Nº</th><th>Estudante</th><th>Equipamento</th><th>Trocas</th></tr>
            ${b.linhas.map(l => `<tr><td>${l.num}</td><td>${esc(l.nome)}</td><td>${esc(l.equip || 'devolveu')}</td><td>${esc(l.trocas.join('; '))}${l.origem === 'prof' ? ' (lançado pelo professor)' : ''}</td></tr>`).join('')}</table>`
            : '<p class="p">Ninguém informou o uso nesta aula.</p>'}
            ${b.defeitos.length ? `<p class="p"><strong>Defeito:</strong> ${b.defeitos.map(esc).join(', ')}</p>` : ''}`).join('') || '<p>Nenhuma reserva neste dia.</p>'}
        <script>setTimeout(function(){ window.print(); }, 300);<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
}

function eqBaixarCsv() {
    const csv = E().relatorioCsv(montarRelatorio());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'uso-equipamentos-' + st.dia + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------------------------------------------------------------------
// O painel da aula: link/QR para os alunos + lançamento à mão
// ---------------------------------------------------------------------------

function sessaoRef(codigo) { return db.collection('equip_sessoes').doc(codigo); }

async function eqAbrirAula(reservaId, abrirLink) {
    const r = Object.values(st.reservas).flat().find(x => x.id === reservaId);
    if (!r) { alert('Não achei esta reserva. Atualize a agenda.'); return; }
    fecharPainelAula();
    try { await carregarCadastro(); await carregarUsos(r.data, true); } catch (e) { alert('Não consegui abrir: ' + (e && e.message || e)); return; }
    numerosDaReserva(r, true);
    const uso = (st.usos[r.data] || {})[r.id] || {};
    st.aula = {
        reserva: r,
        registros: Array.isArray(uso.registros) ? uso.registros.slice() : [],
        sessao: uso.sessao || null,      // { codigo, expiraEmMs }
        ouvinte: null, timerGravar: null, defeitosVistos: new Set(), projetar: false, aviso: ''
    };
    // defeitos ja' tratados antes nao sao marcados de novo
    st.aula.registros.forEach(x => { if (x.tipo === 'defeito' && x.rid) st.aula.defeitosVistos.add(x.rid); });
    const aberta = st.aula.sessao && st.aula.sessao.expiraEmMs > Date.now();
    desenharPainelAula();
    if (aberta) ouvirSessao();
    else if (abrirLink) await eqAbrirLink();
}

function equipsDaAula() {
    const r = st.aula.reserva;
    const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
    const ids = (r.equipIds || []).concat(r.reservaTroca || []);
    return ids.filter(id => porId[id]).map(id => porId[id]);
}

async function eqAbrirLink() {
    const a = st.aula;
    if (!a) return;
    if (!temBanco() || !uidAtual()) { a.aviso = 'Para abrir o link é preciso estar conectado à internet e com a sessão ativa. Use "Lançar à mão".'; desenharPainelAula(); return; }
    const r = a.reserva;
    const fimMs = new Date(r.data + 'T' + r.fim + ':00').getTime();
    const expiraEmMs = Math.max(fimMs, Date.now()) + E().FOLGA_LINK_MIN * 60000;
    const total = Math.max(listaDaChamada(r.turmaId).length, 1);
    const equips = equipsDaAula().map(e => ({ id: e.id, rotulo: e.rotulo }));
    const Timestamp = window.firebase && firebase.firestore && firebase.firestore.Timestamp;
    let codigo = '';
    for (let t = 0; t < 6 && !codigo; t++) {
        const c = E().gerarCodigo();
        try {
            await sessaoRef(c).set({
                hostUid: uidAtual(), aberta: true, turma: r.turmaNome || 'Turma', horario: r.inicio + '–' + r.fim,
                total: Math.min(total, 80), equipamentos: equips,
                expiraEm: Timestamp ? Timestamp.fromMillis(expiraEmMs) : new Date(expiraEmMs),
                criadoEm: (window.firebase && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date()
            });
            codigo = c;
        } catch (e) {
            console.warn('[Equipamentos] código recusado:', e && e.code);
            if (e && e.code && e.code !== 'permission-denied') break;
        }
    }
    if (!codigo) {
        a.aviso = 'Não consegui abrir o link. Confira a internet. Se o sistema acabou de ser atualizado, o administrador precisa publicar as Regras novas do banco (firestore.rules). Enquanto isso, use o lançamento à mão abaixo.';
        desenharPainelAula();
        return;
    }
    a.sessao = { codigo, expiraEmMs };
    a.aviso = '';
    agendarGravacao();
    ouvirSessao();
    desenharPainelAula();
}

function ouvirSessao() {
    const a = st.aula;
    if (!a || !a.sessao || !temBanco()) return;
    if (a.ouvinte) { try { a.ouvinte(); } catch (_) {} }
    a.ouvinte = sessaoRef(a.sessao.codigo).collection('registros').onSnapshot(snap => {
        if (!st.aula || st.aula !== a) return;
        let mudou = false;
        const ja = new Set(a.registros.map(x => x.rid));
        snap.docs.forEach(d => {
            if (ja.has(d.id)) return;
            const x = d.data() || {};
            const em = x.em && typeof x.em.toMillis === 'function' ? x.em.toMillis() : Date.now();
            a.registros.push({ rid: d.id, num: parseInt(x.num, 10), equip: String(x.equip || ''), tipo: x.tipo || 'pegou',
                anterior: x.anterior ? String(x.anterior) : '', em, origem: 'aluno' });
            mudou = true;
        });
        if (mudou) { tratarDefeitos(); agendarGravacao(); desenharPainelAula(); }
    }, e => { console.warn('[Equipamentos] ouvinte:', e); });
}

// Estudante disse "não funciona": o equipamento vai para o cadastro como com defeito.
function tratarDefeitos() {
    const a = st.aula;
    if (!a) return;
    const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
    a.registros.filter(x => x.tipo === 'defeito' && x.anterior && !a.defeitosVistos.has(x.rid)).forEach(x => {
        a.defeitosVistos.add(x.rid);
        const eq = porId[x.anterior];
        if (!eq || !E().funciona(eq)) return;
        const quando = new Date(x.em || Date.now());
        const obs = 'Relatado na aula de ' + (a.reserva.turmaNome || 'turma') + ' (nº ' + x.num + ') em ' +
            quando.toLocaleDateString('pt-BR') + ' ' + E().horaLocal(quando);
        gravarCadastro(lista => {
            const i = lista.findIndex(e => e.id === x.anterior);
            if (i < 0 || !E().funciona(lista[i])) return null;
            const copia = lista.slice();
            copia[i] = Object.assign({}, copia[i], { situacao: 'defeito', defeito: { obs, em: Date.now(), por: meuNome() } });
            return copia;
        }).then(() => { if (st.aula === a) desenharPainelAula(); }).catch(e => console.warn('[Equipamentos] marcar defeito', e));
    });
}

function agendarGravacao() {
    const a = st.aula;
    if (!a) return;
    clearTimeout(a.timerGravar);
    a.timerGravar = setTimeout(() => gravarUso(a), 700);
}

async function gravarUso(a) {
    const r = a.reserva;
    try {
        const novo = await mudarDoc(idUso(r.data), d => {
            const usos = (d.usos && typeof d.usos === 'object') ? d.usos : {};
            const antes = (usos[r.id] && usos[r.id].registros) || [];
            // junta: o que esta' gravado (outro aparelho do mesmo professor) + o daqui
            const por = {};
            antes.concat(a.registros).forEach(x => { if (x && x.rid) por[x.rid] = x; });
            const registros = Object.keys(por).map(k => por[k]).sort((p, q) => (p.em || 0) - (q.em || 0)).slice(-600);
            usos[r.id] = { registros, sessao: a.sessao || null, atualizadoEm: Date.now() };
            return { usos, atualizadoEm: Date.now() };
        });
        if (novo) st.usos[r.data] = novo.usos;
        a.salvoEm = Date.now();
        a.erroGravar = '';
    } catch (e) {
        console.error('[Equipamentos] gravar uso', e);
        a.erroGravar = 'Não consegui salvar agora (' + (e && e.message || e) + '). Vou tentar de novo na próxima mudança.';
    }
    if (st.aula === a) atualizarRodapePainel();
}

function eqLancar(num, valor) {
    const a = st.aula;
    if (!a) return;
    const cons = E().consolidarUso(a.registros);
    const atual = (cons.find(c => c.num === num) || {}).equip || '';
    if (valor === atual) return;
    const reg = { rid: 'p' + E().novoId(''), num, equip: valor, tipo: valor ? (atual ? 'troca' : 'pegou') : 'devolveu', anterior: atual, em: Date.now(), origem: 'prof' };
    a.registros.push(reg);
    agendarGravacao();
    desenharPainelAula();
}

// O professor confirma que o equipamento anterior deu defeito (troca já lançada).
function eqLancarDefeito(num) {
    const a = st.aula;
    if (!a) return;
    const cons = E().consolidarUso(a.registros).find(c => c.num === num);
    if (!cons || !cons.equip) return;
    const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
    const livres = equipsDaAula().filter(e => E().funciona(e) && !E().consolidarUso(a.registros).some(c => c.equip === e.id));
    const sugestao = livres[0];
    const msg = 'Marcar ' + E().rotuloDe(cons.equip, porId) + ' com defeito' + (sugestao ? ' e trocar o nº ' + num + ' para ' + sugestao.rotulo + '?' : '? (não há outro livre na reserva)');
    if (!confirm(msg)) return;
    a.registros.push({ rid: 'p' + E().novoId(''), num, equip: sugestao ? sugestao.id : '', tipo: 'defeito', anterior: cons.equip, em: Date.now(), origem: 'prof' });
    tratarDefeitos();
    agendarGravacao();
    desenharPainelAula();
}

function eqProjetar() { if (st.aula) { st.aula.projetar = !st.aula.projetar; desenharPainelAula(); } }

async function eqEncerrarLink() {
    const a = st.aula;
    if (!a || !a.sessao) return;
    if (!confirm('Fechar o link? Os estudantes não conseguem mais informar. O que já chegou fica guardado.')) return;
    const codigo = a.sessao.codigo;
    if (a.ouvinte) { try { a.ouvinte(); } catch (_) {} a.ouvinte = null; }
    a.sessao = null;
    await gravarUso(a);
    apagarSessao(codigo);
    desenharPainelAula();
}

async function apagarSessao(codigo) {
    if (!temBanco() || !codigo) return;
    try {
        const ref = sessaoRef(codigo);
        const snap = await ref.collection('registros').get();
        const lote = db.batch();
        snap.docs.forEach(d => lote.delete(d.ref || ref.collection('registros').doc(d.id)));
        lote.delete(ref);
        await lote.commit();
    } catch (e) { console.warn('[Equipamentos] apagar sessão', e); }
}

function fecharPainelAula() {
    const a = st.aula;
    if (a) {
        if (a.ouvinte) { try { a.ouvinte(); } catch (_) {} }
        clearTimeout(a.timerGravar);
        clearInterval(a.relogio);
        if (a.timerGravar) gravarUso(a);
    }
    st.aula = null;
    const el = document.getElementById('eqAula');
    if (el) el.remove();
}
function eqFecharAula() { fecharPainelAula(); redesenhar(); atualizarInicio(); }

function desenharPainelAula() {
    const a = st.aula;
    if (!a) return;
    let el = document.getElementById('eqAula');
    if (!el) {
        el = document.createElement('div');
        el.id = 'eqAula';
        el.className = 'eq-aula';
        document.body.appendChild(el);
        if (!document.getElementById('eqEstiloGlobal')) {
            const s = document.createElement('div'); s.id = 'eqEstiloGlobal'; s.style.display = 'none'; s.innerHTML = ESTILO; document.body.appendChild(s);
        }
    }
    el.classList.toggle('eq-projetar', !!a.projetar);
    const r = a.reserva;
    const porId = {}; (st.cadastro || []).forEach(e => { porId[e.id] = e; });
    const lista = listaDaChamada(r.turmaId);
    const foto = numerosDaReserva(r, false);
    const total = Math.max(lista.length, foto && foto.mapa ? Object.keys(foto.mapa).length : 0);
    const cons = E().consolidarUso(a.registros);
    const porNum = {}; cons.forEach(c => { porNum[c.num] = c; });
    const conflitos = E().conflitosDeUso(cons);
    const emConflito = new Set(); conflitos.forEach(c => c.nums.forEach(n => emConflito.add(n)));
    const equips = equipsDaAula();
    const usados = new Set(cons.map(c => c.equip).filter(Boolean));
    const opcoes = (atual) => '<option value="">—</option>' + equips.map(e =>
        `<option value="${esc(e.id)}" ${e.id === atual ? 'selected' : ''}>${esc(e.rotulo)}${!E().funciona(e) ? ' (defeito)' : (usados.has(e.id) && e.id !== atual ? ' (em uso)' : '')}</option>`).join('')
        + (atual && !equips.some(e => e.id === atual) ? `<option value="${esc(atual)}" selected>${esc(E().rotuloDe(atual, porId))}</option>` : '');
    const nums = []; for (let n = 1; n <= Math.max(total, ...cons.map(c => c.num), 0); n++) nums.push(n);
    const linhas = nums.map(n => {
        const c = porNum[n];
        const nome = nomeDoNumero(r, n) || (lista[n - 1] ? lista[n - 1].nome_completo : '');
        return `<tr>
            <td><strong>${n}</strong></td>
            <td>${esc(nome || '—')}</td>
            <td><select aria-label="Equipamento do nº ${n}" onchange="eqLancar(${n}, this.value)">${opcoes(c ? c.equip : '')}</select></td>
            <td>${c ? c.trocas.map(t => `<span class="eq-tag ${t.defeito ? 'def' : 'tro'}">${t.defeito ? '🔧 ' : '🔁 '}${esc(E().rotuloDe(t.de, porId))} → ${esc(E().rotuloDe(t.para, porId) || '—')}</span>`).join('') : ''}
                ${c && c.origem === 'prof' ? '<span class="eq-tag prof">à mão</span>' : ''}
                ${emConflito.has(n) ? '<span class="eq-tag conf">mesmo equipamento de outro nº</span>' : ''}
                ${c && c.equip ? `<button class="btn btn-xs btn-secondary" style="padding:1px 6px; font-size:11px;" onclick="eqLancarDefeito(${n})" title="Este equipamento deu defeito">🔧</button>` : ''}</td>
        </tr>`;
    }).join('');
    const informaram = cons.filter(c => c.equip).length;
    const aberta = a.sessao && a.sessao.expiraEmMs > Date.now();
    const defeitosAula = E().defeitosRelatados(a.registros).map(id => E().rotuloDe(id, porId));
    el.innerHTML = `
        <div class="barra">
            <div><strong>${esc(r.turmaNome || 'Sem turma')} · ${esc(r.inicio)}–${esc(r.fim)}</strong>
                <div style="font-size:13px; color:#5f6b7f;">${esc(E().resumirIds(r.equipIds, st.cadastro))}${(r.reservaTroca || []).length ? ' · troca: ' + esc(E().resumirIds(r.reservaTroca, st.cadastro)) : ''}</div></div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" onclick="eqProjetar()">${a.projetar ? '✍️ Voltar a lançar' : '📽️ Tela para projetar'}</button>
                <button class="btn btn-sm btn-primary" onclick="eqFecharAula()">✔ Fechar</button>
            </div>
        </div>
        <div class="corpo">
            <div class="lado">
                ${aberta ? `
                    <div style="font-weight:700;">Abra no celular ou no equipamento:</div>
                    <div class="qr" id="eqQr"></div>
                    <div class="codigo">${esc(a.sessao.codigo)}</div>
                    <div class="link">${esc(linkDoAluno(a.sessao.codigo))}</div>
                    <p style="font-size:13px; color:#3d4759;">O estudante toca o número dele na chamada e o equipamento. Vale até <strong>${esc(E().horaLocal(new Date(a.sessao.expiraEmMs)))}</strong>.</p>
                    <button class="btn btn-sm btn-secondary" onclick="eqCopiarLink()">📋 Copiar link</button>
                    <button class="btn btn-sm btn-danger" style="margin-top:6px" onclick="eqEncerrarLink()">Fechar link</button>`
                : `<p style="font-size:14px; color:#3d4759;">Os estudantes podem informar sozinhos pelo link (QR code na lousa ou no projetor).</p>
                    <button class="btn btn-primary" onclick="eqAbrirLink()">📲 Abrir link para os alunos</button>`}
                ${a.aviso ? `<div class="eq-aviso" style="text-align:left;">${esc(a.aviso)}</div>` : ''}
            </div>
            <div class="tabela">
                <p class="eq-placar"><strong>${informaram}</strong> de ${total || '?'} com equipamento${defeitosAula.length ? ` · 🔧 defeito: ${defeitosAula.map(esc).join(', ')}` : ''}</p>
                ${total ? '' : '<div class="eq-aviso">Esta reserva não tem turma com estudantes. Os números aparecem conforme os estudantes informam.</div>'}
                <div style="overflow-x:auto;"><table class="eq-tab">
                    <thead><tr><th>Nº</th><th>Estudante</th><th>Equipamento</th><th>Trocas</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table></div>
                <div class="eq-legenda" id="eqRodapePainel"></div>
            </div>
        </div>`;
    atualizarRodapePainel();
    if (aberta) desenharQr(a.sessao.codigo);
    clearInterval(a.relogio);
    if (aberta) a.relogio = setInterval(() => { if (st.aula === a && !(a.sessao && a.sessao.expiraEmMs > Date.now())) { clearInterval(a.relogio); desenharPainelAula(); } }, 30000);
}

function atualizarRodapePainel() {
    const a = st.aula;
    const el = document.getElementById('eqRodapePainel');
    if (!a || !el) return;
    el.innerHTML = a.erroGravar ? `<span style="color:#b91c1c">${esc(a.erroGravar)}</span>`
        : (a.salvoEm ? 'Salvo às ' + E().horaLocal(new Date(a.salvoEm)) + '. ' : '') + 'O nome do estudante fica só no seu aparelho; o link e a nuvem guardam só o número.';
}

function eqCopiarLink() {
    const a = st.aula;
    if (!a || !a.sessao) return;
    const link = linkDoAluno(a.sessao.codigo);
    try { navigator.clipboard.writeText(link); alert('Link copiado.'); } catch (_) { prompt('Copie o link:', link); }
}

function desenharQr(codigo) {
    const alvo = document.getElementById('eqQr');
    if (!alvo) return;
    const pintar = () => {
        try { alvo.innerHTML = ''; new window.QRCode(alvo, { text: linkDoAluno(codigo), width: 220, height: 220 }); }
        catch (_) { alvo.innerHTML = ''; alvo.style.display = 'none'; }
    };
    if (window.QRCode) { pintar(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = pintar;
    s.onerror = () => { alvo.style.display = 'none'; };
    document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// No Inicio: embaixo da aula da turma, o que foi reservado para ela
// ---------------------------------------------------------------------------

// montarAgendaDoDiaHtml (app.js) deixa um <div class="agd-equip" data-eq-turma data-eq-ini
// data-eq-fim> embaixo de cada aula; aqui ele e' preenchido quando a agenda carrega.
async function equipPreencherAgendaDoDia(raiz) {
    raiz = raiz || document;
    const alvos = Array.from(raiz.querySelectorAll('.agd-equip[data-eq-turma]'));
    if (!alvos.length || !window.EQUIPOPS) return;
    const dia = hoje();
    try { await carregarCadastro(); await carregarReservas(E().mesDe(dia)); } catch (e) { return; }
    const eu = uidAtual();
    const doDia = reservasDoDia(dia).filter(r => r.profUid === eu);
    const temCadastro = (st.cadastro || []).length > 0;
    alvos.forEach(el => {
        const turma = el.getAttribute('data-eq-turma');
        const ini = el.getAttribute('data-eq-ini'), fim = el.getAttribute('data-eq-fim');
        const r = doDia.find(x => String(x.turmaId) === String(turma) && E().cruza(ini, fim, x.inicio, x.fim));
        el.classList.remove('eqd-vazia');
        if (r) {
            el.innerHTML = `<span class="eqd-txt">💻 ${esc(E().resumirIds(r.equipIds, st.cadastro))}${(r.reservaTroca || []).length ? ' <span style="color:#5f6b7f">(+' + r.reservaTroca.length + ' troca)</span>' : ''}${r.obs ? ' · ' + esc(r.obs) : ''}</span>
                <span class="eqd-bts"><button type="button" onclick="eqAbrirAula(${arg(r.id)}, true)">📲 Link alunos</button><button type="button" onclick="eqAbrirAula(${arg(r.id)}, false)">✍️ Lançar</button></span>`;
        } else if (temCadastro) {
            el.classList.add('eqd-vazia');
            el.innerHTML = `<a href="#" onclick="event.preventDefault(); eqReservarDoInicio(${arg(turma)}, '${esc(ini)}', '${esc(fim)}')">＋ reservar equipamento</a>`;
        } else el.innerHTML = '';
    });
}

function eqReservarDoInicio(turmaId, ini, fim) {
    st.dia = hoje();
    eqNovaReserva({ data: st.dia, inicio: ini, fim: fim, turmaId: turmaId });
}

function atualizarInicio() {
    const ag = document.getElementById('agendaHoje');
    if (ag) equipPreencherAgendaDoDia(ag);
}

// ---------------------------------------------------------------------------
// Navegacao
// ---------------------------------------------------------------------------

function redesenhar() { if (container() && container().style.display !== 'none') desenharVista(); else if (container()) desenharVista(); }
function eqVista(v) { st.vista = v; renderEquipamentos(); }
function eqIrDia(d) { if (/^\d{4}-\d{2}-\d{2}$/.test(d || '')) { st.dia = d; desenharVista(); } }
function eqMudarDia(delta) {
    const d = new Date(st.dia + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    eqIrDia(E().dataLocal(d));
}
async function eqRecarregar() {
    st.cadastro = null; st.reservas = {}; st.usos = {};
    await desenharVista();
}

function eqEstado() { return st; }

Object.assign(window, {
    renderEquipamentos, eqVista, eqIrDia, eqMudarDia, eqRecarregar,
    eqNovaReserva, eqEditarReserva, eqCampo, eqBloco, eqAlternarChip, eqFecharForm, eqSalvarReserva, eqCancelarReserva, eqAplicarTrocas,
    eqAdicionarLote, eqMarcarDefeito, eqMarcarConsertado, eqRenomear, eqExcluirEquip,
    eqImprimirRelatorio, eqBaixarCsv,
    eqAbrirAula, eqAbrirLink, eqLancar, eqLancarDefeito, eqProjetar, eqEncerrarLink, eqFecharAula, eqCopiarLink,
    equipPreencherAgendaDoDia, eqReservarDoInicio, eqEstado
});

})();
