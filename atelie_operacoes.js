// atelie_operacoes.js — AS CONTAS DO "ATELIÊ", o editor de artes da escola.
//
// POR QUE ISTO EXISTE SEPARADO
//   A tela (atelie.js) cuida de clique, arrastar, painel e banco. Aqui mora o que e'
//   conta e desenho: o formato de uma arte, os modelos prontos, como o texto quebra em
//   linhas, como uma forma vira caminho no <canvas>, para onde vai uma caixa quando o
//   professor puxa a alca de um canto com a arte girada, onde a caixa "gruda" nas guias,
//   o desfazer/refazer, e como a resposta da IA vira arte. Sem navegador e sem banco,
//   isto roda no Node e e' testado com numero (testes/teste-atelie.js).
//
// O FORMATO DE UMA ARTE
//   { id, titulo, formato, largura, altura (pixels da arte final),
//     paleta (id da paleta de cores), fundo: { tipo:'cor'|'gradiente'|'imagem', cor, cor2,
//     angulo, recurso, escurecer }, elementos: [...], recursos: { rid: dataURL },
//     miniatura, criadoEm, atualizadoEm }
//
//   As imagens moram em `recursos` e os elementos guardam so' o id. Assim o desfazer
//   tira foto so' dos elementos (texto pequeno) e nao copia a foto inteira a cada passo.
//
//   Elemento: { id, tipo:'texto'|'forma'|'imagem', nome, x, y, w, h (caixa SEM giro, em
//   pixels da arte; x,y = canto de cima), rot (graus), opac (0..1), oculto, travado,
//   campo (rotulo do modelo: titulo, subtitulo, corpo, rodape — e' por ele que a IA
//   preenche o modelo), ... campos do tipo }.
//
// CAMPOS AUTOMATICOS NO TEXTO
//   {escola}, {professor}, {data}, {ano} aparecem ja' resolvidos na tela e no arquivo.
//   {nome} e {turma} ficam como estao, e o "Gerar em lote" troca por cada estudante
//   (um certificado por aluno, um cracha por aluno).

(function () {
'use strict';

const VERSAO = 1;
const DPI_PDF = 150;               // pixels da arte por polegada, para o tamanho da folha no PDF

const FORMATOS = [
    { id: 'a4r',      nome: 'Folha A4 (em pé)',     largura: 1240, altura: 1754, mm: [210, 297], grupo: 'Impressão' },
    { id: 'a4p',      nome: 'Folha A4 (deitada)',   largura: 1754, altura: 1240, mm: [297, 210], grupo: 'Impressão' },
    { id: 'a3',       nome: 'Cartaz A3',            largura: 1754, altura: 2480, mm: [297, 420], grupo: 'Impressão' },
    { id: 'convite',  nome: 'Convite 10×15',        largura: 1200, altura: 1800, mm: [100, 150], grupo: 'Impressão' },
    { id: 'cracha',   nome: 'Crachá 6×9',           largura: 708,  altura: 1063, mm: [60, 90],   grupo: 'Impressão' },
    { id: 'quadrado', nome: 'Post quadrado',        largura: 1080, altura: 1080, grupo: 'Tela' },
    { id: 'story',    nome: 'Story / celular',      largura: 1080, altura: 1920, grupo: 'Tela' },
    { id: 'slide',    nome: 'Slide 16:9',           largura: 1920, altura: 1080, grupo: 'Tela' },
    { id: 'faixa',    nome: 'Faixa / capa',         largura: 1800, altura: 600,  grupo: 'Tela' }
];

// Fontes que a tela carrega do Google Fonts quando o Ateliê abre (sem rede, o navegador
// usa a reserva da ultima coluna, e a arte continua editavel).
const FONTES = [
    { nome: 'Poppins',          reserva: 'sans-serif', google: 'Poppins:wght@400;700' },
    { nome: 'Montserrat',       reserva: 'sans-serif', google: 'Montserrat:wght@400;700;900' },
    { nome: 'Baloo 2',          reserva: 'sans-serif', google: 'Baloo+2:wght@400;700' },
    { nome: 'Fredoka',          reserva: 'sans-serif', google: 'Fredoka:wght@400;700' },
    { nome: 'Bebas Neue',       reserva: 'sans-serif', google: 'Bebas+Neue' },
    { nome: 'Patrick Hand',     reserva: 'cursive',    google: 'Patrick+Hand' },
    { nome: 'Caveat',           reserva: 'cursive',    google: 'Caveat:wght@400;700' },
    { nome: 'Pacifico',         reserva: 'cursive',    google: 'Pacifico' },
    { nome: 'Great Vibes',      reserva: 'cursive',    google: 'Great+Vibes' },
    { nome: 'Playfair Display', reserva: 'serif',      google: 'Playfair+Display:wght@400;700' },
    { nome: 'Merriweather',     reserva: 'serif',      google: 'Merriweather:wght@400;700' },
    { nome: 'Arial',            reserva: 'sans-serif' },
    { nome: 'Georgia',          reserva: 'serif' }
];
const FONTE_PADRAO = 'Poppins';

const FORMAS = [
    { id: 'ret',       nome: 'Retângulo' },
    { id: 'arred',     nome: 'Cantos redondos' },
    { id: 'circulo',   nome: 'Círculo' },
    { id: 'triangulo', nome: 'Triângulo' },
    { id: 'estrela',   nome: 'Estrela' },
    { id: 'coracao',   nome: 'Coração' },
    { id: 'losango',   nome: 'Losango' },
    { id: 'hexagono',  nome: 'Hexágono' },
    { id: 'seta',      nome: 'Seta' },
    { id: 'balao',     nome: 'Balão de fala' },
    { id: 'linha',     nome: 'Linha' },
    { id: 'setalinha', nome: 'Linha com seta' }
];
const FORMAS_LINHA = ['linha', 'setalinha'];

// Cada paleta tem os mesmos seis papeis. Os modelos pintam com os papeis, entao "trocar
// as cores" de uma arte e' trocar papel por papel (ver trocarPaleta).
const PALETAS = [
    { id: 'escola',   nome: 'Escola',       fundo: '#ffffff', claro: '#edf3fd', primaria: '#2563c9', secundaria: '#1c2536', destaque: '#f59f00', texto: '#1c2536' },
    { id: 'festa',    nome: 'Festa',        fundo: '#fff4e6', claro: '#ffe8cc', primaria: '#e8590c', secundaria: '#c2255c', destaque: '#fab005', texto: '#3b2a1a' },
    { id: 'natureza', nome: 'Natureza',     fundo: '#f4fce3', claro: '#d8f5a2', primaria: '#2b8a3e', secundaria: '#5c940d', destaque: '#fcc419', texto: '#1e3a1e' },
    { id: 'doce',     nome: 'Doce',         fundo: '#fff0f6', claro: '#ffdeeb', primaria: '#d6336c', secundaria: '#7048e8', destaque: '#fcc419', texto: '#3d2a3a' },
    { id: 'oceano',   nome: 'Oceano',       fundo: '#e7f5ff', claro: '#d0ebff', primaria: '#1971c2', secundaria: '#0c8599', destaque: '#ff922b', texto: '#0b2545' },
    { id: 'noite',    nome: 'Noite',        fundo: '#1b1f3b', claro: '#2c3168', primaria: '#ffd43b', secundaria: '#74c0fc', destaque: '#ff8787', texto: '#ffffff' },
    { id: 'sobrio',   nome: 'Sóbrio',       fundo: '#f8f9fa', claro: '#e9ecef', primaria: '#343a40', secundaria: '#868e96', destaque: '#c92a2a', texto: '#212529' }
];
const PAPEIS = ['fundo', 'claro', 'primaria', 'secundaria', 'destaque', 'texto'];

const FIGURINHAS = [
    { grupo: 'Escola',   itens: ['📚', '✏️', '🎒', '🏫', '📐', '🖍️', '🔬', '🧪', '🌍', '🎓', '📝', '🧮', '🎨', '🎵', '⚽', '💻'] },
    { grupo: 'Festa',    itens: ['🎉', '🎈', '🎂', '🎁', '⭐', '🌟', '🏆', '🥇', '🎊', '🪅', '🔥', '🌽', '🎆', '🥳', '👏', '💐'] },
    { grupo: 'Natureza', itens: ['🌻', '🌳', '🍎', '🌈', '☀️', '🌙', '🦋', '🐝', '🌱', '🍀', '🌊', '❄️', '🐢', '🦁', '🐶', '🐱'] },
    { grupo: 'Avisos',   itens: ['📢', '⚠️', '✅', '❌', '📅', '⏰', '📌', '💡', '❤️', '👉', '❓', '❗', '📍', '🎟️', '☎️', '✉️'] }
];

const CAMPOS = { titulo: 'Título', subtitulo: 'Subtítulo', corpo: 'Texto principal', rodape: 'Rodapé' };

const MAX_TEXTO = 2000;
const MIN_LADO = 8;

// ---------------------------------------------------------------------------
// Pequenas ajudas
// ---------------------------------------------------------------------------

function novoId(prefixo) {
    return (prefixo || 'e') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function num(v, padrao, min, max) {
    let n = Number(v);
    if (!isFinite(n)) n = padrao;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
}
function cor(v, padrao) {
    const s = String(v == null ? '' : v).trim();
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) return s.toLowerCase();
    if (s === '' && padrao === '') return '';
    return padrao == null ? '#000000' : padrao;
}
function txt(v, max) { return String(v == null ? '' : v).slice(0, max || MAX_TEXTO); }
function copiar(o) { return JSON.parse(JSON.stringify(o)); }
function formato(id) { return FORMATOS.find(f => f.id === id) || null; }
function paleta(id) { return PALETAS.find(p => p.id === id) || PALETAS[0]; }
function fonte(nome) { return FONTES.find(f => f.nome === nome) || null; }

// ---------------------------------------------------------------------------
// Arte e elementos
// ---------------------------------------------------------------------------

function novaArte(formatoId, opcoes) {
    opcoes = opcoes || {};
    const f = formato(formatoId) || FORMATOS[0];
    const largura = opcoes.largura ? num(opcoes.largura, f.largura, 100, 6000) : f.largura;
    const altura = opcoes.altura ? num(opcoes.altura, f.altura, 100, 6000) : f.altura;
    const agora = Date.now();
    return {
        id: novoId('arte'), versao: VERSAO, titulo: opcoes.titulo || 'Arte sem título',
        formato: opcoes.largura ? 'livre' : f.id, largura, altura,
        paleta: 'escola',
        fundo: { tipo: 'cor', cor: '#ffffff', cor2: '#edf3fd', angulo: 180, recurso: '', escurecer: 0 },
        elementos: [], recursos: {}, miniatura: '', criadoEm: agora, atualizadoEm: agora
    };
}

const PADROES = {
    texto: { texto: 'Seu texto aqui', fonte: FONTE_PADRAO, tam: 64, cor: '#1c2536', negrito: false, italico: false,
             sublinhado: false, alinh: 'center', entrelinha: 1.2, espaco: 0, maiusculas: false,
             contornoCor: '#ffffff', contornoLarg: 0, sombra: false, fundoCor: '', fundoRaio: 12 },
    forma: { forma: 'ret', preench: '#2563c9', borda: '#1c2536', bordaLarg: 0, raio: 0 },
    imagem: { recurso: '', raio: 0, recorte: '', filtro: '', espelhar: false, borda: '#ffffff', bordaLarg: 0 }
};
const FILTROS = { '': 'Original', pb: 'Preto e branco', sepia: 'Sépia', vivo: 'Cores vivas', suave: 'Suave', escuro: 'Escuro' };
const FILTROS_CSS = { pb: 'grayscale(1)', sepia: 'sepia(0.85)', vivo: 'saturate(1.6) contrast(1.08)', suave: 'contrast(0.85) brightness(1.08) saturate(0.8)', escuro: 'brightness(0.7)' };

function normalizarElemento(e) {
    e = e || {};
    const tipo = PADROES[e.tipo] ? e.tipo : 'forma';
    const base = {
        id: e.id ? String(e.id).slice(0, 40) : novoId('e'), tipo,
        nome: txt(e.nome, 60), campo: CAMPOS[e.campo] ? e.campo : '',
        x: num(e.x, 0, -20000, 20000), y: num(e.y, 0, -20000, 20000),
        w: num(e.w, 200, 1, 20000), h: num(e.h, 100, 1, 20000),
        rot: ((num(e.rot, 0) % 360) + 360) % 360,
        opac: num(e.opac, 1, 0, 1), oculto: !!e.oculto, travado: !!e.travado
    };
    const p = PADROES[tipo];
    if (tipo === 'texto') {
        return Object.assign(base, {
            texto: txt(e.texto == null ? p.texto : e.texto),
            fonte: fonte(e.fonte) ? e.fonte : p.fonte,
            tam: num(e.tam, p.tam, 6, 1200), cor: cor(e.cor, p.cor),
            negrito: !!e.negrito, italico: !!e.italico, sublinhado: !!e.sublinhado,
            alinh: ['left', 'center', 'right'].indexOf(e.alinh) >= 0 ? e.alinh : p.alinh,
            entrelinha: num(e.entrelinha, p.entrelinha, 0.6, 4), espaco: num(e.espaco, 0, -20, 200),
            maiusculas: !!e.maiusculas, contornoCor: cor(e.contornoCor, p.contornoCor),
            contornoLarg: num(e.contornoLarg, 0, 0, 80), sombra: !!e.sombra,
            fundoCor: cor(e.fundoCor, ''), fundoRaio: num(e.fundoRaio, p.fundoRaio, 0, 400)
        });
    }
    if (tipo === 'forma') {
        const forma = FORMAS.some(f => f.id === e.forma) ? e.forma : 'ret';
        return Object.assign(base, {
            // preench '' = sem preenchimento (moldura so' com borda)
            forma, preench: e.preench === '' ? '' : cor(e.preench, FORMAS_LINHA.indexOf(forma) >= 0 ? '' : p.preench),
            borda: cor(e.borda, p.borda),
            bordaLarg: num(e.bordaLarg, FORMAS_LINHA.indexOf(forma) >= 0 ? 8 : 0, 0, 200),
            raio: num(e.raio, forma === 'arred' ? 40 : 0, 0, 5000)
        });
    }
    return Object.assign(base, {
        recurso: txt(e.recurso, 60), raio: num(e.raio, 0, 0, 5000),
        recorte: e.recorte === 'circulo' ? 'circulo' : '',
        filtro: FILTROS[e.filtro] != null ? e.filtro : '', espelhar: !!e.espelhar,
        borda: cor(e.borda, p.borda), bordaLarg: num(e.bordaLarg, 0, 0, 200)
    });
}

function normalizarArte(a) {
    a = a || {};
    const base = novaArte(formato(a.formato) ? a.formato : 'a4r');
    const f = a.fundo || {};
    const arte = Object.assign(base, {
        id: a.id ? String(a.id).slice(0, 60) : base.id,
        titulo: txt(a.titulo || base.titulo, 120),
        formato: formato(a.formato) ? a.formato : 'livre',
        largura: num(a.largura, base.largura, 100, 6000), altura: num(a.altura, base.altura, 100, 6000),
        paleta: PALETAS.some(p => p.id === a.paleta) ? a.paleta : 'escola',
        fundo: {
            tipo: ['cor', 'gradiente', 'imagem'].indexOf(f.tipo) >= 0 ? f.tipo : 'cor',
            cor: cor(f.cor, '#ffffff'), cor2: cor(f.cor2, '#edf3fd'), angulo: num(f.angulo, 180, 0, 360),
            recurso: txt(f.recurso, 60), escurecer: num(f.escurecer, 0, 0, 0.9)
        },
        elementos: Array.isArray(a.elementos) ? a.elementos.slice(0, 400).map(normalizarElemento) : [],
        recursos: (a.recursos && typeof a.recursos === 'object') ? Object.assign({}, a.recursos) : {},
        miniatura: typeof a.miniatura === 'string' ? a.miniatura : '',
        modelo: typeof a.modelo === 'string' ? a.modelo.slice(0, 40) : '',
        criadoEm: num(a.criadoEm, base.criadoEm), atualizadoEm: num(a.atualizadoEm, base.atualizadoEm)
    });
    return arte;
}

function novoTexto(arte, props) {
    props = props || {};
    const tam = props.tam || Math.round(Math.min(arte.largura, arte.altura) / 14);
    const w = props.w || Math.round(arte.largura * 0.7);
    const el = normalizarElemento(Object.assign({ tipo: 'texto', tam, w, h: tam * 1.2, nome: 'Texto' }, props));
    if (props.x == null) el.x = Math.round((arte.largura - el.w) / 2);
    if (props.y == null) el.y = Math.round((arte.altura - el.h) / 2);
    return el;
}

function novaForma(arte, forma, props) {
    const lado = Math.round(Math.min(arte.largura, arte.altura) * 0.3);
    const ehLinha = FORMAS_LINHA.indexOf(forma) >= 0;
    const w = ehLinha ? Math.round(arte.largura * 0.5) : lado;
    const h = ehLinha ? 40 : (forma === 'seta' ? Math.round(lado * 0.6) : lado);
    const nome = (FORMAS.find(f => f.id === forma) || {}).nome || 'Forma';
    return normalizarElemento(Object.assign({
        tipo: 'forma', forma, nome, w, h,
        x: Math.round((arte.largura - w) / 2), y: Math.round((arte.altura - h) / 2)
    }, props || {}));
}

function novaImagem(arte, recurso, larguraNatural, alturaNatural, props) {
    const proporcao = (larguraNatural && alturaNatural) ? alturaNatural / larguraNatural : 1;
    let w = Math.round(arte.largura * 0.5);
    let h = Math.round(w * proporcao);
    if (h > arte.altura * 0.7) { h = Math.round(arte.altura * 0.7); w = Math.round(h / proporcao); }
    return normalizarElemento(Object.assign({
        tipo: 'imagem', nome: 'Imagem', recurso, w, h,
        x: Math.round((arte.largura - w) / 2), y: Math.round((arte.altura - h) / 2)
    }, props || {}));
}

function duplicarElemento(el, deslocamento) {
    const d = deslocamento == null ? 30 : deslocamento;
    const c = copiar(el);
    c.id = novoId('e'); c.x += d; c.y += d; c.travado = false;
    return normalizarElemento(c);
}

// Recursos (imagens) que nenhum elemento nem o fundo usa mais.
function podarRecursos(arte) {
    const usados = new Set();
    arte.elementos.forEach(e => { if (e.tipo === 'imagem' && e.recurso) usados.add(e.recurso); });
    if (arte.fundo && arte.fundo.tipo === 'imagem' && arte.fundo.recurso) usados.add(arte.fundo.recurso);
    Object.keys(arte.recursos || {}).forEach(k => { if (!usados.has(k)) delete arte.recursos[k]; });
    return arte;
}

// ---------------------------------------------------------------------------
// Camadas (a ordem do vetor e' a ordem de desenho: o ultimo fica por cima)
// ---------------------------------------------------------------------------

function moverCamada(elementos, id, modo) {
    const i = elementos.findIndex(e => e.id === id);
    if (i < 0) return elementos;
    const [el] = elementos.splice(i, 1);
    let j = i;
    if (modo === 'frente') j = elementos.length;
    else if (modo === 'tras') j = 0;
    else if (modo === 'subir') j = Math.min(elementos.length, i + 1);
    else if (modo === 'descer') j = Math.max(0, i - 1);
    elementos.splice(j, 0, el);
    return elementos;
}

// Alinhar a pagina. Usa a caixa que o elemento ocupa ja' girado.
function alinharNaPagina(el, arte, modo) {
    const c = caixaOcupada(el);
    const dx = { esquerda: -c.x, centroH: (arte.largura - c.w) / 2 - c.x, direita: arte.largura - c.w - c.x }[modo];
    const dy = { topo: -c.y, centroV: (arte.altura - c.h) / 2 - c.y, base: arte.altura - c.h - c.y }[modo];
    if (dx != null) el.x = Math.round(el.x + dx);
    if (dy != null) el.y = Math.round(el.y + dy);
    return el;
}

// ---------------------------------------------------------------------------
// Geometria: giro, clique, alcas, redimensionar, encaixe
// ---------------------------------------------------------------------------

function centro(el) { return { x: el.x + el.w / 2, y: el.y + el.h / 2 }; }
function girar(px, py, graus) {
    const r = graus * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return { x: px * c - py * s, y: px * s + py * c };
}
// Ponto da arte -> coordenada local do elemento (origem no centro, sem giro).
function paraLocal(el, px, py) {
    const c = centro(el);
    return girar(px - c.x, py - c.y, -el.rot);
}
function paraArte(el, lx, ly) {
    const c = centro(el);
    const p = girar(lx, ly, el.rot);
    return { x: c.x + p.x, y: c.y + p.y };
}

// A caixa reta que o elemento ocupa depois do giro (para encaixe e alinhamento).
function caixaOcupada(el) {
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => paraArte(el, a * el.w / 2, b * el.h / 2));
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x, y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
}

function ehLinha(el) { return el.tipo === 'forma' && FORMAS_LINHA.indexOf(el.forma) >= 0; }

// `folga` (pixels da arte) deixa uma linha fina clicavel.
function pontoNoElemento(el, px, py, folga) {
    const l = paraLocal(el, px, py);
    const f = folga || 0;
    const meiaAltura = ehLinha(el) ? Math.max(el.h / 2, f) : el.h / 2 + f;
    return Math.abs(l.x) <= el.w / 2 + f && Math.abs(l.y) <= meiaAltura;
}

function elementoNoPonto(arte, px, py, folga) {
    for (let i = arte.elementos.length - 1; i >= 0; i--) {
        const el = arte.elementos[i];
        if (!el.oculto && pontoNoElemento(el, px, py, folga)) return el;
    }
    return null;
}

// Quais alcas o elemento tem. Texto: cantos (mudam o tamanho da letra) e laterais (mudam
// a largura da caixa; a altura segue o texto). Linha: so' as pontas.
function alcasDoElemento(el) {
    if (ehLinha(el)) return ['w', 'e', 'rot'];
    if (el.tipo === 'texto') return ['nw', 'ne', 'se', 'sw', 'w', 'e', 'rot'];
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
}

// Posicao de cada alca na arte. `distRot` e' a distancia (em pixels da arte) da alca de
// girar acima da caixa — a tela passa um valor que da' sempre o mesmo tamanho na tela.
function posicoesAlcas(el, distRot) {
    const meioW = el.w / 2, meioH = el.h / 2;
    const locais = {
        nw: [-meioW, -meioH], n: [0, -meioH], ne: [meioW, -meioH], e: [meioW, 0],
        se: [meioW, meioH], s: [0, meioH], sw: [-meioW, meioH], w: [-meioW, 0],
        rot: [0, -meioH - (distRot == null ? 40 : distRot)]
    };
    const r = {};
    alcasDoElemento(el).forEach(a => { r[a] = paraArte(el, locais[a][0], locais[a][1]); });
    return r;
}

function alcaNoPonto(el, px, py, raio, distRot) {
    const pos = posicoesAlcas(el, distRot);
    let melhor = null, dMelhor = Infinity;
    Object.keys(pos).forEach(a => {
        const d = Math.hypot(pos[a].x - px, pos[a].y - py);
        if (d <= raio && d < dMelhor) { melhor = a; dMelhor = d; }
    });
    return melhor;
}

// Puxar a alca `alca` do elemento `orig` ate' o ponto (px,py) da arte. O canto (ou lado)
// oposto fica parado, mesmo com a arte girada. `proporcional` mantem a proporcao (cantos
// de imagem e de texto ja' vem assim). Devolve a geometria nova e o fator de escala.
function redimensionar(orig, alca, px, py, proporcional) {
    const l = paraLocal(orig, px, py);
    let esq = -orig.w / 2, dir = orig.w / 2, cima = -orig.h / 2, baixo = orig.h / 2;
    const min = MIN_LADO;
    if (alca.indexOf('w') >= 0) esq = Math.min(l.x, dir - min);
    if (alca.indexOf('e') >= 0) dir = Math.max(l.x, esq + min);
    if (alca.indexOf('n') >= 0) cima = Math.min(l.y, baixo - min);
    if (alca.indexOf('s') >= 0) baixo = Math.max(l.y, cima + min);
    let w = dir - esq, h = baixo - cima;
    let escala = 1;
    const canto = alca.length === 2;
    if (proporcional && canto) {
        escala = Math.max(w / orig.w, h / orig.h);
        w = orig.w * escala; h = orig.h * escala;
        if (alca.indexOf('w') >= 0) esq = dir - w; else dir = esq + w;
        if (alca.indexOf('n') >= 0) cima = baixo - h; else baixo = cima + h;
    } else if (alca === 'e' || alca === 'w') {
        escala = w / orig.w;
    }
    const meio = girar((esq + dir) / 2, (cima + baixo) / 2, orig.rot);
    const c = centro(orig);
    const cx = c.x + meio.x, cy = c.y + meio.y;
    return { x: cx - w / 2, y: cy - h / 2, w, h, escala };
}

// Angulo da alca de girar: 0 grau = alca para cima. Gruda de 45 em 45 graus quando chega
// perto (ou sempre de 15 em 15, com `passo`).
function anguloGiro(el, px, py, passo) {
    const c = centro(el);
    let a = Math.atan2(px - c.x, -(py - c.y)) * 180 / Math.PI;
    a = (a + 360) % 360;
    if (passo) return (Math.round(a / passo) * passo) % 360;
    const perto = Math.round(a / 45) * 45;
    if (Math.abs(a - perto) < 4) a = perto % 360;
    return Math.round(a * 10) / 10;
}

// Encaixe: as bordas e o meio da caixa grudam nas bordas e no meio da pagina e dos outros
// elementos quando chegam a menos de `limiar`. Devolve o deslocamento e as guias a mostrar.
function encaixar(el, arte, limiar) {
    const c = caixaOcupada(el);
    const alvosX = [0, arte.largura / 2, arte.largura], alvosY = [0, arte.altura / 2, arte.altura];
    arte.elementos.forEach(o => {
        if (o.id === el.id || o.oculto) return;
        const k = caixaOcupada(o);
        alvosX.push(k.x, k.x + k.w / 2, k.x + k.w);
        alvosY.push(k.y, k.y + k.h / 2, k.y + k.h);
    });
    const melhor = (meus, alvos) => {
        let r = null;
        meus.forEach(m => alvos.forEach(a => {
            const d = a - m;
            if (Math.abs(d) <= limiar && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, pos: a };
        }));
        return r;
    };
    const mx = melhor([c.x, c.x + c.w / 2, c.x + c.w], alvosX);
    const my = melhor([c.y, c.y + c.h / 2, c.y + c.h], alvosY);
    const guias = [];
    if (mx) guias.push({ eixo: 'v', pos: mx.pos });
    if (my) guias.push({ eixo: 'h', pos: my.pos });
    return { dx: mx ? mx.d : 0, dy: my ? my.d : 0, guias };
}

// ---------------------------------------------------------------------------
// Texto: campos automaticos, fonte, quebra de linha
// ---------------------------------------------------------------------------

function substituir(texto, subs) {
    if (!subs) return texto;
    return String(texto).replace(/\{(nome|turma|escola|professor|data|ano)\}/gi, (m, k) => {
        const v = subs[k.toLowerCase()];
        return (v == null || v === '') ? m : String(v);
    });
}

function camposUsados(arte) {
    const achados = new Set();
    arte.elementos.forEach(e => {
        if (e.tipo !== 'texto') return;
        (e.texto.match(/\{(nome|turma|escola|professor|data|ano)\}/gi) || []).forEach(m => achados.add(m.slice(1, -1).toLowerCase()));
    });
    return Array.from(achados);
}

function fonteCss(el, tam) {
    const f = fonte(el.fonte) || FONTES[0];
    return (el.italico ? 'italic ' : '') + (el.negrito ? '700 ' : '400 ') + (tam || el.tam) + 'px "' + f.nome + '", ' + f.reserva;
}

function preparoTexto(el) {
    return { pad: el.fundoCor ? Math.round(el.tam * 0.3) : 0 };
}

// Quebra o texto na largura da caixa. `ctx` precisa de font/measureText (no Node, o teste
// passa um falso). Palavra maior que a linha e' quebrada por letra.
function quebrarLinhas(ctx, el, subs) {
    ctx.font = fonteCss(el);
    if ('letterSpacing' in ctx) ctx.letterSpacing = (el.espaco || 0) + 'px';
    let conteudo = substituir(el.texto, subs);
    if (el.maiusculas) conteudo = conteudo.toLocaleUpperCase('pt-BR');
    const { pad } = preparoTexto(el);
    const max = Math.max(1, el.w - pad * 2);
    const medir = s => ctx.measureText(s).width;
    const linhas = [];
    conteudo.split('\n').forEach(par => {
        const palavras = par.split(/ +/);
        let atual = '';
        palavras.forEach(p => {
            const tentativa = atual ? atual + ' ' + p : p;
            if (medir(tentativa) <= max || !atual) {
                atual = tentativa;
            } else {
                linhas.push(atual);
                atual = p;
            }
            // palavra sozinha maior que a linha: corta por letra
            while (medir(atual) > max && atual.length > 1) {
                let i = atual.length - 1;
                while (i > 1 && medir(atual.slice(0, i)) > max) i--;
                linhas.push(atual.slice(0, i));
                atual = atual.slice(i);
            }
        });
        linhas.push(atual);
    });
    const alturaLinha = el.tam * el.entrelinha;
    return { linhas, alturaLinha, altura: Math.max(alturaLinha, linhas.length * alturaLinha) + pad * 2, pad };
}

// A altura da caixa de texto acompanha o texto. Chame depois de mudar texto, fonte,
// tamanho ou largura. O topo fica no lugar.
function ajustarAlturaTexto(ctx, el, subs) {
    if (el.tipo !== 'texto') return el;
    el.h = Math.ceil(quebrarLinhas(ctx, el, subs).altura);
    return el;
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

function caminhoRetangulo(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function caminhoPoligono(ctx, pts) {
    pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
}

// O caminho da forma, centrado em (0,0).
function caminhoForma(ctx, el) {
    const w = el.w, h = el.h, mw = w / 2, mh = h / 2;
    ctx.beginPath();
    switch (el.forma) {
        case 'circulo':
            ctx.ellipse(0, 0, mw, mh, 0, 0, Math.PI * 2);
            break;
        case 'triangulo':
            caminhoPoligono(ctx, [[0, -mh], [mw, mh], [-mw, mh]]);
            break;
        case 'losango':
            caminhoPoligono(ctx, [[0, -mh], [mw, 0], [0, mh], [-mw, 0]]);
            break;
        case 'hexagono':
            caminhoPoligono(ctx, [[-mw / 2, -mh], [mw / 2, -mh], [mw, 0], [mw / 2, mh], [-mw / 2, mh], [-mw, 0]]);
            break;
        case 'estrela': {
            const pts = [];
            for (let i = 0; i < 10; i++) {
                const raio = i % 2 ? 0.45 : 1;
                const a = -Math.PI / 2 + i * Math.PI / 5;
                pts.push([Math.cos(a) * mw * raio, Math.sin(a) * mh * raio * 1.05 + mh * 0.05]);
            }
            caminhoPoligono(ctx, pts);
            break;
        }
        case 'coracao':
            ctx.moveTo(0, mh);
            ctx.bezierCurveTo(-mw * 1.1, mh * 0.1, -mw * 0.9, -mh * 1.15, 0, -mh * 0.45);
            ctx.bezierCurveTo(mw * 0.9, -mh * 1.15, mw * 1.1, mh * 0.1, 0, mh);
            ctx.closePath();
            break;
        case 'seta': {
            const corpo = h * 0.22, ponta = Math.min(w * 0.45, h * 0.9);
            caminhoPoligono(ctx, [[-mw, -corpo], [mw - ponta, -corpo], [mw - ponta, -mh], [mw, 0],
                                  [mw - ponta, mh], [mw - ponta, corpo], [-mw, corpo]]);
            break;
        }
        case 'balao': {
            const hc = h * 0.78, r = Math.min(w, hc) * 0.22;
            const x = -mw, y = -mh;
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + hc - r); ctx.arcTo(x + w, y + hc, x + w - r, y + hc, r);
            ctx.lineTo(x + w * 0.42, y + hc); ctx.lineTo(x + w * 0.2, y + h); ctx.lineTo(x + w * 0.26, y + hc);
            ctx.lineTo(x + r, y + hc); ctx.arcTo(x, y + hc, x, y + hc - r, r);
            ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
            break;
        }
        case 'linha':
        case 'setalinha':
            ctx.moveTo(-mw, 0); ctx.lineTo(mw, 0);
            break;
        default:
            caminhoRetangulo(ctx, -mw, -mh, w, h, el.forma === 'arred' ? (el.raio || 40) : el.raio);
    }
}

function desenharForma(ctx, el) {
    if (ehLinha(el)) {
        const larg = Math.max(1, el.bordaLarg || 1);
        ctx.strokeStyle = el.borda; ctx.lineWidth = larg; ctx.lineCap = 'round';
        const ponta = el.forma === 'setalinha' ? Math.min(el.w * 0.4, larg * 3.2) : 0;
        ctx.beginPath(); ctx.moveTo(-el.w / 2, 0); ctx.lineTo(el.w / 2 - ponta * 0.6, 0); ctx.stroke();
        if (ponta) {
            ctx.fillStyle = el.borda;
            ctx.beginPath();
            ctx.moveTo(el.w / 2, 0); ctx.lineTo(el.w / 2 - ponta, -ponta * 0.7); ctx.lineTo(el.w / 2 - ponta, ponta * 0.7);
            ctx.closePath(); ctx.fill();
        }
        return;
    }
    caminhoForma(ctx, el);
    if (el.preench) { ctx.fillStyle = el.preench; ctx.fill(); }
    if (el.bordaLarg > 0) { ctx.strokeStyle = el.borda; ctx.lineWidth = el.bordaLarg; ctx.lineJoin = 'round'; ctx.stroke(); }
}

function desenharTexto(ctx, el, subs) {
    const q = quebrarLinhas(ctx, el, subs);
    const altura = Math.max(el.h, q.altura);
    if (el.fundoCor) {
        ctx.fillStyle = el.fundoCor;
        ctx.beginPath(); caminhoRetangulo(ctx, -el.w / 2, -altura / 2, el.w, altura, el.fundoRaio); ctx.fill();
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = el.alinh;
    const x = el.alinh === 'left' ? -el.w / 2 + q.pad : (el.alinh === 'right' ? el.w / 2 - q.pad : 0);
    const topo = -altura / 2 + q.pad;
    if (el.sombra) {
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = el.tam * 0.18;
        ctx.shadowOffsetX = el.tam * 0.04; ctx.shadowOffsetY = el.tam * 0.06;
    }
    q.linhas.forEach((linha, i) => {
        const y = topo + q.alturaLinha * (i + 0.5);
        if (el.contornoLarg > 0) {
            ctx.strokeStyle = el.contornoCor; ctx.lineWidth = el.contornoLarg * 2; ctx.lineJoin = 'round';
            ctx.strokeText(linha, x, y);
        }
        ctx.fillStyle = el.cor;
        ctx.fillText(linha, x, y);
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    if (el.sublinhado) {
        ctx.fillStyle = el.cor;
        q.linhas.forEach((linha, i) => {
            const larg = ctx.measureText(linha).width;
            const ini = el.alinh === 'left' ? x : (el.alinh === 'right' ? x - larg : x - larg / 2);
            ctx.fillRect(ini, topo + q.alturaLinha * (i + 0.5) + el.tam * 0.42, larg, Math.max(1, el.tam * 0.06));
        });
    }
}

// `img` e' a imagem ja' carregada (ou null: desenha um quadro cinza no lugar).
function desenharImagem(ctx, el, img) {
    const w = el.w, h = el.h;
    ctx.save();
    ctx.beginPath();
    if (el.recorte === 'circulo') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    else caminhoRetangulo(ctx, -w / 2, -h / 2, w, h, el.raio);
    ctx.clip();
    if (img && (img.naturalWidth || img.width)) {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        // preencher a caixa sem esticar: corta o que sobra
        const escala = Math.max(w / iw, h / ih);
        const dw = iw * escala, dh = ih * escala;
        if (el.filtro && FILTROS_CSS[el.filtro] && 'filter' in ctx) ctx.filter = FILTROS_CSS[el.filtro];
        if (el.espelhar) ctx.scale(-1, 1);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        if ('filter' in ctx) ctx.filter = 'none';
    } else {
        ctx.fillStyle = '#e3e8ef'; ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = '#8a94a6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = Math.max(12, Math.min(w, h) / 8) + 'px sans-serif';
        ctx.fillText('imagem', 0, 0);
    }
    ctx.restore();
    if (el.bordaLarg > 0) {
        ctx.beginPath();
        if (el.recorte === 'circulo') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        else caminhoRetangulo(ctx, -w / 2, -h / 2, w, h, el.raio);
        ctx.strokeStyle = el.borda; ctx.lineWidth = el.bordaLarg; ctx.stroke();
    }
}

function desenharElemento(ctx, el, opcoes) {
    opcoes = opcoes || {};
    const c = centro(el);
    ctx.save();
    ctx.translate(c.x, c.y);
    if (el.rot) ctx.rotate(el.rot * Math.PI / 180);
    ctx.globalAlpha = el.opac;
    if (el.tipo === 'texto') desenharTexto(ctx, el, opcoes.subs);
    else if (el.tipo === 'imagem') desenharImagem(ctx, el, opcoes.imagem ? opcoes.imagem(el.recurso) : null);
    else desenharForma(ctx, el);
    ctx.restore();
}

function desenharFundo(ctx, arte, imagem) {
    const f = arte.fundo, W = arte.largura, H = arte.altura;
    ctx.save();
    if (f.tipo === 'gradiente') {
        const a = (f.angulo - 90) * Math.PI / 180;
        const r = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2;
        const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
        g.addColorStop(0, f.cor); g.addColorStop(1, f.cor2);
        ctx.fillStyle = g;
    } else {
        ctx.fillStyle = f.cor;
    }
    ctx.fillRect(0, 0, W, H);
    if (f.tipo === 'imagem') {
        const img = imagem ? imagem(f.recurso) : null;
        if (img && (img.naturalWidth || img.width)) {
            const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
            const e = Math.max(W / iw, H / ih);
            ctx.drawImage(img, (W - iw * e) / 2, (H - ih * e) / 2, iw * e, ih * e);
        }
        if (f.escurecer > 0) { ctx.fillStyle = 'rgba(0,0,0,' + f.escurecer + ')'; ctx.fillRect(0, 0, W, H); }
    }
    ctx.restore();
}

// Desenha a arte inteira em `ctx`, em pixels da arte (quem chama escala o ctx antes).
// opcoes: imagem(rid) -> imagem carregada ou null; subs; pular (id que a tela esconde
// enquanto o professor digita nele).
function desenharArte(ctx, arte, opcoes) {
    opcoes = opcoes || {};
    desenharFundo(ctx, arte, opcoes.imagem);
    arte.elementos.forEach(el => {
        if (el.oculto || el.id === opcoes.pular) return;
        desenharElemento(ctx, el, opcoes);
    });
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

function trocarPaleta(arte, novaId) {
    const de = paleta(arte.paleta), para = paleta(novaId);
    const mapa = {};
    PAPEIS.forEach(p => { if (!mapa[de[p]]) mapa[de[p]] = para[p]; });
    const t = c => (c && mapa[c.toLowerCase()]) || c;
    arte.fundo.cor = t(arte.fundo.cor); arte.fundo.cor2 = t(arte.fundo.cor2);
    arte.elementos.forEach(e => {
        ['cor', 'contornoCor', 'fundoCor', 'preench', 'borda'].forEach(k => { if (e[k]) e[k] = t(e[k]); });
    });
    arte.paleta = para.id;
    return arte;
}

// ---------------------------------------------------------------------------
// Desfazer / refazer
// ---------------------------------------------------------------------------

function criarHistorico(limite) {
    const max = limite || 80;
    const h = { pilha: [], pos: -1 };
    h.registrar = (estado) => {
        const s = typeof estado === 'string' ? estado : JSON.stringify(estado);
        if (h.pos >= 0 && h.pilha[h.pos] === s) return false;
        h.pilha = h.pilha.slice(0, h.pos + 1);
        h.pilha.push(s);
        if (h.pilha.length > max) h.pilha.shift();
        h.pos = h.pilha.length - 1;
        return true;
    };
    h.podeDesfazer = () => h.pos > 0;
    h.podeRefazer = () => h.pos < h.pilha.length - 1;
    h.desfazer = () => h.podeDesfazer() ? JSON.parse(h.pilha[--h.pos]) : null;
    h.refazer = () => h.podeRefazer() ? JSON.parse(h.pilha[++h.pos]) : null;
    return h;
}

// O que entra na foto do desfazer: tudo menos as imagens (que so' crescem).
function estadoParaHistorico(arte) {
    return JSON.stringify({ titulo: arte.titulo, largura: arte.largura, altura: arte.altura, formato: arte.formato,
                            paleta: arte.paleta, fundo: arte.fundo, elementos: arte.elementos });
}
function aplicarHistorico(arte, estado) {
    ['titulo', 'largura', 'altura', 'formato', 'paleta', 'fundo', 'elementos'].forEach(k => { if (estado[k] !== undefined) arte[k] = estado[k]; });
    return arte;
}

// ---------------------------------------------------------------------------
// PDF e arquivo
// ---------------------------------------------------------------------------

function tamanhoFolhaMm(arte) {
    const f = formato(arte.formato);
    if (f && f.mm && f.largura === arte.largura && f.altura === arte.altura) return { w: f.mm[0], h: f.mm[1] };
    return { w: Math.round(arte.largura / DPI_PDF * 25.4 * 10) / 10, h: Math.round(arte.altura / DPI_PDF * 25.4 * 10) / 10 };
}

function nomeArquivo(titulo, extensao) {
    const base = String(titulo || 'arte').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'arte';
    return base + '.' + extensao;
}

// "Gerar em lote": uma linha por pessoa. Aceita "Nome" ou "Nome;Turma" (ou com tab, de
// planilha colada). Linhas vazias e repetidas saem.
function lerListaLote(texto) {
    const vistos = new Set();
    return String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
        const partes = l.split(/\t|;/).map(s => s.trim());
        return { nome: partes[0].slice(0, 120), turma: (partes[1] || '').slice(0, 60) };
    }).filter(p => {
        const k = (p.nome + '|' + p.turma).toLowerCase();
        if (!p.nome || vistos.has(k)) return false;
        vistos.add(k); return true;
    }).slice(0, 500);
}

// ---------------------------------------------------------------------------
// Modelos prontos
// ---------------------------------------------------------------------------
// Cada modelo devolve uma arte nova pintada com a paleta `p`. Os textos marcados com
// `campo` sao os que a IA preenche no "Criar com IA".

function T(props) { return normalizarElemento(Object.assign({ tipo: 'texto', nome: props.campo ? CAMPOS[props.campo] : 'Texto' }, props)); }
function F(forma, props) { return normalizarElemento(Object.assign({ tipo: 'forma', forma, nome: (FORMAS.find(f => f.id === forma) || {}).nome }, props)); }

const MODELOS = [
    {
        id: 'certificado', nome: 'Certificado', categoria: 'Reconhecimento', formato: 'a4p', paleta: 'escola',
        descricao: 'Certificado de honra ao mérito, participação ou conclusão. Usa {nome} para gerar um por estudante.',
        montar: (p) => [
            F('ret', { x: 40, y: 40, w: 1674, h: 1160, preench: '', borda: p.primaria, bordaLarg: 16 }),
            F('ret', { x: 72, y: 72, w: 1610, h: 1096, preench: '', borda: p.destaque, bordaLarg: 4 }),
            T({ campo: 'titulo', texto: 'CERTIFICADO', fonte: 'Playfair Display', negrito: true, tam: 130, espaco: 14, cor: p.primaria, x: 177, y: 150, w: 1400, h: 160 }),
            T({ campo: 'subtitulo', texto: 'de Honra ao Mérito', fonte: 'Great Vibes', tam: 90, cor: p.secundaria, x: 177, y: 320, w: 1400, h: 110 }),
            T({ texto: 'Conferimos este certificado a', tam: 40, cor: p.texto, x: 277, y: 470, w: 1200, h: 50 }),
            T({ nome: 'Nome do estudante', texto: '{nome}', fonte: 'Great Vibes', tam: 120, cor: p.primaria, x: 277, y: 535, w: 1200, h: 145 }),
            F('linha', { x: 427, y: 680, w: 900, h: 20, borda: p.secundaria, bordaLarg: 3 }),
            T({ campo: 'corpo', texto: 'pela dedicação, pelo esforço e pelo excelente desempenho nas atividades do bimestre.', tam: 38, entrelinha: 1.4, cor: p.texto, x: 327, y: 720, w: 1100, h: 110 }),
            T({ texto: '{data}', tam: 30, cor: p.texto, x: 477, y: 880, w: 800, h: 40 }),
            F('linha', { x: 240, y: 1020, w: 520, h: 20, borda: p.texto, bordaLarg: 3 }),
            F('linha', { x: 994, y: 1020, w: 520, h: 20, borda: p.texto, bordaLarg: 3 }),
            T({ texto: 'Professor(a)', tam: 30, cor: p.texto, x: 240, y: 1045, w: 520, h: 40 }),
            T({ campo: 'rodape', texto: 'Direção', tam: 30, cor: p.texto, x: 994, y: 1045, w: 520, h: 40 }),
            F('circulo', { x: 1450, y: 820, w: 190, h: 190, preench: p.destaque }),
            F('estrela', { x: 1485, y: 852, w: 120, h: 120, preench: '#ffffff' })
        ]
    },
    {
        id: 'comunicado', nome: 'Comunicado aos responsáveis', categoria: 'Avisos', formato: 'a4r', paleta: 'escola',
        descricao: 'Bilhete ou comunicado para as famílias: reunião, passeio, evento, mudança de horário.',
        montar: (p) => [
            F('ret', { x: 0, y: 0, w: 1240, h: 280, preench: p.primaria }),
            F('circulo', { x: 960, y: -110, w: 380, h: 380, preench: p.destaque, opac: 0.9 }),
            T({ texto: '{escola}', negrito: true, tam: 34, alinh: 'left', cor: '#ffffff', x: 80, y: 60, w: 860, h: 45 }),
            T({ campo: 'titulo', texto: 'COMUNICADO', fonte: 'Montserrat', negrito: true, tam: 100, alinh: 'left', cor: '#ffffff', x: 80, y: 120, w: 900, h: 120 }),
            T({ campo: 'subtitulo', texto: 'Senhores pais e responsáveis,', negrito: true, tam: 42, alinh: 'left', cor: p.texto, x: 100, y: 370, w: 1040, h: 55 }),
            T({ campo: 'corpo', texto: 'Informamos que no dia __/__ haverá reunião de pais e mestres, às 19h, no pátio da escola. Contamos com a presença de todos para conversarmos sobre o desenvolvimento dos estudantes.', tam: 36, alinh: 'left', entrelinha: 1.55, cor: p.texto, x: 100, y: 460, w: 1040, h: 340 }),
            T({ texto: '{data}', tam: 30, alinh: 'right', cor: p.texto, x: 100, y: 1320, w: 1040, h: 40 }),
            F('linha', { x: 370, y: 1490, w: 500, h: 20, borda: p.texto, bordaLarg: 3 }),
            T({ campo: 'rodape', texto: 'Coordenação pedagógica', tam: 30, cor: p.texto, x: 270, y: 1515, w: 700, h: 40 }),
            F('ret', { x: 0, y: 1714, w: 1240, h: 40, preench: p.destaque })
        ]
    },
    {
        id: 'cartaz', nome: 'Cartaz de evento', categoria: 'Eventos', formato: 'a3', paleta: 'oceano',
        descricao: 'Cartaz grande para divulgar feira, mostra, gincana, palestra ou campanha na escola.',
        fundo: (p) => ({ tipo: 'gradiente', cor: p.primaria, cor2: p.secundaria, angulo: 160 }),
        montar: (p) => [
            F('circulo', { x: -220, y: -220, w: 820, h: 820, preench: p.destaque, opac: 0.3 }),
            F('circulo', { x: 1180, y: 1900, w: 900, h: 900, preench: '#ffffff', opac: 0.14 }),
            T({ texto: '🔬 🧪 🌱', tam: 200, x: 177, y: 230, w: 1400, h: 240 }),
            T({ campo: 'titulo', texto: 'FEIRA DE CIÊNCIAS', fonte: 'Bebas Neue', tam: 300, entrelinha: 0.95, cor: '#ffffff', sombra: true, x: 100, y: 560, w: 1554, h: 570 }),
            T({ campo: 'subtitulo', texto: 'Venha conhecer os projetos dos nossos estudantes!', tam: 72, entrelinha: 1.25, cor: '#ffffff', x: 177, y: 1240, w: 1400, h: 180 }),
            F('arred', { x: 277, y: 1580, w: 1200, h: 470, preench: '#ffffff', raio: 48 }),
            T({ campo: 'corpo', texto: '📅 12 de novembro, às 14h\n📍 Pátio da escola\n🎟️ Entrada gratuita', negrito: true, tam: 66, entrelinha: 1.6, cor: p.texto, x: 327, y: 1650, w: 1100, h: 320 }),
            T({ campo: 'rodape', texto: '{escola}', negrito: true, tam: 54, cor: '#ffffff', x: 177, y: 2260, w: 1400, h: 70 })
        ]
    },
    {
        id: 'convite', nome: 'Convite', categoria: 'Eventos', formato: 'convite', paleta: 'festa',
        descricao: 'Convite para festa junina, formatura, mostra cultural ou reunião especial.',
        montar: (p) => [
            F('arred', { x: 30, y: 30, w: 1140, h: 1740, preench: '', borda: p.primaria, bordaLarg: 10, raio: 50 }),
            T({ texto: '🎈🎉🎈', tam: 150, x: 100, y: 120, w: 1000, h: 180 }),
            T({ campo: 'subtitulo', texto: 'Você está convidado(a)!', fonte: 'Pacifico', tam: 86, cor: p.primaria, x: 100, y: 380, w: 1000, h: 130 }),
            T({ campo: 'titulo', texto: 'Festa Junina', fonte: 'Baloo 2', negrito: true, tam: 180, entrelinha: 1, cor: p.secundaria, x: 60, y: 530, w: 1080, h: 190 }),
            F('ret', { x: 30, y: 860, w: 1140, h: 400, preench: p.claro }),
            T({ campo: 'corpo', texto: 'Sábado, 20 de junho\n15h às 20h\nQuadra da escola', negrito: true, tam: 60, entrelinha: 1.5, cor: p.texto, x: 100, y: 920, w: 1000, h: 280 }),
            T({ campo: 'rodape', texto: 'Traga sua família! Comidas típicas, quadrilha e muita diversão.', tam: 42, entrelinha: 1.35, cor: p.texto, x: 120, y: 1380, w: 960, h: 120 }),
            T({ texto: '{escola}', negrito: true, tam: 36, cor: p.primaria, x: 120, y: 1600, w: 960, h: 45 })
        ]
    },
    {
        id: 'aniversariantes', nome: 'Aniversariantes do mês', categoria: 'Reconhecimento', formato: 'quadrado', paleta: 'doce',
        descricao: 'Post ou cartaz com os aniversariantes do mês para o mural ou as redes da escola.',
        fundo: (p) => ({ tipo: 'cor', cor: p.claro }),
        montar: (p) => [
            F('circulo', { x: 110, y: 110, w: 860, h: 860, preench: p.fundo }),
            T({ texto: '🎂 🎈 🎉', tam: 110, x: 140, y: 120, w: 800, h: 135 }),
            T({ campo: 'titulo', texto: 'Parabéns!', fonte: 'Pacifico', tam: 150, cor: p.primaria, x: 90, y: 270, w: 900, h: 220 }),
            T({ campo: 'subtitulo', texto: 'Aniversariantes de outubro', negrito: true, tam: 50, cor: p.secundaria, x: 140, y: 510, w: 800, h: 65 }),
            T({ campo: 'corpo', texto: 'Ana · Bruno · Carla · Davi · Elisa', tam: 44, entrelinha: 1.4, cor: p.texto, x: 190, y: 610, w: 700, h: 130 }),
            T({ campo: 'rodape', texto: 'Muitas felicidades!', fonte: 'Caveat', negrito: true, tam: 70, cor: p.primaria, x: 190, y: 800, w: 700, h: 90 })
        ]
    },
    {
        id: 'aviso', nome: 'Aviso rápido', categoria: 'Avisos', formato: 'quadrado', paleta: 'escola',
        descricao: 'Post curto de aviso para o grupo da turma ou as redes da escola.',
        fundo: (p) => ({ tipo: 'cor', cor: p.primaria }),
        montar: (p) => [
            F('arred', { x: 60, y: 60, w: 960, h: 960, preench: '#ffffff', raio: 48 }),
            T({ texto: '📢', tam: 150, x: 390, y: 120, w: 300, h: 180 }),
            T({ campo: 'titulo', texto: 'ATENÇÃO', fonte: 'Bebas Neue', tam: 160, cor: p.primaria, x: 140, y: 300, w: 800, h: 190 }),
            T({ campo: 'corpo', texto: 'Amanhã não haverá aula por causa do conselho de classe.', negrito: true, tam: 56, entrelinha: 1.3, cor: p.texto, x: 140, y: 520, w: 800, h: 220 }),
            T({ campo: 'rodape', texto: '{escola}', tam: 36, cor: p.secundaria, x: 140, y: 880, w: 800, h: 45 })
        ]
    },
    {
        id: 'capa', nome: 'Capa de trabalho', categoria: 'Sala de aula', formato: 'a4r', paleta: 'escola',
        descricao: 'Capa de trabalho escolar com escola, título, aluno, turma e professor.',
        montar: (p) => [
            F('ret', { x: 0, y: 0, w: 60, h: 1754, preench: p.primaria }),
            T({ texto: '{escola}', fonte: 'Montserrat', negrito: true, tam: 42, cor: p.secundaria, x: 120, y: 150, w: 1040, h: 55 }),
            T({ campo: 'subtitulo', texto: 'Disciplina de Ciências', tam: 36, cor: p.secundaria, x: 120, y: 230, w: 1040, h: 45 }),
            T({ campo: 'titulo', texto: 'Título do Trabalho', fonte: 'Montserrat', negrito: true, tam: 104, entrelinha: 1.1, cor: p.primaria, x: 120, y: 690, w: 1040, h: 240 }),
            F('arred', { x: 490, y: 960, w: 300, h: 12, preench: p.destaque, raio: 6 }),
            T({ campo: 'corpo', texto: 'Aluno(a): ____________________\nTurma: __________\nProfessor(a): {professor}', tam: 36, alinh: 'left', entrelinha: 1.7, cor: p.texto, x: 560, y: 1240, w: 600, h: 190 }),
            T({ campo: 'rodape', texto: '{ano}', tam: 34, cor: p.texto, x: 120, y: 1610, w: 1040, h: 45 })
        ]
    },
    {
        id: 'cracha', nome: 'Crachá de nome', categoria: 'Sala de aula', formato: 'cracha', paleta: 'natureza',
        descricao: 'Crachá ou etiqueta de nome para o primeiro dia, passeio ou evento. Usa {nome} para gerar um por estudante.',
        montar: (p) => [
            F('ret', { x: 0, y: 0, w: 708, h: 330, preench: p.primaria }),
            T({ campo: 'subtitulo', texto: 'OLÁ, MEU NOME É', fonte: 'Montserrat', negrito: true, tam: 48, cor: '#ffffff', x: 40, y: 120, w: 628, h: 60 }),
            T({ campo: 'titulo', texto: '{nome}', fonte: 'Baloo 2', negrito: true, tam: 96, entrelinha: 1, cor: p.texto, x: 40, y: 450, w: 628, h: 100 }),
            T({ texto: '{turma}', tam: 44, cor: p.secundaria, x: 40, y: 640, w: 628, h: 55 }),
            T({ texto: '⭐', tam: 90, x: 254, y: 780, w: 200, h: 110 }),
            F('ret', { x: 0, y: 993, w: 708, h: 70, preench: p.destaque })
        ]
    },
    {
        id: 'slide', nome: 'Slide de aula', categoria: 'Sala de aula', formato: 'slide', paleta: 'oceano',
        descricao: 'Slide para projetar na aula: título, subtítulo e tópicos.',
        montar: (p) => [
            F('ret', { x: 0, y: 0, w: 28, h: 1080, preench: p.primaria }),
            F('circulo', { x: 1640, y: -140, w: 420, h: 420, preench: p.claro }),
            T({ campo: 'titulo', texto: 'O ciclo da água', fonte: 'Montserrat', negrito: true, tam: 100, alinh: 'left', cor: p.texto, x: 120, y: 100, w: 1400, h: 120 }),
            T({ campo: 'subtitulo', texto: 'Ciências · 6º ano', tam: 42, alinh: 'left', cor: p.primaria, x: 120, y: 240, w: 1100, h: 55 }),
            T({ campo: 'corpo', texto: '• Evaporação: a água vira vapor\n• Condensação: o vapor forma as nuvens\n• Precipitação: a água volta como chuva', tam: 54, alinh: 'left', entrelinha: 1.7, cor: p.texto, x: 120, y: 380, w: 1100, h: 280 }),
            F('arred', { x: 1300, y: 380, w: 480, h: 520, preench: p.claro, raio: 36 }),
            T({ texto: '💧', tam: 240, x: 1340, y: 490, w: 400, h: 290 }),
            T({ campo: 'rodape', texto: '{escola}', tam: 30, alinh: 'left', cor: p.secundaria, x: 120, y: 980, w: 1100, h: 40 })
        ]
    },
    {
        id: 'rotina', nome: 'Rotina da semana', categoria: 'Sala de aula', formato: 'a4p', paleta: 'festa',
        descricao: 'Quadro com os cinco dias da semana para rotina, cardápio ou agenda da turma.',
        montar: (p) => {
            const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
            const cores = [p.primaria, p.secundaria, p.destaque, p.primaria, p.secundaria];
            const els = [T({ campo: 'titulo', texto: 'Rotina da semana', fonte: 'Baloo 2', negrito: true, tam: 104, cor: p.primaria, x: 177, y: 60, w: 1400, h: 120 })];
            dias.forEach((d, i) => {
                const x = 77 + i * 325;
                els.push(F('arred', { x, y: 230, w: 300, h: 110, preench: cores[i], raio: 26, nome: d }));
                els.push(T({ texto: d, negrito: true, tam: 46, cor: '#ffffff', x, y: 255, w: 300, h: 60 }));
                els.push(F('arred', { x, y: 360, w: 300, h: 790, preench: p.claro, raio: 26 }));
                els.push(T({ texto: '•\n•\n•\n•', tam: 38, alinh: 'left', entrelinha: 1.8, cor: p.texto, x: x + 26, y: 400, w: 250, h: 280 }));
            });
            return els;
        }
    },
    {
        id: 'faixa', nome: 'Faixa de boas-vindas', categoria: 'Eventos', formato: 'faixa', paleta: 'festa',
        descricao: 'Faixa ou capa larga: boas-vindas, volta às aulas, cabeçalho de mural.',
        fundo: (p) => ({ tipo: 'gradiente', cor: p.primaria, cor2: p.destaque, angulo: 90 }),
        montar: (p) => [
            T({ texto: '✏️', tam: 150, x: 60, y: 210, w: 220, h: 180 }),
            T({ texto: '📚', tam: 150, x: 1520, y: 210, w: 220, h: 180 }),
            T({ campo: 'titulo', texto: 'Bem-vindos!', fonte: 'Pacifico', tam: 190, cor: '#ffffff', sombra: true, x: 300, y: 80, w: 1200, h: 290 }),
            T({ campo: 'subtitulo', texto: 'Ano letivo de {ano}', negrito: true, tam: 68, cor: '#ffffff', x: 300, y: 400, w: 1200, h: 85 })
        ]
    }
];

function aplicarModelo(modeloId, opcoes) {
    opcoes = opcoes || {};
    const m = MODELOS.find(x => x.id === modeloId);
    if (!m) return null;
    const p = paleta(opcoes.paleta || m.paleta);
    const arte = novaArte(m.formato, { titulo: opcoes.titulo || m.nome });
    arte.paleta = p.id;
    arte.fundo = Object.assign(arte.fundo, { tipo: 'cor', cor: p.fundo, cor2: p.claro }, m.fundo ? m.fundo(p) : {});
    arte.elementos = m.montar(p).map(normalizarElemento);
    arte.modelo = m.id;
    if (opcoes.textos) aplicarTextos(arte, opcoes.textos);
    return arte;
}

function aplicarTextos(arte, textos) {
    Object.keys(textos || {}).forEach(campo => {
        if (!CAMPOS[campo]) return;
        const v = txt(textos[campo], 600).trim();
        if (!v) return;
        arte.elementos.forEach(e => { if (e.tipo === 'texto' && e.campo === campo) e.texto = v; });
    });
    return arte;
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------

function promptCriarComIA(pedido, extras) {
    extras = extras || {};
    const lista = MODELOS.map(m => {
        const campos = Array.from(new Set(m.montar(PALETAS[0]).filter(e => e.campo).map(e => e.campo)));
        return '- "' + m.id + '": ' + m.nome + ' — ' + m.descricao + ' Campos: ' + campos.join(', ') + '.';
    }).join('\n');
    return 'Você ajuda um professor de escola pública brasileira a criar uma arte (cartaz, aviso, certificado, convite...).' +
        ' Pedido do professor: "' + txt(pedido, 800) + '".' +
        (extras.escola ? ' Nome da escola: ' + txt(extras.escola, 120) + '.' : '') +
        '\nEscolha UM modelo desta lista:\n' + lista +
        '\nPaletas de cores possíveis: ' + PALETAS.map(p => '"' + p.id + '" (' + p.nome + ')').join(', ') + '.' +
        '\nEscreva os textos em português do Brasil, curtos e claros, adequados ao ambiente escolar. Título com no máximo 5 palavras.' +
        ' Não invente nomes de estudantes: onde for o nome de cada estudante, escreva {nome}. Para o nome da escola use {escola}; para a data de hoje, {data}.' +
        ' Datas, horários e locais: use os do pedido; se o pedido não disser, deixe "__/__" para o professor completar.' +
        ' Responda APENAS com um JSON válido, sem markdown, no formato exato:' +
        ' {"modelo": "id do modelo", "paleta": "id da paleta", "titulo_arte": "nome curto para salvar", "textos": {"titulo": "...", "subtitulo": "...", "corpo": "...", "rodape": "..."}}.' +
        ' Use em "textos" só os campos do modelo escolhido. No campo "corpo" pode usar quebras de linha (\\n).';
}

function lerJsonDaIA(resposta) {
    if (resposta && typeof resposta === 'object') return resposta;
    const s = String(resposta || '').replace(/```(json)?/gi, '');
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j <= i) return null;
    try { return JSON.parse(s.slice(i, j + 1)); } catch (_) { return null; }
}

// A resposta da IA vira arte. Modelo que nao existe cai no cartaz; paleta que nao existe,
// na do modelo. Devolve null se nao veio nada aproveitavel.
function arteDaIA(resposta) {
    const r = lerJsonDaIA(resposta);
    if (!r) return null;
    const m = MODELOS.find(x => x.id === r.modelo) || MODELOS.find(x => x.id === 'cartaz');
    const textos = (r.textos && typeof r.textos === 'object') ? r.textos : {};
    if (!Object.keys(textos).some(k => CAMPOS[k] && String(textos[k] || '').trim())) return null;
    const pal = PALETAS.some(p => p.id === r.paleta) ? r.paleta : m.paleta;
    return aplicarModelo(m.id, { paleta: pal, textos, titulo: txt(r.titulo_arte || textos.titulo || m.nome, 100) });
}

const COMO_REESCREVER = {
    corrigir: 'corrija a ortografia, a acentuação e a pontuação, sem mudar o sentido',
    curto: 'deixe bem mais curto e direto, mantendo a informação principal',
    formal: 'deixe mais formal e cordial, adequado a um comunicado da escola para as famílias',
    animado: 'deixe mais animado e acolhedor, para crianças e adolescentes',
    simples: 'reescreva em linguagem simples, fácil de entender',
    ingles: 'traduza para o inglês'
};

function promptReescrever(texto, como) {
    return 'Você revisa textos de artes escolares (cartazes, avisos, certificados). Pegue o texto abaixo e ' +
        (COMO_REESCREVER[como] || COMO_REESCREVER.corrigir) + '.' +
        ' Mantenha marcadores como {nome}, {escola}, {data} exatamente como estão. Mantenha as quebras de linha quando fizerem sentido.' +
        ' Responda APENAS com um JSON válido, sem markdown: {"texto": "texto novo"}.\n\nTEXTO:\n' + txt(texto, 2000);
}

function promptEscreverTexto(pedido, extras) {
    extras = extras || {};
    return 'Você escreve textos curtos para artes escolares (cartaz, mural, aviso, post da escola) de uma escola pública brasileira.' +
        ' Pedido do professor: "' + txt(pedido, 600) + '".' +
        (extras.contexto ? ' A arte já tem estes textos: ' + txt(extras.contexto, 600) + '.' : '') +
        ' Escreva em português do Brasil, linguagem adequada à escola, no máximo 40 palavras. Não invente nomes de estudantes.' +
        ' Responda APENAS com um JSON válido, sem markdown: {"texto": "o texto"}.';
}

function textoDaIA(resposta) {
    const r = lerJsonDaIA(resposta);
    if (r && typeof r.texto === 'string' && r.texto.trim()) return r.texto.trim().slice(0, MAX_TEXTO);
    if (typeof resposta === 'string' && resposta.trim() && resposta.indexOf('{') < 0) return resposta.trim().slice(0, MAX_TEXTO);
    return '';
}

const ATELIEOPS = {
    VERSAO, FORMATOS, FONTES, FONTE_PADRAO, FORMAS, FORMAS_LINHA, PALETAS, PAPEIS, FIGURINHAS, CAMPOS, MODELOS,
    FILTROS, FILTROS_CSS, COMO_REESCREVER,
    novoId, formato, paleta, fonte, copiar,
    novaArte, normalizarArte, normalizarElemento, novoTexto, novaForma, novaImagem, duplicarElemento, podarRecursos,
    moverCamada, alinharNaPagina,
    centro, girar, paraLocal, paraArte, caixaOcupada, ehLinha, pontoNoElemento, elementoNoPonto,
    alcasDoElemento, posicoesAlcas, alcaNoPonto, redimensionar, anguloGiro, encaixar,
    substituir, camposUsados, fonteCss, quebrarLinhas, ajustarAlturaTexto,
    caminhoForma, desenharElemento, desenharFundo, desenharArte,
    trocarPaleta, criarHistorico, estadoParaHistorico, aplicarHistorico,
    tamanhoFolhaMm, nomeArquivo, lerListaLote,
    aplicarModelo, aplicarTextos,
    promptCriarComIA, arteDaIA, promptReescrever, promptEscreverTexto, textoDaIA, lerJsonDaIA
};

if (typeof window !== 'undefined') window.ATELIEOPS = ATELIEOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = ATELIEOPS;

})();
