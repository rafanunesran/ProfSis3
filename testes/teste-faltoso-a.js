// FALTOSO A (automático) E RELATÓRIO MENSAL DE FALTAS MAIS RÁPIDO.
//
//   1. a conta conta por DIA (não por aula), com maioria entre os professores do dia
//      e empate = presença; dia de atestado não entra;
//   2. só classifica depois de 2 semanas de chamadas da turma;
//   3. só estudante ativo; quem tem Faltoso manual não ganha o A;
//   4. entra e SAI sozinho de data.registrosAdministrativos;
//   5. a tela de Registros da gestão mostra "Faltoso A" e não mostra inativo;
//   6. a página Registros do professor esconde estudante inativo e mostra "Faltoso A";
//   7. o relatório mensal busca os dias ao mesmo tempo (não um depois do outro);
//   8. o aparelho do professor faz a conta 1 vez por dia sozinho, sem a gestão.
//
// Rodar: python3 -m http.server 8877 --bind 127.0.0.1  (na raiz) e depois
//        PROFSIS_CHROMIUM=/opt/pw-browsers/chromium NODE_PATH=$(npm root -g) node testes/teste-faltoso-a.js
const { chromium } = require('playwright');
const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';

let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ok     ' : '  FALHOU ') + msg + (extra !== undefined ? '  — ' + extra : '')); if (!cond) falhas++; };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', d => d.accept());
  await p.route(/gstatic\.com/, r => r.abort());
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  const r = await p.evaluate(() => {
    // dias úteis seguidos a partir de 2026-03-02 (segunda)
    const dias = [];
    const d0 = new Date('2026-03-02T12:00:00');
    while (dias.length < 20) { const dw = d0.getDay(); if (dw && dw !== 6) dias.push(d0.toISOString().slice(0, 10)); d0.setDate(d0.getDate() + 1); }
    const hoje = '2026-03-31';
    const est = [
      { id: 1, id_turma: 10, nome_completo: 'Ana', status: 'Ativo' },        // falta quase sempre
      { id: 2, id_turma: 10, nome_completo: 'Bruno', status: 'Ativo' },      // empate todo dia
      { id: 3, id_turma: 10, nome_completo: 'Caio', status: 'Transferido' }, // inativo
      { id: 4, id_turma: 10, nome_completo: 'Duda', status: 'Ativo' },       // falta, mas tem atestado
      { id: 5, id_turma: 10, nome_completo: 'Eva', status: 'Ativo' },        // faltoso manual
      { id: 6, id_turma: 10, nome_completo: 'Fábio', status: '' }            // 2 de 3 profs dão falta (maioria)
    ];
    // prof A e prof B fazem chamada todo dia; prof C também
    const faltasA = {}, faltasB = {}, faltasC = {};
    dias.forEach((dia, i) => {
      faltasA[dia] = [1, 3, 4, 5, 6];
      faltasB[dia] = (i < 3 ? [] : [1]).concat([2, 3, 4, 5, 6]); // Ana presente para B nos 3 primeiros
      faltasC[dia] = [1, 3, 4, 5];   // Bruno presente para A e C, falta para B => 2 pres x 1 falta ... ajustado abaixo
    });
    // Bruno: empate -> só A e B (C não dá falta, mas C fez chamada) => faltas 1 (B), presenças 2 => presente.
    // Para testar empate de verdade: dia em que só A e B fizeram chamada.
    const fontes = [
      { autorId: 'A', chamadas: { 10: dias }, faltas: faltasA },
      { autorId: 'B', chamadas: { 10: dias }, faltas: faltasB },
      { autorId: 'C', chamadas: { 10: dias.slice(0, 10) }, faltas: faltasC }
    ];
    const registros = [
      { id: 9, tipo: 'Atestado', estudanteId: 4, data: dias[0], dias: 40 },
      { id: 8, tipo: 'Faltoso', estudanteId: 5, turmaId: 10, data: dias[0] }
    ];
    const lista = calcularFaltososAutomaticos(fontes, est, registros, hoje, '2026-02-01');
    const porId = {}; lista.forEach(x => porId[x.estudanteId] = x);

    // Bruno nos 10 dias sem C: A presente, B falta -> empate -> presença. Nos 10 com C: 2 pres x 1 falta.
    // Fábio: com C (10 dias) A e B falta, C presente -> falta; sem C, A e B falta -> falta.

    // Carência: turma que começou a chamada há 10 dias
    const fontesNovas = [{ autorId: 'A', chamadas: { 20: ['2026-03-23', '2026-03-24'] }, faltas: { '2026-03-23': [7], '2026-03-24': [7] } }];
    const novato = calcularFaltososAutomaticos(fontesNovas, [{ id: 7, id_turma: 20, nome_completo: 'Gabi', status: 'Ativo' }], [], hoje, '2026-02-01');
    const novatoDepois = calcularFaltososAutomaticos(fontesNovas, [{ id: 7, id_turma: 20, nome_completo: 'Gabi', status: 'Ativo' }], [], '2026-04-07', '2026-02-01');

    // Sincronizar: entra, atualiza e sai
    data = Object.assign(getInitialData(), { estudantes: est.concat([{ id: 7, id_turma: 20, nome_completo: 'Gabi', status: 'Ativo' }]), turmas: [{ id: 10, nome: '1A' }, { id: 20, nome: '2B' }], registrosAdministrativos: registros.slice() });
    const m1 = sincronizarFaltososAutomaticos(lista, hoje);
    const autos1 = data.registrosAdministrativos.filter(x => x.automatico).map(x => x.estudanteId).sort();
    const m2 = sincronizarFaltososAutomaticos(lista, hoje);       // nada mudou
    const ana = data.registrosAdministrativos.find(x => x.automatico && x.estudanteId === 1);
    const m3 = sincronizarFaltososAutomaticos(lista.filter(x => x.estudanteId !== 1), hoje); // Ana subiu
    const autos3 = data.registrosAdministrativos.filter(x => x.automatico).map(x => x.estudanteId).sort();
    sincronizarFaltososAutomaticos(lista, hoje); // Ana volta
    return {
      ids: lista.map(x => x.estudanteId).sort(), ana: porId[1], fabio: porId[6],
      novato: novato.length, novatoDepois: novatoDepois.length,
      m1, autos1, m2, m3, autos3, anaDesc: ana && ana.descricao, manualFica: data.registrosAdministrativos.some(x => x.id === 8)
    };
  });

  console.log('1. Conta por dia, maioria e empate');
  ok(r.ana && r.ana.dias === 20 && r.ana.diasPresente === 0, 'Ana: 20 dias com chamada, 0 presenças (3 dias com A e C falta x B presente => maioria falta)', JSON.stringify(r.ana));
  ok(!r.ids.includes(2), 'Bruno: empate (1 presença x 1 falta) conta presença e não vira Faltoso A');
  ok(r.fabio && r.fabio.diasPresente === 0, 'Fábio: 2 faltas x 1 presença no dia = falta (status vazio conta como ativo)');
  ok(!r.ids.includes(4), 'Duda: dias de atestado não entram na conta');
  console.log('2. Carência de 2 semanas');
  ok(r.novato === 0, 'turma com chamadas há 8 dias ainda não classifica');
  ok(r.novatoDepois === 1, 'depois de 14 dias da primeira chamada passa a classificar');
  console.log('3. Só ativos e manual primeiro');
  ok(!r.ids.includes(3), 'Caio (Transferido) não entra');
  ok(r.ids.includes(5), 'Eva entra na conta...');
  ok(!r.autos1.includes(5) && r.manualFica, '...mas como já tem Faltoso manual, não ganha o A (e o manual fica)', JSON.stringify(r.autos1));
  console.log('4. Entra e sai sozinho');
  ok(r.m1 && JSON.stringify(r.autos1) === '[1,6]', 'entram Ana e Fábio', JSON.stringify(r.autos1));
  ok(r.m2 === false, 'rodar de novo sem mudança não grava nada');
  ok(/0% de presença \(0 de 20 dias com chamada\)/.test(r.anaDesc || ''), 'descrição com a porcentagem', r.anaDesc);
  ok(r.m3 && JSON.stringify(r.autos3) === '[6]', 'Ana sai quando a presença sobe', JSON.stringify(r.autos3));

  console.log('5. Tela de Registros da gestão');
  const tela = await p.evaluate(async () => {
    currentUser = { id: 'g1', nome: 'G', role: 'gestor' }; currentViewMode = 'professor'; // não dispara a busca em rede
    data.registrosAdministrativos.push({ id: 77, tipo: 'Observacao', estudanteId: 3, turmaId: 10, data: '2026-03-02', descricao: 'inativo nao aparece' });
    let el = document.getElementById('registrosGestor');
    if (!el) { el = document.createElement('div'); el.id = 'registrosGestor'; document.body.appendChild(el); }
    currentRegistrosTab = 'administrativos';
    renderRegistrosGestor();
    return el.innerText;
  });
  ok(/Faltoso A/.test(tela), 'mostra "Faltoso A"');
  ok(/automático/.test(tela), 'Faltoso A aparece como automático (sem Arquivar)');
  ok(!/inativo nao aparece/.test(tela) && !/Caio/.test(tela), 'estudante inativo não aparece');
  ok(/Eva/.test(tela), 'faltoso manual continua aparecendo');

  console.log('6. Página Registros do professor');
  const prof = await p.evaluate(async () => {
    currentUser = { id: 'p1', nome: 'P', role: 'professor' }; currentViewMode = 'professor';
    let sc = document.getElementById('registrosProfessor');
    if (!sc) { sc = document.createElement('div'); sc.id = 'registrosProfessor'; sc.className = 'screen'; document.body.appendChild(sc); }
    const fn = Object.keys(window).find(k => /^renderRegistrosProfessor/.test(k));
    await window[fn]();
    return { fn, txt: sc.innerText };
  });
  ok(/Faltoso A/.test(prof.txt), 'mostra "Faltoso A"', prof.fn);
  ok(!/inativo nao aparece/.test(prof.txt), 'registro de estudante inativo não aparece');

  console.log('7. Relatório mensal busca os dias juntos');
  const rel = await p.evaluate(async () => {
    let ativos = 0, pico = 0, chamadas = 0;
    window.db = { collection: () => ({ doc: () => ({ get: async () => {
      chamadas++; ativos++; pico = Math.max(pico, ativos);
      await new Promise(r => setTimeout(r, 150)); ativos--;
      return { exists: false, data: () => null };
    } }) }) };
    db = window.db;
    currentUser = { id: 'p1', nome: 'P', role: 'professor', schoolId: '77' };
    const t0 = performance.now();
    await getFaltasCompartilhadasDoPeriodo(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']);
    return { ms: Math.round(performance.now() - t0), pico, chamadas };
  });
  ok(rel.pico >= 10, 'os 10 dias foram buscados ao mesmo tempo', 'pico de ' + rel.pico + ' buscas simultâneas');
  ok(rel.ms < 900, 'com 150 ms por busca, levou bem menos que 10 × 150 ms', rel.ms + ' ms');

  console.log('8. Conta do dia no aparelho do professor (sem a gestão abrir nada)');
  const pd = await p.evaluate(async () => {
    const hoje = getTodayString();
    const dias = [];
    const d0 = new Date(hoje + 'T12:00:00'); d0.setDate(d0.getDate() - 30);
    for (let i = 0; i < 30; i++) { const d = new Date(d0); d.setDate(d.getDate() + i); if (d.getDay() && d.getDay() !== 6) dias.push(d.toISOString().slice(0, 10)); }
    const faltas = {}; dias.forEach(d => faltas[d] = [1]);
    let leituras = 0;
    window.lerContribuicoesDaEscola = async () => { leituras++; return { estado: 'ok', lista: [{ autorId: 'p9', dados: { chamadas: { 10: dias }, faltas } }] }; };
    currentUser = { id: 'p1', nome: 'P', role: 'professor', schoolId: '77' }; currentViewMode = 'professor';
    window.dadosCarregados = false; // persistirDados não grava nada no teste
    data = Object.assign(getInitialData(), {
      turmas: [{ id: 500, nome: '1A', masterId: 10 }],
      estudantes: [{ id: 1, id_turma: 500, nome_completo: 'Ana', status: 'Ativo' }, { id: 2, id_turma: 500, nome_completo: 'Bruno', status: 'Ativo' }],
      // a gestão mandou um Faltoso A velho do Bruno (de outro dia) e nenhum da Ana
      registrosAdministrativos: [{ id: idFaltosoA(2), tipo: 'Faltoso', automatico: true, estudanteId: 2, turmaId: 10, data: '2026-01-01', presencaPerc: 10 }]
    });
    const fez = await atualizarFaltososDoDiaProfessor();
    const autos = data.registrosAdministrativos.filter(r => r.automatico).map(r => r.estudanteId);
    const fezDeNovo = await atualizarFaltososDoDiaProfessor();
    // a gestão sincroniza de novo trazendo o Faltoso A velho: a conta do dia vence
    const veio = enriquecerRegistrosComNome([{ id: idFaltosoA(2), tipo: 'Faltoso', automatico: true, estudanteId: 2, turmaId: 10, data: '2026-01-01' },
                                             { id: 5, tipo: 'Faltoso', estudanteId: 99, turmaId: 10, data: '2026-01-01' }], []);
    data.registrosAdministrativos = veio;
    // página Registros: o Faltoso manual do estudante 99 (que não está em lista nenhuma) some
    let sc = document.getElementById('registrosProfessor');
    currentUser = { id: 'p1', nome: 'P', role: 'professor' };
    await renderRegistrosProfessor();
    return { fez, fezDeNovo, leituras, autos, depoisSync: veio.filter(r => r.automatico).map(r => r.estudanteId), dia: data.faltososAutomaticos && data.faltososAutomaticos.dia === hoje, txt: sc.innerText };
  });
  ok(pd.fez && JSON.stringify(pd.autos) === '[1]', 'na 1ª abertura do dia o professor calcula: Ana entra, o Faltoso A velho do Bruno sai', JSON.stringify(pd.autos));
  ok(pd.fezDeNovo === false && pd.leituras === 1, 'na 2ª abertura do mesmo dia não refaz a conta', 'leituras: ' + pd.leituras);
  ok(JSON.stringify(pd.depoisSync) === '[1]', 'quando os registros da gestão chegam de novo, vale a conta do dia', JSON.stringify(pd.depoisSync));
  ok(/Ana/.test(pd.txt) && /Faltoso A/.test(pd.txt), 'Registros do professor mostram a Ana como Faltoso A');
  ok(!/Desconhecido/.test(pd.txt), 'Faltoso lançado pela gestão para estudante que não está na lista não aparece');

  await b.close();
  console.log(falhas ? `\n*** ${falhas} FALHA(S) ***` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
