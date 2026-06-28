// CONTENT SCRIPT - ProfSis3 (Injetado no site do SisProf)
// Faz a ponte entre o app (postMessage) e a extensão (chrome.runtime)

console.log("🧩 Extensão ProfSis3 ativa na página do SisProf!");

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

console.log("✅ Ponte postMessage ↔ chrome.runtime estabelecida!");