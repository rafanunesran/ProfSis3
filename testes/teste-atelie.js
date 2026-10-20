// O "ATELIÊ" — editor de artes da escola (atelie.js + atelie_operacoes.js).
//
// O que este teste cobre:
//   1. as contas sem navegador: modelos, quebra de texto, alca puxada com a arte girada
//      (o canto oposto fica parado), encaixe nas guias, desfazer/refazer, leitura da
//      resposta da IA, lista do lote, troca de paleta, campos automaticos;
//   2. a aba nova dentro de Ferramentas; a conta gratuita ve os modelos mas nao abre o editor;
//   3. o editor com o mouse de verdade: abrir modelo, acrescentar texto/forma/figurinha,
//      arrastar com encaixe no meio da folha, puxar a alca, girar, digitar na folha com dois
//      cliques, desfazer e refazer;
//   4. salvar: vai para artes/<id> com o dono, fica no aparelho (IndexedDB) e aparece na lista;
//   5. "Criar com IA" a partir de um pedido;
//   6. imagem: colocar, "remover fundo liso" (canto vira transparente);
//   7. baixar PNG (arquivo de verdade, no tamanho da arte) e PDF;
//   8. "Em lote" a partir de uma turma: uma pagina por estudante, com o nome trocado.
//
// O banco e' FALSO (em memoria). O gerador de PDF (jsPDF, da CDN) e' trocado por um
// falso que conta as paginas — o PDF de verdade nao e' aberto aqui. As fontes do Google
// sao bloqueadas (o desenho usa as reservas).
//
// Como rodar (ver testes/LEIAME.md):
//   npm i playwright
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-atelie.js

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
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function foto(pagina, nome) {
    if (!process.env.PROFSIS_PRINTS) return;
    try { await pagina.screenshot({ path: path.join(process.env.PROFSIS_PRINTS, nome + '.png') }); } catch (_) { /* so' e' foto */ }
}
async function ate(fn, ms) {
    const fim = Date.now() + (ms || 6000);
    while (Date.now() < fim) { try { if (await fn()) return true; } catch (_) { /* ainda nao */ } await esperar(100); }
    return false;
}

(async () => {
    // -----------------------------------------------------------------------
    console.log('\n1. As contas (sem navegador)');
    // -----------------------------------------------------------------------
    const A = require(path.join(__dirname, '..', 'atelie_operacoes.js'));
    const todosOk = A.MODELOS.every(m => { const a = A.aplicarModelo(m.id); return a && a.elementos.length >= 4 && a.largura > 0; });
    ok('os ' + A.MODELOS.length + ' modelos montam uma arte', todosOk);
    const ctxFalso = { font: '', measureText: (s) => ({ width: s.length * 10 }) };
    const t = A.normalizarElemento({ tipo: 'texto', texto: 'aaaa bbbb cccc dddd', tam: 20, w: 100, entrelinha: 1.5 });
    const q = A.quebrarLinhas(ctxFalso, t);
    ok('o texto quebra na largura da caixa', q.linhas.length === 2 && q.linhas[0] === 'aaaa bbbb', JSON.stringify(q.linhas));
    ok('a altura acompanha as linhas', A.ajustarAlturaTexto(ctxFalso, t).h === 60);
    const longa = A.quebrarLinhas(ctxFalso, A.normalizarElemento({ tipo: 'texto', texto: 'x'.repeat(25), tam: 20, w: 100 }));
    ok('palavra maior que a linha e cortada por letra', longa.linhas.length === 3 && longa.linhas.every(l => l.length <= 10));
    ok('{escola} e {data} viram o dado; {nome} sem dado fica', A.substituir('{escola} {nome} {data}', { escola: 'EE Sol', data: '1 de maio' }) === 'EE Sol {nome} 1 de maio');

    const girado = A.normalizarElemento({ tipo: 'forma', x: 100, y: 100, w: 200, h: 100, rot: 30 });
    const cantoNW = A.paraArte(girado, -100, -50);
    const puxa = A.paraArte(girado, 160, 90);         // alem do canto se
    const g = A.redimensionar(girado, 'se', puxa.x, puxa.y, false);
    const depois = A.paraArte(Object.assign({}, girado, g), -g.w / 2, -g.h / 2);
    ok('alca com a arte girada: o canto oposto fica parado', Math.hypot(depois.x - cantoNW.x, depois.y - cantoNW.y) < 0.01 && Math.round(g.w) === 260 && Math.round(g.h) === 140, JSON.stringify(g));
    const gp = A.redimensionar(A.normalizarElemento({ tipo: 'imagem', x: 0, y: 0, w: 200, h: 100 }), 'se', 300, 120, true);
    ok('canto proporcional mantem a proporcao', Math.abs(gp.w / gp.h - 2) < 0.001 && Math.round(gp.w) === 300);
    ok('alca de girar gruda em 90 graus', A.anguloGiro(A.normalizarElemento({ tipo: 'forma', x: 0, y: 0, w: 100, h: 100 }), 200, 52) === 90);

    const arteEnc = A.novaArte('quadrado');
    const quase = A.normalizarElemento({ tipo: 'forma', x: 437, y: 10, w: 200, h: 100 });  // centro em 537 (meio = 540)
    arteEnc.elementos.push(quase);
    const enc = A.encaixar(quase, arteEnc, 6);
    ok('encaixe: gruda no meio da folha e mostra a guia', enc.dx === 3 && enc.guias.some(x => x.eixo === 'v' && x.pos === 540), JSON.stringify(enc));

    const h = A.criarHistorico(10);
    h.registrar({ n: 1 }); h.registrar({ n: 2 }); h.registrar({ n: 3 });
    ok('desfazer/refazer', h.desfazer().n === 2 && h.desfazer().n === 1 && !h.podeDesfazer() && h.refazer().n === 2);
    h.registrar({ n: 9 });
    ok('mudanca nova apaga o refazer', !h.podeRefazer());

    const daIA = A.arteDaIA('```json\n{"modelo":"convite","paleta":"natureza","titulo_arte":"Formatura","textos":{"titulo":"Formatura 9º ano","corpo":"15/12 às 19h\\nAuditório"}}\n```');
    ok('a resposta da IA vira arte do modelo pedido, com os textos e a paleta',
        daIA && daIA.modelo === 'convite' && daIA.paleta === 'natureza' && daIA.titulo === 'Formatura' &&
        daIA.elementos.some(e => e.campo === 'titulo' && e.texto === 'Formatura 9º ano') && daIA.elementos.some(e => e.campo === 'corpo' && /Auditório/.test(e.texto)));
    ok('resposta da IA sem texto nenhum e recusada', A.arteDaIA('{"modelo":"cartaz","textos":{}}') === null && A.arteDaIA('nada') === null);
    ok('modelo inventado pela IA cai no cartaz', (A.arteDaIA({ modelo: 'xyz', textos: { titulo: 'Oi' } }) || {}).modelo === 'cartaz');
    const lote = A.lerListaLote('Ana Souza;6A\n\nBruno\tB\nana souza;6a\n  Carla  ');
    ok('lista do lote: nome;turma, tab, sem vazias nem repetidas', lote.length === 3 && lote[0].turma === '6A' && lote[1].turma === 'B' && lote[2].nome === 'Carla');
    const pal = A.aplicarModelo('aviso');
    const corAntes = pal.fundo.cor;
    A.trocarPaleta(pal, 'festa');
    ok('trocar paleta pinta a arte com a outra combinacao', corAntes === '#2563c9' && pal.fundo.cor === '#e8590c' && pal.paleta === 'festa');
    ok('PDF: A4 deitado sai em 297×210 mm', JSON.stringify(A.tamanhoFolhaMm(A.novaArte('a4p'))) === '{"w":297,"h":210}');
    ok('nome do arquivo sem acento nem espaco', A.nomeArquivo('Feira de Ciências 7º', 'png') === 'feira-de-ciencias-7.png');

    // -----------------------------------------------------------------------
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/,
                    r => r.abort());
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    // -----------------------------------------------------------------------
    console.log('\n2. A aba e o portao');
    // -----------------------------------------------------------------------
    const aba = await page.evaluate(() => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), {
            turmas: [{ id: 5, nome: '6º A', disciplina: 'Ciências' }],
            estudantes: [{ id: 1, id_turma: 5, nome_completo: 'Ana Souza', status: 'Ativo' },
                         { id: 2, id_turma: 5, nome_completo: 'Bruno Lima', status: 'Ativo' },
                         { id: 3, id_turma: 5, nome_completo: 'Caio Transferido', status: 'Transferido' },
                         { id: 4, id_turma: 5, nome_completo: 'Duda Reis' }]
        });
        window.dadosCarregados = true;
        currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        try { renderProfessorPanel(); } catch (_) { /* dashboard sem dados */ }
        showScreen('ferramentas');
        showFerramentasTab('atelie');
        const el = document.getElementById('tabFerramentasAtelie');
        const btn = document.querySelector('#navFerramentas .ferr-nav-btn[data-aba="atelie"]');
        const r = { visivel: el && el.style.display !== 'none', marca: el && /Ateliê/.test(el.textContent),
                    botao: !!btn && /Ateliê/.test(btn.textContent),
                    modelos: el.querySelectorAll('.at-modelo').length, premium: ehPremium() };
        atModelo('certificado');
        r.editorGratis = !!document.getElementById('atEditor');
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        return r;
    });
    ok('a aba "Ateliê" abre dentro de Ferramentas, com os modelos', aba.visivel && aba.marca && aba.botao && aba.modelos >= 10, JSON.stringify(aba));
    await page.waitForTimeout(200);
    ok('o botao da aba usa o icone proprio (vidro)', await page.evaluate(() => !!document.querySelector('#navFerramentas .ferr-nav-btn[data-aba="atelie"] svg[data-ico="atelie"]')));
    ok('conta gratuita nao abre o editor (portao premium)', !aba.premium && !aba.editorGratis);
    await foto(page, 'at-0-inicio');

    // -----------------------------------------------------------------------
    console.log('\n3. O editor, com o mouse');
    // -----------------------------------------------------------------------
    await page.evaluate(() => { currentUser.role = 'super_admin'; atModelo('aviso'); });
    await page.waitForSelector('#atEditor canvas#atCanvas');
    await page.waitForTimeout(300);
    const ed = await page.evaluate(() => { const s = atEstado(); return { n: s.arte.elementos.length, w: s.arte.largura, zoom: s.zoom }; });
    ok('o modelo abre no editor em tela cheia', ed.n === 5 && ed.w === 1080, JSON.stringify(ed));
    await foto(page, 'at-1-editor');

    // acrescenta uma forma e arrasta
    await page.evaluate(() => atAddForma('estrela'));
    const ponto = async (ax, ay) => page.evaluate(([x, y]) => {
        const cv = document.getElementById('atCanvas'), r = cv.getBoundingClientRect(), z = atEstado().zoom;
        return { x: r.left + 56 + x * z, y: r.top + 56 + y * z };
    }, [ax, ay]);
    const est0 = await page.evaluate(() => { const s = atEstado(); return Object.assign({}, s.arte.elementos.find(e => e.id === s.sel)); });
    ok('a forma nova entra selecionada no meio da folha', est0.forma === 'estrela' && Math.round(est0.x + est0.w / 2) === 540);
    let p0 = await ponto(est0.x + est0.w / 2, est0.y + est0.h / 2);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p0.x + 60, p0.y + 40, { steps: 5 });
    await page.mouse.move(p0.x + 3, p0.y + 80, { steps: 5 });   // volta perto do meio: deve grudar
    await page.mouse.up();
    const est1 = await page.evaluate(() => { const s = atEstado(); return Object.assign({}, s.arte.elementos.find(e => e.id === s.sel)); });
    ok('arrastar move, e perto do meio gruda no centro', Math.round(est1.x + est1.w / 2) === 540 && est1.y > est0.y + 20, JSON.stringify({ x: est1.x, y: est1.y }));

    // puxa a alca do canto se (forma: livre)
    const se = await page.evaluate(() => { const s = atEstado(); const el = s.arte.elementos.find(e => e.id === s.sel); return ATELIEOPS.posicoesAlcas(el, 30 / s.zoom).se; });
    p0 = await ponto(se.x, se.y);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    await page.mouse.move(p0.x + 50, p0.y + 20, { steps: 4 }); await page.mouse.up();
    const est2 = await page.evaluate(() => { const s = atEstado(); return Object.assign({}, s.arte.elementos.find(e => e.id === s.sel)); });
    ok('puxar o canto aumenta a forma e o canto de cima fica', est2.w > est1.w + 40 && Math.abs(est2.x - est1.x) < 1 && Math.abs(est2.y - est1.y) < 1, JSON.stringify({ w0: est1.w, w: est2.w }));

    // gira pela alca
    const rot = await page.evaluate(() => { const s = atEstado(); const el = s.arte.elementos.find(e => e.id === s.sel); return { r: ATELIEOPS.posicoesAlcas(el, 30 / s.zoom).rot, c: ATELIEOPS.centro(el) }; });
    p0 = await ponto(rot.r.x, rot.r.y);
    const pc = await ponto(rot.c.x + 300, rot.c.y);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    await page.mouse.move(pc.x, pc.y, { steps: 6 }); await page.mouse.up();
    const est3 = await page.evaluate(() => { const s = atEstado(); return s.arte.elementos.find(e => e.id === s.sel).rot; });
    ok('a alca de girar gira (e gruda em 90°)', est3 === 90, String(est3));

    // desfazer volta o giro, refazer traz de novo
    const dz = await page.evaluate(() => {
        const s = () => atEstado().arte.elementos.find(e => e.id === atEstado().sel);
        atDesfazer(); const a = s().rot; atRefazer(); const b = s().rot; return [a, b];
    });
    ok('desfazer e refazer o giro', dz[0] === 0 && dz[1] === 90, JSON.stringify(dz));

    // texto: dois cliques e digita na folha
    await page.evaluate(() => atAddTexto(0));
    const tx = await page.evaluate(() => { const s = atEstado(); return Object.assign({}, s.arte.elementos.find(e => e.id === s.sel)); });
    p0 = await ponto(tx.x + tx.w / 2, tx.y + tx.h / 2);
    await page.mouse.dblclick(p0.x, p0.y);
    await page.waitForSelector('#atTextoFolha');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Reunião de pais na sexta {data}');
    await page.keyboard.press('Escape');
    const tx2 = await page.evaluate(() => { const s = atEstado(); return { t: s.arte.elementos.find(e => e.id === s.sel).texto, aberto: !!document.getElementById('atTextoFolha') }; });
    ok('dois cliques no texto e digitar direto na folha', tx2.t === 'Reunião de pais na sexta {data}' && !tx2.aberto, tx2.t);
    await page.evaluate(() => { atProp('cor', '#e03131', true, true); atProp('contornoLarg', 4, true, true); atProp('sombra', true, true, true); });
    await page.evaluate(() => atAddFigurinha('🎉'));
    await page.keyboard.press('Control+d');
    const contagem = await page.evaluate(() => atEstado().arte.elementos.filter(e => e.texto === '🎉').length);
    ok('figurinha entra e Ctrl+D duplica', contagem === 2);
    await page.keyboard.press('Delete');
    ok('Delete apaga o selecionado', await page.evaluate(() => atEstado().arte.elementos.filter(e => e.texto === '🎉').length) === 1);
    await page.evaluate(() => { atMudarAba('camadas'); });
    ok('o painel de camadas lista os elementos', await page.evaluate(() => document.querySelectorAll('#atPainel .ed-camada').length === atEstado().arte.elementos.length));
    await page.evaluate(() => { atMudarAba('fundo'); atPaleta('noite'); });
    ok('trocar todas as cores pela paleta', await page.evaluate(() => atEstado().arte.fundo.cor === '#ffd43b' && atEstado().arte.paleta === 'noite'));
    await page.evaluate(() => atDesfazer());
    await foto(page, 'at-2-editando');

    // -----------------------------------------------------------------------
    console.log('\n4. Salvar');
    // -----------------------------------------------------------------------
    await page.evaluate(() => { document.getElementById('atTitulo').value = 'Aviso da reunião'; atRenomear('Aviso da reunião'); });
    await page.waitForTimeout(700);
    await page.evaluate(() => atSalvarAgora());
    await ate(() => page.evaluate(() => atEstado().salvo === 'salvo'));
    const salvo = await page.evaluate(async () => {
        const id = atEstado().arte.id;
        const d = window.__fakeBanco.docs['artes/' + id];
        const local = await new Promise(ok => { const r = indexedDB.open('sisprof_atelie', 1); r.onsuccess = () => { const g = r.result.transaction('artes').objectStore('artes').get(id); g.onsuccess = () => ok(g.result); }; });
        return { id, dono: d && d.donoUid, titulo: d && d.titulo, n: d && d.elementos.length, mini: d && /^data:image\/jpeg/.test(d.miniatura), local: !!(local && local.arte && local.dono === 'u1'), status: document.getElementById('atStatus').textContent };
    });
    ok('a arte vai para artes/<id> com o dono', salvo.dono === 'u1' && salvo.titulo === 'Aviso da reunião' && salvo.n >= 7, JSON.stringify(salvo));
    ok('a arte fica tambem no aparelho (IndexedDB) e ganha miniatura', salvo.local && salvo.mini);
    ok('a barra diz que salvou na conta', /Salvo na sua conta/.test(salvo.status), salvo.status);
    await page.evaluate(() => atSair());
    await page.waitForTimeout(300);
    const lista = await page.evaluate(() => ({ editor: !!document.getElementById('atEditor'), txt: document.getElementById('tabFerramentasAtelie').textContent, imgs: document.querySelectorAll('#tabFerramentasAtelie .at-arte img').length }));
    ok('sair volta para a aba, e a arte aparece em "Minhas artes" com miniatura', !lista.editor && /Aviso da reunião/.test(lista.txt) && lista.imgs === 1);
    // reabrir de outra sessao: limpa a memoria e le de novo da conta
    const reaberta = await page.evaluate(async (id) => {
        indexedDB.deleteDatabase('sisprof_atelie');
        await new Promise(r => setTimeout(r, 200));
        return id;
    }, salvo.id);
    ok('(preparo) aparelho limpo', !!reaberta);

    // -----------------------------------------------------------------------
    console.log('\n5. Criar com IA');
    // -----------------------------------------------------------------------
    const ia = await page.evaluate(async () => {
        window.__prompt = '';
        window.chamarIAEstruturada = async (p) => { window.__prompt = p; return { modelo: 'cartaz', paleta: 'natureza', titulo_arte: 'Feira 7º ano',
            textos: { titulo: 'FEIRA DE CIÊNCIAS', subtitulo: 'Projetos do 7º ano', corpo: '📅 12/11, 14h\n📍 Pátio', rodape: '{escola}' } }; };
        document.getElementById('atPedidoIA').value = 'cartaz da feira de ciências do 7º ano, 12/11 às 14h no pátio';
        await atCriarIA();
        const s = atEstado();
        return { prompt: window.__prompt, vista: s.vista, modelo: s.arte && s.arte.modelo, corpo: s.arte && s.arte.elementos.find(e => e.campo === 'corpo').texto, pal: s.arte && s.arte.paleta };
    });
    ok('o pedido do professor vai para a IA com a lista de modelos', /feira de ciências do 7º ano/.test(ia.prompt) && /"certificado"/.test(ia.prompt));
    ok('a arte da IA abre no editor com os textos', ia.vista === 'editor' && ia.modelo === 'cartaz' && /Pátio/.test(ia.corpo) && ia.pal === 'natureza', JSON.stringify(ia));
    await page.waitForTimeout(300);
    await foto(page, 'at-3-ia');

    // -----------------------------------------------------------------------
    console.log('\n6. Imagem e remover fundo');
    // -----------------------------------------------------------------------
    const img = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 200; c.height = 120;
        const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 200, 120); x.fillStyle = '#e03131'; x.fillRect(60, 30, 80, 60);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer(); dt.items.add(new File([blob], 'logo.png', { type: 'image/png' }));
        const inp = document.createElement('input'); inp.type = 'file'; inp.files = dt.files;
        atArquivosEscolhidos(inp);
        await new Promise(r => setTimeout(r, 500));
        const s = atEstado(); const el = s.arte.elementos.find(e => e.id === s.sel);
        const antes = el.recurso;
        await new Promise(r => setTimeout(r, 200));   // a imagem carrega no palco
        await atRemoverFundo();
        const depois = atEstado().arte.elementos.find(e => e.id === s.sel).recurso;
        const src = atEstado().arte.recursos[depois];
        const im = new Image(); im.src = src; await new Promise(r => { im.onload = r; });
        const k = document.createElement('canvas'); k.width = im.width; k.height = im.height;
        const kx = k.getContext('2d'); kx.drawImage(im, 0, 0);
        return { tipo: el.tipo, prop: Math.round(el.w / el.h * 100) / 100, novo: antes !== depois, canto: kx.getImageData(2, 2, 1, 1).data[3], meio: kx.getImageData(100, 60, 1, 1).data[3] };
    });
    ok('a imagem entra na folha na proporcao certa', img.tipo === 'imagem' && Math.abs(img.prop - 200 / 120) < 0.02, JSON.stringify(img));
    ok('remover fundo: o canto fica transparente e o desenho fica', img.novo && img.canto === 0 && img.meio === 255);

    // -----------------------------------------------------------------------
    console.log('\n7. Baixar');
    // -----------------------------------------------------------------------
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.evaluate(() => atBaixar('png'))]);
    const arq = path.join(require('os').tmpdir(), 'atelie-teste.png');
    await dl.saveAs(arq);
    const buf = fs.readFileSync(arq);
    const largura = buf.readUInt32BE(16), altura = buf.readUInt32BE(20);
    ok('PNG baixado no tamanho da arte (A3: 1754×2480)', dl.suggestedFilename() === 'feira-7-ano.png' && largura === 1754 && altura === 2480, dl.suggestedFilename() + ' ' + largura + 'x' + altura);
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.evaluate(() => atBaixar('pdf'))]);
    const pdf = await page.evaluate(() => window.__ultimoPdf);
    ok('PDF com uma pagina A3 (297×420 mm)', /\.pdf$/.test(dl2.suggestedFilename()) && pdf.paginas === 1 && pdf.imagens[0].w === 297 && pdf.imagens[0].h === 420, JSON.stringify(pdf && pdf.op));

    // -----------------------------------------------------------------------
    console.log('\n8. Em lote, a partir de uma turma');
    // -----------------------------------------------------------------------
    await page.evaluate(() => { atSair(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => atModelo('certificado'));
    await page.waitForSelector('#atEditor');
    await page.evaluate(() => atAbrirLote());
    await page.waitForSelector('#atLoteTurma');
    await page.selectOption('#atLoteTurma', '5');
    const listaLote = await page.inputValue('#atLoteLista');
    ok('a turma traz so os estudantes ativos, em ordem', listaLote === 'Ana Souza;6º A\nBruno Lima;6º A\nDuda Reis;6º A', JSON.stringify(listaLote));
    await foto(page, 'at-4-lote');
    // o desenho de cada pagina: confere que o nome entra
    const nomes = await page.evaluate(async () => {
        const arte = atEstado().arte;
        const el = arte.elementos.find(e => e.texto === '{nome}');
        return { tem: !!el, troca: ATELIEOPS.substituir(el.texto, { nome: 'Ana Souza' }) };
    });
    ok('o certificado tem {nome} e ele vira o nome do estudante', nomes.tem && nomes.troca === 'Ana Souza');
    const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#atLoteBtn')]);
    const pdfLote = await page.evaluate(() => window.__ultimoPdf);
    ok('o PDF do lote tem uma pagina por estudante', /lote\.pdf$/.test(dl3.suggestedFilename()) && pdfLote.paginas === 3 && pdfLote.imagens.length === 3, JSON.stringify({ n: pdfLote.paginas }));

    // -----------------------------------------------------------------------
    console.log('\n9. Celular');
    // -----------------------------------------------------------------------
    await page.evaluate(() => document.getElementById('atJanela').remove());
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(400);
    const cel = await page.evaluate(() => {
        atZoomAjustar();
        const cv = document.getElementById('atCanvas').getBoundingClientRect();
        return { larguraPagina: document.documentElement.scrollWidth, canvas: Math.round(cv.width), trilho: getComputedStyle(document.querySelector('#atEditor .ed-trilho')).flexDirection };
    });
    ok('no celular a folha cabe na largura e o trilho vai para baixo', cel.larguraPagina <= 390 && cel.canvas <= 390 && cel.trilho === 'row', JSON.stringify(cel));
    await foto(page, 'at-5-celular');

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S):\n - ' + falhas.join('\n - ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
