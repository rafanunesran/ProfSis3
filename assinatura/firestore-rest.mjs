// FALAR COM O FIRESTORE DE FORA DO NAVEGADOR, SEM O firebase-admin.
//
// O webhook roda num Cloudflare Worker (ou numa funcao Edge da Vercel). La' nao
// existe Node completo, entao o SDK `firebase-admin` — que depende de `crypto`,
// `fs` e companhia — simplesmente nao carrega. O caminho que funciona nos dois
// lugares e' o padrao da web: assinar um JWT com a WebCrypto, trocar por um token
// do Google e conversar com a API REST do Firestore.
//
// Uma consequencia boa: credencial de conta de servico BYPASSA as Regras do
// Firestore. E' por isso que `assinaturas/<uid>` pode ser um documento que NENHUM
// professor escreve — nem o dono da conta — e ainda assim ser atualizado sozinho
// quando o pagamento entra.

const ESCOPO = 'https://www.googleapis.com/auth/datastore';

let tokenEmCache = null; // { token, expiraEmMs } — vive enquanto a instancia viver

// ----------------------------------------------------------------------------
// Credencial
// ----------------------------------------------------------------------------

function base64url(bytes) {
    let bin = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textoParaBase64url(texto) {
    return base64url(new TextEncoder().encode(texto));
}

// Converte a chave PEM da conta de servico em bytes DER para a WebCrypto.
function pemParaDer(pem) {
    const limpo = String(pem || '')
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\\n/g, '')
        .replace(/\s+/g, '');
    const bin = atob(limpo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function assinarJwt(contaServico) {
    const agora = Math.floor(Date.now() / 1000);
    const cabecalho = { alg: 'RS256', typ: 'JWT' };
    const corpo = {
        iss: contaServico.client_email,
        scope: ESCOPO,
        aud: 'https://oauth2.googleapis.com/token',
        iat: agora,
        exp: agora + 3600
    };
    const entrada = textoParaBase64url(JSON.stringify(cabecalho)) + '.' +
                    textoParaBase64url(JSON.stringify(corpo));

    const chave = await crypto.subtle.importKey(
        'pkcs8',
        pemParaDer(contaServico.private_key),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const assinatura = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(entrada));

    return entrada + '.' + base64url(assinatura);
}

// Token de acesso do Google, com cache em memoria (dura 1h; renovamos aos 55min).
export async function pegarToken(contaServico) {
    if (tokenEmCache && tokenEmCache.expiraEmMs > Date.now() + 60000) {
        return tokenEmCache.token;
    }
    const jwt = await assinarJwt(contaServico);
    const resposta = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    if (!resposta.ok) {
        throw new Error('Google recusou a credencial da conta de servico: ' +
                        resposta.status + ' ' + (await resposta.text()).slice(0, 300));
    }
    const dados = await resposta.json();
    tokenEmCache = {
        token: dados.access_token,
        expiraEmMs: Date.now() + (Number(dados.expires_in || 3600) * 1000) - 300000
    };
    return tokenEmCache.token;
}

// So' para os testes: esquece o token guardado.
export function limparCacheDeToken() { tokenEmCache = null; }

// ----------------------------------------------------------------------------
// Conversao de valores (o Firestore REST e' tipado na marra)
// ----------------------------------------------------------------------------

export function paraValorFirestore(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
        return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    if (Array.isArray(v)) {
        return { arrayValue: { values: v.map(paraValorFirestore) } };
    }
    if (typeof v === 'object') {
        const fields = {};
        Object.keys(v).forEach(k => { fields[k] = paraValorFirestore(v[k]); });
        return { mapValue: { fields: fields } };
    }
    return { stringValue: String(v) };
}

export function deValorFirestore(v) {
    if (!v || typeof v !== 'object') return null;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(deValorFirestore);
    if ('mapValue' in v) return camposParaObjeto((v.mapValue && v.mapValue.fields) || {});
    return null;
}

export function camposParaObjeto(fields) {
    const obj = {};
    Object.keys(fields || {}).forEach(k => { obj[k] = deValorFirestore(fields[k]); });
    return obj;
}

// ----------------------------------------------------------------------------
// Leitura e escrita
// ----------------------------------------------------------------------------

function enderecoDoc(projeto, caminho) {
    return 'https://firestore.googleapis.com/v1/projects/' + projeto +
           '/databases/(default)/documents/' + caminho;
}

// Le um documento. Devolve null quando ele nao existe (404) — que e' diferente de
// erro: a primeira assinatura de cada professor sempre cai neste caso.
export async function lerDoc(projeto, caminho, contaServico) {
    const token = await pegarToken(contaServico);
    const resposta = await fetch(enderecoDoc(projeto, caminho), {
        headers: { authorization: 'Bearer ' + token }
    });
    if (resposta.status === 404) return null;
    if (!resposta.ok) {
        throw new Error('Falha ao ler ' + caminho + ': ' + resposta.status +
                        ' ' + (await resposta.text()).slice(0, 300));
    }
    const doc = await resposta.json();
    return camposParaObjeto(doc.fields || {});
}

// Grava (mesclando) um documento. A mascara de campos e' obrigatoria: sem ela o
// PATCH do Firestore APAGA os campos que nao vieram no corpo.
export async function gravarDoc(projeto, caminho, dados, contaServico) {
    const token = await pegarToken(contaServico);
    const chaves = Object.keys(dados || {});
    const mascara = chaves
        .map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k))
        .join('&');
    const fields = {};
    chaves.forEach(k => { fields[k] = paraValorFirestore(dados[k]); });

    const resposta = await fetch(enderecoDoc(projeto, caminho) + '?' + mascara, {
        method: 'PATCH',
        headers: {
            authorization: 'Bearer ' + token,
            'content-type': 'application/json'
        },
        body: JSON.stringify({ fields: fields })
    });
    if (!resposta.ok) {
        throw new Error('Falha ao gravar ' + caminho + ': ' + resposta.status +
                        ' ' + (await resposta.text()).slice(0, 300));
    }
    return true;
}

// Apaga um documento. Usado quando a assinatura deixa de valer: o nome sai da
// lista publica de contribuintes na hora, sem esperar ninguem passar limpando.
export async function apagarDoc(projeto, caminho, contaServico) {
    const token = await pegarToken(contaServico);
    const resposta = await fetch(enderecoDoc(projeto, caminho), {
        method: 'DELETE',
        headers: { authorization: 'Bearer ' + token }
    });
    // 404 tambem e' sucesso: o que se queria e' que ele nao exista.
    if (!resposta.ok && resposta.status !== 404) {
        throw new Error('Falha ao apagar ' + caminho + ': ' + resposta.status +
                        ' ' + (await resposta.text()).slice(0, 300));
    }
    return true;
}

// A conta de servico chega como JSON numa variavel de ambiente (secret do
// provedor). Aceita tanto o JSON cru quanto o mesmo JSON em base64, porque
// alguns paineis estragam quebras de linha ao colar.
export function lerContaServico(bruto) {
    const texto = String(bruto || '').trim();
    if (!texto) throw new Error('Falta a variavel FIREBASE_SERVICE_ACCOUNT.');
    const json = texto.charAt(0) === '{' ? texto : atob(texto);
    const conta = JSON.parse(json);
    if (!conta.client_email || !conta.private_key) {
        throw new Error('A conta de servico precisa ter client_email e private_key.');
    }
    return conta;
}
