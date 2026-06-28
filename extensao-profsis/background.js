// BACKGROUND SCRIPT - ProfSis3 Extension
// Gerencia mensagens entre content scripts e storage

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📨 Background recebeu:", request.action);
    
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
        return true;
    } 
    else if (request.action === "EXT_SAVE_PAYLOAD" || request.action === "SYNC_DATA") {
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
    else if (request.action === "GET_DATA") {
        // Retorna os dados salvos no storage (usado pelo bookmarklet)
        chrome.storage.local.get(['rpa_data_history'], (result) => {
            if (sendResponse) sendResponse(result || {});
        });
        return true;
    }
    else if (request.action === "SAVE_MARKS") {
        // Salva marcas de "já lançado" (usado pelo bookmarklet)
        chrome.storage.local.set({ rpa_done_marks: request.marks }, () => {
            if (sendResponse) sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === "SAVE_STUDENTS") {
        // Salva alunos extraídos da SED (usado pelo bookmarklet)
        chrome.storage.local.set({ rpa_imported_students: request.payload }, () => {
            if (sendResponse) sendResponse({ success: true });
        });
        return true;
    }
    else if (request.action === "FETCH_TURMAS") {
        sendResponse({ 
            success: false, 
            error: 'Função desativada - use o content script na SED.' 
        });
    }
    else {
        // Ação desconhecida - log para debug
        console.warn("⚠️ Ação desconhecida recebida:", request.action);
        if (sendResponse) sendResponse({ success: false, error: 'Ação desconhecida: ' + request.action });
    }
});

// NOTA: Quando o content script da SED for injetado,
// ele lerá o rpaTask do storage e executará a automação.