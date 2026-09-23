// Dois aparelhos, a mesma conta: o aparelho com cópia velha NÃO apaga o que o outro
// lançou. Reproduz a perda de ocorrências e trabalhos: antes, o aparelho que já tinha
// estudantes ignorava o pacote cifrado da nuvem e, no primeiro salvamento, subia a
// cópia velha por cima dele.
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
  const b = await chromium.launch({ executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const base = { turmas:[{id:1,nome:'1A'}], estudantes:[{id:7,nome_completo:'Ana Paula'},{id:8,nome_completo:'Bruno'}] };

  // --- 1. Aparelho B (celular) usado ontem: tem estudantes, 1 ocorrência, 0 trabalhos ---
  const pB = await abrir(b);
  await pB.evaluate(async ([u, base]) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosMigradosLocalmente = true; window.usuarioOnlineCompleto = false;
    await desbloquearChaveBackup('u1', 'senha-da-conta');
    window.pessoalCifradoLido = true;
    data = Object.assign(getInitialData(), base, {
      ocorrencias:[{id:1, id_turma:1, data:'2026-09-20', relato:'antiga', ids_estudantes:[7]}] });
    await salvarDadosUsuario('app_data_u1', data);
  }, [USUARIO, base]);

  // --- 2. Aparelho A (computador) abre, recebe e lança 2 ocorrências + 1 trabalho ---
  const pA = await abrir(b);
  await usarBanco(pA, await banco(pB));
  await pA.evaluate(async ([u, abrirSrc]) => {
    await (eval('(' + abrirSrc + ')'))(u);
    data.ocorrencias.push({id:2, id_turma:1, data:'2026-09-22', relato:'nova A', ids_estudantes:[8]});
    data.ocorrencias.push({id:3, id_turma:1, data:'2026-09-22', relato:'outra A', ids_estudantes:[7]});
    data.trabalhos.push({id:50, id_turma:1, titulo:'Trabalho A', tipo:'simples', peso:10, bimestre:3});
    await persistirDados();
  }, [USUARIO, ABRIR_CONTA.toString()]);

  // --- 3. B abre de novo (cópia velha no aparelho) e salva uma chamada ---
  await usarBanco(pB, await banco(pA));
  const r3 = await pB.evaluate(async ([u, abrirSrc, resumoSrc]) => {
    await (eval('(' + abrirSrc + ')'))(u);
    const viu = (eval('(' + resumoSrc + ')'))();
    data.presencas.push({id:900, id_estudante:7, data:'2026-09-23', presente:true});
    await persistirDados();
    return viu;
  }, [USUARIO, ABRIR_CONTA.toString(), RESUMO.toString()]);
  console.log('3. aparelho velho abre -> ocorrencias ' + JSON.stringify(r3.oc) + ' | trabalhos ' + JSON.stringify(r3.tr));

  // --- 4. Nuvem depois do salvamento do aparelho velho, vista por um navegador limpo ---
  const pC = await abrir(b);
  await usarBanco(pC, await banco(pB));
  const r4 = await pC.evaluate(async ([u, abrirSrc, resumoSrc]) => {
    await (eval('(' + abrirSrc + ')'))(u);
    return Object.assign((eval('(' + resumoSrc + ')'))(), { pres: (data.presencas||[]).length });
  }, [USUARIO, ABRIR_CONTA.toString(), RESUMO.toString()]);
  console.log('4. navegador limpo depois -> ocorrencias ' + JSON.stringify(r4.oc) + ' | trabalhos ' + JSON.stringify(r4.tr) + ' | chamadas ' + r4.pres);

  // --- 5. Recuperação: a nuvem já perdeu (gravada pelo código antigo); A abre e devolve ---
  await usarBanco(pA, await banco(pB));
  const r5 = await pA.evaluate(async ([u, abrirSrc, base]) => {
    // Simula o estrago do código antigo: pacote da nuvem só com a cópia velha.
    const dek = await obterChaveBackup();
    const velho = Object.assign(getInitialData(), base, {
      ocorrencias:[{id:1, id_turma:1, data:'2026-09-20', relato:'antiga', ids_estudantes:[7]}] });
    const pac = await cifrarPacote(dividirDados(velho).local, dek);
    window.__docs['app_data/pessoal_app_data_u1'] = pac.principal;
    const faltava = await (eval('(' + abrirSrc + ')'))(u);   // A ainda tem tudo no aparelho
    return { faltava: faltava };
  }, [USUARIO, ABRIR_CONTA.toString(), base]);
  const pD = await abrir(b);
  await usarBanco(pD, await banco(pA));
  const r5b = await pD.evaluate(async ([u, abrirSrc, resumoSrc]) => {
    await (eval('(' + abrirSrc + ')'))(u);
    return (eval('(' + resumoSrc + ')'))();
  }, [USUARIO, ABRIR_CONTA.toString(), RESUMO.toString()]);
  console.log('5. A reabre depois do estrago -> faltava na nuvem ' + JSON.stringify(r5.faltava)
    + ' | nuvem agora: ocorrencias ' + JSON.stringify(r5b.oc) + ' | trabalhos ' + JSON.stringify(r5b.tr));

  // --- 6. Duas sessões abertas ao mesmo tempo: a segunda a gravar não apaga a primeira ---
  const docs6 = await banco(pD);
  const pE = await abrir(b), pF = await abrir(b);
  await usarBanco(pE, docs6); await usarBanco(pF, docs6);
  const abrirStr = ABRIR_CONTA.toString();
  await pE.evaluate(async ([u, s]) => { await (eval('(' + s + ')'))(u); }, [USUARIO, abrirStr]);
  await pF.evaluate(async ([u, s]) => { await (eval('(' + s + ')'))(u); }, [USUARIO, abrirStr]);
  await pE.evaluate(async () => {
    data.ocorrencias.push({id:4, id_turma:1, data:'2026-09-23', relato:'da sessao E', ids_estudantes:[8]});
    await persistirDados();
  });
  await usarBanco(pF, await banco(pE));             // o mesmo banco, agora com o que E gravou
  const r6 = await pF.evaluate(async (resumoSrc) => {
    data.trabalhos.push({id:51, id_turma:1, titulo:'Trabalho F', tipo:'simples', peso:10, bimestre:3});
    await persistirDados();
    return (eval('(' + resumoSrc + ')'))();
  }, RESUMO.toString());
  const pG = await abrir(b);
  await usarBanco(pG, await banco(pF));
  const r6b = await pG.evaluate(async ([u, abrirSrc, resumoSrc]) => {
    await (eval('(' + abrirSrc + ')'))(u);
    return (eval('(' + resumoSrc + ')'))();
  }, [USUARIO, abrirStr, RESUMO.toString()]);
  console.log('6. sessoes simultaneas -> nuvem: ocorrencias ' + JSON.stringify(r6b.oc) + ' | trabalhos ' + JSON.stringify(r6b.tr));

  const igual = (a, e) => JSON.stringify(a) === JSON.stringify(e);
  const ok = igual(r3.oc, [1,2,3]) && igual(r3.tr, [50])
          && igual(r4.oc, [1,2,3]) && igual(r4.tr, [50]) && r4.pres === 1
          && r5.faltava && igual(r5b.oc, [1,2,3]) && igual(r5b.tr, [50])
          && igual(r6.oc, [1,2,3,4]) && igual(r6b.oc, [1,2,3,4]) && igual(r6b.tr, [50,51]);
  console.log('\n' + (ok ? 'OK: aparelho com cópia velha junta em vez de apagar, e o aparelho que tem os dados os devolve'
                         : '*** FALHOU ***'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
