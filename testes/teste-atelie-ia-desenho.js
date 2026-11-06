// ATELIÊ — DESENHOS E ATIVIDADES ADAPTADAS COM IA (atelie.js + atelie_operacoes.js +
// gerarImagemIA em ia_estagiario.js).
//
// O que este teste cobre:
//   1. sem navegador: o SVG da IA e' limpo (sem script/link/evento), a atividade vira folha
//      A4 que cabe na pagina, com numero, linhas, quadradinhos, pontos de ligar e figuras;
//   2. no navegador, com a IA FALSA:
//      - "🖍️ Desenho": a IA de imagem falha (como numa chave gratuita) e o desenho sai em
//        SVG pela IA de texto, numa folha A4 com o desenho;
//      - "📝 Atividade adaptada": a folha abre no editor e os emojis viram desenhos;
//      - "Imagens → Criar desenho com IA" dentro do editor, com a IA de imagem funcionando.
//   Nada aqui fala com IA de verdade (Gemini/OpenAI).
//
// Como rodar: python3 -m http.server 8877 --bind 127.0.0.1 &  e  node testes/teste-atelie-ia-desenho.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FAKE = () => {
    const B = window.__fakeBanco = { docs: {}, seq: 0 };
    const snapDoc = (p) => ({ id: p.split('/').pop(), exists: !!B.docs[p], data: () => B.docs[p] ? JSON.parse(JSON.stringify(B.docs[p])) : undefined });
    const refDoc = (p) => ({
        id: p.split('/').pop(),
        get: async () => snapDoc(p),
        set: async (o) => { B.docs[p] = JSON.parse(JSON.stringify(o)); },
        update: async (o) => { B.docs[p] = Object.assign({}, B.docs[p], o); },
        delete: async () => { delete B.docs[p]; },
        collection: (s) => refCol(p + '/' + s),
        onSnapshot: (cb) => { setTimeout(() => cb(snapDoc(p)), 0); return () => {}; }
    });
    const refCol = (c, f) => {
        f = f || [];
        const docs = () => Object.keys(B.docs).filter(p => p.startsWith(c + '/') && p.slice(c.length + 1).indexOf('/') < 0)
            .filter(p => f.every(([k, v]) => B.docs[p][k] === v)).map(snapDoc);
        return {
            doc: (id) => refDoc(c + '/' + (id || 'auto' + (++B.seq))),
            where: (k, op, v) => refCol(c, f.concat([[k, v]])),
            orderBy: () => refCol(c, f), limit: () => refCol(c, f),
            get: async () => { const d = docs(); return { docs: d, size: d.length, empty: !d.length, forEach: fn => d.forEach(fn) }; },
            add: async (o) => { const r = refDoc(c + '/auto' + (++B.seq)); await r.set(o); return r; },
            onSnapshot: (cb) => { setTimeout(() => cb({ docs: docs(), docChanges: () => [] }), 0); return () => {}; }
        };
    };
    const banco = { collection: (c) => refCol(c), batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }) };
    window.firebase = {
        initializeApp: () => {}, analytics: () => {},
        auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: (cb) => { setTimeout(() => cb(null), 0); return () => {}; }, signOut: async () => {} }),
        firestore: () => banco
    };
    window.firebase.firestore.FieldValue = { serverTimestamp: () => new Date(), arrayUnion: (...a) => a, delete: () => undefined };
    // jsPDF falso: conta paginas e imagens.
    window.jspdf = { jsPDF: function (op) {
        const pdf = { op, paginas: 1, imagens: [] };
        pdf.addPage = () => { pdf.paginas++; };
        pdf.addImage = (src, tipo, x, y, w, h) => { pdf.imagens.push({ tam: src.length, w, h }); };
        pdf.output = () => { window.__ultimoPdf = { paginas: pdf.paginas, imagens: pdf.imagens, op }; return new Blob(['%PDF-falso'], { type: 'application/pdf' }); };
        return pdf;
    } };
};


const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}
async function foto(pagina, nome) {
    if (!process.env.PROFSIS_PRINTS) return;
    try { await pagina.screenshot({ path: path.join(process.env.PROFSIS_PRINTS, nome + '.png') }); } catch (_) { /* so' e' foto */ }
}

const SVG_GATO = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script>' +
    '<circle cx="256" cy="280" r="160" fill="#ffffff" stroke="#000000" stroke-width="8"/>' +
    '<polygon points="130,170 170,40 230,130" fill="#ffffff" stroke="#000000" stroke-width="8"/>' +
    '<polygon points="282,130 342,40 382,170" fill="#ffffff" stroke="#000000" stroke-width="8"/>' +
    '<circle cx="200" cy="260" r="18" fill="#000000"/><circle cx="312" cy="260" r="18" fill="#000000"/>' +
    '<path d="M226 330 Q256 360 286 330" fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round"/>' +
    '<a href="https://mau.exemplo"><rect x="0" y="0" width="10" height="10"/></a><image href="https://x/y.png"/></svg>';

const ATIVIDADE = {
    titulo_arte: 'Frutas 1º ano', titulo: 'As frutas', comando: 'Leia com atenção e responda.',
    questoes: [
        { tipo: 'marcar', enunciado: 'Qual fruta é vermelha?', opcoes: ['Maçã', 'Banana', 'Uva verde'], figura: 'uma maçã vermelha', emoji: '🍎' },
        { tipo: 'ligar', enunciado: 'Ligue a fruta à sua cor.', pares: [['Banana', 'Amarela'], ['Uva', 'Roxa'], ['Laranja', 'Laranja']], figura: 'cacho de uvas', emoji: '🍇' },
        { tipo: 'escrever', enunciado: 'Escreva o nome da sua fruta favorita.', linhas: 2, emoji: '🍌' },
        { tipo: 'completar', enunciado: 'A ____ é amarela e comprida.' },
        { tipo: 'desenhar', enunciado: 'Desenhe uma fruta que você comeu hoje.', figura: 'uma cesta de frutas', emoji: '🧺' }
    ],
    gabarito: '1) Maçã. 2) Banana-amarela; Uva-roxa; Laranja-laranja. 4) banana.', dica_professor: 'Leia em voz alta com a turma.'
};

(async () => {
    const A = require(path.join(__dirname, '..', 'atelie_operacoes.js'));
    // -----------------------------------------------------------------------
    console.log('\n1. As contas (sem navegador)');
    // -----------------------------------------------------------------------
    const limpo = A.limparSvgDaIA('Aqui está: ' + SVG_GATO);
    ok('o SVG da IA fica sem script, evento, link e imagem de fora', limpo.startsWith('<svg') && !/script|onload|href|image|alert/i.test(limpo) && /<circle/.test(limpo) && /<path/.test(limpo), limpo.slice(0, 80));
    ok('SVG sem forma nenhuma e\' recusado', A.limparSvgDaIA('<svg><script>x</script></svg>') === '' && A.limparSvgDaIA('sem desenho') === '');
    ok('svgDaIA le o JSON {svg}', A.svgDaIA({ svg: SVG_GATO }) === limpo);
    ok('o prompt de colorir pede contorno preto e fundo branco', /contornos? pretos?/i.test(A.promptDesenhoImagem('gato', 'colorir')) && /fundo branco/.test(A.promptDesenhoImagem('gato', 'colorir')));
    const pr = A.promptAtividadeAdaptada('frutas, 1º ano', { perfil: 'alfabetizacao' });
    ok('o prompt da atividade leva o tema e a adaptação', /frutas, 1º ano/.test(pr) && /alfabetização/i.test(pr) && /no máximo 4 questões/.test(pr));
    for (const perfil of Object.keys(A.PERFIS_ADAPTACAO)) {
        const r = A.atividadeDaIA(ATIVIDADE, { perfil });
        const fim = Math.max(...r.arte.elementos.map(e => e.y + e.h));
        const dentro = r.arte.elementos.every(e => e.x >= 0 && e.x + e.w <= r.arte.largura + 1);
        ok('atividade "' + A.PERFIS_ADAPTACAO[perfil].nome + '": ' + r.questoes + ' questões, cabe na folha A4', r.arte.formato === 'a4r' && fim <= r.arte.altura && dentro && r.questoes >= 1 && r.questoes <= A.PERFIS_ADAPTACAO[perfil].max, 'fim=' + fim);
    }
    const r = A.atividadeDaIA(ATIVIDADE, { perfil: 'dua' });
    const nomes = r.arte.elementos.map(e => e.nome);
    ok('a folha tem nome/data, título e comando', nomes.includes('Nome e data') && r.arte.elementos.some(e => e.campo === 'titulo' && e.texto === 'As frutas') && r.arte.elementos.some(e => e.campo === 'subtitulo'));
    ok('marcar tem quadradinhos; ligar tem pontos; escrever tem linhas; desenhar tem caixa',
        nomes.filter(n => n === 'Quadradinho').length === 3 && nomes.filter(n => n === 'Ponto').length === 6 && nomes.filter(n => n === 'Linha de resposta').length === 2 && nomes.includes('Espaço para desenhar'));
    const dir = r.arte.elementos.filter(e => e.nome === 'Ligar (direita)').map(e => e.texto);
    ok('a coluna da direita do "ligar" vem embaralhada', dir.join() !== 'Amarela,Roxa,Laranja', dir.join());
    ok('as figuras com descrição viram pedidos de desenho', r.desenhos.length === 3 && r.desenhos[0].descricao === 'uma maçã vermelha' && r.arte.elementos.some(e => e.id === r.desenhos[0].elId && e.texto === '🍎'));
    ok('o gabarito volta à parte (não vai para a folha)', /Maçã/.test(r.gabarito) && !r.arte.elementos.some(e => /Banana-amarela/.test(e.texto || '')));
    ok('resposta sem questões e\' recusada', A.atividadeDaIA({ titulo: 'x', questoes: [] }) === null && A.atividadeDaIA('lixo') === null);
    const longa = Object.assign({}, ATIVIDADE, { questoes: Array.from({ length: 6 }, (_, i) => ({ tipo: 'escrever', linhas: 4, enunciado: 'Explique com suas palavras, em detalhes, o que acontece com a água do mar quando o sol esquenta muito durante o dia, questão ' + (i + 1), figura: 'sol', emoji: '☀️' })) });
    const rl = A.atividadeDaIA(longa, { perfil: 'dua' });
    ok('atividade grande demais: diminui a letra ou tira questões, mas cabe', Math.max(...rl.arte.elementos.map(e => e.y + e.h)) <= rl.arte.altura, rl.questoes + ' questões');

    // -----------------------------------------------------------------------
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium' };
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|generativelanguage\.googleapis\.com|api\.openai\.com)/,
                    rt => rt.abort());
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'super_admin', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [], estudantes: [] });
        window.dadosCarregados = true;
        currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        try { renderProfessorPanel(); } catch (_) { /* dashboard sem dados */ }
        showScreen('ferramentas');
        showFerramentasTab('atelie');
        window.__gerarImagemIAReal = window.gerarImagemIA;
    });

    // -----------------------------------------------------------------------
    console.log('\n2. "🖍️ Desenho" na página inicial (a IA de imagem falha → SVG)');
    // -----------------------------------------------------------------------
    const des = await page.evaluate(async (svg) => {
        window.__pedidos = [];
        window.gerarImagemIA = async (p) => { window.__pedidos.push(['imagem', p]); throw new Error('Quota exceeded (limit: 0)'); };
        window.chamarIAEstruturada = async (p) => { window.__pedidos.push(['texto', p]); return { svg }; };
        atMudarModoIA('desenho');
        const temEstilo = !!document.getElementById('atIAEstilo');
        document.getElementById('atPedidoIA').value = 'um gato sentado';
        document.getElementById('atIAEstilo').value = 'colorir';
        await atCriarIA();
        const s = atEstado();
        const img = s.arte && s.arte.elementos.find(e => e.tipo === 'imagem');
        const src = img && s.arte.recursos[img.recurso];
        return { temEstilo, vista: s.vista, formato: s.arte && s.arte.formato, img: !!img, png: /^data:image\/png/.test(src || ''), tam: (src || '').length,
                 pedidos: window.__pedidos.map(x => x[0]), aviso: document.querySelector('#atPainel .ed-ok') ? document.querySelector('#atPainel .ed-ok').textContent : '' };
    }, SVG_GATO);
    ok('o modo Desenho mostra a escolha de estilo', des.temEstilo);
    ok('tentou a IA de imagem e, sem acesso, desenhou em SVG pela IA de texto', des.pedidos.join() === 'imagem,texto', des.pedidos.join());
    ok('abre uma folha A4 com o desenho virado PNG', des.vista === 'editor' && des.formato === 'a4r' && des.img && des.png && des.tam > 2000, JSON.stringify(des).slice(0, 200));
    ok('o aviso explica que a chave não gera imagem', /não gera imagens/.test(des.aviso), des.aviso);
    await page.waitForTimeout(400);
    await foto(page, 'desenho-colorir');

    // -----------------------------------------------------------------------
    console.log('\n3. "📝 Atividade adaptada"');
    // -----------------------------------------------------------------------
    await page.evaluate(() => atSair && atSair());
    await page.waitForTimeout(300);
    const at = await page.evaluate(async ([atividade, svg]) => {
        window.__pedidos = [];
        window.gerarImagemIA = async (p) => { window.__pedidos.push(['imagem', p]); throw new Error('sem acesso'); };
        window.iaImagemDisponivel = () => true;
        window.chamarIAEstruturada = async (p) => { window.__pedidos.push(['texto', p]); return /SVG/.test(p) ? { svg } : atividade; };
        if (!document.getElementById('atPedidoIA')) renderAtelie();
        atMudarModoIA('atividade');
        const temPerfil = !!document.getElementById('atIAPerfil') && !!document.getElementById('atIAFiguras');
        document.getElementById('atPedidoIA').value = 'frutas e cores, 1º ano';
        document.getElementById('atIAPerfil').value = 'di';
        document.getElementById('atIAFiguras').value = 'colorir';
        await atCriarIA();
        // espera as figuras
        for (let i = 0; i < 100 && !/figura\(s\) desenhada|Não consegui desenhar/.test((document.querySelector('#atPainel .ed-ok') || {}).textContent || ''); i++) await new Promise(r => setTimeout(r, 100));
        const s = atEstado();
        const els = s.arte.elementos;
        const fim = Math.max(...els.map(e => e.y + e.h));
        return { temPerfil, vista: s.vista, titulo: (els.find(e => e.campo === 'titulo') || {}).texto, imagens: els.filter(e => e.tipo === 'imagem').length,
                 emojis: els.filter(e => /^Figura/.test(e.nome)).map(e => e.texto), fim, altura: s.arte.altura,
                 prompt: (window.__pedidos.find(x => x[0] === 'texto') || [])[1] || '',
                 aviso: (document.querySelector('#atPainel .ed-ok') || {}).textContent || '' };
    }, [ATIVIDADE, SVG_GATO]);
    ok('o modo Atividade mostra "Para quem" e "Figuras"', at.temPerfil);
    ok('o prompt leva a adaptação escolhida (deficiência intelectual)', /deficiência intelectual/i.test(at.prompt));
    ok('a folha abre no editor, com título, e cabe na página (medida no canvas de verdade)', at.vista === 'editor' && at.titulo === 'As frutas' && at.fim <= at.altura, JSON.stringify({ fim: at.fim, h: at.altura }));
    ok('as figuras com descrição viraram desenhos (DI: até 4 questões); a sem descrição fica emoji', at.imagens === 2 && at.emojis.join() === '🍌', JSON.stringify({ img: at.imagens, emojis: at.emojis }));
    ok('o gabarito e a dica aparecem no aviso do editor', /Gabarito: 1\) Maçã/.test(at.aviso) && /Dica:/.test(at.aviso) && /2 figura\(s\)/.test(at.aviso), at.aviso);
    await page.waitForTimeout(400);
    await foto(page, 'atividade-adaptada');

    // -----------------------------------------------------------------------
    console.log('\n4. Imagens → Criar desenho com IA (IA de imagem funcionando)');
    // -----------------------------------------------------------------------
    const ed = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 300; c.height = 200;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 200); x.fillStyle = '#2f9e44'; x.beginPath(); x.arc(150, 100, 80, 0, 7); x.fill();
        const png = c.toDataURL('image/png');
        window.__pedidos = [];
        window.gerarImagemIA = async (p) => { window.__pedidos.push(['imagem', p]); return { src: png, origem: 'gemini' }; };
        window.chamarIAEstruturada = async (p) => { window.__pedidos.push(['texto', p]); throw new Error('não devia chamar'); };
        atMudarAba('imagens');
        const temCaixa = !!document.getElementById('atIADesenhoPedido');
        const antes = atEstado().arte.elementos.filter(e => e.tipo === 'imagem').length;
        document.getElementById('atIADesenhoPedido').value = 'um sapo numa folha';
        document.getElementById('atIADesenhoEstilo').value = 'ilustracao';
        await atIADesenhar();
        const s = atEstado();
        const novo = s.arte.elementos.find(e => e.id === s.sel);
        return { temCaixa, antes, depois: s.arte.elementos.filter(e => e.tipo === 'imagem').length, sel: novo && novo.tipo, prop: novo ? novo.h / novo.w : 0,
                 pedidos: window.__pedidos.map(x => x[0]), prompt: (window.__pedidos[0] || [])[1] || '', msg: (document.getElementById('atIADesenhoMsg') || {}).textContent };
    });
    ok('a aba Imagens tem "Criar desenho com IA"', ed.temCaixa);
    ok('o desenho entra na arte aberta, selecionado, na proporção da imagem', ed.depois === ed.antes + 1 && ed.sel === 'imagem' && Math.abs(ed.prop - 2 / 3) < 0.02, JSON.stringify(ed).slice(0, 200));
    ok('usou só a IA de imagem, com o estilo colorido', ed.pedidos.join() === 'imagem' && /Ilustração colorida/.test(ed.prompt) && /Feito pela IA de imagem/.test(ed.msg));
    await foto(page, 'desenho-no-editor');

    // -----------------------------------------------------------------------
    console.log('\n5. Servidor de imagem próprio (gerarImagemIA de verdade, servidor FALSO)');
    // -----------------------------------------------------------------------
    let pedidoServidor = null;
    await page.route('https://img.teste.sisprof/**', async (rota) => {
        const req = rota.request();
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
        if (req.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors });
        pedidoServidor = { url: req.url(), auth: req.headers()['authorization'], corpo: JSON.parse(req.postData() || '{}') };
        if (req.headers()['authorization'] !== 'Bearer segredo') return rota.fulfill({ status: 401, headers: cors, body: 'chave errada' });
        // PNG 1x1 vermelho
        const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        return rota.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ created: 1, output_format: 'png', data: [{ b64_json: png }] }) });
    });
    const sv = await page.evaluate(async () => {
        const getDataOriginal = window.getData;
        const chamarOriginal = window.chamarIAEstruturada;
        const geradorFalso = window.gerarImagemIA;
        const resultado = {};
        try {
            window.gerarImagemIA = window.__gerarImagemIAReal;   // volta a funcao de verdade (ia_estagiario.js)
            let config = { apiKey: '', servidorImagemUrl: 'https://img.teste.sisprof/', servidorImagemChave: 'segredo', servidorImagemPassos: 2 };
            window.getData = async (c, d) => (c === 'system' && d === 'config_ia') ? config : getDataOriginal(c, d);
            window.chamarIAEstruturada = async (p) => /Translate to English/.test(p) ? { en: 'a frog sitting on a lily pad' } : { svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' };
            const r = await gerarImagemIA('pt', { promptIngles: async () => 'a frog sitting on a lily pad, coloring book page' });
            resultado.origem = r.origem; resultado.png = /^data:image\/png;base64,/.test(r.src);
            // criarDesenho pelo editor (traduz e manda o estilo em ingles)
            document.getElementById('atIADesenhoPedido').value = 'um sapo numa vitória-régia';
            document.getElementById('atIADesenhoEstilo').value = 'colorir';
            await atIADesenhar();
            resultado.msg = (document.getElementById('atIADesenhoMsg') || {}).textContent;
            // chave errada: cai no desenho em linhas, sem erro na tela
            config = Object.assign({}, config, { servidorImagemChave: 'errada' });
            document.getElementById('atIADesenhoPedido').value = 'um sapo';
            await atIADesenhar();
            resultado.msgErrada = (document.getElementById('atIADesenhoMsg') || {}).textContent;
        } finally {
            window.getData = getDataOriginal; window.chamarIAEstruturada = chamarOriginal; window.gerarImagemIA = geradorFalso;
        }
        return resultado;
    });
    ok('com servidor cadastrado, a imagem vem dele (PNG)', sv.origem === 'servidor' && sv.png, JSON.stringify(sv));
    ok('o pedido leva a chave, o tamanho 512 e os passos escolhidos', pedidoServidor && /\/v1\/images\/generations$/.test(pedidoServidor.url) && pedidoServidor.corpo.size === '512x512' && /"sample_steps":2/.test(pedidoServidor.corpo.prompt));
    ok('o Ateliê traduz o pedido para inglês e põe o estilo "coloring book"', /^a frog sitting on a lily pad, coloring book page for kids/.test((pedidoServidor && pedidoServidor.corpo.prompt) || '') && /servidor de imagem próprio/.test(sv.msg || ''), pedidoServidor && pedidoServidor.corpo.prompt.slice(0, 90));
    ok('chave errada: não trava, cai no desenho em linhas e diz que o servidor falhou', /desenho de linhas/.test(sv.msgErrada || '') && /servidor de imagem próprio não respondeu \(chave errada\)/.test(sv.msgErrada || '') && pedidoServidor.auth === 'Bearer errada', sv.msgErrada);

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S):\n - ' + falhas.join('\n - ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
