// NOTA DO GRUPO DIGITADA DE VERDADE NA PLANILHA (clique, digita, clica no colega).
//
// Defeito relatado: lançar a nota de um integrante e ir para a célula do próximo do
// grupo. A nota do grupo só aparecia nos colegas depois da gravação na nuvem, que é
// lenta; a célula em que o cursor já estava ficava vazia e, ao sair dela sem digitar,
// gravava "vazio" e apagava a nota do grupo todo. Aqui a gravação demora 600 ms de
// propósito, e tudo é feito com mouse e teclado.
const { chromium } = require('playwright');
const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
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
  await p.evaluate(async () => {
    persistirDados = () => new Promise(r => setTimeout(r, 600));   // nuvem lenta
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'1A', disciplina:'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Paula', status:'Ativo' },
                    { id:2, id_turma:500, nome_completo:'Bruno Silva', status:'Ativo' },
                    { id:3, id_turma:500, nome_completo:'Carla Souza', status:'Ativo' },
                    { id:4, id_turma:500, nome_completo:'Davi Lima', status:'Ativo' } ],
      trabalhos: [ { id:11, id_turma:500, titulo:'Seminario', tipo:'comum', peso:10, rubricas:[], bimestre:1,
                     grupos: [ { id:'g1', nome:'Grupo 1', membros:[1,2,3], nota:'' } ] } ],
      notas: [] });
    turmaAtual = 500; currentBimestreTrabalhos = 1;
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    await abrirTurma(500);
    showTurmaTab('trabalhos');
  });
  await p.waitForTimeout(500);
  const cel = id => p.locator(`#tabTrabalhos input[data-nota="11|${id}"]`);
  const notas = () => p.evaluate(() => [1,2,3,4].map(id => { const n = data.notas.find(x => x.id_trabalho == 11 && x.id_estudante == id); return n ? n.valor : ''; }).join(','));
  const r = {};

  // Ana: 8, e já clica no Bruno (antes de a gravação terminar)
  await cel(1).click(); await p.keyboard.type('8');
  await cel(2).click();
  await p.waitForTimeout(900);
  r.brunoMostraNotaDoGrupo = await cel(2).inputValue() === '8';
  r.carlaMostra = await cel(3).inputValue() === '8';
  // Sai do Bruno sem digitar e vai para a Carla, depois para o Davi (fora do grupo)
  await cel(3).click(); await p.waitForTimeout(200);
  await cel(4).click(); await p.waitForTimeout(900);
  r.naoApagouAoPassar = (await notas()) === '8,8,8,';
  // Davi é de fora: digitar nele não mexe no grupo
  await p.keyboard.type('5'); await cel(1).click(); await p.waitForTimeout(900);
  r.foraDoGrupo = (await notas()) === '8,8,8,5';
  // Muda no Carla para 9: o grupo todo vai para 9 (inclusive quem já tinha 8)
  await cel(3).click(); await p.keyboard.press('Control+A'); await p.keyboard.type('9');
  await cel(4).click(); await p.waitForTimeout(900);
  r.trocaNoGrupo = (await notas()) === '9,9,9,5';
  r.celulasMostram9 = (await cel(1).inputValue()) === '9' && (await cel(2).inputValue()) === '9';
  // "Só para Carla": os outros voltam a 8; depois, nota no Bruno continua indo para a Ana
  await p.click('#avisoGrupoNota button:has-text("Só para")'); await p.waitForTimeout(900);
  r.soParaCarla = (await notas()) === '8,8,9,5';
  await cel(2).click(); await p.keyboard.press('Control+A'); await p.keyboard.type('7');
  await cel(1).click(); await p.waitForTimeout(900);
  r.depoisDoSoParaContinua = (await notas()) === '7,7,9,5' && (await cel(1).inputValue()) === '7';
  // Tab da Ana leva para a próxima coluna; sair sem digitar não mexe
  await cel(1).click(); await p.keyboard.press('Tab'); await p.waitForTimeout(700);
  r.passarSemDigitar = (await notas()) === '7,7,9,5';

  await b.close();
  let falhou = false;
  Object.entries(r).forEach(([k, v]) => { console.log((v ? 'OK   ' : 'FALHA') + ' ' + k); if (!v) falhou = true; });
  process.exit(falhou ? 1 : 0);
})();
