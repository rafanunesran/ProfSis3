chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_RPA_CHAMADA") {
        // Salva a tarefa na memória (storage) e abre uma nova aba da Sala do Futuro
        chrome.storage.local.set({ rpaTask: request.payload, rpaType: 'CHAMADA' }, () => {
            chrome.tabs.create({ url: 'https://saladofuturo.educacao.sp.gov.br/' });
        });
        sendResponse({ received: true });
    } 
    else if (request.action === "START_RPA_LOTE") {
        chrome.storage.local.set({ rpaTask: request.payload, rpaType: 'LOTE' }, () => {
            chrome.tabs.create({ url: 'https://saladofuturo.educacao.sp.gov.br/' });
        });
        sendResponse({ received: true });
    }
    else if (request.action === "FETCH_TURMAS") {
        // Exemplo: chamando a API privada da Sala do Futuro enquanto o professor já está logado
        // Insira aqui a rota real mapeada do Network (F12) da SED
        const apiPrivadaTurmasUrl = 'https://saladofuturo.educacao.sp.gov.br/api/core/turmas'; 

        fetch(apiPrivadaTurmasUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
        .then(res => {
            if (!res.ok) throw new Error("Acesso negado.");
            return res.json();
        })
        .then(data => {
            sendResponse({ success: true, turmas: data });
        })
        .catch(err => {
            sendResponse({ success: false, error: 'Por favor, abra uma aba da SED e faça login antes de mapear as turmas.' });
        });

        return true; // Retorna true para informar que a resposta é assíncrona
    }
});