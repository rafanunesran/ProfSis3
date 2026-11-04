// ANEXO IV - NOVO MODELO (atividade DUA, campos para copiar e colar).
//
// O Anexo IV agora e' um documento compartilhado com 4 campos curtos, por serie e por
// estudante. No Estagiario o professor escolhe serie, disciplina e o tema/atividade; a IA
// cria uma atividade adaptada (DUA) pra turma toda considerando o curriculo e as fichas
// do Painel AEE, e a tela mostra os 4 campos com "Copiar". Fica salvo no Historico.
//
// Cobrimos:
//   1. o tipo "Anexo IV (novo modelo)" aparece e mostra os campos certos;
//   2. a lista de estudantes e' so' da serie escolhida (todas as fichas, com ou sem Anexo III);
//   3. sem tema, avisa e nao chama a IA;
//   4. o pedido leva as fichas, o curriculo e as regras de texto curto, SEM o nome dos estudantes;
//   5. a tela mostra UMA atividade para todos (com os nomes para quem vale), os 4 campos e o Copiar;
//   6. "Copiar" copia o texto do campo; "Copiar os 4" copia os 4 com os titulos;
//   7. fica no Historico com o texto; editar e fechar atualiza o mesmo registro;
//   8. o Historico reabre a tela com o texto editado;
//   9. o "Manual" abre os mesmos campos em branco, sem IA.
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

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.route(/gstatic\.com|googleapis\.com/, r => r.abort());
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Matemática' },
                { id:2, nome:'8A', ano_serie:'8º Ano', disciplina:'Matemática' } ],
      horariosAulas: [] });
    const docs = {
      'app_data/app_data_school_77_aee': { tutorados: [
        { id: 101, nome_estudante: 'Ana Souza', turma: '7A', aee_diagnostico: 'TEA nível 1',
          anexoPaee: { dados: { recomendacao_professor: 'Antecipar a rotina e usar apoio visual.' } } },
        { id: 102, nome_estudante: 'Bruno Lima', turma: '7º Ano A', aee_diagnostico: 'Baixa visão' },
        { id: 103, nome_estudante: 'Carla Dias', turma: '8A', aee_diagnostico: 'TDAH' }
      ] },
      'system/users_list': { list: [] }
    };
    const colecoes = {
      curriculo_escopo_sequencia: [
        { serieChave:'7', disciplinaOriginal:'Matemática', bimestre:'4', titulo:'Frações equivalentes', conteudo:'Equivalência de frações', textoBuscavel:'fracoes equivalentes', habilidades:[] }
      ]
    };
    const consulta = (nome, filtros) => ({
      where: (campo, op, valor) => consulta(nome, filtros.concat([[campo, op, valor]])),
      limit: () => consulta(nome, filtros),
      orderBy: () => consulta(nome, filtros),
      get: async () => {
        const lista = (colecoes[nome] || []).filter(d => filtros.every(([c, op, v]) =>
          op === '==' ? d[c] === v : op === 'array-contains' ? (d[c] || []).includes(v)
          : op === 'array-contains-any' ? (d[c] || []).some(x => v.includes(x)) : true));
        return { docs: lista.map(d => ({ id: d.titulo, data: () => JSON.parse(JSON.stringify(d)) })), empty: lista.length === 0, forEach(f){ this.docs.forEach(f); } };
      },
      doc: (i) => ({ get: async () => { const d = docs[nome + '/' + i]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; } })
    });
    db = { collection: (n) => consulta(n, []) };
    persistirDados = () => {};

    window.__copiado = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copiado.push(t); } } });

    window.__pedidosIA = [];
    chamarIAEstruturada = async (prompt) => {
      window.__pedidosIA.push(prompt);
      const c = (s) => ({ conteudos_habilidades: 'EF07MA05 ' + s, estrategias: 'Jogo de cartas ' + s, acompanhamento: 'Observação ' + s, apoios: 'AEE ' + s });
      return { atividade: c('turma') };
    };
  }, PROF);

  // ============ 1 e 2. TIPO NOVO E LISTA DE ESTUDANTES ============
  const r1 = await p.evaluate(async () => {
    await abrirModalGerarDocumentoIA();
    const sel = document.getElementById('iaDocTipo');
    const opcoes = Array.from(sel.options).map(o => o.textContent);
    sel.value = 'anexo4_dua'; toggleTipoDocumentoIA();
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null; };
    document.getElementById('anexo4DuaSerie').value = '7º Ano';
    document.getElementById('anexo4DuaDisciplina').value = 'Matemática';
    atualizarEstudantesAnexo4Dua();
    return { opcoes, campos: vis('anexo4DuaTema'), plano: vis('iaDocTema'), botao: document.getElementById('btnGerarDocumentoIA').textContent,
             estudantes: document.getElementById('anexo4DuaEstudantes').innerText };
  });
  ok('o tipo "Anexo IV (novo modelo)" aparece', r1.opcoes.some(o => o.indexOf('Anexo IV (novo modelo)') !== -1));
  ok('o modelo antigo continua, marcado como antigo', r1.opcoes.some(o => o.indexOf('PEI (modelo antigo)') !== -1));
  ok('mostra serie/disciplina/tema do Anexo IV e esconde os do plano', r1.campos && !r1.plano);
  ok('o botao vira "Gerar Anexo IV"', r1.botao.indexOf('Gerar Anexo IV') !== -1);
  ok('lista os estudantes da serie (com e sem Anexo III)', r1.estudantes.indexOf('Ana Souza') !== -1 && r1.estudantes.indexOf('Bruno Lima') !== -1);
  ok('estudante de outra serie fica de fora', r1.estudantes.indexOf('Carla Dias') === -1);

  // ============ 3. SEM TEMA ============
  await p.evaluate(async () => { await gerarDocumentoIA(); });
  ok('sem tema, avisa', avisos.some(a => a.indexOf('tema central') !== -1));
  ok('sem tema, nao chama a IA', (await p.evaluate(() => window.__pedidosIA.length)) === 0);

  // ============ 4. O PEDIDO ============
  const r4 = await p.evaluate(async () => {
    document.getElementById('anexo4DuaTema').value = 'Frações equivalentes com jogo de cartas';
    await gerarDocumentoIA();
    return window.__pedidosIA[0] || '';
  });
  ok('o pedido leva serie, disciplina e tema', r4.indexOf('7º Ano') !== -1 && r4.indexOf('Matemática') !== -1 && r4.indexOf('jogo de cartas') !== -1);
  ok('o pedido pede DUA para a turma toda', r4.indexOf('Desenho Universal para a Aprendizagem') !== -1 && r4.indexOf('TODA a turma') !== -1);
  ok('o pedido leva as fichas (diagnostico e Anexo III)', r4.indexOf('TEA nível 1') !== -1 && r4.indexOf('apoio visual') !== -1 && r4.indexOf('Baixa visão') !== -1);
  ok('a ficha de outra serie fica de fora', r4.indexOf('TDAH') === -1);
  ok('o nome dos estudantes NAO vai para a IA', r4.indexOf('Ana Souza') === -1 && r4.indexOf('Bruno Lima') === -1);
  ok('o pedido leva o curriculo oficial', r4.indexOf('Frações equivalentes') !== -1);
  ok('o pedido exige texto curto e os 4 campos', r4.indexOf('MÁXIMO 2 ou 3 frases') !== -1 && r4.indexOf('Apoios complementares') !== -1);
  ok('o pedido pede UMA atividade para todos (nao uma por estudante)', r4.indexOf('UMA ÚNICA atividade') !== -1 && r4.indexOf('"atividade"') !== -1 && r4.indexOf('"estudantes"') === -1);
  ok('o pedido pede so os codigos das habilidades', r4.indexOf('APENAS os códigos') !== -1 && r4.indexOf('sem a descrição') !== -1);

  // ============ 5. A TELA ============
  const r5 = await p.evaluate(() => {
    const m = document.getElementById('modalAnexo4Dua');
    const blocos = Array.from(m.querySelectorAll('.anexo4DuaBloco'));
    return {
      aberto: m.classList.contains('active') && getComputedStyle(m).display !== 'none',
      titulos: blocos.map(b => b.querySelector('strong').innerText),
      campos: blocos.map(b => b.querySelectorAll('.anexo4DuaCampo').length),
      copiar: blocos.map(b => b.querySelectorAll('button').length),
      vale: (m.querySelector('.anexo4DuaVale') || {}).innerText || '',
      estr: blocos[0] ? blocos[0].querySelector('[data-campo="estrategias"]').value : ''
    };
  });
  ok('a tela abre', r5.aberto);
  ok('um bloco so, da atividade para todos', r5.titulos.length === 1 && r5.titulos[0].indexOf('Atividade para todos') !== -1);
  ok('o bloco diz para quais estudantes vale', r5.vale.indexOf('Ana Souza') !== -1 && r5.vale.indexOf('Bruno Lima') !== -1);
  ok('o bloco tem os 4 campos', r5.campos[0] === 4);
  ok('o bloco tem 4 "Copiar" + "Copiar os 4"', r5.copiar[0] === 5);
  ok('o texto da IA preenche os campos', r5.estr === 'Jogo de cartas turma');

  if (process.env.PROFSIS_PRINTS) {
    await p.setViewportSize({ width: 900, height: 1000 });
    await p.evaluate(() => { const a = document.getElementById('authContainer'); if (a) a.style.display = 'none'; });
    await p.waitForTimeout(1000);
    await p.screenshot({ path: require('path').join(process.env.PROFSIS_PRINTS, 'anexo4-novo.png') });
  }

  // ============ 6. COPIAR ============
  const r6 = await p.evaluate(async () => {
    const bloco = document.querySelectorAll('#modalAnexo4Dua .anexo4DuaBloco')[0];
    const botoes = bloco.querySelectorAll('button');
    botoes[1].click(); await new Promise(r => setTimeout(r, 50));
    botoes[0].click(); await new Promise(r => setTimeout(r, 50));
    return window.__copiado;
  });
  ok('"Copiar" copia so o texto do campo', r6[0] === 'EF07MA05 turma');
  ok('"Copiar os 4" copia os 4 com os titulos', (r6[1] || '').indexOf('Conteúdos e habilidades: EF07MA05 turma') === 0
      && r6[1].indexOf('Acompanhar o aprendizado: Observação turma') !== -1);

  // ============ 7 e 8. HISTORICO ============
  const r7 = await p.evaluate(async () => {
    const antes = data.historicoDocumentos.filter(h => h.tipo === 'anexo4_dua');
    const ta = document.querySelector('#modalAnexo4Dua .anexo4DuaBloco[data-grupo="turma"] [data-campo="apoios"]');
    ta.value = 'Ledor e fonte ampliada'; ta.dispatchEvent(new Event('input'));
    fecharModalAnexo4Dua();
    const depois = data.historicoDocumentos.filter(h => h.tipo === 'anexo4_dua');
    await showDocumentosTab('historico');
    const aba = document.getElementById('tabDocHistorico');
    const botao = aba.querySelector('button[onclick*="abrirAnexo4DuaHistorico"]');
    if (botao) botao.click();
    const ta2 = document.querySelector('#modalAnexo4Dua .anexo4DuaBloco[data-grupo="turma"] [data-campo="apoios"]');
    return { antes: antes.length, depois: depois.length, titulo: depois[0] && depois[0].titulo,
             salvo: depois[0] && depois[0].payload.turma.apoios,
             textoAba: aba.innerText, botao: !!botao, reaberto: ta2 ? ta2.value : '' };
  });
  ok('gerar ja salva no Historico', r7.antes === 1);
  ok('editar e fechar atualiza o mesmo registro (sem duplicar)', r7.depois === 1 && r7.salvo === 'Ledor e fonte ampliada');
  ok('o Historico mostra o Anexo IV', r7.textoAba.indexOf('Anexo IV - Matemática - 7º Ano') !== -1 && r7.botao);
  ok('o Historico reabre com o texto editado', r7.reaberto === 'Ledor e fonte ampliada');

  // ============ 9. MANUAL ============
  const r9 = await p.evaluate(async () => {
    closeModal('modalAnexo4Dua');
    window.__pedidosIA = [];
    await abrirModalGerarDocumentoIA();
    const sel = document.getElementById('iaDocTipo'); sel.value = 'anexo4_dua'; toggleTipoDocumentoIA();
    document.getElementById('anexo4DuaSerie').value = '7º Ano';
    document.getElementById('anexo4DuaDisciplina').value = 'Matemática';
    atualizarEstudantesAnexo4Dua();
    document.getElementById('anexo4DuaTema').value = 'Jogo';
    await gerarDocumentoManualEstagiario();
    const campos = Array.from(document.querySelectorAll('#modalAnexo4Dua .anexo4DuaCampo'));
    return { n: campos.length, vazios: campos.every(c => c.value === ''), pedidos: window.__pedidosIA.length };
  });
  ok('o Manual abre os 4 campos em branco', r9.n === 4 && r9.vazios);
  ok('o Manual nao chama a IA', r9.pedidos === 0);

  await b.close();
  if (falhas.length) { console.log('\n' + falhas.length + ' falha(s)'); process.exit(1); }
  console.log('\nTudo ok');
})().catch(e => { console.error(e); process.exit(1); });
