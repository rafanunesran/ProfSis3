// CLIQUES QUE QUEBRAVAM COM ID DE TEXTO.
//
// novoId() gera ids como "mg3k2-a1b2c3". Nos botões da tela eles iam sem aspas:
// onclick="toggleStatusCompensacao(mg3k2-a1b2c3)" vira uma conta, dá erro e o clique
// não faz nada. Era o caso do status das compensações (todas usam novoId) e também dos
// alunos criados pela importação em massa da gestão, na planilha de notas e no caderno.
// Este teste clica de verdade nos botões, com ids de texto e numéricos.
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
  const erros = [];
  p.on('pageerror', e => erros.push(String(e.message)));
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  erros.length = 0;

  await p.evaluate(() => {
    persistirDados = async () => {};
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'1A' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:'mg3k2-a1b2c3', id_turma:500, nome_completo:'Ana Texto', status:'Ativo' },
                    { id:7, id_turma:500, nome_completo:'Bia Numero', status:'Ativo' } ],
      trabalhos: [ { id:11, id_turma:500, titulo:'Prova', tipo:'comum', peso:10, rubricas:[], bimestre:1 },
                   { id:12, id_turma:500, titulo:'Sem', tipo:'rubrica', peso:2, rubricas:[{id:1,nome:'A',peso:2}], bimestre:1 } ],
      compensacoes: [
        { id:'mh01a-zz9x8y', id_turma:500, id_estudante:'mg3k2-a1b2c3', mes_referencia:1, ano_referencia:2026, atividade:'Lista', status:'pendente', historico:[] },
        { id:123, id_turma:500, id_estudante:7, mes_referencia:1, ano_referencia:2026, atividade:'Resumo', status:'pendente', historico:[] } ],
      caderno: [], notas: [] });
    turmaAtual = 500; currentBimestreTrabalhos = 1;
    // As abas reais ficam escondidas fora da turma aberta; aqui só elas, visíveis, para clicar.
    document.body.innerHTML = '<div id="tabTrabalhos"></div><div id="tabCaderno"></div><div id="tabCompensacoes"></div>';
    renderCompensacoes();
  });
  const botaoStatus = (nome) => p.locator(`#tabCompensacoes tr[data-nome="${nome}"] td:nth-child(4) button`);
  await botaoStatus('Ana Texto').click();
  await botaoStatus('Ana Texto').click();
  await botaoStatus('Bia Numero').click();
  const comp = await p.evaluate(() => ({
    texto: data.compensacoes.find(c => c.id === 'mh01a-zz9x8y').status,
    numero: data.compensacoes.find(c => c.id === 123).status,
    rotulo: document.querySelector('#tabCompensacoes tr[data-nome="Ana Texto"] td:nth-child(4) button').textContent.trim() }));
  await p.locator('#tabCompensacoes tr[data-nome="Bia Numero"] td:nth-child(5) button').click();
  const sobrou = await p.evaluate(() => data.compensacoes.map(c => c.id));

  // Planilha de notas e caderno com aluno de id texto
  await p.evaluate(() => renderTrabalhos());
  const campo = p.locator('#tabTrabalhos tr[data-nome="Ana Texto"] td:nth-child(2) input');
  await campo.fill('8,5'); await campo.blur();
  const campo2 = p.locator('#tabTrabalhos tr[data-nome="Bia Numero"] td:nth-child(2) input');
  await campo2.fill('6'); await campo2.blur();
  await p.locator('#tabTrabalhos tr[data-nome="Ana Texto"] input[type=checkbox]').check();
  await p.evaluate(() => renderCaderno());
  await p.locator('#tabCaderno tr[data-nome="Ana Texto"] input[value=incompleto]').check();
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({
    notaTexto: data.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 'mg3k2-a1b2c3'),
    notaNumero: data.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 7),
    rubrica: data.notas.find(n => n.id_trabalho == 12 && n.id_estudante === 'mg3k2-a1b2c3'),
    caderno: data.caderno.find(c => c.id_estudante === 'mg3k2-a1b2c3') }));
  await b.close();

  const ok = [
    ['status da compensação com id de texto avança (2 cliques)', comp.texto === 'entregue'],
    ['rótulo do botão atualiza', /Entregue/.test(comp.rotulo)],
    ['status da compensação com id numérico avança', comp.numero === 'notificado'],
    ['excluir compensação funciona', JSON.stringify(sobrou) === '["mh01a-zz9x8y"]'],
    ['nota salva para aluno de id texto', r.notaTexto && r.notaTexto.valor === '8,5'],
    ['nota salva para aluno de id número (tipo mantido)', r.notaNumero && r.notaNumero.valor === '6'],
    ['rubrica marca para aluno de id texto', r.rubrica && r.rubrica.valor === 2],
    ['caderno salva para aluno de id texto', r.caderno && r.caderno.status === 'incompleto'],
    ['nenhum erro na página', erros.length === 0],
  ];
  ok.forEach(([n, v]) => console.log((v ? 'OK   ' : 'FALHA') + ' ' + n));
  if (!ok.every(x => x[1])) console.log(JSON.stringify({ comp, sobrou, r, erros }, null, 1));
  process.exit(ok.every(x => x[1]) ? 0 : 1);
})();
