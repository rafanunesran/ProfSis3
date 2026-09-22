// AS REGRAS DA ASSINATURA — a parte que decide, sem tocar em rede nem em banco.
//
// Vive separada de proposito: o webhook (webhook.mjs) roda longe daqui, num
// Cloudflare Worker, e o unico jeito de testar "o que o Mercado Pago mandou virou
// qual plano" sem subir servidor e' esta ilha de funcoes puras. O teste que cobre
// este arquivo e' testes/teste-webhook-mp.js.
//
// FONTE DA VERDADE DOS PLANOS: e' este arquivo. O front (assinatura.js) repete os
// valores porque e' carregado por <script> comum (nao importa modulo), e o teste
// compara os dois para que nunca desencontrem.

export const PLANOS = {
    free: {
        id: 'free',
        nome: 'Gratuito',
        valor: 0,
        premium: false,
        contribui: false
    },
    apoiase: {
        id: 'apoiase',
        nome: 'Apoia-se',
        valor: 10,
        premium: false,   // apoiar mantem exatamente as funcoes gratuitas
        contribui: true
    },
    professor: {
        id: 'professor',
        nome: 'Professor',
        valor: 20,
        premium: true,    // libera as funcoes premium
        contribui: true
    }
};

// O plano antigo, de R$ 7,00, esta sendo encerrado. Enquanto a cobranca antiga nao
// for cancelada no painel do Mercado Pago, quem paga continua sendo contribuinte —
// ninguem perde o selo por causa de uma mudanca que nao foi ele quem fez.
export const VALOR_PLANO_LEGADO = 7;

// ----------------------------------------------------------------------------
// Plano
// ----------------------------------------------------------------------------

// Qual plano corresponde a um valor mensal cobrado.
// Usamos faixas (e nao igualdade) porque o Mercado Pago devolve o valor como
// numero com centavos e porque um reajuste futuro de centavos nao pode derrubar
// ninguem para o gratuito.
export function planoPorValor(valor) {
    const n = Number(valor);
    if (!isFinite(n) || n <= 0) return null;
    if (n >= PLANOS.professor.valor) return 'professor';
    if (n >= PLANOS.apoiase.valor) return 'apoiase';
    return 'apoiase'; // qualquer coisa abaixo de R$ 10 e' o apoio antigo (R$ 7)
}

// Um valor abaixo do Apoia-se atual so' pode ser assinatura antiga.
export function ehValorLegado(valor) {
    const n = Number(valor);
    return isFinite(n) && n > 0 && n < PLANOS.apoiase.valor;
}

// O plano de uma assinatura (`preapproval`) do Mercado Pago.
// Preferimos o ID do plano configurado; o valor e' a rede de seguranca para quando
// a assinatura foi criada sem plano associado (o formato antigo, "preapproval
// avulso", que so' tem `auto_recurring.transaction_amount`).
export function mapearPlano(preapproval, config) {
    const cfg = config || {};
    const idPlano = preapproval && preapproval.preapproval_plan_id;
    if (idPlano) {
        if (cfg.planoProfessorId && idPlano === cfg.planoProfessorId) return 'professor';
        if (cfg.planoApoiaseId && idPlano === cfg.planoApoiaseId) return 'apoiase';
    }
    const recorrencia = (preapproval && preapproval.auto_recurring) || {};
    return planoPorValor(recorrencia.transaction_amount);
}

// ----------------------------------------------------------------------------
// Situacao
// ----------------------------------------------------------------------------

// `authorized` e' o unico estado que significa "o cartao esta autorizado e a
// cobranca mensal esta rodando". Os outros nao sao sinonimos de calote:
//   pending   - a pessoa abriu o checkout e ainda nao terminou;
//   paused    - o Mercado Pago pausou (cartao recusado, por exemplo) e vai tentar de novo;
//   cancelled - acabou, por escolha da pessoa ou nossa.
export function mapearStatus(statusMp) {
    switch (String(statusMp || '').toLowerCase()) {
        case 'authorized': return 'ativa';
        case 'pending':    return 'pendente';
        case 'paused':     return 'pausada';
        case 'cancelled':
        case 'canceled':   return 'cancelada';
        default:           return 'desconhecida';
    }
}

// So' quem esta com a cobranca rodando conta como assinante para o aplicativo.
// `pausada` NAO vale: o pagamento do mes falhou.
export function assinaturaVale(status) {
    return status === 'ativa';
}

// ----------------------------------------------------------------------------
// Vencimento: o corte que NAO depende de aviso
// ----------------------------------------------------------------------------
// O corte por cartao recusado ja' funcionava, mas so' quando o Mercado Pago avisava.
// E ha' um caso silencioso que essa logica nao pega: a notificacao que se perde.
// Webhook fora do ar por umas horas, deploy no meio do caminho, evento que o Mercado
// Pago nao reenviou — e o documento fica `ativa` para sempre. A pessoa segue com o
// premium e o selo sem pagar, e ninguem descobre, porque nao existe evento nenhum
// para descobrir.
//
// Entao o acesso passa a ter PRAZO. A data ja' esta' gravada (`proximaCobranca`, que
// o Mercado Pago manda, ou `validoAte`, no caso do Pix), e o aplicativo compara com
// o dia de hoje. Silencio deixa de ser "tudo certo" e passa a ser vencimento.

// Quantos dias depois do vencimento o acesso ainda vale. Existe porque a cobranca
// recorrente nao cai no minuto exato: o Mercado Pago tenta de novo por alguns dias,
// e cortar o professor no primeiro segundo de atraso seria cortar por causa da fila
// do banco, nao por falta de pagamento.
export const DIAS_TOLERANCIA_PADRAO = 5;

export function diasDeTolerancia(config) {
    const n = Number((config || {}).diasTolerancia);
    if (!isFinite(n) || n < 0) return DIAS_TOLERANCIA_PADRAO;
    return Math.min(n, 60); // teto de sanidade: 60 dias de graca nao e' tolerancia
}

// Quando este acesso vence, em ms. Zero = nao vence por data (cortesia sem prazo).
export function venceEmMs(doc) {
    if (!doc) return 0;
    const bruto = doc.validoAte || doc.proximaCobranca || '';
    const ms = Date.parse(bruto);
    return isFinite(ms) ? ms : 0;
}

export function assinaturaVencida(doc, config, agoraMs) {
    const vence = venceEmMs(doc);
    if (!vence) return false;
    const agora = agoraMs || Date.now();
    return agora > vence + diasDeTolerancia(config) * 86400000;
}

// Esta' em atraso, mas ainda dentro da carencia? Serve para a tela avisar ANTES de
// cortar — quem esta' esquecido do Pix ou com cartao a vencer merece o aviso, nao a
// surpresa.
export function assinaturaEmAtraso(doc, config, agoraMs) {
    const vence = venceEmMs(doc);
    if (!vence) return false;
    const agora = agoraMs || Date.now();
    return agora > vence && !assinaturaVencida(doc, config, agoraMs);
}

// A PALAVRA FINAL sobre o plano de uma conta. Tudo (servidor, tela, portao premium)
// passa por aqui: status ativo E dentro do prazo.
export function planoValido(doc, config, agoraMs) {
    if (!doc || doc.status !== 'ativa') return 'free';
    if (assinaturaVencida(doc, config, agoraMs)) return 'free';
    if (PLANOS[doc.plano]) return doc.plano;
    if (doc.planoContratado && PLANOS[doc.planoContratado]) return doc.planoContratado;
    return 'free';
}

// ----------------------------------------------------------------------------
// Pix: apoio pago em pacote de meses
// ----------------------------------------------------------------------------
// O Mercado Pago NAO faz assinatura recorrente no Pix — recorrencia automatica lá e'
// cartao. Como muito professor nao tem (ou nao quer usar) cartao, o Pix entra como
// pagamento avulso que CREDITA MESES: R$ 60 no Pix = 3 meses de Professor, e o acesso
// vence sozinho no fim do periodo, pela regra de vencimento acima. Nada para
// cancelar, nada para cobrar de novo sem autorizacao.

// De um pagamento aprovado para "qual plano, quantos meses".
// Duas formas de descobrir, nesta ordem:
//   1. `external_reference` no formato "<uid>|<plano>|<meses>", que o aplicativo
//      gruda no link quando consegue;
//   2. o VALOR pago, comparado com os pacotes cadastrados no painel. Este e' o
//      caminho que sempre funciona: link de pagamento do Mercado Pago nem sempre
//      repassa a referencia, mas o valor recebido e' sempre exato.
export function lerReferenciaPix(referencia) {
    const partes = String(referencia || '').split('|');
    if (partes.length < 3) return null;
    const plano = String(partes[1] || '').trim().toLowerCase();
    const meses = Math.round(Number(partes[2]));
    if (!PLANOS[plano] || !isFinite(meses) || meses < 1 || meses > 24) return null;
    return { uid: String(partes[0] || '').trim(), plano: plano, meses: meses };
}

// Acha o pacote cadastrado que corresponde ao valor pago. A tolerancia de centavos
// existe porque taxa, arredondamento e promocao mexem no ultimo digito, e recusar um
// pagamento de R$ 59,99 por causa de um centavo seria absurdo.
export function pacotePorValor(valorPago, pacotes) {
    const valor = Number(valorPago);
    if (!isFinite(valor) || valor <= 0) return null;
    let melhor = null;
    let menorDiferenca = Infinity;
    for (const pacote of (pacotes || [])) {
        const alvo = Number(pacote && pacote.valor);
        const meses = Math.round(Number(pacote && pacote.meses));
        if (!isFinite(alvo) || alvo <= 0 || !isFinite(meses) || meses < 1) continue;
        if (!PLANOS[pacote && pacote.plano]) continue;

        const diferenca = Math.abs(valor - alvo);
        if (diferenca > 0.05) continue;
        if (diferenca < menorDiferenca) {
            menorDiferenca = diferenca;
            melhor = { uid: '', plano: pacote.plano, meses: meses };
        }
    }
    return melhor;
}

// Soma meses ao acesso. Quem paga antes de vencer NAO perde o que falta: os meses
// novos entram a partir da data que ele ja' tinha.
export function somarMeses(validoAteAtual, meses, agoraMs) {
    const agora = agoraMs || Date.now();
    const atual = Date.parse(validoAteAtual || '');
    const base = new Date(isFinite(atual) && atual > agora ? atual : agora);
    const fim = new Date(base.getTime());
    fim.setMonth(fim.getMonth() + Math.round(Number(meses) || 0));
    return fim.toISOString();
}

// O documento de um apoio pago no Pix.
export function montarApoioPix(pagamento, credito, docAtual, agoraMs) {
    const validoAte = somarMeses(docAtual && docAtual.validoAte, credito.meses, agoraMs);
    return {
        plano: credito.plano,
        planoContratado: credito.plano,
        status: 'ativa',
        valor: Number((pagamento && pagamento.transaction_amount) || 0),
        meses: credito.meses,
        validoAte: validoAte,
        legado: false,
        email: String(((pagamento && pagamento.payer && pagamento.payer.email) || '')).toLowerCase(),
        // Pix nao tem assinatura para cancelar: nao inventamos um preapprovalId.
        preapprovalId: (docAtual && docAtual.preapprovalId) || '',
        ultimoPagamento: (pagamento && pagamento.date_approved) || new Date(agoraMs || Date.now()).toISOString(),
        ultimoPagamentoId: String((pagamento && pagamento.id) || ''),
        origem: 'pix',
        versaoMs: (agoraMs || Date.now()),
        atualizadoEm: new Date(agoraMs || Date.now()).toISOString()
    };
}

// ----------------------------------------------------------------------------
// Quem e' a pessoa
// ----------------------------------------------------------------------------

// O `external_reference` sai daqui mesmo: e' o uid que o aplicativo grudou no link
// do checkout. Quando ele nao volta (o Mercado Pago nem sempre repassa em link de
// plano), sobra o e-mail do pagador — por isso o webhook tambem sabe procurar na
// lista de usuarios.
export function identificarUsuario(preapproval) {
    const ref = String((preapproval && preapproval.external_reference) || '').trim();
    const doPagador = String((preapproval && preapproval.payer_email) || '').trim().toLowerCase();

    // Referencia sem arroba: e' o uid que o aplicativo grudou no link. E' o caminho
    // mais confiavel e nao depende de e-mail nenhum.
    if (ref && ref.indexOf('@') === -1) {
        return { uid: ref, email: doPagador, emailAlternativo: '' };
    }
    // Referencia COM arroba: e' o e-mail da conta no SisProf, colocado la' por nos.
    // Vale mais que o e-mail do pagador, que e' o da conta do Mercado Pago e
    // frequentemente e' outro (o do conjuge, o pessoal, o da escola).
    if (ref) {
        return { uid: '', email: ref.toLowerCase(), emailAlternativo: doPagador };
    }
    return { uid: '', email: doPagador, emailAlternativo: '' };
}

// Acha o uid pelo e-mail dentro da lista de usuarios do sistema.
// Comparacao sem acento de maiuscula: professor que se cadastrou com "Maria@..."
// e pagou com "maria@..." e' a mesma pessoa.
export function acharUidPorEmail(listaUsuarios, email) {
    const alvo = String(email || '').trim().toLowerCase();
    if (!alvo) return '';
    const achado = (listaUsuarios || []).find(u =>
        String((u && u.email) || '').trim().toLowerCase() === alvo);
    return (achado && (achado.uid || achado.id)) ? String(achado.uid || achado.id) : '';
}

// ----------------------------------------------------------------------------
// O documento que vai para o Firestore
// ----------------------------------------------------------------------------

// Monta `assinaturas/<uid>` a partir do que o Mercado Pago devolveu.
// O documento e' SEMPRE o retrato completo do recurso remoto — nunca um remendo
// parcial. E' o que faz uma notificacao repetida (o Mercado Pago repete bastante)
// terminar exatamente no mesmo lugar.
export function montarAssinatura(preapproval, config) {
    const cfg = config || {};
    const plano = mapearPlano(preapproval, cfg) || 'free';
    const status = mapearStatus(preapproval && preapproval.status);
    const recorrencia = (preapproval && preapproval.auto_recurring) || {};
    const valor = Number(recorrencia.transaction_amount) || 0;
    const quem = identificarUsuario(preapproval);

    return {
        plano: assinaturaVale(status) ? plano : 'free',
        planoContratado: plano,          // o que foi assinado, mesmo se a cobranca falhou
        status: status,
        valor: valor,
        legado: ehValorLegado(valor),    // assinatura de R$ 7, do sistema que sera' encerrado
        email: quem.email || '',
        preapprovalId: String((preapproval && preapproval.id) || ''),
        planoMpId: String((preapproval && preapproval.preapproval_plan_id) || ''),
        proximaCobranca: (preapproval && preapproval.next_payment_date) || '',
        ultimoPagamento: (preapproval && preapproval.last_charged_date) || '',
        origem: 'mercadopago',
        versaoMs: versaoDoRecurso(preapproval),
        atualizadoEm: new Date().toISOString()
    };
}

// Carimbo de versao do recurso remoto, para nao deixar uma notificacao atrasada
// sobrescrever uma mais nova (o Mercado Pago entrega fora de ordem com frequencia).
export function versaoDoRecurso(preapproval) {
    const bruto = (preapproval && (preapproval.last_modified || preapproval.date_created)) || '';
    const ms = Date.parse(bruto);
    return isFinite(ms) ? ms : 0;
}

// Vale gravar por cima do que ja' esta no banco?
// Sim quando o que chegou e' mais novo, ou quando o que esta' gravado nao tem
// carimbo (documento escrito a mao pelo painel do super admin, por exemplo).
export function devoGravar(docAtual, docNovo) {
    if (!docAtual) return true;
    const atual = Number(docAtual.versaoMs) || 0;
    const novo = Number(docNovo && docNovo.versaoMs) || 0;
    if (!atual) return true;
    // Mesma versao: nao ha o que mudar, e evitar a escrita poupa quota.
    if (novo <= atual) return false;
    return true;
}

// ----------------------------------------------------------------------------
// O que o webhook faz com cada aviso
// ----------------------------------------------------------------------------

// O Mercado Pago manda varios tipos de aviso no mesmo endereco. Traduz o corpo da
// notificacao em "o que eu preciso buscar na API deles".
//   subscription_preapproval          - a assinatura em si (criada, autorizada, pausada, cancelada)
//   subscription_authorized_payment   - a cobranca mensal daquela assinatura
// O resto (payment avulso, merchant_order, etc.) nao e' assinatura: respondemos
// 200 e seguimos a vida, senao o Mercado Pago fica reenviando para sempre.
export function interpretarNotificacao(corpo) {
    const tipo = String((corpo && (corpo.type || corpo.topic)) || '').toLowerCase();
    const id = String(((corpo && corpo.data && corpo.data.id) || (corpo && corpo.id) || '')).trim();
    if (!id) return { acao: 'ignorar', motivo: 'notificacao sem id' };

    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
        return { acao: 'buscar-assinatura', id: id };
    }
    if (tipo === 'subscription_authorized_payment' || tipo === 'authorized_payment') {
        return { acao: 'buscar-cobranca', id: id };
    }
    // Pagamento avulso: era ignorado, e agora e' o caminho do Pix. Continua sendo
    // ignorado se, ao buscar, nao corresponder a nenhum pacote de apoio — a conta do
    // Mercado Pago pode receber outras coisas, e nada disso vira plano por acidente.
    if (tipo === 'payment') {
        return { acao: 'buscar-pagamento', id: id };
    }
    return { acao: 'ignorar', motivo: 'tipo fora do escopo de assinatura: ' + (tipo || '(vazio)') };
}

// O texto que o Mercado Pago assina em `x-signature`.
// Formato deles: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export function manifestoAssinatura(idRecurso, requestId, ts) {
    let manifesto = '';
    if (idRecurso) manifesto += 'id:' + idRecurso + ';';
    if (requestId) manifesto += 'request-id:' + requestId + ';';
    if (ts) manifesto += 'ts:' + ts + ';';
    return manifesto;
}

// Quebra o cabecalho "ts=1700000000,v1=abc..." em partes.
export function lerCabecalhoAssinatura(cabecalho) {
    const partes = {};
    String(cabecalho || '').split(',').forEach(p => {
        const i = p.indexOf('=');
        if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    return { ts: partes.ts || '', v1: partes.v1 || '' };
}
