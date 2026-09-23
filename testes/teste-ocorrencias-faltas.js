// AS OCORRENCIAS VOLTAM AO GESTOR E AS FALTAS VOLTAM A SER DA ESCOLA.
//
// O estrago: com `ocorrencias` e `presencas` fora do documento em claro e a camada
// pessoal cifrada com a chave de CADA conta, duas coisas pararam em silencio:
//   - a ocorrencia do professor so' era copiada para o documento da gestao antes do
//     corte - depois dele, o gestor nao via mais nenhuma;
//   - a Busca Ativa lia `presencas` do documento de cada professor e passou a achar
//     zero falta na escola inteira.
//
// O conserto (listaescola.js): cada professor publica o SEU recorte - ocorrencias e
// faltas das turmas da gestao - cifrado com a chave da escola. Cobrimos:
//   1. o recorte existe e nao da' para ler nome, relato nem falta nele;
//   2. a ocorrencia chega ao painel do gestor, e a devolutiva volta ao professor;
//   3. a falta de um professor aparece para o colega na chamada do mesmo dia;
//   4. a Busca Ativa do gestor volta a contar as faltas;
//   5. aparelho que abriu vazio nao apaga da escola o recorte cheio;
//   6. o CSV: separador por virgula, aspas, e coluna escolhida a mao quando o
//      cabecalho nao e' reconhecido.
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

const GESTOR = { id:'g1', uid:'g1', nome:'Gestora', email:'g@e.com', role:'gestor', schoolId:'77', legacySchoolId:'77' };
const PROF1  = { id:'p1', uid:'p1', nome:'Paulo Prof', email:'p1@e.com', role:'professor', schoolId:'77', legacySchoolId:'77' };
const PROF2  = { id:'p2', uid:'p2', nome:'Rita Prof', email:'p2@e.com', role:'professor', schoolId:'77', legacySchoolId:'77' };
const USERS  = { list: [GESTOR, PROF1, PROF2] };

const HOJE = new Date().toISOString().slice(0, 10);

async function novaAba(browser) {
  const p = await (await browser.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  return p;
}

// Entra como `u` no painel `modo`, com os documentos `docs` no banco falso.
async function entrar(p, u, modo, docs, dados) {
  return p.evaluate(async ([u, modo, docs, dados]) => {
    window.__docs = JSON.parse(docs);
    currentUser = u; currentViewMode = modo;
    window.dadosMigradosLocalmente = true;
    window.usuarioOnlineCompleto = false;
    window.dadosCarregados = true;
    await desbloquearChaveBackup(u.uid, 'senha-' + u.uid);
    window.pessoalCifradoLido = true;
    limparCacheListaEscola();
    data = Object.assign(getInitialData(), dados);
  }, [u, modo, docs, dados]);
}

const banco = (p) => p.evaluate(() => JSON.stringify(window.__docs));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });

  // ====================== 0. A GESTAO PUBLICA A LISTA ======================
  const pg = await novaAba(b);
  await entrar(pg, GESTOR, 'gestor', JSON.stringify({ 'system/users_list': USERS }), {
    turmas: [ {id:10, nome:'1A', turno:'Manha'} ],
    estudantes: [ {id:1, id_turma:10, nome_completo:'Ana Paula', status:'Ativo'},
                  {id:2, id_turma:10, nome_completo:'Bruno Silva', status:'Ativo'} ] });
  await pg.evaluate(async () => {
    await salvarDadosUsuario('app_data_school_77_gestor', data);
    await publicarListaEscola(data, 'gestor', { forcar:true });
  });

  // ======= 1. PROFESSOR 1: ocorrencia e chamada com falta ==================
  const p1 = await novaAba(b);
  await entrar(p1, PROF1, 'professor', await banco(pg), {
    turmas: [ {id:500, nome:'1A', masterId:10, disciplina:'Matematica'} ], estudantes: [] });
  const r1 = await p1.evaluate(async (hoje) => {
    await abrirTurma(500);
    await registrarOcorrenciaNoBanco({ ids:[1], texto:'Relato sigiloso da ocorrencia', tipo:'disciplinar' });
    data.presencas.push({ id: novoId(), id_estudante: 1, data: hoje, status: 'falta' });
    const pub = await publicarContribuicaoProfessor(data, { forcar:true });
    const doc = JSON.stringify(window.__docs['app_data/lista_school_77_prof_p1'] || {});
    return { estado: pub.estado, existe: doc.length > 2,
             vaza: ['Ana Paula', 'Relato sigiloso', 'ids_estudantes'].filter(t => doc.indexOf(t) !== -1) };
  }, HOJE);
  console.log('1. professor publica o recorte -> ' + r1.estado + ' | existe: ' + r1.existe
    + ' | texto legivel no banco: [' + r1.vaza + ']');

  // ======= 2. GESTOR VE A OCORRENCIA; A DEVOLUTIVA VOLTA AO PROFESSOR =====
  const docs1 = await banco(p1);
  const r2 = await pg.evaluate(async (docs) => {
    window.__docs = JSON.parse(docs);
    limparCacheListaEscola();
    const antes = (data.ocorrencias || []).length;
    const trouxe = await trazerOcorrenciasDosProfessores();
    const o = data.ocorrencias[0] || {};
    // A gestao confirma e responde; a resposta sai pela lista publicada.
    o.status = 'confirmada'; o.devolutiva = 'Familia convocada';
    // Uma segunda leitura NAO pode desfazer o que a gestao decidiu.
    limparCacheListaEscola();
    await trazerOcorrenciasDosProfessores();
    await salvarDadosUsuario('app_data_school_77_gestor', data);
    await publicarListaEscola(data, 'gestor', { forcar:true });
    return { antes, trouxe, relato: o.relato, turma: o.id_turma, status: o.status, devolutiva: o.devolutiva };
  }, docs1);
  console.log('2. gestor -> tinha ' + r2.antes + ', chegaram ' + r2.trouxe + ' | relato: "' + r2.relato
    + '" | turma da gestao: ' + r2.turma + ' | status apos 2a leitura: ' + r2.status);

  const r3 = await p1.evaluate(async (docs) => {
    window.__docs = JSON.parse(docs);
    limparCacheListaEscola();
    await abrirTurma(500);
    const o = data.ocorrencias[0];
    return { status: o.status, devolutiva: o.devolutiva, turmaLocal: o.id_turma };
  }, await banco(pg));
  console.log('   professor reabre a turma -> status: ' + r3.status + ' | devolutiva: "' + r3.devolutiva
    + '" | turma local preservada: ' + r3.turmaLocal);

  // ======= 3. O COLEGA VE A FALTA DO DIA NA CHAMADA =======================
  const p2 = await novaAba(b);
  await entrar(p2, PROF2, 'professor', await banco(p1), {
    turmas: [ {id:900, nome:'1A', masterId:10, disciplina:'Historia'} ], estudantes: [] });
  const r4 = await p2.evaluate(async (hoje) => {
    await abrirTurma(900);
    const f = await getFaltasCompartilhadas(hoje);
    return { aluno1: f['1'] || [], aluno2: f['2'] || [] };
  }, HOJE);
  console.log('3. colega abre a chamada de hoje -> Ana faltou para: [' + r4.aluno1 + '] | Bruno: [' + r4.aluno2 + ']');

  // ======= 4. A BUSCA ATIVA DO GESTOR VOLTA A CONTAR ======================
  const r5 = await pg.evaluate(async ([docs, hoje]) => {
    window.__docs = JSON.parse(docs);
    limparCacheListaEscola();
    const div = document.createElement('div'); div.id = 'registrosGestorContent';
    document.body.appendChild(div);
    await renderAbaAlertasBuscaAtiva(true);
    const dia = (cacheBuscaAtiva.attendanceData || {})[hoje] || {};
    const dias = cacheBuscaAtiva.daysByTurma['10'] ? Array.from(cacheBuscaAtiva.daysByTurma['10']) : [];
    return { faltaAna: dia['1'] || [], diasTurma10: dias };
  }, [await banco(p1), HOJE]);
  console.log('4. busca ativa -> falta da Ana hoje por: [' + r5.faltaAna + '] | dias com chamada na 1A: ' + r5.diasTurma10.length);

  // ======= 5. APARELHO VAZIO NAO APAGA O RECORTE CHEIO ====================
  const pv = await novaAba(b);
  await entrar(pv, PROF1, 'professor', await banco(p1), {
    turmas: [ {id:500, nome:'1A', masterId:10, disciplina:'Matematica'} ], estudantes: [] });
  const r6 = await pv.evaluate(async () => {
    const antes = JSON.stringify(window.__docs['app_data/lista_school_77_prof_p1']);
    const r = await publicarContribuicaoProfessor(data, { forcar:true });
    return { estado: r.estado, intacto: antes === JSON.stringify(window.__docs['app_data/lista_school_77_prof_p1']) };
  });
  console.log('5. aparelho vazio tenta publicar -> ' + r6.estado + ' | recorte intacto? ' + r6.intacto);

  // ======= 6. CSV: virgula, aspas, e coluna escolhida a mao ===============
  const r7 = await pg.evaluate(async () => {
    const ler = async (nome, texto) => lerMatrizArquivoImportMassa(new File([texto], nome, { type:'text/csv' }));
    const a = await ler('lista.csv', 'Lista da turma\nAno: 2026\nNome do Estudante,Documento,Situacao\n"SOUZA, CARLOS",123,Transferida\nDANI LIMA,456,Ativo\n');
    const ca = detectarColunasImportMassa(a);
    const alunosA = extrairAlunosImportMassa(a, ca).map(x => x.nome + ':' + x.status);

    const bb = await ler('outra.csv', 'Coluna1;Coluna2\nEVA MELO;Ativo\nFABIO REIS;Remanejado\n');
    const cb = detectarColunasImportMassa(bb) || colunasManuaisImportMassa(bb);
    const antesDeEscolher = cb.idxNome;
    cb.idxNome = 0; cb.idxSituacao = 1;
    const alunosB = extrairAlunosImportMassa(bb, cb).map(x => x.nome + ':' + x.status);
    return { alunosA, antesDeEscolher, alunosB };
  });
  console.log('6. CSV com virgula e aspas -> [' + r7.alunosA + ']');
  console.log('   CSV sem cabecalho conhecido -> coluna do nome antes de escolher: ' + r7.antesDeEscolher
    + ' | depois: [' + r7.alunosB + ']');

  const ok = r1.estado === 'ok' && r1.existe && r1.vaza.length === 0
          && r2.antes === 0 && r2.trouxe === 1 && r2.relato === 'Relato sigiloso da ocorrencia'
          && String(r2.turma) === '10' && r2.status === 'confirmada'
          && r3.status === 'confirmada' && r3.devolutiva === 'Familia convocada' && String(r3.turmaLocal) === '500'
          && String(r4.aluno1) === 'p1' && r4.aluno2.length === 0
          && String(r5.faltaAna) === 'p1' && r5.diasTurma10.length === 1
          && r6.estado === 'recusado' && r6.intacto
          && String(r7.alunosA) === 'SOUZA, CARLOS:Transferido,DANI LIMA:Ativo'
          && r7.antesDeEscolher === -1
          && String(r7.alunosB) === 'EVA MELO:Ativo,FABIO REIS:Remanejado';

  console.log('\n' + (ok ? 'OK: ocorrencias chegam ao gestor, faltas voltam a ser da escola, e o CSV e\' mapeado'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
