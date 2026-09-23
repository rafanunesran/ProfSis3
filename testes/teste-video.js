// A aba VIDEO de Ferramentas.
//
// O que este teste cobre:
//   1. a aba "Video" existe dentro de Ferramentas e monta o catalogo inteiro;
//   2. o PORTAO: conta gratuita nao abre ferramenta (o convite do plano aparece);
//   3. o motor ffmpeg.wasm carrega do CDN (worker entregue como blob — o caminho que
//      contorna a proibicao de Worker de outro dominio) e le um video de verdade;
//   4. cada operacao produz um arquivo com a duracao/tamanho esperados, conferidos
//      pelo proprio ffmpeg (o Chromium de teste nao toca H.264);
//   5. a tela: cortar pelo formulario, com previa e botao de baixar no fim;
//   6. baixar por link: link direto de arquivo, e link resolvido por um servidor no
//      formato cobalt (simulado aqui), com erro explicado quando o servidor recusa;
//   7. a promessa: enquanto o video e' editado, nenhum POST/PUT sai da pagina.
//
// Como rodar (ver testes/LEIAME.md):
//   npm i playwright
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-video.js
//
// PRECISA de internet: o ffmpeg.wasm (~32 MB) vem do cdn.jsdelivr.net.
// Atras de proxy, use PROFSIS_PROXY=http://host:porta.

const { chromium } = require('playwright');

const FAKE = () => {
    window.__enviosDeSaida = [];
    const fetchOriginal = window.fetch;
    window.fetch = function (recurso, opcoes) {
        const metodo = ((opcoes && opcoes.method) || (recurso && recurso.method) || 'GET').toUpperCase();
        if (metodo !== 'GET' && metodo !== 'HEAD') {
            window.__enviosDeSaida.push(metodo + ' ' + String((recurso && recurso.url) || recurso));
        }
        return fetchOriginal.apply(this, arguments);
    };
    window.__docs = {};
    const ref = (col, id) => ({
        get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d || null }; },
        set: async (obj) => { window.__docs[col + '/' + id] = obj; },
        delete: async () => { delete window.__docs[col + '/' + id]; }
    });
    window.firebase = {
        initializeApp: () => {}, analytics: () => {},
        auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' },
                       onAuthStateChanged: (cb) => { setTimeout(() => cb(null), 0); return () => {}; },
                       signOut: async () => {} }),
        firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) })
    };
    window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}

// Grava um video de teste no proprio navegador: canvas animado + um tom de audio,
// pelo MediaRecorder (WebM). 320x240, ~3 s.
const GRAVAR_VIDEO = async ({ segundos, largura, altura, comSom }) => {
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    const fluxo = canvas.captureStream(25);
    let audioCtx = null;
    if (comSom) {
        audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const destino = audioCtx.createMediaStreamDestination();
        osc.frequency.value = 440;
        osc.connect(destino);
        osc.start();
        destino.stream.getAudioTracks().forEach(t => fluxo.addTrack(t));
    }
    const gravador = new MediaRecorder(fluxo, { mimeType: comSom ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8' });
    const pedacos = [];
    gravador.ondataavailable = e => { if (e.data.size) pedacos.push(e.data); };
    const fim = new Promise(ok => { gravador.onstop = ok; });
    gravador.start(200);
    const t0 = performance.now();
    await new Promise(ok => {
        const quadro = () => {
            const t = (performance.now() - t0) / 1000;
            ctx.fillStyle = '#1a365d'; ctx.fillRect(0, 0, largura, altura);
            ctx.fillStyle = '#e53e3e'; ctx.fillRect((t * 80) % largura, altura / 3, 40, 40);
            ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.fillText(t.toFixed(1), 10, 30);
            if (t < segundos) requestAnimationFrame(quadro); else ok();
        };
        quadro();
    });
    gravador.stop();
    await fim;
    if (audioCtx) audioCtx.close();
    const blob = new Blob(pedacos, { type: 'video/webm' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
};

(async () => {
    const opcoes = {
        executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        args: ['--autoplay-policy=no-user-gesture-required']
    };
    if (process.env.PROFSIS_PROXY) {
        opcoes.proxy = { server: process.env.PROFSIS_PROXY, bypass: 'localhost,127.0.0.1,::1' };
    }
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com)/,
                    r => r.abort());

    // Servidores de mentira para "baixar por link".
    let bytesDoVideo = null;
    await ctx.route('https://arquivos.teste/**', r => r.fulfill({
        status: 200, contentType: 'video/webm', body: bytesDoVideo,
        headers: { 'Access-Control-Allow-Origin': '*' }
    }));
    // Servidor sem CORS: para o fetch da pagina isso e' um TypeError de rede. O route do
    // Playwright nao aplica CORS a resposta simulada, entao a recusa e' simulada assim.
    await ctx.route('https://bloqueado.teste/**', r => r.abort('failed'));
    const pedidosAoServidor = [];
    await ctx.route('https://servidor.teste/**', async r => {
        const req = r.request();
        if (req.method() === 'OPTIONS') {
            return r.fulfill({ status: 204, headers: {
                'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,accept,authorization',
                'Access-Control-Allow-Methods': 'POST' } });
        }
        const corpo = JSON.parse(req.postData() || '{}');
        pedidosAoServidor.push({ corpo, auth: req.headers()['authorization'] || '' });
        const resposta = !corpo.url ? { status: 'error', error: { code: 'error.api.link.missing' } }
            : /privado/.test(corpo.url)
            ? { status: 'error', error: { code: 'error.api.content.video.private' } }
            : { status: 'tunnel', url: 'https://arquivos.teste/tunel?id=1', filename: 'aula_gravada.webm' };
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resposta),
                           headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    const page = await ctx.newPage();
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });

    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    // -----------------------------------------------------------------------
    console.log('\n1. A aba Video');
    // -----------------------------------------------------------------------
    const aba = await page.evaluate(() => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [] });
        window.dadosCarregados = true;
        showScreen('ferramentas');
        showFerramentasTab('video');
        const el = document.getElementById('tabFerramentasVideo');
        const botoes = Array.from(document.querySelectorAll('#navFerramentas .ferr-nav-btn')).map(b => b.dataset.aba);
        return {
            botoes,
            visivel: !!el && el.style.display !== 'none',
            cartoes: el ? el.querySelectorAll('.vid-cartao').length : 0,
            total: (window.CATALOGO_VIDEO || []).length,
            titulo: el ? el.textContent.indexOf('Vídeo') !== -1 : false,
            privacidade: el ? el.innerHTML.indexOf('não sai deste aparelho') !== -1 : false,
            baixar: el ? !!el.querySelector('[data-ferramenta="baixar-link"]') : false,
            // O pedido: o texto nao cita plataforma nenhuma.
            semMarcas: el ? !/youtube|facebook|instagram|tiktok/i.test(el.innerHTML) : false
        };
    });
    ok('a aba Video aparece no menu de Ferramentas', aba.botoes.indexOf('video') !== -1, aba.botoes.join(', '));
    ok('abre e fica visivel', aba.visivel);
    ok('o catalogo inteiro e montado', aba.cartoes === aba.total && aba.total >= 14, aba.cartoes + ' de ' + aba.total);
    ok('tem o aviso de privacidade', aba.privacidade);
    ok('tem "Baixar video por link"', aba.baixar);
    ok('nenhuma plataforma e citada na tela', aba.semMarcas);

    // -----------------------------------------------------------------------
    console.log('\n2. O portao do plano Professor');
    // -----------------------------------------------------------------------
    const portao = await page.evaluate(async () => {
        const r = { premium: ehPremium() };
        abrirFerramentaVideo('cortar');
        for (let i = 0; i < 40 && !(document.getElementById('conteudoModalApoie') || {}).innerHTML; i++) {
            await new Promise(ok => setTimeout(ok, 50));
        }
        r.convite = !!document.getElementById('modalApoie') &&
                    document.getElementById('modalApoie').innerHTML.indexOf('plano Professor') !== -1;
        r.naoAbriu = !document.getElementById('vidExecutar');
        try { closeModal('modalApoie'); } catch (_) {}
        return r;
    });
    ok('conta gratuita nao e premium', portao.premium === false);
    ok('recebe o convite do plano', portao.convite);
    ok('e a ferramenta nao abre', portao.naoAbriu);

    // -----------------------------------------------------------------------
    console.log('\n3. O motor carrega e le um video');
    // -----------------------------------------------------------------------
    const video = await page.evaluate(GRAVAR_VIDEO, { segundos: 3, largura: 320, altura: 240, comSom: true });
    const video2 = await page.evaluate(GRAVAR_VIDEO, { segundos: 2, largura: 240, altura: 320, comSom: false });
    bytesDoVideo = Buffer.from(video);
    ok('o video de teste foi gravado', video.length > 1000, video.length + ' bytes');

    const envioAntes = await page.evaluate(() => window.__enviosDeSaida.length);
    const motor = await page.evaluate(async ({ video, video2 }) => {
        currentUser.role = 'super_admin';
        window.__v1 = new File([new Uint8Array(video)], 'aula.webm', { type: 'video/webm' });
        window.__v2 = new File([new Uint8Array(video2)], 'recreio.webm', { type: 'video/webm' });
        const t = Date.now();
        try {
            const info = await VIDEOOPS.sondar(window.__v1);
            return { info, segundos: (Date.now() - t) / 1000 };
        } catch (e) { return { erro: String(e && e.message || e) }; }
    }, { video, video2 });
    ok('o ffmpeg.wasm carregou', !motor.erro, motor.erro || (motor.segundos + 's'));
    if (motor.erro) { await browser.close(); console.log('\nSem motor nao ha' + ' o que testar.'); process.exit(1); }
    ok('e leu o tamanho do video', motor.info.largura === 320 && motor.info.altura === 240, motor.info.largura + 'x' + motor.info.altura);
    ok('e viu que ele tem som', motor.info.temAudio === true);

    // -----------------------------------------------------------------------
    console.log('\n4. As operacoes');
    // -----------------------------------------------------------------------
    const ops = await page.evaluate(async () => {
        const V = VIDEOOPS, v1 = window.__v1, v2 = window.__v2;
        const r = {};
        const medir = async (nome, fn) => {
            const t = Date.now();
            try {
                const s = await fn();
                const a = s.arquivos[0];
                const arq = new File([a.blob], a.nome, { type: a.tipo });
                r[nome] = Object.assign({ nome: a.nome, tipo: a.tipo, bytes: a.blob.size, mensagem: s.mensagem,
                                          segundos: (Date.now() - t) / 1000 },
                                        /^(video|image\/gif|audio)/.test(a.tipo) ? await V.sondar(arq) : {});
                return arq;
            } catch (e) { r[nome] = { erro: e.message }; return null; }
        };
        await medir('cortar', () => V.ops.cortar({ arquivo: v1, inicio: '0:01', fim: '0:02,5' }));
        await medir('girar', () => V.ops.girar({ arquivo: v1, angulo: '90' }));
        await medir('espelhar', () => V.ops.espelhar({ arquivo: v1, direcao: 'horizontal' }));
        await medir('recortar', () => V.ops.recortar({ arquivo: v1, modo: 'proporcao', proporcao: '1:1' }));
        await medir('recortarManual', () => V.ops.recortar({ arquivo: v1, modo: 'manual', x: 10, y: 10, largura: 101, altura: 80 }));
        await medir('redimensionar', () => V.ops.redimensionar({ arquivo: v1, modo: 'porcentagem', porcentagem: 50 }));
        await medir('comprimir', () => V.ops.comprimir({ arquivo: v1, nivel: 'forte', limiteAltura: '120' }));
        await medir('velocidade', () => V.ops.velocidade({ arquivo: v1, fator: '2' }));
        await medir('repetir', () => V.ops.repetir({ arquivo: v2, vezes: 3 }));
        await medir('juntar', () => V.ops.juntar({ arquivos: [v1, v2] }));
        const mp3 = await medir('extrairAudio', () => V.ops.extrairAudio({ arquivo: v1 }));
        await medir('adicionarAudio', () => V.ops.adicionarAudio({ arquivo: v2, audio: mp3, modo: 'substituir', volume: 100 }));
        const gif = await medir('videoParaGif', () => V.ops.videoParaGif({ arquivo: v1, inicio: '0', duracao: '2', fps: '10', largura: '160' }));
        await medir('velocidadeGif', () => V.ops.velocidadeGif({ arquivo: gif, fator: '2' }));

        const desenhar = async (cor, w, h) => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const g = c.getContext('2d'); g.fillStyle = cor; g.fillRect(0, 0, w, h);
            const b = await new Promise(ok => c.toBlob(ok, 'image/png'));
            return new File([b], cor.slice(1) + '.png', { type: 'image/png' });
        };
        const imgs = [await desenhar('#ff0000', 200, 100), await desenhar('#00ff00', 100, 100), await desenhar('#0000ff', 300, 150)];
        await medir('imagensParaGif', () => V.ops.imagensParaGif({ imagens: imgs, segundos: '0,5', largura: 200, fundo: '#ffffff', repetir: true }));

        // Erros explicados, sem precisar do motor
        const erro = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
        r.erroFimAntes = await erro(() => V.ops.cortar({ arquivo: v1, inicio: '0:02', fim: '0:01' }));
        r.erroTempoTorto = await erro(() => V.ops.cortar({ arquivo: v1, inicio: 'abc', fim: '0:01' }));
        r.erroSoUmVideo = await erro(() => V.ops.juntar({ arquivos: [v1] }));
        r.erroSemSom = await erro(() => V.ops.extrairAudio({ arquivo: v2 }));
        return r;
    });
    const perto = (a, b, tol) => Math.abs(a - b) <= tol;
    const d = (o) => o.erro ? o.erro : (o.duracao != null ? o.duracao.toFixed(2) + 's ' : '') + (o.largura ? o.largura + 'x' + o.altura : '') + ' ' + (o.segundos || 0) + 's de trabalho';
    ok('cortar: trecho de 1,5 s', !ops.cortar.erro && perto(ops.cortar.duracao, 1.5, 0.25) && /\.mp4$/.test(ops.cortar.nome), d(ops.cortar));
    ok('girar 90°: 320x240 vira 240x320', !ops.girar.erro && ops.girar.largura === 240 && ops.girar.altura === 320, d(ops.girar));
    ok('espelhar: mesmo tamanho, mp4', !ops.espelhar.erro && ops.espelhar.largura === 320 && ops.espelhar.tipo === 'video/mp4', d(ops.espelhar));
    ok('recortar 1:1: 240x240', !ops.recortar.erro && ops.recortar.largura === 240 && ops.recortar.altura === 240, d(ops.recortar));
    ok('recortar em pixels (impar vira par)', !ops.recortarManual.erro && ops.recortarManual.largura === 102 && ops.recortarManual.altura === 80, d(ops.recortarManual));
    ok('redimensionar 50%: 160x120', !ops.redimensionar.erro && ops.redimensionar.largura === 160 && ops.redimensionar.altura === 120, d(ops.redimensionar));
    ok('comprimir com limite de 120p', !ops.comprimir.erro && ops.comprimir.altura === 120 && !!ops.comprimir.mensagem, d(ops.comprimir) + ' — ' + (ops.comprimir.mensagem || ''));
    ok('velocidade 2x: metade da duracao, com som', !ops.velocidade.erro && perto(ops.velocidade.duracao, 1.5, 0.35) && ops.velocidade.temAudio, d(ops.velocidade));
    ok('repetir 3x: triplo da duracao', !ops.repetir.erro && perto(ops.repetir.duracao, 6, 0.6), d(ops.repetir));
    ok('juntar video com som + video sem som', !ops.juntar.erro && perto(ops.juntar.duracao, 5, 0.7) &&
       ops.juntar.largura === 320 && ops.juntar.altura === 240 && ops.juntar.temAudio, d(ops.juntar));
    ok('extrair audio: MP3', !ops.extrairAudio.erro && ops.extrairAudio.tipo === 'audio/mpeg' && ops.extrairAudio.temAudio, d(ops.extrairAudio));
    ok('adicionar audio a video mudo', !ops.adicionarAudio.erro && ops.adicionarAudio.temAudio && perto(ops.adicionarAudio.duracao, 2, 0.4), d(ops.adicionarAudio));
    ok('video para GIF: 160 de largura, ~2 s', !ops.videoParaGif.erro && ops.videoParaGif.tipo === 'image/gif' && ops.videoParaGif.largura === 160, d(ops.videoParaGif));
    ok('velocidade do GIF 2x', !ops.velocidadeGif.erro && ops.velocidadeGif.tipo === 'image/gif' && (ops.velocidadeGif.duracao || 0) < (ops.videoParaGif.duracao || 0), d(ops.velocidadeGif));
    ok('imagens para GIF: 3 imagens, 200x100', !ops.imagensParaGif.erro && ops.imagensParaGif.largura === 200 && ops.imagensParaGif.altura === 100, d(ops.imagensParaGif));
    ok('fim antes do inicio e recusado com explicacao', /depois do inicio/.test(ops.erroFimAntes), ops.erroFimAntes);
    ok('tempo torto e recusado com exemplo', /como 0:15/.test(ops.erroTempoTorto), ops.erroTempoTorto);
    ok('juntar um video so e recusado', /dois videos/.test(ops.erroSoUmVideo), ops.erroSoUmVideo);
    ok('extrair som de video mudo e explicado', /nao tem som/.test(ops.erroSemSom), ops.erroSemSom);

    // -----------------------------------------------------------------------
    console.log('\n5. A tela: cortar pelo formulario');
    // -----------------------------------------------------------------------
    await page.evaluate(() => abrirFerramentaVideo('cortar'));
    await page.setInputFiles('#vidCampo_arquivo', { name: 'aula.webm', mimeType: 'video/webm', buffer: Buffer.from(video) });
    await page.waitForTimeout(800);
    const tela = await page.evaluate(async () => {
        const r = {};
        r.previa = !!document.getElementById('vidPrevia_arquivo');
        r.fimSugerido = document.getElementById('vidCampo_fim').value;
        const inicio = document.getElementById('vidCampo_inicio');
        inicio.value = '0:01'; inicio.dispatchEvent(new Event('input'));
        const fim = document.getElementById('vidCampo_fim');
        fim.value = '0:02'; fim.dispatchEvent(new Event('input'));
        await vidExecutar();
        const res = document.getElementById('vidResultado');
        r.pronto = !!res.querySelector('.vid-pronto');
        r.previaResultado = !!res.querySelector('video');
        r.botaoBaixar = !!res.querySelector('.vid-baixar');
        r.texto = res.textContent.replace(/\s+/g, ' ').slice(0, 160);
        return r;
    });
    ok('a previa do video aparece', tela.previa);
    ok('o fim ja vem com a duracao do video', /^0:0[23]/.test(tela.fimSugerido), tela.fimSugerido);
    ok('cortar pela tela termina com "Pronto"', tela.pronto, tela.texto);
    ok('com previa do resultado e botao de baixar', tela.previaResultado && tela.botaoBaixar);

    const envioDepois = await page.evaluate(() => window.__enviosDeSaida.slice());
    ok('nenhum POST/PUT saiu da pagina durante a edicao', envioDepois.length === envioAntes, envioDepois.join(', '));

    // -----------------------------------------------------------------------
    console.log('\n6. Baixar por link');
    // -----------------------------------------------------------------------
    await page.evaluate(() => {
        // O que o botao Salvar do painel faz, sem a janela.
        window.salvarServidoresVideoAdminDireto = async (lista) => {
            await saveData('assinaturas_config', 'video', { servidores: lista, atualizadoEm: new Date().toISOString() });
            VIDEOOPS.esquecerServidores();
        };
    });
    const link = await page.evaluate(async () => {
        const V = VIDEOOPS;
        const r = {};
        const tentar = async (e) => {
            try { const s = await V.ops.baixarLink(e); return { nome: s.arquivos[0].nome, bytes: s.arquivos[0].blob.size, tipo: s.arquivos[0].tipo }; }
            catch (err) { return { erro: err.message, abrir: err.abrirLink || '' }; }
        };
        r.direto = await tentar({ link: 'https://arquivos.teste/pasta/festa.webm' });
        r.bloqueado = await tentar({ link: 'https://bloqueado.teste/filme.mp4' });
        r.semServidor = await tentar({ link: 'https://site.teste/watch?v=abc' });
        r.naoELink = await tentar({ link: 'isso nao e link' });
        window.PROFSIS_VIDEO_SERVIDORES = [{ url: 'https://servidor.teste', chave: 'segredo' }];
        r.pelaApi = await tentar({ link: 'https://site.teste/watch?v=abc', qualidade: '480' });
        r.privado = await tentar({ link: 'https://site.teste/privado/1' });
        delete window.PROFSIS_VIDEO_SERVIDORES;

        // O caminho de verdade: o super admin salva o endereco pelo painel e o
        // professor so' cola o link.
        await salvarServidoresVideoAdminDireto([{ url: 'https://servidor.teste', chave: '' }]);
        r.doBanco = await tentar({ link: 'https://outro.teste/v/123' });
        r.teste = await V.testarServidor({ url: 'https://servidor.teste', chave: '' });
        r.testeMorto = await V.testarServidor({ url: 'https://bloqueado.teste', chave: '' });
        return r;
    });
    ok('link direto de arquivo baixa', !link.direto.erro && link.direto.nome === 'festa.webm' && link.direto.bytes === video.length,
       JSON.stringify(link.direto));
    ok('arquivo que o servidor nao libera: explica e oferece abrir o link', /nao permite/.test(link.bloqueado.erro || '') &&
       link.bloqueado.abrir === 'https://bloqueado.teste/filme.mp4', link.bloqueado.erro);
    ok('sem servidor configurado: explica, sem citar plataforma', /ainda n[aã]o est/.test(link.semServidor.erro || '') &&
       !/youtube|facebook|instagram/i.test(link.semServidor.erro || ''), link.semServidor.erro);
    ok('texto que nao e link e recusado', /nao parece um link/.test(link.naoELink.erro || ''), link.naoELink.erro);
    ok('pelo servidor: resolve e baixa com o nome certo', !link.pelaApi.erro && link.pelaApi.nome === 'aula_gravada.webm' &&
       link.pelaApi.bytes === video.length, JSON.stringify(link.pelaApi));
    ok('o servidor recebeu o link, a qualidade e a chave', pedidosAoServidor.length >= 1 &&
       pedidosAoServidor[0].corpo.url === 'https://site.teste/watch?v=abc' && pedidosAoServidor[0].corpo.videoQuality === '480' &&
       pedidosAoServidor[0].auth === 'Api-Key segredo', JSON.stringify(pedidosAoServidor[0] || {}));
    ok('video privado: mensagem clara', /privado/.test(link.privado.erro || ''), link.privado.erro);
    ok('servidor salvo no painel: o link de pagina baixa', !link.doBanco.erro && link.doBanco.nome === 'aula_gravada.webm',
       JSON.stringify(link.doBanco));
    ok('o servidor recebeu o link colado', pedidosAoServidor.some(p => p.corpo.url === 'https://outro.teste/v/123'));
    ok('botao Testar: servidor vivo', link.teste.ok === true, link.teste.motivo);
    ok('botao Testar: servidor fora do ar', link.testeMorto.ok === false, link.testeMorto.motivo);

    // A janela do painel abre, testa e salva.
    const painel = await page.evaluate(async () => {
        await abrirModalDownloadVideoAdmin();
        const r = { abriu: !!document.getElementById('videoServidorUrl0'),
                    preenchido: document.getElementById('videoServidorUrl0').value };
        document.getElementById('videoServidorUrl1').value = 'https://servidor.teste/';
        await testarServidoresVideoAdmin();
        r.teste = document.getElementById('videoServidorTeste').textContent;
        await salvarServidoresVideoAdmin();
        r.salvo = window.__docs['assinaturas_config/video'];
        return r;
    });
    ok('o painel abre com o servidor ja salvo', painel.abriu && painel.preenchido === 'https://servidor.teste', painel.preenchido);
    ok('o Testar do painel mostra o resultado', /✅/.test(painel.teste), painel.teste);
    ok('salvar nao duplica barra no fim e guarda os dois', !!painel.salvo && painel.salvo.servidores.length === 2 &&
       painel.salvo.servidores[1].url === 'https://servidor.teste', JSON.stringify(painel.salvo && painel.salvo.servidores));

    await browser.close();
    console.log('\n' + (falhas.length ? falhas.length + ' FALHA(S):\n  - ' + falhas.join('\n  - ') : 'Tudo certo.'));
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
