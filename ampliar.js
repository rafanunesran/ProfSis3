// ampliar.js — A ABA "AMPLIAR": aumentar e limpar imagem sem mandar o arquivo embora.
//
// POR QUE ISTO EXISTE
//   O mesmo motivo da aba de PDF, com outro arquivo. A foto que chega para o professor —
//   o documento fotografado de banda, o print do diario, a carteirinha, o rosto na lista
//   de presenca — chega pequena e suja de JPEG. Para usar na ata, no mural ou no
//   relatorio impresso, ela precisa ser ampliada.
//
//   O caminho de sempre e' um site gratuito de "melhorar imagem com IA". E' um envio: a
//   imagem sai do aparelho e passa a existir no servidor de um terceiro. Quando essa
//   imagem tem o rosto ou o documento de uma crianca, isso e' tratamento de dado pessoal
//   de crianca por terceiro que ninguem autorizou — e a escola quem responde (ver
//   CONFORMIDADE-SEDUC.md).
//
//   Aqui a conta acontece no aparelho. Os dois motores rodam no navegador:
//
//     "Nitido"  ampliar_operacoes.js: Lanczos + bilateral + realce travado. Nao baixa
//               nada, funciona sem internet, resolve a maioria dos casos de documento.
//     "IA"      uma rede neural (ESRGAN) rodando em TensorFlow.js. O MODELO e' baixado
//               (uma vez, ~2,5 MB); a IMAGEM continua sem sair daqui. E' mais lento e
//               costuma ganhar em foto e desenho.
//
//   Em nenhum dos dois a imagem e' enviada para lugar nenhum. E' a diferenca que importa.
//
// COMO A TELA E' FEITA
//   Um arquivo por vez, tres escolhas (quanto ampliar, quanto limpar, quanto realcar) e
//   uma comparacao lado a lado no fim, porque "ficou melhor?" e' uma pergunta que so' o
//   olho responde. O portao premium e' o mesmo da aba de PDF: ver da' para todo mundo,
//   usar e' do plano Professor.

(function () {
'use strict';

// ---------------------------------------------------------------------------
// Estado da aba
// ---------------------------------------------------------------------------

const AMP_MAX_MB = 40;           // acima disso a decodificacao ja' costuma derrubar a aba

let ampImagem = null;            // { nome, tipo, tamanho, largura, altura, url, bitmap }
let ampResultado = null;         // { blob, url, largura, altura, tipo, segundos, motor }
let ampOcupado = false;
let ampErro = '';
let ampAviso = '';               // recado que nao e' erro (ex.: "cancelado")
let ampDesistiu = false;         // o professor clicou em Cancelar
let ampAbortador = null;         // AbortController da IA, para interromper a rede neural
let ampUrlsAbertas = [];         // URLs de blob para revogar (senao vaza memoria)
let ampProgresso = { fracao: 0, texto: '' };

const ampOpcoes = {
    escala: 2,
    ruido: 2,          // 0..3 — foto de celular quase sempre pede alguma limpeza
    nitidez: 1,        // 0..3
    motor: 'nitido',   // 'nitido' | 'ia'
    formato: 'image/png',
    qualidade: 0.92
};

function escAmp(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ampTamanho(bytes) {
    return (window.AMPLIAROPS && AMPLIAROPS.formatarTamanho)
        ? AMPLIAROPS.formatarTamanho(bytes)
        : Math.round((bytes || 0) / 1024) + ' KB';
}

function ampUrlDe(blobOuArquivo) {
    const url = URL.createObjectURL(blobOuArquivo);
    ampUrlsAbertas.push(url);
    return url;
}

function ampLimparUrls() {
    ampUrlsAbertas.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) { /* ja' foi */ } });
    ampUrlsAbertas = [];
}

// O portao premium. Fica em UM lugar so', como o da aba de PDF, para nao haver caminho
// esquecido do lado de fora.
function ampPodeUsar() {
    if (typeof exigirPremium !== 'function') {
        console.warn('[Ampliar] assinatura.js indisponivel — portao premium nao aplicado.');
        return true;
    }
    return exigirPremium('Ferramentas — Ampliar imagem');
}

function ampEhPremium() {
    return (typeof ehPremium === 'function') ? ehPremium() : true;
}

function ampSeloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}

// ---------------------------------------------------------------------------
// Quanto o navegador aguenta
// ---------------------------------------------------------------------------
// O limite nao e' o disco nem a internet: e' o <canvas>. Cada navegador tem um teto de
// area, e o do iPhone e' MUITO mais baixo que o do computador. Passar do teto nao da'
// erro: o canvas simplesmente fica em branco, e o professor baixa um arquivo vazio sem
// entender por que. Entao o teto e' medido de verdade, uma vez, desenhando e lendo de
// volta um pixel no canto mais distante.
let _tetoDeArea = null;

function _areaFunciona(area) {
    try {
        const lado = Math.floor(Math.sqrt(area));
        const canvas = document.createElement('canvas');
        canvas.width = lado;
        canvas.height = lado;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(lado - 1, lado - 1, 1, 1);
        const lido = ctx.getImageData(lado - 1, lado - 1, 1, 1).data;
        canvas.width = canvas.height = 1;   // devolve a memoria na hora
        return lido[3] === 255;
    } catch (_) {
        return false;
    }
}

function tetoDeArea() {
    if (_tetoDeArea != null) return _tetoDeArea;
    const candidatos = [40e6, 24e6, 16e6, 8e6, 4e6];
    _tetoDeArea = 2e6;
    for (let i = 0; i < candidatos.length; i++) {
        if (_areaFunciona(candidatos[i])) { _tetoDeArea = candidatos[i]; break; }
    }
    return _tetoDeArea;
}

const ESCALAS = [
    { v: 1, rotulo: '1x', ajuda: 'Só limpar e realçar, sem aumentar' },
    { v: 2, rotulo: '2x', ajuda: 'O dobro de cada lado (4x a área)' },
    { v: 4, rotulo: '4x', ajuda: 'Quatro vezes cada lado' },
    { v: 8, rotulo: '8x', ajuda: 'Oito vezes cada lado — só para imagem bem pequena' }
];

function ampCabe(escala) {
    if (!ampImagem) return true;
    return ampImagem.largura * escala * ampImagem.altura * escala <= tetoDeArea();
}

// ---------------------------------------------------------------------------
// O motor "IA": rede neural rodando aqui dentro
// ---------------------------------------------------------------------------
// Versoes fixas de proposito, pelo mesmo motivo de pdf_operacoes.js: "latest" num CDN
// significa que a atualizacao de um terceiro pode quebrar a ferramenta de madrugada.
const CDN_AMP = {
    tfjs:     'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    upscaler: 'https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js',
    modelo2x: 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0/dist/umd/models/esrgan-slim/src/x2/index.min.js',
    modelo4x: 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0/dist/umd/models/esrgan-slim/src/x4/index.min.js'
};

const _carregandoAmp = {};

// Tres tentativas antes de desistir, como em pdf_operacoes.js: o Wi-Fi de escola derruba
// um script no meio do caminho com frequencia desconfortavel.
function ampCarregarScript(src) {
    if (_carregandoAmp[src]) return _carregandoAmp[src];

    const umaTentativa = () => new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => ok();
        s.onerror = () => { s.remove(); falha(new Error('falha de rede')); };
        document.head.appendChild(s);
    });

    _carregandoAmp[src] = (async () => {
        const esperas = [0, 700, 1800];
        for (let i = 0; i < esperas.length; i++) {
            if (esperas[i]) await new Promise(ok => setTimeout(ok, esperas[i]));
            try { await umaTentativa(); return; } catch (_) { /* tenta de novo */ }
        }
        delete _carregandoAmp[src];
        throw new Error('Nao consegui baixar o modelo de IA depois de 3 tentativas. ' +
                        'Verifique a conexao — ou use o motor "Nítido", que não baixa nada.');
    })();
    return _carregandoAmp[src];
}

const _ampliadores = {};

async function ampliadorIA(escalaModelo) {
    if (_ampliadores[escalaModelo]) return _ampliadores[escalaModelo];

    await ampCarregarScript(CDN_AMP.tfjs);
    if (!window.tf) throw new Error('O TensorFlow.js carregou, mas não se apresentou (window.tf vazio).');
    await ampCarregarScript(CDN_AMP.upscaler);
    if (!window.Upscaler) throw new Error('O ampliador de IA carregou, mas não expôs Upscaler.');

    await ampCarregarScript(escalaModelo === 4 ? CDN_AMP.modelo4x : CDN_AMP.modelo2x);
    const modelo = escalaModelo === 4 ? window.ESRGANSlim4x : window.ESRGANSlim2x;
    if (!modelo) throw new Error('O modelo de ' + escalaModelo + 'x carregou, mas não se apresentou.');

    _ampliadores[escalaModelo] = new window.Upscaler({ model: modelo });
    return _ampliadores[escalaModelo];
}

// A rede e' aplicada em PEDACOS (patches). Numa foto inteira de uma vez o navegador
// estoura a memoria da GPU; em pedacos com sobreposicao, o mesmo resultado cabe.
//
// O TAMANHO DO PEDACO e' 128 porque foi com 128 que este modelo foi treinado, e porque
// cada pedaco carrega um custo fixo (montar o tensor, esperar o quadro seguinte) que nao
// depende do tamanho dele: em pedacos de 64 esse custo e' pago quatro vezes mais.
const IA_PEDACO = 128;
const IA_SOBRA = 8;               // sobreposicao, para o pedaco nao deixar emenda visivel

async function rodarIA(canvasEntrada, escalaModelo, aoProgredir) {
    const ampliador = await ampliadorIA(escalaModelo);
    ampAbortador = new AbortController();
    const base64 = await ampliador.upscale(canvasEntrada, {
        output: 'base64',
        patchSize: IA_PEDACO,
        padding: IA_SOBRA,
        awaitNextFrame: true,      // devolve o controle ao navegador entre os pedacos
        signal: ampAbortador.signal,
        progress: (fracao) => { if (aoProgredir) aoProgredir(Number(fracao) || 0); }
    });
    return await carregarBitmap(base64);
}

// Quantos pedacos a rede vai ter de processar. Serve para avisar ANTES: a IA custa cerca
// de um segundo por pedaco em aparelho comum, e descobrir isso depois de dez minutos de
// espera e' pior do que nao ter a opcao.
function pedacosDaIA(largura, altura) {
    const passo = Math.max(1, IA_PEDACO - IA_SOBRA * 2);
    return Math.ceil(largura / passo) * Math.ceil(altura / passo);
}

function carregarBitmap(src) {
    return new Promise((ok, falha) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => falha(new Error('Não consegui ler a imagem que a IA devolveu.'));
        im.src = src;
    });
}

// ---------------------------------------------------------------------------
// Ponte entre o <canvas> e o motor
// ---------------------------------------------------------------------------

function canvasDe(fonte, largura, altura) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(largura));
    canvas.height = Math.max(1, Math.round(altura));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (fonte) ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function imagemDoCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { largura: dados.width, altura: dados.height, dados: dados.data };
}

function canvasDaImagem(img) {
    const canvas = canvasDe(null, img.largura, img.altura);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.dados), img.largura, img.altura), 0, 0);
    return canvas;
}

function canvasParaBlob(canvas, tipo, qualidade) {
    return new Promise((ok, falha) => {
        canvas.toBlob(b => {
            if (b) ok(b);
            else falha(new Error('O navegador não conseguiu gerar o arquivo. Tente PNG, ou uma ampliação menor.'));
        }, tipo, tipo === 'image/png' ? undefined : qualidade);
    });
}

// ---------------------------------------------------------------------------
// Abrir o arquivo
// ---------------------------------------------------------------------------

async function ampEscolherArquivo(input) {
    const arquivo = input && input.files && input.files[0];
    if (arquivo) await ampAbrir(arquivo);
    if (input) input.value = '';   // permite escolher o MESMO arquivo de novo
}

async function ampSoltar(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const alvo = ev.currentTarget;
    if (alvo) alvo.classList.remove('amp-sobre');
    const arquivo = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (arquivo) await ampAbrir(arquivo);
}

function ampArrastando(ev, entrou) {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.currentTarget) ev.currentTarget.classList.toggle('amp-sobre', !!entrou);
}

async function ampAbrir(arquivo) {
    ampErro = '';
    ampResultado = null;

    if (!/^image\//.test(arquivo.type || '')) {
        ampErro = 'Isto não parece uma imagem (' + escAmp(arquivo.type || 'tipo desconhecido') + '). ' +
                  'Vale PNG, JPG, WebP, GIF ou BMP.';
        ampRender();
        return;
    }
    if (arquivo.size > AMP_MAX_MB * 1024 * 1024) {
        ampErro = 'A imagem tem ' + ampTamanho(arquivo.size) + '. O limite aqui é ' + AMP_MAX_MB +
                  ' MB — acima disso o navegador costuma fechar a aba sozinho no meio da conta.';
        ampRender();
        return;
    }

    ampLimparUrls();
    const url = ampUrlDe(arquivo);
    try {
        const bitmap = await carregarBitmap(url);
        ampImagem = {
            nome: arquivo.name || 'imagem',
            tipo: arquivo.type,
            tamanho: arquivo.size,
            largura: bitmap.naturalWidth || bitmap.width,
            altura: bitmap.naturalHeight || bitmap.height,
            url: url,
            bitmap: bitmap
        };
        // Se a escala escolhida nao couber para esta imagem, cai para a maior que cabe:
        // melhor abrir num tamanho possivel do que mostrar um botao que sempre falha.
        if (!ampCabe(ampOpcoes.escala)) {
            const possiveis = ESCALAS.map(e => e.v).filter(v => ampCabe(v));
            ampOpcoes.escala = possiveis.length ? Math.max.apply(null, possiveis) : 1;
        }
    } catch (erro) {
        ampImagem = null;
        ampErro = 'Não consegui abrir esta imagem. O arquivo pode estar corrompido, ou ser de um ' +
                  'formato que este navegador não lê (HEIC do iPhone, por exemplo).';
    }
    ampRender();
}

function ampTrocarImagem() {
    ampLimparUrls();
    ampImagem = null;
    ampResultado = null;
    ampErro = '';
    ampAviso = '';
    ampRender();
}

// ---------------------------------------------------------------------------
// O trabalho
// ---------------------------------------------------------------------------

async function ampExecutar() {
    if (ampOcupado || !ampImagem) return;
    if (!ampPodeUsar()) return;    // o convite do plano ja' apareceu

    ampOcupado = true;
    ampErro = '';
    ampAviso = '';
    ampDesistiu = false;
    ampAbortador = null;
    ampResultado = null;
    ampProgresso = { fracao: 0, texto: 'Preparando...' };
    ampRender();

    const comecou = Date.now();
    try {
        const escala = Number(ampOpcoes.escala) || 1;
        if (!ampCabe(escala)) {
            throw new Error('Este tamanho não cabe na memória deste navegador. Escolha uma ampliação menor.');
        }

        let canvasSaida;
        if (ampOpcoes.motor === 'ia' && escala > 1) {
            canvasSaida = await executarComIA(escala);
        } else {
            canvasSaida = await executarNitido(escala);
        }

        ampProgresso = { fracao: 0.98, texto: 'Gerando o arquivo...' };
        ampDesenharProgresso();

        const blob = await canvasParaBlob(canvasSaida, ampOpcoes.formato, ampOpcoes.qualidade);
        ampResultado = {
            blob: blob,
            url: ampUrlDe(blob),
            largura: canvasSaida.width,
            altura: canvasSaida.height,
            tipo: ampOpcoes.formato,
            segundos: (Date.now() - comecou) / 1000,
            motor: ampOpcoes.motor
        };
        canvasSaida.width = canvasSaida.height = 1;   // devolve a memoria
    } catch (erro) {
        // Desistir nao e' falha. Mostrar tarja vermelha de erro para quem clicou em
        // Cancelar seria acusar o professor de ter quebrado alguma coisa.
        if (ampDesistiu || (window.AMPLIAROPS && AMPLIAROPS.ehCancelamento(erro))) {
            ampAviso = 'Ampliação cancelada. Nada foi alterado.';
        } else {
            console.error('[Ampliar]', erro);
            ampErro = (erro && erro.message) ? erro.message : String(erro);
        }
    } finally {
        ampOcupado = false;
        ampDesistiu = false;
        ampAbortador = null;
        ampProgresso = { fracao: 0, texto: '' };
        ampRender();
    }
}

// Interrompe o que estiver rodando. A IA para pelo AbortController; o motor Nitido para
// no proximo intervalo entre etapas (ver `cancelado` em ampliar_operacoes.js).
function ampCancelar() {
    if (!ampOcupado) return;
    ampDesistiu = true;
    ampProgresso = { fracao: ampProgresso.fracao, texto: 'Cancelando...' };
    ampDesenharProgresso();
    if (ampAbortador) { try { ampAbortador.abort(); } catch (_) { /* ja' terminou */ } }
}

// Motor "Nítido": tudo aqui dentro, sem baixar nada.
async function executarNitido(escala) {
    ampProgresso = { fracao: 0.02, texto: 'Lendo a imagem...' };
    ampDesenharProgresso();

    const entrada = imagemDoCanvas(canvasDe(ampImagem.bitmap, ampImagem.largura, ampImagem.altura));
    const nomes = { ruido: 'Limpando o ruído...', ampliando: 'Ampliando...', nitidez: 'Realçando as bordas...' };

    const saida = await AMPLIAROPS.ampliar(entrada, {
        escala: escala,
        ruido: ampOpcoes.ruido,
        nitidez: ampOpcoes.nitidez,
        cancelado: () => ampDesistiu
    }, (fracao, etapa) => {
        ampProgresso = { fracao: 0.02 + fracao * 0.94, texto: nomes[etapa] || 'Trabalhando...' };
        ampDesenharProgresso();
    });

    return canvasDaImagem(saida);
}

// Motor "IA": a rede neural. Ela so' sabe ampliar em 2x ou 4x, e nao limpa ruido nem
// realca borda — essas duas partes continuam vindo do motor Nitido, antes e depois.
async function executarComIA(escala) {
    let atual = ampImagem.bitmap;

    if (ampOpcoes.ruido > 0) {
        ampProgresso = { fracao: 0.02, texto: 'Limpando o ruído...' };
        ampDesenharProgresso();
        const limpa = AMPLIAROPS.reduzirRuido(
            imagemDoCanvas(canvasDe(atual, ampImagem.largura, ampImagem.altura)), ampOpcoes.ruido);
        atual = canvasDaImagem(limpa);
        await new Promise(ok => setTimeout(ok, 0));
    } else {
        atual = canvasDe(atual, ampImagem.largura, ampImagem.altura);
    }

    // 8x nao existe no modelo: sai como 4x seguido de 2x.
    const passos = escala === 8 ? [4, 2] : (escala === 4 ? [4] : [2]);
    for (let i = 0; i < passos.length; i++) {
        if (ampDesistiu) throw AMPLIAROPS.erroDeCancelamento();
        const base = i / passos.length;
        ampProgresso = { fracao: 0.05 + base * 0.85, texto: 'Baixando o modelo de IA (uma vez só)...' };
        ampDesenharProgresso();
        const imagemAmpliada = await rodarIA(atual, passos[i], (fracao) => {
            ampProgresso = {
                fracao: 0.05 + (base + fracao / passos.length) * 0.85,
                texto: 'A rede neural está trabalhando' + (passos.length > 1 ? ' (passo ' + (i + 1) + ' de ' + passos.length + ')' : '') + '...'
            };
            ampDesenharProgresso();
        });
        atual = canvasDe(imagemAmpliada, imagemAmpliada.naturalWidth, imagemAmpliada.naturalHeight);
    }

    if (ampOpcoes.nitidez > 0) {
        ampProgresso = { fracao: 0.93, texto: 'Realçando as bordas...' };
        ampDesenharProgresso();
        const realcada = AMPLIAROPS.realcarBordas(imagemDoCanvas(atual), ampOpcoes.nitidez);
        atual = canvasDaImagem(realcada);
    }
    return atual;
}

function ampBaixar() {
    if (!ampResultado) return;
    const ext = ampResultado.tipo === 'image/png' ? 'png'
              : ampResultado.tipo === 'image/webp' ? 'webp' : 'jpg';
    const base = (ampImagem && ampImagem.nome || 'imagem').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = ampResultado.url;
    a.download = base + '-ampliada-' + ampResultado.largura + 'x' + ampResultado.altura + '.' + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// ---------------------------------------------------------------------------
// Os controles
// ---------------------------------------------------------------------------

function ampDefinir(chave, valor) {
    if (chave === 'escala' || chave === 'ruido' || chave === 'nitidez') valor = Number(valor);
    if (chave === 'qualidade') valor = Number(valor) / 100;
    ampOpcoes[chave] = valor;
    ampAviso = '';
    // Trocar de opcao invalida o resultado anterior: deixa-lo na tela faria o professor
    // baixar um arquivo que nao corresponde ao que esta escrito nos controles.
    ampResultado = null;
    ampRender();
}

// ---------------------------------------------------------------------------
// A TELA
// ---------------------------------------------------------------------------

// Chamada pela aba "Ampliar" — ver ferramentas.js.
function renderAmpliar() {
    ampRender();
}

function ampAreaDaAba() {
    return document.getElementById('tabFerramentasAmpliar');
}

function ampRender() {
    const area = ampAreaDaAba();
    if (!area) return;
    const premium = ampEhPremium();

    area.innerHTML = `
        <style>
            .amp-solta {
                border: 2px dashed #cdd5e1; border-radius: 10px; padding: 28px 18px; text-align: center;
                background: #f6f8fb; transition: all .15s; cursor: pointer;
            }
            .amp-solta.amp-sobre { border-color: #2563c9; background: #edf3fd; }
            .amp-opcao {
                border: 1px solid #e3e8ef; background: #fff; border-radius: 8px; padding: 7px 12px;
                cursor: pointer; font-size: 13px; color: #3d4759; transition: all .15s;
            }
            .amp-opcao:hover { border-color: #7a869a; }
            .amp-opcao.amp-ativa { border-color: #2563c9; background: #edf3fd; color: #1f55ad; font-weight: bold; }
            .amp-opcao[disabled] { opacity: .45; cursor: not-allowed; }
            .amp-rotulo { font-size: 12px; font-weight: bold; color: #3d4759; text-transform: uppercase; letter-spacing: .03em; }
            .amp-comparar { position: relative; overflow: hidden; border-radius: 8px; background:
                repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 18px 18px; line-height: 0; }
            .amp-comparar img { display: block; width: 100%; height: auto; }
            .amp-depois { position: absolute; inset: 0; overflow: hidden; }
            .amp-depois img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
        </style>

        <div class="card" style="margin:20px 0;">
            <h2>🔍 Ampliar imagem ${ampSeloPro()}</h2>
            <p style="color:#3d4759; font-size:14px; line-height:1.6; margin-bottom:6px;">
                Aumenta o tamanho de uma foto ou figura sem deixar ela quadriculada, limpa o granulado
                de JPEG e realça as bordas. Serve para a foto do documento que chegou pequena demais,
                para o print do diário, para a figura que vai para o mural.
            </p>
            <div style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#22543d; line-height:1.6;">
                🔒 <strong>A imagem não sai deste aparelho.</strong> A conta acontece aqui, no navegador.
                É a diferença que importa: uma foto com o rosto ou o documento de um estudante
                <strong>não pode</strong> ser jogada num site gratuito de "melhorar imagem", porque isso é
                entregar dado pessoal de criança a um terceiro que a escola não autorizou
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

            ${ampErro ? `<div style="background:#fff5f5; border:1px solid #fc8181; color:#742a2a; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; line-height:1.6;">
                ⚠️ ${escAmp(ampErro)}</div>` : ''}
            ${ampAviso ? `<div style="background:#edf3fd; border:1px solid #a9c6f3; color:#1b4488; border-radius:8px; padding:10px 14px; margin:12px 0; font-size:13px; line-height:1.6;">
                ${escAmp(ampAviso)}</div>` : ''}

            ${ampImagem ? ampHtmlComImagem() : ampHtmlSemImagem()}
        </div>`;

    ampLigarComparador();
}

function ampHtmlSemImagem() {
    return `
        <div class="amp-solta" onclick="document.getElementById('ampArquivo').click()"
             ondragover="ampArrastando(event, true)" ondragleave="ampArrastando(event, false)"
             ondrop="ampSoltar(event)">
            <div style="font-size:38px; line-height:1;">🖼️</div>
            <div style="font-weight:bold; color:#1c2536; margin-top:10px;">Escolha a imagem ou arraste ela para cá</div>
            <div style="color:#5f6b7f; font-size:12px; margin-top:6px;">
                PNG, JPG, WebP, GIF ou BMP — até ${AMP_MAX_MB} MB
            </div>
        </div>
        <input type="file" id="ampArquivo" accept="image/*" style="display:none;"
               onchange="ampEscolherArquivo(this)">`;
}

function ampHtmlComImagem() {
    const img = ampImagem;
    const escala = Number(ampOpcoes.escala) || 1;
    const saidaL = Math.round(img.largura * escala);
    const saidaA = Math.round(img.altura * escala);
    const megapixels = (saidaL * saidaA) / 1e6;

    return `
        <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; background:#f6f8fb;
                    border:1px solid #e3e8ef; border-radius:8px; padding:10px 12px; margin:12px 0;">
            <img src="${escAmp(img.url)}" alt="" style="width:64px; height:64px; object-fit:contain; background:#fff; border:1px solid #e3e8ef; border-radius:6px;">
            <div style="flex:1; min-width:180px;">
                <div style="font-weight:bold; color:#1c2536; font-size:14px; word-break:break-all;">${escAmp(img.nome)}</div>
                <div style="color:#5f6b7f; font-size:12px; margin-top:2px;">
                    ${img.largura} × ${img.altura} px · ${ampTamanho(img.tamanho)}
                </div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="ampTrocarImagem()" ${ampOcupado ? 'disabled' : ''}>Trocar imagem</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:16px 22px; margin:18px 0;">
            <div>
                <div class="amp-rotulo">Quanto ampliar</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    ${ESCALAS.map(e => {
                        const cabe = ampCabe(e.v);
                        return `<button class="amp-opcao ${escala === e.v ? 'amp-ativa' : ''}"
                                        ${cabe ? '' : 'disabled'} ${ampOcupado ? 'disabled' : ''}
                                        title="${escAmp(cabe ? e.ajuda : 'Não cabe na memória deste navegador para esta imagem')}"
                                        onclick="ampDefinir('escala', ${e.v})">${e.rotulo}</button>`;
                    }).join('')}
                </div>
                <div style="color:#5f6b7f; font-size:12px; margin-top:6px;">
                    Resultado: <strong>${saidaL} × ${saidaA} px</strong>${megapixels >= 1 ? ' (' + megapixels.toFixed(1) + ' megapixels)' : ''}
                </div>
            </div>

            <div>
                <div class="amp-rotulo">Limpar ruído</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    ${['Nenhum', 'Leve', 'Médio', 'Forte'].map((t, i) => `
                        <button class="amp-opcao ${ampOpcoes.ruido === i ? 'amp-ativa' : ''}" ${ampOcupado ? 'disabled' : ''}
                                onclick="ampDefinir('ruido', ${i})">${t}</button>`).join('')}
                </div>
                <div style="color:#5f6b7f; font-size:12px; margin-top:6px;">
                    Apaga o granulado e o quadriculado do JPEG sem comer a borda das letras.
                </div>
            </div>

            <div>
                <div class="amp-rotulo">Realçar bordas</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    ${['Nenhum', 'Leve', 'Médio', 'Forte'].map((t, i) => `
                        <button class="amp-opcao ${ampOpcoes.nitidez === i ? 'amp-ativa' : ''}" ${ampOcupado ? 'disabled' : ''}
                                onclick="ampDefinir('nitidez', ${i})">${t}</button>`).join('')}
                </div>
                <div style="color:#5f6b7f; font-size:12px; margin-top:6px;">
                    Para texto fotografado, "Médio" costuma ser o ponto.
                </div>
            </div>

            <div>
                <div class="amp-rotulo">Motor</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    <button class="amp-opcao ${ampOpcoes.motor === 'nitido' ? 'amp-ativa' : ''}" ${ampOcupado ? 'disabled' : ''}
                            onclick="ampDefinir('motor', 'nitido')">⚡ Nítido</button>
                    <button class="amp-opcao ${ampOpcoes.motor === 'ia' ? 'amp-ativa' : ''}" ${ampOcupado ? 'disabled' : ''}
                            onclick="ampDefinir('motor', 'ia')">🧠 IA</button>
                </div>
                <div style="color:#5f6b7f; font-size:12px; margin-top:6px;">
                    ${ampOpcoes.motor === 'ia'
                        ? 'Rede neural rodando aqui dentro. Baixa o modelo (~2,5 MB) na primeira vez e é bem mais lenta — a <strong>imagem</strong> continua sem sair do aparelho.'
                        : 'Rápido, funciona sem internet e não baixa nada. Resolve a maior parte dos casos.'}
                </div>
            </div>

            <div>
                <div class="amp-rotulo">Formato do arquivo</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    ${[['image/png', 'PNG'], ['image/jpeg', 'JPG'], ['image/webp', 'WebP']].map(([v, t]) => `
                        <button class="amp-opcao ${ampOpcoes.formato === v ? 'amp-ativa' : ''}" ${ampOcupado ? 'disabled' : ''}
                                onclick="ampDefinir('formato', '${v}')">${t}</button>`).join('')}
                </div>
                ${ampOpcoes.formato === 'image/png' ? `
                    <div style="color:#5f6b7f; font-size:12px; margin-top:6px;">
                        PNG não perde nada e mantém transparência. O arquivo sai maior.
                    </div>` : `
                    <div style="margin-top:8px;">
                        <label style="color:#5f6b7f; font-size:12px; display:block; margin-bottom:2px;">
                            Qualidade: <strong>${Math.round(ampOpcoes.qualidade * 100)}%</strong></label>
                        <input type="range" min="50" max="100" step="1" value="${Math.round(ampOpcoes.qualidade * 100)}"
                               ${ampOcupado ? 'disabled' : ''} style="width:100%;"
                               onchange="ampDefinir('qualidade', this.value)">
                    </div>`}
            </div>
        </div>

        ${ampAvisoDeDemora(escala)}

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="ampExecutar()" ${ampOcupado ? 'disabled' : ''}>
                ${ampOcupado ? '⏳ Trabalhando...' : '🔍 Ampliar'}
            </button>
            ${ampOcupado ? '<button class="btn btn-secondary" onclick="ampCancelar()">Cancelar</button>' : ''}
            ${escala === 1 && !ampOcupado ? '<span style="color:#5f6b7f; font-size:12px;">Em 1x a imagem só é limpa e realçada, sem aumentar.</span>' : ''}
        </div>

        <div id="ampProgresso" style="margin-top:14px;">${ampHtmlProgresso()}</div>
        <div id="ampResultado">${ampHtmlResultado()}</div>`;
}

// O aviso de demora.
//
// De proposito ele NAO promete um numero de segundos. O tempo da rede neural depende do
// aparelho de um jeito que nao da' para estimar de fora: a mesma imagem de 320x240 que
// leva meio minuto num navegador sem placa de video decente sai em poucos segundos num
// computador com GPU de verdade. Prometer "cerca de 10 segundos" e entregar trinta e'
// pior do que nao prometer nada — o professor fica achando que travou.
//
// O que da' para dizer com honestidade e' o TAMANHO DA TAREFA (quantos pedacos a rede
// tem de processar, que e' o mesmo numero em qualquer aparelho), que da' para desistir no
// meio, e que existe um caminho rapido ao lado.
function ampAvisoDeDemora(escala) {
    if (ampOpcoes.motor !== 'ia' || escala <= 1 || !ampImagem) return '';
    const pedacos = pedacosDaIA(ampImagem.largura, ampImagem.altura) * (escala === 8 ? 2 : 1);
    if (pedacos <= 2) return '';
    return `<div style="background:#fffaf0; border:1px solid #fbd38d; color:#744210; border-radius:8px;
                        padding:10px 14px; margin:14px 0 0; font-size:13px; line-height:1.6;">
        ⏳ A rede neural vai processar <strong>${pedacos} pedaço${pedacos > 1 ? 's' : ''}</strong> desta imagem,
        um por vez. Dependendo do aparelho isso vai de alguns segundos a vários minutos, e ele fica lento
        enquanto durar — <strong>dá para cancelar no meio</strong>.
        O motor <strong>⚡ Nítido</strong> entrega o mesmo tamanho quase na hora: vale tentar ele primeiro e
        só vir para a IA se o resultado não agradar.
    </div>`;
}

function ampHtmlProgresso() {
    if (!ampOcupado) return '';
    const pct = Math.max(2, Math.min(100, Math.round(ampProgresso.fracao * 100)));
    return `
        <div style="background:#eef2f7; border-radius:999px; height:10px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:#2563c9; transition:width .2s;"></div>
        </div>
        <div style="font-size:12px; color:#5f6b7f; margin-top:6px;">${escAmp(ampProgresso.texto || '')} ${pct}%</div>`;
}

// O progresso e' redesenhado sozinho, sem refazer a tela inteira: reconstruir todo o
// HTML a cada passo perderia o foco do teclado e faria os botoes piscarem.
function ampDesenharProgresso() {
    const area = document.getElementById('ampProgresso');
    if (area) area.innerHTML = ampHtmlProgresso();
}

function ampHtmlResultado() {
    if (!ampResultado || ampOcupado) return '';
    const r = ampResultado;
    const ganho = ampImagem ? (r.largura / ampImagem.largura) : 1;

    return `
        <div style="margin-top:18px; border-top:1px solid #e3e8ef; padding-top:16px;">
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                <div style="flex:1; min-width:200px;">
                    <div style="font-weight:bold; color:#1c2536;">✅ Pronto — ${r.largura} × ${r.altura} px</div>
                    <div style="color:#5f6b7f; font-size:12px; margin-top:2px;">
                        ${ampTamanho(r.blob.size)} · ${ganho === 1 ? 'mesmo tamanho, imagem limpa' : ganho.toFixed(0) + 'x maior de cada lado'}
                        · ${r.segundos.toFixed(1)}s · motor ${r.motor === 'ia' ? 'IA' : 'Nítido'}
                    </div>
                </div>
                <button class="btn btn-primary" onclick="ampBaixar()">⬇️ Baixar</button>
            </div>

            <div class="amp-rotulo" style="margin-bottom:6px;">Antes e depois</div>
            <div class="amp-comparar" id="ampComparar">
                <img src="${escAmp(ampImagem.url)}" alt="Antes">
                <div class="amp-depois" id="ampDepois" style="width:50%;">
                    <img src="${escAmp(r.url)}" alt="Depois" id="ampImagemDepois">
                </div>
            </div>
            <input type="range" id="ampCortina" min="0" max="100" value="50" style="width:100%; margin-top:8px;"
                   aria-label="Arraste para comparar antes e depois">
            <div style="display:flex; justify-content:space-between; color:#5f6b7f; font-size:12px;">
                <span>← antes (${ampImagem.largura} × ${ampImagem.altura})</span>
                <span>depois (${r.largura} × ${r.altura}) →</span>
            </div>
        </div>`;
}

// A cortina do "antes e depois". As duas imagens sao desenhadas no MESMO tamanho de
// tela, uma por cima da outra; o que se move e' so' a largura do recorte de cima. Por
// isso a de cima usa object-fit:fill e largura/altura de 100%: ela precisa acompanhar o
// enquadramento da de baixo, e nao o proprio.
function ampLigarComparador() {
    const cortina = document.getElementById('ampCortina');
    const depois = document.getElementById('ampDepois');
    const imagemDepois = document.getElementById('ampImagemDepois');
    const quadro = document.getElementById('ampComparar');
    if (!cortina || !depois || !imagemDepois || !quadro) return;

    const ajustar = () => {
        depois.style.width = cortina.value + '%';
        // A imagem de cima e' recortada pelo pai, entao ela precisa manter a largura do
        // QUADRO inteiro — senao ela encolhe junto com a cortina e a comparacao mente.
        imagemDepois.style.width = quadro.clientWidth + 'px';
        imagemDepois.style.height = quadro.clientHeight + 'px';
    };
    cortina.addEventListener('input', ajustar);
    window.addEventListener('resize', ajustar);
    ajustar();
}

// A tela nao usa modulos: os onclick do HTML gerado precisam achar isto no window.
window.renderAmpliar = renderAmpliar;
window.ampEscolherArquivo = ampEscolherArquivo;
window.ampSoltar = ampSoltar;
window.ampArrastando = ampArrastando;
window.ampTrocarImagem = ampTrocarImagem;
window.ampDefinir = ampDefinir;
window.ampExecutar = ampExecutar;
window.ampCancelar = ampCancelar;
window.ampBaixar = ampBaixar;

})();
