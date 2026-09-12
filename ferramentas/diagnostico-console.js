// ============================================================================
//  DIAGNÓSTICO DO SISPROF — cole no Console do navegador (F12), no site, logado.
// ----------------------------------------------------------------------------
//  NÃO ALTERA NENHUM DADO SEU. Ele lê, conta e baixa um relatório .json.
//  A única escrita é uma sonda num documento descartável (diagnostico_teste_<uid>),
//  apagada em seguida — é o que prova se as Regras do Firestore estão recusando
//  as gravações. Nenhum documento real é tocado.
//
//  COMO USAR
//    1. Abra o sistema e faça login normalmente.
//    2. F12 > aba "Console" (no celular não dá: precisa de computador).
//    3. Cole este arquivo inteiro e tecle Enter.
//    4. Leia o resumo e guarde o arquivo que ele baixa.
// ============================================================================
(async () => {
  const R = { quando: new Date().toISOString(), url: location.href };
  const P = (...a) => console.log(...a);
  const LISTAS = ['turmas','estudantes','aulas','presencas','atrasos','trabalhos','notas',
    'tutorados','encontros','agendamentos','eventos','ocorrencias','registrosAula',
    'registrosAdministrativos','gradeHoraria','horariosAulas','mapeamentos','caderno'];

  const censo = (d) => {
    if (!d || typeof d !== 'object') return null;
    const c = {};
    LISTAS.forEach(k => { if (Array.isArray(d[k]) && d[k].length) c[k] = d[k].length; });
    return Object.keys(c).length ? c : null;
  };

  // Até quando vai o conteúdo? É o que responde "perdi o quê, desde quando".
  const ultimaData = (d) => {
    let max = null;
    const olhar = (v) => {
      if (typeof v !== 'string') return;
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m || m[1] < '2020' || m[1] > '2030') return;
      const iso = m[0];
      if (!max || iso > max) max = iso;
    };
    const andar = (o, prof) => {
      if (!o || prof > 3) return;
      if (Array.isArray(o)) { o.slice(-400).forEach(x => andar(x, prof + 1)); return; }
      if (typeof o === 'object') { Object.keys(o).forEach(k => {
        if (/data|date|dia|timestamp|criadoEm|atualizado/i.test(k)) olhar(o[k]);
        else andar(o[k], prof + 1); }); return; }
    };
    andar(d, 0);
    return max;
  };

  // --- 1. Quem é você, para o sistema ---------------------------------------
  const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  R.identidade = u ? {
    uid: u.uid, idAntigo: u.id, nome: u.nome, email: u.email, role: u.role,
    schoolId: u.schoolId, espacoId: u.espacoId || null, legacySchoolId: u.legacySchoolId || null,
    modoDeVisao: (typeof currentViewMode !== 'undefined' ? currentViewMode : null),
    chaveEmUso: (typeof getStorageKey === 'function') ? getStorageKey(u) : null,
    sessaoFirebase: !!(window.firebase && firebase.auth && firebase.auth().currentUser),
    uidDaSessao: (window.firebase && firebase.auth && firebase.auth().currentUser)
                 ? firebase.auth().currentUser.uid : null
  } : { erro: 'SEM LOGIN: entre na sua conta antes de rodar o diagnóstico.' };
  P('%c1. IDENTIDADE', 'font-weight:bold;font-size:13px', R.identidade);
  if (!u) { console.warn('Entre na conta e rode de novo.'); return; }

  // O que o sistema tem carregado NESTE momento (pode ser a única cópia do dia).
  R.naMemoria = (typeof data !== 'undefined' && data) ? censo(data) : null;
  R.naMemoriaAte = (typeof data !== 'undefined' && data) ? ultimaData(data) : null;
  P('%c2. NA TELA AGORA', 'font-weight:bold;font-size:13px', R.naMemoria, '| até:', R.naMemoriaAte);

  // --- 3. Este navegador: localStorage e IndexedDB ---------------------------
  R.localStorage = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const bruto = localStorage.getItem(k) || '';
    let d = null; try { d = JSON.parse(bruto); } catch (e) {}
    const c = censo(d);
    R.localStorage.push({ chave: k, bytes: bruto.length, censo: c, ate: c ? ultimaData(d) : null });
  }
  R.localStorage.sort((a, b) => b.bytes - a.bytes);
  P('%c3. localStorage', 'font-weight:bold;font-size:13px', R.localStorage);

  R.indexedDB = [];
  try {
    const bancos = (indexedDB.databases) ? await indexedDB.databases() : [{ name: 'profsis' }];
    for (const b of bancos) {
      if (!b.name) continue;
      const bd = await new Promise(ok => { const r = indexedDB.open(b.name); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
      if (!bd) continue;
      for (const store of Array.from(bd.objectStoreNames)) {
        const regs = await new Promise(ok => { try {
          const r = bd.transaction(store, 'readonly').objectStore(store).getAll();
          r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]);
        } catch (e) { ok([]); } });
        regs.forEach(reg => {
          const corpo = (reg && reg.dados !== undefined) ? reg.dados : reg;
          const c = censo(corpo);
          R.indexedDB.push({ banco: b.name, store: store, chave: (reg && (reg.id || reg.chave)) || '?',
                             censo: c, ate: c ? ultimaData(corpo) : null });
        });
      }
      bd.close();
    }
  } catch (e) { R.indexedDB.push({ erro: String(e) }); }
  P('%c4. IndexedDB', 'font-weight:bold;font-size:13px', R.indexedDB);

  // --- 5. O banco: o SEU documento e os backups -----------------------------
  const bd = (typeof db !== 'undefined' && db) ? db : (window.firebase ? firebase.firestore() : null);
  if (!bd) { P('%cSem conexão com o Firestore — o resto do diagnóstico não roda.', 'color:#c00'); return; }

  const ler = async (id) => { try {
      const d = await bd.collection('app_data').doc(String(id)).get();
      return d.exists ? d.data() : null;
    } catch (e) { return { __erro: (e && e.code) || String(e) }; } };

  const ids = [];
  const por = (k) => { if (k && ids.indexOf(k) === -1) ids.push(k); };
  por(R.identidade.chaveEmUso); por('app_data_' + u.uid); if (u.id) por('app_data_' + u.id);
  [u.schoolId, u.legacySchoolId].filter(Boolean).forEach(e =>
    ['gestor','aee','projeto','tutoria'].forEach(p => por('app_data_school_' + e + '_' + p)));

  R.nuvem = [];
  for (const id of ids) {
    const d = await ler(id);
    R.nuvem.push({ id: id, existe: !!d && !d.__erro, erro: d && d.__erro || null,
                   censo: censo(d), ate: d ? ultimaData(d) : null });
  }
  P('%c5. SEUS DOCUMENTOS NA NUVEM', 'font-weight:bold;font-size:13px', R.nuvem);

  R.backups = [];
  for (const uid of [u.uid, u.id].filter(Boolean)) {
    const idx = await ler('backup_index_' + uid);
    R.backups.push({ id: 'backup_index_' + uid, existe: !!idx && !idx.__erro,
                     slots: (idx && idx.slots) ? idx.slots.map(s => ({ id: s.id, dia: s.dateStr || null, label: s.label })) : null });
    for (let i = 1; i <= 20; i++) {
      const d = await ler('backup_' + uid + '_slot_' + i);
      if (!d || d.__erro) continue;
      R.backups.push({ id: 'backup_' + uid + '_slot_' + i, cifrado: d.cifrado === true,
                       censo: censo(d), ate: ultimaData(d) });
    }
  }
  P('%c6. BACKUPS NO BANCO', 'font-weight:bold;font-size:13px', R.backups);

  // --- 7. Listagem da coleção: acha documento com chave que ninguém adivinha --
  // As Regras dão `read` em app_data, e read inclui list. Guardamos só o id e a
  // contagem dos documentos que NÃO são seus — nada de conteúdo alheio.
  const meus = [u.uid, String(u.id || ''), String(u.schoolId || ''), String(u.legacySchoolId || '')].filter(Boolean);
  R.colecao = { lidos: 0, possiveis: [], outros: 0, erro: null };
  try {
    let ultimo = null;
    for (let pagina = 0; pagina < 40; pagina++) {
      let q = bd.collection('app_data').orderBy(firebase.firestore.FieldPath.documentId()).limit(100);
      if (ultimo) q = q.startAfter(ultimo);
      const snap = await q.get();
      if (snap.empty) break;
      snap.docs.forEach(doc => {
        R.colecao.lidos++;
        const meu = meus.some(t => doc.id.indexOf(t) !== -1);
        const c = censo(doc.data());
        if (!c) return;
        if (meu) R.colecao.possiveis.push({ id: doc.id, censo: c, ate: ultimaData(doc.data()), seu: true });
        else { R.colecao.outros++; }
      });
      ultimo = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 100) break;
    }
  } catch (e) { R.colecao.erro = (e && e.code) || String(e); }
  P('%c7. VARREDURA DA COLEÇÃO', 'font-weight:bold;font-size:13px', R.colecao);

  // --- 8. A sonda: as Regras estão recusando suas gravações? ----------------
  // Documento descartável, com um campo pessoal vazio dentro. Se a Regra do corte
  // estiver publicada, ela recusa — e é ESSA recusa que apaga o dia do professor.
  const sonda = 'diagnostico_teste_' + u.uid;
  R.sonda = {};
  try {
    await bd.collection('app_data').doc(sonda).set({ notas: [], quando: R.quando });
    R.sonda.comCampoPessoal = 'ACEITOU';
    try { await bd.collection('app_data').doc(sonda).delete(); } catch (e) {}
  } catch (e) { R.sonda.comCampoPessoal = 'RECUSADO: ' + ((e && e.code) || e.message); }
  try {
    await bd.collection('app_data').doc(sonda).set({ turmas: [], quando: R.quando });
    R.sonda.semCampoPessoal = 'ACEITOU';
    try { await bd.collection('app_data').doc(sonda).delete(); } catch (e) {}
  } catch (e) { R.sonda.semCampoPessoal = 'RECUSADO: ' + ((e && e.code) || e.message); }
  P('%c8. SONDA DE GRAVAÇÃO', 'font-weight:bold;font-size:13px', R.sonda);

  // --- Veredito --------------------------------------------------------------
  const linhas = [];
  if (R.sonda.comCampoPessoal.indexOf('RECUSADO') === 0 && R.sonda.semCampoPessoal === 'ACEITOU') {
    linhas.push('❌ AS REGRAS DO FIRESTORE ESTÃO RECUSANDO TODA GRAVAÇÃO QUE TENHA NOTA, CHAMADA, '
      + 'ESTUDANTE OU OCORRÊNCIA. Como o sistema salva o documento inteiro de uma vez, a agenda e os '
      + 'registros de aula caem junto. É por isso que o trabalho some ao fechar a página — ele nunca '
      + 'chegou a ser gravado. Enquanto isso não mudar, a perda CONTINUA acontecendo todo dia.');
  } else if (R.sonda.comCampoPessoal === 'ACEITOU') {
    linhas.push('✅ O banco está aceitando gravação normalmente. A causa da perda é outra — veja em '
      + 'qual data o conteúdo para, nos itens 5 e 6.');
  }
  const maisNovo = R.nuvem.filter(n => n.ate).map(n => n.ate).sort().pop();
  if (maisNovo) linhas.push('📅 O conteúdo mais recente que existe na nuvem é de ' + maisNovo + '.');
  const salvacao = [].concat(
    R.localStorage.filter(l => l.censo).map(l => 'localStorage: ' + l.chave + ' (até ' + l.ate + ')'),
    R.indexedDB.filter(l => l.censo).map(l => 'IndexedDB: ' + l.chave + ' (até ' + l.ate + ')'));
  if (salvacao.length) linhas.push('💾 Cópias neste navegador que podem ter o que falta:\n   - ' + salvacao.join('\n   - '));
  if (R.naMemoria) linhas.push('⚠️ A ABA ABERTA AGORA tem dados carregados (até ' + R.naMemoriaAte + '). '
    + 'NÃO feche esta aba antes de salvar: rode  copy(JSON.stringify({formato:"profsis",versao:1,dados:data}))  '
    + 'e cole num arquivo .profsis, ou use o botão de baixar cópia de segurança.');
  R.veredito = linhas;
  P('%c\n=== VEREDITO ===\n' + linhas.join('\n\n'), 'font-size:13px');

  // --- Baixa o relatório -----------------------------------------------------
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(R, null, 2)], { type: 'application/json' }));
    a.download = 'diagnostico-profsis-' + R.quando.slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    P('%cRelatório baixado. Envie o arquivo para quem for analisar.', 'color:#276749;font-weight:bold');
  } catch (e) { P('Não consegui baixar o arquivo; copie o objeto acima.', e); }
  window.__diagnostico = R;
})();
