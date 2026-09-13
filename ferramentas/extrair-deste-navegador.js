// ============================================================================
//  EXTRAIR O QUE ESTE NAVEGADOR GUARDA — sem login, sem tocar em nada
// ----------------------------------------------------------------------------
//  Para rodar em QUALQUER máquina ou navegador onde o ProfSis já foi usado: o
//  computador da escola, outro perfil do Chrome, o Edge, o Firefox, o celular.
//  O IndexedDB é por navegador e por máquina — o de lá nunca foi tocado pelo que
//  aconteceu no seu.
//
//  COMO USAR, e a ORDEM IMPORTA:
//    1. Abra o site do ProfSis nesse navegador.
//    2. NÃO FAÇA LOGIN. Sem login o aplicativo não carrega nem grava nada, e é
//       exatamente uma gravação por cima que já destruiu cópia antes.
//    3. F12 > Console. Cole este arquivo e tecle Enter.
//    4. Ele baixa um .profsis de cada coisa que encontrar.
//
//  NÃO DEPENDE DO APLICATIVO: lê o IndexedDB e o localStorage direto, com as
//  APIs do navegador. Funciona mesmo se o site não carregar direito.
// ============================================================================
(async () => {
  const P = (...a) => console.log(...a);
  const achados = [];

  const conta = (o) => {
    if (!o || typeof o !== 'object') return { perfil: null, total: 0 };
    const perfil = {}; let total = 0;
    Object.keys(o).forEach(k => {
      const n = Array.isArray(o[k]) ? o[k].length
              : (o[k] && typeof o[k] === 'object') ? Object.keys(o[k]).length : 0;
      if (n) { perfil[k] = n; total += n; }
    });
    return { perfil, total };
  };

  P('%c== IndexedDB ==', 'font-weight:bold;font-size:14px');
  try {
    const bancos = indexedDB.databases ? await indexedDB.databases() : [{ name: 'profsis' }];
    for (const b of bancos) {
      if (!b.name) continue;
      const bd = await new Promise(ok => {
        const r = indexedDB.open(b.name);
        r.onsuccess = () => ok(r.result); r.onerror = () => ok(null);
        setTimeout(() => ok(null), 4000);
      });
      if (!bd) { P('  ' + b.name + ': não abriu'); continue; }
      for (const store of Array.from(bd.objectStoreNames)) {
        const regs = await new Promise(ok => {
          try { const r = bd.transaction(store, 'readonly').objectStore(store).getAll();
                r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); }
          catch (e) { ok([]); }
        });
        regs.forEach(reg => {
          const chave = (reg && (reg.id || reg.chave)) || '(sem chave)';
          const corpo = (reg && reg.dados !== undefined) ? reg.dados : reg;
          const { perfil, total } = conta(corpo);
          if (!total) return;
          P('  ' + b.name + '/' + store + '/' + chave + ' -> ' + JSON.stringify(perfil));
          achados.push({ onde: b.name + '-' + store + '-' + chave, dados: corpo, total });
        });
      }
      bd.close();
    }
  } catch (e) { P('  erro no IndexedDB: ' + e.message); }

  P('%c== localStorage ==', 'font-weight:bold;font-size:14px');
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      let d = null;
      try { d = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
      const { perfil, total } = conta(d);
      if (!total) continue;
      P('  ' + k + ' -> ' + JSON.stringify(perfil));
      achados.push({ onde: 'localStorage-' + k, dados: d, total });
    }
  } catch (e) { P('  erro no localStorage: ' + e.message); }

  // O que se procura: chamada, avaliação, compensação, agenda.
  const PROF = ['presencas', 'notas', 'trabalhos', 'compensacoes', 'atrasos',
                'aulas', 'registrosAula', 'agendamentos', 'encontros'];
  const bons = achados.filter(a => PROF.some(k => Array.isArray(a.dados[k]) && a.dados[k].length));

  if (!achados.length) {
    P('%c\nNADA GUARDADO NESTE NAVEGADOR. Este não é o que tem a cópia.',
      'color:#c00;font-weight:bold;font-size:14px');
    return;
  }

  P('%c\n' + achados.length + ' cópia(s) encontrada(s); ' + bons.length + ' com dado de professor.',
    'font-weight:bold;font-size:14px;color:' + (bons.length ? '#276749' : '#b7791f'));
  bons.forEach(a => P('   ' + a.onde + ' -> ' +
    PROF.filter(k => a.dados[k] && a.dados[k].length).map(k => k + '=' + a.dados[k].length).join(' | ')));

  achados.sort((a, b) => b.total - a.total).forEach((a, i) => {
    try {
      const el = document.createElement('a');
      el.href = URL.createObjectURL(new Blob([JSON.stringify(
        { formato: 'profsis', versao: 1, geradoEm: new Date().toISOString(),
          origem: 'navegador:' + a.onde, dados: a.dados })], { type: 'application/json' }));
      el.download = 'navegador-' + String(i + 1).padStart(2, '0') + '-' +
                    a.onde.replace(/[^A-Za-z0-9_-]+/g, '-') + '.profsis';
      document.body.appendChild(el); el.click(); el.remove();
      P('  baixado: ' + el.download);
    } catch (e) {}
  });
  P('%c\nGuarde todos os arquivos baixados.', 'color:#276749;font-weight:bold');
})();
