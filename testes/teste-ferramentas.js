// A tela FERRAMENTAS e a aba AMPLIAR.
//
// A tela de PDF deixou de ser um botao do menu e virou a primeira ABA de "Ferramentas",
// ao lado de "Ampliar". Duas coisas podem quebrar nessa mudanca, e as duas sao caras:
// o atalho antigo (showScreen('pdf')) parar de achar a tela, e a promessa central da
// funcao — "o arquivo nao sai do aparelho" — deixar de valer na aba nova.
//
// O que este teste cobre:
//   1. o botao do menu virou "Ferramentas" nos quatro perfis, e a tela nasce sob demanda;
//   2. as duas abas existem, so' uma aparece por vez, e trocar de aba funciona;
//   3. o atalho antigo showScreen('pdf') continua caindo na aba de PDF, com o catalogo
//      inteiro montado dentro dela;
//   4. a aba Ampliar monta os controles, le uma imagem de verdade e diz o tamanho certo;
//   5. o PORTAO: conta gratuita nao amplia (o convite do plano aparece);
//   6. a conta com direito amplia DE VERDADE — 2x, com limpeza e realce — e o resultado
//      tem o tamanho certo, vira arquivo e aparece na comparacao antes/depois;
//   7. DESISTIR no meio: o botao Cancelar interrompe, avisa, e nao vira tarja de erro;
//   8. os limites que protegem o professor: arquivo que nao e' imagem e' recusado com
//      explicacao, e a ampliacao que nao cabe na memoria fica desabilitada;
//   9. a promessa: enquanto a aba Ampliar trabalha no motor "Nitido", NENHUM pedido de
//      rede sai da pagina — nem para CDN, porque esse motor nao baixa nada.
//
// Como rodar (ver testes/LEIAME.md):
//   npm i playwright
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-ferramentas.js
//
// NAO precisa de internet: a aba Ampliar foi feita para funcionar sem ela.

const { chromium } = require('playwright');

// O Firebase falso: o teste nao toca no banco real e nao precisa de conta.
const FAKE = () => {
    // Espiao de saida: qualquer POST, PUT ou sendBeacon fica registrado. E' o que
    // transforma "a imagem nao sai do aparelho" em afirmacao verificavel.
    window.__enviosDeSaida = [];
    const fetchOriginal = window.fetch;
    window.fetch = function (recurso, opcoes) {
        const metodo = ((opcoes && opcoes.method) || (recurso && recurso.method) || 'GET').toUpperCase();
        if (metodo !== 'GET' && metodo !== 'HEAD') {
            window.__enviosDeSaida.push(metodo + ' ' + String((recurso && recurso.url) || recurso));
        }
        return fetchOriginal.apply(this, arguments);
    };
    const abrirOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (metodo, url) {
        const m = String(metodo || '').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') window.__enviosDeSaida.push(m + ' ' + url);
        return abrirOriginal.apply(this, arguments);
    };
    if (navigator.sendBeacon) {
        const beaconOriginal = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (url) { window.__enviosDeSaida.push('BEACON ' + url); return beaconOriginal.apply(this, arguments); };
    }

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

// A imagem de teste e' desenhada aqui, no proprio navegador: listras finas e um degrau
// duro, que e' onde ampliacao ruim aparece na hora (serrilha e aureola).
const DESENHAR_PNG = ({ largura, altura }) => {
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.fillStyle = '#1a365d';
    for (let x = 0; x < largura / 2; x += 4) ctx.fillRect(x, 0, 2, altura);
    ctx.fillRect(largura / 2, 0, largura / 2, altura / 3);
    ctx.fillStyle = '#e53e3e';
    ctx.beginPath(); ctx.arc(largura * 0.75, altura * 0.7, altura * 0.2, 0, Math.PI * 2); ctx.fill();
    return canvas.toDataURL('image/png');
};

(async () => {
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
    if (process.env.PROFSIS_PROXY) {
        opcoes.proxy = { server: process.env.PROFSIS_PROXY, bypass: 'localhost,127.0.0.1,::1' };
    }
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

    // Os SDKs do Google ficam DE FORA: se carregarem, reescrevem window.firebase por cima
    // do banco falso e a medicao do item 8 fica afogada no trafego do Firebase.
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com)/,
                    r => r.abort());

    const page = await ctx.newPage();
    const pedidos = [];
    page.on('request', r => pedidos.push(r.url()));
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });

    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    // -----------------------------------------------------------------------
    console.log('\n1. O botao "Ferramentas" e a tela');
    // -----------------------------------------------------------------------
    const menus = await page.evaluate(() => {
        const r = {};
        currentUser = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [] });
        window.dadosCarregados = true;
        [['professor', renderProfessorPanel], ['aee', renderAeePanel], ['projeto', renderProjetoPanel]].forEach(([modo, fn]) => {
            currentViewMode = modo;
            try { fn(); } catch (e) { /* o dashboard pode reclamar de dado que nao existe */ }
            const html = document.querySelector('nav').innerHTML;
            r[modo] = html.indexOf("showScreen('ferramentas'") !== -1 && html.indexOf('Ferramentas') !== -1;
        });
        currentViewMode = 'gestor';
        try { renderGestorPanel(); } catch (e) { /* idem */ }
        r.gestor = document.querySelector('nav').innerHTML.indexOf("showScreen('ferramentas'") !== -1;
        currentViewMode = 'professor';
        try { renderProfessorPanel(); } catch (e) {}
        r.telaAntes = !!document.getElementById('ferramentas');
        return r;
    });
    ok('botao Ferramentas no menu do professor', menus.professor);
    ok('botao Ferramentas no menu do AEE', menus.aee);
    ok('botao Ferramentas no menu do projeto', menus.projeto);
    ok('botao Ferramentas no menu do gestor', menus.gestor);
    ok('a tela nao existe antes de ser pedida', menus.telaAntes === false);

    // -----------------------------------------------------------------------
    console.log('\n2. As abas');
    // -----------------------------------------------------------------------
    const abas = await page.evaluate(() => {
        showScreen('ferramentas');
        const quadro = document.getElementById('ferramentas');
        const botoes = Array.from(document.querySelectorAll('#navFerramentas .ferr-nav-btn'));
        const visiveis = () => Array.from(document.querySelectorAll('#ferramentas .ferramentas-tab'))
            .filter(t => t.style.display !== 'none').map(t => t.id);
        const r = {
            criada: !!quadro,
            ativa: !!quadro && quadro.classList.contains('active'),
            abas: botoes.map(b => b.dataset.aba),
            rotulos: botoes.map(b => b.textContent.trim()),
            umaVisivelNoInicio: visiveis(),
            marcadaNoInicio: (botoes.find(b => b.classList.contains('active')) || {}).dataset
        };
        showFerramentasTab('ampliar');
        r.depoisDeTrocar = visiveis();
        r.marcadaDepois = (Array.from(document.querySelectorAll('#navFerramentas .ferr-nav-btn'))
            .find(b => b.classList.contains('active')) || {}).dataset.aba;
        showFerramentasTab('pdf');
        r.voltouParaPdf = visiveis();
        return r;
    });
    ok('a tela de Ferramentas nasceu e ficou ativa', abas.criada && abas.ativa);
    ok('tem as duas abas, PDF e Ampliar', JSON.stringify(abas.abas) === '["pdf","ampliar"]', abas.rotulos.join(' | '));
    ok('so uma aba aparece por vez', abas.umaVisivelNoInicio.length === 1 && abas.depoisDeTrocar.length === 1);
    ok('abre na aba de PDF', abas.umaVisivelNoInicio[0] === 'tabFerramentasPdf');
    ok('trocar para Ampliar troca o conteudo', abas.depoisDeTrocar[0] === 'tabFerramentasAmpliar');
    ok('e marca a aba certa no menu', abas.marcadaDepois === 'ampliar');
    ok('e da para voltar para PDF', abas.voltouParaPdf[0] === 'tabFerramentasPdf');

    // -----------------------------------------------------------------------
    console.log('\n3. O atalho antigo showScreen(\'pdf\')');
    // -----------------------------------------------------------------------
    const atalho = await page.evaluate(() => {
        showFerramentasTab('ampliar');        // sai da aba de PDF de proposito
        showScreen('pdf');                    // o atalho de quem tem o link guardado
        const tela = document.getElementById('pdf');
        const abaPdf = document.getElementById('tabFerramentasPdf');
        const quadro = document.getElementById('ferramentas');
        return {
            quadroAtivo: !!quadro && quadro.classList.contains('active'),
            dentroDaAba: !!abaPdf && !!tela && abaPdf.contains(tela),
            abaVisivel: !!abaPdf && abaPdf.style.display !== 'none',
            catalogoMontado: !!tela && tela.querySelectorAll('#pdfGrade button').length,
            totalNoCatalogo: (window.CATALOGO_PDF || []).length,
            avisoDePrivacidade: !!tela && tela.innerHTML.indexOf('não sai deste aparelho') !== -1
        };
    });
    ok('o atalho abre a tela de Ferramentas', atalho.quadroAtivo);
    ok('a tela de PDF mora dentro da aba de PDF', atalho.dentroDaAba);
    ok('e o atalho deixa essa aba aberta', atalho.abaVisivel);
    ok('o catalogo inteiro continua montado', atalho.catalogoMontado === atalho.totalNoCatalogo,
       atalho.catalogoMontado + ' de ' + atalho.totalNoCatalogo);
    ok('o aviso de privacidade continua na tela de PDF', atalho.avisoDePrivacidade);

    // -----------------------------------------------------------------------
    console.log('\n4. A aba Ampliar: abrir a imagem');
    // -----------------------------------------------------------------------
    const png = await page.evaluate(DESENHAR_PNG, { largura: 120, altura: 90 });
    const bytes = Buffer.from(png.split(',')[1], 'base64');

    await page.evaluate(() => { showScreen('ferramentas'); showFerramentasTab('ampliar'); });
    const semImagem = await page.evaluate(() => {
        const aba = document.getElementById('tabFerramentasAmpliar');
        return {
            temTitulo: aba.innerHTML.indexOf('Ampliar imagem') !== -1,
            avisoDePrivacidade: aba.innerHTML.indexOf('não sai deste aparelho') !== -1,
            areaDeSoltar: !!aba.querySelector('.amp-solta'),
            campoDeArquivo: !!document.getElementById('ampArquivo')
        };
    });
    ok('a aba Ampliar se apresenta', semImagem.temTitulo);
    ok('com o mesmo aviso de privacidade da aba de PDF', semImagem.avisoDePrivacidade);
    ok('tem area para arrastar e campo de arquivo', semImagem.areaDeSoltar && semImagem.campoDeArquivo);

    await page.setInputFiles('#ampArquivo', { name: 'ficha.png', mimeType: 'image/png', buffer: bytes });
    await page.waitForTimeout(400);

    const comImagem = await page.evaluate(() => {
        const aba = document.getElementById('tabFerramentasAmpliar');
        const texto = aba.textContent;
        const botoesEscala = Array.from(aba.querySelectorAll('button'))
            .filter(b => /^\d+x$/.test(b.textContent.trim()));
        return {
            nome: texto.indexOf('ficha.png') !== -1,
            tamanhoDaOrigem: texto.indexOf('120 × 90 px') !== -1,
            previsaoDaSaida: texto.indexOf('240 × 180 px') !== -1,
            escalas: botoesEscala.map(b => b.textContent.trim()),
            escalaAtiva: (botoesEscala.find(b => b.classList.contains('amp-ativa')) || {}).textContent,
            temBotaoAmpliar: Array.from(aba.querySelectorAll('button')).some(b => /Ampliar/.test(b.textContent)),
            temMotorIA: texto.indexOf('IA') !== -1,
            temNitido: texto.indexOf('Nítido') !== -1
        };
    });
    ok('a imagem escolhida aparece pelo nome', comImagem.nome);
    ok('o tamanho de origem e lido do arquivo', comImagem.tamanhoDaOrigem);
    ok('e a tela ja diz de que tamanho vai sair', comImagem.previsaoDaSaida);
    ok('as quatro escalas sao oferecidas', JSON.stringify(comImagem.escalas) === '["1x","2x","4x","8x"]');
    ok('2x vem escolhido', (comImagem.escalaAtiva || '').trim() === '2x');
    ok('os dois motores aparecem', comImagem.temNitido && comImagem.temMotorIA);
    ok('tem botao de ampliar', comImagem.temBotaoAmpliar);

    // -----------------------------------------------------------------------
    console.log('\n5. O portao do plano Professor');
    // -----------------------------------------------------------------------
    const portao = await page.evaluate(async () => {
        const r = { premiumAntes: ehPremium() };
        await ampExecutar();
        for (let i = 0; i < 40 && !(document.getElementById('conteudoModalApoie') || {}).innerHTML; i++) {
            await new Promise(ok => setTimeout(ok, 50));
        }
        r.convidouAAssinar = !!document.getElementById('modalApoie') &&
                             document.getElementById('modalApoie').innerHTML.indexOf('plano Professor') !== -1;
        r.naoProduziuNada = document.getElementById('tabFerramentasAmpliar').textContent.indexOf('Pronto') === -1;
        closeModal('modalApoie');
        return r;
    });
    ok('conta gratuita nao e premium', portao.premiumAntes === false);
    ok('conta gratuita recebe o convite do plano', portao.convidouAAssinar);
    ok('e nada e ampliado sem assinar', portao.naoProduziuNada);

    // -----------------------------------------------------------------------
    console.log('\n6. Ampliar de verdade');
    // -----------------------------------------------------------------------
    const antesDeAmpliar = pedidos.length;
    const resultado = await page.evaluate(async () => {
        currentUser.role = 'super_admin';          // o super admin tem plano Professor
        const r = { premium: ehPremium() };
        ampDefinir('escala', 2);
        ampDefinir('ruido', 2);
        ampDefinir('nitidez', 2);
        ampDefinir('motor', 'nitido');
        const comecou = Date.now();
        await ampExecutar();
        r.segundos = (Date.now() - comecou) / 1000;

        const aba = document.getElementById('tabFerramentasAmpliar');
        const texto = aba.textContent;
        const depois = document.getElementById('ampImagemDepois');
        const cortina = document.getElementById('ampCortina');
        r.dizPronto = texto.indexOf('Pronto') !== -1;
        r.tamanhoDoResultado = texto.indexOf('240 × 180 px') !== -1;
        r.temBotaoBaixar = Array.from(aba.querySelectorAll('button')).some(b => /Baixar/.test(b.textContent));
        r.temComparacao = !!depois && !!cortina && !!document.getElementById('ampComparar');
        r.resultadoEBlobLocal = !!depois && depois.src.indexOf('blob:') === 0;

        // O arquivo de verdade: lido de volta do <canvas> para conferir que a imagem
        // ampliada tem mesmo o dobro do tamanho e nao e' uma tela em branco.
        const im = new Image();
        await new Promise((ok, falha) => { im.onload = ok; im.onerror = falha; im.src = depois.src; });
        r.larguraReal = im.naturalWidth;
        r.alturaReal = im.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
        canvas.getContext('2d').drawImage(im, 0, 0);
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let min = 255, max = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i] < min) min = d[i]; if (d[i] > max) max = d[i]; }
        r.temContraste = (max - min) > 100;        // nao e' uma tela lisa
        r.alfaCheio = d[3] === 255;
        return r;
    });
    ok('a conta com direito e premium', resultado.premium === true);
    ok('o resultado e anunciado', resultado.dizPronto);
    ok('com o tamanho certo escrito na tela', resultado.tamanhoDoResultado);
    ok('e o arquivo tem mesmo o dobro de cada lado',
       resultado.larguraReal === 240 && resultado.alturaReal === 180,
       resultado.larguraReal + 'x' + resultado.alturaReal);
    ok('a imagem ampliada tem conteudo (nao e uma tela lisa)', resultado.temContraste);
    ok('tem botao de baixar', resultado.temBotaoBaixar);
    ok('e a comparacao antes/depois esta montada', resultado.temComparacao);
    ok('o resultado e um blob local, nao um link de servidor', resultado.resultadoEBlobLocal);
    console.log('  (ampliou 120x90 -> 240x180 em ' + resultado.segundos.toFixed(2) + 's)');

    // -----------------------------------------------------------------------
    console.log('\n7. Desistir no meio');
    // -----------------------------------------------------------------------
    // A ampliacao pesada pode levar minutos (principalmente no motor de IA). Sem um jeito
    // de desistir, o professor fica preso olhando uma barra — e desistir NAO pode virar
    // uma tarja vermelha de erro, que o acusaria de ter quebrado alguma coisa.
    const desistencia = await page.evaluate(async () => {
        ampDefinir('escala', 8);
        ampDefinir('ruido', 3);
        ampDefinir('nitidez', 3);
        ampDefinir('motor', 'nitido');

        const trabalho = ampExecutar();
        await new Promise(ok => setTimeout(ok, 10));
        const aba = document.getElementById('tabFerramentasAmpliar');
        const botao = Array.from(aba.querySelectorAll('button')).find(b => /Cancelar/.test(b.textContent));
        const tinhaBotao = !!botao;
        if (botao) botao.click();
        await trabalho;

        const texto = document.getElementById('tabFerramentasAmpliar').textContent;
        return {
            tinhaBotao: tinhaBotao,
            avisou: texto.indexOf('cancelada') !== -1,
            semTarjaDeErro: texto.indexOf('⚠️') === -1,
            semResultado: !document.getElementById('ampImagemDepois'),
            destravou: texto.indexOf('Trabalhando') === -1
        };
    });
    ok('o botao Cancelar aparece enquanto trabalha', desistencia.tinhaBotao);
    ok('cancelar interrompe e avisa', desistencia.avisou);
    ok('desistir NAO vira tarja de erro', desistencia.semTarjaDeErro);
    ok('e nao sobra resultado pela metade', desistencia.semResultado);
    ok('a tela volta a aceitar comando', desistencia.destravou);

    // -----------------------------------------------------------------------
    console.log('\n8. Os limites');
    // -----------------------------------------------------------------------
    await page.evaluate(() => { ampTrocarImagem(); });
    await page.waitForTimeout(150);
    await page.setInputFiles('#ampArquivo', { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('isto nao e uma imagem') });
    await page.waitForTimeout(300);
    const recusa = await page.evaluate(() => {
        const texto = document.getElementById('tabFerramentasAmpliar').textContent;
        return { explicou: texto.indexOf('não parece uma imagem') !== -1,
                 naoAbriuControles: texto.indexOf('Quanto ampliar') === -1 };
    });
    ok('arquivo que nao e imagem e recusado com explicacao', recusa.explicou);
    ok('e os controles nao abrem para ele', recusa.naoAbriuControles);

    const grande = await page.evaluate(DESENHAR_PNG, { largura: 2400, altura: 1800 });
    await page.setInputFiles('#ampArquivo',
        { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(grande.split(',')[1], 'base64') });
    await page.waitForTimeout(600);
    const limites = await page.evaluate(() => {
        const aba = document.getElementById('tabFerramentasAmpliar');
        const escalas = Array.from(aba.querySelectorAll('button')).filter(b => /^\d+x$/.test(b.textContent.trim()));
        return {
            abriu: aba.textContent.indexOf('2400 × 1800 px') !== -1,
            desabilitadas: escalas.filter(b => b.disabled).map(b => b.textContent.trim()),
            habilitadas: escalas.filter(b => !b.disabled).map(b => b.textContent.trim())
        };
    });
    ok('a foto grande abre normalmente', limites.abriu);
    ok('as ampliacoes que nao cabem na memoria ficam desabilitadas', limites.desabilitadas.length > 0,
       'desabilitadas: ' + limites.desabilitadas.join(', ') + ' | livres: ' + limites.habilitadas.join(', '));
    ok('mas sempre sobra pelo menos uma escolha', limites.habilitadas.length > 0);

    // -----------------------------------------------------------------------
    console.log('\n9. A promessa: a imagem nao sai do aparelho');
    // -----------------------------------------------------------------------
    const origem = new URL(base);
    const paraFora = pedidos.slice(antesDeAmpliar).filter(u => {
        // blob: e data: nao sao rede — sao a memoria do proprio aparelho.
        if (/^(blob|data|filesystem):/.test(u)) return false;
        try { return new URL(u).hostname !== origem.hostname; } catch (_) { return false; }
    });
    ok('o motor "Nitido" nao faz pedido de rede nenhum — nem para CDN', paraFora.length === 0,
       paraFora.slice(0, 5).join(', '));
    const envios = await page.evaluate(() => window.__enviosDeSaida || []);
    ok('nenhum POST/PUT/beacon partiu da pagina', envios.length === 0, envios.slice(0, 5).join(' | '));

    await browser.close();

    console.log('\n' + (falhas.length
        ? '❌ ' + falhas.length + ' FALHA(S):\n  - ' + falhas.join('\n  - ')
        : '✅ TUDO CERTO: a tela Ferramentas e a aba Ampliar se comportam.'));
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
