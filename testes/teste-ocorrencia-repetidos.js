// NOME DE ESTUDANTE REPETIDO NA OCORRÊNCIA.
//
// A causa: o professor que dá aula em duas turmas ligadas à MESMA turma da gestão
// (ex.: 1A Matemática e 1A Física) tem o mesmo aluno, com o mesmo id, uma vez em cada
// turma. Na junção entre aparelhos (shared.js, unirCamadaPessoal) o aluno da turma B
// casava com o da turma A e tomava o lugar dele: a turma B ficava com cada aluno duas
// vezes e a lista "Adicionar Estudante" da ocorrência mostrava os nomes repetidos.
// Cobrimos:
//   1. a junção mantém um aluno em cada turma (nada repetido, nada some);
//   2. o remanejado (mesmo aluno, turma nova) continua um só;
//   3. a sobra que já está gravada (mesmo id 2x na mesma turma) é limpa, e dois
//      alunos DIFERENTES com o mesmo nome (ids diferentes) continuam os dois;
//   4. na tela, cada aluno aparece uma vez e dá para adicionar aluno de id texto;
//   5. a IMPRESSÃO não repete o nome (o aluno está nas duas turmas do professor) e o
//      botão 📄 baixa o PDF com o primeiro nome, a data e a disciplina no nome do arquivo.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';

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

let falhas = 0;
const ok = (c, msg) => { console.log((c ? '  ok   ' : '  FALHA ') + msg); if (!c) falhas++; };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext({ acceptDownloads: true })).newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(String(e.message)));
  p.on('dialog', async d => await d.accept());
  await p.route(/gstatic\.com/, r => r.abort());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  erros.length = 0;

  console.log('1. Junção com o mesmo aluno em duas turmas');
  const r1 = await p.evaluate(() => {
    const ana = (t, quando) => ({ id: 1, id_turma: t, nome_completo: 'ANA', status: 'Ativo', atualizadoEm: quando });
    const aqui = { estudantes: [ana('T1', '2026-01-01'), ana('T2', '2026-01-01')] };
    unirCamadaPessoal(aqui, { estudantes: [ana('T1', '2026-01-01'), ana('T2', '2026-02-01')] });
    const aqui2 = { estudantes: [ana('T1', '2026-01-01')] };
    unirCamadaPessoal(aqui2, { estudantes: [ana('T2', '2026-01-01'), ana('T1', '2026-01-01')] });
    return { a: aqui.estudantes.map(e => e.id_turma).sort(), b: aqui2.estudantes.map(e => e.id_turma).sort(),
             novo: aqui.estudantes.find(e => e.id_turma === 'T2').atualizadoEm };
  });
  ok(JSON.stringify(r1.a) === '["T1","T2"]', 'turma B não fica com a Ana duas vezes (' + r1.a + ')');
  ok(r1.novo === '2026-02-01', 'a versão mais nova da turma B entrou');
  ok(JSON.stringify(r1.b) === '["T1","T2"]', 'a turma que só o outro aparelho tinha entra (' + r1.b + ')');

  console.log('2. Remanejado continua um só');
  const r2 = await p.evaluate(() => {
    const aqui = { estudantes: [{ id: 5, id_turma: 'T1', nome_completo: 'BIA', atualizadoEm: '2026-01-01' }] };
    unirCamadaPessoal(aqui, { estudantes: [{ id: 5, id_turma: 'T3', nome_completo: 'BIA', atualizadoEm: '2026-03-01' }] });
    return aqui.estudantes.map(e => e.id_turma);
  });
  ok(JSON.stringify(r2) === '["T3"]', 'um registro, na turma nova (' + r2 + ')');

  console.log('3. Limpeza do que já está gravado');
  const r3 = await p.evaluate(() => {
    const d = { estudantes: [
      { id: 1, id_turma: 'T2', nome_completo: 'ANA', atualizadoEm: '2026-01-01' },
      { id: 1, id_turma: 'T2', nome_completo: 'Ana ', atualizadoEm: '2026-02-01' },
      { id: 1, id_turma: 'T1', nome_completo: 'ANA' },
      { id: 8, id_turma: 'T2', nome_completo: 'JOÃO SILVA' },
      { id: 9, id_turma: 'T2', nome_completo: 'JOÃO SILVA' } ] };
    const saiu = tirarEstudantesRepetidos(d);
    return { saiu, lista: d.estudantes.map(e => e.id + '/' + e.id_turma), ana: d.estudantes[0].atualizadoEm };
  });
  ok(r3.saiu === 1, 'saiu 1 repetido');
  ok(JSON.stringify(r3.lista) === '["1/T2","1/T1","8/T2","9/T2"]', 'homônimos de id diferente ficam (' + r3.lista + ')');
  ok(r3.ana === '2026-02-01', 'ficou a versão editada por último');

  console.log('4. Tela da ocorrência');
  await p.evaluate(async () => {
    persistirDados = async () => {};
    currentViewMode = 'professor';
    currentUser = Object.assign({}, currentUser || {}, { id: 'p1', uid: 'p1', nome: 'Prof', role: 'professor' });
    delete currentUser.schoolId;
    data = Object.assign(getInitialData(), {
      turmas: [{ id: 500, nome: '1A' }],
      estudantes: [
        { id: 7, id_turma: 500, nome_completo: 'Bia Numero', status: 'Ativo' },
        { id: 7, id_turma: 500, nome_completo: 'Bia Numero', status: 'Ativo' },
        { id: 'mg3k2-a1b2c3', id_turma: 500, nome_completo: 'Ana Texto', status: 'Ativo' },
        { id: 20, id_turma: 500, nome_completo: 'Caio Igual', status: 'Ativo' },
        { id: 21, id_turma: 500, nome_completo: 'Caio Igual', status: 'Ativo' } ] });
    turmaAtual = 500; tempOcorrenciaIds = [];
    document.body.innerHTML = '<div id="tabOcorrencias"></div>';
    await renderOcorrencias();
  });
  const opcoes = () => p.evaluate(() => [...document.querySelectorAll('#selEstudanteOcorrencia option')].map(o => o.textContent.trim()).filter(t => t !== 'Selecione...'));
  const o1 = await opcoes();
  ok(o1.filter(t => t === 'Bia Numero').length === 1, 'Bia aparece uma vez (' + o1.join(', ') + ')');
  ok(o1.filter(t => t === 'Caio Igual').length === 2, 'os dois Caio (alunos diferentes) aparecem');
  await p.selectOption('#selEstudanteOcorrencia', 'mg3k2-a1b2c3');
  await p.evaluate(() => adicionarEstudanteOcorrencia());
  await p.waitForTimeout(200);
  const r4 = await p.evaluate(() => ({ ids: tempOcorrenciaIds.slice(), envolvidos: document.querySelector('#tabOcorrencias').textContent.includes('Ana Texto ×') }));
  const o2 = await opcoes();
  ok(JSON.stringify(r4.ids) === '["mg3k2-a1b2c3"]', 'aluno de id texto foi adicionado (' + JSON.stringify(r4.ids) + ')');
  ok(!o2.includes('Ana Texto'), 'e saiu da lista de disponíveis');
  await p.evaluate(() => { const x = [...document.querySelectorAll('#tabOcorrencias span')].find(s => s.textContent === '×'); x.click(); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => tempOcorrenciaIds.length === 0), 'o × tira o aluno de id texto');

  console.log('5. Impressão e PDF');
  await p.evaluate(async () => {
    data.turmas = [{ id: 500, nome: '1A', disciplina: 'Matemática', masterId: 9 }, { id: 501, nome: '1A', disciplina: 'Física', masterId: 9 }];
    data.estudantes = [
      { id: 7, id_turma: 500, nome_completo: 'BIA NUMERO SILVA', status: 'Ativo' },
      { id: 7, id_turma: 501, nome_completo: 'BIA NUMERO SILVA', status: 'Ativo' },
      { id: 'mg3k2-a1b2c3', id_turma: 500, nome_completo: 'Ana Texto', status: 'Ativo' },
      { id: 'mg3k2-a1b2c3', id_turma: 501, nome_completo: 'Ana Texto', status: 'Ativo' } ];
    data.ocorrencias = [{ id: 900, id_turma: 500, data: '2026-11-10', relato: 'Conversa <alta> na aula', ids_estudantes: [7, 'mg3k2-a1b2c3'],
      autor: 'Prof', status: 'pendente', tipo: 'disciplinar', turma_snapshot: '1A - Matemática', disciplina: 'Matemática' }];
    currentTurmaOcorrenciaTab = 'disciplinares'; currentTurmaOcorrenciaFiltro = 'todas';
    window.__impresso = '';
    window.open = () => ({ document: { write: (h) => { window.__impresso += h; }, close: () => {} } });
    await renderOcorrencias();
    document.querySelector('#listaOcorrenciasTurma button[title="Imprimir"]').click();
  });
  const imp = await p.evaluate(() => window.__impresso);
  const linha = (imp.match(/Estudantes Envolvidos:<\/strong>([^<]*)</) || [])[1] || '';
  ok(linha.trim() === 'BIA NUMERO SILVA, Ana Texto', 'impressão sem nome repetido (' + linha.trim() + ')');
  ok(imp.includes('Conversa &lt;alta&gt;'), 'relato com < > não quebra a página');
  ok(imp.includes('<title>Ocorrência - Bia, Ana - 10-11-2026 - Matemática</title>'), 'título da impressão = nome do arquivo');
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 60000 }),
    p.click('#listaOcorrenciasTurma button[title="Baixar PDF"]')
  ]);
  const nomeArq = dl.suggestedFilename();
  ok(nomeArq === 'Ocorrencia - Bia, Ana - 10-11-2026 - Matematica.pdf', 'nome do PDF (' + nomeArq + ')');
  const caminho = await dl.path();
  const ini = require('fs').readFileSync(caminho).slice(0, 5).toString();
  ok(ini === '%PDF-', 'o arquivo baixado é um PDF');
  if (process.env.PDF_SAIDA) require('fs').copyFileSync(caminho, process.env.PDF_SAIDA);

  ok(erros.length === 0, 'sem erro na página' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
