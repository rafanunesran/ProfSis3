// Início do professor: relógio (fuso de São Paulo) e tempo da cidade da escola (Open-Meteo).
//
// O que este teste cobre:
//   1. a faixa fica entre a saudação e os atalhos, com o relógio à esquerda do tempo;
//   2. o relógio mostra a hora de São Paulo e anda;
//   3. com a cidade da gestão (Configurações → Feriados), mostra temperatura, máx/mín, chuva
//      e 3 dias; só o nome da cidade e as coordenadas vão para o Open-Meteo;
//   4. sem cidade, aviso discreto; com o Open-Meteo fora do ar, aviso sem quebrar a página;
//   5. a cidade sai do fim do endereço ("..., Osasco – SP");
//   6. no celular, nada passa da largura da tela.
// O Open-Meteo é respondido pelo próprio teste (não precisa de internet).
//
// Como rodar (ver testes/LEIAME.md):
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-inicio-clima.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FAKE = fs.readFileSync(path.join(__dirname, 'teste-tutoriais.js'), 'utf8').match(/const FAKE = (\(\) => \{[\s\S]*?\n\};)/)[1].replace(/;$/, '');

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}

const GEO = { results: [
    { name: 'Osasco', latitude: 1, longitude: 1, admin1: 'Rio Grande do Sul' },
    { name: 'Osasco', latitude: -23.5325, longitude: -46.7917, admin1: 'São Paulo' }
] };
const PREV = {
    current: { temperature_2m: 23.6, apparent_temperature: 24, weather_code: 2, is_day: 0 },
    daily: { time: ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'], weather_code: [2, 61, 0, 95],
        temperature_2m_max: [28.2, 25.1, 30.4, 27], temperature_2m_min: [17.8, 18, 19.2, 20], precipitation_probability_max: [40, 80, 5, 70] }
};

async function abrir(browser, viewport, opcoes) {
    const ctx = await browser.newContext({ viewport });
    await ctx.route(/(gstatic\.com|googleapis\.com|accounts\.google\.com|googletagmanager|google-analytics|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/, r => r.abort());
    const pedidos = [];
    await ctx.route(/open-meteo\.com/, r => {
        pedidos.push(r.request().url());
        if (opcoes.foraDoAr) return r.fulfill({ status: 503, body: 'fora' });
        const geo = /geocoding/.test(r.request().url());
        r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(geo ? GEO : PREV) });
    });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => { falhas.push('erro de JS: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript('(' + FAKE + ')()');
    await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await page.evaluate(async (cidade) => {
        await window.firebase.firestore().collection('app_data').doc('app_data_school_77_gestor').set(
            cidade ? { turmas: [], escolaCidade: cidade, escolaUF: 'SP' } : { turmas: [] });
        currentUser = { id: 1, uid: 'u1', nome: 'Rafael Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [{ id: 5, nome: '7A', disciplina: 'Arte' }], configBimestres: [] });
        window.dadosCarregados = true; currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        renderProfessorPanel();
    }, opcoes.cidade);
    await page.waitForTimeout(1500);
    return { ctx, page, pedidos };
}

(async () => {
    const browser = await chromium.launch(process.env.PROFSIS_CHROMIUM ? { executablePath: process.env.PROFSIS_CHROMIUM } : {});
    const fotos = process.env.PROFSIS_FOTOS || '/tmp';

    console.log('\n1 a 3. Computador, com cidade');
    let { ctx, page, pedidos } = await abrir(browser, { width: 1600, height: 900 }, { cidade: 'Osasco' });
    const pos = await page.evaluate(() => {
        const r = s => document.querySelector('#dashboard .ux-inicio ' + s).getBoundingClientRect();
        return { ola: r('.ux-inicio-ola'), relogio: r('.ux-relogio'), clima: r('.ux-clima'), atalhos: r('.ux-inicio-bloco') };
    });
    ok('faixa entre a saudação e os atalhos', pos.ola.right <= pos.relogio.left && pos.clima.right <= pos.atalhos.left, JSON.stringify([pos.ola.right, pos.relogio.left, pos.clima.right, pos.atalhos.left]));
    ok('relógio à esquerda do tempo', pos.relogio.right <= pos.clima.left);
    const hora = await page.locator('.ux-relogio').innerText();
    const esperado = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    ok('relógio na hora de São Paulo', hora.replace(/\s/g, '').startsWith(esperado), hora + ' / ' + esperado);
    const s1 = await page.locator('.ux-relogio-seg').innerText();
    await page.waitForTimeout(1200);
    ok('relógio anda', s1 !== await page.locator('.ux-relogio-seg').innerText());
    const clima = (await page.locator('.ux-clima').innerText()).replace(/\s+/g, ' ');
    ok('temperatura atual', /24°/.test(clima), clima);
    ok('descrição e cidade', /Parcialmente nublado · Osasco/.test(clima));
    ok('máx, mín e chuva de hoje', /Máx 28° · Mín 18° · Chuva 40%/.test(clima));
    ok('3 próximos dias', await page.locator('.ux-clima-dias li').count() === 3);
    const prev = pedidos.find(u => /forecast/.test(u)) || '';
    ok('escolheu a Osasco de SP (coordenadas certas)', /latitude=-23\.5325/.test(prev), prev);
    ok('para o Open-Meteo só vai cidade e coordenadas', pedidos.every(u => !/Rafael|m@e\.com|7A/.test(decodeURIComponent(u))));
    await page.screenshot({ path: path.join(fotos, 'inicio-clima-computador.png'), clip: { x: 0, y: 0, width: 1600, height: 330 } });
    const n = pedidos.length;
    await page.evaluate(() => renderProfessorPanel());
    await page.waitForTimeout(800);
    ok('redesenhar usa o que já foi buscado (sem novo pedido)', pedidos.length === n, pedidos.length + ' x ' + n);
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(fotos, 'inicio-clima-notebook.png'), clip: { x: 0, y: 0, width: 1180, height: 400 } });
    await ctx.close();

    console.log('\n4. Sem cidade e fora do ar');
    ({ ctx, page } = await abrir(browser, { width: 1366, height: 900 }, { cidade: '' }));
    ok('sem cidade: aviso discreto', /gestão ainda não informou a cidade/.test(await page.locator('.ux-clima').innerText()));
    ok('sem cidade: relógio continua', /\d\d:\d\d/.test(await page.locator('.ux-relogio').innerText()));
    await ctx.close();
    ({ ctx, page } = await abrir(browser, { width: 1366, height: 900 }, { cidade: 'Campinas', foraDoAr: true }));
    ok('fora do ar: aviso', /Não foi possível ver o tempo agora/.test(await page.locator('.ux-clima').innerText()));
    ok('fora do ar: atalhos continuam', await page.locator('#dashboard .ux-chip').count() >= 1);

    console.log('\n5. Cidade a partir do endereço');
    const casos = await page.evaluate(() => [
        'Av. Prof. Lourenço Filho, 560 – Jd. Elvira, Osasco – SP',
        'Rua A, 10 - Centro - Campinas/SP - CEP 13010-000',
        'Rua B, 20, Vila Nova, São José dos Campos, SP',
        'Rua sem cidade, 30'
    ].map(e => JSON.stringify(uxClima.cidadeDoEndereco(e))));
    ok('"..., Osasco – SP"', casos[0] === '{"cidade":"Osasco","uf":"SP"}', casos[0]);
    ok('"Centro - Campinas/SP - CEP"', casos[1] === '{"cidade":"Campinas","uf":"SP"}', casos[1]);
    ok('"..., São José dos Campos, SP"', casos[2] === '{"cidade":"São José dos Campos","uf":"SP"}', casos[2]);
    ok('sem cidade devolve nada', casos[3] === 'null', casos[3]);
    await ctx.close();

    console.log('\n6. Celular');
    ({ ctx, page } = await abrir(browser, { width: 390, height: 844 }, { cidade: 'Osasco' }));
    const larg = await page.evaluate(() => {
        const sec = document.querySelector('#dashboard .ux-inicio');
        const passa = Array.from(sec.querySelectorAll('*')).filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className);
        return { passa, rolagem: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    ok('nada passa da tela', !larg.passa.length, larg.passa.join(','));
    const ordem = await page.evaluate(() => ['.ux-inicio-ola', '.ux-inicio-tempo', '.ux-inicio-bloco'].map(s => document.querySelector('#dashboard ' + s).getBoundingClientRect().top));
    ok('saudação, depois tempo, depois atalhos', ordem[0] < ordem[1] && ordem[1] < ordem[2], ordem.join(','));
    const sec = await page.locator('#dashboard .ux-inicio').boundingBox();
    await page.screenshot({ path: path.join(fotos, 'inicio-clima-celular.png'), clip: { x: 0, y: 0, width: 390, height: Math.min(844, sec.y + sec.height + 16) } });
    await ctx.close();

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})();
