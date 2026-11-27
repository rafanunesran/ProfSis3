// MAPÕES → BOLETIM (mapao.js): a gestão envia vários PDFs de mapão (ou o link de uma pasta do
// Drive), o EdiProf lê no aparelho, reconhece a turma pelos nomes, grava o boletim e, se pedido,
// atualiza a situação dos estudantes. O boletim aparece na ficha do estudante, na ficha de tutoria
// na tela — e NÃO no relatório de tutoria impresso.
//
// Os PDFs deste teste são FALSOS (nomes inventados), montados pelo próprio Chromium no mesmo
// desenho do mapão da SED: nome quebrado em 2–3 linhas, situação, M/F/AC por disciplina e TOTAL.
//
// Rodar: python3 -m http.server 8877 --bind 127.0.0.1 (na pasta do repo) e
//        PROFSIS_PDFJS=<pasta com pdf.min.js e pdf.worker.min.js> node testes/teste-mapao-boletim.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium';
const PDFJS = process.env.PROFSIS_PDFJS || '';
const FOTOS = process.env.PROFSIS_FOTOS || '';

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
  // Login do Google falso (pasta do Drive).
  window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'tok-falso', expires_in: 3600 }), 0) }) } } };
};

const falhas = [];
const ok = (nome, cond, extra) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) { falhas.push(nome); if (extra) console.log('        ', extra); } };

const DISC = [['ARTE', '1813'], ['LINGUA PORTUGUESA', '1100'], ['MATEMATICA', '2700']];

// HTML no desenho do mapão. alunos: [{ nome, sit, notas:[[m,f,ac],...], tf, fre }]
function htmlMapao(turma, fechamento, alunos, comNomes) {
  const cel = 'border:1px solid #999; font: 7px Arial; text-align:center; padding:1px;';
  const cab = DISC.map(d => `<th colspan="${comNomes ? 3 : 4}" style="${cel} width:${comNomes ? 54 : 70}px;">${d[0]}</th>`).join('');
  const cod = DISC.map(d => `<th colspan="${comNomes ? 3 : 4}" style="${cel}">${d[1]}</th>`).join('');
  const sub = DISC.map(() => (comNomes ? '' : `<th style="${cel}">Nº</th>`) + `<th style="${cel}">M</th><th style="${cel}">F</th><th style="${cel}">AC</th>`).join('');
  const linhas = alunos.map((a, i) => `<tr>
      ${comNomes ? `<td style="${cel} text-align:left; width:58px;">${a.nome}</td><td style="${cel} width:34px;">${a.sit}</td>` : ''}
      ${a.notas.map(n => (comNomes ? '' : `<td style="${cel}">${i + 1}</td>`) + n.map(v => `<td style="${cel}">${v}</td>`).join('')).join('')}
      <td style="${cel}">${a.tf}</td><td style="${cel}">${a.fre}</td><td style="${cel}">${a.tf}</td><td style="${cel}">${a.fre}</td></tr>`).join('');
  return `<html><body style="margin:20px; font: 7px Arial;">
    <div style="font-size:15px;">Registro e Controle do Rendimento Escolar</div>
    <div>Ano Letivo: 2026</div><div>Escola: Escola Estadual Faz de Conta</div>
    <div>Turma: ${turma}</div><div>Tipo Fechamento: ${fechamento}</div><div>Total de Aulas Dadas: 300</div>
    <table style="border-collapse:collapse; margin-top:16px;">
      <tr>${comNomes ? `<th rowspan="3" style="${cel}">ALUNO</th><th rowspan="3" style="${cel}">SIT</th>` : ''}${cab}<th colspan="4" rowspan="2" style="${cel}">TOTAL</th></tr>
      <tr>${cod}</tr>
      <tr>${sub}<th style="${cel}">TF</th><th style="${cel}">Fre(<br>%)</th><th style="${cel}">FT<br>An</th><th style="${cel}">Fre<br>An(<br>%)</th></tr>
      ${linhas}
    </table>
    <div style="margin-top:10px;">Legenda</div><div>M - Menção (corresponde ao resultado informado no fechamento)</div>
  </body></html>`;
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });

  // --- 1. Os PDFs falsos -------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mapao-'));
  const gerador = await b.newPage();
  const ALUNOS_9A = [
    { nome: 'ANA CAROLINA DE SOUZA LIMA', sit: 'Ativo', notas: [[8, 0, 0], [7, 2, 0], [4, 5, 1]], tf: 8, fre: '97%' },
    { nome: 'BRUNO HENRIQUE PEREIRA DOS SANTOS', sit: 'Transferido', notas: [['-', 0, 0], [6, 1, 0], [5, 0, 0]], tf: 1, fre: '99%' },
    { nome: 'CAIO VICTÓRIO MENDES', sit: 'Ativo', notas: [[10, 0, 0], [9, 0, 0], [9, 0, 0]], tf: 0, fre: '100%' },
    { nome: 'DÉBORA ALVES', sit: 'Remanejamento', notas: [['-', 0, 0], ['-', 0, 0], ['-', 0, 0]], tf: 0, fre: '100%' },
    { nome: 'ELISA NOVATA RAMOS', sit: 'Ativo', notas: [['-', '-', '-'], ['-', '-', '-'], ['-', '-', '-']], tf: 0, fre: '100%' }
  ];
  const fazerPdf = async (nome, html) => {
    await gerador.setContent(html);
    const arq = path.join(dir, nome);
    await gerador.pdf({ path: arq, format: 'A4', landscape: true });
    return arq;
  };
  const pdf9A3 = await fazerPdf('MAPAO_9A_TERCEIRO.pdf', htmlMapao('9° ANO A INTEGRAL 9H ANUAL', 'Conselho Terceiro Bimestre', ALUNOS_9A, true));
  const pdf9A1 = await fazerPdf('MAPAO_9A_PRIMEIRO.pdf', htmlMapao('9° ANO A INTEGRAL 9H ANUAL', 'Conselho Primeiro Bimestre',
    ALUNOS_9A.map(a => Object.assign({}, a, { sit: a.nome.startsWith('BRUNO') ? 'Ativo' : a.sit, notas: [[6, 1, 0], [6, 0, 0], [6, 0, 0]] })), true));
  const pdf8B = await fazerPdf('MAPAO_8B_TERCEIRO.pdf', htmlMapao('8° ANO B INTEGRAL 9H ANUAL', 'Conselho Terceiro Bimestre', [
    { notas: [[7, 0, 0], [8, 1, 0], [6, 0, 0]], tf: 1, fre: '99%' },
    { notas: [[3, 4, 0], [5, 2, 0], [4, 3, 0]], tf: 9, fre: '95%' }], false));
  await gerador.close();

  // --- 2. O app no painel da gestão ---------------------------------------------
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  if (PDFJS) {
    await p.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/.*\/pdf\.min\.js/, r => r.fulfill({ path: path.join(PDFJS, 'pdf.min.js'), contentType: 'application/javascript' }));
    await p.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/.*\/pdf\.worker\.min\.js/, r => r.fulfill({ path: path.join(PDFJS, 'pdf.worker.min.js'), contentType: 'application/javascript' }));
  }
  await p.route(/gstatic\.com|googleapis\.com|accounts\.google\.com/, r => r.abort());
  // Drive falso: a pasta tem os dois mapões da 9A. (No Playwright a rota registrada por último vale primeiro.)
  const pastaId = '1PastaFalsaDeMapoes_abcdefgh';
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization', 'Access-Control-Allow-Methods': 'GET' };
  await p.route(/www\.googleapis\.com\/drive\/v3\/files/, (r0) => { let r = r0;
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const f = r0.fulfill.bind(r0);
    r = { request: () => r0.request(), fulfill: (o) => f(Object.assign({}, o, { headers: Object.assign({}, CORS, o.headers || {}) })) };
    const u = r.request().url();
    const auth = r.request().headers()['authorization'];
    if (auth !== 'Bearer tok-falso') return r.fulfill({ status: 401, body: '{}' });
    if (/alt=media/.test(u)) {
      const id = u.match(/files\/([^?]+)/)[1];
      return r.fulfill({ path: id === 'arq1' ? pdf9A1 : pdf9A3, contentType: 'application/pdf' });
    }
    if (decodeURIComponent(u).indexOf(`'${pastaId}' in parents`) === -1) return r.fulfill({ status: 404, body: '{"error":{"message":"File not found"}}' });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'arq1', name: 'MAPAO_9A_PRIMEIRO.pdf' }, { id: 'arq3', name: 'MAPAO_9A_TERCEIRO.pdf' }] }) });
  });
  p.on('dialog', async d => { if (process.env.DEBUG) console.log('        dialog:', d.type(), d.message().slice(0, 80)); await d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined); });
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);

  const GESTOR = { id: 'g1', uid: 'g1', nome: 'Gestão Teste', email: 'g@e.com', role: 'gestor', schoolId: '77' };
  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'gestor';
    window.dadosCarregados = true;
    data = Object.assign(getInitialData(), {
      turmas: [ { id: 901, nome: '9º A', disciplina: '', turno: 'Integral' }, { id: 802, nome: '8º B', disciplina: '', turno: 'Integral' } ],
      estudantes: [
        { id: 1, id_turma: 901, nome_completo: 'Ana Carolina de Souza Lima', status: 'Ativo' },
        { id: 2, id_turma: 901, nome_completo: 'Bruno Henrique Pereira dos Santos', status: 'Ativo' },
        { id: 3, id_turma: 901, nome_completo: 'Caio Victorio Mendes', status: 'Ativo' },
        { id: 4, id_turma: 901, nome_completo: 'Débora Alves', status: 'Ativo' },
        { id: 21, id_turma: 802, nome_completo: 'Fábio Primeiro da Lista', status: 'Ativo' },
        { id: 22, id_turma: 802, nome_completo: 'Gabi Segunda da Lista', status: 'Ativo' }
      ],
      notasBimestraisOficiais: [ { id: 'velho', nome_estudante_norm: 'ANA CAROLINA DE SOUZA LIMA', disciplina: 'ARTE', bimestre: 3, valor: '2' } ]
    });
    window.__persistiu = 0;
    persistirDados = async () => { window.__persistiu++; };
    document.getElementById('appContainer').style.display = 'block';
    const auth = document.getElementById('authContainer'); if (auth) auth.style.display = 'none';
  }, GESTOR);

  // Botão no painel da gestão (dashboard).
  const temBotao = await p.evaluate(async () => {
    try { showScreen('dashboard'); await renderDashboard(); } catch (e) { return 'erro: ' + e.message; }
    return !!Array.from(document.querySelectorAll('button')).find(x => /Enviar mapões/.test(x.textContent) && x.offsetParent);
  });
  ok('painel da gestão tem o botão "Enviar mapões"', temBotao === true, temBotao);

  // --- 3. Vários PDFs de uma vez ------------------------------------------------
  await p.evaluate(() => abrirMapoesGestor());
  await p.setInputFiles('#mapaoArquivos', [pdf9A1, pdf9A3, pdf8B]);
  await p.waitForFunction(() => mapaoItens.length === 3 && /lido/.test(document.getElementById('mapaoStatus').textContent), null, { timeout: 30000 }).catch(() => {});

  const lidos = await p.evaluate(() => mapaoItens.map(i => ({ arq: i.nomeArquivo, erro: i.erro, turma: i.mapao && i.mapao.turma, bim: i.mapao && i.mapao.bimestre,
    comNomes: i.mapao && i.mapao.comNomes, grupo: i.grupoChave, ligados: i.ligados.length, alunos: i.mapao && i.mapao.alunos.length,
    nomes: i.mapao ? i.mapao.alunos.map(a => a.nome) : [], sits: i.mapao ? i.mapao.alunos.map(a => a.situacao) : [], disc: i.mapao ? i.mapao.disciplinas.map(d => d.nome) : [],
    notaAna: i.mapao && i.mapao.alunos[0] ? i.mapao.alunos[0].notas : null, total: i.mapao && i.mapao.alunos[0] ? i.mapao.alunos[0].total : null })));
  const m3 = lidos.find(x => /TERCEIRO/.test(x.arq) && /9A/.test(x.arq)) || {};
  const m8 = lidos.find(x => /8B/.test(x.arq)) || {};
  ok('leu os 3 PDFs sem erro', lidos.length === 3 && lidos.every(x => !x.erro), JSON.stringify(lidos.map(x => x.erro)));
  ok('cabeçalho: turma e bimestre', m3.turma === '9° ANO A INTEGRAL 9H ANUAL' && m3.bim === 3, m3.turma + ' ' + m3.bim);
  ok('nomes quebrados em várias linhas voltam inteiros', JSON.stringify(m3.nomes) === JSON.stringify(ALUNOS_9A.map(a => a.nome)), JSON.stringify(m3.nomes));
  ok('situação lida (Remanejamento junta as duas partes)', m3.sits && m3.sits[1] === 'Transferido' && m3.sits[3] === 'Remanejamento', JSON.stringify(m3.sits));
  ok('disciplinas pelo cabeçalho', JSON.stringify(m3.disc) === JSON.stringify(DISC.map(d => d[0])), JSON.stringify(m3.disc));
  ok('M/F/AC e TOTAL da primeira linha', m3.notaAna && m3.notaAna.MATEMATICA && m3.notaAna.MATEMATICA.m === '4' && m3.notaAna.MATEMATICA.f === '5' && m3.notaAna.MATEMATICA.ac === '1'
    && m3.total && m3.total.freq === '97%' && m3.total.tf === '8', JSON.stringify([m3.notaAna, m3.total]));
  ok('turma reconhecida pelos nomes (9º A)', m3.grupo === '901', m3.grupo);
  ok('acentos não atrapalham (Victório = Victorio)', m3.ligados === 4, 'ligados=' + m3.ligados);
  ok('mapão sem nomes: turma pelo cabeçalho "8° ANO B"', m8.grupo === '802' && m8.comNomes === false && m8.alunos === 2, JSON.stringify(m8));
  ok('mapão sem nomes só liga se a gestão pedir', m8.ligados === 0, 'ligados=' + m8.ligados);

  // Liga o 8B pelo nº de chamada.
  await p.evaluate(() => { const i = mapaoItens.findIndex(x => /8B/.test(x.nomeArquivo)); alterarNumeroMapao(i, true); });
  const lig8 = await p.evaluate(() => mapaoItens.find(x => /8B/.test(x.nomeArquivo)).ligados.map(l => l.linha.numero + '=' + l.estudante.nome_completo));
  ok('nº de chamada pela ordem da lista', JSON.stringify(lig8) === JSON.stringify(['1=Fábio Primeiro da Lista', '2=Gabi Segunda da Lista']), JSON.stringify(lig8));

  // Situação: prévia pelo mapão mais recente.
  await p.evaluate(() => { document.getElementById('mapaoAtualizarSituacao').checked = true; renderPreviaMapao(); });
  const previaSit = await p.evaluate(() => document.getElementById('mapaoPreviaSituacao').textContent.replace(/\s+/g, ' '));
  ok('prévia da situação usa o 3º bimestre (Bruno sai, Débora remanejada, Elisa entra)',
    /3º bim/.test(previaSit) && /BRUNO|Bruno/.test(previaSit) && /Remanejado/.test(previaSit) && /ELISA NOVATA RAMOS/.test(previaSit) && !/8º B/.test(previaSit), previaSit);
  if (FOTOS) await p.screenshot({ path: path.join(FOTOS, 'mapoes-previa.png'), fullPage: false });

  const antes = await p.evaluate(() => JSON.stringify(data.estudantes));
  ok('prévia não mexe na lista de verdade', antes.indexOf('"Transferido"') === -1);

  await p.evaluate(() => gravarMapoes());
  await p.waitForTimeout(400);
  const gravado = await p.evaluate(() => ({
    persistiu: window.__persistiu,
    notas: data.notasBimestraisOficiais,
    est: data.estudantes.map(e => e.nome_completo + ':' + e.status),
    lotes: (data.lotesMapaoGestor || []).length
  }));
  const anaArte3 = gravado.notas.filter(n => normNomeNotasOficiaisNode(n.nome_estudante_norm) === 'ANA CAROLINA DE SOUZA LIMA' && n.disciplina === 'ARTE' && n.bimestre == 3);
  ok('gravou e salvou (persistirDados)', gravado.persistiu >= 1 && gravado.lotes === 1);
  ok('reenviar o mesmo bimestre substitui a nota antiga', anaArte3.length === 1 && anaArte3[0].valor === '8', JSON.stringify(anaArte3));
  if (process.env.DEBUG) console.log('        b1:', gravado.notas.filter(n => n.bimestre == 1).length, '8B:', JSON.stringify(gravado.notas.filter(n => n.id_estudante === 22)));
  if (!gravado.notas.some(n => n.id_estudante === 22)) console.log('        notas 8B:', JSON.stringify(gravado.notas.filter(n => n.turmaId === '802').slice(0, 3)));
  ok('guarda os dois bimestres da 9A e o 8B', gravado.notas.some(n => n.bimestre == 1 && n.valor === '6') && gravado.notas.some(n => n.id_estudante === 22 && n.disciplina === 'ARTE' && n.valor === '3'));
  ok('frequência geral guardada', gravado.notas.some(n => n.disciplina === '__FREQUENCIA_GERAL__' && n.valor === '97%' && n.faltas === '8'));
  ok('situação atualizada na lista', gravado.est.indexOf('Bruno Henrique Pereira dos Santos:Transferido') !== -1 && gravado.est.indexOf('Débora Alves:Remanejado') !== -1
    && gravado.est.indexOf('ELISA NOVATA RAMOS:Ativo') !== -1 && gravado.est.indexOf('Ana Carolina de Souza Lima:Ativo') !== -1, JSON.stringify(gravado.est));
  ok('8B (sem nomes) não mexe na situação', gravado.est.indexOf('Fábio Primeiro da Lista:Ativo') !== -1);
  ok('lista publicada leva o boletim aos professores', await p.evaluate(() => (recorteDaEscola('gestor', data).notasBimestraisOficiais || []).length === data.notasBimestraisOficiais.length));

  // --- 4. Boletim na ficha do estudante (gestão) --------------------------------
  const ficha = await p.evaluate(() => {
    closeModal('modalMapoes');
    abrirEstudanteDetalhe(1);
    const el = document.getElementById('estudanteGeralNotas');
    return el ? el.textContent.replace(/\s+/g, ' ') : '';
  });
  ok('ficha do estudante mostra o boletim', /Boletim/.test(ficha) && /Matematica/.test(ficha) && /Frequência/.test(ficha) && /97%/.test(ficha), ficha.slice(0, 300));
  if (FOTOS) {
    await p.evaluate(() => document.getElementById('estudanteGeralNotas').scrollIntoView());
    await p.screenshot({ path: path.join(FOTOS, 'boletim-ficha-estudante.png') });
  }

  // --- 5. Professor: ficha de tutoria na tela e impressa ------------------------
  const dadosGestor = await p.evaluate(() => JSON.parse(JSON.stringify({ notasBimestraisOficiais: data.notasBimestraisOficiais })));
  await p.evaluate((dg) => {
    currentUser = { id: 'p1', uid: 'p1', nome: 'Professor Tutor', role: 'professor', schoolId: '77' }; currentViewMode = 'professor';
    data = Object.assign(getInitialData(), {
      turmas: [ { id: 5, nome: '9º A', disciplina: 'Matemática', masterId: 901 } ],
      estudantes: [ { id: 1, id_turma: 5, nome_completo: 'Ana Carolina de Souza Lima', status: 'Ativo' } ],
      tutorados: [ { id: 700, id_estudante_origem: 1, nome_estudante: 'Ana Carolina de Souza Lima', turma: '9º A', data_nascimento: '2011-05-02', projeto_vida: 'Ser engenheira' } ],
      encontros: [ { id: 1, tutoradoId: 700, data: '2026-09-10T10:00', tema: 'Conversa sobre notas', resumo: 'Combinamos estudo de Matemática.' } ]
    });
    obterDadosGestor = async () => dg;
  }, dadosGestor);
  const cardTutoria = await p.evaluate(async () => {
    abrirEstudanteDetalhe(1);
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 50)); const el = document.getElementById('notasOficiaisTutoriaCard'); if (el && el.textContent.trim()) return el.textContent.replace(/\s+/g, ' '); }
    const el = document.getElementById('notasOficiaisTutoriaCard'); return el ? 'vazio' : 'sem card';
  });
  ok('ficha de tutoria na tela mostra o boletim (professor)', /Boletim/.test(cardTutoria) && /Matematica/.test(cardTutoria), cardTutoria.slice(0, 200));

  const telaTutoria = await p.evaluate(async () => {
    abrirFichaTutorado(700);
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 50)); const el = document.getElementById('boletimTutoradoFicha'); if (el && el.textContent.trim()) return el.textContent.replace(/\s+/g, ' '); }
    const el = document.getElementById('boletimTutoradoFicha'); return el ? 'vazio' : 'sem lugar';
  });
  ok('tela de Tutoria (Ficha do Estudante do tutorado) mostra o boletim', /Boletim/.test(telaTutoria) && /Matematica/.test(telaTutoria), telaTutoria.slice(0, 200));
  if (FOTOS) { await p.evaluate(() => document.getElementById('boletimTutoradoFicha').scrollIntoView()); await p.screenshot({ path: path.join(FOTOS, 'boletim-tela-tutoria.png') }); }

  const [janela] = await Promise.all([
    p.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
    p.evaluate(() => { window.print = () => {}; imprimirRelatorioTutorado(700, 'Ana Carolina de Souza Lima'); })
  ]);
  let impresso = '';
  if (janela) {
    await janela.addInitScript(() => { window.print = () => {}; });
    await janela.waitForFunction(() => /Conversa/.test(document.body && document.body.textContent), null, { timeout: 8000 }).catch(() => {});
    impresso = await janela.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
    if (FOTOS) await janela.screenshot({ path: path.join(FOTOS, 'boletim-tutoria-impressa.png'), fullPage: true });
  }
  if (!janela) console.log('        (nenhuma janela abriu)');
  ok('ficha de tutoria IMPRESSA NÃO traz o boletim (pedido do Rafael)', !/Boletim/.test(impresso) && /Conversa sobre notas/.test(impresso), impresso.slice(0, 300));

  // --- 6. Link de pasta do Drive ------------------------------------------------
  await p.evaluate((u) => {
    currentUser = u; currentViewMode = 'gestor';
    data = Object.assign(getInitialData(), {
      turmas: [ { id: 901, nome: '9º A', disciplina: '' } ],
      estudantes: [ { id: 1, id_turma: 901, nome_completo: 'Ana Carolina de Souza Lima', status: 'Ativo' }, { id: 3, id_turma: 901, nome_completo: 'Caio Victorio Mendes', status: 'Ativo' },
                    { id: 2, id_turma: 901, nome_completo: 'Bruno Henrique Pereira dos Santos', status: 'Ativo' } ]
    });
    abrirMapoesGestor();
  }, GESTOR);
  const idsLink = await p.evaluate(() => [idDaPastaDriveMapao('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQ?usp=sharing'), idDaPastaDriveMapao('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQ'), idDaPastaDriveMapao('qualquer coisa')]);
  ok('reconhece o link da pasta', idsLink[0] === '1AbCdEfGhIjKlMnOpQ' && idsLink[1] === '1AbCdEfGhIjKlMnOpQ' && idsLink[2] === '', JSON.stringify(idsLink));
  await p.fill('#mapaoLinkPasta', 'https://drive.google.com/drive/folders/' + pastaId + '?usp=drive_link');
  await p.evaluate(() => lerPastaDriveMapao());
  await p.waitForFunction(() => mapaoItens.length === 2 || /⚠️/.test(document.getElementById('mapaoStatus').textContent), null, { timeout: 30000 }).catch(() => {});
  const drive = await p.evaluate(() => ({ n: mapaoItens.length, ok: mapaoItens.every(i => !i.erro && i.grupoChave === '901'), st: document.getElementById('mapaoStatus').textContent }));
  ok('pasta do Drive: baixa e lê os PDFs', drive.n === 2 && drive.ok, JSON.stringify(drive));
  await p.fill('#mapaoLinkPasta', 'https://drive.google.com/drive/folders/1OutraPastaQueNaoExiste_xyz');
  await p.evaluate(() => lerPastaDriveMapao());
  await p.waitForTimeout(500);
  const erroPasta = await p.evaluate(() => document.getElementById('mapaoStatus').textContent);
  ok('pasta errada: aviso claro', /não encontrada/i.test(erroPasta), erroPasta);

  ok('sem erro de página', erros.length === 0, erros.join(' | '));

  await b.close();
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function normNomeNotasOficiaisNode(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
