// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// v2.7.0 - Casamento de turma corrigido no "Extrair Alunos" (código série+letra em vez de substring solto)

    console.log("🤖 content_sed.js EXECUTADO - v2.7.0");

// ==================== VARIÁVEIS GLOBAIS ====================
let extHistory = {};
let extDoneMarks = {};
let currentSelectedDate = "";
let profsisProfile = null;
let profsisAppData = null;

// ==================== TELA DE STATUS (sem formulário de login) ====================

function mostrarTelaStatus() {
    const oldMenu = document.getElementById('sisprof-menu-flutuante');
    if (oldMenu) oldMenu.remove();
    if (document.getElementById('sisprof-status-box')) return;
    if (!document.body) { setTimeout(mostrarTelaStatus, 500); return; }
    
    console.log("🔍 Verificando status do ProfSis...");
    
    const div = document.createElement('div');
    div.id = 'sisprof-status-box';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:340px; background:white; border:3px solid #3182ce; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5);';
    div.innerHTML = 
        '<div style="background:#3182ce; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; text-align:center;">' +
            '🤖 Robô SisProf <span style="font-size:10px; opacity:0.7;">v2.1.0</span>' +
        '</div>' +
        '<div id="sisprof-status-content" style="text-align:center;">' +
            '<p style="font-size:13px; color:#4a5568;">⏳ Verificando conexão com o ProfSis...</p>' +
        '</div>';
    
    document.body.appendChild(div);
    
    // Pede ao background para verificar o login do ProfSis
    chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[SisProf Ext] Erro:', chrome.runtime.lastError);
            mostrarErroConexao(div);
            return;
        }
        
        if (response && response.loggedIn) {
            console.log('[SisProf Ext] ✅ ProfSis logado:', response.user.nome || response.user.email);
            profsisProfile = response.user;
            profsisAppData = response.appData || {};
            div.remove();
            iniciarFluxoCompleto();
        } else if (response && response.tabFound) {
            mostrarAvisoLogin(div);
        } else {
            mostrarBotaoAbrirProfSis(div);
        }
    });
}

function mostrarErroConexao(div) {
    const content = div.querySelector('#sisprof-status-content');
    content.innerHTML = 
        '<p style="font-size:13px; color:#e53e3e; margin-bottom:15px;">❌ Erro de conexão com a extensão.</p>' +
        '<button id="sisprof-btn-retry" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">🔄 Tentar Novamente</button>';
    document.getElementById('sisprof-btn-retry').onclick = function() { div.remove(); mostrarTelaStatus(); };
}

function mostrarAvisoLogin(div) {
    const content = div.querySelector('#sisprof-status-content');
    content.innerHTML = 
        '<p style="font-size:13px; color:#dd6b20; margin-bottom:10px;">⚠️ O ProfSis está aberto mas você não está logado.</p>' +
        '<p style="font-size:12px; color:#718096; margin-bottom:15px;">Faça login no ProfSis e depois clique no botão abaixo.</p>' +
        '<button id="sisprof-btn-recheck" style="width:100%; background:#38a169; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; margin-bottom:8px;">🔄 Já fiz login - Verificar</button>' +
        '<button id="sisprof-btn-open-profsis" style="width:100%; background:#3182ce; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px;">🌐 Ir para o ProfSis</button>';
    document.getElementById('sisprof-btn-recheck').onclick = function() { div.remove(); mostrarTelaStatus(); };
    document.getElementById('sisprof-btn-open-profsis').onclick = function() { chrome.runtime.sendMessage({ action: 'OPEN_PROFSIS' }); };
}

function mostrarBotaoAbrirProfSis(div) {
    const content = div.querySelector('#sisprof-status-content');
    content.innerHTML = 
        '<p style="font-size:13px; color:#e53e3e; margin-bottom:10px;">🔴 O ProfSis não está aberto.</p>' +
        '<p style="font-size:12px; color:#718096; margin-bottom:15px;">Abra o ProfSis, faça login e depois clique no botão abaixo para conectar.</p>' +
        '<button id="sisprof-btn-open-profsis" style="width:100%; background:#3182ce; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; margin-bottom:8px;">🌐 Abrir ProfSis</button>' +
        '<button id="sisprof-btn-recheck" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px;">✅ Já abri e loguei - Conectar</button>';
    document.getElementById('sisprof-btn-open-profsis').onclick = function() { chrome.runtime.sendMessage({ action: 'OPEN_PROFSIS' }); };
    document.getElementById('sisprof-btn-recheck').onclick = function() { div.remove(); mostrarTelaStatus(); };
}

// ==================== FLUXO PRINCIPAL ====================

function iniciarFluxoCompleto() {
    if (profsisProfile) {
        carregarDadosProfSis();
    } else {
        chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.loggedIn) { mostrarTelaStatus(); return; }
            profsisProfile = response.user;
            profsisAppData = response.appData || {};
            carregarDadosProfSis();
        });
    }
}

function carregarDadosProfSis() {
    console.log('[SisProf Ext] Dados do ProfSis:', Object.keys(profsisAppData || {}).length, 'chaves');
    if (!profsisAppData || Object.keys(profsisAppData).length === 0) {
        console.log('[SisProf Ext] Sem dados - pedindo ao ProfSis...');
        chrome.runtime.sendMessage({ action: 'REQUEST_PROFSIS_DATA' });
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (response) => {
                if (response && response.loggedIn && response.appData) { profsisAppData = response.appData; }
                montarHistoricoLocal();
                chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
                    if (!chrome.runtime.lastError && data) extDoneMarks = data.rpa_done_marks || {};
                    injetarMenu();
                });
            });
        }, 3000);
        return;
    }
    montarHistoricoLocal();
    chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
        if (!chrome.runtime.lastError && data) extDoneMarks = data.rpa_done_marks || {};
        injetarMenu();
    });
}

// ==================== MONTAGEM DE HISTÓRICO ====================

function montarHistoricoLocal() {
    extHistory = {};
    const hoje = new Date();
    for (let i = 0; i < 30; i++) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i);
        const dataStr = d.toISOString().split('T')[0];
        extHistory[dataStr] = montarPayloadPorData(dataStr);
    }
    console.log('[SisProf Ext] Histórico montado:', Object.keys(extHistory).length, 'dias');
}

function montarPayloadPorData(dataStr) {
    const presencas = (profsisAppData.presencas || []);
    const estudantes = (profsisAppData.estudantes || []);
    const registrosAula = (profsisAppData.registrosAula || []);
    const registrosAdmin = (profsisAppData.registrosAdministrativos || []);
    
    // FALTOSOS: apenas alunos classificados como "Faltoso" pela gestão
    // A classificação vem de registrosAdministrativos onde tipo === 'Faltoso'
    const faltososGestao = registrosAdmin.filter(r => r.tipo === 'Faltoso');
    let alunosFaltantesNomes = [];
    
    faltososGestao.forEach(reg => {
        const est = estudantes.find(e => e.id == reg.estudanteId);
        if (!est) return;
        // Apenas alunos ativos
        if (est.status && est.status !== 'Ativo') return;
        
        // Verifica se houve chamada neste dia para este aluno
        const presencaDoDia = presencas.find(p => p.id_estudante == est.id && p.data === dataStr);
        
        if (!presencaDoDia) {
            // Não houve chamada - considera como falta
            alunosFaltantesNomes.push({ nome: est.nome_completo, id_turma: est.id_turma, id_estudante: est.id });
        } else if (presencaDoDia.status === 'falta') {
            // Houve chamada e o aluno faltou
            alunosFaltantesNomes.push({ nome: est.nome_completo, id_turma: est.id_turma, id_estudante: est.id });
        }
        // Se houve chamada e o aluno esteve presente, NÃO inclui (não faltou)
    });
    
    const registrosNoDia = registrosAula.filter(r => r.data === dataStr);

    return { data: dataStr, faltas: alunosFaltantesNomes, registros: registrosNoDia.map(r => ({ conteudo: r.conteudo })), fechamento: [] };
}

// Turmas que o professor tem no dia — mesma lógica do card "Agenda do Dia" do dashboard do ProfSis
// (app.js renderDashboard): grade da escola + exceções do dia, cruzadas com horariosAulas do professor.
// Usa schoolGrade/schoolExceptions (cópia que o ProfSis salva no professor ao abrir uma turma),
// já que a extensão não tem acesso direto ao documento da gestão.
function montarTurmasDoDia(dataStr) {
    if (!dataStr) return [];
    const gradeEscola = profsisAppData.schoolGrade || [];
    const excecoesGrade = profsisAppData.schoolExceptions || [];
    const minhasAulas = profsisAppData.horariosAulas || [];
    const turmas = profsisAppData.turmas || [];
    const diaSemana = new Date(dataStr + 'T12:00:00').getDay();
    const excecaoDoDia = excecoesGrade.find(e => e.data === dataStr);
    const blocosDoDia = excecaoDoDia
        ? (excecaoDoDia.blocos || [])
        : gradeEscola.filter(g => g.diaSemana == diaSemana).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));

    const lista = [];
    blocosDoDia.forEach(bloco => {
        const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
        if (aula && aula.tipo === 'aula' && aula.id_turma) {
            const turma = turmas.find(t => t.id == aula.id_turma);
            if (turma && turma.nome && turma.disciplina && !lista.some(t => t.id === turma.id)) {
                lista.push({ id: turma.id, nome: turma.nome, disciplina: turma.disciplina });
            }
        }
    });
    return lista;
}

// ==================== MENU FLUTUANTE ====================

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    if (!document.body) { setTimeout(injetarMenu, 500); return; }
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:350px; background:white; border:3px solid #38a169; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5); max-height:90vh; overflow-y:auto;';
    div.innerHTML = '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🤖 SisProf <span style="font-size:10px; opacity:0.7;">v2.7.0</span></span>' +
        '<div style="display:flex; gap:8px; align-items:center;"><span id="sisprof-user-name" style="font-size:11px; opacity:0.9; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
        '<span id="sisprof-minimizar" style="cursor:pointer; font-size:16px;">▶</span><span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span></div></div>' +
        '<div id="sisprof-conteudo"><p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Conectado ao ProfSis!</p>' +
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;"><label style="font-size:12px; font-weight:bold; color:#276749; display:block; margin-bottom:4px;">📅 Selecione o Dia:</label>' +
        '<div style="display:flex; gap:5px;"><input type="date" id="sisprof-data-input" style="flex:1; padding:6px; border:1px solid #cbd5e0; border-radius:4px; font-size:12px;"><button id="sisprof-btn-hoje" style="background:#38a169; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Hoje</button></div></div>' +
        '<div id="sisprof-status" style="background:#f7fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px; font-size:11px; color:#718096;">Verificando...</div>' +
        '<div style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; overflow:hidden;">' +
            '<div style="background:#f7fafc; padding:6px 8px; font-size:11px; font-weight:bold; color:#4a5568; border-bottom:1px solid #e2e8f0;">📚 Aulas do Dia</div>' +
            '<div id="sisprof-lista-turmas"></div>' +
        '</div>' +
        '<button id="sisprof-btn-preencher" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;">✅ Preencher Chamada</button>' +
        '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">📥 Extrair Alunos (Atualizar Banco)</button>' +
        '<hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;">' +
        '<button id="sisprof-btn-logout" style="width:100%; background:#718096; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px;">🚪 Desconectar</button></div>';
    document.body.appendChild(div);
    if (profsisProfile && profsisProfile.nome) { const n = document.getElementById('sisprof-user-name'); if (n) n.textContent = profsisProfile.nome.split(' ')[0]; }
    document.getElementById('sisprof-fechar').onclick = function() { div.remove(); };
    document.getElementById('sisprof-minimizar').onclick = function() { const c = document.getElementById('sisprof-conteudo'); c.style.display = c.style.display === 'none' ? 'block' : 'none'; this.innerHTML = c.style.display === 'none' ? '◀' : '▶'; };
    document.getElementById('sisprof-btn-logout').onclick = function() { chrome.runtime.sendMessage({ action: 'PROFSIS_LOGOUT' }, () => { div.remove(); profsisProfile = null; profsisAppData = null; extHistory = {}; mostrarTelaStatus(); }); };
    document.getElementById('sisprof-btn-hoje').onclick = function() { const h = new Date().toISOString().split('T')[0]; document.getElementById('sisprof-data-input').value = h; currentSelectedDate = h; atualizarInterfacePorData(); };
    document.getElementById('sisprof-data-input').addEventListener('change', function() { currentSelectedDate = this.value; atualizarInterfacePorData(); });
    document.getElementById('sisprof-btn-preencher').onclick = function() {
        if (!currentSelectedDate) { alert('Selecione um dia primeiro.'); return; }
        const btn = this; const oldText = btn.textContent; btn.textContent = '⏳ Preenchendo...'; btn.disabled = true;
        selecionarDataSED(currentSelectedDate);
        setTimeout(() => {
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let btnBuscar = null;
            buttons.forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar') || t.includes('listar')) btnBuscar = b; });
            if (btnBuscar) btnBuscar.click();
            setTimeout(() => { const payload = extHistory[currentSelectedDate]; if (payload) executarPreenchimento(payload); btn.textContent = oldText; btn.disabled = false; }, 2500);
        }, 1000);
    };
    document.getElementById('sisprof-btn-extrair').onclick = iniciarExtrairAlunos;
    let observerDebounce = null, observerBusy = false;
    const observer = new MutationObserver(() => {
        if (observerBusy) return;
        if (observerDebounce) clearTimeout(observerDebounce);
        observerDebounce = setTimeout(() => { if (document.querySelector('.card_aluno, .card_aluno1')) { observerBusy = true; try { atualizarInterfacePorData(); } catch (e) {} finally { observerBusy = false; } } }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const h = new Date().toISOString().split('T')[0];
    document.getElementById('sisprof-data-input').value = h;
    currentSelectedDate = h;
    // Mostra a agenda do dia imediatamente, em qualquer tela (não depende de entrar na chamada)
    atualizarInterfacePorData();
}

// ==================== INTERFACE ====================

function atualizarInterfacePorData() {
    const statusEl = document.getElementById('sisprof-status');
    if (!statusEl) return;
    if (!currentSelectedDate || !extHistory[currentSelectedDate]) {
        statusEl.innerHTML = '⏳ <strong>Sem dados para esta data.</strong><br>Verifique se há chamadas no ProfSis.';
        renderizarListaTurmasDoDia();
        return;
    }
    const payload = extHistory[currentSelectedDate];
    const numFaltas = (payload.faltas && payload.faltas.length) ? payload.faltas.length : 0;
    const temRegistro = (payload.registros && payload.registros.length > 0 && payload.registros[0].conteudo) ? 'Sim' : 'Não';
    statusEl.innerHTML = '<strong>📅 ' + formatarDataBR(currentSelectedDate) + '</strong><br>🔴 Faltosos (Gestão): <strong>' + numFaltas + '</strong><br>📝 Registro: <strong>' + temRegistro + '</strong>';
    renderizarListaTurmasDoDia();
}

// Aulas que o professor tem no dia selecionado (consulta a agenda: gradeHoraria + horariosAulas),
// com checkbox para marcar como concluído.
function renderizarListaTurmasDoDia() {
    const container = document.getElementById('sisprof-lista-turmas');
    if (!container) return;
    const turmas = montarTurmasDoDia(currentSelectedDate);
    if (turmas.length === 0) {
        container.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0; font-size:12px;">Nenhuma aula para este dia.</div>';
        return;
    }
    container.innerHTML = '';
    turmas.forEach(turma => {
        const markKey = currentSelectedDate + '_turma_' + turma.id;
        const isDone = extDoneMarks[markKey] || false;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:6px 8px;';
        div.innerHTML =
            '<span style="font-size:12px; color:#2d3748; font-weight:600;">' + turma.nome + ' ' + turma.disciplina + '</span>' +
            '<input type="checkbox" class="sisprof-turma-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '>';
        container.appendChild(div);
        div.querySelector('.sisprof-turma-done-chk').addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
        });
    });
    const last = container.lastElementChild;
    if (last) last.style.borderBottom = 'none';
}

// ==================== PREENCHIMENTO ====================

function selecionarDataSED(dataStr) {
    if (!dataStr) return;
    const parts = dataStr.split('-');
    const year = parseInt(parts[0], 10); const month = parseInt(parts[1], 10) - 1; const day = parseInt(parts[2], 10);
    const monthSelect = document.querySelector('.ui-datepicker-month'); const yearSelect = document.querySelector('.ui-datepicker-year');
    let changed = false;
    if (monthSelect && monthSelect.value != month) { monthSelect.value = month; monthSelect.dispatchEvent(new Event('change', { bubbles: true })); changed = true; }
    if (yearSelect && yearSelect.value != year) { yearSelect.value = year; yearSelect.dispatchEvent(new Event('change', { bubbles: true })); changed = true; }
    const clickDay = () => { const dayCells = document.querySelectorAll('td[data-handler="selectDay"][data-month="' + month + '"][data-year="' + year + '"]'); for (const cell of dayCells) { const link = cell.querySelector('a.ui-state-default'); if (link && link.textContent.trim() == day) { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); break; } } };
    if (changed) setTimeout(clickDay, 500); else clickDay();
}


function executarPreenchimento(payload) {
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    let interagidos = 0;
    
    // Marca apenas os faltosos classificados pela gestão
    // payload.faltas agora contém apenas os faltosos da gestão que realmente faltaram
    if (payload.faltas && payload.faltas.length > 0) {
        const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
        document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]').forEach(card => {
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
    
    // Preenche registro/conteúdo da aula se disponível
    if (payload.registros && payload.registros.length > 0) {
        const txt = document.querySelector('textarea[name="o.Descricao"], textarea#conteudoAula, textarea.form-control, textarea');
        if (txt) { txt.value = payload.registros[0].conteudo; txt.dispatchEvent(new Event("input", { bubbles: true })); txt.dispatchEvent(new Event("change", { bubbles: true })); interagidos++; }
    }
    
    // Fechamento bimestre se aplicável
    if (payload.fechamento && payload.fechamento.length > 0) {
        const isFechamentoScreen = document.querySelector('.boxAulasPlanejadasRealizadas');
        if (isFechamentoScreen) {
            const alunosFechamento = payload.fechamento;
            document.querySelectorAll('.card_aluno, .card_aluno1').forEach(card => {
                const nomeElement = card.querySelector('.nome_aluno');
                if (!nomeElement) return;
                const nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
                const dadosAluno = alunosFechamento.find(a => normalize(a.nome) === nomeAluno);
                if (dadosAluno) {
                    const inputs = card.querySelectorAll('input[type="number"]');
                    const txt = card.querySelector('textarea.form-control');
                    if (inputs.length >= 4) {
                        if (dadosAluno.nota !== '') { inputs[1].value = dadosAluno.nota; inputs[1].dispatchEvent(new Event('input', {bubbles: true})); inputs[1].dispatchEvent(new Event('change', {bubbles: true})); }
                        inputs[2].value = dadosAluno.faltas; inputs[2].dispatchEvent(new Event('input', {bubbles: true})); inputs[2].dispatchEvent(new Event('change', {bubbles: true}));
                        inputs[3].value = dadosAluno.ausencias_compensadas; inputs[3].dispatchEvent(new Event('input', {bubbles: true})); inputs[3].dispatchEvent(new Event('change', {bubbles: true}));
                        interagidos++;
                    }
                    if (txt && dadosAluno.nota !== '') { txt.value = dadosAluno.justificativa; txt.dispatchEvent(new Event('input', {bubbles: true})); txt.dispatchEvent(new Event('change', {bubbles: true})); }
                }
            });
        }
    }
    
    if (interagidos > 0) {
        setTimeout(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar');
            });
            if (btnSalvar) { btnSalvar.click(); alert('✅ Concluído! Lançamentos preenchidos e salvos na SED.'); }
            else alert('✅ Concluído! ⚠️ Clique em "Salvar" manualmente.');
        }, 500);
    } else alert('Nenhum dado pendente ou campos não encontrados na tela.');
}

// ==================== EXTRAIR ALUNOS (atualiza direto no banco) ====================

const SELETOR_CARDS_ALUNO = '.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno';

// A SED é uma SPA (Blazor) que renderiza os cards de aluno aos poucos. Raspar a tela imediatamente
// ao clicar pode pegar uma lista PARCIAL (poucos cards ainda montados) - o que já fez a extensão
// marcar erroneamente a maioria da turma como "Transferido". Por isso, só considera a lista pronta
// quando a contagem de cards não mudar entre duas checagens seguidas.
function aguardarCardsEstaveis(callback, tentativas) {
    tentativas = tentativas || 0;
    const contagem1 = document.querySelectorAll(SELETOR_CARDS_ALUNO).length;
    setTimeout(() => {
        const contagem2 = document.querySelectorAll(SELETOR_CARDS_ALUNO).length;
        if (contagem2 === contagem1 || tentativas >= 6) {
            callback();
        } else {
            aguardarCardsEstaveis(callback, tentativas + 1);
        }
    }, 400);
}

function iniciarExtrairAlunos() {
    const btn = document.getElementById('sisprof-btn-extrair');
    if (btn) { btn.textContent = '⏳ Aguardando lista carregar...'; btn.disabled = true; }

    aguardarCardsEstaveis(() => {
        const cardsAlunos = document.querySelectorAll(SELETOR_CARDS_ALUNO);
        if (cardsAlunos.length === 0) {
            if (btn) { btn.textContent = '📥 Extrair Alunos (Atualizar Banco)'; btn.disabled = false; }
            return alert('Nenhum aluno encontrado na tela. Abra a tela de chamada da turma desejada primeiro!');
        }

        if (btn) btn.textContent = '⏳ Extraindo e atualizando...';

        const alunos = [];
        cardsAlunos.forEach(card => {
            const nomeElement = card.querySelector('.nome_aluno');
            if (!nomeElement) return;
            let nomeCompleto = nomeElement.textContent.trim().replace(/^\d+\s*[-.]?\s*/, '');
            alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
        });

        // Detecta a turma selecionada na SED
        let turmaSelecionada = "Desconhecida";
        const selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
        if (selectTurma && selectTurma.options[selectTurma.selectedIndex]) {
            turmaSelecionada = selectTurma.options[selectTurma.selectedIndex].text.trim();
        } else {
            document.querySelectorAll('.font-cabecalho-filtro').forEach(span => {
                if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim();
            });
        }

        console.log('[SisProf Ext] Extraindo', alunos.length, 'alunos da turma', turmaSelecionada);

        // Pede ao background para escrever direto no Firestore (ou, se não houver sessão salva, via aba do ProfSis)
        const payload = { alunos: alunos, turmaSED: turmaSelecionada, timestamp: Date.now() };
        chrome.runtime.sendMessage({ action: 'UPDATE_STUDENTS_DB', payload: payload }, (response) => {
            if (btn) { btn.textContent = '📥 Extrair Alunos (Atualizar Banco)'; btn.disabled = false; }
            if (chrome.runtime.lastError) {
                alert('⚠️ Erro de comunicação com a extensão: ' + chrome.runtime.lastError.message);
                return;
            }
            if (response && response.success) {
                const r = response.resultado;
                const via = response.direct ? 'direto no banco' : 'via aba do ProfSis';
                const detalhes = r ? ('\n\n✔️ Novos: ' + r.adicionados + ' | 🔄 Reativados: ' + r.reativados) : '';
                const d = r && r.debugInfo;
                const diagnostico = d
                    ? '\n\n🔎 Gravado em:\nConta (uid): ' + d.uid + '\nEscola (schoolId): ' + (d.schoolId || '-') +
                      '\nTexto lido na SED: "' + d.turmaSED + '"' +
                      '\nTurma local casada: "' + (d.turmaNomeLocal || '?') + '"' + (d.turmaDisciplinaLocal ? ' - ' + d.turmaDisciplinaLocal : '') +
                      '\n' + (d.masterId ? ('Documento da escola (turma vinculada), id_turma=' + d.masterId) : ('Documento pessoal do professor, id_turma=' + d.turmaId))
                    : '';
                alert('✅ ' + alunos.length + ' aluno(s) processados ' + via + '!\n\nTurma: ' + turmaSelecionada + detalhes + diagnostico);
            } else {
                alert('⚠️ Não foi possível atualizar o banco.\n' + (response ? response.error : 'Sem resposta da extensão.') + '\n\nDica: faça login no ProfSis pelo menos uma vez para a extensão salvar sua sessão.');
            }
        });
    });
}

// ==================== UTILITÁRIOS ====================

function formatarDataBR(dataStr) { if (!dataStr) return ''; const parts = dataStr.split('-'); return parts[2] + '/' + parts[1] + '/' + parts[0]; }

// ==================== INICIALIZAÇÃO ====================

var tentativas = 0;
var intervalo = setInterval(function() {
    if (document.body && !document.getElementById('sisprof-menu-flutuante') && !document.getElementById('sisprof-status-box')) { try { mostrarTelaStatus(); } catch(e) { console.error("Erro:", e); } }
    if (document.getElementById('sisprof-menu-flutuante') || document.getElementById('sisprof-status-box') || tentativas > 20) { clearInterval(intervalo); }
    tentativas++;
}, 2000);

setTimeout(mostrarTelaStatus, 1000);
