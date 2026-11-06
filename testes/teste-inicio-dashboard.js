// O Início do professor: Agenda do Dia (cronograma), card de Ferramentas e banner de Novidades.
//
// O que este teste cobre:
//   1. horário fixo da gestão (café, almoço) aparece com o NOME do evento, não "Livre";
//   2. horário de tutoria (fixo da gestão ou escolhido na Minha Agenda) mostra os estudantes
//      agendados naquele horário, com "Registrar"; tutoria agendada fora da grade entra na hora;
//   3. o antigo card "Tutorias/Ações" saiu; o card "Ferramentas" abre a aba certa;
//   4. o banner de Novidades gira (setas) e só aparece no computador.
//
// Como rodar (ver testes/LEIAME.md):
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-inicio-dashboard.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FAKE = fs.readFileSync(path.join(__dirname, 'teste-tutoriais.js'), 'utf8').match(/const FAKE = (\(\) => \{[\s\S]*?\n\};)/)[1].replace(/;$/, '');

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}

async function abrir(browser, viewport) {
    const ctx = await browser.newContext({ viewport });
    await ctx.route(/(gstatic\.com|googleapis\.com|accounts\.google\.com|googletagmanager|google-analytics|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/, r => r.abort());
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => { falhas.push('erro de JS: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript('(' + FAKE + ')()');
    await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await page.evaluate(async () => {
        const hoje = new Date(); const dia = hoje.getDay(); const iso = getTodayString();
        const G = (id, ini, fim, extra) => Object.assign({ id, diaSemana: dia, inicio: ini, fim }, extra || {});
        await window.firebase.firestore().collection('app_data').doc('app_data_school_77_gestor').set({
            turmas: [], tiposHorarioFixo: [{ id: 'tutoria', nome: '🎓 Tutoria' }, { id: 'cafe', nome: '☕ Café' }, { id: 'almoco', nome: '🍽️ Almoço' }],
            gradeHoraria: [G('b1', '07:00', '07:50'), G('b2', '07:50', '08:40'), G('b3', '08:40', '09:00', { tipo: 'cafe' }), G('b4', '09:00', '09:20'),
                G('b6', '11:50', '12:50', { tipo: 'almoco' }), G('b7', '14:30', '14:50', { tipo: 'tutoria' }), G('b9', '14:50', '15:10')]
        });
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), {
            turmas: [{ id: 5, nome: '7A', disciplina: 'Arte' }, { id: 'tx7b', nome: '7B', disciplina: 'Arte' }],
            horariosAulas: [{ id_bloco: 'b1', tipo: 'aula', id_turma: 5 }, { id_bloco: 'b2', tipo: 'aula', id_turma: 'tx7b' }, { id_bloco: 'b4', tipo: 'tutoria' }],
            tutorados: [{ id: 41, nome_estudante: 'Ana Souza' }, { id: 42, nome_estudante: 'Bruno Lima' }, { id: 43, nome_estudante: 'Caio Reis' }],
            agendamentos: [{ id: 1, data: iso, inicio: '14:30', fim: '14:50', tutoradoId: 41 },
                           { id: 2, data: iso, inicio: '09:00', fim: '09:20', tutoradoId: 43 },
                           { id: 3, data: iso, inicio: '16:10', fim: '16:30', tutoradoId: 42 },
                           { id: 4, data: iso, inicio: '11:00', fim: '11:20', tutoradoId: null }],
            configBimestres: []
        });
        window.dadosCarregados = true; currentViewMode = 'professor';
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        renderProfessorPanel();
    });
    await page.waitForTimeout(900);
    return { ctx, page };
}

(async () => {
    const browser = await chromium.launch(process.env.PROFSIS_CHROMIUM ? { executablePath: process.env.PROFSIS_CHROMIUM } : {});
    const { ctx, page } = await abrir(browser, { width: 1366, height: 900 });

    console.log('\n1 e 2. Agenda do Dia');
    const ag = await page.evaluate(() => {
        const box = document.getElementById('agendaHoje');
        const linhas = Array.from(box.querySelectorAll('.agd-lista > *')).map(e => e.textContent.replace(/\s+/g, ' ').trim());
        return { linhas, texto: box.textContent.replace(/\s+/g, ' ') };
    });
    const linha = (ini) => ag.linhas.find(l => l.indexOf(ini) === 0) || '';
    ok('café aparece com o nome', /Café/.test(linha('08:40')) && !/Livre/.test(linha('08:40')), linha('08:40'));
    ok('almoço aparece com o nome', /Almoço/.test(linha('11:50')), linha('11:50'));
    ok('tutoria fixa da gestão mostra o estudante agendado', /Tutoria/.test(linha('14:30')) && /Ana Souza/.test(linha('14:30')) && /Registrar/.test(linha('14:30')), linha('14:30'));
    ok('tutoria da Minha Agenda mostra o estudante agendado', /Tutoria/.test(linha('09:00')) && /Caio Reis/.test(linha('09:00')), linha('09:00'));
    ok('tutoria fora da grade entra no cronograma, na ordem', /Bruno Lima/.test(linha('16:10')) && ag.linhas.indexOf(linha('16:10')) === ag.linhas.length - 1, ag.linhas.join(' | '));
    ok('horário vago continua "Livre"', /Livre/.test(linha('14:50')), linha('14:50'));
    ok('agendamento sem estudante não aparece', !/11:00/.test(ag.texto));
    ok('cada estudante aparece uma vez só', (ag.texto.match(/Ana Souza/g) || []).length === 1);

    // "Ir para Turma" abre a turma — também quando o id da turma é texto (era o defeito:
    // as aspas do id fechavam o onclick e o botão não fazia nada).
    for (const nome of ['7A', '7B']) {
        await page.evaluate(() => showScreen('dashboard')); await page.waitForTimeout(500);
        await page.click(`#agendaHoje .agd-aula:has-text("${nome} · Arte")`);
        await page.waitForTimeout(600);
        const r = await page.evaluate(() => ({ tela: (document.querySelector('#appContainer .screen.active') || {}).id,
            titulo: (document.getElementById('turmaDetalheTitulo') || {}).textContent }));
        ok(`"Ir para Turma" da ${nome} abre a turma`, r.tela === 'turmaDetalhe' && r.titulo.indexOf(nome) === 0, JSON.stringify(r));
    }

    console.log('\n3. Card de Ferramentas');
    const cards = await page.evaluate(() => ({
        tutorias: !!document.getElementById('tutoriasHoje') && document.getElementById('tutoriasHoje').offsetParent !== null,
        atalhos: Array.from(document.querySelectorAll('#atalhosFerramentas .dash-ferr-nome')).map(e => e.textContent)
    }));
    ok('o card "Tutorias/Ações" saiu do Início', !cards.tutorias);
    ok('o card Ferramentas tem PDF, Imagem, Ateliê, Editor de vídeo, Na Mosca! e Baixar vídeo',
       ['PDF', 'Imagem', 'Ateliê', 'Editor de vídeo', 'Na Mosca!', 'Baixar vídeo'].every(n => cards.atalhos.indexOf(n) !== -1), cards.atalhos.join(' | '));
    for (const [nome, aba] of [['Ateliê', 'tabFerramentasAtelie'], ['PDF', 'tabFerramentasPdf'], ['Na Mosca!', 'tabFerramentasQuiz']]) {
        await page.evaluate(() => showScreen('dashboard'));
        await page.waitForTimeout(600);
        await page.click(`#atalhosFerramentas .dash-ferr-item:has(.dash-ferr-nome:text-is("${nome}"))`);
        await page.waitForTimeout(500);
        const r = await page.evaluate((aba) => ({
            tela: (document.querySelector('#appContainer .screen.active') || {}).id,
            aba: (document.getElementById(aba) || {}).style && document.getElementById(aba).style.display,
            menu: !!document.querySelector('#appContainer nav.app-nav button.active[onclick*="ferramentas"]')
        }), aba);
        ok(`"${nome}" abre Ferramentas na aba certa (e marca o menu)`, r.tela === 'ferramentas' && r.aba === 'block' && r.menu, JSON.stringify(r));
    }

    // Todo atalho e todo botão de novidade roda sem erro de JS (quem não assina vê o aviso do plano).
    const errosAntes = falhas.length;
    const nAtalhos = await page.evaluate(() => ATALHOS_DASHBOARD_FERRAMENTAS.length);
    for (let i = 0; i < nAtalhos; i++) {
        await page.evaluate(() => showScreen('dashboard')); await page.waitForTimeout(400);
        await page.evaluate((i) => document.querySelector(`#atalhosFerramentas .dash-ferr-item[data-atalho="${i}"]`).click(), i);
        await page.waitForTimeout(400);
    }
    const nNov = await page.evaluate(() => NOVIDADES_SISPROF.length);
    for (let i = 0; i < nNov; i++) {
        await page.evaluate(() => { showScreen('dashboard'); document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); });
        await page.waitForTimeout(400);
        await page.evaluate((i) => abrirNovidade(i), i);
        await page.waitForTimeout(500);
    }
    await page.evaluate(() => document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')));
    ok('todos os ' + nAtalhos + ' atalhos e as ' + nNov + ' novidades abrem sem erro de JS', falhas.length === errosAntes);

    // Com o plano liberado, o atalho cai DENTRO da ferramenta, não só na aba.
    await page.evaluate(() => { window.exigirPremium = () => true; window.ehPremium = () => true; });
    const dentro = {};
    for (const [nome, sel] of [["Tirar marca d'água", '#tabFerramentasImg'], ['Baixar vídeo', '#tabFerramentasVideo']]) {
        await page.evaluate(() => showScreen('dashboard')); await page.waitForTimeout(400);
        await page.evaluate((n) => Array.from(document.querySelectorAll('#atalhosFerramentas .dash-ferr-item')).find(b => b.querySelector('.dash-ferr-nome').textContent === n).click(), nome);
        await page.waitForTimeout(700);
        dentro[nome] = await page.evaluate((sel) => document.querySelector(sel).innerText.slice(0, 400), sel);
    }
    ok("\"Tirar marca d'água\" abre a própria ferramenta", /marca d.água/i.test(dentro["Tirar marca d'água"]) && !/Endireitar/.test(dentro["Tirar marca d'água"]), dentro["Tirar marca d'água"].slice(0, 80));
    ok('"Baixar vídeo" abre a própria ferramenta', /Link do vídeo/i.test(dentro['Baixar vídeo']), dentro['Baixar vídeo'].slice(0, 80));

    console.log('\n4. Novidades');
    await page.evaluate(() => showScreen('dashboard'));
    await page.waitForTimeout(600);
    const antes = await page.evaluate(() => ({
        visivel: !!document.getElementById('novidadesDashboard').offsetParent,
        titulo: document.querySelector('#novidadesDashboard .nov-slide.ativo .nov-titulo').textContent,
        topo: document.getElementById('novidadesDashboard').getBoundingClientRect().top,
        topoAgenda: document.getElementById('agendaHoje').closest('.card').getBoundingClientRect().top
    }));
    ok('no computador o banner aparece ao lado dos outros cards', antes.visivel && Math.abs(antes.topo - antes.topoAgenda) < 2, JSON.stringify(antes));
    await page.click('#novidadesDashboard .nov-setas button[aria-label="Próxima novidade"]');
    await page.waitForTimeout(300);
    const depois = await page.evaluate(() => document.querySelectorAll('#novidadesDashboard .nov-slide.ativo').length + '|' +
        document.querySelector('#novidadesDashboard .nov-slide.ativo .nov-titulo').textContent);
    ok('a seta passa para a próxima novidade', depois.split('|')[0] === '1' && depois.split('|')[1] !== antes.titulo, depois);
    await page.click('#novidadesDashboard .nov-pontos button:first-child');
    await page.waitForTimeout(300);
    const volta = await page.evaluate(() => document.querySelector('#novidadesDashboard .nov-slide.ativo .nov-titulo').textContent);
    ok('o primeiro pontinho volta para a primeira', volta === antes.titulo, volta);
    await ctx.close();

    const cel = await abrir(browser, { width: 400, height: 860 });
    const noCel = await cel.page.evaluate(() => ({
        banner: !!document.getElementById('novidadesDashboard').offsetParent,
        ferr: !!document.getElementById('atalhosFerramentas').offsetParent,
        largura: document.documentElement.scrollWidth
    }));
    ok('no celular o banner some, o card Ferramentas fica e não sobra rolagem de lado', !noCel.banner && noCel.ferr && noCel.largura <= 400, JSON.stringify(noCel));
    await cel.ctx.close();

    await browser.close();
    console.log(falhas.length ? '\n' + falhas.length + ' falha(s): ' + falhas.join('; ') : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})();
