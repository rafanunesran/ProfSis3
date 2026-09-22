// A ASSINATURA NA TELA: OS DOIS PLANOS, O CARTAO E O PORTAO PREMIUM.
//
// Ate' aqui, "contribuinte" era um campo que o super admin marcava na mao e que so'
// servia para esconder a tarja amarela. Agora ha' cobranca mensal no cartao, dois
// planos e funcoes premium — e o que decide tudo e' o documento assinaturas/<uid>,
// que NENHUMA conta comum escreve (ver firestore.rules).
//
// Cobrimos:
//   1. o pop-up mostra os tres planos com os precos certos e leva ao Mercado Pago
//      com o uid grudado no link (e' assim que o webhook sabe de quem e' o pagamento);
//   2. quem esta' no gratuito ve a tarja; quem assina NAO ve, e o botao vira TMJ/Professor;
//   3. o portao premium: Apoia-se NAO abre funcao premium, Professor abre;
//   4. cartao recusado (assinatura `pausada`) nao libera nada;
//   5. o apoiador antigo de R$ 7,00 recebe o aviso do encerramento com as TRES saidas,
//      e a escolha nao volta a perguntar;
//   6. o professor NAO consegue se promover sozinho: o plano vem do banco, nao do perfil.
const { chromium } = require('playwright');

const URL = (process.env.PROFSIS_URL || 'http://localhost:8877') + '/index.html';
const CHROME = process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Firebase de mentira: um banco em memoria que o teste enche antes de cada cena.
const FAKE = () => {
  window.__docs = {};
  const ref = (col, id) => ({
    get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : null }; },
    set: async (o) => { window.__docs[col + '/' + id] = JSON.parse(JSON.stringify(o)); },
    delete: async () => { delete window.__docs[col + '/' + id]; }
  });
  // A vitrine de contribuintes e' lida por consulta (where/limit), nao por documento.
  const colecao = (c) => {
    const consulta = (filtro) => ({
      where: (campo, _op, valor) => consulta((d) => filtro(d) && String(d[campo] || '') === String(valor)),
      limit: () => consulta(filtro),
      get: async () => {
        const achados = Object.keys(window.__docs)
          .filter(k => k.indexOf(c + '/') === 0)
          .map(k => window.__docs[k])
          .filter(d => d && filtro(d));
        return { forEach: (fn) => achados.forEach(d => fn({ data: () => d })), size: achados.length };
      }
    });
    return Object.assign(consulta(() => true), { doc: (i) => ref(c, String(i)) });
  };
  window.firebase = {
    initializeApp: () => {}, analytics: () => {},
    auth: () => ({ currentUser: { uid: 'uid-ana', email: 'ana@escola.com',
                     getIdToken: async () => 'cracha-de-mentira' },
                   onAuthStateChanged: (cb) => setTimeout(() => cb(null), 0), signOut: async () => {} }),
    firestore: () => ({ collection: colecao })
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
  // Guarda para onde o app tentou mandar a pessoa, em vez de abrir aba de verdade.
  window.__abriu = [];
  window.open = (u) => { window.__abriu.push(String(u)); return null; };
};

const ANA = { id: 'uid-ana', uid: 'uid-ana', nome: 'Ana Souza', email: 'ana@escola.com', role: 'professor', schoolId: '77' };

const falhas = [];
const ok = (nome, cond) => { console.log((cond ? '  ok   ' : '  FALHA') + ' - ' + nome); if (!cond) falhas.push(nome); };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const p = await (await b.newContext()).newPage();
  p.on('dialog', d => d.accept());

  await p.addInitScript(FAKE);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // Coloca a conta dentro do app, sem passar pelo login.
  const entrar = async (usuario, assinatura, links, vitrine) => p.evaluate(async (args) => {
    window.__docs = {};
    window.__docs['system/users_list'] = { list: [args.usuario] };
    if (args.assinatura) window.__docs['assinaturas/' + args.usuario.uid] = args.assinatura;
    if (args.links) window.__docs['assinaturas_config/publico'] = args.links;
    (args.vitrine || []).forEach(c => { window.__docs['contribuintes/' + c.uid] = c; });
    localStorage.removeItem('sisprof_transicao_assinatura');

    currentUser = args.usuario; currentViewMode = 'professor';
    window.dadosCarregados = true;
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';

    // Limpa o que a cena anterior deixou na tela.
    ['bannerApoio', 'btnApoie', 'modalApoie', 'modalTransicaoAssinatura'].forEach(id => {
      const el = document.getElementById(id); if (el) el.remove();
    });
    window.__abriu = [];
    // Zera o estado guardado em assinatura.js relendo o documento.
    await carregarAssinaturaAtual(true);
    injectApoieButton();
    atualizarBannerApoio();
    await new Promise(r => setTimeout(r, 300));
  }, { usuario, assinatura, links, vitrine });

  const ATIVA = (plano, extra) => Object.assign({
    uid: 'uid-ana', plano: plano, planoContratado: plano, status: 'ativa',
    valor: plano === 'professor' ? 20 : 10, legado: false, origem: 'mercadopago',
    proximaCobranca: '2026-10-21T12:00:00.000-03:00', versaoMs: 1
  }, extra || {});

  const LINKS = {
    apoiase: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=APOIA',
    professor: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=PROF'
  };

  // ============ 1. O POP-UP MOSTRA OS PLANOS E LEVA AO MERCADO PAGO ============
  console.log('\n1. Os planos e o caminho do cartao');

  // Antes de qualquer coisa: enquanto o administrador nao tiver criado os planos no
  // Mercado Pago, o botao explica em vez de abrir uma aba para lugar nenhum.
  await entrar(ANA, null, null);
  const r1a = await p.evaluate(async () => {
    await assinarPlano('professor');
    return { abriu: window.__abriu.length };
  });
  ok('plano ainda nao configurado no Mercado Pago nao abre aba vazia', r1a.abriu === 0);

  await entrar(ANA, null, LINKS);
  const r1 = await p.evaluate(async () => {
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 200));
    const texto = document.getElementById('conteudoModalApoie').textContent;
    document.getElementById('btnAssinar_professor').click();
    await new Promise(r => setTimeout(r, 200));
    return {
      texto: texto,
      temFree: texto.indexOf('Gratuito') !== -1,
      temApoiase: texto.indexOf('Apoia-se') !== -1,
      temProfessor: texto.indexOf('Professor') !== -1,
      dez: texto.indexOf('R$ 10,00') !== -1,
      vinte: texto.indexOf('R$ 20,00') !== -1,
      seteSumiu: texto.indexOf('R$ 7,00') === -1,
      destino: window.__abriu[0] || ''
    };
  });
  ok('o pop-up mostra os tres planos', r1.temFree && r1.temApoiase && r1.temProfessor);
  ok('com os precos novos: R$ 10,00 e R$ 20,00', r1.dez && r1.vinte);
  ok('o valor antigo de R$ 7,00 nao aparece mais', r1.seteSumiu);
  ok('diz que a cobranca e mensal e automatica no cartao',
      /mensal/i.test(r1.texto) && /cart[aã]o/i.test(r1.texto));
  ok('avisa que o SisProf nao guarda o cartao', /nunca v[eê] nem guarda/i.test(r1.texto));
  ok('"Assinar" leva ao checkout do plano certo no Mercado Pago',
      r1.destino.indexOf('mercadopago.com.br') !== -1 && r1.destino.indexOf('preapproval_plan_id=PROF') !== -1);
  ok('o uid vai grudado no link (e assim que o webhook acha o dono do pagamento)',
      r1.destino.indexOf('external_reference=uid-ana') !== -1);
  ok('e o retorno volta para o proprio sistema', r1.destino.indexOf('back_url=') !== -1);


  // ============ 2. A TARJA E O BOTAO DO CABECALHO ============
  console.log('\n2. A tarja amarela e o botao do cabecalho');
  await entrar(ANA, null, LINKS);
  const r2a = await p.evaluate(() => ({
    tarja: !!document.getElementById('bannerApoio'),
    botao: document.getElementById('btnApoie').textContent.trim(),
    plano: planoDoUsuario()
  }));
  ok('quem esta no gratuito ve a tarja de apoio', r2a.tarja);
  ok('e o botao convida a apoiar', r2a.botao.indexOf('Apoie') !== -1 && r2a.plano === 'free');

  await entrar(ANA, ATIVA('apoiase'), LINKS,
               [{ uid: 'uid-ana', nome: 'Ana S.', schoolId: '77' }]);
  const r2b = await p.evaluate(async () => {
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 300));
    return {
      tarja: !!document.getElementById('bannerApoio'),
      botao: document.getElementById('btnApoie').textContent.trim(),
      plano: planoDoUsuario(),
      vitrine: document.getElementById('apoieContribuintes').textContent,
      // O aplicativo NAO escreve mais o selo no perfil: aquele campo e' gravavel por
      // qualquer conta logada (system/*), e era por ali que dava para se declarar
      // apoiador sem pagar.
      escreveuNoPerfil: (window.__docs['system/users_list'].list[0] || {}).contribuidor
    };
  });
  ok('quem assinou o Apoia-se NAO ve mais a tarja', !r2b.tarja);
  ok('e o botao vira "TMJ"', r2b.botao.indexOf('TMJ') !== -1 && r2b.plano === 'apoiase');
  ok('o nome aparece na vitrine, vindo da colecao que so o webhook escreve',
      r2b.vitrine.indexOf('Ana S.') !== -1);
  ok('e o aplicativo NAO escreve o selo no perfil (campo que qualquer um grava)',
      r2b.escreveuNoPerfil !== true);

  await entrar(ANA, ATIVA('professor'), LINKS);
  const r2c = await p.evaluate(() => ({
    botao: document.getElementById('btnApoie').textContent.trim(),
    tarja: !!document.getElementById('bannerApoio')
  }));
  ok('quem assinou o Professor ve o proprio plano no cabecalho',
      r2c.botao.indexOf('Professor') !== -1 && !r2c.tarja);

  // ============ 3. O PORTAO DAS FUNCOES PREMIUM ============
  console.log('\n3. O portao das funcoes premium');
  await entrar(ANA, ATIVA('apoiase'), LINKS);
  const r3a = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    const liberou = exigirPremium('Relatorio automatico da turma');
    await new Promise(r => setTimeout(r, 250));
    const modal = document.getElementById('conteudoModalApoie');
    return { liberou: liberou, premium: ehPremium(), contribui: ehContribuinte(),
             convidou: !!modal && modal.textContent.indexOf('Relatorio automatico da turma') !== -1 };
  });
  ok('Apoia-se apoia o projeto mas NAO abre funcao premium', r3a.liberou === false && r3a.premium === false);
  ok('e continua contando como contribuinte', r3a.contribui === true);
  ok('o bloqueio explica qual funcao e do plano Professor', r3a.convidou);

  await entrar(ANA, ATIVA('professor'), LINKS);
  const r3b = await p.evaluate(() => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    return { liberou: exigirPremium('Relatorio automatico da turma'),
             premium: ehPremium(),
             naoAbriuPopup: !document.getElementById('modalApoie') };
  });
  ok('o plano Professor abre a funcao premium', r3b.liberou === true && r3b.premium === true);
  ok('e nao incomoda com pop-up quem ja pagou', r3b.naoAbriuPopup);

  // ============ 4. CARTAO RECUSADO ============
  console.log('\n4. Quando a cobranca do mes nao passa');
  await entrar(ANA, ATIVA('professor', { status: 'pausada', plano: 'free' }), LINKS);
  const r4 = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 200));
    return { premium: ehPremium(), plano: planoDoUsuario(),
             texto: document.getElementById('conteudoModalApoie').textContent };
  });
  ok('assinatura pausada nao libera premium', r4.premium === false && r4.plano === 'free');
  ok('e a tela avisa que o cartao nao passou', /n[aã]o passou no cart[aã]o/i.test(r4.texto));

  // Quem cancela precisa REALMENTE voltar ao gratuito. Como o proprio aplicativo
  // acende a marca de contribuinte no perfil ao ver a assinatura ativa, essa marca
  // se sustentaria sozinha depois do cancelamento se ela pudesse falar mais alto
  // que o documento da assinatura.
  await entrar(Object.assign({}, ANA, { contribuidor: true }),
               ATIVA('professor', { status: 'cancelada', plano: 'free' }), LINKS);
  const r4b = await p.evaluate(() => ({
    plano: planoDoUsuario(), premium: ehPremium(), contribui: ehContribuinte(),
    tarja: !!document.getElementById('bannerApoio')
  }));
  ok('quem cancelou volta mesmo para o gratuito',
      r4b.plano === 'free' && r4b.premium === false && r4b.contribui === false);
  ok('a tarja de apoio volta a aparecer', r4b.tarja);
  ok('nem a marca antiga no perfil segura o plano de quem cancelou', r4b.contribui === false);

  // ============ 5. O APOIADOR ANTIGO DE R$ 7,00 ============
  console.log('\n5. O encerramento do plano antigo de R$ 7,00');
  const ANA_ANTIGA = Object.assign({}, ANA, { contribuidor: true });
  await entrar(ANA_ANTIGA, null, LINKS);
  await p.waitForTimeout(400);
  const r5 = await p.evaluate(() => {
    const modal = document.getElementById('modalTransicaoAssinatura');
    const texto = modal ? modal.textContent : '';
    return {
      apareceu: !!modal && modal.classList.contains('show') || (!!modal && modal.style.display !== 'none'),
      texto: texto,
      tresSaidas: !!document.getElementById('btnTransicaoFree')
                  && !!document.getElementById('btnTransicaoApoiase')
                  && !!document.getElementById('btnTransicaoProfessor'),
      precisava: precisaAvisarDaTransicao()
    };
  });
  ok('quem pagava R$ 7,00 recebe o aviso do encerramento', r5.apareceu && r5.precisava);
  ok('o aviso diz que a cobranca antiga sera cancelada por nos',
      /R\$ 7,00/.test(r5.texto) && /n[aã]o precisa fazer nada/i.test(r5.texto));
  ok('com as tres saidas: gratuito, Apoia-se e Professor', r5.tresSaidas);

  const r5b = await p.evaluate(async () => {
    document.getElementById('btnTransicaoFree').click();
    await new Promise(r => setTimeout(r, 400));
    return {
      fechou: (document.getElementById('modalTransicaoAssinatura') || {}).style.display !== 'block',
      escolha: localStorage.getItem('sisprof_transicao_assinatura'),
      naLista: (window.__docs['system/users_list'].list[0] || {}),
      perguntaDeNovo: precisaAvisarDaTransicao()
    };
  });
  ok('escolher "continuar no gratuito" fecha o aviso e nao pergunta de novo',
      r5b.escolha === 'free' && r5b.perguntaDeNovo === false);
  ok('o selo de contribuinte sai de quem parou de pagar, mas fica o registro de quem ja ajudou',
      r5b.naLista.contribuidor === false && r5b.naLista.contribuiuAntes === true);

  // Migrar para um plano novo leva direto ao cartao.
  await entrar(ANA_ANTIGA, null, LINKS);
  await p.waitForTimeout(400);
  const r5c = await p.evaluate(async () => {
    document.getElementById('btnTransicaoProfessor').click();
    await new Promise(r => setTimeout(r, 400));
    return { destino: window.__abriu[0] || '', escolha: localStorage.getItem('sisprof_transicao_assinatura') };
  });
  ok('escolher "Professor" leva direto ao checkout do plano de R$ 20',
      r5c.escolha === 'professor' && r5c.destino.indexOf('preapproval_plan_id=PROF') !== -1);

  // Quem ja assinou o plano NOVO nao recebe o aviso do encerramento.
  await entrar(Object.assign({}, ANA_ANTIGA), ATIVA('apoiase'), LINKS);
  await p.waitForTimeout(300);
  const r5d = await p.evaluate(() => ({ precisa: precisaAvisarDaTransicao() }));
  ok('quem ja migrou nao e incomodado pelo aviso', r5d.precisa === false);

  // ============ 6. NINGUEM SE PROMOVE SOZINHO ============
  console.log('\n6. So pagamento confirmado concede apoio');
  const r6 = await p.evaluate(async () => {
    // O perfil (system/users_list) e' gravavel por QUALQUER conta logada — e' assim
    // desde sempre, e as Regras explicam por que nao da' para fechar. Por isso ele
    // deixou de conceder qualquer coisa: antes, `contribuidor: true` bastava para
    // pendurar o selo no proprio nome, de graca, pelo console do navegador.
    currentUser.contribuidor = true;
    delete window.__docs['assinaturas/uid-ana'];
    await carregarAssinaturaAtual(true);
    const soComOPerfil = { plano: planoDoUsuario(), premium: ehPremium(), contribui: ehContribuinte() };

    // Inventar campos no perfil tambem nao promove.
    currentUser.plano = 'professor';
    currentUser.premium = true;
    currentUser.assinatura = { status: 'ativa', plano: 'professor' };
    await carregarAssinaturaAtual(true);
    const inventando = { plano: planoDoUsuario(), premium: ehPremium() };

    // E clicar em "Assinar" (sem o pagamento cair) tambem nao.
    window.__docs['assinaturas/uid-ana'] = { uid: 'uid-ana', plano: 'professor',
      planoContratado: 'professor', status: 'pendente', valor: 20, versaoMs: 1 };
    await carregarAssinaturaAtual(true);
    const esperando = { plano: planoDoUsuario(), premium: ehPremium(),
                        contribui: ehContribuinte(), avisando: esperandoConfirmacao() };
    return { soComOPerfil, inventando, esperando };
  });
  ok('marcar-se contribuinte no perfil NAO da mais nem o selo',
      r6.soComOPerfil.plano === 'free' && r6.soComOPerfil.contribui === false
      && r6.soComOPerfil.premium === false);
  ok('inventar campos no perfil tambem nao abre as funcoes premium',
      r6.inventando.premium === false && r6.inventando.plano === 'free');
  ok('assinatura iniciada e ainda nao paga (pendente) nao concede nada',
      r6.esperando.plano === 'free' && r6.esperando.premium === false
      && r6.esperando.contribui === false);
  ok('mas a tela sabe explicar que a confirmacao esta a caminho', r6.esperando.avisando === true);

  // ============ 7. O BOTAO DE CANCELAR ============
  // Cancelar precisa ser tao facil quanto assinar. Quem quer sair e nao encontra o
  // botao vira reclamacao no banco e cobranca contestada, nao apoiador no mes seguinte.
  console.log('\n7. Cancelar a assinatura');

  const COM_SERVICO = Object.assign({}, LINKS, { servico: 'https://sisprof.vercel.app/api' });

  await entrar(ANA, ATIVA('professor'), COM_SERVICO);
  const r7 = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    const botao = document.getElementById('btnCancelarAssinatura');
    return {
      existe: !!botao,
      texto: botao ? botao.textContent.trim() : '',
      explica: document.getElementById('conteudoModalApoie').textContent
    };
  });
  ok('quem tem assinatura ve o botao de cancelar', r7.existe && /Cancelar assinatura/i.test(r7.texto));
  ok('e a tela diz o que acontece ao cancelar (sem multa, sem perder dado)',
      /sem multa/i.test(r7.explica) && /sem perder nenhum dado/i.test(r7.explica));

  // Quem nao assinou nao ve botao de cancelar coisa nenhuma.
  await entrar(ANA, null, COM_SERVICO);
  const r7b = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    return { existe: !!document.getElementById('btnCancelarAssinatura') };
  });
  ok('quem esta no gratuito nao ve botao de cancelar', r7b.existe === false);

  // O cancelamento de verdade: confirma, manda o cracha da sessao e volta pro free.
  await entrar(ANA, ATIVA('professor'), COM_SERVICO);
  const r7c = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));

    window.__pedidos = [];
    window.fetch = async (url, opcoes) => {
      window.__pedidos.push({ url: String(url), opcoes: opcoes || {} });
      // O servidor cancela e o documento muda: o aplicativo rele' depois.
      window.__docs['assinaturas/uid-ana'] = Object.assign(
        {}, window.__docs['assinaturas/uid-ana'], { status: 'cancelada', plano: 'free' });
      return { ok: true, json: async () => ({ cancelada: true, plano: 'free', status: 'cancelada' }) };
    };

    document.getElementById('btnCancelarAssinatura').click();
    await new Promise(r => setTimeout(r, 600));

    const pedido = window.__pedidos[0] || { url: '', opcoes: {} };
    return {
      chamou: pedido.url,
      metodo: (pedido.opcoes.method || '').toUpperCase(),
      levouCracha: String((pedido.opcoes.headers || {}).authorization || ''),
      plano: planoDoUsuario(),
      premium: ehPremium(),
      tarjaVoltou: !!document.getElementById('bannerApoio'),
      botao: document.getElementById('btnApoie').textContent.trim()
    };
  });
  ok('o botao chama o servico de cancelamento (e nao a API do Mercado Pago pelo navegador)',
      r7c.chamou === 'https://sisprof.vercel.app/api/cancelar' && r7c.metodo === 'POST');
  ok('levando o cracha da sessao, para o servidor saber de quem e a assinatura',
      r7c.levouCracha.indexOf('Bearer ') === 0);
  ok('depois de cancelar, a conta volta ao gratuito na hora',
      r7c.plano === 'free' && r7c.premium === false);
  ok('a tarja e o botao de apoio voltam ao estado de quem nao assina',
      r7c.tarjaVoltou && r7c.botao.indexOf('Apoie') !== -1);

  // Servico nao configurado: manda para o Mercado Pago em vez de mentir que cancelou.
  await entrar(ANA, ATIVA('professor'), LINKS);
  const r7d = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    window.__abriu = [];
    window.__pedidos = [];
    window.fetch = async (u) => { window.__pedidos.push(String(u)); return { ok: false, json: async () => ({}) }; };
    document.getElementById('btnCancelarAssinatura').click();
    await new Promise(r => setTimeout(r, 400));
    return { abriu: window.__abriu[0] || '', pediu: window.__pedidos.length,
             plano: planoDoUsuario() };
  });
  ok('sem o servico configurado, abre o painel do Mercado Pago',
      r7d.abriu.indexOf('mercadopago.com.br/subscriptions') !== -1 && r7d.pediu === 0);
  ok('e NAO finge que cancelou: o plano continua ativo ate a pessoa cancelar de fato',
      r7d.plano === 'professor');

  // ============ 8. CORTE POR ATRASO, NA TELA ============
  // O corte tem que valer SEM depender de o Mercado Pago avisar: notificacao que se
  // perde deixaria a pessoa com premium para sempre, sem pagar, e sem evento para
  // alguem descobrir. A tela compara a data gravada com hoje.
  console.log('\n8. Corte por atraso na tela');

  const emDias = (n) => new Date(Date.now() + n * 86400000).toISOString();

  // Ativa, dentro do prazo.
  await entrar(ANA, ATIVA('professor', { proximaCobranca: emDias(9) }), LINKS);
  let r8 = await p.evaluate(() => ({ plano: planoDoUsuario(), premium: ehPremium(),
    vencida: assinaturaVencida(), atraso: assinaturaEmAtraso() }));
  ok('em dia: premium vale', r8.plano === 'professor' && r8.premium === true && !r8.vencida);

  // Venceu ontem: continua valendo, mas a tela avisa.
  await entrar(ANA, ATIVA('professor', { proximaCobranca: emDias(-1) }), LINKS);
  r8 = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    return { plano: planoDoUsuario(), premium: ehPremium(), atraso: assinaturaEmAtraso(),
             texto: document.getElementById('conteudoModalApoie').textContent };
  });
  ok('atrasado 1 dia: o acesso continua (carencia de 5 dias)',
      r8.plano === 'professor' && r8.premium === true && r8.atraso === true);
  ok('e a tela AVISA antes de cortar, dizendo quantos dias restam',
      /ainda nao foi confirmado/i.test(r8.texto) && /dia\(s\)/.test(r8.texto));

  // Passou a carencia: corta, mesmo com o documento dizendo "ativa".
  await entrar(ANA, ATIVA('professor', { proximaCobranca: emDias(-9) }), LINKS);
  r8 = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    const bloqueou = !exigirPremium('Relatorio automatico da turma');
    await new Promise(r => setTimeout(r, 250));
    return { plano: planoDoUsuario(), premium: ehPremium(), contribui: ehContribuinte(),
             bloqueou: bloqueou, tarja: !!document.getElementById('bannerApoio'),
             botao: document.getElementById('btnApoie').textContent.trim(),
             texto: (document.getElementById('conteudoModalApoie') || {}).textContent || '' };
  });
  ok('passada a carencia, o premium E CORTADO mesmo com o documento dizendo ativa',
      r8.plano === 'free' && r8.premium === false && r8.bloqueou === true);
  ok('e a tag de apoiador tambem cai (tarja volta, botao vira "Apoie")',
      r8.contribui === false && r8.tarja === true && r8.botao.indexOf('Apoie') !== -1);
  ok('a tela explica que venceu e que libera sozinho se o pagamento for reconhecido',
      /venceu em/i.test(r8.texto) && /libera sozinho/i.test(r8.texto));

  // A carencia e configuravel: 20 dias segura quem 5 cortaria.
  await entrar(ANA, ATIVA('professor', { proximaCobranca: emDias(-9) }),
               Object.assign({}, LINKS, { diasTolerancia: 20 }));
  r8 = await p.evaluate(() => ({ plano: planoDoUsuario(), premium: ehPremium(),
    tolerancia: diasDeTolerancia() }));
  ok('a carencia configurada no painel manda: 20 dias segura quem 5 cortaria',
      r8.tolerancia === 20 && r8.plano === 'professor' && r8.premium === true);

  // Carencia zero: corta no dia seguinte.
  await entrar(ANA, ATIVA('professor', { proximaCobranca: emDias(-2) }),
               Object.assign({}, LINKS, { diasTolerancia: 0 }));
  r8 = await p.evaluate(() => ({ plano: planoDoUsuario() }));
  ok('carencia zero corta assim que vence', r8.plano === 'free');

  // Cortesia sem prazo nao vence por data.
  await entrar(ANA, { uid: 'uid-ana', plano: 'professor', planoContratado: 'professor',
      status: 'ativa', origem: 'cortesia', versaoMs: 0 }, LINKS);
  r8 = await p.evaluate(() => ({ plano: planoDoUsuario(), vencida: assinaturaVencida() }));
  ok('cortesia sem prazo nao vence por data (e decisao do admin, nao atraso)',
      r8.plano === 'professor' && r8.vencida === false);

  // ============ 9. PIX: APOIO SEM CARTAO ============
  console.log('\n9. Pix: apoio sem cartao');

  // Com o servico configurado, os pacotes NAO tem link: o QR nasce no servidor.
  const COM_PIX = Object.assign({}, LINKS, { servico: 'https://sisprof.vercel.app/api', pacotesPix: [
    { plano: 'apoiase', meses: 3, valor: 30 },
    { plano: 'professor', meses: 3, valor: 60 },
    { plano: 'professor', meses: 12, valor: 240 }
  ] });

  // O caminho antigo (link de pagamento avulso), sem servico configurado.
  const PIX_POR_LINK = Object.assign({}, LINKS, { pacotesPix: [
    { plano: 'professor', meses: 12, valor: 240, link: 'https://mpago.la/pixP12' }
  ] });

  await entrar(ANA, null, COM_PIX);
  const r9 = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 300));
    const texto = document.getElementById('conteudoModalApoie').textContent;
    return {
      temSecao: /Prefere Pix/i.test(texto),
      explicaSemRecorrencia: /sem cobranca automatica/i.test(texto)
                             && /nada e cobrado de voce sem autorizacao/i.test(texto),
      temPacotes: /3 meses/.test(texto) && /12 meses/.test(texto),
      temValores: /R\$ 60,00/.test(texto) && /R\$ 240,00/.test(texto),
      mostraPorMes: /R\$ 20,00\/mes/.test(texto)
    };
  });
  ok('o pop-up mostra a opcao de Pix quando ha pacotes cadastrados', r9.temSecao);
  ok('explicando que Pix nao e cobranca automatica', r9.explicaSemRecorrencia);
  ok('com os pacotes de meses e seus valores', r9.temPacotes && r9.temValores);

  // O QR nasce no servico e aparece AQUI - o professor nao vai para outra aba, e o
  // administrador nao cadastra link nenhum.
  const r9b = await p.evaluate(async () => {
    window.__abriu = [];
    window.__pedidos = [];
    window.fetch = async (url, opcoes) => {
      window.__pedidos.push({ url: String(url), opcoes: opcoes || {} });
      return { ok: true, json: async () => ({ ok: true, pagamentoId: 'PAY-QR-1',
        plano: 'professor', meses: 12, valor: 240,
        copiaECola: '00020126580014br.gov.bcb.pix0136abc...5204000053039865802BR',
        qrCodeBase64: 'iVBORw0KGgo=',
        expiraEm: new Date(Date.now() + 86400000).toISOString() }) };
    };
    await pagarComPix('professor', 12);
    await new Promise(r => setTimeout(r, 400));

    const pedido = window.__pedidos[0] || { url: '', opcoes: {} };
    const area = document.getElementById('areaQrPix');
    return {
      chamou: pedido.url,
      metodo: (pedido.opcoes.method || '').toUpperCase(),
      levouCracha: String((pedido.opcoes.headers || {}).authorization || '').indexOf('Bearer ') === 0,
      corpo: pedido.opcoes.body || '',
      abriuOutraAba: window.__abriu.length,
      mostrouQr: !!(area && area.querySelector('img')),
      temCopiaECola: !!document.getElementById('pixCopiaECola'),
      codigo: (document.getElementById('pixCopiaECola') || {}).value || '',
      texto: area ? area.textContent : ''
    };
  });
  ok('escolher um pacote pede o QR ao servico (nao abre link nem outra aba)',
      r9b.chamou === 'https://sisprof.vercel.app/api/pix' && r9b.metodo === 'POST'
      && r9b.abriuOutraAba === 0);
  ok('levando o cracha da sessao e o pacote escolhido',
      r9b.levouCracha && /"plano":"professor"/.test(r9b.corpo) && /"meses":12/.test(r9b.corpo));
  ok('o valor NAO vai do navegador (quem decide o preco e o servidor)',
      r9b.corpo.indexOf('valor') === -1);
  ok('o QR Code aparece na propria tela, com copia e cola',
      r9b.mostrouQr && r9b.temCopiaECola && r9b.codigo.indexOf('br.gov.bcb.pix') !== -1);
  ok('com o valor, o pacote e o prazo de validade a vista',
      /R\$ 240,00/.test(r9b.texto) && /12 meses/.test(r9b.texto) && /vale ate/i.test(r9b.texto));
  ok('e explicando que o plano libera sozinho quando o Pix cair',
      /liberado sozinho/i.test(r9b.texto));

  // Servico fora do ar nao pode deixar a tela travada em "gerando".
  const r9b2 = await p.evaluate(async () => {
    document.getElementById('areaQrPix').innerHTML = '';
    window.fetch = async () => { throw new Error('sem rede'); };
    await pagarComPix('professor', 3);
    await new Promise(r => setTimeout(r, 300));
    const area = document.getElementById('areaQrPix');
    return { escondeu: !area || area.style.display === 'none' };
  });
  ok('servico fora do ar esconde a area em vez de deixar "gerando..." para sempre',
      r9b2.escondeu);

  // Sem servico configurado, o caminho antigo (link) continua funcionando.
  await entrar(ANA, null, PIX_POR_LINK);
  const r9b3 = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    window.__abriu = [];
    await pagarComPix('professor', 12);
    await new Promise(r => setTimeout(r, 200));
    return { destino: window.__abriu[0] || '' };
  });
  ok('sem servico, o link de pagamento antigo ainda vale',
      r9b3.destino.indexOf('mpago.la/pixP12') !== -1
      && /external_reference=uid-ana%7Cprofessor%7C12/.test(r9b3.destino));

  await entrar(ANA, null, COM_PIX);

  // O ERRO REAL QUE ISTO EVITA: cadastrar no Pix o link do PLANO (cartao). O checkout
  // recorrente do Mercado Pago nao aceita Pix, e quem clicasse em "3 meses / R$ 60"
  // cairia num plano de R$ 10 POR MES no cartao - valor errado e cobranca automatica
  // que a pessoa nao pediu.
  const PIX_ERRADO = Object.assign({}, LINKS, { pacotesPix: [
    { plano: 'apoiase', meses: 1, valor: 10,
      link: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=a9d3c89c' },
    { plano: 'professor', meses: 3, valor: 60, link: 'https://mpago.la/pixOk' }
  ] });
  await entrar(ANA, null, PIX_ERRADO);
  const r9g = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 300));
    const texto = document.getElementById('conteudoModalApoie').textContent;
    window.__abriu = [];
    await pagarComPix('apoiase', 1);
    await new Promise(r => setTimeout(r, 200));
    return { mostrouOErrado: /1 mes\b/.test(texto), mostrouOBom: /3 meses/.test(texto),
             abriu: window.__abriu.length };
  });
  ok('pacote de Pix apontando para link de ASSINATURA nem aparece na tela',
      r9g.mostrouOErrado === false && r9g.mostrouOBom === true);
  ok('e se alguem tentar mesmo assim, nao abre o checkout de cartao', r9g.abriu === 0);
  ok('a deteccao pega os dois formatos de link de assinatura',
      (await p.evaluate(() => [
        ehLinkDeAssinatura('https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=x'),
        ehLinkDeAssinatura('https://mpago.la/abc?preapproval_plan_id=x'),
        ehLinkDeAssinatura('https://mpago.la/abc')
      ])).join(',') === 'true,true,false');

  // Sem pacotes cadastrados, a secao simplesmente nao aparece.
  await entrar(ANA, null, LINKS);
  const r9c = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    return { temSecao: /Prefere Pix/i.test(document.getElementById('conteudoModalApoie').textContent) };
  });
  ok('sem pacotes cadastrados, a secao de Pix nao aparece', r9c.temSecao === false);

  // Apoio por Pix vale ate a data, e a tela mostra isso em vez de "proxima cobranca".
  await entrar(ANA, { uid: 'uid-ana', plano: 'professor', planoContratado: 'professor',
      status: 'ativa', origem: 'pix', meses: 3, validoAte: emDias(70), versaoMs: 1 }, COM_PIX);
  const r9d = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    const texto = document.getElementById('conteudoModalApoie').textContent;
    return { plano: planoDoUsuario(), premium: ehPremium(),
             falaDeValidade: /apoio garantido ate/i.test(texto),
             naoFalaDeCobranca: !/proxima cobranca/i.test(texto) };
  });
  ok('apoio pago no Pix da premium igual ao cartao',
      r9d.plano === 'professor' && r9d.premium === true);
  ok('e a tela fala de validade, nao de proxima cobranca', r9d.falaDeValidade && r9d.naoFalaDeCobranca);

  // Pix vencido corta, e o aviso chama para renovar pelo Pix.
  await entrar(ANA, { uid: 'uid-ana', plano: 'professor', planoContratado: 'professor',
      status: 'ativa', origem: 'pix', validoAte: emDias(-2), versaoMs: 1 }, COM_PIX);
  const r9e = await p.evaluate(async () => {
    const el = document.getElementById('modalApoie'); if (el) el.remove();
    await abrirModalApoie();
    await new Promise(r => setTimeout(r, 250));
    return { plano: planoDoUsuario(),
             chamaParaRenovar: /renove pelo Pix/i.test(document.getElementById('conteudoModalApoie').textContent) };
  });
  ok('Pix atrasado dentro da carencia chama para renovar pelo proprio Pix',
      r9e.plano === 'professor' && r9e.chamaParaRenovar);

  await entrar(ANA, { uid: 'uid-ana', plano: 'professor', planoContratado: 'professor',
      status: 'ativa', origem: 'pix', validoAte: emDias(-10), versaoMs: 1 }, COM_PIX);
  const r9f = await p.evaluate(() => ({ plano: planoDoUsuario(), premium: ehPremium(),
    contribui: ehContribuinte() }));
  ok('Pix vencido alem da carencia corta premium e tag de apoiador',
      r9f.plano === 'free' && r9f.premium === false && r9f.contribui === false);

  // ============ 10. A ASSINATURA NAO PODE ATRAPALHAR QUEM VEIO DAR AULA ============
  // Enquanto as Regras novas nao forem publicadas no console do Firebase, TODA conta
  // recebe 'permission-denied' ao ler assinaturas/<uid>. Se essa leitura marcasse a
  // falha global de leitura, o sistema entenderia "a nuvem caiu" e bloquearia a
  // gravacao do trabalho do professor — por causa de um coracao amarelo.
  console.log('\n10. Leitura negada pelas Regras nao contamina o resto do sistema');
  await entrar(ANA, ATIVA('professor'), LINKS);
  const r10 = await p.evaluate(async () => {
    window.falhaLeituraFirestore = false;
    window.__alertas = 0;
    const alertOriginal = window.alert;
    window.alert = () => { window.__alertas++; };

    const collectionOriginal = db.collection.bind(db);
    db.collection = (c) => {
      if (c === 'assinaturas' || c === 'assinaturas_config') {
        return { doc: () => ({ get: async () => {
          const erro = new Error('Missing or insufficient permissions.');
          erro.code = 'permission-denied';
          throw erro;
        } }) };
      }
      return collectionOriginal(c);
    };

    await carregarAssinaturaAtual(true);
    const links = await carregarLinksAssinatura();
    const estado = {
      falhaGlobal: window.falhaLeituraFirestore === true,
      alertas: window.__alertas,
      planoContinua: planoDoUsuario(),
      linkContinua: !!links.professor
    };
    db.collection = collectionOriginal;
    window.alert = alertOriginal;
    return estado;
  });
  ok('Regras nao publicadas NAO marcam falha de leitura da nuvem', r10.falhaGlobal === false);
  ok('e nao enchem a tela do professor de alerta de conexao', r10.alertas === 0);
  ok('o que ja se sabia do plano continua valendo', r10.planoContinua === 'professor');
  ok('e o link conhecido do checkout nao se perde', r10.linkContinua === true);

  await b.close();
  console.log('\n' + (falhas.length === 0
    ? 'TUDO CERTO: a assinatura se comporta na tela.'
    : 'FALHARAM ' + falhas.length + ': ' + falhas.join(' | ')));
  process.exit(falhas.length === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
