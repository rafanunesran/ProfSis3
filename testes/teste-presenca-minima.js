// PÁGINA ÚNICA DE CONFIGURAÇÕES DA GESTÃO E PRESENÇA MÍNIMA (Faltoso A).
//
//   1. a conta do Faltoso A usa a presença mínima da gestão (data.presencaMinima, padrão 50%);
//   2. Registros › Configurações junta presença mínima, bimestres, feriados e limpeza numa página;
//   3. salvar a presença mínima refaz a conta na hora (entra quem ficou abaixo);
//   4. bimestres e feriados continuam salvando de dentro da página nova;
//   5. no aparelho do professor, se a gestão muda a presença mínima, a conta do dia é refeita;
//   6. a presença mínima vai para a nuvem (não é campo pessoal), para chegar aos professores.
//
// Rodar: python3 -m http.server 8877 --bind 127.0.0.1  (na raiz) e depois
//        PROFSIS_CHROMIUM=/opt/pw-browsers/chromium NODE_PATH=$(npm root -g) node testes/teste-presenca-minima.js
//        (PROFSIS_FOTOS=pasta guarda fotos da página)
const { chromium } = require('playwright');
const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';
const FOTOS = process.env.PROFSIS_FOTOS || '';

let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ok     ' : '  FALHOU ') + msg + (extra !== undefined ? '  — ' + extra : '')); if (!cond) falhas++; };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const alertas = [];
  p.on('dialog', d => { alertas.push(d.message()); d.accept(); });
  await p.route(/gstatic\.com/, r => r.abort());
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // Turma 10 com 20 dias de chamada: Ana 0%, Bia 60%, Caio 100%.
  await p.evaluate(() => {
    const dias = [];
    const hoje = getTodayString();
    const d0 = new Date(hoje + 'T12:00:00'); d0.setDate(d0.getDate() - 40);
    while (dias.length < 20) { if (d0.getDay() && d0.getDay() !== 6) dias.push(d0.toISOString().slice(0, 10)); d0.setDate(d0.getDate() + 1); }
    const faltas = {};
    dias.forEach((d, i) => { faltas[d] = [1].concat(i < 8 ? [2] : []); });
    window.__fontes = [{ autorId: 'A', chamadas: { 10: dias }, faltas }];
    window.__est = [
      { id: 1, id_turma: 10, nome_completo: 'Ana', status: 'Ativo' },
      { id: 2, id_turma: 10, nome_completo: 'Bia', status: 'Ativo' },
      { id: 3, id_turma: 10, nome_completo: 'Caio', status: 'Ativo' }
    ];
  });

  console.log('1. Conta usa a presença mínima');
  const c = await p.evaluate(() => {
    const hoje = getTodayString();
    data = Object.assign(getInitialData(), { estudantes: window.__est });
    const padrao = calcularFaltososAutomaticos(window.__fontes, window.__est, [], hoje, '2000-01-01').map(x => x.estudanteId);
    data.presencaMinima = 75;
    const com75 = calcularFaltososAutomaticos(window.__fontes, window.__est, [], hoje, '2000-01-01').map(x => x.estudanteId);
    data.presencaMinima = 'abc';
    const invalido = presencaMinimaPerc();
    data.presencaMinima = 60;
    const com60 = calcularFaltososAutomaticos(window.__fontes, window.__est, [], hoje, '2000-01-01').map(x => x.estudanteId);
    return { padrao, com75, invalido, com60 };
  });
  ok(JSON.stringify(c.padrao) === '[1]', 'sem valor da gestão vale 50%: só a Ana (0%)', JSON.stringify(c.padrao));
  ok(JSON.stringify(c.com75) === '[1,2]', 'com 75%: Ana e Bia (60%) viram faltosas', JSON.stringify(c.com75));
  ok(c.invalido === 50, 'valor inválido volta para 50%', c.invalido);
  ok(JSON.stringify(c.com60) === '[1]', 'com 60%: Bia (60%) não está ABAIXO, não entra', JSON.stringify(c.com60));

  console.log('2. Página única de Configurações');
  const tela = await p.evaluate(() => {
    data = Object.assign(getInitialData(), { estudantes: window.__est.concat([{ id: 4, id_turma: 10, nome_completo: 'Caio', status: 'Ativo' }]), turmas: [{ id: 10, nome: '1A' }] });
    window.dadosCarregados = false; // persistirDados não grava nada no teste
    currentUser = { id: 'g1', nome: 'G', role: 'gestor', schoolId: '77' }; currentViewMode = 'gestor';
    window.coletarFrequenciaDaEscola = async () => window.__fontes;
    document.body.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    let el = document.getElementById('registrosGestor');
    if (!el) { el = document.createElement('div'); el.id = 'registrosGestor'; el.className = 'screen'; (document.getElementById('appContainer') || document.body).appendChild(el); }
    const app = document.getElementById('appContainer'); if (app) app.style.display = 'block';
    const auth = document.getElementById('authContainer'); if (auth) auth.style.display = 'none';
    el.classList.add('active');
    currentRegistrosTab = 'bimestres'; // aba antiga lembrada: deve abrir a página nova
    renderRegistrosGestor();
    const botoes = Array.from(el.querySelectorAll('button')).map(x => x.textContent.trim());
    return {
      aba: currentRegistrosTab, botoes,
      secoes: ['cfgPresenca', 'cfgBimestres', 'cfgFeriados', 'cfgLimpeza'].map(id => !!(document.getElementById(id) && document.getElementById(id).innerText.trim())),
      valor: document.getElementById('cfgPresencaMinima').value,
      regra: document.getElementById('cfgPresenca').innerText,
      limpeza: document.getElementById('cfgLimpeza').innerText
    };
  });
  ok(tela.aba === 'configuracoes', 'aba antiga "bimestres" abre Configurações', tela.aba);
  ok(tela.botoes.some(t => /Configurações/.test(t)), 'tem a aba ⚙️ Configurações');
  ok(!tela.botoes.some(t => /Config\. Bimestres/.test(t)), 'as 3 abas antigas saíram da barra');
  ok(tela.secoes.every(Boolean), 'as 4 seções aparecem na mesma página', JSON.stringify(tela.secoes));
  ok(tela.valor === '50', 'campo começa em 50', tela.valor);
  ok(/abaixo de 50%/.test(tela.regra) && /faltoso automaticamente/.test(tela.regra), 'regra escrita embaixo do campo');
  ok(/Caio/.test(tela.limpeza), 'limpeza mostra o nome repetido na mesma turma');

  console.log('3. Salvar a presença mínima refaz a conta');
  await p.fill('#cfgPresencaMinima', '75');
  const regraAoDigitar = await p.evaluate(() => document.getElementById('cfgPresencaTexto').textContent);
  await p.click('#cfgPresenca button[type=submit]');
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => ({
    valor: data.presencaMinima,
    autos: (data.registrosAdministrativos || []).filter(r => r.automatico).map(r => r.estudanteId).sort(),
    campo: document.getElementById('cfgPresencaMinima') && document.getElementById('cfgPresencaMinima').value
  }));
  ok(regraAoDigitar === '75', 'o texto da regra acompanha o número digitado', regraAoDigitar);
  ok(s.valor === 75, 'salvou 75 em data.presencaMinima', s.valor);
  ok(JSON.stringify(s.autos) === '[1,2]', 'Ana e Bia viram Faltoso A na hora', JSON.stringify(s.autos));
  ok(s.campo === '75', 'a página volta mostrando 75', s.campo);
  ok(alertas.some(a => /75%/.test(a)), 'aviso de salvo com o valor');
  await p.fill('#cfgPresencaMinima', '150');
  await p.evaluate(() => salvarPresencaMinima());
  ok(await p.evaluate(() => data.presencaMinima) === 75 && alertas.some(a => /1 a 100/.test(a)), '150 é recusado');

  console.log('4. Bimestres e feriados ainda salvam');
  const bf = await p.evaluate(() => {
    document.querySelectorAll('.bim-inicio').forEach((el, i) => el.value = `2026-0${2 * i + 2}-01`);
    document.querySelectorAll('.bim-fim').forEach((el, i) => el.value = `2026-0${2 * i + 3}-20`);
    document.querySelector('#cfgBimestres form').requestSubmit();
    adicionarLinhaFeriado();
    const l = document.querySelector('#listaFeriados .feriado-linha:last-child');
    l.querySelector('.feriado-data').value = '2026-07-09'; l.querySelector('.feriado-nome').value = 'Revolução';
    salvarFeriados();
    return { bims: data.configBimestres.map(x => x.inicio), fer: data.feriadosEscolares, aindaConfig: !!document.getElementById('cfgPresenca') };
  });
  ok(bf.bims.length === 4 && bf.bims[0] === '2026-02-01', 'bimestres salvos', JSON.stringify(bf.bims));
  ok(bf.fer.length === 1 && bf.fer[0].nome === 'Revolução', 'feriado salvo', JSON.stringify(bf.fer));
  ok(bf.aindaConfig, 'depois de salvar continua na página de Configurações');

  console.log('5. Professor refaz a conta quando a presença mínima muda');
  const pr = await p.evaluate(async () => {
    let leituras = 0;
    window.lerContribuicoesDaEscola = async () => { leituras++; return { estado: 'ok', lista: [{ autorId: 'A', dados: window.__fontes[0] }] }; };
    currentUser = { id: 'p1', nome: 'P', role: 'professor', schoolId: '77' }; currentViewMode = 'professor';
    data = Object.assign(getInitialData(), {
      turmas: [{ id: 500, nome: '1A', masterId: 10 }],
      estudantes: window.__est.map(e => ({ ...e, id_turma: 500 }))
    });
    await atualizarFaltososDoDiaProfessor();
    const a1 = data.registrosAdministrativos.filter(r => r.automatico).map(r => r.estudanteId).sort();
    await atualizarFaltososDoDiaProfessor(); // mesmo dia, mesmo limite: não refaz
    data.presencaMinima = 75;                 // chegou da gestão
    await atualizarFaltososDoDiaProfessor();
    const a2 = data.registrosAdministrativos.filter(r => r.automatico).map(r => r.estudanteId).sort();
    return { a1, a2, leituras, limite: data.faltososAutomaticos.limite };
  });
  ok(JSON.stringify(pr.a1) === '[1]', 'com 50%: só a Ana', JSON.stringify(pr.a1));
  ok(JSON.stringify(pr.a2) === '[1,2]' && pr.limite === 75, 'gestão muda para 75%: no mesmo dia a Bia entra', JSON.stringify(pr));
  ok(pr.leituras === 2, 'só refez uma vez a mais (por causa da mudança)', pr.leituras);

  console.log('6. Vai para a nuvem');
  ok(await p.evaluate(() => campoEhPessoal('presencaMinima') === false && dividirDados({ presencaMinima: 70 }).nuvem.presencaMinima === 70), 'presencaMinima fica na camada da nuvem');

  if (FOTOS) {
    const cel = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    cel.on('dialog', d => d.accept());
    await cel.route(/gstatic\.com/, r => r.abort());
    await cel.goto(URL, { waitUntil: 'domcontentloaded' });
    await cel.waitForTimeout(1500);
    await cel.evaluate(() => {
      data = Object.assign(getInitialData(), { presencaMinima: 60, turmas: [] });
      window.dadosCarregados = false;
      currentUser = { id: 'g1', nome: 'G', role: 'gestor' }; currentViewMode = 'gestor';
      document.body.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      let el = document.getElementById('registrosGestor');
      if (!el) { el = document.createElement('div'); el.id = 'registrosGestor'; el.className = 'screen'; (document.getElementById('appContainer') || document.body).appendChild(el); }
      const app = document.getElementById('appContainer'); if (app) app.style.display = 'block';
      const auth = document.getElementById('authContainer'); if (auth) auth.style.display = 'none';
      el.classList.add('active');
      currentRegistrosTab = 'configuracoes';
      renderRegistrosGestor();
      document.getElementById('configuracoesGestor').scrollIntoView();
    });
    await cel.screenshot({ path: FOTOS + '/configuracoes-celular.png' });
    await p.evaluate(() => { currentUser = { id: 'g1', nome: 'G', role: 'gestor' }; currentViewMode = 'gestor'; currentRegistrosTab = 'configuracoes'; renderRegistrosGestor(); document.getElementById('registrosGestor').scrollIntoView(); });
    await p.screenshot({ path: FOTOS + '/configuracoes-computador.png', fullPage: true });
  }

  await b.close();
  console.log(falhas ? `\n*** ${falhas} FALHA(S) ***` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
