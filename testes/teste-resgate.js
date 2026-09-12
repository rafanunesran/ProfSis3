// A Central de Resgate: recuperar o que a transicao cancelada levou.
//
// O cenario e' o real, reproduzido: a nuvem ficou so' com a camada nao-pessoal, o
// indice de backups foi apagado, UM slot sobreviveu porque a Regra recusou o apagar
// (o laco engolia a falha), e a copia inteira ficou no IndexedDB do aparelho que
// migrou. O teste cobra que nada disso passe despercebido.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  // window.__regraDoCorte liga a Regra publicada: recusa documento com campo pessoal.
  window.__regraDoCorte = false;
  const PESSOAIS = ['estudantes', 'presencas', 'notas', 'tutorados', 'ocorrencias', 'agendamentos'];
  const permitido = (id, o) => {
    if (!window.__regraDoCorte) return true;
    if (String(id).indexOf('backup_') === 0 && o && o.cifrado === true) return true;
    return !Object.keys(o || {}).some(k => PESSOAIS.indexOf(k) !== -1);
  };
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (o) => {
      if (!permitido(id, o)) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
      window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col + '/' + id]; } });
  const colecao = (c) => {
    const consulta = (depois, lim) => ({
      limit: (n) => consulta(depois, n),
      startAfter: (d) => consulta(d.id, lim),
      get: async () => {
        let ids = Object.keys(window.__docs).filter(k => k.indexOf(c + '/') === 0)
                        .map(k => k.slice(c.length + 1)).sort();
        if (depois) ids = ids.filter(i => i > depois);
        ids = ids.slice(0, lim || 100);
        return { empty: ids.length === 0,
                 docs: ids.map(i => ({ id: i, data: () => JSON.parse(JSON.stringify(window.__docs[c + '/' + i])) })) }; } });
    return { doc: (i) => ref(c, String(i)), orderBy: () => consulta(null, 100) };
  };
  window.firebase = { initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: colecao }) };
  window.firebase.firestore.FieldPath = { documentId: () => '__name__' };
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
    // 5b. A conta mudou de uid: o documento antigo tem o id antigo no nome, e
    //     nenhuma adivinhacao de chave chega nele - so' listar a colecao chega.
    window.__docs['app_data/app_data_99887766'] = {
      turmas: [{ id: 3, nome: '3C' }], eventos: [{ id: 1, data: '2026-09-02' }],
      notas: [{ id: 1 }, { id: 2 }], registrosAula: [{ id: 1 }] };
    // 5c. Documento de OUTRA pessoa: o conteudo nao pode ser guardado.
    window.__docs['app_data/app_data_naoEhMinha'] = { estudantes: [{ id: 1, nome_completo: 'Alheio' }] };
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

  // 6. A varredura por nome NAO acha o documento de uid antigo; a profunda acha,
  //    e nao guarda o conteudo de quem nao e' desta conta.
  const r6 = await p.evaluate(async () => {
    const prof = await resgateVarreduraProfunda();
    return { meus: prof.meus.map(a => a.detalhe), lidos: prof.lidos,
             outros: prof.outros.map(o => o.id),
             vazouConteudo: JSON.stringify(prof.outros).indexOf('Alheio') !== -1 };
  });
  console.log('6. varredura profunda -> ' + JSON.stringify(r6));
  cobrar(r1.rotulos.every(t => t.indexOf('99887766') === -1), 'a busca por nome nao chega no uid antigo');
  cobrar(r6.meus.indexOf('app_data_99887766') !== -1, 'listar a colecao chega');
  cobrar(r6.outros.indexOf('app_data_naoEhMinha') !== -1 && !r6.vazouConteudo,
         'de documento alheio fica so a contagem, nunca o conteudo');

  // 7. A REGRA RECUSANDO: o espelho do aparelho tem de sobreviver a recusa.
  //    E' o defeito que custou agenda, notas, registros e chamadas.
  const r7 = await p.evaluate(async () => {
    // O desencontro real de producao: o APLICATIVO acha que pode mandar (conta
    // isenta / antes do corte pelo relogio dele) e a REGRA publicada recusa.
    window.usuarioOnlineCompleto = true;               // guarda do app libera
    window.__regraDoCorte = true;                      // Regra do corte publicada
    await saveData('app_data', 'app_data_u1', {
      turmas: [{ id: 1 }], eventos: [{ id: 9, data: '2026-09-12' }],
      notas: [{ id: 7 }], presencas: [{ id: 1 }] });
    const espelho = await localGet('app_data_u1');
    const fila = await listarGravacoesRecusadas();
    return { subiuNaNuvem: !!(window.__docs['app_data/app_data_u1'] || {}).notas,
             noAparelho: !!(espelho && espelho.notas && espelho.eventos),
             agendaNoAparelho: !!(espelho && espelho.eventos),
             fila: fila.map(f => f.docId + ':' + f.codigo) };
  });
  console.log('7. banco recusando -> ' + JSON.stringify(r7));
  cobrar(!r7.subiuNaNuvem, 'a Regra recusou mesmo (o cenario esta montado)');
  cobrar(r7.noAparelho, 'O TRABALHO SOBREVIVE NO APARELHO mesmo com o banco recusando');
  cobrar(r7.agendaNoAparelho, 'a agenda, que cai junto no mesmo documento, tambem sobrevive');
  cobrar(r7.fila.indexOf('app_data_u1:permission-denied') !== -1, 'a recusa fica anotada para reenvio');

  // 7b. O outro caminho: a guarda de conformidade do proprio app estoura. Ela existe
  //     para impedir o ENVIO, nunca para jogar fora o que a pessoa digitou.
  const r7b = await p.evaluate(async () => {
    window.usuarioOnlineCompleto = false;              // guarda do app volta a valer
    let estourou = false;
    try {
      await saveData('app_data', 'app_data_school_77_tutoria', {
        eventos: [{ id: 5 }], encontros: [{ id: 1, relato: 'x' }] });
    } catch (e) { estourou = true; }
    const espelho = await localGet('app_data_school_77_tutoria');
    return { estourou: estourou, noAparelho: !!(espelho && espelho.encontros && espelho.eventos),
             naNuvem: !!window.__docs['app_data/app_data_school_77_tutoria'] };
  });
  console.log('7b. guarda do app -> ' + JSON.stringify(r7b));
  cobrar(r7b.estourou && !r7b.naNuvem, 'a guarda continua impedindo o envio (falha alto)');
  cobrar(r7b.noAparelho, 'mas o trabalho fica guardado no aparelho em vez de evaporar');

  // 8. Corrigida a causa, o que foi recusado sobe - sem redigitar nada.
  const r8 = await p.evaluate(async () => {
    window.__regraDoCorte = false;
    const r = await reenviarGravacoesRecusadas();
    const nuvem = window.__docs['app_data/app_data_u1'] || {};
    return { r: r, notasNaNuvem: (nuvem.notas || []).length,
             agendaNaNuvem: (nuvem.eventos || []).length,
             filaVazia: (await listarGravacoesRecusadas()).length === 0 };
  });
  console.log('8. reenvio -> ' + JSON.stringify(r8));
  cobrar(r8.notasNaNuvem === 1 && r8.agendaNaNuvem === 1, 'o que foi recusado sobe depois');
  cobrar(r8.filaVazia, 'a fila se esvazia quando sobe');

  // 9. A MESMA CONTA em dois papeis: o dado so' volta para o documento de onde veio.
  //    Foi assim que um documento de professor, com as notas e faltas do bimestre,
  //    terminou com o conteudo do painel de gestao dentro.
  const r9 = await p.evaluate(async () => {
    window.usuarioOnlineCompleto = true;
    window.__regraDoCorte = false;
    window.chaveDosDadosCarregados = 'app_data_school_77_gestor';   // abriu como gestor
    window._avisouChaveErrada = true;                               // sem caixa de dialogo no teste
    const antes = JSON.stringify(window.__docs['app_data/app_data_u1'] || null);
    await salvarDadosUsuario('app_data_u1', { estudantes: [{ id: 1 }], notas: [] });
    const depois = JSON.stringify(window.__docs['app_data/app_data_u1'] || null);
    const espelho = await localGet('app_data_u1');
    window.chaveDosDadosCarregados = null;
    return { intacto: antes === depois, recusa: !!window.gravacaoEmChaveErrada,
             espelhoIntacto: !!(espelho && espelho.notas) };
  });
  console.log('9. gestor+professor na mesma conta -> ' + JSON.stringify(r9));
  cobrar(r9.recusa, 'a gravacao em documento diferente do carregado e RECUSADA');
  cobrar(r9.intacto, 'o documento do outro painel fica INTACTO na nuvem');

  // 10. E a Central de Resgate avisa antes de misturar dois documentos.
  const r10 = await p.evaluate(() => {
    window.currentViewMode = 'professor';
    const aviso = _resgateAvisoDeOutroDocumento({ detalhe: 'app_data_school_77_gestor' });
    const semAviso = _resgateAvisoDeOutroDocumento({ detalhe: 'app_data_u1' });
    return { avisa: aviso.indexOf('OUTRO documento') !== -1 && aviso.indexOf('Gestor') !== -1,
             calaQuandoEhOMesmo: semAviso === '' };
  });
  console.log('10. aviso na Central de Resgate -> ' + JSON.stringify(r10));
  cobrar(r10.avisa, 'avisa que a copia e de outro painel antes de mesclar/substituir');
  cobrar(r10.calaQuandoEhOMesmo, 'e nao atrapalha quando e o proprio documento');

  // 11. ID QUE COLIDE: numa conta real, 57 notas bimestrais carregavam o id de OUTRO
  //     estudante (Date.now()+Math.random() perde a parte aleatoria num double). Juntar
  //     por id apagava a nota de uma aluna por causa da nota de outra.
  const r11 = await p.evaluate(() => {
    const hoje = Object.assign(getInitialData(), { notasBimestraisOficiais: [
      { id: 1784656465424.1921, nome_estudante_norm: 'ANA JULIA', disciplina: 'CIENCIAS', valor: '10' } ] });
    const achado = { notasBimestraisOficiais: [
      { id: 1784656465424.1921, nome_estudante_norm: 'ANA LUIZA', disciplina: 'CIENCIAS', valor: '6' },
      { id: 1784656465424.1921, nome_estudante_norm: 'ANA JULIA', disciplina: 'CIENCIAS', valor: '10' } ] };
    const { dados } = resgateUniao(hoje, achado);
    const notas = dados.notasBimestraisOficiais;
    return { total: notas.length,
             temAnaJulia: notas.filter(n => n.nome_estudante_norm === 'ANA JULIA').length,
             temAnaLuiza: notas.filter(n => n.nome_estudante_norm === 'ANA LUIZA').length,
             idNovoNaoColide: (function () {
               const vistos = new Set();
               for (let i = 0; i < 3000; i++) vistos.add(novoId());
               return vistos.size === 3000; })() };
  });
  console.log('11. id que colide -> ' + JSON.stringify(r11));
  cobrar(r11.temAnaLuiza === 1, 'A NOTA DA OUTRA ALUNA, com id colidente, NAO e mais descartada');
  cobrar(r11.temAnaJulia === 1 && r11.total === 2, 'e a duplicata de verdade continua sendo descartada');
  cobrar(r11.idNovoNaoColide, 'novoId() nao repete em 3000 chamadas seguidas');

  await b.close();
  console.log(falhas ? ('\n*** ' + falhas + ' falha(s) ***') : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
