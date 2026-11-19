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
        { id:1, id_turma:1, data:'2026-10-05', relato:'Discutiu com <b>colega</b>.', ids_estudantes:[11,12], tipo:'disciplinar', autor:'Professor Teste' },
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
          subtitulo:'Manuela Veronez · 7A - Arte', payload:{ tipo:'relatorio_comportamental', titulo:'RELATÓRIO', texto:'Texto do relatório', aluno:'Manuela Veronez', alunoId:11 } },
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
    const r = { existe: !!card, texto: card ? card.innerText : '', html: card ? card.innerHTML : '' };
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
  ok('frase do resumo com contagens só de 2026 (inclui turma remanejada)',
     r.texto.indexOf('2 faltas, 1 atraso, 2 ocorrências (1 disciplinar, 1 rápida), 1 atestado, 2 relatórios e 1 registro de tutoria.') !== -1, r.texto);
  ok('faltas por bimestre', r.texto.indexOf('Faltas por bimestre: 1º: 1 · 4º: 1') !== -1, r.texto);
  ok('última falta e último atraso', r.texto.indexOf('Última falta: 02/10/2026') !== -1 && r.texto.indexOf('Último atraso: 10/11/2026') !== -1, r.texto);
  ok('últimos registros em ordem (relatório, tutoria, ocorrência...)', /15\/11\/2026 Relatório comportamental \(Professor Teste\)[\s\S]*01\/11\/2026 Tutoria: Projeto de vida[\s\S]*05\/10\/2026 Ocorrência disciplinar/.test(r.texto), r.texto);
  ok('fora: ano passado, outro professor, outro aluno', !/Do ano passado|De outro professor|Só do Bruno|Antigo|Bruno Lima/.test(r.texto), r.texto);
  ok('relato escapado (sem HTML do texto)', r.html.indexOf('&lt;b&gt;colega&lt;/b&gt;') !== -1);
  ok('"Abrir" abre o relatório comportamental', r.abriu === 'doc-a', r.abriu);
  ok('tabela de ocorrências antiga continua', r.ocTabela.indexOf('Discutiu com') !== -1);
  ok('não mexe nos dados', r.dadosIntactos);

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
    return document.getElementById('resumoEstudanteCard').innerText;
  });
  ok('estudante sem registros', r2.indexOf('Nenhum registro neste ano.') !== -1 && r2.indexOf('0 faltas, 0 atrasos, 0 ocorrências, 0 atestados, 0 relatórios e 0 registros de tutoria.') !== -1, r2);

  ok('sem erros na página', erros.length === 0, erros);
  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
