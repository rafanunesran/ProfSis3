// BACKGROUND SCRIPT - ProfSis3 Extension
// v2.6.3 - Prioriza escrever via aba do ProfSis aberta (sessão sempre correta) em vez do token cacheado, que pode ficar dessincronizado

// URLs do ProfSis para buscar abas abertas
const PROFSIS_URL_PATTERNS = [
    /localhost/i,
    /127\.0\.0\.1/i,
    /firebaseapp\.com/i,
    /profsis3\.com/i,
    /web\.app/i,
    /github\.io/i
];

// Verifica se uma URL é do ProfSis
function isProfSisUrl(url) {
    if (!url) return false;
    return PROFSIS_URL_PATTERNS.some(pattern => pattern.test(url));
}

// ==================== ESCRITA DIRETA NO FIRESTORE (EXTRAIR ALUNOS) ====================
// Reaproveita a sessão do Firebase Auth capturada do ProfSis (refresh token) para
// ler/escrever no Firestore direto do background, sem precisar da aba do ProfSis aberta.

const FIRESTORE_PROJECT_ID = 'profsis3';

// Troca o refresh token por um ID token válido, renovando e cacheando conforme necessário.
async function getValidFirebaseAuth() {
    const stored = await chrome.storage.local.get(['profsis_firebase_session', 'profsis_id_token_cache']);
    const session = stored.profsis_firebase_session;
    if (!session || !session.refreshToken || !session.apiKey) return null;

    const cache = stored.profsis_id_token_cache;
    const now = Date.now();
    if (cache && cache.idToken && cache.expiresAt && cache.expiresAt > now + 60000) {
        return { idToken: cache.idToken, uid: cache.uid };
    }

    let resp;
    try {
        resp = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(session.apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken)
        });
    } catch (e) {
        return null;
    }
    if (!resp.ok) return null;

    const json = await resp.json();
    const idToken = json.id_token;
    const expiresAt = now + ((parseInt(json.expires_in, 10) || 3600) * 1000);

    await chrome.storage.local.set({
        profsis_firebase_session: { ...session, refreshToken: json.refresh_token || session.refreshToken },
        profsis_id_token_cache: { idToken: idToken, uid: json.user_id, expiresAt: expiresAt }
    });
    return { idToken: idToken, uid: json.user_id };
}

// ---- Serialização de valores Firestore (REST) ↔ objetos JS simples ----
function toFirestoreValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
    if (typeof v === 'object') {
        const fields = {};
        Object.keys(v).forEach(k => { if (v[k] !== undefined) fields[k] = toFirestoreValue(v[k]); });
        return { mapValue: { fields: fields } };
    }
    return { nullValue: null };
}

function fromFirestoreValue(fv) {
    if (!fv) return null;
    if ('nullValue' in fv) return null;
    if ('booleanValue' in fv) return fv.booleanValue;
    if ('integerValue' in fv) return parseInt(fv.integerValue, 10);
    if ('doubleValue' in fv) return fv.doubleValue;
    if ('stringValue' in fv) return fv.stringValue;
    if ('timestampValue' in fv) return fv.timestampValue;
    if ('arrayValue' in fv) return (fv.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue' in fv) {
        const obj = {};
        const fields = fv.mapValue.fields || {};
        Object.keys(fields).forEach(k => { obj[k] = fromFirestoreValue(fields[k]); });
        return obj;
    }
    return null;
}

function firestoreDocToPlainObject(doc) {
    const fields = (doc && doc.fields) || {};
    const obj = {};
    Object.keys(fields).forEach(k => { obj[k] = fromFirestoreValue(fields[k]); });
    return obj;
}

// Lê um documento em app_data/{docId}. Retorna null se não existir.
async function firestoreGetDoc(docId, idToken) {
    const url = 'https://firestore.googleapis.com/v1/projects/' + FIRESTORE_PROJECT_ID + '/databases/(default)/documents/app_data/' + encodeURIComponent(docId);
    const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + idToken } });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error('Erro ao ler dados no Firestore (' + resp.status + ')');
    const json = await resp.json();
    return firestoreDocToPlainObject(json);
}

// Sobrescreve por completo o documento em app_data/{docId} (mesma semântica do saveData() do app: set() integral).
async function firestoreSetDoc(docId, dataObj, idToken) {
    const url = 'https://firestore.googleapis.com/v1/projects/' + FIRESTORE_PROJECT_ID + '/databases/(default)/documents/app_data/' + encodeURIComponent(docId);
    const fields = {};
    Object.keys(dataObj).forEach(k => { if (dataObj[k] !== undefined) fields[k] = toFirestoreValue(dataObj[k]); });
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + idToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields })
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error('Erro ao salvar no Firestore (' + resp.status + '): ' + errText);
    }
}

// ---- Lógica de atualização de alunos (cria/reativa/remaneja/transfere) ----
function normalizeTurmaNome(t) {
    return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
}
function normalizeAlunoNome(nome) {
    return (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Encontra a turma física (local) correspondente ao nome extraído da SED.
// - Prioriza correspondência EXATA (evita casar "6" com "6ºA" e "6ºB" ao mesmo tempo).
// - Se ainda houver mais de uma turma FÍSICA candidata (masterId diferente, ou id diferente
//   quando não há masterId), retorna erro em vez de aplicar em todas (evita contaminação cruzada
//   entre turmas, que já causou remanejamentos duplicados/errados).
// - Turmas que só diferem pela disciplina mas compartilham o mesmo masterId contam como UMA turma física.
function encontrarAlvoTurma(turmasLocais, turmaSED) {
    const sedNorm = normalizeTurmaNome(turmaSED);
    const comNorm = (turmasLocais || [])
        .map(t => ({ turma: t, norm: normalizeTurmaNome((t.nome || '').split('-')[0]) }))
        .filter(x => x.norm);

    let candidatos = comNorm.filter(x => x.norm === sedNorm);
    if (candidatos.length === 0) {
        candidatos = comNorm.filter(x => sedNorm.includes(x.norm) || x.norm.includes(sedNorm));
    }
    if (candidatos.length === 0) {
        return { erro: 'Nenhuma turma local corresponde a "' + turmaSED + '". Verifique se a turma está cadastrada no ProfSis.' };
    }

    const grupos = new Map();
    candidatos.forEach(({ turma }) => {
        const key = String(turma.masterId || turma.id);
        if (!grupos.has(key)) grupos.set(key, turma);
    });

    if (grupos.size > 1) {
        const nomes = [...new Set(candidatos.map(c => c.turma.nome))].join(', ');
        return { erro: 'Mais de uma turma local corresponde a "' + turmaSED + '" (' + nomes + '). Ajuste os nomes das turmas no ProfSis para que fiquem inequívocos.' };
    }

    const turma = grupos.values().next().value;
    return { masterId: turma.masterId || null, turmaId: turma.id, turmaNomeLocal: turma.nome, turmaDisciplinaLocal: turma.disciplina || null };
}

// Cria/reativa alunos em `estudantes` (array mutado in-place) para a turma `turmaId`.
// Lógica puramente aditiva, sem nenhum efeito colateral em quem já está ativo:
// - Aluno extraído NÃO existe no sistema -> cria, já na turma alvo, status Ativo.
// - Aluno extraído já existe e está Ativo -> não faz NADA (não mexe em id_turma, não duplica).
// - Aluno extraído já existe mas não está Ativo -> só atualiza o status para Ativo (reativa).
// Nunca marca ninguém como "Transferido" e nunca move o id_turma de um aluno já ativo - isso
// já causou remanejamentos e transferências indevidas quando a raspagem da SED não é 100% confiável.
function aplicarAtualizacaoAlunos(estudantes, turmaId, alunosExtraidos) {
    let adicionados = 0, reativados = 0;

    alunosExtraidos.forEach(aExtraido => {
        const nomeUpper = normalizeAlunoNome(aExtraido.nome);
        const existente = estudantes.find(e => normalizeAlunoNome(e.nome_completo) === nomeUpper);
        if (existente) {
            if (existente.status !== 'Ativo') {
                existente.status = 'Ativo';
                reativados++;
            }
            // já ativo: não faz nada
        } else {
            estudantes.push({ id: Date.now() + Math.floor(Math.random() * 10000), id_turma: turmaId, nome_completo: aExtraido.nome, status: 'Ativo' });
            adicionados++;
        }
    });

    return { adicionados, reativados, turmasAtualizadas: 1 };
}

// Escreve direto no Firestore: turma vinculada à gestão (masterId) vai para o documento
// compartilhado da escola (visível a todos os professores); turma própria vai pro documento do professor.
async function atualizarAlunosDiretoFirebase(payload) {
    const alunos = payload && payload.alunos;
    const turmaSED = payload && payload.turmaSED;
    if (!alunos || !turmaSED) throw new Error('Payload inválido.');

    const auth = await getValidFirebaseAuth();
    if (!auth) {
        const err = new Error('Sem sessão do Firebase salva. Faça login no ProfSis pelo menos uma vez.');
        err.code = 'NO_SESSION';
        throw err;
    }

    const userStorage = await chrome.storage.local.get(['profsis_user']);
    const user = userStorage.profsis_user;
    // Se a sessão cacheada (profsis_user) estiver dessincronizada de quem o refresh token
    // realmente autentica (auth.uid) - ex: token de uma conta antiga/errada que ficou salvo -
    // usar user.uid aqui leria/escreveria no documento ERRADO. Prioriza a identidade real do token.
    if (user && user.uid && user.uid !== auth.uid) {
        console.warn('[Background] ⚠️ profsis_user.uid (' + user.uid + ') difere do uid do token atual (' + auth.uid + '). Usando o uid do token.');
    }
    const uid = auth.uid || (user && user.uid);
    if (!uid) throw new Error('Usuário do ProfSis não identificado.');

    const profDocId = 'app_data_' + uid;
    const profData = await firestoreGetDoc(profDocId, auth.idToken);
    if (!profData) {
        // O token é válido mas não existe documento para esse uid: a sessão salva pela extensão
        // está incorreta/desatualizada (ex: de outra conta). Descarta para não ficar reusando essa
        // sessão quebrada; da próxima vez que uma aba do ProfSis logada estiver aberta, ela repassa
        // a sessão certa de novo automaticamente.
        await chrome.storage.local.remove(['profsis_firebase_session', 'profsis_id_token_cache']);
        const err = new Error('A sessão salva pela extensão não corresponde a nenhuma conta válida (documento ' + profDocId + ' não existe). Ela foi descartada - abra o ProfSis, faça login e tente de novo.');
        err.code = 'NO_SESSION';
        throw err;
    }

    const alvo = encontrarAlvoTurma(profData.turmas || [], turmaSED);
    if (alvo.erro) throw new Error(alvo.erro);

    const debugInfo = {
        uid: uid, profDocId: profDocId, turmaSED: turmaSED,
        masterId: alvo.masterId || null, turmaId: alvo.turmaId || null,
        turmaNomeLocal: alvo.turmaNomeLocal || null, turmaDisciplinaLocal: alvo.turmaDisciplinaLocal || null,
        schoolId: (user && user.schoolId) || null
    };

    // Turma vinculada à gestão: escreve no documento compartilhado da escola (visível a todos os professores)
    if (alvo.masterId) {
        if (!user || !user.schoolId) throw new Error('Escola do usuário não identificada (uid ' + uid + '); não é possível compartilhar os alunos.');
        const gestorDocId = 'app_data_school_' + user.schoolId + '_gestor';
        const gestorData = await firestoreGetDoc(gestorDocId, auth.idToken);
        if (!gestorData) throw new Error('Não foi possível ler os dados da escola no Firestore (documento ' + gestorDocId + ').');
        if (!gestorData.estudantes) gestorData.estudantes = [];

        const resultado = aplicarAtualizacaoAlunos(gestorData.estudantes, alvo.masterId, alunos);
        await firestoreSetDoc(gestorDocId, gestorData, auth.idToken);
        return { ...resultado, debugInfo: { ...debugInfo, gestorDocId } };
    }

    // Turma própria (sem vínculo com a gestão): escreve no documento privado do professor
    if (!profData.estudantes) profData.estudantes = [];
    const resultado = aplicarAtualizacaoAlunos(profData.estudantes, alvo.turmaId, alunos);
    await firestoreSetDoc(profDocId, profData, auth.idToken);
    return { ...resultado, debugInfo };
}

// ==================== LISTENER DE MENSAGENS ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📨 Background recebeu:", request.action);
    
    // ---- PROFSIS: Usuário logado detectado ----
    if (request.action === "PROFSIS_USER_LOGGED_IN") {
        console.log("[Background] ProfSis logado:", request.user.nome || request.user.email);
        chrome.storage.local.set({ 
            profsis_user: request.user,
            profsis_logged_in: true,
            profsis_login_time: Date.now()
        }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    // ---- PROFSIS: Usuário não logado ----
    if (request.action === "PROFSIS_USER_NOT_LOGGED") {
        console.log("[Background] ProfSis NÃO logado");
        chrome.storage.local.set({ 
            profsis_logged_in: false,
            profsis_user: null
        }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    // ---- PROFSIS: Sessão do Firebase Auth (refresh token) para escrita direta no Firestore ----
    if (request.action === "PROFSIS_FIREBASE_SESSION") {
        if (request.session && request.session.refreshToken && request.session.apiKey) {
            console.log("[Background] Sessão do Firebase recebida do ProfSis (uid:", request.session.uid, ")");
            chrome.storage.local.set({ profsis_firebase_session: request.session }, () => {
                sendResponse({ success: true });
            });
        } else {
            sendResponse({ success: false, error: 'Sessão inválida.' });
        }
        return true;
    }

    // ---- PROFSIS: Dados completos do app recebidos ----
    if (request.action === "PROFSIS_DATA_UPDATE") {
        console.log("[Background] Dados do ProfSis recebidos:", Object.keys(request.appData || {}).length, "chaves");
        chrome.storage.local.set({ 
            profsis_app_data: request.appData,
            profsis_user: request.profile,
            profsis_data_time: Date.now()
        }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    // ---- SED: Verificar status do login do ProfSis ----
    if (request.action === "CHECK_PROFSIS_LOGIN") {
        console.log("[Background] Verificando login do ProfSis...");
        
        // Primeiro verifica no storage se já temos dados
        chrome.storage.local.get(['profsis_logged_in', 'profsis_user', 'profsis_app_data'], (result) => {
            if (result.profsis_logged_in && result.profsis_user) {
                console.log("[Background] Login encontrado no storage:", result.profsis_user.nome || result.profsis_user.email);
                sendResponse({
                    loggedIn: true,
                    user: result.profsis_user,
                    appData: result.profsis_app_data || null,
                    hasData: !!result.profsis_app_data
                });
            } else {
                // Tenta buscar uma aba do ProfSis aberta e pedir status
                chrome.tabs.query({}, (tabs) => {
                    const profsisTab = tabs.find(t => isProfSisUrl(t.url));
                    if (profsisTab) {
                        console.log("[Background] Aba ProfSis encontrada:", profsisTab.url);
                        // Injeta script para verificar login
                        chrome.scripting.executeScript({
                            target: { tabId: profsisTab.id },
                            func: () => {
                                const userJson = localStorage.getItem('app_current_user');
                                if (userJson) {
                                    try {
                                        const user = JSON.parse(userJson);
                                        if (user && user.email) {
                                            // Pega também os dados do app
                                            const userId = user.id || user.uid || 'unknown';
                                            const dataKey = 'app_data_' + userId;
                                            const dataJson = localStorage.getItem(dataKey);
                                            let appData = null;
                                            if (dataJson) {
                                                try { appData = JSON.parse(dataJson); } catch(e) {}
                                            }
                                            return { loggedIn: true, user: user, appData: appData };
                                        }
                                    } catch (e) {}
                                }
                                return { loggedIn: false };
                            }
                        }, (results) => {
                            if (chrome.runtime.lastError || !results || !results[0]) {
                                console.log("[Background] Não foi possível ler a aba ProfSis");
                                sendResponse({ loggedIn: false, tabFound: true });
                            } else {
                                const data = results[0].result;
                                if (data && data.loggedIn) {
                                    console.log("[Background] Login confirmado na aba:", data.user.nome || data.user.email);
                                    // Salva no storage
                                    chrome.storage.local.set({
                                        profsis_logged_in: true,
                                        profsis_user: data.user,
                                        profsis_app_data: data.appData || null
                                    });
                                    sendResponse({
                                        loggedIn: true,
                                        user: data.user,
                                        appData: data.appData,
                                        hasData: !!data.appData
                                    });
                                } else {
                                    console.log("[Background] Aba ProfSis aberta mas não logado");
                                    sendResponse({ loggedIn: false, tabFound: true });
                                }
                            }
                        });
                    } else {
                        console.log("[Background] Nenhuma aba ProfSis encontrada");
                        sendResponse({ loggedIn: false, tabFound: false });
                    }
                });
            }
        });
        return true;
    }
    
    // ---- SED: Abrir site do ProfSis ----
    if (request.action === "OPEN_PROFSIS") {
        // Tenta encontrar a URL do ProfSis (localhost primeiro, depois produção)
        chrome.tabs.query({}, (tabs) => {
            const profsisTab = tabs.find(t => isProfSisUrl(t.url));
            if (profsisTab) {
                // Já tem aba aberta, foca nela
                console.log("[Background] Focando aba ProfSis existente");
                chrome.tabs.update(profsisTab.id, { active: true });
                chrome.windows.update(profsisTab.windowId, { focused: true });
                sendResponse({ success: true, tabId: profsisTab.id });
            } else {
                // Abre nova aba - tenta localhost primeiro
                chrome.tabs.create({ url: 'http://localhost:5500' });
                sendResponse({ success: true, newTab: true });
            }
        });
        return true;
    }
    
    // ---- SED: Pedir dados atualizados ao ProfSis ----
    if (request.action === "REQUEST_PROFSIS_DATA") {
        chrome.tabs.query({}, (tabs) => {
            const profsisTab = tabs.find(t => isProfSisUrl(t.url));
            if (profsisTab) {
                chrome.tabs.sendMessage(profsisTab.id, { action: "PROFSIS_REQUEST_DATA" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("[Background] Não foi possível pedir dados ao ProfSis:", chrome.runtime.lastError.message);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    sendResponse({ success: true, sent: true });
                });
            } else {
                sendResponse({ success: false, error: 'ProfSis não está aberto' });
            }
        });
        return true;
    }
    
    // ---- LOGOUT ----
    if (request.action === "PROFSIS_LOGOUT") {
        chrome.storage.local.remove(['profsis_user', 'profsis_logged_in', 'profsis_app_data', 'profsis_login_time', 'profsis_data_time', 'profsis_firebase_session', 'profsis_id_token_cache'], () => {
            console.log('[Logout] Dados do ProfSis limpos.');
            sendResponse({ success: true });
        });
        return true;
    }

    // ---- SED: Extrair Alunos - atualizar alunos direto no banco do ProfSis ----
    if (request.action === "UPDATE_STUDENTS_DB") {
        console.log("[Background] Atualizando alunos no banco do ProfSis:", request.payload.turmaSED);

        const viaFirestoreDireto = () => {
            atualizarAlunosDiretoFirebase(request.payload).then(resultado => {
                console.log("[Background] Escrita direta no Firestore concluída:", resultado);
                sendResponse({ success: true, direct: true, resultado: resultado });
                chrome.tabs.query({}, (tabs) => {
                    tabs.filter(t => isProfSisUrl(t.url)).forEach(t => {
                        chrome.tabs.sendMessage(t.id, { action: 'PROFSIS_REFRESH_DATA' }, () => { void chrome.runtime.lastError; });
                    });
                });
            }).catch(errDireto => {
                console.error("[Background] Falha ao atualizar alunos (Firestore direto):", errDireto.message);
                sendResponse({ success: false, error: errDireto.message });
            });
        };

        // [PRIORIDADE] Se houver uma aba do ProfSis aberta e logada, usa ela: a sessão da aba é
        // sempre a conta que está realmente logada agora. O token cacheado da extensão (usado no
        // caminho "direto no Firestore") já causou escritas na conta errada quando ficou
        // dessincronizado da sessão atual - por isso só é usado quando não há aba aberta.
        chrome.tabs.query({}, (tabs) => {
            const profsisTab = tabs.find(t => isProfSisUrl(t.url));
            if (!profsisTab) {
                viaFirestoreDireto();
                return;
            }
            chrome.tabs.sendMessage(profsisTab.id, {
                action: "PROFSIS_UPDATE_STUDENTS",
                payload: request.payload
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Background] Aba do ProfSis não respondeu, tentando Firestore direto:", chrome.runtime.lastError.message);
                    viaFirestoreDireto();
                } else if (response && response.success) {
                    sendResponse({ success: true, direct: false, resultado: response.resultado });
                } else {
                    sendResponse({ success: false, error: (response && response.error) || 'ProfSis não processou a atualização.' });
                }
            });
        });
        return true;
    }

    // ---- AÇÕES LEGADAS (compatibilidade) ----
    if (request.action === "START_RPA_CHAMADA" || request.action === "START_RPA_LOTE") {
        const task = request.payload;
        chrome.storage.local.set({ 
            rpaTask: task, 
            rpaType: request.action === "START_RPA_CHAMADA" ? 'CHAMADA' : 'LOTE',
            rpaTimestamp: Date.now()
        }, () => {
            chrome.tabs.create({ url: 'https://saladofuturo.educacao.sp.gov.br/' });
            if (sendResponse) sendResponse({ received: true });
        });
        return true;
    } 
    else if (request.action === "EXT_SAVE_PAYLOAD" || request.action === "SYNC_DATA") {
        chrome.storage.local.get(['rpa_data_history', 'rpa_data'], (result) => {
            let history = result.rpa_data_history || {};
            const payload = request.payload;
            const date = payload && payload.data;
            
            if (date) {
                history[date] = payload;
                const keys = Object.keys(history).sort();
                while(keys.length > 30) { delete history[keys.shift()]; }
                
                chrome.storage.local.set({ 
                    rpa_data_history: history,
                    rpa_data: payload,
                    rpaTask: payload,
                    rpaType: 'CHAMADA',
                    rpaTimestamp: Date.now()
                }, () => {
                    if (sendResponse) sendResponse({ success: true });
                });
            } else {
                chrome.storage.local.set({ 
                    rpaTask: payload, 
                    rpaType: 'CHAMADA',
                    rpaTimestamp: Date.now()
                }, () => {
                    if (sendResponse) sendResponse({ success: true });
                });
            }
        });
        return true;
    }
    else if (request.action === "GET_DATA") {
        chrome.storage.local.get(['rpa_data_history', 'rpa_data', 'rpa_done_marks', 'rpa_imported_students'], (result) => {
            if (sendResponse) sendResponse(result || {});
        });
        return true;
    }
    else if (request.action === "GET_HISTORY") {
        chrome.storage.local.get(['rpa_data_history'], (result) => {
            if (sendResponse) sendResponse(result || {});
        });
        return true;
    }
    else if (request.action === "SAVE_MARKS") {
        chrome.storage.local.set({ rpa_done_marks: request.marks }, () => {
            if (sendResponse) sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === "SAVE_STUDENTS") {
        chrome.storage.local.set({ rpa_imported_students: request.payload }, () => {
            if (sendResponse) sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === "FETCH_TURMAS") {
        sendResponse({ success: false, error: 'Função desativada - use o content script na SED.' });
    }
    else {
        console.warn("⚠️ Ação desconhecida recebida:", request.action);
        if (sendResponse) sendResponse({ success: false, error: 'Ação desconhecida: ' + request.action });
    }
});

console.log("✅ Background script carregado! (v2.6.3 - Escrita direta no Firestore)");
