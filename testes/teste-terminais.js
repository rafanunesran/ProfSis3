// Fase 7: limite de telas por conta. Padrao 1, o super admin muda o numero, a troca
// exige confirmacao - e falha de rede NUNCA tranca ninguem.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = { 'access/u1': { approved:true, role:'professor' } };   // sem limite = 1
  window.__falharLeitura = false;
  const ref = (col,id) => ({
    get: async () => {
      if (window.__falharLeitura) { const e = new Error('offline'); e.code='unavailable'; throw e; }
      const d = window.__docs[col+'/'+id];
      return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};
const U = { id:1, uid:'u1', nome:'Maria', email:'m@e.com', role:'professor', schoolId:'77' };

async function abrirTerminal(browser, docs) {
  const p = await (await browser.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1700);
  if (docs) await p.evaluate((d) => { window.__docs = JSON.parse(d); }, docs);
  await p.evaluate((u) => { currentUser = u; }, U);
  return p;
}
const banco = (p) => p.evaluate(() => JSON.stringify(window.__docs));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // --- 1. Terminal A entra: pega a unica vaga ---
  const A = await abrirTerminal(b, null);
  const r1 = await A.evaluate(async () => {
    const r = await reivindicarTerminal();
    return { estado: r.estado, lista: (window.__docs['terminais/u1'].lista || []).length,
             apelido: window.__docs['terminais/u1'].lista[0].apelido };
  });
  console.log('1. terminal A -> ' + r1.estado + ' | vagas ocupadas: ' + r1.lista + ' | apelido: "' + r1.apelido + '"');

  // --- 2. Terminal B (outro navegador): vaga cheia, precisa confirmar ---
  const B = await abrirTerminal(b, await banco(A));
  const r2 = await B.evaluate(async () => {
    const r = await reivindicarTerminal();
    return { estado: r.estado, limite: r.limite, ocupados: (r.ocupados||[]).length };
  });
  console.log('2. terminal B -> ' + r2.estado + ' | limite: ' + r2.limite + ' | ocupados: ' + r2.ocupados);

  // 2b. A tela explica e oferece assumir
  const tela = await B.evaluate((r) => {
    renderTelaTerminalOcupado(r);
    const t = document.getElementById('telaTerminalOcupado');
    return { visivel: !!t, texto: t.textContent.indexOf('Assumir a vez neste terminal') !== -1,
             dizQueNaoPerde: t.textContent.indexOf('não perde nada') !== -1 };
  }, { limite: 1, ocupados: [{ apelido:'Chrome no Linux', visto: Date.now() - 600000 }] });
  console.log('2b. tela de troca -> visivel: ' + tela.visivel + ' | botao assumir: ' + tela.texto
    + ' | tranquiliza sobre o outro: ' + tela.dizQueNaoPerde);

  // --- 3. B assume: A perde a vaga ---
  const r3 = await B.evaluate(async () => {
    await assumirVaga();
    return { minhas: (window.__docs['terminais/u1'].lista||[]).length,
             souEu: window.__docs['terminais/u1'].lista[0].id === window._idTerminal };
  });
  const depois = await banco(B);
  const r3a = await A.evaluate(async (d) => { window.__docs = JSON.parse(d); return await terminalAindaTemVaga(); }, depois);
  console.log('3. B assumiu -> vagas: ' + r3.minhas + ' | a vaga e do B: ' + r3.souEu + ' | A ainda tem vaga? ' + r3a);

  // --- 4. Limite 2: os dois cabem ---
  const r4 = await A.evaluate(async () => {
    window.__docs['access/u1'].limiteTerminais = 2;
    const r = await reivindicarTerminal();
    return { estado: r.estado, vagas: (window.__docs['terminais/u1'].lista||[]).length };
  });
  console.log('4. limite 2 -> A voltou: ' + r4.estado + ' | vagas ocupadas: ' + r4.vagas);

  // --- 5. Ilimitado (0): nunca pergunta ---
  const C = await abrirTerminal(b, await banco(A));
  const r5 = await C.evaluate(async () => {
    window.__docs['access/u1'].limiteTerminais = 0;
    return (await reivindicarTerminal()).estado;
  });
  console.log('5. limite 0 (ilimitado) -> terminal novo: ' + r5);

  // --- 6. Vaga parada ha' 31 dias volta para o bolo sozinha ---
  const D = await abrirTerminal(b, null);
  const r6 = await D.evaluate(async () => {
    window.__docs['access/u1'] = { approved:true, role:'professor', limiteTerminais:1 };
    window.__docs['terminais/u1'] = { lista: [
      { id:'fantasma', apelido:'PC quebrado', desde: 0, visto: Date.now() - 31*86400000 } ] };
    const r = await reivindicarTerminal();
    return { estado: r.estado, lista: window.__docs['terminais/u1'].lista.map(t => t.apelido) };
  });
  console.log('6. vaga parada ha 31 dias -> ' + r6.estado + ' | lista agora: ' + r6.lista.join(', '));

  // --- 7. Rede falhando NAO pode trancar ---
  const r7 = await D.evaluate(async () => {
    window.__falharLeitura = true;
    const r = await reivindicarTerminal();
    const vaga = await terminalAindaTemVaga();
    window.__falharLeitura = false;
    return { estado: r.estado, temVaga: vaga };
  });
  console.log('7. banco fora do ar -> reivindicar: ' + r7.estado + ' | ainda tem vaga: ' + r7.temVaga);

  const ok = r1.estado==='ok' && r1.lista===1 && r2.estado==='precisa-confirmar' && r2.limite===1
          && r2.ocupados===1 && tela.visivel && tela.texto && tela.dizQueNaoPerde
          && r3.minhas===1 && r3.souEu && r3a===false && r4.estado==='ok' && r4.vagas===2
          && r5==='ok' && r6.estado==='ok' && r6.lista.length===1 && r6.lista[0]!=='PC quebrado'
          && r7.estado==='ok' && r7.temVaga===true;
  console.log('\n' + (ok ? 'OK: o limite vale, a troca e consentida, e nada tranca por acidente'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
