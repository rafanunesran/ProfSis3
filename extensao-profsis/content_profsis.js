// CONTENT SCRIPT - ProfSis3 (Injetado no site do ProfSis)
// v2.6.1 - Corrige a chave de localStorage usada para ler os dados do app: agora prioriza o uid do
// Firebase Auth (mesma prioridade usada por getStorageKey em shared.js ao salvar), em vez do id do
// perfil - que para contas criadas pelo painel do gestor/admin é só um timestamp desvinculado do uid.
// Isso fazia a extensão nunca achar 'app_data_<id>' (nada é salvo nessa chave) e ficar sem aulas/horário.
// v2.6.0 - PROFSIS_UPDATE_STUDENTS agora espera a confirmação real do app.js antes de responder (evita falso "sucesso")
// Faz a ponte entre o app (postMessage) e a extensão (chrome.runtime)

console.log("🧩 Extensão ProfSis3 ativa na página do ProfSis! (v2.6.1)");

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

        // Espera o app.js terminar de processar de verdade (sucesso ou erro) antes de responder à
        // extensão. Antes disso, respondíamos "sucesso" na hora, sem saber se o app realmente salvou -
        // se o processamento falhasse (ex: turma não encontrada) ou a aba não tivesse o app carregado,
        // a extensão mostrava "✅ criado" mesmo sem nada ter sido gravado.
        let jaRespondeu = false;
        const onResultado = (event) => {
            if (jaRespondeu) return;
            jaRespondeu = true;
            window.removeEventListener('SisProf_Update_Students_Result', onResultado);
            sendResponse(event.detail);
        };
        window.addEventListener('SisProf_Update_Students_Result', onResultado);
        window.dispatchEvent(new CustomEvent('SisProf_Update_Students', { detail: request.payload }));

        // Timeout de segurança: se o app não responder em 15s (ex: script não carregou), avisa o erro
        // em vez de deixar a extensão esperando para sempre.
        setTimeout(() => {
            if (jaRespondeu) return;
            jaRespondeu = true;
            window.removeEventListener('SisProf_Update_Students_Result', onResultado);
            sendResponse({ success: false, error: 'O ProfSis não respondeu a tempo nesta aba. Verifique se você está logado e tente novamente.' });
        }, 15000);

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

console.log("✅ Ponte postMessage ↔ chrome.runtime estabelecida! (v2.6.1)");
