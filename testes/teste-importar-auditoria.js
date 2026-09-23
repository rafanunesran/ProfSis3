// AUDITORIA DA IMPORTACAO DE LISTAS: nada duplica, nenhum remanejado fica de fora.
//
// Reproduz, com duas turmas e um lote realista, os dois defeitos relatados ("duplicou alguns
// estudantes e nao puxou outros de remanejamentos") e as causas encontradas:
//   - nome escrito um pouco diferente (apostrofo, espaco, caixa) criava aluno novo;
//   - o aluno que saiu e voltou tem duas linhas na lista, e valia a PRIMEIRA ("Remanejamento");
//   - "Baixa - Transferencia" nao era reconhecida e caia como Ativo;
//   - a turma que ja tinha nome repetido atualizava o registro inativo;
//   - lista da turma errada desativava a turma inteira e criava todos de novo;
//   - a Limpeza de Duplicados juntava pelo nome na escola inteira e apagava o remanejado da
//     turma nova.
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
    auth:()=>({ currentUser:{uid:'g1',email:'g@e.com'}, onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return ()=>{}; }, signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

const n = (p, k) => Array.from({ length: k }, (_, i) => p + ' ALUNO ' + String(i + 1).padStart(2, '0'));
const A = n('ANA', 30), B = n('BIA', 30);

// Lista da 1A (separada por virgula, com aspas):
//   A05 saiu e voltou (duas linhas), A29 foi remanejada para a 1B, A30 baixa-transferencia,
//   Joao escrito com outro apostrofo, B30 chegou da 1B, e um aluno novo.
const csv1A = ['Nome do Aluno,RA,Situacao do Aluno',
  ...A.slice(0, 28).map(x => `"${x}",1,Ativo`),
  `"${A[4]}",1,Remanejamento`,
  `"${A[28]}",1,Remanejamento`,
  `"${A[29]}",1,Baixa - Transferência`,
  `"JOÃO D´ÁVILA",1,Ativo`,
  `"${B[29]}",1,Ativo`,
  `"NOVO DA 1A",1,Ativo`].join('\n');
// Linhas 0..27 incluem A05 como Ativo ANTES da linha "Remanejamento": vale o Ativo.

// Lista da 1B (ponto e virgula): alguns nomes com espaco e caixa diferentes, B30 remanejado
// para a 1A, A29 chegou da 1A.
const csv1B = ['Nome do Aluno;Situação do Aluno',
  ...B.slice(0, 29).map((x, i) => (i < 5 ? '  ' + x.toLowerCase().replace(' ', '  ') + ' ' : x) + ';Ativo'),
  `${B[29]};Remanejamento`,
  `${A[28]};Ativo`].join('\n');

// Aluno que saiu e voltou com a linha ATIVA DEPOIS da de remanejamento.
const csvVoltou = ['Nome do Aluno;Situação do Aluno', `${A[6]};Remanejamento`, `${A[6]};Ativo`].join('\n');

const arq = (nome, texto) => ({ name: nome, mimeType: 'text/csv', buffer: Buffer.from(texto) });

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  const iniciar = (dados) => p.evaluate(async ([A, B, extra]) => {
    currentUser = { id:'g1', uid:'g1', nome:'G', role:'gestor', schoolId:'77' }; currentViewMode = 'gestor';
    window.dadosCarregados = true; window.pessoalCifradoLido = true;
    let id = 1;
    const est = (lista, turma) => lista.map(x => ({ id: id++, id_turma: turma, nome_completo: x, status: 'Ativo' }));
    data = Object.assign(getInitialData(), {
      turmas: [ {id:10, nome:'1A', turno:'M'}, {id:20, nome:'1B', turno:'M'} ],
      estudantes: [ ...est(A, 10), ...est(B, 20),
        // Duplicado antigo na 1A: o mesmo Joao, uma vez inativo e outra ativo.
        { id: 900, id_turma: 10, nome_completo: "JOÃO D'ÁVILA", status: 'Transferido' },
        { id: 901, id_turma: 10, nome_completo: 'Joao D Avila', status: 'Ativo' } ],
      presencas: [ { id: 'f1', id_estudante: 900, data: '2026-03-02', status: 'falta' } ] }, extra || {});
  }, [A, B, dados]);

  const lote = async (arquivos) => {
    await p.evaluate(() => abrirModalImportacaoMassa());
    await p.setInputFiles('#filesMassa', arquivos);
    await p.waitForTimeout(900);
    return p.evaluate(async () => {
      const previa = importMassaItens.map(i => i.previa ? { criados: i.previa.criados.length, alterados: i.previa.alterados.length,
        sumiram: i.previa.sumiram.length, emOutra: i.previa.ativosEmOutra.length } : null);
      const turmas = importMassaItens.map(i => (importMassaGrupos.find(g => g.chave === i.grupoChave) || {}).rotulo || null);
      await processarImportacaoMassa();
      return { previa, turmas };
    });
  };
  const estado = () => p.evaluate(() => {
    const da = (t) => data.estudantes.filter(e => e.id_turma == t);
    const st = (t, nome) => da(t).filter(e => normalizarNomeImportMassa(e.nome_completo) === normalizarNomeImportMassa(nome)).map(e => e.status);
    return { n1A: da(10).length, n1B: da(20).length,
      A05: st(10, 'ANA ALUNO 05'), A29_1A: st(10, 'ANA ALUNO 29'), A29_1B: st(20, 'ANA ALUNO 29'),
      A30: st(10, 'ANA ALUNO 30'), B30_1A: st(10, 'BIA ALUNO 30'), B30_1B: st(20, 'BIA ALUNO 30'),
      B01: st(20, 'BIA ALUNO 01'), joao: st(10, 'JOAO D AVILA'), novo: st(10, 'NOVO DA 1A') };
  });

  // ============ 1. O LOTE: duas listas com o mesmo nome de arquivo ============
  await iniciar();
  const r1 = await lote([arq('Alunos.csv', csv1A), arq('Alunos.csv', csv1B)]);
  const e1 = await estado();
  console.log('1. lote -> turmas: ' + r1.turmas + ' | previa: ' + JSON.stringify(r1.previa));
  console.log('   1A: ' + e1.n1A + ' registros | 1B: ' + e1.n1B + ' registros');
  console.log('   A05 (saiu e voltou): ' + e1.A05 + ' | A29: 1A=' + e1.A29_1A + ' 1B=' + e1.A29_1B
    + ' | A30: ' + e1.A30 + ' | B30: 1A=' + e1.B30_1A + ' 1B=' + e1.B30_1B);
  console.log('   B01 (espaco/caixa): ' + e1.B01 + ' | Joao (duplicado antigo): ' + e1.joao + ' | novo: ' + e1.novo);

  // ============ 2. O MESMO LOTE DE NOVO: nada muda ============
  const r2 = await lote([arq('Alunos.csv', csv1A), arq('Alunos.csv', csv1B)]);
  const e2 = await estado();
  console.log('2. reimporta o mesmo lote -> previa: ' + JSON.stringify(r2.previa) + ' | 1A: ' + e2.n1A + ' | 1B: ' + e2.n1B);

  // ============ 3. Linha ativa DEPOIS da de remanejamento ============
  const r3 = await p.evaluate((t) => {
    const linhas = lerCsvMatriz(t);
    return extrairAlunosImportMassa(linhas, detectarColunasImportMassa(linhas)).map(a => a.status);
  }, csvVoltou);
  console.log('3. saiu e voltou (ativo na 2a linha) -> ' + r3);

  // ============ 4. So a lista de DESTINO do remanejamento ============
  await iniciar();
  const r4 = await lote([arq('Alunos.csv', csv1B)]);
  const e4 = await estado();
  console.log('4. so a lista da 1B -> A29 na 1B: ' + e4.A29_1B + ' | ainda ativa na 1A: ' + e4.A29_1A
    + ' | aviso de remanejamento pela metade: ' + r4.previa[0].emOutra);

  // ============ 5. Limpeza: junta o repetido na turma, nao o remanejado ============
  const r5 = await p.evaluate(async () => {
    if (!document.getElementById('registrosGestor')) {
      const d = document.createElement('div'); d.id = 'registrosGestor'; document.body.appendChild(d);
    }
    const antes = agruparDuplicadosLimpeza();
    await executarLimpezaDuplicados();
    const depois = agruparDuplicadosLimpeza();
    const joao = data.estudantes.filter(e => normalizarNomeImportMassa(e.nome_completo) === 'JOAO D AVILA');
    return { dupAntes: antes.duplicados.length, duasTurmas: antes.emDuasTurmas.map(([nome]) => nome),
             dupDepois: depois.duplicados.length, joao: joao.map(e => e.id + ':' + e.status),
             faltaFoiJunto: data.presencas.find(x => x.id === 'f1').id_estudante,
             a29: data.estudantes.filter(e => normalizarNomeImportMassa(e.nome_completo) === 'ANA ALUNO 29').map(e => e.id_turma) };
  });
  console.log('5. limpeza -> repetidos na mesma turma: ' + r5.dupAntes + ' -> ' + r5.dupDepois
    + ' | Joao ficou: ' + r5.joao + ' (falta foi para ' + r5.faltaFoiJunto + ')'
    + ' | ativo em 2 turmas (so aviso): ' + r5.duasTurmas + ' | A29 continua em: ' + r5.a29);

  // ============ 6. Lista da turma errada, escolhida a mao ============
  // A trava: nenhum aluno da 1A e' desativado. E a previa avisa, em vermelho, que os nomes
  // nao batem e quantos entrariam duplicados - quem escolhe a mao decide olhando para isso.
  await iniciar();
  await p.evaluate(() => abrirModalImportacaoMassa());
  await p.setInputFiles('#filesMassa', [arq('Alunos.csv', csv1B)]);
  await p.waitForTimeout(900);
  const r6 = await p.evaluate(() => {
    const chave1A = importMassaGrupos.find(g => g.rotulo === '1A').chave;
    alterarTurmaImportMassa(0, chave1A);
    const aviso = document.getElementById('previewMassa').textContent;
    const copia = JSON.parse(JSON.stringify(data.estudantes));
    const r = aplicarArquivoImportMassa(copia, 10, importMassaItens[0].alunos, criarGeradorIdImportMassa(copia));
    const originais = data.estudantes.filter(e => e.id_turma == 10 && e.status === 'Ativo').map(e => e.id);
    return { sumiram: r.sumiram.length,
             originaisAtivos: copia.filter(e => originais.indexOf(e.id) !== -1 && e.status === 'Ativo').length,
             totalOriginais: originais.length,
             avisou: aviso.indexOf('nome(s) em comum com esta turma') !== -1 };
  });
  console.log('6. lista da 1B escolhida a mao para a 1A -> desativados: ' + r6.sumiram + ' | ativos da 1A preservados: '
    + r6.originaisAtivos + '/' + r6.totalOriginais + ' | previa avisa: ' + r6.avisou);

  // ============ 7. Importacao pela tela da turma ============
  await iniciar();
  const r7 = await p.evaluate(async (t) => {
    await abrirTurma(20);
    const linhas = lerCsvMatriz(t);
    importarEstudantesArquivo = { linhas, colunas: detectarColunasImportMassa(linhas), rotulos: [] };
    await importarEstudantes({ preventDefault() {} });
    const da = data.estudantes.filter(e => e.id_turma == 20);
    const nomes = da.map(e => normalizarNomeImportMassa(e.nome_completo));
    return { total: da.length, repetidos: nomes.length - new Set(nomes).size,
             b30: da.filter(e => e.nome_completo === 'BIA ALUNO 30').map(e => e.status) };
  }, csv1B);
  console.log('7. pela tela da turma -> 1B: ' + r7.total + ' registros, repetidos: ' + r7.repetidos + ' | B30: ' + r7.b30);

  const ok =
       String(r1.turmas) === '1A,1B'
    && e1.n1A === 34 && e1.n1B === 31
    && String(e1.A05) === 'Ativo' && String(e1.A29_1A) === 'Remanejado' && String(e1.A29_1B) === 'Ativo'
    && String(e1.A30) === 'Baixa-Transferencia' && String(e1.B30_1A) === 'Ativo' && String(e1.B30_1B) === 'Remanejado'
    && String(e1.B01) === 'Ativo' && String(e1.joao.sort()) === 'Ativo,Transferido' && String(e1.novo) === 'Ativo'
    && r1.previa.every(x => x && x.emOutra === 0)
    && r2.previa.every(x => x && x.criados === 0 && x.alterados === 0 && x.sumiram === 0)
    && e2.n1A === 34 && e2.n1B === 31
    && String(r3) === 'Ativo'
    && String(e4.A29_1B) === 'Ativo' && String(e4.A29_1A) === 'Ativo' && r4.previa[0].emOutra === 1
    && r5.dupAntes === 1 && r5.dupDepois === 0 && String(r5.joao) === '901:Ativo' && r5.faltaFoiJunto === 901
    && String(r5.duasTurmas) === 'ANA ALUNO 29' && String(r5.a29.sort()) === '10,20'
    && r6.sumiram === 0 && r6.originaisAtivos === r6.totalOriginais && r6.totalOriginais === 31 && r6.avisou
    && r7.total === 31 && r7.repetidos === 0 && String(r7.b30) === 'Remanejado';

  console.log('\n' + (ok ? 'OK: importacao por turma e em massa sem duplicar e sem perder remanejado'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
