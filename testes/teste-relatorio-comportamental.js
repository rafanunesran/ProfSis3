// RELATÓRIO COMPORTAMENTAL no Estagiário: turma + estudante + descrição do professor; o assistente
// junta com ocorrências, frequência, caderno e notas do estudante naquela turma e escreve o texto,
// que sai no documento com o cabeçalho da escola (como o modelo enviado pelo professor).
//
// Cobrimos: tela e listas; o pedido à IA sem nomes e só com os dados certos (turma/período);
// o texto final com o nome de volta; histórico, PDF, reabrir; o "Manual" sem IA.
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
    auth:()=>({ currentUser:{uid:'p1',email:'p@e.com'}, onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return ()=>{}; }, signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor Teste', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond, extra) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) { falhas.push(nome); if (extra) console.log('        ', extra); } };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  await p.route(/gstatic\.com|googleapis\.com/, r => r.abort());
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Arte' }, { id:2, nome:'8B', ano_serie:'8º Ano', disciplina:'Matemática' } ],
      horariosAulas: [],
      configBimestres: [ { bim:1, inicio:'2026-02-01', fim:'2026-04-30' }, { bim:4, inicio:'2026-10-01', fim:'2026-12-20' } ],
      estudantes: [ { id:11, id_turma:1, nome_completo:'Manuela Veronez', status:'Ativo' }, { id:12, id_turma:1, nome_completo:'Bruno Lima', status:'Ativo' },
                    { id:13, id_turma:1, nome_completo:'Carlos Saiu', status:'Transferido' }, { id:21, id_turma:2, nome_completo:'Diego Outra', status:'Ativo' } ],
      ocorrencias: [
        { id:1, id_turma:1, data:'2026-10-05', relato:'Manuela e Bruno Lima discutiram na aula.', ids_estudantes:[11,12], tipo:'disciplinar', status:'confirmada', devolutiva:'Conversa com Manuela feita.' },
        { id:2, id_turma:1, data:'2026-03-05', relato:'Atraso.', ids_estudantes:[11], tipo:'rapida' },
        { id:3, id_turma:1, data:'2026-10-06', relato:'Só do Bruno.', ids_estudantes:[12], tipo:'rapida' },
        { id:4, id_turma:2, data:'2026-10-06', relato:'Outra turma.', ids_estudantes:[11], tipo:'rapida' } ],
      presencas: [ { id:1, id_estudante:11, data:'2026-10-02', status:'falta' }, { id:2, id_estudante:11, data:'2026-10-03', status:'presente' }, { id:3, id_estudante:11, data:'2026-03-03', status:'falta' } ],
      caderno: [ { id:1, id_estudante:11, id_turma:1, data:'2026-10-02', status:'incompleto', engajamento:'medio' } ],
      trabalhos: [ { id:100, id_turma:1, titulo:'Releitura de obra', tipo:'comum', peso:10, bimestre:4 }, { id:101, id_turma:1, titulo:'Prova 1', tipo:'comum', peso:10, bimestre:1 },
                   { id:102, id_turma:2, titulo:'Outra turma', tipo:'comum', peso:10, bimestre:4 } ],
      notas: [ { id:1, id_trabalho:100, id_estudante:11, valor:'6,5' }, { id:2, id_trabalho:101, id_estudante:11, valor:'8' } ]
    });
    getTodayString = () => '2026-11-16';
    const docs = {
      'system/config_sistema': { regiao: 'REGIÃO TESTE', logoEstado: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' },
      'app_data/app_data_school_77_aee': { tutorados: [] },
      'system/users_list': { list: [] }
    };
    db = { collection: (n) => ({ doc: (i) => ({ get: async () => { const d = docs[n + '/' + i]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; } }) }) };
    resolverEscolaAtual = async () => ({ nomeCompleto: 'EE ESCOLA DE TESTE', email: 'escola@teste.br', endereco: 'Rua A, 1', telefone: '(11) 1234-5678' });
    window.__persistiu = 0;
    persistirDados = () => { window.__persistiu++; };
    window.__chamouIA = 0;
    window.__prompts = [];
    chamarIAEstruturada = async (prompt) => { window.__chamouIA++; window.__prompts.push(prompt);
      return { paragrafos: ['A estudante [ESTUDANTE] demonstrou evolução na convivência.', 'Quanto ao desempenho, [ESTUDANTE] precisa de apoio.'] }; };
    window.__impressos = [];
    window.open = () => ({ document: { write: (h) => window.__impressos.push(h), close: () => {} } });
    window.__pdfs = [];
    window.__campo = (k, v) => { const d = document.getElementById('previaDocBrancoEstagiario').contentDocument; const el = d.querySelector('[data-campo="' + k + '"]');
      if (v === undefined) return el.innerText; el.innerText = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    baixarPdfDocumentoEstagiario = async (h) => { window.__pdfs.push(h); return 'x.pdf'; };
  }, PROF);


  // ============ 1. tela ============
  const r1 = await p.evaluate(async () => {
    await abrirModalGerarDocumentoIA();
    const sel = document.getElementById('iaDocTipo');
    const opcoes = Array.from(sel.options).map(o => o.textContent);
    sel.value = 'relatorio_comportamental'; toggleTipoDocumentoIA();
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null; };
    const alunos = () => Array.from(document.getElementById('relCompAluno').options).map(o => o.textContent);
    const r = { opcoes, campos: vis('relCompTurma') && vis('relCompAluno') && vis('relCompDescricao'), plano: vis('iaDocTema'), semana: vis('iaDocSemanaData'),
                manual: vis('btnGerarDocumentoManual'), botao: document.getElementById('btnGerarDocumentoIA').textContent,
                periodo: document.getElementById('relCompPeriodo').value, alunos1: alunos() };
    document.getElementById('relCompTurma').value = '2'; atualizarAlunosRelatorioComportamental();
    r.alunos2 = alunos();
    document.getElementById('relCompTurma').value = '1'; atualizarAlunosRelatorioComportamental();
    document.getElementById('relCompAluno').value = '11'; aoTrocarAlunoRelatorioComportamental();
    r.genero = document.getElementById('relCompGenero').value;
    r.resumo = document.getElementById('relCompResumo').textContent;
    return r;
  });
  ok('o tipo "Relatório comportamental" aparece', r1.opcoes.some(o => o.indexOf('Relatório comportamental') !== -1));
  ok('mostra turma, estudante e descrição; esconde tema e semana', r1.campos && !r1.plano && !r1.semana);
  ok('botão "Gerar relatório" e "Manual" visível', r1.botao.indexOf('Gerar relatório') !== -1 && r1.manual);
  ok('período começa no bimestre atual', r1.periodo === '4');
  ok('só estudantes ativos da turma escolhida', r1.alunos1.join('|') === 'Selecione...|Bruno Lima|Manuela Veronez' && r1.alunos2.join('|') === 'Selecione...|Diego Outra');
  ok('palpite "a estudante" pelo nome', r1.genero === 'a');
  ok('resumo do 4º bim: 1 ocorrência, 1 falta em 2 chamadas, 1 caderno, 1 nota', /1 ocorrência\(s\), 1 falta\(s\) em 2 chamada\(s\), 1 registro\(s\) de caderno e 1 atividade/.test(r1.resumo), r1.resumo);

  // ============ 2. gerar com IA ============
  const r2 = await p.evaluate(async () => {
    document.getElementById('relCompDescricao').value = 'Manuela melhorou a convivência com Bruno no 2º semestre.';
    await gerarDocumentoIA();
    const prompt = window.__prompts[0] || '';
    const doc = document.getElementById('previaDocBrancoEstagiario').contentDocument;
    return { prompt, texto: __campo('texto'), titulo: __campo('titulo'), cab: doc.body.innerText.indexOf('EE ESCOLA DE TESTE') !== -1,
             h2: document.querySelector('#modalDocBranco h2').textContent, hist: JSON.parse(JSON.stringify(data.historicoDocumentos || [])) };
  });
  ok('chamou a IA uma vez', r2.prompt.length > 0);
  ok('pedido sem o nome da estudante nem do colega', !/Manuela|Veronez|Bruno|Lima/.test(r2.prompt), r2.prompt);
  ok('pedido traz descrição anonimizada', r2.prompt.indexOf('[ESTUDANTE] melhorou a convivência com um colega') !== -1);
  ok('pedido traz ocorrência, devolutiva, frequência, caderno e nota do 4º bim', r2.prompt.indexOf('05/10/2026 (disciplinar, com outros 1 estudante(s)): [ESTUDANTE] e um colega discutiram') !== -1
     && r2.prompt.indexOf('Devolutiva: Conversa com [ESTUDANTE] feita.') !== -1 && r2.prompt.indexOf('1 falta(s) em 2 chamada(s)') !== -1
     && r2.prompt.indexOf('caderno incompleto') !== -1 && r2.prompt.indexOf('Releitura de obra (4º bim.): 6,5') !== -1);
  ok('pedido sem dados de fora (outro bimestre, outra turma, outro aluno)', r2.prompt.indexOf('Atraso') === -1 && r2.prompt.indexOf('Prova 1') === -1
     && r2.prompt.indexOf('Outra turma') === -1 && r2.prompt.indexOf('Só do') === -1);
  ok('pedido traz turma e componente', r2.prompt.indexOf('Turma: 7A (7º Ano). Componente curricular: Arte. Período: 4º bimestre') !== -1);
  ok('texto igual ao modelo: nome, turma/componente e parágrafos com o nome de volta',
     r2.texto.split('\n').filter(l => l.trim()).join('|') === 'Relatório pedagógico e comportamental — Manuela Veronez|Turma: 7A | Componente curricular: Arte|A estudante Manuela Veronez demonstrou evolução na convivência.|Quanto ao desempenho, Manuela Veronez precisa de apoio.', r2.texto);
  ok('título no cabeçalho da escola', r2.titulo === 'RELATÓRIO PEDAGÓGICO E COMPORTAMENTAL' && r2.cab);
  ok('tela de relatório', r2.h2.indexOf('Relatório comportamental') !== -1);
  ok('já fica no histórico como relatório', r2.hist.length === 1 && r2.hist[0].tipo === 'relatorio_comportamental'
     && r2.hist[0].titulo === 'Relatório comportamental — Manuela Veronez' && r2.hist[0].subtitulo === 'Manuela Veronez · 7A - Arte' && !('geradoPorIA' in r2.hist[0].payload));

  // ============ 3. editar, PDF, histórico ============
  const r3 = await p.evaluate(async () => {
    __campo('texto', __campo('texto') + '\nTexto corrigido pelo professor.');
    await exportarDocBrancoEstagiario('pdf');
    const html = window.__pdfs[0] || '';
    let box = document.getElementById('tabDocHistorico'); const criado = !box;
    if (criado) { box = document.createElement('div'); box.id = 'tabDocHistorico'; document.body.appendChild(box); }
    renderDocumentosHistorico();
    const txt = box.textContent;
    fecharModalDocBranco();
    const id = data.historicoDocumentos[0].id;
    await abrirDocBrancoHistorico(id);
    const r = { html, txt, n: data.historicoDocumentos.length, h2: document.querySelector('#modalDocBranco h2').textContent, texto: __campo('texto') };
    await reimprimirDocBrancoHistorico(id, 'pdf');
    r.html2 = window.__pdfs[1] || '';
    if (criado) box.remove(); fecharModalDocBranco();
    return r;
  });
  ok('PDF com título, texto corrigido e nome do arquivo', r3.html.indexOf('<br>RELATÓRIO PEDAGÓGICO E COMPORTAMENTAL<div') !== -1 && r3.html.indexOf('Texto corrigido pelo professor.') !== -1
     && /<title>Relatorio comportamental - Manuela Veronez - 7A - Arte_2026-11-16<\/title>/.test(r3.html), (r3.html.match(/<title>.*<\/title>/) || [''])[0]);
  ok('PDF não duplica o registro', r3.n === 1);
  ok('Histórico mostra o relatório com Abrir/PDF/Reimprimir', r3.txt.indexOf('Relatório comportamental — Manuela Veronez') !== -1 && r3.txt.indexOf('Abrir') !== -1 && r3.txt.indexOf('Reimprimir') !== -1);
  ok('"Abrir" reabre o relatório editado', r3.h2.indexOf('Relatório comportamental') !== -1 && r3.texto.indexOf('Texto corrigido pelo professor.') !== -1);
  ok('PDF direto do histórico com o nome do relatório', /<title>Relatorio comportamental - Manuela Veronez/.test(r3.html2));

  // ============ 4. manual e validações ============
  const r4 = await p.evaluate(async () => {
    const ia = window.__chamouIA;
    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocTipo').value = 'relatorio_comportamental'; toggleTipoDocumentoIA();
    document.getElementById('relCompAluno').value = '';
    await gerarDocumentoIA();
    const semAluno = window.__chamouIA === ia;
    document.getElementById('relCompAluno').value = '11'; aoTrocarAlunoRelatorioComportamental();
    document.getElementById('relCompPeriodo').value = 'ano'; atualizarResumoRelatorioComportamental();
    document.getElementById('relCompDescricao').value = 'Aluna dedicada.';
    await gerarDocumentoManualEstagiario();
    return { semAluno, iaManual: window.__chamouIA === ia, texto: __campo('texto'), n: data.historicoDocumentos.length };
  });
  ok('sem estudante avisa e não chama a IA', r4.semAluno && avisos.some(a => a.indexOf('Escolha o estudante') !== -1));
  ok('Manual não chama a IA', r4.iaManual);
  ok('Manual traz descrição e registros do ano todo', r4.texto.indexOf('Aluna dedicada.') !== -1 && r4.texto.indexOf('Ocorrências: 2') !== -1
     && r4.texto.indexOf('Prova 1 (1º bim.): 8') !== -1 && r4.texto.indexOf('2 falta(s) em 3 chamada(s)') !== -1 && r4.texto.indexOf('Manuela e Bruno Lima discutiram') !== -1, r4.texto);
  ok('Manual só vai para o histórico quando salvar', r4.n === 1, r4.n);

  ok('sem erros na página', erros.length === 0);
  if (erros.length) console.log(erros);

  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
