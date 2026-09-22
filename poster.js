// poster.js — A ABA "POSTER": a tela que transforma uma imagem em parede.
//
// POR QUE ISTO EXISTE
//   Ver o cabecalho de poster_operacoes.js. Em uma linha: a escola tem impressora A4 e
//   parede vazia, e o caminho conhecido para juntar as duas coisas cobra o upload da
//   imagem — que muitas vezes e' a foto da turma.
//
// COMO A TELA E' FEITA
//   As contas todas moram em poster_operacoes.js (ladrilhamento e reticulado), que roda
//   sem navegador e por isso pode ser testado com numero. Aqui ficam tres coisas que so'
//   existem na tela:
//
//   1. A PREVIA. Um <canvas> desenha o cartaz inteiro como ele vai sair, com a grade das
//      folhas por cima. E' a parte mais importante da aba: "quantos pontos" e "que
//      tamanho de ponto" sao perguntas que ninguem responde no abstrato — se responde
//      olhando. E olhar aqui custa nada; olhar depois custa trinta folhas.
//
//   2. A MONTAGEM DO PDF, com pdf-lib (a mesma biblioteca da aba de PDF, ja' baixada sob
//      demanda por pdf_operacoes.js).
//
//   3. As marcas de corte e o nome de cada folha ("L2-C3"), que e' o que salva quem
//      espalhou dezesseis folhas no chao da sala dos professores.

(function () {
'use strict';

const POSTER_MAX_MB = 40;

let posImagem = null;        // { nome, tipo, tamanho, largura, altura, url, bitmap, dados }
let posResultado = null;     // { blob, url, folhas, segundos }
let posOcupado = false;
let posDesistiu = false;
let posErro = '';
let posAviso = '';
let posUrls = [];
let posProgresso = { fracao: 0, texto: '' };
let posPlano = null;         // ultimo plano calculado (para a previa e os avisos)
let posReticulado = null;

const posOpcoes = {
    papel: 'A4',
    orientacao: 'retrato',
    margemCm: 1,
    sobreposicaoCm: 0,
    modo: 'folhas',          // 'folhas' | 'tamanho'
    folhas: 2,
    medida: 60,              // cm, no modo 'tamanho'
    unidade: 'cm',
    eixo: 'largura',
    estilo: 'pontos',        // 'pontos' | 'foto'
    passo: 10,               // distancia entre pontos, em pt
    tamanhoPonto: 1,
    cor: 'preto',            // 'preto' | 'original' | 'fixa'
    corFixa: '#1a365d',
    contraste: 1,
    invertido: false,
    marcasDeCorte: true,
    numerarFolhas: true
};

function escPos(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function posTamanho(bytes) {
    return (window.AMPLIAROPS && AMPLIAROPS.formatarTamanho)
        ? AMPLIAROPS.formatarTamanho(bytes)
        : Math.round((bytes || 0) / 1024) + ' KB';
}

function posUrlDe(b) { const u = URL.createObjectURL(b); posUrls.push(u); return u; }
function posLimparUrls() {
    posUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) { /* ja' foi */ } });
    posUrls = [];
}

// O portao premium, o mesmo das outras duas abas.
function posPodeUsar() {
    if (typeof exigirPremium !== 'function') {
        console.warn('[Poster] assinatura.js indisponivel — portao premium nao aplicado.');
        return true;
    }
    return exigirPremium('Ferramentas — Pôster');
}

function posEhPremium() { return (typeof ehPremium === 'function') ? ehPremium() : true; }

function posSeloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}

function corParaRgb(hex) {
    const n = parseInt(String(hex || '#000000').replace('#', ''), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// Abrir o arquivo
// ---------------------------------------------------------------------------

async function posEscolherArquivo(input) {
    const arquivo = input && input.files && input.files[0];
    if (arquivo) await posAbrir(arquivo);
    if (input) input.value = '';
}

async function posSoltar(ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.currentTarget) ev.currentTarget.classList.remove('pos-sobre');
    const arquivo = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (arquivo) await posAbrir(arquivo);
}

function posArrastando(ev, entrou) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.currentTarget) ev.currentTarget.classList.toggle('pos-sobre', !!entrou);
}

function posCarregarBitmap(src) {
    return new Promise((ok, falha) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => falha(new Error('imagem ilegivel'));
        im.src = src;
    });
}

async function posAbrir(arquivo) {
    posErro = ''; posAviso = ''; posResultado = null;

    if (!/^image\//.test(arquivo.type || '')) {
        posErro = 'Isto não parece uma imagem (' + escPos(arquivo.type || 'tipo desconhecido') + '). ' +
                  'Vale PNG, JPG, WebP, GIF ou BMP.';
        posRender(); return;
    }
    if (arquivo.size > POSTER_MAX_MB * 1024 * 1024) {
        posErro = 'A imagem tem ' + posTamanho(arquivo.size) + '. O limite aqui é ' + POSTER_MAX_MB + ' MB.';
        posRender(); return;
    }

    posLimparUrls();
    const url = posUrlDe(arquivo);
    try {
        const bitmap = await posCarregarBitmap(url);
        const largura = bitmap.naturalWidth || bitmap.width;
        const altura = bitmap.naturalHeight || bitmap.height;

        // A imagem e' lida UMA vez para bytes e fica guardada assim. O reticulado le a
        // imagem inteira a cada mexida num controle; reler do <canvas> toda vez deixaria
        // os controles pesados sem motivo.
        //
        // Acima de ~4 megapixels a leitura e' feita sobre uma copia reduzida: o cartaz
        // sai de MEDIAS de regioes, e a media de um pedaco nao muda por a foto ter 12 ou
        // 4 megapixels — so' o tempo de percorrer muda.
        const limite = 4e6;
        const fator = (largura * altura > limite) ? Math.sqrt(limite / (largura * altura)) : 1;
        const cL = Math.max(1, Math.round(largura * fator));
        const cA = Math.max(1, Math.round(altura * fator));
        const canvas = document.createElement('canvas');
        canvas.width = cL; canvas.height = cA;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, cL, cA);
        const dados = ctx.getImageData(0, 0, cL, cA);

        posImagem = {
            nome: arquivo.name || 'imagem',
            tipo: arquivo.type,
            tamanho: arquivo.size,
            largura: largura, altura: altura,
            url: url, bitmap: bitmap,
            dados: { largura: dados.width, altura: dados.height, dados: dados.data }
        };
    } catch (_) {
        posImagem = null;
        posErro = 'Não consegui abrir esta imagem. O arquivo pode estar corrompido, ou ser de um ' +
                  'formato que este navegador não lê (HEIC do iPhone, por exemplo).';
    }
    posRender();
}

function posTrocarImagem() {
    posLimparUrls();
    posImagem = null; posResultado = null; posErro = ''; posAviso = '';
    posPlano = null; posReticulado = null;
    posRender();
}

// ---------------------------------------------------------------------------
// O plano e a previa
// ---------------------------------------------------------------------------

function posCalcular() {
    if (!posImagem) { posPlano = null; posReticulado = null; return; }
    posPlano = POSTEROPS.planejarPoster({
        larguraOrigem: posImagem.largura,
        alturaOrigem: posImagem.altura,
        papel: posOpcoes.papel,
        orientacao: posOpcoes.orientacao,
        margem: posOpcoes.margemCm * POSTEROPS.PT_POR_CM,
        sobreposicao: posOpcoes.sobreposicaoCm * POSTEROPS.PT_POR_CM,
        modo: posOpcoes.modo,
        folhas: posOpcoes.folhas,
        medida: posOpcoes.medida,
        unidade: posOpcoes.unidade,
        eixo: posOpcoes.eixo
    });

    posReticulado = (posOpcoes.estilo === 'pontos')
        ? POSTEROPS.gerarPontos(posImagem.dados, posPlano, {
              passo: posOpcoes.passo,
              tamanhoPonto: posOpcoes.tamanhoPonto,
              cor: posOpcoes.cor,
              contraste: posOpcoes.contraste,
              invertido: posOpcoes.invertido
          })
        : null;
}

// A previa desenha o cartaz inteiro pequeno, com a grade das folhas por cima. Os pontos
// sao desenhados em ESCALA, nao redesenhados: o que se ve aqui e' o mesmo conjunto de
// pontos que vai para o PDF, so' que encolhido.
function posDesenharPrevia() {
    const canvas = document.getElementById('posPrevia');
    if (!canvas || !posPlano) return;

    const larguraMax = Math.max(220, Math.min(560, (canvas.parentElement || {}).clientWidth || 480));
    const escala = larguraMax / posPlano.posterLargura;
    const L = Math.round(posPlano.posterLargura * escala);
    const A = Math.round(posPlano.posterAltura * escala);
    canvas.width = L; canvas.height = A;
    canvas.style.width = L + 'px';
    canvas.style.height = A + 'px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, L, A);

    if (posOpcoes.estilo === 'foto') {
        ctx.drawImage(posImagem.bitmap, 0, 0, L, A);
    } else if (posReticulado) {
        const fixa = corParaRgb(posOpcoes.corFixa);
        ctx.fillStyle = posOpcoes.cor === 'fixa' ? posOpcoes.corFixa : '#000000';
        for (let i = 0; i < posReticulado.pontos.length; i++) {
            const p = posReticulado.pontos[i];
            const r = p.raio * escala;
            if (r < 0.12) continue;
            if (posOpcoes.cor === 'original' && p.cor) {
                ctx.fillStyle = 'rgb(' + p.cor[0] + ',' + p.cor[1] + ',' + p.cor[2] + ')';
            }
            ctx.beginPath();
            ctx.arc(p.x * escala, p.y * escala, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // A grade das folhas por cima — e' ela que responde "quantas folhas mesmo?".
    ctx.strokeStyle = 'rgba(49, 130, 206, 0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    posPlano.folhas.forEach(f => {
        ctx.strokeRect(f.poster.x * escala, f.poster.y * escala,
                       f.poster.largura * escala, f.poster.altura * escala);
    });
    ctx.setLineDash([]);

    if (posOpcoes.numerarFolhas && posPlano.total <= 60) {
        ctx.fillStyle = 'rgba(49, 130, 206, 0.9)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textBaseline = 'top';
        posPlano.folhas.forEach(f => {
            ctx.fillText('L' + (f.linha + 1) + '-C' + (f.coluna + 1),
                         f.poster.x * escala + 3, f.poster.y * escala + 3);
        });
    }
}

// ---------------------------------------------------------------------------
// O PDF
// ---------------------------------------------------------------------------

async function posGerar() {
    if (posOcupado || !posImagem) return;
    if (!posPodeUsar()) return;

    posOcupado = true; posDesistiu = false; posErro = ''; posAviso = ''; posResultado = null;
    posProgresso = { fracao: 0, texto: 'Preparando...' };
    posRender();

    const comecou = Date.now();
    try {
        posCalcular();
        const plano = posPlano;

        posProgresso = { fracao: 0.04, texto: 'Carregando o motor de PDF...' };
        posDesenharProgresso();
        const PDFLib = await PDFOPS.lib.pdfLib();

        const doc = await PDFLib.PDFDocument.create();
        const fonte = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        doc.setTitle('Pôster — ' + posImagem.nome);
        doc.setProducer('SisProf — Ferramentas');

        for (let i = 0; i < plano.folhas.length; i++) {
            if (posDesistiu) throw erroCancelado();
            const folha = plano.folhas[i];
            const pagina = doc.addPage([plano.pagina.largura, plano.pagina.altura]);

            if (posOpcoes.estilo === 'pontos') {
                desenharPontosNaPagina(PDFLib, pagina, folha, plano);
            } else {
                await desenharFotoNaPagina(PDFLib, doc, pagina, folha, plano);
            }

            if (posOpcoes.marcasDeCorte) desenharMarcas(PDFLib, pagina, folha, plano);
            if (posOpcoes.numerarFolhas) desenharEtiqueta(PDFLib, pagina, fonte, folha, plano);

            posProgresso = {
                fracao: 0.08 + (i + 1) / plano.folhas.length * 0.86,
                texto: 'Montando a folha ' + (i + 1) + ' de ' + plano.folhas.length + '...'
            };
            posDesenharProgresso();
            // Devolve o controle ao navegador: sem isso a aba congela ate' a ultima folha.
            await new Promise(ok => setTimeout(ok, 0));
        }

        posProgresso = { fracao: 0.96, texto: 'Fechando o arquivo...' };
        posDesenharProgresso();
        const bytes = await doc.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        posResultado = {
            blob: blob,
            url: posUrlDe(blob),
            folhas: plano.folhas.length,
            colunas: plano.colunas,
            linhas: plano.linhas,
            larguraCm: plano.posterLarguraCm,
            alturaCm: plano.posterAlturaCm,
            segundos: (Date.now() - comecou) / 1000
        };
    } catch (erro) {
        if (posDesistiu || (erro && erro.cancelado)) {
            posAviso = 'Montagem cancelada. Nada foi alterado.';
        } else {
            console.error('[Poster]', erro);
            posErro = (erro && erro.message) ? erro.message : String(erro);
        }
    } finally {
        posOcupado = false;
        posDesistiu = false;
        posProgresso = { fracao: 0, texto: '' };
        posRender();
    }
}

function erroCancelado() { const e = new Error('cancelado'); e.cancelado = true; return e; }

function posCancelar() {
    if (!posOcupado) return;
    posDesistiu = true;
    posProgresso = { fracao: posProgresso.fracao, texto: 'Cancelando...' };
    posDesenharProgresso();
}

// Cada ponto e' um circulo de verdade (drawCircle). Isso custa: medido, cerca de 100
// microssegundos e 40 bytes por ponto — um cartaz de 40 folhas com os pontos bem juntos
// da' uns 39 segundos e 15 MB. Por isso os avisos de conferirPlano() existem.
//
// NAO troque isto pelo truque conhecido de desenhar ponto como traco de comprimento zero
// com ponta redonda ("1 J", largura 2r, "x y m x y l S"), que seria ~3x menor e mais
// rapido: ele foi tentado e MEDIDO aqui, e o pdf.js renderiza a pagina EM BRANCO. O
// mesmo teste com drawCircle deu a area exata esperada, entao o problema e' do truque,
// nao da medicao. Um cartaz que sai em branco no visualizador da escola e' um desastre
// bem maior do que um arquivo pesado.
function desenharPontosNaPagina(PDFLib, pagina, folha, plano) {
    const pontos = POSTEROPS.pontosDaFolha(posReticulado, folha, plano);
    const fixa = corParaRgb(posOpcoes.corFixa);
    const corPadrao = posOpcoes.cor === 'fixa'
        ? PDFLib.rgb(fixa[0] / 255, fixa[1] / 255, fixa[2] / 255)
        : PDFLib.rgb(0, 0, 0);

    for (let i = 0; i < pontos.length; i++) {
        const p = pontos[i];
        pagina.drawCircle({
            x: p.x, y: p.y, size: p.raio, borderWidth: 0,
            color: (posOpcoes.cor === 'original' && p.cor)
                ? PDFLib.rgb(p.cor[0] / 255, p.cor[1] / 255, p.cor[2] / 255)
                : corPadrao
        });
    }
}

// No modo foto, cada folha leva o SEU pedaco da imagem, recortado no tamanho de
// impressao. Recortar antes de embutir (em vez de embutir a foto inteira e deixar o PDF
// cortar) e' o que impede o arquivo de carregar a imagem toda uma vez por folha — num
// cartaz de 12 folhas isso seria a mesma foto 12 vezes dentro do PDF.
async function desenharFotoNaPagina(PDFLib, doc, pagina, folha, plano) {
    const alvoDpi = 150;
    const larguraPx = Math.max(1, Math.round(folha.destino.largura / 72 * alvoDpi));
    const alturaPx = Math.max(1, Math.round(folha.destino.altura / 72 * alvoDpi));

    const canvas = document.createElement('canvas');
    canvas.width = larguraPx; canvas.height = alturaPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, larguraPx, alturaPx);
    ctx.imageSmoothingQuality = 'high';
    const r = folha.recorte;
    ctx.drawImage(posImagem.bitmap, r.x, r.y, r.largura, r.altura, 0, 0, larguraPx, alturaPx);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const img = await doc.embedJpg(dataUrl);
    pagina.drawImage(img, {
        x: folha.destino.x, y: folha.destino.y,
        width: folha.destino.largura, height: folha.destino.altura
    });
    canvas.width = canvas.height = 1;
}

// As marcas de corte vao SO' nas bordas que nao encostam em outra folha. Marcar a borda
// que leva cola faria o professor cortar justamente a aba de sobreposicao.
function desenharMarcas(PDFLib, pagina, folha, plano) {
    const cinza = PDFLib.rgb(0.6, 0.65, 0.7);
    const d = folha.destino;
    const t = 12;   // tamanho do risco
    const risco = (x1, y1, x2, y2) => pagina.drawLine({
        start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: cinza
    });

    const esq = d.x, dir = d.x + d.largura;
    const baixo = d.y, cima = d.y + d.altura;

    // Cantos: dois riscos por canto, saindo para fora da area de desenho.
    risco(esq, cima, esq - t, cima); risco(esq, cima, esq, cima + t);
    risco(dir, cima, dir + t, cima); risco(dir, cima, dir, cima + t);
    risco(esq, baixo, esq - t, baixo); risco(esq, baixo, esq, baixo - t);
    risco(dir, baixo, dir + t, baixo); risco(dir, baixo, dir, baixo - t);

    // A borda que leva cola ganha uma linha inteira, tracejada: e' por ali que a folha
    // vizinha vem por cima.
    if (folha.colaDireita) {
        pagina.drawLine({ start: { x: dir, y: baixo }, end: { x: dir, y: cima },
                          thickness: 0.4, color: PDFLib.rgb(0.8, 0.84, 0.88), dashArray: [3, 3] });
    }
    if (folha.colaAbaixo) {
        pagina.drawLine({ start: { x: esq, y: baixo }, end: { x: dir, y: baixo },
                          thickness: 0.4, color: PDFLib.rgb(0.8, 0.84, 0.88), dashArray: [3, 3] });
    }
}

// A etiqueta. Dezesseis folhas iguais espalhadas no chao viram um quebra-cabeca sem isto.
function desenharEtiqueta(PDFLib, pagina, fonte, folha, plano) {
    const texto = 'L' + (folha.linha + 1) + '-C' + (folha.coluna + 1) +
                  '   (linha ' + (folha.linha + 1) + ' de ' + plano.linhas +
                  ', coluna ' + (folha.coluna + 1) + ' de ' + plano.colunas + ')';
    const tamanho = 7;
    const y = Math.max(4, folha.destino.y - 11);
    pagina.drawText(texto, {
        x: folha.destino.x, y: y, size: tamanho, font: fonte,
        color: PDFLib.rgb(0.55, 0.6, 0.65)
    });
}

// O nome com que o PDF chega na pasta de downloads. "documento(3).pdf" nao diz nada
// tres meses depois; "mapa-poster-3x2.pdf" diz o que e' e de que tamanho.
function posNomeDoArquivo() {
    const base = (posImagem && posImagem.nome || 'imagem').replace(/\.[^.]+$/, '');
    const r = posResultado;
    return base + '-poster-' + (r ? r.colunas + 'x' + r.linhas : '') + '.pdf';
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function posDefinir(chave, valor) {
    const numericos = ['margemCm', 'sobreposicaoCm', 'folhas', 'medida', 'passo', 'tamanhoPonto', 'contraste'];
    if (numericos.indexOf(chave) !== -1) valor = Number(valor);
    if (chave === 'invertido' || chave === 'marcasDeCorte' || chave === 'numerarFolhas') valor = !!valor;
    posOpcoes[chave] = valor;
    posResultado = null;
    posAviso = '';
    posRender();
}

// ---------------------------------------------------------------------------
// A TELA
// ---------------------------------------------------------------------------

function renderPoster() { posRender(); }

function posRender() {
    const area = document.getElementById('tabFerramentasPoster');
    if (!area) return;

    if (posImagem && !posOcupado) {
        try {
            posCalcular();
        } catch (erro) {
            posPlano = null; posReticulado = null;
            posErro = erro.message || String(erro);
        }
    }

    const premium = posEhPremium();
    area.innerHTML = `
        <style>
            .pos-solta { border:2px dashed #cbd5e0; border-radius:10px; padding:28px 18px; text-align:center;
                         background:#f7fafc; transition:all .15s; cursor:pointer; }
            .pos-solta.pos-sobre { border-color:#3182ce; background:#ebf8ff; }
            .pos-opcao { border:1px solid #e2e8f0; background:#fff; border-radius:8px; padding:7px 12px;
                         cursor:pointer; font-size:13px; color:#4a5568; transition:all .15s; }
            .pos-opcao:hover { border-color:#a0aec0; }
            .pos-opcao.pos-ativa { border-color:#3182ce; background:#ebf8ff; color:#2b6cb0; font-weight:bold; }
            .pos-rotulo { font-size:12px; font-weight:bold; color:#4a5568; text-transform:uppercase; letter-spacing:.03em; }
            .pos-ajuda { color:#718096; font-size:12px; margin-top:6px; line-height:1.5; }
            #posPrevia { border:1px solid #e2e8f0; border-radius:6px; background:#fff; max-width:100%; }
        </style>

        <div class="card" style="margin:20px 0;">
            <h2>🧱 Pôster ${posSeloPro()}</h2>
            <p style="color:#4a5568; font-size:14px; line-height:1.6; margin-bottom:6px;">
                Espalha uma imagem por várias folhas A4 para você imprimir, recortar e colar na parede —
                o mapa da aula de Geografia, a tabela periódica, a linha do tempo, o cartaz da feira.
                Sai em PDF, já com as marcas de corte e o nome de cada folha.
            </p>
            <div style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#22543d; line-height:1.6;">
                🔒 <strong>A imagem não sai deste aparelho.</strong> O corte e a montagem do PDF acontecem
                aqui, no navegador. É a diferença que importa: a foto da turma, com o rosto de trinta
                crianças, <strong>não pode</strong> ser enviada para um site de montar pôster —
                isso é entregar dado pessoal de criança a um terceiro que a escola não autorizou
                (ver <code>CONFORMIDADE-SEDUC.md</code>).
            </div>
            ${premium ? '' : `
                <div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#744210; line-height:1.6;">
                    ⭐ Esta ferramenta faz parte do <strong>plano Professor</strong>. Você pode ver tudo o que
                    existe aqui; para usar, é preciso assinar.
                    <div style="margin-top:8px;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalApoie({ destaque: 'professor' })">
                            Ver o plano Professor</button>
                    </div>
                </div>`}

            ${posErro ? `<div style="background:#fff5f5; border:1px solid #fc8181; color:#742a2a; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; line-height:1.6;">
                ⚠️ ${escPos(posErro)}</div>` : ''}
            ${posAviso ? `<div style="background:#ebf8ff; border:1px solid #90cdf4; color:#2c5282; border-radius:8px; padding:10px 14px; margin:12px 0; font-size:13px; line-height:1.6;">
                ${escPos(posAviso)}</div>` : ''}

            ${posImagem ? posHtmlComImagem() : posHtmlSemImagem()}
        </div>`;

    if (posImagem && posPlano) posDesenharPrevia();
}

function posHtmlSemImagem() {
    return `
        <div class="pos-solta" onclick="document.getElementById('posArquivo').click()"
             ondragover="posArrastando(event, true)" ondragleave="posArrastando(event, false)"
             ondrop="posSoltar(event)">
            <div style="font-size:38px; line-height:1;">🧱</div>
            <div style="font-weight:bold; color:#2d3748; margin-top:10px;">Escolha a imagem ou arraste ela para cá</div>
            <div style="color:#718096; font-size:12px; margin-top:6px;">
                PNG, JPG, WebP, GIF ou BMP — até ${POSTER_MAX_MB} MB
            </div>
        </div>
        <input type="file" id="posArquivo" accept="image/*" style="display:none;" onchange="posEscolherArquivo(this)">`;
}

function posHtmlComImagem() {
    const img = posImagem;
    const plano = posPlano;
    const avisos = (plano && window.POSTEROPS) ? POSTEROPS.conferirPlano(plano, posReticulado) : [];

    return `
        <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; background:#f7fafc;
                    border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin:12px 0;">
            <img src="${escPos(img.url)}" alt="" style="width:64px; height:64px; object-fit:contain; background:#fff; border:1px solid #e2e8f0; border-radius:6px;">
            <div style="flex:1; min-width:180px;">
                <div style="font-weight:bold; color:#2d3748; font-size:14px; word-break:break-all;">${escPos(img.nome)}</div>
                <div style="color:#718096; font-size:12px; margin-top:2px;">
                    ${img.largura} × ${img.altura} px · ${posTamanho(img.tamanho)}
                </div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="posTrocarImagem()" ${posOcupado ? 'disabled' : ''}>Trocar imagem</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px 22px; margin:18px 0;">
            ${posHtmlTamanho()}
            ${posHtmlPapel()}
            ${posHtmlEstilo()}
            ${posOpcoes.estilo === 'pontos' ? posHtmlPontos() : ''}
            ${posHtmlMontagem()}
        </div>

        ${plano ? `
            <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; margin:18px 0;">
                <div style="flex:1; min-width:240px;">
                    <div class="pos-rotulo" style="margin-bottom:6px;">Como vai ficar</div>
                    <canvas id="posPrevia"></canvas>
                    <div class="pos-ajuda">
                        A grade azul mostra onde cada folha começa e termina.
                        ${posOpcoes.estilo === 'pontos' ? 'De perto são bolinhas; de longe, a figura.' : ''}
                    </div>
                </div>
                <div style="flex:0 0 200px; min-width:180px;">
                    <div class="pos-rotulo" style="margin-bottom:6px;">A conta</div>
                    <div style="font-size:13px; color:#2d3748; line-height:1.9;">
                        <div><strong>${plano.total}</strong> folha${plano.total > 1 ? 's' : ''} de ${escPos(posOpcoes.papel)}</div>
                        <div style="color:#718096;">${plano.colunas} na largura × ${plano.linhas} na altura</div>
                        <div style="margin-top:6px;"><strong>${plano.posterLarguraCm.toFixed(0)} × ${plano.posterAlturaCm.toFixed(0)} cm</strong></div>
                        <div style="color:#718096;">≈ ${(plano.posterLarguraCm / 100).toFixed(2)} × ${(plano.posterAlturaCm / 100).toFixed(2)} m</div>
                        ${posReticulado ? `<div style="margin-top:6px; color:#718096;">
                            ${posReticulado.pontos.length.toLocaleString('pt-BR')} pontos<br>
                            ~${Math.round(posReticulado.coberturaMedia * 100)}% de tinta no papel</div>` : `
                            <div style="margin-top:6px; color:#718096;">${Math.round(plano.dpiEfetivo)} DPI na impressão</div>`}
                    </div>
                </div>
            </div>` : ''}

        ${avisos.map(a => `
            <div style="background:${a.grau === 'atencao' ? '#fffaf0' : '#ebf8ff'};
                        border:1px solid ${a.grau === 'atencao' ? '#fbd38d' : '#90cdf4'};
                        color:${a.grau === 'atencao' ? '#744210' : '#2c5282'};
                        border-radius:8px; padding:10px 14px; margin:8px 0; font-size:13px; line-height:1.6;">
                ${a.grau === 'atencao' ? '⚠️' : 'ℹ️'} ${escPos(a.texto)}
            </div>`).join('')}

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:14px;">
            <button class="btn btn-primary" onclick="posGerar()" ${posOcupado ? 'disabled' : ''}>
                ${posOcupado ? '⏳ Montando...' : '🧱 Montar o PDF'}
            </button>
            ${posOcupado ? '<button class="btn btn-secondary" onclick="posCancelar()">Cancelar</button>' : ''}
        </div>

        <div id="posProgresso" style="margin-top:14px;">${posHtmlProgresso()}</div>
        <div id="posResultado">${posHtmlResultado()}</div>`;
}

function posHtmlTamanho() {
    const porFolhas = posOpcoes.modo === 'folhas';
    return `
        <div>
            <div class="pos-rotulo">Tamanho do pôster</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                <button class="pos-opcao ${porFolhas ? 'pos-ativa' : ''}" ${posOcupado ? 'disabled' : ''}
                        onclick="posDefinir('modo', 'folhas')">Por folhas</button>
                <button class="pos-opcao ${porFolhas ? '' : 'pos-ativa'}" ${posOcupado ? 'disabled' : ''}
                        onclick="posDefinir('modo', 'tamanho')">Por centímetros</button>
            </div>
            <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                ${porFolhas ? `
                    <input type="number" min="1" max="20" step="1" value="${posOpcoes.folhas}" ${posOcupado ? 'disabled' : ''}
                           style="width:72px; padding:6px;" onchange="posDefinir('folhas', this.value)">
                    <span style="font-size:13px; color:#4a5568;">folha(s) na</span>` : `
                    <input type="number" min="5" max="1000" step="1" value="${posOpcoes.medida}" ${posOcupado ? 'disabled' : ''}
                           style="width:82px; padding:6px;" onchange="posDefinir('medida', this.value)">
                    <span style="font-size:13px; color:#4a5568;">cm de</span>`}
                <select ${posOcupado ? 'disabled' : ''} style="padding:6px;" onchange="posDefinir('eixo', this.value)">
                    <option value="largura" ${posOpcoes.eixo === 'largura' ? 'selected' : ''}>largura</option>
                    <option value="altura" ${posOpcoes.eixo === 'altura' ? 'selected' : ''}>altura</option>
                </select>
            </div>
            <div class="pos-ajuda">O outro lado sai da proporção da imagem — o pôster não distorce.</div>
        </div>`;
}

function posHtmlPapel() {
    return `
        <div>
            <div class="pos-rotulo">Papel</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                ${['A4', 'Carta', 'A3', 'Oficio'].map(p => `
                    <button class="pos-opcao ${posOpcoes.papel === p ? 'pos-ativa' : ''}" ${posOcupado ? 'disabled' : ''}
                            onclick="posDefinir('papel', '${p}')">${p === 'Oficio' ? 'Ofício' : p}</button>`).join('')}
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                ${[['retrato', 'Em pé'], ['paisagem', 'Deitado']].map(([v, t]) => `
                    <button class="pos-opcao ${posOpcoes.orientacao === v ? 'pos-ativa' : ''}" ${posOcupado ? 'disabled' : ''}
                            onclick="posDefinir('orientacao', '${v}')">${t}</button>`).join('')}
            </div>
            <div style="margin-top:8px; font-size:12px; color:#4a5568;">
                <label style="display:block; margin-bottom:4px;">
                    Margem da folha: <strong>${posOpcoes.margemCm.toFixed(1)} cm</strong>
                    <input type="range" min="0" max="3" step="0.1" value="${posOpcoes.margemCm}" ${posOcupado ? 'disabled' : ''}
                           style="width:100%;" onchange="posDefinir('margemCm', this.value)">
                </label>
                <label style="display:block;">
                    Sobreposição para colar: <strong>${posOpcoes.sobreposicaoCm.toFixed(1)} cm</strong>
                    <input type="range" min="0" max="3" step="0.1" value="${posOpcoes.sobreposicaoCm}" ${posOcupado ? 'disabled' : ''}
                           style="width:100%;" onchange="posDefinir('sobreposicaoCm', this.value)">
                </label>
            </div>
            <div class="pos-ajuda">
                A margem é a borda que a impressora não alcança. A sobreposição é o quanto
                as folhas vizinhas repetem — com ela dá para sobrepor e colar sem fresta branca.
            </div>
        </div>`;
}

function posHtmlEstilo() {
    return `
        <div>
            <div class="pos-rotulo">Estilo</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                <button class="pos-opcao ${posOpcoes.estilo === 'pontos' ? 'pos-ativa' : ''}" ${posOcupado ? 'disabled' : ''}
                        onclick="posDefinir('estilo', 'pontos')">⚫ Pontos</button>
                <button class="pos-opcao ${posOpcoes.estilo === 'foto' ? 'pos-ativa' : ''}" ${posOcupado ? 'disabled' : ''}
                        onclick="posDefinir('estilo', 'foto')">🖼️ Foto</button>
            </div>
            <div class="pos-ajuda">
                ${posOpcoes.estilo === 'pontos'
                    ? 'A imagem vira uma grade de bolinhas que crescem conforme o escuro. Aguenta ampliação enorme sem borrar e gasta pouca tinta.'
                    : 'A imagem é recortada e ampliada como está. Bom para pouca ampliação; em cartaz grande fica borrada e gasta muita tinta.'}
            </div>
        </div>`;
}

function posHtmlPontos() {
    return `
        <div>
            <div class="pos-rotulo">Os pontos</div>
            <div style="margin-top:6px; font-size:12px; color:#4a5568;">
                <label style="display:block; margin-bottom:4px;">
                    Distância entre pontos: <strong>${posOpcoes.passo} pt</strong>
                    <input type="range" min="3" max="40" step="1" value="${posOpcoes.passo}" ${posOcupado ? 'disabled' : ''}
                           style="width:100%;" onchange="posDefinir('passo', this.value)">
                </label>
                <label style="display:block; margin-bottom:4px;">
                    Tamanho do ponto: <strong>${Math.round(posOpcoes.tamanhoPonto * 100)}%</strong>
                    <input type="range" min="30" max="150" step="5" value="${Math.round(posOpcoes.tamanhoPonto * 100)}"
                           ${posOcupado ? 'disabled' : ''} style="width:100%;"
                           onchange="posDefinir('tamanhoPonto', this.value / 100)">
                </label>
                <label style="display:block;">
                    Contraste: <strong>${posOpcoes.contraste.toFixed(1)}</strong>
                    <input type="range" min="0.4" max="2.5" step="0.1" value="${posOpcoes.contraste}" ${posOcupado ? 'disabled' : ''}
                           style="width:100%;" onchange="posDefinir('contraste', this.value)">
                </label>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center;">
                ${[['preto', 'Preto'], ['original', 'Cores da imagem'], ['fixa', 'Uma cor']].map(([v, t]) => `
                    <button class="pos-opcao ${posOpcoes.cor === v ? 'pos-ativa' : ''}" ${posOcupado ? 'disabled' : ''}
                            onclick="posDefinir('cor', '${v}')">${t}</button>`).join('')}
                ${posOpcoes.cor === 'fixa' ? `
                    <input type="color" value="${escPos(posOpcoes.corFixa)}" ${posOcupado ? 'disabled' : ''}
                           style="width:42px; height:32px; padding:2px;" onchange="posDefinir('corFixa', this.value)">` : ''}
            </div>
            <label style="display:flex; gap:6px; align-items:center; margin-top:8px; font-size:13px; color:#4a5568;">
                <input type="checkbox" ${posOpcoes.invertido ? 'checked' : ''} ${posOcupado ? 'disabled' : ''}
                       onchange="posDefinir('invertido', this.checked)">
                Inverter (para imprimir claro sobre papel escuro)
            </label>
        </div>`;
}

function posHtmlMontagem() {
    return `
        <div>
            <div class="pos-rotulo">Ajuda para montar</div>
            <label style="display:flex; gap:6px; align-items:center; margin-top:8px; font-size:13px; color:#4a5568;">
                <input type="checkbox" ${posOpcoes.marcasDeCorte ? 'checked' : ''} ${posOcupado ? 'disabled' : ''}
                       onchange="posDefinir('marcasDeCorte', this.checked)">
                Marcas de corte nos cantos
            </label>
            <label style="display:flex; gap:6px; align-items:center; margin-top:6px; font-size:13px; color:#4a5568;">
                <input type="checkbox" ${posOpcoes.numerarFolhas ? 'checked' : ''} ${posOcupado ? 'disabled' : ''}
                       onchange="posDefinir('numerarFolhas', this.checked)">
                Nome em cada folha (L1-C2)
            </label>
            <div class="pos-ajuda">
                As marcas só aparecem nas bordas que <em>não</em> encostam em outra folha — cortar a borda
                que leva cola comeria a sobreposição. Com dezesseis folhas no chão, o nome é o que salva.
            </div>
        </div>`;
}

function posHtmlProgresso() {
    if (!posOcupado) return '';
    const pct = Math.max(2, Math.min(100, Math.round(posProgresso.fracao * 100)));
    return `
        <div style="background:#edf2f7; border-radius:999px; height:10px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:#3182ce; transition:width .2s;"></div>
        </div>
        <div style="font-size:12px; color:#718096; margin-top:6px;">${escPos(posProgresso.texto || '')} ${pct}%</div>`;
}

function posDesenharProgresso() {
    const area = document.getElementById('posProgresso');
    if (area) area.innerHTML = posHtmlProgresso();
}

function posHtmlResultado() {
    if (!posResultado || posOcupado) return '';
    const r = posResultado;
    return `
        <div style="margin-top:18px; border-top:1px solid #e2e8f0; padding-top:16px;
                    display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <div style="flex:1; min-width:200px;">
                <div style="font-weight:bold; color:#2d3748;">✅ Pronto — ${r.folhas} folha${r.folhas > 1 ? 's' : ''}</div>
                <div style="color:#718096; font-size:12px; margin-top:2px;">
                    ${r.colunas} × ${r.linhas} · ${r.larguraCm.toFixed(0)} × ${r.alturaCm.toFixed(0)} cm ·
                    ${posTamanho(r.blob.size)} · ${r.segundos.toFixed(1)}s
                </div>
                <div style="color:#718096; font-size:12px; margin-top:6px;">
                    Na hora de imprimir, escolha <strong>"Tamanho real"</strong> (ou 100%) — se a impressora
                    "ajustar à página", as folhas não encaixam.
                </div>
            </div>
            <a class="btn btn-primary" id="posBaixar" href="${escPos(r.url)}"
               download="${escPos(posNomeDoArquivo())}" style="text-decoration:none;">⬇️ Baixar o PDF</a>
        </div>`;
}

// A tela nao usa modulos: os onclick do HTML gerado precisam achar isto no window.
window.renderPoster = renderPoster;
window.posEscolherArquivo = posEscolherArquivo;
window.posSoltar = posSoltar;
window.posArrastando = posArrastando;
window.posTrocarImagem = posTrocarImagem;
window.posDefinir = posDefinir;
window.posGerar = posGerar;
window.posCancelar = posCancelar;

})();
