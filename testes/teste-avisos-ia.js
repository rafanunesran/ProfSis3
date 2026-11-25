// "📥 Aviso da gestão" (avisos_ia.js): colar a mensagem/print do WhatsApp, a IA monta a lista,
// a pessoa confere item por item e só então salva.
//
// O que este teste cobre (IA falsa, Firestore falso):
//   1. professor: o pedido à IA leva o texto, as fotos e os nomes das TURMAS, e nenhum nome da
//      lista de estudantes; a revisão mostra compromisso/lembrete; faltoso vira lembrete;
//      item sem data não salva; o que já está na agenda da escola vem desmarcado;
//   2. salvar grava em data.compromissos e o Início mostra Hoje / 🔔 Lembretes / Próximos;
//      ✓ feito e apagar;
//   3. o compromisso que a gestão publicou (eventosEscola) chega ao Início do professor com 🏫;
//   4. gestão: faltoso casa com o estudante certo (nome curto, turma escrita "7º A"), nome
//      ambíguo pede escolha, desconhecido vem desmarcado; "todos os professores" pergunta antes
//      e grava em eventosEscola; o faltoso vai para registrosAdministrativos;
//   5. chamarIAEstruturada com foto: manda "imagens" ao servidor próprio; servidor antigo
//      (sem leuImagens) dá erro claro; Minha Agenda lista.
//
// Como rodar (ver testes/LEIAME.md):
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   PROFSIS_CHROMIUM=/opt/pw-browsers/chromium node testes/teste-avisos-ia.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FAKE = fs.readFileSync(path.join(__dirname, 'teste-tutoriais.js'), 'utf8').match(/const FAKE = (\(\) => \{[\s\S]*?\n\};)/)[1].replace(/;$/, '');
const FOTOS = process.env.PROFSIS_FOTOS || '';

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra && !condicao ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}

async function abrir(browser, viewport, modo) {
    const ctx = await browser.newContext({ viewport });
    await ctx.route(/(gstatic\.com|googleapis\.com|accounts\.google\.com|googletagmanager|google-analytics|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/, r => r.abort());
    const page = await ctx.newPage();
    page.__dialogos = [];
    page.on('dialog', d => { page.__dialogos.push(d.message()); d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });
    await page.addInitScript('(' + FAKE + ')()');
    await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await page.evaluate(async (modo) => {
        const hoje = hojeLocalAviso();
        await window.firebase.firestore().collection('app_data').doc('app_data_school_77_gestor').set({
            turmas: [], gradeHoraria: [], tiposHorarioFixo: [],
            eventosEscola: [{ id: 'e1', tipo: 'compromisso', titulo: 'Conselho de classe', data: somarDiasAviso(hoje, 3), inicio: '18:00', fim: '', local: 'Sala 4', descricao: '', lembrete: '2_dias' }]
        });
        currentUser = { id: 1, uid: 'u1', nome: 'Maria Prof', email: 'm@e.com', role: modo, schoolId: '77' };
        data = Object.assign(getInitialData(), {
            turmas: [{ id: 1, nome: '7º Ano A', disciplina: 'Arte' }, { id: 2, nome: '8B', disciplina: 'Arte' }],
            estudantes: [
                { id: 11, id_turma: 1, nome_completo: 'Manuela Veronez Silva', status: 'Ativo' },
                { id: 12, id_turma: 1, nome_completo: 'Bruno Lima', status: 'Ativo' },
                { id: 13, id_turma: 2, nome_completo: 'Pedro Henrique Souza', status: 'Ativo' },
                { id: 14, id_turma: 2, nome_completo: 'Pedro Alves', status: 'Ativo' },
                { id: 15, id_turma: 1, nome_completo: 'Carlos Saiu', status: 'Transferido' }],
            configBimestres: [], registrosAdministrativos: []
        });
        if (modo === 'gestor') data.eventosEscola = [];
        else { data.turmas[0].masterId = 'm7a'; data.turmas[1].masterId = 'm8b'; }
        window.dadosCarregados = true; currentViewMode = modo;
        window.__persistiu = 0;
        const persistirOriginal = persistirDados;
        persistirDados = async () => { window.__persistiu++; };
        window.__pedidos = [];
        window.__respostaIA = null;
        chamarIAEstruturada = async (prompt, btn, opcoes) => { window.__pedidos.push({ prompt, imagens: (opcoes && opcoes.imagens) || [] }); return JSON.parse(JSON.stringify(window.__respostaIA)); };
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        if (modo === 'gestor') { if (typeof renderGestorPanel === 'function') renderGestorPanel(); }
        else renderProfessorPanel();
    }, modo);
    await page.waitForTimeout(1200);
    return { ctx, page };
}

(async () => {
    const browser = await chromium.launch(process.env.PROFSIS_CHROMIUM ? { executablePath: process.env.PROFSIS_CHROMIUM } : {});

    // ====================== PROFESSOR ======================
    let { ctx, page } = await abrir(browser, { width: 1366, height: 900 }, 'professor');

    console.log('\n1. Professor: ler o aviso');
    const r1 = await page.evaluate(async () => {
        const hoje = hojeLocalAviso();
        const r = { temBotao: !!document.querySelector('#compromissosDashboard button[onclick*="abrirAvisoGestaoIA"]') };
        abrirAvisoGestaoIA();
        r.modal = document.getElementById('modalAvisoIA').classList.contains('active');
        document.getElementById('avisoIATexto').value = 'Bom dia! Reunião pedagógica amanhã 18h30 na sala dos professores. Entregar notas até sexta. Alunos faltosos: Manu Veronez 7A.';
        // foto de 2x2 px
        const c = document.createElement('canvas'); c.width = 2; c.height = 2;
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        await adicionarFotosAviso([new File([blob], 'print.png', { type: 'image/png' })]);
        r.fotos = document.querySelectorAll('#avisoIAFotos img').length;
        window.__respostaIA = { acoes: [
            { tipo: 'compromisso', titulo: 'Reunião pedagógica', data: somarDiasAviso(hoje, 1), inicio: '18:30', fim: '', local: 'Sala dos professores', descricao: '', paraTodos: true, lembrete: 'no_dia' },
            { tipo: 'lembrete', titulo: 'Entregar notas do bimestre', data: somarDiasAviso(hoje, 2), paraTodos: false, lembrete: '2_dias' },
            { tipo: 'faltoso', nome: 'Manu Veronez', turma: '7A', observacao: '' },
            { tipo: 'atestado', nome: 'Bruno', turma: '7A', dataInicio: hoje, dias: 3 },
            { tipo: 'compromisso', titulo: 'Formação sem data', data: 'quinta', inicio: '25:00' },
            { tipo: 'compromisso', titulo: 'Conselho de classe', data: somarDiasAviso(hoje, 3), inicio: '18:00' },
            { tipo: 'qualquer', titulo: 'x' }
        ] };
        await lerAvisoComIA();
        const ped = window.__pedidos[0] || { prompt: '', imagens: [] };
        r.prompt = ped.prompt; r.nImgs = ped.imagens.length; r.mime = ped.imagens[0] && ped.imagens[0].mime;
        r.titulo = document.getElementById('avisoIATitulo').textContent;
        r.itens = avisoIA.itens.map(i => ({ tipo: i.tipo, titulo: i.titulo, nome: i.nome, est: i.estudanteId, dias: i.dias, usar: i.usar, data: i.data, inicio: i.inicio, paraTodos: i.paraTodos, avisos: i.avisos }));
        r.cards = document.querySelectorAll('.aviso-ia-item').length;
        r.temEquipe = /Compartilhar com a equipe/.test(document.getElementById('avisoIAItens').textContent);
        return r;
    });
    ok('botão "📥 Aviso da gestão" no Início', r1.temBotao);
    ok('a tela abre e aceita foto', r1.modal && r1.fotos === 1);
    ok('pedido leva o texto e a foto (JPEG)', /Reunião pedagógica amanhã/.test(r1.prompt) && r1.nImgs === 1 && r1.mime === 'image/jpeg');
    ok('pedido leva os nomes das turmas', /7º Ano A/.test(r1.prompt) && /8B/.test(r1.prompt));
    ok('pedido NÃO leva a lista de estudantes', !/Bruno|Pedro|Silva|Carlos/.test(r1.prompt));
    ok('abre a revisão', /Confira/.test(r1.titulo) && r1.cards === 6, r1.cards);
    const it = (t) => r1.itens.find(i => (i.titulo || i.nome).indexOf(t) === 0) || {};
    ok('compromisso com dia e hora', it('Reunião').data && it('Reunião').inicio === '18:30' && it('Reunião').usar);
    ok('professor também compartilha com a equipe (padrão ligado, IA pode desligar)', r1.temEquipe && it('Reunião').paraTodos === true && it('Entregar').paraTodos === false);
    ok('professor lança faltoso (casa com Manuela)', it('Manu').tipo === 'faltoso' && String(it('Manu').est) === '11');
    ok('professor lança atestado (Bruno, 3 dias)', it('Bruno').tipo === 'atestado' && String(it('Bruno').est) === '12' && it('Bruno').dias === 3);
    ok('data e hora inválidas ficam vazias com aviso', it('Formação').data === '' && it('Formação').inicio === '' && /data/.test(it('Formação').avisos.join()));
    ok('o que a gestão já publicou vem desmarcado', it('Conselho').usar === false && /gestão já colocou/.test(it('Conselho').avisos.join()));
    ok('tipo desconhecido é ignorado', !r1.itens.some(i => i.titulo === 'x'));

    if (FOTOS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(FOTOS, 'revisao-computador.png') }); }

    console.log('\n2. Professor: salvar compartilhado e ver o que a equipe lançou');
    const r2 = await page.evaluate(async () => {
        const r = {}; const hoje = hojeLocalAviso();
        const sem = avisoIA.itens.find(i => i.titulo.indexOf('Formação') === 0);
        salvarAvisoIA();
        r.recusou = (data.compromissos || []).length === 0 && !(data.compromissosEquipe || []).length;
        mudarItemAviso(sem.uid, 'usar', false);
        r.botao = document.getElementById('btnSalvarAvisoIA').textContent.trim();
        salvarAvisoIA();
        r.meus = (data.compromissos || []).map(c => c.titulo);
        r.equipe = (data.compromissosEquipe || []).map(c => ({ titulo: c.titulo, id: c.id, atualizadoEm: c.atualizadoEm, autorNome: c.autorNome }));
        r.regsEquipe = (data.registrosEquipe || []).map(x => ({ id: x.id, tipo: x.tipo, est: x.estudanteId, turma: x.turmaId, dias: x.dias, nome: x.nomeEstudante, autor: x.autorNome }));
        r.regsAdm = (data.registrosAdministrativos || []).length;
        r.escola = (data.eventosEscola || []).length;
        r.fechou = !document.getElementById('modalAvisoIA').classList.contains('active');
        r.persistiu = window.__persistiu;
        const rec = recorteDoProfessor(data, currentUser);
        r.recorte = { comps: (rec.compromissosEquipe || []).map(c => c.titulo), regs: (rec.registrosEquipe || []).length, vazio: _contribuicaoVazia(rec) };
        // o que os colegas publicaram
        lerContribuicoesDaEscola = async () => ({ estado: 'ok', falhas: 0, lista: [
            { autorId: 1, autorNome: 'Maria Prof', dados: rec },
            { autorId: 2, autorNome: 'João', dados: { compromissosEquipe: [{ id: 'c9', tipo: 'compromisso', titulo: 'Feira de ciências', data: somarDiasAviso(hoje, 4), inicio: '08:00', lembrete: '1_dia' }],
                registrosEquipe: [{ id: 555, tipo: 'Atestado', estudanteId: 12, turmaId: 'm7a', data: hoje, dias: 2, nomeEstudante: 'Bruno Lima' }, { id: 556, tipo: 'Faltoso', estudanteId: 13, turmaId: 'm8b', data: hoje, dias: 0 }] } }] });
        data.registrosEquipeRemovidos = [556];
        await carregarEquipeAviso(true);
        await renderDashboard();
        await new Promise(res => setTimeout(res, 700));
        const box = document.getElementById('compromissosDashboard');
        r.dash = box ? box.textContent.replace(/\s+/g, ' ') : '';
        r.regsColegas = (data.registrosAdministrativos || []).filter(x => x.id === 555 || x.id === 556).map(x => x.id);
        return r;
    });
    ok('não salva com item sem data', r2.recusou);
    ok('botão conta os marcados', /Salvar 4 itens/.test(r2.botao), r2.botao);
    ok('perguntou antes de compartilhar com a equipe (com o faltoso e o atestado)', page.__dialogos.some(d => /EQUIPE/.test(d) && /Reunião pedagógica/.test(d) && /Faltoso: Manuela Veronez Silva/.test(d) && /Atestado: Bruno Lima/.test(d)), page.__dialogos.join(' | '));
    ok('compartilhado vai para compromissosEquipe, com autor; o desmarcado fica só meu', r2.equipe.length === 1 && r2.equipe[0].titulo === 'Reunião pedagógica' && r2.equipe[0].id && r2.equipe[0].atualizadoEm && r2.equipe[0].autorNome === 'Maria Prof' && r2.meus.join() === 'Entregar notas do bimestre', JSON.stringify(r2));
    ok('faltoso e atestado em registrosEquipe com a turma da escola e o nome', r2.regsEquipe.length === 2 && r2.regsEquipe.every(x => x.turma === 'm7a' && x.nome && x.autor === 'Maria Prof') && r2.regsEquipe.some(x => x.tipo === 'Atestado' && x.dias === 3 && x.est === 12) && r2.regsEquipe.some(x => x.tipo === 'Faltoso' && x.est === 11), JSON.stringify(r2.regsEquipe));
    ok('e já aparecem nos registros do professor', r2.regsAdm === 2);
    ok('recorte para a escola leva compromissos e registros da equipe', r2.recorte.comps.join() === 'Reunião pedagógica' && r2.recorte.regs === 2 && !r2.recorte.vazio);
    ok('professor não mexe na agenda da gestão', r2.escola === 1);
    ok('fecha e grava', r2.fechou && r2.persistiu >= 1);
    ok('Início: 🔔 Lembretes com as notas', /🔔 Lembretes.*Entregar notas/.test(r2.dash), r2.dash);
    ok('Início: Próximos com a reunião (compartilhado), o conselho (🏫 gestão) e a feira do João (👥)', /Próximos 7 dias.*Reunião pedagógica.*compartilhado.*Conselho de classe.*gestão.*Feira de ciências.*João/.test(r2.dash), r2.dash);
    ok('atestado do colega entra nos registros; o que a gestão excluiu não', r2.regsColegas.join() === '555', JSON.stringify(r2.regsColegas));

    const r3 = await page.evaluate(async () => {
        const r = {};
        const lem = data.compromissos[0];
        marcarFeitoCompromissoAviso(lem.id);
        r.feito = lem.feito === true;
        const reu = data.compromissosEquipe.find(c => c.titulo === 'Reunião pedagógica');
        apagarCompromissoAviso(reu.id, 'compromissosEquipe');
        r.apagou = !data.compromissosEquipe.some(c => c.titulo === 'Reunião pedagógica');
        apagarCompromissoAviso('e1', 'eventosEscola');
        r.escolaFicou = data.eventosEscola.length === 1;
        await showDocumentosTab('agenda');
        await new Promise(res => setTimeout(res, 300));
        const ag = document.getElementById('compromissosAgenda');
        r.agenda = ag ? ag.textContent.replace(/\s+/g, ' ') : '';
        r.botoesApagar = ag.querySelectorAll('button[title="Apagar"]').length;
        return r;
    });
    ok('✓ feito marca o lembrete', r3.feito);
    ok('apagar tira o compartilhado por mim', r3.apagou);
    ok('professor não apaga o da gestão', r3.escolaFicou);
    ok('Minha Agenda lista o da gestão e o do colega, sem botão de apagar os deles', /Compromissos e lembretes/.test(r3.agenda) && /Conselho de classe/.test(r3.agenda) && /Feira de ciências/.test(r3.agenda) && r3.botoesApagar === 1, r3.agenda + ' botões:' + r3.botoesApagar);

    // celular
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { abrirAvisoGestaoIA({ texto: 'Reunião amanhã 18h30' }); abrirRevisaoAvisoIA(normalizarAcoesAvisoIA({ acoes: [
        { tipo: 'compromisso', titulo: 'Reunião pedagógica', data: somarDiasAviso(hojeLocalAviso(), 1), inicio: '18:30', local: 'Sala dos professores', lembrete: 'no_dia' },
        { tipo: 'lembrete', titulo: 'Entregar notas do bimestre', data: somarDiasAviso(hojeLocalAviso(), 4), lembrete: '2_dias' }] })); });
    const larg = await page.evaluate(() => document.documentElement.scrollWidth);
    ok('no celular a revisão não passa da largura', larg <= 392, larg);
    if (FOTOS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(FOTOS, 'revisao-celular.png') }); }
    await ctx.close();

    // ====================== GESTÃO ======================
    ({ ctx, page } = await abrir(browser, { width: 1366, height: 900 }, 'gestor'));
    console.log('\n3. Gestão: faltosos e agenda de todos');
    const r4 = await page.evaluate(async () => {
        const hoje = hojeLocalAviso();
        const r = {};
        await renderDashboard();
        r.card = !!document.getElementById('agendaEscolaGestor');
        abrirAvisoGestaoIA({ texto: 'aviso' });
        window.__respostaIA = { acoes: [
            { tipo: 'faltoso', nome: 'Manu Veronez', turma: '7º A', observacao: 'busca ativa' },
            { tipo: 'faltoso', nome: 'Pedro', turma: '' },
            { tipo: 'faltoso', nome: 'Fulano Inexistente', turma: '9C' },
            { tipo: 'atestado', nome: 'Bruno Lima', turma: '7º A', dataInicio: somarDiasAviso(hoje, -1), dias: 5, observacao: 'atestado entregue na secretaria' },
            { tipo: 'atestado', nome: 'Pedro Henrique', turma: '8B', dataInicio: 'ontem', dias: 'x' },
            { tipo: 'compromisso', titulo: 'ATPC geral', data: somarDiasAviso(hoje, 2), inicio: '17:00', paraTodos: true, lembrete: '1_dia' },
            { tipo: 'lembrete', titulo: 'Conferir diários', data: somarDiasAviso(hoje, 5), paraTodos: false, lembrete: '1_dia' }
        ] };
        await lerAvisoComIA();
        r.itens = avisoIA.itens.map(i => ({ tipo: i.tipo, nome: i.nome, est: i.estudanteId, cands: i.candidatos.map(c => c.nome), usar: i.usar, paraTodos: i.paraTodos, avisos: i.avisos }));
        r.temTodos = /todos os professores/.test(document.getElementById('avisoIAItens').textContent);
        r.temAtestadoUI = /Atestado médico/.test(document.getElementById('avisoIAItens').textContent) && /Dias de atestado/.test(document.getElementById('avisoIAItens').textContent);
        const pedro = avisoIA.itens.find(i => i.nome === 'Pedro');
        r.salvouSemPedro = (salvarAvisoIA(), (data.registrosAdministrativos || []).length);
        mudarItemAviso(pedro.uid, 'estudanteId', '14');
        salvarAvisoIA();
        r.regs = data.registrosAdministrativos.map(x => ({ est: x.estudanteId, turma: x.turmaId, tipo: x.tipo, desc: x.descricao, data: x.data, dias: x.dias }));
        r.hoje = hoje; r.ontem = somarDiasAviso(hoje, -1);
        r.escola = data.eventosEscola.map(e => e.titulo);
        r.meus = (data.compromissos || []).map(e => e.titulo);
        await renderDashboard();
        r.cardTxt = document.getElementById('agendaEscolaGestor').textContent.replace(/\s+/g, ' ');
        return r;
    });
    const g = (n) => r4.itens.find(i => i.nome === n) || {};
    ok('painel da gestão tem o card "Agenda da escola"', r4.card);
    ok('"Manu Veronez / 7º A" casa com Manuela Veronez Silva', String(g('Manu Veronez').est) === '11' && g('Manu Veronez').usar, JSON.stringify(g('Manu Veronez')));
    ok('"Pedro" ambíguo: dois candidatos, sem escolha', !g('Pedro').est && g('Pedro').cands.length === 2 && /mais de um/.test(g('Pedro').avisos.join()));
    ok('nome desconhecido vem desmarcado', g('Fulano Inexistente').usar === false && /Não achei/.test(g('Fulano Inexistente').avisos.join()));
    ok('transferido não entra como candidato', !r4.itens.some(i => i.cands.includes('Carlos Saiu')));
    ok('gestão vê "agenda de todos os professores"; ATPC já marcado', r4.temTodos && r4.itens.find(i => i.tipo === 'compromisso').paraTodos === true);
    ok('não salva faltoso sem estudante escolhido', r4.salvouSemPedro === 0);
    ok('revisão mostra o atestado com "Dias de atestado"', r4.temAtestadoUI);
    const atest = r4.regs.filter(x => x.tipo === 'Atestado');
    ok('atestado do Bruno: 5 dias desde ontem, com observação', atest.some(x => x.est === 12 && x.turma === 1 && x.dias === 5 && x.data === r4.ontem && /secretaria/.test(x.desc)), JSON.stringify(atest));
    ok('atestado sem data/dias válidos: hoje e 1 dia', atest.some(x => x.est === 13 && x.dias === 1 && x.data === r4.hoje), JSON.stringify(atest));
    ok('faltosos em registrosAdministrativos (Manuela e Pedro Alves)', r4.regs.filter(x => x.tipo === 'Faltoso').length === 2 && r4.regs.some(x => x.est === 11 && x.turma === 1 && x.tipo === 'Faltoso' && x.desc === 'busca ativa') && r4.regs.some(x => x.est === 14 && x.turma === 2), JSON.stringify(r4.regs));
    ok('perguntou antes de publicar para a equipe', page.__dialogos.some(d => /EQUIPE/.test(d) && /ATPC geral/.test(d)));
    ok('ATPC em eventosEscola; lembrete só da gestão em compromissos', r4.escola.join() === 'ATPC geral' && r4.meus.join() === 'Conferir diários');
    ok('card mostra os dois, com 👥 no compartilhado', /ATPC geral.*compartilhado/.test(r4.cardTxt) && /Conferir diários/.test(r4.cardTxt), r4.cardTxt);

    const r6 = await page.evaluate(async () => {
        const r = {};
        lerContribuicoesDaEscola = async () => ({ estado: 'ok', falhas: 0, lista: [
            { autorId: 2, autorNome: 'João', dados: { registrosEquipe: [{ id: 777, tipo: 'Atestado', estudanteId: 12, turmaId: 1, data: hojeLocalAviso(), dias: 2, nomeEstudante: 'Bruno Lima', autorNome: 'João' }],
                compromissosEquipe: [{ id: 'c9', tipo: 'compromisso', titulo: 'Feira de ciências', data: somarDiasAviso(hojeLocalAviso(), 4) }] } }] });
        r.n1 = await trazerRegistrosEquipeDosProfessores();
        r.n2 = await trazerRegistrosEquipeDosProfessores();
        const reg = data.registrosAdministrativos.find(x => x.id === 777);
        r.reg = reg && { origem: reg.origem, autor: reg.autorNome };
        removerRegistroGestao(777);
        r.n3 = await trazerRegistrosEquipeDosProfessores();
        r.removidos = data.registrosEquipeRemovidos;
        await carregarEquipeAviso(true);
        await renderDashboard();
        await new Promise(res => setTimeout(res, 500));
        r.card = document.getElementById('agendaEscolaGestor').textContent.replace(/\s+/g, ' ');
        return r;
    });
    ok('gestão traz o atestado lançado por professor (uma vez só)', r6.n1 === 1 && r6.n2 === 0 && r6.reg && r6.reg.origem === 'equipe' && r6.reg.autor === 'João', JSON.stringify(r6));
    ok('excluído pela gestão não volta', r6.n3 === 0 && (r6.removidos || []).indexOf(777) !== -1);
    ok('gestão vê no card o compromisso que o professor compartilhou', /Feira de ciências.*João/.test(r6.card), r6.card);
    if (FOTOS) { await page.evaluate(() => { abrirAvisoGestaoIA(); abrirRevisaoAvisoIA(normalizarAcoesAvisoIA({ acoes: [
        { tipo: 'faltoso', nome: 'Manu Veronez', turma: '7º A', observacao: 'busca ativa' }, { tipo: 'faltoso', nome: 'Pedro', turma: '' },
        { tipo: 'atestado', nome: 'Bruno Lima', turma: '7º A', dataInicio: hojeLocalAviso(), dias: 3, observacao: 'entregue na secretaria' },
        { tipo: 'compromisso', titulo: 'Conselho de classe', data: somarDiasAviso(hojeLocalAviso(), 6), inicio: '18:00', paraTodos: true, lembrete: '2_dias' }] })); });
        await page.waitForTimeout(800); await page.screenshot({ path: path.join(FOTOS, 'revisao-gestao.png') }); }

    console.log('\n4. IA com foto pelo servidor próprio');
    const r5 = await page.evaluate(async () => {
        const r = {};
        const orig = window.fetch;
        getData = async (c, d) => (c === 'system' && d === 'config_ia') ? { servidorIaUrl: 'https://ia.teste', servidorIaChave: 'k' } : null;
        let corpo = null, responderLeu = true;
        window.fetch = async (url, op) => {
            if (String(url).indexOf('https://ia.teste/v1/gerar') === 0) {
                corpo = JSON.parse(op.body);
                return new Response(JSON.stringify(Object.assign({ texto: '{"acoes":[]}', modelo: 'm' }, responderLeu ? { leuImagens: (corpo.imagens || []).length } : {})), { status: 200 });
            }
            return orig(url, op);
        };
        // recarrega a função de verdade (o teste tinha trocado por uma falsa)
        const src = await (await orig('ia_estagiario.js')).text();
        const m = src.match(/async function chamarIAEstruturada[\s\S]*?\n}\n/);
        eval(m[0].replace('async function chamarIAEstruturada', 'window.__real = async function'));
        const res = await window.__real('p', null, { imagens: [{ mime: 'image/jpeg', dados: 'QUJD' }] });
        r.ok = Array.isArray(res.acoes);
        r.imgs = corpo && corpo.imagens;
        await window.__real('p', null);
        r.semFoto = corpo && !('imagens' in corpo);
        responderLeu = false;
        try { await window.__real('p', null, { imagens: [{ mime: 'image/jpeg', dados: 'QUJD' }] }); r.erroAntigo = ''; }
        catch (e) { r.erroAntigo = e.message; }
        window.fetch = orig;
        return r;
    });
    ok('manda as fotos ao servidor como "imagens"', r5.ok && r5.imgs && r5.imgs.length === 1 && r5.imgs[0].mime === 'image/jpeg' && r5.imgs[0].dados === 'QUJD');
    ok('sem foto o pedido é igual ao de antes', r5.semFoto);
    ok('servidor antigo (não lê foto) dá erro claro', /ainda não lê fotos/.test(r5.erroAntigo), r5.erroAntigo);
    await ctx.close();

    await browser.close();
    console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo.');
    process.exit(falhas.length ? 1 : 0);
})();
