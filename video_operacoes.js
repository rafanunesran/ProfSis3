// video_operacoes.js — O MOTOR DA ABA "VIDEO": cortar, girar, juntar, comprimir... no aparelho.
//
// POR QUE ISTO EXISTE
//   O mesmo motivo das abas de PDF e de imagem. O video que o professor quer cortar — a
//   apresentacao da turma, o ensaio da festa junina, a gravacao da aula — tem o rosto e a
//   voz de criancas. Os sites gratuitos de "cortar video online" fazem upload: o arquivo
//   passa a existir no servidor de um terceiro que a escola nao autorizou.
//
//   Aqui quem trabalha e' o ffmpeg compilado para WebAssembly (ffmpeg.wasm), rodando
//   dentro do navegador. O PROGRAMA e' baixado do CDN (uma vez, ~32 MB, depois fica no
//   cache do navegador); o VIDEO nao sai do aparelho.
//
// COMO O FFMPEG E' CARREGADO
//   O @ffmpeg/ffmpeg cria um Web Worker, e o navegador nao deixa criar Worker a partir
//   de outro dominio (o CDN). A saida e' um worker-ponte criado aqui como URL de blob —
//   que conta como "desta pagina" — e que so' importa o worker de verdade do CDN (ver
//   carregarFfmpeg). Versao single-thread de proposito: a multi-thread exige cabecalhos
//   (COOP/COEP) que o GitHub Pages nao manda.
//
// O QUE FICA AQUI E O QUE FICA NA TELA
//   Este arquivo so' sabe transformar bytes em bytes. Nao desenha nada. Cada operacao
//   recebe (entradas, progresso) e devolve { arquivos: [{ nome, tipo, blob }], mensagem },
//   o mesmo contrato das operacoes de PDF — a tela (video.js) e' quem mostra e baixa.

(function (raiz) {
'use strict';

const ehNavegador = typeof window !== 'undefined' && typeof document !== 'undefined';

const VERSAO_FFMPEG = '0.12.15';
const VERSAO_NUCLEO = '0.12.10';
const CDN_FFMPEG = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@' + VERSAO_FFMPEG + '/dist/umd/';
const CDN_FFMPEG_ESM = CDN_FFMPEG.replace('/umd/', '/esm/');
const CDN_NUCLEO_ESM = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@' + VERSAO_NUCLEO + '/dist/esm/';

// Acima disso o WebAssembly (teto de 2 GB de memoria, e o arquivo entra e sai dela)
// costuma derrubar a aba antes de terminar.
const VIDEO_MAX_MB = 500;
const TAMANHO_WASM = 32232419;   // bytes de ffmpeg-core.wasm 0.12.10 (so' para a barra)

// Servidores para "Baixar video por link". O endereco colado vai para o primeiro que
// responder; a resposta e' o arquivo pronto. Formato da API: cobalt (github.com/imputnet/
// cobalt) — POST / com { url }, devolve { status: 'tunnel'|'redirect'|'picker', url }.
// Deixe vazio para aceitar so' link direto de arquivo (.mp4, .webm...).
// Formato: { url: 'https://...', chave: '' }  (chave vira "Authorization: Api-Key ...")
const SERVIDORES_DOWNLOAD_PADRAO = [];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function formatarTamanho(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
    return (b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',') + ' GB';
}

function formatarTempo(segundos) {
    const s = Math.max(0, Number(segundos) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s - h * 3600 - m * 60;
    const seg = (r < 10 ? '0' : '') + r.toFixed(r % 1 ? 1 : 0).replace('.', ',');
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + seg;
}

// "1:30", "01:02:03", "90", "1,5" -> segundos. Devolve NaN quando nao entende.
function lerTempo(texto) {
    const t = String(texto == null ? '' : texto).trim().replace(',', '.');
    if (!t) return NaN;
    if (!/^[\d.:]+$/.test(t)) return NaN;
    const partes = t.split(':');
    if (partes.length > 3) return NaN;
    let total = 0;
    for (let i = 0; i < partes.length; i++) {
        if (partes[i] === '' || isNaN(Number(partes[i]))) return NaN;
        total = total * 60 + Number(partes[i]);
    }
    return total;
}

function nomeBase(nome) {
    return String(nome || 'video').replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'video';
}

function extensao(nome, padrao) {
    const m = /\.([a-z0-9]{2,5})$/i.exec(String(nome || ''));
    return m ? m[1].toLowerCase() : padrao;
}

async function bytesDe(arquivo) {
    if (arquivo instanceof Uint8Array) return arquivo;
    if (arquivo && arquivo.arrayBuffer) return new Uint8Array(await arquivo.arrayBuffer());
    throw new Error('Arquivo invalido.');
}

// ---------------------------------------------------------------------------
// Carregar o ffmpeg
// ---------------------------------------------------------------------------

let _ffmpeg = null;          // instancia pronta
let _carregando = null;      // Promise do carregamento em andamento
let _ouvinteProgresso = null;
let _logs = [];

function carregarScript(src) {
    return new Promise((ok, falha) => {
        if (raiz.FFmpegWASM) return ok();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => ok();
        s.onerror = () => { s.remove(); falha(new Error('falha de rede')); };
        document.head.appendChild(s);
    });
}

// Baixa e devolve uma URL de blob, contando o progresso (o nucleo tem ~32 MB; sem
// barra, o professor acha que travou).
async function blobUrlDe(url, tipo, aoAvancar) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status + ' em ' + url);
    const total = Number(resposta.headers.get('content-length')) || 0;
    let blob;
    if (resposta.body && resposta.body.getReader && aoAvancar) {
        const leitor = resposta.body.getReader();
        const pedacos = [];
        let recebido = 0;
        for (;;) {
            const { done, value } = await leitor.read();
            if (done) break;
            pedacos.push(value);
            recebido += value.length;
            aoAvancar(recebido, total);
        }
        blob = new Blob(pedacos, { type: tipo });
    } else {
        blob = new Blob([await resposta.arrayBuffer()], { type: tipo });
    }
    return URL.createObjectURL(blob);
}

async function comTentativas(fn, rotulo) {
    const esperas = [0, 800, 2000];
    let ultimo = null;
    for (let i = 0; i < esperas.length; i++) {
        if (esperas[i]) await new Promise(ok => setTimeout(ok, esperas[i]));
        try { return await fn(); } catch (e) { ultimo = e; }
    }
    throw new Error('Nao consegui baixar ' + rotulo + ' depois de 3 tentativas. Verifique a conexao ' +
                    'e tente de novo. (' + (ultimo && ultimo.message || ultimo) + ')');
}

async function carregarFfmpeg(progresso) {
    if (_ffmpeg) return _ffmpeg;
    if (!ehNavegador) throw new Error('O motor de video so' + "'" + ' existe no navegador.');
    if (typeof WebAssembly === 'undefined') {
        throw new Error('Este navegador nao tem WebAssembly, que o editor de video precisa. ' +
                        'Use uma versao recente do Chrome, Edge, Firefox ou Safari.');
    }
    if (_carregando) return _carregando;

    const avisar = progresso || (() => {});
    _carregando = (async () => {
        avisar(1, 'Preparando o editor de video...');
        await comTentativas(() => carregarScript(CDN_FFMPEG + 'ffmpeg.js'), 'o editor de video');
        // Com classWorkerURL o ffmpeg cria o worker como MODULO, e modulo nao tem
        // importScripts. Entao o worker e' uma ponte de uma linha que importa a versao ESM
        // do worker direto do CDN (import de outro dominio com CORS e' permitido; criar o
        // Worker de outro dominio nao e'), e o nucleo tambem vai na versao ESM.
        const worker = URL.createObjectURL(new Blob(['import "' + CDN_FFMPEG_ESM + 'worker.js";'], { type: 'text/javascript' }));
        const nucleo = await comTentativas(() => blobUrlDe(CDN_NUCLEO_ESM + 'ffmpeg-core.js', 'text/javascript'), 'o editor de video');
        const wasm = await comTentativas(() => blobUrlDe(CDN_NUCLEO_ESM + 'ffmpeg-core.wasm', 'application/wasm',
            (recebido) => {
                // O content-length do CDN e' o tamanho COMPRIMIDO (~9 MB); o que chega
                // aqui ja' e' descomprimido. Por isso o total e' o tamanho conhecido.
                const total = TAMANHO_WASM;
                const pct = Math.min(1, recebido / total);
                avisar(2 + Math.round(pct * 16),
                    'Baixando o editor de video (so’ na primeira vez): ' +
                    formatarTamanho(Math.min(recebido, total)) + ' de ' + formatarTamanho(total));
            }), 'o editor de video');

        avisar(19, 'Ligando o editor de video...');
        const ffmpeg = new raiz.FFmpegWASM.FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            _logs.push(message);
            if (_logs.length > 400) _logs.splice(0, _logs.length - 400);
        });
        ffmpeg.on('progress', ({ progress }) => {
            if (_ouvinteProgresso) _ouvinteProgresso(progress);
        });
        try {
            await ffmpeg.load({ coreURL: nucleo, wasmURL: wasm, classWorkerURL: worker });
        } catch (erro) {
            try { ffmpeg.terminate(); } catch (_) { /* nem chegou a ligar */ }
            throw new Error('Nao consegui ligar o editor de video. Verifique a conexao e tente de novo. (' +
                            (erro && erro.message || erro) + ')');
        }
        _ffmpeg = ffmpeg;
        return ffmpeg;
    })();

    try {
        return await _carregando;
    } finally {
        _carregando = null;
    }
}

// Cancelar = derrubar o worker. O ffmpeg.wasm nao tem "parar no meio"; o proximo uso
// carrega de novo (do cache do navegador, rapido).
function cancelar() {
    if (_ffmpeg) {
        try { _ffmpeg.terminate(); } catch (_) { /* ja' parou */ }
        _ffmpeg = null;
    }
}

let _contador = 0;
function nomeTemp(ext) {
    _contador += 1;
    return 'v' + Date.now().toString(36) + '_' + _contador + '.' + ext;
}

// Roda um comando e devolve o codigo de saida. Os logs ficam guardados para a mensagem
// de erro dizer o que o ffmpeg reclamou, e para sondar() ler duracao e tamanho.
async function exec(ffmpeg, args, aoAvancar) {
    _logs = [];
    _ouvinteProgresso = aoAvancar || null;
    try {
        return await ffmpeg.exec(args);
    } finally {
        _ouvinteProgresso = null;
    }
}

function ultimoErro() {
    const uteis = _logs.filter(l => /error|invalid|not found|no such|unable|could not|failed|matches no streams/i.test(l));
    return (uteis.slice(-2).join(' | ') || _logs.slice(-2).join(' | ') || '').slice(0, 300);
}

async function apagar(ffmpeg, nomes) {
    for (const n of nomes) {
        try { await ffmpeg.deleteFile(n); } catch (_) { /* nunca existiu */ }
    }
}

// O que tem dentro do arquivo: duracao, largura, altura, se tem som. O ffmpeg
// "sem saida" termina com erro, mas antes imprime o cabecalho — e' isso que lemos.
async function sondarNoFfmpeg(ffmpeg, nome) {
    await exec(ffmpeg, ['-hide_banner', '-i', nome]);
    const texto = _logs.join('\n');
    const info = { duracao: 0, largura: 0, altura: 0, temAudio: false, temVideo: false };
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(texto);
    if (d) info.duracao = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
    const v = /Stream #[^\n]*Video:[^\n]*?\s(\d{2,5})x(\d{2,5})[\s,\]]/.exec(texto);
    if (v) { info.temVideo = true; info.largura = Number(v[1]); info.altura = Number(v[2]); }
    const r = /rotate\s*:\s*(-?\d+)|displaymatrix: rotation of (-?[\d.]+)/i.exec(texto);
    if (r && info.largura && Math.abs(Math.round(Number(r[1] || r[2]))) % 180 === 90) {
        const t = info.largura; info.largura = info.altura; info.altura = t;
    }
    info.temAudio = /Stream #[^\n]*Audio:/.test(texto);
    // Video gravado no navegador (MediaRecorder) sai sem duracao no cabecalho. Ai' a
    // duracao e' medida lendo o arquivo inteiro sem decodificar (copia para o nada).
    if (!info.duracao && (info.temVideo || info.temAudio)) {
        await exec(ffmpeg, ['-hide_banner', '-i', nome, '-map', '0', '-c', 'copy', '-f', 'null', '-']);
        const tempos = _logs.join('\n').match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g) || [];
        const ultimo = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(tempos[tempos.length - 1] || '');
        if (ultimo) info.duracao = Number(ultimo[1]) * 3600 + Number(ultimo[2]) * 60 + Number(ultimo[3]);
    }
    return info;
}

// O esqueleto de toda operacao: escreve as entradas, roda, le a saida, limpa.
// A barra vai de 20% (motor pronto) a 99%.
async function rodar(opcoes) {
    const { entradas, montar, saida, tipoSaida, nomeSaida, progresso, duracaoEsperada } = opcoes;
    const avisar = progresso || (() => {});
    const ffmpeg = await carregarFfmpeg(avisar);

    avisar(20, 'Lendo o arquivo...');
    const nomes = [];
    for (const e of entradas) {
        const nome = nomeTemp(e.ext);
        await ffmpeg.writeFile(nome, await bytesDe(e.arquivo));
        nomes.push(nome);
    }
    const infos = [];
    if (opcoes.sondar) {
        for (const n of nomes) infos.push(await sondarNoFfmpeg(ffmpeg, n));
    }
    const nomeFinal = nomeTemp(saida);
    const inicio = Date.now();
    const args = await montar(nomes, nomeFinal, infos, ffmpeg);

    avisar(22, 'Processando...');
    const codigo = await exec(ffmpeg, args, (p) => {
        // O progresso do ffmpeg.wasm e' fracao 0..1 do tempo do arquivo de saida,
        // mas pode vir fora da faixa quando ele nao sabe a duracao.
        if (!(p >= 0 && p <= 1)) return;
        const pct = 22 + Math.round(p * 76);
        const passado = (Date.now() - inicio) / 1000;
        const falta = p > 0.03 ? passado / p - passado : 0;
        avisar(pct, 'Processando: ' + Math.round(p * 100) + '%' +
            (falta > 2 ? ' — falta cerca de ' + formatarTempo(Math.round(falta)) : ''));
    });

    let dados = null;
    try { dados = await ffmpeg.readFile(nomeFinal); } catch (_) { dados = null; }
    await apagar(ffmpeg, nomes.concat([nomeFinal], opcoes.extrasParaApagar || []));

    if (codigo !== 0 || !dados || !dados.length) {
        const detalhe = ultimoErro();
        throw new Error('O editor de video nao conseguiu processar este arquivo' +
            (detalhe ? ' (' + detalhe + ')' : '') + '. Ele pode estar corrompido ou num formato incomum.');
    }
    avisar(99, 'Finalizando...');
    return { blob: new Blob([dados], { type: tipoSaida }), nome: nomeSaida, infos: infos, duracao: duracaoEsperada };
}

// Parametros de codificacao: preset rapido de proposito — no WebAssembly tudo e'
// ~10x mais lento que no computador, e "ultrafast" e' o que deixa um video de
// alguns minutos terminar enquanto o professor ainda esta' olhando.
function h264(crf) {
    return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf || 23), '-pix_fmt', 'yuv420p'];
}
const AAC = ['-c:a', 'aac', '-b:a', '128k'];
const MP4_FIM = ['-movflags', '+faststart'];

// Dimensao par e' exigencia do H.264 com yuv420p.
const par = (n) => Math.max(2, Math.round(n / 2) * 2);

function arquivoUnico(entradas) {
    const a = entradas.arquivo;
    if (!a) throw new Error('Escolha o video primeiro.');
    if (a.size > VIDEO_MAX_MB * 1024 * 1024) {
        throw new Error('Este video tem ' + formatarTamanho(a.size) + '. O editor no navegador aguenta até cerca de ' +
                        VIDEO_MAX_MB + ' MB — corte-o em partes menores num computador, ou use um arquivo menor.');
    }
    return a;
}

function resultadoMp4(r, mensagem) {
    return { arquivos: [{ nome: r.nome, tipo: r.blob.type, blob: r.blob }], mensagem: mensagem };
}

// Filtro de "atempo" so' aceita 0,5 a 2 por vez: fatores fora disso viram corrente.
function cadeiaAtempo(fator) {
    const partes = [];
    let f = fator;
    while (f > 2) { partes.push('atempo=2'); f /= 2; }
    while (f < 0.5) { partes.push('atempo=0.5'); f /= 0.5; }
    partes.push('atempo=' + f.toFixed(4));
    return partes.join(',');
}

// ---------------------------------------------------------------------------
// As operacoes
// ---------------------------------------------------------------------------

const ops = {};

ops.cortar = async (e, progresso) => {
    const a = arquivoUnico(e);
    const inicio = lerTempo(e.inicio);
    const fim = lerTempo(e.fim);
    if (isNaN(inicio) || inicio < 0) throw new Error('O inicio precisa ser um tempo, como 0:15 ou 1:02:30.');
    if (isNaN(fim)) throw new Error('O fim precisa ser um tempo, como 0:45 ou 1:05:00.');
    if (fim <= inicio) throw new Error('O fim precisa vir depois do inicio.');
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }],
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_cortado.mp4', progresso,
        montar: (n, s) => ['-ss', String(inicio), '-i', n[0], '-t', String(fim - inicio)]
            .concat(h264(23), AAC, MP4_FIM, [s])
    });
    return resultadoMp4(r, 'Trecho de ' + formatarTempo(inicio) + ' a ' + formatarTempo(fim) +
        ' (' + formatarTempo(fim - inicio) + ').');
};

ops.girar = async (e, progresso) => {
    const a = arquivoUnico(e);
    const filtros = { '90': 'transpose=1', '180': 'hflip,vflip', '270': 'transpose=2' };
    const filtro = filtros[String(e.angulo)];
    if (!filtro) throw new Error('Escolha quanto girar.');
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }],
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_girado.mp4', progresso,
        montar: (n, s) => ['-i', n[0], '-vf', filtro].concat(h264(23), AAC, MP4_FIM, [s])
    });
    const rotulo = { '90': '90° no sentido horário', '180': '180°', '270': '90° no sentido anti-horário' };
    return resultadoMp4(r, 'Vídeo girado ' + rotulo[String(e.angulo)] + '.');
};

ops.espelhar = async (e, progresso) => {
    const a = arquivoUnico(e);
    const filtro = e.direcao === 'vertical' ? 'vflip' : 'hflip';
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }],
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_espelhado.mp4', progresso,
        montar: (n, s) => ['-i', n[0], '-vf', filtro].concat(h264(23), AAC, MP4_FIM, [s])
    });
    return resultadoMp4(r, e.direcao === 'vertical' ? 'Vídeo virado de cabeça para baixo.' : 'Vídeo espelhado (esquerda ↔ direita).');
};

// Recortar a imagem (tirar bordas / mudar o formato do quadro). As proporcoes prontas
// pegam o maior pedaco central possivel; o modo manual usa os pixels informados.
ops.recortar = async (e, progresso) => {
    const a = arquivoUnico(e);
    let descricao = '';
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }], sondar: true,
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_recortado.mp4', progresso,
        montar: (n, s, infos) => {
            const W = infos[0].largura, H = infos[0].altura;
            if (!W || !H) throw new Error('Nao consegui ler o tamanho da imagem deste video.');
            let w, h, x, y;
            if (e.modo === 'manual') {
                w = Number(e.largura); h = Number(e.altura); x = Number(e.x) || 0; y = Number(e.y) || 0;
                if (!(w > 0) || !(h > 0)) throw new Error('Informe largura e altura do recorte, em pixels.');
                if (x < 0 || y < 0 || x + w > W || y + h > H) {
                    throw new Error('O recorte sai do video, que tem ' + W + ' x ' + H + ' pixels.');
                }
            } else {
                const [pw, ph] = String(e.proporcao || '1:1').split(':').map(Number);
                if (W / H > pw / ph) { h = H; w = H * pw / ph; } else { w = W; h = W * ph / pw; }
                x = (W - w) / 2; y = (H - h) / 2;
            }
            w = par(Math.min(w, W)); h = par(Math.min(h, H));
            x = Math.max(0, Math.min(Math.round(x), W - w)); y = Math.max(0, Math.min(Math.round(y), H - h));
            descricao = 'Recorte de ' + w + ' x ' + h + ' pixels (o original tinha ' + W + ' x ' + H + ').';
            return ['-i', n[0], '-vf', 'crop=' + w + ':' + h + ':' + x + ':' + y].concat(h264(23), AAC, MP4_FIM, [s]);
        }
    });
    return resultadoMp4(r, descricao);
};

ops.redimensionar = async (e, progresso) => {
    const a = arquivoUnico(e);
    let descricao = '';
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }], sondar: true,
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_redimensionado.mp4', progresso,
        montar: (n, s, infos) => {
            const W = infos[0].largura, H = infos[0].altura;
            let w, h;
            if (e.modo === 'porcentagem') {
                const p = Number(e.porcentagem) / 100;
                if (!(p > 0)) throw new Error('Informe a porcentagem.');
                if (!W || !H) throw new Error('Nao consegui ler o tamanho da imagem deste video.');
                w = par(W * p); h = par(H * p);
            } else if (e.modo === 'manual') {
                w = Number(e.largura); h = Number(e.altura);
                if (!(w > 0) && !(h > 0)) throw new Error('Informe a largura, a altura, ou as duas.');
                if (!(w > 0)) w = W && H ? par(h * W / H) : -2;
                else if (!(h > 0)) h = W && H ? par(w * H / W) : -2;
                else if (!e.distorcer && W && H) h = par(w * H / W);
                if (w > 0) w = par(w);
                if (h > 0) h = par(h);
            } else {
                // Predefinido: o lado MENOR vira o numero escolhido (720p de um video em
                // pe' e' 720 de largura, nao de altura).
                const alvo = Number(e.predefinido) || 720;
                if (W && H && W < H) { w = par(alvo); h = par(alvo * H / W); } else if (W && H) { h = par(alvo); w = par(alvo * W / H); } else { w = -2; h = par(alvo); }
            }
            if (w > 8192 || h > 8192) throw new Error('Tamanho grande demais (maximo 8192 pixels de lado).');
            descricao = 'Novo tamanho: ' + w + ' x ' + h + ' pixels' + (W ? ' (era ' + W + ' x ' + H + ').' : '.');
            return ['-i', n[0], '-vf', 'scale=' + w + ':' + h + ':flags=bicubic,setsar=1'].concat(h264(23), AAC, MP4_FIM, [s]);
        }
    });
    return resultadoMp4(r, descricao);
};

ops.comprimir = async (e, progresso) => {
    const a = arquivoUnico(e);
    const niveis = { leve: 26, media: 30, forte: 35 };
    const crf = niveis[e.nivel] || 30;
    const limite = Number(e.limiteAltura) || 0;
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }], sondar: !!limite,
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_comprimido.mp4', progresso,
        montar: (n, s, infos) => {
            const args = ['-i', n[0]];
            if (limite && infos[0]) {
                const W = infos[0].largura, H = infos[0].altura;
                const menor = Math.min(W, H);
                if (menor > limite) {
                    args.push('-vf', W < H ? 'scale=' + par(limite) + ':-2' : 'scale=-2:' + par(limite));
                }
            }
            return args.concat(h264(crf), ['-c:a', 'aac', '-b:a', e.nivel === 'forte' ? '64k' : '96k'], MP4_FIM, [s]);
        }
    });
    const antes = a.size, depois = r.blob.size;
    const ganho = antes ? Math.round((1 - depois / antes) * 100) : 0;
    return Object.assign(resultadoMp4(r, ganho > 0
        ? 'De ' + formatarTamanho(antes) + ' para ' + formatarTamanho(depois) + ' — ' + ganho + '% menor.'
        : 'O resultado (' + formatarTamanho(depois) + ') não ficou menor que o original (' + formatarTamanho(antes) +
          '): este vídeo já estava bem comprimido. Tente o nível "forte" ou reduzir a resolução.'), { antes, depois });
};

ops.velocidade = async (e, progresso) => {
    const a = arquivoUnico(e);
    const f = Number(e.fator);
    if (!(f >= 0.25 && f <= 4)) throw new Error('A velocidade precisa ficar entre 0,25x e 4x.');
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }], sondar: true,
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_' + String(f).replace('.', ',') + 'x.mp4', progresso,
        montar: (n, s, infos) => {
            const args = ['-i', n[0], '-filter:v', 'setpts=PTS/' + f];
            if (infos[0].temAudio && !e.semAudio) args.push('-filter:a', cadeiaAtempo(f));
            else args.push('-an');
            return args.concat(h264(23), infos[0].temAudio && !e.semAudio ? AAC : [], MP4_FIM, [s]);
        }
    });
    return resultadoMp4(r, 'Velocidade ' + String(f).replace('.', ',') + 'x' + (f > 1 ? ' (mais rápido).' : f < 1 ? ' (câmera lenta).' : '.'));
};

ops.repetir = async (e, progresso) => {
    const a = arquivoUnico(e);
    const vezes = Math.round(Number(e.vezes));
    if (!(vezes >= 2 && vezes <= 50)) throw new Error('Escolha de 2 a 50 repeticoes.');
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }],
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_' + vezes + 'x.mp4', progresso,
        montar: (n, s) => ['-stream_loop', String(vezes - 1), '-i', n[0]].concat(h264(23), AAC, MP4_FIM, [s])
    });
    return resultadoMp4(r, 'O vídeo agora toca ' + vezes + ' vezes seguidas.');
};

// Juntar videos de tamanhos e origens diferentes: cada um e' encaixado (com faixas
// pretas, sem esticar) no tamanho do PRIMEIRO, e quem nao tem som ganha silencio —
// senao o filtro concat recusa a mistura.
ops.juntar = async (e, progresso) => {
    const lista = e.arquivos || [];
    if (lista.length < 2) throw new Error('Escolha pelo menos dois videos.');
    const total = lista.reduce((s, a) => s + (a.size || 0), 0);
    if (total > VIDEO_MAX_MB * 1024 * 1024) {
        throw new Error('Os videos somam ' + formatarTamanho(total) + '. O editor no navegador aguenta até cerca de ' + VIDEO_MAX_MB + ' MB no total.');
    }
    const r = await rodar({
        entradas: lista.map(a => ({ arquivo: a, ext: extensao(a.name, 'mp4') })), sondar: true,
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(lista[0].name) + '_juntado.mp4', progresso,
        montar: (n, s, infos) => {
            const W = par(infos[0].largura || 1280), H = par(infos[0].altura || 720);
            const args = [];
            n.forEach(nome => args.push('-i', nome));
            const partes = [];
            let entradasConcat = '';
            infos.forEach((info, i) => {
                partes.push('[' + i + ':v]scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,' +
                    'pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v' + i + ']');
                if (info.temAudio) {
                    partes.push('[' + i + ':a]aformat=sample_rates=44100:channel_layouts=stereo[a' + i + ']');
                } else {
                    partes.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + (info.duracao || 1).toFixed(3) + '[a' + i + ']');
                }
                entradasConcat += '[v' + i + '][a' + i + ']';
            });
            partes.push(entradasConcat + 'concat=n=' + n.length + ':v=1:a=1[v][a]');
            return args.concat(['-filter_complex', partes.join(';'), '-map', '[v]', '-map', '[a]'],
                h264(23), AAC, MP4_FIM, [s]);
        }
    });
    return resultadoMp4(r, lista.length + ' vídeos juntados, na ordem da lista.');
};

ops.adicionarAudio = async (e, progresso) => {
    const a = arquivoUnico(e);
    const som = e.audio;
    if (!som) throw new Error('Escolha o arquivo de audio.');
    const volume = Math.max(0, Math.min(2, (Number(e.volume) || 100) / 100));
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }, { arquivo: som, ext: extensao(som.name, 'mp3') }], sondar: true,
        saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase(a.name) + '_com_audio.mp4', progresso,
        montar: (n, s, infos) => {
            const dur = infos[0].duracao;
            const args = [];
            args.push('-i', n[0]);
            if (e.repetirAudio) args.push('-stream_loop', '-1');
            args.push('-i', n[1]);
            let filtro;
            if (e.modo === 'misturar' && infos[0].temAudio) {
                filtro = '[1:a]volume=' + volume + '[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]';
            } else {
                filtro = '[1:a]volume=' + volume + '[a]';
            }
            args.push('-filter_complex', filtro, '-map', '0:v', '-map', '[a]');
            if (dur) args.push('-t', dur.toFixed(3));
            return args.concat(h264(23), AAC, MP4_FIM, [s]);
        }
    });
    return resultadoMp4(r, e.modo === 'misturar' ? 'Áudio misturado ao som original do vídeo.' : 'O som do vídeo foi trocado pelo áudio escolhido.');
};

ops.extrairAudio = async (e, progresso) => {
    const a = arquivoUnico(e);
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }], sondar: true,
        saida: 'mp3', tipoSaida: 'audio/mpeg', nomeSaida: nomeBase(a.name) + '.mp3', progresso,
        montar: (n, s, infos) => {
            if (!infos[0].temAudio) throw new Error('Este video nao tem som para extrair.');
            return ['-i', n[0], '-vn', '-c:a', 'libmp3lame', '-q:a', '3', s];
        }
    });
    return { arquivos: [{ nome: r.nome, tipo: 'audio/mpeg', blob: r.blob }], mensagem: 'Áudio extraído em MP3.' };
};

// GIF com paleta propria (palettegen/paletteuse): sem ela o GIF fica todo pontilhado.
function filtroGif(fps, largura, extra) {
    const escala = largura ? 'scale=' + largura + ':-1:flags=lanczos,' : '';
    return (extra ? extra + ',' : '') + 'fps=' + fps + ',' + escala +
        'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5';
}

ops.videoParaGif = async (e, progresso) => {
    const a = arquivoUnico(e);
    const inicio = e.inicio ? lerTempo(e.inicio) : 0;
    const duracao = e.duracao ? lerTempo(e.duracao) : 0;
    if (isNaN(inicio) || inicio < 0) throw new Error('O inicio precisa ser um tempo, como 0:05.');
    if (isNaN(duracao) || duracao < 0) throw new Error('A duracao precisa ser um tempo, como 0:04 ou 4.');
    const fps = Math.max(2, Math.min(30, Number(e.fps) || 10));
    const largura = Number(e.largura) || 0;
    const r = await rodar({
        entradas: [{ arquivo: a, ext: extensao(a.name, 'mp4') }],
        saida: 'gif', tipoSaida: 'image/gif', nomeSaida: nomeBase(a.name) + '.gif', progresso,
        montar: (n, s) => {
            const args = [];
            if (inicio) args.push('-ss', String(inicio));
            if (duracao) args.push('-t', String(duracao));
            return args.concat(['-i', n[0], '-filter_complex', filtroGif(fps, largura), '-loop', '0', s]);
        }
    });
    return { arquivos: [{ nome: r.nome, tipo: 'image/gif', blob: r.blob }], mensagem: 'GIF com ' + fps + ' quadros por segundo.' };
};

ops.velocidadeGif = async (e, progresso) => {
    const a = arquivoUnico(e);
    const f = Number(e.fator);
    if (!(f >= 0.1 && f <= 10)) throw new Error('A velocidade precisa ficar entre 0,1x e 10x.');
    const r = await rodar({
        entradas: [{ arquivo: a, ext: 'gif' }],
        saida: 'gif', tipoSaida: 'image/gif', nomeSaida: nomeBase(a.name) + '_' + String(f).replace('.', ',') + 'x.gif', progresso,
        // O GIF guarda o tempo de cada quadro em centesimos: acelerar alem disso
        // precisa descartar quadros, e e' o fps=... que faz isso sem travar o ritmo.
        montar: (n, s) => ['-i', n[0], '-filter_complex',
            '[0:v]setpts=PTS/' + f + ',fps=' + Math.min(50, Math.max(5, Math.round(12 * f))) +
            ',split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse', '-loop', '0', s]
    });
    return { arquivos: [{ nome: r.nome, tipo: 'image/gif', blob: r.blob }],
             mensagem: 'GIF ' + (f > 1 ? 'acelerado' : 'desacelerado') + ' para ' + String(f).replace('.', ',') + 'x.' };
};

// Imagens -> GIF. As imagens chegam em tamanhos e formatos variados; cada uma e'
// desenhada num quadro do mesmo tamanho (centralizada, com fundo) antes de ir para o
// ffmpeg, que so' precisa montar a animacao.
async function imagemParaPng(arquivo, W, H, fundo) {
    const url = URL.createObjectURL(arquivo);
    try {
        const img = await new Promise((ok, falha) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = () => falha(new Error('Nao consegui ler a imagem "' + arquivo.name + '".'));
            i.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = fundo || '#ffffff';
        ctx.fillRect(0, 0, W, H);
        const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
        const w = img.naturalWidth * k, h = img.naturalHeight * k;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
        return { bytes: new Uint8Array(await blob.arrayBuffer()), largura: img.naturalWidth, altura: img.naturalHeight };
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function dimensoesDe(arquivo) {
    const url = URL.createObjectURL(arquivo);
    try {
        return await new Promise((ok, falha) => {
            const i = new Image();
            i.onload = () => ok({ largura: i.naturalWidth, altura: i.naturalHeight });
            i.onerror = () => falha(new Error('Nao consegui ler a imagem "' + arquivo.name + '".'));
            i.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

ops.imagensParaGif = async (e, progresso) => {
    const lista = e.imagens || [];
    if (lista.length < 2) throw new Error('Escolha pelo menos duas imagens.');
    if (lista.length > 300) throw new Error('No maximo 300 imagens por GIF.');
    const avisar = progresso || (() => {});
    const segundos = Math.max(0.02, Math.min(10, Number(String(e.segundos || '0.5').replace(',', '.')) || 0.5));
    const primeira = await dimensoesDe(lista[0]);
    const larguraAlvo = Math.max(16, Math.min(1920, Number(e.largura) || Math.min(primeira.largura, 800)));
    const W = par(larguraAlvo), H = par(larguraAlvo * primeira.altura / primeira.largura);

    const ffmpeg = await carregarFfmpeg(avisar);
    const prefixo = nomeTemp('q').replace(/\.q$/, '');
    const nomes = [];
    for (let i = 0; i < lista.length; i++) {
        avisar(20 + Math.round(i / lista.length * 30), 'Preparando imagem ' + (i + 1) + ' de ' + lista.length + '...');
        const png = await imagemParaPng(lista[i], W, H, e.fundo);
        const nome = prefixo + '_' + String(i).padStart(4, '0') + '.png';
        await ffmpeg.writeFile(nome, png.bytes);
        nomes.push(nome);
    }
    const saida = nomeTemp('gif');
    avisar(52, 'Montando o GIF...');
    const codigo = await exec(ffmpeg, ['-framerate', String(1 / segundos), '-i', prefixo + '_%04d.png',
        '-filter_complex', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-r', String(Math.max(1 / segundos, 1)),
        '-loop', e.repetir === false ? '-1' : '0', saida]);
    let dados = null;
    try { dados = await ffmpeg.readFile(saida); } catch (_) { dados = null; }
    await apagar(ffmpeg, nomes.concat([saida]));
    if (codigo !== 0 || !dados || !dados.length) throw new Error('Nao consegui montar o GIF (' + ultimoErro() + ').');
    const blob = new Blob([dados], { type: 'image/gif' });
    return { arquivos: [{ nome: 'animacao.gif', tipo: 'image/gif', blob }],
             mensagem: lista.length + ' imagens, ' + String(segundos).replace('.', ',') + ' s cada, ' + W + ' x ' + H + ' pixels.' };
};

// ---------------------------------------------------------------------------
// Baixar video por link
// ---------------------------------------------------------------------------
// Dois caminhos:
//   1. link que ja' e' o arquivo (termina em .mp4, .webm...): baixa direto;
//   2. qualquer outro link: pergunta aos servidores configurados (API do cobalt), que
//      devolvem o endereco do arquivo.
// Aqui NAO passa arquivo do professor: o que sai e' o endereco publico colado.

function servidoresDownload() {
    let lista = SERVIDORES_DOWNLOAD_PADRAO.slice();
    if (raiz.PROFSIS_VIDEO_SERVIDORES && Array.isArray(raiz.PROFSIS_VIDEO_SERVIDORES)) {
        lista = raiz.PROFSIS_VIDEO_SERVIDORES.concat(lista);
    }
    return lista.map(s => (typeof s === 'string' ? { url: s, chave: '' } : s)).filter(s => s && /^https:\/\//i.test(s.url));
}

function ehLinkDeArquivo(url) {
    return /\.(mp4|webm|mov|m4v|mkv|ogv|mp3|m4a|ogg|wav|gif)(\?|#|$)/i.test(url);
}

function validarLink(texto) {
    const t = String(texto || '').trim();
    let u;
    try { u = new URL(t); } catch (_) { throw new Error('Isso nao parece um link. Cole o endereco completo, comecando com https://'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('O link precisa comecar com http:// ou https://');
    return u.href;
}

async function baixarComProgresso(url, aoAvancar, sinal) {
    const resposta = await fetch(url, { signal: sinal });
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    const total = Number(resposta.headers.get('content-length')) || 0;
    const tipo = (resposta.headers.get('content-type') || '').split(';')[0];
    const disposicao = resposta.headers.get('content-disposition') || '';
    if (!resposta.body || !resposta.body.getReader) {
        return { blob: await resposta.blob(), tipo, disposicao };
    }
    const leitor = resposta.body.getReader();
    const pedacos = [];
    let recebido = 0;
    for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        pedacos.push(value);
        recebido += value.length;
        if (aoAvancar) aoAvancar(recebido, total);
    }
    return { blob: new Blob(pedacos, { type: tipo || 'application/octet-stream' }), tipo, disposicao };
}

function nomeDoCabecalho(disposicao) {
    const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposicao || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1] || m[2]); } catch (_) { return m[1] || m[2]; }
}

async function perguntarAoServidor(servidor, link, qualidade, soAudio) {
    const cabecalhos = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (servidor.chave) cabecalhos['Authorization'] = 'Api-Key ' + servidor.chave;
    const corpo = { url: link, videoQuality: String(qualidade || '720'), filenameStyle: 'basic' };
    if (soAudio) { corpo.downloadMode = 'audio'; corpo.audioFormat = 'mp3'; }
    const resposta = await fetch(servidor.url.replace(/\/$/, '') + '/', {
        method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo)
    });
    let json = null;
    try { json = await resposta.json(); } catch (_) { json = null; }
    if (!json) throw new Error('resposta invalida (HTTP ' + resposta.status + ')');
    if (json.status === 'error') {
        const codigo = (json.error && json.error.code) || 'erro';
        const e = new Error(codigo);
        e.codigo = codigo;
        throw e;
    }
    if (json.status === 'picker') {
        const itens = (json.picker || []).filter(p => p && p.url);
        const video = itens.find(p => p.type === 'video') || itens[0];
        if (!video) throw new Error('nenhum arquivo no link');
        return { url: video.url, nome: '', opcoes: itens };
    }
    if ((json.status === 'tunnel' || json.status === 'redirect' || json.status === 'stream') && json.url) {
        return { url: json.url, nome: json.filename || '' };
    }
    throw new Error('resposta inesperada: ' + (json.status || '?'));
}

// Traducao dos codigos de erro do cobalt para o professor. Nenhum deles cita
// plataforma: a mensagem fala do LINK.
function explicarErroDownload(codigo) {
    const c = String(codigo || '');
    if (/private|login|age|auth\.required/i.test(c)) return 'Este vídeo é privado ou exige login, e por isso não pode ser baixado.';
    if (/unavailable|not_found|empty|no_media/i.test(c)) return 'Não encontrei vídeo neste link. Confira se o endereço está completo e se o vídeo ainda existe.';
    if (/unsupported|link\.invalid/i.test(c)) return 'Não consegui baixar a partir deste link.';
    if (/too_long|duration/i.test(c)) return 'Este vídeo é longo demais para baixar por aqui.';
    if (/rate|limit/i.test(c)) return 'Muitos pedidos agora. Espere um minuto e tente de novo.';
    return '';
}

ops.baixarLink = async (e, progresso) => {
    const avisar = progresso || (() => {});
    const link = validarLink(e.link);
    const soAudio = e.formato === 'audio';

    const salvar = async (url, nomeSugerido) => {
        avisar(10, 'Baixando...');
        const r = await baixarComProgresso(url, (recebido, total) => {
            avisar(total ? 10 + Math.round(recebido / total * 88) : 50,
                'Baixando: ' + formatarTamanho(recebido) + (total ? ' de ' + formatarTamanho(total) : ''));
        });
        let nome = nomeDoCabecalho(r.disposicao) || nomeSugerido;
        if (!nome) {
            try { nome = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch (_) { nome = ''; }
        }
        const tipo = r.blob.type && r.blob.type !== 'application/octet-stream' ? r.blob.type : (soAudio ? 'audio/mpeg' : 'video/mp4');
        if (/^text\/html/i.test(tipo)) throw new Error('O link abriu uma pagina, nao um arquivo de video.');
        if (!nome || !/\.[a-z0-9]{2,5}$/i.test(nome)) nome = (nome || 'video') + (/audio/.test(tipo) ? '.mp3' : /gif/.test(tipo) ? '.gif' : /webm/.test(tipo) ? '.webm' : '.mp4');
        return { arquivos: [{ nome, tipo, blob: r.blob }], mensagem: 'Download concluído: ' + formatarTamanho(r.blob.size) + '.' };
    };

    // 1. Link direto para o arquivo.
    if (ehLinkDeArquivo(link)) {
        try {
            return await salvar(link, '');
        } catch (erro) {
            const e2 = new Error('O servidor deste arquivo nao permite baixar por aqui. Use o botao "Abrir o link" ' +
                                 'e salve pelo menu do navegador (⋮ → Baixar, ou clique direito → Salvar video como).');
            e2.abrirLink = link;
            throw e2;
        }
    }

    // 2. Pergunta aos servidores.
    const servidores = servidoresDownload();
    if (!servidores.length) {
        throw new Error('O download por link ainda nao está disponivel. Por enquanto, funciona com link direto ' +
                        'para o arquivo (terminado em .mp4, .webm...).');
    }
    avisar(4, 'Procurando o vídeo no link...');
    let ultimaFalha = null;
    for (const servidor of servidores) {
        let achado;
        try {
            achado = await perguntarAoServidor(servidor, link, e.qualidade, soAudio);
        } catch (erro) {
            ultimaFalha = erro;
            // Erro do CONTEUDO (privado, inexistente) nao muda de servidor para servidor.
            if (erro.codigo && explicarErroDownload(erro.codigo) && !/rate|limit|api\./i.test(erro.codigo)) break;
            continue;
        }
        try {
            return await salvar(achado.url, achado.nome);
        } catch (erro) {
            ultimaFalha = erro;
            const e2 = new Error('Encontrei o vídeo, mas o navegador não deixou salvar direto. Use o botão "Abrir o arquivo" ' +
                                 'e salve pelo menu do navegador.');
            e2.abrirLink = achado.url;
            throw e2;
        }
    }
    const explicado = ultimaFalha && explicarErroDownload(ultimaFalha.codigo || ultimaFalha.message);
    throw new Error(explicado || 'Não consegui baixar este vídeo agora. Confira o link e tente de novo em alguns minutos.');
};

// Le duracao, tamanho e se tem som de um arquivo qualquer (usado pelos testes e por
// quem quiser conferir o resultado sem depender do <video> do navegador, que nem
// sempre toca H.264).
async function sondar(arquivo, progresso) {
    const ffmpeg = await carregarFfmpeg(progresso);
    const nome = nomeTemp(extensao(arquivo && arquivo.name, 'bin'));
    await ffmpeg.writeFile(nome, await bytesDe(arquivo));
    try {
        return await sondarNoFfmpeg(ffmpeg, nome);
    } finally {
        await apagar(ffmpeg, [nome]);
    }
}

// ---------------------------------------------------------------------------

const VIDEOOPS = {
    sondar,
    ops,
    carregarFfmpeg,
    cancelar,
    formatarTamanho,
    formatarTempo,
    lerTempo,
    cadeiaAtempo,
    servidoresDownload,
    ehLinkDeArquivo,
    validarLink,
    VIDEO_MAX_MB,
    motorCarregado: () => !!_ffmpeg
};

raiz.VIDEOOPS = VIDEOOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = VIDEOOPS;

})(typeof window !== 'undefined' ? window : globalThis);
