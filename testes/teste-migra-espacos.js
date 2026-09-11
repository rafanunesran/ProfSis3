// Migracao das escolas antigas para espacos: idempotente e sem mover dado nenhum.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const dl = path.join(require('os').tmpdir(), 'profsis-testes-baixados');

const FAKE = () => {
  window.__docs = {
    'system/schools_list': { list: [ {id:'77', nome:'Escola A'}, {id:'88', nome:'Escola B'} ] },
    'system/users_list': { list: [
      { id:1, uid:'u1', email:'a@e.com', nome:'Ana',  schoolId:'77' },
      { id:2, uid:'u2', email:'b@e.com', nome:'Beto', schoolId:'88' },
      { id:3, uid:'u3', email:'c@e.com', nome:'Cida', schoolId:'77', approved:false } ] }
  };
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (obj, opc) => { const k = col+'/'+id;
      window.__docs[k] = (opc && opc.merge && window.__docs[k])
        ? Object.assign({}, window.__docs[k], JSON.parse(JSON.stringify(obj)))
        : JSON.parse(JSON.stringify(obj)); },
    delete: async () => { delete window.__docs[col+'/'+id]; }
  });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth: () => ({ currentUser: { uid:'adm', email:'rafaelnf93@gmail.com' },
                   onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0) }),
    firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('dialog', async d => await d.accept());
  await page.addInitScript(FAKE);
  await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { currentUser = { id:0, uid:'adm', email:'rafaelnf93@gmail.com', role:'super_admin' }; });

  const [download] = await Promise.all([ page.waitForEvent('download'),
      page.evaluate(() => migrarEscolasParaEspacos().catch(e => console.warn(e))) ]);
  const arq = path.join(dl, download.suggestedFilename());
  await download.saveAs(arq);
  await page.waitForTimeout(400);

  const st = await page.evaluate(() => {
    const chaves = Object.keys(window.__docs);
    const escolas = window.__docs['system/schools_list'].list;
    const users = window.__docs['system/users_list'].list;
    const esp77 = chaves.filter(k => k.indexOf('espacos/') === 0)
        .map(k => window.__docs[k]).find(e => e.legacySchoolId === '77');
    return { espacos: chaves.filter(k => k.indexOf('espacos/')===0).length,
             indices: chaves.filter(k => k.indexOf('espacos_indice/')===0).length,
             escolasComEspaco: escolas.filter(e => e.espacoId).length,
             legacyPreservado: esp77 && esp77.legacySchoolId,
             ana: !!users[0].espacoId, beto: !!users[1].espacoId,
             cidaPendenteIntacta: !users[2].espacoId && users[2].approved === false,
             acessoAna: !!window.__docs['access/u1'] };
  });
  console.log('1. migrou -> espacos: ' + st.espacos + ' | indices: ' + st.indices
      + ' | escolas marcadas: ' + st.escolasComEspaco + ' | legacySchoolId preservado: ' + st.legacyPreservado);
  console.log('2. usuarios vinculados -> Ana: ' + st.ana + ' | Beto: ' + st.beto
      + ' | access/u1 gravado: ' + st.acessoAna);
  console.log('3. pendente de antes NAO foi liberada de carona? ' + st.cidaPendenteIntacta);

  const linhas = fs.readFileSync(arq, 'utf8').trim().split('\n');
  console.log('4. arquivo de codigos: ' + download.suggestedFilename() + ' (' + (linhas.length-1) + ' escola(s))');
  console.log('   ' + linhas.slice(1).map(l => l.split('\t').slice(0,2).join(' -> ')).join(' | '));

  // 5. Rodar de novo nao pode duplicar nada
  const st2 = await page.evaluate(async () => {
    await migrarEscolasParaEspacos().catch(() => {});
    return Object.keys(window.__docs).filter(k => k.indexOf('espacos/') === 0).length;
  });
  console.log('5. rodou de novo -> espacos: ' + st2 + (st2 === st.espacos ? ' (idempotente)' : ' *** DUPLICOU ***'));

  const ok = st.espacos===2 && st.indices===2 && st.escolasComEspaco===2 && st.legacyPreservado==='77'
          && st.ana && st.beto && st.cidaPendenteIntacta && st.acessoAna && st2===2 && linhas.length===3;
  console.log('\n' + (ok ? 'MIGRACAO OK' : '*** FALHOU ***'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
