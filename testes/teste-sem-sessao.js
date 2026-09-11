// Estar no sistema nao e' o mesmo que poder gravar: sem sessao no Firebase Auth,
// as Regras recusam TODA escrita. O sistema tem de dizer isso, nao deixar a pessoa
// descobrir por "sem permissao" no meio de uma operacao.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__semSessao = true;
  window.__docs = { 'system/schools_list': { list: [ {id:'77', nome:'Escola A'} ] } };
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (obj) => {
      if (window.__semSessao) { const e = new Error('Missing or insufficient permissions.'); e.code='permission-denied'; throw e; }
      window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(obj));
    },
    delete: async () => { delete window.__docs[col+'/'+id]; }
  });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth: () => ({ currentUser: window.__semSessao ? null : { uid:'adm', email:'rafaelnf93@gmail.com' },
                   onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut: async()=>{} }),
    firestore: () => ({ collection:(col)=>({ doc:(id)=>ref(col,String(id)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await browser.newContext()).newPage();
  const avisos = [];
  page.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  await page.addInitScript(FAKE);
  await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  // 1. Painel do super admin aberto sem sessao no Auth
  await page.evaluate(() => {
    currentUser = { id:'admin', nome:'Super Admin', email:'rafaelnf93@gmail.com', role:'super_admin' };
    iniciarAdmin();
  });
  await page.waitForTimeout(300);
  const st1 = await page.evaluate(() => {
    const b = document.getElementById('bannerSemSessao');
    return { visivel: !!b, botao: b ? b.querySelector('button').textContent.trim() : null,
             temEntrarDeNovo: typeof entrarDeNovo === 'function' };
  });
  console.log('1. painel sem sessao -> faixa: ' + st1.visivel + ' | botao: "' + st1.botao + '"');

  // 2. Uma gravacao recusada nesse estado tem de falar de SESSAO, nao de Regras
  avisos.length = 0;
  await page.evaluate(() => saveData('espacos', 'x', { nome: 'y' }));
  await page.waitForTimeout(300);
  const falaDeSessao = (avisos[0] || '').indexOf('sem sessão no Firebase') !== -1;
  const falaDeRegras = (avisos[0] || '').indexOf('Regras do Firestore permitem escrita') !== -1;
  console.log('2. gravacao recusada -> fala de sessao? ' + falaDeSessao + ' | manda conferir as Regras? ' + falaDeRegras);

  // 3. Com sessao, nenhuma faixa
  const st3 = await page.evaluate(() => {
    window.__semSessao = false;
    document.getElementById('bannerSemSessao').remove();
    iniciarAdmin();
    return { visivel: !!document.getElementById('bannerSemSessao'), precisa: precisaAvisarSemSessao() };
  });
  console.log('3. com sessao -> faixa: ' + st3.visivel + ' | precisaAvisar: ' + st3.precisa);

  // 4. Sem rede, nao ter sessao e' normal: o aviso so' atrapalharia
  const st4 = await page.evaluate(() => {
    window.__semSessao = true;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    return precisaAvisarSemSessao();
  });
  console.log('4. sem rede e sem sessao -> avisa? ' + st4 + ' (tem de ser false)');

  const ok = st1.visivel && st1.botao === 'Entrar de novo' && st1.temEntrarDeNovo
          && falaDeSessao && !falaDeRegras && !st3.visivel && st3.precisa === false && st4 === false;
  console.log('\n' + (ok ? 'OK: falta de sessao agora se anuncia' : '*** FALHOU ***'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
