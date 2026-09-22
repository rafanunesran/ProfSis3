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
    professor: '',  // idem, plano de R$ 20,00
    // Endereco do servico publicado a partir da pasta assinatura/ (Vercel ou
    // Cloudflare). E' quem cancela a assinatura no Mercado Pago a pedido do
    // professor. Sem ele, o botao de cancelar leva a pessoa ao painel do Mercado
    // Pago — funciona, so' da' mais trabalho.
    servico: ''
};

// Dias de carencia depois do vencimento. A cobranca recorrente nao cai no minuto
// exato — o Mercado Pago tenta de novo por alguns dias — e cortar o professor no
// primeiro segundo de atraso seria cortar por causa da fila do banco, nao por falta
// de pagamento. O super admin ajusta no painel.
const DIAS_TOLERANCIA_PADRAO = 5;
let _politicaAssinatura = { diasTolerancia: DIAS_TOLERANCIA_PADRAO };

// Pacotes de apoio no Pix, cadastrados no painel:
//   [{ plano: 'professor', meses: 3, valor: 60, link: 'https://...' }, ...]
let _pacotesPix = [];

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
// SO' PAGAMENTO CONFIRMADO CONCEDE APOIO. A unica fonte e' `assinaturas/<uid>`,
// documento que nem o dono da conta escreve: quem escreve e' o webhook, depois que
// o Mercado Pago confirma a cobranca, ou o super admin ao conceder cortesia.
//
// Antes havia um segundo caminho: o campo `contribuidor` em system/users_list. Era
// um buraco de verdade — as Regras liberam ESCRITA em system/* para qualquer conta
// logada (ver o comentario la', que explica por que), entao bastava uma linha no
// console do navegador para pendurar o selo de apoiador no proprio nome sem pagar
// nada. Esse caminho acabou: hoje o campo e' so' espelho, nunca fonte.
//
// Clicar em "Assinar" tambem nao concede nada: enquanto o cartao nao passa, o
// documento vem com status `pendente`, e pendente nao e' ativa.
function planoDoUsuario() {
    if (!currentUser) return 'free';
    if (currentUser.role === 'super_admin') return 'professor';

    const a = _assinaturaAtual;
    if (!a || a.status !== 'ativa') return 'free';
    // Pagamento atrasado alem da carencia corta o acesso AQUI, sem depender de o
    // Mercado Pago avisar e sem depender de a varredura diaria ter rodado.
    if (assinaturaVencida(a)) return 'free';
    if (PLANOS_SISPROF[a.plano]) return a.plano;
    if (a.planoContratado && PLANOS_SISPROF[a.planoContratado]) return a.planoContratado;
    return 'free';
}

// Esta conta pediu um plano e ainda espera a confirmacao do cartao?
// Serve so' para a tela explicar a espera — nao concede nada.
function esperandoConfirmacao() {
    return !!(_assinaturaAtual && _assinaturaAtual.status === 'pendente');
}

// ----------------------------------------------------------------------------
// O CORTE POR ATRASO
// ----------------------------------------------------------------------------
// O corte por cartao recusado ja' existia, mas depende de o Mercado Pago AVISAR. E
// ha' um caso silencioso que aviso nenhum cobre: a notificacao que se perde. Webhook
// fora do ar por umas horas, deploy no meio do caminho, evento que nao foi reenviado
// — e o documento fica `ativa` para sempre, com a pessoa usando premium sem pagar,
// sem ninguem descobrir, porque nao existe evento para descobrir.
//
// Por isso o acesso tem PRAZO. A data ja' esta' gravada (`proximaCobranca`, que o
// Mercado Pago manda, ou `validoAte`, no caso do Pix) e a tela compara com hoje.
// Silencio deixa de significar "tudo certo".
//
// Espelha assinatura/regras.mjs (venceEmMs / assinaturaVencida / planoValido), que e'
// a mesma regra no servidor. Os dois lados sao testados.
function venceEmMs(doc) {
    if (!doc) return 0;
    const ms = Date.parse(doc.validoAte || doc.proximaCobranca || '');
    return isFinite(ms) ? ms : 0;
}

function diasDeTolerancia() {
    const n = Number(_politicaAssinatura.diasTolerancia);
    if (!isFinite(n) || n < 0) return DIAS_TOLERANCIA_PADRAO;
    return Math.min(n, 60);
}

// Passou do vencimento + carencia: o acesso acabou.
function assinaturaVencida(doc) {
    const vence = venceEmMs(doc || _assinaturaAtual);
    if (!vence) return false;   // cortesia sem prazo nao vence
    return Date.now() > vence + diasDeTolerancia() * 86400000;
}

// Passou do vencimento, mas ainda na carencia: a tela AVISA em vez de cortar.
// Quem esqueceu de renovar o Pix ou teve problema no cartao merece o aviso, nao a
// surpresa de descobrir pelo botao que parou de funcionar.
function assinaturaEmAtraso(doc) {
    const vence = venceEmMs(doc || _assinaturaAtual);
    if (!vence) return false;
    return Date.now() > vence && !assinaturaVencida(doc);
}

function diasAtrasado(doc) {
    const vence = venceEmMs(doc || _assinaturaAtual);
    if (!vence) return 0;
    return Math.floor((Date.now() - vence) / 86400000);
}

function dataBonita(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10).split('-').reverse().join('/');
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
        links.servico = (typeof cfg.servico === 'string' ? cfg.servico : '') || LINKS_ASSINATURA_PADRAO.servico;
        _linksAssinatura = links;

        // A politica de corte e os pacotes de Pix vem no mesmo documento.
        // O documento e' a fonte da verdade: campo AUSENTE volta para o padrao, em vez
        // de manter o valor da leitura anterior. Sem isso, apagar a carencia no painel
        // deixaria a carencia antiga valendo em toda sessao que ja' estava aberta.
        _politicaAssinatura.diasTolerancia = (cfg.diasTolerancia === undefined || cfg.diasTolerancia === null)
            ? DIAS_TOLERANCIA_PADRAO
            : Number(cfg.diasTolerancia);
        _pacotesPix = Array.isArray(cfg.pacotesPix) ? cfg.pacotesPix.filter(p =>
            p && PLANOS_SISPROF[p.plano] && Number(p.meses) > 0 && Number(p.valor) > 0 && p.link) : [];
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
// Cancelar a assinatura
// ----------------------------------------------------------------------------
// Cancelar precisa ser tao facil quanto assinar. Quem quer sair e nao encontra o
// botao nao vira apoiador de novo: vira reclamacao no banco e assinatura contestada.
//
// Quem cancela de verdade e' o servico da pasta assinatura/ — o navegador nao pode
// falar com a API do Mercado Pago (o token de producao estaria no codigo, a' vista
// de todos). A pagina manda o cracha da sessao do Firebase junto, e o servidor
// confere de quem e' antes de cancelar qualquer coisa.
async function cancelarAssinatura() {
    const a = _assinaturaAtual;
    if (!a || ['ativa', 'pendente', 'pausada'].indexOf(a.status) === -1) {
        alert('Nao encontrei uma assinatura ativa nesta conta.');
        return;
    }

    const plano = PLANOS_SISPROF[a.plano] || PLANOS_SISPROF[a.planoContratado] || PLANOS_SISPROF.apoiase;
    const certeza = confirm(
        'Cancelar a assinatura ' + plano.nome + '?\n\n' +
        'A cobranca mensal para de acontecer e voce volta para o plano gratuito. ' +
        'O sistema continua funcionando igual — voce so deixa de ter o selo' +
        (plano.premium ? ' e as funcoes premium' : '') + '.\n\n' +
        'Pode voltar a assinar quando quiser.');
    if (!certeza) return;

    const links = await carregarLinksAssinatura();
    const servico = links.servico;

    // Sem o servico configurado, mandamos a pessoa para o painel do Mercado Pago em
    // vez de dizer que cancelou sem ter cancelado.
    if (!servico) {
        alert('O cancelamento automatico ainda nao esta configurado neste sistema.\n\n' +
              'Vou abrir o painel do Mercado Pago: entre em "Assinaturas" e cancele por la. ' +
              'Leva um minuto e tem efeito imediato.');
        window.open('https://www.mercadopago.com.br/subscriptions', '_blank');
        return;
    }

    const botao = document.getElementById('btnCancelarAssinatura');
    if (botao) { botao.disabled = true; botao.textContent = 'Cancelando...'; }

    try {
        const cracha = await pegarCrachaDaSessao();
        if (!cracha) {
            alert('Sua sessao expirou. Saia e entre de novo para cancelar a assinatura.');
            return;
        }
        const resposta = await fetch(servico.replace(/\/$/, '') + '/cancelar', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + cracha, 'content-type': 'application/json' },
            body: '{}'
        });
        const resultado = await resposta.json().catch(() => ({}));

        if (!resposta.ok || !resultado.cancelada) {
            alert('Nao consegui cancelar: ' + (resultado.motivo || resultado.erro || 'tente de novo em instantes') +
                  '\n\nSe preferir, cancele direto no painel do Mercado Pago (Assinaturas).');
            return;
        }
        await carregarAssinaturaAtual(true);
        atualizarBotaoApoie();
        if (typeof atualizarBannerApoio === 'function') atualizarBannerApoio();
        renderConteudoModalApoie();
        alert('Assinatura cancelada. Nao havera mais cobranca.\n\nObrigado por ter apoiado o projeto 💛');
    } catch (e) {
        console.warn('[Assinatura] Falha ao cancelar:', e);
        alert('Nao consegui falar com o servico de cancelamento. Verifique sua internet e tente de novo, ' +
              'ou cancele pelo painel do Mercado Pago (Assinaturas).');
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = 'Cancelar assinatura'; }
    }
}

// O cracha da sessao (ID token do Firebase Auth). E' o que prova, do lado do
// servidor, que quem pediu o cancelamento e' o dono da conta.
async function pegarCrachaDaSessao() {
    try {
        if (typeof firebase === 'undefined' || !firebase.auth) return '';
        const usuario = firebase.auth().currentUser;
        if (!usuario || typeof usuario.getIdToken !== 'function') return '';
        return await usuario.getIdToken();
    } catch (e) {
        console.warn('[Assinatura] Nao consegui pegar o cracha da sessao:', e);
        return '';
    }
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
        return '<p style="font-size:13px; color:#b7791f;">⏳ Assinatura iniciada, aguardando a confirmacao do cartao. ' +
               'O selo e as funcoes do plano entram assim que o pagamento for confirmado.</p>';
    }
    if (a.status === 'pausada') {
        return '<p style="font-size:13px; color:#c53030;">⚠️ A cobranca deste mes nao passou no cartao. ' +
               'O Mercado Pago vai tentar de novo; voce tambem pode atualizar o cartao por la.<br>' +
               '<span style="color:#742a2a;">Enquanto isso, o selo e as funcoes do plano ficam suspensos.</span></p>';
    }
    if (a.status === 'vencida') {
        return '<p style="font-size:13px; color:#c53030;">⏰ O apoio venceu em <strong>' +
               dataBonita(a.validoAte || a.proximaCobranca) + '</strong> e o acesso voltou ao gratuito. ' +
               'Assine de novo abaixo quando quiser — nada do seu trabalho foi perdido.</p>';
    }

    // ATRASADO, mas ainda na carencia: avisa em vez de cortar.
    if (assinaturaEmAtraso(a)) {
        const restam = diasDeTolerancia() - diasAtrasado(a);
        return '<p style="font-size:13px; color:#b7791f;">⏳ O pagamento de <strong>' +
               dataBonita(a.validoAte || a.proximaCobranca) + '</strong> ainda nao foi confirmado. ' +
               'Seu acesso continua por <strong>' + Math.max(0, restam) + ' dia(s)</strong>' +
               (a.origem === 'pix'
                 ? ' — renove pelo Pix abaixo para nao ficar sem.'
                 : ' — se o cartao mudou, atualize no Mercado Pago.') + '</p>';
    }

    // JA CORTADO pela data, mesmo com o documento dizendo ativa (o aviso do Mercado
    // Pago pode ter se perdido; a varredura diaria conserta o banco depois).
    if (assinaturaVencida(a)) {
        return '<p style="font-size:13px; color:#c53030;">⏰ O pagamento venceu em <strong>' +
               dataBonita(a.validoAte || a.proximaCobranca) + '</strong> e nao foi confirmado, ' +
               'entao o acesso voltou ao gratuito. Se voce pagou, pode levar algumas horas para ' +
               'ser reconhecido — o sistema libera sozinho.</p>';
    }

    const vence = a.validoAte
        ? ', apoio garantido ate <strong>' + dataBonita(a.validoAte) + '</strong>'
        : (a.proximaCobranca ? ', proxima cobranca em <strong>' + dataBonita(a.proximaCobranca) + '</strong>' : '');
    return `<p style="font-size:13px; color:#2f855a;">✅ Plano <strong>${plano.nome}</strong> ativo` +
           vence + '.</p>';
}

// ----------------------------------------------------------------------------
// Pix: quem nao tem cartao tambem apoia
// ----------------------------------------------------------------------------
// O Mercado Pago NAO faz cobranca recorrente no Pix — recorrencia automatica la' e'
// cartao. Como muito professor nao tem cartao de credito (ou nao quer deixar cobranca
// automatica), o Pix entra como PACOTE DE MESES: paga uma vez, o apoio vale pelo
// periodo e vence sozinho no fim. Nada ficando cobrado sem autorizacao.
function secaoPixHtml() {
    if (!_pacotesPix.length) return '';

    const porPlano = {};
    _pacotesPix.forEach(p => {
        if (!porPlano[p.plano]) porPlano[p.plano] = [];
        porPlano[p.plano].push(p);
    });

    const blocos = Object.keys(porPlano).map(planoId => {
        const plano = PLANOS_SISPROF[planoId];
        if (!plano) return '';
        const botoes = porPlano[planoId]
            .sort((a, b) => Number(a.meses) - Number(b.meses))
            .map(p => {
                const total = Number(p.valor);
                const porMes = total / Number(p.meses);
                const economia = porMes < plano.valor - 0.01
                    ? `<span style="display:block; font-size:10px; color:#2f855a;">R$ ${porMes.toFixed(2).replace('.', ',')}/mes</span>`
                    : '';
                return `<button class="btn btn-secondary" style="padding:8px 12px;"
                                onclick="pagarComPix('${planoId}', ${Number(p.meses)})">
                            <strong>${Number(p.meses)} ${Number(p.meses) === 1 ? 'mes' : 'meses'}</strong>
                            <span style="display:block; font-size:11px;">R$ ${total.toFixed(2).replace('.', ',')}</span>
                            ${economia}
                        </button>`;
            }).join('');
        return `<div style="margin-top:10px;">
                    <div style="font-size:12px; font-weight:bold; color:#2d3748;">${plano.emoji} ${plano.nome}</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">${botoes}</div>
                </div>`;
    }).join('');

    return `
        <div style="margin-top:18px; border:1px solid #e2e8f0; border-radius:10px; padding:14px; background:#f7fafc; text-align:left;">
            <div style="font-size:14px; font-weight:bold; color:#2d3748;">📱 Prefere Pix? Sem cartao, sem cobranca automatica</div>
            <p style="font-size:12px; color:#4a5568; margin:6px 0 0 0;">
                Voce paga uma vez e o apoio vale pelo periodo escolhido. No fim do prazo ele
                simplesmente acaba — <strong>nada e cobrado de voce sem autorizacao</strong>. Para continuar,
                basta fazer outro Pix (e pagar antes de vencer nao perde os dias que faltavam).
            </p>
            ${blocos}
            <p style="font-size:11px; color:#718096; margin-top:10px;">
                O reconhecimento do Pix costuma levar poucos minutos. Assim que cair, o plano
                aparece sozinho aqui — nao precisa recarregar nem avisar ninguem.
            </p>
        </div>`;
}

// Abre o link de Pix do pacote, com a referencia de quem esta pagando.
async function pagarComPix(planoId, meses) {
    await carregarLinksAssinatura();
    const pacote = _pacotesPix.find(p => p.plano === planoId && Number(p.meses) === Number(meses));
    if (!pacote || !pacote.link) {
        alert('Este pacote de Pix ainda nao esta configurado. Tente outro, ou use o cartao.');
        return;
    }
    const uid = currentUser && (currentUser.uid || currentUser.id);
    // A referencia diz ao servidor quem pagou e quantos meses creditar. Quando o
    // Mercado Pago nao a repassa (acontece em link de pagamento), o servidor
    // reconhece pelo VALOR recebido e pelo e-mail do pagador — por isso o pacote
    // funciona mesmo sem isto chegar.
    const referencia = [uid || '', planoId, Number(meses)].join('|');
    const separador = pacote.link.indexOf('?') === -1 ? '?' : '&';
    window.open(pacote.link + separador + 'external_reference=' + encodeURIComponent(referencia), '_blank');
    marcarEsperandoConfirmacao(planoId);
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
        ${secaoPixHtml()}
        ${temAssinaturaViva ? `
            <div style="margin-top:14px; border-top:1px dashed #e2e8f0; padding-top:14px;">
                <button class="btn btn-danger" id="btnCancelarAssinatura" onclick="cancelarAssinatura()"
                        style="padding:9px 18px;">Cancelar assinatura</button>
                <p style="font-size:11px; color:#718096; margin-top:6px;">
                    Cancelar interrompe a cobranca mensal e devolve a conta ao plano gratuito.
                    Sem multa e sem perder nenhum dado — voce pode voltar quando quiser.
                </p>
                <p style="font-size:11px; margin-top:4px;">
                    <a href="https://www.mercadopago.com.br/subscriptions" target="_blank" rel="noopener"
                       style="color:#718096;">Ver a assinatura no painel do Mercado Pago</a>
                </p>
            </div>` : ''}
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
    // A politica de carencia vem no mesmo documento dos links, e precisa estar
    // carregada ANTES de julgar o plano de alguem: com a carencia padrao, quem tem
    // tolerancia maior configurada apareceria cortado por um instante.
    Promise.all([carregarAssinaturaAtual(), carregarLinksAssinatura()]).then(async () => {
        atualizarBotaoApoie();
        if (typeof atualizarBannerApoio === 'function') atualizarBannerApoio();
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

// A lista "Obrigado a quem e' parca" vinha de `users_list.contribuidor`, e o proprio
// aplicativo escrevia esse campo para si mesmo. Nao escreve mais: era o mesmo buraco
// do plano — system/* aceita escrita de qualquer conta logada, entao o coracao
// amarelo podia ser pendurado no proprio nome pelo console, sem pagamento nenhum.
//
// Agora a vitrine mora em `contribuintes/<uid>`, que SO' o webhook escreve, depois
// da confirmacao do pagamento (ver assinatura/webhook.mjs). O campo antigo continua
// existindo para o painel do super admin, mas ninguem le' ele para conceder nada.

// Preenche a secao "Obrigado a quem e' parca". Le `contribuintes/*`, a colecao que
// o webhook mantem: quem esta' aqui pagou e o Mercado Pago confirmou.
async function carregarContribuintesApoie() {
    const alvo = document.getElementById('apoieContribuintes');
    if (!alvo) return;
    alvo.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Carregando...</p>';
    try {
        if (typeof db === 'undefined' || !db) { alvo.innerHTML = ''; return; }

        let consulta = db.collection('contribuintes');
        if (currentUser && currentUser.schoolId) {
            consulta = consulta.where('schoolId', '==', String(currentUser.schoolId));
        }
        const resultado = await consulta.limit(200).get();
        const nomes = [];
        resultado.forEach(doc => {
            const d = doc.data() || {};
            if (d.nome) nomes.push(String(d.nome));
        });

        if (nomes.length === 0) {
            alvo.innerHTML = '<p style="font-size:13px; color:#718096;">Seja o primeiro a apoiar e ajude a manter o SisProf sempre melhorando! 💛</p>';
            return;
        }
        nomes.sort((a, b) => a.localeCompare(b, 'pt'));
        alvo.innerHTML = `
            <p style="font-size:14px; font-weight:bold; color:#2f855a; margin-bottom:8px;">🙌 Obrigado a quem e' parca</p>
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center;">
                ${nomes.map(n => `<span class="badge badge-success" style="font-size:12px;">💛 ${n}</span>`).join('')}
            </div>`;
    } catch (e) {
        // Lista e' agradecimento, nao funcionalidade: some calada em vez de estragar
        // o pop-up de quem veio assinar.
        console.warn('[Apoie] Nao consegui carregar a lista de contribuintes:', e && e.message);
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
window.esperandoConfirmacao = esperandoConfirmacao;
window.cancelarAssinatura = cancelarAssinatura;
window.pagarComPix = pagarComPix;
window.assinaturaVencida = assinaturaVencida;
window.assinaturaEmAtraso = assinaturaEmAtraso;
window.diasDeTolerancia = diasDeTolerancia;
window.atualizarBannerApoio = atualizarBannerApoio;
window.injectApoieButton = injectApoieButton;
window.atualizarBotaoApoie = atualizarBotaoApoie;
