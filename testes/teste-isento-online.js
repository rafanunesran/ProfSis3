// A conta que o super admin marcou como 100% ONLINE tem de abrir como sempre abriu:
// dado de estudante na nuvem, nenhum pedido de transicao. O que acontecia era o
// contrario - ela abria com cara de conta offline -, porque a marca de isencao mora
// num documento do Firestore que so' se le' COM sessao no Auth, e a leitura era feita
// na abertura da pagina, quando quem ia digitar e-mail e senha ainda nao tinha sessao.
const { chromium } = require('playwright');

const FAKE = () => {
  // Comeca SEM sessao: e' o estado de quem vai digitar e-mail e senha agora.
  window.__sessao = null;
  window.__falharAccess = false;
  window.__lidos = [];
  window.__docs = {
    'system/users_list': { list: [ { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' } ] },
    'system/schools_list': { list: [ { id: '77', nome: 'Escola A' } ] },
    'access/u1': { approved: true, role: 'professor', modoOnlineCompleto: true },
    // A nuvem desta conta tem TUDO, como e' de uma conta isenta.
    'app_data/app_data_u1': { turmas: [{ id: 9, nome: '1A' }], estudantes: [{ id: 5, nome_completo: 'Ana Silva' }] }
  };
  const ref = (col, id) => ({
    get: async () => {
      window.__lidos.push(col + '/' + id);
      if (col === 'access' && window.__falharAccess) {
        const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e;
      }
      const d = window.__docs[col + '/' + id];
      return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null };
    },
    set: async (obj) => { window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(obj)); },
    delete: async () => { delete window.__docs[col + '/' + id]; }
  });
  window.firebase = {
    initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: window.__sessao, onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) })
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

// Repete o final do login: a sessao passa a existir e o painel abre.
const ENTRAR = () => {
  window.__sessao = { uid: 'u1', email: 'p@e.com' };
  currentUser = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
  localStorage.setItem('app_current_user', JSON.stringify(currentUser));
  return iniciarApp();
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  await p.addInitScript(FAKE);
  const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // 0. Na abertura, sem sessao, nao havia como saber da isencao. Esse e' o ponto de
  //    partida do defeito - e nao um problema em si.
  const antes = await p.evaluate(() => ({ isento: !!window.usuarioOnlineCompleto }));

  // 1. Login: a isencao e' relida e a conta se comporta como conta online
  await p.evaluate(ENTRAR);
  await p.waitForTimeout(1200);
  const r1 = await p.evaluate(() => ({
    isento: !!window.usuarioOnlineCompleto,
    estado: estadoCorte(),
    podeEnviar: podeEnviarDadoPessoal(),
    modal: !!document.getElementById('modalAvisoCorte'),
    bannerLocal: !!document.getElementById('bannerSemDadosLocais'),
    estudantes: (data.estudantes || []).length,
    turmas: (data.turmas || []).length
  }));
  console.log('1. depois do login -> isenta: ' + r1.isento + ' | estado: ' + r1.estado
    + ' | manda dado pessoal? ' + r1.podeEnviar + ' | pede transicao? ' + r1.modal
    + ' | estudantes na tela: ' + r1.estudantes);

  // 2. O que o professor salva continua indo INTEIRO para a nuvem
  await p.evaluate(async () => {
    data.estudantes.push({ id: 6, nome_completo: 'Bruno Costa' });
    await salvarDadosUsuario(getStorageKey(currentUser), data);
  });
  await p.waitForTimeout(400);
  const r2 = await p.evaluate(() => {
    const doc = window.__docs['app_data/app_data_u1'] || {};
    return { estudantesNaNuvem: (doc.estudantes || []).length, turmasNaNuvem: (doc.turmas || []).length };
  });
  console.log('2. salvou -> estudantes na nuvem: ' + r2.estudantesNaNuvem
    + ' | turmas na nuvem: ' + r2.turmasNaNuvem);

  // 3. Rede ruim na abertura seguinte nao pode rebaixar a conta: a ultima resposta
  //    conhecida deste aparelho vale enquanto o banco nao responde.
  const r3 = await p.evaluate(async () => {
    window.__falharAccess = true;
    await carregarIsencaoOnline();
    return { isento: !!window.usuarioOnlineCompleto, estado: estadoCorte(), podeEnviar: podeEnviarDadoPessoal() };
  });
  console.log('3. leitura do access falhou -> isenta: ' + r3.isento + ' | estado: ' + r3.estado);

  // 4. Tirar a isencao de verdade continua funcionando: o aparelho obedece a nuvem
  const r4 = await p.evaluate(async () => {
    window.__falharAccess = false;
    window.__docs['access/u1'].modoOnlineCompleto = false;
    await carregarIsencaoOnline();
    const depoisDaLeitura = !!window.usuarioOnlineCompleto;
    window.__falharAccess = true;          // e a lembranca tambem foi atualizada
    await carregarIsencaoOnline();
    return { depoisDaLeitura: depoisDaLeitura, lembrada: !!window.usuarioOnlineCompleto };
  });
  console.log('4. isencao retirada -> isenta: ' + r4.depoisDaLeitura
    + ' | e com o banco fora do ar: ' + r4.lembrada);

  // 5. Aparelho que JA tinha migrado antes de a conta virar isenta: a nuvem ficou sem
  //    os estudantes e so' este aparelho os tem. A conta isenta nao pode abrir vazia.
  const r5 = await p.evaluate(async () => {
    window.__falharAccess = false;
    window.__docs['access/u1'].modoOnlineCompleto = true;
    await carregarIsencaoOnline();
    window.dadosMigradosLocalmente = true;
    await localSet('app_data_u1', { estudantes: [{ id: 5, nome_completo: 'Ana Silva' }, { id: 6, nome_completo: 'Bruno Costa' }] });
    window.__docs['app_data/app_data_u1'] = { turmas: [{ id: 9, nome: '1A' }] };   // como fica depois da transicao
    const ok = await carregarDadosUsuario();
    return { carregou: ok, estudantes: (data.estudantes || []).length, turmas: (data.turmas || []).length };
  });
  console.log('5. aparelho que ja migrara -> estudantes na tela: ' + r5.estudantes
    + ' | turmas: ' + r5.turmas);

  // 6. E no proximo salvamento a conta volta inteira para a nuvem, sozinha
  const r6 = await p.evaluate(async () => {
    await salvarDadosUsuario(getStorageKey(currentUser), data);
    const doc = window.__docs['app_data/app_data_u1'] || {};
    return { estudantesNaNuvem: (doc.estudantes || []).length };
  });
  console.log('6. salvou de novo -> estudantes de volta na nuvem: ' + r6.estudantesNaNuvem);

  const ok = antes.isento === false
          && r1.isento === true && r1.estado === 'migrado_isento' && r1.podeEnviar === true
          && r1.modal === false && r1.bannerLocal === false
          && r1.estudantes === 1 && r1.turmas === 1
          && r2.estudantesNaNuvem === 2 && r2.turmasNaNuvem === 1
          && r3.isento === true && r3.estado === 'migrado_isento' && r3.podeEnviar === true
          && r4.depoisDaLeitura === false && r4.lembrada === false
          && r5.carregou === true && r5.estudantes === 2 && r5.turmas === 1
          && r6.estudantesNaNuvem === 2;
  console.log('\n' + (ok ? 'OK: a conta 100% online abre online, e nada lhe pede transicao'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
