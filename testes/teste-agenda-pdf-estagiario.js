// AGENDA MENSAL DO ESTAGIARIO TAMBEM BAIXA EM PDF DIRETO.
//
// A Agenda Mensal so' tinha "Gerar e Imprimir": para ter o PDF era preciso passar pela
// janela de impressao e escolher "Salvar como PDF". Agora, com Agenda Mensal escolhida,
// aparece "📄 Baixar PDF", que baixa o arquivo sem abrir a impressao (e some nos outros tipos).
// PRECISA DE INTERNET: o gerador de PDF (html2pdf.js) vem do cdnjs.
const { chromium } = require('playwright');
const fs = require('fs');

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
  window.__impressoes = 0;
  window.open = () => { window.__impressoes++; return { document:{ write(){}, close(){} }, print(){} }; };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };
const ehPdf = (b) => b.slice(0, 5).toString('latin1') === '%PDF-';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, proxy: PROXY ? { server: PROXY, bypass: '<-loopback>,localhost,127.0.0.1' } : undefined });
  const p = await (await b.newContext({ acceptDownloads: true })).newPage();
  p.on('dialog', d => { console.log('  [alerta] ' + d.message().slice(0, 200)); d.accept(); });
  await p.route(/gstatic\.com/, r => r.abort());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForFunction(() => typeof getInitialData === 'function' && typeof abrirModalGerarDocumentoIA === 'function', null, { timeout: 60000 });
  await p.waitForTimeout(1800);

  const r0 = await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Historia' } ], horariosAulas: [] });
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    renderProfessorPanel();
    // Grade da escola (definida pela gestao) com 1a e 2a aula de segunda a sexta.
    getGradeEscola = async () => [1,2,3,4,5].flatMap(d => [
      { diaSemana:d, label:'1ª Aula', inicio:'07:00', fim:'07:50' },
      { diaSemana:d, label:'2ª Aula', inicio:'07:50', fim:'08:40' } ]);
    await abrirModalGerarDocumentoIA();
    const vis = () => getComputedStyle(document.getElementById('btnGerarAgendaPdf')).display !== 'none';
    document.getElementById('iaDocTipo').value = 'plano_aula'; toggleTipoDocumentoIA();
    const noPlano = vis();
    document.getElementById('iaDocTipo').value = 'agenda_mensal'; toggleTipoDocumentoIA();
    document.getElementById('iaAgendaMes').value = '2';
    document.getElementById('iaAgendaAno').value = '2026';
    return { noPlano, naAgenda: vis() };
  }, PROF);
  ok('"Baixar PDF" fica escondido no Plano de Aula', !r0.noPlano);
  ok('"Baixar PDF" aparece na Agenda Mensal', r0.naAgenda);

  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 90000 }),
    p.evaluate(() => document.getElementById('btnGerarAgendaPdf').click())
  ]);
  const bytes = fs.readFileSync(await dl.path());
  if (process.env.PDF_DIR) fs.writeFileSync(require('path').join(process.env.PDF_DIR, dl.suggestedFilename()), bytes);
  await p.waitForTimeout(500);
  const r1 = await p.evaluate(() => ({ impressoes: window.__impressoes,
    hist: (data.historicoDocumentos || []).filter(h => h.tipo === 'agenda_mensal').length }));
  ok('baixa um PDF de verdade (' + dl.suggestedFilename() + ', ' + bytes.length + ' bytes)', ehPdf(bytes) && bytes.length > 5000);
  ok('o nome do arquivo e o nome sugerido da agenda', /^Agenda_Mar.o_Professor\.pdf$/.test(dl.suggestedFilename()));
  ok('nao abre a janela de impressao', r1.impressoes === 0);
  ok('a agenda entra no historico de documentos', r1.hist === 1);

  await b.close();
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
