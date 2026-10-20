// atelie.js — A ABA "ATELIÊ": o editor de artes da escola, dentro de Ferramentas.
//
// O QUE E'
//   Um editor de artes no navegador, feito para o que o professor faz toda semana:
//   certificado, comunicado aos responsaveis, cartaz de evento, convite, cracha, capa de
//   trabalho, slide, post de aviso. O professor parte de um modelo pronto, de uma folha em
//   branco ou de um pedido para a IA ("cartaz da feira de ciencias, dia 12/11 no patio"),
//   e mexe em tudo: texto (fonte, cor, contorno, sombra, destaque), formas, imagens (com
//   filtro, recorte redondo e "remover fundo"), figurinhas, fundo (cor, degrade, foto),
//   camadas, alinhamento com guias, desfazer/refazer. Sai em PNG, JPG, PDF ou impressao.
//
//   "Gerar em lote": a arte que usa {nome} vira um PDF com uma pagina por estudante —
//   os nomes vem colados ou direto de uma turma do professor.
//
// ONDE MORA CADA COISA
//   atelie_operacoes.js   as contas e o desenho (sem tela): modelos, quebra de texto,
//                         geometria das alcas, encaixe, historico, leitura da IA.
//   aqui                  a tela: a pagina inicial da aba e o editor em tela cheia.
//   IndexedDB             sisprof_atelie/artes — a copia no aparelho (cabe foto grande).
//   artes/<id>            a copia na conta (Firestore), com o dono. Arte com foto demais
//                         para 1 MB fica so' no aparelho, e a tela diz isso.
//   As imagens nao saem do aparelho para servico de terceiro nenhum: tudo e' desenhado
//   no <canvas> do proprio navegador.
//
// O PORTAO PREMIUM e' o mesmo das outras abas pagas: a pagina inicial (modelos, formatos)
// aparece para todos; abrir o editor, criar com IA e gerar em lote pedem o plano Professor.

(function () {
'use strict';

const A = () => window.ATELIEOPS;
const MARGEM = 56;                 // pixels de tela em volta da folha, para as alcas caberem
const MAX_LADO_IMAGEM = 1800;
const MAX_BYTES_NUVEM = 900 * 1024;
const COR_MARCA = '#e8590c';

let atArtes = null;            // lista das artes salvas (sem carregar as imagens de todas)
let atArte = null;             // a arte aberta no editor
let atSel = null;              // id do elemento selecionado
let atZoom = 1;
let atHist = null;
let atAba = 'modelos';
let atEditandoTexto = null;    // id do texto sendo digitado na propria folha
let atArrasto = null;
let atGuias = [];
let atPassando = null;         // elemento sob o mouse (contorno leve)
let atEstadoSalvo = '';        // 'salvando' | 'salvo' | 'local' | 'erro' | ''
let atTimerSalvar = null;
let atCategoria = 'Todos';
let atEscola = '';
let atAviso = '';
let atCopiado = null;
let atFontesProntas = false;
const atImagens = new Map();   // rid -> { img, pronta }
const atMiniModelos = {};      // id do modelo -> dataURL

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function $(id) { return document.getElementById(id); }

function uidAtual() {
    try {
        const u = window.firebase && firebase.auth && firebase.auth().currentUser;
        if (u && u.uid) return u.uid;
    } catch (_) { /* sem auth */ }
    return (typeof currentUser !== 'undefined' && currentUser && (currentUser.uid || currentUser.id)) ? String(currentUser.uid || currentUser.id) : '';
}
function temBanco() { return typeof db !== 'undefined' && !!db; }

function atPodeUsar(nome) {
    if (typeof exigirPremium !== 'function') return true;
    return exigirPremium('Ferramentas — Ateliê (' + nome + ')');
}
function atEhPremium() { return (typeof ehPremium === 'function') ? ehPremium() : true; }
function atSeloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}
function atIconeMarca() {
    return window.iconeSisProf ? iconeSisProf('atelie', 'ico-texto') : '🖌️ ';
}

// ---------------------------------------------------------------------------
// Guardar e carregar (aparelho + conta)
// ---------------------------------------------------------------------------

let idbPromessa = null;
function abrirIdb() {
    if (idbPromessa) return idbPromessa;
    idbPromessa = new Promise((ok, falha) => {
        if (!window.indexedDB) { falha(new Error('sem IndexedDB')); return; }
        const r = indexedDB.open('sisprof_atelie', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('artes', { keyPath: 'id' }); };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => falha(r.error);
    });
    idbPromessa.catch(() => { idbPromessa = null; });
    return idbPromessa;
}
async function idb(modo, fn) {
    const banco = await abrirIdb();
    return new Promise((ok, falha) => {
        const t = banco.transaction('artes', modo);
        const req = fn(t.objectStore('artes'));
        t.oncomplete = () => ok(req && req.result);
        t.onerror = () => falha(t.error);
        t.onabort = () => falha(t.error);
    });
}
async function lerLocais() {
    try {
        const todas = await idb('readonly', s => s.getAll());
        const dono = uidAtual() || 'anon';
        return (todas || []).filter(r => r.dono === dono).map(r => r.arte);
    } catch (e) { console.warn('[Ateliê] nao li as artes do aparelho:', e); return []; }
}
async function gravarLocal(arte) {
    await idb('readwrite', s => s.put({ id: arte.id, dono: uidAtual() || 'anon', arte }));
}
async function apagarLocal(id) {
    try { await idb('readwrite', s => s.delete(id)); } catch (e) { console.warn('[Ateliê] exclusao no aparelho falhou:', e); }
}

async function carregarArtes() {
    let lista = (await lerLocais()).map(a => A().normalizarArte(a));
    const uid = uidAtual();
    if (temBanco() && uid) {
        try {
            const snap = await db.collection('artes').where('donoUid', '==', uid).get();
            const mapa = {};
            lista.forEach(a => { mapa[a.id] = a; });
            for (const d of snap.docs) {
                const nuvem = A().normalizarArte(Object.assign({}, d.data(), { id: d.id }));
                if (!mapa[nuvem.id] || nuvem.atualizadoEm > mapa[nuvem.id].atualizadoEm) {
                    mapa[nuvem.id] = nuvem;
                    try { await gravarLocal(nuvem); } catch (_) { /* fica so' na memoria */ }
                }
            }
            lista = Object.values(mapa);
        } catch (e) {
            console.warn('[Ateliê] nao li as artes da conta, usando as do aparelho:', e);
        }
    }
    atArtes = lista.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
    return atArtes;
}

// Salva no aparelho e na conta. Devolve 'nuvem', 'local' (grande demais ou sem rede) ou
// lanca erro se nem no aparelho coube.
async function salvarArte(arte) {
    A().podarRecursos(arte);
    arte.atualizadoEm = Date.now();
    try { arte.miniatura = await miniatura(arte, 360); } catch (_) { /* fica a antiga */ }
    let noAparelho = false;
    try { await gravarLocal(arte); noAparelho = true; } catch (e) { console.warn('[Ateliê] nao salvei no aparelho:', e); }
    let onde = noAparelho ? 'local' : '';
    const uid = uidAtual();
    if (temBanco() && uid) {
        const doc = Object.assign({}, arte, { donoUid: uid });
        if (JSON.stringify(doc).length <= MAX_BYTES_NUVEM) {
            try { await db.collection('artes').doc(arte.id).set(doc); onde = 'nuvem'; } catch (e) { console.warn('[Ateliê] salvo so no aparelho:', e); }
        }
    }
    if (!onde) throw new Error('Não consegui salvar a arte nem neste aparelho.');
    const lista = (atArtes || []).filter(a => a.id !== arte.id);
    lista.unshift(A().copiar(arte));
    atArtes = lista;
    return onde;
}

async function excluirArte(id) {
    atArtes = (atArtes || []).filter(a => a.id !== id);
    await apagarLocal(id);
    if (temBanco()) { try { await db.collection('artes').doc(id).delete(); } catch (e) { console.warn('[Ateliê] exclusao na conta falhou:', e); } }
}

// ---------------------------------------------------------------------------
// Fontes, imagens e campos automaticos
// ---------------------------------------------------------------------------

function carregarFontes() {
    if (atFontesProntas || typeof document === 'undefined') return;
    atFontesProntas = true;
    if (!document.getElementById('atFontes')) {
        const familias = A().FONTES.filter(f => f.google).map(f => 'family=' + f.google).join('&');
        const link = document.createElement('link');
        link.id = 'atFontes'; link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?' + familias + '&display=swap';
        document.head.appendChild(link);
    }
    if (!document.fonts || !document.fonts.load) return;
    const pedidos = [];
    A().FONTES.filter(f => f.google).forEach(f => {
        pedidos.push(document.fonts.load('400 40px "' + f.nome + '"').catch(() => null));
        pedidos.push(document.fonts.load('700 40px "' + f.nome + '"').catch(() => null));
    });
    Promise.all(pedidos).then(() => {
        Object.keys(atMiniModelos).forEach(k => delete atMiniModelos[k]);
        if (atArte) { ajustarTodosTextos(); pedirDesenho(); }
        else if (container() && container().querySelector('.at-modelos')) desenharModelosInicio();
    });
}

function obterImagem(rid) {
    if (!rid || !atArte) return null;
    const src = atArte.recursos[rid];
    if (!src) return null;
    let item = atImagens.get(rid);
    if (!item || item.src !== src) {
        const img = new Image();
        item = { img, pronta: false, src };
        img.onload = () => { item.pronta = true; pedirDesenho(); };
        img.src = src;
        atImagens.set(rid, item);
    }
    return item.pronta ? item.img : null;
}

// Para exportar: espera todas as imagens da arte (de qualquer arte, nao so' a aberta).
async function imagensDaArte(arte) {
    const mapa = {};
    const usados = new Set();
    arte.elementos.forEach(e => { if (e.tipo === 'imagem' && e.recurso) usados.add(e.recurso); });
    if (arte.fundo.tipo === 'imagem' && arte.fundo.recurso) usados.add(arte.fundo.recurso);
    await Promise.all(Array.from(usados).map(rid => new Promise(ok => {
        const src = arte.recursos[rid];
        if (!src) { ok(); return; }
        const img = new Image();
        img.onload = () => { mapa[rid] = img; ok(); };
        img.onerror = () => ok();
        img.src = src;
    })));
    return rid => mapa[rid] || null;
}

async function esperarFontesDaArte(arte) {
    if (!document.fonts || !document.fonts.load) return;
    const pedidos = new Set();
    arte.elementos.forEach(e => { if (e.tipo === 'texto') pedidos.add(A().fonteCss(e, 40)); });
    await Promise.all(Array.from(pedidos).map(f => document.fonts.load(f).catch(() => null)));
}

function hojeLongo() {
    try { return new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (_) { return new Date().toLocaleDateString(); }
}
function subsAtuais(extra) {
    const nomeProf = (typeof currentUser !== 'undefined' && currentUser && currentUser.nome) ? currentUser.nome : '';
    return Object.assign({ escola: atEscola, professor: nomeProf, data: hojeLongo(), ano: String(new Date().getFullYear()) }, extra || {});
}
async function descobrirEscola() {
    if (atEscola) return atEscola;
    try {
        if (typeof resolverEscolaAtual === 'function') {
            const e = await resolverEscolaAtual();
            if (e && e.nome) atEscola = e.nome;
        }
    } catch (_) { /* sem escola */ }
    if (!atEscola) {
        const h = document.querySelector('#appContainer h1');
        const m = h && /SisProf\s*-\s*(.+)$/.exec(h.textContent.trim());
        if (m && m[1] && m[1].trim() !== 'Escola') atEscola = m[1].trim();
    }
    return atEscola;
}

let ctxMedida = null;
function medidor() {
    if (!ctxMedida) ctxMedida = document.createElement('canvas').getContext('2d');
    return ctxMedida;
}
function ajustarTexto(el) { A().ajustarAlturaTexto(medidor(), el, subsAtuais()); }
function ajustarTodosTextos(arte) {
    (arte || atArte).elementos.forEach(e => { if (e.tipo === 'texto') ajustarTexto(e); });
}

// ---------------------------------------------------------------------------
// Desenhar a arte num canvas (miniatura, exportacao, lote)
// ---------------------------------------------------------------------------

async function renderizar(arte, escala, subs) {
    await esperarFontesDaArte(arte);
    const imagem = await imagensDaArte(arte);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(arte.largura * escala));
    c.height = Math.max(1, Math.round(arte.altura * escala));
    const ctx = c.getContext('2d');
    ctx.scale(escala, escala);
    A().desenharArte(ctx, arte, { imagem, subs: subs || subsAtuais() });
    return c;
}

async function miniatura(arte, largura) {
    const c = await renderizar(arte, largura / arte.largura);
    return c.toDataURL('image/jpeg', 0.72);
}

// Miniatura de modelo: sincrona (sem imagem), refeita quando as fontes chegam.
function miniaturaModelo(id) {
    if (atMiniModelos[id]) return atMiniModelos[id];
    const arte = A().aplicarModelo(id);
    ajustarTodosTextos(arte);
    const largura = 300, escala = largura / arte.largura;
    const c = document.createElement('canvas');
    c.width = largura; c.height = Math.round(arte.altura * escala);
    const ctx = c.getContext('2d');
    ctx.scale(escala, escala);
    A().desenharArte(ctx, arte, { subs: subsAtuais({ escola: atEscola || 'Nome da escola' }) });
    atMiniModelos[id] = c.toDataURL('image/png');
    return atMiniModelos[id];
}

// ---------------------------------------------------------------------------
// A pagina inicial da aba
// ---------------------------------------------------------------------------

function container() { return document.getElementById('tabFerramentasAtelie'); }

const ESTILO_INICIO = `
<style>
  #tabFerramentasAtelie .at-topo { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:16px 0 12px; }
  #tabFerramentasAtelie .at-marca { font-size:26px; font-weight:800; letter-spacing:-0.5px; color:#1c2536; }
  #tabFerramentasAtelie .at-marca span { color:${COR_MARCA}; }
  #tabFerramentasAtelie .at-sec { margin:22px 0 10px; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  #tabFerramentasAtelie .at-sec h3 { margin:0; font-size:17px; color:#1c2536; }
  #tabFerramentasAtelie .at-sec small { color:#5f6b7f; }
  #tabFerramentasAtelie .at-ia { background:linear-gradient(120deg,#fff4e6,#edf3fd); border:1px solid #e3e8ef; border-radius:14px; padding:16px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; }
  #tabFerramentasAtelie .at-ia textarea { flex:1; min-width:240px; min-height:62px; padding:10px; border:1px solid #cdd5e1; border-radius:10px; font:inherit; font-size:14px; resize:vertical; box-sizing:border-box; }
  #tabFerramentasAtelie .at-formatos { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; }
  #tabFerramentasAtelie .at-formato { flex:none; width:118px; background:#fff; border:1px solid #e3e8ef; border-radius:12px; padding:10px; cursor:pointer; text-align:center; font-size:12px; color:#1c2536; }
  #tabFerramentasAtelie .at-formato:hover, #tabFerramentasAtelie .at-modelo:hover, #tabFerramentasAtelie .at-arte:hover { border-color:${COR_MARCA}; box-shadow:0 4px 14px rgba(232,89,12,0.12); }
  #tabFerramentasAtelie .at-formato .cx { height:64px; display:flex; align-items:center; justify-content:center; margin-bottom:6px; }
  #tabFerramentasAtelie .at-formato .cx i { display:block; background:#edf3fd; border:2px solid #2563c9; border-radius:4px; }
  #tabFerramentasAtelie .at-formato small { color:#5f6b7f; display:block; }
  #tabFerramentasAtelie .at-chips { display:flex; gap:6px; flex-wrap:wrap; }
  #tabFerramentasAtelie .at-chip { border:1px solid #cdd5e1; background:#fff; border-radius:999px; padding:4px 12px; font-size:13px; cursor:pointer; color:#1c2536; }
  #tabFerramentasAtelie .at-chip.on { background:#1c2536; color:#fff; border-color:#1c2536; }
  #tabFerramentasAtelie .at-grade { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:12px; }
  #tabFerramentasAtelie .at-modelo, #tabFerramentasAtelie .at-arte { background:#fff; border:1px solid #e3e8ef; border-radius:12px; padding:10px; cursor:pointer; display:flex; flex-direction:column; gap:6px; }
  #tabFerramentasAtelie .at-mini { background:#f6f8fb; border-radius:8px; height:150px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  #tabFerramentasAtelie .at-mini img { max-width:100%; max-height:150px; box-shadow:0 2px 8px rgba(28,37,54,0.16); }
  #tabFerramentasAtelie .at-nome { font-size:14px; font-weight:700; color:#1c2536; }
  #tabFerramentasAtelie .at-meta { font-size:12px; color:#5f6b7f; }
  #tabFerramentasAtelie .at-botoes { display:flex; gap:6px; flex-wrap:wrap; }
  #tabFerramentasAtelie .at-aviso { background:#fffbeb; border:1px solid #f6ad55; color:#7b341e; border-radius:8px; padding:10px 12px; font-size:13px; margin:10px 0; }
  #tabFerramentasAtelie .at-ok { background:#f0fdf4; border:1px solid #86efac; color:#14532d; border-radius:8px; padding:10px 12px; font-size:13px; margin:10px 0; }
</style>`;

function renderAtelie() {
    const el = container();
    if (!el) return;
    if (!A()) {
        el.innerHTML = '<div class="card" style="margin:20px 0;">O Ateliê não carregou. Recarregue a página; se continuar assim, avise o suporte.</div>';
        return;
    }
    carregarFontes();
    desenharInicio();
    if (atArtes === null) carregarArtes().then(desenharInicio);
    if (!atEscola) descobrirEscola().then(n => { if (n) { Object.keys(atMiniModelos).forEach(k => delete atMiniModelos[k]); desenharModelosInicio(); } });
}

function desenharInicio() {
    const el = container();
    if (!el || !A()) return;
    const premium = atEhPremium();
    const pro = premium ? '' : atSeloPro();
    const categorias = ['Todos'].concat(Array.from(new Set(A().MODELOS.map(m => m.categoria))));
    el.innerHTML = ESTILO_INICIO + `
        <div class="at-topo">
            <div class="at-marca">${atIconeMarca()}Ate<span>liê</span></div>
            <div style="color:#5f6b7f; font-size:14px; flex:1; min-width:220px;">Crie cartazes, certificados, convites, avisos e slides com a cara da sua escola. Tudo é desenhado aqui no navegador.</div>
        </div>
        ${premium ? '' : `<div class="at-aviso">Abrir o editor, criar com IA e gerar em lote fazem parte do plano Professor ${atSeloPro()}.</div>`}
        ${atAviso ? `<div class="at-ok">${esc(atAviso)}</div>` : ''}
        <div class="at-ia">
            <div style="flex-basis:100%; font-weight:700; color:#1c2536;">✨ Descreva a arte e a IA monta para você ${pro}</div>
            <textarea id="atPedidoIA" placeholder="Ex.: cartaz da feira de ciências do 7º ano, dia 12/11 às 14h, no pátio"></textarea>
            <button class="btn btn-primary" id="atBtnIA" onclick="atCriarIA()">Criar com IA</button>
            <div id="atMsgIA" style="flex-basis:100%; font-size:13px; color:#5f6b7f;"></div>
        </div>

        <div class="at-sec"><h3>Começar do zero</h3><small>escolha o tamanho da folha</small></div>
        <div class="at-formatos">
            ${A().FORMATOS.map(f => {
                const lado = 56, k = lado / Math.max(f.largura, f.altura);
                return `<div class="at-formato" onclick="atNovo('${f.id}')" title="${esc(f.nome)}">
                    <div class="cx"><i style="width:${Math.round(f.largura * k)}px; height:${Math.round(f.altura * k)}px;"></i></div>
                    ${esc(f.nome)}<small>${f.mm ? f.mm[0] + '×' + f.mm[1] + ' mm' : f.largura + '×' + f.altura + ' px'}</small></div>`;
            }).join('')}
            <div class="at-formato" onclick="atNovoPersonalizado()">
                <div class="cx" style="font-size:28px; color:#5f6b7f;">↔</div>Personalizado<small>você escolhe</small></div>
        </div>

        <div class="at-sec"><h3>Modelos para a escola</h3>
            <div class="at-chips">${categorias.map(c => `<button class="at-chip ${c === atCategoria ? 'on' : ''}" onclick="atFiltrarModelos('${esc(c)}')">${esc(c)}</button>`).join('')}</div>
        </div>
        <div class="at-grade at-modelos" id="atGradeModelos"></div>

        <div class="at-sec"><h3>Minhas artes</h3></div>
        ${atArtes === null ? '<p class="empty-state">Carregando suas artes...</p>' : (atArtes.length ? `
        <div class="at-grade">
            ${atArtes.map(a => `
                <div class="at-arte">
                    <div class="at-mini" onclick="atAbrir('${esc(a.id)}')">${a.miniatura ? `<img src="${esc(a.miniatura)}" alt="">` : '<span style="color:#8a94a6;">sem prévia</span>'}</div>
                    <div class="at-nome">${esc(a.titulo || 'Sem título')}</div>
                    <div class="at-meta">${esc((A().formato(a.formato) || { nome: a.largura + '×' + a.altura }).nome)} · ${new Date(a.atualizadoEm).toLocaleDateString('pt-BR')}</div>
                    <div class="at-botoes">
                        <button class="btn btn-secondary" onclick="atAbrir('${esc(a.id)}')">✏️ Editar</button>
                        <button class="btn btn-secondary" onclick="atDuplicarArte('${esc(a.id)}')" title="Duplicar">📄</button>
                        <button class="btn btn-danger" onclick="atExcluirArte('${esc(a.id)}')" title="Excluir">🗑️</button>
                    </div>
                </div>`).join('')}
        </div>` : `
        <div class="card" style="text-align:center; padding:26px;">
            <p style="font-size:15px; margin-top:0;">Você ainda não tem artes.</p>
            <p style="font-size:13px; color:#5f6b7f; margin-bottom:0;">Comece por um modelo acima, por uma folha em branco, ou peça para a IA.</p>
        </div>`)}
        <p style="font-size:12px; color:#5f6b7f; margin-top:18px;">As fotos que você coloca ficam neste aparelho e na sua conta; nada é enviado para sites de terceiros. Dica: no editor, cole uma imagem com Ctrl+V ou arraste o arquivo para a folha.</p>`;
    desenharModelosInicio();
}

function desenharModelosInicio() {
    const grade = $('atGradeModelos');
    if (!grade || !A()) return;
    const lista = A().MODELOS.filter(m => atCategoria === 'Todos' || m.categoria === atCategoria);
    grade.innerHTML = lista.map(m => `
        <div class="at-modelo" onclick="atModelo('${m.id}')" title="${esc(m.descricao)}">
            <div class="at-mini"><img src="${miniaturaModelo(m.id)}" alt=""></div>
            <div class="at-nome">${esc(m.nome)}</div>
            <div class="at-meta">${esc(m.categoria)} · ${esc((A().formato(m.formato) || {}).nome || '')}</div>
        </div>`).join('');
}

function atFiltrarModelos(c) {
    atCategoria = c;
    document.querySelectorAll('#tabFerramentasAtelie .at-chip').forEach(b => b.classList.toggle('on', b.textContent === c));
    desenharModelosInicio();
}

// ---------------------------------------------------------------------------
// Entrar no editor
// ---------------------------------------------------------------------------

function atNovo(formatoId) {
    if (!atPodeUsar('nova arte')) return;
    abrirEditor(A().novaArte(formatoId));
}

function atNovoPersonalizado() {
    if (!atPodeUsar('nova arte')) return;
    const r = prompt('Tamanho da arte em pixels, largura x altura (ex.: 1200x800):', '1200x800');
    if (!r) return;
    const m = /(\d{2,5})\s*[x×*,; ]\s*(\d{2,5})/i.exec(r);
    if (!m) { alert('Não entendi o tamanho. Use o formato 1200x800.'); return; }
    abrirEditor(A().novaArte('livre', { largura: +m[1], altura: +m[2] }));
}

function atModelo(id) {
    if (!atPodeUsar('modelo')) return;
    const arte = A().aplicarModelo(id);
    if (arte) abrirEditor(arte);
}

async function atAbrir(id) {
    if (!atPodeUsar('editar arte')) return;
    const a = (atArtes || []).find(x => x.id === id);
    if (a) abrirEditor(A().normalizarArte(A().copiar(a)), true);
}

async function atDuplicarArte(id) {
    if (!atPodeUsar('duplicar arte')) return;
    const a = (atArtes || []).find(x => x.id === id);
    if (!a) return;
    const c = A().normalizarArte(A().copiar(a));
    c.id = A().novoId('arte'); c.titulo = (a.titulo || 'Arte') + ' (cópia)'; c.criadoEm = Date.now();
    try { await salvarArte(c); } catch (e) { alert(e.message); }
    desenharInicio();
}

async function atExcluirArte(id) {
    const a = (atArtes || []).find(x => x.id === id);
    if (!a || !confirm('Excluir a arte "' + (a.titulo || 'Sem título') + '"? Não dá para desfazer.')) return;
    await excluirArte(id);
    desenharInicio();
}

async function atCriarIA() {
    if (!atPodeUsar('criar com IA')) return;
    const pedido = (($('atPedidoIA') || {}).value || '').trim();
    const msg = $('atMsgIA'), btn = $('atBtnIA');
    if (!pedido) { msg.innerHTML = '<span style="color:#b91c1c;">Escreva o que você quer: tipo de arte, tema, data, local.</span>'; return; }
    if (typeof chamarIAEstruturada !== 'function') { msg.innerHTML = '<span style="color:#b91c1c;">O assistente de IA não carregou. Recarregue a página.</span>'; return; }
    btn.disabled = true;
    msg.textContent = 'A IA está montando a arte... ⏳';
    try {
        await descobrirEscola();
        const resposta = await chamarIAEstruturada(A().promptCriarComIA(pedido, { escola: atEscola }), null);
        const arte = A().arteDaIA(resposta);
        if (!arte) throw new Error('A IA não devolveu uma arte que eu conseguisse usar. Tente de novo, com mais detalhes.');
        abrirEditor(arte);
        avisoEditor('A IA montou a arte. Confira os textos (datas e locais principalmente) e ajuste o que quiser.');
    } catch (e) {
        msg.innerHTML = '<span style="color:#b91c1c;">' + esc(e.message || String(e)) + '</span>';
    } finally {
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// O editor (tela cheia)
// ---------------------------------------------------------------------------

const ESTILO_EDITOR = `
<style>
  #atEditor { position:fixed; inset:0; z-index:8000; background:#eef1f6; display:grid; grid-template-rows:auto 1fr; font-family:inherit; color:#1c2536; }
  #atEditor * { box-sizing:border-box; }
  #atEditor button { font-family:inherit; }
  #atEditor .ed-barra { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#fff; border-bottom:1px solid #e3e8ef; flex-wrap:wrap; }
  #atEditor .ed-marca { font-weight:800; font-size:18px; letter-spacing:-0.3px; display:flex; align-items:center; gap:4px; }
  #atEditor .ed-marca span { color:${COR_MARCA}; }
  #atEditor .ed-titulo { border:1px solid transparent; border-radius:8px; padding:6px 8px; font:inherit; font-size:15px; font-weight:600; min-width:120px; width:min(320px, 30vw); color:#1c2536; background:transparent; }
  #atEditor .ed-titulo:hover, #atEditor .ed-titulo:focus { border-color:#cdd5e1; background:#fff; outline:none; }
  #atEditor .ed-b { background:#fff; border:1px solid #d5dce6; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:14px; color:#1c2536; display:inline-flex; align-items:center; gap:5px; line-height:1.2; }
  #atEditor .ed-b:hover { background:#f6f8fb; }
  #atEditor .ed-b:disabled { opacity:0.4; cursor:default; }
  #atEditor .ed-b.on { background:#1c2536; color:#fff; border-color:#1c2536; }
  #atEditor .ed-b.pri { background:${COR_MARCA}; color:#fff; border-color:${COR_MARCA}; font-weight:700; }
  #atEditor .ed-b.pri:hover { filter:brightness(1.06); }
  #atEditor .ed-esp { flex:1; }
  #atEditor .ed-status { font-size:12px; color:#5f6b7f; min-width:90px; }
  #atEditor .ed-corpo { display:grid; grid-template-columns:76px 300px 1fr 280px; min-height:0; }
  #atEditor .ed-trilho { background:#1c2536; display:flex; flex-direction:column; gap:2px; padding:8px 6px; overflow-y:auto; }
  #atEditor .ed-trilho button { background:transparent; border:none; color:#c3cad6; border-radius:10px; padding:8px 2px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; font-size:11px; }
  #atEditor .ed-trilho button svg { width:24px; height:24px; }
  #atEditor .ed-trilho button:hover { background:rgba(255,255,255,0.08); color:#fff; }
  #atEditor .ed-trilho button.on { background:rgba(255,255,255,0.14); color:#fff; }
  #atEditor .ed-trilho button.on svg { color:#ffa94d; }
  #atEditor .ed-painel, #atEditor .ed-props { background:#fff; overflow-y:auto; padding:14px; min-height:0; }
  #atEditor .ed-painel { border-right:1px solid #e3e8ef; }
  #atEditor .ed-props { border-left:1px solid #e3e8ef; }
  #atEditor h4 { margin:0 0 10px; font-size:14px; }
  #atEditor h5 { margin:16px 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:0.6px; color:#5f6b7f; }
  #atEditor .ed-palco { overflow:auto; position:relative; min-height:0; background-color:#eef1f6; background-image:radial-gradient(#d5dce6 1px, transparent 1px); background-size:18px 18px; }
  #atEditor .ed-palco-in { position:relative; margin:0 auto; }
  #atEditor canvas#atCanvas { display:block; touch-action:none; }
  #atEditor .ed-zoom { position:absolute; right:12px; bottom:12px; display:flex; gap:4px; align-items:center; background:#fff; border:1px solid #d5dce6; border-radius:10px; padding:4px; box-shadow:0 2px 8px rgba(28,37,54,0.1); }
  #atEditor .ed-zoom .ed-b { padding:4px 8px; border:none; }
  #atEditor .ed-grade { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
  #atEditor .ed-grade.g4 { grid-template-columns:repeat(4, 1fr); }
  #atEditor .ed-cel { border:1px solid #e3e8ef; border-radius:10px; background:#fff; cursor:pointer; padding:6px; display:flex; flex-direction:column; align-items:center; gap:4px; font-size:11px; color:#5f6b7f; }
  #atEditor .ed-cel:hover { border-color:${COR_MARCA}; }
  #atEditor .ed-cel img { max-width:100%; max-height:110px; }
  #atEditor .ed-fig { font-size:28px; border:none; background:#f6f8fb; border-radius:10px; padding:6px 0; cursor:pointer; }
  #atEditor .ed-fig:hover { background:#ffe8cc; }
  #atEditor .ed-txt-preset { display:block; width:100%; text-align:left; border:1px solid #e3e8ef; border-radius:10px; background:#fff; padding:10px 12px; margin-bottom:8px; cursor:pointer; color:#1c2536; }
  #atEditor .ed-txt-preset:hover { border-color:${COR_MARCA}; }
  #atEditor .ed-linha { display:flex; align-items:center; gap:8px; margin:8px 0; flex-wrap:wrap; }
  #atEditor .ed-linha label { font-size:13px; color:#3b4659; min-width:74px; }
  #atEditor .ed-linha input[type=range] { flex:1; min-width:90px; accent-color:${COR_MARCA}; }
  #atEditor .ed-linha input[type=number], #atEditor select, #atEditor .ed-campo { padding:6px 8px; border:1px solid #cdd5e1; border-radius:8px; font:inherit; font-size:13px; background:#fff; color:#1c2536; }
  #atEditor .ed-linha input[type=number] { width:72px; }
  #atEditor textarea.ed-campo { width:100%; min-height:70px; resize:vertical; }
  #atEditor .ed-cores { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
  #atEditor .ed-cor { width:24px; height:24px; border-radius:6px; border:1px solid rgba(0,0,0,0.15); cursor:pointer; padding:0; }
  #atEditor .ed-cor.sel { outline:2px solid ${COR_MARCA}; outline-offset:1px; }
  #atEditor .ed-cor.vazia { background:linear-gradient(135deg,#fff 45%,#e03131 45%,#e03131 55%,#fff 55%); }
  #atEditor input[type=color] { width:30px; height:26px; border:1px solid #cdd5e1; border-radius:6px; padding:0 2px; background:#fff; cursor:pointer; }
  #atEditor .ed-grupo { display:inline-flex; border:1px solid #d5dce6; border-radius:8px; overflow:hidden; }
  #atEditor .ed-grupo .ed-b { border:none; border-radius:0; border-right:1px solid #e3e8ef; }
  #atEditor .ed-grupo .ed-b:last-child { border-right:none; }
  #atEditor .ed-camada { display:flex; align-items:center; gap:6px; padding:7px 8px; border:1px solid #e3e8ef; border-radius:8px; margin-bottom:6px; cursor:pointer; font-size:13px; }
  #atEditor .ed-camada.sel { border-color:${COR_MARCA}; background:#fff4e6; }
  #atEditor .ed-camada .nm { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #atEditor .ed-camada button { background:none; border:none; cursor:pointer; padding:2px 4px; font-size:13px; opacity:0.75; }
  #atEditor .ed-camada button:hover { opacity:1; }
  #atEditor .ed-dica { font-size:12px; color:#5f6b7f; line-height:1.45; }
  #atEditor .ed-ok { background:#f0fdf4; border:1px solid #86efac; color:#14532d; border-radius:8px; padding:8px 10px; font-size:13px; margin-bottom:10px; }
  #atEditor .ed-erro { color:#b91c1c; font-size:13px; }
  #atEditor .ed-paleta { display:flex; align-items:center; gap:8px; width:100%; border:1px solid #e3e8ef; border-radius:10px; background:#fff; padding:7px 9px; margin-bottom:6px; cursor:pointer; font-size:13px; color:#1c2536; }
  #atEditor .ed-paleta.on { border-color:${COR_MARCA}; background:#fff4e6; }
  #atEditor .ed-paleta i { display:inline-block; width:16px; height:16px; border-radius:4px; margin-right:-4px; border:1px solid rgba(0,0,0,0.1); }
  #atEditor .ed-menu { position:fixed; background:#fff; border:1px solid #d5dce6; border-radius:10px; box-shadow:0 10px 30px rgba(28,37,54,0.18); padding:6px; z-index:5; min-width:220px; }
  #atEditor .ed-menu button { display:flex; width:100%; gap:8px; align-items:center; text-align:left; background:none; border:none; padding:9px 10px; border-radius:8px; cursor:pointer; font-size:14px; color:#1c2536; }
  #atEditor .ed-menu button:hover { background:#f6f8fb; }
  #atEditor .ed-menu small { color:#5f6b7f; display:block; font-size:11px; }
  #atEditor textarea.ed-na-folha { position:absolute; margin:0; border:1.5px dashed ${COR_MARCA}; background:rgba(255,255,255,0.0); outline:none; resize:none; overflow:hidden; white-space:pre-wrap; word-wrap:break-word; transform-origin:center center; z-index:3; }
  #atJanela { position:fixed; inset:0; z-index:8500; background:rgba(28,37,54,0.45); display:flex; align-items:center; justify-content:center; padding:16px; }
  #atJanela .jn { background:#fff; border-radius:14px; max-width:560px; width:100%; max-height:90vh; overflow:auto; padding:20px; color:#1c2536; }
  #atJanela textarea, #atJanela select { width:100%; padding:8px; border:1px solid #cdd5e1; border-radius:8px; font:inherit; font-size:14px; box-sizing:border-box; }
  @media (max-width: 1100px) {
    #atEditor .ed-corpo { grid-template-columns:68px 270px 1fr; }
    #atEditor .ed-props { display:none; }
  }
  @media (max-width: 760px) {
    #atEditor .ed-corpo { grid-template-columns:1fr; grid-template-rows:1fr auto auto; }
    #atEditor .ed-palco { grid-row:1; }
    #atEditor .ed-painel { grid-row:2; max-height:42vh; border-right:none; border-top:1px solid #e3e8ef; }
    #atEditor .ed-painel.fechado { display:none; }
    #atEditor .ed-trilho { grid-row:3; flex-direction:row; overflow-x:auto; padding:4px; }
    #atEditor .ed-trilho button { flex:1; min-width:56px; }
    #atEditor .ed-barra { flex-wrap:nowrap; overflow-x:auto; gap:6px; padding:6px 8px; }
    #atEditor .ed-titulo { width:auto; min-width:0; flex:1; }
    #atEditor .ed-esp, #atEditor .ed-status, #atEditor .ed-rot { display:none; }
    #atEditor .ed-b { padding:6px 8px; flex:none; }
    #atEditor .ed-painel { max-height:38vh; }
    #atEditor .ed-some-celular { display:none; }
  }
</style>`;

// Icones do trilho, desenhados aqui (traco simples, seguem a cor do botao).
const SVG = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ABAS_EDITOR = [
    { id: 'modelos',    nome: 'Modelos',    svg: SVG('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>') },
    { id: 'texto',      nome: 'Texto',      svg: SVG('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>') },
    { id: 'formas',     nome: 'Formas',     svg: SVG('<circle cx="8" cy="8" r="5"/><rect x="12" y="12" width="9" height="9" rx="1.5"/>') },
    { id: 'imagens',    nome: 'Imagens',    svg: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>') },
    { id: 'figurinhas', nome: 'Figurinhas', svg: SVG('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>') },
    { id: 'fundo',      nome: 'Fundo',      svg: SVG('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><path d="M7.5 11h.01M10 7h.01M15 7.5h.01"/>') },
    { id: 'camadas',    nome: 'Camadas',    svg: SVG('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>') },
    { id: 'ia',         nome: 'IA',         svg: SVG('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1"/>') },
    { id: 'editar',     nome: 'Editar',     svg: SVG('<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'), soEstreito: true }
];

function estreito() { return window.innerWidth <= 1100; }

function abrirEditor(arte, jaSalva) {
    fecharEditorDom();
    atArte = A().normalizarArte(arte);
    atSel = null; atEditandoTexto = null; atArrasto = null; atGuias = []; atPassando = null;
    atEstadoSalvo = jaSalva ? 'salvo' : '';
    atImagens.clear();
    atAba = atArte.elementos.length ? 'texto' : 'modelos';
    carregarFontes();
    descobrirEscola().then(() => { if (atArte) { ajustarTodosTextos(); pedirDesenho(); } });
    ajustarTodosTextos();
    atHist = A().criarHistorico(100);
    atHist.registrar(A().estadoParaHistorico(atArte));

    const ed = document.createElement('div');
    ed.id = 'atEditor';
    ed.className = 'no-icones';
    ed.innerHTML = ESTILO_EDITOR + `
        <div class="ed-barra">
            <button class="ed-b" onclick="atSair()" title="Voltar para o Ateliê">← Sair</button>
            <div class="ed-marca ed-some-celular">${window.iconeSisProf ? iconeSisProf('atelie', 'ico-texto') : ''}<b>Ate<span>liê</span></b></div>
            <input class="ed-titulo" id="atTitulo" value="${esc(atArte.titulo)}" title="Nome da arte" oninput="atRenomear(this.value)">
            <button class="ed-b" id="atBtnDesfazer" onclick="atDesfazer()" title="Desfazer (Ctrl+Z)">↶</button>
            <button class="ed-b" id="atBtnRefazer" onclick="atRefazer()" title="Refazer (Ctrl+Shift+Z)">↷</button>
            <span class="ed-status" id="atStatus"></span>
            <span class="ed-esp"></span>
            <button class="ed-b ed-some-celular" onclick="atRedimensionarFolha()" title="Mudar o tamanho da folha">📐 <span class="ed-rot">Tamanho</span></button>
            <button class="ed-b" onclick="atAbrirLote()" title="Em lote: uma página por estudante, trocando {nome}">👥 <span class="ed-rot">Em lote</span></button>
            <button class="ed-b" onclick="atSalvarAgora()" title="Salvar (Ctrl+S)">💾 <span class="ed-rot">Salvar</span></button>
            <div style="position:relative;">
                <button class="ed-b pri" onclick="atMenuBaixar(event)" title="Baixar">⬇ <span class="ed-rot">Baixar</span></button>
            </div>
        </div>
        <div class="ed-corpo">
            <div class="ed-trilho" id="atTrilho"></div>
            <div class="ed-painel" id="atPainel"></div>
            <div class="ed-palco" id="atPalco">
                <div class="ed-palco-in" id="atPalcoIn"><canvas id="atCanvas"></canvas></div>
                <div class="ed-zoom">
                    <button class="ed-b" onclick="atZoomPasso(-1)" title="Diminuir">−</button>
                    <button class="ed-b" id="atZoomTxt" onclick="atZoomAjustar()" title="Caber na tela">100%</button>
                    <button class="ed-b" onclick="atZoomPasso(1)" title="Aumentar">+</button>
                </div>
            </div>
            <div class="ed-props" id="atProps"></div>
        </div>`;
    document.body.appendChild(ed);
    document.body.style.overflow = 'hidden';

    const cv = $('atCanvas');
    cv.addEventListener('pointerdown', aoApertar);
    cv.addEventListener('pointermove', aoMover);
    cv.addEventListener('pointerup', aoSoltar);
    cv.addEventListener('pointercancel', aoSoltar);
    cv.addEventListener('pointerleave', () => { if (atPassando) { atPassando = null; pedirDesenho(); } });
    cv.addEventListener('dblclick', aoDuploClique);
    const palco = $('atPalco');
    palco.addEventListener('pointerdown', (e) => { if (e.target === palco || e.target.id === 'atPalcoIn') selecionar(null); });
    palco.addEventListener('wheel', aoRoda, { passive: false });
    palco.addEventListener('dragover', (e) => { e.preventDefault(); });
    palco.addEventListener('drop', aoSoltarArquivo);
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('paste', aoColar);
    window.addEventListener('resize', aoRedimensionarJanela);

    desenharTrilho();
    desenharPainel();
    desenharProps();
    atualizarBarra();
    requestAnimationFrame(() => { atZoomAjustar(); });
}

function fecharEditorDom() {
    const ed = $('atEditor');
    if (ed) ed.remove();
    const j = $('atJanela');
    if (j) j.remove();
    document.removeEventListener('keydown', aoTeclar);
    document.removeEventListener('paste', aoColar);
    window.removeEventListener('resize', aoRedimensionarJanela);
    document.body.style.overflow = '';
}

async function atSair() {
    terminarEdicaoTexto();
    // so' salva o que mudou: abrir um modelo e sair sem mexer nao cria arte na lista
    if (atArte && (atTimerSalvar || atEstadoSalvo === 'pendente' || atEstadoSalvo === 'erro')) {
        try { await salvarComStatus(); } catch (e) {
            if (!confirm('Não consegui salvar (' + e.message + '). Sair mesmo assim e perder as mudanças?')) return;
        }
    }
    fecharEditorDom();
    atArte = null; atSel = null;
    atAviso = '';
    desenharInicio();
}

function avisoEditor(texto) {
    atAviso = texto;
    desenharPainel();
}

function aoRedimensionarJanela() {
    desenharTrilho();
    if (!estreito() && atAba === 'editar') { atAba = 'texto'; desenharPainel(); }
    desenharProps();
}

// ---------------------------------------------------------------------------
// Desenho do palco
// ---------------------------------------------------------------------------

let pedidoDesenho = 0;
function pedirDesenho() {
    if (pedidoDesenho) return;
    pedidoDesenho = requestAnimationFrame(() => { pedidoDesenho = 0; desenharPalco(); });
}

function desenharPalco() {
    const cv = $('atCanvas');
    if (!cv || !atArte) return;
    const Wcss = Math.round(atArte.largura * atZoom + MARGEM * 2);
    const Hcss = Math.round(atArte.altura * atZoom + MARGEM * 2);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    dpr = Math.min(dpr, Math.sqrt(16e6 / (Wcss * Hcss)));
    const wpx = Math.max(1, Math.round(Wcss * dpr)), hpx = Math.max(1, Math.round(Hcss * dpr));
    if (cv.width !== wpx || cv.height !== hpx) { cv.width = wpx; cv.height = hpx; }
    cv.style.width = Wcss + 'px'; cv.style.height = Hcss + 'px';
    const pin = $('atPalcoIn');
    if (pin) { pin.style.width = Wcss + 'px'; pin.style.height = Hcss + 'px'; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, wpx, hpx);
    const z = atZoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * MARGEM, dpr * MARGEM);

    // sombra da folha
    ctx.save();
    ctx.shadowColor = 'rgba(28,37,54,0.22)'; ctx.shadowBlur = 18 * dpr; ctx.shadowOffsetY = 4 * dpr;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, atArte.largura, atArte.altura);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, atArte.largura, atArte.altura); ctx.clip();
    A().desenharArte(ctx, atArte, { imagem: obterImagem, subs: subsAtuais(), pular: atEditandoTexto });
    ctx.restore();

    // o que esta fora da folha aparece apagado (o arquivo final corta ali)
    ctx.save();
    ctx.beginPath(); ctx.rect(-MARGEM / z, -MARGEM / z, Wcss / z, Hcss / z); ctx.rect(0, 0, atArte.largura, atArte.altura);
    ctx.clip('evenodd');
    ctx.globalAlpha = 0.25;
    atArte.elementos.forEach(el => {
        if (el.oculto || el.id === atEditandoTexto) return;
        const k = A().caixaOcupada(el);
        if (k.x < 0 || k.y < 0 || k.x + k.w > atArte.largura || k.y + k.h > atArte.altura) A().desenharElemento(ctx, el, { imagem: obterImagem, subs: subsAtuais() });
    });
    ctx.restore();

    // guias de encaixe
    if (atGuias.length) {
        ctx.save();
        ctx.strokeStyle = '#e64980'; ctx.lineWidth = 1 / z; ctx.setLineDash([6 / z, 4 / z]);
        atGuias.forEach(g => {
            ctx.beginPath();
            if (g.eixo === 'v') { ctx.moveTo(g.pos, -MARGEM / z); ctx.lineTo(g.pos, atArte.altura + MARGEM / z); }
            else { ctx.moveTo(-MARGEM / z, g.pos); ctx.lineTo(atArte.largura + MARGEM / z, g.pos); }
            ctx.stroke();
        });
        ctx.restore();
    }

    const sel = selecionado();
    if (atPassando && (!sel || atPassando !== sel.id)) {
        const el = atArte.elementos.find(e => e.id === atPassando);
        if (el) contorno(ctx, el, 'rgba(232,89,12,0.55)', []);
    }
    if (sel && !sel.oculto && sel.id !== atEditandoTexto) desenharSelecao(ctx, sel);
}

function contorno(ctx, el, corTraco, traco) {
    const z = atZoom, c = A().centro(el);
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(el.rot * Math.PI / 180);
    ctx.strokeStyle = corTraco; ctx.lineWidth = 1.5 / z; ctx.setLineDash(traco.map(v => v / z));
    ctx.strokeRect(-el.w / 2, -el.h / 2, el.w, el.h);
    ctx.restore();
}

function distRot() { return 30 / atZoom; }

function desenharSelecao(ctx, el) {
    const z = atZoom;
    contorno(ctx, el, el.travado ? '#94a3b8' : COR_MARCA, el.travado ? [5, 4] : []);
    if (el.travado) return;
    const pos = A().posicoesAlcas(el, distRot());
    ctx.save();
    if (pos.rot) {
        const topo = A().paraArte(el, 0, -el.h / 2);
        ctx.strokeStyle = COR_MARCA; ctx.lineWidth = 1.2 / z;
        ctx.beginPath(); ctx.moveTo(topo.x, topo.y); ctx.lineTo(pos.rot.x, pos.rot.y); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = COR_MARCA; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(pos.rot.x, pos.rot.y, 7 / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(pos.rot.x, pos.rot.y, 3 / z, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke();
    }
    Object.keys(pos).forEach(a => {
        if (a === 'rot') return;
        const p = pos[a];
        const lado = (a.length === 2 ? 11 : 9) / z;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(el.rot * Math.PI / 180);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = COR_MARCA; ctx.lineWidth = 1.6 / z;
        ctx.beginPath();
        if (a.length === 2) ctx.arc(0, 0, lado / 2, 0, Math.PI * 2);
        else if (a === 'n' || a === 's') { ctx.rect(-lado, -lado / 3, lado * 2, lado / 1.5); }
        else ctx.rect(-lado / 3, -lado, lado / 1.5, lado * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
    });
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Mouse / dedo na folha
// ---------------------------------------------------------------------------

function pontoDaArte(e) {
    const cv = $('atCanvas');
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left - MARGEM) / atZoom, y: (e.clientY - r.top - MARGEM) / atZoom };
}

function selecionado() { return atArte && atSel ? atArte.elementos.find(e => e.id === atSel) || null : null; }

function selecionar(id) {
    if (atEditandoTexto && atEditandoTexto !== id) terminarEdicaoTexto();
    if (atSel === id) return;
    atSel = id;
    if (estreito() && id && atAba !== 'editar' && atAba !== 'camadas' && atAba !== 'ia') { atAba = 'editar'; desenharTrilho(); desenharPainel(); }
    else if (estreito() && !id && atAba === 'editar') { atAba = 'texto'; desenharTrilho(); desenharPainel(); }
    else if (atAba === 'camadas' || atAba === 'ia') desenharPainel();
    desenharProps();
    pedirDesenho();
}

const CURSOR_ALCA = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', rot: 'grab' };

function aoApertar(e) {
    if (!atArte || e.button > 0) return;
    const p = pontoDaArte(e);
    const sel = selecionado();
    if (sel && !sel.travado && !sel.oculto) {
        const alca = A().alcaNoPonto(sel, p.x, p.y, 10 / atZoom, distRot());
        if (alca) {
            atArrasto = { tipo: alca === 'rot' ? 'girar' : 'alca', alca, orig: A().copiar(sel), p0: p, mudou: false };
            e.target.setPointerCapture(e.pointerId);
            return;
        }
    }
    const el = A().elementoNoPonto(atArte, p.x, p.y, 6 / atZoom);
    if (!el) { selecionar(null); return; }
    if (atEditandoTexto === el.id) return;
    selecionar(el.id);
    if (el.travado) return;
    atArrasto = { tipo: 'mover', orig: A().copiar(el), p0: p, mudou: false };
    e.target.setPointerCapture(e.pointerId);
}

function aoMover(e) {
    if (!atArte) return;
    const p = pontoDaArte(e);
    const cv = $('atCanvas');
    if (!atArrasto) {
        const sel = selecionado();
        const alca = sel && !sel.travado ? A().alcaNoPonto(sel, p.x, p.y, 10 / atZoom, distRot()) : null;
        const el = alca ? null : A().elementoNoPonto(atArte, p.x, p.y, 6 / atZoom);
        cv.style.cursor = alca ? CURSOR_ALCA[alca] : (el ? (el.travado ? 'default' : 'move') : 'default');
        const id = el ? el.id : null;
        if (id !== atPassando) { atPassando = id; pedirDesenho(); }
        return;
    }
    const el = selecionado();
    if (!el) return;
    const o = atArrasto.orig;
    if (atArrasto.tipo === 'mover') {
        const dx = p.x - atArrasto.p0.x, dy = p.y - atArrasto.p0.y;
        if (!atArrasto.mudou && Math.hypot(dx, dy) * atZoom < 3) return;
        el.x = Math.round(o.x + dx); el.y = Math.round(o.y + dy);
        atGuias = [];
        if (!e.altKey) {
            const enc = A().encaixar(el, atArte, 7 / atZoom);
            el.x = Math.round(el.x + enc.dx); el.y = Math.round(el.y + enc.dy);
            atGuias = enc.guias;
        }
    } else if (atArrasto.tipo === 'alca') {
        const canto = atArrasto.alca.length === 2;
        const proporcionalPadrao = el.tipo !== 'forma';
        const prop = canto && (e.shiftKey ? !proporcionalPadrao : proporcionalPadrao);
        const g = A().redimensionar(o, atArrasto.alca, p.x, p.y, prop);
        if (el.tipo === 'texto') {
            if (canto) el.tam = Math.max(6, Math.round(o.tam * g.escala * 10) / 10);
            el.w = Math.max(20, g.w); el.x = g.x;
            el.y = g.y;
            ajustarTexto(el);
            // o texto cresce para baixo a partir do topo que a alca definiu
        } else {
            el.x = g.x; el.y = g.y; el.w = g.w; el.h = A().ehLinha(el) ? o.h : g.h;
        }
    } else if (atArrasto.tipo === 'girar') {
        el.rot = A().anguloGiro(el, p.x, p.y, e.shiftKey ? 15 : 0);
    }
    atArrasto.mudou = true;
    pedirDesenho();
}

function aoSoltar() {
    if (!atArrasto) return;
    const mudou = atArrasto.mudou;
    atArrasto = null;
    atGuias = [];
    pedirDesenho();
    if (mudou) { registrar(); desenharProps(); }
}

function aoDuploClique(e) {
    const p = pontoDaArte(e);
    const el = A().elementoNoPonto(atArte, p.x, p.y, 6 / atZoom);
    if (el && el.tipo === 'texto' && !el.travado) comecarEdicaoTexto(el.id);
}

function aoRoda(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    definirZoom(atZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}

// ---------------------------------------------------------------------------
// Digitar direto na folha
// ---------------------------------------------------------------------------

function comecarEdicaoTexto(id) {
    terminarEdicaoTexto();
    const el = atArte.elementos.find(e => e.id === id);
    if (!el) return;
    atSel = id;
    atEditandoTexto = id;
    const ta = document.createElement('textarea');
    ta.className = 'ed-na-folha';
    ta.id = 'atTextoFolha';
    ta.value = el.texto;
    ta.spellcheck = true;
    $('atPalcoIn').appendChild(ta);
    posicionarTextoFolha();
    ta.addEventListener('input', () => {
        el.texto = ta.value;
        ajustarTexto(el);
        posicionarTextoFolha();
        const campo = $('atPropTexto');
        if (campo) campo.value = el.texto;
        marcarMudanca();
    });
    ta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); terminarEdicaoTexto(); }
        ev.stopPropagation();
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) terminarEdicaoTexto(); }, 0));
    ta.focus();
    ta.select();
    desenharProps();
    pedirDesenho();
}

function posicionarTextoFolha() {
    const ta = $('atTextoFolha');
    const el = atEditandoTexto && atArte.elementos.find(e => e.id === atEditandoTexto);
    if (!ta || !el) return;
    const z = atZoom, f = A().fonte(el.fonte) || A().FONTES[0];
    const pad = el.fundoCor ? Math.round(el.tam * 0.3) : 0;
    Object.assign(ta.style, {
        left: (MARGEM + el.x * z) + 'px', top: (MARGEM + el.y * z) + 'px',
        width: (el.w * z) + 'px', height: (Math.max(el.h, el.tam * el.entrelinha) * z) + 'px',
        padding: (pad * z) + 'px',
        fontFamily: '"' + f.nome + '", ' + f.reserva, fontSize: (el.tam * z) + 'px',
        fontWeight: el.negrito ? '700' : '400', fontStyle: el.italico ? 'italic' : 'normal',
        lineHeight: String(el.entrelinha), letterSpacing: (el.espaco * z) + 'px',
        textAlign: el.alinh, color: el.cor, textTransform: el.maiusculas ? 'uppercase' : 'none',
        transform: el.rot ? 'rotate(' + el.rot + 'deg)' : '',
        background: el.fundoCor ? el.fundoCor : 'rgba(255,255,255,0.0)'
    });
}

function terminarEdicaoTexto() {
    const ta = $('atTextoFolha');
    const id = atEditandoTexto;
    atEditandoTexto = null;
    if (ta) ta.remove();
    if (!id || !atArte) return;
    const el = atArte.elementos.find(e => e.id === id);
    if (el && !el.texto.trim()) {
        atArte.elementos = atArte.elementos.filter(e => e.id !== id);
        if (atSel === id) atSel = null;
    }
    registrar();
    desenharProps();
    if (atAba === 'camadas') desenharPainel();
    pedirDesenho();
}

// ---------------------------------------------------------------------------
// Teclado, colar, arrastar arquivo
// ---------------------------------------------------------------------------

function digitandoEmCampo() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
}

function aoTeclar(e) {
    if (!atArte || $('atJanela')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 'z' || e.key === 'Z') && !digitandoEmCampo()) { e.preventDefault(); if (e.shiftKey) atRefazer(); else atDesfazer(); return; }
    if (ctrl && (e.key === 'y' || e.key === 'Y') && !digitandoEmCampo()) { e.preventDefault(); atRefazer(); return; }
    if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); atSalvarAgora(); return; }
    if (digitandoEmCampo()) return;
    const el = selecionado();
    if (ctrl && (e.key === 'd' || e.key === 'D') && el) { e.preventDefault(); atAcao('duplicar'); return; }
    if (ctrl && (e.key === 'c' || e.key === 'C') && el) { atCopiado = A().copiar(el); return; }
    if (ctrl && (e.key === 'v' || e.key === 'V') && atCopiado) {
        // a imagem colada de fora chega pelo evento 'paste'; aqui so' o elemento copiado
        setTimeout(() => {
            if (!atCopiado || atColouImagem) { atColouImagem = false; return; }
            const novo = A().duplicarElemento(atCopiado, 30);
            atCopiado = A().copiar(novo);
            inserir(novo);
        }, 0);
        return;
    }
    if (e.key === 'Escape') { selecionar(null); return; }
    if (!el) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); atAcao('apagar'); return; }
    if (e.key === 'Enter' && el.tipo === 'texto') { e.preventDefault(); comecarEdicaoTexto(el.id); return; }
    const passo = e.shiftKey ? 10 : 1;
    const mov = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (mov && !el.travado) {
        e.preventDefault();
        el.x += mov[0]; el.y += mov[1];
        pedirDesenho();
        clearTimeout(aoTeclar.t);
        aoTeclar.t = setTimeout(() => { registrar(); desenharProps(); }, 400);
    }
}

let atColouImagem = false;
function aoColar(e) {
    if (!atArte || digitandoEmCampo() || $('atJanela')) return;
    const itens = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const img = itens.find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (img) {
        e.preventDefault();
        atColouImagem = true;
        adicionarArquivos([img.getAsFile()]);
        return;
    }
    if (atCopiado) return;
    const texto = e.clipboardData && e.clipboardData.getData('text/plain');
    if (texto && texto.trim()) {
        e.preventDefault();
        inserir(A().novoTexto(atArte, { texto: texto.trim().slice(0, 2000), tam: Math.round(Math.min(atArte.largura, atArte.altura) / 22) }));
    }
}

function aoSoltarArquivo(e) {
    e.preventDefault();
    const arquivos = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /^image\//.test(f.type));
    if (arquivos.length) adicionarArquivos(arquivos);
}

// ---------------------------------------------------------------------------
// Historico, salvar automatico, zoom
// ---------------------------------------------------------------------------

function registrar() {
    if (!atArte || !atHist) return;
    if (atHist.registrar(A().estadoParaHistorico(atArte))) marcarMudanca();
    atualizarBarra();
}

// Salva sozinho 2,5 s depois da ultima mudanca.
function marcarMudanca() {
    atEstadoSalvo = 'pendente';
    atualizarStatus();
    clearTimeout(atTimerSalvar);
    atTimerSalvar = setTimeout(() => { salvarComStatus().catch(() => {}); }, 2500);
}

async function salvarComStatus() {
    clearTimeout(atTimerSalvar); atTimerSalvar = null;
    if (!atArte) return;
    const arte = atArte;
    atEstadoSalvo = 'salvando'; atualizarStatus();
    try {
        const onde = await salvarArte(arte);
        if (atArte === arte && atEstadoSalvo === 'salvando') atEstadoSalvo = onde === 'nuvem' ? 'salvo' : 'local';
    } catch (e) {
        atEstadoSalvo = 'erro';
        atualizarStatus();
        throw e;
    }
    atualizarStatus();
}

function atSalvarAgora() {
    terminarEdicaoTexto();
    salvarComStatus().catch(e => alert(e.message));
}

function atualizarStatus() {
    const s = $('atStatus');
    if (!s) return;
    s.textContent = { pendente: 'Alterações não salvas…', salvando: 'Salvando…', salvo: '✓ Salvo na sua conta',
        local: '✓ Salvo neste aparelho', erro: '⚠ Não foi possível salvar' }[atEstadoSalvo] || '';
    s.title = atEstadoSalvo === 'local' ? 'A arte ficou grande demais para a nuvem (muitas fotos) ou está sem internet: ela está guardada só neste aparelho.' : '';
}

function atualizarBarra() {
    const d = $('atBtnDesfazer'), r = $('atBtnRefazer');
    if (d) d.disabled = !atHist || !atHist.podeDesfazer();
    if (r) r.disabled = !atHist || !atHist.podeRefazer();
    atualizarStatus();
}

function aplicarEstado(estado) {
    if (!estado) return;
    terminarEdicaoTexto();
    A().aplicarHistorico(atArte, estado);
    if (atSel && !atArte.elementos.some(e => e.id === atSel)) atSel = null;
    const t = $('atTitulo'); if (t) t.value = atArte.titulo;
    marcarMudanca();
    atualizarBarra(); desenharPainel(); desenharProps(); pedirDesenho();
}
function atDesfazer() { if (atHist) aplicarEstado(atHist.desfazer()); }
function atRefazer() { if (atHist) aplicarEstado(atHist.refazer()); }

function atRenomear(v) {
    if (!atArte) return;
    atArte.titulo = String(v).slice(0, 120);
    clearTimeout(atRenomear.t);
    atRenomear.t = setTimeout(registrar, 600);
}

function definirZoom(z) {
    atZoom = Math.max(0.05, Math.min(4, z));
    const t = $('atZoomTxt'); if (t) t.textContent = Math.round(atZoom * 100) + '%';
    desenharPalco();
    posicionarTextoFolha();
}
function atZoomPasso(d) {
    const passos = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    let i = passos.findIndex(p => p >= atZoom - 0.001);
    if (i < 0) i = passos.length - 1;
    if (d > 0) i = passos[i] > atZoom + 0.001 ? i : i + 1; else i = i - 1;
    definirZoom(passos[Math.max(0, Math.min(passos.length - 1, i))]);
}
function atZoomAjustar() {
    const palco = $('atPalco');
    if (!palco || !atArte) return;
    const w = palco.clientWidth - MARGEM * 2 - 16, h = palco.clientHeight - MARGEM * 2 - 16;
    definirZoom(Math.max(0.05, Math.min(1, Math.min(w / atArte.largura, h / atArte.altura))));
}

// ---------------------------------------------------------------------------
// Trilho e painel da esquerda
// ---------------------------------------------------------------------------

function desenharTrilho() {
    const t = $('atTrilho');
    if (!t) return;
    t.innerHTML = ABAS_EDITOR.filter(a => !a.soEstreito || estreito()).map(a =>
        `<button class="${a.id === atAba ? 'on' : ''}" onclick="atMudarAba('${a.id}')" title="${a.nome}">${a.svg}<span>${a.nome}</span></button>`).join('');
}

function atMudarAba(id) {
    const painel = $('atPainel');
    // no celular, tocar de novo na aba aberta fecha o painel (sobra mais folha)
    if (painel && window.innerWidth <= 760 && atAba === id) { painel.classList.toggle('fechado'); return; }
    if (painel) painel.classList.remove('fechado');
    atAba = id;
    desenharTrilho();
    desenharPainel();
}

function desenharPainel() {
    const p = $('atPainel');
    if (!p || !atArte) return;
    const aviso = atAviso ? `<div class="ed-ok">${esc(atAviso)}</div>` : '';
    const html = {
        modelos: painelModelos, texto: painelTexto, formas: painelFormas, imagens: painelImagens,
        figurinhas: painelFigurinhas, fundo: painelFundo, camadas: painelCamadas, ia: painelIA,
        editar: () => htmlProps()
    }[atAba] || painelTexto;
    p.innerHTML = aviso + html();
    if (atAba === 'formas') desenharIconesFormas();
}

function painelModelos() {
    return `<h4>Modelos</h4>
        <p class="ed-dica" style="margin-top:0;">Trocar de modelo substitui a arte atual — o ↶ Desfazer traz de volta.</p>
        <div class="ed-grade" style="grid-template-columns:repeat(2,1fr);">
            ${A().MODELOS.map(m => `<div class="ed-cel" onclick="atTrocarModelo('${m.id}')" title="${esc(m.descricao)}"><img src="${miniaturaModelo(m.id)}" alt="">${esc(m.nome)}</div>`).join('')}
        </div>`;
}

const PRESETS_TEXTO = [
    { nome: 'Título', amostra: 'font:800 26px Montserrat, sans-serif', props: { fonte: 'Montserrat', negrito: true, escala: 9 } },
    { nome: 'Subtítulo', amostra: 'font:700 19px Poppins, sans-serif', props: { fonte: 'Poppins', negrito: true, escala: 16 } },
    { nome: 'Texto corrido', amostra: 'font:400 15px Poppins, sans-serif', props: { fonte: 'Poppins', escala: 28, alinh: 'left', entrelinha: 1.45, texto: 'Escreva aqui o seu texto. Você pode mudar a fonte, a cor e o tamanho ao lado.' } },
    { nome: 'Letreiro', amostra: 'font:400 30px "Bebas Neue", sans-serif; letter-spacing:2px', props: { fonte: 'Bebas Neue', escala: 7, espaco: 4, texto: 'LETREIRO' } },
    { nome: 'Manuscrito', amostra: 'font:700 26px Caveat, cursive', props: { fonte: 'Caveat', negrito: true, escala: 10, texto: 'Com carinho' } },
    { nome: 'Com contorno', amostra: 'font:700 24px "Baloo 2", sans-serif; color:#fab005; -webkit-text-stroke:1px #1c2536', props: { fonte: 'Baloo 2', negrito: true, escala: 9, cor: '#fab005', contornoCor: '#1c2536', contornoLarg: 6, texto: 'Destaque!' } },
    { nome: 'Etiqueta', amostra: 'font:700 15px Poppins, sans-serif; background:#e8590c; color:#fff; padding:2px 8px; border-radius:6px', props: { fonte: 'Poppins', negrito: true, escala: 22, cor: '#ffffff', fundoCor: '#e8590c', texto: 'NOVIDADE' } },
    { nome: 'Elegante', amostra: 'font:400 30px "Great Vibes", cursive', props: { fonte: 'Great Vibes', escala: 8, texto: 'Parabéns' } }
];

function painelTexto() {
    return `<h4>Texto</h4>
        <button class="ed-b pri" style="width:100%; justify-content:center; margin-bottom:12px;" onclick="atAddTexto(-1)">＋ Caixa de texto</button>
        ${PRESETS_TEXTO.map((p, i) => `<button class="ed-txt-preset" onclick="atAddTexto(${i})"><span style="${p.amostra}">${esc(p.props.texto || p.nome)}</span>${p.props.texto ? `<br><small style="color:#5f6b7f;">${esc(p.nome)}</small>` : ''}</button>`).join('')}
        <h5>Campos automáticos</h5>
        <p class="ed-dica" style="margin-top:0;">Entram no texto e viram o dado de verdade na arte final. <b>{nome}</b> e <b>{turma}</b> são preenchidos no <b>👥 Em lote</b>, um por estudante.</p>
        <div class="ed-cores">${['nome', 'turma', 'escola', 'professor', 'data', 'ano'].map(c => `<button class="ed-b" style="font-size:12px;" onclick="atInserirCampo('${c}')">{${c}}</button>`).join('')}</div>`;
}

function painelFormas() {
    return `<h4>Formas</h4>
        <div class="ed-grade" id="atGradeFormas">
            ${A().FORMAS.map(f => `<div class="ed-cel" onclick="atAddForma('${f.id}')" title="${esc(f.nome)}"><canvas data-forma="${f.id}" width="96" height="72" style="width:48px; height:36px;"></canvas>${esc(f.nome)}</div>`).join('')}
        </div>
        <p class="ed-dica">Arraste os cantos para mudar o tamanho. Com Shift, a forma mantém a proporção.</p>`;
}

function desenharIconesFormas() {
    document.querySelectorAll('#atGradeFormas canvas[data-forma]').forEach(c => {
        const ctx = c.getContext('2d');
        const forma = c.dataset.forma;
        const linha = A().FORMAS_LINHA.indexOf(forma) >= 0;
        const el = A().normalizarElemento({ tipo: 'forma', forma, x: 14, y: linha ? 26 : 8, w: 68, h: linha ? 20 : (forma === 'seta' ? 40 : 56),
            preench: '#2563c9', borda: '#2563c9', bordaLarg: linha ? 5 : 0, raio: forma === 'arred' ? 14 : 0 });
        if (forma === 'seta') el.y = 16;
        ctx.clearRect(0, 0, c.width, c.height);
        A().desenharElemento(ctx, el, {});
    });
}

function painelImagens() {
    const recursos = Object.keys(atArte.recursos);
    return `<h4>Imagens</h4>
        <input type="file" id="atArquivo" accept="image/*" multiple style="display:none" onchange="atArquivosEscolhidos(this)">
        <button class="ed-b pri" style="width:100%; justify-content:center;" onclick="document.getElementById('atArquivo').click()">⬆ Enviar imagem</button>
        <p class="ed-dica">Também dá para <b>colar</b> (Ctrl+V) uma imagem copiada ou <b>arrastar</b> o arquivo para a folha. A imagem fica só nesta arte; nada vai para site de terceiros.</p>
        ${recursos.length ? `<h5>Usadas nesta arte</h5><div class="ed-grade">${recursos.map(r => `<div class="ed-cel" onclick="atReusarImagem('${r}')"><img src="${esc(atArte.recursos[r])}" alt=""></div>`).join('')}</div>` : ''}`;
}

function painelFigurinhas() {
    return `<h4>Figurinhas</h4>` + A().FIGURINHAS.map(g => `<h5>${esc(g.grupo)}</h5>
        <div class="ed-grade g4">${g.itens.map(f => `<button class="ed-fig" onclick="atAddFigurinha('${f}')">${f}</button>`).join('')}</div>`).join('') +
        '<p class="ed-dica">As figurinhas são emojis: a aparência muda um pouco de um aparelho para outro.</p>';
}

function painelFundo() {
    const f = atArte.fundo;
    const tipos = [['cor', 'Cor'], ['gradiente', 'Degradê'], ['imagem', 'Foto']];
    return `<h4>Fundo</h4>
        <div class="ed-grupo" style="margin-bottom:10px;">${tipos.map(([t, n]) => `<button class="ed-b ${f.tipo === t ? 'on' : ''}" onclick="atFundo('tipo','${t}')">${n}</button>`).join('')}</div>
        ${campoCor('Cor', f.cor, 'fundo', 'cor')}
        ${f.tipo === 'gradiente' ? campoCor('Segunda cor', f.cor2, 'fundo', 'cor2') + faixa('Direção', f.angulo, 0, 360, 5, 'fundo', 'angulo', '°') : ''}
        ${f.tipo === 'imagem' ? `
            <input type="file" id="atArquivoFundo" accept="image/*" style="display:none" onchange="atFundoImagem(this)">
            <button class="ed-b" onclick="document.getElementById('atArquivoFundo').click()">⬆ ${f.recurso ? 'Trocar a foto' : 'Escolher a foto'}</button>
            ${faixa('Escurecer', Math.round(f.escurecer * 100), 0, 90, 5, 'fundo', 'escurecer', '%')}` : ''}
        <h5>Trocar todas as cores</h5>
        <p class="ed-dica" style="margin-top:0;">Pinta a arte inteira com outra combinação de cores.</p>
        ${A().PALETAS.map(p => `<button class="ed-paleta ${p.id === atArte.paleta ? 'on' : ''}" onclick="atPaleta('${p.id}')">
            <span>${A().PAPEIS.map(k => `<i style="background:${p[k]}"></i>`).join('')}</span><span style="margin-left:8px;">${esc(p.nome)}</span></button>`).join('')}`;
}

function nomeCamada(el) {
    if (el.nome && el.tipo !== 'texto') return el.nome;
    if (el.tipo === 'texto') return (el.texto || '').replace(/\s+/g, ' ').slice(0, 40) || 'Texto';
    return el.nome || el.tipo;
}

function painelCamadas() {
    const lista = atArte.elementos.slice().reverse();
    const icone = { texto: 'T', forma: '◆', imagem: '🖼' };
    return `<h4>Camadas</h4>
        <p class="ed-dica" style="margin-top:0;">A de cima fica na frente. Clique para selecionar.</p>
        ${lista.length ? lista.map(el => `
            <div class="ed-camada ${el.id === atSel ? 'sel' : ''}" onclick="atSelecionar('${el.id}')">
                <b style="width:18px; text-align:center; color:#5f6b7f;">${icone[el.tipo]}</b>
                <span class="nm" style="${el.oculto ? 'opacity:0.45;' : ''}">${esc(nomeCamada(el))}</span>
                <button title="Subir" onclick="event.stopPropagation(); atCamada('${el.id}','subir')">▲</button>
                <button title="Descer" onclick="event.stopPropagation(); atCamada('${el.id}','descer')">▼</button>
                <button title="${el.oculto ? 'Mostrar' : 'Esconder'}" onclick="event.stopPropagation(); atCamada('${el.id}','oculto')">${el.oculto ? '🙈' : '👁'}</button>
                <button title="${el.travado ? 'Destravar' : 'Travar no lugar'}" onclick="event.stopPropagation(); atCamada('${el.id}','travado')">${el.travado ? '🔒' : '🔓'}</button>
            </div>`).join('') : '<p class="ed-dica">A folha está vazia.</p>'}`;
}

function painelIA() {
    const el = selecionado();
    const temTexto = el && el.tipo === 'texto';
    return `<h4>✨ IA</h4>
        <h5 style="margin-top:4px;">Escrever um texto</h5>
        <textarea class="ed-campo" id="atIAPedido" placeholder="Ex.: frase de boas-vindas para o mural da sala do 3º ano"></textarea>
        <div class="ed-linha"><button class="ed-b pri" id="atIABtn" onclick="atIAEscrever()">Escrever</button><span id="atIAMsg" class="ed-dica"></span></div>
        <h5>Melhorar o texto selecionado</h5>
        ${temTexto ? `<div class="ed-cores">${Object.keys(A().COMO_REESCREVER).map(k => `<button class="ed-b" style="font-size:12px;" onclick="atIAReescrever('${k}')">${{ corrigir: 'Corrigir', curto: 'Mais curto', formal: 'Mais formal', animado: 'Mais animado', simples: 'Mais simples', ingles: 'Em inglês' }[k]}</button>`).join('')}</div>
            <div id="atIAMsg2" class="ed-dica" style="margin-top:6px;"></div>`
            : '<p class="ed-dica" style="margin-top:0;">Selecione um texto na folha para corrigir, encurtar, deixar mais formal ou traduzir.</p>'}
        <h5>Refazer a arte inteira</h5>
        <textarea class="ed-campo" id="atIARefazer" placeholder="Ex.: convite da formatura do 9º ano, 15/12 às 19h, no auditório"></textarea>
        <div class="ed-linha"><button class="ed-b" id="atIARefazerBtn" onclick="atIARefazer()">Criar nova versão</button><span id="atIAMsg3" class="ed-dica"></span></div>
        <p class="ed-dica">A IA sugere; você confere. O ↶ Desfazer volta ao que estava.</p>`;
}

// ---------------------------------------------------------------------------
// Painel de ajustes (direita, ou aba "Editar" em tela estreita)
// ---------------------------------------------------------------------------

function coresSugeridas() {
    const p = A().paleta(atArte.paleta);
    return Array.from(new Set(A().PAPEIS.map(k => p[k]).concat(['#ffffff', '#000000', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#7048e8', '#868e96'])));
}

function campoCor(rotulo, valor, alvo, campo, permiteVazio) {
    const fn = alvo === 'fundo' ? 'atFundo' : 'atProp';
    const v = valor || '';
    return `<div class="ed-linha" style="align-items:flex-start;"><label>${esc(rotulo)}</label><div class="ed-cores" style="flex:1;">
        ${permiteVazio ? `<button class="ed-cor vazia ${!v ? 'sel' : ''}" title="Sem cor" onclick="${fn}('${campo}','',true,true)"></button>` : ''}
        ${coresSugeridas().map(c => `<button class="ed-cor ${c === v ? 'sel' : ''}" style="background:${c}" title="${c}" onclick="${fn}('${campo}','${c}',true,true)"></button>`).join('')}
        <input type="color" value="${v || '#ffffff'}" oninput="${fn}('${campo}',this.value,false)" onchange="${fn}('${campo}',this.value,true,true)" title="Outra cor">
    </div></div>`;
}

function faixa(rotulo, valor, min, max, passo, alvo, campo, sufixo) {
    const fn = alvo === 'fundo' ? 'atFundo' : 'atProp';
    const conv = campo === 'opac' || campo === 'escurecer' ? '/100' : '';
    return `<div class="ed-linha"><label>${esc(rotulo)}</label>
        <input type="range" min="${min}" max="${max}" step="${passo}" value="${valor}"
            oninput="${fn}('${campo}', this.value${conv}, false); this.nextElementSibling.textContent=this.value+'${sufixo || ''}'"
            onchange="${fn}('${campo}', this.value${conv}, true)">
        <span style="font-size:12px; color:#5f6b7f; min-width:38px; text-align:right;">${valor}${sufixo || ''}</span></div>`;
}

function botaoLiga(rotulo, campo, ligado, titulo) {
    return `<button class="ed-b ${ligado ? 'on' : ''}" title="${esc(titulo || '')}" onclick="atProp('${campo}', ${!ligado}, true, true)">${rotulo}</button>`;
}

function desenharProps() {
    const p = $('atProps');
    if (p && !estreito()) p.innerHTML = htmlProps();
    if (atAba === 'editar' && estreito()) desenharPainel();
    if (atAba === 'camadas') {
        // so' a marcacao da camada selecionada; nao redesenha para nao perder o clique
        document.querySelectorAll('#atPainel .ed-camada').forEach(div => {
            const m = /atSelecionar\('([^']+)'\)/.exec(div.getAttribute('onclick') || '');
            div.classList.toggle('sel', !!m && m[1] === atSel);
        });
    }
}

function htmlProps() {
    if (!atArte) return '';
    const el = selecionado();
    if (!el) return htmlPropsFolha();
    const tit = { texto: 'Texto', forma: (A().FORMAS.find(f => f.id === el.forma) || {}).nome || 'Forma', imagem: 'Imagem' }[el.tipo];
    const comuns = `
        <div class="ed-linha" style="margin-top:0;">
            <button class="ed-b" title="Duplicar (Ctrl+D)" onclick="atAcao('duplicar')">⧉</button>
            <button class="ed-b" title="${el.travado ? 'Destravar' : 'Travar no lugar'}" onclick="atAcao('travar')">${el.travado ? '🔒' : '🔓'}</button>
            <button class="ed-b" title="Trazer para a frente" onclick="atAcao('frente')">⇡</button>
            <button class="ed-b" title="Mandar para trás" onclick="atAcao('tras')">⇣</button>
            <button class="ed-b" title="Apagar (Delete)" onclick="atAcao('apagar')" style="color:#c92a2a;">🗑</button>
        </div>
        <h5>Posição na folha</h5>
        <div class="ed-grupo">
            <button class="ed-b" title="Encostar à esquerda" onclick="atAlinhar('esquerda')">⇤</button>
            <button class="ed-b" title="Centralizar na horizontal" onclick="atAlinhar('centroH')">↔</button>
            <button class="ed-b" title="Encostar à direita" onclick="atAlinhar('direita')">⇥</button>
            <button class="ed-b" title="Encostar em cima" onclick="atAlinhar('topo')">⤒</button>
            <button class="ed-b" title="Centralizar na vertical" onclick="atAlinhar('centroV')">↕</button>
            <button class="ed-b" title="Encostar embaixo" onclick="atAlinhar('base')">⤓</button>
        </div>
        ${faixa('Transparência', Math.round(el.opac * 100), 5, 100, 5, 'el', 'opac', '%')}
        ${faixa('Girar', Math.round(el.rot), 0, 359, 1, 'el', 'rot', '°')}`;
    let especificos = '';
    if (el.tipo === 'texto') {
        especificos = `
            <textarea class="ed-campo" id="atPropTexto" oninput="atProp('texto', this.value, false)" onchange="atProp('texto', this.value, true)">${esc(el.texto)}</textarea>
            <div class="ed-dica">Dica: dois cliques no texto da folha para digitar direto nele.</div>
            <div class="ed-linha"><label>Fonte</label>
                <select onchange="atProp('fonte', this.value, true)" style="flex:1;">
                    ${A().FONTES.map(f => `<option value="${esc(f.nome)}" ${f.nome === el.fonte ? 'selected' : ''} style="font-family:'${esc(f.nome)}'">${esc(f.nome)}</option>`).join('')}
                </select></div>
            <div class="ed-linha"><label>Tamanho</label>
                <input type="number" min="6" max="1200" value="${Math.round(el.tam)}" onchange="atProp('tam', this.value, true)">
                <button class="ed-b" onclick="atProp('tam', ${Math.max(6, Math.round(el.tam / 1.15))}, true, true)">A−</button>
                <button class="ed-b" onclick="atProp('tam', ${Math.round(el.tam * 1.15)}, true, true)">A+</button></div>
            ${campoCor('Cor', el.cor, 'el', 'cor')}
            <div class="ed-linha">
                <div class="ed-grupo">${botaoLiga('<b>N</b>', 'negrito', el.negrito, 'Negrito')}${botaoLiga('<i>I</i>', 'italico', el.italico, 'Itálico')}${botaoLiga('<u>S</u>', 'sublinhado', el.sublinhado, 'Sublinhado')}${botaoLiga('AA', 'maiusculas', el.maiusculas, 'Tudo maiúsculo')}</div>
                <div class="ed-grupo">${[['left', '⯇≡'], ['center', '≡'], ['right', '≡⯈']].map(([a, s]) => `<button class="ed-b ${el.alinh === a ? 'on' : ''}" title="${{ left: 'Alinhar à esquerda', center: 'Centralizar', right: 'Alinhar à direita' }[a]}" onclick="atProp('alinh','${a}',true,true)">${s}</button>`).join('')}</div>
            </div>
            ${faixa('Entrelinha', el.entrelinha, 0.7, 3, 0.05, 'el', 'entrelinha', '')}
            ${faixa('Espaço letras', el.espaco, -5, 60, 1, 'el', 'espaco', '')}
            <h5>Efeitos</h5>
            ${faixa('Contorno', el.contornoLarg, 0, 40, 1, 'el', 'contornoLarg', '')}
            ${el.contornoLarg > 0 ? campoCor('Cor contorno', el.contornoCor, 'el', 'contornoCor') : ''}
            <div class="ed-linha"><label>Sombra</label>${botaoLiga(el.sombra ? 'Ligada' : 'Desligada', 'sombra', el.sombra)}</div>
            ${campoCor('Fundo do texto', el.fundoCor, 'el', 'fundoCor', true)}
            ${el.fundoCor ? faixa('Cantos', el.fundoRaio, 0, 200, 2, 'el', 'fundoRaio', '') : ''}`;
    } else if (el.tipo === 'forma') {
        const linha = A().ehLinha(el);
        especificos = `
            <div class="ed-linha"><label>Forma</label><select onchange="atProp('forma', this.value, true, true)" style="flex:1;">
                ${A().FORMAS.filter(f => (A().FORMAS_LINHA.indexOf(f.id) >= 0) === linha).map(f => `<option value="${f.id}" ${f.id === el.forma ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
            </select></div>
            ${linha ? '' : campoCor('Preenchimento', el.preench, 'el', 'preench', true)}
            ${campoCor(linha ? 'Cor' : 'Borda', el.borda, 'el', 'borda')}
            ${faixa(linha ? 'Espessura' : 'Borda', el.bordaLarg, linha ? 1 : 0, 80, 1, 'el', 'bordaLarg', '')}
            ${(el.forma === 'ret' || el.forma === 'arred') ? faixa('Cantos', el.raio, 0, Math.round(Math.min(el.w, el.h) / 2), 1, 'el', 'raio', '') : ''}`;
    } else {
        especificos = `
            <div class="ed-linha"><label>Filtro</label><select onchange="atProp('filtro', this.value, true)" style="flex:1;">
                ${Object.keys(A().FILTROS).map(k => `<option value="${k}" ${k === el.filtro ? 'selected' : ''}>${esc(A().FILTROS[k])}</option>`).join('')}
            </select></div>
            <div class="ed-linha"><label>Recorte</label><div class="ed-grupo">
                <button class="ed-b ${el.recorte !== 'circulo' ? 'on' : ''}" onclick="atProp('recorte','',true,true)">▭ Retângulo</button>
                <button class="ed-b ${el.recorte === 'circulo' ? 'on' : ''}" onclick="atProp('recorte','circulo',true,true)">◯ Redondo</button></div></div>
            ${el.recorte !== 'circulo' ? faixa('Cantos', el.raio, 0, Math.round(Math.min(el.w, el.h) / 2), 1, 'el', 'raio', '') : ''}
            ${faixa('Moldura', el.bordaLarg, 0, 60, 1, 'el', 'bordaLarg', '')}
            ${el.bordaLarg > 0 ? campoCor('Cor moldura', el.borda, 'el', 'borda') : ''}
            <div class="ed-linha">${botaoLiga('⇋ Espelhar', 'espelhar', el.espelhar)}
                <button class="ed-b" onclick="atAcao('ajustarProporcao')" title="Volta a proporção original da foto">Proporção original</button></div>
            <h5>Mais</h5>
            <div class="ed-linha" style="flex-direction:column; align-items:stretch;">
                <button class="ed-b" onclick="atRemoverFundo()">🪄 Remover fundo liso</button>
                <button class="ed-b" onclick="atAcao('virarFundo')">🖼 Usar como fundo da folha</button>
                <button class="ed-b" onclick="atTrocarImagem()">⬆ Trocar a imagem</button>
            </div>
            <div id="atMsgImagem" class="ed-dica"></div>`;
    }
    return `<h4>${esc(tit)}</h4>${especificos}<h5>Arrumar</h5>${comuns}`;
}

function htmlPropsFolha() {
    const f = A().formato(atArte.formato);
    const usados = A().camposUsados(atArte).filter(c => c === 'nome' || c === 'turma');
    return `<h4>Folha</h4>
        <div class="ed-dica">${esc(f ? f.nome : 'Personalizado')} · ${atArte.largura} × ${atArte.altura} px</div>
        <div class="ed-linha"><button class="ed-b" onclick="atRedimensionarFolha()">📐 Mudar o tamanho</button></div>
        ${campoCor('Fundo', atArte.fundo.cor, 'fundo', 'cor')}
        <h5>Atalhos</h5>
        <div class="ed-dica">
            Clique para selecionar · dois cliques edita o texto<br>
            Arrastar move; perto do meio e das bordas, gruda (Alt solta)<br>
            Setas: move 1 px (com Shift, 10)<br>
            Ctrl+Z desfaz · Ctrl+D duplica · Delete apaga<br>
            Ctrl + rodinha: zoom
        </div>
        ${usados.length ? `<h5>Em lote</h5><div class="ed-dica">Esta arte usa ${usados.map(c => '<b>{' + c + '}</b>').join(' e ')}. Use <b>👥 Em lote</b> para gerar um PDF com uma página por estudante.</div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Acoes
// ---------------------------------------------------------------------------

function inserir(el, semSelecionar) {
    if (el.tipo === 'texto') ajustarTexto(el);
    atArte.elementos.push(el);
    registrar();
    if (!semSelecionar) { atSel = null; selecionar(el.id); }
    if (atAba === 'camadas') desenharPainel();
    pedirDesenho();
    return el;
}

function atAddTexto(i) {
    const base = Math.min(atArte.largura, atArte.altura);
    const pr = i >= 0 ? PRESETS_TEXTO[i].props : { escala: 14 };
    const props = Object.assign({}, pr, { tam: Math.round(base / pr.escala) });
    delete props.escala;
    if (!props.texto) props.texto = i >= 0 ? PRESETS_TEXTO[i].nome : 'Seu texto aqui';
    const p = A().paleta(atArte.paleta);
    if (!props.cor) props.cor = p.texto;
    const el = A().novoTexto(atArte, props);
    // nao nasce exatamente em cima do anterior
    const n = atArte.elementos.filter(e => e.tipo === 'texto').length % 5;
    el.y = Math.round(Math.max(0, el.y + (n - 2) * el.tam * 0.6));
    inserir(el);
}

function atInserirCampo(c) {
    const el = selecionado();
    const marca = '{' + c + '}';
    if (el && el.tipo === 'texto') {
        el.texto = (el.texto + (el.texto && !/\s$/.test(el.texto) ? ' ' : '') + marca).slice(0, 2000);
        ajustarTexto(el);
        registrar(); desenharProps(); pedirDesenho();
    } else {
        inserir(A().novoTexto(atArte, { texto: marca, cor: A().paleta(atArte.paleta).texto }));
    }
}

function atAddForma(f) {
    const p = A().paleta(atArte.paleta);
    const linha = A().FORMAS_LINHA.indexOf(f) >= 0;
    inserir(A().novaForma(atArte, f, linha ? { borda: p.secundaria } : { preench: p.primaria }));
}

function atAddFigurinha(emoji) {
    const tam = Math.round(Math.min(atArte.largura, atArte.altura) / 5);
    inserir(A().novoTexto(atArte, { texto: emoji, tam, w: Math.round(tam * 1.5), nome: 'Figurinha' }));
}

function atSelecionar(id) { selecionar(id); }

function atCamada(id, acao) {
    const el = atArte.elementos.find(e => e.id === id);
    if (!el) return;
    if (acao === 'oculto' || acao === 'travado') el[acao] = !el[acao];
    else A().moverCamada(atArte.elementos, id, acao);
    registrar(); desenharPainel(); desenharProps(); pedirDesenho();
}

function atAcao(acao) {
    const el = selecionado();
    if (!el) return;
    if (acao === 'apagar') {
        atArte.elementos = atArte.elementos.filter(e => e.id !== el.id);
        atSel = null;
    } else if (acao === 'duplicar') {
        const novo = A().duplicarElemento(el, Math.round(Math.min(atArte.largura, atArte.altura) * 0.02));
        const i = atArte.elementos.findIndex(e => e.id === el.id);
        atArte.elementos.splice(i + 1, 0, novo);
        atSel = novo.id;
    } else if (acao === 'travar') {
        el.travado = !el.travado;
    } else if (acao === 'frente' || acao === 'tras') {
        A().moverCamada(atArte.elementos, el.id, acao);
    } else if (acao === 'ajustarProporcao' && el.tipo === 'imagem') {
        const img = obterImagem(el.recurso);
        if (img) { const h = Math.round(el.w * img.naturalHeight / img.naturalWidth); el.y += Math.round((el.h - h) / 2); el.h = h; }
    } else if (acao === 'virarFundo' && el.tipo === 'imagem') {
        atArte.fundo.tipo = 'imagem'; atArte.fundo.recurso = el.recurso;
        atArte.elementos = atArte.elementos.filter(e => e.id !== el.id);
        atSel = null;
    }
    registrar(); desenharProps(); pedirDesenho();
    if (atAba === 'camadas' || atAba === 'fundo') desenharPainel();
}

function atAlinhar(modo) {
    const el = selecionado();
    if (!el || el.travado) return;
    A().alinharNaPagina(el, atArte, modo);
    registrar(); pedirDesenho();
}

const NUMERICOS = ['tam', 'entrelinha', 'espaco', 'contornoLarg', 'fundoRaio', 'bordaLarg', 'raio', 'opac', 'rot', 'x', 'y', 'w', 'h'];
const MEXEM_NO_TEXTO = ['texto', 'fonte', 'tam', 'negrito', 'italico', 'entrelinha', 'espaco', 'maiusculas', 'fundoCor'];

// Muda um campo do elemento selecionado. `registrarHist` false = arrastando o controle
// (so' redesenha); `redesenharPainel` = o painel mostra o estado novo (botao ligado etc).
function atProp(campo, valor, registrarHist, redesenharPainel) {
    const el = selecionado();
    if (!el) return;
    if (NUMERICOS.indexOf(campo) >= 0) { valor = Number(valor); if (!isFinite(valor)) return; }
    if (campo === 'tam') valor = Math.max(6, Math.min(1200, valor));
    el[campo] = valor;
    if (campo === 'forma') {
        const n = A().normalizarElemento(el);
        Object.assign(el, { raio: n.raio });
        if (valor === 'arred' && !el.raio) el.raio = Math.round(Math.min(el.w, el.h) * 0.15);
    }
    if (el.tipo === 'texto' && MEXEM_NO_TEXTO.indexOf(campo) >= 0) {
        ajustarTexto(el);
        if (campo !== 'texto' || document.activeElement && document.activeElement.id !== 'atTextoFolha') posicionarTextoFolha();
        const ta = $('atTextoFolha');
        if (ta && campo === 'texto' && ta.value !== valor) ta.value = valor;
    }
    pedirDesenho();
    if (registrarHist !== false) registrar(); else marcarMudanca();
    if (redesenharPainel || ['fundoCor', 'contornoLarg', 'bordaLarg', 'recorte'].indexOf(campo) >= 0 && registrarHist !== false) desenharProps();
    if (campo === 'texto' && atAba === 'camadas' && registrarHist !== false) desenharPainel();
}

function atFundo(campo, valor, registrarHist, redesenharPainel) {
    if (!atArte) return;
    if (campo === 'angulo' || campo === 'escurecer') valor = Number(valor);
    atArte.fundo[campo] = valor;
    if (campo === 'tipo' && valor === 'imagem' && !atArte.fundo.recurso) {
        const img = atArte.elementos.find(e => e.tipo === 'imagem');
        if (img) atArte.fundo.recurso = img.recurso;
    }
    pedirDesenho();
    if (registrarHist !== false) registrar(); else marcarMudanca();
    if (campo === 'tipo' || redesenharPainel) { if (atAba === 'fundo') desenharPainel(); desenharProps(); }
}

function atPaleta(id) {
    A().trocarPaleta(atArte, id);
    registrar(); desenharPainel(); desenharProps(); pedirDesenho();
}

function atTrocarModelo(id) {
    const nova = A().aplicarModelo(id, { paleta: undefined });
    if (!nova) return;
    terminarEdicaoTexto();
    // a arte continua a mesma (id, recursos); muda o desenho
    Object.assign(atArte, { formato: nova.formato, largura: nova.largura, altura: nova.altura, paleta: nova.paleta, fundo: nova.fundo, elementos: nova.elementos });
    if (atArte.titulo === 'Arte sem título') { atArte.titulo = nova.titulo; const t = $('atTitulo'); if (t) t.value = nova.titulo; }
    atSel = null;
    ajustarTodosTextos();
    registrar();
    atZoomAjustar();
    desenharProps();
}

// Mudar o tamanho da folha leva junto o que esta' nela, em escala, centralizado.
function atRedimensionarFolha() {
    const opcoes = A().FORMATOS.map((f, i) => (i + 1) + ') ' + f.nome + ' — ' + f.largura + '×' + f.altura).join('\n');
    const r = prompt('Novo tamanho da folha. Digite o número do formato ou largura x altura em pixels:\n\n' + opcoes, '');
    if (!r) return;
    let W, H, fid = 'livre';
    const n = parseInt(r, 10);
    const m = /(\d{2,5})\s*[x×*]\s*(\d{2,5})/i.exec(r);
    if (m) { W = +m[1]; H = +m[2]; }
    else if (n >= 1 && n <= A().FORMATOS.length) { const f = A().FORMATOS[n - 1]; W = f.largura; H = f.altura; fid = f.id; }
    else { alert('Não entendi. Digite o número do formato (1 a ' + A().FORMATOS.length + ') ou algo como 1200x800.'); return; }
    W = Math.max(100, Math.min(6000, W)); H = Math.max(100, Math.min(6000, H));
    const e = Math.min(W / atArte.largura, H / atArte.altura);
    const dx = (W - atArte.largura * e) / 2, dy = (H - atArte.altura * e) / 2;
    atArte.elementos.forEach(el => {
        el.x = Math.round(el.x * e + dx); el.y = Math.round(el.y * e + dy);
        el.w = Math.max(1, Math.round(el.w * e)); el.h = Math.max(1, Math.round(el.h * e));
        if (el.tipo === 'texto') { el.tam = Math.max(6, Math.round(el.tam * e * 10) / 10); el.contornoLarg = Math.round(el.contornoLarg * e); ajustarTexto(el); }
        if (el.bordaLarg) el.bordaLarg = Math.max(el.tipo === 'forma' && A().ehLinha(el) ? 1 : 0, Math.round(el.bordaLarg * e));
        if (el.raio) el.raio = Math.round(el.raio * e);
    });
    atArte.largura = W; atArte.altura = H; atArte.formato = fid;
    registrar(); atZoomAjustar(); desenharProps();
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

function lerArquivoImagem(arquivo) {
    return new Promise((ok, falha) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => {
            const escala = Math.min(1, MAX_LADO_IMAGEM / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * escala));
            c.height = Math.max(1, Math.round(img.naturalHeight * escala));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            const transparente = /png|gif|webp|svg/i.test(arquivo.type);
            ok({ src: transparente ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height });
        };
        img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir a imagem ' + (arquivo.name || ''))); };
        img.src = url;
    });
}

function novoRecurso(src) {
    const rid = A().novoId('r');
    atArte.recursos[rid] = src;
    return rid;
}

async function adicionarArquivos(arquivos) {
    for (const f of arquivos) {
        try {
            const r = await lerArquivoImagem(f);
            const el = A().novaImagem(atArte, novoRecurso(r.src), r.w, r.h, { nome: (f.name || 'Imagem').replace(/\.[^.]+$/, '').slice(0, 40) });
            inserir(el);
        } catch (e) { alert(e.message); }
    }
    if (atAba === 'imagens') desenharPainel();
}

function atArquivosEscolhidos(input) {
    const arquivos = Array.from(input.files || []);
    input.value = '';
    adicionarArquivos(arquivos);
}

function atReusarImagem(rid) {
    const src = atArte.recursos[rid];
    if (!src) return;
    const img = new Image();
    img.onload = () => inserir(A().novaImagem(atArte, rid, img.naturalWidth, img.naturalHeight));
    img.src = src;
}

async function atFundoImagem(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    try {
        const r = await lerArquivoImagem(f);
        atArte.fundo.tipo = 'imagem';
        atArte.fundo.recurso = novoRecurso(r.src);
        registrar(); desenharPainel(); pedirDesenho();
    } catch (e) { alert(e.message); }
}

function atTrocarImagem() {
    const el = selecionado();
    if (!el || el.tipo !== 'imagem') return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
            const r = await lerArquivoImagem(f);
            el.recurso = novoRecurso(r.src);
            el.h = Math.round(el.w * r.h / r.w);
            registrar(); pedirDesenho();
        } catch (e) { alert(e.message); }
    };
    inp.click();
}

// "Remover fundo liso": o mesmo algoritmo da aba IMG (img_operacoes.js), aplicado na
// imagem selecionada. Vira um recurso novo (o original continua na arte ate' salvar,
// entao o Desfazer funciona).
async function atRemoverFundo() {
    const el = selecionado();
    const msg = $('atMsgImagem');
    if (!el || el.tipo !== 'imagem') return;
    if (!window.IMGOPS || !IMGOPS.removerFundo) { if (msg) msg.innerHTML = '<span class="ed-erro">A ferramenta de imagem não carregou. Recarregue a página.</span>'; return; }
    const img = obterImagem(el.recurso);
    if (!img) return;
    if (msg) msg.textContent = 'Removendo o fundo... ⏳';
    await new Promise(r => setTimeout(r, 30));
    try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const saida = IMGOPS.removerFundo({ largura: d.width, altura: d.height, dados: d.data }, { tolerancia: 30, suavizar: 2 });
        ctx.putImageData(new ImageData(new Uint8ClampedArray(saida.dados), saida.largura, saida.altura), 0, 0);
        el.recurso = novoRecurso(c.toDataURL('image/png'));
        registrar(); pedirDesenho();
        if (msg) msg.textContent = 'Pronto. Funciona com fundo de uma cor só; se não ficou bom, ↶ Desfazer.';
    } catch (e) {
        if (msg) msg.innerHTML = '<span class="ed-erro">' + esc(e.message || String(e)) + '</span>';
    }
}

// ---------------------------------------------------------------------------
// IA dentro do editor
// ---------------------------------------------------------------------------

async function pedirIA(prompt) {
    if (typeof chamarIAEstruturada !== 'function') throw new Error('O assistente de IA não carregou. Recarregue a página.');
    return chamarIAEstruturada(prompt, null);
}

async function atIAEscrever() {
    if (!atPodeUsar('IA')) return;
    const pedido = (($('atIAPedido') || {}).value || '').trim();
    const msg = $('atIAMsg'), btn = $('atIABtn');
    if (!pedido) { msg.innerHTML = '<span class="ed-erro">Diga o que o texto deve falar.</span>'; return; }
    btn.disabled = true; msg.textContent = 'Escrevendo... ⏳';
    try {
        const contexto = atArte.elementos.filter(e => e.tipo === 'texto').map(e => e.texto).join(' | ').slice(0, 600);
        const texto = A().textoDaIA(await pedirIA(A().promptEscreverTexto(pedido, { contexto })));
        if (!texto) throw new Error('A IA não devolveu texto. Tente de novo.');
        const p = A().paleta(atArte.paleta);
        inserir(A().novoTexto(atArte, { texto, tam: Math.round(Math.min(atArte.largura, atArte.altura) / 20), cor: p.texto }));
        msg.textContent = 'Texto colocado na folha.';
    } catch (e) { msg.innerHTML = '<span class="ed-erro">' + esc(e.message || String(e)) + '</span>'; }
    finally { btn.disabled = false; }
}

async function atIAReescrever(como) {
    if (!atPodeUsar('IA')) return;
    const el = selecionado();
    const msg = $('atIAMsg2');
    if (!el || el.tipo !== 'texto') return;
    msg.textContent = 'Reescrevendo... ⏳';
    try {
        const texto = A().textoDaIA(await pedirIA(A().promptReescrever(el.texto, como)));
        if (!texto) throw new Error('A IA não devolveu texto. Tente de novo.');
        el.texto = texto;
        ajustarTexto(el);
        registrar(); desenharProps(); pedirDesenho();
        msg.textContent = 'Pronto. Não gostou? ↶ Desfazer.';
    } catch (e) { msg.innerHTML = '<span class="ed-erro">' + esc(e.message || String(e)) + '</span>'; }
}

async function atIARefazer() {
    if (!atPodeUsar('IA')) return;
    const pedido = (($('atIARefazer') || {}).value || '').trim();
    const msg = $('atIAMsg3'), btn = $('atIARefazerBtn');
    if (!pedido) { msg.innerHTML = '<span class="ed-erro">Descreva a arte.</span>'; return; }
    btn.disabled = true; msg.textContent = 'Montando... ⏳';
    try {
        await descobrirEscola();
        const nova = A().arteDaIA(await pedirIA(A().promptCriarComIA(pedido, { escola: atEscola })));
        if (!nova) throw new Error('A IA não devolveu uma arte que eu conseguisse usar. Tente com mais detalhes.');
        terminarEdicaoTexto();
        Object.assign(atArte, { formato: nova.formato, largura: nova.largura, altura: nova.altura, paleta: nova.paleta, fundo: nova.fundo, elementos: nova.elementos });
        atSel = null;
        ajustarTodosTextos();
        registrar(); atZoomAjustar(); desenharProps();
        msg.textContent = 'Nova versão na folha. Confira datas e locais.';
    } catch (e) { msg.innerHTML = '<span class="ed-erro">' + esc(e.message || String(e)) + '</span>'; }
    finally { btn.disabled = false; }
}

// ---------------------------------------------------------------------------
// Baixar, imprimir, lote
// ---------------------------------------------------------------------------

function atMenuBaixar(ev) {
    ev.stopPropagation();
    const velho = $('atMenu');
    if (velho) { velho.remove(); return; }
    const m = document.createElement('div');
    m.className = 'ed-menu'; m.id = 'atMenu';
    // fixo na tela: no celular a barra rola de lado e cortaria um menu preso nela
    const r = ev.currentTarget.getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.top = Math.round(r.bottom + 6) + 'px';
    m.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    m.innerHTML = `
        <button onclick="atBaixar('png')">🖼 <span>PNG<small>melhor qualidade, para tela e redes</small></span></button>
        <button onclick="atBaixar('jpg')">📷 <span>JPG<small>arquivo menor, para WhatsApp</small></span></button>
        <button onclick="atBaixar('pdf')">📕 <span>PDF<small>para imprimir no tamanho certo</small></span></button>
        <button onclick="atBaixar('imprimir')">🖨 <span>Imprimir</span></button>`;
    $('atEditor').appendChild(m);
    setTimeout(() => document.addEventListener('click', function fora() { m.remove(); document.removeEventListener('click', fora); }), 0);
}

function baixarBlob(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function canvasParaBlob(c, tipo, qualidade) {
    return new Promise((ok, falha) => c.toBlob(b => b ? ok(b) : falha(new Error('Não consegui gerar o arquivo.')), tipo, qualidade));
}

let jsPdfPromessa = null;
function carregarJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (jsPdfPromessa) return jsPdfPromessa;
    jsPdfPromessa = new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? ok(window.jspdf.jsPDF) : falha(new Error('O gerador de PDF não carregou.'));
        s.onerror = () => { jsPdfPromessa = null; falha(new Error('Não consegui baixar o gerador de PDF. Confira a internet e tente de novo.')); };
        document.head.appendChild(s);
    });
    return jsPdfPromessa;
}

// Monta um PDF com uma pagina por item de `paginas` (cada item = substituicoes).
async function montarPdf(arte, paginas, aoAvancar) {
    const JsPDF = await carregarJsPdf();
    const mm = A().tamanhoFolhaMm(arte);
    const orient = mm.w > mm.h ? 'landscape' : 'portrait';
    const pdf = new JsPDF({ orientation: orient, unit: 'mm', format: [mm.w, mm.h], compress: true });
    const escala = Math.min(1, 2400 / Math.max(arte.largura, arte.altura)) * (Math.max(arte.largura, arte.altura) < 1300 ? 1.6 : 1);
    for (let i = 0; i < paginas.length; i++) {
        if (i) pdf.addPage([mm.w, mm.h], orient);
        const arteDaPagina = A().copiar(arte);
        arteDaPagina.elementos.forEach(e => { if (e.tipo === 'texto') A().ajustarAlturaTexto(medidor(), e, paginas[i]); });
        const c = await renderizar(arteDaPagina, escala, paginas[i]);
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, mm.w, mm.h, undefined, 'FAST');
        if (aoAvancar) aoAvancar(i + 1, paginas.length);
        await new Promise(r => setTimeout(r, 0));
    }
    return pdf;
}

async function atBaixar(tipo) {
    const m = $('atMenu'); if (m) m.remove();
    if (!atArte) return;
    terminarEdicaoTexto();
    const st = $('atStatus');
    const antes = st ? st.textContent : '';
    if (st) st.textContent = 'Gerando o arquivo… ⏳';
    try {
        if (tipo === 'png' || tipo === 'jpg') {
            const c = await renderizar(atArte, 1);
            const blob = await canvasParaBlob(c, tipo === 'png' ? 'image/png' : 'image/jpeg', 0.92);
            baixarBlob(blob, A().nomeArquivo(atArte.titulo, tipo));
        } else if (tipo === 'pdf') {
            const pdf = await montarPdf(atArte, [subsAtuais()]);
            baixarBlob(pdf.output('blob'), A().nomeArquivo(atArte.titulo, 'pdf'));
        } else if (tipo === 'imprimir') {
            await imprimir(atArte);
        }
    } catch (e) {
        alert(e.message || String(e));
    } finally {
        if (st) { st.textContent = antes; atualizarStatus(); }
    }
}

async function imprimir(arte) {
    const c = await renderizar(arte, 1);
    const mm = A().tamanhoFolhaMm(arte);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write('<!doctype html><html><head><title>' + esc(arte.titulo) + '</title><style>@page{size:' + mm.w + 'mm ' + mm.h + 'mm; margin:0} html,body{margin:0} img{width:' + mm.w + 'mm; height:' + mm.h + 'mm; display:block}</style></head><body><img src="' + c.toDataURL('image/png') + '"></body></html>');
    d.close();
    const img = d.querySelector('img');
    await new Promise(r => { if (img.complete) r(); else img.onload = r; });
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
}

function turmasDoProfessor() {
    if (typeof data === 'undefined' || !data) return [];
    const ests = data.estudantes || [];
    return (data.turmas || []).map(t => ({
        id: t.id, nome: [t.nome, t.disciplina].filter(Boolean).join(' - '),
        rotulo: t.nome || '',
        alunos: ests.filter(e => e.id_turma == t.id && (!e.status || e.status === 'Ativo')).map(e => e.nome_completo).filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    })).filter(t => t.alunos.length);
}

function atAbrirLote() {
    if (!atPodeUsar('gerar em lote')) return;
    terminarEdicaoTexto();
    const usados = A().camposUsados(atArte);
    const turmas = turmasDoProfessor();
    const j = document.createElement('div');
    j.id = 'atJanela';
    j.innerHTML = `<div class="jn">
        <h3 style="margin-top:0;">👥 Gerar em lote</h3>
        <p style="font-size:14px; color:#3b4659; margin-top:0;">Um PDF com uma página por pessoa: cada página troca <b>{nome}</b> (e <b>{turma}</b>, se houver) pelo dado da lista.</p>
        ${usados.indexOf('nome') < 0 ? '<div style="background:#fffbeb; border:1px solid #f6ad55; color:#7b341e; border-radius:8px; padding:8px 10px; font-size:13px; margin-bottom:10px;">Esta arte ainda não tem <b>{nome}</b>. Coloque <b>{nome}</b> num texto (aba Texto → Campos automáticos) onde o nome deve aparecer.</div>' : ''}
        ${turmas.length ? `<label style="font-size:13px; font-weight:600;">Pegar os nomes de uma turma</label>
            <select id="atLoteTurma" onchange="atLoteTurma(this.value)" style="margin:4px 0 12px;">
                <option value="">— escolha —</option>${turmas.map(t => `<option value="${esc(t.id)}">${esc(t.nome)} (${t.alunos.length})</option>`).join('')}
            </select>` : ''}
        <label style="font-size:13px; font-weight:600;">Nomes, um por linha <span style="font-weight:400; color:#5f6b7f;">(pode ser “Nome;Turma”)</span></label>
        <textarea id="atLoteLista" rows="9" style="margin-top:4px;" placeholder="Ana Souza\nBruno Lima\nCarla Dias" oninput="atLoteContar()"></textarea>
        <div id="atLoteInfo" style="font-size:13px; color:#5f6b7f; margin:6px 0 12px;">0 página(s)</div>
        <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="document.getElementById('atJanela').remove()">Cancelar</button>
            <button class="btn btn-primary" id="atLoteBtn" onclick="atGerarLote()">Gerar PDF</button>
        </div></div>`;
    document.body.appendChild(j);
}

function atLoteTurma(id) {
    const t = turmasDoProfessor().find(x => String(x.id) === String(id));
    if (!t) return;
    $('atLoteLista').value = t.alunos.map(n => n + ';' + t.rotulo).join('\n');
    atLoteContar();
}

function atLoteContar() {
    const n = A().lerListaLote(($('atLoteLista') || {}).value).length;
    const info = $('atLoteInfo');
    if (info) info.textContent = n + ' página(s)' + (n >= 500 ? ' — o máximo é 500 por vez' : '');
}

async function atGerarLote() {
    const pessoas = A().lerListaLote(($('atLoteLista') || {}).value);
    const info = $('atLoteInfo'), btn = $('atLoteBtn');
    if (!pessoas.length) { info.innerHTML = '<span style="color:#b91c1c;">Coloque pelo menos um nome.</span>'; return; }
    btn.disabled = true;
    try {
        const paginas = pessoas.map(p => subsAtuais({ nome: p.nome, turma: p.turma }));
        const pdf = await montarPdf(atArte, paginas, (i, n) => { info.textContent = 'Gerando página ' + i + ' de ' + n + '… ⏳'; });
        baixarBlob(pdf.output('blob'), A().nomeArquivo(atArte.titulo + '-lote', 'pdf'));
        info.textContent = 'Pronto: ' + pessoas.length + ' página(s).';
        window.__atUltimoLote = pessoas.length;
    } catch (e) {
        info.innerHTML = '<span style="color:#b91c1c;">' + esc(e.message || String(e)) + '</span>';
    } finally { btn.disabled = false; }
}

// Para os testes olharem por dentro.
function atEstado() {
    return { vista: atArte ? 'editor' : 'inicio', arte: atArte, sel: atSel, zoom: atZoom, artes: atArtes,
             podeDesfazer: !!(atHist && atHist.podeDesfazer()), salvo: atEstadoSalvo };
}

window.renderAtelie = renderAtelie;
Object.assign(window, {
    atFiltrarModelos, atNovo, atNovoPersonalizado, atModelo, atAbrir, atDuplicarArte, atExcluirArte, atCriarIA,
    atSair, atRenomear, atDesfazer, atRefazer, atSalvarAgora, atZoomPasso, atZoomAjustar, atMudarAba,
    atTrocarModelo, atAddTexto, atInserirCampo, atAddForma, atAddFigurinha, atSelecionar, atCamada, atAcao, atAlinhar,
    atProp, atFundo, atPaleta, atRedimensionarFolha, atArquivosEscolhidos, atReusarImagem, atFundoImagem,
    atTrocarImagem, atRemoverFundo, atIAEscrever, atIAReescrever, atIARefazer, atMenuBaixar, atBaixar,
    atAbrirLote, atLoteTurma, atLoteContar, atGerarLote, atEstado,
    atComecarTexto: comecarEdicaoTexto, atRenderizar: renderizar
});

})();
