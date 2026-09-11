// terminais.js — Limite de telas por conta (Fase 7)
// ============================================================================
//  O QUE ISTO FAZ
//    A conta passa a valer para um numero de terminais definido pelo super admin:
//    ausente = 1, zero = ilimitado. Entrar numa maquina alem do limite exige
//    CONFIRMACAO e toma a vaga do terminal visto ha' mais tempo, que descobre isso
//    na abertura seguinte.
//
//  O QUE ISTO NAO E'
//    Barreira de seguranca. O dono da conta tem a senha e a chave de cifra; quem
//    quiser burlar o limite consegue. Serve contra o descuido e o compartilhamento
//    casual - e' regra de uso, e esta' escrito assim nas Regras tambem.
//
//  PRINCIPIO: NUNCA TRANCAR POR ACIDENTE
//    Falha de rede, leitura negada, conta sem uid: tudo isso libera o acesso, nao
//    bloqueia. E vaga parada ha' 30 dias volta sozinha para o bolo - senao um
//    computador quebrado tranca o professor para fora do proprio trabalho.
// ============================================================================

const TERMINAL_DIAS_OCIOSO = 30;

// --- Identidade deste terminal ----------------------------------------------

async function idDesteTerminal() {
    if (window._idTerminal) return window._idTerminal;
    let id = null;
    try { if (typeof metaGet === 'function') id = await metaGet('terminalId'); } catch (e) {}
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID()
                                : Math.random().toString(36).slice(2) + Date.now().toString(36));
        try { if (typeof metaSet === 'function') await metaSet('terminalId', id); } catch (e) {}
    }
    window._idTerminal = id;
    return id;
}

// Nome que a pessoa reconhece na lista ("Chrome no Windows"), sem identificar nada.
function apelidoDesteTerminal() {
    const ua = navigator.userAgent || '';
    const navegador = /Edg\//.test(ua) ? 'Edge'
                    : /OPR\//.test(ua) ? 'Opera'
                    : /Chrome\//.test(ua) ? 'Chrome'
                    : /Firefox\//.test(ua) ? 'Firefox'
                    : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    const sistema = /Android/.test(ua) ? 'Android'
                  : /iPhone|iPad/.test(ua) ? 'iPhone/iPad'
                  : /Windows/.test(ua) ? 'Windows'
                  : /Mac OS/.test(ua) ? 'Mac'
                  : /Linux/.test(ua) ? 'Linux' : 'este aparelho';
    return navegador + ' no ' + sistema;
}

function _uidAtual() {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid;
    }
    return (currentUser && currentUser.uid) || null;
}

// --- Limite da conta ---------------------------------------------------------

// Ausente = 1 terminal. Zero = ilimitado. So' o super admin escreve este campo.
async function limiteTerminais(uid) {
    try {
        const doc = await getData('access', uid);
        if (!doc) return 1;
        const n = doc.limiteTerminais;
        if (n === 0) return 0;
        return (typeof n === 'number' && n > 0) ? n : 1;
    } catch (e) { return 1; }
}

// --- A vaga ------------------------------------------------------------------

function _vagaOciosa(t) {
    return !t.visto || t.visto < (Date.now() - TERMINAL_DIAS_OCIOSO * 86400000);
}

// Devolve { estado: 'ok' | 'precisa-confirmar', ocupados, limite }.
// 'ok' em qualquer duvida: ver o PRINCIPIO no topo do arquivo.
async function reivindicarTerminal() {
    if (!currentUser || currentUser.role === 'super_admin') return { estado: 'ok' };
    const uid = _uidAtual();
    if (!uid) return { estado: 'ok' };

    const limite = await limiteTerminais(uid);
    if (limite === 0) return { estado: 'ok' };

    const meu = await idDesteTerminal();
    const antes = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = false;
    const doc = await getData('terminais', uid);
    const falhou = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = antes;
    if (falhou) return { estado: 'ok' };          // rede ruim nao tranca ninguem

    let lista = (doc && Array.isArray(doc.lista)) ? doc.lista.filter(t => t && t.id) : [];
    lista = lista.filter(t => t.id === meu || !_vagaOciosa(t));

    const eu = lista.find(t => t.id === meu);
    if (eu) {
        eu.visto = Date.now();
        eu.apelido = apelidoDesteTerminal();
        await _gravarLista(uid, lista);
        return { estado: 'ok' };
    }

    if (lista.length < limite) {
        lista.push({ id: meu, apelido: apelidoDesteTerminal(), desde: Date.now(), visto: Date.now() });
        await _gravarLista(uid, lista);
        return { estado: 'ok' };
    }

    return { estado: 'precisa-confirmar', ocupados: lista, limite: limite };
}

// Toma a vaga do terminal visto ha' mais tempo. O derrubado NAO perde nada: a copia
// dele continua no aparelho, e ele pode assumir de volta.
async function assumirVaga() {
    const uid = _uidAtual();
    if (!uid) return false;
    const meu = await idDesteTerminal();
    const limite = await limiteTerminais(uid);
    const doc = await getData('terminais', uid);
    let lista = (doc && Array.isArray(doc.lista)) ? doc.lista.filter(t => t && t.id && t.id !== meu) : [];

    lista.sort((a, b) => (b.visto || 0) - (a.visto || 0));   // mais recentes primeiro
    if (limite > 0) lista = lista.slice(0, Math.max(0, limite - 1));

    lista.push({ id: meu, apelido: apelidoDesteTerminal(), desde: Date.now(), visto: Date.now() });
    await _gravarLista(uid, lista);
    return true;
}

// Este terminal ainda tem vaga? Usado ao voltar para a aba.
async function terminalAindaTemVaga() {
    if (!currentUser || currentUser.role === 'super_admin') return true;
    const uid = _uidAtual();
    if (!uid) return true;
    if (await limiteTerminais(uid) === 0) return true;

    const meu = await idDesteTerminal();
    const antes = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = false;
    const doc = await getData('terminais', uid);
    const falhou = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = antes;
    if (falhou || !doc) return true;

    return (doc.lista || []).some(t => t && t.id === meu);
}

async function _gravarLista(uid, lista) {
    try { await saveData('terminais', String(uid), { lista: lista, atualizadoEm: new Date().toISOString() }); }
    catch (e) { console.warn('[Terminais] Não consegui gravar a lista:', e); }
}

// Suporte: o super admin libera uma vaga presa (computador perdido, por exemplo).
async function liberarVagaTerminal(uid, terminalId) {
    const doc = await getData('terminais', uid);
    const lista = ((doc && doc.lista) || []).filter(t => t && t.id !== terminalId);
    await _gravarLista(uid, lista);
    return lista.length;
}
