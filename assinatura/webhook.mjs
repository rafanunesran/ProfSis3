// O WEBHOOK DA ASSINATURA — o unico pedaco de servidor do SisProf.
//
// POR QUE ELE EXISTE
//   O site e' estatico (GitHub Pages) e o banco e' o Firestore. Nao ha' onde o
//   Mercado Pago bater quando a mensalidade entra, falha ou e' cancelada. Sem este
//   endereco, alguem teria que abrir o painel do Mercado Pago todo mes e marcar os
//   contribuintes na mao — que e' exatamente o que este arquivo veio aposentar.
//
// O QUE ELE FAZ
//   1. confere que o aviso veio mesmo do Mercado Pago (assinatura HMAC);
//   2. busca o recurso na API deles (nunca confia no corpo da notificacao, que so'
//      traz um id — e qualquer um pode inventar um id);
//   3. descobre de QUEM e' a assinatura (external_reference = uid; se nao vier,
//      procura o e-mail do pagador na lista de usuarios);
//   4. grava `assinaturas/<uid>` com credencial de conta de servico, e mantem o
//      nome de quem apoia em `contribuintes/<uid>` (a lista que a escola inteira ve).
//
// TAMBEM ATENDE O CANCELAMENTO (POST em /cancelar). O professor cancela pelo proprio
// sistema, sem precisar caçar a tela do Mercado Pago. Quem manda o pedido prova ser
// quem diz ser com o cracha do Firebase Auth (ver auth-firebase.mjs): confiar no uid
// que o navegador envia deixaria qualquer um cancelar a assinatura de qualquer outro.
//
// ONDE RODA
//   Cloudflare Workers (`wrangler deploy`) ou funcao Edge da Vercel — o codigo e' o
//   mesmo, so' muda o arquivo de entrada. Ver LEIAME.md nesta pasta.
//
// SEGREDOS (variaveis de ambiente do provedor, nunca no repositorio):
//   MP_ACCESS_TOKEN            - token de producao do Mercado Pago
//   MP_WEBHOOK_SECRET          - "chave secreta" do webhook, no painel do Mercado Pago
//   FIREBASE_PROJECT_ID        - profsis3
//   FIREBASE_SERVICE_ACCOUNT   - o JSON da conta de servico (cru ou em base64)
//   MP_PLANO_APOIASE_ID        - id do plano de R$ 10,00 (opcional; o valor tambem identifica)
//   MP_PLANO_PROFESSOR_ID      - id do plano de R$ 20,00 (opcional)

import {
    interpretarNotificacao, montarAssinatura, identificarUsuario,
    acharUidPorEmail, devoGravar, manifestoAssinatura, lerCabecalhoAssinatura
} from './regras.mjs';
import { lerDoc, gravarDoc, apagarDoc, lerContaServico } from './firestore-rest.mjs';
import { verificarTokenFirebase } from './auth-firebase.mjs';

const MP_API = 'https://api.mercadopago.com';

// ----------------------------------------------------------------------------
// Conferencia da origem
// ----------------------------------------------------------------------------

// Comparacao em tempo constante. Comparar hash com `===` vaza, pelo tempo de
// resposta, quantos caracteres iniciais o atacante acertou.
function igualSemVazarTempo(a, b) {
    const x = String(a || ''), y = String(b || '');
    if (x.length !== y.length) return false;
    let diferenca = 0;
    for (let i = 0; i < x.length; i++) diferenca |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diferenca === 0;
}

async function hmacHex(segredo, mensagem) {
    const chave = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(segredo),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const assinatura = await crypto.subtle.sign(
        'HMAC', chave, new TextEncoder().encode(mensagem));
    return Array.from(new Uint8Array(assinatura))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

// O Mercado Pago manda `x-signature: ts=...,v1=...` e `x-request-id`.
// Sem segredo configurado NAO liberamos nada: um webhook aberto deixaria qualquer
// pessoa na internet se declarar assinante do plano Professor.
export async function conferirAssinaturaMp(cabecalhos, idRecurso, segredo) {
    if (!segredo) return { ok: false, motivo: 'MP_WEBHOOK_SECRET nao configurado' };

    const { ts, v1 } = lerCabecalhoAssinatura(cabecalhos.get('x-signature'));
    if (!ts || !v1) return { ok: false, motivo: 'cabecalho x-signature ausente ou torto' };

    // Janela de 10 minutos: barra o reenvio de um aviso antigo capturado por terceiros.
    // O `ts` chega em segundos (10 digitos) ou em milissegundos (13) conforme o
    // evento; normalizamos antes de comparar.
    const tsMs = String(ts).length > 10 ? Number(ts) : Number(ts) * 1000;
    const idadeMs = Math.abs(Date.now() - tsMs);
    if (isFinite(idadeMs) && idadeMs > 10 * 60 * 1000) {
        return { ok: false, motivo: 'notificacao fora da janela de tempo' };
    }

    const manifesto = manifestoAssinatura(idRecurso, cabecalhos.get('x-request-id'), ts);
    const esperado = await hmacHex(segredo, manifesto);
    if (!igualSemVazarTempo(esperado, v1)) {
        return { ok: false, motivo: 'assinatura nao confere' };
    }
    return { ok: true };
}

// ----------------------------------------------------------------------------
// API do Mercado Pago
// ----------------------------------------------------------------------------

async function buscarNoMp(caminho, token) {
    const resposta = await fetch(MP_API + caminho, {
        headers: { authorization: 'Bearer ' + token }
    });
    if (!resposta.ok) {
        throw new Error('Mercado Pago recusou ' + caminho + ': ' + resposta.status +
                        ' ' + (await resposta.text()).slice(0, 300));
    }
    return resposta.json();
}

// Uma cobranca mensal (`authorized_payment`) so' interessa pelo que ela diz sobre a
// assinatura, entao voltamos dela para a assinatura e tratamos como sempre.
async function buscarAssinatura(acao, token) {
    if (acao.acao === 'buscar-assinatura') {
        return buscarNoMp('/preapproval/' + encodeURIComponent(acao.id), token);
    }
    const cobranca = await buscarNoMp(
        '/authorized_payments/' + encodeURIComponent(acao.id), token);
    const idAssinatura = cobranca && cobranca.preapproval_id;
    if (!idAssinatura) return null;
    return buscarNoMp('/preapproval/' + encodeURIComponent(idAssinatura), token);
}

// ----------------------------------------------------------------------------
// O trabalho
// ----------------------------------------------------------------------------

// Separado do `fetch` para poder ser testado com dependencias de mentira
// (ver testes/teste-webhook-mp.js): nada aqui conhece Request nem Response.
export async function processarNotificacao(corpo, ambiente, ferramentas) {
    const { buscar, ler, gravar } = ferramentas;
    const acao = interpretarNotificacao(corpo);
    if (acao.acao === 'ignorar') return { feito: false, motivo: acao.motivo };

    const assinatura = await buscar(acao);
    if (!assinatura) return { feito: false, motivo: 'assinatura nao encontrada no Mercado Pago' };

    const config = {
        planoApoiaseId: ambiente.MP_PLANO_APOIASE_ID || '',
        planoProfessorId: ambiente.MP_PLANO_PROFESSOR_ID || ''
    };
    const doc = montarAssinatura(assinatura, config);

    // De quem e' isto?
    const quem = identificarUsuario(assinatura);
    let uid = quem.uid;
    if (!uid && (quem.email || quem.emailAlternativo)) {
        const lista = await ler('system/users_list');
        const usuarios = (lista && lista.list) || [];
        uid = acharUidPorEmail(usuarios, quem.email)
              || acharUidPorEmail(usuarios, quem.emailAlternativo);
    }
    if (!uid) {
        // Nao da' para adivinhar. Guardamos o caso para o painel do super admin
        // resolver na mao — dinheiro entrou, e perder esse registro seria pior.
        await gravar('assinaturas_sem_dono/' + doc.preapprovalId, doc);
        return { feito: false, motivo: 'nao identifiquei o usuario', email: quem.email };
    }

    const atual = await ler('assinaturas/' + uid);
    if (!devoGravar(atual, doc)) {
        return { feito: false, motivo: 'documento ja estava atualizado', uid: uid };
    }

    await gravar('assinaturas/' + uid, Object.assign({ uid: uid }, doc));
    await atualizarVitrineDeContribuintes(uid, doc, ferramentas);
    return { feito: true, uid: uid, plano: doc.plano, status: doc.status };
}

// A LISTA "OBRIGADO A QUEM E' PARCA".
//
// Ela existia lendo o campo `contribuidor` de system/users_list — documento que
// QUALQUER conta logada escreve. Dava para pendurar o coracao amarelo no proprio
// nome pelo console do navegador, sem pagar nada. Agora quem escreve esta lista e'
// so' o webhook, depois do pagamento confirmado, e as Regras nao deixam mais ninguem
// tocar nela.
//
// Guarda o minimo: nome abreviado e a escola. Nem plano, nem valor, nem e-mail —
// quanto alguem paga nao e' assunto da sala dos professores.
export async function atualizarVitrineDeContribuintes(uid, doc, ferramentas) {
    const { ler, gravar, apagar } = ferramentas;
    const vale = doc.status === 'ativa' && doc.plano !== 'free';

    if (!vale) {
        if (apagar) await apagar('contribuintes/' + uid);
        return;
    }
    const lista = await ler('system/users_list');
    const pessoa = ((lista && lista.list) || []).find(u =>
        String((u && (u.uid || u.id)) || '') === String(uid));

    await gravar('contribuintes/' + uid, {
        uid: String(uid),
        nome: abreviarNomeContribuinte((pessoa && pessoa.nome) || ''),
        schoolId: String((pessoa && pessoa.schoolId) || ''),
        desde: doc.atualizadoEm || new Date().toISOString()
    });
}

// "Ana Carolina Souza" -> "Ana S." — o mesmo formato que a tela sempre mostrou.
export function abreviarNomeContribuinte(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'Professor(a)';
    if (partes.length === 1) return partes[0];
    return partes[0] + ' ' + partes[partes.length - 1].charAt(0).toUpperCase() + '.';
}

// ----------------------------------------------------------------------------
// Cancelamento pedido pelo proprio professor
// ----------------------------------------------------------------------------

// Cancela no Mercado Pago e derruba o plano na mesma hora — sem esperar o webhook
// da volta. Se a notificacao vier depois, ela apenas confirma o que ja' esta' aqui
// (o carimbo de versao cuida de nao embaralhar a ordem).
export async function cancelarAssinatura(uid, ambiente, ferramentas) {
    const { ler, gravar, apagar, cancelarNoMp } = ferramentas;

    const atual = await ler('assinaturas/' + uid);
    if (!atual || !atual.preapprovalId) {
        // Cortesia concedida pelo painel nao tem o que cancelar no Mercado Pago,
        // mas tambem nao e' cobranca: dizemos a verdade em vez de fingir que deu.
        if (atual && atual.origem !== 'mercadopago') {
            return { cancelada: false, motivo: 'esta conta nao tem cobranca no cartao' };
        }
        return { cancelada: false, motivo: 'nao encontrei assinatura para esta conta' };
    }
    if (atual.status === 'cancelada') {
        return { cancelada: true, motivo: 'a assinatura ja estava cancelada' };
    }

    await cancelarNoMp(atual.preapprovalId);

    const doc = Object.assign({}, atual, {
        plano: 'free',
        status: 'cancelada',
        canceladaPeloUsuarioEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        // Um passo a' frente do que estava gravado, para a notificacao atrasada do
        // Mercado Pago nao "reviver" a assinatura que a pessoa acabou de cancelar.
        versaoMs: Math.max(Number(atual.versaoMs) || 0, Date.now())
    });
    await gravar('assinaturas/' + uid, doc);
    await atualizarVitrineDeContribuintes(uid, doc, ferramentas);
    return { cancelada: true, plano: 'free', status: 'cancelada' };
}

// ----------------------------------------------------------------------------
// Entrada HTTP
// ----------------------------------------------------------------------------

// De onde sai o id do recurso: primeiro a query string (`?data.id=` ou `?id=`),
// depois o corpo da notificacao.
export function idDaNotificacao(request, corpo) {
    try {
        const parametros = new URL(request.url).searchParams;
        const daUrl = parametros.get('data.id') || parametros.get('id');
        if (daUrl) return String(daUrl);
    } catch (e) { /* URL estranha: seguimos pelo corpo */ }
    return String((corpo && corpo.data && corpo.data.id) || (corpo && corpo.id) || '');
}

// ----------------------------------------------------------------------------
// CORS — quem pode chamar o cancelamento pelo navegador
// ----------------------------------------------------------------------------
// Lista fechada, de proposito. O webhook do Mercado Pago nao passa por CORS (e'
// servidor falando com servidor); quem precisa e' o /cancelar, chamado pela pagina
// do professor. Deixar `*` aqui nao criaria um buraco (o cracha do Firebase continua
// sendo exigido), mas tambem nao ha' motivo para convidar tentativa de fora.
const ORIGENS_PADRAO = [
    'https://rafanunesran.github.io',
    'http://localhost:8877',
    'http://127.0.0.1:8877'
];

function origensPermitidas(ambiente) {
    const daConfig = String(ambiente.ORIGENS_PERMITIDAS || '')
        .split(',').map(o => o.trim()).filter(Boolean);
    return daConfig.length ? daConfig : ORIGENS_PADRAO;
}

function cabecalhosCors(request, ambiente) {
    const origem = request.headers.get('origin') || '';
    if (!origem || origensPermitidas(ambiente).indexOf(origem) === -1) return {};
    return {
        'access-control-allow-origin': origem,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '86400',
        'vary': 'Origin'
    };
}

function responder(corpo, status, extras) {
    return new Response(JSON.stringify(corpo), {
        status: status,
        headers: Object.assign({ 'content-type': 'application/json' }, extras || {})
    });
}

// ----------------------------------------------------------------------------
// Rota do cancelamento
// ----------------------------------------------------------------------------

async function tratarCancelamento(request, ambiente) {
    const cors = cabecalhosCors(request, ambiente);

    const autorizacao = request.headers.get('authorization') || '';
    const token = autorizacao.toLowerCase().indexOf('bearer ') === 0 ? autorizacao.slice(7).trim() : '';
    if (!token) return responder({ erro: 'falta o cracha da sessao' }, 401, cors);

    const projeto = ambiente.FIREBASE_PROJECT_ID;
    let dono;
    try {
        dono = await verificarTokenFirebase(token, projeto);
    } catch (e) {
        console.warn('[assinatura] cancelamento recusado:', e && e.message);
        return responder({ erro: 'sessao invalida: ' + (e && e.message) }, 401, cors);
    }

    const conta = lerContaServico(ambiente.FIREBASE_SERVICE_ACCOUNT);
    try {
        const resultado = await cancelarAssinatura(dono.uid, ambiente, {
            ler: (caminho) => lerDoc(projeto, caminho, conta),
            gravar: (caminho, dados) => gravarDoc(projeto, caminho, dados, conta),
            apagar: (caminho) => apagarDoc(projeto, caminho, conta),
            cancelarNoMp: (id) => cancelarNoMercadoPago(id, ambiente.MP_ACCESS_TOKEN)
        });
        console.log('[assinatura] cancelamento:', dono.uid, JSON.stringify(resultado));
        return responder(resultado, resultado.cancelada ? 200 : 409, cors);
    } catch (e) {
        console.error('[assinatura] cancelamento falhou:', e && e.message);
        return responder({ erro: 'nao consegui cancelar: ' + (e && e.message) }, 500, cors);
    }
}

async function cancelarNoMercadoPago(preapprovalId, token) {
    const resposta = await fetch(MP_API + '/preapproval/' + encodeURIComponent(preapprovalId), {
        method: 'PUT',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
    });
    if (!resposta.ok) {
        throw new Error('o Mercado Pago recusou o cancelamento: ' + resposta.status +
                        ' ' + (await resposta.text()).slice(0, 300));
    }
    return true;
}

function ehRotaDeCancelamento(request) {
    try {
        return /\/cancelar\/?$/.test(new URL(request.url).pathname);
    } catch (e) { return false; }
}

export async function tratarRequisicao(request, ambiente) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cabecalhosCors(request, ambiente) });
    }
    if (ehRotaDeCancelamento(request)) {
        if (request.method !== 'POST') return new Response('metodo nao suportado', { status: 405 });
        return tratarCancelamento(request, ambiente);
    }

    if (request.method === 'GET') {
        // Serve para o painel do Mercado Pago testar o endereco e para a gente
        // saber, pelo navegador, que o Worker esta' no ar.
        return new Response('SisProf - webhook de assinatura no ar.', { status: 200 });
    }
    if (request.method !== 'POST') {
        return new Response('metodo nao suportado', { status: 405 });
    }

    let corpo = null;
    try {
        corpo = await request.json();
    } catch (e) {
        return new Response('corpo invalido', { status: 400 });
    }

    // O id que entra no manifesto assinado e' o da QUERY STRING quando ela existe:
    // e' assim que o Mercado Pago calcula a assinatura, e um id pego so' do corpo
    // resulta em 401 eterno (eles reenviam, nos recusamos, a assinatura nunca
    // sincroniza). Alfanumerico entra em minusculas, como a documentacao deles pede.
    const idRecurso = String(idDaNotificacao(request, corpo)).toLowerCase();
    const conferencia = await conferirAssinaturaMp(
        request.headers, idRecurso, ambiente.MP_WEBHOOK_SECRET);
    if (!conferencia.ok) {
        console.warn('[assinatura] aviso recusado:', conferencia.motivo);
        return new Response('assinatura invalida', { status: 401 });
    }

    const projeto = ambiente.FIREBASE_PROJECT_ID;
    const conta = lerContaServico(ambiente.FIREBASE_SERVICE_ACCOUNT);

    try {
        const resultado = await processarNotificacao(corpo, ambiente, {
            buscar: (acao) => buscarAssinatura(acao, ambiente.MP_ACCESS_TOKEN),
            ler: (caminho) => lerDoc(projeto, caminho, conta),
            gravar: (caminho, dados) => gravarDoc(projeto, caminho, dados, conta),
            apagar: (caminho) => apagarDoc(projeto, caminho, conta)
        });
        console.log('[assinatura]', JSON.stringify(resultado));
        return new Response(JSON.stringify(resultado), {
            status: 200, headers: { 'content-type': 'application/json' }
        });
    } catch (e) {
        // 500 de proposito: o Mercado Pago reenvia o aviso, e reenviar e' o que
        // salva a assinatura quando o Firestore esta' fora do ar por um minuto.
        console.error('[assinatura] falhou:', e && e.message);
        return new Response('erro ao processar: ' + (e && e.message), { status: 500 });
    }
}

// Cloudflare Workers
export default {
    fetch: (request, env) => tratarRequisicao(request, env)
};
