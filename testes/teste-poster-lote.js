// A aba Pôster em LOTE: varias imagens, a mesma configuracao, um PDF so'.
//
// O que este teste cobre:
//   1. o campo aceita varias imagens de uma vez; o arquivo que nao e' imagem fica de fora
//      com o nome dele no aviso, e as outras entram;
//   2. a tela mostra o lote (miniaturas, "Lote: N imagens", total de folhas) e a previa
//      troca de imagem ao clicar na miniatura; o "x" tira uma do lote;
//   3. todas saem do MESMO tamanho (a mesma largura pedida), cada uma na sua proporcao;
//   4. o PDF tem as folhas de todas as imagens, em ordem, e o nome diz que e' um lote;
//   5. modo foto com pouca resolucao: a tela avisa que vai a 300 DPI, e a imagem que vai
//      para o PDF tem MESMO os pixels de 300 DPI (contra ~150 com a opcao desligada);
//   6. o icone do Poster nao e' mais o mesmo desenho do icone de Imagem.
//
// Como rodar (ver testes/LEIAME.md):
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-poster-lote.js
//
// A parte do PDF PRECISA de internet: o pdf-lib vem do CDN. Atras de proxy, use
// PROFSIS_PROXY=http://host:porta.

const { chromium } = require('playwright');

const FAKE = () => {
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

const DESENHAR_PNG = ({ largura, altura, cor }) => {
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.fillStyle = cor;
    for (let x = 0; x < largura / 2; x += 4) ctx.fillRect(x, 0, 2, altura);
    ctx.beginPath(); ctx.arc(largura * 0.72, altura * 0.6, Math.min(largura, altura) * 0.2, 0, Math.PI * 2); ctx.fill();
    return canvas.toDataURL('image/png');
};

(async () => {
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
    if (process.env.PROFSIS_PROXY) {
        opcoes.proxy = { server: process.env.PROFSIS_PROXY, bypass: 'localhost,127.0.0.1,::1' };
    }
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com)/,
                    r => r.abort());
    const page = await ctx.newPage();
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof getInitialData === 'function' && typeof showFerramentasTab === 'function',
                               null, { timeout: 60000 });
    await page.waitForTimeout(1800);

    await page.evaluate(() => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'super_admin', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [] });
        window.dadosCarregados = true;
        currentViewMode = 'professor';
        try { renderProfessorPanel(); } catch (e) {}
        showScreen('ferramentas');
        showFerramentasTab('poster');
    });

    // -----------------------------------------------------------------------
    console.log('\n1. Varias imagens de uma vez');
    // -----------------------------------------------------------------------
    const png = async (largura, altura, cor) => Buffer.from(
        (await page.evaluate(DESENHAR_PNG, { largura, altura, cor })).split(',')[1], 'base64');
    const multiplo = await page.evaluate(() => document.getElementById('posArquivo').multiple);
    ok('o campo de arquivo aceita varias imagens', multiplo);

    await page.setInputFiles('#posArquivo', [
        { name: 'deitada.png', mimeType: 'image/png', buffer: await png(400, 300, '#1a365d') },
        { name: 'em-pe.png', mimeType: 'image/png', buffer: await png(300, 400, '#9b2c2c') },
        { name: 'lista.txt', mimeType: 'text/plain', buffer: Buffer.from('nao sou imagem') },
        { name: 'quadrada.png', mimeType: 'image/png', buffer: await png(200, 200, '#22543d') }
    ]);
    await page.waitForTimeout(600);

    const tela = await page.evaluate(() => {
        posDefinir('papel', 'A4');
        posDefinir('orientacao', 'retrato');
        posDefinir('modo', 'folhas');
        posDefinir('folhas', 2);
        posDefinir('eixo', 'largura');
        posDefinir('estilo', 'pontos');
        posDefinir('passo', 16);
        const aba = document.getElementById('tabFerramentasPoster');
        return {
            texto: aba.textContent.replace(/\s+/g, ' '),
            miniaturas: aba.querySelectorAll('.pos-mini').length,
            campoNaTela: !!document.getElementById('posArquivo')
        };
    });
    ok('as tres imagens entraram no lote', tela.miniaturas === 3, tela.miniaturas + ' miniaturas');
    ok('o arquivo que nao e imagem foi recusado, com o nome dele', /lista\.txt/.test(tela.texto) && /não parece uma imagem/.test(tela.texto));
    ok('a tela diz o tamanho do lote', /Lote: 3 imagens/.test(tela.texto));
    ok('da para somar mais imagens com o lote aberto', tela.campoNaTela && /Adicionar imagens/.test(tela.texto));

    // -----------------------------------------------------------------------
    console.log('\n2. Mesmo tamanho para todas');
    // -----------------------------------------------------------------------
    const tamanhos = await page.evaluate(() => {
        const planos = [[400, 300], [300, 400], [200, 200]].map(([l, a]) => POSTEROPS.planejarPoster({
            larguraOrigem: l, alturaOrigem: a, papel: 'A4', orientacao: 'retrato',
            margem: POSTEROPS.PT_POR_CM, sobreposicao: 0, modo: 'folhas', folhas: 2, eixo: 'largura'
        }));
        const texto = document.getElementById('tabFerramentasPoster').textContent.replace(/\s+/g, ' ');
        const total = planos.reduce((t, p) => t + p.total, 0);
        return {
            larguras: planos.map(p => p.posterLarguraCm.toFixed(1)),
            alturas: planos.map(p => p.posterAlturaCm.toFixed(1)),
            total: total,
            totalNaTela: new RegExp(total + ' folhas no total').test(texto)
        };
    });
    ok('todas com a mesma largura', new Set(tamanhos.larguras).size === 1, tamanhos.larguras.join(' / ') + ' cm');
    ok('cada uma na sua proporcao (alturas diferentes)', new Set(tamanhos.alturas).size === 3, tamanhos.alturas.join(' / ') + ' cm');
    ok('a tela soma as folhas do lote', tamanhos.totalNaTela, tamanhos.total + ' folhas');

    // -----------------------------------------------------------------------
    console.log('\n3. Previa, trocar e tirar');
    // -----------------------------------------------------------------------
    const navega = await page.evaluate(() => {
        document.querySelectorAll('.pos-mini')[1].click();
        const aba = document.getElementById('tabFerramentasPoster');
        const r = {
            segunda: /2\/3 · em-pe\.png/.test(aba.textContent.replace(/\s+/g, ' ')),
            ativa: aba.querySelectorAll('.pos-mini')[1].classList.contains('pos-ativa'),
            previa: !!document.getElementById('posPrevia') && document.getElementById('posPrevia').height >
                    document.getElementById('posPrevia').width
        };
        aba.querySelectorAll('.pos-mini-tira')[2].click();     // tira a quadrada
        r.restam = aba.querySelectorAll('.pos-mini').length;
        r.textoDepois = aba.textContent.replace(/\s+/g, ' ');
        return r;
    });
    ok('clicar na miniatura mostra aquela imagem', navega.segunda && navega.ativa);
    ok('e a previa e a dela (em pe)', navega.previa);
    ok('o "x" tira a imagem do lote', navega.restam === 2 && /Lote: 2 imagens/.test(navega.textoDepois));

    // -----------------------------------------------------------------------
    console.log('\n4. Um PDF so\', com as folhas de todas');
    // -----------------------------------------------------------------------
    const pdf = await page.evaluate(async () => {
        await posGerar();
        const aba = document.getElementById('tabFerramentasPoster');
        const texto = aba.textContent.replace(/\s+/g, ' ');
        const link = document.getElementById('posBaixar');
        if (!link) return { erro: texto.slice(texto.indexOf('⚠️'), texto.indexOf('⚠️') + 200) || 'sem link' };
        const bytes = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
        const PDFLib = await PDFOPS.lib.pdfLib();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const esperado = [[400, 300], [300, 400]].reduce((t, [l, a]) => t + POSTEROPS.planejarPoster({
            larguraOrigem: l, alturaOrigem: a, papel: 'A4', orientacao: 'retrato',
            margem: POSTEROPS.PT_POR_CM, sobreposicao: 0, modo: 'folhas', folhas: 2, eixo: 'largura'
        }).total, 0);
        return {
            paginas: doc.getPageCount(), esperado: esperado,
            todasA4: doc.getPages().every(p => Math.round(p.getWidth()) === 595 && Math.round(p.getHeight()) === 842),
            nome: link.getAttribute('download'),
            texto: texto
        };
    });
    ok('o PDF do lote e montado', !pdf.erro, pdf.erro || '');
    ok('com as folhas de todas as imagens', pdf.paginas === pdf.esperado, pdf.paginas + ' paginas, esperado ' + pdf.esperado);
    ok('todas as paginas no mesmo papel', pdf.todasA4);
    ok('o nome do arquivo diz que e um lote', /posteres-2-imagens\.pdf$/.test(pdf.nome || ''), pdf.nome);
    ok('a tela lista cada imagem do lote', /deitada\.png/.test(pdf.texto || '') && /em-pe\.png/.test(pdf.texto || ''));

    // -----------------------------------------------------------------------
    console.log('\n5. Foto com pouca resolucao sai em 300 DPI');
    // -----------------------------------------------------------------------
    // A largura em pixels da imagem embutida na 1a pagina, lida do dicionario do
    // XObject (o pdf-lib grava o cabecalho das imagens sem compressao).
    const larguraEmbutida = async () => page.evaluate(async () => {
        const link = document.getElementById('posBaixar');
        if (!link) return { erro: 'sem PDF' };
        const bytes = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
        let texto = '';
        for (let i = 0; i < bytes.length; i += 65536) texto += String.fromCharCode.apply(null, bytes.subarray(i, i + 65536));
        const m = /\/Subtype\s*\/Image[\s\S]{0,300}?\/Width\s+(\d+)|\/Width\s+(\d+)[\s\S]{0,300}?\/Subtype\s*\/Image/.exec(texto);
        return { largura: m ? Number(m[1] || m[2]) : 0 };
    });

    const foto = await page.evaluate(async () => {
        posVerImagem(0);
        posDefinir('estilo', 'foto');
        posDefinir('auto300', true);
        const texto = document.getElementById('tabFerramentasPoster').textContent.replace(/\s+/g, ' ');
        const r = { avisa: /sai em 300 DPI/.test(texto), explica: /ampliada automaticamente para 300 DPI/.test(texto) };
        const t = Date.now();
        await posGerar();
        r.segundos = (Date.now() - t) / 1000;
        r.texto = document.getElementById('tabFerramentasPoster').textContent.replace(/\s+/g, ' ');
        return r;
    });
    ok('a tela avisa que a foto vai sair em 300 DPI', foto.avisa && foto.explica);
    ok('e o resultado diz que ampliou', /ampliada para 300 DPI/.test(foto.texto), foto.segundos.toFixed(1) + 's');
    const com300 = await larguraEmbutida();
    // A area util de uma folha A4 com 1 cm de margem tem 538,6 pt = 7,48 pol -> 2244 px a 300 DPI.
    ok('a imagem embutida tem os pixels de 300 DPI', com300.largura >= 2150 && com300.largura <= 2300,
       (com300.erro || com300.largura + ' px de largura'));

    await page.evaluate(async () => { posDefinir('auto300', false); await posGerar(); });
    const sem300 = await larguraEmbutida();
    ok('com a opcao desligada, fica como antes (~150 DPI)', sem300.largura > 1000 && sem300.largura < 1200,
       (sem300.erro || sem300.largura + ' px'));

    // -----------------------------------------------------------------------
    console.log('\n6. O icone do Poster');
    // -----------------------------------------------------------------------
    const icone = await page.evaluate(() => ({
        diferente: ICONES_SISPROF.poster.a !== ICONES_SISPROF.imagem.a && ICONES_SISPROF.poster.b !== ICONES_SISPROF.imagem.b,
        folhas: (ICONES_SISPROF.poster.b.match(/<rect/g) || []).length
    }));
    ok('o Poster tem icone proprio (nao o de Imagem)', icone.diferente);
    ok('e o desenho mostra a imagem dividida em folhas', icone.folhas === 4, icone.folhas + ' folhas');

    await browser.close();
    console.log(falhas.length ? '\n❌ ' + falhas.length + ' FALHA(S):\n  - ' + falhas.join('\n  - ')
                              : '\n✅ TUDO CERTO: o lote do pôster funciona.');
    process.exit(falhas.length ? 1 : 0);
})();
