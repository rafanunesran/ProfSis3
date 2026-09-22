// pdf_operacoes.js — O MOTOR das Ferramentas PDF (a primeira funcao premium do SisProf).
//
// A regra que manda em tudo aqui: O ARQUIVO NAO SAI DO APARELHO. Nenhuma operacao
// deste arquivo faz upload. O PDF e' lido em memoria, transformado no proprio
// navegador e devolvido para download. Isso nao e' capricho de engenharia — e' a
// unica forma de um professor poder tratar um Anexo III-PAEE, um laudo ou uma ata
// com nome de estudante sem violar a LGPD e sem depender da boa vontade de um
// servico de terceiros (ver CONFORMIDADE-SEDUC.md).
//
// COMO AS OPERACOES SAO ESCRITAS
//   Toda operacao tem a mesma forma:
//
//       async function(e, prog) -> { arquivos: [...], mensagem: '...' }
//
//   `e`    entradas ja' prontas: arquivos como { nome, bytes } (Uint8Array), e os
//          demais campos como texto/numero/booleano, na chave declarada no catalogo
//          (pdf_ferramentas.js). Ler o arquivo e' trabalho da tela, nao daqui.
//   `prog` informa andamento: prog(0..100, 'texto'). Pode ser chamada ou ignorada.
//   saida  `arquivos` e' uma lista de { nome, bytes|blob, tipo }. Quem embala em ZIP
//          e oferece o download e' a tela.
//
//   O motivo de receber BYTES e nao File: assim a operacao roda igual no navegador e
//   no Node, e testes/teste-pdf.js exercita as contas de verdade (juntar, dividir,
//   proteger, N-up...) sem abrir navegador nenhum.
//
// AS BIBLIOTECAS
//   Carregadas SOB DEMANDA, por CDN, so' quando a ferramenta e' aberta. Somadas
//   passam de 3 MB — baixar isso na abertura do sistema castigaria o professor que
//   entrou so' para fazer chamada.
//
//   - @cantoo/pdf-lib  monta e desmonta o PDF (paginas, texto, imagens, formularios).
//                      E' o pdf-lib com o que faltava: senha (AES-256), leitura de
//                      arquivo protegido, PDF/A e anexos. O pdf-lib original nao
//                      cifra, e sem cifrar nao existe "Proteger PDF" de verdade.
//   - pdf.js           desenha a pagina (visualizar, rasterizar, PDF -> imagem) e
//                      extrai o texto.
//   - jsPDF            monta PDF novo a partir de imagem/texto (Imagens para PDF).
//   - JSZip            junta varios resultados num .zip (e escreve o .docx/.xlsx).
//   - Tesseract.js     OCR (reconhece o texto de um PDF digitalizado), em portugues.
//   - SheetJS (XLSX)   planilha -> PDF e PDF -> planilha.
//   - heic2any         HEIC do iPhone -> JPG/PNG.
//   - qrcode-generator codigo QR.

(function () {
'use strict';

const ehNavegador = (typeof window !== 'undefined' && typeof document !== 'undefined');

// ---------------------------------------------------------------------------
// Carregamento das bibliotecas, sob demanda
// ---------------------------------------------------------------------------

// Versoes fixas de proposito. "latest" num CDN significa que uma atualizacao de
// terceiro pode quebrar a ferramenta de madrugada, sem ninguem ter tocado no codigo.
const CDN = {
    pdflib:    'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js',
    pdfjs:     'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfjsWork: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    jspdf:     'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    jszip:     'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    xlsx:      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    heic:      'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
    qr:        'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
};

const _carregando = {};   // src -> Promise, para nao baixar o mesmo script duas vezes

// Tenta tres vezes antes de desistir. O Wi-Fi de escola derruba um script no meio do
// caminho com frequencia desconfortavel, e uma falha assim cancelava a ferramenta
// inteira depois de o professor ja ter escolhido o arquivo. Tentar de novo custa
// segundos; nao tentar custa o trabalho.
function carregarScript(src) {
    if (!ehNavegador) return Promise.reject(new Error('carregarScript so existe no navegador'));
    if (_carregando[src]) return _carregando[src];

    const umaTentativa = () => new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => ok();
        s.onerror = () => { s.remove(); falha(new Error('falha de rede')); };
        document.head.appendChild(s);
    });

    _carregando[src] = (async () => {
        const esperas = [0, 700, 1800];
        for (let i = 0; i < esperas.length; i++) {
            if (esperas[i]) await new Promise(ok => setTimeout(ok, esperas[i]));
            try {
                await umaTentativa();
                return;
            } catch (_) { /* tenta de novo */ }
        }
        // Sai do cache: a proxima abertura da ferramenta tenta de novo, em vez de
        // repetir para sempre a falha de uma hora ruim de internet.
        delete _carregando[src];
        throw new Error('Nao consegui baixar a biblioteca de PDF depois de 3 tentativas (' + src + '). ' +
                        'Verifique a conexao e abra a ferramenta de novo.');
    })();
    return _carregando[src];
}

// O pdf-lib do Cantoo publica em window.PDFLib (UMD). Guardamos a referencia na
// nossa propria chave: se um dia outro arquivo do sistema carregar o pdf-lib
// original, o nosso nao passa a ser o dele — e as ferramentas de senha, que so'
// existem nesta versao, continuariam funcionando.
let _pdflib = null;
async function libPdfLib() {
    if (_pdflib) return _pdflib;
    if (!ehNavegador) throw new Error('pdf-lib indisponivel');
    await carregarScript(CDN.pdflib);
    _pdflib = window.PDFLib;
    if (!_pdflib || !_pdflib.PDFDocument) throw new Error('pdf-lib carregou, mas nao expos PDFDocument.');
    return _pdflib;
}

let _pdfjs = null;
async function libPdfJs() {
    if (_pdfjs) return _pdfjs;
    if (typeof window !== 'undefined' && window.pdfjsLib) {
        _pdfjs = window.pdfjsLib;
    } else {
        await carregarScript(CDN.pdfjs);
        _pdfjs = window.pdfjsLib;
    }
    if (!_pdfjs) throw new Error('pdf.js nao carregou.');
    // Sem o worker o pdf.js roda na thread da interface e a pagina congela em PDF grande.
    if (_pdfjs.GlobalWorkerOptions && !_pdfjs.GlobalWorkerOptions.workerSrc) {
        _pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfjsWork;
    }
    return _pdfjs;
}

async function libJsPdf() {
    if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    await carregarScript(CDN.jspdf);
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF nao carregou.');
    return window.jspdf.jsPDF;
}

async function libJsZip() {
    if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
    if (!ehNavegador) { try { return require('jszip'); } catch (_) { /* segue */ } }
    await carregarScript(CDN.jszip);
    if (!window.JSZip) throw new Error('JSZip nao carregou.');
    return window.JSZip;
}

async function libTesseract() {
    if (typeof window !== 'undefined' && window.Tesseract) return window.Tesseract;
    await carregarScript(CDN.tesseract);
    if (!window.Tesseract) throw new Error('Tesseract.js (OCR) nao carregou.');
    return window.Tesseract;
}

async function libXlsx() {
    if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
    await carregarScript(CDN.xlsx);
    if (!window.XLSX) throw new Error('SheetJS (planilhas) nao carregou.');
    return window.XLSX;
}

async function libHeic() {
    if (typeof window !== 'undefined' && window.heic2any) return window.heic2any;
    await carregarScript(CDN.heic);
    if (!window.heic2any) throw new Error('heic2any nao carregou.');
    return window.heic2any;
}

async function libQr() {
    if (typeof window !== 'undefined' && window.qrcode) return window.qrcode;
    await carregarScript(CDN.qr);
    if (!window.qrcode) throw new Error('Gerador de QR nao carregou.');
    return window.qrcode;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function semExtensao(nome) {
    return String(nome || 'documento').replace(/\.[^.]+$/, '') || 'documento';
}

function bytesDe(x) {
    if (!x) return new Uint8Array(0);
    if (x instanceof Uint8Array) return x;
    if (x.bytes instanceof Uint8Array) return x.bytes;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    throw new Error('Esperava os bytes do arquivo.');
}

// Lista de arquivos: aceita um arquivo so' ou varios, e sempre devolve lista.
function listaDe(x) {
    if (!x) return [];
    return Array.isArray(x) ? x.slice() : [x];
}

// "1-3, 5, 8-" com 10 paginas -> [0,1,2,4,7,8,9] (indices, base 0, sem repetir, em ordem).
// Tambem aceita "todas", "impares", "pares" e a palavra "ultima".
//
// De proposito NAO aceita numero negativo contando do fim: em ferramenta de PDF,
// "-3" quer dizer "da primeira ate' a 3" para praticamente todo mundo, e as duas
// leituras no mesmo campo viram erro silencioso no documento de outra pessoa.
function faixaParaIndices(texto, total) {
    const bruto = String(texto == null ? '' : texto).trim().toLowerCase();
    if (!bruto || bruto === 'todas' || bruto === 'todos' || bruto === '*') {
        return Array.from({ length: total }, (_, i) => i);
    }
    if (bruto === 'impares' || bruto === 'ímpares') {
        return Array.from({ length: total }, (_, i) => i).filter(i => i % 2 === 0);
    }
    if (bruto === 'pares') {
        return Array.from({ length: total }, (_, i) => i).filter(i => i % 2 === 1);
    }

    const vistos = new Set();
    const saida = [];
    const guardar = (n1) => {                      // n1 = numero da pagina (base 1)
        const i = n1 - 1;
        if (i < 0 || i >= total || vistos.has(i)) return;
        vistos.add(i);
        saida.push(i);
    };
    // "ultima" e "penultima" existem porque quem numera ou assina quase sempre quer
    // a ultima pagina e nao sabe quantas sao antes de abrir o arquivo.
    const numeroDe = (p) => {
        if (/^(ultima|última|fim|final)$/.test(p)) return total;
        if (/^(penultima|penúltima)$/.test(p)) return total - 1;
        const n = parseInt(p, 10);
        return isNaN(n) ? null : n;
    };

    bruto.split(/[,;]+/).forEach(parte => {
        const p = parte.trim();
        if (!p) return;
        // "2-5", "8-" (do 8 ao fim), "-3" (do inicio ate' 3), "3 a 7", "2-ultima"
        const faixa = /^([\wà-ÿ]+)?\s*[-–]\s*([\wà-ÿ]+)?$/.exec(p) ||
                      /^([\wà-ÿ]+)\s+a\s+([\wà-ÿ]+)$/.exec(p);
        if (faixa && (faixa[1] || faixa[2])) {
            const a = faixa[1] ? numeroDe(faixa[1]) : 1;
            const b = faixa[2] ? numeroDe(faixa[2]) : total;
            if (a === null || b === null) return;
            const passo = a <= b ? 1 : -1;
            for (let n = a; passo > 0 ? n <= b : n >= b; n += passo) guardar(n);
            return;
        }
        const n = numeroDe(p);
        if (n !== null) guardar(n);
    });

    if (!saida.length) {
        throw new Error('Nao entendi as paginas "' + texto + '". Escreva assim: 1-3, 5, 8-10 ' +
                        '(vale tambem "todas", "pares", "impares" e "ultima").');
    }
    return saida;
}

// Abre o PDF com o pdf-lib. Erro de arquivo cifrado vira mensagem que diz o que fazer,
// e nao "Input document to `PDFDocument.load` is encrypted".
async function abrirPdf(arquivo, opcoes) {
    const PDFLib = await libPdfLib();
    const bytes = bytesDe(arquivo);
    if (!bytes.length) throw new Error('O arquivo ' + (arquivo && arquivo.nome ? '"' + arquivo.nome + '" ' : '') + 'chegou vazio.');
    try {
        return await PDFLib.PDFDocument.load(bytes, Object.assign({ updateMetadata: false }, opcoes || {}));
    } catch (erro) {
        const msg = String((erro && erro.message) || erro);
        if (/encrypt/i.test(msg)) {
            throw new Error('Este PDF esta protegido por senha. Use a ferramenta "Desbloquear PDF" primeiro ' +
                            '(ou informe a senha, quando a ferramenta pedir).');
        }
        if (/Failed to parse|No PDF header|Expected instance/i.test(msg)) {
            throw new Error('Nao consegui ler este PDF — o arquivo parece corrompido. Tente a ferramenta "Reparar PDF".');
        }
        throw erro;
    }
}

// Abre com o pdf.js (para desenhar a pagina e extrair texto).
async function abrirPdfJs(arquivo, senha) {
    const pdfjsLib = await libPdfJs();
    // O pdf.js fica com o ArrayBuffer (o "detach" deixa os bytes originais vazios),
    // e varias ferramentas usam os MESMOS bytes depois. Por isso, sempre uma copia.
    const copia = new Uint8Array(bytesDe(arquivo));
    const params = { data: copia };
    if (senha) params.password = senha;
    return await pdfjsLib.getDocument(params).promise;
}

// Desenha uma pagina num <canvas>. `escala` 1 = 72 dpi; 2 ~ 144 dpi.
async function paginaParaCanvas(doc, numero, escala) {
    const pagina = await doc.getPage(numero);
    const vista = pagina.getViewport({ scale: escala || 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(vista.width));
    canvas.height = Math.max(1, Math.floor(vista.height));
    const ctx = canvas.getContext('2d');
    // Fundo branco: PDF sem fundo declarado exportado para JPG sairia com o fundo preto.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
    return canvas;
}

function canvasParaBlob(canvas, tipo, qualidade) {
    return new Promise((ok, falha) => {
        canvas.toBlob(b => b ? ok(b) : falha(new Error('O navegador nao conseguiu exportar a imagem.')),
                      tipo || 'image/png', qualidade);
    });
}

async function blobParaBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
}

// dpi -> escala do pdf.js (o PDF nasce em 72 pontos por polegada).
function escalaParaDpi(dpi) {
    const n = Number(dpi) || 150;
    return Math.max(0.2, Math.min(8, n / 72));
}

// Texto de uma pagina do pdf.js, tentando preservar a quebra de linha: o pdf.js
// entrega pedacos soltos com coordenadas, e concatenar tudo com espaco transforma
// uma ata em um paragrafo unico ilegivel.
function juntarItensDeTexto(itens) {
    let saida = '';
    let ultimoY = null;
    itens.forEach(item => {
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (ultimoY !== null && y !== null && Math.abs(y - ultimoY) > 2) {
            saida += (Math.abs(y - ultimoY) > 14 ? '\n\n' : '\n');
        } else if (saida && !/\s$/.test(saida) && !/^\s/.test(item.str || '')) {
            saida += ' ';
        }
        saida += (item.str || '');
        if (y !== null) ultimoY = y;
        if (item.hasEOL) { saida += '\n'; ultimoY = null; }
    });
    return saida.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function textoDoPdf(arquivo, prog, senha) {
    const doc = await abrirPdfJs(arquivo, senha);
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
        if (prog) prog(Math.round((i - 1) / doc.numPages * 90), 'Lendo pagina ' + i + ' de ' + doc.numPages);
        const pagina = await doc.getPage(i);
        const conteudo = await pagina.getTextContent();
        paginas.push(juntarItensDeTexto(conteudo.items || []));
    }
    return paginas;
}

function textoParaBytes(texto) {
    return new TextEncoder().encode(texto);
}

// Escapa para HTML. Cada modulo do sistema tem a sua (o app nao carrega modulos ES),
// e aqui ela tambem protege o XML do .docx que montamos a mao.
function escXml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Cor "#rrggbb" -> rgb() do pdf-lib.
async function corPdf(hex) {
    const PDFLib = await libPdfLib();
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return PDFLib.rgb(0, 0, 0);
    const n = parseInt(m[1], 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Tamanhos de pagina, em pontos (1 pt = 1/72").
const TAMANHOS_PAGINA = {
    A0: [2383.94, 3370.39], A1: [1683.78, 2383.94], A2: [1190.55, 1683.78],
    A3: [841.89, 1190.55], A4: [595.28, 841.89], A5: [419.53, 595.28], A6: [297.64, 419.53],
    Carta: [612, 792], Oficio: [612, 1008], Tabloide: [792, 1224],
    Executivo: [521.86, 756], B4: [708.66, 1000.63], B5: [498.9, 708.66]
};

// Fonte padrao de todo texto que escrevemos sobre o PDF. Helvetica cobre a tabela
// WinAnsi, que tem os acentos do portugues — "Ação" sai certo. As demais fontes
// padrao do PDF (Symbol, ZapfDingbats) nao tem, e nem tentamos usar.
async function fonteHelvetica(doc, negrito) {
    const PDFLib = await libPdfLib();
    return await doc.embedFont(negrito ? PDFLib.StandardFonts.HelveticaBold : PDFLib.StandardFonts.Helvetica);
}

// Helvetica so' desenha o que existe em WinAnsi. Emoji, caracteres chineses ou o
// travessao "—" derrubariam o save() com "cannot encode". Trocamos o que nao cabe
// em vez de falhar no fim de uma operacao longa.
function limparParaWinAnsi(texto) {
    return String(texto == null ? '' : texto)
        .replace(/[‐-―]/g, '-')
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”‟]/g, '"')
        .replace(/…/g, '...')
        .replace(/ /g, ' ')
        .replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]/g, '');
}

// Quebra o texto em linhas que caibam na largura dada.
function quebrarLinhas(texto, fonte, tamanho, largura) {
    const linhas = [];
    String(texto == null ? '' : texto).split(/\r?\n/).forEach(paragrafo => {
        if (!paragrafo.trim()) { linhas.push(''); return; }
        let atual = '';
        paragrafo.split(/\s+/).forEach(palavra => {
            const tentativa = atual ? atual + ' ' + palavra : palavra;
            if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !atual) {
                atual = tentativa;
            } else {
                linhas.push(atual);
                atual = palavra;
            }
        });
        if (atual) linhas.push(atual);
    });
    return linhas;
}

// Onde colocar algo na pagina, a partir de um nome ("centro", "rodape-direita"...).
// Devolve o canto inferior esquerdo da caixa.
function posicaoNaPagina(nome, largura, altura, larguraItem, alturaItem, margem) {
    const m = margem == null ? 28 : margem;
    const mapa = {
        'topo-esquerda':    [m, altura - m - alturaItem],
        'topo-centro':      [(largura - larguraItem) / 2, altura - m - alturaItem],
        'topo-direita':     [largura - m - larguraItem, altura - m - alturaItem],
        'centro-esquerda':  [m, (altura - alturaItem) / 2],
        'centro':           [(largura - larguraItem) / 2, (altura - alturaItem) / 2],
        'centro-direita':   [largura - m - larguraItem, (altura - alturaItem) / 2],
        'rodape-esquerda':  [m, m],
        'rodape-centro':    [(largura - larguraItem) / 2, m],
        'rodape-direita':   [largura - m - larguraItem, m]
    };
    return mapa[nome] || mapa['rodape-centro'];
}

// Embute uma imagem (PNG/JPG) num documento pdf-lib, olhando os bytes e nao a
// extensao: um ".png" que na verdade e' JPEG e' comum em arquivo baixado de sistema.
async function embutirImagem(doc, bytes) {
    const b = bytesDe(bytes);
    const ehPng = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    const ehJpg = b.length > 3 && b[0] === 0xFF && b[1] === 0xD8;
    if (ehPng) return await doc.embedPng(b);
    if (ehJpg) return await doc.embedJpg(b);
    throw new Error('Formato de imagem nao suportado pelo PDF: use PNG ou JPG. ' +
                    '(WEBP e HEIC: passe antes pela ferramenta "Converter imagens".)');
}

const util = {
    semExtensao, bytesDe, listaDe, faixaParaIndices, abrirPdf, abrirPdfJs,
    paginaParaCanvas, canvasParaBlob, blobParaBytes, escalaParaDpi,
    textoDoPdf, juntarItensDeTexto, textoParaBytes, escXml, corPdf,
    TAMANHOS_PAGINA, fonteHelvetica, limparParaWinAnsi, quebrarLinhas,
    posicaoNaPagina, embutirImagem
};

// ===========================================================================
// ORGANIZAR — juntar, dividir, reordenar, girar, extrair
// ===========================================================================

async function juntar(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivos = listaDe(e.arquivos);
    if (arquivos.length < 2) throw new Error('Escolha pelo menos DOIS PDFs para juntar.');

    const saida = await PDFLib.PDFDocument.create();
    let total = 0;
    for (let i = 0; i < arquivos.length; i++) {
        if (prog) prog(Math.round(i / arquivos.length * 95), 'Juntando ' + arquivos[i].nome);
        const doc = await abrirPdf(arquivos[i]);
        const paginas = await saida.copyPages(doc, doc.getPageIndices());
        paginas.forEach(p => saida.addPage(p));
        total += paginas.length;
    }
    saida.setProducer('SisProf — Ferramentas PDF');
    saida.setCreationDate(new Date());
    if (prog) prog(98, 'Gravando');
    return {
        arquivos: [{ nome: 'juntado.pdf', bytes: await saida.save(), tipo: 'application/pdf' }],
        mensagem: arquivos.length + ' arquivos viraram um PDF de ' + total + ' paginas.'
    };
}

async function dividir(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const base = semExtensao(arquivo.nome);

    // Cada modo devolve uma lista de grupos de indices; o resto do caminho e' igual.
    let grupos = [];
    const modo = e.modo || 'cada';
    if (modo === 'todas') {
        grupos = Array.from({ length: total }, (_, i) => [i]);
    } else if (modo === 'cada') {
        const n = Math.max(1, parseInt(e.cada, 10) || 1);
        for (let i = 0; i < total; i += n) {
            grupos.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
        }
    } else if (modo === 'faixas') {
        const partes = String(e.faixas || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
        if (!partes.length) throw new Error('Escreva as faixas, uma por linha. Exemplo: 1-3 na primeira linha, 4-8 na segunda.');
        grupos = partes.map(p => faixaParaIndices(p, total));
    } else if (modo === 'apos') {
        // Corta DEPOIS das paginas indicadas: "3, 7" num PDF de 10 da' 1-3, 4-7, 8-10.
        const cortes = faixaParaIndices(e.paginas, total).map(i => i + 1).sort((a, b) => a - b);
        let inicio = 1;
        cortes.concat([total]).forEach(fim => {
            if (fim < inicio) return;
            grupos.push(Array.from({ length: fim - inicio + 1 }, (_, k) => inicio + k - 1));
            inicio = fim + 1;
        });
        grupos = grupos.filter(g => g.length);
    }

    if (grupos.length < 2) throw new Error('Do jeito pedido sairia um arquivo so. Confira o modo e os numeros.');

    const saidas = [];
    for (let g = 0; g < grupos.length; g++) {
        if (prog) prog(Math.round(g / grupos.length * 95), 'Parte ' + (g + 1) + ' de ' + grupos.length);
        const novo = await PDFLib.PDFDocument.create();
        const paginas = await novo.copyPages(doc, grupos[g]);
        paginas.forEach(p => novo.addPage(p));
        novo.setProducer('SisProf — Ferramentas PDF');
        const rotulo = grupos[g].length === 1
            ? String(grupos[g][0] + 1)
            : (grupos[g][0] + 1) + '-' + (grupos[g][grupos[g].length - 1] + 1);
        saidas.push({ nome: base + '_pag' + rotulo + '.pdf', bytes: await novo.save(), tipo: 'application/pdf' });
    }
    return { arquivos: saidas, mensagem: 'O PDF de ' + total + ' paginas virou ' + saidas.length + ' arquivos.' };
}

async function reorganizar(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();

    // A ordem e' uma lista COMPLETA e nao uma faixa: aqui repetir pagina e' legitimo
    // (montar um caderno com a capa no meio, por exemplo), e faixaParaIndices descarta repetidas.
    const pedidos = String(e.ordem || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (!pedidos.length) throw new Error('Escreva a nova ordem das paginas. Exemplo: 3, 1, 2');
    const indices = pedidos.map(p => {
        let n = parseInt(p, 10);
        if (isNaN(n)) throw new Error('"' + p + '" nao e um numero de pagina.');
        if (n < 0) n = total + 1 + n;
        if (n < 1 || n > total) throw new Error('A pagina ' + p + ' nao existe: o arquivo tem ' + total + '.');
        return n - 1;
    });

    const novo = await PDFLib.PDFDocument.create();
    const paginas = await novo.copyPages(doc, indices);
    paginas.forEach(p => novo.addPage(p));
    novo.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(95, 'Gravando');
    const faltando = total - new Set(indices).size;
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_reorganizado.pdf', bytes: await novo.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF com ' + indices.length + ' paginas na ordem pedida.' +
                  (faltando > 0 ? ' Atencao: ' + faltando + ' pagina(s) do original ficaram de fora.' : '')
    };
}

async function removerPaginas(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const remover = faixaParaIndices(e.paginas, total);
    if (remover.length >= total) throw new Error('Isso apagaria TODAS as ' + total + ' paginas — o PDF ficaria vazio.');

    // De tras para frente: remover a pagina 2 primeiro mudaria o indice da 5.
    remover.slice().sort((a, b) => b - a).forEach(i => doc.removePage(i));
    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(95, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_sem-paginas.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: remover.length + ' pagina(s) removida(s). Sobraram ' + (total - remover.length) + '.'
    };
}

async function extrairPaginas(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const indices = faixaParaIndices(e.paginas, total);
    const base = semExtensao(arquivo.nome);

    if (e.separados) {
        const saidas = [];
        for (let k = 0; k < indices.length; k++) {
            if (prog) prog(Math.round(k / indices.length * 95), 'Pagina ' + (indices[k] + 1));
            const novo = await PDFLib.PDFDocument.create();
            const [p] = await novo.copyPages(doc, [indices[k]]);
            novo.addPage(p);
            novo.setProducer('SisProf — Ferramentas PDF');
            saidas.push({ nome: base + '_pag' + (indices[k] + 1) + '.pdf', bytes: await novo.save(), tipo: 'application/pdf' });
        }
        return { arquivos: saidas, mensagem: indices.length + ' paginas extraidas, uma por arquivo.' };
    }

    const novo = await PDFLib.PDFDocument.create();
    const paginas = await novo.copyPages(doc, indices);
    paginas.forEach(p => novo.addPage(p));
    novo.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(95, 'Gravando');
    return {
        arquivos: [{ nome: base + '_extraido.pdf', bytes: await novo.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF novo com ' + indices.length + ' pagina(s) do original.'
    };
}

async function rotacionar(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const indices = faixaParaIndices(e.paginas, total);
    const giro = parseInt(e.graus, 10) || 90;

    indices.forEach(i => {
        const pagina = doc.getPage(i);
        // Soma ao giro que a pagina JA tinha: um PDF digitalizado de lado costuma
        // chegar com /Rotate 90, e sobrescrever desfaria a correcao de quem digitalizou.
        const atual = pagina.getRotation().angle || 0;
        pagina.setRotation(PDFLib.degrees(((atual + giro) % 360 + 360) % 360));
    });
    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(95, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_girado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: indices.length + ' pagina(s) giradas ' + giro + '°.'
    };
}

async function paginasPorFolha(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const porFolha = Math.max(2, parseInt(e.porFolha, 10) || 2);

    // Grade: 2->1x2, 4->2x2, 6->2x3, 8->2x4, 9->3x3, 16->4x4.
    const grades = { 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 16: [4, 4] };
    const [colunas, linhas] = grades[porFolha] || [Math.ceil(Math.sqrt(porFolha)), Math.ceil(porFolha / Math.ceil(Math.sqrt(porFolha)))];

    const base = TAMANHOS_PAGINA[e.tamanho] || TAMANHOS_PAGINA.A4;
    // 2 e 8 por folha ficam melhor com a folha "de lado" (as paginas sao mais altas que largas).
    const deitado = e.orientacao === 'paisagem' || (e.orientacao === 'auto' && (porFolha === 2 || porFolha === 8));
    const larguraFolha = deitado ? base[1] : base[0];
    const alturaFolha = deitado ? base[0] : base[1];
    const margem = e.margem == null ? 14 : Math.max(0, Number(e.margem));
    const vao = e.vao == null ? 8 : Math.max(0, Number(e.vao));

    const larguraCelula = (larguraFolha - 2 * margem - (colunas - 1) * vao) / colunas;
    const alturaCelula = (alturaFolha - 2 * margem - (linhas - 1) * vao) / linhas;
    if (larguraCelula <= 4 || alturaCelula <= 4) throw new Error('Com essa margem nao sobra espaco para as paginas. Diminua a margem.');

    const saida = await PDFLib.PDFDocument.create();
    const embutidas = await saida.embedPages(doc.getPages());
    const cor = await corPdf(e.corBorda || '#cbd5e0');

    for (let inicio = 0; inicio < total; inicio += porFolha) {
        if (prog) prog(Math.round(inicio / total * 95), 'Montando folha ' + (Math.floor(inicio / porFolha) + 1));
        const folha = saida.addPage([larguraFolha, alturaFolha]);
        for (let k = 0; k < porFolha && inicio + k < total; k++) {
            const emb = embutidas[inicio + k];
            const col = k % colunas;
            const lin = Math.floor(k / colunas);
            const escala = Math.min(larguraCelula / emb.width, alturaCelula / emb.height);
            const l = emb.width * escala;
            const a = emb.height * escala;
            const x = margem + col * (larguraCelula + vao) + (larguraCelula - l) / 2;
            // A grade e' lida de cima para baixo; no PDF o Y cresce para cima.
            const y = alturaFolha - margem - (lin + 1) * alturaCelula - lin * vao + (alturaCelula - a) / 2;
            folha.drawPage(emb, { x: x, y: y, width: l, height: a });
            if (e.borda) {
                folha.drawRectangle({
                    x: margem + col * (larguraCelula + vao), y: alturaFolha - margem - (lin + 1) * alturaCelula - lin * vao,
                    width: larguraCelula, height: alturaCelula,
                    borderColor: cor, borderWidth: 0.6
                });
            }
        }
    }
    saida.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_' + porFolha + 'por-folha.pdf', bytes: await saida.save(), tipo: 'application/pdf' }],
        mensagem: total + ' paginas couberam em ' + Math.ceil(total / porFolha) + ' folhas (' + colunas + '×' + linhas + ').'
    };
}

async function cortarAoMeio(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const paginas = doc.getPages();
    const vertical = (e.direcao || 'vertical') === 'vertical';   // vertical = corta em esquerda/direita
    const daDireita = !!e.daDireita;                             // livro em arabe/hebraico, ou digitalizacao invertida

    const saida = await PDFLib.PDFDocument.create();
    for (let i = 0; i < paginas.length; i++) {
        if (prog) prog(Math.round(i / paginas.length * 95), 'Cortando pagina ' + (i + 1));
        const p = paginas[i];
        const { width: l, height: a } = p.getSize();
        // Duas metades, cada uma embutida com o recorte (clip) da area que interessa.
        const metades = vertical
            ? [{ left: 0, bottom: 0, right: l / 2, top: a }, { left: l / 2, bottom: 0, right: l, top: a }]
            : [{ left: 0, bottom: a / 2, right: l, top: a }, { left: 0, bottom: 0, right: l, top: a / 2 }];
        const ordenadas = (vertical && daDireita) ? [metades[1], metades[0]] : metades;
        for (const caixa of ordenadas) {
            const emb = await saida.embedPage(p, caixa);
            const nova = saida.addPage([emb.width, emb.height]);
            nova.drawPage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
            nova.setRotation(p.getRotation());
        }
    }
    saida.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_cortado-ao-meio.pdf', bytes: await saida.save(), tipo: 'application/pdf' }],
        mensagem: paginas.length + ' paginas viraram ' + (paginas.length * 2) + ' (corte ' + (vertical ? 'vertical' : 'horizontal') + ').'
    };
}

// Marcadores (o "sumario" que o leitor de PDF mostra na lateral). O pdf-lib nao tem
// API para isso, entao montamos o /Outlines na mao — e' um no' raiz e uma lista
// encadeada de itens, cada um apontando para a pagina (ISO 32000-1, 12.3.3).
async function marcadores(e, prog) {
    const PDFLib = await libPdfLib();
    const { PDFName, PDFNumber, PDFString, PDFArray, PDFDict } = PDFLib;
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();

    const linhas = String(e.marcadores || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!linhas.length) throw new Error('Escreva um marcador por linha, assim: Introducao | 1');

    const itens = linhas.map(linha => {
        const partes = linha.split('|');
        const titulo = (partes[0] || '').trim();
        const pagina = parseInt((partes[1] || '1').trim(), 10) || 1;
        if (!titulo) throw new Error('Marcador sem titulo na linha "' + linha + '".');
        if (pagina < 1 || pagina > total) throw new Error('O marcador "' + titulo + '" aponta para a pagina ' + pagina + ', que nao existe (o PDF tem ' + total + ').');
        return { titulo: titulo, indice: pagina - 1 };
    });

    const contexto = doc.context;
    const refRaiz = contexto.nextRef();
    const refs = itens.map(() => contexto.nextRef());

    itens.forEach((item, i) => {
        const destino = PDFArray.withContext(contexto);
        destino.push(doc.getPage(item.indice).ref);
        destino.push(PDFName.of('Fit'));   // Fit = abre a pagina inteira, sem mexer no zoom do leitor
        const dic = new Map();
        dic.set(PDFName.of('Title'), PDFString.of(item.titulo));
        dic.set(PDFName.of('Parent'), refRaiz);
        dic.set(PDFName.of('Dest'), destino);
        if (i > 0) dic.set(PDFName.of('Prev'), refs[i - 1]);
        if (i < itens.length - 1) dic.set(PDFName.of('Next'), refs[i + 1]);
        contexto.assign(refs[i], PDFDict.fromMapWithContext(dic, contexto));
    });

    const raiz = new Map();
    raiz.set(PDFName.of('Type'), PDFName.of('Outlines'));
    raiz.set(PDFName.of('First'), refs[0]);
    raiz.set(PDFName.of('Last'), refs[refs.length - 1]);
    raiz.set(PDFName.of('Count'), PDFNumber.of(itens.length));
    contexto.assign(refRaiz, PDFDict.fromMapWithContext(raiz, contexto));

    doc.catalog.set(PDFName.of('Outlines'), refRaiz);
    if (e.abrirSumario !== false) doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(95, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_com-marcadores.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: itens.length + ' marcador(es) criados. Abra no leitor de PDF e veja o sumario na lateral.'
    };
}

async function extrairImagens(e, prog) {
    const PDFLib = await libPdfLib();
    const { PDFName, PDFRawStream, PDFArray, decodePDFRawStream } = PDFLib;
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const base = semExtensao(arquivo.nome);
    const minimo = Math.max(0, parseInt(e.minimoPx, 10) || 0);

    const saidas = [];
    const objetos = doc.context.enumerateIndirectObjects();
    let ignoradas = 0;
    let n = 0;

    for (let k = 0; k < objetos.length; k++) {
        if (prog && k % 20 === 0) prog(Math.round(k / objetos.length * 95), 'Procurando imagens');
        const obj = objetos[k][1];
        if (!(obj instanceof PDFRawStream)) continue;
        const dic = obj.dict;
        const subtipo = dic.lookup(PDFName.of('Subtype'));
        if (!subtipo || subtipo.asString() !== '/Image') continue;

        const largura = (dic.lookup(PDFName.of('Width')) || {}).asNumber ? dic.lookup(PDFName.of('Width')).asNumber() : 0;
        const altura = (dic.lookup(PDFName.of('Height')) || {}).asNumber ? dic.lookup(PDFName.of('Height')).asNumber() : 0;
        if (minimo && (largura < minimo || altura < minimo)) { ignoradas++; continue; }

        const filtroBruto = dic.lookup(PDFName.of('Filter'));
        const filtros = [];
        if (filtroBruto instanceof PDFArray) {
            for (let i = 0; i < filtroBruto.size(); i++) filtros.push(filtroBruto.lookup(i).asString());
        } else if (filtroBruto) {
            filtros.push(filtroBruto.asString());
        }

        n++;
        // JPEG e JPEG2000 ficam guardados no PDF exatamente como o arquivo original:
        // copiar os bytes devolve a imagem SEM perda nenhuma — melhor do que redesenhar.
        if (filtros.indexOf('/DCTDecode') !== -1) {
            saidas.push({ nome: base + '_img' + n + '.jpg', bytes: obj.contents.slice(), tipo: 'image/jpeg' });
            continue;
        }
        if (filtros.indexOf('/JPXDecode') !== -1) {
            saidas.push({ nome: base + '_img' + n + '.jp2', bytes: obj.contents.slice(), tipo: 'image/jp2' });
            continue;
        }

        // Os demais (normalmente Flate) guardam os pixels crus: descompacta e monta um PNG.
        if (!ehNavegador) { ignoradas++; continue; }
        try {
            const crus = decodePDFRawStream(obj).decode();
            const espaco = String((dic.lookup(PDFName.of('ColorSpace')) || { asString: () => '' }).asString ?
                                   dic.lookup(PDFName.of('ColorSpace')).asString() : '');
            const bits = (dic.lookup(PDFName.of('BitsPerComponent')) || {}).asNumber
                ? dic.lookup(PDFName.of('BitsPerComponent')).asNumber() : 8;
            const blob = await pixelsCrusParaPng(crus, largura, altura, espaco, bits);
            if (blob) saidas.push({ nome: base + '_img' + n + '.png', blob: blob, tipo: 'image/png' });
            else ignoradas++;
        } catch (_) {
            ignoradas++;
        }
    }

    if (!saidas.length) {
        throw new Error('Nao encontrei imagem embutida neste PDF' +
            (ignoradas ? ' que eu saiba converter (' + ignoradas + ' em formato incomum).' : '.') +
            ' Se o PDF for uma digitalizacao inteira, use "PDF para imagens".');
    }
    return {
        arquivos: saidas,
        mensagem: saidas.length + ' imagem(ns) extraida(s)' +
                  (ignoradas ? '. ' + ignoradas + ' ficaram de fora (formato ou tamanho).' : '.')
    };
}

// Pixels crus de um XObject de imagem -> PNG, passando pelo <canvas>. Devolve null
// quando o espaco de cor nao e' um dos que tratamos (Indexed, CMYK, mascaras).
async function pixelsCrusParaPng(crus, largura, altura, espaco, bits) {
    if (!largura || !altura) return null;
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(largura, altura);
    const px = img.data;
    const total = largura * altura;

    if (bits === 8 && /DeviceRGB|CalRGB/.test(espaco) && crus.length >= total * 3) {
        for (let i = 0; i < total; i++) {
            px[i * 4] = crus[i * 3]; px[i * 4 + 1] = crus[i * 3 + 1]; px[i * 4 + 2] = crus[i * 3 + 2]; px[i * 4 + 3] = 255;
        }
    } else if (bits === 8 && /DeviceGray|CalGray/.test(espaco) && crus.length >= total) {
        for (let i = 0; i < total; i++) {
            const v = crus[i];
            px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
        }
    } else if (bits === 1) {
        // 1 bit por pixel: PDF digitalizado em preto e branco. Cada linha e' alinhada em byte.
        const bytesPorLinha = Math.ceil(largura / 8);
        if (crus.length < bytesPorLinha * altura) return null;
        for (let y = 0; y < altura; y++) {
            for (let x = 0; x < largura; x++) {
                const bit = (crus[y * bytesPorLinha + (x >> 3)] >> (7 - (x & 7))) & 1;
                const v = bit ? 255 : 0;
                const i = y * largura + x;
                px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
            }
        }
    } else {
        return null;
    }

    ctx.putImageData(img, 0, 0);
    return await canvasParaBlob(canvas, 'image/png');
}

// ===========================================================================
// EDITAR — marca d'agua, numeros, sobreposicao, recorte, tamanho, informacoes
// ===========================================================================

async function marcaDagua(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const indices = faixaParaIndices(e.paginas, total);
    const opacidade = Math.max(0.02, Math.min(1, Number(e.opacidade == null ? 0.25 : e.opacidade)));
    const rotacao = Number(e.rotacao == null ? 45 : e.rotacao);

    const ehImagem = (e.tipo === 'imagem');
    let fonte = null, imagem = null, textoLimpo = '';
    if (ehImagem) {
        const img = listaDe(e.imagem)[0];
        if (!img) throw new Error('Escolha a imagem da marca d\'agua (PNG ou JPG).');
        imagem = await embutirImagem(doc, img);
    } else {
        textoLimpo = limparParaWinAnsi(e.texto || 'CONFIDENCIAL');
        if (!textoLimpo.trim()) throw new Error('Escreva o texto da marca d\'agua.');
        fonte = await fonteHelvetica(doc, true);
    }
    const tamanho = Math.max(4, Number(e.tamanho) || (ehImagem ? 35 : 48));
    const cor = await corPdf(e.cor || '#e53e3e');

    // Desenhar UMA vez por pagina (ou em mosaico, cobrindo a folha).
    const desenhar = (pagina, x, y, larguraItem, alturaItem) => {
        if (ehImagem) {
            pagina.drawImage(imagem, {
                x: x, y: y, width: larguraItem, height: alturaItem,
                opacity: opacidade, rotate: PDFLib.degrees(rotacao)
            });
        } else {
            pagina.drawText(textoLimpo, {
                x: x, y: y, size: tamanho, font: fonte, color: cor,
                opacity: opacidade, rotate: PDFLib.degrees(rotacao)
            });
        }
    };

    for (let k = 0; k < indices.length; k++) {
        if (prog && k % 5 === 0) prog(Math.round(k / indices.length * 95), 'Pagina ' + (indices[k] + 1));
        const pagina = doc.getPage(indices[k]);
        const { width: L, height: A } = pagina.getSize();
        const larguraItem = ehImagem ? (imagem.width * (tamanho / 100)) : fonte.widthOfTextAtSize(textoLimpo, tamanho);
        const alturaItem = ehImagem ? (imagem.height * (tamanho / 100)) : tamanho;

        if (e.repetir) {
            // Mosaico: o passo considera a diagonal do item para o texto girado nao se sobrepor.
            const passoX = Math.max(60, larguraItem * 1.5);
            const passoY = Math.max(60, alturaItem * 4);
            for (let y = -alturaItem; y < A + passoY; y += passoY) {
                for (let x = -larguraItem; x < L + passoX; x += passoX) desenhar(pagina, x, y, larguraItem, alturaItem);
            }
        } else {
            const [x, y] = posicaoNaPagina(e.posicao || 'centro', L, A, larguraItem, alturaItem, Number(e.margem) || 28);
            desenhar(pagina, x, y, larguraItem, alturaItem);
        }
    }

    doc.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_marca-dagua.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'Marca d\'agua aplicada em ' + indices.length + ' pagina(s).'
    };
}

async function numerosPagina(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const indices = faixaParaIndices(e.paginas, total);
    const fonte = await fonteHelvetica(doc, !!e.negrito);
    const tamanho = Math.max(5, Number(e.tamanho) || 10);
    const cor = await corPdf(e.cor || '#4a5568');
    const primeiro = parseInt(e.inicio, 10);
    const comecaEm = isNaN(primeiro) ? 1 : primeiro;
    const margem = e.margem == null ? 24 : Number(e.margem);

    // {n} = numero desta pagina, {total} = quantas serao numeradas.
    const modelo = String(e.formato || '{n}').trim() || '{n}';

    indices.forEach((indice, k) => {
        if (prog && k % 10 === 0) prog(Math.round(k / indices.length * 95), 'Numerando');
        const pagina = doc.getPage(indice);
        const { width: L, height: A } = pagina.getSize();
        const texto = limparParaWinAnsi(
            modelo.replace(/\{n\}/g, String(comecaEm + k)).replace(/\{total\}/g, String(indices.length))
        );
        const largura = fonte.widthOfTextAtSize(texto, tamanho);
        const [x, y] = posicaoNaPagina(e.posicao || 'rodape-centro', L, A, largura, tamanho, margem);
        pagina.drawText(texto, { x: x, y: y, size: tamanho, font: fonte, color: cor });
    });

    doc.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_numerado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: indices.length + ' pagina(s) numeradas, comecando em ' + comecaEm + '.'
    };
}

async function sobrepor(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const acima = listaDe(e.sobreposicao)[0];
    if (!acima) throw new Error('Escolha o segundo PDF, o que vai por cima (o papel timbrado, por exemplo).');

    const doc = await abrirPdf(arquivo);
    const docAcima = await abrirPdf(acima);
    const paginasAcima = docAcima.getPages();
    const embutidas = await doc.embedPages(paginasAcima);
    const total = doc.getPageCount();
    const opacidade = Math.max(0.02, Math.min(1, Number(e.opacidade == null ? 1 : e.opacidade)));
    const escala = Math.max(0.05, Number(e.escala == null ? 1 : e.escala));
    const repetir = e.modo !== 'uma-vez';   // padrao: a sobreposicao se repete (timbre em todas)

    for (let i = 0; i < total; i++) {
        if (prog && i % 5 === 0) prog(Math.round(i / total * 95), 'Pagina ' + (i + 1));
        const indiceAcima = repetir ? (i % embutidas.length) : i;
        if (indiceAcima >= embutidas.length) break;
        const emb = embutidas[indiceAcima];
        const pagina = doc.getPage(i);
        const { width: L, height: A } = pagina.getSize();

        let l = emb.width * escala, a = emb.height * escala;
        if (e.ajustar) {                     // encaixa na pagina, sem distorcer
            const f = Math.min(L / emb.width, A / emb.height);
            l = emb.width * f; a = emb.height * f;
        }
        const [x, y] = posicaoNaPagina(e.posicao || 'centro', L, A, l, a, Number(e.margem) || 0);
        pagina.drawPage(emb, { x: x, y: y, width: l, height: a, opacity: opacidade });
    }

    doc.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_sobreposto.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'Sobreposicao aplicada em ' + total + ' pagina(s).'
    };
}

async function cortar(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();
    const indices = faixaParaIndices(e.paginas, total);
    const mm = v => (Number(v) || 0) * 72 / 25.4;     // milimetro -> ponto
    const cEsq = mm(e.esquerda), cDir = mm(e.direita), cTopo = mm(e.topo), cBase = mm(e.base);
    if (!cEsq && !cDir && !cTopo && !cBase) throw new Error('Informe pelo menos uma margem para cortar (em milimetros).');

    indices.forEach(i => {
        const pagina = doc.getPage(i);
        // Parte da CropBox atual (e nao da MediaBox): cortar duas vezes tem de cortar
        // o que sobrou, nao voltar a folha inteira.
        const atual = pagina.getCropBox();
        const x = atual.x + cEsq;
        const y = atual.y + cBase;
        const l = atual.width - cEsq - cDir;
        const a = atual.height - cTopo - cBase;
        if (l <= 1 || a <= 1) throw new Error('O corte pedido nao deixa nada da pagina ' + (i + 1) + '. Use margens menores.');
        pagina.setCropBox(x, y, l, a);
    });

    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(95, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_cortado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: indices.length + ' pagina(s) cortadas. O corte esconde a margem; para apaga-la de vez, ' +
                  'passe o resultado por "Rasterizar PDF".'
    };
}

async function tamanhoPagina(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const paginas = doc.getPages();
    const base = TAMANHOS_PAGINA[e.tamanho] || TAMANHOS_PAGINA.A4;

    const saida = await PDFLib.PDFDocument.create();
    const embutidas = await saida.embedPages(paginas);
    for (let i = 0; i < embutidas.length; i++) {
        if (prog && i % 5 === 0) prog(Math.round(i / embutidas.length * 95), 'Pagina ' + (i + 1));
        const emb = embutidas[i];
        // "auto": cada pagina mantem se e' retrato ou paisagem; senao vale o escolhido.
        const deitado = e.orientacao === 'paisagem' ||
                        (e.orientacao === 'auto' && emb.width > emb.height);
        const L = deitado ? base[1] : base[0];
        const A = deitado ? base[0] : base[1];
        const margem = Number(e.margem) || 0;
        const nova = saida.addPage([L, A]);
        const f = Math.min((L - 2 * margem) / emb.width, (A - 2 * margem) / emb.height);
        const l = emb.width * f, a = emb.height * f;
        nova.drawPage(emb, { x: (L - l) / 2, y: (A - a) / 2, width: l, height: a });
    }
    saida.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_' + (e.tamanho || 'A4') + '.pdf', bytes: await saida.save(), tipo: 'application/pdf' }],
        mensagem: paginas.length + ' pagina(s) reajustadas para ' + (e.tamanho || 'A4') + '.'
    };
}

async function infoDocumento(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo, { updateMetadata: false });

    // Campo em branco = "nao mexer". Para APAGAR um campo existe "Remover metadados".
    if (String(e.titulo || '').trim()) doc.setTitle(String(e.titulo).trim());
    if (String(e.autor || '').trim()) doc.setAuthor(String(e.autor).trim());
    if (String(e.assunto || '').trim()) doc.setSubject(String(e.assunto).trim());
    if (String(e.criador || '').trim()) doc.setCreator(String(e.criador).trim());
    if (String(e.palavrasChave || '').trim()) {
        doc.setKeywords(String(e.palavrasChave).split(/[,;]+/).map(s => s.trim()).filter(Boolean));
    }
    if (String(e.idioma || '').trim()) doc.setLanguage(String(e.idioma).trim());
    doc.setModificationDate(new Date());
    if (prog) prog(95, 'Gravando');

    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_info.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'Informacoes do documento atualizadas.'
    };
}

// Le as informacoes atuais — a tela mostra isso antes de o professor editar.
async function lerInfoDocumento(arquivo) {
    const doc = await abrirPdf(arquivo, { updateMetadata: false });
    const dataTexto = d => { try { return d ? d.toLocaleString('pt-BR') : ''; } catch (_) { return ''; } };
    return {
        titulo: doc.getTitle() || '', autor: doc.getAuthor() || '', assunto: doc.getSubject() || '',
        criador: doc.getCreator() || '', produtor: doc.getProducer() || '',
        palavrasChave: doc.getKeywords() || '',
        criadoEm: dataTexto(doc.getCreationDate()), alteradoEm: dataTexto(doc.getModificationDate()),
        paginas: doc.getPageCount()
    };
}

// Aplica as anotacoes montadas na tela (texto, retangulo, destaque, linha).
// Cada item vem em coordenadas da PAGINA do pdf-lib (origem embaixo a esquerda).
async function anotar(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const itens = Array.isArray(e.itens) ? e.itens : JSON.parse(e.itens || '[]');
    if (!itens.length) throw new Error('Nenhuma anotacao foi marcada. Clique na pagina para acrescentar.');

    const fonteNormal = await fonteHelvetica(doc, false);
    const fonteNegrito = await fonteHelvetica(doc, true);

    for (let k = 0; k < itens.length; k++) {
        if (prog) prog(Math.round(k / itens.length * 95), 'Aplicando anotacao ' + (k + 1));
        const it = itens[k];
        const pagina = doc.getPage(Math.max(0, Math.min(doc.getPageCount() - 1, it.pagina || 0)));
        const cor = await corPdf(it.cor || '#e53e3e');

        if (it.tipo === 'texto') {
            const fonte = it.negrito ? fonteNegrito : fonteNormal;
            const tamanho = Number(it.tamanho) || 12;
            const texto = limparParaWinAnsi(it.texto || '');
            const largura = it.largura || (pagina.getSize().width - it.x - 20);
            quebrarLinhas(texto, fonte, tamanho, largura).forEach((linha, i) => {
                pagina.drawText(linha, {
                    x: it.x, y: it.y - i * tamanho * 1.25, size: tamanho, font: fonte, color: cor
                });
            });
        } else if (it.tipo === 'destaque') {
            pagina.drawRectangle({
                x: it.x, y: it.y, width: it.largura, height: it.altura,
                color: cor, opacity: it.opacidade == null ? 0.35 : Number(it.opacidade)
            });
        } else if (it.tipo === 'retangulo') {
            pagina.drawRectangle({
                x: it.x, y: it.y, width: it.largura, height: it.altura,
                borderColor: cor, borderWidth: Number(it.espessura) || 1.5,
                color: it.preencher ? cor : undefined,
                opacity: it.preencher ? (it.opacidade == null ? 0.2 : Number(it.opacidade)) : undefined
            });
        } else if (it.tipo === 'linha') {
            pagina.drawLine({
                start: { x: it.x, y: it.y }, end: { x: it.x2, y: it.y2 },
                thickness: Number(it.espessura) || 1.5, color: cor
            });
        } else if (it.tipo === 'imagem' && it.bytes) {
            const img = await embutirImagem(doc, it.bytes);
            pagina.drawImage(img, { x: it.x, y: it.y, width: it.largura, height: it.altura });
        } else if (it.tipo === 'tarja') {
            pagina.drawRectangle({ x: it.x, y: it.y, width: it.largura, height: it.altura, color: PDFLib.rgb(0, 0, 0) });
        }
    }

    doc.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_anotado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: itens.length + ' anotacao(oes) gravadas no PDF.'
    };
}

// ===========================================================================
// UM PDF NOVO A PARTIR DE "BLOCOS"
// ===========================================================================
// Word, planilha, HTML, texto e "Criar PDF" desaguam todos aqui. Em vez de
// fotografar a tela (html2canvas), cada origem e' traduzida para uma lista de
// blocos simples e o PDF e' DESENHADO com texto de verdade: o resultado pesa uma
// fracao do que pesaria em imagem, pode ser pesquisado, copiado e lido por leitor
// de tela — o que importa muito num documento escolar.
//
// Bloco: { tipo: 'h1'|'h2'|'h3'|'p'|'li'|'citacao'|'tabela'|'imagem'|'espaco'|'quebra', ... }

const ESTILO_BLOCO = {
    h1: { tamanho: 20, negrito: true, antes: 14, depois: 8 },
    h2: { tamanho: 16, negrito: true, antes: 12, depois: 6 },
    h3: { tamanho: 13, negrito: true, antes: 10, depois: 4 },
    p:  { tamanho: 11, negrito: false, antes: 0, depois: 7 },
    li: { tamanho: 11, negrito: false, antes: 0, depois: 3 },
    citacao: { tamanho: 11, negrito: false, antes: 4, depois: 7 }
};

async function montarPdfDeBlocos(blocos, opcoes) {
    const PDFLib = await libPdfLib();
    const o = opcoes || {};
    const base = TAMANHOS_PAGINA[o.tamanho] || TAMANHOS_PAGINA.A4;
    const deitado = o.orientacao === 'paisagem';
    const L = deitado ? base[1] : base[0];
    const A = deitado ? base[0] : base[1];
    const margem = o.margem == null ? 56 : Number(o.margem);   // ~2 cm

    const doc = await PDFLib.PDFDocument.create();
    const normal = await fonteHelvetica(doc, false);
    const negrito = await fonteHelvetica(doc, true);
    const preto = PDFLib.rgb(0.1, 0.12, 0.15);
    const cinza = PDFLib.rgb(0.45, 0.5, 0.55);
    const linhaCor = PDFLib.rgb(0.85, 0.88, 0.91);

    let pagina = doc.addPage([L, A]);
    let y = A - margem;
    const larguraUtil = L - 2 * margem;

    const novaPagina = () => { pagina = doc.addPage([L, A]); y = A - margem; };
    const garantir = (altura) => { if (y - altura < margem) novaPagina(); };

    for (const bloco of blocos) {
        if (bloco.tipo === 'quebra') { novaPagina(); continue; }
        if (bloco.tipo === 'espaco') { y -= Number(bloco.altura) || 10; continue; }

        if (bloco.tipo === 'imagem' && bloco.bytes) {
            try {
                const img = await embutirImagem(doc, bloco.bytes);
                const f = Math.min(larguraUtil / img.width, (A - 2 * margem) / img.height, 1);
                const l = img.width * f, a = img.height * f;
                garantir(a + 8);
                pagina.drawImage(img, { x: margem + (larguraUtil - l) / 2, y: y - a, width: l, height: a });
                y -= a + 10;
            } catch (_) { /* imagem em formato que o PDF nao aceita: segue sem ela */ }
            continue;
        }

        if (bloco.tipo === 'tabela') {
            y = desenharTabela(bloco, { doc, pagina: () => pagina, novaPagina, obterY: () => y,
                                        margem, larguraUtil, A, normal, negrito, preto, linhaCor });
            continue;
        }

        const estilo = ESTILO_BLOCO[bloco.tipo] || ESTILO_BLOCO.p;
        const fonte = (bloco.negrito || estilo.negrito) ? negrito : normal;
        const tamanho = Number(bloco.tamanho) || estilo.tamanho;
        const recuo = bloco.tipo === 'li' ? 18 : (bloco.tipo === 'citacao' ? 16 : 0);
        const marcador = bloco.tipo === 'li' ? (bloco.marcador || '•') + ' ' : '';
        const texto = limparParaWinAnsi(bloco.texto || '');

        y -= estilo.antes;
        const linhas = quebrarLinhas(texto, fonte, tamanho, larguraUtil - recuo);
        linhas.forEach((linha, i) => {
            garantir(tamanho * 1.35);
            const prefixo = (i === 0) ? marcador : '';
            if (bloco.tipo === 'citacao') {
                pagina.drawRectangle({ x: margem, y: y - tamanho * 1.1, width: 2.5, height: tamanho * 1.3, color: cinza });
            }
            pagina.drawText(prefixo + linha, {
                x: margem + recuo - (prefixo ? 12 : 0), y: y - tamanho,
                size: tamanho, font: fonte, color: bloco.tipo === 'citacao' ? cinza : preto
            });
            y -= tamanho * 1.35;
        });
        y -= estilo.depois;

        if (bloco.tipo === 'h1' || bloco.tipo === 'h2') {
            garantir(6);
            pagina.drawLine({ start: { x: margem, y: y + 4 }, end: { x: L - margem, y: y + 4 }, thickness: 0.7, color: linhaCor });
            y -= 6;
        }
    }

    if (o.titulo) doc.setTitle(String(o.titulo));
    if (o.autor) doc.setAuthor(String(o.autor));
    doc.setProducer('SisProf — Ferramentas PDF');
    doc.setCreationDate(new Date());
    return doc;
}

// Tabela simples: primeira linha e' cabecalho, colunas de largura igual, com
// quebra de linha dentro da celula e continuacao na pagina seguinte.
function desenharTabela(bloco, ctx) {
    const linhas = (bloco.linhas || []).filter(l => Array.isArray(l));
    if (!linhas.length) return ctx.obterY();
    const colunas = Math.max.apply(null, linhas.map(l => l.length));
    const tamanho = Number(bloco.tamanho) || 9;
    const larguraCol = ctx.larguraUtil / colunas;
    const preenchimento = 4;
    let y = ctx.obterY() - 6;

    const desenharLinha = (celulas, ehCabecalho) => {
        const partes = [];
        let alturaLinha = 0;
        for (let c = 0; c < colunas; c++) {
            const fonte = ehCabecalho ? ctx.negrito : ctx.normal;
            const pedacos = quebrarLinhas(limparParaWinAnsi(celulas[c] == null ? '' : String(celulas[c])),
                                          fonte, tamanho, larguraCol - 2 * preenchimento);
            partes.push(pedacos);
            alturaLinha = Math.max(alturaLinha, pedacos.length * tamanho * 1.25 + 2 * preenchimento);
        }
        if (y - alturaLinha < ctx.margem) { ctx.novaPagina(); y = ctx.A - ctx.margem - 6; }
        const pagina = ctx.pagina();
        if (ehCabecalho) {
            pagina.drawRectangle({ x: ctx.margem, y: y - alturaLinha, width: ctx.larguraUtil, height: alturaLinha,
                                   color: ctx.linhaCor, opacity: 0.55 });
        }
        for (let c = 0; c < colunas; c++) {
            pagina.drawRectangle({ x: ctx.margem + c * larguraCol, y: y - alturaLinha, width: larguraCol, height: alturaLinha,
                                   borderColor: ctx.linhaCor, borderWidth: 0.5 });
            partes[c].forEach((txt, i) => {
                pagina.drawText(txt, {
                    x: ctx.margem + c * larguraCol + preenchimento,
                    y: y - preenchimento - (i + 1) * tamanho * 1.15,
                    size: tamanho, font: ehCabecalho ? ctx.negrito : ctx.normal, color: ctx.preto
                });
            });
        }
        y -= alturaLinha;
    };

    linhas.forEach((celulas, i) => desenharLinha(celulas, i === 0 && bloco.cabecalho !== false));
    return y - 10;
}

// HTML -> blocos. Roda no navegador (usa o proprio interpretador de HTML do
// navegador, que e' mais confiavel do que qualquer expressao regular).
function htmlParaBlocos(html) {
    if (!ehNavegador) throw new Error('Converter HTML exige o navegador.');
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe, svg').forEach(n => n.remove());
    const blocos = [];

    const textoDe = n => (n.textContent || '').replace(/\s+/g, ' ').trim();

    const percorrer = (no) => {
        Array.prototype.forEach.call(no.childNodes, filho => {
            if (filho.nodeType === 3) {
                const t = (filho.nodeValue || '').replace(/\s+/g, ' ').trim();
                if (t) blocos.push({ tipo: 'p', texto: t });
                return;
            }
            if (filho.nodeType !== 1) return;
            const tag = filho.tagName.toLowerCase();

            if (/^h[1-6]$/.test(tag)) {
                const nivel = Math.min(3, parseInt(tag[1], 10));
                blocos.push({ tipo: 'h' + nivel, texto: textoDe(filho) });
            } else if (tag === 'p') {
                const t = textoDe(filho);
                if (t) blocos.push({ tipo: 'p', texto: t });
            } else if (tag === 'blockquote') {
                blocos.push({ tipo: 'citacao', texto: textoDe(filho) });
            } else if (tag === 'ul' || tag === 'ol') {
                let n = 1;
                Array.prototype.forEach.call(filho.children, li => {
                    if (li.tagName.toLowerCase() !== 'li') return;
                    blocos.push({ tipo: 'li', texto: textoDe(li), marcador: tag === 'ol' ? (n++) + '.' : '•' });
                });
            } else if (tag === 'table') {
                const linhas = [];
                Array.prototype.forEach.call(filho.querySelectorAll('tr'), tr => {
                    linhas.push(Array.prototype.map.call(tr.querySelectorAll('th,td'), td => textoDe(td)));
                });
                if (linhas.length) blocos.push({ tipo: 'tabela', linhas: linhas });
            } else if (tag === 'img') {
                const src = filho.getAttribute('src') || '';
                const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src);
                if (m) {
                    const cru = atob(m[2]);
                    const bytes = new Uint8Array(cru.length);
                    for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i);
                    blocos.push({ tipo: 'imagem', bytes: bytes });
                }
            } else if (tag === 'hr') {
                blocos.push({ tipo: 'espaco', altura: 12 });
            } else if (tag === 'br') {
                blocos.push({ tipo: 'espaco', altura: 6 });
            } else {
                percorrer(filho);
            }
        });
    };

    percorrer(doc.body);
    return blocos.length ? blocos : [{ tipo: 'p', texto: textoDe(doc.body) || '(documento vazio)' }];
}

// Texto puro com marcacao leve (#, ##, ###, - item, 1. item, > citacao, --- quebra)
// -> blocos. E' o "Markdown de bolso": cobre o que um professor escreve de fato.
function textoParaBlocos(texto) {
    const blocos = [];
    String(texto == null ? '' : texto).split(/\r?\n/).forEach(linha => {
        const l = linha.trim();
        if (!l) { blocos.push({ tipo: 'espaco', altura: 6 }); return; }
        if (l === '---' || l === '***') { blocos.push({ tipo: 'quebra' }); return; }
        let m;
        if ((m = /^###\s+(.*)$/.exec(l))) { blocos.push({ tipo: 'h3', texto: m[1] }); return; }
        if ((m = /^##\s+(.*)$/.exec(l))) { blocos.push({ tipo: 'h2', texto: m[1] }); return; }
        if ((m = /^#\s+(.*)$/.exec(l))) { blocos.push({ tipo: 'h1', texto: m[1] }); return; }
        if ((m = /^[-*•]\s+(.*)$/.exec(l))) { blocos.push({ tipo: 'li', texto: m[1], marcador: '•' }); return; }
        if ((m = /^(\d+)[.)]\s+(.*)$/.exec(l))) { blocos.push({ tipo: 'li', texto: m[2], marcador: m[1] + '.' }); return; }
        if ((m = /^>\s?(.*)$/.exec(l))) { blocos.push({ tipo: 'citacao', texto: m[1] }); return; }
        blocos.push({ tipo: 'p', texto: l });
    });
    return blocos;
}

// ===========================================================================
// CONVERTER PARA PDF
// ===========================================================================

// Foto de iPhone. O arquivo HEIC comeca com uma caixa 'ftyp' seguida da MARCA do
// formato — e' a marca que decide, nao a presenca do 'ftyp': um .mp4 tambem tem 'ftyp',
// e mandar um video para o conversor de HEIC so' daria erro estranho.
function ehHeicPelosBytes(bytes) {
    if (bytes.length < 12) return false;
    const texto = (de, ate) => String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, de, ate));
    if (texto(4, 8) !== 'ftyp') return false;
    return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].indexOf(texto(8, 12)) !== -1;
}

// Qualquer imagem que o navegador saiba abrir (WEBP, BMP, GIF, AVIF...) passa pelo
// <canvas> e sai PNG, porque o PDF so' embute PNG e JPEG. HEIC do iPhone nao e'
// aberto nativamente por todos os navegadores: esse tem uma biblioteca propria.
async function imagemParaPngOuJpg(arquivo) {
    const bytes = bytesDe(arquivo);
    const nome = String(arquivo.nome || '').toLowerCase();
    const ehPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const ehJpg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    if (ehPng || ehJpg) return bytes;
    if (!ehNavegador) throw new Error('Converter esta imagem exige o navegador.');

    let blob = new Blob([bytes]);
    if (/\.hei[cf]$/.test(nome) || ehHeicPelosBytes(bytes)) {
        const heic2any = await libHeic();
        blob = await heic2any({ blob: blob, toType: 'image/jpeg', quality: 0.92 });
        if (Array.isArray(blob)) blob = blob[0];
    }

    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise((ok, falha) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = () => falha(new Error('Nao consegui abrir a imagem "' + arquivo.nome + '".'));
            i.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);   // PNG transparente viraria preto no PDF
        ctx.drawImage(img, 0, 0);
        return await blobParaBytes(await canvasParaBlob(canvas, 'image/png'));
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function imagensParaPdf(e, prog) {
    const PDFLib = await libPdfLib();
    const imagens = listaDe(e.imagens);
    if (!imagens.length) throw new Error('Escolha as imagens.');

    const doc = await PDFLib.PDFDocument.create();
    const margem = e.margem == null ? 0 : Number(e.margem);
    const porTamanhoDaImagem = (e.tamanho || 'imagem') === 'imagem';
    const base = TAMANHOS_PAGINA[e.tamanho] || TAMANHOS_PAGINA.A4;

    for (let i = 0; i < imagens.length; i++) {
        if (prog) prog(Math.round(i / imagens.length * 95), 'Imagem ' + (i + 1) + ' de ' + imagens.length);
        const bytes = await imagemParaPngOuJpg(imagens[i]);
        const img = await embutirImagem(doc, bytes);

        if (porTamanhoDaImagem) {
            const pagina = doc.addPage([img.width + 2 * margem, img.height + 2 * margem]);
            pagina.drawImage(img, { x: margem, y: margem, width: img.width, height: img.height });
        } else {
            const deitado = e.orientacao === 'paisagem' ||
                            (e.orientacao === 'auto' && img.width > img.height);
            const L = deitado ? base[1] : base[0];
            const A = deitado ? base[0] : base[1];
            const pagina = doc.addPage([L, A]);
            const f = Math.min((L - 2 * margem) / img.width, (A - 2 * margem) / img.height);
            const l = img.width * f, a = img.height * f;
            pagina.drawImage(img, { x: (L - l) / 2, y: (A - a) / 2, width: l, height: a });
        }
    }
    doc.setProducer('SisProf — Ferramentas PDF');
    doc.setCreationDate(new Date());
    return {
        arquivos: [{ nome: (e.nomeSaida || 'imagens') + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: imagens.length + ' imagem(ns) viraram um PDF de ' + doc.getPageCount() + ' pagina(s).'
    };
}

async function wordParaPdf(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    if (!/\.docx$/i.test(arquivo.nome || '')) {
        throw new Error('So' + ' leio .docx (Word 2007 em diante). Um .doc antigo precisa ser salvo como .docx primeiro.');
    }
    if (typeof mammoth === 'undefined') {
        throw new Error('A leitura de Word (mammoth) nao esta disponivel nesta pagina.');
    }
    if (prog) prog(15, 'Lendo o documento do Word');
    const bytes = bytesDe(arquivo);
    // O mammoth quer um ArrayBuffer proprio.
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    if (prog) prog(55, 'Montando o PDF');
    const blocos = htmlParaBlocos(html);
    const doc = await montarPdfDeBlocos(blocos, {
        tamanho: e.tamanho || 'A4', orientacao: e.orientacao || 'retrato',
        margem: e.margem, titulo: semExtensao(arquivo.nome), autor: e.autor
    });
    if (prog) prog(95, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF com ' + doc.getPageCount() + ' pagina(s), com o texto pesquisavel. ' +
                  'A formatacao fina do Word (colunas, caixas de texto, fontes proprias) nao e reproduzida.'
    };
}

async function planilhaParaPdf(e, prog) {
    const XLSX = await libXlsx();
    const arquivo = listaDe(e.arquivo)[0];
    if (prog) prog(20, 'Lendo a planilha');
    const wb = XLSX.read(bytesDe(arquivo), { type: 'array' });

    const blocos = [];
    wb.SheetNames.forEach((nomeAba, i) => {
        const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, blankrows: false, defval: '' });
        if (!linhas.length) return;
        if (i > 0 && e.umaAbaPorPagina !== false) blocos.push({ tipo: 'quebra' });
        if (wb.SheetNames.length > 1) blocos.push({ tipo: 'h2', texto: nomeAba });
        // Tabela muito larga em retrato fica ilegivel; o aviso vai na mensagem final.
        blocos.push({ tipo: 'tabela', linhas: linhas.map(l => l.map(c => c == null ? '' : String(c))), tamanho: Number(e.tamanhoFonte) || 8 });
    });
    if (!blocos.length) throw new Error('A planilha nao tem nenhuma celula preenchida.');

    if (prog) prog(60, 'Montando o PDF');
    const doc = await montarPdfDeBlocos(blocos, {
        tamanho: e.tamanho || 'A4', orientacao: e.orientacao || 'paisagem',
        margem: e.margem == null ? 32 : e.margem, titulo: semExtensao(arquivo.nome)
    });
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: wb.SheetNames.length + ' aba(s) em ' + doc.getPageCount() + ' pagina(s). ' +
                  'Formulas viram o valor calculado; cores e bordas da planilha nao vao.'
    };
}

async function textoParaPdf(e, prog) {
    const arquivos = listaDe(e.arquivo);
    let texto = String(e.texto || '');
    let nome = e.nomeSaida || 'documento';
    if (arquivos.length) {
        texto = new TextDecoder('utf-8').decode(bytesDe(arquivos[0]));
        nome = semExtensao(arquivos[0].nome);
    }
    if (!texto.trim()) throw new Error('Escreva o texto (ou escolha um arquivo .txt / .md).');

    if (prog) prog(50, 'Montando o PDF');
    const doc = await montarPdfDeBlocos(textoParaBlocos(texto), {
        tamanho: e.tamanho || 'A4', orientacao: e.orientacao || 'retrato',
        margem: e.margem, titulo: e.titulo || nome, autor: e.autor
    });
    return {
        arquivos: [{ nome: nome + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF com ' + doc.getPageCount() + ' pagina(s).'
    };
}

async function htmlParaPdf(e, prog) {
    let html = String(e.html || '');
    let nome = e.nomeSaida || 'pagina';
    const url = String(e.url || '').trim();

    if (url) {
        if (!/^https?:\/\//i.test(url)) throw new Error('O endereco precisa comecar com http:// ou https://');
        if (prog) prog(15, 'Baixando a pagina');
        try {
            const resposta = await fetch(url);
            if (!resposta.ok) throw new Error('o site respondeu ' + resposta.status);
            html = await resposta.text();
            nome = (url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'pagina').slice(0, 60);
        } catch (erro) {
            // Quase todo site recusa leitura por outro endereco (CORS). Dizer isso e' mais
            // util do que "Failed to fetch": o caminho que funciona e' colar o HTML.
            throw new Error('Nao consegui baixar "' + url + '" direto do navegador (' + (erro.message || erro) + '). ' +
                            'A maioria dos sites bloqueia a leitura por outro endereco. Abra a pagina, ' +
                            'use "Salvar como > pagina completa" ou copie o HTML e cole no campo abaixo.');
        }
    }

    const arquivos = listaDe(e.arquivo);
    if (arquivos.length) {
        html = new TextDecoder('utf-8').decode(bytesDe(arquivos[0]));
        nome = semExtensao(arquivos[0].nome);
    }
    if (!html.trim()) throw new Error('Cole o HTML, escolha um arquivo .html ou informe o endereco.');

    if (prog) prog(60, 'Montando o PDF');
    const doc = await montarPdfDeBlocos(htmlParaBlocos(html), {
        tamanho: e.tamanho || 'A4', orientacao: e.orientacao || 'retrato', margem: e.margem, titulo: nome
    });
    return {
        arquivos: [{ nome: nome + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF com ' + doc.getPageCount() + ' pagina(s). Vao o texto, as listas, as tabelas e as ' +
                  'imagens embutidas; o CSS do site nao e aplicado.'
    };
}

async function criarPdf(e, prog) {
    const blocos = [];
    if (String(e.titulo || '').trim()) blocos.push({ tipo: 'h1', texto: String(e.titulo).trim() });
    if (String(e.subtitulo || '').trim()) blocos.push({ tipo: 'citacao', texto: String(e.subtitulo).trim() });
    if (!String(e.corpo || '').trim()) throw new Error('Escreva o conteudo do documento.');
    textoParaBlocos(e.corpo).forEach(b => blocos.push(b));

    if (prog) prog(50, 'Montando o PDF');
    const doc = await montarPdfDeBlocos(blocos, {
        tamanho: e.tamanho || 'A4', orientacao: e.orientacao || 'retrato',
        margem: e.margem, titulo: e.titulo, autor: e.autor
    });
    const nome = (String(e.titulo || 'documento').trim().replace(/[^\w\sÀ-ÿ-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'documento');
    return {
        arquivos: [{ nome: nome + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF criado com ' + doc.getPageCount() + ' pagina(s).'
    };
}

// ===========================================================================
// CONVERTER DE PDF
// ===========================================================================

async function pdfParaImagens(e, prog) {
    if (!ehNavegador) throw new Error('Esta conversao exige o navegador.');
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdfJs(arquivo, e.senha);
    const indices = faixaParaIndices(e.paginas, doc.numPages);
    const escala = escalaParaDpi(e.dpi);
    const ehJpg = (e.formato || 'png') === 'jpg';
    const qualidade = Math.max(0.3, Math.min(1, Number(e.qualidade == null ? 0.9 : e.qualidade)));
    const base = semExtensao(arquivo.nome);

    const saidas = [];
    for (let k = 0; k < indices.length; k++) {
        if (prog) prog(Math.round(k / indices.length * 95), 'Desenhando pagina ' + (indices[k] + 1));
        const canvas = await paginaParaCanvas(doc, indices[k] + 1, escala);
        const blob = await canvasParaBlob(canvas, ehJpg ? 'image/jpeg' : 'image/png', ehJpg ? qualidade : undefined);
        saidas.push({
            nome: base + '_pag' + String(indices[k] + 1).padStart(3, '0') + (ehJpg ? '.jpg' : '.png'),
            blob: blob, tipo: ehJpg ? 'image/jpeg' : 'image/png'
        });
        canvas.width = canvas.height = 0;   // libera a memoria do canvas antes da proxima pagina
    }
    return { arquivos: saidas, mensagem: saidas.length + ' imagem(ns) a ' + (Number(e.dpi) || 150) + ' DPI.' };
}

async function pdfParaTexto(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const paginas = await textoDoPdf(arquivo, prog, e.senha);
    const indices = faixaParaIndices(e.paginas, paginas.length);
    const marcar = e.marcarPaginas !== false;

    const partes = indices.map(i =>
        (marcar ? '===== Pagina ' + (i + 1) + ' =====\n' : '') + (paginas[i] || '')
    );
    const texto = partes.join('\n\n');
    const vazio = !texto.replace(/=+ Pagina \d+ =+/g, '').trim();

    if (e.separados) {
        return {
            arquivos: indices.map(i => ({
                nome: semExtensao(arquivo.nome) + '_pag' + (i + 1) + '.txt',
                bytes: textoParaBytes(paginas[i] || ''), tipo: 'text/plain'
            })),
            mensagem: indices.length + ' arquivo(s) de texto.'
        };
    }
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '.txt', bytes: textoParaBytes(texto), tipo: 'text/plain' }],
        mensagem: vazio
            ? 'Saiu vazio: este PDF nao tem camada de texto (e uma digitalizacao). Passe primeiro por "OCR de PDF".'
            : texto.length.toLocaleString('pt-BR') + ' caracteres extraidos de ' + indices.length + ' pagina(s).'
    };
}

// .docx montado na mao (OOXML dentro de um ZIP). Sao quatro arquivinhos de XML —
// menos codigo e menos risco do que trazer uma biblioteca de 500 KB para isto.
async function montarDocx(paragrafos, titulo) {
    const JSZip = await libJsZip();
    const zip = new JSZip();

    zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '</Types>');

    zip.folder('_rels').file('.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>');

    zip.folder('word').folder('_rels').file('document.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>');

    zip.folder('docProps').file('core.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:title>' + escXml(titulo || 'Documento') + '</dc:title>' +
        '<dc:creator>SisProf</dc:creator>' +
        '</cp:coreProperties>');

    zip.folder('word').file('styles.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:docDefaults><w:rPrDefault><w:rPr>' +
        '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/>' +
        '</w:rPr></w:rPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:styleId="Titulo"><w:name w:val="Heading 1"/>' +
        '<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>' +
        '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
        '</w:styles>');

    const corpo = paragrafos.map(p => {
        const estilo = p.titulo ? '<w:pPr><w:pStyle w:val="Titulo"/></w:pPr>' : '';
        const rPr = p.titulo ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : '';
        // xml:space="preserve" para o Word nao comer os espacos das margens do texto.
        return '<w:p>' + estilo + '<w:r>' + rPr +
               '<w:t xml:space="preserve">' + escXml(p.texto || '') + '</w:t></w:r></w:p>';
    }).join('');

    zip.folder('word').file('document.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        corpo +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
        '</w:body></w:document>');

    return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function pdfParaWord(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const paginas = await textoDoPdf(arquivo, prog, e.senha);
    const juntoTudo = paginas.join('\n\n').trim();
    if (!juntoTudo) {
        throw new Error('Este PDF nao tem camada de texto (e uma digitalizacao). Passe primeiro por "OCR de PDF" ' +
                        'e depois converta o resultado.');
    }

    if (prog) prog(92, 'Montando o .docx');
    const paragrafos = [];
    paginas.forEach((texto, i) => {
        if (e.marcarPaginas !== false && paginas.length > 1) {
            paragrafos.push({ texto: 'Pagina ' + (i + 1), titulo: true });
        }
        (texto || '').split(/\n{2,}/).forEach(par => {
            const t = par.replace(/\n/g, ' ').trim();
            if (t) paragrafos.push({ texto: t });
        });
    });

    const bytes = await montarDocx(paragrafos, semExtensao(arquivo.nome));
    return {
        arquivos: [{
            nome: semExtensao(arquivo.nome) + '.docx', bytes: bytes,
            tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }],
        mensagem: paragrafos.length + ' paragrafo(s) num .docx editavel. O texto vem inteiro; ' +
                  'a diagramacao original (colunas, tabelas, imagens) nao e reconstruida.'
    };
}

async function pdfParaPlanilha(e, prog) {
    const XLSX = await libXlsx();
    if (!ehNavegador) throw new Error('Esta conversao exige o navegador.');
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdfJs(arquivo, e.senha);
    const indices = faixaParaIndices(e.paginas, doc.numPages);

    // Reconstrucao de tabela por COORDENADA: agrupa os pedacos de texto que estao na
    // mesma altura (linha) e usa o buraco horizontal entre eles para separar as colunas.
    // Nao existe "tabela" dentro de um PDF — o que existe e' texto posicionado. Por isso
    // isto e' uma leitura razoavel, nao uma verdade: a mensagem final avisa.
    const abas = [];
    for (let k = 0; k < indices.length; k++) {
        if (prog) prog(Math.round(k / indices.length * 90), 'Lendo pagina ' + (indices[k] + 1));
        const pagina = await doc.getPage(indices[k] + 1);
        const conteudo = await pagina.getTextContent();

        const porLinha = new Map();
        (conteudo.items || []).forEach(item => {
            if (!item.str || !item.str.trim()) return;
            const y = Math.round(item.transform[5] / 3) * 3;   // tolerancia de 3 pontos
            if (!porLinha.has(y)) porLinha.set(y, []);
            porLinha.get(y).push({ x: item.transform[4], largura: item.width || 0, texto: item.str });
        });

        const linhas = Array.from(porLinha.keys()).sort((a, b) => b - a).map(y => {
            const pedacos = porLinha.get(y).sort((a, b) => a.x - b.x);
            const celulas = [];
            let atual = '';
            let fimAnterior = null;
            pedacos.forEach(p => {
                const vao = fimAnterior == null ? 0 : p.x - fimAnterior;
                if (fimAnterior != null && vao > 8) { celulas.push(atual.trim()); atual = ''; }
                atual += (atual && vao > 0.5 ? ' ' : '') + p.texto;
                fimAnterior = p.x + p.largura;
            });
            if (atual.trim()) celulas.push(atual.trim());
            return celulas;
        }).filter(l => l.length);

        abas.push({ nome: 'Pagina ' + (indices[k] + 1), linhas: linhas });
    }

    const comConteudo = abas.filter(a => a.linhas.length);
    if (!comConteudo.length) {
        throw new Error('Nao achei texto neste PDF. Se for digitalizacao, passe antes por "OCR de PDF".');
    }

    if ((e.formato || 'xlsx') === 'csv') {
        const linhas = [];
        comConteudo.forEach((aba, i) => {
            if (i > 0) linhas.push([]);
            aba.linhas.forEach(l => linhas.push(l));
        });
        const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(linhas), { FS: ';' });
        // BOM para o Excel brasileiro abrir os acentos certos.
        return {
            arquivos: [{ nome: semExtensao(arquivo.nome) + '.csv', bytes: textoParaBytes('﻿' + csv), tipo: 'text/csv' }],
            mensagem: linhas.length + ' linha(s) em CSV (separado por ponto e virgula).'
        };
    }

    const wb = XLSX.utils.book_new();
    comConteudo.forEach(aba => {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba.linhas), aba.nome.slice(0, 31));
    });
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    return {
        arquivos: [{
            nome: semExtensao(arquivo.nome) + '.xlsx', bytes: bytes,
            tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }],
        mensagem: comConteudo.length + ' aba(s) geradas. As colunas foram deduzidas pela posicao do texto — ' +
                  'confira antes de usar em nota ou frequencia.'
    };
}

async function pdfParaHtml(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const paginas = await textoDoPdf(arquivo, prog, e.senha);
    const indices = faixaParaIndices(e.paginas, paginas.length);
    const titulo = semExtensao(arquivo.nome);

    const corpo = indices.map(i => {
        const paragrafos = (paginas[i] || '').split(/\n{2,}/)
            .map(p => p.trim()).filter(Boolean)
            .map(p => '    <p>' + escXml(p).replace(/\n/g, '<br>') + '</p>').join('\n');
        return '  <section class="pagina">\n    <h2>Pagina ' + (i + 1) + '</h2>\n' +
               (paragrafos || '    <p><em>(pagina sem texto)</em></p>') + '\n  </section>';
    }).join('\n');

    const html = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        '<title>' + escXml(titulo) + '</title>\n<style>\n' +
        '  body { font-family: Georgia, "Times New Roman", serif; max-width: 42em; margin: 2em auto; padding: 0 1em; line-height: 1.6; color: #1a202c; }\n' +
        '  h1 { font-size: 1.6em; border-bottom: 2px solid #e2e8f0; padding-bottom: .3em; }\n' +
        '  .pagina { margin: 2em 0; }\n' +
        '  .pagina h2 { font-size: .85em; text-transform: uppercase; letter-spacing: .08em; color: #718096; font-family: system-ui, sans-serif; }\n' +
        '  @media print { .pagina { page-break-after: always; } }\n' +
        '</style>\n</head>\n<body>\n  <h1>' + escXml(titulo) + '</h1>\n' + corpo + '\n</body>\n</html>\n';

    return {
        arquivos: [{ nome: titulo + '.html', bytes: textoParaBytes(html), tipo: 'text/html' }],
        mensagem: indices.length + ' pagina(s) em HTML, com o texto pesquisavel.'
    };
}

// ===========================================================================
// OTIMIZAR E REPARAR
// ===========================================================================

// Redesenha o PDF como imagem, pagina por pagina. E' a base de "Rasterizar",
// "Comprimir (modo imagem)" e "Censurar": depois disso o texto deixou de existir
// como texto — o que e' exatamente o que se quer quando o objetivo e' apagar de
// verdade, e exatamente o que se perde quando o objetivo era so' diminuir.
async function rasterizarParaPdf(arquivo, opcoes, prog) {
    const PDFLib = await libPdfLib();
    const o = opcoes || {};
    const docJs = await abrirPdfJs(arquivo, o.senha);
    const docOriginal = await abrirPdf(arquivo);           // para manter o tamanho exato das paginas
    const paginasOriginais = docOriginal.getPages();
    const escala = escalaParaDpi(o.dpi || 150);
    const ehJpg = (o.formato || 'jpg') === 'jpg';
    const qualidade = Math.max(0.3, Math.min(1, Number(o.qualidade == null ? 0.82 : o.qualidade)));
    const indices = o.indices || Array.from({ length: docJs.numPages }, (_, i) => i);

    const saida = await PDFLib.PDFDocument.create();
    for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        if (prog) prog(Math.round(k / indices.length * 92), 'Redesenhando pagina ' + (i + 1) + ' de ' + indices.length);
        const canvas = await paginaParaCanvas(docJs, i + 1, escala);
        if (o.antesDeExportar) o.antesDeExportar(canvas, i, escala);
        const blob = await canvasParaBlob(canvas, ehJpg ? 'image/jpeg' : 'image/png', ehJpg ? qualidade : undefined);
        const img = await embutirImagem(saida, await blobParaBytes(blob));

        // A pagina nova nasce do tamanho da antiga (em pontos), nao do tamanho em pixels:
        // assim o PDF continua imprimindo em A4 mesmo tendo sido redesenhado a 300 DPI.
        const original = paginasOriginais[i];
        let L, A;
        if (original) {
            const caixa = original.getCropBox();
            const giro = ((original.getRotation().angle || 0) % 360 + 360) % 360;
            L = (giro === 90 || giro === 270) ? caixa.height : caixa.width;
            A = (giro === 90 || giro === 270) ? caixa.width : caixa.height;
        } else {
            L = canvas.width * 72 / (72 * escala); A = canvas.height * 72 / (72 * escala);
        }
        const pagina = saida.addPage([L, A]);
        pagina.drawImage(img, { x: 0, y: 0, width: L, height: A });
        canvas.width = canvas.height = 0;
    }
    saida.setProducer('SisProf — Ferramentas PDF');
    return saida;
}

function formatarTamanho(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

async function comprimir(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const tamanhoAntes = bytesDe(arquivo).length;
    const modo = e.modo || 'estrutura';
    let bytes;
    let observacao;

    if (modo === 'imagem') {
        const qualidades = { alta: [200, 0.9], media: [150, 0.8], baixa: [110, 0.65], minima: [72, 0.5] };
        const [dpi, q] = qualidades[e.nivel || 'media'] || qualidades.media;
        const doc = await rasterizarParaPdf(arquivo, { dpi: dpi, qualidade: q, formato: 'jpg', senha: e.senha }, prog);
        bytes = await doc.save();
        observacao = 'O texto virou imagem: nao da mais para pesquisar nem copiar. Guarde o original.';
    } else {
        // Sem perda: reconstroi o arquivo copiando so' as paginas usadas (o que deixa
        // de fora objeto orfao, versao anterior de anotacao e lixo de editor) e grava
        // com fluxo de objetos comprimido.
        const original = await abrirPdf(arquivo);
        const doc = await PDFLib.PDFDocument.create();
        const paginas = await doc.copyPages(original, original.getPageIndices());
        paginas.forEach(p => doc.addPage(p));
        if (e.limparMetadados !== false) {
            doc.setTitle(original.getTitle() || '');
        } else {
            doc.setTitle(original.getTitle() || '');
            doc.setAuthor(original.getAuthor() || '');
            doc.setSubject(original.getSubject() || '');
        }
        doc.setProducer('SisProf — Ferramentas PDF');
        if (prog) prog(90, 'Gravando');
        bytes = await doc.save({ useObjectStreams: true });
        observacao = 'Compressao sem perda: o texto continua pesquisavel. ' +
                     'Se o arquivo quase nao diminuiu, o peso esta nas imagens — use o modo "recompor imagens".';
    }

    const diferenca = tamanhoAntes - bytes.length;
    const pct = tamanhoAntes ? Math.round(diferenca / tamanhoAntes * 100) : 0;
    let resumo;
    if (diferenca > 0) {
        resumo = 'De ' + formatarTamanho(tamanhoAntes) + ' para ' + formatarTamanho(bytes.length) + ' (−' + pct + '%).';
    } else {
        resumo = 'Este arquivo ja estava compacto: de ' + formatarTamanho(tamanhoAntes) +
                 ' foi para ' + formatarTamanho(bytes.length) + '. Vale ficar com o original.';
    }
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_comprimido.pdf', bytes: bytes, tipo: 'application/pdf' }],
        mensagem: resumo + ' ' + observacao
    };
}

async function otimizarWeb(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const tamanhoAntes = bytesDe(arquivo).length;
    const original = await abrirPdf(arquivo);

    const doc = await PDFLib.PDFDocument.create();
    const paginas = await doc.copyPages(original, original.getPageIndices());
    paginas.forEach(p => doc.addPage(p));
    doc.setTitle(original.getTitle() || semExtensao(arquivo.nome));
    doc.setProducer('SisProf — Ferramentas PDF');
    // Titulo na barra do navegador em vez do nome do arquivo: e' o detalhe que faz
    // o PDF parecer "publicado" e nao "anexado".
    const prefs = doc.catalog.getOrCreateViewerPreferences();
    prefs.setDisplayDocTitle(true);
    if (prog) prog(85, 'Gravando');

    const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_web.pdf', bytes: bytes, tipo: 'application/pdf' }],
        mensagem: 'Arquivo reconstruido para abrir na web: ' + formatarTamanho(tamanhoAntes) + ' → ' +
                  formatarTamanho(bytes.length) + ', objetos comprimidos, orfaos descartados e o titulo do ' +
                  'documento aparecendo na aba do navegador.'
    };
}

async function reparar(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const bytes = bytesDe(arquivo);

    // Tentativa 1: reconstruir com o pdf-lib tolerando objeto invalido. Resolve o caso
    // comum — arquivo truncado no download, tabela de referencias errada.
    try {
        if (prog) prog(20, 'Tentando reconstruir a estrutura');
        const original = await PDFLib.PDFDocument.load(bytes, {
            ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false
        });
        const doc = await PDFLib.PDFDocument.create();
        const paginas = await doc.copyPages(original, original.getPageIndices());
        paginas.forEach(p => doc.addPage(p));
        if (!doc.getPageCount()) throw new Error('nenhuma pagina legivel');
        doc.setProducer('SisProf — Ferramentas PDF');
        return {
            arquivos: [{ nome: semExtensao(arquivo.nome) + '_reparado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
            mensagem: 'Estrutura reconstruida: ' + doc.getPageCount() + ' pagina(s) recuperadas, com o texto intacto.'
        };
    } catch (erro1) {
        // Tentativa 2: se nem a estrutura da' pe', o pdf.js ainda consegue DESENHAR o que
        // existe. Sai um PDF de imagens — perde o texto, mas salva o conteudo.
        if (!ehNavegador) throw erro1;
        if (prog) prog(45, 'A estrutura nao abriu — redesenhando as paginas');
        try {
            const doc = await rasterizarParaPdf(arquivo, { dpi: 150, formato: 'jpg', qualidade: 0.85 }, prog);
            if (!doc.getPageCount()) throw new Error('sem paginas');
            return {
                arquivos: [{ nome: semExtensao(arquivo.nome) + '_reparado-imagem.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
                mensagem: 'A estrutura estava danificada demais para ser remontada, mas as paginas foram ' +
                          'redesenhadas: ' + doc.getPageCount() + ' pagina(s) salvas como imagem (sem camada de texto). ' +
                          'Para recuperar o texto, passe o resultado por "OCR de PDF".'
            };
        } catch (erro2) {
            throw new Error('Nao consegui recuperar nada deste arquivo. Ele pode nao ser um PDF, ou estar ' +
                            'cortado no meio. (' + (erro1.message || erro1) + ')');
        }
    }
}

async function rasterizar(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await rasterizarParaPdf(arquivo, {
        dpi: e.dpi || 200, formato: e.formato || 'jpg',
        qualidade: e.qualidade == null ? 0.85 : e.qualidade, senha: e.senha
    }, prog);
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_rasterizado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: doc.getPageCount() + ' pagina(s) redesenhadas a ' + (Number(e.dpi) || 200) + ' DPI. ' +
                  'Nao ha mais texto, fonte nem camada editavel — o documento ficou "chapado".'
    };
}

async function achatar(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];

    if (e.modo === 'imagem') {
        const doc = await rasterizarParaPdf(arquivo, { dpi: e.dpi || 200, formato: 'jpg', qualidade: 0.88, senha: e.senha }, prog);
        return {
            arquivos: [{ nome: semExtensao(arquivo.nome) + '_achatado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
            mensagem: 'Documento achatado por redesenho: formularios, anotacoes e camadas deixaram de existir.'
        };
    }

    const doc = await abrirPdf(arquivo);
    let campos = 0;
    try {
        const form = doc.getForm();
        campos = form.getFields().length;
        if (campos) form.flatten();
    } catch (_) { /* PDF sem formulario: nada a achatar aqui */ }

    // Anotacao (comentario, destaque, carimbo) e' objeto separado do conteudo da pagina.
    // Quem quer "achatar" quer que o carimbo nao seja mais removivel — entao ou ele passa
    // a fazer parte do desenho (modo imagem, acima) ou some. Aqui a opcao e' declarada.
    let anotacoes = 0;
    if (e.removerAnotacoes) {
        const { PDFName } = PDFLib;
        doc.getPages().forEach(pagina => {
            const lista = pagina.node.Annots();
            if (lista) { anotacoes += lista.size(); pagina.node.delete(PDFName.of('Annots')); }
        });
    }

    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(92, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_achatado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: (campos ? campos + ' campo(s) de formulario incorporados ao conteudo. ' : 'Este PDF nao tinha formulario. ') +
                  (e.removerAnotacoes ? anotacoes + ' anotacao(oes) removidas. ' : '') +
                  'O texto continua pesquisavel; para achatar tambem os carimbos, use o modo "redesenhar".'
    };
}

async function paraPdfA(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo, { updateMetadata: false });
    const nivel = e.conformidade || '3B';

    if (prog) prog(35, 'Aplicando as regras do PDF/A');
    try {
        await doc.convertToPDFA({ conformance: nivel });
    } catch (erro) {
        throw new Error('Nao consegui converter para PDF/A-' + nivel + ': ' + (erro.message || erro) +
                        '. PDF/A exige que TODA fonte usada esteja embutida no arquivo; um PDF que apenas ' +
                        'aponta para uma fonte do sistema nao pode ser convertido sem redesenhar. Nesse caso, ' +
                        'passe o arquivo por "Rasterizar PDF" e converta o resultado.');
    }
    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(90, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_PDFA-' + nivel + '.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'Arquivo marcado como PDF/A-' + nivel + ' (formato de arquivamento de longo prazo, ' +
                  'com perfil de cor e metadados XMP). Validacao formal so um validador certificado faz — ' +
                  'a conversao aqui atende o caso comum de guardar documento escolar por anos.'
    };
}

async function ocr(e, prog) {
    if (!ehNavegador) throw new Error('O OCR exige o navegador.');
    const PDFLib = await libPdfLib();
    const Tesseract = await libTesseract();
    const arquivo = listaDe(e.arquivo)[0];
    const idioma = e.idioma || 'por';

    if (prog) prog(4, 'Baixando o reconhecedor de texto (' + idioma + ') — isso leva alguns segundos na primeira vez');
    const worker = await Tesseract.createWorker(idioma);

    try {
        const docJs = await abrirPdfJs(arquivo, e.senha);
        const docOriginal = await abrirPdf(arquivo);
        const paginasOriginais = docOriginal.getPages();
        const indices = faixaParaIndices(e.paginas, docJs.numPages);
        const escala = escalaParaDpi(e.dpi || 200);

        const saida = await PDFLib.PDFDocument.create();
        const fonte = await fonteHelvetica(saida, false);
        const textos = [];

        for (let k = 0; k < indices.length; k++) {
            const i = indices[k];
            const inicio = 8 + Math.round(k / indices.length * 85);
            if (prog) prog(inicio, 'Reconhecendo o texto da pagina ' + (i + 1) + ' (' + (k + 1) + ' de ' + indices.length + ')');

            const canvas = await paginaParaCanvas(docJs, i + 1, escala);
            const { data } = await worker.recognize(canvas);
            textos.push(data.text || '');

            const blob = await canvasParaBlob(canvas, 'image/jpeg', 0.85);
            const img = await embutirImagem(saida, await blobParaBytes(blob));
            const original = paginasOriginais[i];
            const caixa = original ? original.getCropBox() : { width: canvas.width / escala, height: canvas.height / escala };
            const L = caixa.width, A = caixa.height;
            const pagina = saida.addPage([L, A]);
            pagina.drawImage(img, { x: 0, y: 0, width: L, height: A });

            // A CAMADA INVISIVEL: cada palavra reconhecida e' escrita por cima da imagem
            // com opacidade 0, no lugar onde ela aparece. O olho ve a digitalizacao; a
            // busca do leitor de PDF (e o Ctrl+F) encontra o texto.
            const palavras = coletarPalavrasOcr(data);
            const fator = L / canvas.width;
            palavras.forEach(p => {
                const texto = limparParaWinAnsi(p.text || '').trim();
                if (!texto) return;
                const caixaP = p.bbox || {};
                const larguraCaixa = (caixaP.x1 - caixaP.x0) * fator;
                const alturaCaixa = (caixaP.y1 - caixaP.y0) * fator;
                if (!(larguraCaixa > 0) || !(alturaCaixa > 0)) return;
                const tamanho = Math.max(1, Math.min(alturaCaixa * 0.95, 200));
                const larguraTexto = fonte.widthOfTextAtSize(texto, tamanho) || 1;
                // Espalhar a palavra ate' a largura real da imagem: sem isso, selecionar
                // com o mouse pega a palavra errada em texto justificado ou espacado.
                const folga = larguraCaixa - larguraTexto;
                const espacamento = texto.length > 1 ? folga / (texto.length - 1) : 0;
                try {
                    pagina.drawText(texto, {
                        x: caixaP.x0 * fator,
                        y: A - caixaP.y1 * fator + alturaCaixa * 0.12,
                        size: tamanho,
                        font: fonte,
                        opacity: 0,
                        characterSpacing: Math.max(-tamanho * 0.4, Math.min(tamanho, espacamento))
                    });
                } catch (_) { /* palavra que a fonte nao codifica: fica so' na imagem */ }
            });
            canvas.width = canvas.height = 0;
        }

        saida.setProducer('SisProf — Ferramentas PDF');
        if (prog) prog(96, 'Gravando');
        const textoTotal = textos.join('\n\n');
        const arquivos = [{ nome: semExtensao(arquivo.nome) + '_ocr.pdf', bytes: await saida.save(), tipo: 'application/pdf' }];
        if (e.tambemTxt) {
            arquivos.push({ nome: semExtensao(arquivo.nome) + '_ocr.txt', bytes: textoParaBytes(textoTotal), tipo: 'text/plain' });
        }
        return {
            arquivos: arquivos,
            mensagem: indices.length + ' pagina(s) reconhecidas, ' +
                      textoTotal.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length +
                      ' palavras. O PDF continua com a aparencia da digitalizacao, mas agora pode ser pesquisado. ' +
                      'Confira: OCR erra em letra ruim, carimbo e manuscrito.'
        };
    } finally {
        try { await worker.terminate(); } catch (_) { /* nada a fazer */ }
    }
}

// O Tesseract.js mudou de formato de saida entre versoes: as vezes entrega `words`
// direto, as vezes so' `blocks` (blocos > paragrafos > linhas > palavras). Olhamos os
// dois para o OCR nao quebrar quando o CDN servir uma versao diferente.
function coletarPalavrasOcr(data) {
    if (!data) return [];
    if (Array.isArray(data.words) && data.words.length) return data.words;
    const saida = [];
    const descer = (no) => {
        if (!no || typeof no !== 'object') return;
        if (Array.isArray(no.words)) { no.words.forEach(p => saida.push(p)); }
        ['blocks', 'paragraphs', 'lines', 'symbols'].forEach(chave => {
            if (Array.isArray(no[chave])) no[chave].forEach(descer);
        });
    };
    descer(data);
    return saida;
}

// ===========================================================================
// SEGURANCA E PRIVACIDADE
// ===========================================================================

async function proteger(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const senha = String(e.senha || '');
    const senhaDono = String(e.senhaDono || '');
    if (!senha && !senhaDono) throw new Error('Informe a senha de abertura (ou, ao menos, a senha de permissoes).');
    if (senha && senha.length < 4) throw new Error('Uma senha de 3 caracteres ou menos nao protege nada. Use pelo menos 4.');

    const doc = await abrirPdf(arquivo, { updateMetadata: false });
    if (prog) prog(50, 'Cifrando o arquivo');

    // AES-256 e' o padrao. O RC4 dos PDFs antigos esta quebrado: a biblioteca so' o
    // aceita com um pedido explicito, e nao expomos isso na tela de proposito.
    const permissoes = {
        printing: e.permitirImprimir === false ? undefined : 'highResolution',
        modifying: !!e.permitirEditar,
        copying: e.permitirCopiar === false ? undefined : true,
        annotating: !!e.permitirAnotar,
        fillingForms: e.permitirFormulario !== false,
        contentAccessibility: true,          // leitor de tela SEMPRE pode ler: acessibilidade nao se nega
        documentAssembly: !!e.permitirMontar
    };

    try {
        doc.encrypt({
            userPassword: senha || undefined,
            ownerPassword: senhaDono || senha,
            permissions: permissoes,
            algorithm: 'AES-256'
        });
    } catch (erro) {
        throw new Error('Nao consegui cifrar: ' + (erro.message || erro));
    }

    if (prog) prog(88, 'Gravando');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_protegido.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'PDF cifrado com AES-256. ' +
                  (senha ? 'Sem a senha de abertura ninguem le o arquivo — nem nos. ' : 'Abre sem senha, mas as permissoes estao travadas. ') +
                  'GUARDE A SENHA: ela nao fica salva em lugar nenhum e nao existe como recuperar.'
    };
}

async function desbloquear(e, prog) {
    const PDFLib = await libPdfLib();
    const arquivo = listaDe(e.arquivo)[0];
    const senha = String(e.senha || '');

    let original;
    try {
        if (prog) prog(25, 'Abrindo o arquivo protegido');
        original = await PDFLib.PDFDocument.load(bytesDe(arquivo), { password: senha, updateMetadata: false });
    } catch (erro) {
        const msg = String((erro && erro.message) || erro);
        if (/password|decrypt|encrypt/i.test(msg)) {
            throw new Error(senha
                ? 'A senha nao abriu este arquivo. Confira maiusculas, minusculas e acentos.'
                : 'Este PDF pede senha para abrir. Digite a senha no campo acima.');
        }
        throw erro;
    }

    // Reabrir com senha NAO tira a protecao: o arquivo salvo sai cifrado do mesmo jeito,
    // porque a cifra vive no "trailer" do documento. Copiar as paginas para um documento
    // NOVO e' o que realmente devolve um PDF aberto.
    if (prog) prog(60, 'Reconstruindo sem a cifra');
    const doc = await PDFLib.PDFDocument.create();
    const paginas = await doc.copyPages(original, original.getPageIndices());
    paginas.forEach(p => doc.addPage(p));
    doc.setTitle(original.getTitle() || '');
    doc.setAuthor(original.getAuthor() || '');
    doc.setProducer('SisProf — Ferramentas PDF');

    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_sem-senha.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: doc.getPageCount() + ' pagina(s) num PDF sem senha e sem restricao de impressao ou copia. ' +
                  'Isto so funciona porque VOCE tem a senha — nao e quebra de cifra.'
    };
}

async function censurar(e, prog) {
    if (!ehNavegador) throw new Error('Censurar exige o navegador.');
    const arquivo = listaDe(e.arquivo)[0];
    const marcacoes = Array.isArray(e.itens) ? e.itens : JSON.parse(e.itens || '[]');
    const termos = String(e.termos || '').split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
    if (!marcacoes.length && !termos.length) {
        throw new Error('Marque as areas na pagina ou escreva as palavras a censurar (um por linha).');
    }

    const docJs = await abrirPdfJs(arquivo, e.senha);
    const docOriginal = await abrirPdf(arquivo);
    const caixasPorPagina = new Map();
    const guardar = (pagina, caixa) => {
        if (!caixasPorPagina.has(pagina)) caixasPorPagina.set(pagina, []);
        caixasPorPagina.get(pagina).push(caixa);
    };

    // As areas marcadas na tela chegam em pontos do PDF (origem embaixo a esquerda).
    marcacoes.forEach(m => guardar(m.pagina || 0, { x: m.x, y: m.y, largura: m.largura, altura: m.altura }));

    // Busca por palavra: acha onde o termo aparece e marca o retangulo do pedaco de texto.
    let achados = 0;
    if (termos.length) {
        const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const alvos = termos.map(semAcento);
        for (let i = 0; i < docJs.numPages; i++) {
            if (prog) prog(Math.round(i / docJs.numPages * 35), 'Procurando os termos na pagina ' + (i + 1));
            const pagina = await docJs.getPage(i + 1);
            const conteudo = await pagina.getTextContent();
            (conteudo.items || []).forEach(item => {
                const texto = semAcento(item.str);
                if (!texto.trim()) return;
                if (!alvos.some(t => t && texto.indexOf(t) !== -1)) return;
                achados++;
                const altura = Math.abs(item.transform[3]) || 10;
                // Uma folga de 1 ponto para a tarja cobrir a perna do "g" e o acento.
                guardar(i, {
                    x: item.transform[4] - 1,
                    y: item.transform[5] - altura * 0.25 - 1,
                    largura: (item.width || 0) + 2,
                    altura: altura * 1.35 + 2
                });
            });
        }
        if (!achados && !marcacoes.length) {
            throw new Error('Nao encontrei nenhum dos termos no texto deste PDF. ' +
                            'Se for uma digitalizacao, marque as areas com o mouse (ou passe antes por OCR).');
        }
    }

    // ESTA e' a parte que faz a censura ser censura: a pagina inteira e' REDESENHADA
    // com a tarja por cima e substituida por uma imagem. Desenhar um retangulo preto
    // sobre o PDF (o que muita ferramenta faz) esconde o nome na tela mas deixa o texto
    // no arquivo — qualquer um copia e cola, ou abre num editor, e le tudo.
    const indices = Array.from(caixasPorPagina.keys()).sort((a, b) => a - b);
    const escala = escalaParaDpi(e.dpi || 200);
    const todas = e.somenteMarcadas === false;
    const indicesFinais = todas ? Array.from({ length: docJs.numPages }, (_, i) => i) : indices;

    // A tarja e' desenhada no canvas, e o canvas vem do pdf.js: quem sabe onde fica o
    // ponto (x, y) do PDF dentro daquele desenho e' o proprio viewport do pdf.js, que
    // ja' conta a rotacao da pagina e a area visivel. Uma regra de tres com a largura
    // da CropBox acerta na pagina normal e erra em TODA pagina digitalizada de lado —
    // a tarja cairia no lugar errado e o nome ficaria a vista.
    const vistas = new Map();
    for (const i of indicesFinais) {
        const pagina = await docJs.getPage(i + 1);
        vistas.set(i, pagina.getViewport({ scale: escala }));
    }

    const doc = await rasterizarParaPdf(arquivo, {
        dpi: e.dpi || 200, formato: 'jpg', qualidade: 0.9, senha: e.senha,
        indices: indicesFinais,
        antesDeExportar: (canvas, indice) => {
            const caixas = caixasPorPagina.get(indice) || [];
            const vista = vistas.get(indice);
            if (!caixas.length || !vista) return;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            caixas.forEach(c => {
                const [x1, y1] = vista.convertToViewportPoint(c.x, c.y);
                const [x2, y2] = vista.convertToViewportPoint(c.x + c.largura, c.y + c.altura);
                ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
            });
        }
    }, prog);

    if (!todas && indices.length < docJs.numPages) {
        // As paginas sem tarja voltam inteiras (com o texto), na posicao certa.
        const PDFLib = await libPdfLib();
        const montado = await PDFLib.PDFDocument.create();
        const rasterizadas = await montado.embedPages(doc.getPages());
        const intactas = await montado.copyPages(docOriginal, docOriginal.getPageIndices());
        for (let i = 0; i < docJs.numPages; i++) {
            const posicao = indices.indexOf(i);
            if (posicao === -1) {
                montado.addPage(intactas[i]);
            } else {
                const emb = rasterizadas[posicao];
                const pagina = montado.addPage([emb.width, emb.height]);
                pagina.drawPage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
            }
        }
        montado.setProducer('SisProf — Ferramentas PDF');
        return {
            arquivos: [{ nome: semExtensao(arquivo.nome) + '_censurado.pdf', bytes: await montado.save(), tipo: 'application/pdf' }],
            mensagem: indices.length + ' pagina(s) censuradas de verdade (redesenhadas: o texto sob a tarja ' +
                      'nao existe mais no arquivo)' + (achados ? ', ' + achados + ' ocorrencia(s) dos termos' : '') +
                      '. As outras paginas ficaram intactas.'
        };
    }

    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_censurado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: doc.getPageCount() + ' pagina(s) redesenhadas com as tarjas' +
                  (achados ? ' (' + achados + ' ocorrencia(s) encontradas pelo texto)' : '') +
                  '. O conteudo coberto nao existe mais no arquivo — confira o resultado antes de enviar.'
    };
}

async function removerMetadados(e, prog) {
    const PDFLib = await libPdfLib();
    const { PDFName } = PDFLib;
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo, { updateMetadata: false });

    const antes = {
        titulo: doc.getTitle() || '', autor: doc.getAuthor() || '', assunto: doc.getSubject() || '',
        criador: doc.getCreator() || '', produtor: doc.getProducer() || '', palavrasChave: doc.getKeywords() || ''
    };

    doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
    doc.setKeywords([]); doc.setCreator(''); doc.setProducer('');

    // O XMP (o bloco de metadados em XML, no catalogo) e' o que carrega o nome do
    // programa, do computador e as vezes do usuario. Limpar so' o /Info nao resolve:
    // o XMP e' outra copia, e e' a que as ferramentas de analise leem.
    let xmpRemovido = false;
    if (doc.catalog.get(PDFName.of('Metadata'))) {
        doc.catalog.delete(PDFName.of('Metadata'));
        xmpRemovido = true;
    }
    if (e.limparDatas !== false) {
        // Data de criacao/alteracao denuncia quando o documento foi feito.
        try {
            const info = doc.getInfoDict();
            info.delete(PDFName.of('CreationDate'));
            info.delete(PDFName.of('ModDate'));
        } catch (_) { /* sem dicionario de informacoes: nada a apagar */ }
    }
    if (prog) prog(90, 'Gravando');

    const tinha = Object.keys(antes).filter(k => antes[k]);
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_sem-metadados.pdf', bytes: await doc.save({ updateMetadata: false }), tipo: 'application/pdf' }],
        mensagem: (tinha.length ? 'Apagados: ' + tinha.join(', ') + '. ' : 'O documento nao declarava autor nem titulo. ') +
                  (xmpRemovido ? 'O bloco XMP tambem foi removido. ' : '') +
                  'Atencao: metadados nao sao o conteudo — o nome que aparece ESCRITO na pagina continua la. ' +
                  'Para apagar aquilo, use "Censurar PDF".'
    };
}

// Gerador de senha. Usa crypto.getRandomValues (aleatoriedade de verdade) e nao
// Math.random, que e' previsivel e nao serve para senha.
function gerarSenha(e) {
    const comprimento = Math.max(6, Math.min(64, parseInt(e.comprimento, 10) || 16));
    const quantidade = Math.max(1, Math.min(20, parseInt(e.quantidade, 10) || 5));

    let alfabeto = '';
    if (e.minusculas !== false) alfabeto += 'abcdefghijkmnopqrstuvwxyz';       // sem 'l', que parece 1
    if (e.maiusculas !== false) alfabeto += 'ABCDEFGHJKLMNPQRSTUVWXYZ';        // sem 'I' e 'O'
    if (e.numeros !== false) alfabeto += '23456789';                            // sem 0 e 1
    if (e.simbolos) alfabeto += '!@#$%&*+-=?';
    if (!alfabeto) throw new Error('Escolha pelo menos um tipo de caractere.');

    const aleatorio = (n) => {
        const fonte = (typeof crypto !== 'undefined' && crypto.getRandomValues)
            ? crypto.getRandomValues(new Uint32Array(n))
            : null;
        if (!fonte) throw new Error('Este navegador nao tem gerador aleatorio seguro.');
        return fonte;
    };

    const senhas = [];
    for (let k = 0; k < quantidade; k++) {
        const numeros = aleatorio(comprimento);
        let s = '';
        for (let i = 0; i < comprimento; i++) s += alfabeto[numeros[i] % alfabeto.length];
        senhas.push(s);
    }

    // Entropia: log2(alfabeto^comprimento). E' a conta honesta de "quao dificil e' adivinhar".
    const bits = Math.round(comprimento * Math.log2(alfabeto.length));
    const forca = bits >= 100 ? 'muito forte' : bits >= 75 ? 'forte' : bits >= 55 ? 'razoavel' : 'fraca';
    return {
        senhas: senhas,
        arquivos: [],
        mensagem: quantidade + ' senha(s) de ' + comprimento + ' caracteres — cerca de ' + bits +
                  ' bits de entropia (' + forca + '). Nada disso foi gravado nem enviado a lugar algum.'
    };
}

// ===========================================================================
// VER E VERIFICAR
// ===========================================================================

async function comparar(e, prog) {
    const a = listaDe(e.arquivo)[0];
    const b = listaDe(e.arquivo2)[0];
    if (!a || !b) throw new Error('Escolha os DOIS PDFs a comparar.');

    if (prog) prog(10, 'Lendo o primeiro arquivo');
    const textoA = await textoDoPdf(a);
    if (prog) prog(50, 'Lendo o segundo arquivo');
    const textoB = await textoDoPdf(b);

    const totalPaginas = Math.max(textoA.length, textoB.length);
    const linhas = [];
    let iguais = 0, diferentes = 0;

    for (let i = 0; i < totalPaginas; i++) {
        const pa = (textoA[i] || '').replace(/\s+/g, ' ').trim();
        const pb = (textoB[i] || '').replace(/\s+/g, ' ').trim();
        if (pa === pb) {
            iguais++;
            linhas.push({ pagina: i + 1, estado: 'igual', diferencas: [] });
        } else {
            diferentes++;
            linhas.push({ pagina: i + 1, estado: (i >= textoA.length ? 'so-no-segundo' : i >= textoB.length ? 'so-no-primeiro' : 'diferente'),
                          diferencas: diferencasDePalavras(pa, pb) });
        }
    }

    if (prog) prog(88, 'Montando o relatorio');
    const html = relatorioComparacao(a.nome, b.nome, linhas, iguais, diferentes);
    return {
        arquivos: [{ nome: 'comparacao.html', bytes: textoParaBytes(html), tipo: 'text/html' }],
        relatorio: { linhas: linhas, iguais: iguais, diferentes: diferentes, paginasA: textoA.length, paginasB: textoB.length },
        mensagem: diferentes === 0
            ? 'Os dois PDFs tem o mesmo texto em todas as ' + iguais + ' pagina(s).'
            : diferentes + ' pagina(s) com diferenca, ' + iguais + ' igual(is). O relatorio mostra o que mudou.'
    };
}

// Diferenca por palavra, com a subsequencia comum mais longa (LCS). Para um texto de
// pagina isso e' barato e mostra o que um "igual/diferente" nao mostra: QUAL palavra
// mudou. Textos muito longos entram truncados para nao travar a aba.
function diferencasDePalavras(a, b) {
    const LIMITE = 2500;
    const pa = a.split(' ').filter(Boolean).slice(0, LIMITE);
    const pb = b.split(' ').filter(Boolean).slice(0, LIMITE);

    const n = pa.length, m = pb.length;
    const tabela = [];
    for (let i = 0; i <= n; i++) tabela.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            tabela[i][j] = pa[i] === pb[j] ? tabela[i + 1][j + 1] + 1
                                           : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
        }
    }

    const saida = [];
    let i = 0, j = 0;
    const empurrar = (tipo, palavra) => {
        const ultimo = saida[saida.length - 1];
        if (ultimo && ultimo.tipo === tipo) ultimo.texto += ' ' + palavra;
        else saida.push({ tipo: tipo, texto: palavra });
    };
    while (i < n && j < m) {
        if (pa[i] === pb[j]) { empurrar('igual', pa[i]); i++; j++; }
        else if (tabela[i + 1][j] >= tabela[i][j + 1]) { empurrar('saiu', pa[i]); i++; }
        else { empurrar('entrou', pb[j]); j++; }
    }
    while (i < n) empurrar('saiu', pa[i++]);
    while (j < m) empurrar('entrou', pb[j++]);
    return saida;
}

function relatorioComparacao(nomeA, nomeB, linhas, iguais, diferentes) {
    const corpo = linhas.map(l => {
        if (l.estado === 'igual') {
            return '<section class="pag igual"><h2>Pagina ' + l.pagina + ' <span class="selo ok">sem alteracao</span></h2></section>';
        }
        const rotulos = { 'so-no-primeiro': 'existe so no primeiro arquivo',
                          'so-no-segundo': 'existe so no segundo arquivo',
                          'diferente': 'texto diferente' };
        const trecho = l.diferencas.map(d =>
            d.tipo === 'igual' ? '<span>' + escXml(d.texto) + '</span>'
            : d.tipo === 'saiu' ? '<del>' + escXml(d.texto) + '</del>'
            : '<ins>' + escXml(d.texto) + '</ins>'
        ).join(' ');
        return '<section class="pag"><h2>Pagina ' + l.pagina + ' <span class="selo dif">' +
               rotulos[l.estado] + '</span></h2><p class="diff">' + (trecho || '<em>(pagina sem texto)</em>') + '</p></section>';
    }).join('\n');

    return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Comparacao de PDFs</title><style>' +
        'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:52em;margin:2em auto;padding:0 1em;color:#1a202c;line-height:1.6}' +
        'h1{font-size:1.5em}.resumo{background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:1em 0}' +
        '.arq{font-family:ui-monospace,monospace;font-size:.9em;color:#2c5282}' +
        '.pag{border-top:1px solid #e2e8f0;padding-top:.8em;margin-top:1.2em}' +
        '.pag h2{font-size:1em;color:#2d3748}.pag.igual h2{color:#718096;font-weight:500}' +
        '.selo{font-size:.72em;padding:2px 7px;border-radius:4px;vertical-align:middle;margin-left:6px}' +
        '.selo.ok{background:#c6f6d5;color:#22543d}.selo.dif{background:#fed7d7;color:#742a2a}' +
        '.diff{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}' +
        'del{background:#fed7d7;color:#742a2a;text-decoration:line-through}' +
        'ins{background:#c6f6d5;color:#22543d;text-decoration:none}' +
        'footer{margin-top:2.5em;font-size:.8em;color:#718096}' +
        '</style></head><body>' +
        '<h1>Comparacao de PDFs</h1><div class="resumo">' +
        '<div>Primeiro: <span class="arq">' + escXml(nomeA) + '</span> — <del>vermelho</del> e o que saiu dele.</div>' +
        '<div>Segundo: <span class="arq">' + escXml(nomeB) + '</span> — <ins>verde</ins> e o que entrou nele.</div>' +
        '<div style="margin-top:8px"><strong>' + diferentes + '</strong> pagina(s) com diferenca, <strong>' +
        iguais + '</strong> igual(is).</div></div>' + corpo +
        '<footer>Comparacao pelo TEXTO das paginas. Mudanca somente visual (cor, posicao, imagem) nao aparece aqui. ' +
        'Gerado no proprio navegador pelas Ferramentas PDF do SisProf.</footer></body></html>\n';
}

async function preferenciasVisualizador(e, prog) {
    const PDFLib = await libPdfLib();
    const { PDFName } = PDFLib;
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo, { updateMetadata: false });
    const prefs = doc.catalog.getOrCreateViewerPreferences();

    prefs.setDisplayDocTitle(e.mostrarTitulo !== false);
    prefs.setHideToolbar(!!e.esconderBarra);
    prefs.setHideMenubar(!!e.esconderMenu);
    prefs.setFitWindow(!!e.ajustarJanela);
    prefs.setCenterWindow(!!e.centralizarJanela);
    if (e.impressao === 'nenhuma') prefs.setPrintScaling(PDFLib.PrintScaling.None);
    else if (e.impressao === 'aplicativo') prefs.setPrintScaling(PDFLib.PrintScaling.AppDefault);
    if (e.duplex === 'simples') prefs.setDuplex(PDFLib.Duplex.Simplex);
    else if (e.duplex === 'borda-longa') prefs.setDuplex(PDFLib.Duplex.DuplexFlipLongEdge);
    else if (e.duplex === 'borda-curta') prefs.setDuplex(PDFLib.Duplex.DuplexFlipShortEdge);

    // Modo e disposicao de abertura ficam no catalogo, nao nas preferencias.
    const modos = { paginas: 'UseNone', miniaturas: 'UseThumbs', sumario: 'UseOutlines', anexos: 'UseAttachments', tela: 'FullScreen' };
    if (modos[e.modoAbertura]) doc.catalog.set(PDFName.of('PageMode'), PDFName.of(modos[e.modoAbertura]));
    const disposicoes = { unica: 'SinglePage', continua: 'OneColumn', duas: 'TwoColumnLeft', livro: 'TwoPageLeft' };
    if (disposicoes[e.disposicao]) doc.catalog.set(PDFName.of('PageLayout'), PDFName.of(disposicoes[e.disposicao]));

    if (String(e.titulo || '').trim()) doc.setTitle(String(e.titulo).trim());
    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(92, 'Gravando');

    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_preferencias.pdf', bytes: await doc.save({ updateMetadata: false }), tipo: 'application/pdf' }],
        mensagem: 'Preferencias gravadas. Sao um PEDIDO ao leitor de PDF: o Acrobat obedece quase tudo, ' +
                  'o visualizador do navegador obedece pouco.'
    };
}

// ===========================================================================
// IMAGENS E EXTRAS
// ===========================================================================

async function converterImagens(e, prog) {
    if (!ehNavegador) throw new Error('Converter imagens exige o navegador.');
    const imagens = listaDe(e.imagens);
    if (!imagens.length) throw new Error('Escolha as imagens.');
    const destino = e.destino || 'jpg';
    const tipo = destino === 'png' ? 'image/png' : destino === 'webp' ? 'image/webp' : 'image/jpeg';
    const qualidade = Math.max(0.3, Math.min(1, Number(e.qualidade == null ? 0.9 : e.qualidade)));
    const larguraMax = Math.max(0, parseInt(e.larguraMax, 10) || 0);

    const saidas = [];
    for (let i = 0; i < imagens.length; i++) {
        if (prog) prog(Math.round(i / imagens.length * 95), 'Convertendo ' + imagens[i].nome);
        const arquivo = imagens[i];
        const nome = String(arquivo.nome || '').toLowerCase();
        let blob = new Blob([bytesDe(arquivo)]);

        // HEIC/HEIF (foto do iPhone): nenhum navegador abre isso no <img>.
        if (/\.hei[cf]$/.test(nome)) {
            const heic2any = await libHeic();
            blob = await heic2any({ blob: blob, toType: destino === 'png' ? 'image/png' : 'image/jpeg', quality: qualidade });
            if (Array.isArray(blob)) blob = blob[0];
        }

        const url = URL.createObjectURL(blob);
        try {
            const img = await new Promise((ok, falha) => {
                const i2 = new Image();
                i2.onload = () => ok(i2);
                i2.onerror = () => falha(new Error('Nao consegui abrir "' + arquivo.nome + '" neste navegador.'));
                i2.src = url;
            });
            let L = img.naturalWidth, A = img.naturalHeight;
            if (larguraMax && L > larguraMax) { A = Math.round(A * larguraMax / L); L = larguraMax; }
            const canvas = document.createElement('canvas');
            canvas.width = L; canvas.height = A;
            const ctx = canvas.getContext('2d');
            if (destino === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, L, A); }
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, L, A);
            const saida = await canvasParaBlob(canvas, tipo, destino === 'png' ? undefined : qualidade);
            saidas.push({ nome: semExtensao(arquivo.nome) + '.' + destino, blob: saida, tipo: tipo });
            canvas.width = canvas.height = 0;
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    return { arquivos: saidas, mensagem: saidas.length + ' imagem(ns) convertida(s) para ' + destino.toUpperCase() + '.' };
}

async function qrCode(e, prog) {
    const texto = String(e.texto || '').trim();
    if (!texto) throw new Error('Escreva o que vai dentro do codigo (um endereco, um texto, um contato...).');
    const gerador = await libQr();

    // Nivel 0 = escolhe sozinho o menor tamanho que couber. 'M' corrige ~15% de sujeira:
    // e' o equilibrio certo para codigo impresso em papel de escola.
    const correcao = ({ baixa: 'L', media: 'M', alta: 'Q', maxima: 'H' })[e.correcao] || 'M';
    let qr;
    try {
        qr = gerador(0, correcao);
        qr.addData(texto);
        qr.make();
    } catch (erro) {
        throw new Error('O texto e longo demais para um codigo QR (' + texto.length + ' caracteres). ' +
                        'Use um endereco curto ou baixe a correcao de erro.');
    }

    const modulos = qr.getModuleCount();
    const escala = Math.max(2, Math.min(40, parseInt(e.escala, 10) || 8));
    const borda = Math.max(0, parseInt(e.borda == null ? 4 : e.borda, 10));   // "zona calma": o leitor precisa dela
    const lado = (modulos + borda * 2) * escala;

    if (!ehNavegador) throw new Error('Gerar o codigo QR exige o navegador.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = lado;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = e.corFundo || '#ffffff';
    ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = e.corFrente || '#000000';
    for (let linha = 0; linha < modulos; linha++) {
        for (let coluna = 0; coluna < modulos; coluna++) {
            if (qr.isDark(linha, coluna)) {
                ctx.fillRect((coluna + borda) * escala, (linha + borda) * escala, escala, escala);
            }
        }
    }
    if (prog) prog(70, 'Gravando');

    const blobPng = await canvasParaBlob(canvas, 'image/png');
    const arquivos = [{ nome: 'qrcode.png', blob: blobPng, tipo: 'image/png' }];

    if (e.tambemPdf) {
        const resultado = await imagensParaPdf({
            imagens: [{ nome: 'qrcode.png', bytes: await blobParaBytes(blobPng) }],
            tamanho: 'A4', orientacao: 'retrato', margem: 120, nomeSaida: 'qrcode'
        });
        resultado.arquivos.forEach(a => arquivos.push(a));
    }

    return {
        arquivos: arquivos,
        mensagem: 'Codigo QR de ' + modulos + '×' + modulos + ' modulos, correcao ' + correcao +
                  '. Teste com a camera do celular antes de imprimir.'
    };
}

// ===========================================================================
// FORMULARIOS E ASSINATURA
// ===========================================================================

// Le os campos de um formulario PDF para a tela poder montar um campo de digitacao
// para cada um. Sem isto, "Preencher PDF" seria adivinhacao.
async function lerCamposFormulario(arquivo) {
    const doc = await abrirPdf(arquivo);
    let form;
    try { form = doc.getForm(); } catch (_) { return []; }

    return form.getFields().map(campo => {
        const construtor = campo.constructor && campo.constructor.name || '';
        const base = { nome: campo.getName(), somenteLeitura: !!(campo.isReadOnly && campo.isReadOnly()) };
        try {
            if (/CheckBox/.test(construtor)) {
                return Object.assign(base, { tipo: 'marcacao', valor: campo.isChecked() });
            }
            if (/RadioGroup/.test(construtor)) {
                return Object.assign(base, { tipo: 'escolha', valor: campo.getSelected() || '', opcoes: campo.getOptions() });
            }
            if (/Dropdown/.test(construtor)) {
                return Object.assign(base, { tipo: 'lista', valor: (campo.getSelected() || [])[0] || '', opcoes: campo.getOptions() });
            }
            if (/OptionList/.test(construtor)) {
                return Object.assign(base, { tipo: 'lista', valor: (campo.getSelected() || [])[0] || '', opcoes: campo.getOptions() });
            }
            if (/Button/.test(construtor)) {
                return Object.assign(base, { tipo: 'botao', valor: '' });
            }
            return Object.assign(base, {
                tipo: 'texto',
                valor: campo.getText() || '',
                multilinha: !!(campo.isMultiline && campo.isMultiline())
            });
        } catch (_) {
            return Object.assign(base, { tipo: 'texto', valor: '' });
        }
    });
}

async function preencher(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    let form;
    try { form = doc.getForm(); } catch (_) { form = null; }
    const campos = form ? form.getFields() : [];
    if (!campos.length) {
        throw new Error('Este PDF nao tem campos de formulario. Para escrever sobre ele, use "Anotar PDF" ' +
                        '(ou "Criar formulario" num editor, antes).');
    }

    const valores = (typeof e.valores === 'string') ? JSON.parse(e.valores || '{}') : (e.valores || {});
    let preenchidos = 0;
    const problemas = [];

    campos.forEach(campo => {
        const nome = campo.getName();
        if (!(nome in valores)) return;
        const valor = valores[nome];
        const construtor = campo.constructor && campo.constructor.name || '';
        try {
            if (/CheckBox/.test(construtor)) {
                if (valor === true || valor === 'true' || valor === 'on' || valor === '1') campo.check();
                else campo.uncheck();
            } else if (/RadioGroup/.test(construtor)) {
                if (String(valor)) campo.select(String(valor));
            } else if (/Dropdown|OptionList/.test(construtor)) {
                if (String(valor)) campo.select(String(valor));
            } else if (/Button/.test(construtor)) {
                return;                            // botao nao recebe valor
            } else {
                campo.setText(limparParaWinAnsi(valor == null ? '' : String(valor)));
            }
            preenchidos++;
        } catch (erro) {
            problemas.push(nome + ' (' + (erro.message || erro) + ')');
        }
    });

    if (e.achatar) {
        // Achatado, o valor passa a fazer parte da pagina: ninguem reabre e muda a nota.
        try { form.flatten(); } catch (erro) { problemas.push('nao consegui achatar (' + (erro.message || erro) + ')'); }
    } else {
        // Sem achatar, o leitor de PDF precisa redesenhar os campos para o texto aparecer.
        try { form.updateFieldAppearances(await fonteHelvetica(doc, false)); } catch (_) { /* segue */ }
    }

    doc.setProducer('SisProf — Ferramentas PDF');
    if (prog) prog(92, 'Gravando');
    return {
        arquivos: [{
            nome: semExtensao(arquivo.nome) + (e.achatar ? '_preenchido-final.pdf' : '_preenchido.pdf'),
            bytes: await doc.save(), tipo: 'application/pdf'
        }],
        mensagem: preenchidos + ' de ' + campos.length + ' campo(s) preenchidos' +
                  (e.achatar ? ', e o formulario foi achatado (nao da mais para editar).' : '.') +
                  (problemas.length ? ' Nao deu em: ' + problemas.join('; ') + '.' : '')
    };
}

async function assinar(e, prog) {
    const arquivo = listaDe(e.arquivo)[0];
    const doc = await abrirPdf(arquivo);
    const total = doc.getPageCount();

    const desenho = e.assinaturaBytes ? bytesDe({ bytes: e.assinaturaBytes }) : (listaDe(e.imagem)[0] ? bytesDe(listaDe(e.imagem)[0]) : null);
    if (!desenho) throw new Error('Desenhe a assinatura no quadro ou escolha uma imagem dela (PNG com fundo transparente fica melhor).');

    const img = await embutirImagem(doc, await (async () => {
        // Imagem que nao seja PNG/JPG (um WEBP colado, por exemplo) passa pelo conversor.
        try { return await imagemParaPngOuJpg({ nome: 'assinatura.png', bytes: desenho }); } catch (_) { return desenho; }
    })());

    const indices = e.todasAsPaginas ? Array.from({ length: total }, (_, i) => i)
                                     : faixaParaIndices(e.paginas || String(total), total);
    const larguraPedida = Math.max(20, Number(e.largura) || 170);
    const fator = larguraPedida / img.width;
    const l = larguraPedida, a = img.height * fator;

    const fonte = await fonteHelvetica(doc, false);
    const cor = await corPdf(e.corTexto || '#2d3748');
    const linhas = [];
    if (String(e.nome || '').trim()) linhas.push(String(e.nome).trim());
    if (String(e.cargo || '').trim()) linhas.push(String(e.cargo).trim());
    if (e.comData !== false) {
        linhas.push('Assinado em ' + new Date().toLocaleDateString('pt-BR') +
                    (e.comHora ? ' as ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''));
    }
    const tamanhoTexto = Math.max(6, Number(e.tamanhoTexto) || 8);
    const alturaTexto = linhas.length ? (linhas.length * tamanhoTexto * 1.3 + 4) : 0;

    indices.forEach((indice, k) => {
        if (prog) prog(Math.round(k / indices.length * 92), 'Assinando a pagina ' + (indice + 1));
        const pagina = doc.getPage(indice);
        const { width: L, height: A } = pagina.getSize();
        let x, y;
        if (e.x != null && e.y != null && !e.todasAsPaginas) {
            x = Number(e.x); y = Number(e.y);
        } else {
            const pos = posicaoNaPagina(e.posicao || 'rodape-direita', L, A, l, a + alturaTexto, Number(e.margem) || 36);
            x = pos[0]; y = pos[1] + alturaTexto;
        }
        pagina.drawImage(img, { x: x, y: y, width: l, height: a, opacity: e.opacidade == null ? 1 : Number(e.opacidade) });

        if (e.linhaDeApoio) {
            pagina.drawLine({ start: { x: x, y: y - 2 }, end: { x: x + l, y: y - 2 }, thickness: 0.7, color: cor });
        }
        linhas.forEach((linha, i) => {
            const texto = limparParaWinAnsi(linha);
            const largura = fonte.widthOfTextAtSize(texto, tamanhoTexto);
            pagina.drawText(texto, {
                x: x + (l - largura) / 2, y: y - 6 - (i + 1) * tamanhoTexto * 1.3,
                size: tamanhoTexto, font: fonte, color: cor
            });
        });
    });

    doc.setProducer('SisProf — Ferramentas PDF');
    return {
        arquivos: [{ nome: semExtensao(arquivo.nome) + '_assinado.pdf', bytes: await doc.save(), tipo: 'application/pdf' }],
        mensagem: 'Assinatura aplicada em ' + indices.length + ' pagina(s). ' +
                  'ATENCAO, e importante: isto e uma assinatura DESENHADA (imagem), como assinar papel e ' +
                  'digitalizar. NAO e assinatura digital com certificado ICP-Brasil — para documento que exija ' +
                  'validade juridica (ata, ficha oficial), use o gov.br/assinaturaeletronica.'
    };
}

// ===========================================================================
// O que a tela chama
// ===========================================================================

const ops = {
    // Organizar
    juntar: juntar,
    dividir: dividir,
    reorganizar: reorganizar,
    removerPaginas: removerPaginas,
    extrairPaginas: extrairPaginas,
    rotacionar: rotacionar,
    paginasPorFolha: paginasPorFolha,
    cortarAoMeio: cortarAoMeio,
    marcadores: marcadores,
    extrairImagens: extrairImagens,
    // Editar
    marcaDagua: marcaDagua,
    numerosPagina: numerosPagina,
    sobrepor: sobrepor,
    cortar: cortar,
    tamanhoPagina: tamanhoPagina,
    infoDocumento: infoDocumento,
    anotar: anotar,
    preencher: preencher,
    assinar: assinar,
    // Converter para PDF
    imagensParaPdf: imagensParaPdf,
    wordParaPdf: wordParaPdf,
    planilhaParaPdf: planilhaParaPdf,
    textoParaPdf: textoParaPdf,
    htmlParaPdf: htmlParaPdf,
    criarPdf: criarPdf,
    // Converter de PDF
    pdfParaImagens: pdfParaImagens,
    pdfParaTexto: pdfParaTexto,
    pdfParaWord: pdfParaWord,
    pdfParaPlanilha: pdfParaPlanilha,
    pdfParaHtml: pdfParaHtml,
    // Otimizar e reparar
    comprimir: comprimir,
    otimizarWeb: otimizarWeb,
    ocr: ocr,
    reparar: reparar,
    rasterizar: rasterizar,
    achatar: achatar,
    paraPdfA: paraPdfA,
    // Seguranca e privacidade
    proteger: proteger,
    desbloquear: desbloquear,
    censurar: censurar,
    removerMetadados: removerMetadados,
    gerarSenha: gerarSenha,
    // Ver e verificar
    comparar: comparar,
    preferenciasVisualizador: preferenciasVisualizador,
    // Imagens e extras
    converterImagens: converterImagens,
    qrCode: qrCode
};

const PDFOPS = {
    ops: ops,
    util: util,
    lib: {
        pdfLib: libPdfLib, pdfJs: libPdfJs, jsPdf: libJsPdf, jsZip: libJsZip,
        tesseract: libTesseract, xlsx: libXlsx, heic: libHeic, qr: libQr,
        // Usado por testes/teste-pdf.js: fora do navegador nao existe <script>, entao
        // o teste entrega o pdf-lib ja' carregado e exercita as contas de verdade.
        registrarPdfLib: (mod) => { _pdflib = mod; }
    },
    // Leituras que a tela faz ANTES de executar (para montar o formulario certo).
    inspecionar: {
        infoDocumento: lerInfoDocumento,
        camposFormulario: lerCamposFormulario
    },
    formatarTamanho: formatarTamanho,
    montarPdfDeBlocos: montarPdfDeBlocos,
    rasterizarParaPdf: rasterizarParaPdf
};

if (typeof window !== 'undefined') window.PDFOPS = PDFOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = PDFOPS;

})();
