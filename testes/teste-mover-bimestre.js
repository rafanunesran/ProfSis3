// MUDAR O BIMESTRE DE UMA ATIVIDADE SEM PERDER NOTAS.
//
// Na edição da atividade (aba Trabalhos) há um campo "Bimestre". Trocar ali move a
// atividade inteira: as notas apontam para o id dela, então a nota direta, as
// rubricas marcadas e a nota ajustada à mão de um tipo automático vão junto.
// Cobre também que a atividade some do bimestre antigo e que nada é duplicado.
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
    persistirDados = async () => {};          // sem banco: só o estado em memória
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'1A', disciplina:'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Paula', status:'Ativo' },
                    { id:2, id_turma:500, nome_completo:'Bruno Silva', status:'Ativo' } ],
      trabalhos: [
        { id:11, id_turma:500, titulo:'Prova', tipo:'comum', peso:10, rubricas:[], bimestre:1 },
        { id:12, id_turma:500, titulo:'Seminario', tipo:'rubrica', peso:4,
          rubricas:[ {id:1, nome:'Fala', peso:2}, {id:2, nome:'Slides', peso:2} ] },   // sem bimestre = 1º
        { id:13, id_turma:500, titulo:'Participacao', tipo:'participacao', peso:10, rubricas:[], bimestre:1 } ],
      notas: [
        { id:'n1', id_trabalho:11, id_estudante:1, valor:'8,5' },
        { id:'n2', id_trabalho:11, id_estudante:2, valor:'6' },
        { id:'n3', id_trabalho:12, id_estudante:1, valor:2, rubricas_marcadas:[1] },
        { id:'n4', id_trabalho:13, id_estudante:2, valor:'7' } ] });
    turmaAtual = 500;
    if (!document.getElementById('tabTrabalhos')) {
      const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d);
    }
    currentBimestreTrabalhos = 1;
    renderTrabalhos();

    const mover = async (id, bim) => {
      abrirModalNovoTrabalho(id);
      document.getElementById('trabalhoBimestre').value = String(bim);
      await salvarTrabalho({ preventDefault(){} });
    };
    const notasAntes = JSON.stringify(data.notas);
    await mover(11, 3);
    const viuBim3 = currentBimestreTrabalhos;
    const tab3 = document.getElementById('tabTrabalhos').innerHTML;
    await mover(12, 2);
    await mover(13, 4);
    currentBimestreTrabalhos = 1; renderTrabalhos();
    const tab1 = document.getElementById('tabTrabalhos').innerHTML;
    const t = id => data.trabalhos.find(x => x.id == id);
    return {
      bims: [t(11).bimestre, t(12).bimestre, t(13).bimestre],
      notasIguais: JSON.stringify(data.notas) === notasAntes,
      rubricasIguais: t(12).rubricas.length === 2,
      totalTrabalhos: data.trabalhos.length,
      viuBim3,
      tab3MostraNota: tab3.includes('8,5') && tab3.includes('Prova'),
      tab1Vazio: !tab1.includes('Prova') && !tab1.includes('Seminario'),
      modalJaNoBim: (abrirModalNovoTrabalho(12), document.getElementById('trabalhoBimestre').value),
      novaNoBimAtual: (closeModal('modalNovoTrabalho'), currentBimestreTrabalhos = 2, abrirModalNovoTrabalho(), document.getElementById('trabalhoBimestre').value)
    };
  });
  await b.close();

  const ok = [
    ['bimestres movidos (3, 2, 4)', JSON.stringify(r.bims) === '[3,2,4]'],
    ['notas e rubricas marcadas intactas', r.notasIguais],
    ['critérios da rubrica mantidos', r.rubricasIguais],
    ['nada duplicado', r.totalTrabalhos === 3],
    ['planilha vai para o bimestre novo', r.viuBim3 === 3],
    ['nota aparece no bimestre novo', r.tab3MostraNota],
    ['bimestre antigo fica sem a atividade', r.tab1Vazio],
    ['editar abre no bimestre da atividade', r.modalJaNoBim === '2'],
    ['nova atividade sugere o bimestre aberto', r.novaNoBimAtual === '2'],
  ];
  ok.forEach(([n, v]) => console.log((v ? 'OK   ' : 'FALHA') + ' ' + n));
  process.exit(ok.every(x => x[1]) ? 0 : 1);
})();
