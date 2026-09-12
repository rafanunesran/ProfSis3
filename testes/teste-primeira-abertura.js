// A PRIMEIRA ABERTURA DA VERSAO NOVA numa conta que nunca converteu.
//
// E' o caso de TODO mundo no dia da publicacao: o documento na nuvem ainda tem
// estudante, nota e chamada em texto claro, e o aparelho nao tem nada. Se o
// carregamento descartar o pessoal em claro, o professor abre e ve as turmas sem os
// estudantes - e o primeiro salvamento reescreve o documento sem eles, apagando a
// unica copia que existe. Este teste existe para isso nunca acontecer.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  window.__recusarCifrado = false;
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (o) => {
      if (window.__recusarCifrado && String(id).indexOf('pessoal_') === 0) {
        const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
      window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col + '/' + id]; } });
  window.firebase = { initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' }, onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: (c) => ({ doc: (i) => ref(c, String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

const U = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };

// O documento como o sistema PUBLICADO o deixou: tudo junto, em texto claro.
const COMO_ESTA_HOJE = {
  turmas: [{ id: 1, nome: '1A' }, { id: 2, nome: '2B' }],
  eventos: [{ id: 1, data: '2026-09-05', titulo: 'Conselho' }],
  registrosAula: [{ id: 1, data: '2026-09-04' }],
  estudantes: [{ id: 7, nome_completo: 'Ana Paula' }, { id: 8, nome_completo: 'Bruno' }],
  notas: [{ id: 1, id_estudante: 7, valor: 8 }],
  presencas: [{ id: 1, id_estudante: 7, presente: true }],
  ocorrencias: [{ id: 3, relato: 'briga no patio', ids_estudantes: [7] }]
};

async function abrirNavegadorLimpo(b) {
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto((process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  return p;
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let falhas = 0;
  const cobrar = (ok, texto) => { console.log('   ' + (ok ? 'OK' : '*** FALHOU ***') + ' ' + texto); if (!ok) falhas++; };

  // === 1. Abre a versao nova, com a chave disponivel (entrou com e-mail e senha) ===
  const p1 = await abrirNavegadorLimpo(b);
  const r1 = await p1.evaluate(async ([u, doc]) => {
    window.__docs['app_data/app_data_u1'] = doc;
    currentUser = u; currentViewMode = 'professor';
    window.usuarioOnlineCompleto = false;
    await desbloquearChaveBackup('u1', 'senha-da-conta');

    const ok = await carregarDadosUsuario();
    const naTela = { estudantes: (data.estudantes || []).length, notas: (data.notas || []).length,
                     presencas: (data.presencas || []).length, turmas: (data.turmas || []).length,
                     eventos: (data.eventos || []).length, registrosAula: (data.registrosAula || []).length };
    const noAparelho = (await localGet('app_data_u1')) || {};
    return { ok: ok, naTela: naTela, temPessoalEmClaro: window.nuvemTemPessoalEmClaro,
             estudantesNoAparelho: (noAparelho.estudantes || []).length };
  }, [U, COMO_ESTA_HOJE]);
  console.log('1. primeira abertura -> ' + JSON.stringify(r1));
  cobrar(r1.temPessoalEmClaro, 'reconheceu que a conta ainda nao converteu');
  cobrar(r1.naTela.estudantes === 2 && r1.naTela.notas === 1 && r1.naTela.presencas === 1,
         'OS ESTUDANTES, NOTAS E CHAMADAS APARECEM (nao foram descartados no carregamento)');
  cobrar(r1.naTela.turmas === 2 && r1.naTela.eventos === 1 && r1.naTela.registrosAula === 1,
         'agenda, turmas e registros de aula vieram junto');
  cobrar(r1.estudantesNoAparelho === 2, 'e ja ficaram guardados no aparelho');

  // === 2. O primeiro salvamento CONVERTE: cifra na nuvem e so entao limpa o claro ===
  const r2 = await p1.evaluate(async () => {
    await salvarDadosUsuario('app_data_u1', data);
    const claro = window.__docs['app_data/app_data_u1'] || {};
    const cifrado = JSON.stringify(window.__docs['app_data/pessoal_app_data_u1'] || {});
    return { claroAindaTemNome: JSON.stringify(claro).indexOf('Ana Paula') !== -1,
             claroManteveAgenda: (claro.eventos || []).length === 1,
             existeCifrado: !!window.__docs['app_data/pessoal_app_data_u1'],
             cifradoVazaNome: cifrado.indexOf('Ana Paula') !== -1 };
  });
  console.log('2. primeiro salvamento -> ' + JSON.stringify(r2));
  cobrar(r2.existeCifrado && !r2.cifradoVazaNome, 'o pessoal subiu cifrado (e ilegivel no banco)');
  cobrar(!r2.claroAindaTemNome, 'so depois disso o documento em claro foi limpo');
  cobrar(r2.claroManteveAgenda, 'a agenda continua na nuvem, como sempre esteve');

  // === 3. A volta: outro aparelho, so com a senha, encontra tudo ===
  const docs = await p1.evaluate(() => JSON.stringify(window.__docs));
  const p2 = await abrirNavegadorLimpo(b);
  const r3 = await p2.evaluate(async ([u, d]) => {
    window.__docs = JSON.parse(d);
    currentUser = u; currentViewMode = 'professor';
    window.usuarioOnlineCompleto = false;
    await desbloquearChaveBackup('u1', 'senha-da-conta');
    await carregarDadosUsuario();
    return { estudantes: (data.estudantes || []).length, notas: (data.notas || []).length,
             turmas: (data.turmas || []).length };
  }, [U, docs]);
  console.log('3. outro aparelho, so com a senha -> ' + JSON.stringify(r3));
  cobrar(r3.estudantes === 2 && r3.notas === 1 && r3.turmas === 2, 'tudo volta sem arquivo nenhum');

  // === 4. SEM a chave (entrou pela sessao salva): nao converte, e NAO apaga nada ===
  const p3 = await abrirNavegadorLimpo(b);
  const r4 = await p3.evaluate(async ([u, doc]) => {
    window.__docs['app_data/app_data_u1'] = doc;            // conta nao convertida de novo
    currentUser = u; currentViewMode = 'professor';
    window.usuarioOnlineCompleto = false;
    // sem desbloquearChaveBackup: este aparelho nao tem a chave
    await carregarDadosUsuario();
    const naTela = (data.estudantes || []).length;
    await salvarDadosUsuario('app_data_u1', data);
    const claro = window.__docs['app_data/app_data_u1'] || {};
    const noAparelho = (await localGet('app_data_u1')) || {};
    return { naTela: naTela, claroPreservado: JSON.stringify(claro).indexOf('Ana Paula') !== -1,
             guardadoNoAparelho: (noAparelho.estudantes || []).length };
  }, [U, COMO_ESTA_HOJE]);
  console.log('4. sem a chave neste aparelho -> ' + JSON.stringify(r4));
  cobrar(r4.naTela === 2, 'o professor ve os estudantes mesmo sem a chave');
  cobrar(r4.claroPreservado, 'O DOCUMENTO EM CLARO NAO E APAGADO sem a copia cifrada existir');
  cobrar(r4.guardadoNoAparelho === 2, 'e o trabalho fica guardado no aparelho');

  await b.close();
  console.log(falhas ? ('\n*** ' + falhas + ' falha(s) ***') : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
