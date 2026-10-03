// IMPORTAR ATIVIDADES DE OUTRA TURMA.
//
// Botão "Importar de outra turma" na aba Trabalhos: copia título, tipo, peso e
// critérios da rubrica, nunca as notas. Cobre: escolher o bimestre de destino ou
// manter o original, rubrica copiada sem compartilhar o objeto com a origem,
// avaliação da gestão que não é desta turma (pulada) e a origem intacta.

const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const FAKE = () => {
  window.__docs = {};
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'p1',email:'p@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  const r = await p.evaluate(async () => {
    persistirDados = async () => {};
    cacheAvaliacoesGestorEscola = { avaliacoesGestor: [ { id:'av1', nome:'Prova Paulista', bimestre:1, id_turmas:[100] } ], notasAvaliacoesGestor: [] };
    data = Object.assign(getInitialData(), {
      turmas: [ { id:100, nome:'1A', disciplina:'Matematica' }, { id:200, nome:'1B', disciplina:'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:1, id_turma:100, nome_completo:'Ana', status:'Ativo' }, { id:2, id_turma:200, nome_completo:'Bia', status:'Ativo' } ],
      trabalhos: [
        { id:11, id_turma:100, titulo:'Prova', tipo:'comum', peso:10, rubricas:[], bimestre:1 },
        { id:12, id_turma:100, titulo:'Seminario', tipo:'rubrica', peso:4, rubricas:[ {id:1, nome:'Fala', peso:2}, {id:2, nome:'Slides', peso:2} ], bimestre:3 },
        { id:13, id_turma:100, titulo:'Prova Paulista', tipo:'avaliacao_gestor', peso:10, rubricas:[], bimestre:1, id_avaliacao_gestor:'av1' } ],
      notas: [ { id:'n1', id_trabalho:11, id_estudante:1, valor:'8' }, { id:'n2', id_trabalho:12, id_estudante:1, valor:2, rubricas_marcadas:[1] } ] });
    turmaAtual = 200; currentBimestreTrabalhos = 2;
    if (!document.getElementById('tabTrabalhos')) {
      const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d);
    }
    const origemAntes = JSON.stringify(data.trabalhos.filter(t => t.id_turma == 100));

    // 1ª importação: tudo, no bimestre aberto (2º)
    abrirModalImportarAtividades();
    const listouOrigem = document.getElementById('importarTurmaOrigem').value === '100';
    document.querySelectorAll('.importar-item').forEach(c => c.checked = true);
    await importarAtividadesSelecionadas();
    const copias1 = data.trabalhos.filter(t => t.id_turma == 200).map(t => JSON.parse(JSON.stringify(t)));

    // 2ª importação: só a rubrica, mantendo o bimestre original
    abrirModalImportarAtividades();
    document.querySelector('.importar-item[value="12"]').checked = true;
    document.getElementById('importarBimestreDestino').value = 'mesmo';
    await importarAtividadesSelecionadas();
    const rub = data.trabalhos.filter(t => t.id_turma == 200 && t.tipo === 'rubrica');
    rub[0].rubricas[0].nome = 'Mudado';   // editar a cópia não pode mexer na origem
    const ids = data.trabalhos.map(t => t.id);
    return {
      listouOrigem, copias1,
      rub2Bim: rub[1] && rub[1].bimestre,
      origemIntacta: JSON.stringify(data.trabalhos.filter(t => t.id_turma == 100)) === origemAntes,
      notasNaoCopiadas: data.notas.length === 2,
      idsUnicos: new Set(ids).size === ids.length,
      tela: document.getElementById('tabTrabalhos').innerHTML.includes('Importar de outra turma'),
    };
  });
  await b.close();

  const c = r.copias1;
  const ok = [
    ['turma de origem listada', r.listouOrigem],
    ['comum e rubrica importadas, avaliação da gestão de outra turma pulada', c.length === 2 && !c.some(t => t.tipo === 'avaliacao_gestor')],
    ['foram para o bimestre aberto', c.every(t => t.bimestre === 2)],
    ['título, tipo e peso copiados', c.some(t => t.titulo === 'Prova' && t.tipo === 'comum' && t.peso === 10)],
    ['critérios da rubrica copiados', c.some(t => t.tipo === 'rubrica' && t.rubricas.map(x => x.nome + x.peso).join() === 'Fala2,Slides2')],
    ['manter bimestre original', r.rub2Bim === 3],
    ['origem intacta (inclusive ao editar a cópia)', r.origemIntacta],
    ['notas não copiadas', r.notasNaoCopiadas],
    ['ids únicos', r.idsUnicos],
    ['botão na planilha', r.tela],
  ];
  ok.forEach(([n, v]) => console.log((v ? 'OK   ' : 'FALHA') + ' ' + n));
  if (!ok.every(x => x[1])) console.log(JSON.stringify(r, null, 1));
  process.exit(ok.every(x => x[1]) ? 0 : 1);
})();
