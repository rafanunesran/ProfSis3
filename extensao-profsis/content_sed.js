// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// Injeta o menu flutuante do Robô SisProf - Versão Aprimorada
// Funcionalidades:
// - Seletor de dia para navegar entre datas
// - Checkbox para marcar aulas do dia (1ª, 2ª...)
// - Checkbox para marcar faltosos
// - Análise automática de faltosos ao entrar na chamada
// - Lista de faltosos para consulta
// - Preenchimento automático de dia, aulas e faltas
// - Auto-envio ao salvar lançamento
// - Captura dos últimos dias corridos no envio manual

console.log("🤖 content_sed.js EXECUTADO - Versão Aprimorada");

// ==================== VARIÁVEIS GLOBAIS ====================
let extHistory = {};
let extDoneMarks = {};
let currentSelectedDate = "";
let faltososCache = {}; // Cache de faltosos por turma
let aulasDisponiveis = []; // Aulas disponíveis na tela

// ==================== FUNÇÕES PRINCIPAIS ====================

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    
    // Aguarda o body existir
    if (!document.body) {
        setTimeout(injetarMenu, 500);
        return;
    }
    
    console.log("🔄 Injetando menu flutuante aprimorado...");
    
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:350px; background:white; border:3px solid #38a169; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5); max-height:90vh; overflow-y:auto; transition: all 0.3s ease;';
    div.innerHTML = 
        '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🤖 Robô SisProf <span id="sisprof-versao" style="font-size:10px; opacity:0.7;">v2.0</span></span>' +
            '<div style="display:flex; gap:8px;">' +
                '<span id="sisprof-minimizar" style="cursor:pointer; font-size:16px;" title="Minimizar à esquerda">◀</span>' +
                '<span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span>' +
            '</div>' +
        '</div>' +
        '<div id="sisprof-conteudo">' +
        '<p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Extensão funcionando!</p>' +
        
        // Seletor de Dia
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;">' +
            '<label style="font-size:12px; font-weight:bold; color:#276749; display:block; margin-bottom:4px;">📅 Selecione o Dia:</label>' +
            '<div style="display:flex; gap:5px;">' +
                '<input type="date" id="sisprof-data-input" style="flex:1; padding:6px; border:1px solid #cbd5e0; border-radius:4px; font-size:12px;">' +
                '<button id="sisprof-btn-hoje" style="background:#38a169; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Hoje</button>' +
            '</div>' +
        '</div>' +
        
        // Status do dia selecionado
        '<div id="sisprof-status" style="background:#f7fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px; font-size:11px; color:#718096;">Verificando...</div>' +
        
        // Aulas do Dia (Checkbox)
        '<div style="background:#ebf8ff; padding:10px; border-radius:8px; border:1px solid #bee3f8; margin-bottom:10px;">' +
            '<label style="font-size:12px; font-weight:bold; color:#2c5282; display:block; margin-bottom:4px;">📚 Aulas do Dia:</label>' +
            '<div id="sisprof-lista-aulas" style="max-height:120px; overflow-y:auto; font-size:12px;">' +
                '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Carregando aulas...</div>' +
            '</div>' +
            '<button id="sisprof-btn-atualizar-aulas" style="width:100%; background:#3182ce; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-size:11px; margin-top:5px;">🔄 Atualizar Aulas da Tela</button>' +
        '</div>' +
        
        // Faltosos (Checkbox)
        '<div style="background:#fff5f5; padding:10px; border-radius:8px; border:1px solid #fed7d7; margin-bottom:10px;">' +
            '<label style="font-size:12px; font-weight:bold; color:#c53030; display:block; margin-bottom:4px;">🔴 Faltosos do Dia:</label>' +
            '<div id="sisprof-lista-faltosos" style="max-height:150px; overflow-y:auto; font-size:12px;">' +
                '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhum dado de faltas carregado.</div>' +
            '</div>' +
        '</div>' +
        
        // Botões de Ação
        '<button id="sisprof-btn-preencher" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;">1️⃣ Preencher Chamada Automático</button>' +
        '<button id="sisprof-btn-marcar-faltas" style="width:100%; background:#e53e3e; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">✅ Marcar Faltas na Chamada</button>' +
        '<button id="sisprof-btn-analisar" style="width:100%; background:#dd6b20; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">🔍 Analisar Faltosos da Turma</button>' +
        '<hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;">' +
        '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">📥 Extrair Alunos (Atual)</button>' +
        '<button id="sisprof-btn-extrair-multi" style="width:100%; background:#276749; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">📥 Extrair TODAS (Auto)</button>' +
        '</div>';
    
    document.body.appendChild(div);
    console.log("✅ Menu aprimorado injetado!");
    
    // ==================== EVENTOS ====================
    
    // Fechar
    document.getElementById('sisprof-fechar').onclick = function() { div.remove(); };
    
    // Minimizar à esquerda
    document.getElementById('sisprof-minimizar').onclick = function() {
        const conteudo = document.getElementById('sisprof-conteudo');
        const isMinimized = conteudo.style.display === 'none';
        
        if (isMinimized) {
            // Restaurar
            conteudo.style.display = 'block';
            div.style.right = '20px';
            div.style.left = 'auto';
            div.style.width = '350px';
            this.innerHTML = '◀';
            this.title = 'Minimizar à esquerda';
        } else {
            // Minimizar
            conteudo.style.display = 'none';
            div.style.right = 'auto';
            div.style.left = '20px';
            div.style.width = '50px';
            div.style.padding = '10px';
            this.innerHTML = '▶';
            this.title = 'Restaurar';
        }
    };
    
    // Botão Hoje
    document.getElementById('sisprof-btn-hoje').onclick = function() {
        const hoje = new Date();
        const dataStr = hoje.toISOString().split('T')[0];
        document.getElementById('sisprof-data-input').value = dataStr;
        currentSelectedDate = dataStr;
        atualizarInterfacePorData();
    };
    
    // Input de data
    document.getElementById('sisprof-data-input').addEventListener('change', function() {
        currentSelectedDate = this.value;
        atualizarInterfacePorData();
        lerAulasDaTela();
    });
    
    // Atualizar Aulas
    document.getElementById('sisprof-btn-atualizar-aulas').onclick = lerAulasDaTela;
    
    // Preencher Chamada Automático
    document.getElementById('sisprof-btn-preencher').onclick = function() {
        if (!currentSelectedDate) {
            alert('Selecione um dia primeiro.');
            return;
        }
        const btn = this;
        const oldText = btn.textContent;
        btn.textContent = '⏳ Preenchendo...';
        btn.disabled = true;
        
        // 1. Seleciona a data na SED
        selecionarDataSED(currentSelectedDate);
        
        setTimeout(() => {
            // 2. Seleciona as aulas marcadas
            selecionarAulasSED();
            
            setTimeout(() => {
                // 3. Clica em Pesquisar/Buscar
                const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                let btnBuscar = null;
                buttons.forEach(b => {
                    const text = (b.innerText || b.value || '').toLowerCase();
                    if (text.includes('pesquisar') || text.includes('buscar') || text.includes('listar')) btnBuscar = b;
                });
                if (btnBuscar) btnBuscar.click();
                
                setTimeout(() => {
                    // 4. Preenche faltas e registros
                    const payload = extHistory[currentSelectedDate];
                    if (payload) {
                        executarPreenchimento(payload);
                    } else {
                        // Se não tem payload, tenta preencher só com as aulas marcadas
                        marcarFaltasNaChamada();
                    }
                    btn.textContent = oldText;
                    btn.disabled = false;
                }, 2500);
            }, 1000);
        }, 800);
    };
    
    // Marcar Faltas na Chamada
    document.getElementById('sisprof-btn-marcar-faltas').onclick = function() {
        marcarFaltasNaChamada();
    };
    
    // Analisar Faltosos da Turma
    document.getElementById('sisprof-btn-analisar').onclick = function() {
        analisarFaltososTurma();
    };
    
    // Extrair Alunos
    document.getElementById('sisprof-btn-extrair').onclick = iniciarExtrairAlunos;
    document.getElementById('sisprof-btn-extrair-multi').onclick = iniciarExtrairTodasTurmas;
    
    // Carrega dados iniciais
    carregarDados();
    
    // Configura data inicial como hoje
    const hoje = new Date();
    document.getElementById('sisprof-data-input').value = hoje.toISOString().split('T')[0];
    currentSelectedDate = hoje.toISOString().split('T')[0];
}

// ==================== GERENCIAMENTO DE DADOS ====================

function carregarDados() {
    chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
        if (data && data.rpa_data_history) {
            extHistory = data.rpa_data_history;
        } else if (data && data.rpa_data) {
            extHistory = {};
            extHistory[data.rpa_data.data] = data.rpa_data;
        }
        extDoneMarks = data.rpa_done_marks || {};
        
        atualizarInterfacePorData();
        setTimeout(lerAulasDaTela, 1000);
    });
}

function atualizarInterfacePorData() {
    const statusEl = document.getElementById('sisprof-status');
    if (!statusEl) return;
    
    if (!currentSelectedDate || !extHistory[currentSelectedDate]) {
        statusEl.innerHTML = '⏳ <strong>Sem dados para esta data.</strong><br>Use o SisProf para enviar os dados primeiro.';
        statusEl.style.color = '#718096';
        document.getElementById('sisprof-lista-faltosos').innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhum dado de faltas para esta data.</div>';
        document.getElementById('sisprof-lista-aulas').innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Sem dados de turmas para esta data.</div>';
        return;
    }
    
    const payload = extHistory[currentSelectedDate];
    const numFaltas = (payload.faltas && payload.faltas.length) ? payload.faltas.length : 0;
    const temRegistro = (payload.registros && payload.registros.length > 0 && payload.registros[0].conteudo) ? 'Sim' : 'Não';
    const temFechamento = (payload.fechamento && payload.fechamento.length > 0) ? payload.fechamento.length + ' alunos' : 'Não';
    const numTurmas = (payload.turmas && payload.turmas.length) ? payload.turmas.length : 0;
    
    statusEl.innerHTML = '<strong>📅 ' + formatarDataBR(currentSelectedDate) + '</strong><br>' +
        '🔴 Faltas: <strong>' + numFaltas + '</strong><br>' +
        '📝 Registro: <strong>' + temRegistro + '</strong><br>' +
        '📊 Fechamento: <strong>' + temFechamento + '</strong><br>' +
        '📚 Turmas: <strong>' + numTurmas + '</strong>';
    statusEl.style.color = '#2d3748';
    
    // Atualiza lista de faltosos
    renderizarListaFaltosos(payload);
    
    // Atualiza lista de turmas/disciplinas do payload
    renderizarTurmasPayload(payload);
}

function renderizarListaFaltosos(payload) {
    const container = document.getElementById('sisprof-lista-faltosos');
    if (!container) return;
    
    const faltas = payload.faltas || [];
    
    if (faltas.length === 0) {
        container.innerHTML = '<div style="color:#38a169; text-align:center; padding:10px 0; font-weight:bold;">✅ Nenhum faltoso para esta data.</div>';
        return;
    }
    
    container.innerHTML = faltas.map((f, index) => {
        const markKey = currentSelectedDate + '_falta_' + index;
        const isDone = extDoneMarks[markKey] || false;
        return '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:4px 0;">' +
            '<label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:12px;">' +
                '<input type="checkbox" class="sisprof-falta-chk" data-index="' + index + '" data-nome="' + (f.nome || '').replace(/"/g, '"') + '"> ' +
                (f.nome || 'Desconhecido') +
            '</label>' +
            '<label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold; display:flex; align-items:center; gap:2px;" title="Marcar como Lançado">' +
                '<input type="checkbox" class="sisprof-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '> Lançado' +
            '</label>' +
        '</div>';
    }).join('');
    
    // Eventos para os checkboxes de "Lançado"
    container.querySelectorAll('.sisprof-done-chk').forEach(chk => {
        chk.addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
            this.parentElement.style.color = this.checked ? '#38a169' : '#a0aec0';
        });
    });
}

// ==================== TURMAS DO PAYLOAD ====================

function renderizarTurmasPayload(payload) {
    const container = document.getElementById('sisprof-lista-aulas');
    if (!container) return;
    
    const turmas = payload.turmas || [];
    
    if (turmas.length === 0) {
        // Se não tem turmas no payload, tenta ler da tela
        lerAulasDaTela();
        return;
    }
    
    container.innerHTML = '';
    
    turmas.forEach((turma, index) => {
        const markKey = currentSelectedDate + '_turma_' + turma.id;
        const isDone = extDoneMarks[markKey] || false;
        const label = turma.nome + (turma.disciplina ? ' - ' + turma.disciplina : '') + ' (' + turma.horario + ')';
        
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:3px 0;';
        
        div.innerHTML = '<label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:12px;">' +
            '<input type="checkbox" class="sisprof-aula-chk" data-val="' + turma.id + '" checked> ' + label +
            '</label>' +
            '<label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold; display:flex; align-items:center; gap:2px;" title="Marcar como Lançado">' +
                '<input type="checkbox" class="sisprof-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '> Lançado' +
            '</label>';
        
        container.appendChild(div);
        
        // Evento para marcar como lançado
        const doneChk = div.querySelector('.sisprof-done-chk');
        doneChk.addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
            this.parentElement.style.color = this.checked ? '#38a169' : '#a0aec0';
        });
    });
}

// ==================== AULAS DO DIA ====================

function lerAulasDaTela() {
    const lista = document.getElementById('sisprof-lista-aulas');
    if (!lista) return;
    
    // Tenta encontrar checkboxes de aulas na SED
    const checkboxes = document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]');
    
    if (checkboxes.length === 0) {
        lista.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhuma aula encontrada.<br>Abra a aba de Chamada e selecione a Turma.</div>';
        return;
    }
    
    aulasDisponiveis = [];
    lista.innerHTML = '';
    
    checkboxes.forEach((chk, index) => {
        const label = chk.parentElement.textContent.trim();
        const val = chk.value;
        const markKey = currentSelectedDate + '_aula_' + val;
        const isDone = extDoneMarks[markKey] || false;
        
        aulasDisponiveis.push({ label, val, index });
        
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:3px 0;';
        
        div.innerHTML = '<label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:12px;">' +
            '<input type="checkbox" class="sisprof-aula-chk" data-val="' + val + '" checked> ' + label +
            '</label>' +
            '<label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold; display:flex; align-items:center; gap:2px;" title="Marcar como Lançado">' +
                '<input type="checkbox" class="sisprof-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '> Lançado' +
            '</label>';
        
        lista.appendChild(div);
        
        // Evento para marcar como lançado
        const doneChk = div.querySelector('.sisprof-done-chk');
        doneChk.addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
            this.parentElement.style.color = this.checked ? '#38a169' : '#a0aec0';
        });
    });
}

// ==================== PREENCHIMENTO ====================

function selecionarDataSED(dataStr) {
    if (!dataStr) return;
    const parts = dataStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const day = parseInt(parts[2], 10);

    const monthSelect = document.querySelector('.ui-datepicker-month');
    const yearSelect = document.querySelector('.ui-datepicker-year');
    
    let changed = false;
    if (monthSelect && monthSelect.value != month) {
        monthSelect.value = month;
        monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        changed = true;
    }
    if (yearSelect && yearSelect.value != year) {
        yearSelect.value = year;
        yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
        changed = true;
    }

    const clickDay = () => {
        const dayCells = document.querySelectorAll('td[data-handler="selectDay"][data-month="' + month + '"][data-year="' + year + '"]');
        let found = false;
        for (const cell of dayCells) {
            const link = cell.querySelector('a.ui-state-default');
            if (link && link.textContent.trim() == day) {
                const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                link.dispatchEvent(clickEvent);
                found = true;
                break;
            }
        }
        if (!found) console.warn('[SisProf Ext] Célula do dia ' + day + ' não encontrada no calendário.');
    };

    if (changed) {
        setTimeout(clickDay, 500);
    } else {
        clickDay();
    }
}

function selecionarAulasSED() {
    const chks = document.querySelectorAll('.sisprof-aula-chk:checked');
    if (chks.length === 0) return;
    const selecionados = Array.from(chks).map(c => c.getAttribute('data-val'));

    const btnAbrir = document.querySelector('.multi-select-button');
    if (btnAbrir) btnAbrir.click(); 

    setTimeout(() => {
        const checkboxes = document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]');
        checkboxes.forEach(chk => {
            const val = chk.value;
            if (selecionados.includes(val) && !chk.checked) {
                chk.click();
            } else if (!selecionados.includes(val) && chk.checked) {
                chk.click();
            }
        });
        
        if (btnAbrir) btnAbrir.click();
    }, 200);
}

function marcarFaltasNaChamada() {
    const payload = extHistory[currentSelectedDate];
    if (!payload || !payload.faltas || payload.faltas.length === 0) {
        alert('Nenhum faltoso para marcar nesta data.');
        return;
    }
    
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
    let interagidos = 0;
    
    // Tenta múltiplos seletores para encontrar os cards de alunos
    const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"], [class*="aluno"]');
    
    if (cardsAlunos.length > 0) {
        cardsAlunos.forEach(card => {
            const nomeElement = card.querySelector('.nome_aluno');
            if (!nomeElement) return;
            let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
            
            // Encontra TODOS os checkboxes dentro do card (para lidar com dobradinhas)
            const checkboxes = card.querySelectorAll('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]');
            
            checkboxes.forEach(checkbox => {
                if (!checkbox) return;
                const levouFalta = alunosAlvo.includes(nomeAluno);
                const deveEstarPresente = !levouFalta;
                if (checkbox.checked !== deveEstarPresente) { 
                    checkbox.click(); 
                    interagidos++; 
                }
            });
        });
    } else {
        // Fallback: tenta encontrar checkboxes diretamente na tabela
        const linhas = document.querySelectorAll('table tbody tr');
        linhas.forEach(linha => {
            const cells = linha.querySelectorAll('td');
            if (cells.length < 2) return;
            const nomeTexto = cells[0].textContent.trim();
            let nomeAluno = normalize(nomeTexto).replace(/^\d+\s*[-.]?\s*/, '');
            const checkboxes = linha.querySelectorAll('input[type="checkbox"]');
            
            checkboxes.forEach(checkbox => {
                if (!checkbox) return;
                const levouFalta = alunosAlvo.includes(nomeAluno);
                const deveEstarPresente = !levouFalta;
                if (checkbox.checked !== deveEstarPresente) { 
                    checkbox.click(); 
                    interagidos++; 
                }
            });
        });
    }
    
    if (interagidos > 0) {
        alert('✅ ' + interagidos + ' falta(s) marcada(s) com sucesso!');
    } else {
        alert('⚠️ Nenhum checkbox de presença encontrado ou faltas já estavam marcadas.');
    }
}

function executarPreenchimento(payload) {
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    let interagidos = 0;
    
    // 1. Marca Faltas
    if (payload.faltas && payload.faltas.length > 0) {
        const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
        const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]');
        if (cardsAlunos.length > 0) {
            cardsAlunos.forEach(card => {
                const nomeElement = card.querySelector('.nome_aluno');
                if (!nomeElement) return;
                let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
                const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]');
                if (!checkbox) return;
                const levouFalta = alunosAlvo.includes(nomeAluno);
                const deveEstarPresente = !levouFalta;
                if (checkbox.checked !== deveEstarPresente) { checkbox.click(); interagidos++; }
            });
        }
    }

    // 2. Preenche Registro de Aula
    if (payload.registros && payload.registros.length > 0) {
        const txt = document.querySelector('textarea[name="o.Descricao"], textarea#conteudoAula, textarea.form-control, textarea');
        if (txt) {
            txt.value = payload.registros[0].conteudo;
            txt.dispatchEvent(new Event("input", { bubbles: true }));
            txt.dispatchEvent(new Event("change", { bubbles: true }));
            interagidos++;
        }
    }

    // 3. Preenche Fechamento (Notas/Faltas)
    if (payload.fechamento && payload.fechamento.length > 0) {
        const isFechamentoScreen = document.querySelector('.boxAulasPlanejadasRealizadas');
        if (isFechamentoScreen) {
            const alunosFechamento = payload.fechamento;
            const cardsFechamento = document.querySelectorAll('.card_aluno, .card_aluno1');
            
            cardsFechamento.forEach(card => {
                const nomeElement = card.querySelector('.nome_aluno');
                if (!nomeElement) return;
                const nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
                
                const dadosAluno = alunosFechamento.find(a => normalize(a.nome) === nomeAluno);
                if (dadosAluno) {
                    const inputs = card.querySelectorAll('input[type="number"]');
                    const txt = card.querySelector('textarea.form-control');
                    
                    if (inputs.length >= 4) {
                        if (dadosAluno.nota !== '') {
                            inputs[1].value = dadosAluno.nota;
                            inputs[1].dispatchEvent(new Event('input', {bubbles: true}));
                            inputs[1].dispatchEvent(new Event('change', {bubbles: true}));
                        }
                        inputs[2].value = dadosAluno.faltas;
                        inputs[2].dispatchEvent(new Event('input', {bubbles: true}));
                        inputs[2].dispatchEvent(new Event('change', {bubbles: true}));
                        
                        inputs[3].value = dadosAluno.ausencias_compensadas;
                        inputs[3].dispatchEvent(new Event('input', {bubbles: true}));
                        inputs[3].dispatchEvent(new Event('change', {bubbles: true}));
                        
                        interagidos++;
                    }
                    
                    if (txt && dadosAluno.nota !== '') {
                        txt.value = dadosAluno.justificativa;
                        txt.dispatchEvent(new Event('input', {bubbles: true}));
                        txt.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                }
            });
        }
    }
    
    // 4. Tenta Salvar
    if (interagidos > 0) {
        setTimeout(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar');
            });
            if (btnSalvar) {
                btnSalvar.click();
                alert('✅ Concluído! Lançamentos preenchidos e salvos na SED.');
            } else {
                alert('✅ Concluído! ⚠️ Clique em "Salvar" manualmente.');
            }
        }, 500);
    } else {
        alert('Nenhum dado pendente ou campos não encontrados na tela.');
    }
}

// ==================== ANÁLISE DE FALTOSOS ====================

function analisarFaltososTurma() {
    const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]');
    if (cardsAlunos.length === 0) {
        alert('Nenhum aluno encontrado. Abra a Chamada da turma primeiro.');
        return;
    }
    
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    
    // Coleta todos os alunos da tela
    const alunosNaTela = [];
    cardsAlunos.forEach(card => {
        const nomeElement = card.querySelector('.nome_aluno');
        if (!nomeElement) return;
        const nome = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
        const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]');
        const estaFaltando = checkbox ? !checkbox.checked : false;
        alunosNaTela.push({ nome, nomeOriginal: nomeElement.textContent.trim(), estaFaltando });
    });
    
    // Verifica contra os dados do payload
    const payload = extHistory[currentSelectedDate];
    const faltososEsperados = payload ? (payload.faltas || []).map(a => normalize(a.nome)) : [];
    
    // Alunos que estão faltando na tela
    const faltandoAgora = alunosNaTela.filter(a => a.estaFaltando).map(a => a.nomeOriginal);
    
    // Alunos que deveriam estar faltando (do payload)
    const deveriamFaltar = alunosNaTela.filter(a => faltososEsperados.includes(a.nome)).map(a => a.nomeOriginal);
    
    // Alunos que estão presentes mas deveriam estar faltando
    const inconsistentes = alunosNaTela.filter(a => 
        faltososEsperados.includes(a.nome) && !a.estaFaltando
    ).map(a => a.nomeOriginal);
    
    let html = '<div style="margin-bottom:10px;">';
    html += '<h4 style="margin:0 0 10px 0; color:#2d3748;">🔍 Análise de Faltosos</h4>';
    html += '<p style="font-size:12px; color:#4a5568; margin-bottom:10px;">Data: <strong>' + formatarDataBR(currentSelectedDate) + '</strong></p>';
    
    // Faltando agora
    html += '<div style="margin-bottom:10px; padding:8px; background:#fff5f5; border-radius:4px; border-left:4px solid #e53e3e;">';
    html += '<strong style="color:#c53030; font-size:12px;">🔴 Faltando Agora (' + faltandoAgora.length + '):</strong>';
    if (faltandoAgora.length > 0) {
        html += '<ul style="margin:5px 0 0 0; padding-left:20px; font-size:11px;">';
        faltandoAgora.forEach(n => { html += '<li>' + n + '</li>'; });
        html += '</ul>';
    } else {
        html += '<p style="font-size:11px; color:#718096; margin:5px 0 0 0;">Nenhum aluno faltando no momento.</p>';
    }
    html += '</div>';
    
    // Deveriam faltar (do payload)
    html += '<div style="margin-bottom:10px; padding:8px; background:#f0fff4; border-radius:4px; border-left:4px solid #38a169;">';
    html += '<strong style="color:#276749; font-size:12px;">📋 Faltosos Esperados (' + deveriamFaltar.length + '):</strong>';
    if (deveriamFaltar.length > 0) {
        html += '<ul style="margin:5px 0 0 0; padding-left:20px; font-size:11px;">';
        deveriamFaltar.forEach(n => { html += '<li>' + n + '</li>'; });
        html += '</ul>';
    } else {
        html += '<p style="font-size:11px; color:#718096; margin:5px 0 0 0;">Nenhum faltoso esperado.</p>';
    }
    html += '</div>';
    
    // Inconsistentes
    if (inconsistentes.length > 0) {
        html += '<div style="margin-bottom:10px; padding:8px; background:#fffaf0; border-radius:4px; border-left:4px solid #dd6b20;">';
        html += '<strong style="color:#c05621; font-size:12px;">⚠️ Inconsistentes (Presentes mas deveriam faltar) (' + inconsistentes.length + '):</strong>';
        html += '<ul style="margin:5px 0 0 0; padding-left:20px; font-size:11px;">';
        inconsistentes.forEach(n => { html += '<li>' + n + '</li>'; });
        html += '</ul>';
        html += '<button class="btn btn-sm btn-warning" onclick="marcarInconsistentesComoFalta()" style="margin-top:5px; font-size:11px;">✅ Marcar Todos como Falta</button>';
        html += '</div>';
    }
    
    html += '</div>';
    
    // Mostra em um modal simples
    const modalDiv = document.createElement('div');
    modalDiv.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:10px; z-index:1000000; box-shadow:0 10px 40px rgba(0,0,0,0.3); max-width:400px; width:90%; max-height:80vh; overflow-y:auto; border:2px solid #38a169;';
    modalDiv.innerHTML = html + '<button onclick="this.parentElement.remove()" style="width:100%; padding:8px; background:#e2e8f0; border:none; border-radius:4px; cursor:pointer; font-weight:bold; margin-top:10px;">Fechar</button>';
    document.body.appendChild(modalDiv);
}

// Função global para marcar inconsistentes
window.marcarInconsistentesComoFalta = function() {
    const payload = extHistory[currentSelectedDate];
    if (!payload || !payload.faltas) return;
    
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
    let interagidos = 0;
    
    const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]');
    cardsAlunos.forEach(card => {
        const nomeElement = card.querySelector('.nome_aluno');
        if (!nomeElement) return;
        let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
        const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]');
        if (!checkbox) return;
        
        if (alunosAlvo.includes(nomeAluno) && checkbox.checked) {
            checkbox.click();
            interagidos++;
        }
    });
    
    alert('✅ ' + interagidos + ' aluno(s) marcados como falta!');
    // Fecha o modal de análise
    const modal = document.querySelector('div[style*="position:fixed"][style*="top:50%"]');
    if (modal) modal.remove();
};

// ==================== EXTRAIR ALUNOS ====================

function iniciarExtrairAlunos() {
    const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
    if(cardsAlunos.length === 0) return alert('Nenhum aluno encontrado na tela. Abra a tela de chamada da turma desejada primeiro!');
    
    const btn = document.getElementById('sisprof-btn-extrair');
    if (btn) btn.textContent = 'Extraindo...';
    
    const alunos = [];
    cardsAlunos.forEach(card => {
        const nomeElement = card.querySelector('.nome_aluno');
        if (!nomeElement) return;
        let nomeCompleto = nomeElement.textContent.trim();
        nomeCompleto = nomeCompleto.replace(/^\d+\s*[-.]?\s*/, '');
        alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
    });
    
    let turmaSelecionada = "Desconhecida";
    const selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
    if (selectTurma && selectTurma.options[selectTurma.selectedIndex]) {
        turmaSelecionada = selectTurma.options[selectTurma.selectedIndex].text.trim();
    } else {
        const spans = document.querySelectorAll('.font-cabecalho-filtro');
        spans.forEach(span => {
            if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim();
        });
    }
    
    const payload = { type: 'SISPROF_IMPORT_ALUNOS', alunos: alunos, turmaSED: turmaSelecionada, timestamp: Date.now() };
    
    chrome.runtime.sendMessage({ action: 'SAVE_STUDENTS', payload: payload }, (response) => {
        if (response && response.success) {
            alert('✅ ' + alunos.length + ' aluno(s) extraídos! Volte ao SisProf e clique em "Atualizar Turma".');
        } else {
            alert('Erro ao salvar na nuvem: ' + (response ? response.error : 'Sem resposta do background.'));
        }
    });
    
    setTimeout(() => { if (btn) btn.textContent = '📥 Extrair Alunos (Atual)'; }, 2000);
}

async function iniciarExtrairTodasTurmas() {
    let selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
    let isCustomDropdown = false;
    let turmaWrapper = null;
    
    if (!selectTurma) {
        const labels = document.querySelectorAll('.form-label-dropdown');
        labels.forEach(l => {
            if (l.textContent.trim() === 'Turma') turmaWrapper = l.parentElement;
        });
        if (turmaWrapper) isCustomDropdown = true;
    }

    if (!selectTurma && !isCustomDropdown) {
        return alert('Filtro de turma não encontrado. Certifique-se de estar na tela com os filtros (ex: Frequência).');
    }
    
    const btn = document.getElementById('sisprof-btn-extrair-multi');
    const todasTurmas = [];
    
    if (!isCustomDropdown) {
        const options = Array.from(selectTurma.options).filter(o => o.value && o.text && !o.text.toLowerCase().includes('selecione') && !o.text.toLowerCase().includes('todos'));
        if (options.length === 0) return alert('Nenhuma turma encontrada no seletor.');
        if (!confirm('O robô vai processar ' + options.length + ' turmas automaticamente.\n\nNÃO CLIQUE em nada até ele terminar. Deseja continuar?')) return;

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            if (btn) btn.textContent = '⏳ Lendo ' + opt.text.trim().substring(0,10) + '... (' + (i+1) + '/' + options.length + ')';
            
            selectTurma.value = opt.value;
            selectTurma.dispatchEvent(new Event('change', { bubbles: true }));
            
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let btnBuscar = null;
            buttons.forEach(b => {
                const text = (b.innerText || b.value || '').toLowerCase();
                if (text.includes('pesquisar') || text.includes('buscar')) btnBuscar = b;
            });
            if (btnBuscar) btnBuscar.click();

            await new Promise(r => setTimeout(r, 4000));
            
            const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
            const alunos = [];
            cardsAlunos.forEach(card => {
                const nomeElement = card.querySelector('.nome_aluno');
                if (!nomeElement) return;
                let nomeCompleto = nomeElement.textContent.trim();
                nomeCompleto = nomeCompleto.replace(/^\d+\s*[-.]?\s*/, '');
                alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
            });
            
            if (alunos.length > 0) {
                todasTurmas.push({ turmaSED: opt.text.trim(), alunos: alunos });
            }
        }
    } else {
        if (!confirm('O robô tentará extrair as turmas automaticamente.\nNÃO CLIQUE EM NADA na tela.\nDeseja continuar?')) return;
        
        const input = turmaWrapper.querySelector('input');
        if (!input) return alert('Input do menu não encontrado.');
        
        input.click();
        await new Promise(r => setTimeout(r, 1000));
        
        const listItems = document.querySelectorAll('.custom-dropdown li');
        if (listItems.length === 0) return alert('Nenhuma turma encontrada no menu.');
        
        const optionsTexts = Array.from(listItems).map(li => li.textContent.trim()).filter(t => !t.toLowerCase().includes('selecione') && !t.toLowerCase().includes('todos'));
        
        input.click(); 
        await new Promise(r => setTimeout(r, 500));
        
        for (let i = 0; i < optionsTexts.length; i++) {
            const text = optionsTexts[i];
            if (btn) btn.textContent = '⏳ Lendo ' + text.substring(0,10) + '... (' + (i+1) + '/' + optionsTexts.length + ')';
            
            input.click();
            await new Promise(r => setTimeout(r, 1000));
            
            const currentListItems = document.querySelectorAll('.custom-dropdown li');
            const targetLi = Array.from(currentListItems).find(li => li.textContent.trim() === text);
            if (targetLi) targetLi.click();
            
            await new Promise(r => setTimeout(r, 1000));
            
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let btnBuscar = null;
            buttons.forEach(b => {
                const btext = (b.innerText || b.value || '').toLowerCase();
                if (btext.includes('pesquisar') || btext.includes('buscar')) btnBuscar = b;
            });
            if (btnBuscar) btnBuscar.click();
            
            await new Promise(r => setTimeout(r, 4000));
            
            const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
            const alunos = [];
            cardsAlunos.forEach(card => {
                const nomeElement = card.querySelector('.nome_aluno');
                if (!nomeElement) return;
                let nomeCompleto = nomeElement.textContent.trim();
                nomeCompleto = nomeCompleto.replace(/^\d+\s*[-.]?\s*/, '');
                alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
            });
            
            if (alunos.length > 0) {
                todasTurmas.push({ turmaSED: text, alunos: alunos });
            }
        }
    }
    
    if (todasTurmas.length === 0) {
        if (btn) btn.textContent = 'Nenhum aluno encontrado';
        setTimeout(() => { if (btn) btn.textContent = '📥 Extrair TODAS (Auto)'; }, 3000);
        return;
    }

    const payload = { type: 'SISPROF_IMPORT_ALUNOS_MULTI', turmas: todasTurmas, timestamp: Date.now() };
    
    chrome.runtime.sendMessage({ action: 'SAVE_STUDENTS', payload: payload }, (response) => {
        if (response && response.success) {
            alert('✅ ' + todasTurmas.length + ' turmas salvas na nuvem com sucesso!\n\nVolte ao SisProf e clique em "Atualizar Turma".');
        } else {
            alert('Erro ao salvar na nuvem: ' + (response ? response.error : 'Sem resposta do background.'));
        }
    });
    
    if (btn) btn.textContent = '✅ ' + todasTurmas.length + ' turmas copiadas!';
    setTimeout(() => { if (btn) btn.textContent = '📥 Extrair TODAS (Auto)'; }, 3000);
}

// ==================== UTILITÁRIOS ====================

function formatarDataBR(dataStr) {
    if (!dataStr) return '';
    const parts = dataStr.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

// ==================== INICIALIZAÇÃO ====================

// Tenta injetar a cada 2 segundos até conseguir (lida com Blazor que carrega dinamicamente)
var tentativas = 0;
var intervalo = setInterval(function() {
    tentativas++;
    if (document.body && !document.getElementById('sisprof-menu-flutuante')) {
        try { injetarMenu(); } catch(e) { console.error("Erro:", e); }
    }
    if (document.getElementById('sisprof-menu-flutuante') || tentativas > 20) {
        clearInterval(intervalo);
    }
}, 2000);

// Também tenta imediatamente
setTimeout(injetarMenu, 1000);