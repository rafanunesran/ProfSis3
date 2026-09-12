// "No modo offline foi perdido todas as chamadas, notas e anotacoes."
//
// A protecao contra leitura falha existia so' de um lado. getData marcava
// falhaLeituraFirestore, carregarDadosUsuario bloqueava a escrita e uma tarja
// avisava - tudo para a NUVEM nao ser sobrescrita com vazio. Depois da transicao os
// papeis se invertem: quem guarda chamada, nota e ocorrencia e' o APARELHO. E essa
// metade nao tinha protecao nenhuma.
//
// localGet devolve null tanto para "nao tem nada aqui" quanto para "o IndexedDB nao
// respondeu" ou "a chave do documento mudou" (getStorageKey depende de
// currentViewMode). Nos tres casos o app montava um `data` com as listas pessoais
// vazias, dizia que carregou bem, e o primeiro salvamento gravava o vazio por cima
// da unica copia que existia.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__sessao = { uid: 'u1', email: 'p@e.com' };
  window.__docs = {
    'system/users_list': { list: [ { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' } ] },
    'system/schools_list': { list: [ { id: '77', nome: 'Escola A' } ] },
    'system/config_sistema': {},
    // Depois da transicao a nuvem so' tem a camada que nao identifica estudante.
    'app_data/app_data_u1': { turmas: [{ id: 9, nome: '1A' }], gradeHoraria: [] }
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
  window.firebase.firestore.FieldPath = { documentId: () => '__name__' };
};

// Um professor com o ano letivo dentro: chamadas, notas e anotacoes.
const ANO_LETIVO = {
  turmas: [{ id: 9, nome: '1A' }],
  estudantes: [{ id: 5, nome_completo: 'Ana Silva' }, { id: 6, nome_completo: 'Bruno Costa' }],
  presencas: Array.from({ length: 120 }, (_, i) => ({ id: i, estudanteId: 5, data: '2026-0' + (i % 9 + 1) + '-10' })),
  notas: Array.from({ length: 40 }, (_, i) => ({ id: i, estudanteId: 5, valor: 8 })),
  ocorrencias: Array.from({ length: 12 }, (_, i) => ({ id: i, estudanteId: 6, relato: 'x' }))
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // Conta ja' migrada: modo offline, dado pessoal so' no aparelho.
  const r0 = await p.evaluate(async (ano) => {
    currentUser = { id: 1, uid: 'u1', nome: 'Prof', email: 'p@e.com', role: 'professor', schoolId: '77' };
    currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true;
    window.usuarioOnlineCompleto = false;
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), ano);
    await salvarDadosUsuario(getStorageKey(currentUser), data);
    const censo = await metaGet('censoLocal_app_data_u1');
    return { total: censo && censo.total, presencas: censo && censo.por.presencas };
  }, ANO_LETIVO);
  console.log('0. ano letivo gravado no aparelho -> censo: ' + r0.total
    + ' registro(s), ' + r0.presencas + ' chamadas');

  // 1. O IndexedDB nao responde na abertura seguinte. Antes: tela vazia, "carregou
  //    bem", e o proximo salvamento apagava tudo. Agora: bloqueio.
  const r1 = await p.evaluate(async () => {
    const original = window.localGet;
    window.localGet = async () => null;          // e' o que o IndexedDB devolve ao falhar
    const ok = await carregarDadosUsuario();
    window.localGet = original;
    return {
      carregouOk: ok,
      naTela: { presencas: (data.presencas || []).length, notas: (data.notas || []).length, ocorrencias: (data.ocorrencias || []).length },
      bloqueado: !!window.bloquearEscritaLocal,
      perdaDetectada: !!window.perdaLocalDetectada,
      tinha: window.perdaLocalDetectada ? window.perdaLocalDetectada.anterior.total : null,
      perdas: window.perdaLocalDetectada ? window.perdaLocalDetectada.perdas : []
    };
  });
  console.log('1. leitura local falhou -> carregou "bem"? ' + r1.carregouOk
    + ' | na tela: ' + r1.naTela.presencas + ' chamadas, ' + r1.naTela.notas + ' notas'
    + ' | GRAVACAO BLOQUEADA: ' + r1.bloqueado);
  console.log('   nomeia o que faltou: ' + JSON.stringify(r1.perdas));

  // 2. E o dado continua no aparelho: nada foi gravado por cima
  const r2 = await p.evaluate(async () => {
    window.dadosCarregados = true;
    await persistirDados();                       // o que antes apagava tudo
    await salvarDadosUsuario(getStorageKey(currentUser), data);
    const gravado = await localGet('app_data_u1');
    return { presencas: (gravado.presencas || []).length, notas: (gravado.notas || []).length,
             ocorrencias: (gravado.ocorrencias || []).length };
  });
  console.log('2. tentou salvar por cima -> no aparelho continuam: ' + r2.presencas
    + ' chamadas, ' + r2.notas + ' notas, ' + r2.ocorrencias + ' ocorrencias');

  // 3. A tarja aparece, explica e da' saida
  const r3 = await p.evaluate(() => {
    mostrarBannerPerdaLocal();
    const f = document.getElementById('bannerPerdaLocal');
    return {
      visivel: !!f,
      dizQueNadaFoiApagado: f ? f.innerHTML.indexOf('Nada foi apagado') !== -1 : false,
      temImportar: f ? f.innerHTML.indexOf('Importar do meu arquivo') !== -1 : false,
      temSaida: typeof liberarGravacaoAposPerda === 'function'
    };
  });
  console.log('3. tarja -> visivel: ' + r3.visivel + ' | diz que nada foi apagado: '
    + r3.dizQueNadaFoiApagado + ' | oferece importar: ' + r3.temImportar);

  // 4. O backup diario nao pode gravar esse vazio por cima de um slot bom
  avisos.length = 0;
  const r4 = await p.evaluate(async () => {
    window.bloquearEscritaLocal = false;         // so' para chegar em criarBackupNuvem
    window.dadosCarregados = true;
    window.__docs['app_data/backup_u1_slot_1'] = { presencas: [{ id: 1 }], notas: [{ id: 1 }] };
    await criarBackupNuvem(false);
    const slot = window.__docs['app_data/backup_u1_slot_1'];
    return { slotIntacto: (slot.presencas || []).length === 1 };
  });
  const recusou = avisos.join(' | ').indexOf('Backup CANCELADO') !== -1;
  console.log('4. backup com a tela vazia -> recusou: ' + recusou
    + ' | slot bom continua intacto: ' + r4.slotIntacto);

  // 5. Recarregar com o IndexedDB de volta: tudo volta e a gravacao e' liberada
  const r5 = await p.evaluate(async () => {
    window.bloquearEscritaLocal = false;
    window.perdaLocalDetectada = null;
    const ok = await carregarDadosUsuario();
    return { carregouOk: ok, bloqueado: !!window.bloquearEscritaLocal,
             presencas: (data.presencas || []).length, notas: (data.notas || []).length,
             ocorrencias: (data.ocorrencias || []).length, turmas: (data.turmas || []).length };
  });
  console.log('5. leitura local voltou -> ' + r5.presencas + ' chamadas, ' + r5.notas
    + ' notas, ' + r5.ocorrencias + ' ocorrencias, ' + r5.turmas + ' turma(s) | bloqueado: ' + r5.bloqueado);

  // 6. Apagar tudo DE PROPOSITO continua possivel: a protecao nao vira prisao
  const r6 = await p.evaluate(async () => {
    data.presencas = []; data.notas = []; data.ocorrencias = []; data.estudantes = []; data.tutorados = [];
    await salvarDadosUsuario(getStorageKey(currentUser), data);
    const censo = await metaGet('censoLocal_app_data_u1');
    const ok = await carregarDadosUsuario();
    return { censoZerado: censo.total === 0, carregouOk: ok, bloqueado: !!window.bloquearEscritaLocal };
  });
  console.log('6. professor apagou de proposito -> censo acompanha: ' + r6.censoZerado
    + ' | abertura seguinte bloqueia? ' + r6.bloqueado + ' (tem de ser false)');

  const ok = r0.total === 174 && r0.presencas === 120
          && r1.carregouOk === false && r1.bloqueado && r1.perdaDetectada && r1.tinha === 174
          && r1.naTela.presencas === 0 && r1.perdas.length >= 3
          && r2.presencas === 120 && r2.notas === 40 && r2.ocorrencias === 12
          && r3.visivel && r3.dizQueNadaFoiApagado && r3.temImportar && r3.temSaida
          && recusou && r4.slotIntacto
          && r5.carregouOk === true && r5.bloqueado === false
          && r5.presencas === 120 && r5.notas === 40 && r5.ocorrencias === 12 && r5.turmas === 1
          && r6.censoZerado && r6.carregouOk === true && r6.bloqueado === false;
  console.log('\n' + (ok ? 'OK: a copia do aparelho tem a mesma protecao que a nuvem sempre teve'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
