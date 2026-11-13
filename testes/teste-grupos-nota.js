// TRABALHO EM GRUPO: A NOTA DE UM VAI PARA O GRUPO TODO.
//
// Na aba Trabalhos, o botão 👥 de uma atividade monta grupos. Lançar a nota de um
// estudante do grupo lança para os colegas; "Só para Fulano" desfaz nos colegas e deixa
// a nota própria só nele; quem tem nota própria não é sobrescrito pela nota do grupo.
// Cobre também rubrica (critérios valem para o grupo), sortear, copiar grupos de outra
// atividade e que estudante sem grupo continua igual a antes.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';

const FAKE = () => {
  window.__docs = {};
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'p1',email:'p@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => { if (d.type() === 'prompt') await d.accept('6'); else await d.accept(); });
  await p.route(/gstatic\.com/, r => r.abort());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  const r = await p.evaluate(async () => {
    persistirDados = async () => {};
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'1A', disciplina:'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Paula', status:'Ativo' },
                    { id:'ab-2', id_turma:500, nome_completo:'Bruno Silva', status:'Ativo' },
                    { id:3, id_turma:500, nome_completo:'Carla Souza', status:'Ativo' },
                    { id:4, id_turma:500, nome_completo:'Davi Lima', status:'Ativo' },
                    { id:5, id_turma:500, nome_completo:'Eva Reis', status:'Ativo' } ],
      trabalhos: [
        { id:11, id_turma:500, titulo:'Seminario', tipo:'comum', peso:10, rubricas:[], bimestre:1 },
        { id:12, id_turma:500, titulo:'Maquete', tipo:'rubrica', peso:4, bimestre:1,
          rubricas:[ {id:1, nome:'Fala', peso:2}, {id:2, nome:'Slides', peso:2} ] },
        { id:13, id_turma:500, titulo:'Caderno', tipo:'caderno_auto', peso:10, rubricas:[], bimestre:1 } ],
      notas: [] });
    turmaAtual = 500;
    if (!document.getElementById('tabTrabalhos')) { const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d); }
    currentBimestreTrabalhos = 1;
    renderTrabalhos();
    const v = (t, e) => { const n = data.notas.find(n => n.id_trabalho == t && String(n.id_estudante) === String(e)); return n ? String(n.valor) : ''; };
    const out = {};
    out.botaoSoNasQueAceitam = document.querySelectorAll('#tabTrabalhos .btn-grupos').length === 2;

    // Monta Grupo 1 = Ana, Bruno, Carla na atividade comum
    abrirModalGrupos(11);
    document.querySelectorAll('#semGrupoLista .sem-grupo-item').forEach(c => { if (['1','ab-2','3'].includes(c.value)) c.checked = true; });
    await criarGrupoComMarcados();
    const g = data.trabalhos[0].grupos[0];
    out.grupoCriado = g && g.nome === 'Grupo 1' && g.membros.length === 3 && g.membros.includes('ab-2') && g.membros.includes(1);
    closeModal('modalNovoTrabalho'); renderTrabalhos();
    out.etiqueta = document.querySelectorAll('#tabTrabalhos .etiqueta-grupo').length === 3;

    // Lança 8 na Ana: vai para Bruno e Carla, não para Davi
    await salvarNota(11, '1', '8');
    out.replicou = [v(11,1), v(11,'ab-2'), v(11,3)].join() === '8,8,8' && v(11,4) === '';
    out.celulaColega = document.querySelector('#tabTrabalhos input[data-nota="11|ab-2"]').value === '8';
    out.aviso = /Só para Ana/.test(document.getElementById('avisoGrupoNota').textContent);

    // Lança 9,5 no Bruno e depois "Só para Bruno"
    await salvarNota(11, 'ab-2', '9,5');
    out.tudo95 = [v(11,1), v(11,'ab-2'), v(11,3)].join() === '9,5,9,5,9,5';
    await desfazerAvisoGrupo();
    out.soBruno = v(11,1) === '8' && v(11,3) === '8' && v(11,'ab-2') === '9,5';
    out.brunoProprio = !!data.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 'ab-2').notaPropria;
    out.notaGrupoVoltou = g.nota === '8';

    // Nova nota do grupo não mexe no Bruno
    await salvarNota(11, 3, '7');
    out.naoSobrescreve = v(11,1) === '7' && v(11,3) === '7' && v(11,'ab-2') === '9,5';
    // Digitar no Bruno muda só ele
    await salvarNota(11, 'ab-2', '10');
    out.proprioSoEle = v(11,'ab-2') === '10' && v(11,1) === '7';
    // Pela janela: nota do grupo 6 avisa que Bruno ficou de fora; "↺ do grupo" o traz de volta
    abrirModalGrupos(11);
    await lancarNotaDoGrupo(g.id, '6');
    out.janelaNotaGrupo = v(11,1) === '6' && v(11,3) === '6' && v(11,'ab-2') === '10';
    out.avisoPulados = /Bruno/.test(document.getElementById('avisoGrupoNota').textContent);
    fecharAvisoGrupo();
    await voltarNotaDoGrupo('ab-2');
    out.voltou = v(11,'ab-2') === '6' && !data.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 'ab-2').notaPropria;
    // ✎ na janela (prompt responde 6 -> igual, mas fica própria) e tirar do grupo
    await darNotaPropria(3);
    out.lapis = !!data.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 3).notaPropria;
    await tirarDoGrupo(3);
    out.tirou = g.membros.length === 2 && v(11,3) === '6';

    // Sem grupo continua como antes
    await salvarNota(11, 4, '5');
    out.semGrupoIgual = v(11,4) === '5' && v(11,1) === '6';

    // Média recalculada para colega
    renderTrabalhos();
    out.media = document.getElementById('media-est-current-ab-2').textContent.trim() !== '-';

    // Sortear os sem grupo (Carla, Davi, Eva) em grupos de 3 -> um grupo novo de 3
    abrirModalGrupos(11);
    document.getElementById('tamanhoSorteio').value = '3';
    await sortearGrupos();
    out.sorteio = data.trabalhos[0].grupos.length === 2 && data.trabalhos[0].grupos[1].membros.length === 3;

    // Copiar grupos para a rubrica
    abrirModalGrupos(12);
    document.getElementById('copiarGruposDe').value = '11';
    await copiarGruposDeOutra();
    const gr = data.trabalhos[1].grupos;
    out.copiou = gr.length === 2 && gr[0].membros.length === 2;
    closeModal('modalNovoTrabalho');
    // Marca critério 1 na Ana -> Bruno também ganha
    await toggleRubrica(12, '1', 1, true);
    out.rubricaGrupo = v(12,1) === '2' && v(12,'ab-2') === '2';
    await desfazerAvisoGrupo();
    out.rubricaSoAna = v(12,1) === '2' && (v(12,'ab-2') === '0' || v(12,'ab-2') === '') && !!data.notas.find(n => n.id_trabalho == 12 && n.id_estudante === 1).notaPropria;
    // Dois aparelhos: o outro tem a cópia velha (sem grupos, notas antigas). Na junção
    // (unirCamadaPessoal) os grupos e as notas novas têm que chegar lá, e a cópia velha
    // não pode apagar os grupos daqui.
    const velho = JSON.parse(JSON.stringify(data));
    velho.trabalhos.forEach(t => { delete t.grupos; delete t.atualizadoEm; });
    velho.notas = velho.notas.filter(n => n.id_trabalho != 11).map(n => { const c = Object.assign({}, n); delete c.atualizadoEm; return c; });
    const novo = JSON.parse(JSON.stringify(data));
    out.carimbou = !!novo.trabalhos[0].atualizadoEm && novo.notas.filter(n => n.id_trabalho == 11).every(n => n.atualizadoEm);
    const outro = JSON.parse(JSON.stringify(velho));
    unirCamadaPessoal(outro, novo);
    out.chegouNoOutro = (outro.trabalhos[0].grupos || []).length === 2 && (outro.trabalhos[1].grupos || []).length === 2
      && outro.notas.filter(n => n.id_trabalho == 11 && n.valor === '6').length === 3;
    const aqui = JSON.parse(JSON.stringify(novo));
    unirCamadaPessoal(aqui, velho);
    out.velhoNaoApaga = (aqui.trabalhos[0].grupos || []).length === 2;
    // Nota mudada depois (outro aparelho tinha a mesma nota com carimbo antigo)
    const antigo = JSON.parse(JSON.stringify(data));
    await salvarNota(11, 4, '8,5');
    const depois = JSON.parse(JSON.stringify(data));
    unirCamadaPessoal(antigo, depois);
    out.notaEditadaChega = antigo.notas.find(n => n.id_trabalho == 11 && n.id_estudante === 4).valor === '8,5';
    // Automática não aceita grupos
    out.autoSemGrupo = !atividadeAceitaGrupos(data.trabalhos[2]);
    return out;
  });
  await b.close();
  let falhou = false;
  Object.entries(r).forEach(([k, v]) => { console.log((v ? 'OK   ' : 'FALHA') + ' ' + k); if (!v) falhou = true; });
  process.exit(falhou ? 1 : 0);
})();
