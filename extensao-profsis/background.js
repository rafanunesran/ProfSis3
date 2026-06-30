// BACKGROUND SCRIPT - ProfSis3 Extension
// Gerencia mensagens entre content scripts, storage e Firebase (Auth + Firestore REST)

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

// ==================== FUNÇÕES FIREBASE (REST API) ====================

// Login via Firebase Auth REST API
async function firebaseLogin(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`;
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
        throw new Error(err.error?.message || 'Falha no login');
    }
    return await response.json(); // { idToken, localId (uid), email, ... }
}

// Buscar documento no Firestore via REST API
async function firestoreGet(collection, docId, idToken) {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${collection}/${docId}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {}
    });
    if (response.status === 404) return null;
    if (!response.ok) {
        const err = await response.text();
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
    // Firestore REST retorna { valueType: value }
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
    
    // ---- LOGIN FIREBASE ----
    if (request.action === "FIREBASE_LOGIN") {
        firebaseLogin(request.email, request.password)
            .then(authData => {
                // Salva sessão
                chrome.storage.local.set({
                    fb_idToken: authData.idToken,
                    fb_uid: authData.localId,
                    fb_email: authData.email,
                    fb_refreshToken: authData.refreshToken,
                    fb_expiresAt: Date.now() + (parseInt(authData.expiresIn, 10) * 1000)
                }, () => {
                    // Busca perfil do usuário no Firestore
                    firestoreGet('system', 'users_list', authData.idToken)
                        .then(usersDoc => {
                            const users = (usersDoc && usersDoc.list) ? usersDoc.list : [];
                            // Comparação tolerante: case-insensitive e tolera ausência de ".com"
                            // (necessário porque emails antigos no banco podem não ter ".com")
                            const normalizeEmail = (e) => (e || '').trim().toLowerCase().replace(/\.com$/, '');
                            const authEmailNorm = normalizeEmail(authData.email);
                            const profile = users.find(u => normalizeEmail(u.email) === authEmailNorm);
                            if (profile) {
                                // Sincroniza o email do Auth no perfil para buscas futuras
                                profile.email = authData.email;
                                chrome.storage.local.set({ fb_profile: profile }, () => {
                                    sendResponse({ success: true, user: profile });
                                });
                            } else {
                                console.warn('Emails no banco:', users.map(u => u.email));
                                sendResponse({ success: false, error: 'Perfil não encontrado no banco para ' + authData.email });
                            }
                        })
                        .catch(err => {
                            console.error('Erro ao buscar perfil:', err);
                            sendResponse({ success: false, error: 'Login OK, mas falha ao buscar perfil: ' + err.message });
                        });
                });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }
    
    // ---- LOGOUT ----
    if (request.action === "FIREBASE_LOGOUT") {
        chrome.storage.local.remove(['fb_idToken', 'fb_uid', 'fb_email', 'fb_refreshToken', 'fb_expiresAt', 'fb_profile'], () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    // ---- VERIFICAR SESSÃO ----
    if (request.action === "FIREBASE_CHECK_SESSION") {
        chrome.storage.local.get(['fb_idToken', 'fb_profile', 'fb_expiresAt'], (result) => {
            const isValid = result.fb_idToken && result.fb_expiresAt && (Date.now() < result.fb_expiresAt);
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
                
                // Busca dados do professor
                const profData = await firestoreGet('app_data', key, result.fb_idToken);
                
                // Busca dados da escola (gestor) para grade horária
                let gestorData = null;
                if (profile.schoolId) {
                    gestorData = await firestoreGet('app_data', `app_data_school_${profile.schoolId}_gestor`, result.fb_idToken);
                }
                
                sendResponse({
                    success: true,
                    professorData: profData || {},
                    gestorData: gestorData || {},
                    profile: profile
                });
            } catch (err) {
                console.error('Erro ao buscar dados:', err);
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

console.log("✅ Background script carregado! (v2.0 com Firebase REST)");