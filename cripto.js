// cripto.js — Backup cifrado do SisProf (WebCrypto puro, sem dependência nova)
// ============================================================================
//  O DESENHO, EM UMA FRASE
//    Cada backup é cifrado com uma chave aleatória do professor (a DEK), e essa
//    chave é guardada embrulhada de duas formas: uma que só a SENHA DELE abre, e
//    outra que só a CHAVE PRIVADA DE SUPORTE abre.
//
//  O QUE ISSO PROTEGE, E O QUE NÃO PROTEGE
//    Protege contra quem invadir o banco, contra o Firebase e contra o Google:
//    para todos eles o backup é um bloco sem sentido. NÃO protege contra o
//    detentor da chave privada de suporte — que é o ponto, porque o responsável
//    pelo sistema precisa conseguir socorrer um professor que perdeu tudo. É uma
//    escolha consciente, não um descuido.
//
//  ONDE MORA CADA COISA
//    - DEK ..................... IndexedDB do aparelho (store `meta`)
//    - cópia embrulhada .......... Firestore, em chaves_backup/{uid}
//    - chave PÚBLICA de suporte .. Firestore, em system/config_sistema
//    - chave PRIVADA de suporte .. arquivo .pem no computador do responsável,
//                                  nunca no repositório, nunca no Firestore
// ============================================================================

const CRIPTO_VERSAO = 1;
const PBKDF2_ITERACOES = 210000;
// Documento do Firestore tem teto de 1 MB. Deixamos folga para os outros campos
// e para o overhead do próprio Firestore.
const TAMANHO_MAX_PARTE = 700000;

// --- Conversões ------------------------------------------------------------

function bytesParaB64(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = '';
    // Em blocos: String.fromCharCode com centenas de milhares de argumentos
    // estoura a pilha de chamadas.
    for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(s);
}

function b64ParaBytes(b64) {
    const bruto = atob(b64);
    const bytes = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    return bytes;
}

// --- Compressão ------------------------------------------------------------
// O JSON do professor comprime muito (os Anexos III/IV são texto corrido), e é o
// que mantém o backup dentro do limite do Firestore. CompressionStream não existe
// em navegador antigo: nesse caso seguimos sem comprimir e registramos isso no
// próprio documento, para a leitura saber o que fazer.

function compressaoDisponivel() {
    return typeof CompressionStream !== 'undefined';
}

async function comprimirTexto(texto) {
    const entrada = new TextEncoder().encode(texto);
    if (!compressaoDisponivel()) return { bytes: entrada, comprimido: false };
    try {
        const fluxo = new Blob([entrada]).stream().pipeThrough(new CompressionStream('gzip'));
        const buffer = await new Response(fluxo).arrayBuffer();
        return { bytes: new Uint8Array(buffer), comprimido: true };
    } catch (e) {
        console.warn('[cripto] Compressão falhou, seguindo sem ela:', e);
        return { bytes: entrada, comprimido: false };
    }
}

async function descomprimirBytes(bytes, comprimido) {
    if (!comprimido) return new TextDecoder().decode(bytes);
    const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(fluxo).text();
}

// --- Chaves ----------------------------------------------------------------

// Deriva a chave que embrulha a DEK a partir da senha da conta.
async function derivarKEK(senha, saltBytes) {
    const base = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERACOES, hash: 'SHA-256' },
        base,
        { name: 'AES-KW', length: 256 },
        false,
        ['wrapKey', 'unwrapKey']
    );
}

// A DEK precisa ser extraível: é isso que permite re-embrulhá-la quando o professor
// troca de senha. Ela não sai do aparelho a não ser embrulhada.
function gerarDEK() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function carregarChavePublicaSuporte() {
    if (typeof db === 'undefined' || !db) return null;
    try {
        const doc = await db.collection('system').doc('config_sistema').get();
        const b64 = doc.exists ? doc.data().chavePublicaSuporte : null;
        if (!b64) return null;
        return await crypto.subtle.importKey(
            'spki', b64ParaBytes(b64),
            { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
    } catch (e) {
        console.warn('[cripto] Chave pública de suporte indisponível:', e);
        return null;
    }
}

// --- O envelope ------------------------------------------------------------

function _docChaves(uid) { return db.collection('chaves_backup').doc(String(uid)); }

async function _gravarEnvelope(uid, dek, senha, saltBytes) {
    const kek = await derivarKEK(senha, saltBytes);
    const wrapUsuario = await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW');

    let wrapSuporte = null;
    const pub = await carregarChavePublicaSuporte();
    if (pub) {
        wrapSuporte = bytesParaB64(await crypto.subtle.wrapKey('raw', dek, pub, { name: 'RSA-OAEP' }));
    } else {
        // Sem a chave pública instalada o sistema funciona igual — só fica sem a
        // rede de socorro. O painel super admin avisa e oferece gerar o par.
        console.warn('[cripto] Sem chave pública de suporte: este backup só será recuperável pela senha do professor.');
    }

    await _docChaves(uid).set({
        v: CRIPTO_VERSAO,
        salt: bytesParaB64(saltBytes),
        wrapUsuario: bytesParaB64(wrapUsuario),
        wrapSuporte: wrapSuporte,
        atualizadoEm: new Date().toISOString()
    }, { merge: true });
}

// Chamada no login, quando a senha está em mãos. Nunca pede nada ao professor:
// é isso que faz o backup cifrado ser invisível para ele.
async function desbloquearChaveBackup(uid, senha) {
    if (!uid || !senha || typeof db === 'undefined' || !db) return null;

    try {
        const doc = await _docChaves(uid).get();

        if (!doc.exists) {
            // Primeira vez nesta conta: cria a DEK e o envelope.
            const dek = await gerarDEK();
            const salt = crypto.getRandomValues(new Uint8Array(16));
            await _gravarEnvelope(uid, dek, senha, salt);
            await metaSet('chaveBackup', dek);
            return dek;
        }

        const dados = doc.data();
        const salt = b64ParaBytes(dados.salt);
        try {
            const kek = await derivarKEK(senha, salt);
            const dek = await crypto.subtle.unwrapKey(
                'raw', b64ParaBytes(dados.wrapUsuario), kek, 'AES-KW',
                { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
            await metaSet('chaveBackup', dek);
            return dek;
        } catch (e) {
            // A senha não abre o envelope. O caso normal disto é o professor ter
            // redefinido a senha por e-mail: o embrulho antigo ficou preso na senha
            // velha. Se a DEK ainda estiver neste aparelho, re-embrulhamos com a
            // senha nova e ninguém perde nada.
            const dekLocal = await metaGet('chaveBackup');
            if (dekLocal) {
                console.log('[cripto] Senha mudou: re-embrulhando a chave de backup.');
                await _gravarEnvelope(uid, dekLocal, senha, crypto.getRandomValues(new Uint8Array(16)));
                return dekLocal;
            }
            // Sem a DEK aqui, os backups antigos só voltam pela chave de suporte.
            // Seguimos com uma DEK nova para os próximos backups funcionarem.
            console.warn('[cripto] Não foi possível abrir a chave de backup com esta senha.');
            await metaSet('backupsAntigosInacessiveis', new Date().toISOString());
            const dek = await gerarDEK();
            await _gravarEnvelope(uid, dek, senha, crypto.getRandomValues(new Uint8Array(16)));
            await metaSet('chaveBackup', dek);
            return dek;
        }
    } catch (e) {
        console.warn('[cripto] Falha ao preparar a chave de backup:', e);
        return null;
    }
}

// Usada fora do login: a chave já está no aparelho desde a última entrada.
async function obterChaveBackup() {
    try { return await metaGet('chaveBackup'); } catch (e) { return null; }
}

// Aparelho novo restaurando: aí sim pedimos a senha, uma vez.
async function desbloquearChaveBackupComSenha(uid, senha) {
    return desbloquearChaveBackup(uid, senha);
}

// --- Cifrar e decifrar um pacote -------------------------------------------

// Devolve os documentos a gravar: o principal e, se for grande, as continuações.
async function cifrarPacote(obj, dek) {
    const { bytes, comprimido } = await comprimirTexto(JSON.stringify(obj));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, dek, bytes);
    const texto = bytesParaB64(cifrado);

    const pedacos = [];
    for (let i = 0; i < texto.length; i += TAMANHO_MAX_PARTE) {
        pedacos.push(texto.slice(i, i + TAMANHO_MAX_PARTE));
    }

    return {
        principal: {
            cifrado: true,
            v: CRIPTO_VERSAO,
            comprimido: comprimido,
            iv: bytesParaB64(iv),
            ct: pedacos[0],
            partes: pedacos.length,
            criadoEm: new Date().toISOString()
        },
        continuacoes: pedacos.slice(1).map((p, i) => ({
            cifrado: true, v: CRIPTO_VERSAO, parte: i + 2, ct: p
        }))
    };
}

async function decifrarPacote(doc, dek, lerContinuacao) {
    if (!doc || !doc.cifrado) throw new Error('Este backup não está no formato cifrado.');

    let texto = doc.ct || '';
    const partes = doc.partes || 1;
    for (let i = 2; i <= partes; i++) {
        const cont = await lerContinuacao(i);
        if (!cont || !cont.ct) throw new Error('Falta a parte ' + i + ' deste backup.');
        texto += cont.ct;
    }

    const bytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ParaBytes(doc.iv) }, dek, b64ParaBytes(texto));
    return JSON.parse(await descomprimirBytes(new Uint8Array(bytes), doc.comprimido !== false));
}

// --- Chave de suporte: geração e uso ---------------------------------------

function _pem(tipo, buffer) {
    const b64 = bytesParaB64(buffer);
    const linhas = b64.match(/.{1,64}/g).join('\n');
    return '-----BEGIN ' + tipo + '-----\n' + linhas + '\n-----END ' + tipo + '-----\n';
}

// Gera o par NO NAVEGADOR do responsável. A pública vai para o Firestore; a privada
// é baixada uma única vez e nunca é gravada em lugar nenhum.
async function gerarParDeChavesSuporte() {
    const par = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['wrapKey', 'unwrapKey']);

    const spki = await crypto.subtle.exportKey('spki', par.publicKey);
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', par.privateKey);

    await db.collection('system').doc('config_sistema').set({
        chavePublicaSuporte: bytesParaB64(spki),
        chavePublicaSuporteEm: new Date().toISOString()
    }, { merge: true });

    return { pemPrivada: _pem('PRIVATE KEY', pkcs8), publicaB64: bytesParaB64(spki) };
}

async function importarChavePrivadaSuporte(pem) {
    const corpo = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    if (!corpo) throw new Error('O arquivo não parece uma chave privada.');
    return crypto.subtle.importKey(
        'pkcs8', b64ParaBytes(corpo),
        { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
}

// Desembrulha a DEK de um professor usando a chave privada de suporte.
async function abrirChaveComSuporte(uid, chavePrivada) {
    const doc = await _docChaves(uid).get();
    if (!doc.exists) throw new Error('Este professor ainda não tem chave de backup.');
    const wrap = doc.data().wrapSuporte;
    if (!wrap) throw new Error('Os backups deste professor foram feitos antes da chave de suporte existir.\nSó a senha dele os abre.');
    return crypto.subtle.unwrapKey(
        'raw', b64ParaBytes(wrap), chavePrivada, { name: 'RSA-OAEP' },
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
