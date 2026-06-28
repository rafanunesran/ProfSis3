// CONTENT SCRIPT - Sala do Futuro SED (Injetado em saladofuturo.educacao.sp.gov.br)
// Automatiza o preenchimento de chamada e registro de aula

console.log("🤖 Robô do ProfSis3 carregado no portal do Estado.");

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const CONFIG = {
    // Tempo de espera entre ações (ms) - aumentar se a SED estiver lenta
    DELAY_SHORT: 800,
    DELAY_MEDIUM: 1500,
    DELAY_LONG: 3000,
    
    // Seletor do calendário jQuery UI
    SELECTOR_MONTH: '.ui-datepicker-month',
    SELECTOR_YEAR: '.ui-datepicker-year',
    SELECTOR_DAY_CELL: 'td[data-handler="selectDay"]',
    
    // Seletor do multi-select de aulas
    SELECTOR_MULTI_BUTTON: '.multi-select-button',
    SELECTOR_AULA_CHECKBOX: '.multi-select-menuitem input[type="checkbox"]',
    
    // Seletor dos cards de alunos
    SELECTOR_CARD_ALUNO: '.card_aluno',
    SELECTOR_NOME_ALUNO: '.nome_aluno',
    
    // Botões de presença
    SELECTOR_BTN_FALTA: '.btn_falta_presenca.falta',
    SELECTOR_BTN_PRESENCA: '.btn_falta_presenca.presenca',
    
    // Botão de busca/pesquisar
    SELECTOR_BTN_BUSCAR: 'button:contains("Pesquisar"), button:contains("Buscar"), button:contains("Listar")',
    
    // Botão salvar
    SELECTOR_BTN_SALVAR: 'button:contains("Salvar"), button:contains("Gravar"), button:contains("Finalizar")'
};

// ============================================================
// UTILITÁRIOS
// ============================================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarNome(nome) {
    if (!nome) return '';
    return nome.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function encontrarBotao(seletor) {
    // Suporte a :contains via fallback manual
    const botoes = document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn');
    for (const btn of botoes) {
        const texto = (btn.innerText || btn.value || '').toLowerCase();
        const termos = seletor.replace('button:contains("', '').replace('")', '').toLowerCase().split(', ');
        for (const termo of termos) {
            if (texto.includes(termo)) return btn;
        }
    }
    return null;
}

// ============================================================
// FUNÇÕES PRINCIPAIS
// ============================================================

/**
 * Aguarda a página carregar completamente (sem spinner de loading)
 */
async function aguardarPaginaPronta() {
    console.log("⏳ Aguardando página carregar...");
    
    // Aguarda até que não haja mais modal de loading visível
    for (let i = 0; i < 30; i++) {
        const loadingModal = document.querySelector('.modal-loading');
        if (!loadingModal || loadingModal.style.display === 'none') {
            // Verifica se o calendário já carregou
            if (document.querySelector(CONFIG.SELECTOR_MONTH)) {
                console.log("✅ Página pronta!");
                return true;
            }
        }
        await sleep(1000);
    }
    console.warn("⚠️ Timeout aguardando página");
    return false;
}

/**
 * Verifica se o usuário está logado na SED
 */
function estaLogado() {
    // Se tiver campo de senha, não está logado
    if (document.querySelector('input[type="password"]')) {
        return false;
    }
    // Se tiver o nome do usuário no header, está logado
    if (document.querySelector('.usuario-nome, .perfil-wrapper')) {
        return true;
    }
    return false;
}

/**
 * Lê o payload do storage e inicia a automação
 */
async function iniciarAutomacao() {
    console.log("🔍 Verificando tarefas pendentes...");
    
    const result = await chrome.storage.local.get(['rpaTask', 'rpaType', 'rpaTimestamp']);
    
    if (!result.rpaTask) {
        console.log("ℹ️ Nenhuma tarefa pendente encontrada.");
        return;
    }
    
    const payload = result.rpaTask;
    const tipo = result.rpaType || 'CHAMADA';
    
    console.log(`📋 Tarefa encontrada: ${tipo}`, payload);
    
    // Verifica login
    if (!estaLogado()) {
        console.log("🔐 Aguardando login manual do usuário...");
        // Fica monitorando até o login ser feito
        for (let i = 0; i < 60; i++) { // 60 segundos de timeout
            await sleep(1000);
            if (estaLogado()) {
                console.log("✅ Login detectado!");
                break;
            }
        }
        if (!estaLogado()) {
            console.warn("⚠️ Login não detectado após 60s. Abortando.");
            return;
        }
    }
    
    // Navega para a tela de chamada se necessário
    await navegarParaChamada();
    
    // Executa o preenchimento
    if (tipo === 'CHAMADA') {
        await executarPreenchimentoChamada(payload);
    } else if (tipo === 'LOTE') {
        await executarPreenchimentoLote(payload);
    }
    
    // Limpa a tarefa após concluir
    chrome.storage.local.remove(['rpaTask', 'rpaType', 'rpaTimestamp']);
    console.log("✅ Tarefa concluída e removida do storage!");
}

/**
 * Navega para a tela de Lançamento de Frequência
 */
async function navegarParaChamada() {
    console.log("🧭 Navegando para Lançamento de Frequência...");
    
    // Verifica se já está na tela correta
    const titulo = document.querySelector('.txt-titulo');
    if (titulo && titulo.textContent.includes('Lançamento de Frequências')) {
        console.log("✅ Já está na tela de chamada!");
        return;
    }
    
    // Procura pelo link/botão "Diário de Classe" > "Lançamento da Frequência"
    const links = document.querySelectorAll('a[href*="frequencia"], a[href*="chamada"], .breadcrumb-item a');
    for (const link of links) {
        const texto = (link.innerText || '').toLowerCase();
        if (texto.includes('frequência') || texto.includes('frequencia') || texto.includes('chamada')) {
            console.log("🔗 Clicando em:", link.innerText);
            link.click();
            await sleep(CONFIG.DELAY_LONG);
            await aguardarPaginaPronta();
            return;
        }
    }
    
    console.warn("⚠️ Não foi possível navegar automaticamente. Navegue manualmente até a tela de Chamada.");
}

/**
 * Seleciona uma data no calendário jQuery UI da SED
 */
async function selecionarData(dataStr) {
    if (!dataStr) return false;
    
    console.log(`📅 Selecionando data: ${dataStr}`);
    
    const parts = dataStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months: 0-11
    const day = parseInt(parts[2], 10);
    
    const monthSelect = document.querySelector(CONFIG.SELECTOR_MONTH);
    const yearSelect = document.querySelector(CONFIG.SELECTOR_YEAR);
    
    if (!monthSelect || !yearSelect) {
        console.warn("⚠️ Calendário não encontrado na página");
        return false;
    }
    
    // Altera mês/ano se necessário
    let changed = false;
    if (monthSelect.value != month) {
        monthSelect.value = month;
        monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        changed = true;
    }
    if (yearSelect.value != year) {
        yearSelect.value = year;
        yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
        changed = true;
    }
    
    // Função para clicar no dia
    const clickDay = () => {
        // Tenta encontrar a célula do dia
        const cells = document.querySelectorAll(CONFIG.SELECTOR_DAY_CELL);
        for (const cell of cells) {
            const cellMonth = cell.getAttribute('data-month');
            const cellYear = cell.getAttribute('data-year');
            const link = cell.querySelector('a');
            
            if (cellMonth == month && cellYear == year && link && link.textContent.trim() == day) {
                console.log(`✅ Clicando no dia ${day}/${month+1}/${year}`);
                link.click();
                return true;
            }
        }
        return false;
    };
    
    if (changed) {
        await sleep(500);
    }
    
    const clicou = clickDay();
    if (!clicou) {
        console.warn(`⚠️ Dia ${day}/${month+1}/${year} não encontrado no calendário`);
    }
    
    await sleep(CONFIG.DELAY_SHORT);
    return clicou;
}

/**
 * Seleciona as aulas no multi-select
 */
async function selecionarAulas(aulasParaSelecionar) {
    if (!aulasParaSelecionar || aulasParaSelecionar.length === 0) {
        console.log("ℹ️ Nenhuma aula para selecionar");
        return;
    }
    
    console.log(`📚 Selecionando ${aulasParaSelecionar.length} aula(s)...`);
    
    // Abre o multi-select
    const btnAbrir = document.querySelector(CONFIG.SELECTOR_MULTI_BUTTON);
    if (!btnAbrir) {
        console.warn("⚠️ Seletor de aulas não encontrado");
        return;
    }
    
    btnAbrir.click();
    await sleep(300);
    
    // Seleciona as aulas desejadas
    const checkboxes = document.querySelectorAll(CONFIG.SELECTOR_AULA_CHECKBOX);
    checkboxes.forEach(chk => {
        const label = chk.parentElement.textContent.trim();
        const deveSelecionar = aulasParaSelecionar.some(aula => label.includes(aula));
        
        if (deveSelecionar && !chk.checked) {
            chk.click();
        } else if (!deveSelecionar && chk.checked) {
            chk.click();
        }
    });
    
    await sleep(200);
    
    // Fecha o multi-select
    btnAbrir.click();
    await sleep(CONFIG.DELAY_SHORT);
}

/**
 * Clica no botão de Pesquisar/Buscar
 */
async function clicarBuscar() {
    const btn = encontrarBotao('button:contains("Pesquisar"), button:contains("Buscar"), button:contains("Listar")');
    if (btn) {
        console.log("🔍 Clicando em Pesquisar/Buscar...");
        btn.click();
        await sleep(CONFIG.DELAY_LONG);
        return true;
    }
    console.warn("⚠️ Botão de Pesquisar não encontrado");
    return false;
}

/**
 * Preenche as faltas nos cards dos alunos
 */
async function preencherFaltas(alunosFaltantes) {
    if (!alunosFaltantes || alunosFaltantes.length === 0) {
        console.log("ℹ️ Nenhuma falta para preencher");
        return 0;
    }
    
    console.log(`✏️ Preenchendo faltas para ${alunosFaltantes.length} aluno(s)...`);
    
    const nomesFaltantes = alunosFaltantes.map(a => normalizarNome(a.nome));
    const cards = document.querySelectorAll(CONFIG.SELECTOR_CARD_ALUNO);
    let interagidos = 0;
    
    cards.forEach(card => {
        const nomeElement = card.querySelector(CONFIG.SELECTOR_NOME_ALUNO);
        if (!nomeElement) return;
        
        let nomeAluno = normalizarNome(nomeElement.textContent);
        // Remove numeração do início (ex: "1. NOME" ou "1 NOME")
        nomeAluno = nomeAluno.replace(/^\d+\s*[-.]?\s*/, '');
        
        // Encontra o checkbox de falta/presença
        const faltaContainer = card.querySelector('.falta_presenca_container');
        const checkbox = faltaContainer 
            ? faltaContainer.querySelector('input[type="checkbox"]')
            : card.querySelector('input[type="checkbox"]');
        
        if (!checkbox) return;
        
        const deveFaltar = nomesFaltantes.includes(nomeAluno);
        
        if (deveFaltar && !checkbox.checked) {
            checkbox.click();
            interagidos++;
        } else if (!deveFaltar && checkbox.checked) {
            checkbox.click();
        }
    });
    
    console.log(`✅ ${interagidos} interações de falta realizadas`);
    return interagidos;
}

/**
 * Preenche o registro de aula (conteúdo)
 */
async function preencherRegistroAula(conteudo) {
    if (!conteudo) {
        console.log("ℹ️ Nenhum registro de aula para preencher");
        return false;
    }
    
    console.log("📝 Preenchendo registro de aula...");
    
    // Tenta encontrar o textarea de conteúdo
    const textarea = document.querySelector('textarea[name="o.Descricao"], textarea#conteudoAula, textarea.form-control, textarea');
    
    if (textarea) {
        textarea.value = conteudo;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("✅ Registro de aula preenchido!");
        return true;
    }
    
    console.warn("⚠️ Textarea de conteúdo não encontrado");
    return false;
}

/**
 * Clica no botão Salvar
 */
async function clicarSalvar() {
    const btn = encontrarBotao('button:contains("Salvar"), button:contains("Gravar"), button:contains("Finalizar")');
    if (btn) {
        console.log("💾 Clicando em Salvar...");
        btn.click();
        await sleep(CONFIG.DELAY_MEDIUM);
        return true;
    }
    console.warn("⚠️ Botão Salvar não encontrado");
    return false;
}

/**
 * Executa o fluxo completo de preenchimento de chamada
 */
async function executarPreenchimentoChamada(payload) {
    console.log("🚀 Iniciando preenchimento de chamada...");
    
    const data = payload.data || payload.dataChamada;
    const faltas = payload.faltas || [];
    const registros = payload.registros || [];
    
    // 1. Seleciona a data no calendário
    if (data) {
        await selecionarData(data);
    }
    
    // 2. Seleciona as aulas (se houver info de aula no payload)
    if (payload.aulas) {
        await selecionarAulas(payload.aulas);
    }
    
    // 3. Clica em Pesquisar para carregar os alunos
    await clicarBuscar();
    
    // 4. Preenche faltas
    const interagidos = await preencherFaltas(faltas);
    
    // 5. Preenche registro de aula
    if (registros.length > 0 && registros[0].conteudo) {
        await preencherRegistroAula(registros[0].conteudo);
    }
    
    // 6. Salva
    if (interagidos > 0 || (registros.length > 0 && registros[0].conteudo)) {
        await sleep(CONFIG.DELAY_SHORT);
        await clicarSalvar();
        alert('✅ Chamada preenchida e salva com sucesso!');
    } else {
        console.log("ℹ️ Nada a preencher para esta data.");
    }
}

/**
 * Executa preenchimento em lote (múltiplas turmas)
 */
async function executarPreenchimentoLote(payload) {
    console.log("🚀 Iniciando preenchimento em lote...");
    
    const turmas = payload.turmas || [];
    if (turmas.length === 0) {
        console.warn("⚠️ Nenhuma turma para processar em lote");
        return;
    }
    
    for (let i = 0; i < turmas.length; i++) {
        const turma = turmas[i];
        console.log(`📋 Processando turma ${i+1}/${turmas.length}: ${turma.nome || turma.turmaId}`);
        
        // Seleciona a turma no filtro
        const selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
        if (selectTurma) {
            selectTurma.value = turma.turmaId || turma.id;
            selectTurma.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(CONFIG.DELAY_MEDIUM);
        }
        
        // Executa preenchimento para esta turma
        await executarPreenchimentoChamada(turma);
        
        await sleep(CONFIG.DELAY_MEDIUM);
    }
    
    alert(`✅ Lote concluído! ${turmas.length} turma(s) processada(s).`);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

// Aguarda a página carregar e inicia
(async () => {
    await aguardarPaginaPronta();
    
    // Se não estiver logado, fica monitorando
    if (!estaLogado()) {
        console.log("🔐 Usuário não logado. Monitorando login...");
        for (let i = 0; i < 120; i++) { // 2 minutos
            await sleep(1000);
            if (estaLogado()) {
                console.log("✅ Login detectado!");
                break;
            }
        }
    }
    
    // Inicia a automação
    await iniciarAutomacao();
})();