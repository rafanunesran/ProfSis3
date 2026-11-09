// ENTREGAS ONLINE: o botão 🎬 de uma atividade cria o link do StopMotion e mostra
// quem entregou.
//
// Cobre: o botão só nas atividades com nota digitada; criar o link grava a tarefa
// pública SEM dado de estudante e guarda o código na atividade; o nome digitado pelo
// aluno é casado com a turma (com acento, minúscula, nome do meio faltando), dois
// "João" empatados não são chutados, o professor liga a entrega à mão; a nota lançada
// na janela vai para a planilha; fechar a entrega regrava a tarefa com aberta:false.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';

const FAKE = () => {
  window.__docs = {};
  const copia = o => JSON.parse(JSON.stringify(o));
  const ref = (caminho) => ({
    get: async () => { const d = window.__docs[caminho]; return { exists:!!d, data:()=> d?copia(d):null }; },
    set: async (o, opt) => { window.__docs[caminho] = (opt && opt.merge) ? Object.assign({}, window.__docs[caminho] || {}, copia(o)) : copia(o); },
    delete: async () => { delete window.__docs[caminho]; },
    collection: (sub) => col(caminho + '/' + sub) });
  const col = (base) => ({
    doc: (i) => ref(base + '/' + String(i)),
    get: async () => ({ docs: Object.keys(window.__docs).filter(k => k.startsWith(base + '/') && !k.slice(base.length + 1).includes('/'))
      .map(k => ({ id: k.slice(base.length + 1), data: () => copia(window.__docs[k]) })) }) });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'p1',email:'p@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>col(c) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', d => d.accept());
  await p.route(/gstatic\.com|cdnjs\.cloudflare\.com/, r => r.abort());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  const r = await p.evaluate(async () => {
    persistirDados = async () => {};
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'6A', disciplina:'Arte' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Paula Souza', status:'Ativo' },
                    { id:'ab-2', id_turma:500, nome_completo:'João Pedro Lima', status:'Ativo' },
                    { id:3, id_turma:500, nome_completo:'João Vitor Reis', status:'Ativo' },
                    { id:4, id_turma:500, nome_completo:'Mariana Costa', status:'Ativo' } ],
      trabalhos: [
        { id:11, id_turma:500, titulo:'Stop motion', tipo:'comum', peso:10, rubricas:[], bimestre:1 },
        { id:13, id_turma:500, titulo:'Caderno', tipo:'caderno_auto', peso:10, rubricas:[], bimestre:1 } ],
      notas: [] });
    turmaAtual = 500;
    if (!document.getElementById('tabTrabalhos')) { const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d); }
    currentBimestreTrabalhos = 1;
    renderTrabalhos();
    const out = {};
    out.botaoSoNaComum = document.querySelectorAll('#tabTrabalhos button[onclick^="abrirEntregasOnline"]').length === 1;

    abrirEntregasOnline(11);
    out.janelaSemLink = /Criar link de entrega/.test(document.querySelector('#modalNovoTrabalho .modal-content').textContent);
    await entregasCriarLink();
    const t = data.trabalhos[0];
    const cod = t.entregaOnline && t.entregaOnline.codigo;
    out.codigo = /^[A-HJ-NP-Z2-9]{8}$/.test(cod || '');
    const pub = window.__docs['entregas_tarefas/' + cod];
    out.tarefaPublica = !!pub && pub.titulo === 'Stop motion' && pub.turma === '6A' && pub.aberta === true && pub.donoUid === 'p1';
    out.semEstudanteNaTarefa = !/Ana|João|Mariana/.test(JSON.stringify(pub));
    out.link = document.querySelector('#modalNovoTrabalho input[readonly]').value === 'https://stopmotionran.vercel.app/?tarefa=' + cod;

    // O aluno entrega (o StopMotion grava isto)
    const E = 'entregas_tarefas/' + cod + '/entregas/';
    window.__docs[E + 'e1'] = { nome: 'ana souza', turma: '6A', projeto: 'Bonecos', arquivoUrl: 'https://drive.google.com/file/d/x/view', segundos: 6, em: '2026-11-09T10:00:00Z' };
    window.__docs[E + 'e2'] = { nome: 'Joao', turma: '6A', projeto: 'Carro', arquivoUrl: 'https://drive.google.com/file/d/y/view', em: '2026-11-09T10:05:00Z' };
    window.__docs[E + 'e3'] = { nome: 'Mariana Costa', turma: '6A', projeto: 'v2', arquivoUrl: 'https://drive.google.com/file/d/z/view', em: '2026-11-09T11:00:00Z' };
    window.__docs[E + 'e4'] = { nome: 'Mariana Costa', turma: '6A', projeto: 'v1', arquivoUrl: 'https://drive.google.com/file/d/w/view', em: '2026-11-09T09:00:00Z' };
    await entregasLer();
    const txt = () => document.querySelector('#modalNovoTrabalho .modal-content').textContent;
    out.contagem = /2 de 4 entregaram/.test(txt()) && /1 sem estudante ligado/.test(txt());
    out.anaCasou = /Ana Paula Souza[\s\S]*digitou “ana souza”/.test(txt());
    out.marianaUltima = /“v2”/.test(txt()) && !/“v1”/.test(txt()) && /2 envios/.test(txt());
    out.joaoNaoChutado = /Joao/.test(document.querySelector('#modalNovoTrabalho select').closest('div').textContent);

    // Professor liga o "Joao" ao João Vitor
    await entregasVincular('e2', '3');
    out.joaoLigado = /3 de 4 entregaram/.test(txt()) && t.entregaOnline.vinculos.e2 === 3;

    // Nota lançada na janela vai para a planilha
    const inp = [...document.querySelectorAll('#modalNovoTrabalho tbody tr')].find(tr => /Ana Paula/.test(tr.textContent)).querySelector('input');
    inp.value = '9'; inp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 50));
    out.nota = (data.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 1) || {}).valor === '9';

    // Fechar a entrega
    await entregasAbrirFechar(false);
    out.fechada = window.__docs['entregas_tarefas/' + cod].aberta === false && window.__docs['entregas_tarefas/' + cod].titulo === 'Stop motion';

    // Casamento de nomes
    const est = data.estudantes;
    const M = n => { const e = ENTREGAS.melhorEstudante(n, est); return e ? String(e.id) : ''; };
    out.casamento = M('JOÃO PEDRO') === 'ab-2' && M('joao vitor reis') === '3' && M('João') === '' && M('Pedro') === '' && M('Mariana') === '4';

    entregasFechar();
    out.botaoMarcado = /background:#e8f4ff/.test(document.querySelector('#tabTrabalhos button[onclick^="abrirEntregasOnline"]').getAttribute('style'));
    return out;
  });

  await b.close();
  const falhas = Object.entries(r).filter(([, v]) => v !== true);
  Object.entries(r).forEach(([k, v]) => console.log((v === true ? '  ok     ' : '  FALHA  ') + k));
  console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
