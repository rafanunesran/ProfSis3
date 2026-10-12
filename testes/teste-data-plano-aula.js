// CORRIGIR A DATA DO PLANO DE AULA PELO CALENDARIO.
//
// 1. Na tela de revisao do Plano de Aula ha um calendario "📅 Data do plano": clicar num dia
//    troca a semana (Seg a Sex) no campo DATA da previa, sem perder o texto ja editado, e o
//    documento salvo/baixado sai com a data nova (inclusive no nome do PDF).
// 2. Na aba Planos de Aula (tela Documentos) cada plano guardado tem o mesmo calendario: a
//    data corrigida fica guardada e o Reimprimir/PDF seguintes ja saem com ela.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PROXY = process.env.PROFSIS_PROXY;

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
  // A "impressao" guarda o HTML do documento para conferir a data que saiu nele.
  window.__impresso = [];
  window.open = () => ({ document:{ write(h){ window.__impresso.push(h); }, close(){} }, print(){} });
};

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, proxy: PROXY ? { server: PROXY, bypass: '<-loopback>,localhost,127.0.0.1' } : undefined });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', d => { console.log('  [alerta] ' + d.message().slice(0, 200)); d.accept(); });
  await p.route(/gstatic\.com/, r => r.abort());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForFunction(() => typeof getInitialData === 'function' && typeof abrirModalGerarDocumentoIA === 'function', null, { timeout: 60000 });
  await p.waitForTimeout(1800);

  // ============ 1. TELA DE REVISAO ============
  await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Historia' } ], horariosAulas: [] });
    localStorage.removeItem('estagiario_planos_aula_recentes');
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    renderProfessorPanel();
    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocTipo').value = 'plano_aula'; toggleTipoDocumentoIA();
    atualizarSemanaPorDataEstagiario('2026-10-14');
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Revolucao Francesa';
    await gerarDocumentoManualEstagiario();
    await escolherManualEstagiario('branco');
  }, PROF);
  await p.waitForFunction(() => {
    const f = document.getElementById('previaPlanoAulaEstagiario');
    return !!(f && f.contentDocument && f.contentDocument.querySelector('.campo-editavel-estagiario'));
  }, null, { timeout: 20000 });

  const r1 = await p.evaluate(async () => {
    const picker = document.getElementById('revDocSemanaData');
    const antes = picker && picker.value;
    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    d.querySelector('[data-campo="objetivos"]').innerText = 'Texto ja editado';
    picker.value = '2026-10-22'; picker.dispatchEvent(new Event('change'));
    const celula = Array.from(d.querySelectorAll('td')).find(td => /^\s*DATA:/.test(td.textContent));
    const textoMantido = d.querySelector('[data-campo="objetivos"]').innerText;
    await exportarDocumentoFinalPlanoAula('imprimir');
    const html = window.__impresso[window.__impresso.length - 1] || '';
    const plano = lerHistoricoPlanoAulaEstagiario()[0];
    return { antes, depois: picker.value, celula: celula && celula.textContent.trim(), textoMantido,
             noDoc: /DATA:<\/b>\s*19\/10 a 23\/10/.test(html), titulo: (html.match(/<title>([^<]*)/) || [])[1],
             semanaGuardada: plano && plano.semana, id: plano && plano.id };
  });
  ok('o calendario abre na semana escolhida no formulario (' + r1.antes + ')', r1.antes === '2026-10-12');
  ok('clicar num dia encaixa na segunda-feira da semana', r1.depois === '2026-10-19');
  ok('o campo DATA da previa mostra a nova semana (' + r1.celula + ')', r1.celula === 'DATA: 19/10 a 23/10');
  ok('o texto ja editado continua na previa', r1.textoMantido === 'Texto ja editado');
  ok('o documento impresso sai com a nova data', r1.noDoc);
  ok('o nome sugerido do PDF usa a nova semana (' + r1.titulo + ')', /19a231026/.test(r1.titulo || ''));
  ok('o plano guardado fica com a nova semana', r1.semanaGuardada === '19/10 a 23/10');

  // ============ 2. ABA PLANOS DE AULA ============
  const r2 = await p.evaluate(async (id) => {
    closeModal('modalRevisaoDocumento');
    let tab = document.getElementById('tabDocPlanos');
    if (!tab) { tab = document.createElement('div'); tab.id = 'tabDocPlanos'; document.body.appendChild(tab); }
    renderDocumentosPlanos();
    const picker = tab.querySelector('input[type="date"]');
    const antes = picker && picker.value;
    picker.value = '2026-11-05'; picker.dispatchEvent(new Event('change'));
    const lista = lerHistoricoPlanoAulaEstagiario();
    const plano = lista.find(x => x.id === id);
    const local = lerHistoricoPlanoAulaLocalEstagiario().find(x => x.id === id);
    const conta = data.historicoDocumentos.find(x => x.id === id);
    const n = window.__impresso.length;
    await reimprimirPlanoAulaHistoricoEstagiario(id);
    const html = window.__impresso[n] || '';
    return { antes, novoPicker: (tab.querySelector('input[type="date"]') || {}).value,
             semana: plano.semana, inicio: plano.payload.semanaInicio, local: local && local.payload.semana,
             conta: conta && conta.payload.semanaFim, subtitulo: conta && conta.subtitulo,
             texto: plano.dados.objetivos, qtd: lista.length,
             lista: tab.textContent.indexOf('Semana 02/11 a 06/11') !== -1,
             reimpresso: /DATA:<\/b>\s*02\/11 a 06\/11/.test(html) };
  }, r1.id);
  ok('o calendario do plano guardado mostra a data atual dele (' + r2.antes + ')', r2.antes === '2026-10-19');
  ok('a nova data fica guardada no plano (conta e aparelho)', r2.semana === '02/11 a 06/11' && r2.inicio === '2026-11-02'
     && r2.local === '02/11 a 06/11' && r2.conta === '2026-11-06');
  ok('o historico mostra a nova semana (' + r2.subtitulo + ')', /semana 02\/11 a 06\/11/.test(r2.subtitulo || ''));
  ok('a lista e o calendario ja mostram a data corrigida', r2.lista && r2.novoPicker === '2026-11-02');
  ok('o texto do plano nao muda e nada e duplicado', r2.texto === 'Texto ja editado' && r2.qtd === 1);
  ok('o Reimprimir sai com a data corrigida', r2.reimpresso);

  await b.close();
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
