// A LISTA DA GESTAO VOLTA A CHEGAR NO PROFESSOR.
//
// O estrago que originou isto: a adequacao tirou `estudantes` do documento em claro
// da gestao, e a camada pessoal de cada conta passou a ser cifrada com a chave DELA.
// `gestorData.estudantes` virou undefined, o bloco de sincronizacao de abrirTurma
// parou de rodar inteiro, e a lista do professor congelou no dia da virada:
// transferencia, matricula nova e exclusao feitas pela gestao nao chegavam a ninguem
// - sem erro, sem aviso, sem nada na tela.
//
// Aqui cobramos o conserto (listaescola.js) e as duas travas que impedem que ele
// custe mais caro do que o problema:
//   1. o nome do estudante NAO aparece em claro em lugar nenhum do banco;
//   2. professor sem a chave nao tem a turma apagada - ela so' fica parada;
//   3. painel que abriu sem dados nao publica lista vazia por cima da cheia.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CODIGO = 'ABCDEFGHJKMN';

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

const GESTOR = { id:'g1', uid:'g1', nome:'Gestora', email:'g@e.com', role:'gestor',
                 schoolId:'77', espacoId:'esp-1', legacySchoolId:'77' };
const PROF   = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor',
                 schoolId:'77', espacoId:'esp-1', legacySchoolId:'77' };

// Turmas do professor: 500 aponta para a 10 da gestao, 600 para a 20.
const TURMAS_PROF = [ { id:500, nome:'1A', masterId:10, disciplina:'Matematica' },
                      { id:600, nome:'2B', masterId:20, disciplina:'Matematica' } ];

async function novaAba(browser) {
  const p = await (await browser.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  return p;
}

// Prepara o espaco e guarda o codigo NESTE aparelho.
const PREPARAR_ESPACO = async (codigo, comCodigo) => {
  window.__docs['espacos/esp-1'] = { nome:'Escola Teste', salt:'salt-do-espaco', legacySchoolId:'77' };
  window.__docs['espacos_indice/' + (await hashCodigo(codigo))] = { espacoId:'esp-1' };
  if (comCodigo) await lembrarEspaco('esp-1', codigo, window.__docs['espacos/esp-1']);
  else await lembrarEspaco('esp-1', null, window.__docs['espacos/esp-1']);
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });

  // ====================== 1. A GESTAO PUBLICA =============================
  const pg = await novaAba(b);
  const r1 = await pg.evaluate(async ([u, codigo, preparar]) => {
    await eval('(' + preparar + ')')(codigo, true);
    currentUser = u; currentViewMode = 'gestor';
    window.dadosMigradosLocalmente = true;    // depois do corte
    window.usuarioOnlineCompleto = false;
    window.dadosCarregados = true;
    await desbloquearChaveBackup('g1', 'senha-da-gestora');
    window.pessoalCifradoLido = true;

    data = Object.assign(getInitialData(), {
      turmas: [ {id:10, nome:'1A', turno:'Manha'}, {id:20, nome:'2B', turno:'Manha'} ],
      estudantes: [ {id:1, id_turma:10, nome_completo:'Ana Paula', status:'Ativo'},
                    {id:2, id_turma:10, nome_completo:'Bruno Silva', status:'Ativo'},
                    {id:3, id_turma:20, nome_completo:'Carla Dias', status:'Ativo'} ] });

    await salvarDadosUsuario('app_data_school_77_gestor', data);
    const pub = await publicarListaEscola(data, 'gestor', { forcar:true });

    const claro = JSON.stringify(window.__docs['app_data/app_data_school_77_gestor'] || {});
    const publicado = JSON.stringify(window.__docs['app_data/lista_school_77_gestor'] || {});
    return { publicou: pub.estado,
             claroTemNome: claro.indexOf('Ana Paula') !== -1,
             existePublicado: !!window.__docs['app_data/lista_school_77_gestor'],
             publicadoTemNome: publicado.indexOf('Ana Paula') !== -1 };
  }, [GESTOR, CODIGO, PREPARAR_ESPACO.toString()]);
  console.log('1. gestao publica -> ' + r1.publicou
    + ' | nome no documento em claro? ' + r1.claroTemNome
    + ' | documento publicado existe: ' + r1.existePublicado
    + ' | da\' para ler o nome nele? ' + r1.publicadoTemNome);

  // ============ 2. O PROFESSOR COM O CODIGO RECEBE A LISTA ================
  const docs1 = await pg.evaluate(() => JSON.stringify(window.__docs));
  const pp = await novaAba(b);
  const r2 = await pp.evaluate(async ([u, codigo, preparar, turmas, docs]) => {
    window.__docs = JSON.parse(docs);
    await eval('(' + preparar + ')')(codigo, true);
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true;
    window.dadosCarregados = true;
    await desbloquearChaveBackup('p1', 'senha-do-professor');
    window.pessoalCifradoLido = true;
    data = Object.assign(getInitialData(), { turmas: turmas, estudantes: [] });

    await abrirTurma(500);
    await abrirTurma(600);
    const nomes = (id) => data.estudantes.filter(e => e.id_turma == id).map(e => e.nome_completo).sort();
    return { t500: nomes(500), t600: nomes(600) };
  }, [PROF, CODIGO, PREPARAR_ESPACO.toString(), TURMAS_PROF, docs1]);
  console.log('2. professor abre as turmas -> 1A: [' + r2.t500 + '] | 2B: [' + r2.t600 + ']');

  // ====== 3. A GESTAO MEXE NA LISTA: transfere, matricula e exclui =======
  const r3 = await pg.evaluate(async () => {
    data.estudantes = data.estudantes.filter(e => e.id !== 1);              // EXCLUSAO: Ana sai
    data.estudantes.find(e => e.id === 2).id_turma = 20;                    // TRANSFERENCIA: Bruno 1A -> 2B
    data.estudantes.push({ id:4, id_turma:10, nome_completo:'Diego Novo', status:'Ativo' });  // MATRICULA
    await salvarDadosUsuario('app_data_school_77_gestor', data);
    const pub = await publicarListaEscola(data, 'gestor', { forcar:true });
    return { publicou: pub.estado };
  });

  const docs2 = await pg.evaluate(() => JSON.stringify(window.__docs));
  const r4 = await pp.evaluate(async (docs) => {
    window.__docs = JSON.parse(docs);
    limparCacheListaEscola();                    // o professor volta depois do intervalo
    await abrirTurma(500);
    await abrirTurma(600);
    const nomes = (id) => data.estudantes.filter(e => e.id_turma == id).map(e => e.nome_completo).sort();
    return { t500: nomes(500), t600: nomes(600) };
  }, docs2);
  console.log('3. gestao transfere/matricula/exclui (' + r3.publicou + ') -> professor ve\' 1A: ['
    + r4.t500 + '] | 2B: [' + r4.t600 + ']');

  // ======== 4. PROFESSOR SEM O CODIGO: fica parado, NAO fica vazio ========
  const ps = await novaAba(b);
  const r5 = await ps.evaluate(async ([u, codigo, preparar, turmas, docs]) => {
    window.__docs = JSON.parse(docs);
    await eval('(' + preparar + ')')(codigo, false);      // entrou no espaco SEM guardar o codigo
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true;
    window.dadosCarregados = true;
    await desbloquearChaveBackup('p1', 'senha-do-professor');
    window.pessoalCifradoLido = true;
    // Este aparelho ja' tinha a turma montada de antes.
    data = Object.assign(getInitialData(), { turmas: turmas, estudantes: [
      { id:1, id_turma:500, nome_completo:'Ana Paula', status:'Ativo' },
      { id:2, id_turma:500, nome_completo:'Bruno Silva', status:'Ativo' } ] });

    const lida = await lerListaEscola('gestor', { forcar:true });
    await abrirTurma(500);
    const semCodigo = { estado: lida.estado,
                        sobrou: data.estudantes.filter(e => e.id_turma == 500).length,
                        temFaixa: !!document.getElementById('bannerListaEscolaSemChave') };

    // A saida que a faixa oferece: informar o codigo uma vez.
    let recusouOutraEscola = false;
    try { await guardarCodigoEscolaDigitado('ZZZZZZZZZZZZ'); }
    catch (e) { recusouOutraEscola = true; }

    await guardarCodigoEscolaDigitado(codigo);
    await abrirTurma(500);
    return { semCodigo: semCodigo,
             recusouOutraEscola: recusouOutraEscola,
             depois: data.estudantes.filter(e => e.id_turma == 500).map(e => e.nome_completo).sort() };
  }, [PROF, CODIGO, PREPARAR_ESPACO.toString(), TURMAS_PROF, docs2]);
  console.log('4. professor SEM o codigo -> leitura: ' + r5.semCodigo.estado
    + ' | alunos que sobraram na turma (tem de ser 2): ' + r5.semCodigo.sobrou
    + ' | faixa explicando: ' + r5.semCodigo.temFaixa);
  console.log('   informando o codigo -> codigo de outra escola recusado: ' + r5.recusouOutraEscola
    + ' | turma passa a mostrar: [' + r5.depois + ']');

  // ===== 5. PAINEL QUE ABRIU VAZIO NAO APAGA A LISTA DE TODO MUNDO =======
  const r6 = await pg.evaluate(async () => {
    const antes = JSON.stringify(window.__docs['app_data/lista_school_77_gestor']);
    const vazio = Object.assign(getInitialData(), { turmas: [], estudantes: [] });
    const r = await publicarListaEscola(vazio, 'gestor', { forcar:true });
    const depois = JSON.stringify(window.__docs['app_data/lista_school_77_gestor']);
    return { estado: r.estado, intacto: antes === depois };
  });
  console.log('5. painel vazio tenta publicar -> ' + r6.estado + ' | lista publicada intacta? ' + r6.intacto);

  const ok = r1.publicou === 'ok' && !r1.claroTemNome && r1.existePublicado && !r1.publicadoTemNome
          && String(r2.t500) === 'Ana Paula,Bruno Silva' && String(r2.t600) === 'Carla Dias'
          && r3.publicou === 'ok'
          && String(r4.t500) === 'Diego Novo' && String(r4.t600) === 'Bruno Silva,Carla Dias'
          && r5.semCodigo.estado === 'sem-codigo' && r5.semCodigo.sobrou === 2 && r5.semCodigo.temFaixa
          && r5.recusouOutraEscola && String(r5.depois) === 'Diego Novo'
          && r6.estado === 'recusado' && r6.intacto;

  console.log('\n' + (ok ? 'OK: o que a gestao muda na lista chega ao professor, e so\' a quem tem o codigo'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
