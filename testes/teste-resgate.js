// A Central de Resgate: recuperar o que a transicao cancelada levou.
//
// O cenario e' o real, reproduzido: a nuvem ficou so' com a camada nao-pessoal, o
// indice de backups foi apagado, UM slot sobreviveu porque a Regra recusou o apagar
// (o laco engolia a falha), e a copia inteira ficou no IndexedDB do aparelho que
// migrou. O teste cobra que nada disso passe despercebido.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (o) => { window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col + '/' + id]; } });
  window.firebase = { initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: (c) => ({ doc: (i) => ref(c, String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);

  let falhas = 0;
  const cobrar = (ok, texto) => { console.log('   ' + (ok ? 'OK' : '*** FALHOU ***') + ' ' + texto); if (!ok) falhas++; };

  // Monta o estrago exatamente como migrarParaLocal() o deixava.
  await p.evaluate(async () => {
    currentUser = { id: 1, uid: 'u1', nome: 'Maria Souza', email: 'm@e.com', role: 'professor', schoolId: '77' };
    window.currentViewMode = 'professor';

    // 1. A nuvem, depois do passo 4: so' a camada nao-pessoal.
    window.__docs['app_data/app_data_u1'] = { turmas: [{ id: 1, nome: '1A' }, { id: 2, nome: '2B' }] };
    // 2. O indice foi apagado (passo 7) — nao existe nenhum backup_index_u1.
    // 3. O slot 7 sobreviveu: o delete foi recusado e a falha, engolida.
    window.__docs['app_data/backup_u1_slot_7'] = {
      turmas: [{ id: 1, nome: '1A' }],
      estudantes: [{ id: 7, nome_completo: 'Ana' }, { id: 8, nome_completo: 'Bruno' }],
      ocorrencias: [{ id: 3, relato: 'x', ids_estudantes: [7] }] };
    // 4. O slot 5 sobreviveu cifrado, e este aparelho nao tem a chave.
    window.__docs['app_data/backup_u1_slot_5'] = { cifrado: true, partes: 1, iv: 'x', dados: 'ruido', turmas: [{ id: 9 }] };
    // 5. Um documento vazio nao pode virar "resgate".
    window.__docs['app_data/app_data_school_77_gestor'] = { turmas: [] };
    // 6. A copia inteira ficou no aparelho que migrou.
    await localSet('app_data_u1', { turmas: [{ id: 1, nome: '1A' }, { id: 2, nome: '2B' }],
      estudantes: [{ id: 7, nome_completo: 'Ana' }, { id: 8, nome_completo: 'Bruno' }, { id: 9, nome_completo: 'Caio' }],
      tutorados: [{ id: 4, nome_estudante: 'Ana' }],
      ocorrencias: [{ id: 3, relato: 'x', ids_estudantes: [7] }] });
  });

  // 1. A varredura acha as duas origens sem depender do indice
  const r1 = await p.evaluate(async () => {
    const r = await resgateVarrer();
    window.__r = r;
    return { rotulos: r.achados.map(a => a.rotulo + ' [' + a.detalhe + ']'),
             avisos: r.avisos };
  });
  console.log('1. varredura -> ' + JSON.stringify(r1.rotulos, null, 0));
  cobrar(r1.rotulos.some(t => t.indexOf('app_data_u1') !== -1 && t.indexOf('aparelho') !== -1),
         "a copia do aparelho aparece (e a que a transicao gravou antes de apagar a nuvem)");
  cobrar(r1.rotulos.some(t => t.indexOf('slot 7') !== -1),
         "o slot 7 aparece mesmo sem indice: a forca bruta nao pergunta a quem ja nao sabe");
  cobrar(!r1.rotulos.some(t => t.indexOf('gestor') !== -1), 'documento vazio nao vira resgate');

  // 2. O que sobrou invisivel e o que esta' cifrado viram AVISO, nao silencio
  console.log('2. avisos -> ' + JSON.stringify(r1.avisos, null, 0));
  cobrar(r1.avisos.some(a => a.indexOf('não lista') !== -1 && a.indexOf('7') !== -1),
         'avisa que o Historico na Nuvem nao mostra o slot sobrevivente');
  cobrar(r1.avisos.some(a => a.indexOf('cifrado') !== -1 && a.indexOf('5') !== -1),
         "slot cifrado sem chave e relatado, com o que fazer");

  // 3. A uniao traz o que falta e NAO perde o trabalho de hoje
  const r3 = await p.evaluate(() => {
    const hoje = Object.assign(getInitialData(), {
      turmas: [{ id: 1, nome: '1A' }],
      estudantes: [{ id: 7, nome_completo: 'Ana' }],
      ocorrencias: [{ id: 99, relato: 'lancada hoje', ids_estudantes: [7] }] });
    const achado = window.__r.achados.find(a => a.origem === 'aparelho').dados;
    const { dados, relatorio } = resgateUniao(hoje, achado);
    return { estudantes: dados.estudantes.length, turmas: dados.turmas.length,
             tutorados: (dados.tutorados || []).length,
             ocorrencias: dados.ocorrencias.length,
             hojeSobreviveu: dados.ocorrencias.some(o => o.id === 99),
             semDuplicata: dados.estudantes.filter(e => e.id === 7).length === 1,
             relatorio: relatorio };
  });
  console.log('3. uniao -> ' + JSON.stringify(r3));
  cobrar(r3.estudantes === 3 && r3.turmas === 2 && r3.tutorados === 1, 'trouxe de volta o que faltava');
  cobrar(r3.hojeSobreviveu, "a ocorrencia lancada hoje continua la");
  cobrar(r3.semDuplicata, 'o que ja existia nao duplicou');

  // 4. Refazer o indice devolve o slot ao Historico na Nuvem de sempre
  const r4 = await p.evaluate(async () => {
    window._resgateAchados = window.__r.achados;
    await resgateRefazerIndice();
    const idx = window.__docs['app_data/backup_index_u1'];
    return idx ? idx.slots.map(s => s.id) : null;
  });
  console.log('4. indice refeito -> slots ' + JSON.stringify(r4));
  cobrar(!!r4 && r4.indexOf(7) !== -1, 'o slot 7 volta a ser listavel pelo botao de sempre');

  // 5. O botao existe onde o professor procura
  const r5 = await p.evaluate(() => ({
    funcao: typeof abrirCentralResgate,
    perfil: (typeof renderPerfilUsuario === 'function'),
    faixa: (function () { try { mostrarBannerSemDadosLocais(); } catch (e) {} 
      const f = document.getElementById('bannerSemDadosLocais');
      return !!(f && f.innerHTML.indexOf('abrirCentralResgate') !== -1); })() }));
  console.log('5. porta de entrada -> ' + JSON.stringify(r5));
  cobrar(r5.funcao === 'function', 'abrirCentralResgate() existe');
  cobrar(r5.faixa, 'a faixa de "estudantes sumiram" oferece a busca');

  await b.close();
  console.log(falhas ? ('\n*** ' + falhas + ' falha(s) ***') : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
