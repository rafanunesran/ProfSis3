// localdb.js — Armazenamento local do SisProf (IndexedDB)
// ============================================================================
//  POR QUE ESTE ARQUIVO EXISTE
//    A partir da adequação de setembro/2026, o dado pessoal do estudante não vai
//    mais para o Firestore: ele vive aqui, no aparelho do profissional.
//
//  POR QUE NÃO localStorage
//    Até agora o core.js espelhava cada documento salvo no localStorage
//    (core.js, dentro de saveData). O limite é de ~5 MB por origem e uma escola
//    grande já o estoura — o próprio código tinha um `catch` avisando "Cota de
//    armazenamento excedida". Como o localStorage passa a ser a ÚNICA cópia dos
//    estudantes, esse teto deixou de ser aceitável. O IndexedDB não tem esse
//    limite apertado, guarda objetos sem passar por JSON e ainda armazena
//    CryptoKey nativamente (usado pelo backup cifrado).
//
//  SE O INDEXEDDB NÃO ESTIVER DISPONÍVEL
//    Navegador antigo, aba anônima em certos navegadores, WebView restrito.
//    Em vez de quebrar o app, caímos de volta no localStorage. É pior, mas é o
//    comportamento que o professor já tinha — nunca deixamos ele sem sistema.
// ============================================================================

const LOCALDB_NOME = 'profsis';
const LOCALDB_VERSAO = 1;

let _localdbConexao = null;
let _localdbIndisponivel = false;

function localdbSuportado() {
    try {
        return !_localdbIndisponivel && typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
        return false;
    }
}

function localAbrir() {
    if (_localdbConexao) return Promise.resolve(_localdbConexao);
    if (!localdbSuportado()) return Promise.reject(new Error('IndexedDB indisponível'));

    return new Promise((resolve, reject) => {
        let req;
        try {
            req = indexedDB.open(LOCALDB_NOME, LOCALDB_VERSAO);
        } catch (e) {
            _localdbIndisponivel = true;
            return reject(e);
        }

        req.onupgradeneeded = (ev) => {
            const bd = ev.target.result;
            // docs: um registro por documento do app (o que antes ia para o Firestore).
            if (!bd.objectStoreNames.contains('docs')) bd.createObjectStore('docs', { keyPath: 'id' });
            // meta: chave/valor solto — flags de migração, chave de backup, escola local.
            if (!bd.objectStoreNames.contains('meta')) bd.createObjectStore('meta', { keyPath: 'chave' });
        };
        req.onsuccess = () => { _localdbConexao = req.result; resolve(_localdbConexao); };
        req.onerror = () => { _localdbIndisponivel = true; reject(req.error); };
        // Aba anônima do Firefox: o open() nunca resolve nem falha. Sem este limite o app
        // ficaria travado na abertura esperando para sempre.
        setTimeout(() => { if (!_localdbConexao) { _localdbIndisponivel = true; reject(new Error('IndexedDB não respondeu')); } }, 5000);
    });
}

function _localdbTransacao(store, modo, executar) {
    return localAbrir().then(bd => new Promise((resolve, reject) => {
        const tx = bd.transaction(store, modo);
        const req = executar(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

// --- Reserva em localStorage, usada só quando o IndexedDB não existe ---
function _reservaGet(prefixo, id) {
    try {
        const bruto = localStorage.getItem(prefixo + id);
        return bruto ? JSON.parse(bruto) : null;
    } catch (e) { return null; }
}
function _reservaSet(prefixo, id, valor) {
    try { localStorage.setItem(prefixo + id, JSON.stringify(valor)); return true; }
    catch (e) { console.warn('[localdb] Reserva em localStorage falhou (cota?):', e); return false; }
}

// --- API de documentos ---------------------------------------------------

async function localGet(id) {
    if (!localdbSuportado()) return _reservaGet('', id);
    try {
        const reg = await _localdbTransacao('docs', 'readonly', s => s.get(String(id)));
        return reg ? reg.dados : null;
    } catch (e) {
        console.warn('[localdb] Falha ao ler ' + id + ', usando reserva:', e);
        return _reservaGet('', id);
    }
}

async function localSet(id, dados) {
    if (!localdbSuportado()) return _reservaSet('', id, dados);
    try {
        await _localdbTransacao('docs', 'readwrite', s => s.put({
            id: String(id), dados: dados, atualizadoEm: new Date().toISOString()
        }));
        return true;
    } catch (e) {
        console.error('[localdb] Falha ao gravar ' + id + ':', e);
        return _reservaSet('', id, dados);
    }
}

async function localDel(id) {
    try { localStorage.removeItem(String(id)); } catch (e) {}
    if (!localdbSuportado()) return true;
    try { await _localdbTransacao('docs', 'readwrite', s => s.delete(String(id))); return true; }
    catch (e) { console.warn('[localdb] Falha ao apagar ' + id + ':', e); return false; }
}

async function localKeys() {
    if (!localdbSuportado()) return [];
    try { return await _localdbTransacao('docs', 'readonly', s => s.getAllKeys()); }
    catch (e) { return []; }
}

// --- API de metadados ----------------------------------------------------

async function metaGet(chave) {
    if (!localdbSuportado()) return _reservaGet('meta_', chave);
    try {
        const reg = await _localdbTransacao('meta', 'readonly', s => s.get(String(chave)));
        return reg ? reg.valor : null;
    } catch (e) { return _reservaGet('meta_', chave); }
}

async function metaSet(chave, valor) {
    if (!localdbSuportado()) return _reservaSet('meta_', chave, valor);
    try { await _localdbTransacao('meta', 'readwrite', s => s.put({ chave: String(chave), valor: valor })); return true; }
    catch (e) { return _reservaSet('meta_', chave, valor); }
}

// --- Preparação na primeira execução ------------------------------------

// Pede ao navegador que não descarte estes dados quando o disco apertar. Sem isso,
// o navegador pode limpar o IndexedDB sozinho para liberar espaço — e agora o que
// está aqui é a única cópia dos estudantes.
async function localPedirPersistencia() {
    try {
        if (navigator.storage && navigator.storage.persist) {
            const jaEra = await navigator.storage.persisted();
            if (jaEra) return true;
            const concedido = await navigator.storage.persist();
            console.log('[localdb] Armazenamento persistente: ' + (concedido ? 'concedido' : 'negado'));
            return concedido;
        }
    } catch (e) { console.warn('[localdb] Não foi possível pedir persistência:', e); }
    return false;
}

// Traz para o IndexedDB o espelho que o saveData vinha mantendo no localStorage,
// e limpa a origem. Roda uma vez só (marca em meta.espelhoImportado).
async function localImportarEspelhoAntigo() {
    if (!localdbSuportado()) return 0;
    if (await metaGet('espelhoImportado')) return 0;

    const alvos = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const chave = localStorage.key(i);
            if (!chave) continue;
            if (chave.indexOf('app_data') === 0 || chave.indexOf('maps_school_') === 0 ||
                chave.indexOf('backup_') === 0) alvos.push(chave);
        }
    } catch (e) { return 0; }

    let trazidos = 0;
    for (const chave of alvos) {
        try {
            const bruto = localStorage.getItem(chave);
            if (!bruto) continue;
            // Não sobrescreve o que já estiver no IndexedDB: o de lá é sempre mais recente.
            if (await localGet(chave)) { localStorage.removeItem(chave); continue; }
            await localSet(chave, JSON.parse(bruto));
            localStorage.removeItem(chave);
            trazidos++;
        } catch (e) { console.warn('[localdb] Não consegui importar ' + chave + ':', e); }
    }

    await metaSet('espelhoImportado', new Date().toISOString());
    if (trazidos) console.log('[localdb] ' + trazidos + ' documento(s) trazidos do localStorage.');
    return trazidos;
}

async function localdbPreparar() {
    if (!localdbSuportado()) {
        console.warn('[localdb] IndexedDB indisponível — usando localStorage como reserva.');
        return false;
    }
    try {
        await localAbrir();
        await localPedirPersistencia();
        await localImportarEspelhoAntigo();
        return true;
    } catch (e) {
        console.warn('[localdb] Preparação falhou, seguindo com a reserva:', e);
        return false;
    }
}
