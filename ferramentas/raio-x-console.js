// ============================================================================
//  RAIO-X — onde está cada campo dos seus dados, sem lista fixa
// ----------------------------------------------------------------------------
//  O diagnóstico anterior contava uma lista de campos escrita à mão, e por isso
//  ficou CEGO para os campos de nota do gestor (notasAvaliacoesGestor,
//  notasBimestraisOficiais, lotesMapaoGestor) e para qualquer campo criado
//  depois dele. Este aqui não decide nada por conta: mostra TODAS as chaves de
//  TODOS os documentos, com o tamanho de cada uma, lado a lado por origem.
//
//  Também DECIFRA o que estiver cifrado, se a chave estiver neste aparelho (ela
//  nasce da senha e fica no IndexedDB depois que você entra com e-mail e senha).
//
//  E baixa um .profsis de cada origem com conteúdo — para você ter tudo em disco
//  antes de mexer em qualquer coisa.
//
//  COMO USAR: F12 > Console, no sistema aberto e logado. Cole e tecle Enter.
//  NÃO ALTERA NADA. Só lê e baixa arquivos.
// ============================================================================
(async () => {
  const P = (...a) => console.log(...a);
  const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  if (!u) return console.error('Entre na sua conta antes de rodar.');

  const bd = (typeof db !== 'undefined' && db) ? db : (window.firebase ? firebase.firestore() : null);
  const R = { quando: new Date().toISOString(), origens: {}, aviso: [] };

  // Perfil de um objeto: cada chave, o que ela é e quanto tem. Sem lista fixa.
  const perfil = (o) => {
    if (!o || typeof o !== 'object') return null;
    const p = {};
    Object.keys(o).forEach(k => {
      const v = o[k];
      if (Array.isArray(v)) p[k] = v.length;
      else if (v && typeof v === 'object') p[k] = '{' + Object.keys(v).length + ' campos}';
      else if (v === null || v === undefined || v === '') p[k] = '(vazio)';
      else p[k] = '(' + typeof v + ')';
    });
    return p;
  };
  const temAlgo = (p) => p && Object.keys(p).some(k => typeof p[k] === 'number' && p[k] > 0);

  const guardar = (nome, dados) => {
    const p = perfil(dados);
    if (!temAlgo(p)) return;
    R.origens[nome] = { perfil: p, dados: dados };
  };

  const lerNuvem = async (id) => {
    if (!bd) return null;
    try { const d = await bd.collection('app_data').doc(String(id)).get(); return d.exists ? d.data() : null; }
    catch (e) { R.aviso.push('não li ' + id + ': ' + (e.code || e.message)); return null; }
  };

  // Abre pacote cifrado com a chave deste aparelho.
  const abrir = async (id, doc) => {
    try {
      const chave = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
      if (!chave) { R.aviso.push(id + ' está cifrado e a chave não está neste aparelho (entre com e-mail e senha).'); return null; }
      return await decifrarPacote(doc, chave, (n) => lerNuvem(id + '_p' + n));
    } catch (e) { R.aviso.push('não abri ' + id + ': ' + e.message); return null; }
  };

  P('%c== 1. O que está na tela agora ==', 'font-weight:bold');
  if (typeof data !== 'undefined' && data) guardar('MEMORIA (a tela agora)', data);

  P('%c== 2. Este aparelho ==', 'font-weight:bold');
  try {
    const chaves = (typeof localKeys === 'function') ? await localKeys() : [];
    for (const k of chaves) {
      let d = await localGet(k);
      if (d && d.cifrado === true) d = await abrir(String(k), d);
      guardar('APARELHO ' + k, d);
    }
  } catch (e) { R.aviso.push('IndexedDB: ' + e.message); }

  P('%c== 3. A nuvem ==', 'font-weight:bold');
  const ids = [];
  const por = (k) => { if (k && ids.indexOf(k) === -1) ids.push(k); };
  if (typeof getStorageKey === 'function') por(getStorageKey(u));
  por('app_data_' + u.uid); if (u.id) por('app_data_' + u.id);
  [u.schoolId, u.legacySchoolId].filter(Boolean).forEach(e =>
    ['gestor', 'aee', 'projeto', 'tutoria'].forEach(p => por('app_data_school_' + e + '_' + p)));
  for (const id of ids) {
    guardar('NUVEM ' + id, await lerNuvem(id));
    const idCif = 'pessoal_' + id;
    const cif = await lerNuvem(idCif);
    if (cif) guardar('NUVEM ' + idCif + ' (decifrado)', await abrir(idCif, cif));
  }

  P('%c== 4. Os backups, inclusive os cifrados ==', 'font-weight:bold');
  for (const uid of [u.uid, u.id].filter(Boolean)) {
    for (let i = 1; i <= 20; i++) {
      const id = 'backup_' + uid + '_slot_' + i;
      let doc = await lerNuvem(id);
      if (!doc) continue;
      if (doc.cifrado === true) doc = await abrir(id, doc);
      guardar('BACKUP slot ' + i + ' (' + uid + ')', doc);
    }
  }

  // --- A tabela: cada campo, em cada origem -------------------------------
  const nomes = Object.keys(R.origens);
  const campos = new Set();
  nomes.forEach(n => Object.keys(R.origens[n].perfil).forEach(c => campos.add(c)));
  const tabela = {};
  Array.from(campos).sort().forEach(c => {
    const linha = {};
    nomes.forEach(n => { const v = R.origens[n].perfil[c]; if (v !== undefined) linha[n] = v; });
    tabela[c] = linha;
  });
  P('%c\n== ONDE ESTÁ CADA CAMPO ==', 'font-weight:bold;font-size:14px');
  console.table(tabela);
  R.tabela = tabela;

  // Onde está o MAIOR número de cada campo: é a origem a usar para recuperá-lo.
  const melhor = {};
  Object.keys(tabela).forEach(c => {
    let top = null;
    Object.keys(tabela[c]).forEach(n => {
      const v = tabela[c][n];
      if (typeof v === 'number' && v > 0 && (!top || v > top.quanto)) top = { origem: n, quanto: v };
    });
    if (top) melhor[c] = top.quanto + ' em ' + top.origem;
  });
  R.melhorOrigem = melhor;
  P('%c\n== ONDE CADA COISA ESTÁ MAIS COMPLETA ==', 'font-weight:bold;font-size:14px');
  P(melhor);

  if (R.aviso.length) { P('%c\n== AVISOS ==', 'font-weight:bold;color:#b7791f'); R.aviso.forEach(a => P(' - ' + a)); }

  // --- Baixa tudo -----------------------------------------------------------
  P('%c\n== BAIXANDO ==', 'font-weight:bold');
  const baixar = (nome, obj) => {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
      a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      P('  baixado: ' + nome);
    } catch (e) { P('  falhou: ' + nome, e); }
  };
  nomes.forEach((n, i) => {
    baixar('profsis-' + String(i + 1).padStart(2, '0') + '-' + n.replace(/[^A-Za-z0-9_-]+/g, '-') + '.profsis',
           { formato: 'profsis', versao: 1, geradoEm: R.quando, origem: n, dados: R.origens[n].dados });
  });
  baixar('raio-x-profsis-' + R.quando.slice(0, 10) + '.json',
         { quando: R.quando, identidade: { uid: u.uid, role: u.role, schoolId: u.schoolId,
           modoDeVisao: (typeof currentViewMode !== 'undefined' ? currentViewMode : null) },
           tabela: tabela, melhorOrigem: melhor, avisos: R.aviso });

  window.__raiox = R;
  P('%c\nPronto. Os .profsis são cópias completas de cada origem — guarde todos.', 'color:#276749;font-weight:bold');
  P('O raio-x-*.json é o mapa: me mande esse.');
})();
