// SALVAR E PDF NA PREVIA DO ESTAGIARIO, E PDF NA LISTA DE DOCUMENTOS.
//
// A tela de revisao do Estagiario so' tinha "Imprimir": para guardar o documento e
// usar depois era preciso imprimir, e para ter o PDF era preciso passar pela janela
// de impressao e escolher "Salvar como PDF". Agora:
//   1. "💾 Salvar" guarda o documento SEM imprimir e deixa a tela aberta; ele aparece
//      na aba Planos de Aula e no "Puxar anterior";
//   2. "📄 PDF" baixa o arquivo direto (sem janela de impressao), com o nome sugerido
//      e o texto revisado, e salvar-depois-baixar NAO duplica o registro;
//   3. o Anexo IV - PEI ganha os mesmos botoes;
//   4. a tela Documentos tem "📄 PDF" ao lado de cada "Reimprimir".
// PRECISA DE INTERNET: o gerador de PDF (html2pdf.js) vem do cdnjs.
const { chromium } = require('playwright');
const fs = require('fs');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PROXY = process.env.PROFSIS_PROXY;

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
  // Toda janela de impressao aberta fica registrada: PDF e Salvar nao podem abrir nenhuma.
  window.__impressoes = 0;
  window.open = () => { window.__impressoes++; return { document:{ write(){}, close(){} } }; };
};

const PROF = { id:'p1', uid:'p1', nome:'Professor', email:'p@e.com', role:'professor', schoolId:'77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

// Clica no botao (dentro da pagina) e espera o download que ele dispara.
async function baixar(p, seletor) {
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 90000 }),
    p.evaluate((s) => document.querySelector(s).click(), seletor)
  ]);
  const bytes = fs.readFileSync(await dl.path());
  if (process.env.PDF_DIR) fs.writeFileSync(require('path').join(process.env.PDF_DIR, dl.suggestedFilename()), bytes);
  return { nome: dl.suggestedFilename(), bytes };
}
const ehPdf = (b) => b.slice(0, 5).toString('latin1') === '%PDF-';
const paginas = (b) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const paisagem = (b) => {
  const m = b.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return m ? parseFloat(m[1]) > parseFloat(m[2]) : null;
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, proxy: PROXY ? { server: PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  const p = await (await b.newContext({ acceptDownloads: true })).newPage();
  p.on('dialog', d => d.accept());
  await p.route(/gstatic\.com/, r => r.abort());   // o Firebase de verdade apagaria o banco falso
  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);

  // ============ 1. PLANO DE AULA: SALVAR SEM IMPRIMIR ============
  await p.evaluate(async (u) => {
    currentUser = u; currentViewMode = 'professor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id:1, nome:'7A', ano_serie:'7º Ano', disciplina:'Historia' } ], horariosAulas: [] });
    localStorage.removeItem('estagiario_planos_aula_recentes');
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    renderProfessorPanel();

    await abrirModalGerarDocumentoIA();
    document.getElementById('iaDocTipo').value = 'plano_aula'; toggleTipoDocumentoIA();
    document.getElementById('iaDocSerie').value = '7º Ano';
    document.getElementById('iaDocDisciplina').value = 'Historia';
    document.getElementById('iaDocTema').value = 'Revolucao Francesa';
    await gerarDocumentoManualEstagiario();
    await escolherManualEstagiario('branco');
  }, PROF);
  await p.waitForFunction(() => {
    const f = document.getElementById('previaPlanoAulaEstagiario');
    return !!(f && f.contentDocument && f.contentDocument.querySelector('.campo-editavel-estagiario'));
  }, null, { timeout: 20000 });

  const r1 = await p.evaluate(async () => {
    const modal = document.getElementById('modalRevisaoDocumento');
    const rotulos = Array.from(modal.querySelectorAll('[data-botoes-saida] button')).map(x => x.textContent.trim());
    const d = document.getElementById('previaPlanoAulaEstagiario').contentDocument;
    d.querySelector('[data-campo="objetivos"]').innerText = 'Primeira versao do objetivo';
    await exportarDocumentoFinalPlanoAula('salvar');
    const planos = (data.historicoDocumentos || []).filter(h => h.tipo === 'plano_aula');
    return { rotulos, impressoes: window.__impressoes, planos: planos.length,
             texto: planos[0] && planos[0].payload.dados.objetivos,
             abertoAinda: modal.style.display !== 'none' && getComputedStyle(modal).display !== 'none',
             puxarAnterior: !!encontrarPlanoAulaAnteriorEstagiario('7º Ano', 'Historia') };
  });
  ok('a previa tem os botoes Salvar, PDF e Imprimir (' + r1.rotulos.join(' / ') + ')',
     r1.rotulos.some(x => x.indexOf('Salvar') !== -1) && r1.rotulos.some(x => x.indexOf('PDF') !== -1)
     && r1.rotulos.some(x => x.indexOf('Imprimir') !== -1));
  ok('Salvar guarda o plano sem abrir a impressao', r1.planos === 1 && r1.impressoes === 0
     && r1.texto === 'Primeira versao do objetivo');
  ok('Salvar deixa a tela aberta para continuar', r1.abertoAinda);
  ok('o plano salvo ja serve de "Puxar anterior"', r1.puxarAnterior);

  // ============ 2. PLANO DE AULA: PDF DIRETO, SEM DUPLICAR O SALVO ============
  await p.evaluate(() => {
    document.getElementById('previaPlanoAulaEstagiario').contentDocument
      .querySelector('[data-campo="objetivos"]').innerText = 'Entender a queda da Bastilha';
  });
  const pdf1 = await baixar(p, '#modalRevisaoDocumento [data-acao="pdf"]');
  await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => {
    const planos = (data.historicoDocumentos || []).filter(h => h.tipo === 'plano_aula');
    return { impressoes: window.__impressoes, planos: planos.length, texto: planos[0].payload.dados.objetivos,
             local: lerHistoricoPlanoAulaLocalEstagiario().length };
  });
  ok('PDF baixa um arquivo PDF de verdade (' + pdf1.nome + ', ' + pdf1.bytes.length + ' bytes)', ehPdf(pdf1.bytes) && pdf1.bytes.length > 5000);
  ok('o nome do arquivo e o nome sugerido do plano', /^PA_HIS_7_Professor_.*\.pdf$/.test(pdf1.nome));
  ok('o plano sai em paisagem, como o modelo', paisagem(pdf1.bytes) === true);
  ok('sem folha em branco no fim (' + paginas(pdf1.bytes) + ' pagina)', paginas(pdf1.bytes) === 1);
  ok('PDF nao abre a janela de impressao', r2.impressoes === 0);
  ok('salvar e depois baixar atualiza o mesmo registro (sem duplicar)',
     r2.planos === 1 && r2.local === 1 && r2.texto === 'Entender a queda da Bastilha');

  // ============ 3. ANEXO IV - PEI: SALVAR E PDF ============
  await p.evaluate(async () => {
    await salvarDadosUsuario('app_data_school_77_aee', { tutorados: [ { id: 9, nome_estudante: 'Ana Lima', turma: '7A', anexosIV: [] } ] });
    abrirModalRevisaoAnexoIV(
      { nomeEstudante:'Ana Lima', disciplina:'Historia', professorRegente:'Professor', bimestre:'1', fichaAeeVazia:false },
      { habilidades_curriculo:'EF07HI05', estrategias_intervencoes:'Material ampliado', instrumentos:'Registro em portfolio' }, 9);
  });
  await p.waitForFunction(() => {
    const f = document.getElementById('previaAnexoIVEstagiario');
    return !!(f && f.contentDocument && f.contentDocument.querySelector('.campo-editavel-estagiario'));
  }, null, { timeout: 20000 });
  const r3a = await p.evaluate(async () => {
    await exportarAnexoIVFinal('salvar');
    const aee = await lerDocUsuario('app_data_school_77_aee');
    return { impressoes: window.__impressoes,
             salvos: aee.tutorados[0].anexosIV.length,
             hist: (data.historicoDocumentos || []).filter(h => h.tipo === 'anexo4_pei').length };
  });
  ok('Anexo IV: Salvar grava no perfil do estudante sem imprimir', r3a.salvos === 1 && r3a.impressoes === 0 && r3a.hist === 1);
  const pdf2 = await baixar(p, '#modalRevisaoAnexoIV [data-acao="pdf"]');
  await p.waitForTimeout(300);
  const r3b = await p.evaluate(() => ({ impressoes: window.__impressoes,
    hist: (data.historicoDocumentos || []).filter(h => h.tipo === 'anexo4_pei').length }));
  ok('Anexo IV: PDF baixa o arquivo (' + pdf2.nome + ')', ehPdf(pdf2.bytes) && r3b.impressoes === 0);
  ok('Anexo IV: o PDF sai em retrato', paisagem(pdf2.bytes) === false);
  ok('Anexo IV: sem folha em branco no fim (' + paginas(pdf2.bytes) + ' pagina)', paginas(pdf2.bytes) === 1);
  ok('Anexo IV: salvar e baixar nao duplica o historico', r3b.hist === 1);

  // ============ 3b. ANEXO III - PAEE: O MESMO CAMINHO DE PDF ============
  const r3c = await p.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<button id="__pdfAnexo3">x</button>');
    document.getElementById('__pdfAnexo3').onclick = async () => {
      abrirModalRevisaoAnexoPaee({ nomeEstudante:'Ana Lima', escolaridade:'7º Ano' }, {}, 9);
      await exportarAnexoPaeeFinal('pdf');
    };
    return document.querySelectorAll('#modalRevisaoAnexoPaee [data-acao]').length;
  });
  const pdf6 = await baixar(p, '#__pdfAnexo3');
  ok('Anexo III: a previa tem os mesmos botoes e o PDF baixa (' + pdf6.nome + ')', ehPdf(pdf6.bytes) && r3c === 3);

  // ============ 4. TELA DOCUMENTOS: PDF AO LADO DO REIMPRIMIR ============
  await p.evaluate(async () => { await showDocumentosTab('planos'); });
  const pdf3 = await baixar(p, '#tabDocPlanos button[onclick*="\'pdf\'"]');
  ok('aba Planos de Aula: o botao PDF baixa o plano (' + pdf3.nome + ')', ehPdf(pdf3.bytes) && /^PA_/.test(pdf3.nome));

  await p.evaluate(async () => { await showDocumentosTab('anexoIV'); await new Promise(r => setTimeout(r, 500)); });
  const pdf4 = await baixar(p, '#tabDocAnexoIV button[onclick*="\'pdf\'"]');
  ok('aba Anexo IV - PEI: o botao PDF baixa o PEI', ehPdf(pdf4.bytes));

  await p.evaluate(async () => {
    await showDocumentosTab('historico');
    document.getElementById('tabDocAnexoIV').dataset.aeeTutorados = '';   // o Historico nao depende da outra aba
  });
  const qtd = await p.evaluate(() => document.querySelectorAll('#tabDocHistorico button[onclick*="\'pdf\'"]').length);
  ok('aba Historico: PDF no plano, no PEI e no PAEE (' + qtd + ' botoes)', qtd === 3);
  const pdf5 = await baixar(p, '#tabDocHistorico button[onclick*="reimprimirAnexoIVSalvo"][onclick*="\'pdf\'"]');
  ok('aba Historico: o PDF do PEI funciona mesmo sem abrir a aba Anexo IV antes', ehPdf(pdf5.bytes));
  ok('nenhum PDF da tela Documentos abriu a impressao', (await p.evaluate(() => window.__impressoes)) === 0);

  await b.close();
  if (falhas.length) { console.log('\n' + falhas.length + ' FALHA(S):'); falhas.forEach(f => console.log(' - ' + f)); process.exit(1); }
  console.log('\nTudo certo.');
})();
