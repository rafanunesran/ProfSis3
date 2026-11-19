// Aviso de endereço novo (SisProf -> EdiProf, github.io -> ediprof.vercel.app).
//
// O site é servido sob endereços "de mentira" (o Playwright atende github.io e vercel.app
// com os arquivos do localhost), para conferir:
//   1. no github.io aparece o cartão com o endereço novo e o botão "Ir para o EdiProf";
//   2. o cartão não cobre a tela (o resto do site continua clicável);
//   3. fechar guarda no aparelho: recarregando, não aparece de novo;
//   4. quem assina um plano vê o destaque de assinante (mesmo tendo fechado o aviso comum);
//   5. no ediprof.vercel.app não aparece; no app Android antigo (WebView no github.io) pede
//      para atualizar o app, e no app novo (que abre ediprof.vercel.app) não aparece;
//   6. o nome visível é EdiProf (título, marca do menu).
//
// Como rodar: python3 -m http.server 8877 --bind 127.0.0.1 &  e  node testes/teste-aviso-endereco.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FAKE = fs.readFileSync(path.join(__dirname, 'teste-tutoriais.js'), 'utf8').match(/const FAKE = (\(\) => \{[\s\S]*?\n\};)/)[1].replace(/;$/, '');
const LOCAL = process.env.PROFSIS_URL || 'http://localhost:8877';

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}

async function contexto(browser, opts) {
    const ctx = await browser.newContext(opts || {});
    await ctx.route(/(gstatic\.com|googleapis\.com|accounts\.google\.com|googletagmanager|google-analytics|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/, r => r.abort());
    // Os dois endereços públicos respondem com os arquivos locais.
    await ctx.route(/^https:\/\/(rafanunesran\.github\.io\/ProfSis3|ediprof\.vercel\.app)\//, async r => {
        const u = new URL(r.request().url());
        let p = u.pathname.replace(/^\/ProfSis3/, '');
        if (p === '/' || p === '') p = '/index.html';
        const resp = await r.fetch({ url: LOCAL + p });
        await r.fulfill({ response: resp });
    });
    await ctx.addInitScript('(' + FAKE + ')()');
    return ctx;
}

async function abrir(ctx, url) {
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => { falhas.push('erro de JS: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    return page;
}

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || undefined });
    const GH = 'https://rafanunesran.github.io/ProfSis3/';

    console.log('\n1. github.io: aviso aparece, não bloqueia e some depois de fechar');
    const ctx = await contexto(browser, { viewport: { width: 1280, height: 800 } });
    let page = await abrir(ctx, GH);
    ok('título da aba é EdiProf', (await page.title()) === 'EdiProf', await page.title());
    const aviso = page.locator('#avisoEndereco');
    ok('aviso aparece', await aviso.isVisible());
    ok('mostra o endereço novo', /ediprof\.vercel\.app/.test(await aviso.innerText()));
    ok('botão leva para https://ediprof.vercel.app/', (await page.locator('#avisoEndereco .ae-ir').getAttribute('href')) === 'https://ediprof.vercel.app/');
    ok('sem destaque de assinante para quem não entrou', (await page.locator('#avisoEndereco .ae-assinante').count()) === 0);
    const caixa = await aviso.boundingBox();
    ok('cartão pequeno, não cobre a tela', caixa && caixa.width < 500 && caixa.height < 500, JSON.stringify(caixa));
    const cobre = await page.evaluate(() => { const e = document.elementFromPoint(200, 200); return !!(e && e.closest('#avisoEndereco')); });
    ok('o resto da tela continua clicável', !cobre);
    await page.screenshot({ path: path.join(process.env.PROFSIS_FOTOS || '/tmp', 'aviso-endereco-computador.png') });
    await page.click('#avisoEndereco .ae-depois');
    ok('"Agora não" fecha', (await aviso.count()) === 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    ok('recarregando, não aparece de novo', (await page.locator('#avisoEndereco').count()) === 0);

    console.log('\n2. assinante vê o destaque mesmo já tendo fechado o aviso comum');
    await page.evaluate(() => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        window.planoDoUsuario = () => 'professor';
        verificarAvisoEndereco();
    });
    await page.waitForTimeout(400);
    ok('aviso de assinante aparece', await page.locator('#avisoEndereco .ae-assinante').isVisible());
    ok('diz que a assinatura continua valendo', /assinatura.*continua valendo/i.test(await page.locator('#avisoEndereco').innerText()));
    ok('oferece baixar a cópia de segurança', (await page.locator('#avisoEndereco .ae-copia').count()) === 1);
    await page.click('#avisoEndereco .ae-fechar');
    await page.evaluate(() => verificarAvisoEndereco());
    await page.waitForTimeout(300);
    ok('depois de fechado, assinante não vê de novo', (await page.locator('#avisoEndereco').count()) === 0);
    await ctx.close();

    console.log('\n3. celular no github.io');
    const ctxCel = await contexto(browser, { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    page = await abrir(ctxCel, GH);
    const cx = await page.locator('#avisoEndereco').boundingBox();
    ok('cabe na tela do celular', cx && cx.x >= 0 && cx.x + cx.width <= 390, JSON.stringify(cx));
    await page.screenshot({ path: path.join(process.env.PROFSIS_FOTOS || '/tmp', 'aviso-endereco-celular.png') });
    await ctxCel.close();

    console.log('\n4. ediprof.vercel.app e app Android: sem aviso');
    const ctxV = await contexto(browser);
    page = await abrir(ctxV, 'https://ediprof.vercel.app/');
    ok('no endereço novo não aparece', (await page.locator('#avisoEndereco').count()) === 0);
    ok('marca do menu diz EdiProf', await page.evaluate(() => !document.querySelector('.nav-marca-nome') || document.querySelector('.nav-marca-nome').textContent === 'EdiProf'));
    await ctxV.close();
    const ctxApk = await contexto(browser, { viewport: { width: 390, height: 780 }, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36' });
    page = await abrir(ctxApk, GH);
    ok('no app Android antigo (github.io por dentro) pede para atualizar o app', /Atualize o app/.test(await page.locator('#avisoEndereco').innerText()));
    await page.screenshot({ path: path.join(process.env.PROFSIS_FOTOS || '/tmp', 'aviso-endereco-app-antigo.png') });
    const ctxApkNovo = await contexto(browser, { viewport: { width: 390, height: 780 }, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36' });
    const pNovo = await abrir(ctxApkNovo, 'https://ediprof.vercel.app/');
    ok('no app Android novo (ediprof.vercel.app) não aparece', (await pNovo.locator('#avisoEndereco').count()) === 0);
    await ctxApkNovo.close();
    await ctxApk.close();

    await browser.close();
    console.log(falhas.length ? '\nFALHAS: ' + falhas.length : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
