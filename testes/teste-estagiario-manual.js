// O ESTAGIARIO SEM IA: "BRANCO", "ULTIMO" E O "PUXAR ANTERIOR".
//
// O fluxo do Estagiario so' existia com IA: o professor preenchia o formulario, a IA
// rascunhava os campos e so' entao aparecia a previa editavel. Sem chave de IA (ou
// quando o professor ja' sabe o que escrever) nao havia como chegar no documento.
//
// Cobrimos o caminho novo ponta a ponta:
//   1. o botao "Manual" existe e some na Agenda Mensal (que nao passa por IA);
//   2. ele abre um pop-up com "Branco" e "Ultimo" - sem documento anterior, "Ultimo"
//      vem desativado e explicado;
//   3. "Branco" abre a MESMA previa editavel, com todos os campos vazios e sem chamar IA;
//   4. o plano impresso entra no historico local, e so' entao "Ultimo" e o botao
//      "Puxar anterior" passam a valer;
//   5. "Ultimo" abre a previa ja' com o texto do plano anterior;
//   6. o "Puxar anterior" com algo ja' escrito, respondendo "Cancelar", COMPLETA - nao
//      sobrescreve o que o professor escreveu.
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
  // Nenhuma chamada de IA pode sair daqui: se sair, o teste falha em vez de ir na rede.
  window.__chamadasDeRede = [];
  const fetchOriginal = window.fetch;
  window.fetch = function(u, o) { window.__chamadasDeRede.push(String(u)); return fetchOriginal.apply(this, arguments); };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

// Espera a previa (iframe com o modelo de Docs/) terminar de montar.
const esperarPrevia = (p, id) => p.waitForFunction((idIframe) => {
  const f = document.getElementById(idIframe);
  const d = f && f.contentDocument;
  return !!(d && d.querySelector('.campo-editavel-estagiario'));
}, id || 'previaPlanoAulaEstagiario', { timeout: 20000 });

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();

  // O "Puxar anterior" pergunta (confirm) o que fazer quando ja' ha' texto na tela:
  // OK substitui, Cancelar completa. `resposta` decide o que o teste responde.
  let resposta = 'accept';
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); resposta === 'accept' ? await d.accept() : await d.dismiss(); });

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // ============ 1. O BOTAO EXISTE, E A AGENDA MENSAL NAO O OFERECE ============
  const r1 = await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Historia' } ],
      horariosAulas: [] });
    localStorage.removeItem('estagiario_planos_aula_recentes');

    await abrirModalGerarDocumentoIA();
    const btn = document.getElementById('btnGerarDocumentoManual');

    document.getElementById('iaDocTipo').value = 'agenda_mensal'; toggleTipoDocumentoIA();
    const naAgenda = btn.style.display;
    document.getElementById('iaDocTipo').value = 'plano_aula'; toggleTipoDocumentoIA();
    const noPlano = btn.style.display;

    return { existe: !!btn, rotulo: btn ? btn.textContent : '', naAgenda, noPlano };
  }, PROF);
  ok('o botao "Manual" aparece no formulario', r1.existe);
  ok('o botao se chama so\' "Manual"', r1.rotulo.indexOf('Manual') !== -1 && r1.rotulo.indexOf('Preencher') === -1);
  ok('some na Agenda Mensal (que nao passa por IA)', r1.naAgenda === 'none');
  ok('volta no Plano de Aula', r1.noPlano !== 'none');

  // ============ 2. O POP-UP DE OPCOES, SEM NADA ANTERIOR GUARDADO ============
  const r2a = await p.evaluate(async () => {
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Revolucao Francesa';
    await gerarDocumentoManualEstagiario();

    const pop = document.getElementById('modalOpcoesManualEstagiario');
    const botoes = Array.from(pop.querySelectorAll('button'));
    const branco = botoes.find(b => b.textContent.indexOf('Branco') !== -1);
    const ultimo = botoes.find(b => b.textContent.indexOf('Último') !== -1);
    return {
      abriu: pop.classList.contains('active'),
      temBranco: !!branco,
      temUltimo: !!ultimo,
      ultimoDesativado: !!ultimo && ultimo.disabled,
      explicaFalta: pop.innerText.indexOf('Ainda não há') !== -1,
      formularioAtras: document.getElementById('modalGerarDocumentoIA').classList.contains('active')
    };
  });
  ok('o "Manual" abre um pop-up em vez de ir direto pro documento', r2a.abriu);
  ok('o pop-up oferece "Branco" e "Ultimo"', r2a.temBranco && r2a.temUltimo);
  ok('sem documento anterior, "Ultimo" vem desativado e explicado', r2a.ultimoDesativado && r2a.explicaFalta);
  ok('o formulario continua aberto atras do pop-up (Cancelar volta pra ele)', r2a.formularioAtras);

  // ============ 2b. "BRANCO" ABRE A PREVIA VAZIA, SEM IA ============
  await p.evaluate(async () => { await escolherManualEstagiario('branco'); });
  await esperarPrevia(p);

  const r2 = await p.evaluate(() => {
    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    const campos = Array.from(d.querySelectorAll('.campo-editavel-estagiario'));
    const modal = document.getElementById('modalRevisaoDocumento');
    return {
      qtdCampos: campos.length,
      todosVazios: campos.every(c => !c.innerText.trim()),
      avisoManual: modal.innerText.indexOf('Preenchimento manual') !== -1,
      temPuxar: !!modal.querySelector('button[onclick*="puxarDocumentoAnteriorEstagiario"]'),
      foiNaIA: window.__chamadasDeRede.some(u => /googleapis|openai|groq|openrouter|nvidia|anthropic/i.test(u))
    };
  });
  ok('"Branco" abre a previa com os 7 campos do Plano de Aula editaveis', r2.qtdCampos === 7);
  ok('todos os campos chegam vazios (nada foi rascunhado)', r2.todosVazios);
  ok('a tela avisa que o preenchimento e\' manual', r2.avisoManual);
  ok('nenhuma chamada de IA saiu no caminho manual', r2.foiNaIA === false);
  ok('sem plano anterior guardado, o "Puxar anterior" nem aparece', r2.temPuxar === false);

  // ============ 3. O PLANO IMPRESSO ENTRA NO HISTORICO LOCAL ============
  const r3 = await p.evaluate(async () => {
    // A impressao abre uma janela nova - aqui ela vira um destino de papel fingido.
    window.__impresso = '';
    window.open = () => ({ document:{ write:(h)=>{ window.__impresso += h; }, close:()=>{} } });

    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    d.querySelector('[data-campo="objetivos"]').innerText = 'Entender a queda da Bastilha';
    d.querySelector('[data-campo="conteudos"]').innerText = 'Antigo Regime; 1789';
    await exportarDocumentoFinal('plano_aula');

    const historico = JSON.parse(localStorage.getItem('estagiario_planos_aula_recentes') || '[]');
    return {
      imprimiu: window.__impresso.indexOf('Entender a queda da Bastilha') !== -1,
      guardados: historico.length,
      primeiro: historico[0] || {}
    };
  });
  ok('o texto escrito a mao sai no documento impresso', r3.imprimiu);
  ok('o plano impresso foi guardado no historico local', r3.guardados === 1);
  ok('o historico guarda serie, disciplina e os campos', r3.primeiro.serie === '7º Ano'
      && r3.primeiro.disciplina === 'Historia'
      && r3.primeiro.dados.objetivos === 'Entender a queda da Bastilha');

  // ============ 4. COM UM PLANO GUARDADO, O "ULTIMO" PASSA A VALER ============
  const r4a = await p.evaluate(async () => {
    closeModal('modalRevisaoDocumento');
    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Era Napoleonica';
    await gerarDocumentoManualEstagiario();

    const pop = document.getElementById('modalOpcoesManualEstagiario');
    const ultimo = Array.from(pop.querySelectorAll('button')).find(b => b.textContent.indexOf('Último') !== -1);
    return {
      ultimoAtivo: !!ultimo && !ultimo.disabled,
      dizQualPlano: pop.innerText.indexOf('Revolucao Francesa') !== -1
    };
  });
  ok('com um plano anterior guardado, "Ultimo" fica disponivel', r4a.ultimoAtivo);
  ok('o pop-up diz de qual plano anterior se trata', r4a.dizQualPlano);

  await p.evaluate(async () => { await escolherManualEstagiario('ultimo'); });
  await esperarPrevia(p);

  const r4 = await p.evaluate(() => {
    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    const modal = document.getElementById('modalRevisaoDocumento');
    return {
      objetivos: d.querySelector('[data-campo="objetivos"]').innerText.trim(),
      conteudos: d.querySelector('[data-campo="conteudos"]').innerText.trim(),
      avisaOrigem: modal.innerText.indexOf('último Plano de Aula') !== -1,
      temPuxar: !!modal.querySelector('button[onclick*="puxarDocumentoAnteriorEstagiario"]')
    };
  });
  ok('"Ultimo" abre a previa ja com o texto do plano anterior', r4.objetivos === 'Entender a queda da Bastilha'
      && r4.conteudos === 'Antigo Regime; 1789');
  ok('a tela avisa que o texto veio do ultimo plano', r4.avisaOrigem);
  ok('o botao "Puxar anterior" continua na tela de revisao', r4.temPuxar);

  // ============ 5. "CANCELAR" NO AVISO COMPLETA EM VEZ DE SOBRESCREVER ============
  await p.evaluate(async () => {
    closeModal('modalRevisaoDocumento');
    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Congresso de Viena';
    await gerarDocumentoManualEstagiario();
    await escolherManualEstagiario('branco');
  });
  await esperarPrevia(p);

  resposta = 'dismiss'; // Cancelar = manter o que esta' escrito e so' completar os vazios
  const r5 = await p.evaluate(async () => {
    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    d.querySelector('[data-campo="objetivos"]').innerText = 'Meu proprio objetivo';
    const modal = document.getElementById('modalRevisaoDocumento');
    modal.querySelector('button[onclick*="puxarDocumentoAnteriorEstagiario"]').click();
    await new Promise(r => setTimeout(r, 300)); // o confirm volta pelo evento de dialogo
    return {
      objetivos: d.querySelector('[data-campo="objetivos"]').innerText.trim(),
      conteudos: d.querySelector('[data-campo="conteudos"]').innerText.trim()
    };
  });
  ok('o que o professor escreveu continua intacto', r5.objetivos === 'Meu proprio objetivo');
  ok('os campos que estavam vazios foram completados com o anterior', r5.conteudos === 'Antigo Regime; 1789');
  ok('o aviso explicou as duas saidas (substituir tudo x so\' os vazios)',
     avisos.some(m => /substituir/i.test(m) && /campos ainda vazios/i.test(m)));

  // ============ 6. O MESMO CAMINHO NO ANEXO III - PAEE ============
  // Aqui o "anterior" nao vem do aparelho: e' o Anexo III ja' salvo no perfil do estudante.
  await p.evaluate(async () => {
    closeModal('modalRevisaoDocumento');
    currentViewMode = 'aee';
    const anteriores = {};
    ANEXO_PAEE_CAMPOS_IA.forEach((c, i) => { anteriores[c.key] = 'Texto anterior ' + i; });
    data.tutorados = [ { id:9, nome_estudante:'Ana', turma:'7A',
                         anexoPaee: { dadosBasicos:{}, dados: anteriores, atualizadoEm:'2026-03-10' } } ];

    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocTipo').value = 'anexo3_paee';
    toggleTipoDocumentoIA();
    document.getElementById('anexoPaeeAluno').value = '9';
    await gerarDocumentoManualEstagiario();
    await escolherManualEstagiario('branco');
  });
  await esperarPrevia(p, 'previaAnexoPaeeEstagiario');

  const r6 = await p.evaluate(() => {
    const d = document.getElementById('previaAnexoPaeeEstagiario').contentDocument;
    const modal = document.getElementById('modalRevisaoAnexoPaee');
    const vazios = Array.from(d.querySelectorAll('.campo-editavel-estagiario')).every(c => !c.innerText.trim());
    const botao = modal.querySelector('button[onclick*="puxarDocumentoAnteriorEstagiario"]');
    if (botao) botao.click();
    return {
      vazios,
      temPuxar: !!botao,
      puxou: d.querySelector('[data-campo="habilidades_desenvolvidas"]').innerText.trim() === 'Texto anterior 3'
    };
  });
  ok('o Anexo III - PAEE manual tambem abre com os campos em branco', r6.vazios);
  ok('o Anexo III do estudante, ja salvo, vira a base do "Puxar anterior"', r6.temPuxar);
  ok('puxar traz o texto do Anexo III anterior pra previa', r6.puxou);

  // ============ 7. O CAMINHO COM IA CONTINUA INTEIRO ============
  // O modo manual mexeu na coleta do formulario (a mesma funcao serve aos dois caminhos),
  // entao o fluxo de sempre - formulario -> IA -> previa ja' preenchida - vai junto no teste.
  await p.route('**/generativelanguage.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ candidates: [ { content: { parts: [ { text: JSON.stringify({
      aprendizagem_essencial:'Rascunho da IA', conteudos:'c', habilidades:'h', objetivos:'o',
      desenvolvimento:'d', materiais:'m', avaliacao:'a' }) } ] } } ] })
  }));

  const r7 = await p.evaluate(async () => {
    closeModal('modalRevisaoAnexoPaee');
    currentViewMode = 'professor';
    window.__docs['system/config_ia'] = { apiKey: 'chave-de-mentira' };

    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocTipo').value = 'plano_aula'; toggleTipoDocumentoIA();
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Iluminismo';
    await gerarDocumentoIA();
    return { abriuRevisao: document.getElementById('modalRevisaoDocumento').style.display !== 'none' };
  });
  await esperarPrevia(p, 'previaPlanoAulaEstagiario');

  const r7b = await p.evaluate(() => {
    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    const modal = document.getElementById('modalRevisaoDocumento');
    return {
      rascunhoNaPrevia: d.querySelector('[data-campo="aprendizagem_essencial"]').innerText.trim() === 'Rascunho da IA',
      semAvisoManual: modal.innerText.indexOf('Preenchimento manual') === -1
    };
  });
  ok('o fluxo com IA continua abrindo a tela de revisao', r7.abriuRevisao);
  ok('a previa do fluxo com IA chega com o rascunho preenchido', r7b.rascunhoNaPrevia);
  ok('o aviso de preenchimento manual nao aparece no fluxo com IA', r7b.semAvisoManual);

  await b.close();
  if (falhas.length) { console.log('\n' + falhas.length + ' falha(s).'); process.exit(1); }
  console.log('\nTudo certo.');
})();
