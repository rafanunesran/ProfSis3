// espacos.js — Espaços com código de convite (Fase 3 da adequação SEDUC)
// ============================================================================
//  O PROBLEMA QUE ISTO RESOLVE
//    Até aqui a escola era uma linha em `system/schools_list`, um documento único
//    que qualquer pessoa logada lia e reescrevia por inteiro, e entrar numa escola
//    era escolher o nome dela numa lista e esperar um gestor liberar na mão.
//
//    Agora a escola é um ESPAÇO com um CÓDIGO. Quem cria recebe o código e o passa
//    aos colegas; quem tem o código entra direto, sem fila. O código também é o
//    segredo de onde a Fase 4 vai derivar a chave da camada cifrada — por isso ele
//    NÃO fica gravado em lugar nenhum do banco.
//
//  COMO A BUSCA FUNCIONA SEM ENTREGAR NADA
//    `espacos_indice/<sha256("profsis-v1:" + codigo)>` guarda só `{ espacoId }`.
//    Entrar é UM get direto nesse endereço: quem não tem o código não consegue nem
//    calcular onde olhar. E as Regras liberam `get` mas negam `list` nas duas
//    coleções, então ninguém varre o banco atrás de espaços alheios.
//
//  PRINCÍPIO DE OURO (o mesmo do firestore.rules)
//    Quem já usa o sistema não reconfigura nada. Todas as chaves de documento
//    continuam nascendo do id numérico antigo (`legacySchoolId`), então NENHUM dado
//    se move. Conta sem espaço nenhum segue funcionando pelo `system/schools_list`.
// ============================================================================

// Sem I, L, O, U, 0 e 1: são os caracteres que o professor erra ao copiar do papel.
const ESPACO_ALFABETO = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const ESPACO_TAM_CODIGO = 12;
const ESPACO_PREFIXO_HASH = 'profsis-v1:';

// --- Código: gerar, normalizar, exibir, hashear ------------------------------

function gerarCodigoEspaco() {
    const bytes = new Uint8Array(ESPACO_TAM_CODIGO);
    crypto.getRandomValues(bytes);
    let saida = '';
    // Módulo simples: o alfabeto tem 30 símbolos e 256 % 30 != 0, então há um viés
    // ínfimo. Para um código de convite (não é chave), isso não tem consequência —
    // a entropia continua em ~59 bits, e a chave da Fase 4 sai de PBKDF2 com salt.
    for (let i = 0; i < bytes.length; i++) saida += ESPACO_ALFABETO[bytes[i] % ESPACO_ALFABETO.length];
    return saida;
}

// O professor vai digitar com hífen, com espaço, em minúscula, copiado do WhatsApp.
// Tudo isso tem de dar no mesmo código.
function normalizarCodigo(codigo) {
    return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// "ABCD-EFGH-JKMN" — só para mostrar na tela.
function formatarCodigo(codigo) {
    const c = normalizarCodigo(codigo);
    return (c.match(/.{1,4}/g) || []).join('-');
}

async function hashCodigo(codigo) {
    const dados = new TextEncoder().encode(ESPACO_PREFIXO_HASH + normalizarCodigo(codigo));
    const digest = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _uuidEspaco() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

// Salt aleatório do espaço. Não protege o código (ele já é aleatório); serve para a
// Fase 4 derivar a chave da camada cifrada com PBKDF2(codigo, salt).
function _saltEspaco() {
    const s = new Uint8Array(16);
    crypto.getRandomValues(s);
    return Array.from(s).map(x => x.toString(16).padStart(2, '0')).join('');
}

// --- Criar, procurar, entrar -------------------------------------------------

// Cria o espaço e o índice do código. Devolve { espacoId, codigo }.
// O código é devolvido UMA vez: ele não é gravado no banco.
async function criarEspaco(dadosEscola, uidCriador) {
    const espacoId = _uuidEspaco();
    const codigo = gerarCodigoEspaco();
    const escola = dadosEscola || {};

    const espaco = {
        nome: escola.nome || 'Minha escola',
        nomeCompleto: escola.nomeCompleto || '',
        regiao: escola.regiao || '',
        email: escola.email || '',
        endereco: escola.endereco || '',
        telefone: escola.telefone || '',
        logoEscola: escola.logoEscola || '',
        salt: _saltEspaco(),
        criadoPorUid: uidCriador || (currentUser && currentUser.uid) || null,
        criadoEm: new Date().toISOString(),
        // Chaves de documento continuam nascendo daqui. Espaço novo usa o próprio id.
        legacySchoolId: escola.legacySchoolId || espacoId
    };

    await saveData('espacos', espacoId, espaco);
    await saveData('espacos_indice', await hashCodigo(codigo), { espacoId: espacoId, criadoEm: espaco.criadoEm });
    return { espacoId: espacoId, codigo: codigo, espaco: espaco };
}

// Procura o espaço pelo código digitado.
// Devolve { espacoId, espaco } | null (código errado) e lança se a rede falhou —
// dizer "código inválido" para quem está sem internet seria mentira.
async function buscarEspacoPorCodigo(codigo) {
    const limpo = normalizarCodigo(codigo);
    if (limpo.length < 6) return null;

    const antes = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = false;

    const indice = await getData('espacos_indice', await hashCodigo(limpo));
    if (window.falhaLeituraFirestore) {
        const negado = !!window.ultimaLeituraNegada;
        window.falhaLeituraFirestore = antes;
        // 'negado' = as Regras recusaram (falta publicar a versão nova no console).
        // 'rede'   = o banco não respondeu. São problemas de gente diferente.
        throw new Error(negado ? 'negado' : 'rede');
    }
    window.falhaLeituraFirestore = antes;

    if (!indice || !indice.espacoId) return null;
    const espaco = await getData('espacos', indice.espacoId);
    if (!espaco) return null;
    return { espacoId: indice.espacoId, espaco: espaco };
}

// Guarda o espaço no aparelho: é daqui que o timbre dos documentos sai quando não
// há rede, e é aqui que a Fase 4 vai buscar o código para derivar a chave.
async function lembrarEspaco(espacoId, codigo, espaco) {
    if (typeof metaSet !== 'function') return;
    try {
        await metaSet('espacoId', espacoId || null);
        if (codigo) await metaSet('codigoEspaco', normalizarCodigo(codigo));
        if (espaco) await metaSet('espacoInfo', espaco);
    } catch (e) { console.warn('[Espaços] Não consegui guardar o espaço no aparelho:', e); }
}

async function codigoEspacoGuardado() {
    if (typeof metaGet !== 'function') return null;
    try { return await metaGet('codigoEspaco'); } catch (e) { return null; }
}

// --- A ponte com o legado ----------------------------------------------------

// Espaço do usuário e, principalmente, o id que as chaves de documento usam.
// `legacySchoolId` é o que mantém app_data_school_<id>_gestor, maps_school_<id> e
// companhia apontando para os MESMOS documentos de sempre.
function resolverEspaco(user) {
    const u = user || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!u) return { espacoId: null, legacySchoolId: null };
    return {
        espacoId: u.espacoId || null,
        legacySchoolId: u.legacySchoolId || u.schoolId || null
    };
}

// Identidade da escola para cabeçalho e documentos. Prefere o espaço; cai no
// system/schools_list de sempre para quem ainda não tem espaço; e, sem rede, usa a
// cópia guardada no aparelho. Devolve o MESMO formato da entrada de schools_list,
// para as telas não precisarem saber de qual dos três lugares veio.
async function resolverEscolaAtual(user) {
    const u = user || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!u) return null;
    const ref = resolverEspaco(u);

    if (ref.espacoId) {
        const espaco = await getData('espacos', ref.espacoId);
        if (espaco) {
            lembrarEspaco(ref.espacoId, null, espaco);
            return Object.assign({ id: ref.legacySchoolId }, espaco);
        }
        if (typeof metaGet === 'function') {
            try {
                const cache = await metaGet('espacoInfo');
                if (cache) return Object.assign({ id: ref.legacySchoolId }, cache);
            } catch (e) {}
        }
    }

    const sData = await getData('system', 'schools_list');
    const schools = (sData && sData.list && Array.isArray(sData.list)) ? sData.list : [];
    return schools.find(s => s.id == ref.legacySchoolId) || null;
}

// Troca o código do espaço: cria o índice novo e apaga o antigo. Usado pelo gestor
// quando o código vaza. Quem já é membro não é desligado — a adesão está em
// access/<uid>, não no código.
async function gerarNovoCodigoEspaco(espacoId, codigoAtual) {
    const novo = gerarCodigoEspaco();
    await saveData('espacos_indice', await hashCodigo(novo), { espacoId: espacoId, criadoEm: new Date().toISOString() });
    if (codigoAtual) {
        try { await db.collection('espacos_indice').doc(await hashCodigo(codigoAtual)).delete(); }
        catch (e) { console.warn('[Espaços] Índice antigo continuou de pé:', e); }
    }
    await lembrarEspaco(espacoId, novo, null);
    return novo;
}
