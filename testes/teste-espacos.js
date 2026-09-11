// Fase 3 — cadastro por codigo de convite, ponta a ponta no navegador.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};                       // "banco" em memoria: colecao/id -> objeto
  window.__contas = [];
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id];
                       return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (obj) => { window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(obj)); },
    delete: async () => { delete window.__docs[col + '/' + id]; }
  });
  window.firebase = {
    initializeApp: () => {}, analytics: () => {},
    auth: () => ({
      currentUser: null,
      onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0),
      signOut: async () => {},
      createUserWithEmailAndPassword: async (email) => {
        if (window.__contas.indexOf(email) !== -1) { const e = new Error('ja existe'); e.code='auth/email-already-in-use'; throw e; }
        window.__contas.push(email);
        return { user: { uid: 'uid-' + window.__contas.length, email: email } };
      }
    }),
    firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) })
  };
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

  const preencher = async (nome, email, codigo, escola) => {
    await page.evaluate(async () => { await renderCadastro(); });
    await page.fill('#cadNome', nome);
    await page.fill('#cadEmail', email);
    await page.fill('#cadSenha', 'senha123');
    await page.check('#cadAceiteTermos');
    if (escola) { await page.click('#linkCriarEspaco'); await page.fill('#cadEscolaNome', escola); }
    else { await page.fill('#cadCodigo', codigo); }
    await page.evaluate(() => fazerCadastro({ preventDefault: () => {} }));
    await page.waitForTimeout(500);
  };

  // 1. Codigo errado nao pode deixar conta orfa no Auth
  avisos.length = 0;
  await preencher('Ze Errado', 'errado@e.com', 'ZZZZ-ZZZZ-ZZZZ', null);
  const contas1 = await page.evaluate(() => window.__contas.length);
  console.log('1. codigo errado -> aviso: "' + (avisos[0] || '').split('\n')[0] + '" | contas criadas: ' + contas1);

  // 2. Criar espaco: quem cria vira gestor e recebe o codigo
  avisos.length = 0;
  await preencher('Ana Gestora', 'ana@e.com', null, 'E.E. Teste da Fase 3');
  const codigo = (avisos.join(' ').match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0];
  const st2 = await page.evaluate((codigo) => {
    const chaves = Object.keys(window.__docs);
    const u = (window.__docs['system/users_list'].list || []).slice(-1)[0];
    const espacoKey = chaves.find(k => k.indexOf('espacos/') === 0);
    const esp = window.__docs[espacoKey];
    return { espacos: chaves.filter(k => k.indexOf('espacos/') === 0).length,
             indices: chaves.filter(k => k.indexOf('espacos_indice/') === 0).length,
             role: u.role, approved: u.approved, temEspacoNoPerfil: !!u.espacoId,
             chaveDeDocumento: u.schoolId === u.espacoId, nomeEspaco: esp.nome,
             codigoNoBanco: JSON.stringify(window.__docs).indexOf(codigo && codigo.replace(/-/g,'')) };
  }, codigo);
  console.log('2. criou espaco -> codigo: ' + codigo + ' | espacos: ' + st2.espacos + ' | indices: ' + st2.indices
    + ' | papel: ' + st2.role + ' | liberado: ' + st2.approved + ' | espaco no perfil: ' + st2.temEspacoNoPerfil);
  console.log('   o codigo esta gravado em algum documento do banco? ' + (st2.codigoNoBanco !== -1));

  // 3. Colega entra com o codigo (digitado torto de proposito)
  avisos.length = 0;
  const torto = ' ' + codigo.toLowerCase().replace(/-/g, ' ') + ' ';
  await preencher('Beto Professor', 'beto@e.com', torto, null);
  const st3 = await page.evaluate(() => {
    const users = window.__docs['system/users_list'].list;
    const u = users[users.length - 1];
    const acesso = window.__docs['access/' + u.uid];
    return { email: u.email, role: u.role, approved: u.approved, espacoId: u.espacoId,
             mesmaChave: u.schoolId === u.legacySchoolId,
             acessoLiberado: acesso && acesso.approved === true, acessoEspaco: acesso && acesso.espacoId,
             fila: usuarioAguardandoAprovacao(u) };
  });
  console.log('3. entrou com codigo torto ("' + torto.trim() + '") -> ' + st3.email + ' | papel: ' + st3.role
    + ' | liberado: ' + st3.approved + ' | cai na fila? ' + st3.fila);
  console.log('   access/<uid> liberado: ' + st3.acessoLiberado + ' | mesmo espaco do perfil: ' + (st3.acessoEspaco === st3.espacoId));

  // 4. Timbre dos documentos sai do espaco
  const st4 = await page.evaluate(async () => {
    const users = window.__docs['system/users_list'].list;
    currentUser = users[users.length - 1];
    const escola = await resolverEscolaAtual();
    return { nome: escola && escola.nome, idLegado: escola && escola.id };
  });
  console.log('4. resolverEscolaAtual -> "' + st4.nome + '" (chave de documento: ' + st4.idLegado + ')');

  // 5. Usuario ANTIGO, sem espaco: nada pode mudar para ele
  const st5 = await page.evaluate(async () => {
    window.__docs['system/schools_list'] = { list: [{ id: '77', nome: 'Escola Legado', logoEscola: '' }] };
    currentUser = { id: 9, uid: 'u-antigo', nome: 'Velho', email: 'v@e.com', role: 'professor', schoolId: '77' };
    const escola = await resolverEscolaAtual();
    const ref = resolverEspaco(currentUser);
    return { nome: escola && escola.nome, chave: getStorageKey(currentUser),
             fila: usuarioAguardandoAprovacao(currentUser), legacy: ref.legacySchoolId };
  });
  console.log('5. conta antiga sem espaco -> escola: "' + st5.nome + '" | chave: ' + st5.chave
    + ' | cai na fila? ' + st5.fila + ' | id de documento: ' + st5.legacy);

  // 6. Perfil PENDENTE de antes continua na fila (nao pode ser esquecido)
  const st6 = await page.evaluate(() => usuarioAguardandoAprovacao(
      { id: 3, role: 'professor', approved: false, schoolId: '77' }));
  console.log('6. perfil pendente antigo continua na fila? ' + st6);

  const ok = contas1 === 0 && st2.espacos === 1 && st2.indices === 1 && st2.role === 'gestor'
          && st2.codigoNoBanco === -1 && st3.role === 'professor' && st3.approved === true
          && st3.fila === false && st3.acessoLiberado === true && st4.nome === 'E.E. Teste da Fase 3'
          && st5.nome === 'Escola Legado' && st5.chave === 'app_data_u-antigo' && st5.fila === false
          && st6 === true;
  console.log('\n' + (ok ? 'FASE 3 OK: codigo e o portao, e ninguem que ja usa foi mexido' : '*** FALHOU ***'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
