// Quando o aplicativo e a Regra do Firestore discordam sobre o corte, quem manda e'
// a Regra. Insistir so' produz "Missing or insufficient permissions" a cada
// salvamento - e o professor nao tem como adivinhar o motivo.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async () => { const e = new Error('Missing or insufficient permissions.'); e.code='permission-denied'; throw e; },
    delete: async () => {} });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // 1. Aplicativo acha que e' "antes" (data adiada ou relogio atrasado), Regra ja' bloqueia
  const r1 = await p.evaluate(() => {
    window.usuarioOnlineCompleto = false;
    window.dadosMigradosLocalmente = false;
    _dataCorte = new Date('2026-12-01T00:00:00Z');     // corte adiado so' no cliente
    return { estado: estadoCorte(), podeEnviar: podeEnviarDadoPessoal(),
             regraBloqueia: regraDoServidorBloqueiaPessoal() };
  });
  console.log('1. cliente "antes" x Regra depois -> estado: ' + r1.estado
    + ' | regra bloqueia: ' + r1.regraBloqueia + ' | manda dado pessoal? ' + r1.podeEnviar);

  // 2. Conta isenta pelo super admin: a Regra tambem a isenta, entao pode mandar
  const r2 = await p.evaluate(() => {
    window.usuarioOnlineCompleto = true;
    return { estado: estadoCorte(), podeEnviar: podeEnviarDadoPessoal() };
  });
  console.log('2. conta isenta -> estado: ' + r2.estado + ' | manda dado pessoal? ' + r2.podeEnviar);

  // 3. Depois do corte, sem isencao: segue bloqueado como sempre
  const r3 = await p.evaluate(() => {
    window.usuarioOnlineCompleto = false;
    _dataCorte = new Date('2026-09-07T10:00:00Z');
    return { estado: estadoCorte(), podeEnviar: podeEnviarDadoPessoal() };
  });
  console.log('3. depois do corte -> estado: ' + r3.estado + ' | manda dado pessoal? ' + r3.podeEnviar);

  // 4. A recusa passa a se identificar
  avisos.length = 0;
  await p.evaluate(async () => {
    window.usuarioOnlineCompleto = true;          // deixa a guarda passar para chegar no banco
    currentUser = { id:1, uid:'u1', role:'professor', schoolId:'77' };
    await saveData('app_data', 'app_data_school_77_tutoria', { estudantes:[{id:1}], turmas:[] });
  });
  await p.waitForTimeout(400);
  const m = avisos[0] || '';
  const diz = { documento: m.indexOf('app_data/app_data_school_77_tutoria') !== -1,
                campos: m.indexOf('estudantes') !== -1,
                estado: m.indexOf('estado:') !== -1,
                tranquiliza: m.indexOf('NESTE APARELHO') !== -1,
                semTextoVago: m.indexOf('Verifique se as Regras') === -1 };
  console.log('4. recusa explicada -> documento: ' + diz.documento + ' | campos: ' + diz.campos
    + ' | estado: ' + diz.estado + ' | diz que nada se perdeu: ' + diz.tranquiliza);

  const ok = r1.estado === 'antes' && r1.regraBloqueia === true && r1.podeEnviar === false
          && r2.estado === 'migrado_isento' && r2.podeEnviar === true
          && r3.podeEnviar === false
          && diz.documento && diz.campos && diz.estado && diz.tranquiliza && diz.semTextoVago;
  console.log('\n' + (ok ? 'OK: o cliente nao insiste no que a Regra recusa, e a recusa se explica'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
