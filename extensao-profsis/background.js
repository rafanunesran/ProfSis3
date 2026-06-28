// BACKGROUND SCRIPT - ProfSis3 Extension
// Gerencia mensagens entre content scripts e storage

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_RPA_CHAMADA" || request.action === "START_RPA_LOTE") {
        // Salva a tarefa no storage e abre a SED
        const task = request.payload;
        chrome.storage.local.set({ 
            rpaTask: task, 
            rpaType: request.action === "START_RPA_CHAMADA" ? 'CHAMADA' : 'LOTE',
            rpaTimestamp: Date.now()
        }, () => {
            // Abre a SED em nova aba
            chrome.tabs.create({ url: 'https://saladofuturo.educacao.sp.gov.br/' });
            if (sendResponse) sendResponse({ received: true });
        });
        return true; // Resposta assíncrona
    } 
    else if (request.action === "EXT_SAVE_PAYLOAD") {
        // Salva payload recebido via postMessage e ABRE a SED
        chrome.storage.local.set({ 
            rpaTask: request.payload, 
            rpaType: 'CHAMADA',
            rpaTimestamp: Date.now()
        }, () => {
            // Abre a SED em nova aba para o content_sed.js executar
            chrome.tabs.create({ url: 'https://saladofuturo.educacao.sp.gov.br/' });
            if (sendResponse) sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === "FETCH_TURMAS") {
        // Requisição de turmas da SED (precisa estar logado)
        sendResponse({ 
            success: false, 
            error: 'Função desativada - use o content script na SED.' 
        });
    }
});

// NOTA: Quando o content script da SED for injetado,
// ele lerá o rpaTask do storage e executará a automação.