// ============================================================================
//  VARREDURA DE TODAS AS COLEÇÕES — o último lugar onde ninguém olhou
// ----------------------------------------------------------------------------
//  Tudo até aqui olhou só `app_data`. Mas o sistema usa outras coleções, e uma
//  delas guarda justamente CHAMADA: `shared_attendance`, a chamada compartilhada
//  entre professores. `shared_views` guarda visões compartilhadas do gestor.
//
//  Esta varredura percorre TODAS as coleções conhecidas, mostra cada documento
//  com conteúdo e baixa um .profsis de cada um que pareça ter dado de professor.
//
//  NÃO ALTERA NADA. F12 > Console, no sistema aberto e logado.
// ============================================================================
(async () => {
  const P = (...a) => console.log(...a);
  const bd = (typeof db !== 'undefined' && db) ? db : (window.firebase ? firebase.firestore() : null);
  if (!bd) return console.error('Sem conexão com o banco.');
  const u = currentUser || {};

  const COLECOES = ['app_data', 'shared_attendance', 'shared_views', 'shared_material_digital',
                    'materiais_apoio', 'system', 'espacos_indice'];
  // Campos que denunciam trabalho de professor: chamada, avaliação, compensação.
  const DE_PROFESSOR = ['notas', 'trabalhos', 'presencas', 'compensacoes', 'atrasos',
                        'aulas', 'registrosAula', 'agendamentos', 'eventos', 'frequencia',
                        'chamada', 'faltas', 'presenca', 'registros'];

  const achados = [];
  const R = { colecoes: {}, quando: new Date().toISOString() };

  for (const col of COLECOES) {
    let lidos = 0, comConteudo = 0, ultimo = null, erro = null;
    try {
      for (let pagina = 0; pagina < 40; pagina++) {
        let q = bd.collection(col).orderBy(firebase.firestore.FieldPath.documentId()).limit(100);
        if (ultimo) q = q.startAfter(ultimo);
        const snap = await q.get();
        if (snap.empty) break;
        snap.docs.forEach(doc => {
          lidos++;
          const d = doc.data() || {};
          // Perfil sem lista fixa: conta tudo que for lista ou objeto com chaves.
          const perfil = {};
          let peso = 0, pesoProfessor = 0;
          Object.keys(d).forEach(k => {
            let n = 0;
            if (Array.isArray(d[k])) n = d[k].length;
            else if (d[k] && typeof d[k] === 'object') n = Object.keys(d[k]).length;
            if (!n) return;
            perfil[k] = n; peso += n;
            if (DE_PROFESSOR.indexOf(k) !== -1) pesoProfessor += n;
          });
          if (!peso) return;
          comConteudo++;
          achados.push({ colecao: col, doc: doc.id, perfil: perfil, peso: peso,
                         professor: pesoProfessor, dados: d });
        });
        ultimo = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 100) break;
      }
    } catch (e) {
      erro = (e && e.code) || e.message;
    }
    R.colecoes[col] = { lidos: lidos, comConteudo: comConteudo, erro: erro };
    P(col + ': ' + lidos + ' lido(s), ' + comConteudo + ' com conteúdo' + (erro ? ' — ERRO: ' + erro : ''));
  }

  // O que interessa primeiro: o que tem cara de trabalho de professor.
  const deProfessor = achados.filter(a => a.professor > 0).sort((a, b) => b.professor - a.professor);
  P('%c\n== DOCUMENTOS COM DADO DE PROFESSOR (chamada, avaliação, compensação) ==',
    'font-weight:bold;font-size:14px');
  if (!deProfessor.length) P('%cNenhum, em nenhuma coleção.', 'color:#c00;font-weight:bold');
  else console.table(deProfessor.map(a => Object.assign(
    { colecao: a.colecao, doc: a.doc, PESO_PROFESSOR: a.professor }, a.perfil)));

  P('%c\n== TODOS OS DOCUMENTOS COM CONTEÚDO (os 30 maiores) ==', 'font-weight:bold');
  console.table(achados.sort((a, b) => b.peso - a.peso).slice(0, 30)
    .map(a => Object.assign({ colecao: a.colecao, doc: a.doc, TOTAL: a.peso }, a.perfil)));

  // Baixa os que têm cara de professor: se um deles for o seu, já está em disco.
  deProfessor.slice(0, 20).forEach((a, i) => {
    try {
      const el = document.createElement('a');
      el.href = URL.createObjectURL(new Blob([JSON.stringify(
        { formato: 'profsis', versao: 1, geradoEm: R.quando, origem: a.colecao + '/' + a.doc, dados: a.dados })],
        { type: 'application/json' }));
      el.download = 'professor-' + String(i + 1).padStart(2, '0') + '-' +
                    (a.colecao + '-' + a.doc).replace(/[^A-Za-z0-9_-]+/g, '-') + '.profsis';
      document.body.appendChild(el); el.click(); el.remove();
      P('  baixado: ' + el.download);
    } catch (e) {}
  });

  window.__varredura = { resumo: R.colecoes, deProfessor: deProfessor.map(a =>
    ({ colecao: a.colecao, doc: a.doc, perfil: a.perfil })), total: achados.length };
  P('%c\nMande o objeto window.__varredura (clique com o botão direito > Copy).', 'color:#2b6cb0');
})();
