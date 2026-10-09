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
  const ctx = await b.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin });
  const p = await ctx.newPage();
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

    // copiar coluna da sugestão (botão) e da planilha
    const lerAreaTransf = async () => { await new Promise(r => setTimeout(r, 100)); return navigator.clipboard.readText(); };
    const botoesSug = document.querySelectorAll('#painelSugestaoSalaFuturo thead button');
    out.qtdBotoesSug = botoesSug.length;
    botoesSug[0].click();
    out.copiaSugAtiv1 = await lerAreaTransf();
    out.esperadoSugAtiv1 = linhas.map(l => l[1]).join('\n');
    botoesSug[3].click();
    out.copiaSugMedia = await lerAreaTransf();
    // filtro de nomes ativo não pode encurtar a cópia
    filtroAlunosTexto['tabTrabalhos:' + turmaAtual] = 'bruno';
    out.copiaAtiv1 = textoNotasAtividade(11);
    filtroAlunosTexto['tabTrabalhos:' + turmaAtual] = '';
    const btPlanilha = document.querySelector('button[onclick^="copiarNotasAtividade(15"]');
    btPlanilha.click();
    out.copiaAtiv5 = await lerAreaTransf();
    // nota vazia vira linha vazia, mantendo o alinhamento
    data.notas = data.notas.filter(n => !(n.id_trabalho == 12 && n.id_estudante == 1));
    out.copiaAtiv2Vazia = textoNotasAtividade(12);

    // título congelado: com muitos alunos o quadro rola e o cabeçalho fica no topo
    const salvos = data.estudantes;
    data.estudantes = Array.from({ length:40 }, (_, k) => ({ id:100+k, id_turma:500, nome_completo:'Aluno ' + String(k).padStart(2,'0'), status:'Ativo' }));
    renderTrabalhos();
    // a aba fica escondida fora da tela da turma; mostra o caminho até ela para medir
    for (let el = document.getElementById('tabTrabalhos'); el && el !== document.body; el = el.parentElement) el.style.display = 'block';
    const caixa = document.querySelector('.sugestao-sala-futuro-box');
    const th = caixa.querySelector('thead th');
    out.rolaSozinha = caixa.scrollHeight > caixa.clientHeight;
    caixa.scrollTop = 300;
    await new Promise(r => setTimeout(r, 50));
    out.tituloNoTopo = Math.abs(th.getBoundingClientRect().top - caixa.getBoundingClientRect().top) <= 2;
    data.estudantes = salvos;
    renderTrabalhos();

    // nome da coluna = atividades que ela resume; caixa de "já lancei" apaga as notas
    const cabecalhos = () => [...document.querySelectorAll('#painelSugestaoSalaFuturo thead th')].map(th => th.querySelector('span') ? th.querySelector('span').textContent : th.textContent.trim());
    out.nomesColunas = cabecalhos().slice(1, 4);
    const caixas = () => [...document.querySelectorAll('#painelSugestaoSalaFuturo thead input[type=checkbox]')];
    out.qtdCaixas = caixas().length;
    caixas()[0].checked = true; caixas()[0].dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 50));
    out.flags = data.trabalhos.map(t => !!t.lancadoSalaFuturo);
    out.marcadaDepois = caixas().map(c => c.checked);
    const opac = (col) => [...document.querySelectorAll('#painelSugestaoSalaFuturo tbody tr')].map(tr => tr.children[col].style.opacity);
    out.opacCol1 = opac(1); out.opacCol2 = opac(2);
    // atividade nova muda a divisão: coluna com atividade ainda não marcada não aparece marcada
    data.trabalhos.push({ id:16, id_turma:500, titulo:'Caderno', tipo:'comum', peso:10, rubricas:[], bimestre:1 });
    renderTrabalhos();
    out.nomesComNova = cabecalhos().slice(1, 4);
    out.marcadaComNova = caixas().map(c => c.checked);
    data.trabalhos.pop();
    caixas()[0].checked = false; caixas()[0].dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 50));
    out.desmarcou = data.trabalhos.every(t => !t.lancadoSalaFuturo);
    // menos de 3 atividades: coluna sem atividade usa a média e não tem caixa
    const todos = data.trabalhos;
    data.trabalhos = todos.slice(0, 1);
    renderTrabalhos();
    out.nomesUma = cabecalhos().slice(1, 4);
    out.caixasUma = caixas().length;
    data.trabalhos = todos;
    renderTrabalhos();

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
  chk(JSON.stringify(r.nomesColunas) === '["At1 + At2","At3 + At4","At5"]', 'colunas levam o nome das atividades que resumem ' + JSON.stringify(r.nomesColunas));
  chk(r.qtdCaixas === 3, 'uma caixa de "já lancei" por coluna de atividade');
  chk(JSON.stringify(r.flags) === '[true,true,false,false,false]' && JSON.stringify(r.marcadaDepois) === '[true,false,false]', 'marcar a 1ª coluna grava nas atividades dela e continua marcada após redesenhar');
  chk(r.opacCol1.every(o => o === '0.5') && r.opacCol2.every(o => o === ''), 'notas da coluna marcada ficam com 50% de opacidade, as outras não');
  chk(JSON.stringify(r.nomesComNova) === '["At1 + At2","At3 + At4","At5 + Caderno"]' && JSON.stringify(r.marcadaComNova) === '[true,false,false]', 'atividade nova entra na divisão sem marcar coluna à toa ' + JSON.stringify(r.nomesComNova));
  chk(r.desmarcou, 'desmarcar limpa a marcação');
  chk(JSON.stringify(r.nomesUma) === '["At1","Média (sem atividade)","Média (sem atividade)"]' && r.caixasUma === 1, 'com uma atividade só, as outras colunas usam a média e não têm caixa ' + JSON.stringify(r.nomesUma));
  chk(r.rolaSozinha && r.tituloNoTopo, 'com 40 alunos o quadro rola e o título fica congelado no topo');
  chk(r.qtdBotoesSug === 4, 'painel tem botão copiar em Atividade 1, 2, 3 e Média SF');
  chk(r.copiaSugAtiv1 === r.esperadoSugAtiv1 && r.copiaSugAtiv1.split('\n').length === 2, 'copiar Atividade 1 da sugestão: uma nota por linha ' + JSON.stringify(r.copiaSugAtiv1));
  chk(r.copiaSugMedia === '7\n4', 'copiar Média SF ' + JSON.stringify(r.copiaSugMedia));
  chk(r.copiaAtiv1 === '8,5\n3', 'copiar atividade da planilha ignora o filtro e usa vírgula ' + JSON.stringify(r.copiaAtiv1));
  chk(r.copiaAtiv5 === '5,5\n4', 'botão 📋 da planilha copia a coluna ' + JSON.stringify(r.copiaAtiv5));
  chk(r.copiaAtiv2Vazia === '\n4', 'nota vazia vira linha vazia ' + JSON.stringify(r.copiaAtiv2Vazia));
  chk(JSON.stringify(r.exata.notas) === '[7,7,7]' && r.exata.alvo === 7, 'média exata 7 fica 7');
  chk(r.umaAtiv.alvo === 7 && r.umaAtiv.notas.reduce((a,v)=>a+v,0) === 21, 'uma atividade só: 6,2 vira 7 em 3 notas');
  chk(JSON.stringify(r.dez.notas) === '[10,10,10]', 'média 9,75 vira 10,10,10');
  chk(r.ruido.alvo === 6, 'média 6,0 por ponto flutuante não sobe para 7');
  chk(r.vazio === null, 'sem atividades não sugere nada');
  chk(r.falhas === 0, 'varredura de 2000 casos: 3 inteiros 0-10 com média = teto da média');
  process.exit(ok.every(x => x[0]) ? 0 : 1);
})();
