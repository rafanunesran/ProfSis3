// SERVIDOR DE IA PRÓPRIO (servidor-ia/servidor.py) + o app usando ele.
//
// A rede da escola limita o acesso à IA. Uma máquina do usuário (Oracle grátis) recebe o
// pedido, chama o Gemini com as chaves guardadas só nela e devolve o texto.
// Aqui o "Gemini" é um servidor falso local; o servidor.py é o de verdade (Python).
//
// Cobrimos:
//   1. /saude responde sem chave e conta as chaves do Gemini;
//   2. chave do app errada -> 401; site de fora (Origin) -> 403;
//   3. a chave do Gemini vai no cabeçalho (não na URL) e a 1ª chave com cota estourada
//      passa para a 2ª;
//   4. modelo aposentado: usa o substituto que o próprio Google indica;
//   5. no navegador (CORS de verdade), chamarIAEstruturada usa o servidor e NÃO chama o
//      Google direto, mesmo sem nenhuma chave no app;
//   6. servidor fora do ar + chave no app -> cai no caminho antigo (Google direto);
//   7. servidor fora do ar + sem chave -> erro claro dizendo que foi o servidor;
//   8. botão Testar do Super Admin: alcance + pedido.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SITE = process.env.PROFSIS_URL || 'http://127.0.0.1:8877';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';
const PORTA_IA = 7899, PORTA_GEMINI = 7898;

const falhas = [];
const ok = (nome, cond, extra) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome + (cond || !extra ? '' : '  → ' + extra)); if (!cond) falhas.push(nome); };
const espera = (ms) => new Promise(r => setTimeout(r, ms));

// --- Gemini falso ---
const pedidosGemini = [];
const gemini = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', c => corpo += c);
    req.on('end', () => {
        const chave = req.headers['x-goog-api-key'] || '';
        const modelo = (/models\/([^:]+):generateContent/.exec(req.url) || [])[1];
        pedidosGemini.push({ url: req.url, chave, modelo });
        const responder = (cod, obj) => { res.writeHead(cod, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (chave === 'AIzaRUIM') return responder(429, { error: { message: 'Quota exceeded' } });
        if (chave !== 'AIzaBOA') return responder(400, { error: { message: 'API key not valid' } });
        if (modelo === 'gemini-velho') return responder(404, { error: { message: 'models/gemini-velho is no longer available. Please update your code to use models/gemini-novo' } });
        const prompt = JSON.parse(corpo).contents[0].parts[0].text;
        responder(200, { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify({ ok: true, modelo, eco: prompt.slice(0, 20), frase: 'Olá' }) + '\n```' }] } }] });
    });
});

(async () => {
    await new Promise(r => gemini.listen(PORTA_GEMINI, '127.0.0.1', r));
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sisprof-ia-'));
    fs.writeFileSync(path.join(pasta, 'chave.txt'), 'segredo-app\n');
    fs.writeFileSync(path.join(pasta, 'chaves-gemini.txt'), '# comentário\nAIzaRUIM\n\nAIzaBOA  # a boa\n');
    const py = spawn('python3', [path.join(__dirname, '..', 'servidor-ia', 'servidor.py')], {
        env: Object.assign({}, process.env, {
            SISPROF_IA_PASTA: pasta, SISPROF_IA_PORTA: String(PORTA_IA),
            SISPROF_IA_ORIGENS: SITE + ',https://ediprof.vercel.app',
            SISPROF_IA_GEMINI_URL: 'http://127.0.0.1:' + PORTA_GEMINI
        }), stdio: ['ignore', 'inherit', 'pipe']
    });
    let logPy = ''; py.stderr.on('data', d => logPy += d);
    const IA = 'http://127.0.0.1:' + PORTA_IA;
    for (let i = 0; i < 50; i++) { try { await fetch(IA + '/saude'); break; } catch (_) { await espera(100); } }

    try {
        // 1
        const s = await (await fetch(IA + '/saude')).json();
        ok('/saude responde sem chave e conta 2 chaves (ignora comentário e linha vazia)', s.ok === true && s.chaves === 2, JSON.stringify(s));

        // 2
        const corpo = JSON.stringify({ prompt: 'Diga oi', modelos: ['gemini-x'] });
        let r = await fetch(IA + '/v1/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer errada' }, body: corpo });
        ok('chave do app errada -> 401', r.status === 401);
        r = await fetch(IA + '/v1/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer segredo-app', Origin: 'https://site-de-fora.com' }, body: corpo });
        ok('site de fora -> 403', r.status === 403);
        ok('nenhum pedido chegou ao Gemini até aqui', pedidosGemini.length === 0);

        // 3
        r = await fetch(IA + '/v1/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer segredo-app', Origin: 'https://ediprof.vercel.app' }, body: corpo });
        let j = await r.json();
        ok('pedido certo -> 200 com o texto da IA', r.status === 200 && /"ok": ?true/.test(j.texto) && j.modelo === 'gemini-x', JSON.stringify(j));
        ok('CORS devolve a origem do EdiProf', r.headers.get('access-control-allow-origin') === 'https://ediprof.vercel.app');
        ok('1ª chave (cota estourada) passou para a 2ª', pedidosGemini.map(p => p.chave).join(',') === 'AIzaRUIM,AIzaBOA', JSON.stringify(pedidosGemini));
        ok('a chave do Gemini vai no cabeçalho, nunca na URL', pedidosGemini.every(p => !/key=|AIza/.test(p.url)));

        // 4
        pedidosGemini.length = 0;
        r = await fetch(IA + '/v1/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer segredo-app' }, body: JSON.stringify({ prompt: 'x', modelos: ['gemini-velho'] }) });
        j = await r.json();
        ok('modelo aposentado: usa o substituto indicado (gemini-novo)', r.status === 200 && j.modelo === 'gemini-novo', JSON.stringify(j));

        // todas falham -> 502 com detalhes por chave (sem a chave inteira)
        fs.writeFileSync(path.join(pasta, 'chaves-gemini.txt'), 'AIzaRUIM\nAIzaOUTRA\n');
        r = await fetch(IA + '/v1/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer segredo-app' }, body: corpo });
        j = await r.json();
        ok('todas falham -> 502 com o erro de cada chave, só o fim da chave', r.status === 502 && j.detalhes.length === 2 && j.detalhes[0].chave === '…RUIM' && !JSON.stringify(j).includes('AIza'), JSON.stringify(j));
        fs.writeFileSync(path.join(pasta, 'chaves-gemini.txt'), 'AIzaBOA\n');

        // --- navegador ---
        const browser = await chromium.launch({ executablePath: CHROME });
        const page = await browser.newPage();
        const googleDireto = [];
        await page.route(/gstatic\.com|googleapis\.com\/(?!.*generateContent)/, rt => rt.abort());
        await page.route(/generativelanguage\.googleapis\.com/, rt => {
            googleDireto.push(rt.request().url());
            rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"direto": true}' }] } }] }) });
        });
        await page.goto(SITE + '/index.html', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof chamarIAEstruturada === 'function' && typeof listarModelosGemini === 'function', null, { timeout: 15000 });

        const rodar = (config) => page.evaluate(async (config) => {
            const orig = window.getData;
            window.getData = async (c, d) => (c === 'system' && d === 'config_ia') ? config : orig(c, d);
            try { return { ok: await chamarIAEstruturada('Gere um JSON') }; }
            catch (e) { return { erro: e.message }; }
            finally { window.getData = orig; }
        }, config);

        // 5
        pedidosGemini.length = 0;
        let res = await rodar({ apiKey: '', geminiModel: 'gemini-y', servidorIaUrl: IA + '/', servidorIaChave: 'segredo-app' });
        ok('navegador: usa o servidor (CORS ok), JSON já convertido, modelo do painel', res.ok && res.ok.ok === true && res.ok.modelo === 'gemini-y', JSON.stringify(res));
        ok('navegador: não chamou o Google direto', googleDireto.length === 0);

        // 6
        res = await rodar({ apiKey: 'AIzaNOAPP', servidorIaUrl: 'http://127.0.0.1:7897', servidorIaChave: 'segredo-app' });
        ok('servidor fora do ar + chave no app: cai no Google direto', res.ok && res.ok.direto === true && googleDireto.length > 0, JSON.stringify(res));

        // 7
        res = await rodar({ apiKey: '', servidorIaUrl: 'http://127.0.0.1:7897', servidorIaChave: 'segredo-app' });
        ok('servidor fora do ar + sem chave: erro claro do servidor', res.erro && /servidor de IA próprio/.test(res.erro) && /não conectou/.test(res.erro), res.erro);
        res = await rodar({ apiKey: '', servidorIaUrl: IA, servidorIaChave: 'errada' });
        ok('chave do servidor errada: erro diz isso', res.erro && /chave do servidor errada/.test(res.erro), res.erro);
        res = await rodar({ apiKey: '' });
        ok('sem servidor e sem chave: aviso antigo de sempre', res.erro && /chave da API não foi configurada/.test(res.erro), res.erro);

        // 8
        const teste = await page.evaluate(async (IA) => {
            document.body.insertAdjacentHTML('beforeend', '<input id="servidorIaUrlInput"><input id="servidorIaChaveInput"><div id="servidorIaTeste"></div>');
            const orig = window.getData;
            window.getData = async (c, d) => (c === 'system' && d === 'config_ia') ? {} : orig(c, d);
            const saida = {};
            try {
                document.getElementById('servidorIaUrlInput').value = 'http://x';
                await testarServidorIA(); saida.http = document.getElementById('servidorIaTeste').textContent;
                // o teste exige https; aqui o servidor é http local, então trocamos o fetch do endereço
                const fetchOrig = window.fetch;
                window.fetch = (u, o) => fetchOrig(String(u).replace('https://ia.teste', IA), o);
                document.getElementById('servidorIaUrlInput').value = 'https://ia.teste/';
                await testarServidorIA(); saida.semChave = document.getElementById('servidorIaTeste').textContent;
                document.getElementById('servidorIaChaveInput').value = 'segredo-app';
                await testarServidorIA(); saida.completo = document.getElementById('servidorIaTeste').textContent;
                document.getElementById('servidorIaUrlInput').value = 'https://fora.teste';
                window.fetch = (u, o) => /fora\.teste/.test(String(u)) ? Promise.reject(new TypeError('Failed to fetch')) : fetchOrig(u, o);
                await testarServidorIA(); saida.bloqueado = document.getElementById('servidorIaTeste').textContent;
                window.fetch = fetchOrig;
            } finally { window.getData = orig; }
            return saida;
        }, IA);
        ok('Testar: recusa endereço http', /https:\/\//.test(teste.http), teste.http);
        ok('Testar sem chave: confirma só o alcance', /Esta rede chega no servidor \(1 chave/.test(teste.semChave), teste.semChave);
        ok('Testar com chave: faz um pedido de verdade', /Funcionou em .* s \(modelo/.test(teste.completo) && /Olá/.test(teste.completo), teste.completo);
        ok('Testar com rede bloqueando: diz que a escola pode estar bloqueando', /não chegou no servidor/.test(teste.bloqueado) && /escola/.test(teste.bloqueado), teste.bloqueado);

        await browser.close();
    } finally {
        py.kill(); gemini.close();
        fs.rmSync(pasta, { recursive: true, force: true });
    }
    if (/Traceback/.test(logPy)) { console.log(logPy); falhas.push('erro no Python'); }
    console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S):\n - ' + falhas.join('\n - ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
