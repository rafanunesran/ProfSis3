// LISTAS DE FALTOSOS EM ORDEM ALFABÉTICA, AGRUPADAS POR TURMA.
//   1. Registros da gestão (vigentes e arquivados);
//   2. Registros do professor;
//   3. Dashboard da Turma (professor);
//   4. Início do professor (avisos por turma).
// Rodar: python3 -m http.server 8877 --bind 127.0.0.1  (na raiz) e depois
//        PROFSIS_CHROMIUM=/opt/pw-browsers/chromium NODE_PATH=$(npm root -g) node testes/teste-faltosos-ordem.js
const { chromium } = require('playwright');
const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ok     ' : '  FALHOU ') + msg + (extra !== undefined ? '  — ' + extra : '')); if (!cond) falhas++; };
// posição de cada nome no texto: devem aparecer na ordem dada
const naOrdem = (txt, nomes) => { const pos = nomes.map(n => txt.indexOf(n)); return pos.every(p => p >= 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', d => d.accept());
  await p.route(/gstatic\.com/, r => r.abort());
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  const base = () => {
    window.dadosCarregados = false;
    const est = [
      { id: 1, id_turma: 10, nome_completo: 'Zeca Souza', status: 'Ativo' },
      { id: 2, id_turma: 10, nome_completo: 'ana Lima', status: 'Ativo' },
      { id: 3, id_turma: 10, nome_completo: 'Átila Reis', status: 'Ativo' },
      { id: 4, id_turma: 20, nome_completo: 'Paula Dias', status: 'Ativo' },
      { id: 5, id_turma: 20, nome_completo: 'Bruno Melo', status: 'Ativo' }
    ];
    const regs = [
      { id: 101, tipo: 'Faltoso', estudanteId: 1, turmaId: 10, data: '2026-03-02' },
      { id: 102, tipo: 'Faltoso', estudanteId: 2, turmaId: 10, data: '2026-03-02', automatico: true },
      { id: 103, tipo: 'Faltoso', estudanteId: 3, turmaId: 10, data: '2026-03-02' },
      { id: 104, tipo: 'Faltoso', estudanteId: 4, turmaId: 20, data: '2026-03-02' },
      { id: 105, tipo: 'Faltoso', estudanteId: 5, turmaId: 20, data: '2026-03-02' }
    ];
    return { est, regs };
  };

  const tela = (id) => `let el = document.getElementById('${id}'); if (!el) { el = document.createElement('div'); el.id = '${id}'; el.className = 'screen'; document.body.appendChild(el); }`;

  console.log('1. Registros da gestão');
  const g = await p.evaluate(`(() => { const base = ${base}; const { est, regs } = base();
    data = Object.assign(getInitialData(), { estudantes: est, registrosAdministrativos: regs, turmas: [{ id: 20, nome: '10º A' }, { id: 10, nome: '2º A' }] });
    currentUser = { id: 'g1', nome: 'G', role: 'gestor' }; currentViewMode = 'professor';
    ${tela('registrosGestor')}
    currentRegistrosTab = 'administrativos'; renderRegistrosGestor();
    const vig = el.innerText;
    data.registrosAdministrativos.forEach(r => r.arquivado = true);
    currentRegistrosTab = 'arquivados'; renderRegistrosGestor();
    return { vig, arq: el.innerText.split('Buscar por Nome')[1] || '' }; })()`);
  ok(naOrdem(g.vig, ['2º A', 'ana Lima', 'Átila Reis', 'Zeca Souza', '10º A', 'Bruno Melo', 'Paula Dias']), 'vigentes: turma 2º A antes de 10º A e nomes em ordem (sem ligar para acento/maiúscula)');
  ok(naOrdem(g.arq, ['2º A', 'ana Lima', 'Átila Reis', 'Zeca Souza', '10º A', 'Bruno Melo', 'Paula Dias']), 'arquivados também');

  console.log('2. Registros do professor');
  const pr = await p.evaluate(`(async () => { const base = ${base}; const { est, regs } = base();
    data = Object.assign(getInitialData(), { estudantes: est, registrosAdministrativos: regs, turmas: [{ id: 20, nome: '10º A', masterId: 20 }, { id: 10, nome: '2º A', masterId: 10 }] });
    currentUser = { id: 'p1', nome: 'P', role: 'professor' }; currentViewMode = 'professor';
    ${tela('registrosProfessor')}
    await renderRegistrosProfessor(); return el.innerText; })()`);
  ok(naOrdem(pr, ['2º A', 'ana Lima', 'Átila Reis', 'Zeca Souza', '10º A', 'Bruno Melo', 'Paula Dias']), 'turmas e nomes em ordem');

  console.log('3. Dashboard da Turma');
  const dt = await p.evaluate(`(async () => { const base = ${base}; const { est, regs } = base();
    data = Object.assign(getInitialData(), { estudantes: est, registrosAdministrativos: regs, turmas: [{ id: 10, nome: '2º A', disciplina: 'Mat' }] });
    currentUser = { id: 'p1', nome: 'P', role: 'professor' }; currentViewMode = 'professor';
    turmaAtual = 10;
    ${tela('tabEstudantes')}
    await renderEstudantes();
    const card = Array.from(el.querySelectorAll('.card')).find(c => /Dashboard da Turma/.test(c.innerText));
    return card ? card.innerText : ''; })()`);
  ok(naOrdem(dt, ['ana Lima', 'Átila Reis', 'Zeca Souza']), 'faltosos em ordem', dt.replace(/\n/g, ' | ').slice(0, 200));

  console.log('4. Início do professor');
  const di = await p.evaluate(`(async () => { const base = ${base}; const { est, regs } = base();
    data = Object.assign(getInitialData(), { estudantes: est, registrosAdministrativos: regs, turmas: [{ id: 20, nome: '10º A', disciplina: 'Mat' }, { id: 10, nome: '2º A', disciplina: 'Mat' }] });
    currentUser = { id: 'p1', nome: 'P', role: 'professor' }; currentViewMode = 'professor';
    ${tela('dashboard')}
    try { await renderDashboard(); } catch (e) { return 'ERRO ' + e.message; }
    const av = document.getElementById('avisosGerais'); return av ? av.innerText : 'sem avisosGerais'; })()`);
  ok(naOrdem(di, ['2º A', 'ana Lima', 'Átila Reis', 'Zeca Souza', '10º A', 'Bruno Melo', 'Paula Dias']), 'turmas e nomes em ordem', di.replace(/\n/g, ' | ').slice(0, 200));

  await b.close();
  console.log(falhas ? `\n*** ${falhas} FALHA(S) ***` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
