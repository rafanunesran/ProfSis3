// BACKGROUND SCRIPT - ProfSis3 Extension
// v2.0.1 - Nova abordagem: detecta login do ProfSis em aba aberta (sem Firebase Auth)

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
        chrome.storage.local.remove(['profsis_user', 'profsis_logged_in', 'profsis_app_data', 'profsis_login_time', 'profsis_data_time'], () => {
            console.log('[Logout] Dados do ProfSis limpos.');
            sendResponse({ success: true });
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

console.log("✅ Background script carregado! (v2.0.1 - Detecção de login ProfSis)");