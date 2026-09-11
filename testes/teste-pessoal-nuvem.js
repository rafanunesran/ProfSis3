// Fase 7: a camada pessoal sobe cifrada e volta em qualquer terminal autorizado -
// sem arquivo. E a trava que impede um pacote vazio de apagar um cheio.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};
const USUARIO = { id:1, uid:'u1', nome:'Maria', email:'m@e.com', role:'professor', schoolId:'77' };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // --- 1. Terminal A: tem a chave, grava com estudantes ---
  const r1 = await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true;          // depois da transicao
    window.usuarioOnlineCompleto = false;
    await desbloquearChaveBackup('u1', 'senha-da-conta');
    window.pessoalCifradoLido = true;               // nada na nuvem ainda
    data = Object.assign(getInitialData(), {
      turmas:[{id:1,nome:'1A'}],
      estudantes:[{id:7,nome_completo:'Ana Paula'},{id:8,nome_completo:'Bruno'}],
      ocorrencias:[{id:3,relato:'briga no patio',ids_estudantes:[7]}] });
    await salvarDadosUsuario('app_data_u1', data);
    const claro = JSON.stringify(window.__docs['app_data/app_data_u1'] || {});
    const cifrado = JSON.stringify(window.__docs['app_data/pessoal_app_data_u1'] || {});
    return { docClaroTemNome: claro.indexOf('Ana Paula') !== -1,
             existeDocCifrado: !!window.__docs['app_data/pessoal_app_data_u1'],
             cifradoTemNome: cifrado.indexOf('Ana Paula') !== -1,
             cifradoTemRelato: cifrado.indexOf('briga no patio') !== -1 };
  }, USUARIO);
  console.log('1. terminal A grava -> nome no documento em claro? ' + r1.docClaroTemNome
    + ' | doc cifrado criado: ' + r1.existeDocCifrado
    + ' | da' + "'" + ' para ler o nome nele? ' + r1.cifradoTemNome);

  // --- 2. Terminal B: navegador limpo, mesma conta, SEM arquivo ---
  const docs = await p.evaluate(() => JSON.stringify(window.__docs));
  const p2 = await (await b.newContext()).newPage();
  p2.on('dialog', async d => await d.accept());
  await p2.addInitScript(FAKE);
  await p2.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil:'domcontentloaded' });
  await p2.waitForTimeout(1800);
  const r2 = await p2.evaluate(async ([u, docsSerializados]) => {
    window.__docs = JSON.parse(docsSerializados);        // o mesmo "banco"
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true;
    // 2a. Sem a chave: tem de perceber que ha' dado cifrado e NAO gravar por cima
    await carregarDadosUsuario();
    const semChave = { avisou: window.pessoalSemChave === true,
                       podeGravar: window.pessoalCifradoLido === true,
                       estudantes: (data.estudantes||[]).length };
    // 2b. Com a senha, a chave nasce aqui e os dados voltam
    await desbloquearChaveBackup('u1', 'senha-da-conta');
    await carregarDadosUsuario();
    return { semChave: semChave,
             comChave: { estudantes: (data.estudantes||[]).length,
                         ocorrencias: (data.ocorrencias||[]).length,
                         turmas: (data.turmas||[]).length,
                         nome: (data.estudantes||[])[0] && data.estudantes[0].nome_completo } };
  }, [USUARIO, docs]);
  console.log('2a. terminal B sem a chave -> avisou: ' + r2.semChave.avisou
    + ' | envio liberado (tem de ser false): ' + r2.semChave.podeGravar
    + ' | estudantes vistos: ' + r2.semChave.estudantes);
  console.log('2b. terminal B com a senha -> estudantes: ' + r2.comChave.estudantes
    + ' | ocorrencias: ' + r2.comChave.ocorrencias + ' | turmas: ' + r2.comChave.turmas
    + ' | primeiro: "' + r2.comChave.nome + '"');

  // --- 3. A trava: sessao que nao leu a nuvem nao pode gravar por cima ---
  const r3 = await p2.evaluate(async () => {
    const antes = JSON.stringify(window.__docs['app_data/pessoal_app_data_u1']);
    window.pessoalCifradoLido = false;                   // nao sabemos o que ha' la'
    await salvarDadosUsuario('app_data_u1', Object.assign(getInitialData(), { turmas:[] }));
    const depois = JSON.stringify(window.__docs['app_data/pessoal_app_data_u1']);
    return { intacto: antes === depois };
  });
  console.log('3. sessao sem ter lido tenta gravar -> pacote cifrado intacto? ' + r3.intacto);

  const ok = !r1.docClaroTemNome && r1.existeDocCifrado && !r1.cifradoTemNome && !r1.cifradoTemRelato
          && r2.semChave.avisou && r2.semChave.podeGravar === false
          && r2.comChave.estudantes === 2 && r2.comChave.ocorrencias === 1
          && r2.comChave.turmas === 1 && r2.comChave.nome === 'Ana Paula'
          && r3.intacto;
  console.log('\n' + (ok ? 'OK: o dado pessoal viaja cifrado e volta em outro terminal, sem arquivo'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
