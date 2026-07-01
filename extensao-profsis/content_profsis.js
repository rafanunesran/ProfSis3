// CONTENT SCRIPT - ProfSis3 (Injetado no site do ProfSis)
// v2.2.0 - Repassa a sessão do Firebase Auth (refresh token) para a extensão escrever direto no Firestore
// Faz a ponte entre o app (postMessage) e a extensão (chrome.runtime)

console.log("🧩 Extensão ProfSis3 ativa na página do ProfSis! (v2.2.0)");

// ==================== DETECÇÃO DE LOGIN ====================

// Verifica se o usuário está logado no ProfSis
function verificarLoginProfSis() {
    // Tenta pegar o usuário do localStorage (como o core.js salva)
    const userJson = localStorage.getItem('app_current_user');
    if (userJson) {
        try {
            const user = JSON.parse(userJson);
            if (user && user.email) {
                console.log("[ProfSis Ext] Usuário logado detectado:", user.nome || user.email);
                // Envia o perfil para a extensão (background.js)
                chrome.runtime.sendMessage({
                    action: "PROFSIS_USER_LOGGED_IN",
                    user: user
                });
                
                // Também tenta enviar os dados completos do app
                enviarDadosCompletos();
                return true;
            }
        } catch (e) {
            console.warn("[ProfSis Ext] Erro ao ler usuário do localStorage:", e);
        }
    }
    
    // Verifica se a tela de login está visível (não está logado)
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    if (authContainer && authContainer.style.display !== 'none' && (!appContainer || appContainer.style.display === 'none')) {
        console.log("[ProfSis Ext] Tela de login visível - usuário NÃO está logado");
        chrome.runtime.sendMessage({
            action: "PROFSIS_USER_NOT_LOGGED"
        });
        return false;
    }
    
    // Se o appContainer está visível, está logado
    if (appContainer && appContainer.style.display !== 'none') {
        console.log("[ProfSis Ext] App visível - usuário está logado (sem localStorage)");
        // Tenta novamente pegar do localStorage
        const userJson2 = localStorage.getItem('app_current_user');
        if (userJson2) {
            try {
                const user = JSON.parse(userJson2);
                chrome.runtime.sendMessage({
                    action: "PROFSIS_USER_LOGGED_IN",
                    user: user
                });
                enviarDadosCompletos();
                return true;
            } catch (e) {}
        }
    }
    
    return false;
}

// Tenta enviar os dados completos do app (turmas, estudantes, presencas, etc.)
function enviarDadosCompletos() {
    // Os dados do app são salvos no localStorage com a chave 'app_data_<userId>'
    const userJson = localStorage.getItem('app_current_user');
    if (!userJson) return;
    
    try {
        const user = JSON.parse(userJson);
        const userId = user.id || user.uid || 'unknown';
        const dataKey = 'app_data_' + userId;
        const dataJson = localStorage.getItem(dataKey);
        
        if (dataJson) {
            const appData = JSON.parse(dataJson);
            console.log("[ProfSis Ext] Dados do app encontrados:", Object.keys(appData).length, "chaves");
            chrome.runtime.sendMessage({
                action: "PROFSIS_DATA_UPDATE",
                profile: user,
                appData: appData
            });
        } else {
            console.log("[ProfSis Ext] Sem dados do app no localStorage para", dataKey);
        }
    } catch (e) {
        console.warn("[ProfSis Ext] Erro ao enviar dados completos:", e);
    }
}

// ==================== EVENTOS DOM ====================

// Monitora mudanças no localStorage (quando o usuário faz login)
window.addEventListener('storage', (event) => {
    if (event.key === 'app_current_user') {
        console.log("[ProfSis Ext] localStorage mudou - re-verificando login");
        setTimeout(verificarLoginProfSis, 500);
    }
});

// Verifica login ao carregar e periodicamente
setTimeout(verificarLoginProfSis, 2000);
setInterval(verificarLoginProfSis, 10000); // A cada 10 segundos

// ==================== EVENTOS DO APP (postMessage) ====================

// 1. Escuta eventos DOM customizados (disparados pelo app.js)
window.addEventListener('SisProf_Start_RPA', (event) => {
    const payload = event.detail;
    console.log("📨 Evento SisProf_Start_RPA recebido:", payload);
    chrome.runtime.sendMessage({
        action: "START_RPA_CHAMADA",
        payload: payload
    });
});

window.addEventListener('SisProf_Start_RPA_Lote', (event) => {
    chrome.runtime.sendMessage({
        action: "START_RPA_LOTE",
        payload: event.detail
    });
});

window.addEventListener('SisProf_Fetch_Turmas_Estado', () => {
    chrome.runtime.sendMessage({ action: "FETCH_TURMAS" }, (response) => {
        window.dispatchEvent(new CustomEvent('SisProf_Fetch_Turmas_Estado_Response', { detail: response }));
    });
});

// 2. Escuta postMessage do app.js (enviado por window.enviarDadosParaExtensao)
window.addEventListener('message', (event) => {
    // Aceita mensagens de qualquer origem (mesma página)

    // Sessão do Firebase Auth (refresh token) para a extensão escrever direto no Firestore
    if (event.data && event.data.type === 'EXT_FIREBASE_SESSION') {
        chrome.runtime.sendMessage({ action: 'PROFSIS_FIREBASE_SESSION', session: event.data.session });
        return;
    }

    if (event.data && event.data.type === 'EXT_SEND_PAYLOAD') {
        console.log("📨 Payload recebido via postMessage:", event.data.payload);
        
        // Confirma recebimento imediatamente para o app.js
        window.postMessage({ type: 'EXT_ACK' }, '*');
        
        // Envia para o background.js salvar no storage e abrir a SED
        chrome.runtime.sendMessage({
            action: "EXT_SAVE_PAYLOAD",
            payload: event.data.payload
        }, (response) => {
            if (response && response.success) {
                console.log("✅ Payload salvo no storage da extensão!");
                
                // Mostra notificação visual na página
                const div = document.createElement('div');
                div.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#38a169; color:white; padding:10px 20px; border-radius:5px; z-index:999999; font-family:sans-serif; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.1);';
                div.textContent = '✅ Dados enviados para a Extensão! A SED será aberta...';
                document.body.appendChild(div);
                setTimeout(() => div.remove(), 4000);
            } else {
                console.warn("⚠️ Falha ao salvar payload no storage");
                const div = document.createElement('div');
                div.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#e53e3e; color:white; padding:10px 20px; border-radius:5px; z-index:999999; font-family:sans-serif; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.1);';
                div.textContent = '❌ Erro ao enviar para extensão. Verifique o console.';
                document.body.appendChild(div);
                setTimeout(() => div.remove(), 4000);
            }
        });
    }
});

// 3. Escuta pedidos da extensão para enviar dados atualizados
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PROFSIS_REQUEST_DATA") {
        console.log("[ProfSis Ext] Extensão pediu dados - re-enviando...");
        verificarLoginProfSis();
        sendResponse({ received: true });
    }
    if (request.action === "PROFSIS_REQUEST_LOGIN_STATUS") {
        const logged = verificarLoginProfSis();
        sendResponse({ logged: logged });
    }
    // ---- NOVO: Atualizar alunos direto no banco (vindo da SED) ----
    if (request.action === "PROFSIS_UPDATE_STUDENTS") {
        console.log("[ProfSis Ext] 📥 Atualizar alunos no banco:", request.payload.turmaSED, "-", (request.payload.alunos || []).length, "alunos");
        // Dispara um evento customizado para o app.js processar a atualização no banco
        window.dispatchEvent(new CustomEvent('SisProf_Update_Students', { detail: request.payload }));
        // Responde imediatamente; o app.js processará assíncrono
        sendResponse({ success: true, message: 'Evento disparado para o app.' });
    }
});

console.log("✅ Ponte postMessage ↔ chrome.runtime estabelecida! (v2.2.0)");
