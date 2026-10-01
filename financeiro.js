// GESTAO FINANCEIRA — a tela do super admin que junta o que entrou e o que se gasta.
//
// ENTRADAS: vem de `financeiro_entradas/`, o livro-caixa que o servico da pasta
//   assinatura/ grava a partir do Mercado Pago (ver assinatura/financeiro.mjs). Nada
//   aqui digita entrada: dinheiro que entrou e' o que o Mercado Pago diz que entrou.
//   O botao "Buscar no Mercado Pago" pede ao servico para puxar um periodo.
//
// CUSTOS: cadastrados a mao em `financeiro_custos/` — assinatura de IA, dominio,
//   servidor. Cada um com recorrencia (mensal, anual, unica) e moeda (custo em dolar
//   usa a cotacao guardada em `financeiro_config/geral`).
//
// A VISAO E' DE CAIXA: custo anual pesa no mes em que e' cobrado, nao dividido por 12
// (a tabela de custos mostra o "equivalente mensal" para comparar). E' o que bate com
// o extrato do banco, que e' onde o super admin vai conferir.
//
// As Regras so' deixam o super admin ler e escrever estas colecoes.

// ----------------------------------------------------------------------------
// Contas (funcoes puras — testadas em testes/teste-financeiro.js)
// ----------------------------------------------------------------------------

const RECORRENCIAS_FIN = {
    mensal: 'Mensal',
    anual: 'Anual',
    unica: 'Única'
};

const CATEGORIAS_CUSTO_FIN = ['IA', 'Domínio', 'Servidor/Hospedagem', 'Banco de dados', 'Ferramentas', 'Impostos/Taxas', 'Outros'];

// "2026-10" -> "2026-09" (passo negativo) ou "2026-11".
function somarMesesFin(mes, passo) {
    const [a, m] = String(mes).split('-').map(Number);
    const d = new Date(Date.UTC(a, (m - 1) + passo, 1));
    return d.toISOString().slice(0, 7);
}

function mesAtualFin(agoraMs) {
    // Horario de Brasilia, o mesmo do livro-caixa.
    return new Date((agoraMs || Date.now()) - 3 * 3600000).toISOString().slice(0, 7);
}

function valorEmReais(custo, cotacaoDolar) {
    const v = Number(custo && custo.valor) || 0;
    if (custo && custo.moeda === 'USD') return v * (Number(cotacaoDolar) || 0);
    return v;
}

// Quanto este custo pesa no caixa do mes.
function custoNoMes(custo, mes, cotacaoDolar) {
    if (!custo || custo.ativo === false) return 0;
    const inicio = String(custo.inicio || '');
    const fim = String(custo.fim || '');
    if (!inicio || mes < inicio) return 0;
    if (fim && mes > fim) return 0;
    const valor = valorEmReais(custo, cotacaoDolar);
    if (custo.recorrencia === 'anual') return mes.slice(5, 7) === inicio.slice(5, 7) ? valor : 0;
    if (custo.recorrencia === 'unica') return mes === inicio ? valor : 0;
    return valor; // mensal
}

// Para comparar custos de recorrencia diferente na mesma regua.
function custoMensalEquivalente(custo, cotacaoDolar) {
    const valor = valorEmReais(custo, cotacaoDolar);
    if (custo.recorrencia === 'anual') return valor / 12;
    if (custo.recorrencia === 'unica') return 0;
    return valor;
}

// O resumo de um mes: o que entrou (bruto, taxa, liquido), o que voltou (estorno) e
// o que se gastou.
function resumoDoMes(mes, entradas, custos, cotacaoDolar) {
    const doMes = (entradas || []).filter(e => e && e.mes === mes);
    const aprovadas = doMes.filter(e => e.status === 'approved');
    const soma = (lista, campo) => lista.reduce((t, e) => t + (Number(e[campo]) || 0), 0);
    const estornos = doMes.filter(e => e.status === 'refunded' || e.status === 'charged_back');
    const custosDoMes = (custos || []).map(c => ({ custo: c, valor: custoNoMes(c, mes, cotacaoDolar) }))
        .filter(x => x.valor > 0);
    const bruto = soma(aprovadas, 'valor');
    const taxas = soma(aprovadas, 'taxa');
    const liquido = soma(aprovadas, 'liquido');
    const totalCustos = custosDoMes.reduce((t, x) => t + x.valor, 0);
    return {
        mes: mes,
        quantidade: aprovadas.length,
        bruto: bruto,
        taxas: taxas,
        liquido: liquido,
        estornos: soma(estornos, 'valor'),
        quantidadeEstornos: estornos.length,
        custos: totalCustos,
        custosDoMes: custosDoMes,
        resultado: liquido - totalCustos,
        porCategoria: {
            assinatura: soma(aprovadas.filter(e => e.categoria === 'assinatura'), 'liquido'),
            pix: soma(aprovadas.filter(e => e.categoria === 'pix'), 'liquido'),
            outro: soma(aprovadas.filter(e => e.categoria !== 'assinatura' && e.categoria !== 'pix'), 'liquido')
        }
    };
}

// Quem esta' pagando agora, a partir de `assinaturas/` (a mesma regra do app: ativa e
// dentro do prazo, com a carencia).
function resumoAssinantes(assinaturas, agoraMs, diasTolerancia) {
    const agora = agoraMs || Date.now();
    const carencia = (isFinite(Number(diasTolerancia)) ? Number(diasTolerancia) : 5) * 86400000;
    const r = { apoiase: 0, professor: 0, cortesia: 0, recorrenteMensal: 0 };
    (assinaturas || []).forEach(a => {
        if (!a || a.status !== 'ativa') return;
        const v1 = Date.parse(a.validoAte || '');
        const v2 = Date.parse(a.proximaCobranca || '');
        const vence = Math.max(isFinite(v1) ? v1 : 0, isFinite(v2) ? v2 : 0);
        if (vence && agora > vence + carencia) return;
        if (a.origem === 'cortesia') { r.cortesia++; return; }
        if (a.plano === 'professor') r.professor++;
        else if (a.plano === 'apoiase') r.apoiase++;
        else return;
        if (a.origem === 'mercadopago') r.recorrenteMensal += Number(a.valor) || 0;
    });
    return r;
}

function dinheiroFin(n) {
    const v = Number(n) || 0;
    return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function nomeDoMesFin(mes) {
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const [a, m] = String(mes).split('-');
    return (nomes[Number(m) - 1] || m) + '/' + a;
}

function escaparFin(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ----------------------------------------------------------------------------
// Estado da tela
// ----------------------------------------------------------------------------

const _fin = {
    mes: '',
    entradas: [],
    custos: [],
    assinaturas: [],
    config: { cotacaoDolar: 5.5 },
    diasTolerancia: 5,
    editandoCustoId: '',
    carregado: false
};

const MESES_NO_HISTORICO_FIN = 12;

async function carregarDadosFinanceiros() {
    if (typeof db === 'undefined' || !db) throw new Error('banco nao conectado');
    const inicio = somarMesesFin(mesAtualFin(), -(MESES_NO_HISTORICO_FIN - 1));
    const desde = _fin.mes && _fin.mes < inicio ? _fin.mes : inicio;

    const [entradas, custos, config, assinaturas, publico] = await Promise.all([
        db.collection('financeiro_entradas').where('mes', '>=', desde).get(),
        db.collection('financeiro_custos').get(),
        db.collection('financeiro_config').doc('geral').get(),
        db.collection('assinaturas').get().catch(() => null),
        db.collection('assinaturas_config').doc('publico').get().catch(() => null)
    ]);
    _fin.entradas = [];
    entradas.forEach(d => _fin.entradas.push(Object.assign({ _id: d.id }, d.data())));
    _fin.custos = [];
    custos.forEach(d => _fin.custos.push(Object.assign({ id: d.id }, d.data())));
    _fin.custos.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    _fin.config = Object.assign({ cotacaoDolar: 5.5 }, config.exists ? config.data() : {});
    _fin.assinaturas = [];
    if (assinaturas) assinaturas.forEach(d => _fin.assinaturas.push(d.data()));
    const pub = publico && publico.exists ? publico.data() : {};
    _fin.diasTolerancia = isFinite(Number(pub.diasTolerancia)) ? Number(pub.diasTolerancia) : 5;
    _fin.servico = String(pub.servico || '');
    _fin.carregado = true;
}

// ----------------------------------------------------------------------------
// Navegacao (o mesmo padrao das Chaves de IA)
// ----------------------------------------------------------------------------

function renderFinanceiroNav() {
    const container = document.querySelector('#adminContainer .container');
    if (container && !document.getElementById('adminFinanceiroScreen')) {
        const div = document.createElement('div');
        div.id = 'adminFinanceiroScreen';
        div.style.display = 'none';
        container.appendChild(div);
    }
    const header = document.querySelector('#adminContainer header div');
    if (!header || document.getElementById('btnNavFinanceiro')) return;
    const btn = document.createElement('button');
    btn.id = 'btnNavFinanceiro';
    btn.className = 'btn btn-secondary';
    btn.style.marginRight = '10px';
    btn.textContent = '💰 Financeiro';
    btn.onclick = () => abrirTelaFinanceira();
    header.insertBefore(btn, header.lastElementChild); // Antes do Sair
}

async function abrirTelaFinanceira() {
    ['adminEscolasScreen', 'adminEscolaDetalheScreen', 'adminBackupScreen', 'adminChavesIAScreen']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    renderFinanceiroNav();
    const tela = document.getElementById('adminFinanceiroScreen');
    if (!tela) return;
    tela.style.display = 'block';
    if (!_fin.mes) _fin.mes = mesAtualFin();
    tela.innerHTML = '<div class="card" style="margin-top:20px;"><p style="color:#5f6b7f;">Carregando o financeiro...</p></div>';
    try {
        await carregarDadosFinanceiros();
        renderTelaFinanceira();
    } catch (e) {
        tela.innerHTML = `<div class="card" style="margin-top:20px; border-left:5px solid #e53e3e;">
            <h2>💰 Financeiro</h2>
            <p>Não consegui carregar: ${escaparFin(e && e.message ? e.message : e)}</p>
            <p style="font-size:12px; color:#5f6b7f;">Se a mensagem fala em permissão, falta publicar a versão nova de
            <code>firestore.rules</code> (blocos <code>financeiro_*</code>) no Console do Firebase — ou a sessão do
            Firebase expirou: saia e entre de novo.</p>
        </div>`;
    }
}

// ----------------------------------------------------------------------------
// A tela
// ----------------------------------------------------------------------------

function cartaoNumeroFin(rotulo, valor, detalhe, cor) {
    return `<div style="flex:1; min-width:150px; border:1px solid #e3e8ef; border-radius:10px; padding:12px 14px; background:#fff;">
        <div style="font-size:12px; color:#5f6b7f;">${rotulo}</div>
        <div style="font-size:21px; font-weight:bold; color:${cor || '#1c2536'}; margin-top:2px; font-variant-numeric:tabular-nums;">${valor}</div>
        ${detalhe ? `<div style="font-size:11px; color:#5f6b7f; margin-top:2px;">${detalhe}</div>` : ''}
    </div>`;
}

function renderTelaFinanceira() {
    const tela = document.getElementById('adminFinanceiroScreen');
    if (!tela) return;
    const cot = Number(_fin.config.cotacaoDolar) || 0;
    const r = resumoDoMes(_fin.mes, _fin.entradas, _fin.custos, cot);
    const ass = resumoAssinantes(_fin.assinaturas, Date.now(), _fin.diasTolerancia);
    const custoMensalFixo = _fin.custos.filter(c => c.ativo !== false)
        .reduce((t, c) => t + custoMensalEquivalente(c, cot), 0);

    // Opcoes do seletor: os ultimos 24 meses.
    const atual = mesAtualFin();
    const opcoes = [];
    for (let i = 0; i < 24; i++) opcoes.push(somarMesesFin(atual, -i));

    tela.innerHTML = `
        <style>
            /* Valor partido em duas linhas ("R$" / "127,10") nao se le; a tabela rola de lado. */
            #adminFinanceiroScreen td, #adminFinanceiroScreen th { white-space: nowrap; }
            /* O CSS global estica todo select a 100%; aqui eles ficam do tamanho do conteudo. */
            #adminFinanceiroScreen select { width: auto; min-width: 72px; }
            #adminFinanceiroScreen #finCustoRecorrencia { min-width: 100px; }
        </style>
        <div class="card" style="margin-top:20px; border-left:5px solid #38a169;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <h2 style="margin:0;">💰 Gestão financeira</h2>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <select id="finMes" onchange="mudarMesFinanceiro(this.value)" style="padding:7px; border:1px solid #cdd5e1; border-radius:6px;">
                        ${opcoes.map(m => `<option value="${m}" ${m === _fin.mes ? 'selected' : ''}>${nomeDoMesFin(m)}</option>`).join('')}
                    </select>
                    <select id="finDiasBusca" style="padding:7px; border:1px solid #cdd5e1; border-radius:6px;" title="Período a buscar no Mercado Pago">
                        <option value="35">últimos 35 dias</option>
                        <option value="95">últimos 3 meses</option>
                        <option value="370">últimos 12 meses</option>
                    </select>
                    <button class="btn btn-primary" id="btnBuscarMpFin" onclick="buscarEntradasNoMercadoPago()">🔄 Buscar no Mercado Pago</button>
                    <button class="btn btn-secondary" onclick="exportarFinanceiroCsv()">⬇️ CSV do mês</button>
                </div>
            </div>
            <p style="font-size:12px; color:#5f6b7f; margin:8px 0 0 0;">
                Entradas vêm do Mercado Pago (o serviço grava cada pagamento sozinho; o botão acima busca o que faltar).
                Visão de caixa: custo anual entra no mês em que é cobrado.
            </p>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
                ${cartaoNumeroFin('Entradas (bruto)', dinheiroFin(r.bruto), r.quantidade + ' pagamento(s)')}
                ${cartaoNumeroFin('Taxas do Mercado Pago', dinheiroFin(-r.taxas), r.bruto ? ((r.taxas / r.bruto) * 100).toFixed(1).replace('.', ',') + '% do bruto' : '', '#c05621')}
                ${cartaoNumeroFin('Entradas líquidas', dinheiroFin(r.liquido), 'Cartão ' + dinheiroFin(r.porCategoria.assinatura) + ' · Pix ' + dinheiroFin(r.porCategoria.pix) + (r.porCategoria.outro ? ' · Outros ' + dinheiroFin(r.porCategoria.outro) : ''))}
                ${cartaoNumeroFin('Custos do mês', dinheiroFin(-r.custos), r.custosDoMes.length + ' lançamento(s)', '#c53030')}
                ${cartaoNumeroFin('Resultado', dinheiroFin(r.resultado), r.estornos ? 'Estornos no mês: ' + dinheiroFin(r.estornos) : '', r.resultado >= 0 ? '#2f855a' : '#c53030')}
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                ${cartaoNumeroFin('Assinantes pagantes agora', String(ass.professor + ass.apoiase), '🎓 Professor ' + ass.professor + ' · 🤝 Apoia-se ' + ass.apoiase + (ass.cortesia ? ' · cortesia ' + ass.cortesia : ''))}
                ${cartaoNumeroFin('Receita recorrente (cartão)', dinheiroFin(ass.recorrenteMensal) + '<span style="font-size:12px; font-weight:normal;">/mês</span>', 'bruto, antes das taxas')}
                ${cartaoNumeroFin('Custo mensal equivalente', dinheiroFin(-custoMensalFixo), 'custos ativos, anual ÷ 12', '#c53030')}
            </div>
        </div>

        ${historicoFinHtml(cot)}
        ${entradasFinHtml(r)}
        ${custosFinHtml(cot)}
    `;
}

function historicoFinHtml(cot) {
    const linhas = [];
    for (let i = MESES_NO_HISTORICO_FIN - 1; i >= 0; i--) {
        linhas.push(resumoDoMes(somarMesesFin(mesAtualFin(), -i), _fin.entradas, _fin.custos, cot));
    }
    const maior = Math.max(1, ...linhas.map(l => Math.max(l.liquido, l.custos)));
    const barra = (v, cor) => `<div style="height:7px; border-radius:4px; background:${cor}; width:${Math.max(0, Math.round((v / maior) * 100))}%; min-width:${v > 0 ? 2 : 0}px;"></div>`;
    const totalLiq = linhas.reduce((t, l) => t + l.liquido, 0);
    const totalCus = linhas.reduce((t, l) => t + l.custos, 0);

    return `<div class="card" style="margin-top:16px;">
        <h3 style="margin:0 0 10px; font-size:16px;">Últimos ${MESES_NO_HISTORICO_FIN} meses</h3>
        <div style="overflow-x:auto;">
        <table style="width:100%; font-variant-numeric:tabular-nums;">
            <thead><tr><th>Mês</th><th style="text-align:right;">Líquido</th><th style="text-align:right;">Custos</th><th style="text-align:right;">Resultado</th><th style="width:30%;"></th></tr></thead>
            <tbody>
                ${linhas.map(l => `<tr style="cursor:pointer; ${l.mes === _fin.mes ? 'background:#f0fff4;' : ''}" onclick="mudarMesFinanceiro('${l.mes}')">
                    <td>${nomeDoMesFin(l.mes)}</td>
                    <td style="text-align:right;">${dinheiroFin(l.liquido)}</td>
                    <td style="text-align:right; color:#c53030;">${dinheiroFin(-l.custos)}</td>
                    <td style="text-align:right; font-weight:bold; color:${l.resultado >= 0 ? '#2f855a' : '#c53030'};">${dinheiroFin(l.resultado)}</td>
                    <td>${barra(l.liquido, '#38a169')}<div style="height:3px;"></div>${barra(l.custos, '#e53e3e')}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr style="font-weight:bold;">
                <td>Total</td>
                <td style="text-align:right;">${dinheiroFin(totalLiq)}</td>
                <td style="text-align:right; color:#c53030;">${dinheiroFin(-totalCus)}</td>
                <td style="text-align:right; color:${totalLiq - totalCus >= 0 ? '#2f855a' : '#c53030'};">${dinheiroFin(totalLiq - totalCus)}</td>
                <td style="font-size:11px; color:#5f6b7f; font-weight:normal;">🟩 líquido &nbsp; 🟥 custos</td>
            </tr></tfoot>
        </table>
        </div>
    </div>`;
}

const ROTULO_CATEGORIA_FIN = { assinatura: '💳 Cartão', pix: '📱 Pix', outro: 'Outro' };
const ROTULO_STATUS_FIN = { approved: '', refunded: 'estornado', charged_back: 'contestado' };

function entradasFinHtml(r) {
    const lista = _fin.entradas.filter(e => e.mes === _fin.mes)
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    const nomePlano = (p) => p === 'professor' ? '🎓 Professor' : (p === 'apoiase' ? '🤝 Apoia-se' : '—');
    const corpo = lista.length ? lista.map(e => {
        const estornado = e.status !== 'approved';
        const quando = String(e.data || '').slice(0, 10).split('-').reverse().join('/');
        return `<tr style="${estornado ? 'opacity:0.55; text-decoration:line-through;' : ''}">
            <td>${quando}</td>
            <td>${ROTULO_CATEGORIA_FIN[e.categoria] || escaparFin(e.categoria)}${ROTULO_STATUS_FIN[e.status] ? ' <span class="badge badge-danger" style="text-decoration:none;">' + ROTULO_STATUS_FIN[e.status] + '</span>' : ''}</td>
            <td>${nomePlano(e.plano)}${e.categoria === 'pix' && e.meses ? ' · ' + e.meses + ' mês(es)' : ''}</td>
            <td style="font-size:12px;">${escaparFin(e.email || '—')}</td>
            <td style="text-align:right;">${dinheiroFin(e.valor)}</td>
            <td style="text-align:right; color:#c05621;">${dinheiroFin(-(Number(e.taxa) || 0))}</td>
            <td style="text-align:right; font-weight:bold;">${dinheiroFin(e.liquido)}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center; color:#5f6b7f; padding:16px;">
        Nenhuma entrada registrada em ${nomeDoMesFin(_fin.mes)}. Se houve pagamento, use "Buscar no Mercado Pago".</td></tr>`;

    return `<div class="card" style="margin-top:16px;">
        <h3 style="margin:0 0 10px; font-size:16px;">Entradas de ${nomeDoMesFin(_fin.mes)}</h3>
        <div style="overflow-x:auto;">
        <table style="width:100%; font-variant-numeric:tabular-nums;">
            <thead><tr><th>Data</th><th>Meio</th><th>Plano</th><th>Pagador</th><th style="text-align:right;">Bruto</th><th style="text-align:right;">Taxa</th><th style="text-align:right;">Líquido</th></tr></thead>
            <tbody>${corpo}</tbody>
        </table>
        </div>
    </div>`;
}

function custosFinHtml(cot) {
    const editando = _fin.custos.find(c => c.id === _fin.editandoCustoId) || null;
    const v = (campo, padrao) => escaparFin(editando ? (editando[campo] == null ? '' : editando[campo]) : padrao);
    const corpo = _fin.custos.length ? _fin.custos.map(c => {
        const noMes = custoNoMes(c, _fin.mes, cot);
        const valorOriginal = (c.moeda === 'USD' ? 'US$ ' + (Number(c.valor) || 0).toFixed(2) : dinheiroFin(c.valor));
        const periodo = nomeDoMesFin(c.inicio || '') + (c.fim ? ' → ' + nomeDoMesFin(c.fim) : ' → sem fim');
        return `<tr style="${c.ativo === false ? 'opacity:0.5;' : ''}">
            <td><strong>${escaparFin(c.nome)}</strong>${c.obs ? '<br><span style="font-size:11px; color:#5f6b7f;">' + escaparFin(c.obs) + '</span>' : ''}</td>
            <td>${escaparFin(c.categoria || '')}</td>
            <td style="text-align:right;">${valorOriginal}</td>
            <td>${RECORRENCIAS_FIN[c.recorrencia] || 'Mensal'}</td>
            <td style="font-size:12px;">${c.recorrencia === 'unica' ? nomeDoMesFin(c.inicio || '') : periodo}</td>
            <td style="text-align:right;">${c.recorrencia === 'unica' ? '—' : dinheiroFin(custoMensalEquivalente(c, cot))}</td>
            <td style="text-align:right; color:${noMes ? '#c53030' : '#a0aec0'};">${noMes ? dinheiroFin(-noMes) : '—'}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-secondary" onclick="editarCustoFinanceiro('${escaparFin(c.id)}')" title="Editar">✏️</button>
                <button class="btn btn-sm ${c.ativo === false ? 'btn-success' : 'btn-secondary'}" onclick="alternarCustoFinanceiro('${escaparFin(c.id)}')" title="${c.ativo === false ? 'Reativar' : 'Pausar (deixa de contar)'}">${c.ativo === false ? '▶️' : '⏸️'}</button>
                <button class="btn btn-sm btn-danger" onclick="excluirCustoFinanceiro('${escaparFin(c.id)}')" title="Excluir">🗑️</button>
            </td>
        </tr>`;
    }).join('') : `<tr><td colspan="8" style="text-align:center; color:#5f6b7f; padding:16px;">
        Nenhum custo cadastrado. Comece pela assinatura de IA e pelo domínio.</td></tr>`;

    const campo = 'padding:8px; border:1px solid #cdd5e1; border-radius:4px;';
    const rotulo = 'display:block; font-size:12px; font-weight:bold; margin-bottom:4px;';
    const recorrenciaAtual = editando ? editando.recorrencia : 'mensal';
    const moedaAtual = editando ? editando.moeda : 'BRL';
    const categoriaAtual = editando ? editando.categoria : 'IA';

    return `<div class="card" style="margin-top:16px; border-left:5px solid #e53e3e;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <h3 style="margin:0; font-size:16px;">Custos da operação</h3>
            <div style="display:flex; gap:6px; align-items:center; font-size:13px;">
                <label for="finCotacao">Cotação do dólar: R$</label>
                <input type="number" id="finCotacao" step="0.01" min="0" value="${escaparFin(_fin.config.cotacaoDolar)}" style="${campo} width:90px;">
                <button class="btn btn-sm btn-secondary" onclick="salvarCotacaoFinanceiro()">Salvar</button>
            </div>
        </div>
        <div style="overflow-x:auto; margin-top:10px;">
        <table style="width:100%; font-variant-numeric:tabular-nums;">
            <thead><tr><th>Custo</th><th>Categoria</th><th style="text-align:right;">Valor</th><th>Recorrência</th><th>Período</th><th style="text-align:right;">Equiv./mês</th><th style="text-align:right;">Em ${nomeDoMesFin(_fin.mes)}</th><th></th></tr></thead>
            <tbody>${corpo}</tbody>
        </table>
        </div>

        <div style="margin-top:16px; padding-top:14px; border-top:1px solid #e3e8ef;">
            <strong style="font-size:14px;">${editando ? '✏️ Editando: ' + escaparFin(editando.nome) : '+ Novo custo'}</strong>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:8px;">
                <div style="flex:2; min-width:180px;">
                    <label style="${rotulo}" for="finCustoNome">Nome</label>
                    <input type="text" id="finCustoNome" value="${v('nome', '')}" placeholder="Ex: Assinatura Claude, Domínio sisprof.com.br" style="${campo} width:100%;">
                </div>
                <div>
                    <label style="${rotulo}" for="finCustoCategoria">Categoria</label>
                    <select id="finCustoCategoria" style="${campo}">
                        ${CATEGORIAS_CUSTO_FIN.map(c => `<option ${c === categoriaAtual ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="${rotulo}" for="finCustoValor">Valor</label>
                    <div style="display:flex; gap:4px;">
                        <select id="finCustoMoeda" style="${campo}">
                            <option value="BRL" ${moedaAtual !== 'USD' ? 'selected' : ''}>R$</option>
                            <option value="USD" ${moedaAtual === 'USD' ? 'selected' : ''}>US$</option>
                        </select>
                        <input type="number" id="finCustoValor" step="0.01" min="0" value="${v('valor', '')}" style="${campo} width:110px;">
                    </div>
                </div>
                <div>
                    <label style="${rotulo}" for="finCustoRecorrencia">Recorrência</label>
                    <select id="finCustoRecorrencia" style="${campo}">
                        ${Object.keys(RECORRENCIAS_FIN).map(k => `<option value="${k}" ${k === recorrenciaAtual ? 'selected' : ''}>${RECORRENCIAS_FIN[k]}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="${rotulo}" for="finCustoInicio" title="Anual: o mês em que é cobrado todo ano. Única: o mês do pagamento.">Começa em</label>
                    <input type="month" id="finCustoInicio" value="${v('inicio', _fin.mes)}" style="${campo}">
                </div>
                <div>
                    <label style="${rotulo}" for="finCustoFim">Termina em <span style="font-weight:normal;">(opcional)</span></label>
                    <input type="month" id="finCustoFim" value="${v('fim', '')}" style="${campo}">
                </div>
                <div style="flex:1; min-width:160px;">
                    <label style="${rotulo}" for="finCustoObs">Observação</label>
                    <input type="text" id="finCustoObs" value="${v('obs', '')}" placeholder="Ex: plano Max, cartão final 1234" style="${campo} width:100%;">
                </div>
                <button class="btn btn-primary" onclick="salvarCustoFinanceiro()">${editando ? '💾 Salvar alteração' : '+ Adicionar'}</button>
                ${editando ? '<button class="btn btn-secondary" onclick="cancelarEdicaoCustoFinanceiro()">Cancelar</button>' : ''}
            </div>
            <p style="font-size:11px; color:#5f6b7f; margin:8px 0 0 0;">
                Custo em dólar é convertido pela cotação acima. Anual pesa no mês de cobrança (o mês de "Começa em", todo ano).
                Para um custo que mudou de preço, ponha "Termina em" no antigo e cadastre o novo — o histórico continua certo.
            </p>
        </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// Acoes
// ----------------------------------------------------------------------------

async function mudarMesFinanceiro(mes) {
    const precisaBuscarMais = mes < somarMesesFin(mesAtualFin(), -(MESES_NO_HISTORICO_FIN - 1))
        && !_fin.entradas.some(e => e.mes === mes);
    _fin.mes = mes;
    if (precisaBuscarMais) {
        try { await carregarDadosFinanceiros(); } catch (e) { console.warn('[Financeiro]', e); }
    }
    renderTelaFinanceira();
}

async function buscarEntradasNoMercadoPago() {
    if (!_fin.servico) {
        alert('O endereço do serviço não está cadastrado (Painel > 💳 Assinaturas > Endereço do serviço).');
        return;
    }
    const botao = document.getElementById('btnBuscarMpFin');
    const dias = Number((document.getElementById('finDiasBusca') || {}).value) || 35;
    if (botao) { botao.disabled = true; botao.textContent = 'Buscando...'; }
    try {
        const cracha = (typeof pegarCrachaDaSessao === 'function') ? await pegarCrachaDaSessao() : '';
        if (!cracha) {
            alert('Sem sessão do Firebase. Saia e entre de novo para buscar no Mercado Pago.');
            return;
        }
        const resposta = await fetch(_fin.servico.replace(/\/$/, '') + '/financeiro', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + cracha, 'content-type': 'application/json' },
            body: JSON.stringify({ dias: dias })
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            alert('O serviço recusou: ' + (dados.erro || resposta.status) +
                  (resposta.status === 404 ? '\n\nO serviço publicado ainda é a versão antiga — faça o deploy da pasta assinatura/.' : ''));
            return;
        }
        await carregarDadosFinanceiros();
        renderTelaFinanceira();
        alert('Mercado Pago consultado: ' + dados.lidos + ' pagamento(s) lido(s), ' +
              dados.gravados + ' no livro-caixa.');
    } catch (e) {
        alert('Não consegui falar com o serviço (' + _fin.servico + '): ' + (e && e.message ? e.message : e));
    } finally {
        const b = document.getElementById('btnBuscarMpFin');
        if (b) { b.disabled = false; b.textContent = '🔄 Buscar no Mercado Pago'; }
    }
}

function lerFormularioCustoFin() {
    const val = (id) => String((document.getElementById(id) || {}).value || '').trim();
    return {
        nome: val('finCustoNome'),
        categoria: val('finCustoCategoria') || 'Outros',
        moeda: val('finCustoMoeda') === 'USD' ? 'USD' : 'BRL',
        valor: Math.round((Number(val('finCustoValor').replace(',', '.')) || 0) * 100) / 100,
        recorrencia: RECORRENCIAS_FIN[val('finCustoRecorrencia')] ? val('finCustoRecorrencia') : 'mensal',
        inicio: val('finCustoInicio'),
        fim: val('finCustoFim'),
        obs: val('finCustoObs')
    };
}

async function salvarCustoFinanceiro() {
    const custo = lerFormularioCustoFin();
    if (!custo.nome) { alert('Dê um nome ao custo.'); return; }
    if (!(custo.valor > 0)) { alert('Informe um valor maior que zero.'); return; }
    if (!/^\d{4}-\d{2}$/.test(custo.inicio)) { alert('Informe o mês em que o custo começa.'); return; }
    if (custo.fim && custo.fim < custo.inicio) { alert('"Termina em" não pode ser antes de "Começa em".'); return; }

    const id = _fin.editandoCustoId || ('custo_' + Date.now());
    const anterior = _fin.custos.find(c => c.id === id);
    const doc = Object.assign({}, custo, {
        ativo: anterior ? anterior.ativo !== false : true,
        criadoEm: (anterior && anterior.criadoEm) || new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: (typeof currentUser !== 'undefined' && currentUser && currentUser.email) || 'super_admin'
    });
    try {
        await db.collection('financeiro_custos').doc(id).set(doc);
        _fin.editandoCustoId = '';
        await carregarDadosFinanceiros();
        renderTelaFinanceira();
    } catch (e) {
        alert('Não consegui salvar o custo: ' + (e && e.message ? e.message : e));
    }
}

function editarCustoFinanceiro(id) {
    _fin.editandoCustoId = id;
    renderTelaFinanceira();
    const campo = document.getElementById('finCustoNome');
    if (campo) { campo.scrollIntoView({ behavior: 'smooth', block: 'center' }); campo.focus(); }
}

function cancelarEdicaoCustoFinanceiro() {
    _fin.editandoCustoId = '';
    renderTelaFinanceira();
}

async function alternarCustoFinanceiro(id) {
    const custo = _fin.custos.find(c => c.id === id);
    if (!custo) return;
    try {
        await db.collection('financeiro_custos').doc(id).set({
            ativo: custo.ativo === false, atualizadoEm: new Date().toISOString()
        }, { merge: true });
        await carregarDadosFinanceiros();
        renderTelaFinanceira();
    } catch (e) {
        alert('Não consegui alterar: ' + (e && e.message ? e.message : e));
    }
}

async function excluirCustoFinanceiro(id) {
    const custo = _fin.custos.find(c => c.id === id);
    if (!custo) return;
    if (!confirm('Excluir o custo "' + custo.nome + '"?\n\nEle some de TODOS os meses, inclusive os passados. ' +
                 'Se ele só deixou de existir, prefira editar e preencher "Termina em".')) return;
    try {
        await db.collection('financeiro_custos').doc(id).delete();
        if (_fin.editandoCustoId === id) _fin.editandoCustoId = '';
        await carregarDadosFinanceiros();
        renderTelaFinanceira();
    } catch (e) {
        alert('Não consegui excluir: ' + (e && e.message ? e.message : e));
    }
}

async function salvarCotacaoFinanceiro() {
    const valor = Number(String((document.getElementById('finCotacao') || {}).value || '').replace(',', '.'));
    if (!(valor > 0)) { alert('Informe uma cotação maior que zero.'); return; }
    try {
        await db.collection('financeiro_config').doc('geral').set({
            cotacaoDolar: Math.round(valor * 10000) / 10000,
            atualizadoEm: new Date().toISOString()
        }, { merge: true });
        _fin.config.cotacaoDolar = valor;
        renderTelaFinanceira();
    } catch (e) {
        alert('Não consegui salvar a cotação: ' + (e && e.message ? e.message : e));
    }
}

// CSV do mes escolhido: entradas e custos, separados por ponto e virgula (o Excel em
// portugues abre direto, com a virgula decimal).
function linhasCsvFinanceiro(mes, entradas, custos, cotacaoDolar) {
    const num = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
    const txt = (t) => '"' + String(t == null ? '' : t).replace(/"/g, '""') + '"';
    const linhas = [['tipo', 'data', 'descricao', 'meio', 'plano', 'status', 'bruto', 'taxa', 'liquido'].join(';')];
    entradas.filter(e => e.mes === mes)
        .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')))
        .forEach(e => linhas.push(['entrada', String(e.data || '').slice(0, 10), txt(e.email || e.descricao),
            e.categoria, e.plano || '', e.status, num(e.valor), num(e.taxa), num(e.status === 'approved' ? e.liquido : 0)].join(';')));
    custos.forEach(c => {
        const v = custoNoMes(c, mes, cotacaoDolar);
        if (v > 0) linhas.push(['custo', mes, txt(c.nome), txt(c.categoria), '', RECORRENCIAS_FIN[c.recorrencia] || '',
            num(-v), '0,00', num(-v)].join(';'));
    });
    return linhas;
}

function exportarFinanceiroCsv() {
    const linhas = linhasCsvFinanceiro(_fin.mes, _fin.entradas, _fin.custos, Number(_fin.config.cotacaoDolar) || 0);
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sisprof-financeiro-' + _fin.mes + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

if (typeof window !== 'undefined') {
    window.renderFinanceiroNav = renderFinanceiroNav;
    window.abrirTelaFinanceira = abrirTelaFinanceira;
    window.mudarMesFinanceiro = mudarMesFinanceiro;
    window.buscarEntradasNoMercadoPago = buscarEntradasNoMercadoPago;
    window.exportarFinanceiroCsv = exportarFinanceiroCsv;
    window.salvarCustoFinanceiro = salvarCustoFinanceiro;
    window.editarCustoFinanceiro = editarCustoFinanceiro;
    window.cancelarEdicaoCustoFinanceiro = cancelarEdicaoCustoFinanceiro;
    window.alternarCustoFinanceiro = alternarCustoFinanceiro;
    window.excluirCustoFinanceiro = excluirCustoFinanceiro;
    window.salvarCotacaoFinanceiro = salvarCotacaoFinanceiro;
}
