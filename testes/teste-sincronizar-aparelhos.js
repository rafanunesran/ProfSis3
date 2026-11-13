// ATUALIZAÇÃO AUTOMÁTICA ENTRE DOIS APARELHOS ABERTOS AO MESMO TEMPO.
//
// Duas páginas, a mesma conta, um "Firestore" de mentira com onSnapshot que repassa
// cada gravação de um aparelho para o outro. Confere que, SEM recarregar:
//  - os grupos criados num aparelho aparecem no outro (era o defeito relatado);
//  - a nota editada num aparelho chega ao outro;
//  - a gravação do segundo aparelho não desfaz a do primeiro (carimbo atualizadoEm);
//  - o nome da turma (campo em claro) também chega;
//  - a planilha aberta no outro aparelho é redesenhada sozinha.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';
const USUARIO = { id:1, uid:'u1', nome:'Maria', email:'m@e.com', role:'professor', schoolId:'77' };

const FAKE = () => {
  window.__docs = {};
  window.__ouvintes = {};
  const avisar = (k, pendente) => (window.__ouvintes[k] || []).forEach(cb => {
    const d = window.__docs[k];
    cb({ exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null, metadata: { hasPendingWrites: pendente } });
  });
  // Chegou gravação do outro aparelho (o teste repassa)
  window.__receber = (k, d) => { if (d === null) delete window.__docs[k]; else window.__docs[k] = d; avisar(k, false); };
  const ref = (col,id) => { const k = col+'/'+id; return {
    get: async () => { const d = window.__docs[k]; return { exists:!!d, data:()=> d?JSON.parse(JSON.stringify(d)):null }; },
    set: async (o) => { window.__docs[k] = JSON.parse(JSON.stringify(o)); avisar(k, true); if (window.__enviar) window.__enviar(k, window.__docs[k]); avisar(k, false); },
    delete: async () => { delete window.__docs[k]; if (window.__enviar) window.__enviar(k, null); },
    onSnapshot: (cb) => { (window.__ouvintes[k] = window.__ouvintes[k] || []).push(cb); return () => { window.__ouvintes[k] = window.__ouvintes[k].filter(x => x !== cb); }; } }; };
  window.firebase = { initializeApp:()=>{}, analytics:()=>{},
    auth:()=>({ currentUser:{uid:'u1',email:'m@e.com'}, onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return ()=>{}; }, signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

// Mesma chave de cifra nos dois aparelhos (a da senha da conta).
const PREPARAR = async (u) => {
  const bruta = new Uint8Array(32).map((_, i) => i + 1);
  const dek = await crypto.subtle.importKey('raw', bruta, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  obterChaveBackup = async () => dek;
  currentUser = u; currentViewMode = 'professor';
  window.dadosMigradosLocalmente = true; window.usuarioOnlineCompleto = false;
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const paginas = [];
  for (let i = 0; i < 2; i++) {
    const p = await (await b.newContext()).newPage();
    p.on('dialog', async d => await d.accept());
    p.on('pageerror', e => console.log('erro na página ' + i + ':', e.message));
    await p.route(/gstatic\.com/, r => r.abort());
    await p.addInitScript(FAKE);
    await p.exposeFunction('__enviar', async (k, d) => {
      const outra = paginas[1 - i];
      if (outra) await outra.evaluate(([k, d]) => window.__receber(k, d), [k, d]).catch(() => {});
    });
    await p.goto(URL, { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(1800);
    await p.evaluate(PREPARAR, USUARIO);
    paginas.push(p);
  }
  const [pA, pB] = paginas;
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  const r = {};

  // 1. Aparelho A começa a conta: turma, 3 estudantes, uma atividade.
  await pA.evaluate(async () => {
    window.pessoalCifradoLido = true; window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:500, nome:'1A', disciplina:'Matematica' } ],
      configBimestres: [1,2,3,4].map(n => ({ bim:n, inicio:'2026-0'+(n*2-1)+'-01', fim:'2026-0'+(n*2)+'-28' })),
      estudantes: [ { id:1, id_turma:500, nome_completo:'Ana Paula', status:'Ativo' },
                    { id:2, id_turma:500, nome_completo:'Bruno Silva', status:'Ativo' },
                    { id:3, id_turma:500, nome_completo:'Carla Souza', status:'Ativo' } ],
      trabalhos: [ { id:11, id_turma:500, titulo:'Seminario', tipo:'comum', peso:10, rubricas:[], bimestre:1 } ],
      notas: [] });
    window.chaveDosDadosCarregados = getStorageKey(currentUser);
    lembrarRetratoPessoal(data);
    await persistirDados();
  });
  await espera(300);

  // 2. Aparelho B abre a conta (lê da nuvem) e fica com a planilha aberta.
  await pB.evaluate(async () => {
    const ok = await carregarDadosUsuario();
    window.dadosCarregados = ok !== false;
    lembrarRetratoPessoal(data);
    escutarOutrosAparelhos(getStorageKey(currentUser));
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    turmaAtual = 500; currentBimestreTrabalhos = 1;
    if (typeof abrirTurma === 'function') await abrirTurma(500); else showScreen('turmaDetalhe');
    await new Promise(r => setTimeout(r, 800));
    showTurmaTab('trabalhos');
  });
  await pA.evaluate(() => escutarOutrosAparelhos(getStorageKey(currentUser)));
  r.bAbriuComAtividade = await pB.evaluate(() => (data.trabalhos || []).length === 1 && (data.estudantes || []).length === 3);

  // 3. A cria um grupo (Ana + Bruno) e lança 8 para a Ana.
  await pA.evaluate(async () => {
    turmaAtual = 500; currentBimestreTrabalhos = 1;
    if (!document.getElementById('tabTrabalhos')) { const d = document.createElement('div'); d.id = 'tabTrabalhos'; document.body.appendChild(d); }
    renderTrabalhos();
    abrirModalGrupos(11);
    document.querySelectorAll('#semGrupoLista .sem-grupo-item').forEach(c => { if (['1','2'].includes(c.value)) c.checked = true; });
    await criarGrupoComMarcados();
    closeModal('modalNovoTrabalho');
    await salvarNota(11, '1', '8');
  });
  await espera(1500);
  const vB = await pB.evaluate(() => ({
    grupos: ((data.trabalhos[0] || {}).grupos || []).length,
    notas: data.notas.filter(n => n.id_trabalho == 11).map(n => n.id_estudante + ':' + n.valor).sort().join(','),
    etiquetas: document.querySelectorAll('#tabTrabalhos .etiqueta-grupo').length,
    celulaBruno: (document.querySelector('#tabTrabalhos input[data-nota="11|2"]') || {}).value,
    aviso: !!document.getElementById('avisoSincronizado')
  }));
  r.grupoChegouSemRecarregar = vB.grupos === 1;
  r.notasChegaram = vB.notas === '1:8,2:8';
  r.planilhaRedesenhada = vB.etiquetas === 2 && vB.celulaBruno === '8';
  if (!r.planilhaRedesenhada) console.log(JSON.stringify(vB), await pB.evaluate(() => [[...document.querySelectorAll('.turma-tab')].map(t=>t.id+':'+t.style.display).join(' '), document.getElementById('tabTrabalhos').innerHTML.length,document.querySelector('.screen.active') && document.querySelector('.screen.active').id, document.activeElement && document.activeElement.tagName, !!document.querySelector('.modal.active')].join()));
  r.avisoAtualizado = vB.aviso;

  // 4. B (que tinha a cópia sem grupo) edita a nota da Carla: não pode apagar o grupo de A.
  await pB.evaluate(async () => { await salvarNota(11, '3', '6'); });
  await espera(1500);
  const vA = await pA.evaluate(() => ({
    grupos: ((data.trabalhos[0] || {}).grupos || []).length,
    carla: (data.notas.find(n => n.id_trabalho == 11 && n.id_estudante == 3) || {}).valor }));
  r.bNaoApagaGrupoDeA = vA.grupos === 1;
  r.notaDeBChegouEmA = vA.carla === '6';

  // 5. A muda o nome da turma (campo em claro) e a nota do grupo para 9.
  await pA.evaluate(async () => { data.turmas[0].nome = '1A Manhã'; await salvarNota(11, '2', '9'); });
  await espera(1500);
  const v2 = await pB.evaluate(() => ({ nome: data.turmas[0].nome,
    notas: data.notas.filter(n => n.id_trabalho == 11).map(n => n.id_estudante + ':' + n.valor).sort().join(',') }));
  r.nomeTurmaChegou = v2.nome === '1A Manhã';
  r.edicaoDeNotaChegou = v2.notas === '1:9,2:9,3:6';

  // 6. A nuvem tem a versão final (o que um terceiro aparelho abriria).
  r.nuvemFinalCerta = await pB.evaluate(async () => {
    const lido = await lerCamadaPessoalCifrada(getStorageKey(currentUser));
    return lido.estado === 'ok' && (lido.dados.trabalhos[0].grupos || []).length === 1
      && lido.dados.notas.filter(n => n.id_trabalho == 11).map(n => n.id_estudante + ':' + n.valor).sort().join(',') === '1:9,2:9,3:6';
  });

  await b.close();
  let falhou = false;
  Object.entries(r).forEach(([k, v]) => { console.log((v ? 'OK   ' : 'FALHA') + ' ' + k); if (!v) falhou = true; });
  process.exit(falhou ? 1 : 0);
})();
