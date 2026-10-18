// O "NA MOSCA!" — quiz ao vivo em sala (quiz.js + jogar.html + quiz_operacoes.js).
//
// O que este teste cobre, com uma partida inteira de verdade no navegador:
//   1. as contas (pontuacao, gabarito escondido, relatorio, leitura da resposta da IA),
//      rodando sem navegador;
//   2. a aba nova dentro de Ferramentas; a conta gratuita ve o catalogo mas nao cria quiz;
//   3. o editor: criar o quiz pela tela e salvar (vai para quizzes/<id> com o dono);
//   4. "Criar com IA" a partir de um material da Biblioteca: o texto do material vai no
//      pedido e as perguntas voltam para o editor;
//   5. abrir a sala: PIN de 6 digitos, e a sala NAO tem gabarito;
//   6. dois alunos entram pelo jogar.html (em iframes, com PIN e apelido) e aparecem na
//      tela do professor;
//   7. pergunta no ar sem gabarito; um aluno acerta, outro erra; a pergunta fecha sozinha
//      quando todos respondem; cada aluno ve o proprio resultado;
//   8. placar, segunda pergunta, podio e relatorio (CSV) com o vencedor certo;
//   9. encerrar apaga a sala, os jogadores e as respostas do banco.
//
// O banco e' FALSO (em memoria, compartilhado entre a pagina e os iframes). As Regras do
// Firestore NAO rodam aqui — elas precisam do emulador (firestore.rules.teste.mjs).
//
// Como rodar (ver testes/LEIAME.md):
//   npm i playwright
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-quiz.js

const { chromium } = require('playwright');
const path = require('path');

const FAKE = () => {
    const topo = (() => { try { return window.top.__fakeBanco ? window.top : window; } catch (_) { return window; } })();
    if (!topo.__fakeBanco) {
        topo.__fakeBanco = { docs: {}, ouvintes: [], seq: 0 };
    }
    const B = topo.__fakeBanco;
    const TS = '__ts_servidor__';
    const ts = ms => ({ __tsms: ms });
    const ler = v => {
        if (v && typeof v === 'object') {
            if (typeof v.__tsms === 'number') { const ms = v.__tsms; return { toMillis: () => ms, toDate: () => new Date(ms) }; }
            if (Array.isArray(v)) return v.map(ler);
            const o = {}; Object.keys(v).forEach(k => { o[k] = ler(v[k]); }); return o;
        }
        return v;
    };
    const gravar = v => {
        if (v === TS) return ts(Date.now());
        if (v && typeof v === 'object') {
            if (typeof v.toMillis === 'function') return ts(v.toMillis());
            if (Array.isArray(v)) return v.map(gravar);
            const o = {}; Object.keys(v).forEach(k => { o[k] = gravar(v[k]); }); return o;
        }
        return v;
    };
    const notificar = () => setTimeout(() => B.ouvintes.slice().forEach(o => { try { o.rodar(); } catch (e) { console.error(e); } }), 0);
    const snapDoc = (p) => {
        const d = B.docs[p];
        return { id: p.split('/').pop(), exists: !!d, data: () => d ? ler(JSON.parse(JSON.stringify(d))) : undefined, ref: refDoc(p) };
    };
    function refDoc(p) {
        return {
            id: p.split('/').pop(), path: p,
            get: async () => snapDoc(p),
            set: async (obj) => { B.docs[p] = gravar(obj); notificar(); },
            update: async (obj) => {
                if (!B.docs[p]) { const e = new Error('No document to update'); e.code = 'not-found'; throw e; }
                B.docs[p] = Object.assign({}, B.docs[p], gravar(obj)); notificar();
            },
            delete: async () => { delete B.docs[p]; notificar(); },
            collection: (sub) => refCol(p + '/' + sub),
            onSnapshot: (cb, erro) => {
                const o = { rodar: () => cb(snapDoc(p)) };
                B.ouvintes.push(o); setTimeout(o.rodar, 0);
                return () => { B.ouvintes = B.ouvintes.filter(x => x !== o); };
            }
        };
    }
    function refCol(c, filtros) {
        filtros = filtros || [];
        const docsDaColecao = () => Object.keys(B.docs)
            .filter(p => p.startsWith(c + '/') && p.slice(c.length + 1).indexOf('/') === -1)
            .filter(p => filtros.every(([f, v]) => B.docs[p][f] === v))
            .map(snapDoc);
        return {
            doc: (id) => refDoc(c + '/' + (id || ('auto' + (++B.seq) + Math.random().toString(36).slice(2, 7)))),
            where: (f, op, v) => refCol(c, filtros.concat([[f, v]])),
            orderBy: () => refCol(c, filtros),
            limit: () => refCol(c, filtros),
            get: async () => { const docs = docsDaColecao(); return { docs, size: docs.length, empty: !docs.length }; },
            add: async (obj) => { const r = refDoc(c + '/auto' + (++B.seq)); await r.set(obj); return r; },
            onSnapshot: (cb) => {
                let antes = {};
                const o = { rodar: () => {
                    const docs = docsDaColecao();
                    const agora = {}; docs.forEach(d => { agora[d.id] = d; });
                    const mud = [];
                    docs.forEach(d => mud.push({ type: antes[d.id] ? 'modified' : 'added', doc: d }));
                    Object.keys(antes).forEach(id => { if (!agora[id]) mud.push({ type: 'removed', doc: antes[id] }); });
                    antes = agora;
                    cb({ docs, size: docs.length, docChanges: () => mud });
                } };
                B.ouvintes.push(o); setTimeout(o.rodar, 0);
                return () => { B.ouvintes = B.ouvintes.filter(x => x !== o); };
            }
        };
    }
    const banco = {
        collection: (c) => refCol(c),
        batch: () => {
            const ops = [];
            return {
                set: (r, o) => ops.push(() => r.set(o)),
                update: (r, o) => ops.push(() => r.update(o)),
                delete: (r) => ops.push(() => r.delete()),
                commit: async () => { for (const f of ops) await f(); }
            };
        }
    };
    window.firebase = {
        initializeApp: () => {}, analytics: () => {},
        auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' },
                       onAuthStateChanged: (cb) => { setTimeout(() => cb(null), 0); return () => {}; },
                       signOut: async () => {} }),
        firestore: () => banco
    };
    window.firebase.firestore.FieldValue = { serverTimestamp: () => TS, arrayUnion: (...a) => a, delete: () => undefined };
};

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
// PROFSIS_PRINTS=<pasta> guarda fotos da tela em cada etapa (para olhar o visual).
async function foto(pagina, nome) {
    if (!process.env.PROFSIS_PRINTS) return;
    try { await pagina.screenshot({ path: path.join(process.env.PROFSIS_PRINTS, nome + '.png') }); } catch (_) { /* so' e' foto */ }
}
async function ate(fn, ms) {
    const fim = Date.now() + (ms || 8000);
    while (Date.now() < fim) { try { if (await fn()) return true; } catch (_) { /* ainda nao */ } await esperar(120); }
    return false;
}

(async () => {
    // -----------------------------------------------------------------------
    console.log('\n1. As contas (sem navegador)');
    // -----------------------------------------------------------------------
    const Q = require(path.join(__dirname, '..', 'quiz_operacoes.js'));
    ok('acerto instantaneo vale 1000', Q.pontosDaResposta({ acertou: true, ms: 0, tempoSeg: 20 }) === 1000);
    ok('acerto no ultimo segundo vale 500', Q.pontosDaResposta({ acertou: true, ms: 20000, tempoSeg: 20 }) === 500);
    ok('erro vale 0', Q.pontosDaResposta({ acertou: false, ms: 0, tempoSeg: 20 }) === 0);
    ok('vale dobro dobra', Q.pontosDaResposta({ acertou: true, ms: 10000, tempoSeg: 20, multiplicador: 2 }) === 1500);
    ok('sequencia soma ate +250', Q.pontosDaResposta({ acertou: true, ms: 0, tempoSeg: 20, sequencia: 99 }) === 1250);
    const pq = Q.perguntaPublica(Q.normalizarPergunta({ texto: '2+2?', opcoes: ['3', '', '4', '5'], corretas: [2] }));
    ok('pergunta publica sem gabarito e sem alternativa vazia',
       !('corretas' in pq.publica) && JSON.stringify(pq.publica.opcoes) === '["3","4","5"]' && JSON.stringify(pq.gabarito) === '[1]');
    const ia = Q.perguntasDaIA({ perguntas: [
        { tipo: 'multipla', texto: 'Capital do Brasil?', opcoes: ['Rio', 'SP', 'Brasília', 'BH'], correta: 'C' },
        { tipo: 'vf', texto: 'O Sol é uma estrela', correta: 'Verdadeiro' },
        { texto: 'sem gabarito', opcoes: ['a', 'b'] }] });
    ok('resposta da IA vira pergunta (letra, V/F) e descarta a sem gabarito',
       ia.length === 2 && ia[0].corretas[0] === 2 && ia[1].tipo === 'vf' && ia[1].corretas[0] === 0);
    let pinsOk = true; for (let i = 0; i < 2000; i++) if (!Q.pinValido(Q.gerarPin())) pinsOk = false;
    ok('PIN sempre com 6 digitos, sem zero na frente', pinsOk);

    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/,
                    r => r.abort());
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 860 });
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
        currentUser = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [] });
        window.dadosCarregados = true;
        currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        try { renderProfessorPanel(); } catch (_) { /* dashboard sem dados */ }
        showScreen('ferramentas');
        showFerramentasTab('quiz');
        const el = document.getElementById('tabFerramentasQuiz');
        const r = { visivel: el && el.style.display !== 'none', marca: el && /Na\s*Mosca!/.test(el.textContent), premium: ehPremium() };
        qzNovo();
        r.editorAbriuGratis = !!document.querySelector('#tabFerramentasQuiz textarea');
        const modal = document.getElementById('modalApoie') || document.querySelector('.modal.active');
        r.convite = !!modal;
        if (typeof closeModal === 'function') { try { closeModal('modalApoie'); } catch (_) {} }
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        return r;
    });
    ok('a aba "Na Mosca!" abre dentro de Ferramentas', aba.visivel && aba.marca);
    ok('conta gratuita nao abre o editor (portao premium)', !aba.premium && !aba.editorAbriuGratis);

    // -----------------------------------------------------------------------
    console.log('\n3. O editor');
    // -----------------------------------------------------------------------
    await page.evaluate(() => { currentUser.role = 'super_admin'; qzNovo(); });
    await page.fill('#tabFerramentasQuiz input[placeholder^="Título"]', 'Revisão de Matemática');
    await page.fill('#tabFerramentasQuiz textarea', 'Quanto é 7 x 8?');
    const alts = await page.$$('#tabFerramentasQuiz .qz-op input[type=text]');
    await alts[0].fill('56'); await alts[1].fill('54'); await alts[2].fill('64'); await alts[3].fill('48');
    await page.evaluate(() => qzAddPergunta('vf'));
    await page.fill('#tabFerramentasQuiz .qz-p[data-pergunta="1"] textarea', 'Todo número par é divisível por 2.');
    await page.evaluate(() => qzSalvar());
    await page.waitForTimeout(300);
    const salvo = await page.evaluate(() => {
        const ks = Object.keys(window.__fakeBanco.docs).filter(k => k.startsWith('quizzes/'));
        const d = ks.length ? window.__fakeBanco.docs[ks[0]] : null;
        return { n: ks.length, id: d && d.id, dono: d && d.donoUid, perguntas: d && d.perguntas.length, gab: d && d.perguntas[0].corretas, texto: document.getElementById('tabFerramentasQuiz').textContent };
    });
    ok('quiz salvo no banco com o dono', salvo.n === 1 && salvo.dono === 'u1' && salvo.perguntas === 2, JSON.stringify({ n: salvo.n, dono: salvo.dono }));
    ok('gabarito guardado no quiz (alternativa A = 56)', JSON.stringify(salvo.gab) === '[0]');
    ok('a lista mostra o quiz salvo', /Revisão de Matemática/.test(salvo.texto) && /2 pergunta/.test(salvo.texto));

    // -----------------------------------------------------------------------
    console.log('\n4. Criar com IA a partir da Biblioteca');
    // -----------------------------------------------------------------------
    const ia2 = await page.evaluate(async () => {
        window.__fakeBanco.docs['materiais_apoio/m1'] = { titulo: 'Ciclo da água', serie: '6º ano', disciplina: 'Ciências', textoExtraido: 'A água evapora, condensa nas nuvens e precipita como chuva. Esse é o ciclo hidrológico.' };
        window.__prompt = '';
        window.chamarIAEstruturada = async (p) => { window.__prompt = p; return { perguntas: [
            { tipo: 'multipla', texto: 'O que forma as nuvens?', opcoes: ['Evaporação', 'Condensação', 'Fusão', 'Erosão'], correta: 1, tempo: 20 },
            { tipo: 'vf', texto: 'A chuva é precipitação.', opcoes: ['Verdadeiro', 'Falso'], correta: 0 }] }; };
        await qzAbrirGerador(true);
        const sel = document.getElementById('qzgMaterial');
        sel.value = 'm1';
        await qzGerar();
        const e = qzEstado().editando;
        return { prompt: window.__prompt, n: e && e.perguntas.length, titulo: e && e.titulo };
    });
    ok('o texto do material vai no pedido a IA', /evapora, condensa/.test(ia2.prompt));
    ok('as perguntas da IA abrem no editor', ia2.n === 2 && ia2.titulo === 'Ciclo da água', JSON.stringify(ia2));
    await page.evaluate(() => qzVoltar());

    // -----------------------------------------------------------------------
    console.log('\n5. Abrir a sala');
    // -----------------------------------------------------------------------
    const quizId = salvo.id;
    await foto(page, '0-lista');
    await page.evaluate((id) => qzIniciar(id), quizId);
    await ate(() => page.evaluate(() => /\d{6}/.test((document.querySelector('#qzPalco .pc-pin') || {}).textContent || '')));
    const sala = await page.evaluate(() => {
        const pin = document.querySelector('#qzPalco .pc-pin').textContent.trim();
        return { pin, doc: window.__fakeBanco.docs['quiz_salas/' + pin] };
    });
    ok('a sala abriu com PIN de 6 digitos', /^[1-9]\d{5}$/.test(sala.pin), sala.pin);
    ok('a sala e do professor e nao leva gabarito', sala.doc && sala.doc.hostUid === 'u1' && sala.doc.estado === 'sala' && sala.doc.gabarito == null && !JSON.stringify(sala.doc).includes('corretas'));

    // -----------------------------------------------------------------------
    console.log('\n6. Dois alunos entram pelo jogar.html');
    // -----------------------------------------------------------------------
    await page.evaluate((pin) => {
        ['A', 'B'].forEach(n => {
            const f = document.createElement('iframe');
            f.name = 'aluno' + n; f.src = 'jogar.html?pin=' + pin;
            f.style.cssText = 'position:fixed; bottom:0; width:360px; height:640px; z-index:99999; ' + (n === 'A' ? 'left:0' : 'right:0');
            document.body.appendChild(f);
        });
    }, sala.pin);
    await page.waitForTimeout(1200);
    const fA = page.frame({ name: 'alunoA' }), fB = page.frame({ name: 'alunoB' });
    for (const [f, apelido] of [[fA, 'Raio'], [fB, 'Cometa']]) {
        await f.waitForSelector('#iPin');
        ok('o PIN do link ja vem preenchido (' + apelido + ')', (await f.inputValue('#iPin')) === sala.pin);
        // Os iframes dividem o sessionStorage (no celular de verdade cada aluno tem o seu):
        // sem limpar, o segundo "voltaria" como o primeiro.
        await f.evaluate(() => sessionStorage.clear());
        await f.click('#fPin button');
        await f.waitForSelector('#iApe', { timeout: 5000 });
        await f.fill('#iApe', apelido);
        await f.click('#fApe button');
        await f.waitForFunction(() => /Você está dentro/.test(document.body.textContent), null, { timeout: 5000 });
    }
    const naTela = await ate(() => page.evaluate(() => {
        const t = document.getElementById('qzPalco').textContent; return /Raio/.test(t) && /Cometa/.test(t);
    }));
    ok('os dois apelidos aparecem na tela do professor', naTela);
    await foto(page, '1-sala');
    const pinErrado = await (async () => {
        const f = await page.evaluate(() => { const f = document.createElement('iframe'); f.name = 'alunoC'; f.src = 'jogar.html'; f.style.cssText = 'position:fixed; top:0; left:380px; width:300px; height:400px; z-index:99999;'; document.body.appendChild(f); });
        await page.waitForTimeout(800);
        const c = page.frame({ name: 'alunoC' });
        await c.waitForSelector('#iPin');
        await c.fill('#iPin', '999999'); await c.click('#fPin button');
        await page.waitForTimeout(400);
        return c.textContent('#ePin');
    })();
    ok('PIN que nao existe e recusado com explicacao', /Não achei/.test(pinErrado || ''), pinErrado);

    // -----------------------------------------------------------------------
    console.log('\n7. A primeira pergunta');
    // -----------------------------------------------------------------------
    await page.evaluate(() => qzProximaPergunta());
    await fA.waitForSelector('.op', { timeout: 5000 });
    await fB.waitForSelector('.op', { timeout: 5000 });
    const noAr = await page.evaluate((pin) => window.__fakeBanco.docs['quiz_salas/' + pin], sala.pin);
    ok('a pergunta foi ao ar sem gabarito', noAr.estado === 'pergunta' && noAr.gabarito == null && noAr.pergunta.texto === 'Quanto é 7 x 8?' && !('corretas' in noAr.pergunta));
    ok('o aluno ve as 4 alternativas', (await fA.$$('.op')).length === 4);
    await foto(page, '2-pergunta');
    await fA.click('.op[data-k="0"]');           // 56: certo
    await page.waitForTimeout(150);
    await fB.click('.op[data-k="2"]');           // 64: errado
    const revelou = await ate(() => page.evaluate((pin) => window.__fakeBanco.docs['quiz_salas/' + pin].estado === 'revelada', sala.pin));
    ok('fechou sozinha quando todos responderam', revelou);
    await fA.waitForFunction(() => /Na mosca!/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
    await fB.waitForFunction(() => /Passou perto/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
    const tA = await fA.textContent('body'), tB = await fB.textContent('body');
    ok('quem acertou ve "Na mosca!" e os pontos', /Na mosca!/.test(tA) && /\+\d{3,4}/.test(tA), tA.replace(/\s+/g, ' ').slice(0, 120));
    ok('quem errou ve a resposta certa', /Passou perto/.test(tB) && /56/.test(tB), tB.replace(/\s+/g, ' ').slice(0, 120));
    await foto(page, '3-revelada');
    const dist = await page.evaluate(() => Array.from(document.querySelectorAll('#qzPalco .pc-op .cont')).map(e => e.textContent));
    ok('o professor ve quantos marcaram cada alternativa', JSON.stringify(dist) === '["1","0","1","0"]', JSON.stringify(dist));
    const respostaDupla = await page.evaluate((pin) => Object.keys(window.__fakeBanco.docs).filter(k => k.startsWith('quiz_salas/' + pin + '/respostas/')).length, sala.pin);
    ok('uma resposta por aluno', respostaDupla === 2, String(respostaDupla));

    // -----------------------------------------------------------------------
    console.log('\n8. Placar, segunda pergunta, podio e relatorio');
    // -----------------------------------------------------------------------
    await page.evaluate(() => qzPlacar());
    await fA.waitForFunction(() => /Placar/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
    ok('o aluno ve o placar com a propria posicao', /1º/.test(await fA.textContent('body')));
    await page.evaluate(() => qzProximaPergunta());
    await fA.waitForSelector('.op', { timeout: 5000 });
    await fB.waitForSelector('.op', { timeout: 5000 });
    await fA.click('.op[data-k="0"]');           // Verdadeiro: certo
    await fB.click('.op[data-k="0"]');           // certo tambem
    await ate(() => page.evaluate((pin) => window.__fakeBanco.docs['quiz_salas/' + pin].estado === 'revelada', sala.pin));
    await page.evaluate(() => qzProximaPergunta());   // ultima: vai para o podio
    await ate(() => page.evaluate(() => /Pódio/.test(document.getElementById('qzPalco').textContent)));
    const fim = await page.evaluate((pin) => {
        const t = document.getElementById('qzPalco').textContent;
        const rel = qzEstado().partida && qzEstado().partida.relatorio;
        return { podio: window.__fakeBanco.docs['quiz_salas/' + pin].podio, t, rel, csv: rel ? QUIZOPS.relatorioCsv(rel) : '' };
    }, sala.pin);
    ok('o podio tem o Raio em primeiro', fim.podio && fim.podio[0] && fim.podio[0].apelido === 'Raio', JSON.stringify(fim.podio));
    ok('relatorio: Raio 2/2, Cometa 1/2', fim.rel && fim.rel.jogadores[0].apelido === 'Raio' && fim.rel.jogadores[0].acertos === 2 && fim.rel.jogadores[1].acertos === 1);
    ok('relatorio: 50% e 100% de acerto por pergunta', fim.rel && fim.rel.perguntas[0].pctAcerto === 50 && fim.rel.perguntas[1].pctAcerto === 100);
    ok('o CSV traz o apelido e o gabarito', /Raio;\d+;2\/2;A \(certo\)/.test(fim.csv) && /P1;Quanto é 7 x 8\?;A;50%/.test(fim.csv));
    await fA.waitForFunction(() => /pódio/i.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
    await foto(page, '4-podio');
    ok('o aluno vencedor ve que esta no podio', /Você está no pódio/.test(await fA.textContent('body')));

    // -----------------------------------------------------------------------
    console.log('\n9. Encerrar apaga a sala');
    // -----------------------------------------------------------------------
    await page.evaluate(() => qzEncerrar());
    await page.waitForTimeout(500);
    const resto = await page.evaluate(() => ({
        sala: Object.keys(window.__fakeBanco.docs).filter(k => k.startsWith('quiz_salas/')),
        relatorios: JSON.parse(localStorage.getItem('sisprof_quiz_relatorios_u1') || '[]').length,
        lista: /Relatórios das últimas partidas/.test(document.getElementById('tabFerramentasQuiz').textContent)
    }));
    ok('sala, jogadores e respostas apagados do banco', resto.sala.length === 0, resto.sala.join(', '));
    ok('o relatorio ficou no aparelho e aparece na lista', resto.relatorios === 1 && resto.lista);
    await fA.waitForFunction(() => /fechou a sala/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
    ok('o aluno fica sabendo que a sala fechou', /fechou a sala/.test(await fA.textContent('body')));

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S):\n - ' + falhas.join('\n - ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
