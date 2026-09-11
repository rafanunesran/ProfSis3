// O modo local foi cancelado: nada de modal bloqueante nem migracao forcada. E a
// ordem de gravacao passa a proteger a unica copia que existe na nuvem.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  window.__recusarCifrado = false;
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => {
      if (window.__recusarCifrado && String(id).indexOf('pessoal_') === 0) {
        const e = new Error('Missing or insufficient permissions.'); e.code='permission-denied'; throw e; }
      window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};
const U = { id:1, uid:'u1', nome:'Maria', email:'m@e.com', role:'professor', schoolId:'77' };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // 1. O ritual da transicao sumiu do codigo
  const r1 = await p.evaluate(() => ({
    migrar: typeof migrarParaLocal,
    popup: typeof verificarAvisoCorte,
    vigilancia: typeof iniciarVigilanciaCorte,
    aviso: typeof aplicarRegraDoCorte,
    importar: typeof abrirSeletorArquivoProfsis,
    exportar: typeof exportarArquivoProfsis }));
  console.log('1. ritual -> migrarParaLocal: ' + r1.migrar + ' | pop-up 2x/dia: ' + r1.popup
    + ' | vigilancia: ' + r1.vigilancia + ' || mantidos -> importar: ' + r1.importar + ' | exportar: ' + r1.exportar);

  // 2. Abertura depois do corte: aviso dispensavel, uma vez so, sem bloquear
  const r2 = await p.evaluate(async (u) => {
    currentUser = u; window.dadosMigradosLocalmente = false; window.usuarioOnlineCompleto = false;
    await aplicarRegraDoCorte();
    const caixa = document.getElementById('avisoModoOnline');
    const temBotaoFechar = !!(caixa && caixa.querySelector('button'));
    fecharAvisoModoOnline();
    await aplicarRegraDoCorte();                       // segunda abertura
    return { apareceu: !!caixa, dispensavel: temBotaoFechar,
             repetiu: !!document.getElementById('avisoModoOnline'),
             telaBloqueada: !!document.getElementById('modalAvisoCorte') };
  }, U);
  console.log('2. abertura -> aviso apareceu: ' + r2.apareceu + ' | dispensavel: ' + r2.dispensavel
    + ' | repetiu na 2a vez: ' + r2.repetiu + ' | modal bloqueante: ' + r2.telaBloqueada);

  // 3. A ORDEM: com o cifrado falhando, o documento em claro NAO pode perder o pessoal
  const r3 = await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true; window.bloquearEscritaNuvem = false;
    // conta que nunca converteu: o documento em claro AINDA tem estudantes
    window.__docs['app_data/app_data_u1'] = { turmas:[{id:1,nome:'1A'}],
                                              estudantes:[{id:7,nome_completo:'Ana Paula'}] };
    await desbloquearChaveBackup('u1', 'senha');
    await carregarDadosUsuario();
    const detectou = window.nuvemTemPessoalEmClaro;

    window.__recusarCifrado = true;                    // o banco recusa o pacote cifrado
    await salvarDadosUsuario('app_data_u1', Object.assign(getInitialData(), { turmas:[{id:1,nome:'1A'}] }));
    const doc = window.__docs['app_data/app_data_u1'];
    return { detectou: detectou, aindaTemEstudantes: (doc.estudantes||[]).length,
             criouCifradoVazio: !!window.__docs['app_data/pessoal_app_data_u1'] };
  }, U);
  console.log('3. cifrado recusado -> detectou pessoal em claro: ' + r3.detectou
    + ' | estudantes preservados no documento: ' + r3.aindaTemEstudantes
    + ' | criou pacote cifrado pela metade: ' + r3.criouCifradoVazio);

  // 4. Com o banco aceitando, a conversao acontece e o claro perde o pessoal
  const r4 = await p.evaluate(async () => {
    window.__recusarCifrado = false;
    await salvarDadosUsuario('app_data_u1', Object.assign(getInitialData(), {
      turmas:[{id:1,nome:'1A'}], estudantes:[{id:7,nome_completo:'Ana Paula'}] }));
    const claro = JSON.stringify(window.__docs['app_data/app_data_u1']);
    const cifrado = JSON.stringify(window.__docs['app_data/pessoal_app_data_u1'] || {});
    return { claroTemNome: claro.indexOf('Ana Paula') !== -1,
             cifradoExiste: !!window.__docs['app_data/pessoal_app_data_u1'],
             cifradoTemNome: cifrado.indexOf('Ana Paula') !== -1 };
  });
  console.log('4. banco aceitando -> nome no documento em claro: ' + r4.claroTemNome
    + ' | pacote cifrado existe: ' + r4.cifradoExiste + ' | da para ler nele: ' + r4.cifradoTemNome);

  // 5. Backup antigo em texto claro e' CIFRADO, nao apagado
  const r5 = await p.evaluate(async () => {
    window.__docs['app_data/backup_u1_slot_1'] = { turmas:[], estudantes:[{id:1,nome_completo:'Bruno'}] };
    window.__docs['app_data/backup_index_u1'] = { slots:[{id:1,timestamp:1}], nextSlot:2 };
    const r = await converterBackupsEmClaro('u1');
    const slot = window.__docs['app_data/backup_u1_slot_1'];
    return { convertidos: r.convertidos, slotExiste: !!slot, cifrado: slot && slot.cifrado === true,
             temNome: JSON.stringify(slot||{}).indexOf('Bruno') !== -1,
             indiceIntacto: !!window.__docs['app_data/backup_index_u1'] };
  });
  console.log('5. backup em claro -> convertidos: ' + r5.convertidos + ' | slot continua no banco: '
    + r5.slotExiste + ' | agora cifrado: ' + r5.cifrado + ' | da para ler o nome: ' + r5.temNome
    + ' | indice intacto: ' + r5.indiceIntacto);

  const ok = r1.migrar==='undefined' && r1.popup==='undefined' && r1.vigilancia==='undefined'
          && r1.importar==='function' && r1.exportar==='function'
          && r2.apareceu && r2.dispensavel && !r2.repetiu && !r2.telaBloqueada
          && r3.detectou===true && r3.aindaTemEstudantes===1
          && !r4.claroTemNome && r4.cifradoExiste && !r4.cifradoTemNome
          && r5.convertidos===1 && r5.slotExiste && r5.cifrado && !r5.temNome && r5.indiceIntacto;
  console.log('\n' + (ok ? 'OK: tudo online, sem ritual, e nada de estudante sai do banco sem a copia cifrada'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
