// O LIVRO-CAIXA DO SISPROF — o que entrou de dinheiro, visto pelo Mercado Pago.
//
// POR QUE ELE EXISTE
//   `assinaturas/<uid>` diz quem tem plano AGORA, mas nao guarda historia: um Pix
//   renovado apaga o anterior, e cobranca mensal do cartao nem deixa rastro. Para o
//   super admin saber quanto entrou em cada mes (e quanto o Mercado Pago ficou de
//   taxa), cada pagamento vira um documento em `financeiro_entradas/<id do pagamento>`.
//
// DE ONDE VEM
//   Do proprio Mercado Pago, nunca do navegador: o webhook grava quando o aviso chega,
//   a varredura diaria passa pelos ultimos 35 dias, e o botao "Buscar no Mercado Pago"
//   da tela financeira puxa o periodo que o super admin pedir. O id do pagamento e' a
//   chave do documento, entao ver o mesmo pagamento tres vezes grava o mesmo lugar.
//
// QUEM LE
//   So' o super admin (ver firestore.rules). Ninguem escreve pelo navegador: so' o
//   servico, com a conta de servico.

import { lerReferenciaPix, pacotePorValor, planoPorValor } from './regras.mjs';

// So' o que mexeu em dinheiro de verdade vira linha no livro. Pendente, rejeitado e
// expirado (o Pix gerado e nao pago) nao sao entrada.
const STATUS_QUE_CONTAM = ['approved', 'refunded', 'charged_back'];

// O mes contabil no horario de Brasilia (UTC-3, sem horario de verao desde 2019).
// Um Pix pago as 22h do dia 31 e' do mes 31, nao do dia seguinte em UTC.
export function mesDeBrasilia(iso) {
    const ms = Date.parse(iso || '');
    if (!isFinite(ms)) return '';
    return new Date(ms - 3 * 3600000).toISOString().slice(0, 7);
}

function arredondar(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

// De um pagamento do Mercado Pago (GET /v1/payments/<id>) para a linha do livro.
// Devolve null para o que nao conta.
export function montarEntradaFinanceira(pagamento, pacotes) {
    if (!pagamento || !pagamento.id) return null;
    const status = String(pagamento.status || '').toLowerCase();
    if (STATUS_QUE_CONTAM.indexOf(status) === -1) return null;

    const valor = arredondar(pagamento.transaction_amount);
    const taxa = arredondar((Array.isArray(pagamento.fee_details) ? pagamento.fee_details : [])
        .filter(f => !f.fee_payer || f.fee_payer === 'collector')
        .reduce((soma, f) => soma + (Number(f.amount) || 0), 0));
    const detalhes = pagamento.transaction_details || {};
    const liquido = isFinite(Number(detalhes.net_received_amount)) && detalhes.net_received_amount !== null
        && detalhes.net_received_amount !== undefined
        ? arredondar(detalhes.net_received_amount)
        : arredondar(valor - taxa);

    // O que foi este pagamento.
    const metodo = String(pagamento.payment_method_id || '').toLowerCase();
    const referencia = lerReferenciaPix(pagamento.external_reference);
    let categoria = 'outro';
    let plano = '';
    let meses = 0;
    let uid = '';
    if (String(pagamento.operation_type || '') === 'recurring_payment') {
        categoria = 'assinatura';
        plano = planoPorValor(valor) || '';
        meses = 1;
    } else if (referencia) {
        categoria = 'pix';
        plano = referencia.plano;
        meses = referencia.meses;
        uid = referencia.uid;
    } else if (metodo === 'pix') {
        const pacote = pacotePorValor(valor, pacotes || []);
        if (pacote) {
            categoria = 'pix';
            plano = pacote.plano;
            meses = pacote.meses;
        }
    }

    const data = pagamento.date_approved || pagamento.date_created || '';
    return {
        id: String(pagamento.id),
        data: data,
        mes: mesDeBrasilia(data),
        status: status,
        valor: valor,
        taxa: taxa,
        liquido: liquido,
        estornado: arredondar(pagamento.transaction_amount_refunded),
        metodo: metodo,
        categoria: categoria,
        plano: plano,
        meses: meses,
        uid: uid,
        email: String(((pagamento.payer && pagamento.payer.email) || '')).toLowerCase(),
        descricao: String(pagamento.description || '').slice(0, 140),
        atualizadoEm: new Date().toISOString()
    };
}

// Grava uma linha. Nunca estoura: o livro e' contabilidade, e uma falha aqui nao
// pode impedir que o professor receba o plano que pagou.
export async function registrarEntrada(pagamento, pacotes, ferramentas) {
    try {
        const entrada = montarEntradaFinanceira(pagamento, pacotes);
        if (!entrada) return false;
        await ferramentas.gravar('financeiro_entradas/' + entrada.id, entrada);
        return true;
    } catch (e) {
        console.warn('[financeiro] nao consegui registrar o pagamento', pagamento && pagamento.id,
                     e && e.message);
        return false;
    }
}

// Puxa do Mercado Pago os pagamentos de um periodo e grava no livro.
export async function sincronizarLivroCaixa(dias, pacotes, ferramentas) {
    const { buscarNoMp } = ferramentas;
    const periodo = Math.max(1, Math.min(Math.round(Number(dias) || 35), 400));
    const relatorio = { dias: periodo, lidos: 0, gravados: 0 };

    for (let pagina = 0; pagina < 20; pagina++) {
        const parametros = new URLSearchParams({
            sort: 'date_created', criteria: 'desc', range: 'date_created',
            begin_date: 'NOW-' + periodo + 'DAYS', end_date: 'NOW',
            limit: '100', offset: String(pagina * 100)
        });
        const resposta = await buscarNoMp('/v1/payments/search?' + parametros.toString());
        const lista = (resposta && Array.isArray(resposta.results)) ? resposta.results : [];
        relatorio.lidos += lista.length;
        for (const pagamento of lista) {
            if (await registrarEntrada(pagamento, pacotes, ferramentas)) relatorio.gravados++;
        }
        if (lista.length < 100) break;
    }
    return relatorio;
}

// Quem pode mexer no financeiro: as mesmas contas que as Regras chamam de super
// admin (firestore.rules, isSuperAdmin). A conta pessoal so' vale com e-mail
// verificado; a conta interna @adm.com nao tem caixa de e-mail para verificar.
const SUPER_ADMINS = ['rafaelnf93@gmail.com', 'rafael@adm.com'];
const SEM_VERIFICACAO = ['rafael@adm.com'];

export function ehSuperAdmin(dono) {
    const email = String((dono && dono.email) || '').toLowerCase();
    if (SUPER_ADMINS.indexOf(email) === -1) return false;
    return SEM_VERIFICACAO.indexOf(email) !== -1 || !!(dono && dono.emailVerificado);
}
