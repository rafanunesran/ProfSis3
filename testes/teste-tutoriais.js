// A tela TUTORIAIS e o botão "?" (tour na tela), no perfil professor.
//
// O que este teste cobre:
//   1. o menu do professor tem "Tutoriais" (grupo Recursos) e o topo tem o botão "?";
//   2. a tela nasce sob demanda, com as abas Iniciante, Páginas e Ferramentas; a busca
//      acha manual em qualquer aba; "Já fiz" conta o progresso do Iniciante;
//   3. o "?" abre o tour da tela atual: a camada escurece, o foco cai em cima do elemento
//      certo, Próximo/Voltar/Esc funcionam e a camada segura os cliques;
//   4. o tour da turma abre cada uma das nove abas de verdade e, no fim, devolve a aba em
//      que a pessoa estava;
//   5. todo passo de todo tour aponta para algo que existe na tela (o tour não "pula" em
//      silêncio um botão que mudou de nome);
//   6. "Mostrar na tela" dos Tutoriais leva até a página e começa no passo certo;
//   7. no celular o balão fica preso embaixo/em cima, dentro da tela.
//
// Como rodar (ver testes/LEIAME.md):
//   npm i playwright
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-tutoriais.js
// Não precisa de internet. PROFSIS_PRINTS=pasta salva fotos das telas.

const { chromium } = require('playwright');
const path = require('path');

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
    const refCol = (c) => {
        const docs = () => Object.keys(B.docs).filter(p => p.startsWith(c + '/') && p.slice(c.length + 1).indexOf('/') < 0).map(snapDoc);
        return {
            doc: (id) => refDoc(c + '/' + (id || 'auto' + (++B.seq))),
            where: () => refCol(c), orderBy: () => refCol(c), limit: () => refCol(c),
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

// Onde estão o foco e o elemento do passo atual (para conferir que o foco cobre o alvo).
const ESTADO_TOUR = () => {
    const balao = document.querySelector('.tour-balao');
    const foco = document.querySelector('.tour-foco');
    if (!balao) return { aberto: false };
    const fr = foco && foco.style.display !== 'none' ? foco.getBoundingClientRect() : null;
    const br = balao.getBoundingClientRect();
    return {
        aberto: true,
        titulo: (balao.querySelector('.tour-titulo') || {}).textContent,
        conta: (balao.querySelector('.tour-conta') || {}).textContent,
        foco: fr ? { x: fr.left, y: fr.top, w: fr.width, h: fr.height } : null,
        balao: { x: br.left, y: br.top, w: br.width, h: br.height },
        tela: document.querySelector('#appContainer .screen.active') && document.querySelector('#appContainer .screen.active').id,
        vw: innerWidth, vh: innerHeight
    };
};

(async () => {
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/,
                    r => r.abort());
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1366, height: 860 });
    page.on('dialog', async d => { await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    // Grade da escola (para a Minha Agenda ter horários) e um professor com uma turma.
    await page.evaluate(async () => {
        await window.firebase.firestore().collection('app_data').doc('app_data_school_77_gestor').set({
            turmas: [{ id: 900, nome: '6º A', turno: 'Manhã' }],
            gradeHoraria: [{ id: 'b1', diaSemana: 1, inicio: '07:00', fim: '07:50' }, { id: 'b2', diaSemana: 2, inicio: '07:00', fim: '07:50', tipo: 'almoco' }]
        });
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), {
            turmas: [{ id: 5, nome: '6º A', disciplina: 'Ciências', turno: 'Manhã' }],
            configBimestres: [],
            estudantes: [{ id: 1, id_turma: 5, nome_completo: 'Ana Souza', status: 'Ativo' },
                         { id: 2, id_turma: 5, nome_completo: 'Bruno Lima', status: 'Ativo' }]
        });
        window.dadosCarregados = true;
        currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        try { renderProfessorPanel(); } catch (_) { /* dashboard sem dados */ }
        if (typeof injectProfileButton === 'function') injectProfileButton();
    });
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    console.log('\n1. O menu e o botão "?"');
    // -----------------------------------------------------------------------
    const menu = await page.evaluate(() => {
        const b = document.querySelector('#appContainer nav.app-nav > button[onclick*="showScreen(\'tutoriais\'"]');
        const grupos = Array.from(document.querySelectorAll('#appContainer nav.app-nav > *')).map(e => e.classList.contains('nav-grupo') ? '#' + e.textContent : (e.title || ''));
        const iRec = grupos.indexOf('#Recursos'), iTut = grupos.indexOf('Tutoriais');
        const ajuda = document.getElementById('btnAjudaTour');
        return { botao: !!b, noRecursos: iRec !== -1 && iTut > iRec, ajuda: !!ajuda, novo: ajuda && ajuda.classList.contains('tour-novo'),
                 telaAntes: !!document.getElementById('tutoriais') };
    });
    ok('o menu do professor tem "Tutoriais"', menu.botao);
    ok('"Tutoriais" fica no grupo Recursos', menu.noRecursos);
    ok('o topo tem o botão "?" (piscando enquanto não foi usado)', menu.ajuda && menu.novo);
    ok('a tela não existe antes de ser pedida', !menu.telaAntes);
    const outrosPerfis = await page.evaluate(() => {
        currentViewMode = 'aee'; try { renderAeePanel(); } catch (e) {}
        const aee = document.querySelector('nav').innerHTML.indexOf("showScreen('tutoriais'") !== -1;
        currentViewMode = 'professor'; try { renderProfessorPanel(); } catch (e) {}
        return { aee };
    });
    ok('por enquanto só no perfil professor (AEE não tem o botão no menu)', !outrosPerfis.aee);

    // -----------------------------------------------------------------------
    console.log('\n2. A tela Tutoriais');
    // -----------------------------------------------------------------------
    await page.click('#appContainer nav.app-nav > button[onclick*="showScreen(\'tutoriais\'"]');
    await page.waitForTimeout(300);
    const tela = await page.evaluate(() => {
        const t = document.getElementById('tutoriais');
        return {
            ativa: t && t.classList.contains('active'),
            abas: Array.from(document.querySelectorAll('#tutNav .tut-aba')).map(b => b.textContent.trim()),
            itens: document.querySelectorAll('#tutConteudo .tut-item').length,
            abertos: Array.from(document.querySelectorAll('#tutConteudo .tut-item[open]')).map(d => d.querySelector('.tut-item-tit').textContent),
            titulos: Array.from(document.querySelectorAll('#tutConteudo .tut-item-tit')).map(e => e.textContent),
            botoesVer: document.querySelectorAll('#tutConteudo .tut-ver').length
        };
    });
    ok('a tela abre ativa', tela.ativa);
    ok('tem as abas Iniciante, Páginas e Ferramentas', /Iniciante/.test(tela.abas[0]) && /Páginas/.test(tela.abas[1]) && /Ferramentas/.test(tela.abas[2]), tela.abas.join(' | '));
    ok('o Iniciante tem 10 passos, cada um com "Mostrar na tela"', tela.itens === 10 && tela.botoesVer === 10, String(tela.itens));
    ok('o Iniciante cobre turmas, agenda, abas da turma, Estagiário e Biblioteca',
       ['turmas', 'agenda', 'abas', 'Estagiário', 'Biblioteca'].every(p => tela.titulos.some(t => t.indexOf(p) !== -1)), tela.titulos.join(' | '));
    ok('o primeiro passo vem aberto', tela.abertos.length === 1 && /menu/.test(tela.abertos[0]), JSON.stringify(tela.abertos));
    await foto(page, 'tut-0-iniciante');

    await page.check('#tutConteudo .tut-feito input[data-item="i-menu"]');
    await page.waitForTimeout(100);
    const prog = await page.evaluate(() => ({
        texto: document.querySelector('#tutConteudo .tut-progresso-linha').textContent,
        aberto: (document.querySelector('#tutConteudo .tut-item[open] .tut-item-tit') || {}).textContent,
        guardado: localStorage.getItem('sisprof_tutorial_feitos')
    }));
    ok('"Já fiz" conta o progresso e abre o próximo passo', /1 de 10/.test(prog.texto) && /turmas/.test(prog.aberto) && /i-menu/.test(prog.guardado), JSON.stringify(prog));

    await page.click('#tutNav .tut-aba[data-aba="ferramentas"]');
    const ferr = await page.evaluate(() => Array.from(document.querySelectorAll('#tutConteudo .tut-item-tit')).map(e => e.textContent));
    ok('a aba Ferramentas explica as seis', ['PDF', 'IMG', 'Pôster', 'Vídeo', 'Na Mosca', 'Ateliê'].every(n => ferr.some(t => t.indexOf(n) !== -1)), ferr.join(' | '));
    await page.click('#tutNav .tut-aba[data-aba="paginas"]');
    const pags = await page.evaluate(() => Array.from(document.querySelectorAll('#tutConteudo .tut-item-tit')).map(e => e.textContent));
    ok('a aba Páginas tem um manual por página', ['Início', 'Turmas', 'Dentro da turma', 'Tutoria', 'Documentos', 'Estagiário', 'Registros', 'Painel AEE', 'Biblioteca', 'Perfil'].every(n => pags.some(t => t.indexOf(n) !== -1)), String(pags.length));
    await page.fill('#tutBusca', 'certificado');
    const busca = await page.evaluate(() => Array.from(document.querySelectorAll('#tutConteudo .tut-item-tit')).map(e => e.textContent));
    ok('a busca acha manual de outra aba ("certificado" -> Ateliê)', busca.some(t => /Ateliê/.test(t)), busca.join(' | '));
    await page.fill('#tutBusca', 'marca dagua');
    await page.fill('#tutBusca', 'chamada');
    const busca2 = await page.evaluate(() => document.querySelectorAll('#tutConteudo .tut-item').length);
    ok('busca sem acento ("chamada") acha vários manuais', busca2 >= 3, String(busca2));
    await page.fill('#tutBusca', '');
    await page.click('#tutNav .tut-aba[data-aba="iniciante"]');
    await foto(page, 'tut-1-paginas');

    // -----------------------------------------------------------------------
    console.log('\n3. O "?" na tela de Turmas');
    // -----------------------------------------------------------------------
    await page.click('#appContainer nav.app-nav > button[onclick*="showScreen(\'turmas\'"]');
    await page.waitForTimeout(300);
    await page.click('#btnAjudaTour');
    await page.waitForTimeout(500);
    let st = await page.evaluate(ESTADO_TOUR);
    ok('o "?" abre o tour da tela atual (Turmas)', st.aberto && /Turmas/.test(st.conta), st.conta);
    await page.click('.tour-balao [data-acao="proximo"]');
    await page.waitForTimeout(400);
    st = await page.evaluate(ESTADO_TOUR);
    const alvoNova = await page.evaluate(() => { const r = document.querySelector('#turmas .card > .btn-primary').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    ok('o foco cobre o botão "+ Nova Turma"', st.foco && st.foco.x <= alvoNova.x && st.foco.y <= alvoNova.y &&
       st.foco.x + st.foco.w >= alvoNova.x + alvoNova.w && st.foco.y + st.foco.h >= alvoNova.y + alvoNova.h, JSON.stringify([st.foco, alvoNova]));
    ok('o balão não cobre o elemento destacado', st.balao.y >= st.foco.y + st.foco.h || st.balao.y + st.balao.h <= st.foco.y || st.balao.x >= st.foco.x + st.foco.w);
    await foto(page, 'tut-2-tour-turmas');
    // a camada segura o clique: clicar no botão destacado não abre a janela
    await page.mouse.click(alvoNova.x + alvoNova.w / 2, alvoNova.y + alvoNova.h / 2);
    await page.waitForTimeout(200);
    ok('a camada segura os cliques (o modal de nova turma não abriu)', !(await page.evaluate(() => document.getElementById('modalNovaTurma').classList.contains('active'))));
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    st = await page.evaluate(ESTADO_TOUR);
    ok('seta ← volta um passo', /^1 de/.test(st.conta), st.conta);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok('Esc fecha o tour e tira tudo da tela', await page.evaluate(() => !document.querySelector('.tour-balao, .tour-camada, .tour-foco')));
    ok('o "?" parou de piscar depois de usado', await page.evaluate(() => !document.getElementById('btnAjudaTour').classList.contains('tour-novo')));

    // -----------------------------------------------------------------------
    console.log('\n4. O tour dentro da turma passa pelas nove abas');
    // -----------------------------------------------------------------------
    await page.evaluate(async () => { await abrirTurma(5); showTurmaTab('trabalhos'); });
    await page.waitForTimeout(400);
    await page.click('#btnAjudaTour');
    await page.waitForTimeout(500);
    const abasVistas = [];
    for (let i = 0; i < 20; i++) {
        st = await page.evaluate(ESTADO_TOUR);
        if (!st.aberto) break;
        const aba = await page.evaluate(() => {
            const vis = Array.from(document.querySelectorAll('.turma-tab')).filter(t => t.style.display !== 'none').map(t => t.id);
            const ativo = document.querySelector('#turmaDetalhe nav .turma-nav-btn.active');
            return { vis, ativo: ativo ? ativo.textContent.trim() : '' };
        });
        abasVistas.push(st.titulo + ' => ' + aba.vis.join(','));
        if (/Chamada/.test(st.titulo)) await foto(page, 'tut-3-tour-chamada');
        const prox = await page.$('.tour-balao [data-acao="proximo"]');
        if (!prox) { await page.click('.tour-balao .btn-primary'); break; }
        await prox.click();
        await page.waitForTimeout(350);
    }
    const esperado = ['Estudantes', 'Chamada', 'Registros', 'Atrasos', 'Trabalhos', 'Compensações', 'Caderno', 'Ocorrências', 'Mapeamento'];
    ok('cada aba da turma é aberta de verdade no seu passo', esperado.every(n => abasVistas.some(l => l.indexOf(n) !== -1 && l.indexOf('tab' + ({ 'Compensações': 'Compensacoes', 'Ocorrências': 'Ocorrencias' }[n] || n)) !== -1)), abasVistas.join(' | '));
    const depois = await page.evaluate(() => ({ vis: Array.from(document.querySelectorAll('.turma-tab')).filter(t => t.style.display !== 'none').map(t => t.id), aberto: !!document.querySelector('.tour-balao') }));
    ok('no fim o tour fecha e devolve a aba em que a pessoa estava (Trabalhos)', !depois.aberto && depois.vis.join() === 'tabTrabalhos', JSON.stringify(depois));

    // -----------------------------------------------------------------------
    console.log('\n5. Todo passo de todo tour aponta para algo que existe');
    // -----------------------------------------------------------------------
    // Passos que, com estes dados de teste, de fato não têm o que mostrar.
    const PODE_FALTAR = {
        tutoria: ['Agendamento automático'],       // só aparece com tutorado e horário de tutoria
        fichaEstudante: '*', fichaTutorado: '*'      // dependem de abrir uma ficha
    };
    const relatorio = await page.evaluate(async () => {
        const r = {};
        for (const id of Object.keys(TOURS_SISPROF)) {
            const def = TOURS_SISPROF[id];
            let preparo = null;
            try { preparo = def.preparar ? await def.preparar() : null; } catch (e) { r[id] = { erro: e.message }; continue; }
            await new Promise(res => setTimeout(res, 300));
            const faltando = [];
            for (const p of def.passos) {
                if (p.antes) { try { await p.antes(); } catch (e) {} await new Promise(res => setTimeout(res, 150)); }
                if (!p.alvo) continue;
                const el = typeof p.alvo === 'function' ? p.alvo() : document.querySelector(p.alvo);
                const rr = el && el.getBoundingClientRect();
                if (!el || rr.width < 2 || rr.height < 2) faltando.push(p.titulo);
            }
            if (preparo && preparo.fechar) preparo.fechar();
            r[id] = { faltando };
        }
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        return r;
    });
    Object.keys(relatorio).forEach(id => {
        const x = relatorio[id];
        if (x.erro) { ok('tour "' + id + '" prepara sem erro', false, x.erro); return; }
        const pode = PODE_FALTAR[id];
        const faltaDeVerdade = pode === '*' ? [] : x.faltando.filter(t => !(pode || []).includes(t));
        ok('tour "' + id + '": todos os passos acham o elemento', faltaDeVerdade.length === 0, faltaDeVerdade.join(', '));
    });

    // -----------------------------------------------------------------------
    console.log('\n6. "Mostrar na tela" a partir dos Tutoriais');
    // -----------------------------------------------------------------------
    await page.click('#appContainer nav.app-nav > button[onclick*="showScreen(\'tutoriais\'"]');
    await page.waitForTimeout(300);
    await page.click('#tutNav .tut-aba[data-aba="ferramentas"]');
    await page.evaluate(() => document.querySelector('#tutConteudo .tut-ver[data-item="f-atelie"]').click());
    await page.waitForTimeout(1200);
    st = await page.evaluate(ESTADO_TOUR);
    const abaFerr = await page.evaluate(() => (document.querySelector('#navFerramentas .ferr-nav-btn.active') || {}).dataset);
    ok('o manual do Ateliê leva a Ferramentas, já no passo do Ateliê', st.aberto && st.tela === 'ferramentas' && /Ateliê/.test(st.titulo) && abaFerr && abaFerr.aba === 'atelie', JSON.stringify({ t: st.titulo, tela: st.tela, abaFerr }));
    ok('no último passo há o botão de voltar aos Tutoriais', await page.evaluate(() => !!document.querySelector('.tour-balao [data-acao="tutoriais"]')));
    await foto(page, 'tut-4-tour-atelie');
    await page.click('.tour-balao [data-acao="tutoriais"]');
    await page.waitForTimeout(400);
    ok('e ele volta para os Tutoriais', await page.evaluate(() => document.getElementById('tutoriais').classList.contains('active') && !document.querySelector('.tour-balao')));

    await page.evaluate(() => document.querySelector('#tutNav .tut-aba[data-aba="iniciante"]').click());
    await page.evaluate(() => document.querySelector('#tutConteudo .tut-ver[data-item="i-estagiario"]').click());
    await page.waitForTimeout(1500);
    st = await page.evaluate(ESTADO_TOUR);
    const modalEst = await page.evaluate(() => { const m = document.getElementById('modalGerarDocumentoIA'); return { aberto: !!m && m.classList.contains('active'), ajuda: !!(m && m.querySelector('.tour-btn-modal')) }; });
    ok('o passo do Estagiário abre a janela do Estagiário e o tour dela', st.aberto && modalEst.aberto && /Estagiário/.test(st.conta), st.conta);
    ok('a janela do Estagiário ganhou o próprio botão "?"', modalEst.ajuda);
    const zOk = await page.evaluate(() => +getComputedStyle(document.querySelector('.tour-balao')).zIndex > +getComputedStyle(document.getElementById('modalGerarDocumentoIA')).zIndex);
    ok('o tour fica por cima da janela', zOk);
    await foto(page, 'tut-5-tour-estagiario');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok('fechar o tour fecha a janela que ele mesmo abriu', !(await page.evaluate(() => document.getElementById('modalGerarDocumentoIA').classList.contains('active'))));

    await page.evaluate(() => { document.querySelector('#appContainer nav.app-nav > button[onclick*="showScreen(\'tutoriais\'"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#tutConteudo .tut-ver[data-item="i-agenda"]').click());
    await page.waitForTimeout(1200);
    st = await page.evaluate(ESTADO_TOUR);
    ok('o passo da agenda abre Documentos › Minha Agenda', st.aberto && st.tela === 'documentos' && /Agenda/.test(st.titulo), st.titulo);
    await page.click('.tour-balao [data-acao="proximo"]'); await page.waitForTimeout(400);
    await page.click('.tour-balao [data-acao="proximo"]'); await page.waitForTimeout(400);
    st = await page.evaluate(ESTADO_TOUR);
    ok('e destaca a escolha de turma do horário', /Escolha a turma/.test(st.titulo), st.titulo);
    await foto(page, 'tut-6-tour-agenda');
    await page.keyboard.press('Escape');

    // -----------------------------------------------------------------------
    console.log('\n7. No celular');
    // -----------------------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { showScreen('dashboard'); });
    await page.waitForTimeout(300);
    const ajudaCel = await page.evaluate(() => { const b = document.getElementById('btnAjudaTour'); const r = b.getBoundingClientRect(); return r.width > 10 && r.right <= innerWidth; });
    ok('o "?" aparece no topo do celular', ajudaCel);
    await page.click('#btnAjudaTour');
    await page.waitForTimeout(400);
    let dentro = true, passosCel = 0, menuMais = false, fora = [];
    for (let i = 0; i < 15; i++) {
        st = await page.evaluate(ESTADO_TOUR);
        if (!st.aberto) break;
        passosCel++;
        if (st.balao.x < 0 || st.balao.x + st.balao.w > st.vw + 1 || st.balao.y < 0 || st.balao.y + st.balao.h > st.vh + 1) { dentro = false; fora.push(st.titulo + ' ' + JSON.stringify(st.balao)); }
        if (/Tutoriais/.test(st.titulo)) {
            menuMais = await page.evaluate(() => { const m = document.querySelector('.nav-mais').getBoundingClientRect(); const f = document.querySelector('.tour-foco').getBoundingClientRect(); return f.left <= m.left && f.right >= m.right; });
            await foto(page, 'tut-7-celular');
        }
        const prox = await page.$('.tour-balao [data-acao="proximo"]');
        if (!prox) break;
        await prox.click();
        await page.waitForTimeout(300);
    }
    ok('o balão fica inteiro dentro da tela em todos os passos', dentro && passosCel >= 8, passosCel + ' passos ' + fora.join(' | '));
    ok('no celular, "Tutoriais" é mostrado no botão "Mais"', menuMais);
    await page.keyboard.press('Escape');
    await page.evaluate(() => showScreen('tutoriais'));
    await page.waitForTimeout(300);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok('a tela Tutoriais não cria rolagem para o lado no celular', larg);
    await foto(page, 'tut-8-celular-tutoriais');

    await browser.close();
    console.log('\n' + (falhas.length ? falhas.length + ' FALHA(S): ' + falhas.join(' | ') : 'Tudo certo.'));
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
