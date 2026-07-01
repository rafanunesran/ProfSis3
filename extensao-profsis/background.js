// BACKGROUND SCRIPT - ProfSis3 Extension
// v2.0.1 - Login robusto com fallback + busca de dados do Firebase (REST API)

// ==================== CONFIGURAÇÃO FIREBASE ====================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCOP_TE6YvVkg9E2DFuwfF7jDkBgxyc8ls",
    authDomain: "profsis3.firebaseapp.com",
    databaseURL: "https://profsis3-default-rtdb.firebaseio.com",
    projectId: "profsis3",
    storageBucket: "profsis3.firebasestorage.app",
    messagingSenderId: "944272675889",
    appId: "1:944272675889:web:2afc6a869f363aefedf110",
    measurementId: "G-2EJ3T4DPLG"
};

// ==================== UTILITÁRIOS ====================

// Normaliza email: lowercase + remove espaços + tolera ausência de ".com"
function normalizeEmail(email) {
    if (!email) return '';
    return String(email).trim().toLowerCase().replace(/\.com$/, '');
}

// Traduz mensagens de erro do Firebase Auth para português
function traduzirErroAuth(erroMsg) {
    const mapa = {
        'EMAIL_NOT_FOUND': 'Email não cadastrado no Firebase Auth.',
        'INVALID_PASSWORD': 'Senha incorreta.',
        'USER_DISABLED': 'Conta desativada pelo administrador.',
        'TOO_MANY_ATTEMPTS_TRY_LATER': 'Muitas tentativas. Tente novamente mais tarde.',
        'EMAIL_EXISTS': 'Email já cadastrado.',
        'OPERATION_NOT_ALLOWED': 'Operação não permitida.',
        'INVALID_EMAIL': 'Email inválido.',
        'WEAK_PASSWORD': 'Senha muito fraca (mínimo 6 caracteres).',
        'NETWORK_REQUEST_FAILED': 'Erro de rede. Verifique sua conexão com a internet.',
        'INVALID_LOGIN_CREDENTIALS': 'Email ou senha incorretos.'
    };
    if (!erroMsg) return 'Erro desconhecido no login.';
    // Procura por correspondência exata ou parcial
    for (const [key, val] of Object.entries(mapa)) {
        if (erroMsg.includes(key)) return val;
    }
    return erroMsg;
}

// ==================== FUNÇÕES FIREBASE (REST API) ====================

// Login via Firebase Auth REST API
async function firebaseLogin(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`;
    console.log('[Login] Chamando Firebase Auth para:', email);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
        })
    });
    if (!response.ok) {
        const err = await response.json();
        const rawMsg = err.error?.message || 'Falha no login';
        console.error('[Login] Firebase Auth rejeitou:', rawMsg);
        throw new Error(traduzirErroAuth(rawMsg));
    }
    const data = await response.json();
    console.log('[Login] Firebase Auth OK! UID:', data.localId);
    return data; // { idToken, localId (uid), email, refreshToken, expiresIn, ... }
}

// Buscar documento no Firestore via REST API
async function firestoreGet(collection, docId, idToken) {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${collection}/${docId}`;
    console.log('[Firestore] GET', collection + '/' + docId);
    const response = await fetch(url, {
        method: 'GET',
        headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {}
    });
    if (response.status === 404) {
        console.warn('[Firestore] Documento não encontrado (404):', collection + '/' + docId);
        return null;
    }
    if (!response.ok) {
        const err = await response.text();
        console.error('[Firestore] GET falhou:', response.status, err);
        throw new Error(`Firestore GET falhou: ${response.status} ${err}`);
    }
    const data = await response.json();
    return parseFirestoreDocument(data);
}

// Converte documento Firestore (fields) para objeto JS simples
function parseFirestoreDocument(doc) {
    if (!doc || !doc.fields) return null;
    const result = {};
    for (const [key, value] of Object.entries(doc.fields)) {
        result[key] = parseFirestoreValue(value);
    }
    return result;
}

function parseFirestoreValue(value) {
    if (!value) return null;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.timestampValue !== undefined) return value.timestampValue;
    if (value.nullValue !== undefined) return null;
    if (value.arrayValue && value.arrayValue.values) {
        return value.arrayValue.values.map(v => parseFirestoreValue(v));
    }
    if (value.mapValue && value.mapValue.fields) {
        const obj = {};
        for (const [k, v] of Object.entries(value.mapValue.fields)) {
            obj[k] = parseFirestoreValue(v);
        }
        return obj;
    }
    return null;
}

// ==================== LISTENER DE MENSAGENS ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📨 Background recebeu:", request.action);
    
    // ---- LOGIN FIREBASE (com fallback legado) ----
    if (request.action === "FIREBASE_LOGIN") {
        const email = (request.email || '').trim().toLowerCase();
        const password = request.password || '';
        
        console.log('[Login] Iniciando login para:', email);
        
        if (!email || !password) {
            sendResponse({ success: false, error: 'Email e senha são obrigatórios.' });
            return true;
        }
        
        // Etapa 1: Tenta Firebase Auth
        firebaseLogin(email, password)
            .then(async (authData) => {
                console.log('[Login] Auth OK, salvando sessão...');
                // Salva sessão
                await new Promise(resolve => {
                    chrome.storage.local.set({
                        fb_idToken: authData.idToken,
                        fb_uid: authData.localId,
                        fb_email: authData.email,
                        fb_refreshToken: authData.refreshToken,
                        fb_expiresAt: Date.now() + (parseInt(authData.expiresIn, 10) * 1000)
                    }, resolve);
                });
                
                // Etapa 2: Busca perfil no Firestore
                try {
                    console.log('[Login] Buscando perfil no Firestore...');
                    const usersDoc = await firestoreGet('system', 'users_list', authData.idToken);
                    const users = (usersDoc && usersDoc.list) ? usersDoc.list : [];
                    console.log('[Login] Usuários no banco:', users.length, '| Emails:', users.map(u => u.email));
                    
                    const authEmailNorm = normalizeEmail(authData.email);
                    const profile = users.find(u => normalizeEmail(u.email) === authEmailNorm);
                    
                    if (profile) {
                        // Sincroniza o email do Auth no perfil
                        profile.email = authData.email;
                        // Garante que tem uid
                        if (!profile.uid) profile.uid = authData.localId;
                        
                        await new Promise(resolve => {
                            chrome.storage.local.set({ fb_profile: profile }, resolve);
                        });
                        console.log('[Login] ✅ Sucesso! Perfil:', profile.nome || profile.email);
                        sendResponse({ success: true, user: profile });
                    } else {
                        // Fallback: cria perfil mínimo baseado no Auth
                        console.warn('[Login] Perfil não encontrado no banco. Criando perfil mínimo...');
                        const minimalProfile = {
                            id: authData.localId,
                            uid: authData.localId,
                            email: authData.email,
                            nome: authData.email.split('@')[0],
                            role: 'professor',
                            schoolId: null
                        };
                        await new Promise(resolve => {
                            chrome.storage.local.set({ fb_profile: minimalProfile }, resolve);
                        });
                        console.log('[Login] ✅ Login com perfil mínimo:', minimalProfile.email);
                        sendResponse({ success: true, user: minimalProfile });
                    }
                } catch (err) {
                    console.error('[Login] Erro ao buscar perfil:', err.message);
                    // Mesmo com erro no Firestore, permite login com perfil mínimo
                    const minimalProfile = {
                        id: authData.localId,
                        uid: authData.localId,
                        email: authData.email,
                        nome: authData.email.split('@')[0],
                        role: 'professor',
                        schoolId: null
                    };
                    await new Promise(resolve => {
                        chrome.storage.local.set({ fb_profile: minimalProfile }, resolve);
                    });
                    sendResponse({ 
                        success: true, 
                        user: minimalProfile,
                        warning: 'Login OK, mas não foi possível buscar o perfil completo: ' + err.message
                    });
                }
            })
            .catch(err => {
                console.error('[Login] ❌ Falha no Firebase Auth:', err.message);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }
    
    // ---- LOGOUT ----
    if (request.action === "FIREBASE_LOGOUT") {
        chrome.storage.local.remove(['fb_idToken', 'fb_uid', 'fb_email', 'fb_refreshToken', 'fb_expiresAt', 'fb_profile'], () => {
            console.log('[Logout] Sessão limpa.');
            sendResponse({ success: true });
        });
        return true;
    }
    
    // ---- VERIFICAR SESSÃO ----
    if (request.action === "FIREBASE_CHECK_SESSION") {
        chrome.storage.local.get(['fb_idToken', 'fb_profile', 'fb_expiresAt'], (result) => {
            const isValid = result.fb_idToken && result.fb_expiresAt && (Date.now() < result.fb_expiresAt);
            console.log('[Session] Válida:', !!isValid, '| Expira em:', result.fb_expiresAt ? new Date(result.fb_expiresAt).toISOString() : 'n/a');
            sendResponse({
                loggedIn: !!isValid,
                user: result.fb_profile || null,
                idToken: isValid ? result.fb_idToken : null
            });
        });
        return true;
    }
    
    // ---- BUSCAR DADOS DO PROFESSOR NO FIREBASE ----
    if (request.action === "FIREBASE_GET_PROFESSOR_DATA") {
        chrome.storage.local.get(['fb_idToken', 'fb_profile'], async (result) => {
            if (!result.fb_idToken) {
                sendResponse({ success: false, error: 'Não logado.' });
                return;
            }
            try {
                const profile = result.fb_profile;
                const uid = profile.uid || profile.id;
                const key = 'app_data_' + uid;
                
                console.log('[Dados] Buscando professor:', key);
                // Busca dados do professor
                const profData = await firestoreGet('app_data', key, result.fb_idToken);
                
                // Busca dados da escola (gestor) para grade horária
                let gestorData = null;
                if (profile.schoolId) {
                    const gestorKey = `app_data_school_${profile.schoolId}_gestor`;
                    console.log('[Dados] Buscando gestor:', gestorKey);
                    gestorData = await firestoreGet('app_data', gestorKey, result.fb_idToken);
                }
                
                sendResponse({
                    success: true,
                    professorData: profData || {},
                    gestorData: gestorData || {},
                    profile: profile
                });
            } catch (err) {
                console.error('[Dados] Erro:', err);
                sendResponse({ success: false, error: err.message });
            }
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

console.log("✅ Background script carregado! (v2.0.1 - Login robusto com fallback)");