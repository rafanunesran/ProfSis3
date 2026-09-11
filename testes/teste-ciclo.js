// Ciclo completo do arquivo de seguranca: baixar -> aparelho sem dados -> restaurar.
// A leitura final e' feita no IndexedDB de proposito: importarArquivoProfsis() termina
// em location.reload(), entao ler a variavel `data` mediria a pagina errada. O que
// importa e' o que ficou GRAVADO.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const dl = path.join(require('os').tmpdir(), 'profsis-testes-baixados');
fs.rmSync(dl, {recursive:true, force:true}); fs.mkdirSync(dl, {recursive:true});

const FAKE_FB = () => {
  window.firebase = { initializeApp:()=>{}, analytics:()=>{}, auth:()=>({currentUser:null,onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0)}),
    firestore: () => ({ collection:()=>({ doc:()=>({ get:async()=>({exists:false,data:()=>null}), set:async()=>{}, delete:async()=>{} }) }) }) };
  window.firebase.firestore.FieldValue={serverTimestamp:()=>null};
};

async function lerGravado(page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(600);
  return await page.evaluate(async () => {
    const d = (await localGet('app_data_u1')) || {};
    return { turmas:(d.turmas||[]).length, estudantes:(d.estudantes||[]).length,
             ocorrencias:(d.ocorrencias||[]).length };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('dialog', async d => await d.accept());
  await page.addInitScript(FAKE_FB);
  await page.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2200);

  // --- 1. Professor com dados, baixa a copia de seguranca ---
  await page.evaluate(() => {
    currentUser = { id:1, uid:'u1', nome:'Maria Souza', email:'m@e.com', role:'professor', schoolId:'77' };
    data = Object.assign(getInitialData(), {
      turmas:[{id:1,nome:'1A'},{id:2,nome:'2B'}],
      estudantes:[{id:7,nome_completo:'Ana'},{id:8,nome_completo:'Bruno'},{id:9,nome_completo:'Caio'}],
      ocorrencias:[{id:3,relato:'x',ids_estudantes:[7]}] });
  });
  const [download] = await Promise.all([ page.waitForEvent('download'),
                                         page.evaluate(() => exportarArquivoProfsis()) ]);
  const arq = path.join(dl, download.suggestedFilename());
  await download.saveAs(arq);
  console.log('1. arquivo baixado: ' + download.suggestedFilename());

  // --- 2. Aparelho novo: so' a camada nuvem, sem estudantes ---
  await page.evaluate(() => {
    data = Object.assign(getInitialData(), { turmas:[{id:1,nome:'1A'},{id:2,nome:'2B'}] });
    window.dadosMigradosLocalmente = true;   // conta ja migrada
    window.bloquearEscritaNuvem = false;
  });
  const precisa = await page.evaluate(() => precisaRestaurarNesteAparelho());
  await page.evaluate(() => mostrarBannerSemDadosLocais());
  const temBanner = await page.isVisible('#bannerSemDadosLocais');
  const textoBotao = await page.textContent('#bannerSemDadosLocais button');
  console.log('2. detectou aparelho sem dados? ' + precisa + ' | faixa visivel: ' + temBanner + ' | botao: "' + textoBotao.trim() + '"');

  // --- 3. Restaurar pelo botao da faixa, com o arquivo .profsis ---
  const [chooser] = await Promise.all([ page.waitForEvent('filechooser'),
                                        page.click('#bannerSemDadosLocais button') ]);
  console.log('3. o seletor aceita: ' + await page.evaluate(() => document.getElementById('inputArquivoProfsis').accept));
  await Promise.all([ page.waitForEvent('load'), chooser.setFiles(arq) ]);
  const r = await lerGravado(page);
  console.log('4. gravado depois de restaurar -> turmas: ' + r.turmas + ' | estudantes: ' + r.estudantes + ' | ocorrencias: ' + r.ocorrencias);
  const ok1 = (r.estudantes===3 && r.turmas===2 && r.ocorrencias===1);
  console.log('   ' + (ok1 ? 'CICLO COMPLETO: o arquivo .profsis tem volta' : '*** FALHOU ***'));

  // --- 5. O MESMO botao tem de aceitar o backup .json antigo (data cru, sem embrulho) ---
  const antigo = path.join(dl, 'backup-antigo.json');
  fs.writeFileSync(antigo, JSON.stringify({
      turmas:[{id:5,nome:'3C'}],
      estudantes:[{id:1,nome_completo:'Dora'},{id:2,nome_completo:'Elias'}],
      ocorrencias:[] }));
  await page.evaluate(() => {
    currentUser = { id:1, uid:'u1', nome:'Maria Souza', email:'m@e.com', role:'professor', schoolId:'77' };
    window.dadosCarregados = true;
  });
  const [chooser2] = await Promise.all([ page.waitForEvent('filechooser'),
                                         page.evaluate(() => abrirSeletorArquivoProfsis()) ]);
  await Promise.all([ page.waitForEvent('load'), chooser2.setFiles(antigo) ]);
  const r2 = await lerGravado(page);
  console.log('5. formato antigo (.json cru) -> turmas: ' + r2.turmas + ' | estudantes: ' + r2.estudantes);
  const ok2 = (r2.turmas===1 && r2.estudantes===2);
  console.log('   ' + (ok2 ? 'o mesmo botao aceita os dois formatos' : '*** FALHOU ***'));

  await browser.close();
  process.exit(ok1 && ok2 ? 0 : 1);
})();
