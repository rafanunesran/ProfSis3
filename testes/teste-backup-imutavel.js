// O BACKUP QUE NAO SOME POR CAGADA.
//
// O estrago que originou isto: uma funcao varreu 20 slots chamando delete() num
// `catch` vazio e deixou uma conta sem nenhuma copia. Aqui cobramos as duas
// protecoes que impedem a repeticao:
//   1. O CODIGO nao reescreve nem apaga backup: cada dia tem documento proprio.
//   2. As REGRAS recusam alterar ou apagar backup recente - mesmo que o codigo peca.
// A segunda e' a que vale, porque nao depende de ninguem lembrar.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  window.__negados = [];
  const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
  const ehBackup = id => /^backup_/.test(id) && !/^backup_index_/.test(id);
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (o) => {
      // Espelha a Regra publicada: backup so' e' CRIADO, nunca atualizado.
      if (ehBackup(id) && window.__docs[col + '/' + id]) {
        window.__negados.push('update ' + id);
        const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
      window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => {
      const d = window.__docs[col + '/' + id];
      if (ehBackup(id) && d) {
        const nasceu = typeof d.criadoEmMs === 'number' ? d.criadoEmMs : 0;
        if (!nasceu || Date.now() <= nasceu + TRINTA_DIAS) {
          window.__negados.push('delete ' + id);
          const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; } }
      delete window.__docs[col + '/' + id]; } });
  window.firebase = { initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: (c) => ({ doc: (i) => ref(c, String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

const U = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);

  let falhas = 0;
  const cobrar = (ok, texto) => { console.log('   ' + (ok ? 'OK' : '*** FALHOU ***') + ' ' + texto); if (!ok) falhas++; };

  // 1. O backup do dia nasce com a marca de nascimento e a data no nome.
  const r1 = await p.evaluate(async (u) => {
    currentUser = u; window.currentViewMode = 'professor';
    window.usuarioOnlineCompleto = true;          // sem cifra, para o teste ficar direto
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), { turmas: [{ id: 1 }], presencas: [{ id: 1 }, { id: 2 }] });
    await criarBackupNuvem(true);
    const ids = Object.keys(window.__docs).filter(k => k.indexOf('app_data/backup_') === 0);
    const doc = window.__docs[ids.find(k => k.indexOf('_d') > 0)] || {};
    return { ids: ids.map(k => k.replace('app_data/', '')), temMarca: typeof doc.criadoEmMs === 'number',
             presencas: (doc.presencas || []).length };
  }, U);
  console.log('1. backup do dia -> ' + JSON.stringify(r1));
  cobrar(r1.ids.some(i => /^backup_u1_d\d{4}-\d{2}-\d{2}$/.test(i)), 'o nome do documento carrega a DATA');
  cobrar(r1.temMarca, 'gravou criadoEmMs, que e o que a Regra le para recusar exclusao');
  cobrar(r1.presencas === 2, 'o conteudo foi junto');

  // 2. Rodar de novo no mesmo dia NAO reescreve o backup ja' guardado.
  const r2 = await p.evaluate(async () => {
    const antes = JSON.stringify(window.__docs);
    data.presencas = [];                          // catastrofe: dados sumiram da tela
    await criarBackupNuvem(true);
    return { intacto: antes === JSON.stringify(window.__docs), negados: window.__negados.slice() };
  });
  console.log('2. segunda tentativa no mesmo dia -> ' + JSON.stringify(r2));
  cobrar(r2.intacto, 'O BACKUP DE HOJE NAO FOI REESCRITO por um estado vazio');

  // 3. A Regra recusa apagar, mesmo que o codigo peca. E' a protecao que vale.
  const r3 = await p.evaluate(async () => {
    const id = Object.keys(window.__docs).find(k => /backup_u1_d/.test(k)).replace('app_data/', '');
    let erro = null;
    try { await db.collection('app_data').doc(id).delete(); } catch (e) { erro = e.code; }
    return { erro: erro, aindaExiste: !!window.__docs['app_data/' + id], negados: window.__negados.slice() };
  });
  console.log('3. delete direto no backup -> ' + JSON.stringify(r3));
  cobrar(r3.erro === 'permission-denied' && r3.aindaExiste,
         'O BANCO RECUSA apagar backup recente - nem um laco distraido consegue');

  // 4. O laco do estrago original, rodando inteiro contra o banco novo.
  const r4 = await p.evaluate(async () => {
    const antes = Object.keys(window.__docs).filter(k => /backup_/.test(k)).length;
    for (let i = 1; i <= 20; i++) {
      try { await db.collection('app_data').doc('backup_u1_slot_' + i).delete(); } catch (e) {}
    }
    const id = Object.keys(window.__docs).find(k => /backup_u1_d/.test(k));
    try { await db.collection('app_data').doc(id.replace('app_data/', '')).delete(); } catch (e) {}
    return { antes: antes, depois: Object.keys(window.__docs).filter(k => /backup_/.test(k)).length };
  });
  console.log('4. o laco de _apagarBackupsEmClaro() -> ' + JSON.stringify(r4));
  cobrar(r4.antes === r4.depois, 'o laco que apagou 20 slots numa conta real nao apaga mais nada');

  // 5. Backup velho PODE sair: retencao continua possivel, so' nao em cima da hora.
  const r5 = await p.evaluate(async () => {
    window.__docs['app_data/backup_u1_d2020-01-01'] = { criadoEmMs: Date.now() - 400 * 86400000, turmas: [] };
    let erro = null;
    try { await db.collection('app_data').doc('backup_u1_d2020-01-01').delete(); } catch (e) { erro = e.code; }
    return { erro: erro, saiu: !window.__docs['app_data/backup_u1_d2020-01-01'] };
  });
  console.log('5. backup de 400 dias -> ' + JSON.stringify(r5));
  cobrar(r5.saiu && !r5.erro, 'depois de 30 dias a limpeza volta a ser possivel');

  await b.close();
  console.log(falhas ? ('\n*** ' + falhas + ' falha(s) ***') : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
