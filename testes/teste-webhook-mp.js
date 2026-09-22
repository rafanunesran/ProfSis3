// O WEBHOOK DA ASSINATURA, SEM REDE E SEM NAVEGADOR.
//
// Aqui mora a parte que decide: "o Mercado Pago avisou X" vira "fulano esta' no
// plano Y". Rodamos as funcoes puras de assinatura/regras.mjs e o miolo do
// webhook (processarNotificacao) com dependencias de mentira.
//
// Cobrimos:
//   1. valor e id do plano viram o plano certo (inclusive a assinatura antiga de R$ 7);
//   2. so' `authorized` conta como ativa - `paused` NAO libera nada;
//   3. quem e' a pessoa: external_reference, e o e-mail como rede de seguranca;
//   4. pagamento sem dono identificavel nao evapora - fica guardado para o admin;
//   5. notificacao repetida e notificacao ATRASADA nao estragam o que ja' esta' gravado;
//   6. aviso que nao e' de assinatura e' ignorado sem quebrar;
//   7. os valores dos planos batem entre o servidor (regras.mjs) e o navegador (assinatura.js).
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

const falhas = [];
const ok = (nome, cond) => {
  console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome);
  if (!cond) falhas.push(nome);
};

// Uma assinatura como o Mercado Pago devolve em GET /preapproval/<id>.
const assinaturaMp = (extra) => Object.assign({
  id: 'PRE-1',
  status: 'authorized',
  payer_email: 'professor@escola.com',
  external_reference: 'uid-professor',
  preapproval_plan_id: 'PLANO-PROF',
  auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 20, currency_id: 'BRL' },
  next_payment_date: '2026-10-21T12:00:00.000-03:00',
  last_modified: '2026-09-21T12:00:00.000-03:00'
}, extra || {});

(async () => {
  const R = await import('../assinatura/regras.mjs');
  const W = await import('../assinatura/webhook.mjs');

  // ================= 1. DE QUANTO FOI A COBRANCA PARA QUAL PLANO =================
  console.log('\n1. O valor e o id do plano viram o plano certo');
  const config = { planoApoiaseId: 'PLANO-APOIA', planoProfessorId: 'PLANO-PROF' };

  ok('R$ 20 e o plano do Professor', R.mapearPlano(assinaturaMp(), config) === 'professor');
  ok('R$ 10 e o Apoia-se', R.mapearPlano(assinaturaMp({
        preapproval_plan_id: 'PLANO-APOIA',
        auto_recurring: { transaction_amount: 10 } }), config) === 'apoiase');
  ok('o id do plano manda mais que o valor (reajuste nao rebaixa ninguem)',
      R.mapearPlano(assinaturaMp({ preapproval_plan_id: 'PLANO-PROF',
        auto_recurring: { transaction_amount: 21.5 } }), config) === 'professor');
  ok('assinatura sem plano associado cai no valor',
      R.mapearPlano(assinaturaMp({ preapproval_plan_id: '',
        auto_recurring: { transaction_amount: 20 } }), config) === 'professor');
  ok('a assinatura antiga de R$ 7 continua sendo apoio (ninguem perde o selo)',
      R.mapearPlano(assinaturaMp({ preapproval_plan_id: '',
        auto_recurring: { transaction_amount: 7 } }), config) === 'apoiase');
  ok('R$ 7 e marcado como legado', R.ehValorLegado(7) === true && R.ehValorLegado(10) === false);

  // ================= 2. SO' `authorized` LIBERA =================
  console.log('\n2. Situacao da cobranca');
  ok('authorized = ativa', R.mapearStatus('authorized') === 'ativa');
  ok('pending = pendente', R.mapearStatus('pending') === 'pendente');
  ok('paused = pausada', R.mapearStatus('paused') === 'pausada');
  ok('cancelled = cancelada', R.mapearStatus('cancelled') === 'cancelada');
  ok('so a ativa vale', R.assinaturaVale('ativa') && !R.assinaturaVale('pausada')
      && !R.assinaturaVale('pendente') && !R.assinaturaVale('cancelada'));

  const pausada = R.montarAssinatura(assinaturaMp({ status: 'paused' }), config);
  ok('cartao recusado derruba o plano para free, mas guarda o que foi contratado',
      pausada.plano === 'free' && pausada.planoContratado === 'professor' && pausada.status === 'pausada');

  const ativa = R.montarAssinatura(assinaturaMp(), config);
  ok('assinatura ativa vira documento completo',
      ativa.plano === 'professor' && ativa.status === 'ativa' && ativa.valor === 20
      && ativa.preapprovalId === 'PRE-1' && ativa.origem === 'mercadopago'
      && ativa.proximaCobranca.indexOf('2026-10-21') === 0 && ativa.legado === false);

  // ================= 3. DE QUEM E' ESTE PAGAMENTO =================
  console.log('\n3. Achar o dono do pagamento');
  ok('o external_reference e o uid',
      R.identificarUsuario(assinaturaMp()).uid === 'uid-professor');
  ok('external_reference com @ e tratado como e-mail, nao como uid',
      R.identificarUsuario(assinaturaMp({ external_reference: 'Outro@Escola.com' })).uid === ''
      && R.identificarUsuario(assinaturaMp({ external_reference: 'Outro@Escola.com' })).email === 'outro@escola.com');

  const bancoFalso0 = (inicial) => {
    const docs = Object.assign({}, inicial || {});
    return {
      docs,
      ler: async (c) => (c in docs ? JSON.parse(JSON.stringify(docs[c])) : null),
      gravar: async (c, d) => { docs[c] = JSON.parse(JSON.stringify(d)); }
    };
  };
  let banco0;
  const lista = [{ email: 'Professor@Escola.com', uid: 'uid-professor', nome: 'Ana' }];
  ok('sem external_reference, o e-mail encontra a conta (sem ligar para maiuscula)',
      R.acharUidPorEmail(lista, 'professor@escola.com') === 'uid-professor');
  ok('e-mail que nao existe nao inventa dono', R.acharUidPorEmail(lista, 'ninguem@x.com') === '');

  // O e-mail do Mercado Pago quase nunca e' o mesmo do cadastro (e' o pessoal, o do
  // conjuge, o da escola). Quando a referencia nao acha, o do pagador ainda tenta.
  banco0 = bancoFalso0({ 'system/users_list': { list: lista } });
  const achou = await W.processarNotificacao(
      { type: 'subscription_preapproval', data: { id: 'PRE-1' } },
      { MP_PLANO_PROFESSOR_ID: 'PLANO-PROF' },
      { buscar: async () => assinaturaMp({ external_reference: 'conta-antiga@x.com',
          payer_email: 'Professor@Escola.com' }),
        ler: banco0.ler, gravar: banco0.gravar });
  ok('quando a referencia nao bate, o e-mail do pagador ainda encontra a conta',
      achou.feito === true && achou.uid === 'uid-professor');

  // ================= 4. O MIOLO DO WEBHOOK =================
  console.log('\n4. O webhook de ponta a ponta (com dependencias de mentira)');

  // Banco de mentira: guarda o que foi gravado, devolve o que foi lido.
  const bancoFalso = (inicial) => {
    const docs = Object.assign({}, inicial || {});
    return {
      docs,
      ler: async (caminho) => (caminho in docs ? JSON.parse(JSON.stringify(docs[caminho])) : null),
      gravar: async (caminho, dados) => { docs[caminho] = JSON.parse(JSON.stringify(dados)); }
    };
  };
  const ambiente = { MP_PLANO_APOIASE_ID: 'PLANO-APOIA', MP_PLANO_PROFESSOR_ID: 'PLANO-PROF' };

  // 4a. caminho feliz
  let banco = bancoFalso();
  let r = await W.processarNotificacao(
      { type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp(), ler: banco.ler, gravar: banco.gravar });
  ok('o aviso de assinatura grava assinaturas/<uid>',
      r.feito === true && !!banco.docs['assinaturas/uid-professor']);
  ok('o documento sai com uid, plano e situacao',
      banco.docs['assinaturas/uid-professor'].uid === 'uid-professor'
      && banco.docs['assinaturas/uid-professor'].plano === 'professor'
      && banco.docs['assinaturas/uid-professor'].status === 'ativa');

  // 4b. a cobranca mensal tambem atualiza (volta da cobranca para a assinatura)
  banco = bancoFalso();
  let pediu = null;
  r = await W.processarNotificacao(
      { type: 'subscription_authorized_payment', data: { id: 'PAY-9' } }, ambiente,
      { buscar: async (acao) => { pediu = acao; return assinaturaMp(); },
        ler: banco.ler, gravar: banco.gravar });
  ok('a cobranca mensal e' + ' tratada como aviso de cobranca',
      pediu && pediu.acao === 'buscar-cobranca' && pediu.id === 'PAY-9' && r.feito === true);

  // 4c. sem external_reference, o e-mail salva
  banco = bancoFalso({ 'system/users_list': { list: lista } });
  r = await W.processarNotificacao(
      { type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp({ external_reference: '' }),
        ler: banco.ler, gravar: banco.gravar });
  ok('sem a referencia, o e-mail do pagador encontra a conta',
      r.feito === true && r.uid === 'uid-professor' && !!banco.docs['assinaturas/uid-professor']);

  // 4d. dinheiro que entrou sem dono NAO pode sumir
  banco = bancoFalso({ 'system/users_list': { list: [] } });
  r = await W.processarNotificacao(
      { type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp({ external_reference: '', payer_email: 'desconhecido@x.com' }),
        ler: banco.ler, gravar: banco.gravar });
  ok('pagamento sem dono fica guardado para o super admin resolver',
      r.feito === false && !!banco.docs['assinaturas_sem_dono/PRE-1']
      && banco.docs['assinaturas_sem_dono/PRE-1'].email === 'desconhecido@x.com');
  ok('e nao inventa documento de assinatura para ninguem',
      Object.keys(banco.docs).filter(k => k.indexOf('assinaturas/') === 0).length === 0);

  // 4e. notificacao repetida nao reescreve
  banco = bancoFalso();
  const gravacoes = [];
  const contando = { ler: banco.ler,
    gravar: async (c, d) => { gravacoes.push(c); return banco.gravar(c, d); } };
  const buscarFixo = { buscar: async () => assinaturaMp() };
  await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } },
      ambiente, Object.assign({}, buscarFixo, contando));
  const r2 = await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } },
      ambiente, Object.assign({}, buscarFixo, contando));
  // Contamos so as gravacoes do DOCUMENTO DA ASSINATURA: a vitrine de contribuintes
  // e' escrita na mesma passada, e somar as duas esconderia o que se quer medir.
  const gravacoesDaAssinatura = gravacoes.filter(c => c.indexOf('assinaturas/') === 0);
  ok('o mesmo aviso chegando duas vezes grava uma vez so',
      gravacoesDaAssinatura.length === 1 && r2.feito === false);

  // 4f. notificacao ATRASADA nao desfaz a mais nova (o Mercado Pago entrega fora de ordem)
  banco = bancoFalso();
  await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp({ status: 'authorized',
          last_modified: '2026-09-21T15:00:00.000-03:00' }), ler: banco.ler, gravar: banco.gravar });
  await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp({ status: 'cancelled',
          last_modified: '2026-09-21T09:00:00.000-03:00' }), ler: banco.ler, gravar: banco.gravar });
  ok('um aviso velho NAO cancela uma assinatura mais nova',
      banco.docs['assinaturas/uid-professor'].status === 'ativa');

  // ... mas o cancelamento de verdade (mais novo) passa
  await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp({ status: 'cancelled',
          last_modified: '2026-09-22T09:00:00.000-03:00' }), ler: banco.ler, gravar: banco.gravar });
  ok('o cancelamento mais novo derruba o plano',
      banco.docs['assinaturas/uid-professor'].status === 'cancelada'
      && banco.docs['assinaturas/uid-professor'].plano === 'free');

  // 4g. cortesia dada pelo painel (sem carimbo) cede lugar ao pagamento de verdade
  banco = bancoFalso({ 'assinaturas/uid-professor': {
      uid: 'uid-professor', plano: 'professor', origem: 'cortesia', versaoMs: 0 } });
  r = await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      { buscar: async () => assinaturaMp({ auto_recurring: { transaction_amount: 10 },
          preapproval_plan_id: 'PLANO-APOIA' }), ler: banco.ler, gravar: banco.gravar });
  ok('a assinatura paga substitui a cortesia do painel',
      r.feito === true && banco.docs['assinaturas/uid-professor'].origem === 'mercadopago'
      && banco.docs['assinaturas/uid-professor'].plano === 'apoiase');

  // ================= 5. AVISO QUE NAO E' DE ASSINATURA =================
  console.log('\n5. Avisos fora do escopo');
  ok('merchant_order e ignorado sem quebrar',
      R.interpretarNotificacao({ type: 'merchant_order', data: { id: '1' } }).acao === 'ignorar');
  ok('aviso sem id e ignorado',
      R.interpretarNotificacao({ type: 'subscription_preapproval', data: {} }).acao === 'ignorar');
  ok('pagamento avulso NAO e mais ignorado: e o caminho do Pix',
      R.interpretarNotificacao({ type: 'payment', data: { id: '1' } }).acao === 'buscar-pagamento');

  banco = bancoFalso();
  r = await W.processarNotificacao({ type: 'merchant_order', data: { id: '1' } }, ambiente,
      { buscar: async () => { throw new Error('nao deveria buscar'); },
        ler: banco.ler, gravar: banco.gravar });
  ok('e o que e ignorado nao encosta no banco',
      r.feito === false && Object.keys(banco.docs).length === 0);

  // ================= 6. A CONFERENCIA DE ORIGEM =================
  console.log('\n6. So aceita aviso assinado pelo Mercado Pago');
  const cabecalhos = (obj) => ({ get: (k) => obj[k.toLowerCase()] || null });

  let conf = await W.conferirAssinaturaMp(cabecalhos({}), 'PRE-1', '');
  ok('sem segredo configurado, o webhook recusa tudo (nao nasce aberto)', conf.ok === false);

  conf = await W.conferirAssinaturaMp(
      cabecalhos({ 'x-signature': 'ts=' + Math.floor(Date.now() / 1000) + ',v1=naoconfere',
                   'x-request-id': 'req-1' }), 'PRE-1', 'segredo');
  ok('assinatura errada e recusada', conf.ok === false && conf.motivo.indexOf('confere') !== -1);

  // Assina de verdade, do mesmo jeito que o Mercado Pago assina.
  const crypto = require('crypto');
  const ts = String(Math.floor(Date.now() / 1000));
  const manifesto = R.manifestoAssinatura('PRE-1', 'req-1', ts);
  const v1 = crypto.createHmac('sha256', 'segredo').update(manifesto).digest('hex');
  conf = await W.conferirAssinaturaMp(
      cabecalhos({ 'x-signature': 'ts=' + ts + ',v1=' + v1, 'x-request-id': 'req-1' }),
      'PRE-1', 'segredo');
  ok('assinatura correta passa', conf.ok === true);

  const tsVelho = String(Math.floor(Date.now() / 1000) - 3600);
  const v1Velho = crypto.createHmac('sha256', 'segredo')
      .update(R.manifestoAssinatura('PRE-1', 'req-1', tsVelho)).digest('hex');
  conf = await W.conferirAssinaturaMp(
      cabecalhos({ 'x-signature': 'ts=' + tsVelho + ',v1=' + v1Velho, 'x-request-id': 'req-1' }),
      'PRE-1', 'segredo');
  ok('aviso antigo reenviado por terceiros e recusado (janela de tempo)', conf.ok === false);

  // O Mercado Pago assina o id que vai na QUERY STRING. Pegar o id so' do corpo
  // resulta em 401 eterno: eles reenviam, nos recusamos, e a assinatura de quem
  // pagou nunca sincroniza.
  ok('o id do manifesto sai da query string quando ela existe',
      W.idDaNotificacao({ url: 'https://w.dev/?data.id=PRE-9&type=subscription_preapproval' },
                        { data: { id: 'DO-CORPO' } }) === 'PRE-9');
  ok('sem query string, vale o id do corpo',
      W.idDaNotificacao({ url: 'https://w.dev/' }, { data: { id: 'DO-CORPO' } }) === 'DO-CORPO');

  // ================= 7. A VITRINE "OBRIGADO A QUEM E' PARCA" =================
  // Ela vinha de system/users_list.contribuidor, documento que QUALQUER conta logada
  // escreve: dava para pendurar o selo no proprio nome pelo console, sem pagar. Agora
  // e' o webhook que mantem `contribuintes/<uid>`, depois do pagamento confirmado.
  console.log('\n7. A vitrine de contribuintes');

  const comLista = { 'system/users_list': { list: [
      { email: 'professor@escola.com', uid: 'uid-professor', nome: 'Ana Carolina Souza', schoolId: '77' } ] } };

  banco = bancoFalso(comLista);
  let apagados = [];
  const comApagar = () => ({ ler: banco.ler, gravar: banco.gravar,
      apagar: async (c) => { apagados.push(c); delete banco.docs[c]; } });

  r = await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      Object.assign({ buscar: async () => assinaturaMp() }, comApagar()));
  ok('pagamento confirmado coloca o nome na vitrine',
      r.feito === true && !!banco.docs['contribuintes/uid-professor']);
  ok('com o nome abreviado, como a tela sempre mostrou',
      banco.docs['contribuintes/uid-professor'].nome === 'Ana S.');
  ok('e a escola, para a lista ser a da escola de quem olha',
      banco.docs['contribuintes/uid-professor'].schoolId === '77');
  ok('sem plano, valor nem e-mail (quanto alguem paga nao e assunto da sala dos professores)',
      !('plano' in banco.docs['contribuintes/uid-professor'])
      && !('valor' in banco.docs['contribuintes/uid-professor'])
      && !('email' in banco.docs['contribuintes/uid-professor']));

  // cartao recusado tira o nome da vitrine
  apagados = [];
  await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      Object.assign({ buscar: async () => assinaturaMp({ status: 'paused',
          last_modified: '2026-09-23T10:00:00.000-03:00' }) }, comApagar()));
  ok('assinatura pausada sai da vitrine na hora',
      apagados.indexOf('contribuintes/uid-professor') !== -1
      && !banco.docs['contribuintes/uid-professor']);

  ok('a abreviacao aguenta nome de uma palavra e nome vazio',
      W.abreviarNomeContribuinte('Madonna') === 'Madonna'
      && W.abreviarNomeContribuinte('') === 'Professor(a)'
      && W.abreviarNomeContribuinte('  Ana   Souza ') === 'Ana S.');

  // ================= 8. CANCELAMENTO PEDIDO PELO PROFESSOR =================
  console.log('\n8. O professor cancelando a propria assinatura');

  const ASSINADA = { uid: 'uid-professor', plano: 'professor', planoContratado: 'professor',
      status: 'ativa', valor: 20, origem: 'mercadopago', preapprovalId: 'PRE-1', versaoMs: 1000 };

  banco = bancoFalso(Object.assign({ 'assinaturas/uid-professor': ASSINADA,
      'contribuintes/uid-professor': { uid: 'uid-professor', nome: 'Ana S.' } }, comLista));
  apagados = [];
  let canceladoNoMp = null;
  let resCancel = await W.cancelarAssinatura('uid-professor', ambiente,
      Object.assign({ cancelarNoMp: async (id) => { canceladoNoMp = id; } }, comApagar()));

  ok('cancela de verdade no Mercado Pago (nao so no nosso banco)', canceladoNoMp === 'PRE-1');
  ok('e o plano cai para free na mesma hora, sem esperar o webhook voltar',
      resCancel.cancelada === true
      && banco.docs['assinaturas/uid-professor'].status === 'cancelada'
      && banco.docs['assinaturas/uid-professor'].plano === 'free');
  ok('o nome sai da vitrine', apagados.indexOf('contribuintes/uid-professor') !== -1);
  ok('guarda quando foi a pessoa que cancelou',
      !!banco.docs['assinaturas/uid-professor'].canceladaPeloUsuarioEm);

  // A notificacao atrasada do Mercado Pago nao pode RESSUSCITAR o que a pessoa cancelou.
  const antesDoRessuscita = banco.docs['assinaturas/uid-professor'].status;
  await W.processarNotificacao({ type: 'subscription_preapproval', data: { id: 'PRE-1' } }, ambiente,
      Object.assign({ buscar: async () => assinaturaMp({ status: 'authorized',
          last_modified: '2026-09-21T12:00:00.000-03:00' }) }, comApagar()));
  ok('aviso atrasado NAO reativa a assinatura que a pessoa acabou de cancelar',
      antesDoRessuscita === 'cancelada'
      && banco.docs['assinaturas/uid-professor'].status === 'cancelada');

  // Cancelar duas vezes nao quebra nem cobra de novo.
  canceladoNoMp = null;
  resCancel = await W.cancelarAssinatura('uid-professor', ambiente,
      Object.assign({ cancelarNoMp: async (id) => { canceladoNoMp = id; } }, comApagar()));
  ok('cancelar de novo nao chama o Mercado Pago outra vez',
      resCancel.cancelada === true && canceladoNoMp === null);

  // Conta sem assinatura, e cortesia do painel (que nao tem cobranca no cartao).
  banco = bancoFalso(comLista);
  resCancel = await W.cancelarAssinatura('uid-professor', ambiente,
      Object.assign({ cancelarNoMp: async () => { throw new Error('nao deveria chamar'); } }, comApagar()));
  ok('quem nao tem assinatura recebe explicacao, nao erro',
      resCancel.cancelada === false && /nao encontrei/.test(resCancel.motivo));

  banco = bancoFalso(Object.assign({ 'assinaturas/uid-professor': {
      uid: 'uid-professor', plano: 'professor', status: 'ativa', origem: 'cortesia', versaoMs: 0 } }, comLista));
  resCancel = await W.cancelarAssinatura('uid-professor', ambiente,
      Object.assign({ cancelarNoMp: async () => { throw new Error('nao deveria chamar'); } }, comApagar()));
  ok('cortesia do painel nao finge cancelamento de cobranca inexistente',
      resCancel.cancelada === false && /nao tem cobranca/.test(resCancel.motivo));

  // ================= 9. NINGUEM CANCELA A ASSINATURA DE OUTRO =================
  console.log('\n9. O cracha da sessao no cancelamento');
  const semCracha = await W.tratarRequisicao(
      new Request('https://w.dev/api/cancelar', { method: 'POST', body: '{}' }),
      { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('pedido de cancelamento sem cracha e recusado com 401', semCracha.status === 401);

  const crachaInventado = await W.tratarRequisicao(
      new Request('https://w.dev/api/cancelar', { method: 'POST', body: '{}',
        headers: { authorization: 'Bearer eu.sou.oprofessor' } }),
      { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('cracha inventado tambem e recusado (nao basta parecer um token)',
      crachaInventado.status === 401);

  const metodoErrado = await W.tratarRequisicao(
      new Request('https://w.dev/api/cancelar', { method: 'GET' }), { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('GET no cancelamento nao cancela nada', metodoErrado.status === 405);

  const A = await import('../assinatura/auth-firebase.mjs');
  let recusou = '';
  try {
    await A.verificarTokenFirebase(
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJxdWFscXVlciIsImF1ZCI6InByb2ZzaXMzIn0.', 'profsis3');
  } catch (e) { recusou = e.message; }
  ok('cracha com "alg: none" e recusado antes de qualquer outra checagem',
      /algoritmo nao aceito/.test(recusou));

  // ================= 10. O CORTE POR ATRASO =================
  // O corte por cartao recusado depende de o Mercado Pago avisar. Ha' um caso que
  // aviso nenhum cobre: a notificacao que se perde. Sem prazo, o documento fica
  // `ativa` para sempre e a pessoa usa premium sem pagar, sem ninguem descobrir.
  console.log('\n10. Corte por atraso (o silencio deixa de valer acesso)');

  const HOJE = Date.parse('2026-09-22T12:00:00Z');
  const emDias = (n) => new Date(HOJE + n * 86400000).toISOString();
  const noPlanoProfessor = (extra) => Object.assign({ status: 'ativa', plano: 'professor' }, extra || {});

  ok('dentro do prazo, o plano vale',
      R.planoValido(noPlanoProfessor({ proximaCobranca: emDias(8) }), {}, HOJE) === 'professor');
  ok('venceu ontem: continua valendo (carencia de 5 dias)',
      R.planoValido(noPlanoProfessor({ proximaCobranca: emDias(-1) }), {}, HOJE) === 'professor');
  ok('e a tela sabe que esta em atraso, para avisar antes de cortar',
      R.assinaturaEmAtraso(noPlanoProfessor({ proximaCobranca: emDias(-1) }), {}, HOJE) === true);
  ok('passou a carencia: o acesso CAI, mesmo com o documento dizendo ativa',
      R.planoValido(noPlanoProfessor({ proximaCobranca: emDias(-6) }), {}, HOJE) === 'free'
      && R.assinaturaVencida(noPlanoProfessor({ proximaCobranca: emDias(-6) }), {}, HOJE) === true);
  ok('a carencia e configuravel: 15 dias segura quem 5 cortaria',
      R.planoValido(noPlanoProfessor({ proximaCobranca: emDias(-6) }), { diasTolerancia: 15 }, HOJE) === 'professor');
  ok('carencia zero corta no dia seguinte ao vencimento',
      R.planoValido(noPlanoProfessor({ proximaCobranca: emDias(-1) }), { diasTolerancia: 0 }, HOJE) === 'free');
  ok('carencia absurda e' + ' limitada (60 dias nao e tolerancia, e presente)',
      R.diasDeTolerancia({ diasTolerancia: 9999 }) === 60
      && R.diasDeTolerancia({ diasTolerancia: -3 }) === R.DIAS_TOLERANCIA_PADRAO
      && R.diasDeTolerancia({}) === R.DIAS_TOLERANCIA_PADRAO);
  ok('cortesia SEM prazo nao vence por data (e decisao do super admin, nao atraso)',
      R.assinaturaVencida({ status: 'ativa', plano: 'professor', origem: 'cortesia' }, {}, HOJE) === false);
  ok('e nem a data de vencimento salva quem esta pausada ou cancelada',
      R.planoValido({ status: 'pausada', plano: 'professor', proximaCobranca: emDias(30) }, {}, HOJE) === 'free'
      && R.planoValido({ status: 'cancelada', plano: 'professor', proximaCobranca: emDias(30) }, {}, HOJE) === 'free');

  // A VARREDURA DIARIA: e' ela que conserta o banco, nao so' a tela.
  console.log('\n10b. A varredura diaria');

  const bancoVarredura = (docs) => {
    const guardados = Object.assign({}, docs);
    const apagadosAqui = [];
    return {
      docs: guardados, apagados: apagadosAqui,
      listar: async () => ({
        documentos: Object.keys(guardados)
          .filter(k => k.indexOf('assinaturas/') === 0)
          .map(k => Object.assign({ _id: k.split('/')[1] }, guardados[k])),
        proximaPagina: '' }),
      ler: async (c) => (c in guardados ? JSON.parse(JSON.stringify(guardados[c])) : null),
      gravar: async (c, d) => { guardados[c] = JSON.parse(JSON.stringify(d)); },
      apagar: async (c) => { apagadosAqui.push(c); delete guardados[c]; }
    };
  };

  // Pix vencido: nao ha o que perguntar a ninguem, so cortar.
  let bv = bancoVarredura({
    'assinaturas/uid-pix': { uid: 'uid-pix', plano: 'professor', status: 'ativa',
      origem: 'pix', validoAte: emDias(-20), versaoMs: 1 },
    'contribuintes/uid-pix': { uid: 'uid-pix', nome: 'Bia P.' },
    'assinaturas/uid-emdia': { uid: 'uid-emdia', plano: 'apoiase', status: 'ativa',
      origem: 'pix', validoAte: emDias(40), versaoMs: 1 },
    'contribuintes/uid-emdia': { uid: 'uid-emdia', nome: 'Caio D.' }
  });
  let rel = await W.reconciliarAssinaturas({}, bv);
  ok('a varredura corta o Pix vencido no banco',
      bv.docs['assinaturas/uid-pix'].status === 'vencida'
      && bv.docs['assinaturas/uid-pix'].plano === 'free'
      && !!bv.docs['assinaturas/uid-pix'].cortadoPorAtrasoEm);
  ok('e tira o nome dele da vitrine', bv.apagados.indexOf('contribuintes/uid-pix') !== -1);
  ok('quem esta em dia nao e tocado',
      bv.docs['assinaturas/uid-emdia'].status === 'ativa'
      && !!bv.docs['contribuintes/uid-emdia'] && rel.intactas === 1);

  // Cartao vencido: a varredura PERGUNTA ao Mercado Pago. O caso injusto - pagou e o
  // aviso se perdeu - tem que voltar para cima, nao so cortar.
  bv = bancoVarredura({
    'assinaturas/uid-professor': { uid: 'uid-professor', plano: 'professor', status: 'ativa',
      origem: 'mercadopago', preapprovalId: 'PRE-1', proximaCobranca: emDias(-30), versaoMs: 1 },
    'system/users_list': { list: [{ uid: 'uid-professor', nome: 'Ana Souza', schoolId: '77',
      email: 'professor@escola.com' }] }
  });
  rel = await W.reconciliarAssinaturas({}, Object.assign({
    buscarNoMp: async () => assinaturaMp({ status: 'authorized', next_payment_date: emDias(9) })
  }, bv));
  ok('assinatura paga cujo aviso se perdeu e REATIVADA pela varredura',
      rel.reativadas === 1 && bv.docs['assinaturas/uid-professor'].status === 'ativa'
      && !!bv.docs['contribuintes/uid-professor']);

  bv = bancoVarredura({
    'assinaturas/uid-professor': { uid: 'uid-professor', plano: 'professor', status: 'ativa',
      origem: 'mercadopago', preapprovalId: 'PRE-1', proximaCobranca: emDias(-30), versaoMs: 1 },
    'contribuintes/uid-professor': { uid: 'uid-professor', nome: 'Ana S.' },
    'system/users_list': { list: [] }
  });
  rel = await W.reconciliarAssinaturas({}, Object.assign({
    buscarNoMp: async () => assinaturaMp({ status: 'cancelled', next_payment_date: '' })
  }, bv));
  ok('assinatura que o Mercado Pago diz cancelada e cortada e sai da vitrine',
      rel.cortadas === 1 && bv.docs['assinaturas/uid-professor'].status === 'cancelada'
      && bv.apagados.indexOf('contribuintes/uid-professor') !== -1);

  const semSegredo = await W.tratarRequisicao(
      new Request('https://w.dev/api/reconciliar', { method: 'GET' }), { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('a varredura nao fica aberta na internet (sem segredo, 401)', semSegredo.status === 401);

  // ================= 11. PIX: APOIO EM PACOTE DE MESES =================
  // O Mercado Pago nao faz recorrencia no Pix. Entao Pix e' pagamento avulso que
  // credita meses, e o acesso vence sozinho no fim - nada cobrado sem autorizacao.
  console.log('\n11. Pix: apoio em pacote de meses');

  const ambientePix = { MP_PACOTES_PIX: 'apoiase:3:30,professor:3:60,professor:12:240' };
  const pagamentoPix = (extra) => Object.assign({
    _tipo: 'pagamento', id: 'PAY-100', status: 'approved', transaction_amount: 60,
    payment_method_id: 'pix', external_reference: 'uid-professor|professor|3',
    date_approved: '2026-09-22T12:00:00.000-03:00',
    payer: { email: 'professor@escola.com' }
  }, extra || {});

  ok('os pacotes saem do ambiente (preco que vira acesso nao mora no banco publico)',
      W.lerPacotesPix(ambientePix).length === 3
      && W.lerPacotesPix(ambientePix)[1].plano === 'professor');

  banco = bancoFalso(comLista);
  r = await W.processarNotificacao({ type: 'payment', data: { id: 'PAY-100' } }, ambientePix,
      Object.assign({ buscar: async () => pagamentoPix() }, comApagar()));
  ok('Pix aprovado credita os meses do pacote',
      r.feito === true && r.origem === 'pix' && r.meses === 3
      && banco.docs['assinaturas/uid-professor'].plano === 'professor'
      && banco.docs['assinaturas/uid-professor'].origem === 'pix');
  ok('com data de validade no futuro, e nao cobranca recorrente',
      Date.parse(banco.docs['assinaturas/uid-professor'].validoAte) > Date.now()
      && !banco.docs['assinaturas/uid-professor'].preapprovalId);
  ok('e o nome entra na vitrine', !!banco.docs['contribuintes/uid-professor']);

  // Pix NAO aprovado nao libera nada. Era o pedido: so depois da confirmacao.
  banco = bancoFalso(comLista);
  r = await W.processarNotificacao({ type: 'payment', data: { id: 'PAY-101' } }, ambientePix,
      Object.assign({ buscar: async () => pagamentoPix({ id: 'PAY-101', status: 'pending' }) }, comApagar()));
  ok('Pix pendente NAO credita nada',
      r.feito === false && !banco.docs['assinaturas/uid-professor']);

  // Sem a referencia, o VALOR identifica o pacote (link de pagamento do Mercado Pago
  // nem sempre devolve a referencia).
  banco = bancoFalso(comLista);
  r = await W.processarNotificacao({ type: 'payment', data: { id: 'PAY-102' } }, ambientePix,
      Object.assign({ buscar: async () => pagamentoPix({ id: 'PAY-102', external_reference: '',
        transaction_amount: 240 }) }, comApagar()));
  ok('sem referencia, o valor recebido identifica o pacote (12 meses de Professor)',
      r.feito === true && r.meses === 12 && r.plano === 'professor');

  // Pagamento que nao e' de apoio nao pode virar plano por acidente.
  banco = bancoFalso(comLista);
  r = await W.processarNotificacao({ type: 'payment', data: { id: 'PAY-103' } }, ambientePix,
      Object.assign({ buscar: async () => pagamentoPix({ id: 'PAY-103', external_reference: '',
        transaction_amount: 17.5 }) }, comApagar()));
  ok('pagamento fora dos pacotes NAO vira plano por acidente',
      r.feito === false && !banco.docs['assinaturas/uid-professor']);

  // O mesmo Pix avisado duas vezes nao pode creditar o dobro.
  banco = bancoFalso(comLista);
  await W.processarNotificacao({ type: 'payment', data: { id: 'PAY-100' } }, ambientePix,
      Object.assign({ buscar: async () => pagamentoPix() }, comApagar()));
  const validoDepoisDoPrimeiro = banco.docs['assinaturas/uid-professor'].validoAte;
  r = await W.processarNotificacao({ type: 'payment', data: { id: 'PAY-100' } }, ambientePix,
      Object.assign({ buscar: async () => pagamentoPix() }, comApagar()));
  ok('o mesmo Pix avisado duas vezes nao credita o dobro de meses',
      r.feito === false && banco.docs['assinaturas/uid-professor'].validoAte === validoDepoisDoPrimeiro);

  // Renovar ANTES de vencer nao perde os dias que faltavam.
  const daquiA10Dias = new Date(Date.now() + 10 * 86400000).toISOString();
  const somado = R.somarMeses(daquiA10Dias, 3, Date.now());
  ok('renovar antes de vencer soma a partir da data que ja tinha (nao perde dias)',
      Date.parse(somado) > Date.parse(daquiA10Dias) + 80 * 86400000);
  ok('e quem esta vencido soma a partir de hoje, nao do passado',
      Date.parse(R.somarMeses(emDias(-90), 1, HOJE)) > HOJE);

  ok('referencia torta e ignorada em vez de creditar coisa errada',
      R.lerReferenciaPix('uid|professor') === null
      && R.lerReferenciaPix('uid|inexistente|3') === null
      && R.lerReferenciaPix('uid|professor|99') === null
      && R.lerReferenciaPix('uid|professor|3').meses === 3);

  // ================= 11b. O QR CODE DO PIX NASCE NO SERVICO =================
  // Antes o professor ia para um "link de pagamento" criado a mao. Agora o QR nasce
  // aqui, com o valor do pacote e a referencia de quem pediu - o que tira o link do
  // caminho e garante a identificacao (fomos nos que criamos o pagamento).
  console.log('\n11b. O QR Code do Pix');

  const DONO = { uid: 'uid-professor', email: 'ana@escola.com' };
  let pedidoAoMp = null;
  const mpQueGeraQr = {
    criarPagamentoNoMp: async (corpo, chave) => {
      pedidoAoMp = { corpo, chave };
      return { id: 'PAY-QR-1', status: 'pending', date_of_expiration: corpo.date_of_expiration,
        point_of_interaction: { transaction_data: {
          qr_code: '00020126580014br.gov.bcb.pix...', qr_code_base64: 'iVBORw0KGgo=' } } };
    }
  };

  let qr = await W.criarPixDoPacote({ plano: 'professor', meses: 3 }, DONO, ambientePix, mpQueGeraQr);
  ok('o pacote vira um Pix com o valor certo',
      qr.ok === true && qr.valor === 60 && pedidoAoMp.corpo.transaction_amount === 60);
  ok('marcado como Pix, com descricao que a pessoa entende no extrato',
      pedidoAoMp.corpo.payment_method_id === 'pix'
      && /Professor/.test(pedidoAoMp.corpo.description) && /3 meses/.test(pedidoAoMp.corpo.description));
  ok('levando quem pediu e quantos meses creditar',
      pedidoAoMp.corpo.external_reference === 'uid-professor|professor|3');
  ok('e a tela recebe o copia e cola e a imagem do QR',
      qr.copiaECola.indexOf('br.gov.bcb.pix') !== -1 && qr.qrCodeBase64 === 'iVBORw0KGgo=');
  ok('com chave de idempotencia (clicar duas vezes nao cria dois Pix)',
      typeof pedidoAoMp.chave === 'string' && pedidoAoMp.chave.indexOf('uid-professor') === 0);
  ok('e com prazo de validade', !!pedidoAoMp.corpo.date_of_expiration
      && Date.parse(pedidoAoMp.corpo.date_of_expiration) > Date.now());

  // O VALOR NUNCA VEM DO NAVEGADOR. Se viesse, dava para comprar 12 meses por um centavo.
  pedidoAoMp = null;
  qr = await W.criarPixDoPacote({ plano: 'professor', meses: 12, valor: 0.01 }, DONO, ambientePix, mpQueGeraQr);
  ok('o valor mandado pelo navegador e IGNORADO: manda o pacote do servidor',
      qr.ok === true && qr.valor === 240 && pedidoAoMp.corpo.transaction_amount === 240);

  pedidoAoMp = null;
  qr = await W.criarPixDoPacote({ plano: 'professor', meses: 99 }, DONO, ambientePix, mpQueGeraQr);
  ok('pacote que nao existe e recusado sem criar pagamento nenhum',
      qr.ok === false && pedidoAoMp === null);

  pedidoAoMp = null;
  qr = await W.criarPixDoPacote({ plano: 'super_admin', meses: 3 }, DONO, ambientePix, mpQueGeraQr);
  ok('plano inventado tambem nao passa', qr.ok === false && pedidoAoMp === null);

  qr = await W.criarPixDoPacote({ plano: 'professor', meses: 3 }, DONO, ambientePix, {
    criarPagamentoNoMp: async () => ({ id: 'PAY-X', status: 'pending' }) });
  ok('resposta do Mercado Pago sem o codigo do Pix vira erro explicado, nao tela em branco',
      qr.ok === false && /nao devolveu o codigo/.test(qr.motivo));

  const pixSemCracha = await W.tratarRequisicao(
      new Request('https://w.dev/api/pix', { method: 'POST', body: '{}' }),
      { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('pedir Pix sem cracha da sessao e recusado com 401', pixSemCracha.status === 401);

  const pixGet = await W.tratarRequisicao(
      new Request('https://w.dev/api/pix', { method: 'GET' }), { FIREBASE_PROJECT_ID: 'profsis3' });
  ok('GET em /pix nao gera cobranca', pixGet.status === 405);

  // ================= 12. OS VALORES BATEM NOS DOIS LADOS =================
  console.log('\n12. Servidor e navegador falam do mesmo preco');
  const front = fs.readFileSync(path.join(RAIZ, 'assinatura.js'), 'utf8');
  const valorNoFront = (id) => {
    const trecho = front.split("    " + id + ": {")[1] || '';
    const m = trecho.match(/valor:\s*([0-9.]+)/);
    return m ? Number(m[1]) : null;
  };
  ok('Apoia-se vale R$ 10 no servidor e no navegador',
      R.PLANOS.apoiase.valor === 10 && valorNoFront('apoiase') === 10);
  ok('Professor vale R$ 20 no servidor e no navegador',
      R.PLANOS.professor.valor === 20 && valorNoFront('professor') === 20);
  ok('so o plano Professor e premium',
      R.PLANOS.professor.premium === true && R.PLANOS.apoiase.premium === false
      && R.PLANOS.free.premium === false);

  console.log('\n' + (falhas.length === 0
    ? 'TUDO CERTO: a assinatura automatica se comporta.'
    : 'FALHARAM ' + falhas.length + ': ' + falhas.join(' | ')));
  process.exit(falhas.length === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
