// Achar o backup de um professor quando o painel diz "nenhum backup encontrado".
//
// Tres coisas que faltavam. A varredura procurava so' nos IDs que a gente CONHECE
// (uid do Auth, id do cadastro): historico gravado sob um terceiro ID - conta
// recriada no Auth, uid trocado depois de um login legado - ficava invisivel.
// O backup diario desistia em silencio quando a chave de cifra nao estava no
// aparelho, e a conta ia ficando sem historico novo sem nada na tela dizer isso.
// E o veredito prometia conteudo que a propria varredura ja' tinha lido e achado
// vazio.
//
// (As Regras dao `read` em app_data, e em Firestore `read` cobre `list`: da' para
// perguntar ao banco quais historicos existem, em vez de adivinhar o nome deles.)
const { chromium } = require('playwright');

const FAKE = () => {
  window.__sessao = { uid: 'u1', email: 'p@e.com' };
  window.__docs = {
    'system/users_list': { list: [ { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' } ] },
    'system/schools_list': { list: [ { id: '77', nome: 'Escola A' } ] },
    'system/config_sistema': {},
    // O documento VIVO da conta. E' o que o painel de backups nunca olhou.
    'app_data/app_data_u1': { turmas: [{ id: 9, nome: '1A' }], estudantes: [{ id: 5, nome_completo: 'Ana Silva' }] }
  };
  // Cada caso monta o proprio cenario: herdar o estado do caso anterior ja' fez este
  // teste afirmar coisas que nao estava exercitando.
  window.__limparBackups = () => Object.keys(window.__docs)
    .filter(k => k.indexOf('app_data/backup_') === 0)
    .forEach(k => delete window.__docs[k]);
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (obj) => { window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(obj)); },
    delete: async () => { delete window.__docs[col + '/' + id]; }
  });
  // A varredura enumera os indices por intervalo de documentId. Sem `list` no fake,
  // o teste nao provaria nada sobre a parte que encontra historico sob ID desconhecido.
  window.__listasNegadas = false;
  const consulta = (col) => {
    let de = '', ate = '\uffff';
    const q = {
      orderBy: () => q,
      startAt: (v) => { de = v; return q; },
      endAt: (v) => { ate = v; return q; },
      get: async () => {
        if (window.__listasNegadas) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        const ids = Object.keys(window.__docs)
          .filter(k => k.indexOf(col + '/') === 0)
          .map(k => k.slice(col.length + 1))
          .filter(id => id >= de && id <= ate)
          .sort();
        return { forEach: (fn) => ids.forEach(id => fn({ id: id, data: () => JSON.parse(JSON.stringify(window.__docs[col + '/' + id])) })) };
      }
    };
    return q;
  };
  window.firebase = {
    initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: window.__sessao, onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: (col) => Object.assign(consulta(col), { doc: (id) => ref(col, String(id)) }) })
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
  window.firebase.firestore.FieldPath = { documentId: () => '__name__' };
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
  await p.evaluate(() => { window.dadosMigradosLocalmente = true; });

  // 1. Backup diario parado por falta de chave: tem de aparecer na tela
  //    (era um console.warn, e a conta ia ficando sem historico novo em silencio)
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
  console.log('1. backup parado -> faixa na tela: ' + r3.faixa + ' | botao para liberar: ' + r3.temBotao);

  // 2. Varredura forcada do super admin. E' o caso do professor que chegou ate' aqui:
  //    o historico inteiro foi apagado pela transicao e o painel dizia so' "nenhum
  //    backup encontrado", como se o trabalho dele tivesse sumido junto.
  const r4 = await p.evaluate(async () => {
    window.__limparBackups();                      // conta sem historico nenhum no banco
    window.__docs['app_data/app_data_u1'] = { turmas: [{ id: 9, nome: '1A' }] };   // ja' convertida: em claro so' o nao-pessoal
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const rel = await varreduraForcadaBackups(user);
    const v = _vereditoVarredura(rel);
    return {
      lidos: rel.documentosLidos,
      achouVivo: rel.achados.some(a => a.tipo === 'vivo' && a.chave === 'app_data_u1'),
      titulo: v.titulo,
      mandaParaOAparelho: v.texto.indexOf('.profsis') !== -1 && v.texto.indexOf('perdeu o trabalho') !== -1,
      semChave: rel.chaves && rel.chaves.existe === false
    };
  });
  console.log('2. varredura forcada -> ' + r4.lidos + ' documentos lidos | achou o documento vivo: '
    + r4.achouVivo + ' | veredito: "' + r4.titulo + '"');
  console.log('   diz para onde mandar o professor: ' + r4.mandaParaOAparelho
    + ' | denuncia a conta sem chave de backup: ' + r4.semChave);

  // 3. E quando sobra rastro do historico, o veredito nomeia a causa em vez de
  //    deixar o responsavel achar que o banco perdeu os dados sozinho.
  const r5 = await p.evaluate(async () => {
    window.__limparBackups();
    window.__docs['app_data/app_data_u1'] = { turmas: [{ id: 9, nome: '1A' }] };   // ja' convertida: em claro so' o nao-pessoal
    // A continuacao sobreviveu; o documento principal, nao. E' o rastro classico de
    // um historico que foi apagado.
    window.__docs['app_data/backup_u1_slot_7_p2'] = { cifrado: true, parte: 2, ct: 'resto' };
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const v = _vereditoVarredura(await varreduraForcadaBackups(user));
    return { titulo: v.titulo, culpaATransicao: v.texto.indexOf('APAGADO ali') !== -1 && v.texto.indexOf('não tem lixeira') !== -1 };
  });
  console.log('3. com rastro do historico -> veredito: "' + r5.titulo
    + '" | nomeia a causa: ' + r5.culpaATransicao);

  // 4. O caso que a varredura por adivinhacao nao pegava: o historico existe, mas
  //    sob um ID que nao esta' em cadastro nenhum. Adivinhar uid/id nunca chegaria
  //    la'; perguntar ao banco chega.
  const r6 = await p.evaluate(async () => {
    window.__limparBackups();
    window.__docs['app_data/backup_index_uid-antigo-9z'] = {
      slots: [{ id: 3, timestamp: Date.parse('2026-09-01T12:00:00Z'), dateStr: '2026-09-01', label: 'Backup Diario' }], nextSlot: 4 };
    window.__docs['app_data/backup_uid-antigo-9z_slot_3'] = {
      turmas: [{ id: 1 }], estudantes: [{ id: 5, nome_completo: 'Ana Silva' }, { id: 6, nome_completo: 'Bruno Costa' }] };
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const rel = await varreduraForcadaBackups(user);
    const v = _vereditoVarredura(rel);
    const orfao = (rel.historicos || []).find(h => h.dono === 'uid-antigo-9z');
    return {
      enumerou: rel.enumeracao.ok,
      achouOrfao: !!(orfao && orfao.orfao),
      dataDoOrfao: orfao && orfao.maisRecente ? new Date(orfao.maisRecente).toISOString().slice(0, 10) : null,
      abriuOSlot: rel.achados.some(a => a.chave === 'backup_uid-antigo-9z_slot_3' && a.resumo.estudantes === 2),
      titulo: v.titulo
    };
  });
  console.log('4. historico sob ID desconhecido -> enumerou o banco: ' + r6.enumerou
    + ' | achou o orfao: ' + r6.achouOrfao + ' (' + r6.dataDoOrfao + ')'
    + ' | abriu o slot com os 2 estudantes: ' + r6.abriuOSlot);
  console.log('   veredito: "' + r6.titulo + '"');

  // 4b. Indice orfao cujos slots ja' foram apagados: o veredito nao pode prometer
  //     conteudo que a propria varredura acabou de ler e achar vazio.
  const r6b = await p.evaluate(async () => {
    delete window.__docs['app_data/backup_uid-antigo-9z_slot_3'];
    // Sem o documento vivo tambem: o que sobra e' so' o indice orfao, que e'
    // exatamente o cenario deste caso.
    window.__docs['app_data/app_data_u1'] = { turmas: [{ id: 9, nome: '1A' }] };
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const v = _vereditoVarredura(await varreduraForcadaBackups(user));
    return { titulo: v.titulo,
             admiteQueEstaVazio: v.texto.indexOf('estão vazios') !== -1,
             naoPrometeConteudo: v.texto.indexOf('para ver o conteúdo') === -1,
             apontaOPitr: v.texto.indexOf('Point-in-Time Recovery') !== -1 };
  });
  console.log('4b. indice orfao sem slots -> veredito: "' + r6b.titulo
    + '" | admite que esta vazio: ' + r6b.admiteQueEstaVazio
    + ' | aponta o PITR: ' + r6b.apontaOPitr);

  // 5. Regra publicada sem `list`: a varredura nao pode fingir que o banco esta' vazio
  const r7 = await p.evaluate(async () => {
    window.__listasNegadas = true;
    const user = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    const rel = await varreduraForcadaBackups(user);
    window.__listasNegadas = false;
    const html = _painelHistoricos(rel);
    return { ok: rel.enumeracao.ok, motivo: rel.enumeracao.motivo,
             dizQueEstaCega: html.indexOf('Não consegui listar os históricos') !== -1 };
  });
  console.log('5. banco recusa `list` -> enumerou: ' + r7.ok + ' (' + r7.motivo + ')'
    + ' | avisa que esta cega em vez de dizer "nao ha nada": ' + r7.dizQueEstaCega);

  const ok = r3.faixa && r3.temBotao && r3.temLiberar
          && r4.achouVivo && r4.mandaParaOAparelho && r4.semChave
          && r4.titulo.indexOf('não tem backup desta conta') !== -1
          && r5.titulo.indexOf('histórico desta conta foi apagado') !== -1 && r5.culpaATransicao
          && r6.enumerou && r6.achouOrfao && r6.dataDoOrfao === '2026-09-01' && r6.abriuOSlot
          && r6.titulo.indexOf('Há o que recuperar') !== -1
          && r6b.titulo.indexOf('Só sobrou a lista de datas') !== -1
          && r6b.admiteQueEstaVazio && r6b.naoPrometeConteudo && r6b.apontaOPitr
          && r7.ok === false && r7.dizQueEstaCega;
  console.log('\n' + (ok ? 'OK: o backup perdido se acha, e o que nao ha como achar se explica'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
