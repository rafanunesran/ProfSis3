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
        
        // Envia para o background.js salvar no storage
        chrome.runtime.sendMessage({
            action: "EXT_SAVE_PAYLOAD",
            payload: event.data.payload
        }, (response) => {
            if (response && response.success) {
                console.log("✅ Payload salvo no storage da extensão!");
                // Confirma para o app que recebemos
                window.postMessage({ type: 'EXT_ACK' }, '*');
            } else {
                console.warn("⚠️ Falha ao salvar payload no storage");
            }
        });
    }
});

console.log("✅ Ponte postMessage ↔ chrome.runtime estabelecida!");