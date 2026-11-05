// O "MONTAR VIDEO" (editor com linha do tempo) da aba Video de Ferramentas.
//
// O que este teste cobre:
//   1. o modelo (montagem_operacoes.js), direto no Node: duracoes, dividir, apagar
//      antes/depois, aparar, mover, duplicar, desfazer/refazer e o comando do ffmpeg;
//   2. o cartao existe e o portao do plano vale para conta gratuita;
//   3. a tela: acrescentar videos, foto e audio pelo seletor de arquivos, a previa
//      desenha, dividir pela tecla S, desfazer, aparar puxando a borda com o mouse,
//      texto novo e velocidade 2x;
//   4. exportar de verdade com o ffmpeg.wasm: duracao, tamanho do quadro e som do
//      arquivo final conferidos pelo proprio ffmpeg, e o texto aparece no quadro certo
//      (um quadro e' extraido e o pixel e' conferido);
//   5. nenhum POST/PUT sai da pagina.
//
// Como rodar (ver testes/LEIAME.md):
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   PROFSIS_CHROMIUM=/opt/pw-browsers/chromium NODE_PATH=$(npm root -g) node testes/teste-montagem.js
// PRECISA de internet: o ffmpeg.wasm (~32 MB) vem do cdn.jsdelivr.net.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const M = require(path.join(__dirname, '..', 'montagem_operacoes.js'));

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}
const perto = (a, b, tol) => Math.abs(a - b) <= (tol || 0.01);

// ---------------------------------------------------------------------------
console.log('\n1. O modelo');
// ---------------------------------------------------------------------------
(() => {
    const p = M.projetoVazio();
    p.clipes.push(M.novoClipeVideo('v1', { duracao: 10 }), M.novoClipeImagem('f1'), M.novoClipeCor('#ff0000'));
    ok('duracao total soma os clipes (10 + 4 + 4)', perto(M.duracaoTotal(p), 18), M.duracaoTotal(p));
    const em = M.clipeEm(p, 11);
    ok('o tempo 11 cai na foto, 1 s dentro', em && em.indice === 1 && perto(em.dentro, 1));
    const novo = M.dividir(p, 4);
    ok('dividir em 4 s parte o video em 0-4 e 4-10', !!novo && p.clipes.length === 4 && p.clipes[0].ate === 4 && p.clipes[1].de === 4 && p.clipes[1].ate === 10);
    ok('dividir nao muda a duracao total', perto(M.duracaoTotal(p), 18));
    ok('dividir colado na ponta e recusado', M.dividir(p, 4.02) === null);
    p.clipes[1].velocidade = 2;
    ok('velocidade 2x encurta o pedaco (6 s -> 3 s)', perto(M.duracaoClipe(p.clipes[1]), 3) && perto(M.duracaoTotal(p), 15));
    const em2 = M.clipeEm(p, 5);
    ok('com 2x, 1 s na linha do tempo sao 2 s do arquivo', em2 && em2.indice === 1 && perto(em2.local, 6));
    const q = M.copiar(p);
    ok('apagar antes da agulha (no meio do 1o pedaco)', M.apagarLado(q, 1, null, 'antes') && perto(q.clipes[0].de, 1) && perto(M.duracaoTotal(q), 14));
    const r = M.copiar(p);
    ok('apagar depois da agulha', M.apagarLado(r, 1, null, 'depois') && perto(r.clipes[0].ate, 1) && perto(M.duracaoTotal(r), 12));
    const s = M.copiar(p);
    M.aparar(s, s.clipes[0].id, 'fim', -1.5);
    ok('aparar o fim de um pedaco', perto(s.clipes[0].ate, 2.5));
    M.aparar(s, s.clipes[0].id, 'fim', +50);
    ok('aparar nao passa do tamanho do arquivo', perto(s.clipes[0].ate, 10));
    M.aparar(s, s.clipes[2].id, 'fim', 2);
    ok('aparar foto muda a duracao dela', perto(s.clipes[2].duracao, 6));
    const idCor = s.clipes[3].id;
    M.moverClipe(s, idCor, 0);
    ok('mover a tela colorida para o comeco', s.clipes[0].id === idCor);
    const t = M.novoTexto(2, 'Ola');
    s.textos.push(t);
    const dup = M.duplicar(s, t.id);
    ok('duplicar texto poe a copia logo depois', s.textos.length === 2 && perto(M.acharItem(s, dup).item.inicio, 5));
    const tDiv = M.dividir(s, 3, t.id);
    ok('dividir um texto selecionado', !!tDiv && perto(M.acharItem(s, t.id).item.duracao, 1) && perto(M.acharItem(s, tDiv).item.inicio, 3));
    const h = M.criarHistorico();
    const antes = M.copiar(s);
    h.guardar(s);
    s.clipes = [];
    const volta = h.desfazer(s);
    ok('desfazer devolve o projeto anterior', JSON.stringify(volta) === JSON.stringify(antes));
    const vai = h.refazer(volta);
    ok('refazer refaz', vai && vai.clipes.length === 0);
    ok('formato 9:16 em 720p e 720x1280', JSON.stringify(M.dimensoes({ formato: '9:16', qualidade: '720' })) === '{"W":720,"H":1280}');
    ok('formato 16:9 em 480p e 854x480', JSON.stringify(M.dimensoes({ formato: '16:9', qualidade: '480' })) === '{"W":854,"H":480}');
    p.textos.push(M.novoTexto(1, 'Titulo'));
    p.audios.push(M.novoAudio('a1', { duracao: 60 }, 2));
    p.fundo.tipo = 'desfocado';
    const cmd = M.montarArgs(p, [
        { chave: 'v1', nome: 'v.webm', info: { temAudio: true } }, { chave: 'f1', nome: 'f.png', info: {} },
        { chave: 'a1', nome: 'a.wav', info: { temAudio: true } }, { chave: 'texto:' + p.textos[0].id, nome: 't.png', info: {} }
    ], 'saida.mp4', (f) => 'atempo=' + f).args.join(' ');
    ok('o comando junta os pedacos (concat de 4)', /concat=n=4:v=1:a=1/.test(cmd));
    ok('o comando poe o texto por cima no tempo certo', /enable='between\(t,1\.000,4\.000\)'/.test(cmd));
    ok('o comando mistura a musica, comecando em 2 s', /adelay=2000\|2000/.test(cmd) && /amix=inputs=2/.test(cmd));
    ok('fundo desfocado usa boxblur', /boxblur/.test(cmd));
    ok('a musica e cortada no fim do video', /-t 13\.000 -i a\.wav/.test(cmd), (cmd.match(/-t [\d.]+ -i a\.wav/) || [''])[0]);
    let erro = '';
    try { M.montarArgs(M.projetoVazio(), [], 's.mp4', String); } catch (e) { erro = e.message; }
    ok('projeto vazio e recusado com explicacao', /pelo menos um/.test(erro), erro);
})();

// Video de teste gravado no navegador (canvas + tom), como em teste-video.js.
const GRAVAR_VIDEO = async ({ segundos, largura, altura, comSom, cor }) => {
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    const fluxo = canvas.captureStream(25);
    let audioCtx = null;
    if (comSom) {
        audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const destino = audioCtx.createMediaStreamDestination();
        osc.frequency.value = 440; osc.connect(destino); osc.start();
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
            ctx.fillStyle = cor; ctx.fillRect(0, 0, largura, altura);
            ctx.fillStyle = '#ffffff'; ctx.fillRect((t * 60) % largura, altura / 3, 30, 30);
            if (t < segundos) requestAnimationFrame(quadro); else ok();
        };
        quadro();
    });
    gravador.stop();
    await fim;
    if (audioCtx) audioCtx.close();
    return Array.from(new Uint8Array(await new Blob(pedacos, { type: 'video/webm' }).arrayBuffer()));
};

// Um WAV de 6 s (tom de 220 Hz), feito aqui mesmo.
function wav(segundos) {
    const taxa = 22050, n = Math.round(taxa * segundos);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(taxa, 24);
    b.writeUInt32LE(taxa * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / taxa * 2 * Math.PI * 220) * 8000), 44 + i * 2);
    return b;
}

const FAKE = () => {
    window.__enviosDeSaida = [];
    const fetchOriginal = window.fetch;
    window.fetch = function (recurso, opcoes) {
        const metodo = ((opcoes && opcoes.method) || (recurso && recurso.method) || 'GET').toUpperCase();
        if (metodo !== 'GET' && metodo !== 'HEAD') window.__enviosDeSaida.push(metodo + ' ' + String((recurso && recurso.url) || recurso));
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
        auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: (cb) => { setTimeout(() => cb(null), 0); return () => {}; }, signOut: async () => {} }),
        firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) })
    };
    window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium',
        args: ['--autoplay-policy=no-user-gesture-required']
    });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com)/, r => r.abort());
    const page = await ctx.newPage();
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript(FAKE);
    await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    // -----------------------------------------------------------------------
    console.log('\n2. O cartao e o portao');
    // -----------------------------------------------------------------------
    const cartao = await page.evaluate(async () => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [] });
        window.dadosCarregados = true;
        document.getElementById('appContainer').style.display = 'block';
        showScreen('ferramentas');
        showFerramentasTab('video');
        const r = { cartao: !!document.querySelector('[data-ferramenta="montar"]') };
        abrirFerramentaVideo('montar');
        for (let i = 0; i < 40 && !(document.getElementById('conteudoModalApoie') || {}).innerHTML; i++) await new Promise(ok => setTimeout(ok, 50));
        r.convite = !!document.getElementById('modalApoie') && document.getElementById('modalApoie').innerHTML.indexOf('plano Professor') !== -1;
        r.naoAbriu = !document.getElementById('mvEditor');
        try { closeModal('modalApoie'); } catch (_) {}
        return r;
    });
    ok('o cartao "Editor de video" esta no catalogo', cartao.cartao);
    ok('conta gratuita recebe o convite do plano', cartao.convite);
    ok('e o editor nao abre', cartao.naoAbriu);

    // -----------------------------------------------------------------------
    console.log('\n3. A tela');
    // -----------------------------------------------------------------------
    const v1 = await page.evaluate(GRAVAR_VIDEO, { segundos: 3, largura: 320, altura: 240, comSom: true, cor: '#1a365d' });
    const v2 = await page.evaluate(GRAVAR_VIDEO, { segundos: 2, largura: 240, altura: 320, comSom: false, cor: '#22543d' });
    const png = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 200; c.height = 100;
        const g = c.getContext('2d'); g.fillStyle = '#c53030'; g.fillRect(0, 0, 200, 100);
        const b = await new Promise(ok => c.toBlob(ok, 'image/png'));
        return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await page.evaluate(() => { currentUser.role = 'super_admin'; abrirFerramentaVideo('montar'); });
    ok('o editor abre para quem tem o plano', await page.$('#mvEditor') !== null);
    await page.setInputFiles('#mvBtnMidia input', [
        { name: 'aula.webm', mimeType: 'video/webm', buffer: Buffer.from(v1) },
        { name: 'recreio.webm', mimeType: 'video/webm', buffer: Buffer.from(v2) },
        { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png) }
    ]);
    await page.waitForFunction(() => MONTAGEM.estado().proj && MONTAGEM.estado().proj.clipes.length === 3, null, { timeout: 30000 }).catch(() => {});
    let e = await page.evaluate(() => MONTAGEM.estado());
    ok('os 3 arquivos viraram 3 pedacos na faixa de video', e.proj.clipes.length === 3, e.proj.clipes.map(c => c.tipo).join(','));
    const dur0 = e.proj.clipes.reduce((s, c) => s + M.duracaoClipe(c), 0);
    ok('com a duracao lida de cada video (~3 + ~2 + 4 s)', dur0 > 8 && dur0 < 10.5, dur0.toFixed(2) + ' s');
    ok('os blocos aparecem na linha do tempo', (await page.$$('.mv-b-clipes')).length === 3);
    await page.waitForTimeout(400);
    const cor = await page.evaluate(async () => {
        MONTAGEM.buscar(1);
        await new Promise(ok => setTimeout(ok, 600));
        const c = document.getElementById('mvCanvas');
        const px = c.getContext('2d').getImageData(Math.round(c.width * 0.2), Math.round(c.height * 0.8), 1, 1).data;
        return Array.from(px);
    });
    ok('a previa desenha o video (azul do video 1)', cor[2] > 60 && cor[2] > cor[0], cor.join(','));

    // Dividir pela tecla S com a agulha em 1,5 s
    await page.evaluate(() => { MONTAGEM.buscar(1.5); document.activeElement && document.activeElement.blur(); });
    await page.keyboard.press('s');
    e = await page.evaluate(() => MONTAGEM.estado());
    ok('tecla S divide o pedaco embaixo da agulha', e.proj.clipes.length === 4 && perto(e.proj.clipes[0].ate, 1.5, 0.05), e.proj.clipes.length + ' pedacos');
    await page.click('#mvBtnDesfazer');
    e = await page.evaluate(() => MONTAGEM.estado());
    ok('desfazer junta de novo', e.proj.clipes.length === 3);
    await page.click('#mvBtnRefazer');
    e = await page.evaluate(() => MONTAGEM.estado());
    ok('refazer divide de novo', e.proj.clipes.length === 4);
    await page.click('#mvBtnDesfazer');

    // Aparar o fim do 1o pedaco puxando a borda direita com o mouse
    const borda = await page.$('.mv-b-clipes .mv-alca-d');
    await borda.scrollIntoViewIfNeeded();
    const caixa = await borda.boundingBox();
    const pps = (await page.evaluate(() => MONTAGEM.estado())).pps;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width / 2 - pps * 1, caixa.y + caixa.height / 2, { steps: 6 });
    await page.mouse.up();
    e = await page.evaluate(() => MONTAGEM.estado());
    const ate = e.proj.clipes[0].ate;
    ok('puxar a borda direita apara o fim (~1 s a menos)', ate < 2.4 && ate > 1.6, 'fim em ' + ate.toFixed(2) + ' s');

    // Texto novo no comeco, faixa amarela no meio da tela
    await page.evaluate(() => { MONTAGEM.buscar(0); });
    await page.click('#mvBtnTexto');
    await page.fill('#mvTextoTexto', 'Feira de Ciências');
    await page.click('#mvEstilo [data-v="faixa"]');
    e = await page.evaluate(() => MONTAGEM.estado());
    const tId = e.proj.textos[0] && e.proj.textos[0].id;
    await page.evaluate((id) => { mvMudar(id, 'corFundo', '#ffff00'); mvMudar(id, 'y', 0.5); mvMudar(id, 'suave', false); mvMudar(id, 'duracao', 1.5); }, tId);
    e = await page.evaluate(() => MONTAGEM.estado());
    ok('o texto entrou na faixa de texto', e.proj.textos.length === 1 && e.proj.textos[0].texto === 'Feira de Ciências' && e.proj.textos[0].estilo === 'faixa');
    const amarelo = await page.evaluate(() => {
        MONTAGEM.buscar(0.5);
        const c = document.getElementById('mvCanvas');
        return Array.from(c.getContext('2d').getImageData(4, Math.round(c.height / 2), 1, 1).data);
    });
    ok('a previa mostra a faixa do texto', amarelo[0] > 150 && amarelo[1] > 150 && amarelo[2] < 120, amarelo.join(','));

    // Video 2 (em pe) a 2x
    await page.evaluate(() => { const c = MONTAGEM.estado().proj.clipes[1]; mvSelecionar(c.id); });
    await page.click('#mvVelocidade [data-v="2"]');
    e = await page.evaluate(() => MONTAGEM.estado());
    ok('velocidade 2x no segundo video', e.proj.clipes[1].velocidade === 2);

    // Musica
    await page.setInputFiles('#mvBtnAudio input', { name: 'musica.wav', mimeType: 'audio/wav', buffer: wav(6) });
    await page.waitForFunction(() => MONTAGEM.estado().proj.audios.length === 1, null, { timeout: 15000 }).catch(() => {});
    e = await page.evaluate(() => MONTAGEM.estado());
    ok('a musica entrou na faixa de audio', e.proj.audios.length === 1 && perto(M.duracaoAudio(e.proj.audios[0]), 6, 0.1));
    await page.evaluate(() => { mvSelecionar(null); mvMudar('', 'qualidade', '480'); mvMudar('', 'fundo.tipo', 'desfocado'); });
    const totalEsperado = M.duracaoTotal(e.proj);

    // Tocar um pouco (nao deve dar erro)
    await page.click('#mvBtnTocar');
    await page.waitForTimeout(900);
    const tocou = await page.evaluate(() => { const s = MONTAGEM.estado(); MONTAGEM.pausar(); return s.tempo; });
    ok('tocar anda a agulha', tocou > 0.3, tocou.toFixed(2) + ' s');

    if (process.env.PROFSIS_PRINT) {
        await page.evaluate(() => { const t = MONTAGEM.estado().proj.textos[0]; mvSelecionar(t.id); MONTAGEM.buscar(0.6); });
        await page.waitForTimeout(400);
        await page.screenshot({ path: process.env.PROFSIS_PRINT, fullPage: false });
    }

    // -----------------------------------------------------------------------
    console.log('\n4. Exportar com o ffmpeg.wasm');
    // -----------------------------------------------------------------------
    const envioAntes = await page.evaluate(() => window.__enviosDeSaida.length);
    const t0 = Date.now();
    await page.evaluate(() => mvExportar());
    await page.waitForFunction(() => MONTAGEM.estado().resultado || document.querySelector('#mvExport .mv-erro'), null, { timeout: 300000 }).catch(() => {});
    const exp = await page.evaluate(async () => {
        const s = MONTAGEM.estado();
        const erro = document.querySelector('#mvExport .mv-erro');
        if (!s.resultado) return { erro: erro ? erro.textContent : 'sem resultado' };
        const blob = MONTAGEM.resultadoBlob();
        const arq = new File([blob], 'saida.mp4', { type: 'video/mp4' });
        const info = await VIDEOOPS.sondar(arq);
        // Extrai o quadro em 0,5 s (texto na tela) e em 2,5 s (texto ja' saiu).
        const quadro = async (t) => {
            const r = await VIDEOOPS.rodar({ entradas: [{ arquivo: arq, ext: 'mp4' }], saida: 'png', tipoSaida: 'image/png', nomeSaida: 'q.png',
                montar: (n, sai) => ['-ss', String(t), '-i', n[0], '-frames:v', '1', sai] });
            const img = await createImageBitmap(r.blob);
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            return Array.from(g.getImageData(4, Math.round(img.height / 2), 1, 1).data);
        };
        return { resultado: s.resultado, info, comTexto: await quadro(0.5), semTexto: await quadro(2.5),
                 baixar: !!document.querySelector('#mvBaixar'), videoNaTela: !!document.querySelector('#mvExport video') };
    });
    ok('exportou sem erro', !exp.erro, exp.erro || (exp.resultado.mensagem + ' em ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s'));
    if (!exp.erro) {
        ok('o arquivo tem a duracao da linha do tempo', perto(exp.info.duracao, totalEsperado, 0.25), exp.info.duracao.toFixed(2) + ' s (esperado ' + totalEsperado.toFixed(2) + ')');
        ok('o quadro e 854x480 (16:9 em 480p)', exp.info.largura === 854 && exp.info.altura === 480, exp.info.largura + 'x' + exp.info.altura);
        ok('o arquivo tem som (video 1 + musica)', exp.info.temAudio === true);
        ok('o texto aparece no quadro em 0,5 s (faixa amarela)', exp.comTexto[0] > 150 && exp.comTexto[1] > 150 && exp.comTexto[2] < 120, exp.comTexto.join(','));
        ok('e ja saiu em 2,5 s', !(exp.semTexto[0] > 150 && exp.semTexto[1] > 150 && exp.semTexto[2] < 120), exp.semTexto.join(','));
        ok('o resultado aparece com previa e botao de baixar', exp.baixar && exp.videoNaTela);
    }
    const envioDepois = await page.evaluate(() => window.__enviosDeSaida.slice());
    ok('nenhum POST/PUT saiu da pagina', envioDepois.length === envioAntes, envioDepois.join(', '));

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' falha(s):\n  - ' + falhas.join('\n  - ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
