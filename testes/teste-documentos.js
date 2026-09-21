// A TELA "DOCUMENTOS" (antiga "Agenda") E O HISTORICO DO PROFESSOR.
//
// O menu "Agenda" abria uma tela so' com a grade de horarios, e tudo que o Estagiario
// imprimia - plano de aula, Anexo IV - PEI - saia pela impressora e nao sobrava nada
// no sistema: pra reimprimir, o professor gerava tudo de novo.
//
// Cobrimos a tela nova ponta a ponta:
//   1. o menu se chama "Documentos" e abre a tela em abas (a grade continua na
//      primeira delas, "Minha Agenda");
//   2. o botao "✨ Estagiario" fica no cabecalho, fora das abas - continua a' mao em
//      TODAS elas;
//   3. o plano de aula impresso aparece na aba "Planos de Aula", com o texto pra
//      consulta, e pode ser reimpresso sem passar pela IA de novo;
//   4. a aba "Anexo IV - PEI" lista os PEIs da escola pra consulta e reimpressao,
//      inclusive numa conta de professor comum (que nao mantem a lista do AEE);
//   5. o histórico guarda o que foi gerado e atravessa o fechamento do navegador
//      (vai junto com os dados da conta, nao so' no aparelho).
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
  window.__chamadasDeRede = [];
  const fetchOriginal = window.fetch;
  window.fetch = function(u) { window.__chamadasDeRede.push(String(u)); return fetchOriginal.apply(this, arguments); };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

const esperarPrevia = (p) => p.waitForFunction(() => {
  const f = document.getElementById('previaPlanoAulaEstagiario');
  const d = f && f.contentDocument;
  return !!(d && d.querySelector('.campo-editavel-estagiario'));
}, null, { timeout: 20000 });

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', d => d.accept());

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // ============ 1. O MENU SE CHAMA "DOCUMENTOS" E ABRE A TELA EM ABAS ============
  const r1 = await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Historia' } ],
      horariosAulas: [] });
    localStorage.removeItem('estagiario_planos_aula_recentes');

    // A tela do professor so' aparece depois do login; aqui entramos direto nela.
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    renderProfessorPanel();
    const botoes = Array.from(document.querySelectorAll('nav button'));
    const doMenu = botoes.find(x => x.textContent.indexOf('Documentos') !== -1);
    const sobrouAgenda = botoes.some(x => x.textContent.trim() === '📅Agenda');

    doMenu.click();
    await new Promise(r => setTimeout(r, 400));

    const abas = Array.from(document.querySelectorAll('#navDocumentos .doc-nav-btn')).map(x => x.textContent.trim());
    return {
      temDocumentos: !!doMenu, sobrouAgenda,
      telaAberta: document.getElementById('documentos').classList.contains('active'),
      abas,
      gradeNaPrimeiraAba: !!document.querySelector('#tabDocAgenda #containerGradeHoraria'),
      agendaVisivel: document.getElementById('tabDocAgenda').style.display !== 'none'
    };
  }, PROF);
  ok('o menu antigo "Agenda" virou "Documentos"', r1.temDocumentos && !r1.sobrouAgenda);
  ok('o menu abre a tela Documentos', r1.telaAberta);
  ok('a tela tem as quatro abas', r1.abas.length === 4
      && r1.abas.join('|').indexOf('Minha Agenda') !== -1
      && r1.abas.join('|').indexOf('Planos de Aula') !== -1
      && r1.abas.join('|').indexOf('Anexo IV') !== -1
      && r1.abas.join('|').indexOf('Histórico') !== -1);
  ok('a grade de horarios continua na aba "Minha Agenda", ja aberta', r1.gradeNaPrimeiraAba && r1.agendaVisivel);

  // ============ 2. O "ESTAGIARIO" CONTINUA A' MAO EM TODAS AS ABAS ============
  const r2 = await p.evaluate(async () => {
    const visivel = (el) => !!(el && el.offsetParent !== null);
    const botaoEstagiario = () => Array.from(document.querySelectorAll('#documentos button'))
      .find(x => x.getAttribute('onclick') === 'abrirModalGerarDocumentoIA()');

    const emCadaAba = {};
    for (const aba of ['agenda', 'planos', 'anexoIV', 'historico']) {
      await showDocumentosTab(aba);
      await new Promise(r => setTimeout(r, 250));
      emCadaAba[aba] = visivel(botaoEstagiario());
    }
    await showDocumentosTab('agenda');
    return { emCadaAba, foraDasAbas: !botaoEstagiario().closest('.documentos-tab') };
  });
  ok('o botao "✨ Estagiario" aparece nas quatro abas',
      r2.emCadaAba.agenda && r2.emCadaAba.planos && r2.emCadaAba.anexoIV && r2.emCadaAba.historico);
  ok('ele fica no cabecalho da tela, fora das abas', r2.foraDasAbas);

  // ============ 3. O PLANO IMPRESSO VAI PARAR NA ABA "PLANOS DE AULA" ============
  await p.evaluate(async () => {
    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocTipo').value = 'plano_aula'; toggleTipoDocumentoIA();
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Revolucao Francesa';
    await gerarDocumentoManualEstagiario();
    await escolherManualEstagiario('branco');
  });
  await esperarPrevia(p);

  const r3 = await p.evaluate(async () => {
    window.__impresso = '';
    window.open = () => ({ document:{ write:(h)=>{ window.__impresso += h; }, close:()=>{} } });

    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    d.querySelector('[data-campo="objetivos"]').innerText = 'Entender a queda da Bastilha';
    await exportarDocumentoFinal('plano_aula');

    await showDocumentosTab('planos');
    const aba = document.getElementById('tabDocPlanos');
    // O texto do plano fica num "Ver conteúdo" fechado - abrir e' o que o professor faz.
    aba.querySelectorAll('details').forEach(d => { d.open = true; });
    const guardado = (data.historicoDocumentos || []).filter(h => h.tipo === 'plano_aula');

    // Reimpressao: sem IA e sem refazer o formulario.
    window.__impresso = '';
    window.__chamadasDeRede = [];
    await reimprimirPlanoAulaHistoricoEstagiario(guardado[0].id);

    return {
      listou: aba.innerText.indexOf('Historia') !== -1 && aba.innerText.indexOf('Revolucao Francesa') !== -1,
      mostraTexto: aba.innerText.indexOf('Entender a queda da Bastilha') !== -1,
      noHistoricoDaConta: guardado.length === 1,
      reimprimiu: window.__impresso.indexOf('Entender a queda da Bastilha') !== -1,
      foiNaIA: window.__chamadasDeRede.some(u => /googleapis|openai|groq|openrouter|nvidia|anthropic/i.test(u))
    };
  });
  ok('o plano impresso aparece na aba "Planos de Aula"', r3.listou);
  ok('a aba mostra o texto do plano pra consulta', r3.mostraTexto);
  ok('o plano entra no historico da conta (e nao so no aparelho)', r3.noHistoricoDaConta);
  ok('da pra reimprimir o plano guardado', r3.reimprimiu);
  ok('a reimpressao nao chama a IA de novo', r3.foiNaIA === false);

  // ============ 4. ANEXO IV - PEI: CONSULTA E REIMPRESSAO ============
  // O PEI de OUTRO professor sobre a mesma estudante ja' esta' no Painel AEE da escola;
  // o desta conta e' gerado pelo caminho de verdade (tela de revisao -> imprimir).
  await p.evaluate(async () => {
    await salvarDadosUsuario('app_data_school_77_aee', { tutorados: [
      { id: 9, nome_estudante: 'Ana Lima', turma: '7A', anexosIV: [
        { id: 556, atualizadoEm: '2026-03-11',
          dadosBasicos: { nomeEstudante:'Ana Lima', disciplina:'Arte', professorRegente:'Outra Pessoa', bimestre:'1' },
          dados: { habilidades_curriculo:'EF07AR01' } }
      ] }
    ] });

    abrirModalRevisaoAnexoIV(
      { nomeEstudante:'Ana Lima', disciplina:'Historia', professorRegente:'Professor', bimestre:'1', fichaAeeVazia:false },
      { habilidades_curriculo:'EF07HI05 - leitura de fontes', estrategias_intervencoes:'Material ampliado', instrumentos:'Registro em portfolio' },
      9);
  });
  await p.waitForFunction(() => {
    const f = document.getElementById('previaAnexoIVEstagiario');
    return !!(f && f.contentDocument && f.contentDocument.querySelector('.campo-editavel-estagiario'));
  }, null, { timeout: 20000 });

  const r4 = await p.evaluate(async () => {
    window.__impresso = '';
    window.open = () => ({ document:{ write:(h)=>{ window.__impresso += h; }, close:()=>{} } });
    await exportarAnexoIVFinal();

    await showDocumentosTab('anexoIV');
    const aba = document.getElementById('tabDocAnexoIV');
    aba.querySelectorAll('details').forEach(d => { d.open = true; });
    const soMeus = { texto: aba.innerText, temAna: aba.innerText.indexOf('Ana Lima') !== -1,
                     temOutroProfessor: aba.innerText.indexOf('Outra Pessoa') !== -1 };

    alternarAnexosIVTodosProfessores();
    await new Promise(r => setTimeout(r, 400));
    const todos = { temOutroProfessor: aba.innerText.indexOf('Outra Pessoa') !== -1 };
    alternarAnexosIVTodosProfessores();
    await new Promise(r => setTimeout(r, 400));

    window.__impresso = '';
    const meu = JSON.parse(document.getElementById('tabDocAnexoIV').dataset.aeeTutorados)
      .find(t => t.id == 9).anexosIV.find(a => a.dadosBasicos.disciplina === 'Historia');
    await reimprimirAnexoIVSalvo(9, meu.id);
    await new Promise(r => setTimeout(r, 800));

    return {
      listouMeu: soMeus.temAna,
      mostraTexto: soMeus.texto.indexOf('Material ampliado') !== -1,
      escondeDosOutros: !soMeus.temOutroProfessor,
      mostraDaEscolaQuandoPedido: todos.temOutroProfessor,
      reimprimiu: window.__impresso.indexOf('Registro em portfolio') !== -1
    };
  });
  ok('a aba lista o Anexo IV - PEI gerado por esta conta', r4.listouMeu);
  ok('o texto do PEI fica a' + "'" + ' mao pra consulta', r4.mostraTexto);
  ok('os PEIs de outro professor so aparecem quando pedidos', r4.escondeDosOutros && r4.mostraDaEscolaQuandoPedido);
  ok('da pra reimprimir o PEI numa conta de professor comum', r4.reimprimiu);

  // ============ 5. O HISTORICO ATRAVESSA O FECHAMENTO DO NAVEGADOR ============
  const r5a = await p.evaluate(async () => {
    await showDocumentosTab('historico');
    const aba = document.getElementById('tabDocHistorico');
    return { tipos: (data.historicoDocumentos || []).map(h => h.tipo), texto: aba.innerText };
  });
  ok('o historico registra o plano de aula e o Anexo IV - PEI',
      r5a.tipos.indexOf('plano_aula') !== -1 && r5a.tipos.indexOf('anexo4_pei') !== -1);
  ok('a aba Historico mostra os dois documentos',
      r5a.texto.indexOf('Plano de Aula') !== -1 && r5a.texto.indexOf('Anexo IV - PEI') !== -1);

  const r5b = await p.evaluate(async () => {
    // O que foi gravado agora volta do banco do professor, sem depender do localStorage.
    localStorage.removeItem('estagiario_planos_aula_recentes');
    const chave = getStorageKey(currentUser);
    const voltou = await lerDocUsuario(chave);
    data = voltou;
    return {
      guardados: (voltou.historicoDocumentos || []).length,
      aindaListaOPlano: lerHistoricoPlanoAulaEstagiario().length === 1
    };
  });
  ok('o historico e gravado junto com os dados da conta', r5b.guardados >= 2);
  ok('sem o espelho do aparelho, o plano continua listado', r5b.aindaListaOPlano);

  await b.close();
  if (falhas.length) { console.log('\n' + falhas.length + ' FALHA(S):'); falhas.forEach(f => console.log(' - ' + f)); process.exit(1); }
  console.log('\nTudo certo.');
})();
