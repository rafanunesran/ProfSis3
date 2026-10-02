// COLAR NOTAS DO EXCEL NUMA ATIVIDADE.
//
// Tipo "Colar do Excel": o professor cola as colunas nome + nota e cada linha vira a
// nota do estudante da turma com aquele nome. Cobre: tab ou espaço como separador,
// nota com ponto ou vírgula, acento/caixa diferentes, nome cortado no fim (célula
// estreita), nome que não é da turma (ignorado, não lança em ninguém), linha sem
// nota, e colar de novo na mesma atividade substituindo sem duplicar.
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
      turmas: [ { id:500, nome:'1A', disciplina:'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [
        { id:1, id_turma:500, nome_completo:'Agatha Soares da Silva', status:'Ativo' },
        { id:2, id_turma:500, nome_completo:'ALÍCIA OLIVEIRA DE ANDRADE', status:'Ativo' },
        { id:3, id_turma:500, nome_completo:'ARTHUR HENRIQUE RODRIGUES DA SILVA BATISTA', status:'Ativo' },
        { id:4, id_turma:500, nome_completo:'AGATHA JOANA ANDRADE MAIA', status:'Ativo' },
        { id:5, id_turma:500, nome_completo:'BRUNO SANTOS ALVES', status:'Ativo' },
        { id:9, id_turma:999, nome_completo:'YURI PAULINO DA SILVA', status:'Ativo' } ],   // outra turma
      trabalhos: [], notas: [] });
    turmaAtual = 500; currentBimestreTrabalhos = 2;
    if (!document.getElementById('tabTrabalhos')) {
      const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d);
    }
    const texto = [
      'AGATHA JOANA ANDRADE MAIA\t0',
      'AGATHA SOARES DA SILVA\t8.5',
      'ALICIA OLIVEIRA DE ANDRADE    9,5',
      'ARTHUR HENRIQUE RODRIGUES DA SILVA BATI\t9.5',
      'YURI PAULINO DA SILVA\t0',
      'BRUNO SANTOS ALVES\t',
      '' ].join('\n');

    abrirModalNovoTrabalho();
    document.getElementById('trabalhoTitulo').value = 'Prova colada';
    document.getElementById('trabalhoTipo').value = 'colar';
    toggleCamposTrabalho('colar');
    document.getElementById('trabalhoColarTexto').value = texto;
    previaColarNotas();
    const previa = document.getElementById('previaColar').innerText;
    await salvarTrabalho({ preventDefault(){} });

    const t = data.trabalhos[0];
    const nota = id => (data.notas.find(n => n.id_trabalho == t.id && n.id_estudante == id) || {}).valor;
    const primeira = { 1: nota(1), 2: nota(2), 3: nota(3), 4: nota(4), 5: nota(5), 9: nota(9) };

    // colar de novo só um estudante: substitui o dele, mantém os outros
    abrirModalNovoTrabalho(t.id);
    document.getElementById('trabalhoColarTexto').value = 'Agatha Soares da Silva\t10';
    await salvarTrabalho({ preventDefault(){} });
    const tab = document.getElementById('tabTrabalhos').innerHTML;
    return { tipo: t.tipo, bim: t.bimestre, primeira, previa,
             depois: { 1: nota(1), 2: nota(2) }, totalNotas: data.notas.length,
             tabTem: tab.includes('Prova colada') };
  });
  await b.close();

  const ok = [
    ['atividade criada como colar no bimestre aberto', r.tipo === 'colar' && r.bim === 2],
    ['tab e ponto -> 8,5', r.primeira[1] === '8,5'],
    ['espaços, vírgula e acento diferente -> 9,5', r.primeira[2] === '9,5'],
    ['nome cortado no fim identificado', r.primeira[3] === '9,5'],
    ['zero lançado', r.primeira[4] === '0'],
    ['linha sem nota não lança', r.primeira[5] === undefined],
    ['estudante de outra turma não recebe nota', r.primeira[9] === undefined],
    ['prévia avisa nome não encontrado', /não encontrado/.test(r.previa) && /YURI PAULINO/.test(r.previa)],
    ['colar de novo substitui sem duplicar', r.depois[1] === '10' && r.depois[2] === '9,5' && r.totalNotas === 4],
    ['aparece na planilha', r.tabTem],
  ];
  ok.forEach(([n, v]) => console.log((v ? 'OK   ' : 'FALHA') + ' ' + n));
  if (!ok.every(x => x[1])) console.log(JSON.stringify(r, null, 1));
  process.exit(ok.every(x => x[1]) ? 0 : 1);
})();
