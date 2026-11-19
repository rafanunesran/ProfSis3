// RESUMO DO ESTUDANTE no topo da ficha: junta faltas, atrasos, ocorrências, atestados, relatórios do
// Estagiário e registros de tutoria do ano atual. Anos anteriores e dados de outros estudantes ficam fora.
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
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  await p.route(/gstatic\.com|googleapis\.com/, r => r.abort());
  p.on('dialog', async d => { await d.accept(); });
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Arte', masterId:'m1' }, { id:2, nome:'8B', ano_serie:'8º Ano', disciplina:'Matemática', masterId:'m2' } ],
      configBimestres: [ { bim:1, inicio:'2026-02-01', fim:'2026-04-30' }, { bim:4, inicio:'2026-10-01', fim:'2026-12-20' }, { bim:4, inicio:'2025-10-01', fim:'2025-12-20' } ],
      estudantes: [ { id:11, id_turma:1, nome_completo:'Manuela Veronez', status:'Ativo' }, { id:31, id_turma:2, nome_completo:'Manuela Veronez', status:'Remanejado' },
                    { id:12, id_turma:1, nome_completo:'Bruno Lima', status:'Ativo' } ],
      ocorrencias: [
        { id:1, id_turma:1, data:'2026-10-05', relato:'Discutiu com <b>colega</b>.', ids_estudantes:[11,12], tipo:'disciplinar', autor:'Professor Teste', devolutiva:'Conversa feita.' },
        { id:2, id_turma:2, data:'2026-03-05', relato:'Sem material.', ids_estudantes:[31], tipo:'rapida', autor:'Professor Teste' },
        { id:3, id_turma:1, data:'2025-10-06', relato:'Do ano passado.', ids_estudantes:[11], tipo:'rapida', autor:'Professor Teste' },
        { id:4, id_turma:1, data:'2026-10-06', relato:'De outro professor.', ids_estudantes:[11], tipo:'rapida', autor:'Outro' },
        { id:5, id_turma:1, data:'2026-10-07', relato:'Só do Bruno.', ids_estudantes:[12], tipo:'rapida', autor:'Professor Teste' } ],
      presencas: [ { id:1, id_estudante:11, data:'2026-10-02', status:'falta' }, { id:2, id_estudante:11, data:'2026-10-03', status:'presente' },
                   { id:3, id_estudante:31, data:'2026-03-03', status:'falta' }, { id:4, id_estudante:11, data:'2025-11-03', status:'falta' },
                   { id:5, id_estudante:12, data:'2026-10-02', status:'falta' } ],
      atrasos: [ { id:1, id_estudante:11, data:'2026-11-10' }, { id:2, id_estudante:11, data:'2025-05-10' }, { id:3, id_estudante:12, data:'2026-11-10' } ],
      registrosAdministrativos: [ { id:1, estudanteId:11, tipo:'Atestado', data:'2026-09-01', dias:2, descricao:'Gripe' } ],
      tutorados: [ { id:500, id_estudante_origem:11, nome_estudante:'Manuela Veronez' } ],
      encontros: [ { id:1, tutoradoId:500, data:'2026-11-01', tema:'Projeto de vida' }, { id:2, tutoradoId:500, data:'2025-11-01', tema:'Antigo' } ],
      historicoDocumentos: [
        { id:'doc-a', tipo:'relatorio_comportamental', criadoEm:'2026-11-15', professor:'Professor Teste', titulo:'Relatório comportamental — Manuela Veronez',
          subtitulo:'Manuela Veronez · 7A - Arte', payload:{ tipo:'relatorio_comportamental', titulo:'RELATÓRIO', texto:'Relatório pedagógico e comportamental — Manuela Veronez\nTurma: 7A | Componente curricular: Arte\nA estudante demonstrou evolução na convivência.\nSegundo parágrafo.', aluno:'Manuela Veronez', alunoId:11 } },
        { id:'doc-b', tipo:'relatorio_comportamental', criadoEm:'2026-11-15', titulo:'Relatório comportamental — Bruno Lima', subtitulo:'Bruno Lima · 7A - Arte', payload:{ aluno:'Bruno Lima', alunoId:12 } },
        { id:'doc-c', tipo:'relatorio_comportamental', criadoEm:'2025-11-15', subtitulo:'Manuela Veronez · 7A - Arte', textoArquivado:true },
        { id:'doc-d', tipo:'anexo3_paee', criadoEm:'2026-06-01', nomeEstudante:'manuela veronez', professor:'Professor Teste' },
        { id:'doc-e', tipo:'plano_aula', criadoEm:'2026-06-01' } ]
    });
    getTodayString = () => '2026-11-19';
    persistirDados = () => {};
    preencherNotasOficiaisEstudante = async () => {};
    document.getElementById('appContainer').style.display = 'block';
    const auth = document.getElementById('authContainer'); if (auth) auth.style.display = 'none';
    window.__abriu = null;
    abrirDocBrancoHistorico = (id) => { window.__abriu = id; };
  }, PROF);

  const r = await p.evaluate(() => {
    abrirEstudanteDetalhe(11);
    const card = document.getElementById('resumoEstudanteCard');
    const r = { existe: !!card, texto: card ? card.textContent.replace(/\s+/g, ' ') : '', html: card ? card.innerHTML : '' };
    const tela = document.getElementById('estudanteDetalhe');
    const resumo = document.getElementById('estudanteGeralResumo');
    r.acima = !!resumo && !!(resumo.compareDocumentPosition(tela.querySelector('.grid')) & Node.DOCUMENT_POSITION_FOLLOWING);
    r.visivel = !!card && card.offsetParent !== null;
    const link = card && Array.from(card.querySelectorAll('a')).find(a => a.textContent.indexOf('Abrir') !== -1);
    if (link) link.click();
    r.abriu = window.__abriu;
    r.ocTabela = document.getElementById('estudanteGeralOcorrencias').innerText;
    r.dadosIntactos = data.presencas.length === 5 && data.ocorrencias.length === 5 && data.historicoDocumentos.length === 5;
    return r;
  });
  ok('resumo aparece acima de Frequência/Atrasos', r.existe && r.acima && r.visivel);
  ok('frequência em texto, só 2026 (inclui turma remanejada)',
     r.texto.indexOf('Frequência. Em 2026, Manuela Veronez registrou 2 faltas (1 no 1º bimestre e 1 no 4º bimestre), a mais recente em 02/10/2026, e 1 atraso, o último em 10/11/2026. Apresentou 1 atestado (01/09/2026, 2 dias, Gripe).') !== -1, r.texto);
  ok('comportamento em texto com relato e devolutiva',
     r.texto.indexOf('Comportamento. Foram registradas 2 ocorrências (1 disciplinar e 1 rápida). Em 05/10/2026 (Professor Teste): "Discutiu com <b>colega</b>". Devolutiva: Conversa feita. Em 05/03/2026 (Professor Teste): "Sem material".') !== -1, r.texto);
  ok('relatórios e tutoria em texto, com trecho do relatório',
     r.texto.indexOf('Relatórios e acompanhamento. Foram produzidos 2 relatórios: Relatório comportamental de Professor Teste (15/11/2026) e Anexo III - PAEE de Professor Teste (01/06/2026). No relatório comportamental mais recente consta: "A estudante demonstrou evolução na convivência." Na tutoria, houve 1 encontro registrado (01/11/2026, Projeto de vida).') !== -1, r.texto);
  ok('fora: ano passado, outro professor, outro aluno', !/Do ano passado|De outro professor|Só do Bruno|Antigo|Bruno Lima/.test(r.texto), r.texto);
  ok('botão "Traçar perfil com IA" aparece antes de gerar', r.html.indexOf('Traçar perfil com IA') !== -1);
  ok('relato escapado (sem HTML do texto)', r.html.indexOf('&lt;b&gt;colega&lt;/b&gt;') !== -1);
  ok('"Abrir" abre o relatório comportamental', r.abriu === 'doc-a', r.abriu);
  ok('tabela de ocorrências antiga continua', r.ocTabela.indexOf('Discutiu com') !== -1);
  ok('não mexe nos dados', r.dadosIntactos);


  // ============ perfil com IA ============
  const r3 = await p.evaluate(async () => {
    localStorage.clear();
    data.caderno = [ { id:1, id_estudante:11, id_turma:1, data:'2026-10-02', status:'incompleto', engajamento:'medio' } ];
    data.trabalhos = [ { id:100, id_turma:1, titulo:'Releitura de obra', tipo:'comum', peso:10, bimestre:4 } ];
    data.notas = [ { id:1, id_trabalho:100, id_estudante:11, valor:'6,5' } ];
    data.encontros[0].resumo = 'Manuela falou que quer ser veterinária.';
    window.__prompts = [];
    chamarIAEstruturada = async (prompt) => { window.__prompts.push(prompt);
      return { paragrafos: ['[ESTUDANTE] mostra perfil comunicativo, com conflitos pontuais.', 'Tem frequência boa.', 'Sugere-se acompanhar a convivência.'] }; };
    abrirEstudanteDetalhe(11);
    await gerarPerfilEstudanteFicha(document.getElementById('btnPerfilEstudanteIA'));
    const box = document.getElementById('perfilEstudanteIA');
    const r = { prompt: window.__prompts[0] || '', texto: box.innerText, guardado: JSON.stringify(Object.keys(localStorage).map(k => localStorage.getItem(k))) };
    abrirEstudanteDetalhe(11); // reabrir mostra o perfil guardado sem chamar a IA de novo
    r.reaberto = document.getElementById('perfilEstudanteIA').innerText;
    r.chamadas = window.__prompts.length;
    await salvarPerfilEstudanteComoRelatorio();
    const modal = document.getElementById('modalDocBranco');
    r.modal = !!modal && modal.style.display !== 'none' && document.querySelector('#modalDocBranco h2').textContent;
    r.docTexto = docBrancoAberto ? docBrancoAberto.texto : '';
    if (typeof fecharModalDocBranco === 'function') fecharModalDocBranco();
    return r;
  });
  ok('pedido à IA sem nomes', r3.prompt && !/Manuela|Veronez|Bruno|Lima/.test(r3.prompt), r3.prompt);
  ok('pedido traz ocorrências, faltas, caderno, nota, tutoria e relatório', r3.prompt.indexOf('Discutiu com') !== -1 && r3.prompt.indexOf('Faltas no ano: 2') !== -1
     && r3.prompt.indexOf('caderno incompleto') !== -1 && r3.prompt.indexOf('Releitura de obra (4º bim.): 6,5') !== -1
     && r3.prompt.indexOf('Projeto de vida — [ESTUDANTE] falou que quer ser veterinária') !== -1 && r3.prompt.indexOf('demonstrou evolução na convivência') !== -1, r3.prompt);
  ok('pedido pede perfil, não lista', r3.prompt.indexOf('NÃO é para listar os registros') !== -1);
  ok('pedido sem ano passado nem outro professor', r3.prompt.indexOf('Do ano passado') === -1 && r3.prompt.indexOf('De outro professor') === -1);
  ok('perfil aparece com o nome', r3.texto.indexOf('Manuela Veronez mostra perfil comunicativo') !== -1 && r3.texto.indexOf('Salvar como relatório') !== -1, r3.texto);
  ok('guardado no aparelho sem o nome', r3.guardado.indexOf('[ESTUDANTE] mostra') !== -1 && r3.guardado.indexOf('Manuela') === -1, r3.guardado);
  ok('reabrir a ficha mostra o perfil sem chamar a IA', r3.reaberto.indexOf('Manuela Veronez mostra perfil') !== -1 && r3.chamadas === 1);
  ok('"Salvar como relatório" abre o Relatório comportamental com o texto', String(r3.modal).indexOf('Relatório comportamental') !== -1
     && r3.docTexto.indexOf('Turma: 7A | Componente curricular: Arte') !== -1 && r3.docTexto.indexOf('Manuela Veronez mostra perfil comunicativo') !== -1, r3);

  if (process.env.PROFSIS_FOTO) {
    await p.screenshot({ path: process.env.PROFSIS_FOTO });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: process.env.PROFSIS_FOTO.replace(/\.png$/, '-celular.png') });
    await p.setViewportSize({ width: 1200, height: 900 });
  }

  // Estudante sem nada no ano
  const r2 = await p.evaluate(() => {
    data.estudantes.push({ id:99, id_turma:1, nome_completo:'Zé Novo', status:'Ativo' });
    abrirEstudanteDetalhe(99);
    return document.getElementById('resumoEstudanteCard').textContent.replace(/\s+/g, ' ');
  });
  ok('estudante sem registros', r2.indexOf('Em 2026, Zé Novo não tem faltas nem atrasos registrados.') !== -1 && r2.indexOf('Não há ocorrências registradas sobre Zé Novo neste ano.') !== -1 && r2.indexOf('Ainda não há relatórios nem registros de tutoria sobre Zé Novo neste ano.') !== -1, r2);

  ok('sem erros na página', erros.length === 0, erros);
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
