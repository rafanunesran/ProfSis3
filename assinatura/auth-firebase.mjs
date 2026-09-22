// QUEM ESTA PEDINDO? — conferir o cracha do Firebase Auth do lado do servidor.
//
// O cancelamento de assinatura nao pode confiar no uid que o navegador manda: se
// confiasse, qualquer pessoa cancelaria a assinatura de qualquer outra so' trocando
// um numero. Entao o aplicativo manda o ID token do Firebase Auth (o cracha que o
// proprio Google assinou) e e' aqui que ele e' conferido.
//
// De novo sem `firebase-admin`: ele nao roda no Edge. A conferencia e' a padrao de
// JWT — assinatura RS256 contra as chaves publicas do Google, mais os campos que
// dizem para quem aquele cracha foi emitido.

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let chavesEmCache = null; // { chaves: {kid: CryptoKey}, expiraEmMs }

function base64urlParaBytes(texto) {
    const base64 = String(texto).replace(/-/g, '+').replace(/_/g, '/');
    const completo = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const bin = atob(completo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function lerParte(parte) {
    return JSON.parse(new TextDecoder().decode(base64urlParaBytes(parte)));
}

// As chaves publicas do Google giram de tempos em tempos; respeitamos o cache que
// eles mesmos pedem no cabecalho, e nunca guardamos alem disso.
async function pegarChavesDoGoogle() {
    if (chavesEmCache && chavesEmCache.expiraEmMs > Date.now()) return chavesEmCache.chaves;

    const resposta = await fetch(JWKS_URL);
    if (!resposta.ok) throw new Error('Nao consegui buscar as chaves publicas do Google: ' + resposta.status);

    const jwks = await resposta.json();
    const chaves = {};
    for (const jwk of (jwks.keys || [])) {
        if (jwk.kty !== 'RSA' || !jwk.kid) continue;
        chaves[jwk.kid] = await crypto.subtle.importKey(
            'jwk',
            { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );
    }

    const controle = resposta.headers.get('cache-control') || '';
    const idade = /max-age=(\d+)/.exec(controle);
    const segundos = idade ? Number(idade[1]) : 3600;
    chavesEmCache = { chaves: chaves, expiraEmMs: Date.now() + Math.max(60, segundos) * 1000 };
    return chaves;
}

// So' para os testes.
export function limparCacheDeChaves() { chavesEmCache = null; }

// Devolve o uid quando o cracha e' valido; estoura quando nao e'.
// Cada checagem abaixo ja' foi, em algum sistema, o buraco por onde alguem entrou:
// aceitar `alg: none`, esquecer o `aud` (cracha de OUTRO projeto Firebase entra),
// esquecer o `exp` (cracha vazado vale para sempre).
export async function verificarTokenFirebase(idToken, projetoId) {
    const partes = String(idToken || '').split('.');
    if (partes.length !== 3) throw new Error('cracha malformado');

    const cabecalho = lerParte(partes[0]);
    if (cabecalho.alg !== 'RS256') throw new Error('algoritmo nao aceito: ' + cabecalho.alg);
    if (!cabecalho.kid) throw new Error('cracha sem kid');

    const chaves = await pegarChavesDoGoogle();
    const chave = chaves[cabecalho.kid];
    if (!chave) throw new Error('cracha assinado por chave desconhecida');

    const assinaturaOk = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5', chave,
        base64urlParaBytes(partes[2]),
        new TextEncoder().encode(partes[0] + '.' + partes[1]));
    if (!assinaturaOk) throw new Error('assinatura do cracha nao confere');

    const corpo = lerParte(partes[1]);
    const agora = Math.floor(Date.now() / 1000);
    if (corpo.aud !== projetoId) throw new Error('cracha emitido para outro projeto');
    if (corpo.iss !== 'https://securetoken.google.com/' + projetoId) throw new Error('emissor inesperado');
    if (!corpo.sub) throw new Error('cracha sem dono');
    if (Number(corpo.exp) <= agora) throw new Error('cracha vencido');
    if (Number(corpo.iat) > agora + 300) throw new Error('cracha emitido no futuro');

    return { uid: String(corpo.sub), email: String(corpo.email || '').toLowerCase() };
}
