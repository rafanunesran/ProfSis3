// img.js — A ABA "IMG": as ferramentas de imagem, todas rodando no aparelho.
//
// POR QUE ISTO EXISTE
//   A aba se chamava "Ampliar" e fazia uma coisa so'. Mas ampliar e' so' uma das coisas
//   que o professor vai buscar num site como o iLoveIMG: comprimir a foto para caber no
//   formulario, redimensionar, cortar, converter HEIC/PNG em JPG, pôr marca d'agua no
//   material, tirar o fundo do logotipo da escola, desfocar o rosto de um estudante antes
//   de postar. Cada uma dessas, naquele site, e' um ENVIO do arquivo para um terceiro.
//
//   Aqui todas rodam no navegador (a conta de pixel mora em img_operacoes.js). A aba
//   passou a se chamar "IMG" e virou um catalogo, como a de PDF; "Aumentar resolucao" e'
//   a antiga aba Ampliar (ampliar.js), que continua intacta e agora mora dentro desta.
//
// COMO A TELA E' FEITA
//   Nenhuma ferramenta tem tela escrita a mao. Cada uma se DESCREVE em CATALOGO_IMG —
//   quais campos pede, se aceita varios arquivos, se tem previa ao vivo, se o professor
//   marca alguma coisa na imagem com o dedo — e um motor unico monta a tela, le os
//   arquivos, chama `processar` e oferece o download (em .zip quando sai mais de um).
//
//   `processar(fonte, op, extra)` recebe um <canvas> com a imagem e devolve outro. As
//   medidas que o professor escolhe (tamanho de letra, raio, marcacoes com o dedo) sao
//   RELATIVAS ao tamanho da imagem: e' isso que deixa a mesma funcao desenhar a previa
//   pequena e o arquivo final grande, e as duas baterem.
//
// O PORTAO PREMIUM
//   O mesmo das outras abas: ver da' para todo mundo, processar e' do plano Professor.

(function () {
'use strict';

const IMG_MAX_MB = 40;
const IMG_MAX_ARQUIVOS = 50;
const PREVIA_LADO = 900;          // a previa ao vivo trabalha numa copia deste tamanho

let imgFerramenta = null;         // id da ferramenta aberta, ou null (catalogo)
let imgArquivos = [];             // [{ nome, tipo, tamanho, url, bitmap, largura, altura }]
let imgOp = {};                   // id da ferramenta -> { campo: valor }
let imgMarcas = {};               // marcacoes com o dedo, NORMALIZADAS (0..1)
let imgResultados = [];           // [{ nome, blob, url, largura, altura, antes }]
let imgOcupado = false;
let imgErro = '';
let imgAviso = '';
let imgProgresso = { fracao: 0, texto: '' };
let imgPreviaFonte = null;        // canvas reduzido da primeira imagem, para a previa
let imgLogo = null;               // imagem da marca d'agua em modo logotipo

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tam(bytes) { return IMGOPS.formatarTamanho(bytes); }

// As URLs de blob sao revogadas quando o arquivo sai da lista ou o resultado e'
// descartado (ver revogar e soltarResultados) — senao a memoria vaza.
function urlDe(blob) { return URL.createObjectURL(blob); }

function podeUsar(nome) {
    if (typeof exigirPremium !== 'function') {
        console.warn('[IMG] assinatura.js indisponivel — portao premium nao aplicado.');
        return true;
    }
    return exigirPremium('Ferramentas — IMG' + (nome ? ': ' + nome : ''));
}

function ehPremiumImg() { return (typeof ehPremium === 'function') ? ehPremium() : true; }

function seloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}

// ---------------------------------------------------------------------------
// Ponte entre o <canvas> e img_operacoes.js
// ---------------------------------------------------------------------------

function novoCanvas(l, a) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(l));
    c.height = Math.max(1, Math.round(a));
    return c;
}

function canvasDe(fonte, l, a) {
    const c = novoCanvas(l, a);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte, 0, 0, c.width, c.height);
    return c;
}

function pixels(canvas) {
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    return { largura: d.width, altura: d.height, dados: d.data };
}

function canvasDePixels(img) {
    const c = novoCanvas(img.largura, img.altura);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.dados), img.largura, img.altura), 0, 0);
    return c;
}

// Aplica uma operacao de pixel de IMGOPS a um canvas e devolve outro canvas.
function comPixels(canvas, fn) { return canvasDePixels(fn(pixels(canvas))); }

// Formatos que o navegador escreve sozinho vs. os que img_operacoes.js escreve.
async function salvar(canvas, tipo, qualidade, extra) {
    if (tipo === 'image/gif') {
        return new Blob([IMGOPS.codificarGif([pixels(canvas)], extra || {})], { type: 'image/gif' });
    }
    if (tipo === 'image/bmp') {
        return new Blob([IMGOPS.codificarBmp(pixels(canvas), extra && extra.corFundo)], { type: 'image/bmp' });
    }
    if (tipo === 'image/jpeg') {
        // JPG nao tem transparencia: sem achatar, o transparente vira preto.
        const fundo = novoCanvas(canvas.width, canvas.height);
        const ctx = fundo.getContext('2d');
        ctx.fillStyle = (extra && extra.corFundo) || '#ffffff';
        ctx.fillRect(0, 0, fundo.width, fundo.height);
        ctx.drawImage(canvas, 0, 0);
        canvas = fundo;
    }
    const blob = await new Promise(ok => canvas.toBlob(ok, tipo, tipo === 'image/png' ? undefined : qualidade));
    if (!blob) throw new Error('O navegador não conseguiu gerar o arquivo. Tente outro formato ou uma imagem menor.');
    // Navegador que nao sabe escrever WebP devolve PNG calado. Melhor dizer.
    if (blob.type && blob.type !== tipo) {
        throw new Error('Este navegador não sabe gravar ' + IMGOPS.extensaoDoTipo(tipo).toUpperCase() + '. Escolha outro formato.');
    }
    return blob;
}

// "Mesmo formato": JPG continua JPG, WebP continua WebP. GIF vira PNG (so' o primeiro
// quadro sobrevive a uma edicao) e o que o navegador nao sabe escrever vira PNG.
function formatoDeSaida(tipoOriginal) {
    if (tipoOriginal === 'image/jpeg' || tipoOriginal === 'image/webp' || tipoOriginal === 'image/bmp') return tipoOriginal;
    return 'image/png';
}

// ---------------------------------------------------------------------------
// Desenho de texto (marca d'agua e meme)
// ---------------------------------------------------------------------------

function quebrarLinhas(ctx, texto, larguraMax) {
    const linhas = [];
    String(texto || '').split('\n').forEach(paragrafo => {
        const palavras = paragrafo.split(/\s+/).filter(Boolean);
        let linha = '';
        palavras.forEach(p => {
            const tentativa = linha ? linha + ' ' + p : p;
            if (ctx.measureText(tentativa).width <= larguraMax || !linha) linha = tentativa;
            else { linhas.push(linha); linha = p; }
        });
        linhas.push(linha);
    });
    return linhas;
}

// ---------------------------------------------------------------------------
// O CATALOGO
// ---------------------------------------------------------------------------
// Campo: { id, tipo, rotulo, ajuda, padrao, opcoes: [[valor, texto]], min, max, passo, quando(op) }
//   tipo  botoes | faixa | numero | cor | texto | textarea | check | arquivo
//
// Ferramenta:
//   varios     aceita muitos arquivos de uma vez (processa um por um)
//   previa     mostra a previa ao vivo da PRIMEIRA imagem enquanto os controles mudam
//   marcar     'corte' | 'areas' | 'pontos' — o professor marca na previa com o dedo
//   semArquivo nao pede imagem (HTML para imagem)
//   externo    a ferramenta tem tela propria (Aumentar resolucao = ampliar.js)

const cFormato = (padrao) => ({
    id: 'formato', tipo: 'botoes', rotulo: 'Formato do arquivo', padrao: padrao || 'mesmo',
    opcoes: [['mesmo', 'Mesmo da original'], ['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]
});
const cQualidade = () => ({
    id: 'qualidade', tipo: 'faixa', rotulo: 'Qualidade', padrao: 92, min: 50, max: 100, passo: 1, sufixo: '%',
    quando: (op, arq) => {
        const t = op.formato === 'mesmo' ? formatoDeSaida(arq && arq.tipo) : op.formato;
        return t === 'image/jpeg' || t === 'image/webp';
    }
});

function tipoPedido(op, arquivo) {
    return (!op.formato || op.formato === 'mesmo') ? formatoDeSaida(arquivo.tipo) : op.formato;
}

const CATALOGO_IMG = [
    {
        id: 'comprimir', emoji: '🗜️', nome: 'Comprimir imagem', varios: true,
        resumo: 'Deixa o arquivo menor, com a menor perda de qualidade possível.',
        detalhe: 'Para a foto caber no e-mail, no formulário da secretaria ("até 500 KB") ou no grupo ' +
                 'da turma. Dá para pedir um tamanho máximo em KB e deixar a conta com a ferramenta.',
        campos: [
            { id: 'nivel', tipo: 'botoes', rotulo: 'Compressão', padrao: 'recomendada',
              opcoes: [['forte', 'Máxima'], ['recomendada', 'Recomendada'], ['leve', 'Pouca']],
              ajuda: 'Recomendada: arquivo bem menor, diferença que quase não se vê.' },
            { id: 'saida', tipo: 'botoes', rotulo: 'Formato', padrao: 'auto',
              opcoes: [['auto', 'Automático'], ['image/jpeg', 'JPG'], ['image/webp', 'WebP']],
              ajuda: 'Automático: JPG para foto, WebP quando a imagem tem transparência (JPG não tem).' },
            { id: 'maxLado', tipo: 'botoes', rotulo: 'Reduzir também o tamanho', padrao: '0',
              opcoes: [['0', 'Não'], ['2560', 'Até 2560 px'], ['1920', 'Até 1920 px'], ['1280', 'Até 1280 px']],
              ajuda: 'Foto de celular tem 4000 px de largura; para tela, 1920 sobra.' },
            { id: 'alvoKB', tipo: 'numero', rotulo: 'Tamanho máximo (KB, opcional)', padrao: '', min: 0,
              ajuda: 'Ex.: 500. Deixe vazio para só usar o nível acima.' }
        ],
        processar: async (fonte, op, extra) => {
            let canvas = fonte;
            const lado = Number(op.maxLado) || 0;
            if (lado && Math.max(canvas.width, canvas.height) > lado) {
                const t = IMGOPS.calcularTamanho(canvas.width, canvas.height, { largura: lado, altura: lado, naoAmpliar: true });
                canvas = canvasDePixels(IMGOPS.redimensionar(pixels(canvas), t.largura, t.altura));
            }
            let tipo = op.saida;
            if (tipo === 'auto') tipo = IMGOPS.temTransparencia(pixels(canvas)) ? 'image/webp' : 'image/jpeg';
            const q = { forte: 0.5, recomendada: 0.72, leve: 0.88 }[op.nivel] || 0.72;
            const alvo = (Number(op.alvoKB) || 0) * 1024;
            let blob = await salvar(canvas, tipo, q);
            if (alvo && blob.size > alvo) blob = await caberEm(canvas, tipo, alvo, extra);
            return { blob: blob, sufixo: '-comprimida', canvas: canvas };
        }
    },
    {
        id: 'redimensionar', emoji: '📐', nome: 'Redimensionar imagem', varios: true,
        resumo: 'Muda a largura e a altura, em pixels ou em porcentagem.',
        detalhe: 'Com a proporção travada, a foto nunca sai achatada: basta dizer um dos lados.',
        campos: [
            { id: 'modo', tipo: 'botoes', rotulo: 'Como', padrao: 'pixels', opcoes: [['pixels', 'Em pixels'], ['porcento', 'Em porcentagem']] },
            { id: 'largura', tipo: 'numero', rotulo: 'Largura (px)', padrao: 1280, min: 1, quando: op => op.modo === 'pixels' },
            { id: 'altura', tipo: 'numero', rotulo: 'Altura (px)', padrao: '', min: 1, quando: op => op.modo === 'pixels',
              ajuda: 'Vazio = calculada pela largura.' },
            { id: 'porcento', tipo: 'faixa', rotulo: 'Tamanho', padrao: 50, min: 5, max: 400, passo: 5, sufixo: '%', quando: op => op.modo === 'porcento' },
            { id: 'proporcao', tipo: 'check', rotulo: 'Manter a proporção', padrao: true, quando: op => op.modo === 'pixels' },
            { id: 'naoAmpliar', tipo: 'check', rotulo: 'Não aumentar imagem que já é menor', padrao: true },
            cFormato(), cQualidade()
        ],
        resumoTamanho: (arq, op) => IMGOPS.calcularTamanho(arq.largura, arq.altura, op),
        processar: async (fonte, op) => {
            const t = IMGOPS.calcularTamanho(fonte.width, fonte.height, op);
            return { canvas: canvasDePixels(IMGOPS.redimensionar(pixels(fonte), t.largura, t.altura)), sufixo: '-' + t.largura + 'x' + t.altura };
        }
    },
    {
        id: 'cortar', emoji: '✂️', nome: 'Cortar imagem', previa: true, marcar: 'corte',
        resumo: 'Fica só com o pedaço que interessa.',
        detalhe: 'Arraste na imagem para marcar o corte; puxe os cantos para ajustar e o meio para mover.',
        campos: [
            { id: 'proporcao', tipo: 'botoes', rotulo: 'Proporção', padrao: 'livre',
              opcoes: [['livre', 'Livre'], ['1', '1:1'], ['1.3333', '4:3'], ['0.75', '3:4'], ['1.7778', '16:9'],
                       ['0.5625', '9:16'], ['0.7071', 'A4 em pé'], ['1.4142', 'A4 deitado']] },
            cFormato(), cQualidade()
        ],
        processar: async (fonte, op, extra) => {
            const c = extra.marcas.corte || { x: 0, y: 0, l: 1, a: 1 };
            const x = c.x * fonte.width, y = c.y * fonte.height;
            return { canvas: comPixels(fonte, p => IMGOPS.recortar(p, x, y, c.l * fonte.width, c.a * fonte.height)), sufixo: '-cortada' };
        }
    },
    {
        id: 'paraJpg', emoji: '🔄', nome: 'Converter para JPG', varios: true,
        resumo: 'PNG, WebP, GIF, BMP, SVG e outros viram JPG.',
        detalhe: 'O formato que todo sistema aceita. O que era transparente ganha a cor de fundo escolhida.',
        campos: [
            { id: 'qualidade', tipo: 'faixa', rotulo: 'Qualidade', padrao: 90, min: 50, max: 100, passo: 1, sufixo: '%' },
            { id: 'corFundo', tipo: 'cor', rotulo: 'Cor no lugar do transparente', padrao: '#ffffff' }
        ],
        processar: async (fonte, op) => ({
            blob: await salvar(fonte, 'image/jpeg', op.qualidade / 100, { corFundo: op.corFundo }), sufixo: ''
        })
    },
    {
        id: 'deJpg', emoji: '🔁', nome: 'Converter de JPG', varios: true,
        resumo: 'JPG vira PNG, WebP, BMP ou GIF — até GIF animado com várias fotos.',
        detalhe: 'Para o sistema que só aceita PNG, ou para juntar várias fotos num GIF animado.',
        campos: [
            { id: 'destino', tipo: 'botoes', rotulo: 'Converter para', padrao: 'image/png',
              opcoes: [['image/png', 'PNG'], ['image/webp', 'WebP'], ['image/gif', 'GIF'], ['image/bmp', 'BMP']] },
            { id: 'animado', tipo: 'check', rotulo: 'Juntar todas num GIF animado', padrao: true,
              quando: (op, arq, n) => op.destino === 'image/gif' && n > 1 },
            { id: 'atraso', tipo: 'faixa', rotulo: 'Tempo de cada quadro', padrao: 800, min: 100, max: 3000, passo: 100, sufixo: ' ms',
              quando: (op, arq, n) => op.destino === 'image/gif' && op.animado && n > 1 }
        ],
        juntar: (op, n) => op.destino === 'image/gif' && op.animado && n > 1,
        processar: async (fonte, op) => ({ blob: await salvar(fonte, op.destino, 0.92), sufixo: '' })
    },
    {
        id: 'editor', emoji: '🎨', nome: 'Editor de fotos', previa: true,
        resumo: 'Brilho, contraste, cor e filtros, vendo o resultado na hora.',
        detalhe: 'Para a foto escura da atividade no quadro, ou para o material sair com cara de uma coisa só.',
        campos: [
            { id: 'brilho', tipo: 'faixa', rotulo: 'Brilho', padrao: 0, min: -100, max: 100, passo: 1 },
            { id: 'contraste', tipo: 'faixa', rotulo: 'Contraste', padrao: 0, min: -100, max: 100, passo: 1 },
            { id: 'exposicao', tipo: 'faixa', rotulo: 'Exposição', padrao: 0, min: -100, max: 100, passo: 1 },
            { id: 'saturacao', tipo: 'faixa', rotulo: 'Saturação', padrao: 0, min: -100, max: 100, passo: 1 },
            { id: 'temperatura', tipo: 'faixa', rotulo: 'Temperatura', padrao: 0, min: -100, max: 100, passo: 1,
              ajuda: 'Negativo esfria (azul), positivo esquenta (amarelo).' },
            { id: 'filtro', tipo: 'botoes', rotulo: 'Filtro', padrao: 'nenhum',
              opcoes: [['nenhum', 'Nenhum'], ['cinza', 'Preto e branco'], ['pb', 'Alto contraste'], ['sepia', 'Sépia'],
                       ['vintage', 'Antigo'], ['frio', 'Frio'], ['quente', 'Quente'], ['inverter', 'Negativo']],
              ajuda: '"Alto contraste" transforma foto de folha escrita em preto no branco — bom para imprimir.' },
            cFormato(), cQualidade()
        ],
        processar: async (fonte, op) => ({ canvas: comPixels(fonte, p => IMGOPS.ajustar(p, op)), sufixo: '-editada' })
    },
    {
        id: 'ampliar', emoji: '🔍', nome: 'Aumentar resolução', externo: true,
        resumo: 'Amplia sem quadricular, limpa o granulado e realça as bordas.',
        detalhe: 'A antiga aba Ampliar: motor Nítido (sem internet) ou IA (rede neural no aparelho).'
    },
    {
        id: 'removerFundo', emoji: '🪄', nome: 'Remover fundo', previa: true, marcar: 'pontos',
        resumo: 'Tira o fundo liso de logotipo, desenho, assinatura ou foto de objeto.',
        detalhe: 'O fundo é descoberto pelas bordas da imagem. Se sobrar um pedaço, toque nele na prévia. ' +
                 'Funciona com fundo de uma cor só (parede, folha, mesa); para recortar uma pessoa de um ' +
                 'cenário, não serve.',
        campos: [
            { id: 'tolerancia', tipo: 'faixa', rotulo: 'Tolerância', padrao: 30, min: 0, max: 100, passo: 1,
              ajuda: 'Suba se sobrar fundo; desça se o desenho começar a sumir.' },
            { id: 'suavizar', tipo: 'faixa', rotulo: 'Suavizar a borda', padrao: 2, min: 0, max: 10, passo: 1 },
            { id: 'todaCor', tipo: 'check', rotulo: 'Apagar essa cor em toda parte (não só a ligada à borda)', padrao: false,
              ajuda: 'Marque para assinatura e texto: tira o branco de dentro das letras também.' },
            { id: 'novoFundo', tipo: 'botoes', rotulo: 'No lugar do fundo', padrao: 'transparente',
              opcoes: [['transparente', 'Transparente (PNG)'], ['cor', 'Uma cor']] },
            { id: 'corNova', tipo: 'cor', rotulo: 'Cor', padrao: '#ffffff', quando: op => op.novoFundo === 'cor' }
        ],
        processar: async (fonte, op, extra) => {
            const pontos = (extra.marcas.pontos || []).map(p => ({ x: p.x * fonte.width, y: p.y * fonte.height }));
            let px = IMGOPS.removerFundo(pixels(fonte), {
                tolerancia: op.tolerancia, suavizar: op.suavizar, todaCor: op.todaCor, pontos: pontos
            });
            if (op.novoFundo === 'cor') px = IMGOPS.achatar(px, op.corNova);
            return { canvas: canvasDePixels(px), tipo: op.novoFundo === 'cor' ? 'image/jpeg' : 'image/png',
                     qualidade: 0.92, sufixo: '-sem-fundo' };
        }
    },
    {
        id: 'marcaDagua', emoji: '💧', nome: "Marca d'água", varios: true, previa: true,
        resumo: 'Texto ou logotipo por cima da imagem, em um canto ou repetido.',
        detalhe: 'Para o material autoral não circular sem crédito, ou para marcar "uso interno" na foto de documento.',
        campos: [
            { id: 'tipo', tipo: 'botoes', rotulo: 'Marca', padrao: 'texto', opcoes: [['texto', 'Texto'], ['logo', 'Imagem (logotipo)']] },
            { id: 'texto', tipo: 'texto', rotulo: 'Texto', padrao: 'USO INTERNO', quando: op => op.tipo === 'texto' },
            { id: 'logo', tipo: 'arquivo', rotulo: 'Logotipo', quando: op => op.tipo === 'logo',
              ajuda: 'PNG com fundo transparente fica melhor. Use "Remover fundo" antes, se precisar.' },
            { id: 'tamanho', tipo: 'faixa', rotulo: 'Tamanho', padrao: 8, min: 2, max: 60, passo: 1, sufixo: '% da largura' },
            { id: 'cor', tipo: 'cor', rotulo: 'Cor', padrao: '#ffffff', quando: op => op.tipo === 'texto' },
            { id: 'contorno', tipo: 'check', rotulo: 'Contorno escuro (lê em fundo claro e escuro)', padrao: true, quando: op => op.tipo === 'texto' },
            { id: 'opacidade', tipo: 'faixa', rotulo: 'Opacidade', padrao: 50, min: 5, max: 100, passo: 5, sufixo: '%' },
            { id: 'posicao', tipo: 'botoes', rotulo: 'Posição', padrao: 'rodape-direita',
              opcoes: [['topo-esquerda', '↖'], ['topo-centro', '↑'], ['topo-direita', '↗'],
                       ['centro-esquerda', '←'], ['centro', '●'], ['centro-direita', '→'],
                       ['rodape-esquerda', '↙'], ['rodape-centro', '↓'], ['rodape-direita', '↘'],
                       ['mosaico', '▦ Repetida']] },
            { id: 'rotacao', tipo: 'faixa', rotulo: 'Inclinação', padrao: 0, min: -90, max: 90, passo: 5, sufixo: '°' },
            cFormato(), cQualidade()
        ],
        processar: async (fonte, op) => ({ canvas: desenharMarca(fonte, op), sufixo: '-marca' })
    },
    {
        id: 'meme', emoji: '😂', nome: 'Gerador de memes', previa: true,
        resumo: 'Texto em cima e embaixo, letra branca com contorno preto.',
        detalhe: 'Para a aula ficar mais leve, o aviso do mural chamar atenção, a atividade de interpretação.',
        campos: [
            { id: 'cima', tipo: 'textarea', rotulo: 'Texto de cima', padrao: 'QUANDO A PROVA É AMANHÃ' },
            { id: 'baixo', tipo: 'textarea', rotulo: 'Texto de baixo', padrao: 'E VOCÊ ESTUDOU' },
            { id: 'tamanho', tipo: 'faixa', rotulo: 'Tamanho da letra', padrao: 9, min: 3, max: 20, passo: 1 },
            { id: 'caixaAlta', tipo: 'check', rotulo: 'Tudo em maiúsculas', padrao: true },
            { id: 'cor', tipo: 'cor', rotulo: 'Cor da letra', padrao: '#ffffff' },
            { id: 'corContorno', tipo: 'cor', rotulo: 'Cor do contorno', padrao: '#000000' },
            cFormato(), cQualidade()
        ],
        processar: async (fonte, op) => ({ canvas: desenharMeme(fonte, op), sufixo: '-meme' })
    },
    {
        id: 'girar', emoji: '🔃', nome: 'Girar imagem', varios: true,
        resumo: 'Endireita a foto que saiu deitada ou de cabeça para baixo.',
        detalhe: 'Gira de 90 em 90 graus e espelha. Várias fotos de uma vez.',
        campos: [
            { id: 'angulo', tipo: 'botoes', rotulo: 'Girar', padrao: '90',
              opcoes: [['0', 'Não girar'], ['270', '↺ 90° à esquerda'], ['90', '↻ 90° à direita'], ['180', '180°']] },
            { id: 'espH', tipo: 'check', rotulo: 'Espelhar na horizontal (esquerda ↔ direita)', padrao: false },
            { id: 'espV', tipo: 'check', rotulo: 'Espelhar na vertical (cima ↕ baixo)', padrao: false },
            cFormato(), cQualidade()
        ],
        processar: async (fonte, op) => ({
            canvas: comPixels(fonte, p => {
                let r = IMGOPS.girar(p, Number(op.angulo) || 0);
                if (op.espH || op.espV) r = IMGOPS.espelhar(r, op.espH, op.espV);
                return r;
            }), sufixo: '-girada'
        })
    },
    {
        id: 'htmlImagem', emoji: '🌐', nome: 'HTML para imagem', semArquivo: true,
        resumo: 'Transforma um trecho de HTML (um aviso, uma tabela) em imagem.',
        detalhe: 'Cole o HTML e escolha a largura. Diferente do site, não dá para colar o ENDEREÇO de uma página: ' +
                 'capturar o site de outra pessoa exigiria mandar o endereço para um servidor de fora, e o navegador, ' +
                 'com razão, não deixa uma página ler outra. Imagens de outros sites dentro do HTML também não aparecem.',
        campos: [
            { id: 'html', tipo: 'textarea', rotulo: 'HTML', linhas: 10,
              padrao: '<div style="font-family:Arial,sans-serif;padding:32px;background:#edf3fd;border-left:8px solid #2563c9">\n' +
                      '  <h1 style="margin:0 0 8px;color:#1b4488">Reunião de pais</h1>\n' +
                      '  <p style="font-size:20px;margin:0">Sexta-feira, 19h, no pátio da escola.</p>\n</div>' },
            { id: 'largura', tipo: 'numero', rotulo: 'Largura (px)', padrao: 800, min: 100, max: 4000 },
            { id: 'escala', tipo: 'botoes', rotulo: 'Nitidez', padrao: '2', opcoes: [['1', 'Normal'], ['2', 'Dobrada (tela de celular)']] },
            { id: 'destino', tipo: 'botoes', rotulo: 'Formato', padrao: 'image/png', opcoes: [['image/png', 'PNG'], ['image/jpeg', 'JPG']] }
        ]
    },
    {
        id: 'desfocarRosto', emoji: '🙈', nome: 'Desfocar rosto', previa: true, marcar: 'areas',
        resumo: 'Esconde o rosto (ou a placa, o nome, o documento) antes de publicar.',
        detalhe: 'Arraste na prévia sobre cada rosto. Para anonimizar de verdade prefira "Pixelar forte" ou "Tarja": ' +
                 'desfoque fraco em rosto pequeno às vezes ainda deixa reconhecer quem é.',
        campos: [
            { id: 'efeito', tipo: 'botoes', rotulo: 'Efeito', padrao: 'pixelar',
              opcoes: [['desfocar', 'Desfocar'], ['pixelar', 'Pixelar'], ['tarja', 'Tarja preta']] },
            { id: 'forca', tipo: 'faixa', rotulo: 'Intensidade', padrao: 7, min: 1, max: 10, passo: 1, quando: op => op.efeito !== 'tarja' },
            cFormato(), cQualidade()
        ],
        processar: async (fonte, op, extra) => {
            const areas = extra.marcas.areas || [];
            return {
                canvas: comPixels(fonte, p => {
                    areas.forEach(a => {
                        const ret = { x: a.x * p.largura, y: a.y * p.altura, largura: a.l * p.largura, altura: a.a * p.altura };
                        p = op.efeito === 'tarja' ? IMGOPS.tarjaRegiao(p, ret, '#000000')
                          : op.efeito === 'desfocar' ? IMGOPS.desfocarRegiao(p, ret, op.forca)
                          : IMGOPS.pixelarRegiao(p, ret, op.forca);
                    });
                    return p;
                }), sufixo: '-anonimizada'
            };
        }
    }
];

function ferramenta(id) { return CATALOGO_IMG.find(f => f.id === id) || null; }

function opcoesDe(f) {
    if (!imgOp[f.id]) {
        const op = {};
        (f.campos || []).forEach(c => { op[c.id] = c.padrao; });
        imgOp[f.id] = op;
    }
    return imgOp[f.id];
}

// Comprimir ate caber: busca binaria na qualidade; se nem a pior qualidade couber,
// encolhe a imagem e tenta de novo. Nunca devolve "nao deu" sem tentar reduzir.
async function caberEm(canvas, tipo, alvo, extra) {
    let atual = canvas;
    for (let rodada = 0; rodada < 8; rodada++) {
        let baixo = 0.15, alto = 0.92, melhor = null;
        for (let i = 0; i < 7; i++) {
            const q = (baixo + alto) / 2;
            const b = await salvar(atual, tipo, q);
            if (b.size <= alvo) { melhor = b; baixo = q; } else alto = q;
        }
        if (melhor) return melhor;
        if (extra && extra.aoProgredir) extra.aoProgredir('Reduzindo o tamanho para caber...');
        atual = canvasDePixels(IMGOPS.redimensionar(pixels(atual), atual.width * 0.8, atual.height * 0.8));
    }
    return await salvar(atual, tipo, 0.15);
}

function desenharMarca(fonte, op) {
    const saida = canvasDe(fonte, fonte.width, fonte.height);
    const ctx = saida.getContext('2d');
    const L = saida.width, A = saida.height;
    ctx.globalAlpha = (Number(op.opacidade) || 50) / 100;

    let caixaL, caixaA, desenhar;
    if (op.tipo === 'logo') {
        if (!imgLogo) return saida;
        caixaL = Math.max(1, L * (Number(op.tamanho) || 8) / 100 * 2.5);
        caixaA = caixaL * imgLogo.altura / imgLogo.largura;
        desenhar = () => ctx.drawImage(imgLogo.bitmap, -caixaL / 2, -caixaA / 2, caixaL, caixaA);
    } else {
        const texto = String(op.texto || '').trim();
        if (!texto) return saida;
        const px = Math.max(6, L * (Number(op.tamanho) || 8) / 100);
        ctx.font = 'bold ' + px + 'px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        caixaL = ctx.measureText(texto).width;
        caixaA = px * 1.2;
        desenhar = () => {
            if (op.contorno) {
                ctx.lineWidth = Math.max(1, px / 12);
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineJoin = 'round';
                ctx.strokeText(texto, 0, 0);
            }
            ctx.fillStyle = op.cor || '#ffffff';
            ctx.fillText(texto, 0, 0);
        };
    }

    const rot = (Number(op.rotacao) || 0) * Math.PI / 180;
    const noPonto = (cx, cy) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); desenhar(); ctx.restore(); };

    if (op.posicao === 'mosaico') {
        const passoX = caixaL * 1.6 + L * 0.04, passoY = caixaA * 3 + A * 0.04;
        let linha = 0;
        for (let y = passoY / 2; y < A + passoY; y += passoY, linha++) {
            for (let x = (linha % 2 ? passoX / 2 : 0); x < L + passoX; x += passoX) noPonto(x, y);
        }
    } else {
        // A caixa girada ocupa mais espaco: a posicao usa o retangulo que a envolve.
        const cos = Math.abs(Math.cos(rot)), sen = Math.abs(Math.sin(rot));
        const envL = caixaL * cos + caixaA * sen, envA = caixaL * sen + caixaA * cos;
        const p = IMGOPS.posicionar(L, A, envL, envA, op.posicao, Math.min(L, A) * 0.03);
        noPonto(p.x + envL / 2, p.y + envA / 2);
    }
    ctx.globalAlpha = 1;
    return saida;
}

function desenharMeme(fonte, op) {
    const saida = canvasDe(fonte, fonte.width, fonte.height);
    const ctx = saida.getContext('2d');
    const L = saida.width, A = saida.height;
    const px = Math.max(8, L * (Number(op.tamanho) || 9) / 100);
    ctx.font = 'bold ' + px + 'px Impact, "Anton", "Arial Black", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, px / 7);
    ctx.strokeStyle = op.corContorno || '#000000';
    ctx.fillStyle = op.cor || '#ffffff';
    const margem = A * 0.03;
    const escrever = (texto, deCima) => {
        let t = String(texto || '').trim();
        if (!t) return;
        if (op.caixaAlta) t = t.toLocaleUpperCase('pt-BR');
        const linhas = quebrarLinhas(ctx, t, L * 0.94);
        const alt = px * 1.1;
        linhas.forEach((ln, i) => {
            const y = deCima ? margem + alt * (i + 1) - px * 0.15
                             : A - margem - alt * (linhas.length - 1 - i) - px * 0.15;
            ctx.strokeText(ln, L / 2, y);
            ctx.fillText(ln, L / 2, y);
        });
    };
    escrever(op.cima, true);
    escrever(op.baixo, false);
    return saida;
}

// HTML para imagem: o HTML e' montado num <iframe> sem scripts (sandbox), medido, e
// entao desenhado no canvas por dentro de um SVG <foreignObject>. Nada sai do aparelho.
async function htmlParaCanvas(html, largura, escala) {
    const quadro = document.createElement('iframe');
    quadro.setAttribute('sandbox', 'allow-same-origin');
    quadro.style.cssText = 'position:fixed; left:-10000px; top:0; border:0; width:' + largura + 'px; height:10px;';
    document.body.appendChild(quadro);
    try {
        const doc = quadro.contentDocument;
        doc.open();
        doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;}</style></head><body>' +
                  html + '</body></html>');
        doc.close();
        doc.querySelectorAll('script').forEach(s => s.remove());
        await new Promise(ok => setTimeout(ok, 60));
        const altura = Math.max(1, Math.min(20000, Math.ceil(doc.documentElement.scrollHeight)));
        const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + largura + '" height="' + altura + '">' +
                    '<foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
        const imagem = await carregarImagem('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
        const c = novoCanvas(largura * escala, altura * escala);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(imagem, 0, 0, c.width, c.height);
        try { ctx.getImageData(0, 0, 1, 1); } catch (_) {
            throw new Error('Este navegador não deixa transformar HTML em imagem (proteção do próprio navegador). Tente no Chrome ou no Edge.');
        }
        return c;
    } finally {
        quadro.remove();
    }
}

function carregarImagem(src) {
    return new Promise((ok, falha) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => falha(new Error('Não consegui ler esta imagem.'));
        im.src = src;
    });
}

// ---------------------------------------------------------------------------
// Abrir arquivos
// ---------------------------------------------------------------------------

async function lerArquivo(arquivo) {
    const ehImagem = /^image\//.test(arquivo.type || '') || /\.(jpe?g|png|webp|gif|bmp|svg|avif|ico)$/i.test(arquivo.name || '');
    if (!ehImagem) throw new Error('"' + arquivo.name + '" não parece uma imagem.');
    if (arquivo.size > IMG_MAX_MB * 1024 * 1024) {
        throw new Error('"' + arquivo.name + '" tem ' + tam(arquivo.size) + '. O limite aqui é ' + IMG_MAX_MB + ' MB.');
    }
    const url = urlDe(arquivo);
    let bitmap;
    try { bitmap = await carregarImagem(url); } catch (_) {
        throw new Error('Não consegui abrir "' + arquivo.name + '". Pode estar corrompido, ou ser de um formato que ' +
                        'este navegador não lê (HEIC do iPhone, por exemplo — no iPhone, compartilhe a foto como JPG).');
    }
    // SVG sem tamanho declarado chega com 0 x 0.
    const largura = bitmap.naturalWidth || bitmap.width || 1024;
    const altura = bitmap.naturalHeight || bitmap.height || 1024;
    return { nome: arquivo.name || 'imagem', tipo: arquivo.type || 'image/png', tamanho: arquivo.size,
             url: url, bitmap: bitmap, largura: largura, altura: altura, original: arquivo };
}

async function imgAdicionar(lista) {
    const f = ferramenta(imgFerramenta);
    if (!f) return;
    imgErro = ''; imgAviso = '';
    let arquivos = Array.from(lista || []);
    if (!f.varios) { arquivos = arquivos.slice(0, 1); imgArquivos.forEach(a => revogar(a.url)); imgArquivos = []; imgMarcas = {}; }
    const vagas = IMG_MAX_ARQUIVOS - imgArquivos.length;
    if (arquivos.length > vagas) {
        imgAviso = 'Cabem ' + IMG_MAX_ARQUIVOS + ' imagens por vez; fiquei com as primeiras.';
        arquivos = arquivos.slice(0, Math.max(0, vagas));
    }
    const erros = [];
    for (const a of arquivos) {
        try { imgArquivos.push(await lerArquivo(a)); } catch (e) { erros.push(e.message); }
    }
    if (erros.length) imgErro = erros.join(' ');
    imgResultados = [];
    prepararPrevia();
    imgRender();
}

async function imgEscolher(input) {
    const lista = input && input.files;
    if (lista && lista.length) await imgAdicionar(lista);
    if (input) input.value = '';
}

async function imgSoltar(ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.currentTarget) ev.currentTarget.classList.remove('img-sobre');
    const lista = ev.dataTransfer && ev.dataTransfer.files;
    if (lista && lista.length) await imgAdicionar(lista);
}

function imgArrastando(ev, entrou) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.currentTarget) ev.currentTarget.classList.toggle('img-sobre', !!entrou);
}

function revogar(url) { try { URL.revokeObjectURL(url); } catch (_) { /* ja' foi */ } }

function imgTirar(indice) {
    imgArquivos.splice(indice, 1).forEach(a => revogar(a.url));
    imgResultados = [];
    if (indice === 0) { imgMarcas = {}; prepararPrevia(); }
    imgRender();
}

function imgLimparArquivos() {
    imgArquivos.forEach(a => revogar(a.url));
    imgArquivos = [];
    imgResultados = [];
    imgMarcas = {};
    imgPreviaFonte = null;
    imgErro = ''; imgAviso = '';
    imgRender();
}

async function imgEscolherLogo(input) {
    const arquivo = input && input.files && input.files[0];
    if (!arquivo) return;
    try { imgLogo = await lerArquivo(arquivo); imgErro = ''; } catch (e) { imgErro = e.message; }
    input.value = '';
    imgResultados = [];
    imgRender();
}

// A previa trabalha numa copia pequena da primeira imagem: refazer a conta na foto de
// 12 megapixels a cada movimento do controle travaria o celular.
function prepararPrevia() {
    const a = imgArquivos[0];
    if (!a) { imgPreviaFonte = null; return; }
    const f = Math.min(1, PREVIA_LADO / Math.max(a.largura, a.altura));
    imgPreviaFonte = canvasDe(a.bitmap, a.largura * f, a.altura * f);
}

// ---------------------------------------------------------------------------
// O trabalho
// ---------------------------------------------------------------------------

async function imgExecutar() {
    const f = ferramenta(imgFerramenta);
    if (!f || imgOcupado) return;
    if (!f.semArquivo && !imgArquivos.length) return;
    if (f.marcar === 'areas' && !(imgMarcas.areas || []).length) {
        imgErro = 'Marque na prévia pelo menos uma área para esconder (arraste o dedo ou o mouse sobre o rosto).';
        imgRender();
        return;
    }
    if (!podeUsar(f.nome)) return;

    const op = opcoesDe(f);
    imgOcupado = true; imgErro = ''; imgAviso = '';
    soltarResultados();
    imgProgresso = { fracao: 0, texto: 'Preparando...' };
    imgRender();
    const comecou = Date.now();

    try {
        if (f.id === 'htmlImagem') {
            const largura = Math.max(100, Math.min(4000, Number(op.largura) || 800));
            const c = await htmlParaCanvas(String(op.html || ''), largura, Number(op.escala) || 1);
            const blob = await salvar(c, op.destino, 0.92);
            guardarResultado('html-para-imagem.' + IMGOPS.extensaoDoTipo(op.destino), blob, c.width, c.height, 0);
        } else if (f.juntar && f.juntar(op, imgArquivos.length)) {
            // GIF animado: todos os quadros do tamanho da primeira imagem.
            const L = imgArquivos[0].largura, A = imgArquivos[0].altura;
            const f0 = Math.min(1, 800 / Math.max(L, A));
            const QL = Math.round(L * f0), QA = Math.round(A * f0);
            const quadros = [];
            for (let i = 0; i < imgArquivos.length; i++) {
                progresso(i / imgArquivos.length * 0.8, 'Preparando o quadro ' + (i + 1) + ' de ' + imgArquivos.length + '...');
                await folga();
                quadros.push(pixels(encaixar(imgArquivos[i].bitmap, imgArquivos[i].largura, imgArquivos[i].altura, QL, QA)));
            }
            progresso(0.85, 'Montando o GIF...');
            await folga();
            const bytes = IMGOPS.codificarGif(quadros, { atraso: op.atraso, repetir: true });
            const total = imgArquivos.reduce((s, a) => s + a.tamanho, 0);
            guardarResultado('animacao.gif', new Blob([bytes], { type: 'image/gif' }), QL, QA, total);
        } else {
            for (let i = 0; i < imgArquivos.length; i++) {
                const a = imgArquivos[i];
                const base = i / imgArquivos.length;
                progresso(base, imgArquivos.length > 1 ? 'Imagem ' + (i + 1) + ' de ' + imgArquivos.length + '...' : 'Trabalhando...');
                await folga();
                verificarMemoria(a);
                const fonte = canvasDe(a.bitmap, a.largura, a.altura);
                const r = await f.processar(fonte, op, {
                    marcas: imgMarcas, arquivo: a,
                    aoProgredir: (t) => progresso(base, t)
                });
                const tipo = r.blob ? r.blob.type : (r.tipo || tipoPedido(op, a));
                const blob = r.blob || await salvar(r.canvas, tipo, r.qualidade || (Number(op.qualidade) || 92) / 100);
                const dims = r.canvas || fonte;
                const ext = IMGOPS.extensaoDoTipo(blob.type || tipo);
                // Comprimir que saiu MAIOR que a original nao ajuda ninguem: devolve a original.
                if (f.id === 'comprimir' && blob.size >= a.tamanho && IMGOPS.extensaoDoTipo(a.tipo) === ext) {
                    guardarResultado(a.nome, a.original, a.largura, a.altura, a.tamanho, true);
                } else {
                    guardarResultado(IMGOPS.nomeDeSaida(a.nome, r.sufixo, ext), blob, dims.width, dims.height, a.tamanho);
                }
                fonte.width = fonte.height = 1;
            }
        }
        const s = ((Date.now() - comecou) / 1000).toFixed(1);
        imgAviso = '';
        imgProgresso.fim = s;
    } catch (erro) {
        console.error('[IMG]', erro);
        imgErro = (erro && erro.message) ? erro.message : String(erro);
        soltarResultados();
    } finally {
        imgOcupado = false;
        imgRender();
    }
}

function encaixar(bitmap, L, A, QL, QA) {
    // Mantem a proporcao dentro do quadro do GIF, com fundo branco nas sobras.
    const c = novoCanvas(QL, QA);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, QL, QA);
    const f = Math.min(QL / L, QA / A);
    const l = L * f, a = A * f;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, (QL - l) / 2, (QA - a) / 2, l, a);
    return c;
}

// O <canvas> tem um teto de area por navegador (o do iPhone e' baixo). Passar dele nao da'
// erro: sai uma imagem em branco. Melhor avisar antes.
function verificarMemoria(a) {
    const teto = /iPhone|iPad|iPod/.test(navigator.userAgent || '') ? 16.7e6 : 64e6;
    if (a.largura * a.altura > teto) {
        throw new Error('"' + a.nome + '" é grande demais para este navegador (' + a.largura + ' × ' + a.altura +
                        ' px). Use "Redimensionar" num computador, ou reduza a foto no próprio celular.');
    }
}

function folga() { return new Promise(ok => setTimeout(ok, 0)); }

function progresso(fracao, texto) {
    imgProgresso = { fracao: fracao, texto: texto };
    const el = document.getElementById('imgProgresso');
    if (el) el.innerHTML = htmlProgresso();
}

function guardarResultado(nome, blob, largura, altura, antes, semGanho) {
    imgResultados.push({ nome: nome, blob: blob, url: urlDe(blob), largura: largura, altura: altura, antes: antes, semGanho: !!semGanho });
}

function soltarResultados() {
    imgResultados.forEach(r => revogar(r.url));
    imgResultados = [];
}

function baixar(url, nome) {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function imgBaixar(i) {
    const r = imgResultados[i];
    if (r) baixar(r.url, r.nome);
}

async function imgBaixarZip() {
    if (imgResultados.length < 2) return imgBaixar(0);
    try {
        let JSZip = window.JSZip;
        if (!JSZip && window.PDFOPS && PDFOPS.lib && PDFOPS.lib.jsZip) JSZip = await PDFOPS.lib.jsZip();
        if (!JSZip) throw new Error('JSZip indisponível');
        const zip = new JSZip();
        const usados = {};
        imgResultados.forEach(r => {
            let nome = r.nome;
            // Dois arquivos com o mesmo nome no .zip: o segundo apagaria o primeiro.
            if (usados[nome]) nome = nome.replace(/(\.[^.]+)$/, '-' + (++usados[nome]) + '$1');
            else usados[nome] = 1;
            zip.file(nome, r.blob);
        });
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        baixar(urlDe(blob), (imgFerramenta || 'imagens') + '.zip');
    } catch (erro) {
        imgAviso = 'Não consegui montar o .zip (' + (erro.message || erro) + '). Baixe as imagens uma por uma.';
        imgRender();
    }
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function imgAbrir(id) {
    const f = ferramenta(id);
    imgFerramenta = f ? f.id : null;
    imgErro = ''; imgAviso = '';
    soltarResultados();
    imgMarcas = {};
    // Imagens ja' escolhidas seguem para a proxima ferramenta (comprimir depois de cortar
    // e' o caminho comum). Para ferramenta de um arquivo so', fica a primeira.
    if (f && !f.varios && imgArquivos.length > 1) imgArquivos = imgArquivos.slice(0, 1);
    prepararPrevia();
    imgRender();
    const area = areaDaAba();
    if (area && area.scrollIntoView) { try { area.scrollIntoView({ block: 'start' }); } catch (_) { /* velho */ } }
}

function imgVoltar() { imgAbrir(null); }

function imgDefinir(campo, valor, tipo) {
    const f = ferramenta(imgFerramenta);
    if (!f) return;
    const op = opcoesDe(f);
    if (tipo === 'faixa') valor = Number(valor);
    if (tipo === 'check') valor = !!valor;
    op[campo] = valor;
    if (campo === 'proporcao' && f.marcar === 'corte') aplicarProporcaoAoCorte();
    soltarResultados();
    // Faixa e texto redesenham so' a previa: refazer a tela inteira tiraria o foco do
    // campo no meio da digitacao e o controle deslizante do dedo.
    if (tipo === 'faixa' || tipo === 'texto' || tipo === 'textarea' || tipo === 'numero') {
        const rotulo = document.getElementById('imgValor_' + campo);
        const c = (f.campos || []).find(x => x.id === campo);
        if (rotulo && c) rotulo.textContent = valor + (c.sufixo || '');
        const res = document.getElementById('imgResultado');
        if (res) res.innerHTML = '';
        const tamanho = document.getElementById('imgResumoTamanho');
        if (tamanho) tamanho.innerHTML = htmlResumoTamanho(f);
        agendarPrevia();
        return;
    }
    imgRender();
}

// ---------------------------------------------------------------------------
// A previa ao vivo e as marcacoes com o dedo
// ---------------------------------------------------------------------------

let _previaAgendada = 0;
function agendarPrevia() {
    if (_previaAgendada) return;
    _previaAgendada = requestAnimationFrame(() => { _previaAgendada = 0; desenharPrevia(); });
}

let _arrasto = null;

async function desenharPrevia() {
    const f = ferramenta(imgFerramenta);
    const tela = document.getElementById('imgPreviaCanvas');
    if (!f || !tela || !imgPreviaFonte) return;
    const op = opcoesDe(f);
    let quadro = imgPreviaFonte;
    try {
        if (f.marcar !== 'corte' && f.processar) {
            const r = await f.processar(imgPreviaFonte, op, { marcas: imgMarcas, previa: true });
            if (r.canvas) quadro = r.canvas;
        }
    } catch (e) { console.warn('[IMG] previa', e); }
    tela.width = quadro.width;
    tela.height = quadro.height;
    const ctx = tela.getContext('2d');
    ctx.clearRect(0, 0, tela.width, tela.height);
    ctx.drawImage(quadro, 0, 0);

    const L = tela.width, A = tela.height;
    const linha = Math.max(1.5, L / 400);
    if (f.marcar === 'corte') {
        const c = imgMarcas.corte || { x: 0, y: 0, l: 1, a: 1 };
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.rect(0, 0, L, A);
        ctx.rect(c.x * L, c.y * A, c.l * L, c.a * A);
        ctx.fill('evenodd');
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = linha;
        ctx.strokeRect(c.x * L, c.y * A, c.l * L, c.a * A);
        const t = Math.max(8, L / 50);
        ctx.fillStyle = '#ffffff';
        [[c.x, c.y], [c.x + c.l, c.y], [c.x, c.y + c.a], [c.x + c.l, c.y + c.a]].forEach(([x, y]) => {
            ctx.fillRect(x * L - t / 2, y * A - t / 2, t, t);
        });
        const info = document.getElementById('imgInfoCorte');
        const a = imgArquivos[0];
        if (info && a) info.textContent = Math.round(c.l * a.largura) + ' × ' + Math.round(c.a * a.altura) + ' px';
    } else if (f.marcar === 'areas') {
        ctx.strokeStyle = '#f6ad55';
        ctx.lineWidth = linha;
        ctx.setLineDash([linha * 3, linha * 2]);
        (imgMarcas.areas || []).concat(_arrasto && _arrasto.nova ? [_arrasto.nova] : []).forEach(r => {
            ctx.strokeRect(r.x * L, r.y * A, r.l * L, r.a * A);
        });
        ctx.setLineDash([]);
    } else if (f.marcar === 'pontos') {
        (imgMarcas.pontos || []).forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x * L, p.y * A, Math.max(4, L / 90), 0, Math.PI * 2);
            ctx.fillStyle = '#e53e3e'; ctx.fill();
            ctx.lineWidth = linha; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        });
    }
}

function pontoNormalizado(ev, tela) {
    const r = tela.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))
    };
}

function razaoDoCorte() {
    const f = ferramenta('cortar');
    const op = opcoesDe(f);
    const a = imgArquivos[0];
    if (!a || op.proporcao === 'livre') return 0;
    // A proporcao pedida e' em pixels; a marcacao e' normalizada (0..1 em cada eixo).
    return Number(op.proporcao) * a.altura / a.largura;
}

function aplicarProporcaoAoCorte() {
    const k = razaoDoCorte();
    if (!k) return;
    // O maior retangulo da proporcao pedida, centralizado.
    let l = 1, a = 1 / k;
    if (a > 1) { a = 1; l = k; }
    imgMarcas.corte = { x: (1 - l) / 2, y: (1 - a) / 2, l: l, a: a };
}

function ligarPrevia() {
    const f = ferramenta(imgFerramenta);
    const tela = document.getElementById('imgPreviaCanvas');
    if (!f || !tela) return;
    if (f.marcar === 'corte' && !imgMarcas.corte) {
        imgMarcas.corte = { x: 0, y: 0, l: 1, a: 1 };
        aplicarProporcaoAoCorte();
    }
    desenharPrevia();
    if (!f.marcar) return;
    tela.style.touchAction = 'none';
    tela.style.cursor = 'crosshair';

    tela.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        const p = pontoNormalizado(ev, tela);
        if (f.marcar === 'pontos') {
            (imgMarcas.pontos = imgMarcas.pontos || []).push(p);
            soltarResultados(); limparResultadoNaTela();
            desenharPrevia();
            return;
        }
        try { tela.setPointerCapture(ev.pointerId); } catch (_) { /* sem suporte */ }
        if (f.marcar === 'corte') {
            const c = imgMarcas.corte;
            const r = tela.getBoundingClientRect();
            const tolX = 16 / r.width, tolY = 16 / r.height;
            const cantos = [['nw', c.x, c.y], ['ne', c.x + c.l, c.y], ['sw', c.x, c.y + c.a], ['se', c.x + c.l, c.y + c.a]];
            const canto = cantos.find(k => Math.abs(p.x - k[1]) <= tolX && Math.abs(p.y - k[2]) <= tolY);
            if (canto) {
                // Puxar um canto: o canto oposto fica parado.
                const oposto = { nw: [c.x + c.l, c.y + c.a], ne: [c.x, c.y + c.a], sw: [c.x + c.l, c.y], se: [c.x, c.y] }[canto[0]];
                _arrasto = { modo: 'novo', ax: oposto[0], ay: oposto[1] };
            } else if (p.x > c.x && p.x < c.x + c.l && p.y > c.y && p.y < c.y + c.a && (c.l < 0.98 || c.a < 0.98)) {
                // Mover so' faz sentido se o corte nao e' a imagem inteira; com ela inteira,
                // arrastar dentro e' comecar a marcar.
                _arrasto = { modo: 'mover', dx: p.x - c.x, dy: p.y - c.y };
            } else {
                _arrasto = { modo: 'novo', ax: p.x, ay: p.y };
            }
        } else {
            _arrasto = { modo: 'area', ax: p.x, ay: p.y, nova: { x: p.x, y: p.y, l: 0, a: 0 } };
        }
    });

    tela.addEventListener('pointermove', ev => {
        if (!_arrasto) return;
        const p = pontoNormalizado(ev, tela);
        if (_arrasto.modo === 'mover') {
            const c = imgMarcas.corte;
            c.x = Math.max(0, Math.min(1 - c.l, p.x - _arrasto.dx));
            c.y = Math.max(0, Math.min(1 - c.a, p.y - _arrasto.dy));
        } else if (_arrasto.modo === 'novo') {
            let l = Math.abs(p.x - _arrasto.ax), a = Math.abs(p.y - _arrasto.ay);
            const k = razaoDoCorte();
            if (k) {
                // Com proporcao travada, manda o lado que o dedo puxou mais.
                if (l / k > a) a = l / k; else l = a * k;
                const maxL = p.x >= _arrasto.ax ? 1 - _arrasto.ax : _arrasto.ax;
                const maxA = p.y >= _arrasto.ay ? 1 - _arrasto.ay : _arrasto.ay;
                const f2 = Math.min(1, maxL / (l || 1), maxA / (a || 1));
                l *= f2; a *= f2;
            }
            const x = p.x >= _arrasto.ax ? _arrasto.ax : _arrasto.ax - l;
            const y = p.y >= _arrasto.ay ? _arrasto.ay : _arrasto.ay - a;
            if (l > 0.005 && a > 0.005) imgMarcas.corte = { x: x, y: y, l: l, a: a };
        } else {
            _arrasto.nova = {
                x: Math.min(p.x, _arrasto.ax), y: Math.min(p.y, _arrasto.ay),
                l: Math.abs(p.x - _arrasto.ax), a: Math.abs(p.y - _arrasto.ay)
            };
        }
        agendarPrevia();
    });

    const soltar = () => {
        if (!_arrasto) return;
        if (_arrasto.modo === 'area' && _arrasto.nova && _arrasto.nova.l > 0.01 && _arrasto.nova.a > 0.01) {
            (imgMarcas.areas = imgMarcas.areas || []).push(_arrasto.nova);
            const cont = document.getElementById('imgContagemMarcas');
            if (cont) cont.textContent = imgMarcas.areas.length;
        }
        _arrasto = null;
        soltarResultados(); limparResultadoNaTela();
        agendarPrevia();
    };
    tela.addEventListener('pointerup', soltar);
    tela.addEventListener('pointercancel', soltar);
}

function limparResultadoNaTela() {
    const res = document.getElementById('imgResultado');
    if (res) res.innerHTML = '';
}

function imgDesfazerMarca() {
    const f = ferramenta(imgFerramenta);
    if (!f) return;
    if (f.marcar === 'areas') (imgMarcas.areas || []).pop();
    if (f.marcar === 'pontos') (imgMarcas.pontos || []).pop();
    soltarResultados();
    imgRender();
}

function imgLimparMarcas() {
    const f = ferramenta(imgFerramenta);
    if (!f) return;
    if (f.marcar === 'corte') { imgMarcas.corte = { x: 0, y: 0, l: 1, a: 1 }; aplicarProporcaoAoCorte(); }
    else imgMarcas = {};
    soltarResultados();
    imgRender();
}

// Deteccao automatica de rosto: so' onde o navegador ja' traz o detector embutido (a
// Shape Detection API, que roda no aparelho). Nao se baixa modelo de ninguem.
async function imgDetectarRostos() {
    if (!('FaceDetector' in window) || !imgPreviaFonte) return;
    try {
        const detector = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 50 });
        const rostos = await detector.detect(imgPreviaFonte);
        const L = imgPreviaFonte.width, A = imgPreviaFonte.height;
        imgMarcas.areas = (imgMarcas.areas || []).concat(rostos.map(r => {
            const b = r.boundingBox, folga = 0.15;
            const x = Math.max(0, b.x - b.width * folga), y = Math.max(0, b.y - b.height * folga);
            return { x: x / L, y: y / A,
                     l: Math.min(L - x, b.width * (1 + 2 * folga)) / L, a: Math.min(A - y, b.height * (1 + 2 * folga)) / A };
        }));
        imgAviso = rostos.length ? rostos.length + ' rosto' + (rostos.length > 1 ? 's' : '') + ' encontrado' + (rostos.length > 1 ? 's' : '') +
                   '. Confira na prévia: o detector erra, e rosto de perfil costuma escapar.'
                   : 'Nenhum rosto encontrado. Marque à mão, arrastando sobre cada um.';
    } catch (e) {
        imgAviso = 'O detector de rostos deste navegador falhou (' + (e.message || e) + '). Marque à mão.';
    }
    soltarResultados();
    imgRender();
}

// ---------------------------------------------------------------------------
// A TELA
// ---------------------------------------------------------------------------

function areaDaAba() { return document.getElementById('tabFerramentasImg'); }

// Chamada pela aba "IMG" — ver ferramentas.js. `ferramentaId` abre direto numa ferramenta
// (o atalho antigo showFerramentasTab('ampliar') cai em "Aumentar resolucao").
function renderImg(ferramentaId) {
    if (ferramentaId !== undefined && ferramentaId !== imgFerramenta) {
        imgAbrir(ferramentaId);
        return;
    }
    imgRender();
}

const ESTILO = `
    <style>
        .img-grade { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:12px; margin-top:14px; }
        .img-cartao { text-align:left; border:1px solid #e3e8ef; background:#fff; border-radius:10px; padding:14px;
                      cursor:pointer; transition:all .15s; font:inherit; color:inherit; }
        .img-cartao:hover { border-color:#2563c9; box-shadow:0 2px 10px rgba(37,99,201,.12); transform:translateY(-1px); }
        .img-cartao .img-emoji { font-size:26px; line-height:1; }
        .img-cartao .img-nome { font-weight:bold; color:#1c2536; margin-top:8px; font-size:14px; }
        .img-cartao .img-resumo { color:#5f6b7f; font-size:12px; margin-top:4px; line-height:1.45; }
        .img-solta { border:2px dashed #cdd5e1; border-radius:10px; padding:24px 18px; text-align:center;
                     background:#f6f8fb; transition:all .15s; cursor:pointer; }
        .img-solta.img-sobre { border-color:#2563c9; background:#edf3fd; }
        .img-opcao { border:1px solid #e3e8ef; background:#fff; border-radius:8px; padding:6px 11px; cursor:pointer;
                     font-size:13px; color:#3d4759; transition:all .15s; }
        .img-opcao:hover { border-color:#7a869a; }
        .img-opcao.img-ativa { border-color:#2563c9; background:#edf3fd; color:#1f55ad; font-weight:bold; }
        .img-opcao[disabled] { opacity:.45; cursor:not-allowed; }
        .img-rotulo { font-size:12px; font-weight:bold; color:#3d4759; text-transform:uppercase; letter-spacing:.03em; }
        .img-ajuda { color:#5f6b7f; font-size:12px; margin-top:5px; line-height:1.45; }
        .img-campos { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:16px 22px; margin:16px 0; }
        .img-xadrez { background:repeating-conic-gradient(#e8ecf1 0% 25%, #fff 0% 50%) 50% / 18px 18px; }
        .img-previa { max-width:100%; max-height:70vh; display:block; margin:0 auto; border-radius:6px; }
        .img-lista { display:flex; flex-direction:column; gap:6px; margin:12px 0; }
        .img-item { display:flex; gap:10px; align-items:center; background:#f6f8fb; border:1px solid #e3e8ef;
                    border-radius:8px; padding:6px 10px; font-size:13px; }
        .img-item img { width:42px; height:42px; object-fit:contain; background:#fff; border:1px solid #e3e8ef; border-radius:4px; }
        #tabFerramentasImg input[type=text], #tabFerramentasImg input[type=number], #tabFerramentasImg textarea {
            width:100%; box-sizing:border-box; border:1px solid #cdd5e1; border-radius:6px; padding:7px 9px; font:inherit; font-size:14px; }
        #tabFerramentasImg textarea { font-family:ui-monospace, Menlo, Consolas, monospace; font-size:12px; }
    </style>`;

function imgRender() {
    const area = areaDaAba();
    if (!area) return;
    const f = ferramenta(imgFerramenta);

    // "Aumentar resolucao" tem tela propria (ampliar.js). Ela desenha dentro de
    // #tabFerramentasAmpliar, que passou a morar aqui dentro.
    if (f && f.externo) {
        area.innerHTML = ESTILO + barraVoltar(f) + '<div id="tabFerramentasAmpliar"></div>';
        if (typeof renderAmpliar === 'function') renderAmpliar();
        return;
    }

    area.innerHTML = ESTILO + (f ? htmlFerramenta(f) : htmlCatalogo());
    if (f && f.previa && imgPreviaFonte) ligarPrevia();
}

function barraVoltar(f) {
    return `<div style="display:flex; gap:10px; align-items:center; margin:16px 0 0; flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="imgVoltar()" ${imgOcupado ? 'disabled' : ''}>← Todas as ferramentas de imagem</button>
        <span style="color:#5f6b7f; font-size:13px;">${f.emoji} ${esc(f.nome)}</span>
    </div>`;
}

function avisos() {
    return `
        ${imgErro ? `<div style="background:#fff5f5; border:1px solid #fc8181; color:#742a2a; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; line-height:1.6;">
            ⚠️ ${esc(imgErro)}</div>` : ''}
        ${imgAviso ? `<div style="background:#edf3fd; border:1px solid #a9c6f3; color:#1b4488; border-radius:8px; padding:10px 14px; margin:12px 0; font-size:13px; line-height:1.6;">
            ${esc(imgAviso)}</div>` : ''}`;
}

function htmlCatalogo() {
    const premium = ehPremiumImg();
    return `
        <div class="card" style="margin:20px 0;">
            <h2>🖼️ Ferramentas de imagem ${seloPro()}</h2>
            <p style="color:#3d4759; font-size:14px; line-height:1.6; margin-bottom:6px;">
                Comprimir, redimensionar, cortar, converter, editar, aumentar a resolução, tirar o fundo,
                pôr marca d'água, girar e esconder rostos — o que se faria num site de imagem gratuito.
            </p>
            <div style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#22543d; line-height:1.6;">
                🔒 <strong>A imagem não sai deste aparelho.</strong> Tudo acontece aqui, no navegador. Uma foto com
                o rosto ou o documento de um estudante <strong>não pode</strong> ser enviada a um site gratuito de
                imagem: isso é entregar dado pessoal de criança a um terceiro que a escola não autorizou
                (ver <code>CONFORMIDADE-SEDUC.md</code>).
            </div>
            ${premium ? '' : `
                <div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#744210; line-height:1.6;">
                    ⭐ Estas ferramentas fazem parte do <strong>plano Professor</strong>. Você pode ver tudo o que
                    existe aqui; para usar, é preciso assinar.
                    <div style="margin-top:8px;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalApoie({ destaque: 'professor' })">Ver o plano Professor</button>
                    </div>
                </div>`}
            <div class="img-grade" id="imgGrade">
                ${CATALOGO_IMG.map(x => `
                    <button class="img-cartao" data-ferramenta="${x.id}" onclick="imgAbrir('${x.id}')">
                        <div class="img-emoji">${x.emoji}</div>
                        <div class="img-nome">${esc(x.nome)}</div>
                        <div class="img-resumo">${esc(x.resumo)}</div>
                    </button>`).join('')}
            </div>
        </div>`;
}

function htmlFerramenta(f) {
    const op = opcoesDe(f);
    return `
        ${barraVoltar(f)}
        <div class="card" style="margin:12px 0 20px;">
            <h2>${f.emoji} ${esc(f.nome)} ${seloPro()}</h2>
            <p style="color:#3d4759; font-size:14px; line-height:1.6; margin-bottom:6px;">${esc(f.detalhe || f.resumo)}</p>
            ${avisos()}
            ${f.semArquivo ? '' : htmlArquivos(f)}
            ${(f.semArquivo || imgArquivos.length) ? `
                ${f.previa && imgPreviaFonte ? htmlPrevia(f) : ''}
                <div class="img-campos">${(f.campos || []).map(c => htmlCampo(f, c, op)).join('')}</div>
                <div id="imgResumoTamanho">${htmlResumoTamanho(f)}</div>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button class="btn btn-primary" id="imgExecutar" onclick="imgExecutar()" ${imgOcupado ? 'disabled' : ''}>
                        ${imgOcupado ? '⏳ Trabalhando...' : f.emoji + ' ' + esc(rotuloDoBotao(f, op))}
                    </button>
                </div>
                <div id="imgProgresso" style="margin-top:14px;">${htmlProgresso()}</div>
                <div id="imgResultado">${htmlResultado(f)}</div>` : ''}
        </div>`;
}

function rotuloDoBotao(f, op) {
    const n = imgArquivos.length;
    if (f.juntar && f.juntar(op, n)) return 'Criar GIF animado';
    const verbo = { comprimir: 'Comprimir', redimensionar: 'Redimensionar', cortar: 'Cortar', paraJpg: 'Converter',
                    deJpg: 'Converter', editor: 'Salvar a foto', removerFundo: 'Remover o fundo', marcaDagua: "Aplicar a marca d'água",
                    meme: 'Gerar o meme', girar: 'Girar', htmlImagem: 'Gerar a imagem', desfocarRosto: 'Esconder as áreas marcadas' }[f.id] || 'Processar';
    return verbo + (n > 1 && f.varios ? ' ' + n + ' imagens' : '');
}

function htmlArquivos(f) {
    const soltar = `
        <div class="img-solta" onclick="document.getElementById('imgArquivo').click()"
             ondragover="imgArrastando(event, true)" ondragleave="imgArrastando(event, false)" ondrop="imgSoltar(event)">
            <div style="font-size:32px; line-height:1;">🖼️</div>
            <div style="font-weight:bold; color:#1c2536; margin-top:8px;">
                ${f.varios ? (imgArquivos.length ? 'Acrescentar mais imagens' : 'Escolha as imagens ou arraste para cá')
                           : (imgArquivos.length ? 'Trocar a imagem' : 'Escolha a imagem ou arraste ela para cá')}</div>
            <div style="color:#5f6b7f; font-size:12px; margin-top:4px;">
                JPG, PNG, WebP, GIF, BMP, SVG — até ${IMG_MAX_MB} MB${f.varios ? ' cada, até ' + IMG_MAX_ARQUIVOS + ' de uma vez' : ''}
            </div>
        </div>
        <input type="file" id="imgArquivo" accept="image/*,.svg" ${f.varios ? 'multiple' : ''} style="display:none;" onchange="imgEscolher(this)">`;

    if (!imgArquivos.length) return `<div style="margin-top:14px;">${soltar}</div>`;

    return `
        <div class="img-lista">
            ${imgArquivos.map((a, i) => `
                <div class="img-item">
                    <img src="${esc(a.url)}" alt="">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:bold; color:#1c2536; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(a.nome)}</div>
                        <div style="color:#5f6b7f; font-size:12px;">${a.largura} × ${a.altura} px · ${tam(a.tamanho)}</div>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="imgTirar(${i})" ${imgOcupado ? 'disabled' : ''} title="Tirar da lista">✕</button>
                </div>`).join('')}
        </div>
        ${imgArquivos.length > 1 ? `<div style="text-align:right; margin:-4px 0 8px;">
            <button class="btn btn-sm btn-secondary" onclick="imgLimparArquivos()" ${imgOcupado ? 'disabled' : ''}>Tirar todas</button></div>` : ''}
        ${soltar}`;
}

function htmlPrevia(f) {
    let dica = '', botoes = '';
    if (f.marcar === 'corte') {
        dica = 'Arraste para marcar o corte. Puxe um canto para ajustar; arraste o meio para mover. <strong id="imgInfoCorte"></strong>';
        botoes = `<button class="btn btn-sm btn-secondary" onclick="imgLimparMarcas()">Imagem inteira</button>`;
    } else if (f.marcar === 'areas') {
        const n = (imgMarcas.areas || []).length;
        dica = 'Arraste sobre cada rosto (ou placa, crachá, documento). Áreas marcadas: <strong id="imgContagemMarcas">' + n + '</strong>';
        botoes = `<button class="btn btn-sm btn-secondary" onclick="imgDesfazerMarca()">Desfazer a última</button>
                  <button class="btn btn-sm btn-secondary" onclick="imgLimparMarcas()">Apagar todas</button>
                  ${'FaceDetector' in window ? '<button class="btn btn-sm btn-secondary" onclick="imgDetectarRostos()">🤖 Achar rostos sozinho</button>' : ''}`;
    } else if (f.marcar === 'pontos') {
        const n = (imgMarcas.pontos || []).length;
        dica = 'Sobrou fundo? Toque nele na prévia. ' + (n ? 'Toques: <strong>' + n + '</strong>' : '');
        botoes = n ? `<button class="btn btn-sm btn-secondary" onclick="imgDesfazerMarca()">Desfazer o último toque</button>
                      <button class="btn btn-sm btn-secondary" onclick="imgLimparMarcas()">Apagar os toques</button>` : '';
    }
    return `
        <div style="margin:14px 0 4px;">
            <div class="img-rotulo" style="margin-bottom:6px;">Prévia</div>
            <div class="img-xadrez" style="border:1px solid #e3e8ef; border-radius:8px; padding:8px;">
                <canvas id="imgPreviaCanvas" class="img-previa"></canvas>
            </div>
            ${dica ? `<div class="img-ajuda">${dica}</div>` : ''}
            ${botoes ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">${botoes}</div>` : ''}
        </div>`;
}

function htmlCampo(f, c, op) {
    const arq = imgArquivos[0];
    if (c.quando && !c.quando(op, arq, imgArquivos.length)) return '';
    const dis = imgOcupado ? 'disabled' : '';
    const v = op[c.id];
    let corpo = '';
    if (c.tipo === 'botoes') {
        corpo = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            ${c.opcoes.map(([valor, texto]) => `
                <button class="img-opcao ${String(v) === String(valor) ? 'img-ativa' : ''}" ${dis}
                        onclick="imgDefinir('${c.id}', '${esc(valor)}')">${esc(texto)}</button>`).join('')}
        </div>`;
    } else if (c.tipo === 'faixa') {
        corpo = `<input type="range" min="${c.min}" max="${c.max}" step="${c.passo || 1}" value="${esc(v)}" ${dis}
                        style="width:100%; margin-top:6px;" oninput="imgDefinir('${c.id}', this.value, 'faixa')">`;
    } else if (c.tipo === 'numero') {
        corpo = `<input type="number" ${c.min != null ? 'min="' + c.min + '"' : ''} ${c.max != null ? 'max="' + c.max + '"' : ''}
                        value="${esc(v)}" ${dis} style="margin-top:6px;" oninput="imgDefinir('${c.id}', this.value, 'numero')">`;
    } else if (c.tipo === 'texto') {
        corpo = `<input type="text" value="${esc(v)}" ${dis} style="margin-top:6px;" oninput="imgDefinir('${c.id}', this.value, 'texto')">`;
    } else if (c.tipo === 'textarea') {
        corpo = `<textarea rows="${c.linhas || 2}" ${dis} style="margin-top:6px;" oninput="imgDefinir('${c.id}', this.value, 'textarea')">${esc(v)}</textarea>`;
    } else if (c.tipo === 'cor') {
        corpo = `<input type="color" value="${esc(v)}" ${dis} style="margin-top:6px; width:60px; height:34px; border:1px solid #cdd5e1; border-radius:6px;"
                        onchange="imgDefinir('${c.id}', this.value)">`;
    } else if (c.tipo === 'check') {
        return `<div><label style="display:flex; gap:8px; align-items:flex-start; font-size:13px; color:#1c2536; cursor:pointer;">
                    <input type="checkbox" ${v ? 'checked' : ''} ${dis} style="margin-top:2px;" onchange="imgDefinir('${c.id}', this.checked, 'check')">
                    <span>${esc(c.rotulo)}</span></label>
                    ${c.ajuda ? `<div class="img-ajuda">${esc(c.ajuda)}</div>` : ''}</div>`;
    } else if (c.tipo === 'arquivo') {
        corpo = `<div style="display:flex; gap:8px; align-items:center; margin-top:6px; flex-wrap:wrap;">
            ${imgLogo ? `<img src="${esc(imgLogo.url)}" alt="" style="width:42px; height:42px; object-fit:contain;" class="img-xadrez">` : ''}
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('imgLogoArquivo').click()" ${dis}>
                ${imgLogo ? 'Trocar o logotipo' : 'Escolher o logotipo'}</button>
            <input type="file" id="imgLogoArquivo" accept="image/*,.svg" style="display:none;" onchange="imgEscolherLogo(this)">
        </div>`;
    }
    const mostraValor = c.tipo === 'faixa'
        ? ` <span id="imgValor_${c.id}" style="font-weight:normal; text-transform:none; color:#1f55ad;">${esc(v)}${esc(c.sufixo || '')}</span>` : '';
    return `<div>
        <div class="img-rotulo">${esc(c.rotulo)}${mostraValor}</div>
        ${corpo}
        ${c.ajuda ? `<div class="img-ajuda">${esc(c.ajuda)}</div>` : ''}
    </div>`;
}

function htmlResumoTamanho(f) {
    if (!f.resumoTamanho || !imgArquivos.length) return '';
    const op = opcoesDe(f);
    const a = imgArquivos[0];
    const t = f.resumoTamanho(a, op);
    return `<div class="img-ajuda" style="margin:-4px 0 14px;">
        ${esc(a.nome)}: ${a.largura} × ${a.altura} px → <strong>${t.largura} × ${t.altura} px</strong>
        ${imgArquivos.length > 1 ? ' (cada imagem mantém a própria proporção)' : ''}</div>`;
}

function htmlProgresso() {
    if (!imgOcupado) return '';
    const pct = Math.max(2, Math.min(100, Math.round((imgProgresso.fracao || 0) * 100)));
    return `
        <div style="background:#eef2f7; border-radius:999px; height:10px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:#2563c9; transition:width .2s;"></div>
        </div>
        <div style="font-size:12px; color:#5f6b7f; margin-top:6px;">${esc(imgProgresso.texto || '')}</div>`;
}

function htmlResultado(f) {
    if (!imgResultados.length || imgOcupado) return '';
    const totalAntes = imgResultados.reduce((s, r) => s + (r.antes || 0), 0);
    const totalDepois = imgResultados.reduce((s, r) => s + r.blob.size, 0);
    const economia = totalAntes ? Math.round((1 - totalDepois / totalAntes) * 100) : 0;
    const um = imgResultados.length === 1 ? imgResultados[0] : null;
    return `
        <div style="margin-top:18px; border-top:1px solid #e3e8ef; padding-top:16px;">
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                <div style="flex:1; min-width:200px;">
                    <div style="font-weight:bold; color:#1c2536;">✅ Pronto${um ? ' — ' + um.largura + ' × ' + um.altura + ' px' : ': ' + imgResultados.length + ' imagens'}</div>
                    <div style="color:#5f6b7f; font-size:12px; margin-top:2px;">
                        ${totalAntes ? tam(totalAntes) + ' → ' : ''}<strong>${tam(totalDepois)}</strong>
                        ${totalAntes && economia > 0 ? ' · ' + economia + '% menor' : ''}
                        ${imgProgresso.fim ? ' · ' + imgProgresso.fim + 's' : ''}
                    </div>
                </div>
                ${um ? `<button class="btn btn-primary" onclick="imgBaixar(0)">⬇️ Baixar</button>`
                     : `<button class="btn btn-primary" onclick="imgBaixarZip()">📦 Baixar todas em .zip</button>`}
            </div>
            ${imgResultados.some(r => r.semGanho) ? `<div class="img-ajuda" style="margin-bottom:10px;">
                Algumas imagens já estavam bem comprimidas: comprimir de novo deixaria o arquivo maior,
                então elas foram mantidas como estavam.</div>` : ''}
            ${um ? `<div class="img-xadrez" style="border:1px solid #e3e8ef; border-radius:8px; padding:8px; line-height:0;">
                        <img src="${esc(um.url)}" alt="Resultado" id="imgResultadoImagem" class="img-previa"></div>`
                 : `<div class="img-lista">${imgResultados.map((r, i) => `
                        <div class="img-item">
                            <img src="${esc(r.url)}" alt="">
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:bold; color:#1c2536; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(r.nome)}</div>
                                <div style="color:#5f6b7f; font-size:12px;">${r.largura} × ${r.altura} px ·
                                    ${r.antes ? tam(r.antes) + ' → ' : ''}${tam(r.blob.size)}${r.semGanho ? ' (mantida)' : ''}</div>
                            </div>
                            <button class="btn btn-sm btn-secondary" onclick="imgBaixar(${i})">⬇️</button>
                        </div>`).join('')}</div>`}
        </div>`;
}

// A tela nao usa modulos: os onclick do HTML gerado precisam achar isto no window.
window.CATALOGO_IMG = CATALOGO_IMG;
window.renderImg = renderImg;
window.imgAbrir = imgAbrir;
window.imgVoltar = imgVoltar;
window.imgEscolher = imgEscolher;
window.imgSoltar = imgSoltar;
window.imgArrastando = imgArrastando;
window.imgTirar = imgTirar;
window.imgLimparArquivos = imgLimparArquivos;
window.imgEscolherLogo = imgEscolherLogo;
window.imgDefinir = imgDefinir;
window.imgExecutar = imgExecutar;
window.imgBaixar = imgBaixar;
window.imgBaixarZip = imgBaixarZip;
window.imgDesfazerMarca = imgDesfazerMarca;
window.imgLimparMarcas = imgLimparMarcas;
window.imgDetectarRostos = imgDetectarRostos;
// Para os testes: le/abre sem passar pela tela.
window.imgAdicionarArquivos = imgAdicionar;
window.imgEstado = () => ({ ferramenta: imgFerramenta, arquivos: imgArquivos.length, resultados: imgResultados.slice(),
                            erro: imgErro, aviso: imgAviso, marcas: JSON.parse(JSON.stringify(imgMarcas)) });

})();
