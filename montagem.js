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

function render(destino) {
    tela = destino;
    iniciar();
    tela.innerHTML = ESTILO + `
    <div id="mvEditor">
      <div class="card" style="margin:20px 0 12px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="fecharFerramentaVideo()">← Todas as ferramentas</button>
          <div style="flex:1; min-width:200px;">
            <h2 style="margin:0; border:none; padding:0;">🎞️ Montar vídeo</h2>
            <div style="font-size:12px; color:#7a869a;">Editor com linha do tempo: vídeos, fotos, textos e música num vídeo só.</div>
          </div>
          <button class="btn btn-primary" id="mvBtnExportar" onclick="mvExportar()">⬇️ Exportar MP4</button>
        </div>
      </div>
      <div class="card mv-card">
        <div class="mv-barra" id="mvBarra">
          <label class="mv-bt mv-bt-forte" id="mvBtnMidia" title="Vídeos e fotos entram na faixa de vídeo">➕ Vídeo ou foto
            <input type="file" accept="video/*,image/*" multiple hidden onchange="mvAcrescentarArquivos(this.files, 'video'); this.value='';"></label>
          <button class="mv-bt" id="mvBtnCor" onclick="mvAcrescentarCor()" title="Uma tela de uma cor só, boa para título">🟦 Tela colorida</button>
          <button class="mv-bt" id="mvBtnTexto" onclick="mvAcrescentarTexto()" title="Título ou legenda por cima do vídeo">🔤 Texto</button>
          <label class="mv-bt" id="mvBtnAudio" title="Música ou narração">🎵 Música ou áudio
            <input type="file" accept="audio/*" multiple hidden onchange="mvAcrescentarArquivos(this.files, 'audio'); this.value='';"></label>
          <span class="mv-sep"></span>
          <button class="mv-bt" id="mvBtnDesfazer" onclick="mvDesfazer()" title="Desfazer (Ctrl+Z)">↶</button>
          <button class="mv-bt" id="mvBtnRefazer" onclick="mvRefazer()" title="Refazer (Ctrl+Y)">↷</button>
          <span class="mv-sep"></span>
          <button class="mv-bt" id="mvBtnDividir" onclick="mvDividir()" title="Dividir no ponto da agulha (S)">✂️ Dividir</button>
          <button class="mv-bt" onclick="mvApagarLado('antes')" title="Apagar o pedaço antes da agulha (Q)">⇤ Apagar antes</button>
          <button class="mv-bt" onclick="mvApagarLado('depois')" title="Apagar o pedaço depois da agulha (W)">⇥ Apagar depois</button>
          <button class="mv-bt" onclick="mvDuplicar()" title="Duplicar (D)">⧉ Duplicar</button>
          <button class="mv-bt" id="mvBtnApagar" onclick="mvApagar()" title="Apagar o selecionado (Delete)">🗑️ Apagar</button>
        </div>
        <div class="mv-meio">
          <div class="mv-palco" id="mvPalco">
            <div class="mv-quadro"><canvas id="mvCanvas"></canvas></div>
            <div class="mv-controles">
              <button class="mv-bt" onclick="mvIrPara(0)" title="Início (Home)">⏮</button>
              <button class="mv-bt mv-bt-forte" id="mvBtnTocar" onclick="mvTocar()" title="Tocar / pausar (Espaço)">▶️</button>
              <button class="mv-bt" onclick="mvIrPara(${'Infinity'})" title="Fim (End)">⏭</button>
              <span id="mvTempo" class="mv-tempo">0:00,0 / 0:00,0</span>
            </div>
          </div>
          <div class="mv-props" id="mvProps"></div>
        </div>
        <div class="mv-zoom">
          <span style="font-size:12px; color:#5f6b7f;">Linha do tempo</span>
          <span style="flex:1;"></span>
          <button class="mv-bt mv-bt-p" onclick="mvZoom(0.7)" title="Afastar">−</button>
          <button class="mv-bt mv-bt-p" onclick="mvZoom(0)" title="Caber tudo">Caber</button>
          <button class="mv-bt mv-bt-p" onclick="mvZoom(1.4)" title="Aproximar">+</button>
        </div>
        <div class="mv-linha" id="mvLinha">
          <div class="mv-rotulos"><div class="mv-r0"></div><div class="mv-r1">🎬 Vídeo</div><div class="mv-r2">🔤 Texto</div><div class="mv-r2">🎵 Áudio</div></div>
          <div class="mv-rolagem" id="mvRolagem"><div class="mv-trilho" id="mvTrilho"></div></div>
        </div>
        <div class="mv-dica">Dica: toque num pedaço para escolher; arraste para mover; puxe as bordas para aparar.
          Atalhos: Espaço tocar · S dividir · Delete apagar · Ctrl+Z desfazer.</div>
        <div id="mvExport"></div>
      </div>
    </div>`;
    ligarCanvas();
    ligarTeclas();
    ajustarCanvas();
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
    proj = null; midias = {}; hist = null; sel = null; resultado = null; urlResultado = null; tela = null;
    return true;
}

function editorVisivel() {
    const e = $('mvEditor');
    return !!(e && e.offsetParent !== null);
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
    return m;
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
    c.style.aspectRatio = d.W + ' / ' + d.H;
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
        ctx.fillText(proj.clipes.length ? '' : 'Comece em "➕ Vídeo ou foto"', W / 2, H / 2);
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
    const bloco = (item, lista, left, w, rotulo, estilo, extra) => `
        <div class="mv-bloco mv-b-${lista} ${item.id === sel ? 'mv-sel' : ''}" data-id="${item.id}" data-lista="${lista}"
             style="left:${left}px; width:${Math.max(6, w)}px; ${estilo || ''}" title="${esc(rotulo)}">
            <div class="mv-alca mv-alca-e" data-lado="inicio"></div>
            <div class="mv-bloco-txt">${extra || ''}${esc(rotulo)}</div>
            <div class="mv-alca mv-alca-d" data-lado="fim"></div>
        </div>`;
    const clipes = proj.clipes.map((c, i) => {
        const d = M().duracaoClipe(c);
        const m = midias[c.midia];
        let estilo = '', rot = '';
        if (c.tipo === 'cor') { estilo = 'background:' + esc(c.cor) + ';'; rot = 'Tela colorida'; }
        else if (c.tipo === 'imagem') { estilo = m ? `background-image:url('${m.url}');` : ''; rot = '🖼️ ' + (m ? m.nome : 'foto'); }
        else rot = '🎬 ' + (m ? m.nome : 'vídeo');
        const vel = c.tipo === 'video' && c.velocidade !== 1 ? ' <b>' + String(c.velocidade).replace('.', ',') + 'x</b>' : '';
        const mudo = c.tipo === 'video' && (c.mudo || !Number(c.volume)) ? '🔇 ' : '';
        return bloco(c, 'clipes', ini[i] * pps, d * pps, rot + ' · ' + fmt(d), estilo, mudo + (vel ? vel + ' ' : ''));
    }).join('');
    const textos = proj.textos.map(t => bloco(t, 'textos', t.inicio * pps, t.duracao * pps, t.texto || '(vazio)')).join('');
    const audios = proj.audios.map(a => {
        const m = midias[a.midia];
        return bloco(a, 'audios', a.inicio * pps, M().duracaoAudio(a) * pps, (m ? m.nome : 'áudio'), '', a.volume === 0 ? '🔇 ' : '');
    }).join('');
    tr.style.width = largura + 'px';
    tr.innerHTML = `
        <div class="mv-regua" data-faixa="regua">${regua}</div>
        <div class="mv-faixa mv-f1" data-faixa="clipes">${clipes || '<div class="mv-vazio">Coloque vídeos e fotos aqui com “➕ Vídeo ou foto”</div>'}</div>
        <div class="mv-faixa mv-f2" data-faixa="textos">${textos}</div>
        <div class="mv-faixa mv-f2" data-faixa="audios">${audios}</div>
        <div class="mv-fim" style="left:${total * pps}px"></div>
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

const opts = (lista, atual) => lista.map(([v, r]) => `<option value="${esc(v)}" ${String(v) === String(atual) ? 'selected' : ''}>${esc(r)}</option>`).join('');

function renderProps() {
    const el = $('mvProps');
    if (!el || !proj) return;
    const a = sel ? M().acharItem(proj, sel) : null;
    if (!a) { el.innerHTML = propsProjeto(); return; }
    if (a.lista === 'clipes') el.innerHTML = propsClipe(a.item, a.indice);
    else if (a.lista === 'textos') el.innerHTML = propsTexto(a.item);
    else el.innerHTML = propsAudio(a.item);
}

function propsProjeto() {
    const f = proj.fundo;
    return `
      <div class="mv-ptit">⚙️ O vídeo</div>
      <label class="mv-l">Formato do quadro
        <select id="mvFormato" onchange="mvMudar('', 'formato', this.value)">${opts(Object.entries(M().FORMATOS).map(([k, v]) => [k, v.nome]), proj.formato)}</select></label>
      <label class="mv-l">Fundo (aparece quando o vídeo não enche o quadro)
        <select id="mvFundo" onchange="mvMudar('', 'fundo.tipo', this.value)">${opts([['cor', 'Uma cor'], ['desfocado', 'O próprio vídeo, desfocado']], f.tipo)}</select></label>
      <label class="mv-l">Cor do fundo <input type="color" value="${esc(f.cor)}" onchange="mvMudar('', 'fundo.cor', this.value)"></label>
      <label class="mv-l">Qualidade ao exportar
        <select id="mvQualidade" onchange="mvMudar('', 'qualidade', this.value)">${opts(Object.entries(M().QUALIDADES), proj.qualidade)}</select></label>
      <div class="mv-nota">Toque num pedaço da linha do tempo para mudar velocidade, volume, texto, cor...</div>
      ${proj.clipes.length ? `<div class="mv-nota">${proj.clipes.length} pedaço(s) na faixa de vídeo · ${proj.textos.length} texto(s) · ${proj.audios.length} áudio(s) · total ${fmt(M().duracaoTotal(proj))}</div>` : ''}`;
}

function propsClipe(c, i) {
    const m = midias[c.midia];
    const nome = c.tipo === 'cor' ? '🟦 Tela colorida' : (c.tipo === 'imagem' ? '🖼️ ' : '🎬 ') + esc(m ? m.nome : '');
    const mover = `<div class="mv-linha-bts">
        <button class="mv-bt mv-bt-p" onclick="mvMoverClipe(-1)" ${i === 0 ? 'disabled' : ''}>◀ Para trás</button>
        <button class="mv-bt mv-bt-p" onclick="mvMoverClipe(1)" ${i === proj.clipes.length - 1 ? 'disabled' : ''}>Para frente ▶</button></div>`;
    let corpo = '';
    if (c.tipo === 'video') {
        corpo = `
          <div class="mv-nota">Trecho do arquivo: ${fmt(c.de)} a ${fmt(c.ate)} · na linha do tempo: ${fmt(M().duracaoClipe(c))}</div>
          <label class="mv-l">Velocidade
            <select id="mvVelocidade" onchange="mvMudar('${c.id}', 'velocidade', Number(this.value))">${opts(M().VELOCIDADES.map(v => [v, String(v).replace('.', ',') + 'x' + (v === 1 ? ' (normal)' : v < 1 ? ' (câmera lenta)' : '')]), c.velocidade)}</select></label>
          <label class="mv-l">Volume: <b id="mvVolTxt">${c.volume}%</b>
            <input type="range" min="0" max="200" step="5" value="${c.volume}" oninput="document.getElementById('mvVolTxt').textContent=this.value+'%'; mvMudar('${c.id}', 'volume', Number(this.value), {digitando:true})"></label>
          <label class="mv-c"><input type="checkbox" id="mvMudo" ${c.mudo ? 'checked' : ''} onchange="mvMudar('${c.id}', 'mudo', this.checked)"> Tirar o som deste pedaço</label>
          <label class="mv-l">No quadro
            <select onchange="mvMudar('${c.id}', 'encaixe', this.value)">${opts([['conter', 'Inteiro (sem cortar)'], ['preencher', 'Encher o quadro (corta as bordas)']], c.encaixe)}</select></label>`;
    } else {
        corpo = `
          <label class="mv-l">Duração (segundos)
            <input type="number" id="mvDuracao" min="0.1" max="600" step="0.5" value="${c.duracao}" onchange="mvMudar('${c.id}', 'duracao', Math.max(0.1, Number(this.value) || 4))"></label>
          ${c.tipo === 'cor' ? `<label class="mv-l">Cor <input type="color" value="${esc(c.cor)}" onchange="mvMudar('${c.id}', 'cor', this.value)"></label>
             <div class="mv-nota">Use "🔤 Texto" para escrever o título em cima.</div>` :
            `<label class="mv-l">No quadro
              <select onchange="mvMudar('${c.id}', 'encaixe', this.value)">${opts([['conter', 'Inteira (sem cortar)'], ['preencher', 'Encher o quadro (corta as bordas)']], c.encaixe)}</select></label>`}`;
    }
    return `<div class="mv-ptit">${nome}</div>${corpo}${mover}
        <div class="mv-linha-bts"><button class="mv-bt mv-bt-p" onclick="mvDuplicar()">⧉ Duplicar</button>
        <button class="mv-bt mv-bt-p mv-perigo" onclick="mvApagar()">🗑️ Apagar</button>
        <button class="mv-bt mv-bt-p" onclick="mvSelecionar(null)">Pronto</button></div>`;
}

function propsTexto(t) {
    const posicoes = [['0.12', 'No alto'], ['0.5', 'No meio'], ['0.82', 'Embaixo']];
    return `
      <div class="mv-ptit">🔤 Texto</div>
      <textarea id="mvTextoTexto" rows="2" oninput="mvMudar('${t.id}', 'texto', this.value, {digitando:true})">${esc(t.texto)}</textarea>
      <div class="mv-2">
        <label class="mv-l">Letra <select onchange="mvMudar('${t.id}', 'fonte', this.value)">${opts(Object.entries(M().FONTES).map(([k, v]) => [k, v.nome]), t.fonte)}</select></label>
        <label class="mv-l">Estilo <select id="mvEstilo" onchange="mvMudar('${t.id}', 'estilo', this.value)">${opts([['contorno', 'Com contorno'], ['caixa', 'Numa caixa'], ['faixa', 'Faixa de lado a lado'], ['simples', 'Com sombra']], t.estilo)}</select></label>
      </div>
      <div class="mv-2">
        <label class="mv-l">Cor da letra <input type="color" value="${esc(t.cor)}" onchange="mvMudar('${t.id}', 'cor', this.value)"></label>
        <label class="mv-l">Cor do contorno/caixa <input type="color" value="${esc(t.corFundo)}" onchange="mvMudar('${t.id}', 'corFundo', this.value)"></label>
      </div>
      <label class="mv-l">Tamanho
        <input type="range" min="0.03" max="0.2" step="0.005" value="${t.tamanho}" oninput="mvMudar('${t.id}', 'tamanho', Number(this.value), {digitando:true})"></label>
      <label class="mv-c"><input type="checkbox" ${t.negrito ? 'checked' : ''} onchange="mvMudar('${t.id}', 'negrito', this.checked)"> Negrito</label>
      <label class="mv-c"><input type="checkbox" ${t.suave ? 'checked' : ''} onchange="mvMudar('${t.id}', 'suave', this.checked)"> Aparecer e sumir suave</label>
      <div class="mv-linha-bts">${posicoes.map(([y, r]) => `<button class="mv-bt mv-bt-p" onclick="mvMudar('${t.id}', 'y', ${y}); mvMudar('${t.id}', 'x', 0.5)">${r}</button>`).join('')}</div>
      <div class="mv-nota">Ou arraste o texto na prévia.</div>
      <div class="mv-2">
        <label class="mv-l">Começa em (s) <input type="number" min="0" step="0.1" value="${t.inicio}" onchange="mvMudar('${t.id}', 'inicio', Math.max(0, Number(this.value) || 0))"></label>
        <label class="mv-l">Dura (s) <input type="number" id="mvTextoDuracao" min="0.1" step="0.1" value="${t.duracao}" onchange="mvMudar('${t.id}', 'duracao', Math.max(0.1, Number(this.value) || 3))"></label>
      </div>
      <div class="mv-linha-bts"><button class="mv-bt mv-bt-p" onclick="mvDuplicar()">⧉ Duplicar</button>
        <button class="mv-bt mv-bt-p mv-perigo" onclick="mvApagar()">🗑️ Apagar</button>
        <button class="mv-bt mv-bt-p" onclick="mvSelecionar(null)">Pronto</button></div>`;
}

function propsAudio(a) {
    const m = midias[a.midia];
    return `
      <div class="mv-ptit">🎵 ${esc(m ? m.nome : 'Áudio')}</div>
      <div class="mv-nota">Toca de ${fmt(a.inicio)} a ${fmt(a.inicio + M().duracaoAudio(a))} do vídeo (trecho ${fmt(a.de)}–${fmt(a.ate)} do arquivo).
        O que passar do fim do vídeo é cortado.</div>
      <label class="mv-l">Volume: <b id="mvVolATxt">${a.volume}%</b>
        <input type="range" min="0" max="200" step="5" value="${a.volume}" oninput="document.getElementById('mvVolATxt').textContent=this.value+'%'; mvMudar('${a.id}', 'volume', Number(this.value), {digitando:true})"></label>
      <div class="mv-linha-bts">${[[15, 'Fundo baixinho'], [50, 'Médio'], [100, 'Normal']].map(([v, r]) => `<button class="mv-bt mv-bt-p" onclick="mvMudar('${a.id}', 'volume', ${v})">${r}</button>`).join('')}</div>
      <label class="mv-c"><input type="checkbox" ${a.entrarSuave ? 'checked' : ''} onchange="mvMudar('${a.id}', 'entrarSuave', this.checked)"> Começar baixinho e subir</label>
      <label class="mv-c"><input type="checkbox" ${a.sairSuave ? 'checked' : ''} onchange="mvMudar('${a.id}', 'sairSuave', this.checked)"> Terminar abaixando</label>
      <label class="mv-l">Começa em (s) <input type="number" min="0" step="0.1" value="${a.inicio}" onchange="mvMudar('${a.id}', 'inicio', Math.max(0, Number(this.value) || 0))"></label>
      <div class="mv-linha-bts"><button class="mv-bt mv-bt-p" onclick="mvDuplicar()">⧉ Duplicar</button>
        <button class="mv-bt mv-bt-p mv-perigo" onclick="mvApagar()">🗑️ Apagar</button>
        <button class="mv-bt mv-bt-p" onclick="mvSelecionar(null)">Pronto</button></div>`;
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
        if (!cancelado) {
            const ex = $('mvExport');
            if (ex) ex.innerHTML = `<div class="mv-erro">❌ ${esc(e.message || e)}</div>`;
        }
    } finally {
        atualizarBotoes();
    }
}

function renderExportando(estado) {
    const ex = $('mvExport');
    if (!ex) return;
    if (!estado) { ex.innerHTML = '<div class="mv-nota">Exportação cancelada.</div>'; return; }
    ex.innerHTML = `
      <div class="mv-exp">
        <div style="display:flex; align-items:center; gap:10px;">
          <b style="flex:1;">⏳ Exportando o vídeo...</b>
          <button class="btn btn-sm btn-secondary" onclick="mvCancelarExportacao()">Cancelar</button>
        </div>
        <div style="background:#e3e8ef; border-radius:99px; height:8px; overflow:hidden; margin-top:8px;">
          <div id="mvBarra" style="background:#2563c9; height:100%; width:${Math.max(0, Math.min(100, estado.pct || 0))}%; transition:width .25s;"></div></div>
        <div id="mvTextoProgresso" style="font-size:12px; color:#5f6b7f; margin-top:6px;">${esc(estado.texto || '')}</div>
        <div class="mv-nota">Deixe esta aba aberta. No navegador, exportar leva mais ou menos o tempo do vídeo (ou mais, em 1080p).</div>
      </div>`;
}

function renderResultado() {
    const ex = $('mvExport');
    if (!ex || !resultado) return;
    const a = resultado.arquivos[0];
    if (urlResultado) { try { URL.revokeObjectURL(urlResultado); } catch (_) { /* ok */ } }
    urlResultado = URL.createObjectURL(a.blob);
    ex.innerHTML = `
      <div class="mv-exp mv-pronto">
        <div><b>✅ Pronto${resultado.segundos ? ' em ' + resultado.segundos.toFixed(1) + 's' : ''}.</b> ${esc(resultado.mensagem)}</div>
        <video src="${urlResultado}" controls playsinline style="max-width:100%; max-height:300px; margin-top:10px; border-radius:6px; background:#000;"></video>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px;">
          <span>🎬 ${esc(a.nome)} · ${V() ? V().formatarTamanho(a.blob.size) : ''}</span>
          <a class="btn btn-primary" id="mvBaixar" href="${urlResultado}" download="${esc(a.nome)}">⬇️ Baixar</a>
        </div>
        <div class="mv-nota">O vídeo fica só neste aparelho e se perde ao sair da página: baixe antes de sair.</div>
      </div>`;
}

// ---------------------------------------------------------------------------

const ESTILO = `<style>
  #mvEditor .mv-card { padding:12px; }
  #mvEditor .mv-barra { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px; }
  #mvEditor .mv-bt { display:inline-flex; align-items:center; gap:4px; border:1px solid #cdd5e1; background:#fff; color:#1c2536; border-radius:6px; padding:7px 10px; font:inherit; font-size:13px; cursor:pointer; white-space:nowrap; }
  #mvEditor .mv-bt:hover:not(:disabled) { border-color:#2563c9; background:#f3f7fd; }
  #mvEditor .mv-bt:disabled { opacity:.4; cursor:default; }
  #mvEditor .mv-bt-forte { background:#2563c9; color:#fff; border-color:#2563c9; }
  #mvEditor .mv-bt-forte:hover:not(:disabled) { background:#1b4fa8; }
  #mvEditor .mv-bt-p { padding:5px 8px; font-size:12px; }
  #mvEditor .mv-perigo { color:#c53030; }
  #mvEditor .mv-sep { width:1px; height:24px; background:#e3e8ef; margin:0 2px; }
  #mvEditor .mv-meio { display:grid; grid-template-columns:minmax(0, 1fr) 290px; gap:12px; }
  @media (max-width: 820px) { #mvEditor .mv-meio { grid-template-columns:1fr; } }
  #mvEditor .mv-palco { background:#11151c; border-radius:8px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:8px; min-width:0; }
  #mvEditor .mv-quadro { width:100%; display:flex; justify-content:center; }
  #mvEditor #mvCanvas { max-width:100%; max-height:52vh; background:#000; border-radius:4px; touch-action:none; }
  #mvEditor .mv-controles { display:flex; gap:6px; align-items:center; }
  #mvEditor .mv-tempo { color:#e2e8f0; font-variant-numeric:tabular-nums; font-size:13px; margin-left:6px; }
  #mvEditor .mv-props { border:1px solid #e3e8ef; border-radius:8px; padding:10px; font-size:13px; max-height:62vh; overflow:auto; }
  #mvEditor .mv-ptit { font-weight:700; color:#1b4488; margin-bottom:8px; word-break:break-word; }
  #mvEditor .mv-l { display:block; margin:8px 0; color:#3d4759; font-size:12.5px; }
  #mvEditor .mv-l select, #mvEditor .mv-l input[type=number] { display:block; width:100%; margin-top:3px; padding:6px 8px; border:1px solid #cdd5e1; border-radius:6px; font:inherit; box-sizing:border-box; }
  #mvEditor .mv-l input[type=range] { display:block; width:100%; }
  #mvEditor .mv-l input[type=color] { display:block; width:100%; height:30px; margin-top:3px; border:1px solid #cdd5e1; border-radius:6px; padding:1px; }
  #mvEditor .mv-c { display:flex; gap:6px; align-items:center; margin:6px 0; font-size:12.5px; }
  #mvEditor textarea { width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #cdd5e1; border-radius:6px; font:inherit; font-size:14px; }
  #mvEditor .mv-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  #mvEditor .mv-2 .mv-l { margin:4px 0; }
  #mvEditor .mv-linha-bts { display:flex; flex-wrap:wrap; gap:5px; margin:8px 0; }
  #mvEditor .mv-nota { font-size:11.5px; color:#5f6b7f; line-height:1.5; margin:6px 0; }
  #mvEditor .mv-zoom { display:flex; align-items:center; gap:5px; margin:12px 0 4px; }
  #mvEditor .mv-linha { display:flex; border:1px solid #e3e8ef; border-radius:8px; overflow:hidden; background:#f7f9fc; }
  #mvEditor .mv-rotulos { flex:0 0 74px; border-right:1px solid #e3e8ef; background:#fff; font-size:11px; color:#5f6b7f; }
  #mvEditor .mv-rotulos div { display:flex; align-items:center; padding-left:6px; box-sizing:border-box; }
  #mvEditor .mv-r0 { height:22px; } #mvEditor .mv-r1 { height:58px; } #mvEditor .mv-r2 { height:38px; }
  #mvEditor .mv-rolagem { flex:1; overflow-x:auto; overflow-y:hidden; position:relative; }
  #mvEditor .mv-trilho { position:relative; min-height:156px; user-select:none; -webkit-user-select:none; }
  #mvEditor .mv-regua { height:22px; position:relative; border-bottom:1px solid #e3e8ef; cursor:pointer; touch-action:none; background:#fff; }
  #mvEditor .mv-tic { position:absolute; top:0; height:100%; border-left:1px solid #cdd5e1; font-size:10px; color:#7a869a; padding-left:3px; line-height:22px; }
  #mvEditor .mv-faixa { position:relative; border-bottom:1px solid #edf0f5; }
  #mvEditor .mv-f1 { height:58px; } #mvEditor .mv-f2 { height:38px; }
  #mvEditor .mv-vazio { position:absolute; left:10px; top:18px; font-size:12px; color:#9aa5b8; white-space:nowrap; }
  #mvEditor .mv-bloco { position:absolute; top:4px; bottom:4px; border-radius:6px; box-sizing:border-box; border:2px solid transparent; overflow:hidden; cursor:grab; touch-action:none; font-size:11px; color:#fff; background-size:auto 100%; background-repeat:repeat-x; }
  #mvEditor .mv-b-clipes { background-color:#3a6fd8; }
  #mvEditor .mv-b-textos { background-color:#d69e2e; color:#1c2536; }
  #mvEditor .mv-b-audios { background-color:#38a169; }
  #mvEditor .mv-bloco.mv-sel { border-color:#ffd60a; box-shadow:0 0 0 1px #1c2536; }
  #mvEditor .mv-bloco-txt { position:absolute; inset:0 10px; display:flex; align-items:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 2px rgba(0,0,0,.6); pointer-events:none; }
  #mvEditor .mv-b-textos .mv-bloco-txt { text-shadow:none; }
  #mvEditor .mv-alca { position:absolute; top:0; bottom:0; width:9px; cursor:ew-resize; background:rgba(255,255,255,.35); z-index:2; }
  #mvEditor .mv-alca-e { left:0; } #mvEditor .mv-alca-d { right:0; }
  #mvEditor .mv-fim { position:absolute; top:22px; bottom:0; width:0; border-left:2px dashed #a0aec0; pointer-events:none; }
  #mvEditor .mv-agulha { position:absolute; top:0; bottom:0; left:0; width:2px; background:#e53e3e; pointer-events:none; z-index:4; }
  #mvEditor .mv-agulha-cab { position:absolute; top:0; left:-6px; width:14px; height:12px; background:#e53e3e; border-radius:0 0 7px 7px; }
  #mvEditor .mv-dica { font-size:11.5px; color:#7a869a; margin-top:6px; }
  #mvEditor .mv-exp { margin-top:12px; border:1px solid #cdd5e1; border-radius:8px; padding:12px; background:#f7f9fc; font-size:13px; }
  #mvEditor .mv-pronto { background:#f0fff4; border-color:#9ae6b4; }
  #mvEditor .mv-erro { margin-top:12px; border:1px solid #feb2b2; background:#fff5f5; color:#9b2c2c; border-radius:8px; padding:12px; font-size:13px; }
  .mv-aviso { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#1c2536; color:#fff; padding:10px 16px; border-radius:8px; font-size:13px; z-index:9000; max-width:90vw; transition:opacity .3s; pointer-events:none; box-shadow:0 6px 18px rgba(0,0,0,.25); }
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

})();
