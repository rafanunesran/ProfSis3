// A TURMA DE UMA LISTA CSV E' RECONHECIDA PELOS NOMES, NAO PELO NOME DO ARQUIVO.
//
// As listas costumam sair todas com o mesmo nome de arquivo. O que identifica a turma e'
// a lista de estudantes: as mudancas de um ano (transferencia, matricula nova) nunca
// atingem a maioria, entao a lista certa sempre divide mais da metade dos nomes com a
// turma cadastrada. Cobrimos:
//   1. tres arquivos com o MESMO nome, cada um com mudancas, vao cada um para a sua turma;
//   2. uma turma pequena cujos poucos alunos aparecem numa lista grande NAO rouba a lista
//      (era o defeito de dividir os nomes em comum pelo menor dos dois tamanhos);
//   3. duas listas para a mesma turma: a mais parecida fica, a outra pede escolha
//      (aqui a lista identica ao cadastro ganha da lista com mudancas);
//   4. escolher a turma a mao e' respeitado e tira essa turma da disputa;
//   5. a pagina "Notas Oficiais" saiu do menu do gestor.
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

const nomes = (prefixo, n) => Array.from({ length: n }, (_, i) => prefixo + ' ALUNO ' + String(i + 1).padStart(2, '0'));
const csv = (lista) => 'Nome do Aluno;Situacao do Aluno\n' + lista.map(n => n + ';Ativo').join('\n') + '\n';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  const A = nomes('ANA', 36), B = nomes('BIA', 34), C = nomes('CAIO', 3);
  await p.evaluate(async ([A, B, C]) => {
    currentUser = { id:'g1', uid:'g1', nome:'G', role:'gestor', schoolId:'77' }; currentViewMode = 'gestor';
    window.dadosCarregados = true; window.pessoalCifradoLido = true;
    let id = 1;
    const est = (lista, turma) => lista.map(n => ({ id: id++, id_turma: turma, nome_completo: n, status: 'Ativo' }));
    data = Object.assign(getInitialData(), {
      turmas: [ {id:10, nome:'1A', turno:'M'}, {id:20, nome:'1B', turno:'M'}, {id:30, nome:'2C', turno:'M'} ],
      estudantes: [ ...est(A, 10), ...est(B, 20), ...est(C, 30) ] });
    abrirModalImportacaoMassa();
  }, [A, B, C]);

  // 1A: 3 transferidos saem, 2 entram, e os 3 alunos da turma pequena 2C foram
  //     remanejados para ela (aparecem na lista). 1B: 4 saem, 5 entram. 2C: igual.
  const lista1A = [...A.slice(3), 'NOVO UM', 'NOVO DOIS', ...C];
  const lista1B = [...B.slice(4), ...nomes('NOVATO', 5)];
  const lista2C = [...C];
  const arquivo = (lista) => ({ name: 'Alunos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(lista)) });

  await p.setInputFiles('#filesMassa', [arquivo(lista1B), arquivo(lista1A), arquivo(lista2C)]);
  await p.waitForTimeout(800);
  const r1 = await p.evaluate(() => importMassaItens.map(i => {
    const g = importMassaGrupos.find(x => x.chave === i.grupoChave);
    return i.nomeArquivo + '=' + (g ? g.rotulo : '(' + i.motivo + ')');
  }));
  console.log('1-2. tres "Alunos.csv" -> ' + r1.join(' | '));

  // 3. Duas listas da 1A (uma velha, uma nova).
  await p.setInputFiles('#filesMassa', [arquivo(lista1A), arquivo(A)]);
  await p.waitForTimeout(800);
  const r3 = await p.evaluate(() => importMassaItens.map(i => {
    const g = importMassaGrupos.find(x => x.chave === i.grupoChave);
    return (g ? g.rotulo : '(' + i.motivo + ')');
  }));
  console.log('3. duas listas da 1A -> ' + r3.join(' | '));

  // 4. Escolher a mao: a lista da 1B vai para a 2C por decisao de quem importa.
  await p.setInputFiles('#filesMassa', [arquivo(lista1B), arquivo(lista2C)]);
  await p.waitForTimeout(800);
  const r4 = await p.evaluate(() => {
    const chave2C = importMassaGrupos.find(g => g.rotulo.indexOf('2C') === 0).chave;
    alterarTurmaImportMassa(0, chave2C);
    return importMassaItens.map(i => {
      const g = importMassaGrupos.find(x => x.chave === i.grupoChave);
      return (g ? g.rotulo : '(' + i.motivo + ')');
    });
  });
  console.log('4. 1B escolhida a mao para a 2C -> ' + r4.join(' | '));

  // 5. Notas Oficiais fora do menu.
  const r5 = await p.evaluate(() => {
    try { renderGestorPanel(); } catch (e) {}
    const html = document.body.innerHTML;
    return { menuDesenhado: html.indexOf("showScreen('ocorrenciasGestor'") !== -1,
             menu: html.indexOf("showScreen('notasOficiaisGestor'") !== -1,
             funcao: typeof renderNotasOficiaisGestor !== 'undefined' };
  });
  console.log('5. menu do gestor desenhado: ' + r5.menuDesenhado + ' | Notas Oficiais no menu? ' + r5.menu + ' | tela ainda existe? ' + r5.funcao);

  const ok = String(r1) === 'Alunos.csv (1)=1B,Alunos.csv (2)=1A,Alunos.csv (3)=2C'
          && String(r3) === '(ocupada),1A'
          && String(r4) === '2C,(ocupada)'
          && r5.menuDesenhado && !r5.menu && !r5.funcao;
  console.log('\n' + (ok ? 'OK: a turma de cada lista e\' reconhecida pelos nomes, mesmo com o mesmo nome de arquivo'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
