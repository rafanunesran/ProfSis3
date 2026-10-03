// FILTRO DE ESTUDANTES POR NOME NAS TELAS DE LANÇAMENTO.
//
// Trabalhos, Caderno e Compensações ganham um campo que mostra só as linhas cujo nome
// contém o trecho digitado (acento e caixa não importam). Cobre: filtrar sem redesenhar
// (a nota digitada continua no campo), o filtro sobrevive a um redesenho da tela, e
// trocar de turma não leva o filtro junto.
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
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'1A' }, { id:600, nome:'1B' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [
        { id:1, id_turma:500, nome_completo:'Ana Clara Santana', status:'Ativo' },
        { id:2, id_turma:500, nome_completo:'JOÃO PEDRO LIMA', status:'Ativo' },
        { id:3, id_turma:500, nome_completo:'Mariana Souza', status:'Ativo' },
        { id:4, id_turma:600, nome_completo:'Bruno Alves', status:'Ativo' } ],
      trabalhos: [ { id:11, id_turma:500, titulo:'Prova', tipo:'comum', peso:10, rubricas:[], bimestre:1 } ],
      compensacoes: [ { id:7, id_turma:500, id_estudante:3, mes_referencia:1, ano_referencia:2026, atividade:'Lista', status:'pendente', historico:[] } ],
      notas: [] });
    ['tabTrabalhos','tabCaderno','tabCompensacoes'].forEach(id => {
      if (!document.getElementById(id)) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
    });
    turmaAtual = 500; currentBimestreTrabalhos = 1;
    const visiveis = id => Array.from(document.querySelectorAll('#' + id + ' tr[data-nome]')).filter(tr => tr.style.display !== 'none').map(tr => tr.dataset.nome);
    const digitar = (id, txt) => { const i = document.querySelector('#' + id + ' .filtro-alunos'); i.value = txt; i.dispatchEvent(new Event('input')); };

    renderTrabalhos();
    const campoNota = document.querySelector('#tabTrabalhos tr[data-nome="Mariana Souza"] input');
    campoNota.value = '7';               // digitado, ainda sem sair do campo
    digitar('tabTrabalhos', 'ana');      // "Ana Clara Santana" e "Mariana Souza"
    const trab1 = visiveis('tabTrabalhos');
    const notaFicou = document.querySelector('#tabTrabalhos tr[data-nome="Mariana Souza"] input').value === '7';
    const contagem = document.querySelector('#tabTrabalhos .filtro-alunos-contagem').textContent;
    digitar('tabTrabalhos', 'joao p');   // sem acento acha JOÃO PEDRO
    const trab2 = visiveis('tabTrabalhos');
    renderTrabalhos();                   // redesenho mantém o filtro
    const trab3 = visiveis('tabTrabalhos');
    const campoMantido = document.querySelector('#tabTrabalhos .filtro-alunos').value;
    digitar('tabTrabalhos', '');
    const trabTodos = visiveis('tabTrabalhos').length;
    digitar('tabTrabalhos', 'zzz');
    const nenhum = visiveis('tabTrabalhos').length;
    digitar('tabTrabalhos', 'joao');

    renderCaderno();
    digitar('tabCaderno', 'SANTANA');
    const cad = visiveis('tabCaderno');

    renderCompensacoes();
    digitar('tabCompensacoes', 'ana');
    const compAna = visiveis('tabCompensacoes');
    digitar('tabCompensacoes', 'joao');
    const compJoao = visiveis('tabCompensacoes');

    turmaAtual = 600; renderTrabalhos();
    const outraTurma = { campo: document.querySelector('#tabTrabalhos .filtro-alunos').value, linhas: visiveis('tabTrabalhos') };
    return { trab1, notaFicou, contagem, trab2, trab3, campoMantido, trabTodos, nenhum, cad, compAna, compJoao, outraTurma };
  });
  await b.close();

  const ok = [
    ['trecho no meio do nome ("ana")', JSON.stringify(r.trab1) === '["Ana Clara Santana","Mariana Souza"]'],
    ['nota digitada não se perde ao filtrar', r.notaFicou],
    ['contagem "2 de 3"', r.contagem === '2 de 3'],
    ['sem acento acha nome com acento', JSON.stringify(r.trab2) === '["JOÃO PEDRO LIMA"]'],
    ['filtro continua após redesenhar', JSON.stringify(r.trab3) === '["JOÃO PEDRO LIMA"]' && r.campoMantido === 'joao p'],
    ['campo vazio mostra todos', r.trabTodos === 3],
    ['nada encontrado esconde tudo', r.nenhum === 0],
    ['caderno filtra', JSON.stringify(r.cad) === '["Ana Clara Santana"]'],
    ['compensações filtram', JSON.stringify(r.compAna) === '["Mariana Souza"]' && r.compJoao.length === 0],
    ['outra turma começa sem filtro', r.outraTurma.campo === '' && JSON.stringify(r.outraTurma.linhas) === '["Bruno Alves"]'],
  ];
  ok.forEach(([n, v]) => console.log((v ? 'OK   ' : 'FALHA') + ' ' + n));
  if (!ok.every(x => x[1])) console.log(JSON.stringify(r, null, 1));
  process.exit(ok.every(x => x[1]) ? 0 : 1);
})();
