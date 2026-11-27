// AGENDA DE EQUIPAMENTOS (equipamentos.js + equipamento.html + equipamentos_operacoes.js).
//
// O que este teste cobre, com uma aula inteira no navegador:
//   1. as contas (livre/ocupado, escolher livres, trocas previstas, uso com trocas,
//      relatorio, CSV), rodando sem navegador;
//   2. a aba "Equipamentos" dentro de Ferramentas; cadastrar "Notebook 01 a 15";
//      marcar um com defeito (ele sai das contas de livres);
//   3. reservar pela tabela de disponibilidade: a turma da aula vem marcada, a quantidade
//      e' o numero de estudantes e o sistema separa 1 para troca;
//   4. outro professor no mesmo horario recebe so' o que sobrou; choque de horario
//      (alguem reservou no mesmo instante) e' recusado e o sistema escolhe outros;
//   5. no Inicio, embaixo da turma, aparece o que foi reservado;
//   6. "Link para os alunos": a sessao vai para o banco SEM nome de estudante;
//   7. o estudante (equipamento.html, num iframe) toca o numero e o equipamento; depois
//      "Não funciona" e troca: o professor ve na hora, o equipamento vai para defeito;
//   8. o professor lanca a mao; o relatorio do dia mostra o nome (so' no aparelho dele) e
//      o CSV sai certo;
//   9. fechar o link apaga a sessao; nada de nome de estudante nos documentos da escola.
//
// O banco e' FALSO (em memoria, compartilhado entre a pagina e o iframe — o mesmo do
// teste-quiz.js, com transacao). As Regras rodam em teste-regras-equipamentos.mjs.
//
// Como rodar (ver testes/LEIAME.md):
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   PROFSIS_CHROMIUM=/opt/pw-browsers/chromium NODE_PATH=$(npm root -g) node testes/teste-equipamentos.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FAKE = fs.readFileSync(path.join(__dirname, 'teste-quiz.js'), 'utf8').match(/const FAKE = (\(\) => \{[\s\S]*?\n\};)/)[1].replace(/;$/, '');
// O banco falso do quiz nao tem transacao nem Timestamp: acrescenta aqui.
const EXTRA = () => {
    const b = window.firebase.firestore();
    b.runTransaction = async (fn) => {
        const escritas = [];
        const t = { get: (r) => r.get(), set: (r, o) => { escritas.push([r, o]); } };
        const res = await fn(t);
        for (const [r, o] of escritas) await r.set(o);
        return res;
    };
    window.firebase.firestore.Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) }) };
};

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function foto(pagina, nome) {
    if (!process.env.PROFSIS_PRINTS) return;
    try { await pagina.screenshot({ path: path.join(process.env.PROFSIS_PRINTS, nome + '.png') }); } catch (_) { /* so' foto */ }
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
    const Q = require(path.join(__dirname, '..', 'equipamentos_operacoes.js'));
    const lote = Q.gerarLote({ tipo: 'notebook', base: 'Notebook', de: 1, ate: 12, grupo: 'Carrinho 1' }, []);
    ok('lote "Notebook 01 a 12"', lote.length === 12 && lote[0].rotulo === 'Notebook 01' && lote[11].rotulo === 'Notebook 12');
    ok('lote nao duplica quem ja existe', Q.gerarLote({ tipo: 'notebook', base: 'Notebook', de: 10, ate: 14 }, lote).length === 2);
    ok('resumo junta sequencias', Q.resumirIds(lote.slice(0, 3).concat([lote[5]]).map(e => e.id), lote) === 'Notebook 01–03, 06');
    ok('07:00–07:50 e 07:50–08:40 nao se cruzam', !Q.cruza('07:00', '07:50', '07:50', '08:40') && Q.cruza('07:00', '08:40', '07:50', '08:40'));
    const eqs = lote.map((e, i) => i === 4 ? Object.assign({}, e, { situacao: 'defeito' }) : e);
    const res1 = { id: 'r1', data: '2026-11-27', inicio: '07:00', fim: '07:50', equipIds: [eqs[0].id, eqs[1].id], reservaTroca: [eqs[2].id] };
    const disp = Q.disponibilidade(eqs, [res1], '2026-11-27', '07:00', '07:50');
    const cont = Q.contarPorTipo(disp).notebook;
    ok('livres descontam reservados e com defeito', cont.total === 12 && cont.livres === 8 && cont.defeito === 1 && cont.reservados === 3, JSON.stringify(cont));
    ok('outro horario: tudo livre (menos o com defeito)', Q.contarPorTipo(Q.disponibilidade(eqs, [res1], '2026-11-27', '07:50', '08:40')).notebook.livres === 11);
    const esc1 = Q.escolherLivres(disp, 'notebook', 5, 1);
    ok('escolher 5 + 1 troca so com livres', esc1.equipIds.length === 5 && esc1.reservaTroca.length === 1 && !esc1.equipIds.includes(eqs[4].id) && !esc1.equipIds.includes(eqs[0].id));
    ok('faltam quando nao ha livres suficientes', Q.escolherLivres(disp, 'notebook', 20, 0).faltaram === 12);
    ok('troca sugerida: 1 a cada 10, minimo 1', Q.trocaSugerida(5) === 1 && Q.trocaSugerida(30) === 3 && Q.trocaSugerida(0) === 0);
    const quebrou = eqs.map(e => e.id === eqs[1].id ? Object.assign({}, e, { situacao: 'defeito' }) : e);
    const prev = Q.trocasPrevistas(res1, quebrou, [res1]);
    ok('quebrou depois de reservado: usa a reserva de troca', prev.length === 1 && prev[0].de === eqs[1].id && prev[0].para === eqs[2].id);
    const aplic = Q.aplicarTrocas(res1, prev);
    ok('aplicar troca tira da reserva de troca', aplic.equipIds.includes(eqs[2].id) && !aplic.equipIds.includes(eqs[1].id) && aplic.reservaTroca.length === 0);
    const regs = [
        { num: 3, equip: eqs[0].id, tipo: 'pegou', em: 1 },
        { num: 3, equip: eqs[3].id, tipo: 'defeito', anterior: eqs[0].id, em: 2 },
        { num: 5, equip: eqs[3].id, tipo: 'pegou', em: 3 },
        { num: 7, equip: 'txt:Notebook 31', tipo: 'pegou', em: 4 },
        { num: 9, equip: eqs[6].id, tipo: 'pegou', em: 5 }, { num: 9, equip: '-', tipo: 'devolveu', em: 6 }
    ];
    const cons = Q.consolidarUso(regs);
    const c3 = cons.find(c => c.num === 3);
    ok('uso: fica o ultimo equipamento e a troca por defeito', c3.equip === eqs[3].id && c3.trocas.length === 1 && c3.trocas[0].defeito && c3.defeitos[0] === eqs[0].id);
    ok('uso: devolveu fica sem equipamento', cons.find(c => c.num === 9).equip === '');
    ok('defeitos relatados', JSON.stringify(Q.defeitosRelatados(regs)) === JSON.stringify([eqs[0].id]));
    ok('conflito: dois numeros com o mesmo', Q.conflitosDeUso(cons).length === 1 && Q.conflitosDeUso(cons)[0].nums.join() === '3,5');
    const rel = Q.relatorioDoDia('2026-11-27', [Object.assign({ turmaNome: '1º A', profNome: 'Maria' }, res1)], { r1: { registros: regs } }, eqs, (r, n) => n === 3 ? 'Ana Souza' : '');
    ok('relatorio do dia', rel.totalReservas === 1 && rel.blocos[0].linhas.length === 4 && rel.blocos[0].linhas[0].nome === 'Ana Souza' && rel.defeitos[0] === 'Notebook 01');
    ok('digitado pelo estudante aparece como digitado', rel.blocos[0].linhas.find(l => l.num === 7).equip === 'Notebook 31 (digitado)');
    const csv = Q.relatorioCsv(rel);
    ok('CSV com cabecalho e o nome', /Nº;Estudante;Equipamento/.test(csv) && /Ana Souza;Notebook 04;Notebook 01 → Notebook 04 \(defeito\)/.test(csv), csv.split('\n')[1]);
    ok('codigo de 6 numeros, sem zero na frente', Array.from({ length: 300 }, () => Q.gerarCodigo()).every(c => Q.codigoValido(c) && /^[1-9]\d{5}$/.test(c)));
    ok('codigo colado de jeitos diferentes', Q.limparCodigo('is.gd/482913') === '482913' && Q.limparCodigo('482 913') === '482913' && Q.limparCodigo('https://x/equipamento.html?c=482913') === '482913');
    ok('pedido ao is.gd com o codigo no fim', /^https:\/\/is\.gd\/create\.php\?format=json&callback=cb&url=https%3A%2F%2Fa.b%2Fequipamento.html%3Fc%3D482913&shorturl=482913$/.test(Q.urlPedidoIsgd('https://a.b/equipamento.html?c=482913', '482913', 'cb')));
    ok('data local (nao UTC)', Q.dataLocal(new Date(2026, 10, 27, 23, 30)) === '2026-11-27');

    // -----------------------------------------------------------------------
    console.log('\n2. A aba e o cadastro');
    // -----------------------------------------------------------------------
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium' };
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|api\.open-meteo\.com|geocoding-api\.open-meteo\.com)/,
                    r => r.abort());
    // is.gd falso: o 1º codigo "ja existe" (como no is.gd de verdade, errorcode 2); os outros viram is.gd/<codigo>.
    const pedidosIsgd = [];
    await ctx.route(/is\.gd\/create\.php/, r => {
        const u = new URL(r.request().url());
        pedidosIsgd.push({ url: u.searchParams.get('url'), shorturl: u.searchParams.get('shorturl') });
        const cb = u.searchParams.get('callback');
        const corpo = pedidosIsgd.length === 1
            ? { errorcode: 2, errormessage: 'The shortened URL you picked already exists, please choose another.' }
            : { shorturl: 'https://is.gd/' + u.searchParams.get('shorturl') };
        r.fulfill({ status: 200, contentType: 'application/javascript', body: cb + '(' + JSON.stringify(corpo) + ');' });
    });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    page.on('dialog', async d => { await d.accept(d.type() === 'prompt' ? (d.defaultValue() || 'não liga') : undefined); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript('(' + FAKE + ')()');
    await page.addInitScript('(' + EXTRA.toString() + ')()');
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    const montar = await page.evaluate(async () => {
        const dia = new Date().getDay();
        const G = (id, ini, fim, extra) => Object.assign({ id, diaSemana: dia, inicio: ini, fim }, extra || {});
        const grade = [G('b1', '07:00', '07:50'), G('b2', '07:50', '08:40'), G('b3', '08:40', '09:00', { tipo: 'cafe' }), G('b4', '09:00', '09:50')];
        await window.firebase.firestore().collection('app_data').doc('app_data_school_77_gestor').set({
            turmas: [], gradeHoraria: grade, tiposHorarioFixo: [{ id: 'cafe', nome: '☕ Café' }]
        });
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        const nomes = ['Carla Dias', 'Ana Souza', 'Bruno Lima', 'Eva Rocha', 'Davi Melo'];
        data = Object.assign(getInitialData(), {
            turmas: [{ id: 10, nome: '1º A', disciplina: 'Matemática' }, { id: 11, nome: '2º B', disciplina: 'Matemática' }],
            estudantes: nomes.map((n, i) => ({ id: 100 + i, nome_completo: n, id_turma: 10, status: 'Ativo' })),
            horariosAulas: [{ id_bloco: 'b1', tipo: 'aula', id_turma: 10 }, { id_bloco: 'b2', tipo: 'aula', id_turma: 11 }],
            schoolGrade: grade
        });
        window.dadosCarregados = true;
        currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        showScreen('ferramentas');
        showFerramentasTab('equip');
        const el = document.getElementById('tabFerramentasEquip');
        return { visivel: !!el && el.style.display !== 'none', vazio: /Comece cadastrando/.test(el.textContent),
                 abas: Array.from(document.querySelectorAll('#navFerramentas [data-aba], #navFerramentas button')).map(b => b.textContent.trim()).join('|') };
    });
    await page.waitForTimeout(300);
    const vazio = await page.evaluate(() => /Comece cadastrando/.test(document.getElementById('tabFerramentasEquip').textContent));
    ok('a aba "Equipamentos" abre dentro de Ferramentas', montar.visivel && /Equipamentos/.test(montar.abas), montar.abas);
    ok('sem cadastro, convida a cadastrar', vazio);

    await page.evaluate(() => eqVista('cadastro'));
    await page.waitForSelector('#eqLoteBase');
    await page.fill('#eqLoteBase', 'Notebook');
    await page.fill('#eqLoteDe', '1');
    await page.fill('#eqLoteAte', '15');
    await page.fill('#eqLoteGrupo', 'Carrinho 1');
    await page.click('#tabFerramentasEquip button:has-text("Adicionar")');
    await ate(() => page.evaluate(() => ((window.__fakeBanco.docs['app_data/equip_school_77'] || {}).equipamentos || []).length === 15));
    const cad = await page.evaluate(() => window.__fakeBanco.docs['app_data/equip_school_77'].equipamentos);
    ok('cadastrou Notebook 01 a 15 no documento da escola', cad.length === 15 && cad[14].rotulo === 'Notebook 15' && cad[0].grupo === 'Carrinho 1');
    const id15 = cad[14].id;
    await page.evaluate((id) => eqMarcarDefeito(id, 'não liga'), id15);
    await ate(() => page.evaluate((id) => window.__fakeBanco.docs['app_data/equip_school_77'].equipamentos.find(e => e.id === id).situacao === 'defeito', id15));
    const def = await page.evaluate(() => document.getElementById('tabFerramentasEquip').textContent);
    ok('marcar com defeito aparece no aviso do cadastro', /Com defeito agora: Notebook 15/.test(def));
    await foto(page, 'equip-1-cadastro');

    // -----------------------------------------------------------------------
    console.log('\n3. Reservar pela disponibilidade');
    // -----------------------------------------------------------------------
    await page.evaluate(() => eqVista('agenda'));
    await ate(() => page.evaluate(() => !!document.querySelector('#tabFerramentasEquip .eq-cel')));
    const tab = await page.evaluate(() => Array.from(document.querySelectorAll('#tabFerramentasEquip .eq-cel')).map(b => b.textContent.replace(/\s+/g, ' ').trim()));
    ok('tabela: 3 aulas (o café fica fora), 14 livres de 15', tab.length === 3 && /^14 livres de 15 · 1 c\/ defeito/.test(tab[0]), tab.join(' | '));
    await foto(page, 'equip-2-agenda');
    await page.click('#tabFerramentasEquip .eq-cel >> nth=0');
    await page.waitForSelector('#eqModalReserva');
    const f = await page.evaluate(() => { const s = eqEstado(); return { turma: document.querySelector('#eqModalReserva select').value, texto: document.getElementById('eqModalReserva').textContent }; });
    ok('a turma da aula (1º A) vem marcada', f.turma === '10');
    ok('5 para usar (5 estudantes) + 1 para troca', /5 para usar \+ 1 para troca/.test(f.texto), (f.texto.match(/\d+ para usar[^.]*/) || [''])[0]);
    await foto(page, 'equip-3-reservar');
    await page.click('#eqSalvarReserva');
    await ate(() => page.evaluate(() => !document.getElementById('eqModalReserva')));
    const mes = await page.evaluate(() => EQUIPOPS.mesDe(EQUIPOPS.dataLocal()));
    const rs = await page.evaluate((m) => (window.__fakeBanco.docs['app_data/equip_reservas_school_77_' + m] || {}).reservas || [], mes);
    ok('reserva gravada com 5 + 1 troca, sem o com defeito', rs.length === 1 && rs[0].equipIds.length === 5 && rs[0].reservaTroca.length === 1 && !rs[0].equipIds.includes(id15) && rs[0].turmaNome === '1º A · Matemática' && rs[0].profUid === 'u1');
    ok('a reserva nao leva nome de estudante', !/Souza|Carla|Bruno/.test(JSON.stringify(rs)));

    // -----------------------------------------------------------------------
    console.log('\n4. Outro professor no mesmo horario, e choque de horario');
    // -----------------------------------------------------------------------
    const outro = await page.evaluate(async () => {
        const salvo = { u: currentUser, d: data };
        currentUser = { id: 2, uid: 'u2', nome: 'João Prof', email: 'j@e.com', role: 'professor', schoolId: '77' };
        const auth = window.firebase.auth; window.firebase.auth = () => ({ currentUser: { uid: 'u2' } });
        data = Object.assign(getInitialData(), { turmas: [{ id: 20, nome: '3º C' }], estudantes: [], schoolGrade: salvo.d.schoolGrade });
        await eqRecarregar();
        await eqNovaReserva({ data: EQUIPOPS.dataLocal(), inicio: '07:00', fim: '07:50', tipo: 'notebook', turmaId: 20 });
        await eqCampo('qtd', '20');
        const t1 = document.getElementById('eqModalReserva').textContent;
        await eqCampo('qtd', '4');
        return { t1 };
    });
    ok('para o colega sobram 8 (15 - 6 reservados - 1 com defeito; 20+2 pedidos, faltam 14)', /\(8 livres neste horário\)/.test(outro.t1) && /faltaram 14/.test(outro.t1), (outro.t1.match(/\(\d+ livres[^)]*\)/) || [''])[0]);
    // alguém reserva "no mesmo instante" os que o formulário escolheu:
    const choque = await page.evaluate(async (m) => {
        const doc = window.__fakeBanco.docs['app_data/equip_reservas_school_77_' + m];
        const form = document.querySelectorAll('#eqModalReserva .eq-chip.usar');
        const escolhidos = Array.from(form).map(b => b.textContent);
        const cad = window.__fakeBanco.docs['app_data/equip_school_77'].equipamentos;
        const ids = escolhidos.map(r => cad.find(e => e.rotulo === r).id);
        doc.reservas.push({ id: 'intruso', data: EQUIPOPS.dataLocal(), inicio: '07:20', fim: '08:00', profUid: 'u3', profNome: 'Rosa', turmaNome: '9º A', equipIds: ids.slice(0, 2), reservaTroca: [] });
        await eqSalvarReserva();
        const msg = (document.getElementById('eqErroForm') || {}).textContent || '';
        await eqSalvarReserva();
        const lista = window.__fakeBanco.docs['app_data/equip_reservas_school_77_' + m].reservas;
        const minha = lista.find(r => r.profUid === 'u2');
        return { msg, n: lista.length, minha: minha && minha.equipIds, ids };
    }, mes);
    ok('choque de horario e recusado e explicado', /Alguém acabou de reservar/.test(choque.msg) && /Rosa/.test(choque.msg), choque.msg);
    ok('na segunda tentativa salva com outros livres', choque.n === 3 && choque.minha && choque.minha.length === 4 && !choque.minha.some(id => choque.ids.slice(0, 2).includes(id)));
    await page.evaluate(async () => {
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        window.firebase.auth = () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: () => () => {}, signOut: async () => {} });
    });
    // volta os dados da Maria
    await page.evaluate(() => {
        const dia = new Date().getDay();
        const G = (id, ini, fim, extra) => Object.assign({ id, diaSemana: dia, inicio: ini, fim }, extra || {});
        const grade = [G('b1', '07:00', '07:50'), G('b2', '07:50', '08:40'), G('b3', '08:40', '09:00', { tipo: 'cafe' }), G('b4', '09:00', '09:50')];
        const nomes = ['Carla Dias', 'Ana Souza', 'Bruno Lima', 'Eva Rocha', 'Davi Melo'];
        data = Object.assign(getInitialData(), {
            turmas: [{ id: 10, nome: '1º A', disciplina: 'Matemática' }, { id: 11, nome: '2º B', disciplina: 'Matemática' }],
            estudantes: nomes.map((n, i) => ({ id: 100 + i, nome_completo: n, id_turma: 10, status: 'Ativo' })),
            horariosAulas: [{ id_bloco: 'b1', tipo: 'aula', id_turma: 10 }, { id_bloco: 'b2', tipo: 'aula', id_turma: 11 }],
            schoolGrade: grade
        });
    });

    // -----------------------------------------------------------------------
    console.log('\n5. No Início, embaixo da turma');
    // -----------------------------------------------------------------------
    await page.evaluate(async () => { await eqRecarregar(); showScreen('dashboard'); await renderDashboard(); });
    await ate(() => page.evaluate(() => /💻 Notebook/.test((document.querySelector('#agendaHoje .agd-equip') || {}).textContent || '')));
    const inicio = await page.evaluate(() => Array.from(document.querySelectorAll('#agendaHoje .agd-equip')).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    ok('embaixo do 1º A: os notebooks reservados + troca + botões', inicio.length === 2 && /💻 Notebook \d\d–\d\d \(\+1 troca\)/.test(inicio[0]) && /Link alunos/.test(inicio[0]) && /Lançar/.test(inicio[0]), inicio.join(' | '));
    ok('embaixo do 2º B (sem reserva): atalho para reservar', /reservar equipamento/.test(inicio[1]));
    await foto(page, 'equip-4-inicio');

    // -----------------------------------------------------------------------
    console.log('\n6. Link para os alunos');
    // -----------------------------------------------------------------------
    await page.click('#agendaHoje .agd-equip button:has-text("Link alunos")');
    await ate(() => page.evaluate(() => /is\.gd\//.test((document.querySelector('#eqAula .codigo') || {}).textContent || '')));
    const sess = await page.evaluate(() => {
        const codigo = eqEstado().aula.sessao.codigo;
        return { codigo, doc: window.__fakeBanco.docs['equip_sessoes/' + codigo], grande: document.querySelector('#eqAula .codigo').textContent.trim(),
                 link: document.querySelector('#eqAula .link').textContent, sessoes: Object.keys(window.__fakeBanco.docs).filter(k => /^equip_sessoes\/\d+$/.test(k)).length };
    });
    ok('link curto is.gd/<6 numeros> na tela, com o codigo para digitar', /^\d{6}$/.test(sess.codigo) && sess.grande === 'is.gd/' + sess.codigo && new RegExp('digite ' + sess.codigo).test(sess.link), sess.grande + ' | ' + sess.link);
    ok('codigo ja usado no is.gd: sorteia outro e apaga a sessao do primeiro', pedidosIsgd.length === 2 && pedidosIsgd[0].shorturl !== sess.codigo && sess.sessoes === 1, JSON.stringify(pedidosIsgd.map(p => p.shorturl)));
    ok('o is.gd aponta para equipamento.html?c=<codigo>', pedidosIsgd[1].url.endsWith('/equipamento.html?c=' + sess.codigo), pedidosIsgd[1].url);
    ok('sessao: do professor, total 5, 6 equipamentos, SEM nome', sess.doc && sess.doc.hostUid === 'u1' && sess.doc.total === 5 && sess.doc.equipamentos.length === 6 && !/Souza|Carla|Bruno|Eva|Davi/.test(JSON.stringify(sess.doc)));
    const lista = await page.evaluate(() => Array.from(document.querySelectorAll('#eqAula tbody tr')).map(tr => tr.children[0].textContent + ' ' + tr.children[1].textContent));
    ok('painel numera a turma em ordem alfabetica', lista.join(',') === '1 Ana Souza,2 Bruno Lima,3 Carla Dias,4 Davi Melo,5 Eva Rocha', lista.join(','));
    await foto(page, 'equip-5-painel');

    // -----------------------------------------------------------------------
    console.log('\n7. O estudante informa (equipamento.html)');
    // -----------------------------------------------------------------------
    await page.evaluate((c) => {
        const f = document.createElement('iframe');
        f.id = 'alunoFrame'; f.src = 'equipamento.html?c=' + c;
        f.style.cssText = 'position:fixed; right:10px; bottom:10px; width:390px; height:700px; z-index:2000; border:2px solid #000; background:#fff';
        document.body.appendChild(f);
    }, sess.codigo);
    const fr = await (await page.waitForSelector('#alunoFrame')).contentFrame();
    await fr.waitForSelector('[data-n="3"]');
    const nums = await fr.$$eval('[data-n]', bs => bs.length);
    ok('estudante ve os numeros 1 a 5 (sem nomes)', nums === 5 && !/Souza|Carla/.test(await fr.textContent('body')));
    await fr.click('[data-n="3"]');
    await fr.waitForSelector('[data-eq]');
    const botoesEq = await fr.$$eval('[data-eq]', bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
    await foto(page, 'equip-6-aluno-equip');
    await fr.click('[data-eq] >> nth=1');
    await fr.waitForSelector('#bDef');
    const pronto = (await fr.textContent('body')).replace(/\s+/g, ' ');
    ok('pronto em 2 toques: nº 3 + equipamento', /Pronto!/.test(pronto) && /Nº 3 · Notebook/.test(pronto), botoesEq.slice(0, 3).join(','));
    await ate(() => page.evaluate(() => /Notebook/.test(document.querySelector('#eqAula tbody tr:nth-child(1) select') ? Array.from(document.querySelectorAll('#eqAula tbody tr')).find(tr => tr.children[0].textContent === '3').querySelector('select').selectedOptions[0].textContent : '')));
    const linha3 = await page.evaluate(() => { const tr = Array.from(document.querySelectorAll('#eqAula tbody tr')).find(t => t.children[0].textContent === '3'); return tr.querySelector('select').selectedOptions[0].textContent; });
    ok('o professor ve na hora: Carla Dias (nº 3) com o notebook', /Notebook/.test(linha3), linha3);
    // Nao funciona -> troca
    await fr.click('#bDef');
    await fr.waitForSelector('[data-eq]');
    const ultimo = await fr.$$eval('[data-eq]', bs => bs.length);
    await fr.click('[data-eq] >> nth=' + (ultimo - 1));
    await fr.waitForSelector('#bDef');
    const pronto2 = (await fr.textContent('body')).replace(/\s+/g, ' ');
    ok('troca por defeito confirmada ao estudante', /O professor já sabe do defeito/.test(pronto2));
    await ate(() => page.evaluate(() => /🔧/.test((Array.from(document.querySelectorAll('#eqAula tbody tr')).find(t => t.children[0].textContent === '3') || {}).textContent || '')));
    const depois = await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('#eqAula tbody tr')).find(t => t.children[0].textContent === '3');
        return { trocas: tr.children[3].textContent.replace(/\s+/g, ' ').trim(), atual: tr.querySelector('select').selectedOptions[0].textContent };
    });
    ok('painel mostra a troca por defeito', /🔧 Notebook \d\d → Notebook \d\d/.test(depois.trocas), depois.trocas);
    const defeitoCad = await ate(() => page.evaluate(() => window.__fakeBanco.docs['app_data/equip_school_77'].equipamentos.filter(e => e.situacao === 'defeito').length === 2));
    const obsDef = await page.evaluate(() => (window.__fakeBanco.docs['app_data/equip_school_77'].equipamentos.find(e => e.situacao === 'defeito' && e.defeito && /Relatado/.test(e.defeito.obs)) || {}).defeito);
    ok('o equipamento com defeito vai para o cadastro (sai da agenda)', defeitoCad && obsDef && /nº 3/.test(obsDef.obs), obsDef && obsDef.obs);
    // Errei meu numero: 3 -> 4
    await fr.click('#bNum');
    await fr.click('[data-n="4"]');
    await fr.waitForSelector('#bDef');
    await ate(() => page.evaluate(() => /Notebook/.test((Array.from(document.querySelectorAll('#eqAula tbody tr')).find(t => t.children[0].textContent === '4') || { querySelector: () => null }).querySelector('select').selectedOptions[0].textContent)));
    const corrigiu = await page.evaluate(() => {
        const sel = n => Array.from(document.querySelectorAll('#eqAula tbody tr')).find(t => t.children[0].textContent === String(n)).querySelector('select').selectedOptions[0].textContent;
        return { n3: sel(3), n4: sel(4) };
    });
    ok('"Errei meu número" passa o equipamento do 3 para o 4', corrigiu.n3 === '—' && /Notebook/.test(corrigiu.n4), JSON.stringify(corrigiu));
    await foto(page, 'equip-7-painel-depois');

    // -----------------------------------------------------------------------
    console.log('\n8. Lançar à mão e relatório do dia');
    // -----------------------------------------------------------------------
    await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('#eqAula tbody tr')).find(t => t.children[0].textContent === '1');
        const s = tr.querySelector('select'); s.value = s.options[1].value; s.dispatchEvent(new Event('change'));
    });
    const dia = await page.evaluate(() => EQUIPOPS.dataLocal());
    await ate(() => page.evaluate((d) => {
        const u = window.__fakeBanco.docs['app_data/equip_uso_school_77_' + d];
        return u && Object.values(u.usos)[0].registros.some(r => r.origem === 'prof' && r.num === 1);
    }, dia), 4000);
    const uso = await page.evaluate((d) => window.__fakeBanco.docs['app_data/equip_uso_school_77_' + d], dia);
    const regsUso = uso ? Object.values(uso.usos)[0].registros : [];
    ok('uso do dia gravado: estudante + professor', regsUso.some(r => r.origem === 'aluno') && regsUso.some(r => r.origem === 'prof' && r.num === 1), regsUso.length + ' registros');
    ok('uso do dia SEM nome de estudante', !/Souza|Carla|Bruno|Eva|Davi/.test(JSON.stringify(uso)));
    const local = await page.evaluate(() => JSON.stringify(data.equipNumeros || {}) + (campoEhPessoal('equipNumeros') ? ' PESSOAL' : ''));
    ok('no aparelho fica a foto numero -> estudante (campo pessoal)', /"3":100/.test(local) && / PESSOAL$/.test(local), local.slice(0, 80));

    await page.evaluate(() => eqEncerrarLink());
    await ate(() => page.evaluate((c) => !window.__fakeBanco.docs['equip_sessoes/' + c], sess.codigo));
    const restou = await page.evaluate((c) => Object.keys(window.__fakeBanco.docs).filter(k => k.indexOf('equip_sessoes/' + c) === 0).length, sess.codigo);
    ok('fechar o link apaga a sessao e os registros dela', restou === 0);
    await page.evaluate(() => { document.getElementById('alunoFrame').remove(); eqFecharAula(); showScreen('ferramentas'); showFerramentasTab('equip'); eqVista('relatorio'); });
    await ate(() => page.evaluate(() => /Uso dos equipamentos/.test(document.getElementById('tabFerramentasEquip').textContent)));
    await page.waitForTimeout(300);
    const relTela = await page.evaluate(() => document.getElementById('tabFerramentasEquip').textContent.replace(/\s+/g, ' '));
    ok('relatorio mostra 3 reservas e o nome nas minhas turmas', /3 reserva\(s\)/.test(relTela) && /Ana Souza/.test(relTela) && /Davi Melo/.test(relTela), (relTela.match(/\d reserva\(s\)[^R]*/) || [''])[0]);
    ok('relatorio mostra a troca e o defeito', /\(defeito\)/.test(relTela) && /Relatado com defeito/.test(relTela));
    ok('na turma do colega, sem nome', /3º C/.test(relTela) && /Ninguém informou/.test(relTela));
    const csvTela = await page.evaluate(() => EQUIPOPS.relatorioCsv(EQUIPOPS.relatorioDoDia(eqEstado().dia, eqEstado().reservas[EQUIPOPS.mesDe(eqEstado().dia)], eqEstado().usos[eqEstado().dia], eqEstado().cadastro, () => '')));
    ok('CSV do dia com as 3 reservas', csvTela.split('\n').length >= 5 && /3º C/.test(csvTela) && /9º A/.test(csvTela));
    await foto(page, 'equip-8-relatorio');

    // -----------------------------------------------------------------------
    console.log('\n9. Defeito depois de reservado: o sistema propõe a troca');
    // -----------------------------------------------------------------------
    const prop = await page.evaluate(async () => {
        eqVista('agenda');
        await new Promise(r => setTimeout(r, 300));
        return Array.from(document.querySelectorAll('#tabFerramentasEquip .eq-res.minha .eq-aviso')).map(e => e.textContent.replace(/\s+/g, ' ').trim());
    });
    ok('a reserva mostra o defeito e a troca proposta', prop.length === 1 && /está com defeito → trocar por Notebook/.test(prop[0]) && /Trocar agora/.test(prop[0]), prop[0]);
    await page.click('#tabFerramentasEquip button:has-text("Trocar agora")');
    await ate(() => page.evaluate(() => !document.querySelector('#tabFerramentasEquip .eq-res.minha .eq-aviso')));
    const trocou = await page.evaluate((m) => {
        const r = window.__fakeBanco.docs['app_data/equip_reservas_school_77_' + m].reservas.find(x => x.profUid === 'u1');
        const cad = window.__fakeBanco.docs['app_data/equip_school_77'].equipamentos;
        return { ruins: r.equipIds.filter(id => cad.find(e => e.id === id).situacao !== 'ok').length, troca: r.reservaTroca.length, n: r.equipIds.length };
    }, mes);
    ok('"Trocar agora" tira o com defeito e usa a reserva de troca', trocou.ruins === 0 && trocou.n === 5 && trocou.troca === 0, JSON.stringify(trocou));

    // celular
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    ok('no celular a aba nao passa da largura da tela', largura <= 400, String(largura));
    await foto(page, 'equip-9-celular');

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S):\n - ' + falhas.join('\n - ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
