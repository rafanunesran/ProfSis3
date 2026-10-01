// A GESTAO FINANCEIRA, SEM REDE E SEM NAVEGADOR.
//
// Cobrimos:
//   1. pagamento do Mercado Pago vira a linha certa do livro-caixa (bruto, taxa,
//      liquido, mes de Brasilia, Pix x cartao) — e o que nao e' dinheiro nao entra;
//   2. buscar o mesmo periodo duas vezes nao duplica nada;
//   3. o aviso do Mercado Pago grava no livro sem atrapalhar o credito do plano;
//   4. so' o super admin aciona a busca;
//   5. as contas da tela: custo mensal, anual, unico, em dolar, com fim; resumo do
//      mes; assinantes pagantes; CSV.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const falhas = [];
const ok = (nome, cond) => {
  console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome);
  if (!cond) falhas.push(nome);
};
const perto = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

const bancoFalso = (inicial) => {
  const docs = Object.assign({}, inicial || {});
  return {
    docs,
    ler: async (c) => (c in docs ? JSON.parse(JSON.stringify(docs[c])) : null),
    gravar: async (c, d) => { docs[c] = JSON.parse(JSON.stringify(d)); },
    apagar: async (c) => { delete docs[c]; }
  };
};

(async () => {
  const F = await import('../assinatura/financeiro.mjs');
  const W = await import('../assinatura/webhook.mjs');
  const pacotes = [{ plano: 'apoiase', meses: 3, valor: 30 }, { plano: 'professor', meses: 3, valor: 60 }];

  // ================= 1. PAGAMENTO -> LINHA DO LIVRO =================
  console.log('\n1. Pagamento do Mercado Pago vira linha do livro-caixa');
  const pix = {
    id: 111, status: 'approved', transaction_amount: 30, payment_method_id: 'pix',
    external_reference: 'uid-ana|apoiase|3', date_approved: '2026-09-30T22:30:00.000-03:00',
    fee_details: [{ type: 'mercadopago_fee', amount: 0.3, fee_payer: 'collector' }],
    transaction_details: { net_received_amount: 29.7 },
    payer: { email: 'Ana@Escola.com' }, description: 'SisProf - apoio Apoia-se, 3 meses'
  };
  let e = F.montarEntradaFinanceira(pix, pacotes);
  ok('Pix vira entrada com bruto, taxa e liquido',
      e.id === '111' && e.valor === 30 && perto(e.taxa, 0.3) && perto(e.liquido, 29.7));
  ok('e sabe que e Pix de Apoia-se, 3 meses, e de quem', e.categoria === 'pix' && e.plano === 'apoiase'
      && e.meses === 3 && e.uid === 'uid-ana' && e.email === 'ana@escola.com');
  ok('Pix pago as 22h30 do dia 30 e de setembro (horario de Brasilia), nao de outubro',
      e.mes === '2026-09');

  e = F.montarEntradaFinanceira({ id: 222, status: 'approved', transaction_amount: 20,
    payment_method_id: 'master', operation_type: 'recurring_payment',
    date_approved: '2026-10-05T10:00:00.000-03:00',
    fee_details: [{ amount: 1.0, fee_payer: 'collector' }] }, pacotes);
  ok('cobranca mensal do cartao vira "assinatura" do plano pelo valor',
      e.categoria === 'assinatura' && e.plano === 'professor' && perto(e.liquido, 19));

  e = F.montarEntradaFinanceira({ id: 333, status: 'approved', transaction_amount: 60,
    payment_method_id: 'pix', external_reference: '', description: 'SisProf - apoio',
    date_approved: '2026-10-05T10:00:00Z' }, pacotes);
  ok('Pix sem referencia e reconhecido pelo valor do pacote', e.categoria === 'pix' && e.plano === 'professor');

  e = F.montarEntradaFinanceira({ id: 444, status: 'approved', transaction_amount: 17,
    payment_method_id: 'pix', date_approved: '2026-10-05T10:00:00Z' }, pacotes);
  ok('pagamento que nao e apoio entra como "outro" (dinheiro que entrou e dinheiro)',
      e.categoria === 'outro' && e.plano === '');

  ok('Pix pendente ou expirado NAO e entrada',
      F.montarEntradaFinanceira(Object.assign({}, pix, { status: 'pending' }), pacotes) === null
      && F.montarEntradaFinanceira(Object.assign({}, pix, { status: 'cancelled' }), pacotes) === null);
  e = F.montarEntradaFinanceira(Object.assign({}, pix, { status: 'refunded', transaction_amount_refunded: 30 }), pacotes);
  ok('estorno fica registrado como estorno', e.status === 'refunded' && e.estornado === 30);

  // ================= 2. BUSCAR DE NOVO NAO DUPLICA =================
  console.log('\n2. Buscar o mesmo periodo duas vezes');
  let banco = bancoFalso();
  const buscas = [];
  const mp = { buscarNoMp: async (c) => { buscas.push(c); return { results: [pix,
      Object.assign({}, pix, { id: 112, status: 'pending' })] }; } };
  let rel = await F.sincronizarLivroCaixa(95, pacotes, Object.assign({}, banco, mp));
  rel = await F.sincronizarLivroCaixa(95, pacotes, Object.assign({}, banco, mp));
  const linhas = Object.keys(banco.docs).filter(k => k.indexOf('financeiro_entradas/') === 0);
  ok('o pagamento aprovado vira UMA linha, o pendente nenhuma',
      linhas.length === 1 && linhas[0] === 'financeiro_entradas/111' && rel.lidos === 2 && rel.gravados === 1);
  ok('o periodo pedido chega ao Mercado Pago', /begin_date=NOW-95DAYS/.test(buscas[0]));
  rel = await F.sincronizarLivroCaixa(99999, pacotes, Object.assign({}, banco, mp));
  ok('periodo absurdo e limitado (nao varre a historia toda)', rel.dias === 400);

  // ================= 2b. SO' O QUE E' DO SISPROF =================
  // A conta do Mercado Pago recebe pagamentos de outra automacao. A primeira versao
  // gravava todos no livro; agora so' entra o que tem marca do SisProf, e o que foi
  // gravado errado sai quando o periodo e' buscado de novo.
  console.log('\n2b. So entra no livro o que e do SisProf');
  const deOutraAutomacao = { id: 900, status: 'approved', transaction_amount: 30, payment_method_id: 'pix',
    external_reference: 'pedido-77', description: 'Curso de Excel', date_approved: '2026-10-02T10:00:00Z' };
  const cobrancaOutra = { id: 901, status: 'approved', transaction_amount: 20, payment_method_id: 'visa',
    operation_type: 'recurring_payment', description: 'Clube do Livro',
    point_of_interaction: { transaction_data: { subscription_id: 'PRE-OUTRA' } }, date_approved: '2026-10-02T10:00:00Z' };
  const cobrancaNossa = { id: 902, status: 'approved', transaction_amount: 20, payment_method_id: 'visa',
    operation_type: 'recurring_payment', description: 'Mensalidade',
    point_of_interaction: { transaction_data: { subscription_id: 'PRE-NOSSA' } }, date_approved: '2026-10-02T10:00:00Z' };
  const cobrancaPlanoNomeado = Object.assign({}, cobrancaNossa, { id: 903,
    point_of_interaction: { transaction_data: { subscription_id: 'PRE-NOVA' } } });
  const consultas = [];
  const mpPre = { buscarNoMp: async (c) => {
    if (c.indexOf('/v1/payments/search') === 0) return { results: [pix, deOutraAutomacao, cobrancaOutra, cobrancaNossa, cobrancaPlanoNomeado] };
    consultas.push(c);
    if (c === '/preapproval/PRE-OUTRA') return { id: 'PRE-OUTRA', reason: 'Clube do Livro', preapproval_plan_id: 'P-OUTRO' };
    if (c === '/preapproval/PRE-NOVA') return { id: 'PRE-NOVA', reason: 'SisProf — Professor', preapproval_plan_id: 'P-X' };
    return null;
  } };
  banco = bancoFalso({
    'financeiro_entradas/900': { id: '900', mes: '2026-10', status: 'approved', valor: 30 },
    'assinaturas/uid-ana': { preapprovalId: 'PRE-NOSSA', status: 'ativa' }
  });
  const listar = async (colecao) => ({ proximaPagina: '', documentos: Object.keys(banco.docs)
    .filter(k => k.indexOf(colecao + '/') === 0).map(k => Object.assign({ _id: k.split('/')[1] }, banco.docs[k])) });
  const ctx = await F.montarContextoSisprof({}, Object.assign({ listar }, mpPre));
  rel = await F.sincronizarLivroCaixa(35, pacotes, Object.assign({}, banco, mpPre), ctx);
  ok('Pix com a nossa referencia entra', !!banco.docs['financeiro_entradas/111']);
  ok('e o que a versao antiga gravou errado e apagado ao buscar de novo', !banco.docs['financeiro_entradas/900']
      && rel.deFora === 2);
  ok('cobranca de assinatura de outro produto NAO entra', !banco.docs['financeiro_entradas/901']);
  ok('cobranca de assinatura que ja esta no nosso banco entra', !!banco.docs['financeiro_entradas/902']);
  ok('cobranca de assinatura nova de plano "SisProf" entra', !!banco.docs['financeiro_entradas/903']);
  ok('assinatura conhecida nem precisa ser consultada no Mercado Pago',
      consultas.indexOf('/preapproval/PRE-NOSSA') === -1);
  ok('o id do plano (MP_PLANO_*) tambem identifica a assinatura',
      F.assinaturaEhDoSisprof({ id: 'Z', preapproval_plan_id: 'PLANO-PROF', reason: 'x' },
        { planosSisprof: ['PLANO-PROF'] })
      && !F.assinaturaEhDoSisprof({ id: 'Z', preapproval_plan_id: 'OUTRO', reason: 'x' }, { planosSisprof: ['PLANO-PROF'] }));

  // ================= 3. O AVISO DO MERCADO PAGO GRAVA NO LIVRO =================
  console.log('\n3. O aviso de pagamento grava no livro e ainda credita o plano');
  banco = bancoFalso({ 'system/users_list': { list: [{ uid: 'uid-ana', email: 'ana@escola.com', nome: 'Ana' }] },
    'assinaturas_config/publico': { pacotesPix: pacotes } });
  const r = await W.processarNotificacao({ type: 'payment', data: { id: '111' } }, {},
      Object.assign({ buscar: async () => Object.assign({ _tipo: 'pagamento' }, pix) }, banco));
  ok('o plano sai', r.feito === true && banco.docs['assinaturas/uid-ana'].plano === 'apoiase');
  ok('e o pagamento esta no livro-caixa', !!banco.docs['financeiro_entradas/111']
      && banco.docs['financeiro_entradas/111'].categoria === 'pix');

  banco = bancoFalso({ 'system/users_list': { list: [] } });
  const quebraLivro = Object.assign({}, banco, {
    gravar: async (c, d) => { if (c.indexOf('financeiro_') === 0) throw new Error('quota'); return banco.gravar(c, d); }
  });
  let estourou = false;
  try {
    await W.processarNotificacao({ type: 'payment', data: { id: '111' } }, {},
        Object.assign({ buscar: async () => Object.assign({ _tipo: 'pagamento' }, pix) }, quebraLivro));
  } catch (x) { estourou = true; }
  ok('livro-caixa fora do ar NAO impede o credito do plano',
      !estourou && banco.docs['assinaturas/uid-ana'] && banco.docs['assinaturas/uid-ana'].status === 'ativa');

  // ================= 4. SO' O SUPER ADMIN =================
  console.log('\n4. So o super admin aciona a busca');
  ok('a conta pessoal so vale com e-mail verificado',
      F.ehSuperAdmin({ email: 'rafaelnf93@gmail.com', emailVerificado: true })
      && !F.ehSuperAdmin({ email: 'rafaelnf93@gmail.com', emailVerificado: false }));
  ok('a conta interna vale sem verificacao, e professor comum nunca',
      F.ehSuperAdmin({ email: 'rafael@adm.com' }) && !F.ehSuperAdmin({ email: 'prof@escola.com', emailVerificado: true }));
  const semCracha = await W.tratarRequisicao(
      new Request('https://w.dev/api/financeiro', { method: 'POST' }), { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('sem cracha, 401', semCracha.status === 401);
  const porGet = await W.tratarRequisicao(
      new Request('https://w.dev/api/financeiro', { method: 'GET' }), { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('GET nao faz nada (405)', porGet.status === 405);

  // ================= 5. AS CONTAS DA TELA =================
  console.log('\n5. As contas da tela');
  const contexto = { window: {}, console, Date, Math, Number, String, Array, Object, JSON, isFinite, URL, Blob: function () {} };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'financeiro.js'), 'utf8'), contexto);
  const T = (nome) => vm.runInContext(nome, contexto);

  const claude = { nome: 'Claude', valor: 100, moeda: 'USD', recorrencia: 'mensal', inicio: '2026-08', fim: '' };
  const dominio = { nome: 'Dominio', valor: 40, moeda: 'BRL', recorrencia: 'anual', inicio: '2026-03', fim: '' };
  const logo = { nome: 'Logo', valor: 250, moeda: 'BRL', recorrencia: 'unica', inicio: '2026-09', fim: '' };
  const antigo = { nome: 'Servidor velho', valor: 30, moeda: 'BRL', recorrencia: 'mensal', inicio: '2026-01', fim: '2026-08' };
  const pausado = { nome: 'Pausado', valor: 99, moeda: 'BRL', recorrencia: 'mensal', inicio: '2026-01', ativo: false };
  const custoNoMes = T('custoNoMes');

  ok('custo em dolar usa a cotacao', perto(custoNoMes(claude, '2026-10', 5.5), 550));
  ok('custo mensal nao conta antes de comecar', custoNoMes(claude, '2026-07', 5.5) === 0);
  ok('anual pesa so no mes de cobranca, todo ano',
      custoNoMes(dominio, '2026-03', 5) === 40 && custoNoMes(dominio, '2027-03', 5) === 40
      && custoNoMes(dominio, '2026-10', 5) === 0);
  ok('unico pesa so no proprio mes', custoNoMes(logo, '2026-09', 5) === 250 && custoNoMes(logo, '2026-10', 5) === 0);
  ok('custo encerrado para de contar depois do fim, e continua no passado',
      custoNoMes(antigo, '2026-08', 5) === 30 && custoNoMes(antigo, '2026-09', 5) === 0);
  ok('custo pausado nao conta', custoNoMes(pausado, '2026-10', 5) === 0);
  ok('equivalente mensal: anual dividido por 12',
      perto(T('custoMensalEquivalente')(dominio, 5), 40 / 12) && T('custoMensalEquivalente')(logo, 5) === 0);

  const entradas = [
    { mes: '2026-09', status: 'approved', valor: 30, taxa: 0.3, liquido: 29.7, categoria: 'pix' },
    { mes: '2026-09', status: 'approved', valor: 20, taxa: 1, liquido: 19, categoria: 'assinatura' },
    { mes: '2026-09', status: 'refunded', valor: 60, taxa: 0.6, liquido: 59.4, categoria: 'pix' },
    { mes: '2026-10', status: 'approved', valor: 20, taxa: 1, liquido: 19, categoria: 'assinatura' }
  ];
  const res = T('resumoDoMes')('2026-09', entradas, [claude, logo, antigo], 5);
  ok('resumo do mes soma so o aprovado do mes',
      res.quantidade === 2 && perto(res.bruto, 50) && perto(res.taxas, 1.3) && perto(res.liquido, 48.7));
  ok('estorno aparece separado e nao entra no liquido', perto(res.estornos, 60) && res.quantidadeEstornos === 1);
  ok('custos do mes e resultado', perto(res.custos, 500 + 250) && perto(res.resultado, 48.7 - 750));
  ok('liquido separado por meio', perto(res.porCategoria.pix, 29.7) && perto(res.porCategoria.assinatura, 19));

  const agora = Date.parse('2026-10-01T12:00:00Z');
  const em = (d) => new Date(agora + d * 86400000).toISOString();
  const ass = T('resumoAssinantes')([
    { status: 'ativa', plano: 'professor', origem: 'mercadopago', valor: 20, proximaCobranca: em(20) },
    { status: 'ativa', plano: 'apoiase', origem: 'pix', valor: 30, validoAte: em(60) },
    { status: 'ativa', plano: 'professor', origem: 'pix', valor: 60, validoAte: em(-30) },
    { status: 'ativa', plano: 'professor', origem: 'cortesia' },
    { status: 'cancelada', plano: 'free', origem: 'mercadopago', valor: 20 }
  ], agora, 5);
  ok('assinantes pagantes: so ativos e no prazo; cortesia a parte',
      ass.professor === 1 && ass.apoiase === 1 && ass.cortesia === 1);
  ok('receita recorrente conta so o cartao', ass.recorrenteMensal === 20);

  ok('meses andam para tras e para frente atravessando o ano',
      T('somarMesesFin')('2026-01', -1) === '2025-12' && T('somarMesesFin')('2026-12', 1) === '2027-01');
  ok('dinheiro no formato brasileiro', T('dinheiroFin')(1234.5) === 'R$ 1.234,50' && T('dinheiroFin')(-3) === '-R$ 3,00');

  const csv = T('linhasCsvFinanceiro')('2026-09', entradas, [claude, logo], 5);
  ok('CSV do mes traz as entradas e os custos, com virgula decimal',
      csv.length === 1 + 3 + 2 && csv[1].indexOf('29,70') !== -1 && csv.some(l => /^custo;.*-500,00/.test(l)));
  ok('estorno sai com liquido zero no CSV', csv.some(l => /refunded;60,00;0,60;0,00$/.test(l)));

  // ================= 7. IDENTIFICAR A MAO UM PAGAMENTO SEM ID =================
  console.log('\n7. Pagamento sem identificacao: o super admin diz de quem, qual plano e quantos meses');
  const semMarca = { id: 700, status: 'approved', transaction_amount: 60, payment_method_id: 'pix',
    external_reference: '', description: 'Transferencia', date_approved: '2026-09-20T10:00:00Z',
    payer: { email: 'conjuge@gmail.com', first_name: 'Joao', last_name: 'Silva' } };
  banco = bancoFalso();
  await F.sincronizarLivroCaixa(35, pacotes, Object.assign({}, banco,
      { buscarNoMp: async () => ({ results: [semMarca, Object.assign({}, semMarca, { id: 701, status: 'pending' })] }) }));
  ok('pagamento aprovado sem marca vai para "nao identificados", fora do financeiro',
      !!banco.docs['financeiro_nao_identificados/700'] && !banco.docs['financeiro_entradas/700']
      && banco.docs['financeiro_nao_identificados/700'].nomePagador === 'Joao Silva');
  ok('pendente nem aparece la', !banco.docs['financeiro_nao_identificados/701']);

  const dono = { email: 'rafael@adm.com' };
  const bancoId = bancoFalso({
    'system/users_list': { list: [{ uid: 'uid-maria', email: 'maria@escola.com', nome: 'Maria Souza' }] },
    'financeiro_nao_identificados/700': { id: '700', ignorado: false },
    'assinaturas_config/publico': { pacotesPix: pacotes }
  });
  const mpId = { buscarNoMp: async (c) => c === '/v1/payments/700' ? semMarca
      : (c === '/v1/payments/702' ? Object.assign({}, semMarca, { id: 702, status: 'pending' }) : null) };
  const ferr = Object.assign({}, bancoId, mpId);

  let ri = await W.identificarPagamento({ pagamentoId: '700', email: 'Maria@Escola.com', plano: 'professor', meses: 3 },
      dono, {}, ferr);
  ok('identificar libera o plano escolhido pelo tempo escolhido',
      ri.ok === true && ri.creditado === true && bancoId.docs['assinaturas/uid-maria'].plano === 'professor'
      && bancoId.docs['assinaturas/uid-maria'].status === 'ativa'
      && Date.parse(bancoId.docs['assinaturas/uid-maria'].validoAte) > Date.now() + 85 * 86400000);
  ok('o pagamento entra no financeiro com o que o admin disse',
      bancoId.docs['financeiro_entradas/700'].plano === 'professor' && bancoId.docs['financeiro_entradas/700'].meses === 3
      && bancoId.docs['financeiro_entradas/700'].uid === 'uid-maria'
      && bancoId.docs['financeiro_entradas/700'].identificadoManualmente === true);
  ok('sai da lista de nao identificados e a identificacao fica guardada',
      !bancoId.docs['financeiro_nao_identificados/700'] && bancoId.docs['financeiro_identificados/700'].uid === 'uid-maria'
      && bancoId.docs['financeiro_identificados/700'].identificadoPor === 'rafael@adm.com');

  const validoDepois = bancoId.docs['assinaturas/uid-maria'].validoAte;
  ri = await W.identificarPagamento({ pagamentoId: '700', email: 'maria@escola.com', plano: 'professor', meses: 3 },
      dono, {}, ferr);
  ok('identificar o mesmo pagamento de novo NAO credita outra vez',
      ri.ok === true && ri.creditado === false && bancoId.docs['assinaturas/uid-maria'].validoAte === validoDepois);

  ri = await W.identificarPagamento({ pagamentoId: '702', email: 'maria@escola.com', plano: 'professor', meses: 3 },
      dono, {}, ferr);
  ok('pagamento que o Mercado Pago nao diz aprovado NAO libera nada', ri.ok === false && /aprovado/.test(ri.motivo));
  ri = await W.identificarPagamento({ pagamentoId: '700', email: 'ninguem@x.com', plano: 'professor', meses: 3 },
      dono, {}, ferr);
  ok('e-mail sem conta no SisProf e recusado', ri.ok === false && /ninguem@x.com/.test(ri.motivo));
  ri = await W.identificarPagamento({ pagamentoId: '700', email: 'maria@escola.com', plano: 'free', meses: 3 }, dono, {}, ferr);
  const ri2 = await W.identificarPagamento({ pagamentoId: '700', email: 'maria@escola.com', plano: 'apoiase', meses: 99 }, dono, {}, ferr);
  ok('plano e meses fora do permitido sao recusados', ri.ok === false && ri2.ok === false);

  // A proxima busca do periodo ja' sabe o que ele e'.
  const listarId = async (colecao) => ({ proximaPagina: '', documentos: Object.keys(bancoId.docs)
    .filter(k => k.indexOf(colecao + '/') === 0).map(k => Object.assign({ _id: k.split('/')[1] }, bancoId.docs[k])) });
  delete bancoId.docs['financeiro_entradas/700'];
  const ctxId = await F.montarContextoSisprof({}, Object.assign({ listar: listarId }, mpId));
  await F.sincronizarLivroCaixa(35, pacotes, Object.assign({}, bancoId,
      { buscarNoMp: async () => ({ results: [semMarca] }) }), ctxId);
  ok('a busca seguinte reconhece o pagamento identificado (nao volta para a lista)',
      bancoId.docs['financeiro_entradas/700'] && bancoId.docs['financeiro_entradas/700'].plano === 'professor'
      && !bancoId.docs['financeiro_nao_identificados/700']);

  // O "ignorar" do super admin sobrevive a uma nova busca: o servidor so' grava os
  // campos do resumo (no Firestore de verdade, por updateMask).
  ok('o resumo gravado pelo servidor nao leva o campo "ignorado"',
      !('ignorado' in F.montarNaoIdentificado(semMarca)));

  const sug = T('sugestaoDeIdentificacao');
  ok('sugestao pelo pacote de mesmo valor', sug(60, pacotes).plano === 'professor' && sug(60, pacotes).meses === 3
      && sug(60, pacotes).porPacote === true);
  ok('sem pacote, sugestao pelo valor dividido pela mensalidade',
      sug(40, []).plano === 'professor' && sug(40, []).meses === 2
      && sug(10, []).plano === 'apoiase' && sug(10, []).meses === 1);

  // ================= 6. AS REGRAS FECHAM O FINANCEIRO =================
  console.log('\n6. As Regras do Firestore');
  const regras = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
  const bloco = (nome) => (regras.split('match /' + nome + '/{docId} {')[1] || '').split('}')[0];
  ok('livro-caixa: so o super admin le, e ninguem escreve pelo navegador',
      /allow read: if isSuperAdmin\(\);/.test(bloco('financeiro_entradas'))
      && /allow write: if false;/.test(bloco('financeiro_entradas')));
  ok('custos e configuracao: so o super admin',
      /allow read, write: if isSuperAdmin\(\);/.test(bloco('financeiro_custos'))
      && /allow read, write: if isSuperAdmin\(\);/.test(bloco('financeiro_config')));
  ok('identificacoes: so o servico grava; nao identificados: so o super admin',
      /allow write: if false;/.test(bloco('financeiro_identificados'))
      && /allow read, write: if isSuperAdmin\(\);/.test(bloco('financeiro_nao_identificados')));
  ok('o site publica o financeiro.js',
      /financeiro\.js/.test(fs.readFileSync(path.join(RAIZ, '.github/workflows/deploy.yml'), 'utf8'))
      && /financeiro\.js/.test(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')));

  console.log('\n' + (falhas.length === 0
    ? 'TUDO CERTO: o financeiro fecha as contas.'
    : 'FALHARAM ' + falhas.length + ': ' + falhas.join(' | ')));
  process.exit(falhas.length === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
