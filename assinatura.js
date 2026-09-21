// A ASSINATURA DO SISPROF — planos, cobranca no cartao e o portao das funcoes premium.
//
// COMO FUNCIONA, DO COMECO AO FIM
//   1. o professor escolhe um plano aqui e e' levado ao checkout do Mercado Pago,
//      onde ele digita o cartao. Quem guarda o cartao e' o Mercado Pago — numero de
//      cartao nunca passa por este codigo nem pelo Firestore;
//   2. a cobranca se repete TODO MES sozinha (assinatura recorrente do Mercado Pago);
//   3. quando o pagamento entra, falha ou e' cancelado, o Mercado Pago avisa o nosso
//      webhook (pasta assinatura/), e e' ELE quem escreve `assinaturas/<uid>`.
//
//   Ninguem marca contribuinte na mao. O painel do super admin continua podendo
//   conceder cortesia, mas isso virou excecao, nao a regra.
//
// REGISTRO HONESTO: o portao premium daqui e' REGRA DE USO, nao barreira de
// seguranca. Este e' um aplicativo de navegador; quem entende de console consegue
// ligar uma funcao premium na marra. O que NAO da' para burlar e' o documento
// `assinaturas/<uid>`: as Regras do Firestore nao deixam nem o dono da conta
// escrever nele — so' o webhook, com credencial de conta de servico, e o super
// admin. Entao a cobranca, o selo e a lista de contribuintes sao confiaveis.

// ----------------------------------------------------------------------------
// Os planos
// ----------------------------------------------------------------------------
// Espelham assinatura/regras.mjs (a fonte da verdade do lado do servidor). O teste
// testes/teste-webhook-mp.js compara os dois arquivos para que nunca desencontrem.
const PLANOS_SISPROF = {
    free: {
        id: 'free',
        nome: 'Gratuito',
        valor: 0,
        emoji: '🆓',
        premium: false,
        resumo: 'Tudo que o SisProf sempre teve, de graca.',
        itens: [
            'Turmas, chamada, notas e ocorrencias',
            'Estagiario, documentos e impressao',
            'Backup e recuperacao dos seus dados'
        ]
    },
    apoiase: {
        id: 'apoiase',
        nome: 'Apoia-se',
        valor: 10,
        emoji: '💛',
        premium: false,
        resumo: 'Voce mantem o sistema no ar. As funcoes seguem as mesmas do gratuito.',
        itens: [
            'Todas as funcoes gratuitas',
            'Selo 💛 e agradecimento na escola',
            'Ajuda a pagar servidor, banco e IA'
        ]
    },
    professor: {
        id: 'professor',
        nome: 'Professor',
        valor: 20,
        emoji: '🎓',
        premium: true,
        resumo: 'Apoia o projeto e libera as funcoes premium conforme forem saindo.',
        itens: [
            'Tudo do Apoia-se',
            'Funcoes premium (em construcao)',
            'Prioridade no suporte e nas novidades'
        ]
    }
};

// Links do checkout de assinatura do Mercado Pago. Ficam no codigo (e nao em
// system/*, que qualquer conta logada pode escrever) porque um link trocado
// mandaria o dinheiro do professor para a conta de outra pessoa. O super admin
// pode sobrescrever por `assinaturas_config/publico`, documento que SO' ele
// escreve — ver firestore.rules.
const LINKS_ASSINATURA_PADRAO = {
    apoiase: '',    // https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=...
    professor: ''   // idem, plano de R$ 20,00
};

// Enquanto os planos novos nao estiverem criados no Mercado Pago, o botao explica
// em vez de levar a lugar nenhum.
let _linksAssinatura = null;
let _assinaturaAtual = null;      // documento assinaturas/<uid>, ou null
let _assinaturaLida = false;

// ----------------------------------------------------------------------------
// Estado da assinatura
// ----------------------------------------------------------------------------

// Leitura DIRETA no db, e nao por getData(). A diferenca importa muito aqui:
// getData marca `falhaLeituraFirestore` e mostra alerta de conexao, e isso e' o
// mecanismo que protege os dados do professor (leitura que falha bloqueia a
// gravacao na nuvem, para nao salvar vazio por cima do cheio). A assinatura nao
// pode encostar nesse mecanismo — enquanto as Regras novas nao forem publicadas,
// TODA conta recebe 'permission-denied' ao ler `assinaturas/<uid>`, e transformar
// isso em "a nuvem caiu" travaria o trabalho de quem so' veio dar aula.
//
// E' a mesma escolha que carregarConfigCorte() faz em core.js.
async function _lerDocDireto(colecao, id) {
    if (typeof db === 'undefined' || !db) return { ok: false, doc: null };
    try {
        const doc = await db.collection(colecao).doc(String(id)).get();
        return { ok: true, doc: doc.exists ? doc.data() : null };
    } catch (e) {
        if (e && e.code === 'permission-denied') {
            console.warn('[Assinatura] Leitura de ' + colecao + ' negada pelas Regras — ' +
                         'falta publicar a versao nova de firestore.rules?');
        } else {
            console.warn('[Assinatura] Nao consegui ler ' + colecao + ':', e && e.message);
        }
        return { ok: false, doc: null };
    }
}

// Le `assinaturas/<uid>` uma vez por sessao. Uma leitura que FALHA nao rebaixa
// ninguem: mantemos o que ja' sabiamos e tentamos de novo na proxima vez.
async function carregarAssinaturaAtual(forcar) {
    if (_assinaturaLida && !forcar) return _assinaturaAtual;
    const uid = currentUser && (currentUser.uid || currentUser.id);
    if (!uid) return null;

    const leitura = await _lerDocDireto('assinaturas', uid);
    if (leitura.ok) {
        _assinaturaAtual = leitura.doc;   // pode ser null: e' quem nunca assinou
        _assinaturaLida = true;
    }
    return _assinaturaAtual;
}

// Qual plano vale para esta conta AGORA.
//
// A ordem importa, e ja' escondeu um defeito: QUANDO EXISTE documento de
// assinatura, e' ele quem manda — inclusive para dizer que acabou. A marca
// `contribuidor` do perfil so' vale para quem NAO tem documento nenhum, que e'
// como os apoiadores antigos (o plano de R$ 7,00) estao registrados ate' hoje.
//
// Se a marca do perfil pudesse falar por cima de um documento cancelado, quem
// cancelasse a assinatura ficaria com o selo para sempre: o proprio aplicativo
// acende essa marca ao ver a assinatura ativa, e ela passaria a se sustentar
// sozinha depois do cancelamento.
function planoDoUsuario() {
    if (!currentUser) return 'free';
    if (currentUser.role === 'super_admin') return 'professor';

    const a = _assinaturaAtual;
    if (a && a.status) {
        if (a.status !== 'ativa') return 'free';
        if (PLANOS_SISPROF[a.plano]) return a.plano;
        if (a.planoContratado && PLANOS_SISPROF[a.planoContratado]) return a.planoContratado;
        return 'free';
    }
    if (currentUser.contribuidor === true) return 'apoiase';
    return 'free';
}

function infoPlanoAtual() {
    return PLANOS_SISPROF[planoDoUsuario()] || PLANOS_SISPROF.free;
}

// Contribui com o projeto (ganha o selo 💛 e some a tarja).
function ehContribuinte() {
    const plano = planoDoUsuario();
    return plano === 'apoiase' || plano === 'professor';
}

// Tem direito as funcoes premium.
function ehPremium() {
    return infoPlanoAtual().premium === true;
}

// O portao das funcoes premium. Use assim, no inicio da funcao:
//
//     if (!exigirPremium('Relatorio automatico da turma')) return;
//
// Devolve false e abre o convite de upgrade quando a conta nao tem o plano.
function exigirPremium(nomeDaFuncao) {
    if (ehPremium()) return true;
    abrirModalApoie({ destaque: 'professor', bloqueou: nomeDaFuncao || '' });
    return false;
}

// Marca visual de funcao premium, para colocar ao lado do botao no menu.
function selosPremiumHtml() {
    return '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; ' +
           'padding:1px 5px; border-radius:4px; margin-left:4px;" title="Funcao do plano Professor">PRO</span>';
}

// ----------------------------------------------------------------------------
// A assinatura antiga, de R$ 7,00
// ----------------------------------------------------------------------------
// O sistema de assinatura que rodava antes esta' sendo ENCERRADO: a cobranca de
// R$ 7,00 sera' cancelada no painel do Mercado Pago. Quem pagava precisa saber
// disso e escolher como continuar — sem ser trancado e sem perder o selo no meio
// do caminho.

const CHAVE_ESCOLHA_TRANSICAO = 'sisprof_transicao_assinatura';

function temAssinaturaAntiga() {
    if (!currentUser || currentUser.role === 'super_admin') return false;
    const a = _assinaturaAtual;
    // Assinatura nova e ativa: nao ha transicao a fazer.
    if (a && a.status === 'ativa' && !a.legado) return false;
    if (a && a.legado) return true;
    // Sem documento de assinatura, mas marcado como contribuinte: e' apoiador antigo.
    return currentUser.contribuidor === true;
}

function escolhaDaTransicao() {
    try {
        return localStorage.getItem(CHAVE_ESCOLHA_TRANSICAO) || '';
    } catch (e) { return ''; }
}

function precisaAvisarDaTransicao() {
    return temAssinaturaAntiga() && !escolhaDaTransicao();
}

// Guarda a escolha no aparelho E no perfil, para o aviso nao voltar em outra tela.
async function registrarEscolhaTransicao(escolha) {
    try { localStorage.setItem(CHAVE_ESCOLHA_TRANSICAO, escolha); } catch (e) {}
    if (!currentUser) return;
    currentUser.transicaoPlano = escolha;
    try { localStorage.setItem('app_current_user', JSON.stringify(currentUser)); } catch (e) {}
    try {
        const dados = await getData('system', 'users_list');
        const lista = (dados && Array.isArray(dados.list)) ? dados.list : [];
        const eu = lista.find(u => u.email === currentUser.email);
        if (eu) {
            eu.transicaoPlano = escolha;
            // "Voltar para o gratuito" retira o selo: quem nao paga mais nao aparece
            // como contribuinte. O historico de quem ja' ajudou fica registrado.
            if (escolha === 'free') {
                eu.contribuidor = false;
                eu.contribuiuAntes = true;
                currentUser.contribuidor = false;
                try { localStorage.setItem('app_current_user', JSON.stringify(currentUser)); } catch (e) {}
            }
            await saveData('system', 'users_list', { list: lista });
        }
    } catch (e) {
        console.warn('[Assinatura] Nao consegui registrar a escolha da transicao:', e);
    }
}

function abrirAvisoTransicao() {
    let div = document.getElementById('modalTransicaoAssinatura');
    if (!div) {
        div = document.createElement('div');
        div.id = 'modalTransicaoAssinatura';
        div.className = 'modal';
        document.body.appendChild(div);
    }
    div.innerHTML = `
        <div class="modal-content" style="max-width: 560px;">
            <div class="modal-header">
                <h2>💛 Sua assinatura de R$ 7,00 vai ser encerrada</h2>
                <button class="close-btn" onclick="closeModal('modalTransicaoAssinatura')">×</button>
            </div>
            <div style="padding: 20px 25px;">
                <p style="color:#4a5568; line-height:1.6;">
                    O sistema de assinatura que usavamos esta' sendo desativado e a cobranca de
                    <strong>R$ 7,00/mes</strong> sera' cancelada por nos, no painel do Mercado Pago —
                    <strong>voce nao precisa fazer nada</strong> para parar de pagar.
                </p>
                <p style="color:#4a5568; line-height:1.6;">
                    O sistema continua <strong>gratuito</strong>. Se voce quiser seguir apoiando,
                    agora existem dois planos com cobranca mensal no cartao:
                </p>
                <div style="display:flex; flex-direction:column; gap:10px; margin-top:18px;">
                    <button class="btn btn-success" id="btnTransicaoApoiase"
                            onclick="escolherNaTransicao('apoiase')" style="padding:12px; text-align:left;">
                        💛 <strong>Apoia-se — R$ 10,00/mes</strong><br>
                        <span style="font-size:12px; font-weight:normal;">Mesmas funcoes de hoje. Voce so' ajuda a manter o projeto no ar.</span>
                    </button>
                    <button class="btn btn-primary" id="btnTransicaoProfessor"
                            onclick="escolherNaTransicao('professor')" style="padding:12px; text-align:left;">
                        🎓 <strong>Professor — R$ 20,00/mes</strong><br>
                        <span style="font-size:12px; font-weight:normal;">Apoia e libera as funcoes premium conforme forem saindo.</span>
                    </button>
                    <button class="btn btn-secondary" id="btnTransicaoFree"
                            onclick="escolherNaTransicao('free')" style="padding:12px; text-align:left;">
                        🆓 <strong>Continuar no gratuito</strong><br>
                        <span style="font-size:12px; font-weight:normal;">Nada muda no seu uso do sistema. Obrigado pelo apoio ate' aqui!</span>
                    </button>
                </div>
                <p style="font-size:11px; color:#718096; margin-top:16px;">
                    Duvida na fatura? A cobranca antiga aparece como Mercado Pago. Se ela continuar
                    depois do encerramento, fale com a gente que resolvemos.
                </p>
            </div>
        </div>`;
    showModal('modalTransicaoAssinatura');
}

async function escolherNaTransicao(escolha) {
    await registrarEscolhaTransicao(escolha);
    closeModal('modalTransicaoAssinatura');
    if (escolha === 'free') {
        alert('Combinado! O sistema segue gratuito para voce. Obrigado pelo apoio ate aqui 💛');
        if (typeof atualizarBannerApoio === 'function') atualizarBannerApoio();
        atualizarBotaoApoie();
        return;
    }
    assinarPlano(escolha);
}

// ----------------------------------------------------------------------------
// Ir para o checkout do Mercado Pago
// ----------------------------------------------------------------------------

// Relemos a configuracao a cada uso, de proposito: quando o super admin troca um
// link no painel, quem esta' com o sistema aberto pega o link novo sem precisar
// recarregar a pagina. E' um documento minusculo. O ultimo valor conhecido fica
// guardado so' para o caso de a leitura falhar — link e' o que faz o pagamento
// chegar, e ficar sem ele por causa de uma oscilacao de rede seria pior.
async function carregarLinksAssinatura() {
    const links = Object.assign({}, LINKS_ASSINATURA_PADRAO, _linksAssinatura || {});
    const leitura = await _lerDocDireto('assinaturas_config', 'publico');
    if (leitura.ok && leitura.doc) {
        const cfg = leitura.doc;
        links.apoiase = (typeof cfg.apoiase === 'string' ? cfg.apoiase : '') || LINKS_ASSINATURA_PADRAO.apoiase;
        links.professor = (typeof cfg.professor === 'string' ? cfg.professor : '') || LINKS_ASSINATURA_PADRAO.professor;
        _linksAssinatura = links;
    }
    return links;
}

// Gruda o uid e o e-mail no link do checkout. O `external_reference` e' o que
// permite ao webhook saber de quem e' o pagamento sem depender do e-mail digitado
// no Mercado Pago (que muitas vezes e' outro).
function montarLinkCheckout(link, uid, email) {
    if (!link) return '';
    const url = link.indexOf('?') === -1 ? link + '?' : link + '&';
    const partes = [];
    if (uid) partes.push('external_reference=' + encodeURIComponent(uid));
    if (email) partes.push('payer_email=' + encodeURIComponent(email));
    partes.push('back_url=' + encodeURIComponent(window.location.origin + window.location.pathname + '?assinatura=voltando'));
    return url + partes.join('&');
}

async function assinarPlano(planoId) {
    const plano = PLANOS_SISPROF[planoId];
    if (!plano || plano.valor === 0) return;

    const links = await carregarLinksAssinatura();
    const uid = currentUser && (currentUser.uid || currentUser.id);
    const destino = montarLinkCheckout(links[planoId], uid, currentUser && currentUser.email);

    if (!destino) {
        alert('O plano ' + plano.nome + ' ainda esta sendo configurado no Mercado Pago.\n\n' +
              'Assim que o link estiver pronto, o botao passa a abrir o pagamento por cartao. ' +
              'Se voce e o administrador, cadastre o link no painel Super Admin > Assinaturas.');
        return;
    }
    window.open(destino, '_blank');
    marcarEsperandoConfirmacao(planoId);
}

// Depois de mandar a pessoa para o Mercado Pago, o aplicativo fica de olho: quando
// o webhook gravar a assinatura, a tela se atualiza sozinha — sem pedir F5.
function marcarEsperandoConfirmacao(planoId) {
    const alvo = document.getElementById('assinaturaEstado');
    if (alvo) {
        alvo.innerHTML = '<p style="font-size:13px; color:#2b6cb0;">⏳ Aguardando a confirmacao do Mercado Pago... ' +
                         'Pode levar alguns minutos. Voce pode fechar esta janela.</p>';
    }
    let tentativas = 0;
    const relogio = setInterval(async () => {
        tentativas++;
        const antes = _assinaturaAtual && _assinaturaAtual.status;
        await carregarAssinaturaAtual(true);
        const agora = _assinaturaAtual && _assinaturaAtual.status;
        if (agora === 'ativa' && agora !== antes) {
            clearInterval(relogio);
            atualizarBotaoApoie();
            if (typeof atualizarBannerApoio === 'function') atualizarBannerApoio();
            if (document.getElementById('modalApoie')) renderConteudoModalApoie();
            alert('Assinatura confirmada! Obrigado por apoiar o SisProf 💛');
        } else if (tentativas >= 20) { // ~10 minutos
            clearInterval(relogio);
        }
    }, 30000);
}

// A volta do Mercado Pago. O `back_url` traz ?assinatura=voltando; a confirmacao
// em si nao vem por aqui (vem pelo webhook), entao apenas relemos o documento e
// contamos o que ja' da' para contar.
function voltandoDoCheckout() {
    try {
        return new URLSearchParams(window.location.search).get('assinatura') === 'voltando';
    } catch (e) { return false; }
}

async function conferirAssinaturaAposCheckout() {
    await carregarAssinaturaAtual(true);
    atualizarBotaoApoie();
    if (typeof atualizarBannerApoio === 'function') atualizarBannerApoio();
    await sincronizarSeloContribuinte();
    if (_assinaturaAtual && _assinaturaAtual.status === 'ativa') {
        alert('Assinatura confirmada! Obrigado por apoiar o SisProf 💛');
    } else {
        alert('Recebemos seu retorno do Mercado Pago. A confirmacao do cartao pode levar alguns ' +
              'minutos — assim que ela chegar, seu plano aparece sozinho aqui.');
        marcarEsperandoConfirmacao('');
    }
    // Tira o marcador da barra de enderecos para o aviso nao repetir a cada F5.
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('assinatura');
        window.history.replaceState({}, '', url.toString());
    } catch (e) {}
}

// ----------------------------------------------------------------------------
// O pop-up de apoio
// ----------------------------------------------------------------------------

function cartaoDePlano(plano, atual, destacar) {
    const ehAtual = plano.id === atual;
    const borda = ehAtual ? '2px solid #38a169' : (destacar ? '2px solid #3182ce' : '1px solid #e2e8f0');
    const itens = plano.itens.map(i => `<li style="margin:3px 0;">${i}</li>`).join('');
    const rodape = ehAtual
        ? '<div style="text-align:center; color:#2f855a; font-weight:bold; padding:10px 0;">✅ Seu plano atual</div>'
        : (plano.valor === 0
            ? '<div style="text-align:center; color:#718096; font-size:12px; padding:10px 0;">Sem cobranca</div>'
            : `<button class="btn btn-${plano.id === 'professor' ? 'primary' : 'success'}" style="width:100%; padding:10px; font-weight:bold;"
                       id="btnAssinar_${plano.id}" onclick="assinarPlano('${plano.id}')">
                   Assinar com cartao
               </button>`);

    return `
        <div style="flex:1; min-width:210px; border:${borda}; border-radius:10px; padding:14px; background:#fff;">
            <div style="font-size:15px; font-weight:bold; color:#2d3748;">${plano.emoji} ${plano.nome}</div>
            <div style="font-size:22px; font-weight:bold; color:#2d3748; margin:6px 0;">
                ${plano.valor === 0 ? 'R$ 0' : 'R$ ' + plano.valor.toFixed(2).replace('.', ',')}
                <span style="font-size:12px; font-weight:normal; color:#718096;">${plano.valor === 0 ? '' : '/mes'}</span>
            </div>
            <div style="font-size:12px; color:#4a5568; min-height:34px;">${plano.resumo}</div>
            <ul style="font-size:12px; color:#4a5568; padding-left:18px; margin:10px 0;">${itens}</ul>
            ${rodape}
        </div>`;
}

function descreverAssinatura() {
    const a = _assinaturaAtual;
    const plano = infoPlanoAtual();

    if (currentUser && currentUser.role === 'super_admin') {
        return '<p style="font-size:13px; color:#718096;">Conta de administracao: acesso completo, sem cobranca.</p>';
    }
    if (!a || a.status === 'cancelada' || !a.status) {
        if (plano.id !== 'free') {
            return '<p style="font-size:13px; color:#2f855a;">💛 Voce consta como apoiador do projeto. Obrigado!</p>';
        }
        return '<p style="font-size:13px; color:#718096;">Voce esta no plano gratuito.</p>';
    }
    if (a.status === 'pendente') {
        return '<p style="font-size:13px; color:#b7791f;">⏳ Assinatura iniciada, aguardando a confirmacao do cartao.</p>';
    }
    if (a.status === 'pausada') {
        return '<p style="font-size:13px; color:#c53030;">⚠️ A cobranca deste mes nao passou no cartao. ' +
               'O Mercado Pago vai tentar de novo; voce tambem pode atualizar o cartao por la.</p>';
    }
    const proxima = a.proximaCobranca ? String(a.proximaCobranca).slice(0, 10).split('-').reverse().join('/') : '';
    return `<p style="font-size:13px; color:#2f855a;">✅ Plano <strong>${plano.nome}</strong> ativo` +
           (proxima ? `, proxima cobranca em <strong>${proxima}</strong>` : '') + '.</p>';
}

function renderConteudoModalApoie(opcoes) {
    const alvo = document.getElementById('conteudoModalApoie');
    if (!alvo) return;
    const opts = opcoes || {};
    const atual = planoDoUsuario();
    const temAssinaturaViva = !!(_assinaturaAtual && ['ativa', 'pendente', 'pausada'].indexOf(_assinaturaAtual.status) !== -1);

    const aviso = opts.bloqueou
        ? `<div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:10px; margin-bottom:14px; font-size:13px; color:#744210;">
               🔒 <strong>${opts.bloqueou}</strong> faz parte do plano Professor.
           </div>`
        : '';

    alvo.innerHTML = `
        ${aviso}
        <p style="font-size:14px; color:#4a5568; line-height:1.5;">
            O SisProf e' e sempre sera' gratuito para dar aula. Os custos de servidor, banco de dados
            e IA sao pagos por quem assina — escolha como voce quer participar.
        </p>
        <div id="assinaturaEstado" style="margin:12px 0;">${descreverAssinatura()}</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:10px; text-align:left;">
            ${cartaoDePlano(PLANOS_SISPROF.free, atual, false)}
            ${cartaoDePlano(PLANOS_SISPROF.apoiase, atual, opts.destaque === 'apoiase')}
            ${cartaoDePlano(PLANOS_SISPROF.professor, atual, opts.destaque === 'professor')}
        </div>
        <p style="font-size:11px; color:#718096; margin-top:12px;">
            🔒 Cobranca mensal automatica no cartao, pelo Mercado Pago. O numero do cartao fica com eles —
            o SisProf nunca ve nem guarda esse dado. Cancele quando quiser, sem multa.
        </p>
        ${temAssinaturaViva ? `
            <p style="font-size:12px; margin-top:8px;">
                <a href="https://www.mercadopago.com.br/subscriptions" target="_blank" rel="noopener"
                   style="color:#3182ce;">Gerenciar ou cancelar minha assinatura no Mercado Pago</a>
            </p>` : ''}
        <div id="apoieContribuintes" style="margin-top:18px; border-top:1px dashed #e2e8f0; padding-top:15px;"></div>`;
}

async function abrirModalApoie(opcoes) {
    let div = document.getElementById('modalApoie');
    if (!div) {
        div = document.createElement('div');
        div.id = 'modalApoie';
        div.className = 'modal';
        div.innerHTML = `
            <div class="modal-content" style="max-width: 760px;">
                <div class="modal-header">
                    <h2>❤️ Apoie o Projeto</h2>
                    <button class="close-btn" onclick="closeModal('modalApoie')">×</button>
                </div>
                <div id="conteudoModalApoie" style="padding: 20px 25px; text-align:center;"></div>
            </div>`;
        document.body.appendChild(div);
    }
    await carregarAssinaturaAtual();
    renderConteudoModalApoie(opcoes);
    showModal('modalApoie');
    carregarContribuintesApoie();
}

// ----------------------------------------------------------------------------
// Botao do cabecalho, tarja e lista de contribuintes
// ----------------------------------------------------------------------------

function injectApoieButton() {
    const container = document.getElementById('headerUserArea');
    if (!container || document.getElementById('btnApoie')) return;

    const btn = document.createElement('button');
    btn.id = 'btnApoie';
    btn.className = 'btn btn-sm btn-success';
    btn.style.marginTop = '5px';
    btn.style.marginRight = '5px';
    btn.onclick = () => abrirModalApoie();
    container.insertBefore(btn, container.querySelector('.btn-danger'));

    atualizarBotaoApoie();
    // A leitura da assinatura e' assincrona: o botao nasce com o que ja' se sabe e
    // se corrige sozinho quando o documento chega.
    carregarAssinaturaAtual().then(async () => {
        atualizarBotaoApoie();
        if (typeof atualizarBannerApoio === 'function') atualizarBannerApoio();
        await sincronizarSeloContribuinte();
        if (precisaAvisarDaTransicao()) abrirAvisoTransicao();
        else if (voltandoDoCheckout()) conferirAssinaturaAposCheckout();
    });
}

function atualizarBotaoApoie() {
    const btn = document.getElementById('btnApoie');
    if (!btn) return;
    const plano = infoPlanoAtual();
    if (plano.id === 'professor') {
        btn.innerHTML = '🎓 Professor';
        btn.title = 'Plano Professor ativo. Obrigado! 💛';
    } else if (plano.id === 'apoiase') {
        btn.innerHTML = '🤝 TMJ';
        btn.title = 'Tamo junto! Obrigado pelo apoio 💛';
    } else {
        btn.innerHTML = '❤️ Apoie';
        btn.title = 'Conheca os planos de apoio';
    }
}

// Tarja de apoio — so' para quem ainda nao contribui (some para contribuintes e
// para o super admin). Clicavel: abre o pop-up dos planos.
function atualizarBannerApoio() {
    const mostrar = !!currentUser && !ehContribuinte() && currentUser.role !== 'super_admin';
    let banner = document.getElementById('bannerApoio');

    if (!mostrar) {
        if (banner) banner.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bannerApoio';
        banner.style.cssText = 'position:sticky; top:0; z-index:9998; background:#f6e05e; color:#5a4b00; padding:9px 16px; text-align:center; font-weight:bold; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.15); cursor:pointer;';
        banner.innerHTML = '💛 Esta gostando do sistema? A partir de R$ 10,00/mes voce ajuda a manter o SisProf no ar. <span style="text-decoration:underline;">Conheca os planos</span>.';
        banner.onclick = () => abrirModalApoie();
        document.body.insertBefore(banner, document.body.firstChild);
    }
}

// O selo 💛 e a lista "Obrigado a quem e' parca" saem de `users_list.contribuidor`,
// que e' o unico lugar que TODA a escola consegue ler (as Regras nao deixam ninguem
// listar `assinaturas/*` — o plano de cada um e' assunto de cada um). Entao, ao
// descobrir que a assinatura esta' ativa, a propria conta acende o proprio selo.
//
// Nao ha' o que burlar aqui: marcar-se contribuinte na lista so' coloca um coracao
// amarelo ao lado do nome. O que libera funcao premium e' `assinaturas/<uid>`, que
// nenhuma conta comum escreve.
async function sincronizarSeloContribuinte() {
    if (!currentUser || currentUser.role === 'super_admin') return;
    const deveter = ehContribuinte();
    if (currentUser.contribuidor === deveter) return;
    try {
        const dados = await getData('system', 'users_list');
        const lista = (dados && Array.isArray(dados.list)) ? dados.list : [];
        const eu = lista.find(u => u.email === currentUser.email);
        if (!eu || eu.contribuidor === deveter) return;
        eu.contribuidor = deveter;
        if (deveter) eu.contribuiuAntes = true;
        currentUser.contribuidor = deveter;
        try { localStorage.setItem('app_current_user', JSON.stringify(currentUser)); } catch (e) {}
        await saveData('system', 'users_list', { list: lista });
    } catch (e) {
        console.warn('[Assinatura] Nao consegui atualizar o selo de contribuinte:', e);
    }
}

// Formata o nome do contribuinte como "Primeiro S." (primeiro nome + inicial do sobrenome).
function formatarNomeContribuinte(nome) {
    const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'Professor(a)';
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[partes.length - 1].charAt(0).toUpperCase()}.`;
}

// Preenche a secao "Obrigado a quem e' parca" com os contribuintes da escola.
async function carregarContribuintesApoie() {
    const alvo = document.getElementById('apoieContribuintes');
    if (!alvo) return;
    alvo.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Carregando...</p>';
    try {
        const dataUsers = await getData('system', 'users_list');
        const users = (dataUsers && dataUsers.list && Array.isArray(dataUsers.list)) ? dataUsers.list : [];
        const contribuintes = users.filter(u => u.contribuidor === true &&
            (!currentUser || !currentUser.schoolId || String(u.schoolId || '') === String(currentUser.schoolId)));
        if (contribuintes.length === 0) {
            alvo.innerHTML = '<p style="font-size:13px; color:#718096;">Seja o primeiro a apoiar e ajude a manter o SisProf sempre melhorando! 💛</p>';
            return;
        }
        const nomes = contribuintes
            .map(u => formatarNomeContribuinte(u.nome))
            .sort((a, b) => a.localeCompare(b, 'pt'));
        alvo.innerHTML = `
            <p style="font-size:14px; font-weight:bold; color:#2f855a; margin-bottom:8px;">🙌 Obrigado a quem e' parca</p>
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center;">
                ${nomes.map(n => `<span class="badge badge-success" style="font-size:12px;">💛 ${n}</span>`).join('')}
            </div>`;
    } catch (e) {
        console.warn('[Apoie] Erro ao carregar contribuintes:', e);
        alvo.innerHTML = '';
    }
}

// Deixa as pecas visiveis para o resto do aplicativo e para os testes.
window.PLANOS_SISPROF = PLANOS_SISPROF;
window.carregarAssinaturaAtual = carregarAssinaturaAtual;
window.planoDoUsuario = planoDoUsuario;
window.ehContribuinte = ehContribuinte;
window.ehPremium = ehPremium;
window.exigirPremium = exigirPremium;
window.selosPremiumHtml = selosPremiumHtml;
window.assinarPlano = assinarPlano;
window.montarLinkCheckout = montarLinkCheckout;
window.abrirModalApoie = abrirModalApoie;
window.abrirAvisoTransicao = abrirAvisoTransicao;
window.escolherNaTransicao = escolherNaTransicao;
window.precisaAvisarDaTransicao = precisaAvisarDaTransicao;
window.temAssinaturaAntiga = temAssinaturaAntiga;
window.sincronizarSeloContribuinte = sincronizarSeloContribuinte;
window.atualizarBannerApoio = atualizarBannerApoio;
window.injectApoieButton = injectApoieButton;
window.atualizarBotaoApoie = atualizarBotaoApoie;
