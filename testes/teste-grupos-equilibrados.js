// SORTEIO EQUILIBRADO DE GRUPOS (aba Trabalhos → 👥 → Sortear com "⚖️ Equilibrar").
//
// Turma de 32 com perfis bem diferentes (notas, faltas, ocorrências). Confere que:
//  - todos entram, uma vez só, em grupos de tamanho igual (diferença de no máximo 1);
//  - o desempenho médio dos grupos fica muito mais parecido do que no sorteio puro;
//  - os estudantes com ocorrência e os mais faltosos ficam espalhados;
//  - sortear de novo dá outra formação (continua aleatório);
//  - sem registro nenhum, ainda funciona (sorteio puro);
//  - a janela mostra o resumo de cada grupo e não fica lenta.
const { chromium } = require('playwright');
const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  p.on('pageerror', e => console.log('erro na página:', e.message));
  await p.route(/gstatic\.com/, r => r.abort());
  await p.addInitScript(() => {
    window.firebase = { initializeApp:()=>{}, analytics:()=>{}, auth:()=>({ currentUser:{uid:'p1'}, onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return ()=>{}; }, signOut:async()=>{} }),
      firestore:()=>({ collection:()=>({ doc:()=>({ get:async()=>({exists:false}), set:async()=>{} }) }) }) };
    window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
  });
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  const r = await p.evaluate(async () => {
    persistirDados = async () => {};
    const N = 32;
    const estudantes = Array.from({ length: N }, (_, i) => ({ id: i + 1, id_turma: 500, nome_completo: 'Aluno ' + String(i + 1).padStart(2, '0'), status: 'Ativo' }));
    // Os 8 primeiros são "fortes" (9-10), os 8 últimos "fracos" (2-3), o meio 5-7.
    const notaDe = i => i < 8 ? 9 + (i % 2) : (i >= 24 ? 2 + (i % 2) : 5 + (i % 3));
    const trabalhos = [ { id: 11, id_turma: 500, titulo: 'Grupo', tipo: 'comum', peso: 10, rubricas: [], bimestre: 1 } ];
    const notas = [];
    for (let a = 0; a < 6; a++) {
      trabalhos.push({ id: 20 + a, id_turma: 500, titulo: 'Prova ' + a, tipo: 'comum', peso: 10, rubricas: [], bimestre: 1 });
      estudantes.forEach((e, i) => notas.push({ id: 'n' + a + '-' + i, id_trabalho: 20 + a, id_estudante: e.id, valor: String(notaDe(i)) }));
    }
    // Caderno e participação automáticos também entram (são calculados pela agenda).
    trabalhos.push({ id: 30, id_turma: 500, titulo: 'Caderno', tipo: 'caderno_auto', peso: 10, rubricas: [], bimestre: 1 });
    trabalhos.push({ id: 31, id_turma: 500, titulo: 'Particip', tipo: 'participacao', peso: 10, rubricas: [], bimestre: 1 });
    // Faltas: os alunos 25-32 faltam muito. Ocorrências: 6 alunos.
    const presencas = [];
    for (let d = 1; d <= 60; d++) {
      const dia = '2026-0' + (1 + Math.floor((d - 1) / 28)) + '-' + String(((d - 1) % 28) + 1).padStart(2, '0');
      estudantes.forEach((e, i) => presencas.push({ id: 'p' + d + '-' + i, id_estudante: e.id, data: dia, status: (i >= 24 && d % 3 === 0) ? 'falta' : 'presente' }));
    }
    const comOcorrencia = [26, 27, 28, 29, 30, 31];
    // AEE: 6 estudantes (marcados de jeitos diferentes, como o painel AEE grava), vários fracos.
    const aeeIds = [3, 12, 25, 27, 30, 32];
    estudantes.forEach(e => { if (aeeIds.includes(e.id)) { if (e.id % 2) e.aee_diagnostico = 'TEA'; else e.is_aee_mapped = true; } });
    const ocorrencias = comOcorrencia.map((id, k) => ({ id: 900 + k, id_turma: 500, data: '2026-02-10', relato: 'x', ids_estudantes: [id], tipo: k % 2 ? 'rapida' : 'disciplinar' }));
    data = Object.assign(getInitialData(), {
      turmas: [ { id: 500, nome: '1A', disciplina: 'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes, trabalhos, notas, presencas, ocorrencias });
    turmaAtual = 500; currentBimestreTrabalhos = 1;
    if (!document.getElementById('tabTrabalhos')) { const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d); }
    renderTrabalhos();

    const t = data.trabalhos[0];
    const desvioMedias = (grupos) => {
      const ms = grupos.map(g => g.reduce((a, id) => a + notaDe(id - 1), 0) / g.length);
      const m = ms.reduce((a, b) => a + b, 0) / ms.length;
      return Math.sqrt(ms.reduce((a, b) => a + (b - m) * (b - m), 0) / ms.length);
    };
    const out = {};

    // Sorteio equilibrado pela janela
    abrirModalGrupos(11);
    out.caixaMarcada = document.getElementById('sorteioEquilibrado').checked;
    document.getElementById('tamanhoSorteio').value = '4';
    let t0 = performance.now();
    await sortearGrupos();
    out.ms = Math.round(performance.now() - t0);
    const g1 = t.grupos.map(g => g.membros.slice());
    const todos = [].concat(...g1);
    out.todosUmaVez = todos.length === N && new Set(todos.map(String)).size === N;
    out.tamanhos = g1.every(g => g.length === 4) && g1.length === 8;
    out.desvioEquilibrado = desvioMedias(g1);
    out.ocorrenciaEspalhada = Math.max(...g1.map(g => g.filter(id => comOcorrencia.includes(id)).length)) <= 1;
    out.faltososEspalhados = Math.max(...g1.map(g => g.filter(id => id >= 25).length)) <= 2;
    out.resumo = document.querySelectorAll('#modalNovoTrabalho .resumo-grupo').length === 8;
    out.aeeUmPorGrupo = Math.max(...g1.map(g => g.filter(id => aeeIds.includes(id)).length)) <= 1;
    out.aeeNoResumo = (document.getElementById('listaGrupos').textContent.match(/AEE 1/g) || []).length === 6;
    t0 = performance.now(); renderModalGrupos(); out.msJanela = Math.round(performance.now() - t0);

    // Sorteio puro, para comparar (média de 30 sorteios)
    let somaPuro = 0;
    for (let k = 0; k < 30; k++) {
      const ids = estudantes.map(e => e.id);
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      somaPuro += desvioMedias(Array.from({ length: 8 }, (_, g) => ids.slice(g * 4, g * 4 + 4)));
    }
    out.desvioPuro = somaPuro / 30;
    out.bemMaisEquilibrado = out.desvioEquilibrado < out.desvioPuro / 3;

    // De novo: outra formação
    t.grupos = [];
    renderModalGrupos();
    document.getElementById('tamanhoSorteio').value = '4';
    await sortearGrupos();
    const g2 = t.grupos.map(g => g.membros.slice().sort((a, b) => a - b).join('-')).sort().join('|');
    out.outraFormacao = g2 !== g1.map(g => g.slice().sort((a, b) => a - b).join('-')).sort().join('|');
    out.segundoTambemEquilibrado = desvioMedias(t.grupos.map(g => g.membros)) < out.desvioPuro / 3;

    out.aeeUmPorGrupo2 = Math.max(...t.grupos.map(g => g.membros.filter(id => aeeIds.includes(id)).length)) <= 1;

    // Mais AEE (12) do que grupos (8): no máximo 2 por grupo, nenhum grupo com 3.
    const aeeMuitos = [1, 3, 5, 8, 12, 14, 17, 20, 25, 27, 30, 32];
    data.estudantes.forEach(e => { delete e.aee_diagnostico; delete e.is_aee_mapped; if (aeeMuitos.includes(e.id)) e.aee_categoria_projeto = 'x'; });
    t.grupos = []; renderModalGrupos(); document.getElementById('tamanhoSorteio').value = '4';
    await sortearGrupos();
    const porGrupo = t.grupos.map(g => g.membros.filter(id => aeeMuitos.includes(id)).length);
    out.aeeMaisQueGrupos = Math.max(...porGrupo) === 2 && Math.min(...porGrupo) >= 1;
    data.estudantes.forEach(e => { delete e.aee_categoria_projeto; });

    // Desligado = sorteio puro (ainda divide todos)
    t.grupos = [];
    renderModalGrupos();
    document.getElementById('sorteioEquilibrado').checked = false;
    document.getElementById('tamanhoSorteio').value = '4';
    await sortearGrupos();
    out.desligadoDivideTodos = [].concat(...t.grupos.map(g => g.membros)).length === N;

    // Sem registros nenhum: funciona
    data.notas = []; data.presencas = []; data.ocorrencias = []; t.grupos = [];
    renderModalGrupos();
    document.getElementById('sorteioEquilibrado').checked = true;
    document.getElementById('tamanhoSorteio').value = '5';
    await sortearGrupos();
    out.semRegistros = t.grupos.length === 7 && [].concat(...t.grupos.map(g => g.membros)).length === N
      && t.grupos.every(g => g.membros.length >= 4 && g.membros.length <= 5);
    return out;
  });
  await b.close();
  console.log('tempo do sorteio: ' + r.ms + ' ms; janela: ' + r.msJanela + ' ms; desvio das médias: equilibrado ' + r.desvioEquilibrado.toFixed(2) + ' x puro ' + r.desvioPuro.toFixed(2));
  const checar = { caixaMarcada: r.caixaMarcada, todosUmaVez: r.todosUmaVez, tamanhos: r.tamanhos, bemMaisEquilibrado: r.bemMaisEquilibrado,
    ocorrenciaEspalhada: r.ocorrenciaEspalhada, faltososEspalhados: r.faltososEspalhados, resumo: r.resumo, rapido: r.ms < 3000 && r.msJanela < 1500,
    outraFormacao: r.outraFormacao, aeeUmPorGrupo: r.aeeUmPorGrupo && r.aeeUmPorGrupo2, aeeNoResumo: r.aeeNoResumo, aeeMaisQueGrupos: r.aeeMaisQueGrupos, segundoTambemEquilibrado: r.segundoTambemEquilibrado, desligadoDivideTodos: r.desligadoDivideTodos, semRegistros: r.semRegistros };
  let falhou = false;
  Object.entries(checar).forEach(([k, v]) => { console.log((v ? 'OK   ' : 'FALHA') + ' ' + k); if (!v) falhou = true; });
  process.exit(falhou ? 1 : 0);
})();
