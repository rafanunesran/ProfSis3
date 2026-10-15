// SUGESTAO DE TEMAS NO PLANO DE AULA DO ESTAGIARIO.
//
// Antes, o professor tinha que inventar o "Tema / Assunto" sozinho. Agora o botao
// "Sugerir temas" le os materiais postados na Biblioteca de Apoio e as aulas da
// planilha oficial da serie+disciplina, pede temas a IA e mostra como botoes:
// clicar num deles preenche o campo Tema, e o "Gerar Estrutura" de sempre gera o
// plano usando o material da Biblioteca como base.
//
// Cobrimos:
//   1. sem serie/disciplina, o botao avisa e nao chama a IA;
//   2. o pedido a IA leva so' os materiais da disciplina certa (o de outra
//      disciplina fica de fora) e as aulas do curriculo;
//   3. os temas aparecem, com o material de origem, sem repetidos;
//   4. clicar num tema preenche o campo Tema;
//   5. trocar a disciplina apaga as sugestoes antigas;
//   6. o plano gerado com o tema escolhido leva o material da Biblioteca no pedido.
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
    auth:()=>({ currentUser:{uid:'p1',email:'p@e.com'}, onAuthStateChanged:(cb)=>setTimeout(()=>cb(null),0), signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // Banco em memoria com as duas colecoes que a sugestao le, e a IA trocada por uma
  // resposta fixa que guarda o pedido recebido.
  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'História' },
                { id:2, nome:'7B', ano_serie:'7º Ano', disciplina:'Geografia' } ],
      horariosAulas: [] });
    const colecoes = {
      materiais_apoio: [
        { titulo:'Apostila Revolução Francesa', descricao:'Texto e exercícios sobre 1789', tags:['bastilha'],
          disciplina:'História', disciplinaOriginal:'História', serieChaves:['7','GERAL'],
          textoExtraido:'A queda da Bastilha marcou o início da Revolução Francesa.', textoBuscavel:'apostila revolucao francesa bastilha', createdAtMs: 2 },
        { titulo:'Relevo brasileiro', descricao:'Mapas de relevo', tags:['relevo'],
          disciplina:'Geografia', disciplinaOriginal:'Geografia', serieChaves:['7','GERAL'],
          textoExtraido:'Planaltos e planícies.', textoBuscavel:'relevo brasileiro planaltos', createdAtMs: 1 }
      ],
      curriculo_escopo_sequencia: [
        { serieChave:'7', disciplinaOriginal:'História', bimestre:'1', titulo:'Grandes navegações', conteudo:'Expansão marítima europeia', textoBuscavel:'grandes navegacoes', habilidades:[] }
      ]
    };
    const consulta = (nome, filtros) => ({
      where: (campo, op, valor) => consulta(nome, filtros.concat([[campo, op, valor]])),
      limit: () => consulta(nome, filtros),
      orderBy: () => consulta(nome, filtros),
      get: async () => {
        const docs = (colecoes[nome] || []).filter(d => filtros.every(([c, op, v]) =>
          op === '==' ? d[c] === v
          : op === 'array-contains' ? (d[c] || []).includes(v)
          : op === 'array-contains-any' ? (d[c] || []).some(x => v.includes(x)) : true));
        return { docs: docs.map(d => ({ id: d.titulo, data: () => JSON.parse(JSON.stringify(d)) })), empty: docs.length === 0, forEach(f){ this.docs.forEach(f); } };
      },
      doc: (i) => ({ get: async () => ({ exists:false, data:()=>null }) })
    });
    db = { collection: (n) => consulta(n, []) };

    window.__pedidosIA = [];
    chamarIAEstruturada = async (prompt) => {
      window.__pedidosIA.push(prompt);
      if (prompt.indexOf('Sugira') !== -1) {
        return { temas: [
          { tema:'A queda da Bastilha', motivo:'Coberto pela apostila', fonte:'Apostila Revolução Francesa' },
          { tema:'a queda da bastilha', motivo:'repetido', fonte:'' },
          { tema:'Grandes navegações', motivo:'Aula do currículo', fonte:'Currículo' }
        ] };
      }
      return { aprendizagem_essencial:'x', conteudos:'x', habilidades:'x', objetivos:'x', desenvolvimento:'x', materiais:'x', avaliacao:'x' };
    };
  }, PROF);

  // ============ 1. SEM SERIE/DISCIPLINA, AVISA E NAO CHAMA A IA ============
  const r1 = await p.evaluate(async () => {
    await abrirModalGerarDocumentoIA();
    const btn = document.getElementById('btnSugerirTemasPlanoAula');
    await sugerirTemasPlanoAulaEstagiario();
    return { existe: !!btn, pedidos: window.__pedidosIA.length };
  });
  ok('o botao "Sugerir temas" aparece ao lado do Tema', r1.existe);
  ok('sem serie/disciplina, avisa o professor', avisos.some(a => a.indexOf('Série / Ano e a Disciplina') !== -1));
  ok('sem serie/disciplina, nao chama a IA', r1.pedidos === 0);

  // ============ 2 e 3. O PEDIDO E AS SUGESTOES NA TELA ============
  const r2 = await p.evaluate(async () => {
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'História';
    atualizarProfessorParceiroPlanoAula();
    await sugerirTemasPlanoAulaEstagiario();
    const box = document.getElementById('iaDocSugestoesTemas');
    return {
      pedido: window.__pedidosIA[0] || '',
      visivel: box.style.display !== 'none',
      botoes: Array.from(box.querySelectorAll('.sugestao-tema-estagiario')).map(b => b.innerText),
      texto: box.innerText
    };
  });
  ok('o pedido leva o material da Biblioteca da disciplina', r2.pedido.indexOf('Apostila Revolução Francesa') !== -1
      && r2.pedido.indexOf('queda da Bastilha marcou') !== -1);
  ok('o material de outra disciplina fica de fora', r2.pedido.indexOf('Relevo brasileiro') === -1);
  ok('o pedido leva as aulas do curriculo oficial', r2.pedido.indexOf('Grandes navegações') !== -1);
  ok('as sugestoes aparecem na tela', r2.visivel && r2.botoes.length > 0);
  ok('tema repetido (so muda maiuscula) aparece uma vez so', r2.botoes.length === 2);
  ok('cada sugestao mostra de qual material veio', r2.botoes[0].indexOf('Apostila Revolução Francesa') !== -1);
  ok('a tela diz que usou a Biblioteca', r2.texto.indexOf('1 material da Biblioteca') !== -1);

  // ============ 4. CLICAR NUM TEMA PREENCHE O CAMPO ============
  const r4 = await p.evaluate(() => {
    document.querySelector('#iaDocSugestoesTemas .sugestao-tema-estagiario[data-indice="0"]').click();
    return document.getElementById('iaDocTema').value;
  });
  ok('clicar num tema preenche o campo Tema', r4 === 'A queda da Bastilha');

  // ============ 6. O PLANO GERADO USA O MATERIAL DA BIBLIOTECA ============
  const r6 = await p.evaluate(async () => {
    window.__pedidosIA = [];
    await gerarDocumentoIA();
    return window.__pedidosIA[0] || '';
  });
  ok('o plano gerado com o tema escolhido leva o material da Biblioteca', r6.indexOf('MATERIAIS DE APOIO') !== -1
      && r6.indexOf('Apostila Revolução Francesa') !== -1 && r6.indexOf('A queda da Bastilha') !== -1);

  // ============ 5. TROCAR A DISCIPLINA APAGA AS SUGESTOES ============
  const r5 = await p.evaluate(async () => {
    if (typeof closeModal === 'function') closeModal('modalRevisaoDocumento');
    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'História';
    await sugerirTemasPlanoAulaEstagiario();
    const antes = document.getElementById('iaDocSugestoesTemas').style.display;
    document.getElementById('iaDocDisciplina').value = 'Geografia';
    document.getElementById('iaDocDisciplina').dispatchEvent(new Event('change'));
    const box = document.getElementById('iaDocSugestoesTemas');
    return { antes, depois: box.style.display, vazio: box.innerHTML === '' };
  });
  ok('trocar a disciplina apaga as sugestoes antigas', r5.antes === 'block' && r5.depois === 'none' && r5.vazio);

  await b.close();
  if (falhas.length) { console.log('\n' + falhas.length + ' falha(s)'); process.exit(1); }
  console.log('\nTudo ok');
})().catch(e => { console.error(e); process.exit(1); });
