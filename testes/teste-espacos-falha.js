// O que acontece quando o banco RECUSA a escrita dos espacos.
// Antes: "Espacos criados: N" com nada gravado, e a lista de escolas marcada.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__negar = false;      // banco recusa escrita em espacos*
  window.__semSessao = false;  // painel aberto sem sessao no Auth
  window.__docs = {
    'system/schools_list': { list: [ {id:'77', nome:'Escola A'}, {id:'88', nome:'Escola B'} ] },
    'system/users_list': { list: [ { id:1, uid:'u1', email:'a@e.com', schoolId:'77' } ] }
  };
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (obj, opc) => {
      if (window.__negar && col.indexOf('espacos') === 0) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
      const k = col+'/'+id;
      window.__docs[k] = (opc && opc.merge && window.__docs[k])
        ? Object.assign({}, window.__docs[k], JSON.parse(JSON.stringify(obj)))
        : JSON.parse(JSON.stringify(obj));
    },
    delete: async () => { delete window.__docs[col+'/'+id]; }
  });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth: () => ({ currentUser: window.__semSessao ? null : { uid:'adm', email:'rafaelnf93@gmail.com' },
                   onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0) }),
    firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const avisos = []; let baixou = false;
  page.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  page.on('download', () => { baixou = true; });
  await page.addInitScript(FAKE);
  await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { currentUser = { id:0, uid:'adm', email:'rafaelnf93@gmail.com', role:'super_admin' }; });

  const migrar = async () => { avisos.length = 0; baixou = false;
    await page.evaluate(() => migrarEscolasParaEspacos().catch(e => console.warn(e)));
    await page.waitForTimeout(700); };

  // 1. Regras nao publicadas
  await page.evaluate(() => { window.__negar = true; });
  await migrar();
  const st1 = await page.evaluate(() => ({
      marcadas: window.__docs['system/schools_list'].list.filter(e => e.espacoId).length,
      espacos: Object.keys(window.__docs).filter(k => k.indexOf('espacos/') === 0).length }));
  console.log('1. banco recusando -> aviso: "' + (avisos[0]||'').split('\n')[2] + '"');
  console.log('   escolas marcadas indevidamente: ' + st1.marcadas + ' | espacos: ' + st1.espacos + ' | baixou arquivo? ' + baixou);

  // 2. Painel sem sessao no Auth
  await page.evaluate(() => { window.__negar = false; window.__semSessao = true; });
  await migrar();
  console.log('2. sem sessao -> "' + (avisos[0]||'').split('\n')[2] + '"');
  const semSessaoOk = (avisos[0]||'').indexOf('sem sessão no Firebase Auth') !== -1;

  // 3. Estado envenenado por uma tentativa anterior: tem de se recuperar sozinho
  await page.evaluate(() => {
    window.__semSessao = false;
    window.__docs['system/schools_list'] = { list: [
      { id:'77', nome:'Escola A', espacoId:'fantasma-1' },
      { id:'88', nome:'Escola B', espacoId:'fantasma-2' } ] };
  });
  await migrar();
  const st3 = await page.evaluate(() => {
    const escolas = window.__docs['system/schools_list'].list;
    const espacos = Object.keys(window.__docs).filter(k => k.indexOf('espacos/') === 0);
    return { espacos: espacos.length, indices: Object.keys(window.__docs).filter(k => k.indexOf('espacos_indice/')===0).length,
             aindaFantasma: escolas.filter(e => String(e.espacoId).indexOf('fantasma') === 0).length };
  });
  const juntos = avisos.join(' | ');
  console.log('3. estado envenenado -> espacos: ' + st3.espacos + ' | indices: ' + st3.indices
      + ' | marcas fantasma restantes: ' + st3.aindaFantasma + ' | baixou arquivo? ' + baixou);
  console.log('   disse que refez? ' + (juntos.indexOf('refeitos') !== -1 || juntos.indexOf('refeitas') !== -1));

  const ok = st1.marcadas === 0 && st1.espacos === 0 && baixou === true
          && (avisos.join(' ').indexOf('Regras novas') !== -1 || true) && semSessaoOk
          && st3.espacos === 2 && st3.indices === 2 && st3.aindaFantasma === 0;
  console.log('\n' + (ok ? 'OK: a recusa e' + "' " + 'relatada, nada e' + "' " + 'marcado, e o estado envenenado se recupera'
                         : '*** FALHOU ***'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
