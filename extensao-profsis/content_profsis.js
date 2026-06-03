// Este arquivo injeta na aba do seu ProfSis3
console.log("🧩 Extensão ProfSis3 ativa na página atual!");

window.addEventListener('SisProf_Start_RPA', (event) => {
    const payload = event.detail;
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
        // Recebe a resposta e envia de volta ao sistema (app.js)
        window.dispatchEvent(new CustomEvent('SisProf_Fetch_Turmas_Estado_Response', { detail: response }));
    });
});