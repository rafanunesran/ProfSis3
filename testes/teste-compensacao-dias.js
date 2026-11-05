// COMPENSAÇÕES: DIAS DE FALTA EMBAIXO DO NOME + MENU SATÉLITE.
//
// Embaixo do nome aparece "Faltou: 1/10, 7/10 (2 aulas)" com as faltas do mês de
// referência. Roda no fuso do Brasil: antes, a falta do dia 1º caía no mês anterior
// ao gerar as compensações (new Date("AAAA-MM-DD") é meia-noite em UTC).
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';
const FOTO = process.env.PROFSIS_FOTO || '';

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
  const ctx = await b.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 900, height: 700 }, deviceScaleFactor: FOTO ? 2 : 1 });
  const p = await ctx.newPage();
  await p.route(/gstatic\.com|googleapis\.com/, r => r.abort());
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
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Souza', status:'Ativo' },
                    { id:2, id_turma:500, nome_completo:'Bruno Lima', status:'Ativo' } ],
      // 2026-10-07 é quarta: a grade tem 2 aulas da turma nesse dia (aula dupla).
      schoolGrade: [ { id:'b1', diaSemana:3 }, { id:'b2', diaSemana:3 }, { id:'b3', diaSemana:4 } ],
      horariosAulas: [ { id_bloco:'b1', tipo:'aula', id_turma:500 }, { id_bloco:'b2', tipo:'aula', id_turma:500 }, { id_bloco:'b3', tipo:'aula', id_turma:500 } ],
      presencas: [
        { id:1, id_estudante:1, data:'2026-10-01', status:'falta' },
        { id:2, id_estudante:1, data:'2026-10-07', status:'falta' },
        { id:3, id_estudante:1, data:'2026-09-30', status:'falta' },
        { id:4, id_estudante:2, data:'2026-10-15', status:'falta' },
        { id:5, id_estudante:2, data:'2026-10-16', status:'presente' } ],
      compensacoes: [] });
    turmaAtual = 500;
    document.body.innerHTML = '<div id="tabCompensacoes"></div>';
    renderCompensacoes();
    document.getElementById('compMes').value = '9';
    document.getElementById('compAno').value = '2026';
    document.getElementById('atividadeCompensacao').value = 'Lista 3';
  });
  await p.locator('#tabCompensacoes button', { hasText: 'Gerar Compensações' }).click();
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({
    comps: data.compensacoes.map(c => ({ est: c.id_estudante, qtd: c.qtd_faltas, peso: c.peso_faltas })),
    ana: document.querySelector('#tabCompensacoes tr[data-nome="Ana Souza"] .comp-dias-falta')?.textContent.trim(),
    anaDentroDoNome: !!document.querySelector('#tabCompensacoes tr[data-nome="Ana Souza"] td:first-child .comp-dias-falta'),
    bruno: document.querySelector('#tabCompensacoes tr[data-nome="Bruno Lima"] .comp-dias-falta')?.textContent.trim() }));

  await p.locator('#tabCompensacoes tr[data-nome="Ana Souza"] td:nth-child(4) button').click();
  await p.waitForTimeout(300);
  const menu = await p.evaluate(() => {
    const m = document.getElementById('compSatelite');
    const itens = [...m.querySelectorAll('.comp-sat-item')].map(b => { const q = b.getBoundingClientRect(); return { s: b.dataset.status, l: q.left, t: q.top, r: q.right, b: q.bottom }; });
    return { n: itens.length, atual: m.querySelector('.comp-sat-item.atual')?.dataset.status,
      dentro: itens.every(i => i.l >= 0 && i.t >= 0 && i.r <= innerWidth && i.b <= innerHeight) };
  });
  if (FOTO) await p.screenshot({ path: FOTO });
  await p.keyboard.press('Escape');
  const fechouEsc = await p.evaluate(() => !document.getElementById('compSatelite'));
  await b.close();

  const ok = [
    ['falta do dia 1º conta no mês certo (fuso do Brasil)', r.comps.find(c => c.est == 1)?.qtd === 2 && r.comps.find(c => c.est == 1)?.peso === 3],
    ['dias de falta embaixo do mês, com aula dupla', r.ana === 'Faltou: 1/10, 7/10 (2 aulas)'],
    ['dias ficam debaixo do mês, não do nome', r.anaDentroDoNome === false && !!r.ana],
    ['presença não aparece como falta', r.bruno === 'Faltou: 15/10'],
    ['menu satélite com 6 opções, atual destacada', menu.n === 6 && menu.atual === 'pendente'],
    ['opções cabem na tela', menu.dentro],
    ['Esc fecha o menu', fechouEsc],
    ['nenhum erro na página', erros.length === 0],
  ];
  ok.forEach(([n, v]) => console.log((v ? 'OK   ' : 'FALHA') + ' ' + n));
  if (!ok.every(x => x[1])) console.log(JSON.stringify({ r, menu, erros }, null, 1));
  process.exit(ok.every(x => x[1]) ? 0 : 1);
})();
