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

// ----------------------------------------------------------------------------
// ESTE PAGAMENTO E' DO SISPROF?
// ----------------------------------------------------------------------------
// A conta do Mercado Pago recebe outras coisas alem do SisProf (outra automacao, outro
// produto). A primeira versao gravava TODO pagamento aprovado da conta no livro — e o
// financeiro do SisProf aparecia com dinheiro que nao era dele. Agora so' entra o que
// tem marca do SisProf:
//   1. Pix gerado pelo /pix: a referencia "uid|plano|meses" foi posta por nos;
//   2. descricao com "SisProf" (o /pix escreve "SisProf - apoio ..."; o link antigo de
//      pagamento e os planos de assinatura tambem levam o nome);
//   3. cobranca de assinatura cujo preapproval e' de um plano do SisProf — pelo id do
//      plano (MP_PLANO_*), pelo nome do plano, ou por ja' estar no nosso banco.
// O que nao passa por nenhum dos tres fica de fora. Valor igual ao de um pacote NAO
// basta: outra automacao pode cobrar os mesmos R$ 30.

export function ehDescricaoSisprof(texto) {
    return /sis\s*prof/i.test(String(texto || ''));
}

// O id da assinatura (preapproval) que gerou uma cobranca mensal do cartao.
export function idDaAssinaturaDoPagamento(pagamento) {
    const dados = (pagamento && pagamento.point_of_interaction
                   && pagamento.point_of_interaction.transaction_data) || {};
    const meta = (pagamento && pagamento.metadata) || {};
    return String(dados.subscription_id || meta.preapproval_id || meta.subscription_id || '');
}

// `contexto`: { planosSisprof: [ids], conhecidas: Set de preapprovalIds do banco,
//               buscarNoMp, _cache }
export async function pagamentoEhDoSisprof(pagamento, contexto) {
    if (!pagamento) return false;
    if (lerReferenciaPix(pagamento.external_reference)) return true;
    if (ehDescricaoSisprof(pagamento.description)) return true;

    const idAssinatura = idDaAssinaturaDoPagamento(pagamento);
    if (!idAssinatura) return false;
    const ctx = contexto || {};
    if (ctx.conhecidas && ctx.conhecidas.has(idAssinatura)) return true;
    if (!ctx.buscarNoMp) return false;

    ctx._cache = ctx._cache || {};
    if (!(idAssinatura in ctx._cache)) {
        let nossa = false;
        try {
            const pre = await ctx.buscarNoMp('/preapproval/' + encodeURIComponent(idAssinatura));
            const planos = (ctx.planosSisprof || []).filter(Boolean);
            nossa = !!pre && ((pre.preapproval_plan_id && planos.indexOf(pre.preapproval_plan_id) !== -1)
                              || ehDescricaoSisprof(pre.reason));
        } catch (e) {
            console.warn('[financeiro] nao consegui consultar a assinatura', idAssinatura, e && e.message);
        }
        ctx._cache[idAssinatura] = nossa;
    }
    return ctx._cache[idAssinatura];
}

// Uma assinatura (preapproval) e' do SisProf? Mesmos criterios: o plano e' um dos
// nossos (MP_PLANO_*), o nome leva "SisProf", ou ela ja' esta' no nosso banco.
export function assinaturaEhDoSisprof(preapproval, contexto) {
    if (!preapproval) return false;
    const ctx = contexto || {};
    const planos = (ctx.planosSisprof || []).filter(Boolean);
    if (preapproval.preapproval_plan_id && planos.indexOf(String(preapproval.preapproval_plan_id)) !== -1) return true;
    if (ehDescricaoSisprof(preapproval.reason)) return true;
    return !!(ctx.conhecidas && ctx.conhecidas.has(String(preapproval.id || '')));
}

// O contexto a partir do ambiente e do banco. `listar` e' opcional: sem ele, as
// assinaturas so' sao reconhecidas pelo id ou nome do plano.
export async function montarContextoSisprof(ambiente, ferramentas) {
    const conhecidas = new Set();
    if (ferramentas && ferramentas.listar) {
        try {
            for (const colecao of ['assinaturas', 'assinaturas_sem_dono']) {
                let pagina = '';
                do {
                    const lote = await ferramentas.listar(colecao, pagina);
                    pagina = lote.proximaPagina;
                    lote.documentos.forEach(d => {
                        if (!d.preapprovalId) return;
                        // Em assinaturas_sem_dono so' vale o que o super admin vinculou:
                        // o resto pode ser justamente a assinatura de outra automacao.
                        if (colecao === 'assinaturas' || d.uidAtribuido) conhecidas.add(String(d.preapprovalId));
                    });
                } while (pagina);
            }
        } catch (e) {
            console.warn('[financeiro] nao consegui ler as assinaturas conhecidas:', e && e.message);
        }
    }
    return {
        planosSisprof: [ambiente && ambiente.MP_PLANO_APOIASE_ID, ambiente && ambiente.MP_PLANO_PROFESSOR_ID]
            .filter(Boolean).map(String),
        conhecidas: conhecidas,
        buscarNoMp: ferramentas && ferramentas.buscarNoMp
    };
}

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
    } else if (metodo === 'pix' && ehDescricaoSisprof(pagamento.description)) {
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

// Grava uma linha — so' se o pagamento for do SisProf. O que nao e' (e foi gravado
// pela versao antiga, que pegava tudo) e' APAGADO: buscar de novo o mesmo periodo
// limpa o livro. Nunca estoura: o livro e' contabilidade, e uma falha aqui nao pode
// impedir que o professor receba o plano que pagou.
export async function registrarEntrada(pagamento, pacotes, ferramentas, contexto) {
    try {
        const id = String((pagamento && pagamento.id) || '');
        if (!id) return 'ignorado';
        if (!(await pagamentoEhDoSisprof(pagamento, contexto))) {
            if (ferramentas.apagar) await ferramentas.apagar('financeiro_entradas/' + id);
            return 'de-fora';
        }
        const entrada = montarEntradaFinanceira(pagamento, pacotes);
        if (!entrada) return 'ignorado';
        await ferramentas.gravar('financeiro_entradas/' + entrada.id, entrada);
        return 'gravado';
    } catch (e) {
        console.warn('[financeiro] nao consegui registrar o pagamento', pagamento && pagamento.id,
                     e && e.message);
        return 'falhou';
    }
}

// Puxa do Mercado Pago os pagamentos de um periodo e grava no livro o que e' do SisProf.
export async function sincronizarLivroCaixa(dias, pacotes, ferramentas, contexto) {
    const { buscarNoMp } = ferramentas;
    const periodo = Math.max(1, Math.min(Math.round(Number(dias) || 35), 400));
    const relatorio = { dias: periodo, lidos: 0, gravados: 0, deFora: 0 };
    const ctx = contexto || { buscarNoMp: buscarNoMp };

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
            const r = await registrarEntrada(pagamento, pacotes, ferramentas, ctx);
            if (r === 'gravado') relatorio.gravados++;
            else if (r === 'de-fora') relatorio.deFora++;
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
