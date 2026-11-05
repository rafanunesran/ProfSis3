// montagem_operacoes.js — O MOTOR DO "MONTAR VIDEO": a linha do tempo e a exportacao.
//
// POR QUE ISTO EXISTE
//   As outras ferramentas da aba Video fazem uma coisa por vez (entra um video, sai outro).
//   O professor que quer montar o video da apresentacao — abrir com um titulo, juntar
//   tres gravacoes, tirar os pedacos ruins, pôr uma musica baixinha e o nome da turma
//   em cima — precisava passar por cinco ferramentas. Aqui e' um editor com linha do
//   tempo, como os de celular, e o video continua sem sair do aparelho.
//
//   A ideia de COMO organizar um editor desses (faixa principal sem buracos, dividir no
//   ponto, apagar a esquerda/direita, velocidade por clipe, fundo desfocado para video
//   em pe' numa tela deitada) veio do estudo do OpenCut (github.com/opencut-app,
//   licenca MIT). Nenhum codigo foi copiado: o OpenCut e' React/TypeScript com
//   renderizador proprio; aqui e' JS puro e quem exporta e' o ffmpeg.wasm da aba Video.
//
// O MODELO (so' dados, sem DOM — os testes rodam estas funcoes direto)
//   projeto = {
//     formato: '16:9' | '9:16' | '1:1' | '4:3',
//     qualidade: '480' | '720' | '1080'      (o lado MENOR do video final)
//     fundo: { tipo: 'cor' | 'desfocado', cor: '#000000' },
//     clipes: [ { id, tipo: 'video'|'imagem'|'cor', midia, de, ate, duracao, velocidade,
//                 volume, mudo, encaixe: 'conter'|'preencher', cor } ],
//     textos: [ { id, texto, inicio, duracao, x, y, tamanho, cor, fonte, negrito,
//                 estilo: 'contorno'|'caixa'|'faixa'|'simples', corFundo, suave } ],
//     audios: [ { id, midia, inicio, de, ate, volume, entrarSuave, sairSuave } ]
//   }
//   A faixa de VIDEO e' "magnetica": os clipes ficam colados, um depois do outro (o
//   inicio de cada um e' a soma dos anteriores). Texto e audio ficam onde forem postos.
//   `midia` e' o id de um arquivo guardado fora do projeto (a tela guarda os Blobs);
//   o projeto em si e' JSON puro, o que deixa desfazer/refazer ser uma copia.
//
// A EXPORTACAO
//   Um comando ffmpeg so': cada clipe vira uma entrada (-ss/-t no proprio arquivo),
//   cada um e' encaixado no quadro, os pedacos sao colados (concat), os textos — que a
//   tela desenha num canvas, igual a previa — entram como PNG transparente por cima
//   (overlay com enable=between) e as musicas sao misturadas no som (amix).

(function (raiz) {
'use strict';

const FORMATOS = {
    '16:9': { nome: 'Deitado 16:9 (TV, projetor, YouTube)', l: 16, a: 9 },
    '9:16': { nome: 'Em pé 9:16 (celular, Reels, Status)', l: 9, a: 16 },
    '1:1':  { nome: 'Quadrado 1:1', l: 1, a: 1 },
    '4:3':  { nome: '4:3 (tela antiga)', l: 4, a: 3 }
};
const QUALIDADES = { '480': '480p (mais rápido)', '720': '720p — recomendado', '1080': '1080p (mais lento)' };
const VELOCIDADES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const FONTES = {
    sans: { nome: 'Simples', css: 'Arial, Helvetica, sans-serif' },
    serif: { nome: 'Clássica', css: 'Georgia, "Times New Roman", serif' },
    mono: { nome: 'Máquina de escrever', css: '"Courier New", Courier, monospace' },
    forte: { nome: 'Impacto', css: 'Impact, "Arial Black", sans-serif' },
    mao: { nome: 'Escrita à mão', css: '"Comic Sans MS", "Comic Neue", cursive' }
};
const FPS = 30;
const MIN_CLIPE = 0.1;            // segundos: menor pedaco que sobra de um corte
const DURACAO_IMAGEM = 4;         // foto e tela colorida entram com 4 s
const DURACAO_TEXTO = 3;

const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const r3 = (n) => Math.round(n * 1000) / 1000;
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

let _seq = 0;
function novoId(prefixo) {
    _seq += 1;
    return (prefixo || 'x') + Date.now().toString(36) + _seq.toString(36);
}

function projetoVazio() {
    return { formato: '16:9', qualidade: '720', fundo: { tipo: 'cor', cor: '#000000' }, clipes: [], textos: [], audios: [] };
}

function copiar(projeto) { return JSON.parse(JSON.stringify(projeto)); }

function dimensoes(projeto) {
    const f = FORMATOS[projeto.formato] || FORMATOS['16:9'];
    const menor = Number(projeto.qualidade) || 720;
    if (f.l >= f.a) return { W: par(menor * f.l / f.a), H: par(menor) };
    return { W: par(menor), H: par(menor * f.a / f.l) };
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

function duracaoClipe(c) {
    if (c.tipo === 'video') return Math.max(0, (c.ate - c.de) / (c.velocidade || 1));
    return Math.max(0, Number(c.duracao) || 0);
}

function inicios(projeto) {
    const lista = [];
    let t = 0;
    projeto.clipes.forEach(c => { lista.push(t); t += duracaoClipe(c); });
    return lista;
}

function duracaoTotal(projeto) {
    return projeto.clipes.reduce((s, c) => s + duracaoClipe(c), 0);
}

// Onde cai o tempo t da linha do tempo: qual clipe, e qual segundo DO ARQUIVO.
function clipeEm(projeto, t) {
    const ini = inicios(projeto);
    for (let i = 0; i < projeto.clipes.length; i++) {
        const c = projeto.clipes[i];
        const d = duracaoClipe(c);
        const ultimo = i === projeto.clipes.length - 1;
        if (t < ini[i] + d || (ultimo && t <= ini[i] + d)) {
            const dentro = limitar(t - ini[i], 0, d);
            const local = c.tipo === 'video' ? c.de + dentro * (c.velocidade || 1) : dentro;
            return { indice: i, clipe: c, inicio: ini[i], dentro, local };
        }
    }
    return null;
}

const fimDe = (item) => item.inicio + item.duracao;
const duracaoAudio = (a) => Math.max(0, a.ate - a.de);

// ---------------------------------------------------------------------------
// Acrescentar
// ---------------------------------------------------------------------------

function novoClipeVideo(midia, info) {
    return { id: novoId('c'), tipo: 'video', midia: midia, de: 0, ate: r3(info.duracao || 0),
             duracaoFonte: r3(info.duracao || 0), velocidade: 1, volume: 100, mudo: false, encaixe: 'conter' };
}
function novoClipeImagem(midia) {
    return { id: novoId('c'), tipo: 'imagem', midia: midia, duracao: DURACAO_IMAGEM, encaixe: 'conter' };
}
function novoClipeCor(cor) {
    return { id: novoId('c'), tipo: 'cor', cor: cor || '#1b4488', duracao: DURACAO_IMAGEM };
}
function novoTexto(inicio, texto) {
    return { id: novoId('t'), texto: texto || 'Seu texto aqui', inicio: r3(Math.max(0, inicio || 0)), duracao: DURACAO_TEXTO,
             x: 0.5, y: 0.82, tamanho: 0.07, cor: '#ffffff', fonte: 'sans', negrito: true,
             estilo: 'contorno', corFundo: '#000000', suave: true };
}
function novoAudio(midia, info, inicio) {
    return { id: novoId('a'), midia: midia, inicio: r3(Math.max(0, inicio || 0)), de: 0, ate: r3(info.duracao || 0),
             duracaoFonte: r3(info.duracao || 0), volume: 100, entrarSuave: false, sairSuave: true };
}

// ---------------------------------------------------------------------------
// Editar (cada funcao muda o projeto recebido e devolve true se mudou algo)
// ---------------------------------------------------------------------------

function acharItem(projeto, id) {
    for (const lista of ['clipes', 'textos', 'audios']) {
        const i = projeto[lista].findIndex(x => x.id === id);
        if (i !== -1) return { lista, indice: i, item: projeto[lista][i] };
    }
    return null;
}

// Divide no tempo t. Sem `id`, divide o clipe de video que esta' embaixo do t.
function dividir(projeto, t, id) {
    let achado = id ? acharItem(projeto, id) : null;
    if (!achado) {
        const em = clipeEm(projeto, t);
        if (!em) return null;
        achado = { lista: 'clipes', indice: em.indice, item: em.clipe };
    }
    const { lista, indice, item } = achado;
    const novo = Object.assign(copiar(item), { id: novoId(lista[0]) });
    if (lista === 'clipes') {
        const ini = inicios(projeto)[indice];
        const dentro = t - ini, d = duracaoClipe(item);
        if (dentro < MIN_CLIPE || d - dentro < MIN_CLIPE) return null;
        if (item.tipo === 'video') {
            const ponto = r3(item.de + dentro * (item.velocidade || 1));
            item.ate = ponto; novo.de = ponto;
        } else {
            item.duracao = r3(dentro); novo.duracao = r3(d - dentro);
        }
    } else if (lista === 'textos') {
        const dentro = t - item.inicio;
        if (dentro < MIN_CLIPE || item.duracao - dentro < MIN_CLIPE) return null;
        novo.inicio = r3(t); novo.duracao = r3(item.duracao - dentro); item.duracao = r3(dentro);
    } else {
        const dentro = t - item.inicio;
        if (dentro < MIN_CLIPE || duracaoAudio(item) - dentro < MIN_CLIPE) return null;
        const ponto = r3(item.de + dentro);
        item.ate = ponto; novo.de = ponto; novo.inicio = r3(t);
    }
    projeto[lista].splice(indice + 1, 0, novo);
    return novo.id;
}

// "Apagar o que vem antes/depois do ponto" dentro do item (o OpenCut chama de
// split-left/split-right). Na faixa de video, o resto escorrega para fechar o buraco.
function apagarLado(projeto, t, id, lado) {
    const novoId_ = dividir(projeto, t, id);
    if (!novoId_) return false;
    const a = acharItem(projeto, novoId_);
    const lista = projeto[a.lista];
    if (lado === 'antes') lista.splice(a.indice - 1, 1);
    else lista.splice(a.indice, 1);
    return true;
}

function apagar(projeto, id) {
    const a = acharItem(projeto, id);
    if (!a) return false;
    projeto[a.lista].splice(a.indice, 1);
    return true;
}

function duplicar(projeto, id) {
    const a = acharItem(projeto, id);
    if (!a) return null;
    const novo = Object.assign(copiar(a.item), { id: novoId(a.lista[0]) });
    if (a.lista === 'textos') novo.inicio = r3(fimDe(a.item));
    if (a.lista === 'audios') novo.inicio = r3(a.item.inicio + duracaoAudio(a.item));
    projeto[a.lista].splice(a.indice + 1, 0, novo);
    return novo.id;
}

function moverClipe(projeto, id, novoIndice) {
    const a = acharItem(projeto, id);
    if (!a || a.lista !== 'clipes') return false;
    const destino = limitar(Math.round(novoIndice), 0, projeto.clipes.length - 1);
    if (destino === a.indice) return false;
    projeto.clipes.splice(a.indice, 1);
    projeto.clipes.splice(destino, 0, a.item);
    return true;
}

function moverPara(projeto, id, inicio) {
    const a = acharItem(projeto, id);
    if (!a || a.lista === 'clipes') return false;
    a.item.inicio = r3(Math.max(0, inicio));
    return true;
}

// Aparar pela borda: `lado` 'inicio' ou 'fim', `delta` em segundos da linha do tempo
// (positivo = borda para a direita).
function aparar(projeto, id, lado, delta) {
    const a = acharItem(projeto, id);
    if (!a) return false;
    const it = a.item;
    if (a.lista === 'clipes') {
        if (it.tipo === 'video') {
            const v = it.velocidade || 1, fonte = it.duracaoFonte || it.ate;
            if (lado === 'inicio') it.de = r3(limitar(it.de + delta * v, 0, it.ate - MIN_CLIPE * v));
            else it.ate = r3(limitar(it.ate + delta * v, it.de + MIN_CLIPE * v, fonte));
        } else {
            it.duracao = r3(Math.max(MIN_CLIPE, it.duracao + (lado === 'inicio' ? -delta : delta)));
        }
    } else if (a.lista === 'textos') {
        if (lado === 'inicio') {
            const novoInicio = limitar(it.inicio + delta, 0, fimDe(it) - MIN_CLIPE);
            it.duracao = r3(fimDe(it) - novoInicio); it.inicio = r3(novoInicio);
        } else it.duracao = r3(Math.max(MIN_CLIPE, it.duracao + delta));
    } else {
        const fonte = it.duracaoFonte || it.ate;
        if (lado === 'inicio') {
            const d = limitar(delta, -Math.min(it.de, it.inicio), duracaoAudio(it) - MIN_CLIPE);
            it.de = r3(it.de + d); it.inicio = r3(it.inicio + d);
        } else it.ate = r3(limitar(it.ate + delta, it.de + MIN_CLIPE, fonte));
    }
    return true;
}

// Desfazer/refazer: copias do projeto inteiro (e' pequeno: so' numeros e textos).
function criarHistorico(limite) {
    const max = limite || 80;
    let passado = [], futuro = [];
    return {
        guardar(projeto) { passado.push(JSON.stringify(projeto)); if (passado.length > max) passado.shift(); futuro = []; },
        desfazer(atual) { if (!passado.length) return null; futuro.push(JSON.stringify(atual)); return JSON.parse(passado.pop()); },
        refazer(atual) { if (!futuro.length) return null; passado.push(JSON.stringify(atual)); return JSON.parse(futuro.pop()); },
        podeDesfazer: () => passado.length > 0,
        podeRefazer: () => futuro.length > 0,
        limpar() { passado = []; futuro = []; }
    };
}

// ---------------------------------------------------------------------------
// Desenho do texto — o MESMO para a previa e para o PNG da exportacao.
// ---------------------------------------------------------------------------

function fonteCss(t, px) {
    const f = FONTES[t.fonte] || FONTES.sans;
    return (t.negrito ? '800 ' : '400 ') + Math.round(px) + 'px ' + f.css;
}

function quebrarLinhas(ctx, texto, larguraMax) {
    const saida = [];
    String(texto || '').split('\n').forEach(paragrafo => {
        const palavras = paragrafo.split(/\s+/).filter(Boolean);
        if (!palavras.length) { saida.push(''); return; }
        let linha = palavras[0];
        for (let i = 1; i < palavras.length; i++) {
            const tentativa = linha + ' ' + palavras[i];
            if (ctx.measureText(tentativa).width > larguraMax) { saida.push(linha); linha = palavras[i]; } else linha = tentativa;
        }
        saida.push(linha);
    });
    return saida;
}

// Desenha o texto `t` num quadro W x H e devolve a caixa ocupada {x, y, w, h}.
function desenharTexto(ctx, t, W, H) {
    const px = Math.max(6, (Number(t.tamanho) || 0.07) * H);
    ctx.save();
    ctx.font = fonteCss(t, px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const linhas = quebrarLinhas(ctx, t.texto, W * 0.9);
    const alturaLinha = px * 1.2;
    const larg = Math.max(1, ...linhas.map(l => ctx.measureText(l).width));
    const altTotal = alturaLinha * linhas.length;
    const cx = (Number(t.x) || 0.5) * W, cy = (t.y == null ? 0.5 : Number(t.y)) * H;
    const folga = px * 0.35;
    let caixa = { x: cx - larg / 2 - folga, y: cy - altTotal / 2 - folga * 0.6, w: larg + folga * 2, h: altTotal + folga * 1.2 };
    if (t.estilo === 'faixa') caixa = { x: 0, y: caixa.y, w: W, h: caixa.h };
    if (t.estilo === 'caixa' || t.estilo === 'faixa') {
        ctx.fillStyle = t.corFundo || '#000000';
        ctx.globalAlpha = t.estilo === 'faixa' ? 0.75 : 0.85;
        const r = t.estilo === 'caixa' ? Math.min(px * 0.3, caixa.h / 2) : 0;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(caixa.x, caixa.y, caixa.w, caixa.h, r); else ctx.rect(caixa.x, caixa.y, caixa.w, caixa.h);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    linhas.forEach((l, i) => {
        const y = cy - altTotal / 2 + alturaLinha * (i + 0.5);
        if (t.estilo === 'contorno') {
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, px * 0.14);
            ctx.strokeStyle = t.corFundo || '#000000';
            ctx.strokeText(l, cx, y);
        } else if (t.estilo === 'simples') {
            ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = px * 0.15; ctx.shadowOffsetY = px * 0.04;
        }
        ctx.fillStyle = t.cor || '#ffffff';
        ctx.fillText(l, cx, y);
        ctx.shadowColor = 'transparent';
    });
    ctx.restore();
    return caixa;
}

// Opacidade do texto no tempo t (o "aparecer/sumir suave" de 0,3 s).
function opacidadeTexto(t, tempo) {
    if (tempo < t.inicio || tempo > fimDe(t)) return 0;
    if (!t.suave) return 1;
    const d = Math.min(0.3, t.duracao / 3);
    return limitar(Math.min((tempo - t.inicio) / d, (fimDe(t) - tempo) / d), 0, 1);
}

// ---------------------------------------------------------------------------
// O comando do ffmpeg
// ---------------------------------------------------------------------------

const corHex = (c) => '0x' + String(c || '#000000').replace('#', '').slice(0, 6).padEnd(6, '0');

// Monta os argumentos a partir do projeto. `arquivos` e' a lista, NA ORDEM das entradas
// gravadas, de { chave, nome, info } — chave = id da midia ou 'texto:<id>'.
// Devolve { args, duracao } ou lanca erro explicado.
function montarArgs(projeto, arquivos, saida, cadeiaAtempo, extra) {
    const opc = extra || {};
    const { W, H } = dimensoes(projeto);
    const total = duracaoTotal(projeto);
    if (!projeto.clipes.length || total <= 0) throw new Error('Coloque pelo menos um vídeo, foto ou tela colorida na faixa de vídeo.');
    const porChave = {};
    arquivos.forEach(a => { porChave[a.chave] = a; });
    const args = [];
    const filtros = [];
    let k = 0;   // indice da proxima entrada (-i)
    const desfocado = projeto.fundo && projeto.fundo.tipo === 'desfocado';
    const corFundo = corHex(projeto.fundo && projeto.fundo.cor);
    const pedacos = [];

    const encaixar = (rotulo, saidaRotulo, encaixe) => {
        if (encaixe === 'preencher') {
            filtros.push(rotulo + 'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',setsar=1' + saidaRotulo);
        } else if (desfocado) {
            const w4 = par(W / 4), h4 = par(H / 4), id = saidaRotulo.slice(1, -1);
            filtros.push(rotulo + 'split=2[' + id + 'b][' + id + 'f]');
            filtros.push('[' + id + 'b]scale=' + w4 + ':' + h4 + ':force_original_aspect_ratio=increase,crop=' + w4 + ':' + h4 +
                ',boxblur=8:2,scale=' + W + ':' + H + ',setsar=1[' + id + 'bb]');
            filtros.push('[' + id + 'f]scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,setsar=1[' + id + 'ff]');
            filtros.push('[' + id + 'bb][' + id + 'ff]overlay=(W-w)/2:(H-h)/2' + saidaRotulo);
        } else {
            filtros.push(rotulo + 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,pad=' + W + ':' + H +
                ':(ow-iw)/2:(oh-ih)/2:color=' + corFundo + ',setsar=1' + saidaRotulo);
        }
    };
    const silencio = (d, rot) => filtros.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + d.toFixed(3) + rot);

    projeto.clipes.forEach((c, i) => {
        const d = duracaoClipe(c);
        const v = '[v' + i + ']', a = '[a' + i + ']';
        if (c.tipo === 'cor') {
            filtros.push('color=c=' + corHex(c.cor) + ':s=' + W + 'x' + H + ':r=' + FPS + ':d=' + d.toFixed(3) + ',format=yuv420p,setsar=1' + v);
            silencio(d, a);
        } else if (c.tipo === 'imagem') {
            const arq = porChave[c.midia];
            if (!arq) throw new Error('A foto de um dos clipes sumiu. Tire o clipe e coloque a foto de novo.');
            args.push('-loop', '1', '-framerate', String(FPS), '-t', d.toFixed(3), '-i', arq.nome);
            const ent = '[' + k + ':v]';
            k += 1;
            encaixar(ent, '[e' + i + ']', c.encaixe);
            filtros.push('[e' + i + ']fps=' + FPS + ',format=yuv420p,trim=duration=' + d.toFixed(3) + ',setpts=PTS-STARTPTS' + v);
            silencio(d, a);
        } else {
            const arq = porChave[c.midia];
            if (!arq) throw new Error('O vídeo de um dos clipes sumiu. Tire o clipe e coloque o vídeo de novo.');
            const vel = c.velocidade || 1;
            args.push('-ss', c.de.toFixed(3), '-t', (c.ate - c.de).toFixed(3), '-i', arq.nome);
            const ent = k;
            k += 1;
            filtros.push('[' + ent + ':v]setpts=(PTS-STARTPTS)/' + vel + '[s' + i + ']');
            encaixar('[s' + i + ']', '[e' + i + ']', c.encaixe);
            filtros.push('[e' + i + ']fps=' + FPS + ',format=yuv420p,trim=duration=' + d.toFixed(3) + ',setpts=PTS-STARTPTS' + v);
            const vol = c.mudo ? 0 : (Number(c.volume) || 0) / 100;
            if (arq.info && arq.info.temAudio && vol > 0) {
                filtros.push('[' + ent + ':a]asetpts=PTS-STARTPTS,' + (vel !== 1 ? cadeiaAtempo(vel) + ',' : '') +
                    'volume=' + vol.toFixed(2) + ',aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=' + d.toFixed(3) + a);
            } else silencio(d, a);
        }
        pedacos.push(v + a);
    });
    filtros.push(pedacos.join('') + 'concat=n=' + pedacos.length + ':v=1:a=1[vb][ab]');

    // Textos por cima
    let vAtual = '[vb]';
    projeto.textos.forEach((t, j) => {
        if (t.inicio >= total || !String(t.texto || '').trim()) return;
        const arq = porChave['texto:' + t.id];
        if (!arq) return;
        const fim = Math.min(total, fimDe(t));
        args.push('-loop', '1', '-framerate', String(FPS), '-t', fim.toFixed(3), '-i', arq.nome);
        const ent = k;
        k += 1;
        let cadeia = '[' + ent + ':v]format=rgba';
        if (t.suave) {
            const dd = Math.min(0.3, (fim - t.inicio) / 3);
            cadeia += ',fade=t=in:st=' + t.inicio.toFixed(3) + ':d=' + dd.toFixed(3) + ':alpha=1' +
                      ',fade=t=out:st=' + (fim - dd).toFixed(3) + ':d=' + dd.toFixed(3) + ':alpha=1';
        }
        filtros.push(cadeia + '[t' + j + ']');
        filtros.push(vAtual + '[t' + j + "]overlay=0:0:eof_action=pass:enable='between(t," + t.inicio.toFixed(3) + ',' + fim.toFixed(3) + ")'[vt" + j + ']');
        vAtual = '[vt' + j + ']';
    });
    filtros.push(vAtual + 'format=yuv420p[vout]');

    // Musicas e narracoes
    const extras = [];
    projeto.audios.forEach((au, m) => {
        if (au.inicio >= total) return;
        const arq = porChave[au.midia];
        if (!arq || (arq.info && !arq.info.temAudio)) return;
        const d = Math.min(duracaoAudio(au), total - au.inicio);
        if (d <= 0.05) return;
        args.push('-ss', au.de.toFixed(3), '-t', d.toFixed(3), '-i', arq.nome);
        const ent = k;
        k += 1;
        let cadeia = '[' + ent + ':a]asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo,volume=' +
            ((Number(au.volume) || 0) / 100).toFixed(2);
        const fade = Math.min(1.5, d / 3);
        if (au.entrarSuave) cadeia += ',afade=t=in:st=0:d=' + fade.toFixed(3);
        if (au.sairSuave) cadeia += ',afade=t=out:st=' + (d - fade).toFixed(3) + ':d=' + fade.toFixed(3);
        const ms = Math.round(au.inicio * 1000);
        if (ms > 0) cadeia += ',adelay=' + ms + '|' + ms;
        filtros.push(cadeia + '[m' + m + ']');
        extras.push('[m' + m + ']');
    });
    if (extras.length) {
        // amix divide pelo numero de entradas; o volume=n devolve cada som ao nivel escolhido.
        const n = extras.length + 1;
        filtros.push('[ab]' + extras.join('') + 'amix=inputs=' + n + ':duration=first:dropout_transition=0,volume=' + n + '[aout]');
    } else filtros.push('[ab]anull[aout]');

    const crf = opc.crf || 23;
    const final = args.concat(['-filter_complex', filtros.join(';'), '-map', '[vout]', '-map', '[aout]',
        '-r', String(FPS), '-t', total.toFixed(3),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', saida]);
    return { args: final, duracao: total, W, H };
}

// Quais arquivos a exportacao precisa (cada midia uma vez so').
function midiasUsadas(projeto) {
    const usadas = [];
    const ja = new Set();
    projeto.clipes.forEach(c => { if (c.midia && !ja.has(c.midia)) { ja.add(c.midia); usadas.push(c.midia); } });
    projeto.audios.forEach(a => { if (a.midia && !ja.has(a.midia)) { ja.add(a.midia); usadas.push(a.midia); } });
    return usadas;
}

// Exporta. `midias` = { id: { arquivo: Blob|File, nome } }. Precisa do VIDEOOPS (o
// ffmpeg da aba Video) e de canvas (para os textos), entao so' roda no navegador.
async function exportar(projeto, midias, progresso) {
    const V = raiz.VIDEOOPS;
    if (!V || !V.rodar) throw new Error('O motor de vídeo não carregou. Recarregue a página.');
    const total = duracaoTotal(projeto);
    if (!projeto.clipes.length || total <= 0) throw new Error('Coloque pelo menos um vídeo, foto ou tela colorida na faixa de vídeo.');
    const { W, H } = dimensoes(projeto);
    const lista = [];
    let somaBytes = 0;
    midiasUsadas(projeto).forEach(id => {
        const m = midias[id];
        if (!m) return;
        somaBytes += m.arquivo.size || 0;
        lista.push({ chave: id, arquivo: m.arquivo, ext: V.extensao(m.nome, m.tipo === 'imagem' ? 'png' : 'mp4') });
    });
    if (somaBytes > V.VIDEO_MAX_MB * 1024 * 1024) {
        throw new Error('Os arquivos somam ' + V.formatarTamanho(somaBytes) + '. O editor no navegador aguenta até cerca de ' +
                        V.VIDEO_MAX_MB + ' MB no total.');
    }
    for (const t of projeto.textos) {
        if (t.inicio >= total || !String(t.texto || '').trim()) continue;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        desenharTexto(canvas.getContext('2d'), t, W, H);
        const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
        lista.push({ chave: 'texto:' + t.id, arquivo: blob, ext: 'png' });
    }
    const primeiroVideo = projeto.clipes.find(c => c.tipo === 'video');
    const nomeBase = primeiroVideo && midias[primeiroVideo.midia] ? V.nomeBase(midias[primeiroVideo.midia].nome) : 'montagem';
    let usados = null;
    const r = await V.rodar({
        entradas: lista.map(x => ({ arquivo: x.arquivo, ext: x.ext })),
        sondar: true, saida: 'mp4', tipoSaida: 'video/mp4', nomeSaida: nomeBase + '_montado.mp4', progresso,
        montar: (nomes, s, infos) => {
            const arquivos = lista.map((x, i) => ({ chave: x.chave, nome: nomes[i], info: infos[i] }));
            usados = montarArgs(projeto, arquivos, s, V.cadeiaAtempo);
            return usados.args;
        }
    });
    return { arquivos: [{ nome: r.nome, tipo: 'video/mp4', blob: r.blob }],
             mensagem: 'Vídeo montado: ' + V.formatarTempo(total) + ', ' + W + ' x ' + H + ' pixels.', duracao: total, W, H };
}

const MONTAGEMOPS = {
    FORMATOS, QUALIDADES, VELOCIDADES, FONTES, FPS, MIN_CLIPE,
    projetoVazio, copiar, dimensoes,
    duracaoClipe, duracaoAudio, inicios, duracaoTotal, clipeEm, fimDe,
    novoClipeVideo, novoClipeImagem, novoClipeCor, novoTexto, novoAudio,
    acharItem, dividir, apagarLado, apagar, duplicar, moverClipe, moverPara, aparar,
    criarHistorico, desenharTexto, opacidadeTexto, fonteCss,
    montarArgs, midiasUsadas, exportar
};

raiz.MONTAGEMOPS = MONTAGEMOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = MONTAGEMOPS;

})(typeof window !== 'undefined' ? window : globalThis);
