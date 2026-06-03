// Este arquivo é ativado apenas quando o professor está no site saladofuturo.educacao.sp.gov.br
console.log("🤖 Robô do ProfSis3 carregado no portal do Estado.");

chrome.storage.local.get(['rpaTask', 'rpaType'], (result) => {
    if (result.rpaTask && result.rpaType === 'CHAMADA') {
        const payload = result.rpaTask;
        console.log("Tarefa de Chamada encontrada:", payload);
        
        // Se a tela ainda estiver na parte de login ou pedir senha, não prossegue
        if (document.querySelector('input[type="password"]')) {
            console.log("Aguardando login manual do usuário...");
            return; 
        }

        // AQUI ENTRARÁ O SEU MAPEAMENTO DO DOM
        // Por exemplo:
        // document.querySelector('#filtroTurma').value = payload.turmaId;
        // document.querySelector('#filtroData').value = payload.dataChamada;
        // document.querySelector('#btnBuscar').click();

        // Quando terminar o trabalho final:
        // chrome.storage.local.remove(['rpaTask', 'rpaType']);
        // alert("Sincronizado!");
    }
});