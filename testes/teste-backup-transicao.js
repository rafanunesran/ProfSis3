// Um professor saiu da transicao sem backup NENHUM. Nao foi um acidente: o passo 7
// apaga todo o historico em texto claro (e' o que a Secretaria manda tirar da nuvem),
// e o historico cifrado que deveria substitui-lo so' comeca quando a chave de cifra
// esta' no aparelho - o que o login por sessao restaurada nao faz. Entre uma coisa e
// outra, a conta ficava sem rede de protecao por tempo indefinido, em silencio.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__sessao = { uid: 'u1', email: 'p@e.com' };
  window.__docs = {
    'system/users_list': { list: [ { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' } ] },
    'system/schools_list': { list: [ { id: '77', nome: 'Escola A' } ] },
    'system/config_sistema': {},
    'app_data/app_data_u1': { turmas: [{ id: 9, nome: '1A' }], estudantes: [{ id: 5, nome_completo: 'Ana Silva' }] },
    // O historico em texto claro de antes da adequacao, com uma continuacao antiga.
    'app_data/backup_index_u1': { slots: [ { id: 1, timestamp: Date.now() - 86400000, dateStr: '2026-09-06', label: 'Backup Diario', partes: 2 } ], nextSlot: 2 },
    'app_data/backup_u1_slot_1': { turmas: [{ id: 9 }], estudantes: [{ id: 5, nome_completo: 'Ana Silva' }] },
    'app_data/backup_u1_slot_1_p2': { cifrado: true, parte: 2, ct: 'sobra-antiga' }
  };
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
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

const ENTRAR = () => {
  currentUser = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
  localStorage.setItem('app_current_user', JSON.stringify(currentUser));
  window.dadosCarregados = true;
  window.dadosMigradosLocalmente = false;
  window.usuarioOnlineCompleto = false;
  data = Object.assign(getInitialData(), { turmas: [{ id: 9, nome: '1A' }], estudantes: [{ id: 5, nome_completo: 'Ana Silva' }] });
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.evaluate(ENTRAR);

  // 1. Transicao COM a chave no aparelho: o historico e' apagado e recomeca na hora
  avisos.length = 0;
  const r1 = await p.evaluate(async () => {
    await metaSet('chaveBackup', await gerarDEK());
    await migrarParaLocal({ pularArquivo: true, silencioso: false });
    const d = window.__docs;
    // Nenhum documento de backup em texto claro pode ter sobrevivido: o slot que
    // existe agora e' o backup CIFRADO que acabou de recomecar o historico.
    const emClaro = Object.keys(d).filter(k => k.indexOf('app_data/backup_u1_slot_') === 0 && d[k].cifrado !== true);
    return {
      claroApagado: emClaro.length === 0,
      sobraApagada: !d['app_data/backup_u1_slot_1_p2'] || d['app_data/backup_u1_slot_1_p2'].ct !== 'sobra-antiga',
      temIndiceNovo: !!(d['app_data/backup_index_u1'] && (d['app_data/backup_index_u1'].slots || []).length),
      slotNovoCifrado: Object.keys(d).some(k => k.indexOf('app_data/backup_u1_slot_') === 0 && d[k].cifrado === true),
      migrou: !!window.dadosMigradosLocalmente
    };
  });
  const aviso1 = avisos.join(' | ');
  console.log('1. transicao com chave -> historico antigo apagado: ' + r1.claroApagado
    + ' | sobra `_p2` apagada: ' + r1.sobraApagada
    + ' | historico cifrado recomecou: ' + (r1.temIndiceNovo && r1.slotNovoCifrado));
  console.log('   avisa que o historico recomecou cifrado? ' + (aviso1.indexOf('recomeçado agora, CIFRADO') !== -1));

  // 2. Transicao SEM a chave: o professor tem de ser AVISADO, nao descobrir sozinho
  await p.evaluate(ENTRAR);
  avisos.length = 0;
  const r2 = await p.evaluate(async () => {
    window.__docs['app_data/backup_index_u1'] = { slots: [{ id: 1, timestamp: Date.now(), dateStr: '2026-09-06', label: 'x' }], nextSlot: 2 };
    window.__docs['app_data/backup_u1_slot_1'] = { estudantes: [{ id: 5, nome_completo: 'Ana Silva' }] };
    await metaSet('chaveBackup', null);
    await metaSet('migracaoV2', null);
    window.dadosMigradosLocalmente = false;
    await migrarParaLocal({ pularArquivo: true, silencioso: false });
    return { claroApagado: !window.__docs['app_data/backup_u1_slot_1'] };
  });
  const aviso2 = avisos.join(' | ');
  const avisou = aviso2.indexOf('NÃO pôde ser criado agora') !== -1
              && aviso2.indexOf('Saia e entre de novo') !== -1;
  console.log('2. transicao sem chave -> historico antigo apagado: ' + r2.claroApagado
    + ' | avisa o professor em vez de silenciar: ' + avisou);

  // 3. E o backup diario parado passa a aparecer na tela, com como consertar
  const r3 = await p.evaluate(async () => {
    await metaSet('chaveBackup', null);
    const b = document.getElementById('bannerBackupSemChave');
    if (b) b.remove();
    await verificarBackupAutomatico();
    const faixa = document.getElementById('bannerBackupSemChave');
    return {
      faixa: !!faixa,
      temBotao: faixa ? faixa.innerHTML.indexOf('Liberar meus backups') !== -1 : false,
      temLiberar: typeof liberarChaveBackup === 'function'
    };
  });
  console.log('3. backup parado -> faixa na tela: ' + r3.faixa + ' | botao para liberar: ' + r3.temBotao);

  // 4. Varredura forcada do super admin. E' o caso do professor que chegou ate' aqui:
  //    o historico inteiro foi apagado pela transicao e o painel dizia so' "nenhum
  //    backup encontrado", como se o trabalho dele tivesse sumido junto.
  const r4 = await p.evaluate(async () => {
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const rel = await varreduraForcadaBackups(user);
    const v = _vereditoVarredura(rel);
    return {
      lidos: rel.documentosLidos,
      achouVivo: rel.achados.some(a => a.tipo === 'vivo' && a.chave === 'app_data_u1'),
      titulo: v.titulo,
      mandaParaOAparelho: v.texto.indexOf('.profsis') !== -1 && v.texto.indexOf('não foram perdidos') !== -1,
      semChave: rel.chaves && rel.chaves.existe === false
    };
  });
  console.log('4. varredura forcada -> ' + r4.lidos + ' documentos lidos | achou o documento vivo: '
    + r4.achouVivo + ' | veredito: "' + r4.titulo + '"');
  console.log('   diz para onde mandar o professor: ' + r4.mandaParaOAparelho
    + ' | denuncia a conta sem chave de backup: ' + r4.semChave);

  // 5. E quando sobra rastro do historico, o veredito nomeia a causa em vez de
  //    deixar o responsavel achar que o banco perdeu os dados sozinho.
  const r5 = await p.evaluate(async () => {
    window.__docs['app_data/backup_u1_slot_7_p2'] = { cifrado: true, parte: 2, ct: 'resto' };
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const v = _vereditoVarredura(await varreduraForcadaBackups(user));
    return { titulo: v.titulo, culpaATransicao: v.texto.indexOf('passo 7 da transição') !== -1 };
  });
  console.log('5. com rastro do historico -> veredito: "' + r5.titulo
    + '" | nomeia a causa: ' + r5.culpaATransicao);

  const ok = r1.claroApagado && r1.sobraApagada && r1.temIndiceNovo && r1.slotNovoCifrado && r1.migrou
          && aviso1.indexOf('recomeçado agora, CIFRADO') !== -1
          && r2.claroApagado && avisou
          && r3.faixa && r3.temBotao && r3.temLiberar
          && r4.achouVivo && r4.mandaParaOAparelho && r4.semChave
          && r4.titulo.indexOf('não tem backup desta conta') !== -1
          && r5.titulo.indexOf('apagados pela transição') !== -1 && r5.culpaATransicao;
  console.log('\n' + (ok ? 'OK: a transicao nao deixa mais a conta sem historico, e o que sobrou se acha'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
