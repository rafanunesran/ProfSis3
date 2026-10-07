// A ALTERACAO DA GESTAO NAO PODE SER DESFEITA PELA COPIA VELHA DE OUTRO APARELHO.
//
// O estrago que originou isto: o gestor atualizou o status dos estudantes num
// computador. Outro aparelho da gestao (ou a conta de outro gestor da escola), com a
// lista da semana anterior, abriu o painel: a juncao mantinha SEMPRE a versao daqui
// do mesmo estudante, e quatro segundos depois a lista velha era republicada para a
// escola inteira. Para todo mundo - inclusive para quem fez a mudanca - parecia que
// nada tinha sido alterado; e quem abriu a turma no intervalo viu a versao nova.
//
// Cobrimos:
//   1. A muda o status e remaneja; B (copia velha) abre o painel e fica com a versao
//      de A, sem duplicar o remanejado, e a lista publicada continua a de A;
//   2. a mesma conta em dois aparelhos (pacote cifrado): vale o editado por ultimo;
//   3. alteracao feita ANTES do carimbo existir: o "Publicar agora" no aparelho certo
//      faz a lista dele valer sobre a copia velha do outro.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const FAKE = () => {
  window.__docs = {};
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'g1',email:'g@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

const GESTOR_A = { id:'g1', uid:'g1', nome:'Gestora', email:'g@e.com', role:'gestor', schoolId:'77', legacySchoolId:'77' };
const GESTOR_B = { id:'g2', uid:'g2', nome:'Vice', email:'v@e.com', role:'gestor', schoolId:'77', legacySchoolId:'77' };

const LISTA = [ {id:1, id_turma:10, nome_completo:'Ana Paula', status:'Ativo'},
                {id:2, id_turma:10, nome_completo:'Bruno Silva', status:'Ativo'},
                {id:3, id_turma:20, nome_completo:'Carla Dias', status:'Ativo'} ];

async function novaAba(browser) {
  const p = await (await browser.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  // O Firebase de verdade, se a rede alcancar o CDN, apagaria o banco falso.
  await p.route(/gstatic\.com/, r => r.abort());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  return p;
}

// Monta um painel da gestao ja' carregado, com a lista dada, num banco dado.
async function abrirPainel(p, u, senha, lista, docs) {
  return p.evaluate(async ([u, senha, lista, docs]) => {
    if (docs) window.__docs = JSON.parse(docs);
    limparCacheListaEscola();
    currentUser = u; currentViewMode = 'gestor';
    window.dadosMigradosLocalmente = true;
    window.usuarioOnlineCompleto = false;
    window.dadosCarregados = true;
    await desbloquearChaveBackup(u.uid, senha);
    window.pessoalCifradoLido = true;
    data = Object.assign(getInitialData(), {
      turmas: [ {id:10, nome:'1A'}, {id:20, nome:'2B'} ],
      estudantes: JSON.parse(JSON.stringify(lista)) });
  }, [u, senha, lista, docs]);
}

const banco = (p) => p.evaluate(() => JSON.stringify(window.__docs));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  let falhas = 0;
  const t = (nome, cond) => { if (!cond) falhas++; console.log((cond ? '  ok  ' : ' FALHA') + ' | ' + nome); };

  // ============ 1. DOIS GESTORES, B COM A LISTA DA SEMANA PASSADA ==========
  const pa = await novaAba(b);
  await abrirPainel(pa, GESTOR_A, 'senha-a', LISTA, null);
  await pa.evaluate(async () => {
    await publicarListaEscola(data, 'gestor', { forcar:true });     // a lista de antes
    lembrarRetratoEstudantes(data);                                 // o painel terminou de abrir
    alterarStatusEstudante(1, 'Transferido');                      // pelo seletor da aba Estudantes
    data.estudantes.find(e => e.id === 2).id_turma = 20;           // remanejamento
    await persistirDados();
    await publicarListaEscola(data, 'gestor', { forcar:true });
  });

  const pb = await novaAba(b);
  await abrirPainel(pb, GESTOR_B, 'senha-b', LISTA, await banco(pa));   // copia velha
  const r1 = await pb.evaluate(async () => {
    lembrarRetratoEstudantes(data);
    const trazido = await trazerListaPublicadaParaGestor();
    lembrarRetratoEstudantes(data);
    await publicarListaEscola(data, 'gestor');                     // o que o painel faz ao abrir
    limparCacheListaEscola();
    const pub = await lerListaEscola('gestor', { forcar:true });
    const ver = (lista) => lista.map(e => e.nome_completo + ':' + e.id_turma + ':' + (e.status || 'Ativo')).sort().join(', ');
    return { trazido: trazido.entrou, local: ver(data.estudantes), publicada: ver(pub.dados.estudantes) };
  });
  const esperado = 'Ana Paula:10:Transferido, Bruno Silva:20:Ativo, Carla Dias:20:Ativo';
  console.log('1. B abre com a copia velha -> B ve: ' + r1.local);
  console.log('   lista publicada depois que B abriu: ' + r1.publicada);
  t('B fica com a versao de A (status e remanejamento)', r1.local === esperado);
  t('o remanejado nao vira dois', r1.local.split('Bruno').length === 2);
  t('B nao republica a lista velha', r1.publicada === esperado);

  // ============ 2. MESMA CONTA, DOIS APARELHOS (PACOTE CIFRADO) ============
  const r2 = await pa.evaluate(() => {
    const velho = { estudantes: [ {id:1, id_turma:10, nome_completo:'Ana Paula', status:'Ativo'} ] };
    const novo  = { estudantes: [ {id:1, id_turma:10, nome_completo:'Ana Paula', status:'Transferido', atualizadoEm:'2026-10-01T10:00:00.000Z'} ] };
    const a = JSON.parse(JSON.stringify(velho)); unirCamadaPessoal(a, novo);
    const c = JSON.parse(JSON.stringify(novo));  unirCamadaPessoal(c, velho);
    const empate = { estudantes: [ {id:9, nome_completo:'Zeca', status:'Ativo'} ] };
    unirCamadaPessoal(empate, { estudantes: [ {id:9, nome_completo:'Zeca', status:'NCOM'} ] });
    return { velhoRecebeNovo: a.estudantes.map(e => e.status).join(),
             novoIgnoraVelho: c.estudantes.map(e => e.status).join(),
             semCarimboFicaODaqui: empate.estudantes.map(e => e.status).join() };
  });
  t('aparelho velho recebe o status novo (' + r2.velhoRecebeNovo + ')', r2.velhoRecebeNovo === 'Transferido');
  t('aparelho novo nao volta ao velho (' + r2.novoIgnoraVelho + ')', r2.novoIgnoraVelho === 'Transferido');
  t('sem carimbo dos dois lados, fica o daqui (' + r2.semCarimboFicaODaqui + ')', r2.semCarimboFicaODaqui === 'Ativo');

  // ===== 3. ALTERACAO DE ANTES DO CARIMBO: "PUBLICAR AGORA" RESOLVE =========
  // O banco ja' tem a lista velha publicada por cima (o estrago de verdade), e as
  // duas copias estao sem carimbo. A abre o painel e aperta "Publicar agora".
  const pc = await novaAba(b);
  const certa = JSON.parse(JSON.stringify(LISTA)); certa[0].status = 'Transferido';
  await abrirPainel(pc, GESTOR_B, 'senha-b', LISTA, null);
  await pc.evaluate(async () => { await publicarListaEscola(data, 'gestor', { forcar:true }); });   // a velha no ar
  const pd = await novaAba(b);
  await abrirPainel(pd, GESTOR_A, 'senha-a', certa, await banco(pc));
  const r3a = await pd.evaluate(async () => {
    lembrarRetratoEstudantes(data);
    await trazerListaPublicadaParaGestor();
    lembrarRetratoEstudantes(data);
    await publicarListaEscolaAgora();
    return data.estudantes.find(e => e.id === 1).status;
  });
  await abrirPainel(pc, GESTOR_B, 'senha-b', LISTA, await banco(pd));      // B continua com a velha
  const r3 = await pc.evaluate(async () => {
    lembrarRetratoEstudantes(data);
    await trazerListaPublicadaParaGestor();
    await publicarListaEscola(data, 'gestor');
    limparCacheListaEscola();
    const pub = await lerListaEscola('gestor', { forcar:true });
    return { b: data.estudantes.find(e => e.id === 1).status,
             pub: pub.dados.estudantes.find(e => e.id === 1).status };
  });
  t('A continua com a sua versao ao abrir (' + r3a + ')', r3a === 'Transferido');
  t('depois do "Publicar agora", B recebe a versao de A (' + r3.b + ')', r3.b === 'Transferido');
  t('e a lista publicada continua a de A (' + r3.pub + ')', r3.pub === 'Transferido');

  console.log('\n' + (falhas ? '*** ' + falhas + ' FALHA(S) ***'
                             : 'OK: a copia velha de outro aparelho nao desfaz mais o que a gestao alterou'));
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
