// Histórico de documentos (Estagiário) e relatórios do Na Mosca! vão com a conta, não
// com o aparelho: o que foi gerado num aparelho aparece no outro (pela camada pessoal
// cifrada), em ordem do mais recente, e o que foi apagado num não volta do outro.
// Também confere que os relatórios antigos guardados só no localStorage sobem.
const { chromium } = require('playwright');

const FAKE = () => {
  window.__docs = {};
  const ref = (col,id) => ({
    get: async () => { const d = window.__docs[col+'/'+id]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[col+'/'+id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col+'/'+id]; } });
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};
const USUARIO = { id:1, uid:'u1', nome:'Maria', email:'m@e.com', role:'professor', schoolId:'77' };
const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHAVE = 'app_data_u1';

async function abrir(b) {
  const p = await (await b.newContext()).newPage();
  p.on('dialog', async d => await d.accept());
  await p.route(/gstatic\.com/, r => r.abort());   // o Firebase de verdade apagaria o banco falso
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  return p;
}
const banco = (p) => p.evaluate(() => JSON.stringify(window.__docs));
const usarBanco = (p, docs) => p.evaluate((d) => { window.__docs = JSON.parse(d); }, docs);

// Abre a conta como a página faz: carrega e, se a nuvem perdeu algo daqui, reenvia.
const ABRIR_CONTA = async (u) => {
  currentUser = u; currentViewMode = 'professor';
  window.dadosMigradosLocalmente = true; window.usuarioOnlineCompleto = false;
  window.pessoalFaltaNaNuvem = null;
  await desbloquearChaveBackup('u1', 'senha-da-conta');
  const ok = await carregarDadosUsuario();
  window.dadosCarregados = ok !== false;
  const faltava = window.pessoalFaltaNaNuvem;
  if (window.dadosCarregados && faltava && !window.bloquearEscritaNuvem) await persistirDados();
  return faltava;
};
const RESUMO = () => ({ oc: (data.ocorrencias||[]).map(o => o.id).sort(),
                         tr: (data.trabalhos||[]).map(t => t.id).sort(),
                         est: (data.estudantes||[]).length });


(async () => {
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium' });
  const base = { turmas:[{id:1,nome:'1A'}], estudantes:[{id:7,nome_completo:'Ana Paula'}] };
  const abrirStr = ABRIR_CONTA.toString();
  const resultados = [];
  const ok = (nome, cond, extra) => { resultados.push(!!cond); console.log((cond ? 'ok   ' : 'FALHA ') + nome + (extra ? '  -> ' + extra : '')); };

  // 1. Celular (B): já usado, gera um plano de aula e tem um relatório do quiz antigo só no localStorage.
  const pB = await abrir(b);
  await pB.evaluate(async ([u, base]) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true; window.usuarioOnlineCompleto = false;
    await desbloquearChaveBackup('u1', 'senha-da-conta');
    window.pessoalCifradoLido = true;
    data = Object.assign(getInitialData(), base);
    localStorage.setItem('sisprof_quiz_relatorios_u1', JSON.stringify([{ id:'rel-velho', titulo:'Quiz antigo', data:'2026-10-01T10:00:00Z', jogadores:[], perguntas:[] }]));
    registrarDocumentoNoHistoricoProfessor({ tipo:'plano_aula', titulo:'Plano B1', ts: Date.now() - 60000 });
    registrarDocumentoNoHistoricoProfessor({ tipo:'agenda_mensal', titulo:'Agenda B', ts: Date.now() - 50000 });
    qzRelatoriosConta.ler();   // abre a aba do quiz: migra o relatório antigo pra conta
    await salvarDadosUsuario('app_data_u1', data);
  }, [USUARIO, base]);
  const nuvem1 = JSON.parse(await banco(pB));
  ok('nada do histórico vai em claro no documento da nuvem', !JSON.stringify(nuvem1['app_data/app_data_u1'] || {}).match(/historicoDocumentos|relatoriosQuiz|Plano B1/));
  ok('existe o pacote cifrado da camada pessoal', !!nuvem1['app_data/pessoal_app_data_u1']);
  ok('o relatório antigo saiu do localStorage (foi pra conta)', await pB.evaluate(() => localStorage.getItem('sisprof_quiz_relatorios_u1') === null));

  // 2. Computador (A), navegador limpo: vê tudo e gera mais um documento e um relatório.
  const pA = await abrir(b);
  await usarBanco(pA, await banco(pB));
  const r2 = await pA.evaluate(async ([u, s]) => {
    await (eval('(' + s + ')'))(u);
    const viu = lerHistoricoDocumentosProfessor().map(h => h.titulo);
    const rel = qzRelatoriosConta.ler().map(r => r.id);
    registrarDocumentoNoHistoricoProfessor({ tipo:'plano_aula', titulo:'Plano A' });
    qzRelatoriosConta.guardar({ titulo:'Quiz novo', data: new Date().toISOString(), jogadores:[{apelido:'Ana'}], perguntas:[] });
    await persistirDados();
    return { viu, rel };
  }, [USUARIO, abrirStr]);
  ok('computador limpo vê os documentos do celular', JSON.stringify(r2.viu) === JSON.stringify(['Agenda B', 'Plano B1']), JSON.stringify(r2.viu));
  ok('computador limpo vê o relatório do quiz do celular', JSON.stringify(r2.rel) === JSON.stringify(['rel-velho']), JSON.stringify(r2.rel));

  // 3. Celular abre de novo (tem cópia própria): junta e mostra em ordem; depois apaga "Plano B1".
  await usarBanco(pB, await banco(pA));
  const r3 = await pB.evaluate(async ([u, s]) => {
    await (eval('(' + s + ')'))(u);
    const viu = lerHistoricoDocumentosProfessor().map(h => h.titulo);
    const rel = qzRelatoriosConta.ler().map(r => r.titulo);
    const alvo = lerHistoricoDocumentosProfessor().find(h => h.titulo === 'Plano B1');
    await excluirDocumentoHistoricoProfessor(alvo.id);
    qzRelatoriosConta.apagar('rel-velho');
    await persistirDados();
    return { viu, rel };
  }, [USUARIO, abrirStr]);
  ok('celular junta o do computador e põe o mais recente em cima', JSON.stringify(r3.viu) === JSON.stringify(['Plano A', 'Agenda B', 'Plano B1']), JSON.stringify(r3.viu));
  ok('celular vê o relatório novo do computador em cima', JSON.stringify(r3.rel) === JSON.stringify(['Quiz novo', 'Quiz antigo']), JSON.stringify(r3.rel));

  // 4. Computador (ainda com cópia que tem "Plano B1") reabre: o apagado não volta, nem pra nuvem.
  await usarBanco(pA, await banco(pB));
  const r4 = await pA.evaluate(async ([u, s]) => {
    await (eval('(' + s + ')'))(u);
    await persistirDados();
    return { viu: lerHistoricoDocumentosProfessor().map(h => h.titulo), rel: qzRelatoriosConta.ler().map(r => r.id) };
  }, [USUARIO, abrirStr]);
  ok('documento apagado no celular não volta no computador', JSON.stringify(r4.viu) === JSON.stringify(['Plano A', 'Agenda B']), JSON.stringify(r4.viu));
  ok('relatório apagado no celular não volta no computador', r4.rel.indexOf('rel-velho') === -1, JSON.stringify(r4.rel));

  const pC = await abrir(b);
  await usarBanco(pC, await banco(pA));
  const r5 = await pC.evaluate(async ([u, s]) => {
    await (eval('(' + s + ')'))(u);
    return lerHistoricoDocumentosProfessor().map(h => h.titulo);
  }, [USUARIO, abrirStr]);
  ok('navegador limpo depois de tudo vê a lista certa', JSON.stringify(r5) === JSON.stringify(['Plano A', 'Agenda B']), JSON.stringify(r5));

  const tudo = resultados.every(Boolean);
  console.log('\n' + (tudo ? 'OK: histórico e relatórios acompanham a conta' : '*** FALHOU ***'));
  await b.close();
  process.exit(tudo ? 0 : 1);
})();
