// CONTENT SCRIPT - ProfSis3 (Injetado no site do ProfSis)
// v2.6.1 - Corrige a chave de localStorage usada para ler os dados do app: agora prioriza o uid do
// Firebase Auth (mesma prioridade usada por getStorageKey em shared.js ao salvar), em vez do id do
// perfil - que para contas criadas pelo painel do gestor/admin é só um timestamp desvinculado do uid.
// Isso fazia a extensão nunca achar 'app_data_<id>' (nada é salvo nessa chave) e ficar sem aulas/horário.
// v2.6.0 - PROFSIS_UPDATE_STUDENTS agora espera a confirmação real do app.js antes de responder (evita falso "sucesso")
// Faz a ponte entre o app (postMessage) e a extensão (chrome.runtime)

console.log("🧩 Extensão ProfSis3 ativa na página do ProfSis! (v" + chrome.runtime.getManifest().version + ")");

// Expõe a versão da extensão para a página (o app.js lê no popup de Perfil para o professor conferir
// se a extensão dele está atualizada). O content script vive num "mundo isolado", então variáveis de
// window não são visíveis para o app.js - mas o DOM é compartilhado, então um data-attribute no <html>
// serve de ponte. Reescreve a cada carga, garantindo sempre a versão realmente instalada.
try {
    document.documentElement.setAttribute('data-profsis-ext-versao', chrome.runtime.getManifest().version);
} catch (e) {}

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
        const userId = user.uid || user.id || 'unknown';
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

// Pede ao app.js (mesma página) para processar a atualização de alunos e devolve o resultado real
// (sucesso/erro) via callback. Usado tanto pelo fallback "via aba" da extensão quanto pelo correio do
// app (poll abaixo). Espera o SisProf_Update_Students_Result de verdade, com timeout de 15s.
function processarUpdateStudentsViaApp(payload, cb) {
    let jaRespondeu = false;
    const onResultado = (event) => {
        if (jaRespondeu) return;
        jaRespondeu = true;
        window.removeEventListener('SisProf_Update_Students_Result', onResultado);
        cb(event.detail || { success: false, error: 'Sem detalhe de resultado.' });
    };
    window.addEventListener('SisProf_Update_Students_Result', onResultado);
    window.dispatchEvent(new CustomEvent('SisProf_Update_Students', { detail: payload }));
    setTimeout(() => {
        if (jaRespondeu) return;
        jaRespondeu = true;
        window.removeEventListener('SisProf_Update_Students_Result', onResultado);
        cb({ success: false, error: 'O ProfSis não respondeu a tempo. Verifique se você está logado e tente novamente.' });
    }, 15000);
}

// [APP] Correio de escrita no banco entre as duas WebViews. No app não há "aba do ProfSis", então o
// background (na WebView da SED) deixa a requisição no storage nativo compartilhado e nós (WebView do
// ProfSis, que está logada) processamos via app.js e devolvemos o resultado. Só roda no app.
if (chrome.runtime && chrome.runtime.isProfSisNativeApp) {
    let ultimoReqProcessado = null;
    setInterval(() => {
        chrome.storage.local.get(['sisprof_req_update_students'], (r) => {
            const req = r && r.sisprof_req_update_students;
            if (!req || !req.id || req.id === ultimoReqProcessado) return;
            if (!verificarLoginProfSis()) return; // só processa com o ProfSis logado nesta WebView
            ultimoReqProcessado = req.id;
            console.log('[ProfSis Ext] 📥 (app) processando atualização de alunos:', req.payload && req.payload.turmaSED);
            processarUpdateStudentsViaApp(req.payload, (res) => {
                chrome.storage.local.set({ sisprof_res_update_students: { id: req.id, success: !!(res && res.success), resultado: res && res.resultado, error: res && res.error } });
            });
        });
    }, 1200);
}

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
    // ---- Atualizar alunos direto no banco (fallback, quando a extensão não tem sessão Firebase salva) ----
    if (request.action === "PROFSIS_UPDATE_STUDENTS") {
        console.log("[ProfSis Ext] 📥 Atualizar alunos no banco (via aba):", request.payload.turmaSED, "-", (request.payload.alunos || []).length, "alunos");
        processarUpdateStudentsViaApp(request.payload, sendResponse);
        return true; // resposta assíncrona
    }
    // ---- Atualizar catálogo de Material Digital direto no banco (fallback, quando a extensão não tem sessão Firebase salva) ----
    if (request.action === "PROFSIS_UPDATE_MATERIAL_DIGITAL") {
        console.log("[ProfSis Ext] 📥 Atualizar catálogo de Material Digital (via aba):", request.payload.turmaSED);

        // Mesmo padrão de PROFSIS_UPDATE_STUDENTS: só responde à extensão depois que o app.js
        // confirmar de verdade (sucesso ou erro), com timeout de segurança.
        let jaRespondeuMaterial = false;
        const onResultadoMaterial = (event) => {
            if (jaRespondeuMaterial) return;
            jaRespondeuMaterial = true;
            window.removeEventListener('SisProf_Update_MaterialDigital_Result', onResultadoMaterial);
            sendResponse(event.detail);
        };
        window.addEventListener('SisProf_Update_MaterialDigital_Result', onResultadoMaterial);
        window.dispatchEvent(new CustomEvent('SisProf_Update_MaterialDigital', { detail: request.payload }));

        setTimeout(() => {
            if (jaRespondeuMaterial) return;
            jaRespondeuMaterial = true;
            window.removeEventListener('SisProf_Update_MaterialDigital_Result', onResultadoMaterial);
            sendResponse({ success: false, error: 'O ProfSis não respondeu a tempo nesta aba. Verifique se você está logado e tente novamente.' });
        }, 15000);

        return true; // resposta assíncrona
    }
    // ---- A extensão escreveu direto no Firestore (via background) - pede para esta aba recarregar os dados ----
    if (request.action === "PROFSIS_REFRESH_DATA") {
        console.log("[ProfSis Ext] 🔄 Extensão pediu para recarregar os dados após atualização de alunos.");
        window.dispatchEvent(new CustomEvent('SisProf_Refresh_Data'));
        sendResponse({ received: true });
    }
});

console.log("✅ Ponte postMessage ↔ chrome.runtime estabelecida! (v" + chrome.runtime.getManifest().version + ")");
