// SUGESTÃO DE NOTAS PARA A SALA DO FUTURO (aba Trabalhos).
//
// A chave abaixo da seleção de bimestre mostra, por estudante, 3 notas inteiras cuja
// média é a média ponderada do bimestre arredondada para cima. Cobre: a chave começa
// desligada, liga e desliga o painel, a média das 3 fecha com o teto da média, as notas
// ficam entre 0 e 10, e casos de borda (menos de 3 atividades, média exata, nota 10).
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
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Paula', status:'Ativo' },
                    { id:2, id_turma:500, nome_completo:'Bruno Silva', status:'Ativo' } ],
      trabalhos: [1,2,3,4,5].map(k => ({ id:10+k, id_turma:500, titulo:'At'+k, tipo:'comum', peso: k===5 ? 20 : 10, rubricas:[], bimestre:1 })),
      notas: [
        ['8,5',7,6,9,5.5], ['3',4,'2,5',6,4]
      ].flatMap((vs, ei) => vs.map((v, k) => ({ id:'n'+ei+k, id_trabalho:11+k, id_estudante:ei+1, valor:String(v) }))) });
    turmaAtual = 500;
    if (!document.getElementById('tabTrabalhos')) {
      const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d);
    }
    currentBimestreTrabalhos = 1;
    renderTrabalhos();
    const out = {};
    out.desligadaInicio = !document.getElementById('chaveSugestaoSalaFuturo').checked && !document.getElementById('painelSugestaoSalaFuturo');

    const chave = document.getElementById('chaveSugestaoSalaFuturo');
    chave.checked = true; chave.dispatchEvent(new Event('change'));
    const linhas = [...document.querySelectorAll('#painelSugestaoSalaFuturo tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
    out.linhas = linhas;

    const c2 = document.getElementById('chaveSugestaoSalaFuturo');
    c2.checked = false; c2.dispatchEvent(new Event('change'));
    out.desligou = !document.getElementById('painelSugestaoSalaFuturo');

    const s = (arr) => sugerirNotasSalaFuturo(arr.map(([v, w]) => ({ valor:v, peso:w })));
    out.exata = s([[7,1],[7,1],[7,1],[7,1]]);
    out.umaAtiv = s([[6.2,10]]);
    out.dez = s([[10,1],[9.5,1]]);
    out.ruido = s([[6.1,1],[5.9,1]]);  // 6,0000000001 não vira 7
    out.vazio = s([]);
    // varredura: média das 3 = teto da média, sempre entre 0 e 10
    let falhas = 0;
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(Math.random() * 8);
      const its = Array.from({ length:n }, () => ({ valor: Math.round(Math.random()*100)/10, peso: 1 + Math.floor(Math.random()*10) }));
      const x = sugerirNotasSalaFuturo(its);
      if (x.notas.length !== 3 || x.notas.some(v => v < 0 || v > 10 || !Number.isInteger(v)) || x.notas.reduce((a,v)=>a+v,0) !== x.alvo*3 || x.alvo < x.media - 1e-6 || x.alvo - x.media >= 1) falhas++;
    }
    out.falhas = falhas;
    return out;
  });
  await b.close();

  const ok = [];
  const chk = (c, m) => { ok.push([c, m]); console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); };
  chk(r.desligadaInicio, 'chave começa desligada, sem painel');
  // colunas: nome, At1, At2, At3, média atual, média SF
  // Ana: (8.5+7+6+9)*10 + 5.5*20 = 305+110 = 415 / 60 = 6,92 -> 7
  const ana = r.linhas.find(l => l[0] === 'Ana Paula');
  chk(ana && ana[4] === '6,92' && ana[5] === '7' && (+ana[1] + +ana[2] + +ana[3]) === 21, 'Ana: média 6,92 vira 7 e as 3 notas somam 21 ' + JSON.stringify(ana));
  // Bruno: (3+4+2.5+6)*10 + 4*20 = 155+80 = 235/60 = 3,92 -> 4
  const bruno = r.linhas.find(l => l[0] === 'Bruno Silva');
  chk(bruno && bruno[5] === '4' && (+bruno[1] + +bruno[2] + +bruno[3]) === 12, 'Bruno: média 3,92 vira 4 ' + JSON.stringify(bruno));
  chk(r.desligou, 'desligar a chave esconde o painel');
  chk(JSON.stringify(r.exata.notas) === '[7,7,7]' && r.exata.alvo === 7, 'média exata 7 fica 7');
  chk(r.umaAtiv.alvo === 7 && r.umaAtiv.notas.reduce((a,v)=>a+v,0) === 21, 'uma atividade só: 6,2 vira 7 em 3 notas');
  chk(JSON.stringify(r.dez.notas) === '[10,10,10]', 'média 9,75 vira 10,10,10');
  chk(r.ruido.alvo === 6, 'média 6,0 por ponto flutuante não sobe para 7');
  chk(r.vazio === null, 'sem atividades não sugere nada');
  chk(r.falhas === 0, 'varredura de 2000 casos: 3 inteiros 0-10 com média = teto da média');
  process.exit(ok.every(x => x[0]) ? 0 : 1);
})();
