// montagem.js — A TELA DO "MONTAR VIDEO": previa, linha do tempo e exportacao.
//
// O QUE E'
//   Um editor de video com linha do tempo, dentro da aba Video de Ferramentas (cartao
//   "🎞️ Montar video"). Tres faixas:
//     🎬 Video  — videos, fotos e telas coloridas, colados um depois do outro;
//     🔤 Texto  — titulos e legendas por cima, cada um com inicio e duracao;
//     🎵 Audio  — musica ou narracao, misturada ao som dos videos.
//   Dividir no ponto, apagar antes/depois, aparar puxando as bordas, mover arrastando,
//   duplicar, desfazer/refazer, velocidade e volume por clipe, formato do quadro e fundo
//   desfocado. As ideias de organizacao vieram do estudo do OpenCut (MIT); o codigo e'
//   proprio (ver montagem_operacoes.js).
//
// A PREVIA
//   Um <canvas> desenhado a cada quadro: o video do clipe atual (um <video> escondido
//   por arquivo, levado ao segundo certo), a foto ou a cor, e os textos — com a MESMA
//   funcao que gera o PNG da exportacao, entao o que se ve e' o que sai.
//   Ao tocar, o relogio e' o do navegador; os <video>/<audio> sao corrigidos quando se
//   afastam mais de 0,3 s.
//
// O VIDEO NAO SAI DO APARELHO: os arquivos ficam como Blob na memoria da pagina e a
// exportacao e' do ffmpeg.wasm (video_operacoes.js), como no resto da aba.

(function () {
'use strict';

const M = () => window.MONTAGEMOPS;
const V = () => window.VIDEOOPS;

let proj = null;
let midias = {};           // id -> { id, nome, tipo, arquivo, url, duracao, largura, altura, el }
let hist = null;
let sel = null;            // id do item selecionado
let tempo = 0;
let tocando = false;
let relogio = 0, tempoBase = 0;
let pps = 40;              // pixels por segundo na linha do tempo
let pedidoQuadro = 0;
let videoAtivo = null, clipeAtivoId = null;
let caixasTexto = [];      // [{ id, x, y, w, h }] na escala do canvas, para clicar/arrastar
let exportando = false, resultado = null, urlResultado = null;
let sessaoEdicao = null;   // campo sendo digitado (um "desfazer" por sessao, nao por tecla)
let tela = null;
let teclasLigadas = false;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const $ = (id) => document.getElementById(id);
const fmt = (s) => {
    s = Math.max(0, s || 0);
    const m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1).replace('.', ',');
};
const num = (v, p) => { const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : p; };

function podeUsar() {
    if (typeof exigirPremium !== 'function') return true;
    return exigirPremium('Ferramentas — Vídeo — Montar vídeo');
}

// ---------------------------------------------------------------------------
// Abrir / fechar
// ---------------------------------------------------------------------------

function iniciar() {
    if (!proj) {
        proj = M().projetoVazio();
        hist = M().criarHistorico();
        midias = {};
        sel = null; tempo = 0; resultado = null;
    }
}

// O editor ocupa a tela inteira (como o Ateliê): no meio da página de Ferramentas, com o
// menu ao lado, a prévia e a linha do tempo ficavam apertadas e o painel cortado.
// Layout tirado de um protótipo feito no Lovable para este editor: adicionar à esquerda,
// prévia no meio, ajustes à direita, ações e linha do tempo embaixo; no celular a prévia
// vai para o topo, os botões viram fileiras que rolam de lado e os ajustes sobem de baixo.
let painelAberto = false;  // no celular: a folha de ajustes esta' aberta

function render(destino) {
    tela = destino;
    iniciar();
    tela.innerHTML = '';
    let ed = $('mvEditor');
    if (ed) ed.remove();
    ed = document.createElement('div');
    ed.id = 'mvEditor';
    ed.innerHTML = ESTILO + `
      <div class="mv-topo">
        <button class="mv-fantasma" onclick="fecharFerramentaVideo()" title="Voltar para as ferramentas de vídeo">← <span class="mv-some-cel">Voltar</span></button>
        <div class="mv-titulo">🎞️ Montar vídeo</div>
        <div class="mv-topo-dir">
          <button class="mv-fantasma" onclick="mvAjuda()" title="Como usar">?</button>
          <button class="mv-primario" id="mvBtnExportar" onclick="mvExportar()">⬇️ Exportar<span class="mv-some-cel"> MP4</span></button>
        </div>
      </div>
      <div class="mv-principal">
        <div class="mv-add" id="mvAdicionar">
          <p class="mv-secao mv-some-cel">Adicionar</p>
          <label class="mv-add-bt" id="mvBtnMidia" title="Vídeos e fotos entram em fila na faixa de vídeo">
            <span class="mv-add-ic">🎬</span><span>Vídeo ou foto</span>
            <input type="file" accept="video/*,image/*" multiple hidden onchange="mvAcrescentarArquivos(this.files, 'video'); this.value='';"></label>
          <button class="mv-add-bt" id="mvBtnCor" onclick="mvAcrescentarCor()" title="Uma tela de uma cor só, boa para título">
            <span class="mv-add-ic">🟦</span><span>Tela colorida</span></button>
          <button class="mv-add-bt" id="mvBtnTexto" onclick="mvAcrescentarTexto()" title="Título ou legenda por cima do vídeo">
            <span class="mv-add-ic">🔤</span><span>Texto</span></button>
          <label class="mv-add-bt" id="mvBtnAudio" title="Música ou narração">
            <span class="mv-add-ic">🎵</span><span>Música</span>
            <input type="file" accept="audio/*" multiple hidden onchange="mvAcrescentarArquivos(this.files, 'audio'); this.value='';"></label>
          <button class="mv-add-bt mv-so-cel" id="mvBtnAjustes" onclick="mvAbrirAjustes()" title="Formato, fundo e qualidade">
            <span class="mv-add-ic">⚙️</span><span>Formato</span></button>
        </div>
        <div class="mv-centro">
          <div class="mv-palco" id="mvPalco">
            <div class="mv-quadro" id="mvQuadro">
              <canvas id="mvCanvas"></canvas>
              <div class="mv-vazio-palco" id="mvVazioPalco">
                <span style="font-size:40px;">🎬</span>
                <p>Comece adicionando um vídeo ou foto</p>
                <button class="mv-primario" onclick="document.querySelector('#mvBtnMidia input').click()">➕ Adicionar vídeo ou foto</button>
              </div>
            </div>
          </div>
          <div class="mv-controles">
            <button class="mv-redondo" onclick="mvIrPara(0)" title="Início (Home)">⏮</button>
            <button class="mv-redondo mv-tocar" id="mvBtnTocar" onclick="mvTocar()" title="Tocar / pausar (Espaço)">▶</button>
            <button class="mv-redondo" onclick="mvIrPara(Infinity)" title="Fim (End)">⏭</button>
            <span id="mvTempo" class="mv-tempo">0:00,0 / 0:00,0</span>
          </div>
        </div>
        <div class="mv-painel" id="mvPainel">
          <div class="mv-alca-folha mv-so-cel" onclick="mvFecharAjustes()"></div>
          <div class="mv-painel-dentro" id="mvProps"></div>
        </div>
      </div>
      <div class="mv-acoes" id="mvAcoes">
        <button class="mv-ferr" id="mvBtnDesfazer" onclick="mvDesfazer()" title="Desfazer (Ctrl+Z)"><span class="mv-ferr-ic">↶</span><span>Desfazer</span></button>
        <button class="mv-ferr" id="mvBtnRefazer" onclick="mvRefazer()" title="Refazer (Ctrl+Y)"><span class="mv-ferr-ic">↷</span><span>Refazer</span></button>
        <span class="mv-sep"></span>
        <button class="mv-ferr" id="mvBtnDividir" onclick="mvDividir()" title="Dividir no ponto da agulha (S)"><span class="mv-ferr-ic">✂️</span><span>Dividir</span></button>
        <button class="mv-ferr" onclick="mvApagarLado('antes')" title="Apagar o pedaço antes da agulha (Q)"><span class="mv-ferr-ic">⇤</span><span>Apagar antes</span></button>
        <button class="mv-ferr" onclick="mvApagarLado('depois')" title="Apagar o pedaço depois da agulha (W)"><span class="mv-ferr-ic">⇥</span><span>Apagar depois</span></button>
        <button class="mv-ferr" onclick="mvDuplicar()" title="Duplicar (D)"><span class="mv-ferr-ic">⧉</span><span>Duplicar</span></button>
        <button class="mv-ferr" id="mvBtnApagar" onclick="mvApagar()" title="Apagar o selecionado (Delete)"><span class="mv-ferr-ic">🗑️</span><span>Apagar</span></button>
        <span class="mv-sep"></span>
        <button class="mv-ferr" onclick="mvZoom(0.7)" title="Afastar"><span class="mv-ferr-ic">−</span><span>Menos</span></button>
        <button class="mv-ferr" onclick="mvZoom(0)" title="Caber tudo na tela"><span class="mv-ferr-ic">⤢</span><span>Caber</span></button>
        <button class="mv-ferr" onclick="mvZoom(1.4)" title="Aproximar"><span class="mv-ferr-ic">+</span><span>Mais</span></button>
      </div>
      <div class="mv-linha" id="mvLinha">
        <div class="mv-rotulos">
          <div class="mv-r0"></div>
          <div class="mv-rot mv-r1" title="Vídeo"><span>🎬</span><small>Vídeo</small></div>
          <div class="mv-rot mv-r2" title="Texto"><span>🔤</span><small>Texto</small></div>
          <div class="mv-rot mv-r2" title="Áudio"><span>🎵</span><small>Áudio</small></div>
        </div>
        <div class="mv-rolagem" id="mvRolagem"><div class="mv-trilho" id="mvTrilho"></div></div>
      </div>
      <div class="mv-cortina" id="mvCortina" onclick="mvFecharAjustes()"></div>
      <div id="mvExport"></div>`;
    document.body.appendChild(ed);
    document.body.classList.add('mv-aberto');
    ligarCanvas();
    ligarTeclas();
    ajustarCanvas();
    zoomCaber();
    atualizarTudo();
    if (resultado) renderResultado();
}

function fechar(perguntar) {
    if (exportando) {
        if (!confirm('O vídeo ainda está sendo exportado. Parar e sair?')) return false;
        cancelarExportacao();
    }
    if (perguntar !== false && proj && (proj.clipes.length || proj.textos.length || proj.audios.length)) {
        if (!confirm('Sair do editor? A montagem não fica salva: o que não foi exportado se perde.')) return false;
    }
    pausar();
    Object.values(midias).forEach(m => { try { URL.revokeObjectURL(m.url); } catch (_) { /* ok */ } });
    if (urlResultado) { try { URL.revokeObjectURL(urlResultado); } catch (_) { /* ok */ } }
    proj = null; midias = {}; hist = null; sel = null; resultado = null; urlResultado = null; tela = null; painelAberto = false;
    const ed = $('mvEditor');
    if (ed) ed.remove();
    document.body.classList.remove('mv-aberto');
    return true;
}

function editorVisivel() {
    const e = $('mvEditor');
    return !!(e && e.getClientRects().length);
}

const ehCelular = () => window.matchMedia && window.matchMedia('(max-width: 767px)').matches;

function abrirAjustes() { painelAberto = true; atualizarFolha(); }
function fecharAjustes() {
    painelAberto = false;
    if (ehCelular() && sel) { sel = null; atualizarTudo(); }
    atualizarFolha();
}
function atualizarFolha() {
    const p = $('mvPainel'), c = $('mvCortina');
    const aberta = painelAberto || !!sel;
    if (p) p.classList.toggle('mv-aberta', aberta);
    if (c) c.classList.toggle('mv-aberta', aberta && ehCelular());
}

function ajuda() {
    if (typeof iniciarTour === 'function') iniciarTour('montagemVideo');
}

// ---------------------------------------------------------------------------
// Mudancas no projeto
// ---------------------------------------------------------------------------

function aplicar(fn, opcoes) {
    const op = opcoes || {};
    const antes = JSON.stringify(proj);
    const copia = M().copiar(proj);
    const r = fn(copia);
    if (r === false || r === null) { if (op.aviso) avisar(op.aviso); return r; }
    if (JSON.stringify(copia) === antes) return r;
    if (!op.semHistorico) hist.guardar(proj);
    proj = copia;
    sessaoEdicao = op.sessao || null;
    tempo = Math.min(tempo, M().duracaoTotal(proj));
    atualizarTudo(op);
    return r;
}

function atualizarTudo(op) {
    if (!proj) return;
    if (sel && !M().acharItem(proj, sel)) sel = null;
    renderTimeline();
    if (!(op && op.semPainel)) renderProps();
    atualizarBotoes();
    const vazio = $('mvVazioPalco');
    if (vazio) vazio.style.display = proj.clipes.length ? 'none' : 'flex';
    desenhar();
}

function atualizarBotoes() {
    const d = $('mvBtnDesfazer'), r = $('mvBtnRefazer');
    if (d) d.disabled = !hist.podeDesfazer();
    if (r) r.disabled = !hist.podeRefazer();
    const ex = $('mvBtnExportar');
    if (ex) ex.disabled = exportando || !proj.clipes.length;
}

let avisoTimer = 0;
function avisar(texto) {
    let el = $('mvAviso');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mvAviso';
        el.className = 'mv-aviso';
        document.body.appendChild(el);
    }
    el.textContent = texto;
    el.style.opacity = '1';
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.style.opacity = '0'; }, 3200);
}

// ---------------------------------------------------------------------------
// Acrescentar arquivos
// ---------------------------------------------------------------------------

function esperarEvento(el, nomes, ms) {
    return new Promise((ok, falha) => {
        const fim = (e) => { limpar(); e && e.type === 'error' ? falha(new Error('erro')) : ok(); };
        const limpar = () => { nomes.concat(['error']).forEach(n => el.removeEventListener(n, fim)); clearTimeout(t); };
        nomes.concat(['error']).forEach(n => el.addEventListener(n, fim));
        const t = setTimeout(() => { limpar(); falha(new Error('tempo')); }, ms || 15000);
    });
}

async function lerMidia(arquivo, faixa) {
    const tipoMime = String(arquivo.type || '');
    const ext = (/\.([a-z0-9]+)$/i.exec(arquivo.name || '') || [])[1] || '';
    let tipo = /^video\//.test(tipoMime) || /^(mp4|webm|mov|m4v|mkv|3gp|avi|ogv)$/i.test(ext) ? 'video'
        : /^image\//.test(tipoMime) || /^(png|jpe?g|webp|gif|bmp)$/i.test(ext) ? 'imagem'
        : /^audio\//.test(tipoMime) || /^(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i.test(ext) ? 'audio' : '';
    if (!tipo) throw new Error('"' + arquivo.name + '" não é vídeo, foto nem áudio.');
    if (faixa === 'audio' && tipo !== 'audio') throw new Error('"' + arquivo.name + '" não é um arquivo de áudio.');
    if (faixa !== 'audio' && tipo === 'audio') tipo = 'audio';
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    let blob = arquivo;
    let nome = arquivo.name || (tipo + '.' + ext);
    // Foto que o ffmpeg pode nao entender (webp, gif, bmp...) vira PNG antes.
    if (tipo === 'imagem' && !/^(png|jpe?g)$/i.test(ext) && !/image\/(png|jpeg)/.test(tipoMime)) {
        blob = await paraPng(arquivo);
        nome = nome.replace(/\.[^.]+$/, '') + '.png';
    }
    const url = URL.createObjectURL(blob);
    const m = { id, nome, tipo, arquivo: blob, url, duracao: 0, largura: 0, altura: 0, el: null };
    try {
        if (tipo === 'imagem') {
            const img = new Image();
            img.src = url;
            await esperarEvento(img, ['load']);
            m.el = img; m.largura = img.naturalWidth; m.altura = img.naturalHeight;
        } else {
            const el = document.createElement(tipo === 'video' ? 'video' : 'audio');
            el.preload = 'auto'; el.playsInline = true; el.src = url;
            el.setAttribute('playsinline', '');
            await esperarEvento(el, ['loadedmetadata']);
            if (!isFinite(el.duration) || !el.duration) {
                // Video gravado no navegador vem sem duracao: pular para o fim obriga a descobrir.
                el.currentTime = 1e7;
                await esperarEvento(el, ['durationchange', 'timeupdate', 'seeked'], 8000).catch(() => {});
                el.currentTime = 0;
            }
            m.duracao = isFinite(el.duration) ? el.duration : 0;
            m.largura = el.videoWidth || 0; m.altura = el.videoHeight || 0;
            m.el = el;
            el.addEventListener('seeked', () => { if (!tocando) desenhar(); });
            el.addEventListener('loadeddata', () => { if (!tocando) desenhar(); });
        }
    } catch (_) {
        m.el = null;
    }
    if (tipo !== 'imagem' && !m.duracao && V() && V().sondar) {
        // O navegador nao tocou (formato que ele nao conhece): o ffmpeg le a duracao.
        try { const info = await V().sondar(blob); m.duracao = info.duracao || 0; m.largura = info.largura; m.altura = info.altura; } catch (_) { /* fica 0 */ }
    }
    if (tipo !== 'imagem' && !m.duracao) {
        try { URL.revokeObjectURL(url); } catch (_) { /* ok */ }
        throw new Error('Não consegui ler "' + arquivo.name + '". O arquivo pode estar corrompido.');
    }
    if (tipo === 'imagem' && !m.el) throw new Error('Não consegui abrir a foto "' + arquivo.name + '".');
    m.duracao = Math.round(m.duracao * 1000) / 1000;
    if (tipo === 'video' && m.el) await capturarMiniatura(m).catch(() => {});
    if (tipo === 'audio') await calcularOnda(m).catch(() => {});
    return m;
}

// Miniatura do video para o bloco da linha do tempo (um quadro perto do comeco).
async function capturarMiniatura(m) {
    const el = m.el;
    if (!el.videoWidth) return;
    el.currentTime = Math.min(0.5, (m.duracao || 1) / 3);
    await esperarEvento(el, ['seeked'], 3000);
    const h = 60, w = Math.round(h * el.videoWidth / el.videoHeight);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(el, 0, 0, w, h);
    m.miniatura = c.toDataURL('image/jpeg', 0.6);
    el.currentTime = 0;
}

// Forma de onda da musica: o pico de cada pedacinho vira uma barrinha.
async function calcularOnda(m) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || (m.arquivo.size || 0) > 60 * 1024 * 1024) return;
    const ctx = new Ctx();
    try {
        const buf = await ctx.decodeAudioData(await m.arquivo.arrayBuffer());
        const dados = buf.getChannelData(0);
        const n = Math.max(40, Math.min(1500, Math.round(buf.duration * 12)));
        const passo = Math.max(1, Math.floor(dados.length / n));
        const picos = [];
        let maior = 0.0001;
        for (let i = 0; i < n; i++) {
            let p = 0;
            for (let j = i * passo, f = Math.min(dados.length, j + passo); j < f; j += 16) p = Math.max(p, Math.abs(dados[j]));
            picos.push(p); maior = Math.max(maior, p);
        }
        const c = document.createElement('canvas');
        c.width = n * 3; c.height = 40;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(255,255,255,.45)';
        picos.forEach((p, i) => { const h = Math.max(2, p / maior * 30); g.fillRect(i * 3, 20 - h / 2, 2, h); });
        m.onda = c.toDataURL('image/png');
    } finally { try { ctx.close(); } catch (_) { /* ok */ } }
}

async function paraPng(arquivo) {
    const url = URL.createObjectURL(arquivo);
    try {
        const img = new Image();
        img.src = url;
        await esperarEvento(img, ['load']);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return await new Promise(ok => c.toBlob(ok, 'image/png'));
    } catch (_) {
        throw new Error('Não consegui abrir a foto "' + arquivo.name + '".');
    } finally { URL.revokeObjectURL(url); }
}

async function acrescentarArquivos(lista, faixa) {
    const arquivos = Array.from(lista || []);
    if (!arquivos.length || !podeUsar()) return;
    const limite = (V() ? V().VIDEO_MAX_MB : 500) * 1024 * 1024;
    let soma = Object.values(midias).reduce((s, m) => s + (m.arquivo.size || 0), 0);
    const novos = [];
    for (const a of arquivos) {
        if (soma + (a.size || 0) > limite) { avisar('Os arquivos passariam de ' + (limite / 1024 / 1024) + ' MB. Use vídeos menores (ou comprima antes).'); break; }
        avisar('Abrindo "' + a.name + '"...');
        try {
            const m = await lerMidia(a, faixa);
            midias[m.id] = m;
            soma += m.arquivo.size || 0;
            novos.push(m);
        } catch (e) { avisar(e.message); }
    }
    if (!novos.length) return;
    aplicar(p => {
        novos.forEach(m => {
            if (m.tipo === 'video') p.clipes.push(M().novoClipeVideo(m.id, m));
            else if (m.tipo === 'imagem') p.clipes.push(M().novoClipeImagem(m.id));
            else p.audios.push(M().novoAudio(m.id, m, faixa === 'audio' ? Math.min(tempo, M().duracaoTotal(p)) : 0));
        });
        // Primeiro video em pe' num projeto ainda vazio: o formato acompanha.
        const primeiro = novos.find(m => m.largura && m.altura);
        if (proj.clipes.length === 0 && primeiro && primeiro.altura > primeiro.largura * 1.2) p.formato = '9:16';
    });
    const ultimo = novos[novos.length - 1];
    const ach = proj[ultimo.tipo === 'audio' ? 'audios' : 'clipes'].slice().reverse().find(x => x.midia === ultimo.id);
    if (ach) sel = ach.id;
    ajustarCanvas();
    zoomCaber();
    atualizarTudo();
    avisar(novos.length === 1 ? '"' + novos[0].nome + '" entrou na linha do tempo.' : novos.length + ' arquivos entraram na linha do tempo.');
}

function acrescentarCor() {
    if (!podeUsar()) return;
    const id = aplicar(p => { const c = M().novoClipeCor('#1b4488'); p.clipes.push(c); return c.id; });
    if (id) { sel = id; zoomCaber(); atualizarTudo(); }
}

function acrescentarTexto() {
    if (!podeUsar()) return;
    const total = M().duracaoTotal(proj);
    const inicio = total && tempo >= total - 0.1 ? Math.max(0, total - 3) : tempo;
    const id = aplicar(p => { const t = M().novoTexto(inicio); p.textos.push(t); return t.id; });
    if (id) {
        sel = id; atualizarTudo();
        const caixa = $('mvTextoTexto');
        if (caixa) { caixa.focus(); caixa.select(); }
    }
}

// ---------------------------------------------------------------------------
// Acoes da barra
// ---------------------------------------------------------------------------

function dividir() {
    pausar();
    const novo = aplicar(p => M().dividir(p, tempo, sel && itemNoTempo(sel) ? sel : null),
        { aviso: 'Coloque a agulha em cima do pedaço que quer dividir (e não colada na ponta).' });
    if (novo) sel = novo, atualizarTudo();
}
function itemNoTempo(id) {
    const a = M().acharItem(proj, id);
    if (!a) return false;
    if (a.lista === 'clipes') {
        const ini = M().inicios(proj)[a.indice];
        return tempo > ini && tempo < ini + M().duracaoClipe(a.item);
    }
    const fim = a.lista === 'textos' ? M().fimDe(a.item) : a.item.inicio + M().duracaoAudio(a.item);
    return tempo > a.item.inicio && tempo < fim;
}
function apagarLado(lado) {
    pausar();
    const ok = aplicar(p => M().apagarLado(p, tempo, sel && itemNoTempo(sel) ? sel : null, lado),
        { aviso: 'Coloque a agulha no meio do pedaço: ' + (lado === 'antes' ? 'o que vem antes dela' : 'o que vem depois dela') + ' é apagado.' });
    if (ok && lado === 'antes') {
        // O que sobrou escorregou para a esquerda: a agulha vai junto, para o ponto do corte.
        const em = M().clipeEm(proj, tempo);
        if (em) tempo = em.inicio;
        sel = null;
        atualizarTudo();
    }
}
function apagarSel() {
    if (!sel) { avisar('Escolha primeiro o pedaço que quer apagar (toque nele na linha do tempo).'); return; }
    aplicar(p => M().apagar(p, sel));
    sel = null;
    atualizarTudo();
}
function duplicarSel() {
    if (!sel) { avisar('Escolha primeiro o pedaço que quer duplicar.'); return; }
    const novo = aplicar(p => M().duplicar(p, sel));
    if (novo) { sel = novo; atualizarTudo(); }
}
function desfazer() {
    const p = hist.desfazer(proj);
    if (!p) return;
    proj = p; sessaoEdicao = null;
    ajustarCanvas(); atualizarTudo();
}
function refazer() {
    const p = hist.refazer(proj);
    if (!p) return;
    proj = p; sessaoEdicao = null;
    ajustarCanvas(); atualizarTudo();
}

// Mudar um campo do item selecionado (ou do projeto, com id '')
function mudar(id, campo, valor, opcoes) {
    const op = opcoes || {};
    const chaveSessao = id + ':' + campo;
    const repetido = op.digitando && sessaoEdicao === chaveSessao;
    aplicar(p => {
        const alvo = id ? (M().acharItem(p, id) || {}).item : p;
        if (!alvo) return false;
        const partes = campo.split('.');
        let o = alvo;
        for (let i = 0; i < partes.length - 1; i++) o = o[partes[i]];
        o[partes[partes.length - 1]] = valor;
        return true;
    }, { semHistorico: repetido, sessao: op.digitando ? chaveSessao : null, semPainel: op.digitando || op.semPainel });
    if (campo === 'formato' || campo === 'qualidade') ajustarCanvas(), desenhar();
}

// ---------------------------------------------------------------------------
// Tocar
// ---------------------------------------------------------------------------

function tocar() {
    if (tocando) { pausar(); return; }
    const total = M().duracaoTotal(proj);
    if (!total) { avisar('Coloque um vídeo, uma foto ou uma tela colorida primeiro.'); return; }
    if (tempo >= total - 0.05) tempo = 0;
    tocando = true;
    tempoBase = tempo;
    relogio = performance.now();
    clipeAtivoId = null;
    const b = $('mvBtnTocar'); if (b) b.textContent = '⏸';
    cancelAnimationFrame(pedidoQuadro);
    pedidoQuadro = requestAnimationFrame(passo);
}

function pausar() {
    tocando = false;
    cancelAnimationFrame(pedidoQuadro);
    Object.values(midias).forEach(m => { if (m.el && m.el.pause && !m.el.paused) { try { m.el.pause(); } catch (_) { /* ok */ } } });
    videoAtivo = null; clipeAtivoId = null;
    const b = $('mvBtnTocar'); if (b) b.textContent = '▶️';
}

function passo() {
    if (!tocando || !proj) return;
    if (!editorVisivel()) { pausar(); return; }
    const total = M().duracaoTotal(proj);
    tempo = tempoBase + (performance.now() - relogio) / 1000;
    if (tempo >= total) { tempo = total; pausar(); buscar(total); return; }
    sincronizar();
    desenhar();
    moverAgulha();
    pedidoQuadro = requestAnimationFrame(passo);
}

function sincronizar() {
    const em = M().clipeEm(proj, tempo);
    const c = em && em.clipe;
    const m = c && c.tipo === 'video' ? midias[c.midia] : null;
    const el = m && m.el;
    if (videoAtivo && videoAtivo !== el) { try { videoAtivo.pause(); } catch (_) { /* ok */ } videoAtivo = null; }
    if (el) {
        const vol = c.mudo ? 0 : Math.min(1, (Number(c.volume) || 0) / 100);
        el.volume = vol; el.muted = vol === 0;
        if (el.playbackRate !== (c.velocidade || 1)) el.playbackRate = c.velocidade || 1;
        if (clipeAtivoId !== c.id || Math.abs(el.currentTime - em.local) > 0.3) el.currentTime = em.local;
        if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
        videoAtivo = el;
    }
    clipeAtivoId = c ? c.id : null;
    // Faixa de audio
    const tocandoAgora = new Set();
    proj.audios.forEach(a => {
        const ma = midias[a.midia];
        if (!ma || !ma.el) return;
        const d = M().duracaoAudio(a);
        if (tempo >= a.inicio && tempo < a.inicio + d && !tocandoAgora.has(ma.el)) {
            tocandoAgora.add(ma.el);
            const local = a.de + (tempo - a.inicio);
            const fade = Math.min(1.5, d / 3);
            let k = 1;
            if (a.entrarSuave) k = Math.min(k, (tempo - a.inicio) / fade);
            if (a.sairSuave) k = Math.min(k, (a.inicio + d - tempo) / fade);
            ma.el.volume = Math.max(0, Math.min(1, (Number(a.volume) || 0) / 100 * k));
            if (Math.abs(ma.el.currentTime - local) > 0.3) ma.el.currentTime = local;
            if (ma.el.paused) { const p = ma.el.play(); if (p && p.catch) p.catch(() => {}); }
        }
    });
    proj.audios.forEach(a => {
        const ma = midias[a.midia];
        if (ma && ma.el && !tocandoAgora.has(ma.el) && !ma.el.paused) ma.el.pause();
    });
}

// Parado: leva o video ao quadro certo e desenha quando ele chegar ('seeked').
function buscar(t) {
    if (!proj) return;
    tempo = Math.max(0, Math.min(t, M().duracaoTotal(proj)));
    if (tocando) { tempoBase = tempo; relogio = performance.now(); clipeAtivoId = null; }
    else {
        const em = M().clipeEm(proj, tempo);
        if (em && em.clipe.tipo === 'video') {
            const m = midias[em.clipe.midia];
            if (m && m.el && Math.abs(m.el.currentTime - em.local) > 0.02) { try { m.el.currentTime = em.local; } catch (_) { /* ok */ } }
        }
    }
    desenhar();
    moverAgulha();
}

// ---------------------------------------------------------------------------
// Desenhar a previa
// ---------------------------------------------------------------------------

function ajustarCanvas() {
    const c = $('mvCanvas');
    if (!c || !proj) return;
    const d = M().dimensoes(Object.assign({}, proj, { qualidade: '360' }));
    if (c.width !== d.W || c.height !== d.H) { c.width = d.W; c.height = d.H; }
    const q = $('mvQuadro');
    if (q) { q.style.setProperty('--mv-ar', d.W + ' / ' + d.H); q.style.setProperty('--mv-arn', (d.W / d.H).toFixed(4)); }
}

function desenharMidia(ctx, el, nw, nh, W, H, encaixe) {
    if (!nw || !nh) return;
    const cobrir = (k) => { const w = nw * k, h = nh * k; ctx.drawImage(el, (W - w) / 2, (H - h) / 2, w, h); };
    if (encaixe === 'preencher') { cobrir(Math.max(W / nw, H / nh)); return; }
    if (proj.fundo.tipo === 'desfocado') {
        ctx.save();
        ctx.filter = 'blur(' + Math.round(W / 40) + 'px) brightness(0.85)';
        cobrir(Math.max(W / nw, H / nh) * 1.08);
        ctx.restore();
    }
    cobrir(Math.min(W / nw, H / nh));
}

function desenhar() {
    const c = $('mvCanvas');
    if (!c || !proj) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.fillStyle = proj.fundo.cor || '#000000';
    ctx.fillRect(0, 0, W, H);
    const em = M().clipeEm(proj, tempo);
    if (!em) {
        ctx.fillStyle = '#8a96aa';
        ctx.font = '600 ' + Math.round(H / 18) + 'px Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // (sem clipes, o convite "Comece adicionando..." fica por cima do canvas)
    } else {
        const cl = em.clipe;
        if (cl.tipo === 'cor') { ctx.fillStyle = cl.cor; ctx.fillRect(0, 0, W, H); }
        else {
            const m = midias[cl.midia];
            if (m && m.el) {
                if (cl.tipo === 'imagem') desenharMidia(ctx, m.el, m.el.naturalWidth, m.el.naturalHeight, W, H, cl.encaixe);
                else if (m.el.readyState >= 2) desenharMidia(ctx, m.el, m.el.videoWidth, m.el.videoHeight, W, H, cl.encaixe);
            } else if (m) {
                ctx.fillStyle = '#2d3748'; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#cbd5e0'; ctx.font = Math.round(H / 20) + 'px Arial'; ctx.textAlign = 'center';
                ctx.fillText('🎬 ' + m.nome + ' (sem prévia neste navegador)', W / 2, H / 2);
            }
        }
    }
    caixasTexto = [];
    proj.textos.forEach(t => {
        const op = M().opacidadeTexto(t, tempo);
        if (op <= 0 && t.id !== sel) return;
        ctx.save();
        ctx.globalAlpha = op <= 0 ? 0.25 : op;
        const caixa = M().desenharTexto(ctx, t, W, H);
        ctx.restore();
        caixasTexto.push(Object.assign({ id: t.id }, caixa));
        if (t.id === sel) {
            ctx.save();
            ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 2;
            ctx.strokeRect(caixa.x, caixa.y, caixa.w, caixa.h);
            ctx.restore();
        }
    });
    const tt = $('mvTempo');
    if (tt) tt.textContent = fmt(tempo) + ' / ' + fmt(M().duracaoTotal(proj));
}

// Arrastar o texto direto na previa
function ligarCanvas() {
    const c = $('mvCanvas');
    if (!c) return;
    let arrasto = null;
    const ponto = (e) => {
        const r = c.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width * c.width, y: (e.clientY - r.top) / r.height * c.height };
    };
    c.addEventListener('pointerdown', (e) => {
        const p = ponto(e);
        const alvo = caixasTexto.slice().reverse().find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
        if (!alvo) { if (sel) { sel = null; atualizarTudo(); } return; }
        const t = M().acharItem(proj, alvo.id).item;
        if (sel !== alvo.id) { sel = alvo.id; atualizarTudo(); }
        arrasto = { id: alvo.id, x0: p.x, y0: p.y, tx: t.x, ty: t.y, mexeu: false };
        c.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
        if (!arrasto) return;
        const p = ponto(e);
        const dx = (p.x - arrasto.x0) / c.width, dy = (p.y - arrasto.y0) / c.height;
        if (!arrasto.mexeu && Math.abs(dx) + Math.abs(dy) < 0.005) return;
        let nx = Math.max(0, Math.min(1, arrasto.tx + dx)), ny = Math.max(0, Math.min(1, arrasto.ty + dy));
        if (Math.abs(nx - 0.5) < 0.015) nx = 0.5;   // ima no centro
        aplicar(pp => { const it = M().acharItem(pp, arrasto.id).item; it.x = Math.round(nx * 1000) / 1000; it.y = Math.round(ny * 1000) / 1000; return true; },
            { semHistorico: arrasto.mexeu, semPainel: true });
        arrasto.mexeu = true;
    });
    const soltar = () => { if (arrasto && arrasto.mexeu) renderProps(); arrasto = null; };
    c.addEventListener('pointerup', soltar);
    c.addEventListener('pointercancel', soltar);
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

function zoomCaber() {
    const rol = $('mvRolagem');
    const total = proj ? Math.max(M().duracaoTotal(proj), ...proj.audios.map(a => a.inicio + M().duracaoAudio(a)), ...proj.textos.map(t => M().fimDe(t)), 5) : 10;
    const largura = rol ? Math.max(200, rol.clientWidth - 30) : 600;
    pps = Math.max(4, Math.min(300, largura / total));
}

function zoom(fator) {
    if (!fator) zoomCaber(); else pps = Math.max(4, Math.min(400, pps * fator));
    renderTimeline();
}

function passoRegua() {
    const opcoes = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    return opcoes.find(s => s * pps >= 60) || 600;
}

const t1 = (s) => (Math.round(s * 10) / 10).toString().replace('.', ',') + 's';

function renderTimeline() {
    const tr = $('mvTrilho');
    if (!tr || !proj) return;
    const total = M().duracaoTotal(proj);
    const fimMax = Math.max(total, ...proj.audios.map(a => a.inicio + M().duracaoAudio(a)), ...proj.textos.map(t => M().fimDe(t)), 1);
    const largura = Math.max((fimMax + 5) * pps, ($('mvRolagem') || {}).clientWidth || 300);
    const ini = M().inicios(proj);
    const passoR = passoRegua();
    let regua = '';
    for (let s = 0; s * pps <= largura; s += passoR) {
        regua += `<div class="mv-tic" style="left:${s * pps}px">${passoR < 1 ? fmt(s) : fmt(s).replace(/,\d$/, '')}</div>`;
    }
    // Bloco: nome (com reticencias so' quando nao cabe) e um chip com a duracao.
    const bloco = (item, lista, left, w, nome, chip, estilo, classe) => `
        <div class="mv-bloco mv-b-${lista} ${classe || ''} ${item.id === sel ? 'mv-sel' : ''}" data-id="${item.id}" data-lista="${lista}"
             style="left:${left}px; width:${Math.max(6, w - 2)}px; ${estilo || ''}" title="${esc(nome + ' · ' + chip)}">
            <div class="mv-alca mv-alca-e" data-lado="inicio"></div>
            <span class="mv-bloco-nome">${esc(nome)}</span>${w > 46 ? `<span class="mv-chip">${esc(chip)}</span>` : ''}
            <div class="mv-alca mv-alca-d" data-lado="fim"></div>
        </div>`;
    const clipes = proj.clipes.map((c, i) => {
        const d = M().duracaoClipe(c);
        const m = midias[c.midia];
        let estilo = '', nome = '', classe = '';
        if (c.tipo === 'cor') { estilo = 'background:' + esc(c.cor) + ';'; nome = 'Tela colorida'; }
        else if (c.tipo === 'imagem') { estilo = m ? `background-image:url('${m.url}');` : ''; nome = m ? m.nome : 'foto'; classe = 'mv-com-img'; }
        else {
            nome = (c.mudo || !Number(c.volume) ? '🔇 ' : '') + (m ? m.nome : 'vídeo');
            if (m && m.miniatura) { estilo = `background-image:url('${m.miniatura}');`; classe = 'mv-com-img'; }
        }
        const chip = (c.tipo === 'video' && c.velocidade !== 1 ? String(c.velocidade).replace('.', ',') + 'x · ' : '') + t1(d);
        return bloco(c, 'clipes', ini[i] * pps, d * pps, nome, chip, estilo, classe);
    }).join('');
    const textos = proj.textos.map(t => bloco(t, 'textos', t.inicio * pps, t.duracao * pps, t.texto || '(vazio)', t1(t.duracao))).join('');
    const audios = proj.audios.map(a => {
        const m = midias[a.midia];
        // A forma de onda e' do arquivo inteiro; o bloco mostra so' o trecho usado.
        const estilo = m && m.onda ? `background-image:url('${m.onda}'); background-size:${(m.duracao * pps).toFixed(1)}px 100%; background-position:${(-a.de * pps).toFixed(1)}px 0; background-repeat:no-repeat;` : '';
        return bloco(a, 'audios', a.inicio * pps, M().duracaoAudio(a) * pps, (a.volume === 0 ? '🔇 ' : '') + (m ? m.nome : 'áudio'), t1(M().duracaoAudio(a)), estilo);
    }).join('');
    tr.style.width = largura + 'px';
    const vazio = `<div class="mv-faixa-vazia"><span>Comece adicionando um vídeo ou foto</span>
        <button class="mv-primario mv-peq" onclick="event.stopPropagation(); document.querySelector('#mvBtnMidia input').click()">➕ Adicionar</button></div>`;
    tr.innerHTML = `
        <div class="mv-regua" data-faixa="regua">${regua}</div>
        <div class="mv-faixa mv-f1" data-faixa="clipes">${clipes || vazio}</div>
        <div class="mv-faixa mv-f2" data-faixa="textos">${textos}</div>
        <div class="mv-faixa mv-f2" data-faixa="audios">${audios}</div>
        ${total ? `<div class="mv-fim" style="left:${total * pps}px"></div>` : ''}
        <div class="mv-agulha" id="mvAgulha"><div class="mv-agulha-cab"></div></div>`;
    moverAgulha();
    ligarTimeline();
}

function moverAgulha() {
    const a = $('mvAgulha');
    if (a) a.style.transform = 'translateX(' + (tempo * pps) + 'px)';
    const tt = $('mvTempo');
    if (tt && proj) tt.textContent = fmt(tempo) + ' / ' + fmt(M().duracaoTotal(proj));
    if (tocando) {
        const rol = $('mvRolagem');
        if (rol) {
            const x = tempo * pps;
            if (x > rol.scrollLeft + rol.clientWidth - 40 || x < rol.scrollLeft) rol.scrollLeft = Math.max(0, x - 60);
        }
    }
}

// Pontos onde o arrasto "gruda": agulha, bordas dos clipes, bordas dos outros itens.
function pontosIma(exceto) {
    const pts = [0, tempo];
    let t = 0;
    proj.clipes.forEach(c => { t += M().duracaoClipe(c); pts.push(t); });
    proj.textos.forEach(x => { if (x.id !== exceto) pts.push(x.inicio, M().fimDe(x)); });
    proj.audios.forEach(x => { if (x.id !== exceto) pts.push(x.inicio, x.inicio + M().duracaoAudio(x)); });
    return pts;
}
function grudar(valor, exceto, tamanho) {
    const lim = 8 / pps;
    let melhor = valor, dist = lim;
    pontosIma(exceto).forEach(p => {
        if (Math.abs(p - valor) < dist) { dist = Math.abs(p - valor); melhor = p; }
        if (tamanho != null && Math.abs(p - (valor + tamanho)) < dist) { dist = Math.abs(p - (valor + tamanho)); melhor = p - tamanho; }
    });
    return melhor;
}

function ligarTimeline() {
    const tr = $('mvTrilho');
    if (!tr || tr._ligado) return;
    tr._ligado = true;
    let g = null;   // gesto em andamento
    const xDe = (e) => { const r = tr.getBoundingClientRect(); return e.clientX - r.left; };

    tr.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        const bloco = e.target.closest('.mv-bloco');
        const x = xDe(e);
        if (!bloco) {
            // Clique no vazio / na regua: move a agulha (e arrasta junto).
            g = { tipo: 'agulha' };
            if (sel) { sel = null; renderProps(); renderTimeline(); }
            buscar(x / pps);
            tr.setPointerCapture(e.pointerId);
            return;
        }
        const id = bloco.dataset.id, lista = bloco.dataset.lista;
        const alca = e.target.closest('.mv-alca');
        if (sel !== id) { sel = id; renderProps(); desenhar(); bloco.parentNode.querySelectorAll('.mv-sel').forEach(b => b.classList.remove('mv-sel')); bloco.classList.add('mv-sel'); }
        g = { tipo: alca ? 'aparar' : 'mover', lado: alca && alca.dataset.lado, id, lista, x0: x, base: M().copiar(proj), mexeu: false, bloco };
        tr.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    tr.addEventListener('pointermove', (e) => {
        if (!g) return;
        const x = xDe(e);
        if (g.tipo === 'agulha') { buscar(Math.max(0, x / pps)); return; }
        const dx = x - g.x0;
        if (!g.mexeu && Math.abs(dx) < 4) return;
        if (!g.mexeu) { hist.guardar(g.base); g.mexeu = true; pausar(); }
        const p = M().copiar(g.base);
        const it = M().acharItem(p, g.id).item;
        if (g.tipo === 'aparar') {
            let delta = dx / pps;
            if (g.lista !== 'clipes') {
                const bordaAntes = g.lado === 'inicio' ? it.inicio : it.inicio + (g.lista === 'textos' ? it.duracao : M().duracaoAudio(it));
                delta = grudar(bordaAntes + delta, g.id) - bordaAntes;
            }
            M().aparar(p, g.id, g.lado, delta);
            proj = p;
            if (g.lista === 'clipes') {
                // Mostra o quadro da borda que esta' sendo puxada.
                const ini = M().inicios(proj)[M().acharItem(proj, g.id).indice];
                buscar(g.lado === 'inicio' ? ini : ini + M().duracaoClipe(it) - 0.04);
            }
            renderTimelineSemPerderGesto();
        } else if (g.lista === 'clipes') {
            // Reordenar: o bloco segue o dedo; ao soltar, entra na posicao.
            g.bloco.style.transform = 'translateX(' + dx + 'px)';
            g.bloco.style.zIndex = 5; g.bloco.style.opacity = 0.85;
            g.dx = dx;
        } else {
            const tam = g.lista === 'textos' ? it.duracao : M().duracaoAudio(it);
            const novo = grudar(Math.max(0, it.inicio + dx / pps), g.id, tam);
            M().moverPara(p, g.id, novo);
            proj = p;
            renderTimelineSemPerderGesto();
            desenhar();
        }
    });

    const soltar = () => {
        if (!g) return;
        const gesto = g;
        g = null;
        if (gesto.tipo === 'agulha' || !gesto.mexeu) return;
        if (gesto.tipo === 'mover' && gesto.lista === 'clipes') {
            const p = M().copiar(gesto.base);
            const ini = M().inicios(p);
            const a = M().acharItem(p, gesto.id);
            const centro = ini[a.indice] + M().duracaoClipe(a.item) / 2 + (gesto.dx || 0) / pps;
            let destino = 0;
            p.clipes.forEach((c, i) => { if (i !== a.indice && ini[i] + M().duracaoClipe(c) / 2 < centro) destino++; });
            M().moverClipe(p, gesto.id, destino);
            proj = p;
        }
        sessaoEdicao = null;
        atualizarTudo();
    };
    tr.addEventListener('pointerup', soltar);
    tr.addEventListener('pointercancel', soltar);
}

// Durante o arrasto, redesenha os blocos mas mantem o elemento que tem o "pointer capture".
function renderTimelineSemPerderGesto() {
    const tr = $('mvTrilho');
    if (!tr) return;
    const total = M().duracaoTotal(proj);
    const ini = M().inicios(proj);
    const posicao = (id) => {
        const a = M().acharItem(proj, id);
        if (!a) return null;
        if (a.lista === 'clipes') return [ini[a.indice], M().duracaoClipe(a.item)];
        if (a.lista === 'textos') return [a.item.inicio, a.item.duracao];
        return [a.item.inicio, M().duracaoAudio(a.item)];
    };
    tr.querySelectorAll('.mv-bloco').forEach(b => {
        const p = posicao(b.dataset.id);
        if (!p) return;
        b.style.left = (p[0] * pps) + 'px';
        b.style.width = Math.max(6, p[1] * pps) + 'px';
    });
    const fim = tr.querySelector('.mv-fim');
    if (fim) fim.style.left = (total * pps) + 'px';
    moverAgulha();
}

// ---------------------------------------------------------------------------
// Painel de propriedades
// ---------------------------------------------------------------------------

// Controles do painel no estilo do protótipo: botões segmentados e "chips" em vez de listas.
const seg = (itens, atual, acao, classe) => `<div class="mv-seg ${classe || ''}">${itens.map(([v, rot, ic]) =>
    `<button type="button" class="${String(v) === String(atual) ? 'mv-on' : ''}" data-v="${esc(v)}" onclick="${acao.replace(/\$V/g, typeof v === 'number' ? v : "'" + esc(v) + "'")}">${ic || ''}<span>${esc(rot)}</span></button>`).join('')}</div>`;
const campo = (rotulo, html) => `<div class="mv-campo"><label class="mv-rot-campo">${rotulo}</label>${html}</div>`;
const CORES = ['#ffffff', '#ffd60a', '#2563c9', '#e53e3e', '#38a169', '#000000'];
const corBolinhas = (id, chave, atual) => `<div class="mv-cores">${CORES.map(c =>
    `<button type="button" class="mv-bolinha ${String(atual).toLowerCase() === c ? 'mv-on' : ''}" style="background:${c}" title="${c}" onclick="mvMudar('${id}', '${chave}', '${c}')"></button>`).join('')}
    <label class="mv-bolinha mv-outra" title="Outra cor">＋<input type="color" value="${esc(atual)}" onchange="mvMudar('${id}', '${chave}', this.value)"></label></div>`;
const botoesFim = () => `<div class="mv-linha-bts">
    <button class="mv-fantasma mv-peq" onclick="mvDuplicar()">⧉ Duplicar</button>
    <button class="mv-fantasma mv-peq mv-perigo" onclick="mvApagar()">🗑️ Apagar</button></div>`;
const cabecalho = (titulo) => `<div class="mv-painel-cab"><p class="mv-secao">Ajustes</p>
    <button class="mv-fantasma mv-peq" onclick="mvFecharAjustes(); mvSelecionar(null)">Fechar ✕</button></div>
    <div class="mv-painel-tit">${titulo}</div>`;

function renderProps() {
    const el = $('mvProps');
    if (!el || !proj) return;
    const a = sel ? M().acharItem(proj, sel) : null;
    if (!a) el.innerHTML = propsProjeto();
    else if (a.lista === 'clipes') el.innerHTML = propsClipe(a.item, a.indice);
    else if (a.lista === 'textos') el.innerHTML = propsTexto(a.item);
    else el.innerHTML = propsAudio(a.item);
    atualizarFolha();
}

function propsProjeto() {
    const f = proj.fundo;
    const icFormato = { '16:9': [22, 12], '9:16': [10, 18], '1:1': [15, 15], '4:3': [18, 14] };
    return `
      <div class="mv-painel-cab"><p class="mv-secao">Ajustes</p>
        <button class="mv-fantasma mv-peq mv-so-cel" onclick="mvFecharAjustes()">Fechar ✕</button></div>
      <div class="mv-painel-tit">O vídeo</div>
      ${campo('Formato', seg(Object.keys(M().FORMATOS).map(k => [k, k, `<i class="mv-prop" style="width:${icFormato[k][0]}px;height:${icFormato[k][1]}px"></i>`]), proj.formato, "mvMudar('', 'formato', $V)", 'mv-seg-formato'))}
      <div class="mv-nota">${esc(M().FORMATOS[proj.formato].nome)}</div>
      ${campo('Fundo (quando o vídeo não enche o quadro)', seg([['cor', 'Cor'], ['desfocado', 'Desfocado']], f.tipo, "mvMudar('', 'fundo.tipo', $V)"))}
      ${f.tipo === 'cor' ? campo('Cor do fundo', corBolinhas('', 'fundo.cor', f.cor)) : ''}
      ${campo('Qualidade ao exportar', seg([['480', '480p'], ['720', '720p'], ['1080', '1080p']], proj.qualidade, "mvMudar('', 'qualidade', $V)"))}
      <div class="mv-nota">720p é o recomendado. 1080p demora bem mais para exportar.</div>
      ${proj.clipes.length ? `<div class="mv-resumo">${proj.clipes.length} pedaço(s) · ${proj.textos.length} texto(s) · ${proj.audios.length} áudio(s) · total <b>${fmt(M().duracaoTotal(proj))}</b></div>`
        : '<div class="mv-nota">Toque num pedaço da linha do tempo para mudar velocidade, volume, texto, cor...</div>'}`;
}

function propsClipe(c, i) {
    const m = midias[c.midia];
    const titulo = c.tipo === 'cor' ? '🟦 Tela colorida' : (c.tipo === 'imagem' ? '🖼️ ' : '🎬 ') + esc(m ? m.nome : '');
    const encaixe = campo('No quadro', seg([['conter', 'Inteiro'], ['preencher', 'Encher (corta)']], c.encaixe, `mvMudar('${c.id}', 'encaixe', $V)`));
    let corpo = '';
    if (c.tipo === 'video') {
        corpo = `
          ${campo('Velocidade', seg(M().VELOCIDADES.map(v => [v, String(v).replace('.', ',') + 'x']), c.velocidade, `mvMudar('${c.id}', 'velocidade', $V)`, 'mv-seg-vel" id="mvVelocidade'))}
          ${campo('Volume: <b id="mvVolTxt">' + (c.mudo ? 'sem som' : c.volume + '%') + '</b>',
            `<input type="range" class="mv-range" min="0" max="200" step="5" value="${c.volume}" oninput="document.getElementById('mvVolTxt').textContent=this.value+'%'; mvMudar('${c.id}', 'volume', Number(this.value), {digitando:true})">`)}
          <label class="mv-check"><input type="checkbox" id="mvMudo" ${c.mudo ? 'checked' : ''} onchange="mvMudar('${c.id}', 'mudo', this.checked)"> Tirar o som deste pedaço</label>
          ${encaixe}
          <div class="mv-nota">Trecho do arquivo: ${fmt(c.de)} a ${fmt(c.ate)}. Na linha do tempo: ${fmt(M().duracaoClipe(c))}.</div>`;
    } else {
        corpo = `
          ${campo('Duração (segundos)', `<input type="number" class="mv-entrada" id="mvDuracao" min="0.1" max="600" step="0.5" value="${c.duracao}" onchange="mvMudar('${c.id}', 'duracao', Math.max(0.1, Number(this.value) || 4))">`)}
          ${c.tipo === 'cor' ? campo('Cor', corBolinhas(c.id, 'cor', c.cor)) + '<div class="mv-nota">Use “🔤 Texto” para escrever o título em cima.</div>' : encaixe}`;
    }
    return cabecalho(titulo) + corpo + `
        ${campo('Posição na fila', `<div class="mv-linha-bts">
          <button class="mv-fantasma mv-peq" onclick="mvMoverClipe(-1)" ${i === 0 ? 'disabled' : ''}>◀ Para trás</button>
          <button class="mv-fantasma mv-peq" onclick="mvMoverClipe(1)" ${i === proj.clipes.length - 1 ? 'disabled' : ''}>Para frente ▶</button></div>`)}
        ${botoesFim()}`;
}

function propsTexto(t) {
    const amostra = { contorno: 'mv-st-contorno', caixa: 'mv-st-caixa', faixa: 'mv-st-faixa', simples: 'mv-st-sombra' };
    const estilos = [['contorno', 'Contorno'], ['caixa', 'Caixa'], ['faixa', 'Faixa'], ['simples', 'Sombra']];
    const pos = t.y < 0.3 ? '0.12' : t.y > 0.7 ? '0.82' : '0.5';
    return cabecalho('🔤 Texto') + `
      ${campo('Texto', `<textarea class="mv-entrada" id="mvTextoTexto" rows="2" oninput="mvMudar('${t.id}', 'texto', this.value, {digitando:true})">${esc(t.texto)}</textarea>`)}
      ${campo('Letra', `<select class="mv-entrada" onchange="mvMudar('${t.id}', 'fonte', this.value)">${Object.entries(M().FONTES).map(([k, v]) => `<option value="${k}" ${k === t.fonte ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select>`)}
      ${campo('Estilo', `<div class="mv-chips" id="mvEstilo">${estilos.map(([v, r]) =>
          `<button type="button" class="mv-chip-est ${t.estilo === v ? 'mv-on' : ''}" data-v="${v}" onclick="mvMudar('${t.id}', 'estilo', '${v}')"><span class="mv-amostra ${amostra[v]}">Aa</span><span>${r}</span></button>`).join('')}</div>`)}
      ${campo('Cor da letra', corBolinhas(t.id, 'cor', t.cor))}
      ${t.estilo !== 'simples' ? campo(t.estilo === 'contorno' ? 'Cor do contorno' : 'Cor da caixa', corBolinhas(t.id, 'corFundo', t.corFundo)) : ''}
      ${campo('Tamanho', `<input type="range" class="mv-range" min="0.03" max="0.2" step="0.005" value="${t.tamanho}" oninput="mvMudar('${t.id}', 'tamanho', Number(this.value), {digitando:true})">`)}
      ${campo('Posição <small>(ou arraste o texto na prévia)</small>', seg([['0.12', 'Alto'], ['0.5', 'Meio'], ['0.82', 'Baixo']], pos, `mvMudar('${t.id}', 'x', 0.5); mvMudar('${t.id}', 'y', Number($V))`))}
      <label class="mv-check"><input type="checkbox" ${t.negrito ? 'checked' : ''} onchange="mvMudar('${t.id}', 'negrito', this.checked)"> Negrito</label>
      <label class="mv-check"><input type="checkbox" ${t.suave ? 'checked' : ''} onchange="mvMudar('${t.id}', 'suave', this.checked)"> Aparecer e sumir suave</label>
      <div class="mv-duas">
        ${campo('Começa em (s)', `<input type="number" class="mv-entrada" min="0" step="0.1" value="${t.inicio}" onchange="mvMudar('${t.id}', 'inicio', Math.max(0, Number(this.value) || 0))">`)}
        ${campo('Dura (s)', `<input type="number" class="mv-entrada" id="mvTextoDuracao" min="0.1" step="0.1" value="${t.duracao}" onchange="mvMudar('${t.id}', 'duracao', Math.max(0.1, Number(this.value) || 3))">`)}
      </div>
      ${botoesFim()}`;
}

function propsAudio(a) {
    const m = midias[a.midia];
    return cabecalho('🎵 ' + esc(m ? m.nome : 'Áudio')) + `
      ${campo('Volume: <b id="mvVolATxt">' + a.volume + '%</b>',
        `<input type="range" class="mv-range" min="0" max="200" step="5" value="${a.volume}" oninput="document.getElementById('mvVolATxt').textContent=this.value+'%'; mvMudar('${a.id}', 'volume', Number(this.value), {digitando:true})">`)}
      ${seg([[15, 'Fundo baixinho'], [50, 'Médio'], [100, 'Normal']], a.volume, `mvMudar('${a.id}', 'volume', $V)`)}
      <label class="mv-check"><input type="checkbox" ${a.entrarSuave ? 'checked' : ''} onchange="mvMudar('${a.id}', 'entrarSuave', this.checked)"> Começar baixinho e subir</label>
      <label class="mv-check"><input type="checkbox" ${a.sairSuave ? 'checked' : ''} onchange="mvMudar('${a.id}', 'sairSuave', this.checked)"> Terminar abaixando</label>
      ${campo('Começa em (s)', `<input type="number" class="mv-entrada" min="0" step="0.1" value="${a.inicio}" onchange="mvMudar('${a.id}', 'inicio', Math.max(0, Number(this.value) || 0))">`)}
      <div class="mv-nota">Toca de ${fmt(a.inicio)} a ${fmt(a.inicio + M().duracaoAudio(a))} do vídeo. O que passar do fim do vídeo é cortado.</div>
      ${botoesFim()}`;
}

function moverClipeSel(direcao) {
    const a = sel && M().acharItem(proj, sel);
    if (!a || a.lista !== 'clipes') return;
    aplicar(p => M().moverClipe(p, sel, a.indice + direcao));
}

function selecionar(id) { sel = id; atualizarTudo(); }

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------

function ligarTeclas() {
    if (teclasLigadas) return;
    teclasLigadas = true;
    document.addEventListener('keydown', (e) => {
        if (!proj || !editorVisivel()) return;
        const alvo = e.target;
        if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
        if (document.querySelector('.modal.active, .modal[style*="display: block"], #tourCaixa')) return;
        const k = e.key, ctrl = e.ctrlKey || e.metaKey;
        let feito = true;
        if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) desfazer();
        else if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) refazer();
        else if (ctrl) feito = false;
        else if (k === ' ') tocar();
        else if (k === 's' || k === 'S') dividir();
        else if (k === 'q' || k === 'Q') apagarLado('antes');
        else if (k === 'w' || k === 'W') apagarLado('depois');
        else if (k === 'd' || k === 'D') duplicarSel();
        else if (k === 'Delete' || k === 'Backspace') apagarSel();
        else if (k === 'ArrowLeft') buscar(tempo - (e.shiftKey ? 5 : 1 / M().FPS));
        else if (k === 'ArrowRight') buscar(tempo + (e.shiftKey ? 5 : 1 / M().FPS));
        else if (k === 'Home') buscar(0);
        else if (k === 'End') buscar(Infinity);
        else if (k === 'Escape') { sel = null; atualizarTudo(); }
        else feito = false;
        if (feito) e.preventDefault();
    });
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

function cancelarExportacao() {
    if (!exportando) return;
    exportando = false;
    if (V()) V().cancelar();
    renderExportando(null);
}

async function exportar() {
    if (exportando || !proj) return;
    if (!proj.clipes.length) { avisar('Coloque pelo menos um vídeo, foto ou tela colorida.'); return; }
    if (!podeUsar()) return;
    pausar();
    exportando = true;
    resultado = null;
    atualizarBotoes();
    fecharExport();
    renderExportando({ pct: 0, texto: 'Começando...' });
    const inicio = Date.now();
    try {
        const r = await M().exportar(proj, midias, (pct, texto) => { if (exportando) renderExportando({ pct, texto }); });
        if (!exportando) return;   // cancelado
        r.segundos = (Date.now() - inicio) / 1000;
        resultado = r;
        exportando = false;
        renderResultado();
    } catch (e) {
        const cancelado = !exportando;
        exportando = false;
        if (!cancelado) renderErroExport(e.message || String(e));
    } finally {
        atualizarBotoes();
    }
}

// Exportar aparece numa janela por cima do editor (nao empurra a linha do tempo).
function janelaExport(html) {
    const ex = $('mvExport');
    if (!ex) return;
    ex.innerHTML = html ? `<div class="mv-janela-fundo"><div class="mv-janela">${html}</div></div>` : '';
}

function renderExportando(estado) {
    if (!estado) {
        janelaExport(`<div class="mv-jan-tit">Exportação cancelada</div>
            <div class="mv-linha-bts" style="justify-content:flex-end;"><button class="mv-primario" onclick="mvFecharExport()">OK</button></div>`);
        return;
    }
    const pct = Math.max(0, Math.min(100, estado.pct || 0));
    const barra = $('mvBarra');
    if (barra) {   // so' atualiza (nao refaz a janela a cada passo)
        barra.style.width = pct + '%';
        const t = $('mvTextoProgresso'); if (t) t.textContent = estado.texto || '';
        return;
    }
    janelaExport(`
        <div class="mv-jan-tit">⏳ Exportando o vídeo...</div>
        <div class="mv-barra-fundo"><div id="mvBarra" style="width:${pct}%"></div></div>
        <div id="mvTextoProgresso" class="mv-nota">${esc(estado.texto || '')}</div>
        <div class="mv-nota">Deixe esta aba aberta. No navegador, exportar leva mais ou menos o tempo do vídeo (ou mais, em 1080p).</div>
        <div class="mv-linha-bts" style="justify-content:flex-end;"><button class="mv-fantasma" onclick="mvCancelarExportacao()">Cancelar</button></div>`);
}

function renderErroExport(msg) {
    janelaExport(`<div class="mv-jan-tit">❌ Não deu para exportar</div><div class="mv-erro">${esc(msg)}</div>
        <div class="mv-linha-bts" style="justify-content:flex-end;"><button class="mv-primario" onclick="mvFecharExport()">OK</button></div>`);
}

function renderResultado() {
    if (!resultado) return;
    const a = resultado.arquivos[0];
    if (urlResultado) { try { URL.revokeObjectURL(urlResultado); } catch (_) { /* ok */ } }
    urlResultado = URL.createObjectURL(a.blob);
    janelaExport(`
        <div class="mv-jan-tit mv-pronto">✅ Pronto${resultado.segundos ? ' em ' + resultado.segundos.toFixed(1) + 's' : ''}</div>
        <div class="mv-nota">${esc(resultado.mensagem)}</div>
        <video src="${urlResultado}" controls playsinline class="mv-video-final"></video>
        <div class="mv-nota">🎬 ${esc(a.nome)} · ${V() ? V().formatarTamanho(a.blob.size) : ''}. O vídeo fica só neste aparelho e se perde ao sair da página: baixe antes de sair.</div>
        <div class="mv-linha-bts" style="justify-content:flex-end;">
          <button class="mv-fantasma" onclick="mvFecharExport()">Voltar a editar</button>
          <a class="mv-primario" id="mvBaixar" href="${urlResultado}" download="${esc(a.nome)}">⬇️ Baixar</a>
        </div>`);
}

function fecharExport() { janelaExport(''); }

// ---------------------------------------------------------------------------

const ESTILO = `<style>
  body.mv-aberto { overflow:hidden; }
  #mvEditor { --mv-fundo:#14171d; --mv-sup:#1d2129; --mv-sup2:#272c36; --mv-linha:#343a46; --mv-txt:#eef1f6; --mv-apagado:#a3abb9;
    --mv-acento:var(--accent, #2563c9); --mv-sobre-acento:var(--on-accent, #fff); --mv-sel:#ffd60a; --mv-verde:#2f9e63; --mv-verm:#e5484d;
    position:fixed; inset:0; z-index:990; background:var(--mv-fundo); color:var(--mv-txt); display:flex; flex-direction:column;
    font-size:14px; line-height:1.35; overflow:hidden; }
  #mvEditor *, #mvEditor *::before, #mvEditor *::after { box-sizing:border-box; }
  #mvEditor button, #mvEditor input, #mvEditor select, #mvEditor textarea { font:inherit; color:inherit; }
  #mvEditor button { cursor:pointer; }
  #mvEditor button:disabled { opacity:.35; cursor:default; }
  #mvEditor p { margin:0; }
  #mvEditor label { display:block; margin:0; font-weight:inherit; font-size:inherit; color:inherit; }
  #mvEditor input, #mvEditor textarea, #mvEditor select { margin:0; min-height:0; box-shadow:none; font-size:14px; }
  #mvEditor input:focus, #mvEditor textarea:focus, #mvEditor select:focus { border-color:var(--mv-acento); box-shadow:0 0 0 2px var(--mv-acento); outline:none; }
  #mvEditor select.mv-entrada { background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a3abb9' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; padding-right:30px; }
  #mvEditor .mv-so-cel, #mvEditor .mv-add-bt.mv-so-cel { display:none !important; }

  #mvEditor .mv-topo { flex:none; height:52px; display:flex; align-items:center; gap:10px; padding:0 12px; background:var(--mv-sup); border-bottom:1px solid var(--mv-linha); }
  #mvEditor .mv-titulo { flex:1; text-align:center; font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #mvEditor .mv-topo-dir { display:flex; gap:8px; }
  #mvEditor .mv-fantasma { background:transparent; border:1px solid var(--mv-linha); border-radius:8px; padding:7px 11px; white-space:nowrap; }
  #mvEditor .mv-fantasma:hover:not(:disabled) { background:var(--mv-sup2); }
  #mvEditor .mv-primario { display:inline-flex; align-items:center; gap:6px; background:var(--mv-acento); color:var(--mv-sobre-acento); border:0; border-radius:8px; padding:8px 14px; font-weight:700; white-space:nowrap; text-decoration:none; }
  #mvEditor .mv-primario:hover:not(:disabled) { filter:brightness(1.1); }
  #mvEditor .mv-peq { padding:5px 10px; font-size:12px; }
  #mvEditor .mv-perigo { color:#ff8a8d; }
  #mvEditor .mv-secao { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--mv-apagado); font-weight:700; }

  #mvEditor .mv-principal { flex:1; min-height:0; display:grid; grid-template-columns:100px minmax(0,1fr) 310px; }
  #mvEditor .mv-add { border-right:1px solid var(--mv-linha); padding:12px 8px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; }
  #mvEditor .mv-add-bt { display:flex !important; margin:0; flex-direction:column; align-items:center; gap:4px; padding:10px 4px; border-radius:12px; background:var(--mv-sup); border:1px solid var(--mv-linha); font-size:12px; text-align:center; line-height:1.2; cursor:pointer; color:var(--mv-txt); }
  #mvEditor .mv-add-bt:hover { border-color:var(--mv-acento); }
  #mvEditor .mv-add-ic { font-size:24px; line-height:1.1; }

  #mvEditor .mv-centro { min-width:0; min-height:0; display:flex; flex-direction:column; padding:12px; gap:10px; }
  #mvEditor .mv-palco { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; container-type:size; }
  #mvEditor .mv-quadro { position:relative; aspect-ratio:var(--mv-ar, 16/9); width:min(100cqw, 100cqh * var(--mv-arn, 1.7778)); max-height:100%; background:#000; border-radius:8px; overflow:hidden; box-shadow:0 10px 40px -10px #000; }
  #mvEditor #mvCanvas { display:block; width:100%; height:100%; touch-action:none; }
  #mvEditor .mv-vazio-palco { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; text-align:center; padding:16px; border:2px dashed var(--mv-linha); border-radius:8px; background:var(--mv-fundo); }
  #mvEditor .mv-vazio-palco p { font-size:clamp(14px, 2.2vw, 20px); font-weight:700; }
  #mvEditor .mv-controles { flex:none; display:flex; align-items:center; justify-content:center; gap:8px; }
  #mvEditor .mv-redondo { width:38px; height:38px; border-radius:50%; background:var(--mv-sup); border:1px solid var(--mv-linha); display:inline-flex; align-items:center; justify-content:center; }
  #mvEditor .mv-tocar { width:46px; height:46px; background:var(--mv-acento); color:var(--mv-sobre-acento); border:0; font-size:18px; }
  #mvEditor .mv-tempo { font-variant-numeric:tabular-nums; color:var(--mv-apagado); margin-left:6px; white-space:nowrap; }

  #mvEditor .mv-painel { border-left:1px solid var(--mv-linha); background:var(--mv-sup); overflow-y:auto; min-width:0; }
  #mvEditor .mv-painel-dentro { padding:14px; display:flex; flex-direction:column; gap:14px; }
  #mvEditor .mv-painel-cab { display:flex; justify-content:space-between; align-items:center; gap:8px; min-height:28px; }
  #mvEditor .mv-painel-tit { font-size:16px; font-weight:700; overflow-wrap:anywhere; }
  #mvEditor .mv-campo { display:flex; flex-direction:column; gap:6px; min-width:0; }
  #mvEditor .mv-rot-campo { font-size:12px; color:var(--mv-apagado); overflow-wrap:anywhere; }
  #mvEditor .mv-rot-campo b { color:var(--mv-txt); }
  #mvEditor .mv-seg { display:flex; flex-wrap:wrap; gap:2px; background:var(--mv-fundo); padding:3px; border-radius:10px; }
  #mvEditor .mv-seg button { flex:1 1 0; min-width:52px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:7px 4px; border:0; background:transparent; border-radius:8px; font-size:12px; line-height:1.2; text-align:center; }
  #mvEditor .mv-seg button:hover:not(.mv-on) { background:var(--mv-sup2); }
  #mvEditor .mv-seg button.mv-on { background:var(--mv-acento); color:var(--mv-sobre-acento); font-weight:700; }
  #mvEditor .mv-seg-vel button { flex:1 0 21%; min-width:44px; }
  #mvEditor .mv-prop { display:block; border:2px solid currentColor; border-radius:2px; }
  #mvEditor .mv-entrada { width:100%; background:var(--mv-fundo); border:1px solid var(--mv-linha); border-radius:8px; padding:8px; color:var(--mv-txt); resize:vertical; }
  #mvEditor select.mv-entrada option { background:var(--mv-sup); }
  #mvEditor .mv-range { width:100%; accent-color:var(--mv-acento); }
  #mvEditor .mv-check { display:flex !important; gap:8px; align-items:center; font-size:13px; cursor:pointer; }
  #mvEditor .mv-check input { accent-color:var(--mv-acento); width:16px; height:16px; }
  #mvEditor .mv-duas { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:10px; }
  #mvEditor .mv-chips { display:grid; grid-template-columns:repeat(auto-fit, minmax(58px, 1fr)); gap:6px; }
  #mvEditor .mv-chip-est { display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 4px; border-radius:10px; background:var(--mv-fundo); border:2px solid transparent; font-size:11px; }
  #mvEditor .mv-chip-est.mv-on { border-color:var(--mv-sel); }
  #mvEditor .mv-amostra { font-weight:800; font-size:16px; padding:0 6px; border-radius:4px; color:#fff; }
  #mvEditor .mv-st-contorno { -webkit-text-stroke:1px #000; paint-order:stroke fill; background:#3b5f86; }
  #mvEditor .mv-st-caixa { background:#000; }
  #mvEditor .mv-st-faixa { background:var(--mv-acento); color:var(--mv-sobre-acento); width:100%; text-align:center; }
  #mvEditor .mv-st-sombra { text-shadow:2px 2px 0 #000; background:#3b5f86; }
  #mvEditor .mv-cores { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  #mvEditor .mv-bolinha { display:inline-block; width:28px; height:28px; border-radius:50%; border:2px solid var(--mv-linha); padding:0; position:relative; }
  #mvEditor .mv-bolinha.mv-on { outline:3px solid var(--mv-sel); outline-offset:2px; }
  #mvEditor .mv-outra { display:inline-flex !important; align-items:center; justify-content:center; background:conic-gradient(red, yellow, lime, aqua, blue, magenta, red); color:#fff; font-weight:800; text-shadow:0 0 3px #000; cursor:pointer; overflow:hidden; }
  #mvEditor .mv-outra input { position:absolute; inset:0; opacity:0; cursor:pointer; }
  #mvEditor .mv-linha-bts { display:flex; flex-wrap:wrap; gap:6px; }
  #mvEditor .mv-nota { font-size:12px; color:var(--mv-apagado); line-height:1.5; }
  #mvEditor .mv-resumo { font-size:12px; color:var(--mv-apagado); background:var(--mv-fundo); border-radius:8px; padding:8px 10px; }

  #mvEditor .mv-acoes { flex:none; display:flex; align-items:center; justify-content:center; gap:2px; padding:4px 8px; border-top:1px solid var(--mv-linha); background:var(--mv-sup); overflow-x:auto; }
  #mvEditor .mv-ferr { display:flex; flex-direction:column; align-items:center; gap:1px; min-width:54px; padding:4px 6px; background:transparent; border:0; border-radius:8px; font-size:11px; color:var(--mv-apagado); white-space:nowrap; flex:none; }
  #mvEditor .mv-ferr:hover:not(:disabled) { background:var(--mv-sup2); color:var(--mv-txt); }
  #mvEditor .mv-ferr-ic { font-size:17px; color:var(--mv-txt); line-height:1.25; }
  #mvEditor .mv-sep { width:1px; height:28px; background:var(--mv-linha); margin:0 6px; flex:none; }

  #mvEditor .mv-linha { flex:none; display:flex; border-top:1px solid var(--mv-linha); background:var(--mv-fundo); }
  #mvEditor .mv-rotulos { flex:none; width:58px; border-right:1px solid var(--mv-linha); background:var(--mv-sup); }
  #mvEditor .mv-r0 { height:22px; }
  #mvEditor .mv-rot { margin:4px 0; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:16px; line-height:1; }
  #mvEditor .mv-rot small { font-size:10px; color:var(--mv-apagado); margin-top:3px; }
  #mvEditor .mv-r1 { height:64px; } #mvEditor .mv-r2 { height:40px; }
  #mvEditor .mv-rolagem { flex:1; min-width:0; overflow-x:auto; overflow-y:hidden; padding-bottom:6px; }
  #mvEditor .mv-trilho { position:relative; user-select:none; -webkit-user-select:none; }
  #mvEditor .mv-regua { height:22px; position:relative; border-bottom:1px solid var(--mv-linha); cursor:pointer; touch-action:none; }
  #mvEditor .mv-tic { position:absolute; top:4px; height:18px; border-left:1px solid var(--mv-linha); font-size:10px; color:var(--mv-apagado); padding-left:3px; font-variant-numeric:tabular-nums; white-space:nowrap; }
  #mvEditor .mv-faixa { position:relative; margin:4px 0; }
  #mvEditor .mv-f1 { height:64px; } #mvEditor .mv-f2 { height:40px; }
  #mvEditor .mv-faixa-vazia { position:absolute; left:8px; top:0; bottom:0; display:flex; align-items:center; gap:12px; padding:0 12px; border:2px dashed var(--mv-linha); border-radius:10px; color:var(--mv-apagado); font-weight:700; white-space:nowrap; }
  #mvEditor .mv-bloco { position:absolute; top:0; bottom:0; border-radius:8px; border:2px solid transparent; display:flex; align-items:center; gap:6px; padding:0 12px; overflow:hidden; cursor:grab; touch-action:none; color:#fff; background-color:#2563c9; background-repeat:repeat-x; background-size:auto 100%; min-width:6px; }
  #mvEditor .mv-com-img::before { content:''; position:absolute; inset:0; background:linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15) 60%); pointer-events:none; }
  #mvEditor .mv-b-textos { background-color:var(--mv-sel); color:#1a1a1a; font-weight:700; }
  #mvEditor .mv-b-audios { background-color:var(--mv-verde); }
  #mvEditor .mv-bloco.mv-sel { border-color:var(--mv-sel); box-shadow:0 0 0 1px var(--mv-sel); z-index:2; }
  #mvEditor .mv-b-textos.mv-sel { border-color:#fff; box-shadow:0 0 0 2px var(--mv-sel); }
  #mvEditor .mv-bloco-nome { position:relative; flex:1 1 auto; min-width:0; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none; text-shadow:0 1px 2px rgba(0,0,0,.5); }
  #mvEditor .mv-b-textos .mv-bloco-nome { text-shadow:none; }
  #mvEditor .mv-chip { position:relative; flex:none; font-size:10px; padding:1px 5px; border-radius:6px; background:rgba(0,0,0,.4); color:#fff; pointer-events:none; white-space:nowrap; }
  #mvEditor .mv-alca { position:absolute; top:0; bottom:0; width:10px; cursor:ew-resize; z-index:3; }
  #mvEditor .mv-alca::after { content:''; position:absolute; top:22%; bottom:22%; left:3px; width:4px; border-radius:2px; background:rgba(255,255,255,.55); }
  #mvEditor .mv-sel .mv-alca { background:var(--mv-sel); }
  #mvEditor .mv-sel .mv-alca::after { background:#1a1a1a; }
  #mvEditor .mv-alca-e { left:0; } #mvEditor .mv-alca-d { right:0; }
  #mvEditor .mv-fim { position:absolute; top:22px; bottom:0; width:0; border-left:2px dashed #6b7385; pointer-events:none; }
  #mvEditor .mv-agulha { position:absolute; top:0; bottom:0; left:0; width:2px; background:var(--mv-verm); pointer-events:none; z-index:5; }
  #mvEditor .mv-agulha-cab { position:absolute; top:0; left:-6px; width:14px; height:14px; background:var(--mv-verm); border-radius:3px 3px 50% 50%; }

  #mvEditor .mv-alca-folha { width:40px; height:5px; border-radius:3px; background:var(--mv-linha); margin:8px auto 0; cursor:pointer; }
  #mvEditor .mv-cortina { display:none; }

  #mvEditor .mv-janela-fundo { position:fixed; inset:0; z-index:995; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; padding:16px; }
  #mvEditor .mv-janela { width:min(520px, 100%); max-height:calc(100dvh - 32px); overflow:auto; background:var(--mv-sup); border:1px solid var(--mv-linha); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:12px; box-shadow:0 20px 60px rgba(0,0,0,.5); }
  #mvEditor .mv-jan-tit { font-size:16px; font-weight:700; }
  #mvEditor .mv-pronto { color:#5be49b; }
  #mvEditor .mv-barra-fundo { background:var(--mv-fundo); border-radius:99px; height:8px; overflow:hidden; }
  #mvEditor #mvBarra { background:var(--mv-acento); height:100%; transition:width .25s; }
  #mvEditor .mv-video-final { width:100%; max-height:45dvh; border-radius:8px; background:#000; }
  #mvEditor .mv-erro { border:1px solid #7a2b2e; background:#3a1618; color:#ffb4b6; border-radius:8px; padding:10px 12px; font-size:13px; }

  @media (max-width: 767px) {
    #mvEditor { overflow-y:auto; }
    #mvEditor .mv-some-cel { display:none !important; }
    #mvEditor .mv-so-cel, #mvEditor .mv-add-bt.mv-so-cel { display:flex !important; }
    #mvEditor .mv-alca-folha.mv-so-cel { display:block !important; }
    #mvEditor .mv-topo { height:48px; padding:0 8px; }
    #mvEditor .mv-titulo { font-size:14px; }
    #mvEditor .mv-principal { display:flex; flex-direction:column; flex:none; }
    #mvEditor .mv-centro { order:1; padding:8px; }
    #mvEditor .mv-palco { flex:none; container-type:inline-size; }
    #mvEditor .mv-quadro { width:min(100%, 52dvh * var(--mv-arn, 1.7778)); }
    #mvEditor .mv-add { order:2; flex-direction:row; overflow-x:auto; border:0; border-top:1px solid var(--mv-linha); padding:6px 8px; gap:6px; }
    #mvEditor .mv-add-bt { flex:none; flex-direction:row; padding:7px 10px; border-radius:99px; font-size:12.5px; white-space:nowrap; }
    #mvEditor .mv-add-ic { font-size:16px; }
    #mvEditor .mv-acoes { justify-content:flex-start; }
    #mvEditor .mv-painel { position:fixed; left:0; right:0; bottom:0; max-height:60dvh; border:0; border-top:1px solid var(--mv-linha); border-radius:18px 18px 0 0; transform:translateY(105%); transition:transform .25s ease; z-index:993; box-shadow:0 -10px 40px #000; }
    #mvEditor .mv-painel.mv-aberta { transform:translateY(0); }
    #mvEditor .mv-cortina.mv-aberta { display:block; position:fixed; inset:0; z-index:992; background:rgba(0,0,0,.35); }
  }
  .mv-aviso { position:fixed; left:50%; top:62px; transform:translateX(-50%); background:#1c2536; color:#fff; padding:10px 16px; border-radius:8px; font-size:13px; z-index:100050; max-width:90vw; transition:opacity .3s; pointer-events:none; box-shadow:0 6px 18px rgba(0,0,0,.35); border:1px solid #343a46; }
</style>`;

// ---------------------------------------------------------------------------

window.MONTAGEM = {
    render, fechar, pausar,
    // para os testes
    estado: () => ({ proj: proj && M().copiar(proj), sel, tempo, tocando, exportando, pps, midias: Object.keys(midias).length,
                     resultado: resultado && { nome: resultado.arquivos[0].nome, bytes: resultado.arquivos[0].blob.size, mensagem: resultado.mensagem } }),
    resultadoBlob: () => resultado && resultado.arquivos[0].blob,
    buscar
};
window.mvAcrescentarArquivos = acrescentarArquivos;
window.mvAcrescentarCor = acrescentarCor;
window.mvAcrescentarTexto = acrescentarTexto;
window.mvDividir = dividir;
window.mvApagarLado = apagarLado;
window.mvApagar = apagarSel;
window.mvDuplicar = duplicarSel;
window.mvDesfazer = desfazer;
window.mvRefazer = refazer;
window.mvMudar = mudar;
window.mvTocar = tocar;
window.mvIrPara = buscar;
window.mvZoom = zoom;
window.mvMoverClipe = moverClipeSel;
window.mvSelecionar = selecionar;
window.mvExportar = exportar;
window.mvCancelarExportacao = cancelarExportacao;
window.mvFecharExport = fecharExport;
window.mvAbrirAjustes = abrirAjustes;
window.mvFecharAjustes = fecharAjustes;
window.mvAjuda = ajuda;

})();
