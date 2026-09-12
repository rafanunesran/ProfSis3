// ============================================================================
//  INVENTÁRIO DA ESCOLA — o que cada conta tem, com nome e sobrenome
// ----------------------------------------------------------------------------
//  Os documentos de cada professor são separados do seu. Quando a pergunta é
//  "cadê as notas do fulano", olhar a SUA conta não responde: o dado está no
//  documento DELE. Esta ferramenta percorre a coleção, resolve cada identificador
//  no nome da pessoa (pela lista de usuários) e mostra uma tabela conta x campo.
//
//  MOSTRA CONTAGENS, NÃO CONTEÚDO. Para baixar um documento inteiro, é preciso
//  pedir por nome explicitamente:
//      await baixarDocumento('app_data_XXXX')
//
//  Exige conta com permissão de leitura na coleção (gestão/super admin).
//  COMO USAR: F12 > Console, no sistema aberto e logado. NÃO ALTERA NADA.
// ============================================================================
(async () => {
  const P = (...a) => console.log(...a);
  const bd = (typeof db !== 'undefined' && db) ? db : (window.firebase ? firebase.firestore() : null);
  if (!bd) return console.error('Sem conexão com o banco.');

  // Quem é quem: sem isto a tabela é uma lista de códigos, e ninguém reconhece
  // a própria escola numa lista de códigos.
  const nomes = {};
  try {
    const lista = await bd.collection('system').doc('users_list').get();
    const us = (lista.exists && lista.data().list) || [];
    us.forEach(u => {
      if (u.uid) nomes[u.uid] = u.nome || u.email || u.uid;
      if (u.id) nomes[String(u.id)] = u.nome || u.email || String(u.id);
    });
    P('Lista de usuários: ' + us.length + ' pessoa(s).');
  } catch (e) { P('Não li a lista de usuários (' + (e.code || e.message) + '); sigo com os códigos.'); }

  const quemE = (id) => {
    let m = /^app_data_school_(.+)_(gestor|aee|projeto|tutoria)$/.exec(id);
    if (m) return 'ESCOLA ' + m[2];
    m = /^backup_(.+)_slot_(\d+)$/.exec(id);
    if (m) return (nomes[m[1]] || m[1]) + ' [backup ' + m[2] + ']';
    m = /^pessoal_app_data_(.+)$/.exec(id);
    if (m) return (nomes[m[1]] || m[1]) + ' [cifrado]';
    m = /^app_data_(.+)$/.exec(id);
    if (m) return nomes[m[1]] || m[1];
    return id;
  };

  const linhas = {};
  const porId = {};
  let lidos = 0, ultimo = null;

  P('Percorrendo a coleção...');
  try {
    for (let pagina = 0; pagina < 60; pagina++) {
      let q = bd.collection('app_data').orderBy(firebase.firestore.FieldPath.documentId()).limit(100);
      if (ultimo) q = q.startAfter(ultimo);
      const snap = await q.get();
      if (snap.empty) break;
      snap.docs.forEach(doc => {
        lidos++;
        const d = doc.data();
        if (!d || typeof d !== 'object') return;
        const conta = {};
        let tem = 0;
        Object.keys(d).forEach(k => {
          if (Array.isArray(d[k]) && d[k].length) { conta[k] = d[k].length; tem += d[k].length; }
        });
        if (d.cifrado === true) { conta['(cifrado)'] = 1; tem = 1; }
        if (!tem) return;
        const rotulo = quemE(doc.id) + '  «' + doc.id + '»';
        linhas[rotulo] = conta;
        porId[doc.id] = true;
      });
      ultimo = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 100) break;
    }
  } catch (e) {
    P('%cA varredura parou: ' + (e.code || e.message), 'color:#c00');
    if (e.code === 'permission-denied') P('Esta conta não tem permissão de listar a coleção.');
  }

  P('%c\n== ' + Object.keys(linhas).length + ' documento(s) COM conteúdo, de ' + lidos + ' lidos ==',
    'font-weight:bold;font-size:14px');
  console.table(linhas);

  // Quem tem muito e quem não tem nada é a pergunta que o gestor faz primeiro.
  const ranking = Object.keys(linhas).map(r => ({
    conta: r, total: Object.values(linhas[r]).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0)
  })).sort((a, b) => b.total - a.total);
  P('%c\n== DO MAIOR PARA O MENOR ==', 'font-weight:bold');
  ranking.slice(0, 40).forEach(r => P('  ' + String(r.total).padStart(6) + '  ' + r.conta));

  window.__inventario = { linhas, ranking, lidos };

  // Baixar um documento inteiro exige pedir pelo nome: conteúdo de outra pessoa
  // não sai daqui por descuido de quem só queria uma tabela.
  window.baixarDocumento = async (id) => {
    const doc = await bd.collection('app_data').doc(String(id)).get();
    if (!doc.exists) return console.error('Não existe: ' + id);
    let dados = doc.data();
    if (dados.cifrado === true) {
      const chave = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
      if (!chave) return console.error('Está cifrado com a senha do dono; esta conta não abre.');
      try {
        dados = await decifrarPacote(dados, chave,
          (n) => bd.collection('app_data').doc(id + '_p' + n).get().then(s => s.exists ? s.data() : null));
      } catch (e) { return console.error('Não abriu: ' + e.message); }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(
      { formato: 'profsis', versao: 1, geradoEm: new Date().toISOString(), origem: id, dados: dados })],
      { type: 'application/json' }));
    a.download = 'doc-' + String(id).replace(/[^A-Za-z0-9_-]+/g, '-') + '.profsis';
    document.body.appendChild(a); a.click(); a.remove();
    console.log('Baixado: ' + a.download);
  };

  P('%c\nPara baixar um documento inteiro:  await baixarDocumento(\'app_data_XXXX\')', 'color:#2b6cb0');
})();
