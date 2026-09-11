// O botao "Importar" tem de existir para TODOS os perfis - o professor era o unico
// que nao tinha nenhuma porta de entrada para o arquivo que ele mesmo baixou.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const dl = path.join(require('os').tmpdir(), 'profsis-testes-baixados');
fs.rmSync(dl, {recursive:true, force:true}); fs.mkdirSync(dl, {recursive:true});

const FAKE = () => {
  window.__docs = {};
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (obj) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(obj)); },
    delete: async () => { delete window.__docs[col+'/'+id]; }
  });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth: () => ({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut: async()=>{} }),
    firestore: () => ({ collection:(col)=>({ doc:(id)=>ref(col,String(id)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

const PROF = { id:1, uid:'u1', nome:'Maria Souza', email:'m@e.com', role:'professor', schoolId:'77' };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const avisos = []; let recarregou = false;
  page.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  page.on('framenavigated', f => { if (f === page.mainFrame()) recarregou = true; });
  await page.addInitScript(FAKE);
  await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  // --- 1. O botao existe nos tres perfis e no modal de perfil ---
  const achou = await page.evaluate(async () => {
    const r = {};
    currentUser = { id:1, uid:'u1', nome:'M', email:'m@e.com', role:'professor', schoolId:'77' };
    data = Object.assign(getInitialData(), { turmas:[{id:1,nome:'1A'}] });
    window.dadosCarregados = true;
    for (const modo of ['professor', 'aee', 'gestor']) {
      currentViewMode = modo;
      try { await renderDashboard(); } catch (e) {}
      r[modo] = (document.getElementById('dashboard') || document.body).innerHTML
                  .indexOf('Importar dados do arquivo') !== -1;
    }
    currentViewMode = 'professor';
    await abrirModalPerfil();
    r.perfil = document.body.innerHTML.indexOf('Importar dados do arquivo') !== -1;
    document.querySelectorAll('.modal, .modal-overlay').forEach(m => m.remove());
    // e a faixa vermelha de falha de leitura
    mostrarBannerLeituraFalhou();
    r.faixaVermelha = document.getElementById('bannerLeituraFalhou').innerHTML
                        .indexOf('Importar dados do arquivo') !== -1;
    document.getElementById('bannerLeituraFalhou').remove();
    return r;
  });
  console.log('1. botao presente -> professor: ' + achou.professor + ' | aee: ' + achou.aee
    + ' | gestor: ' + achou.gestor + ' | modal de perfil: ' + achou.perfil
    + ' | faixa de falha: ' + achou.faixaVermelha);

  // --- 2. Importar sem conta aberta: explica, e NAO recarrega ---
  const arqSoTutorados = path.join(dl, 'so-tutorados.profsis');
  fs.writeFileSync(arqSoTutorados, JSON.stringify({ formato:'profsis', versao:1,
      dados: { tutorados:[{id:1,nome_estudante:'Ana'},{id:2,nome_estudante:'Bia'}] } }));
  await page.evaluate(() => { currentUser = null; });
  avisos.length = 0; recarregou = false;
  let [ch] = await Promise.all([ page.waitForEvent('filechooser'), page.evaluate(() => abrirSeletorArquivoProfsis()) ]);
  await ch.setFiles(arqSoTutorados);
  await page.waitForTimeout(700);
  console.log('2. sem conta aberta -> "' + (avisos[0]||'').split('\n')[0] + '" | recarregou? ' + recarregou);
  const pediuLogin = (avisos[0]||'').indexOf('Entre na sua conta') !== -1;

  // --- 3. Arquivo so' com tutorados (professor de AEE) e' aceito e confirmado ---
  await page.evaluate((u) => { currentUser = u; window.dadosCarregados = true; }, PROF);
  avisos.length = 0;
  [ch] = await Promise.all([ page.waitForEvent('filechooser'), page.evaluate(() => abrirSeletorArquivoProfsis()) ]);
  await Promise.all([ page.waitForEvent('load'), ch.setFiles(arqSoTutorados) ]);
  await page.waitForTimeout(600);
  const gravado = await page.evaluate(async () => {
    const d = (await localGet('app_data_u1')) || {};
    return { tutorados: (d.tutorados||[]).length };
  });
  const confirmou = avisos.join(' ').indexOf('2 tutorado(s)') !== -1;
  console.log('3. arquivo so com tutorados -> gravados: ' + gravado.tutorados
    + ' | a mensagem disse as contagens? ' + confirmou);

  // --- 4. Gravacao que nao persiste: avisa e NAO recarrega ---
  await page.evaluate((u) => { currentUser = u; window.dadosCarregados = true;
                               window.localSet = async () => {}; }, PROF);   // engole a gravacao
  const arqNormal = path.join(dl, 'normal.profsis');
  fs.writeFileSync(arqNormal, JSON.stringify({ formato:'profsis', versao:1,
      dados: { turmas:[{id:9,nome:'9Z'}], estudantes:[{id:1,nome_completo:'Zed'}] } }));
  avisos.length = 0; recarregou = false;
  [ch] = await Promise.all([ page.waitForEvent('filechooser'), page.evaluate(() => abrirSeletorArquivoProfsis()) ]);
  await ch.setFiles(arqNormal);
  await page.waitForTimeout(900);
  const avisouFalha = avisos.join(' ').indexOf('NÃO foi concluída') !== -1;
  console.log('4. gravacao engolida -> avisou a falha? ' + avisouFalha + ' | recarregou? ' + recarregou);

  const ok = achou.professor && achou.aee && achou.gestor && achou.perfil && achou.faixaVermelha
          && pediuLogin && gravado.tutorados === 2 && confirmou && avisouFalha && !recarregou;
  console.log('\n' + (ok ? 'OK: todo perfil tem por onde importar, e a importacao so se declara feita quando foi'
                         : '*** FALHOU ***'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
