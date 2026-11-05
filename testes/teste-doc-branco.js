// DOCUMENTO EM BRANCO no Estagiário: cabeçalho da escola (o mesmo do Plano de Aula) + texto livre.
//
// Cobrimos:
//   1. o tipo aparece, mostra só o campo de título e esconde os campos do plano e o "Manual";
//   2. "Abrir documento" abre a caixa de texto (sem IA);
//   3. sem texto, avisa e não guarda nada;
//   4. o HTML tem o cabeçalho da escola, o título e o texto (escapado, com as linhas);
//   5. Salvar guarda em data.historicoDocumentos com o texto; salvar de novo atualiza o mesmo registro;
//   6. Imprimir abre a impressão e PDF chama o gerador de PDF, ambos com o texto;
//   7. fechar depois de editar guarda sozinho;
//   8. o Histórico mostra Abrir/PDF/Reimprimir e "Abrir" reabre o texto editado.
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
    auth:()=>({ currentUser:{uid:'p1',email:'p@e.com'}, onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return ()=>{}; }, signOut:async()=>{} }),
    firestore:()=>({ collection:(c)=>({ doc:(i)=>ref(c,String(i)) }) }) };
  window.firebase.firestore.FieldValue = { serverTimestamp:()=>null };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor Teste', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  await p.route(/gstatic\.com|googleapis\.com/, r => r.abort());
  const avisos = [];
  p.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), { turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Matemática' } ], horariosAulas: [] });
    const docs = {
      'system/config_sistema': { regiao: 'REGIÃO TESTE', logoEstado: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' },
      'app_data/app_data_school_77_aee': { tutorados: [] },
      'system/users_list': { list: [] }
    };
    db = { collection: (n) => ({ doc: (i) => ({ get: async () => { const d = docs[n + '/' + i]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; } }) }) };
    resolverEscolaAtual = async () => ({ nomeCompleto: 'EE ESCOLA DE TESTE', email: 'escola@teste.br', endereco: 'Rua A, 1', telefone: '(11) 1234-5678' });
    window.__persistiu = 0;
    persistirDados = () => { window.__persistiu++; };
    window.__chamouIA = 0;
    chamarIAEstruturada = async () => { window.__chamouIA++; return {}; };
    window.__impressos = [];
    window.open = () => ({ document: { write: (h) => window.__impressos.push(h), close: () => {} } });
    window.__pdfs = [];
    window.__campo = (k, v) => { const d = document.getElementById('previaDocBrancoEstagiario').contentDocument; const el = d.querySelector('[data-campo="' + k + '"]');
      if (v === undefined) return el.innerText; el.innerText = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    baixarPdfDocumentoEstagiario = async (h) => { window.__pdfs.push(h); return 'x.pdf'; };
  }, PROF);

  // ============ 1 e 2 ============
  const r1 = await p.evaluate(async () => {
    await abrirModalGerarDocumentoIA();
    const sel = document.getElementById('iaDocTipo');
    const opcoes = Array.from(sel.options).map(o => o.textContent);
    sel.value = 'doc_branco'; toggleTipoDocumentoIA();
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null; };
    const r = { opcoes, titulo: vis('docBrancoTitulo'), plano: vis('iaDocTema'), semana: vis('iaDocSemanaData'), manual: vis('btnGerarDocumentoManual'),
                botao: document.getElementById('btnGerarDocumentoIA').textContent };
    document.getElementById('docBrancoTitulo').value = 'Comunicado';
    await gerarDocumentoIA();
    const doc = document.getElementById('previaDocBrancoEstagiario').contentDocument;
    const corpo = doc.querySelector('[data-campo="texto"]');
    const tit = doc.querySelector('[data-campo="titulo"]');
    r.modal = vis('previaDocBrancoEstagiario') && !!corpo && corpo.isContentEditable;
    r.tituloEdicao = tit ? tit.innerText : '';
    r.cabecalho = doc.body.innerText.indexOf('EE ESCOLA DE TESTE') !== -1 && doc.body.innerText.indexOf('UNIDADE REGIONAL DE ENSINO - REGIÃO TESTE') !== -1;
    r.ia = window.__chamouIA;
    return r;
  });
  ok('o tipo "Documento em branco" aparece', r1.opcoes.some(o => o.indexOf('Documento em branco') !== -1));
  ok('mostra o campo de título e esconde tema/semana do plano', r1.titulo && !r1.plano && !r1.semana);
  ok('esconde o "Manual" e o botão vira "Abrir documento"', !r1.manual && r1.botao.indexOf('Abrir documento') !== -1);
  ok('abre a prévia do documento com caixa de texto editável', r1.modal);
  ok('a prévia tem o cabeçalho da escola e o título editável no cabeçalho', r1.cabecalho && r1.tituloEdicao === 'Comunicado');
  ok('não chama a IA', r1.ia === 0);

  // ============ 3 ============
  const r3 = await p.evaluate(async () => {
    const antes = avisos => 0;
    await exportarDocBrancoEstagiario('salvar');
    return (data.historicoDocumentos || []).length;
  });
  ok('sem texto avisa e não guarda', r3 === 0 && avisos.some(a => a.indexOf('Digite o texto') !== -1));

  // ============ 4 e 5 ============
  const r4 = await p.evaluate(async () => {
    __campo('texto', 'Senhores pais,\n\nA reunião será dia 10 <às 19h> & café.\n    Recuo mantido.');
    await exportarDocBrancoEstagiario('salvar');
    const h1 = JSON.parse(JSON.stringify(data.historicoDocumentos));
    __campo('texto', __campo('texto') + '\nAtenciosamente.');
    await exportarDocBrancoEstagiario('salvar');
    const h2 = JSON.parse(JSON.stringify(data.historicoDocumentos));
    const html = await montarHtmlDocBranco(h2[0].payload);
    return { h1, h2, html };
  });
  const reg = r4.h2[0] || {};
  ok('salvar guarda no histórico com o texto', r4.h1.length === 1 && r4.h1[0].tipo === 'doc_branco' && r4.h1[0].payload.texto.indexOf('Senhores pais') === 0);
  ok('título e prévia no histórico', reg.titulo === 'Comunicado' && reg.subtitulo === 'Senhores pais,');
  ok('salvar de novo atualiza o mesmo registro', r4.h2.length === 1 && reg.id === r4.h1[0].id && reg.payload.texto.indexOf('Atenciosamente.') !== -1);
  ok('cabeçalho com região, escola e contatos', r4.html.indexOf('UNIDADE REGIONAL DE ENSINO - REGIÃO TESTE') !== -1 && r4.html.indexOf('EE ESCOLA DE TESTE') !== -1
     && r4.html.indexOf('escola@teste.br') !== -1 && r4.html.indexOf('Rua A, 1') !== -1 && r4.html.indexOf('(11) 1234-5678') !== -1);
  ok('título em maiúsculas no cabeçalho', r4.html.indexOf('<br>COMUNICADO<div') !== -1);
  ok('texto escapado, uma linha por parágrafo', r4.html.indexOf('&lt;às 19h&gt; &amp; café.') !== -1 && r4.html.indexOf('<às 19h>') === -1
     && (r4.html.match(/class="doc-linha"/g) || []).length === 4);
  ok('nome do arquivo com título e professor', /<title>Comunicado_Professor Teste_\d{4}-\d{2}-\d{2}<\/title>/.test(r4.html));
  ok('retrato (A4 em pé)', /size:\s*A4 portrait/.test(r4.html));

  // ============ 6 ============
  const r6 = await p.evaluate(async () => {
    await exportarDocBrancoEstagiario('imprimir');
    await exportarDocBrancoEstagiario('pdf');
    return { imp: window.__impressos.length, impTexto: (window.__impressos[0] || '').indexOf('Senhores pais') !== -1,
             pdf: window.__pdfs.length, pdfTexto: (window.__pdfs[0] || '').indexOf('Atenciosamente.') !== -1,
             n: data.historicoDocumentos.length };
  });
  ok('imprimir abre a impressão com o texto', r6.imp === 1 && r6.impTexto);
  ok('PDF chama o gerador com o texto', r6.pdf === 1 && r6.pdfTexto);
  ok('imprimir/PDF não duplicam o registro', r6.n === 1);

  // ============ 7 ============
  const r7 = await p.evaluate(async () => {
    __campo('texto', 'Texto trocado no fim.');
    __campo('titulo', 'Aviso');
    const alterado = document.getElementById('modalDocBranco').dataset.alterado === '1';
    fecharModalDocBranco();
    return { alterado, n: data.historicoDocumentos.length, texto: data.historicoDocumentos[0].payload.texto, titulo: data.historicoDocumentos[0].payload.titulo };
  });
  ok('digitar na prévia marca como alterado', r7.alterado);
  ok('fechar depois de editar guarda sozinho (texto e título)', r7.n === 1 && r7.texto === 'Texto trocado no fim.' && r7.titulo === 'Aviso');

  // ============ 8 ============
  const r8 = await p.evaluate(async () => {
    let box = document.getElementById('tabDocHistorico'); const criado = !box;
    if (criado) { box = document.createElement('div'); box.id = 'tabDocHistorico'; document.body.appendChild(box); }
    renderDocumentosHistorico();
    const txt = box.textContent;
    const id = data.historicoDocumentos[0].id;
    await abrirDocBrancoHistorico(id);
    const r = { txt, texto: __campo('texto'), titulo: __campo('titulo'),
                hid: document.getElementById('modalDocBranco').dataset.historicoId === id };
    await reimprimirDocBrancoHistorico(id, 'pdf');
    r.pdf = window.__pdfs.length === 2 && window.__pdfs[1].indexOf('Texto trocado no fim.') !== -1;
    if (criado) box.remove();
    return r;
  });
  ok('Histórico mostra o documento com Abrir/PDF/Reimprimir', r8.txt.indexOf('Aviso') !== -1 && r8.txt.indexOf('Abrir') !== -1 && r8.txt.indexOf('PDF') !== -1 && r8.txt.indexOf('Reimprimir') !== -1);
  ok('"Abrir" reabre o texto e o título', r8.texto === 'Texto trocado no fim.' && r8.titulo === 'Aviso' && r8.hid);
  ok('PDF direto do Histórico', r8.pdf);
  ok('sem erros na página', erros.length === 0);
  if (erros.length) console.log(erros);

  await b.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})();
