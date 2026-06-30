// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// v2.0 - Login direto + busca de dados do Firebase (sem depender do app ProfSis)

console.log("🤖 content_sed.js EXECUTADO - v2.0 (Firebase Direto)");

// ==================== VARIÁVEIS GLOBAIS ====================
let extHistory = {};
let extDoneMarks = {};
let currentSelectedDate = "";
let aulasSelecionadasState = new Set();
let aulasDisponiveis = [];
let fbProfile = null; // Perfil do usuário logado
let fbProfessorData = null; // Dados do professor (app_data_<uid>)
let fbGestorData = null; // Dados da escola (grade horária)

// ==================== TELA DE LOGIN ====================

function mostrarTelaLogin() {
    // Remove menu existente se houver
    const oldMenu = document.getElementById('sisprof-menu-flutuante');
    if (oldMenu) oldMenu.remove();
    
    if (document.getElementById('sisprof-login-box')) return;
    if (!document.body) { setTimeout(mostrarTelaLogin, 500); return; }
    
    console.log("🔐 Mostrando tela de login...");
    
    const div = document.createElement('div');
    div.id = 'sisprof-login-box';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:320px; background:white; border:3px solid #3182ce; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5);';
    div.innerHTML = 
        '<div style="background:#3182ce; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; text-align:center;">' +
            '🤖 Robô SisProf - Login' +
        '</div>' +
        '<p style="font-size:12px; color:#4a5568; margin-bottom:15px;">Faça login com sua conta do ProfSis para buscar seus dados automaticamente.</p>' +
        '<form id="sisprof-login-form">' +
            '<label style="font-size:12px; font-weight:bold; color:#2d3748; display:block; margin-bottom:4px;">Email:</label>' +
            '<input type="email" id="sisprof-login-email" required style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px; margin-bottom:10px; box-sizing:border-box;">' +
        '<label style="font-size:12px; font-weight:bold; color:#2d3748; display:block; margin-bottom:4px;">Senha:</label>' +
        '<div style="position:relative; margin-bottom:15px;">' +
            '<input type="password" id="sisprof-login-senha" required style="width:100%; padding:8px 36px 8px 8px; border:1px solid #cbd5e0; border-radius:4px; box-sizing:border-box;">' +
            '<span id="sisprof-toggle-senha" title="Mostrar/ocultar senha" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:16px; user-select:none; color:#718096;">👁️</span>' +
        '</div>' +
        '<button type="submit" id="sisprof-btn-login" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px;">🔐 Entrar</button>' +
    '</form>' +
        '<div id="sisprof-login-status" style="margin-top:10px; font-size:12px; text-align:center;"></div>';
    
    document.body.appendChild(div);
    
    // Toggle para revelar/ocultar a senha
    const toggleSenha = document.getElementById('sisprof-toggle-senha');
    const inputSenha = document.getElementById('sisprof-login-senha');
    if (toggleSenha && inputSenha) {
        toggleSenha.addEventListener('click', function() {
            if (inputSenha.type === 'password') {
                inputSenha.type = 'text';
                toggleSenha.textContent = '🙈';
            } else {
                inputSenha.type = 'password';
                toggleSenha.textContent = '👁️';
            }
        });
    }
    
    document.getElementById('sisprof-login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('sisprof-login-email').value.trim().toLowerCase();
        const senha = document.getElementById('sisprof-login-senha').value;
        const btn = document.getElementById('sisprof-btn-login');
        const status = document.getElementById('sisprof-login-status');
        
        btn.textContent = '⏳ Entrando...';
        btn.disabled = true;
        status.innerHTML = '<span style="color:#3182ce;">Conectando ao Firebase...</span>';
        
        chrome.runtime.sendMessage({ action: 'FIREBASE_LOGIN', email: email, password: senha }, (response) => {
            if (chrome.runtime.lastError) {
                status.innerHTML = '<span style="color:#e53e3e;">Erro: ' + chrome.runtime.lastError.message + '</span>';
                btn.textContent = '🔐 Entrar';
                btn.disabled = false;
                return;
            }
            if (response && response.success) {
                status.innerHTML = '<span style="color:#38a169; font-weight:bold;">✅ Login realizado!</span>';
                setTimeout(() => {
                    div.remove();
                    iniciarFluxoCompleto();
                }, 800);
            } else {
                status.innerHTML = '<span style="color:#e53e3e;">❌ ' + (response ? response.error : 'Erro desconhecido') + '</span>';
                btn.textContent = '🔐 Entrar';
                btn.disabled = false;
            }
        });
    });
}

// ==================== FLUXO PRINCIPAL ====================

function iniciarFluxoCompleto() {
    // Verifica sessão e busca dados
    chrome.runtime.sendMessage({ action: 'FIREBASE_CHECK_SESSION' }, (session) => {
        if (chrome.runtime.lastError || !session || !session.loggedIn) {
            mostrarTelaLogin();
            return;
        }
        fbProfile = session.user;
        carregarDadosFirebase();
    });
}

// Busca dados do professor direto do Firebase (via background)
function carregarDadosFirebase() {
    console.log('[SisProf Ext] Buscando dados do Firebase...');
    const statusEl = document.getElementById('sisprof-status');
    if (statusEl) statusEl.innerHTML = '⏳ <strong>Buscando dados na nuvem...</strong>';
    
    chrome.runtime.sendMessage({ action: 'FIREBASE_GET_PROFESSOR_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[SisProf Ext] Erro:', chrome.runtime.lastError.message);
            alert('Erro ao buscar dados: ' + chrome.runtime.lastError.message);
            return;
        }
        if (!response || !response.success) {
            console.error('[SisProf Ext] Falha:', response ? response.error : 'sem resposta');
            alert('Falha ao buscar dados: ' + (response ? response.error : 'sem resposta'));
            return;
        }
        
        fbProfessorData = response.professorData || {};
        fbGestorData = response.gestorData || {};
        fbProfile = response.profile || fbProfile;
        
        console.log('[SisProf Ext] Dados recebidos! Professor:', Object.keys(fbProfessorData).length, 'chaves');
        
        // Monta o histórico de payloads para os últimos 30 dias
        montarHistoricoLocal();
        
        // Carrega marcadores salvos localmente
        chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
            if (!chrome.runtime.lastError && data) {
                extDoneMarks = data.rpa_done_marks || {};
            }
            atualizarInterfacePorData();
            setTimeout(lerAulasDaTela, 1000);
        });
    });
}

// Monta o payload (faltas, registros, turmas) para cada dia, igual ao app.js
function montarHistoricoLocal() {
    extHistory = {};
    const hoje = new Date();
    
    // Gera payloads para os últimos 30 dias
    for (let i = 0; i < 30; i++) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i);
        const dataStr = d.toISOString().split('T')[0];
        extHistory[dataStr] = montarPayloadPorData(dataStr);
    }
    
    console.log('[SisProf Ext] Histórico local montado:', Object.keys(extHistory).length, 'dias');
}

// Réplica da função montarPayloadPorData do app.js
function montarPayloadPorData(dataStr) {
    let alunosFaltantesNomes = [];
    
    const presencas = (fbProfessorData.presencas || []);
    const estudantes = (fbProfessorData.estudantes || []);
    const registrosAula = (fbProfessorData.registrosAula || []);
    
    const faltasNoDia = presencas.filter(p => p.data === dataStr && p.status === 'falta');
    const presencasNoDia = presencas.filter(p => p.data === dataStr);
    
    if (presencasNoDia.length > 0) {
        // Se houve chamada, pega apenas os faltosos registrados
        faltasNoDia.forEach(f => {
            const estudante = estudantes.find(e => e.id == f.id_estudante);
            if (estudante) alunosFaltantesNomes.push({ nome: estudante.nome_completo, id_turma: estudante.id_turma });
        });
    } else {
        // Se NÃO houve chamada neste dia, considera TODOS os alunos como faltosos
        const estudantesAtivos = estudantes.filter(e => !e.status || e.status === 'Ativo');
        estudantesAtivos.forEach(e => {
            alunosFaltantesNomes.push({ nome: e.nome_completo, id_turma: e.id_turma });
        });
    }
    
    const registrosNoDia = registrosAula.filter(r => r.data === dataStr);
    
    // Monta lista de turmas/disciplinas do professor neste dia
    const turmasDoDia = [];
    const gradeEscola = (fbGestorData && fbGestorData.gradeHoraria) || fbProfessorData.gradeHoraria || [];
    const excecoesGrade = (fbGestorData && fbGestorData.gradeHorariaExcecoes) || fbProfessorData.gradeHorariaExcecoes || [];
    const minhasAulas = fbProfessorData.horariosAulas || [];
    const turmas = fbProfessorData.turmas || [];
    
    const d = new Date(dataStr + 'T12:00:00');
    const diaSemana = d.getDay();
    
    const excecao = excecoesGrade.find(e => e.data === dataStr);
    const blocosHoje = excecao ? (excecao.blocos || []) : gradeEscola.filter(g => g.diaSemana == diaSemana);
    
    blocosHoje.forEach(bloco => {
        const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
        if (aula && aula.tipo === 'aula' && aula.id_turma) {
            const turma = turmas.find(t => t.id == aula.id_turma);
            if (turma) {
                turmasDoDia.push({
                    id: turma.id,
                    nome: turma.nome,
                    disciplina: turma.disciplina || '',
                    horario: (bloco.inicio || '') + ' - ' + (bloco.fim || ''),
                    label: bloco.label || ''
                });
            }
        }
    });
    
    return {
        data: dataStr,
        faltas: alunosFaltantesNomes,
        registros: registrosNoDia.map(r => ({ conteudo: r.conteudo })),
        fechamento: [],
        turmas: turmasDoDia
    };
}

// ==================== MENU FLUTUANTE ====================

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    if (!document.body) { setTimeout(injetarMenu, 500); return; }
    
    console.log("🔄 Injetando menu flutuante...");
    
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:350px; background:white; border:3px solid #38a169; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5); max-height:90vh; overflow-y:auto; transition: all 0.3s ease;';
    div.innerHTML = 
        '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🤖 Robô SisProf <span id="sisprof-versao" style="font-size:10px; opacity:0.7;">v2.0</span></span>' +
            '<div style="display:flex; gap:8px; align-items:center;">' +
                '<span id="sisprof-user-name" style="font-size:11px; opacity:0.9; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
                '<span id="sisprof-minimizar" style="cursor:pointer; font-size:16px;" title="Minimizar">▶</span>' +
                '<span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span>' +
            '</div>' +
        '</div>' +
        '<div id="sisprof-conteudo">' +
        '<p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Conectado ao Firebase!</p>' +
        
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;">' +
            '<label style="font-size:12px; font-weight:bold; color:#276749; display:block; margin-bottom:4px;">📅 Selecione o Dia:</label>' +
            '<div style="display:flex; gap:5px;">' +
                '<input type="date" id="sisprof-data-input" style="flex:1; padding:6px; border:1px solid #cbd5e0; border-radius:4px; font-size:12px;">' +
                '<button id="sisprof-btn-hoje" style="background:#38a169; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Hoje</button>' +
            '</div>' +
        '</div>' +
        
        '<div id="sisprof-status" style="background:#f7fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px; font-size:11px; color:#718096;">Verificando...</div>' +
        
        '<div style="background:#ebf8ff; padding:10px; border-radius:8px; border:1px solid #bee3f8; margin-bottom:10px;">' +
            '<label style="font-size:12px; font-weight:bold; color:#2c5282; display:block; margin-bottom:4px;">📚 Aulas do Dia:</label>' +
            '<div id="sisprof-lista-aulas" style="max-height:120px; overflow-y:auto; font-size:12px;">' +
                '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Carregando aulas...</div>' +
            '</div>' +
            '<button id="sisprof-btn-atualizar-aulas" style="width:100%; background:#3182ce; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-size:11px; margin-top:5px;">🔄 Atualizar Aulas da Tela</button>' +
        '</div>' +
        
        '<div style="background:#fff5f5; padding:10px; border-radius:8px; border:1px solid #fed7d7; margin-bottom:10px;">' +
            '<label style="font-size:12px; font-weight:bold; color:#c53030; display:block; margin-bottom:4px;">🔴 Faltosos do Dia:</label>' +
            '<div id="sisprof-lista-faltosos" style="max-height:150px; overflow-y:auto; font-size:12px;">' +
                '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhum dado de faltas carregado.</div>' +
            '</div>' +
        '</div>' +
        
        '<button id="sisprof-btn-preencher" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;">1️⃣ Preencher Chamada Automático</button>' +
        '<button id="sisprof-btn-marcar-faltas" style="width:100%; background:#e53e3e; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">✅ Marcar Faltas na Chamada</button>' +
        '<button id="sisprof-btn-analisar" style="width:100%; background:#dd6b20; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">🔍 Analisar Faltosos da Turma</button>' +
        '<hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;">' +
        '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">📥 Extrair Alunos (Atual)</button>' +
        '<button id="sisprof-btn-extrair-multi" style="width:100%; background:#276749; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">📥 Extrair TODAS (Auto)</button>' +
        '<hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;">' +
        '<button id="sisprof-btn-logout" style="width:100%; background:#718096; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px;">🚪 Sair (Logout)</button>' +
        '</div>';
    
    document.body.appendChild(div);
    if (fbProfile && fbProfile.nome) { const n = document.getElementById('sisprof-user-name'); if (n) n.textContent = fbProfile.nome.split(' ')[0]; }
    document.getElementById('sisprof-fechar').onclick = function() { div.remove(); };
    document.getElementById('sisprof-minimizar').onclick = function() { const c = document.getElementById('sisprof-conteudo'); c.style.display = c.style.display === 'none' ? 'block' : 'none'; this.innerHTML = c.style.display === 'none' ? '◀' : '▶'; };
    document.getElementById('sisprof-btn-logout').onclick = function() { chrome.runtime.sendMessage({ action: 'FIREBASE_LOGOUT' }, () => { div.remove(); fbProfile = null; fbProfessorData = null; fbGestorData = null; extHistory = {}; mostrarTelaLogin(); }); };
    document.getElementById('sisprof-btn-hoje').onclick = function() { const h = new Date().toISOString().split('T')[0]; document.getElementById('sisprof-data-input').value = h; currentSelectedDate = h; atualizarInterfacePorData(); };
    document.getElementById('sisprof-data-input').addEventListener('change', function() { currentSelectedDate = this.value; atualizarInterfacePorData(); lerAulasDaTela(); });
    document.getElementById('sisprof-btn-atualizar-aulas').onclick = lerAulasDaTela;
    document.getElementById('sisprof-btn-preencher').onclick = function() {
        if (!currentSelectedDate) { alert('Selecione um dia primeiro.'); return; }
        const btn = this; const oldText = btn.textContent; btn.textContent = '⏳ Preenchendo...'; btn.disabled = true;
        selecionarDataSED(currentSelectedDate);
        setTimeout(() => { selecionarAulasSED(); setTimeout(() => {
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let btnBuscar = null;
            buttons.forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar') || t.includes('listar')) btnBuscar = b; });
            if (btnBuscar) btnBuscar.click();
            setTimeout(() => { const payload = extHistory[currentSelectedDate]; if (payload) executarPreenchimento(payload); else marcarFaltasNaChamada(); btn.textContent = oldText; btn.disabled = false; }, 2500);
        }, 1000); }, 800);
    };
    document.getElementById('sisprof-btn-marcar-faltas').onclick = marcarFaltasNaChamada;
    document.getElementById('sisprof-btn-analisar').onclick = analisarFaltososTurma;
    document.getElementById('sisprof-btn-extrair').onclick = iniciarExtrairAlunos;
    document.getElementById('sisprof-btn-extrair-multi').onclick = iniciarExtrairTodasTurmas;
    
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
}

function atualizarInterfacePorData() {
    const statusEl = document.getElementById('sisprof-status');
    if (!statusEl) return;
    if (!currentSelectedDate || !extHistory[currentSelectedDate]) {
        statusEl.innerHTML = '⏳ <strong>Sem dados para esta data.</strong><br>Verifique se há chamadas no ProfSis.';
        const lf = document.getElementById('sisprof-lista-faltosos'); const la = document.getElementById('sisprof-lista-aulas');
        if (lf) lf.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhum dado de faltas para esta data.</div>';
        if (la) la.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Sem dados de turmas para esta data.</div>';
        return;
    }
    const payload = extHistory[currentSelectedDate];
    const numFaltas = (payload.faltas && payload.faltas.length) ? payload.faltas.length : 0;
    const temRegistro = (payload.registros && payload.registros.length > 0 && payload.registros[0].conteudo) ? 'Sim' : 'Não';
    const numTurmas = (payload.turmas && payload.turmas.length) ? payload.turmas.length : 0;
    statusEl.innerHTML = '<strong>📅 ' + formatarDataBR(currentSelectedDate) + '</strong><br>🔴 Faltas: <strong>' + numFaltas + '</strong><br>📝 Registro: <strong>' + temRegistro + '</strong><br>📚 Turmas: <strong>' + numTurmas + '</strong>';
    renderizarListaFaltosos(payload);
    renderizarTurmasPayload(payload);
}

function renderizarListaFaltosos(payload) {
    const container = document.getElementById('sisprof-lista-faltosos');
    if (!container) return;
    let turmaSelecionadaTexto = "";
    document.querySelectorAll('.font-cabecalho-filtro').forEach(span => { if (span.textContent.includes('Turma:')) turmaSelecionadaTexto = span.textContent.replace('Turma:', '').trim(); });
    const turmasPayload = payload.turmas || [];
    let turmaFiltrarId = null;
    if (turmaSelecionadaTexto) {
        const normalize = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const sedNomeNorm = normalize(turmaSelecionadaTexto);
        const turmaMatch = turmasPayload.find(t => sedNomeNorm.includes(normalize(t.nome)));
        if (turmaMatch) turmaFiltrarId = turmaMatch.id;
    }
    let faltas = payload.faltas || [];
    if (turmaFiltrarId) faltas = faltas.filter(f => f.id_turma == turmaFiltrarId);
    if (faltas.length === 0) { container.innerHTML = '<div style="color:#38a169; text-align:center; padding:10px 0; font-weight:bold;">✅ Nenhum faltoso para esta turma/data.</div>'; return; }
    container.innerHTML = faltas.map((f, index) => {
        const markKey = currentSelectedDate + '_falta_' + index;
        const isDone = extDoneMarks[markKey] || false;
        return '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:4px 0;"><label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:12px;"><input type="checkbox" class="sisprof-falta-chk" data-index="' + index + '" data-nome="' + (f.nome || '').replace(/"/g, '"') + '"> ' + (f.nome || 'Desconhecido') + '</label><label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold; display:flex; align-items:center; gap:2px;"><input type="checkbox" class="sisprof-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '> Lançado</label></div>';
    }).join('');
    container.querySelectorAll('.sisprof-done-chk').forEach(chk => { chk.addEventListener('change', function() { const key = this.getAttribute('data-key'); extDoneMarks[key] = this.checked; chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks }); this.parentElement.style.color = this.checked ? '#38a169' : '#a0aec0'; }); });
}

function renderizarTurmasPayload(payload) {
    const container = document.getElementById('sisprof-lista-aulas');
    if (!container) return;
    const turmas = payload.turmas || [];
    if (turmas.length === 0) { lerAulasDaTela(); return; }
    aulasSelecionadasState = new Set(turmas.map(t => String(t.id)));
    container.innerHTML = '';
    turmas.forEach((turma) => {
        const markKey = currentSelectedDate + '_turma_' + turma.id;
        const isDone = extDoneMarks[markKey] || false;
        const label = turma.nome + (turma.disciplina ? ' - ' + turma.disciplina : '') + ' (' + turma.horario + ')';
        const isChecked = aulasSelecionadasState.has(String(turma.id));
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:3px 0;';
        div.innerHTML = '<label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:12px;"><input type="checkbox" class="sisprof-aula-chk" data-val="' + turma.id + '" ' + (isChecked ? 'checked' : '') + '> ' + label + '</label><label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold; display:flex; align-items:center; gap:2px;"><input type="checkbox" class="sisprof-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '> Lançado</label>';
        container.appendChild(div);
        div.querySelector('.sisprof-aula-chk').addEventListener('change', function() { const val = this.getAttribute('data-val'); if (this.checked) aulasSelecionadasState.add(val); else aulasSelecionadasState.delete(val); });
        div.querySelector('.sisprof-done-chk').addEventListener('change', function() { const key = this.getAttribute('data-key'); extDoneMarks[key] = this.checked; chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks }); this.parentElement.style.color = this.checked ? '#38a169' : '#a0aec0'; });
    });
}

function lerAulasDaTela() {
    const lista = document.getElementById('sisprof-lista-aulas');
    if (!lista) return;
    const checkboxes = document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]');
    if (checkboxes.length === 0) { lista.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhuma aula encontrada.<br>Abra a aba de Chamada e selecione a Turma.</div>'; return; }
    const novasAulas = [];
    checkboxes.forEach(chk => { novasAulas.push({ label: chk.parentElement.textContent.trim(), val: chk.value }); });
    if (aulasDisponiveis.length !== novasAulas.length || !aulasDisponiveis.every((v, i) => v.val === novasAulas[i].val)) { aulasSelecionadasState = new Set(novasAulas.map(a => a.val)); }
    aulasDisponiveis = novasAulas;
    lista.innerHTML = '';
    aulasDisponiveis.forEach((aula) => {
        const markKey = currentSelectedDate + '_aula_' + aula.val;
        const isDone = extDoneMarks[markKey] || false;
        const isChecked = aulasSelecionadasState.has(aula.val);
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:3px 0;';
        div.innerHTML = '<label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:12px;"><input type="checkbox" class="sisprof-aula-chk" data-val="' + aula.val + '" ' + (isChecked ? 'checked' : '') + '> ' + aula.label + '</label><label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold;"><input type="checkbox" class="sisprof-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '> Lançado</label>';
        lista.appendChild(div);
        div.querySelector('.sisprof-aula-chk').addEventListener('change', function() { if (this.checked) aulasSelecionadasState.add(this.getAttribute('data-val')); else aulasSelecionadasState.delete(this.getAttribute('data-val')); });
        div.querySelector('.sisprof-done-chk').addEventListener('change', function() { const key = this.getAttribute('data-key'); extDoneMarks[key] = this.checked; chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks }); this.parentElement.style.color = this.checked ? '#38a169' : '#a0aec0'; });
    });
}

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

function selecionarAulasSED() {
    const chks = document.querySelectorAll('.sisprof-aula-chk:checked');
    if (chks.length === 0) return;
    const selecionados = Array.from(chks).map(c => c.getAttribute('data-val'));
    const btnAbrir = document.querySelector('.multi-select-button');
    if (btnAbrir) btnAbrir.click();
    setTimeout(() => { document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]').forEach(chk => { const val = chk.value; if (selecionados.includes(val) && !chk.checked) chk.click(); else if (!selecionados.includes(val) && chk.checked) chk.click(); }); if (btnAbrir) btnAbrir.click(); }, 200);
}

function marcarFaltasNaChamada() {
    const payload = extHistory[currentSelectedDate];
    if (!payload || !payload.faltas || payload.faltas.length === 0) { alert('Nenhum faltoso para marcar nesta data.'); return; }
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
    let interagidos = 0;
    const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"], [class*="aluno"]');
    if (cardsAlunos.length > 0) {
        cardsAlunos.forEach(card => { const nomeElement = card.querySelector('.nome_aluno'); if (!nomeElement) return; let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, ''); const checkboxes = card.querySelectorAll('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]'); checkboxes.forEach(checkbox => { if (!checkbox) return; const levouFalta = alunosAlvo.includes(nomeAluno); const deveEstarPresente = !levouFalta; if (checkbox.checked !== deveEstarPresente) { checkbox.click(); interagidos++; } }); });
    } else {
        document.querySelectorAll('table tbody tr').forEach(linha => { const cells = linha.querySelectorAll('td'); if (cells.length < 2) return; let nomeAluno = normalize(cells[0].textContent.trim()).replace(/^\d+\s*[-.]?\s*/, ''); linha.querySelectorAll('input[type="checkbox"]').forEach(checkbox => { const levouFalta = alunosAlvo.includes(nomeAluno); const deveEstarPresente = !levouFalta; if (checkbox.checked !== deveEstarPresente) { checkbox.click(); interagidos++; } }); });
    }
    if (interagidos > 0) alert('✅ ' + interagidos + ' falta(s) marcada(s)!'); else alert('⚠️ Nenhum checkbox encontrado ou faltas já marcadas.');
}

function executarPreenchimento(payload) {
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    let interagidos = 0;
    if (payload.faltas && payload.faltas.length > 0) {
        const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
        document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]').forEach(card => { const nomeElement = card.querySelector('.nome_aluno'); if (!nomeElement) return; let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, ''); const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]'); if (!checkbox) return; const levouFalta = alunosAlvo.includes(nomeAluno); const deveEstarPresente = !levouFalta; if (checkbox.checked !== deveEstarPresente) { checkbox.click(); interagidos++; } });
    }
    if (payload.registros && payload.registros.length > 0) { const txt = document.querySelector('textarea[name="o.Descricao"], textarea#conteudoAula, textarea.form-control, textarea'); if (txt) { txt.value = payload.registros[0].conteudo; txt.dispatchEvent(new Event("input", { bubbles: true })); txt.dispatchEvent(new Event("change", { bubbles: true })); interagidos++; } }
    if (payload.fechamento && payload.fechamento.length > 0) {
        const isFechamentoScreen = document.querySelector('.boxAulasPlanejadasRealizadas');
        if (isFechamentoScreen) { const alunosFechamento = payload.fechamento; document.querySelectorAll('.card_aluno, .card_aluno1').forEach(card => { const nomeElement = card.querySelector('.nome_aluno'); if (!nomeElement) return; const nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, ''); const dadosAluno = alunosFechamento.find(a => normalize(a.nome) === nomeAluno); if (dadosAluno) { const inputs = card.querySelectorAll('input[type="number"]'); const txt = card.querySelector('textarea.form-control'); if (inputs.length >= 4) { if (dadosAluno.nota !== '') { inputs[1].value = dadosAluno.nota; inputs[1].dispatchEvent(new Event('input', {bubbles: true})); inputs[1].dispatchEvent(new Event('change', {bubbles: true})); } inputs[2].value = dadosAluno.faltas; inputs[2].dispatchEvent(new Event('input', {bubbles: true})); inputs[2].dispatchEvent(new Event('change', {bubbles: true})); inputs[3].value = dadosAluno.ausencias_compensadas; inputs[3].dispatchEvent(new Event('input', {bubbles: true})); inputs[3].dispatchEvent(new Event('change', {bubbles: true})); interagidos++; } if (txt && dadosAluno.nota !== '') { txt.value = dadosAluno.justificativa; txt.dispatchEvent(new Event('input', {bubbles: true})); txt.dispatchEvent(new Event('change', {bubbles: true})); } } }); }
    }
    if (interagidos > 0) { setTimeout(() => { const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => { const text = (b.innerText || b.value || b.textContent || '').toLowerCase(); return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar'); }); if (btnSalvar) { btnSalvar.click(); alert('✅ Concluído! Lançamentos preenchidos e salvos na SED.'); } else alert('✅ Concluído! ⚠️ Clique em "Salvar" manualmente.'); }, 500); } else alert('Nenhum dado pendente ou campos não encontrados na tela.');
}

function analisarFaltososTurma() {
    const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]');
    if (cardsAlunos.length === 0) { alert('Nenhum aluno encontrado. Abra a Chamada da turma primeiro.'); return; }
    const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    const alunosNaTela = [];
    cardsAlunos.forEach(card => { const nomeElement = card.querySelector('.nome_aluno'); if (!nomeElement) return; const nome = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, ''); const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]'); alunosNaTela.push({ nome, nomeOriginal: nomeElement.textContent.trim(), estaFaltando: checkbox ? !checkbox.checked : false }); });
    const payload = extHistory[currentSelectedDate];
    const faltososEsperados = payload ? (payload.faltas || []).map(a => normalize(a.nome)) : [];
    const faltandoAgora = alunosNaTela.filter(a => a.estaFaltando).map(a => a.nomeOriginal);
    const deveriamFaltar = alunosNaTela.filter(a => faltososEsperados.includes(a.nome)).map(a => a.nomeOriginal);
    const inconsistentes = alunosNaTela.filter(a => faltososEsperados.includes(a.nome) && !a.estaFaltando).map(a => a.nomeOriginal);
    let html = '<div style="margin-bottom:10px;"><h4 style="margin:0 0 10px 0; color:#2d3748;">🔍 Análise de Faltosos</h4><p style="font-size:12px; color:#4a5568; margin-bottom:10px;">Data: <strong>' + formatarDataBR(currentSelectedDate) + '</strong></p>';
    html += '<div style="margin-bottom:10px; padding:8px; background:#fff5f5; border-radius:4px; border-left:4px solid #e53e3e;"><strong style="color:#c53030; font-size:12px;">🔴 Faltando Agora (' + faltandoAgora.length + '):</strong>' + (faltandoAgora.length > 0 ? '<ul style="margin:5px 0 0 0; padding-left:20px; font-size:11px;">' + faltandoAgora.map(n => '<li>' + n + '</li>').join('') + '</ul>' : '<p style="font-size:11px; color:#718096; margin:5px 0 0 0;">Nenhum.</p>') + '</div>';
    html += '<div style="margin-bottom:10px; padding:8px; background:#f0fff4; border-radius:4px; border-left:4px solid #38a169;"><strong style="color:#276749; font-size:12px;">📋 Faltosos Esperados (' + deveriamFaltar.length + '):</strong>' + (deveriamFaltar.length > 0 ? '<ul style="margin:5px 0 0 0; padding-left:20px; font-size:11px;">' + deveriamFaltar.map(n => '<li>' + n + '</li>').join('') + '</ul>' : '<p style="font-size:11px; color:#718096; margin:5px 0 0 0;">Nenhum.</p>') + '</div>';
    if (inconsistentes.length > 0) { html += '<div style="margin-bottom:10px; padding:8px; background:#fffaf0; border-radius:4px; border-left:4px solid #dd6b20;"><strong style="color:#c05621; font-size:12px;">⚠️ Inconsistentes (' + inconsistentes.length + '):</strong><ul style="margin:5px 0 0 0; padding-left:20px; font-size:11px;">' + inconsistentes.map(n => '<li>' + n + '</li>').join('') + '</ul></div>'; }
    html += '</div>';
    const modalDiv = document.createElement('div');
    modalDiv.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:10px; z-index:1000000; box-shadow:0 10px 40px rgba(0,0,0,0.3); max-width:400px; width:90%; max-height:80vh; overflow-y:auto; border:2px solid #38a169;';
    modalDiv.innerHTML = html + '<button onclick="this.parentElement.remove()" style="width:100%; padding:8px; background:#e2e8f0; border:none; border-radius:4px; cursor:pointer; font-weight:bold; margin-top:10px;">Fechar</button>';
    document.body.appendChild(modalDiv);
}

function iniciarExtrairAlunos() {
    const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
    if (cardsAlunos.length === 0) return alert('Nenhum aluno encontrado na tela. Abra a tela de chamada da turma desejada primeiro!');
    const btn = document.getElementById('sisprof-btn-extrair');
    if (btn) btn.textContent = 'Extraindo...';
    const alunos = [];
    cardsAlunos.forEach(card => { const nomeElement = card.querySelector('.nome_aluno'); if (!nomeElement) return; let nomeCompleto = nomeElement.textContent.trim().replace(/^\d+\s*[-.]?\s*/, ''); alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' }); });
    let turmaSelecionada = "Desconhecida";
    const selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
    if (selectTurma && selectTurma.options[selectTurma.selectedIndex]) turmaSelecionada = selectTurma.options[selectTurma.selectedIndex].text.trim();
    else document.querySelectorAll('.font-cabecalho-filtro').forEach(span => { if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim(); });
    const payload = { type: 'SISPROF_IMPORT_ALUNOS', alunos: alunos, turmaSED: turmaSelecionada, timestamp: Date.now() };
    chrome.runtime.sendMessage({ action: 'SAVE_STUDENTS', payload: payload }, (response) => { if (response && response.success) alert('✅ ' + alunos.length + ' aluno(s) extraídos! Volte ao SisProf e clique em "Atualizar Turma".'); else alert('Erro ao salvar: ' + (response ? response.error : 'Sem resposta.')); });
    setTimeout(() => { if (btn) btn.textContent = '📥 Extrair Alunos (Atual)'; }, 2000);
}

async function iniciarExtrairTodasTurmas() {
    let selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
    let isCustomDropdown = false; let turmaWrapper = null;
    if (!selectTurma) { document.querySelectorAll('.form-label-dropdown').forEach(l => { if (l.textContent.trim() === 'Turma') turmaWrapper = l.parentElement; }); if (turmaWrapper) isCustomDropdown = true; }
    if (!selectTurma && !isCustomDropdown) return alert('Filtro de turma não encontrado.');
    const btn = document.getElementById('sisprof-btn-extrair-multi');
    const todasTurmas = [];
    if (!isCustomDropdown) {
        const options = Array.from(selectTurma.options).filter(o => o.value && o.text && !o.text.toLowerCase().includes('selecione') && !o.text.toLowerCase().includes('todos'));
        if (options.length === 0) return alert('Nenhuma turma encontrada no seletor.');
        if (!confirm('O robô vai processar ' + options.length + ' turmas automaticamente.\n\nNÃO CLIQUE em nada até ele terminar. Deseja continuar?')) return;
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            if (btn) btn.textContent = '⏳ Lendo ' + opt.text.trim().substring(0,10) + '... (' + (i+1) + '/' + options.length + ')';
            selectTurma.value = opt.value; selectTurma.dispatchEvent(new Event('change', { bubbles: true }));
            let btnBuscar = null;
            document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar')) btnBuscar = b; });
            if (btnBuscar) btnBuscar.click();
            await new Promise(r => setTimeout(r, 4000));
            const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
            const alunos = [];
            cardsAlunos.forEach(card => { const n = card.querySelector('.nome_aluno'); if (!n) return; alunos.push({ nome: n.textContent.trim().replace(/^\d+\s*[-.]?\s*/, '').toUpperCase(), status: 'Ativo' }); });
            if (alunos.length > 0) todasTurmas.push({ turmaSED: opt.text.trim(), alunos: alunos });
        }
    } else {
        if (!confirm('O robô tentará extrair as turmas automaticamente.\nNÃO CLIQUE EM NADA na tela.\nDeseja continuar?')) return;
        const input = turmaWrapper.querySelector('input');
        if (!input) return alert('Input do menu não encontrado.');
        input.click(); await new Promise(r => setTimeout(r, 1000));
        const listItems = document.querySelectorAll('.custom-dropdown li');
        if (listItems.length === 0) return alert('Nenhuma turma encontrada no menu.');
        const optionsTexts = Array.from(listItems).map(li => li.textContent.trim()).filter(t => !t.toLowerCase().includes('selecione') && !t.toLowerCase().includes('todos'));
        input.click(); await new Promise(r => setTimeout(r, 500));
        for (let i = 0; i < optionsTexts.length; i++) {
            const text = optionsTexts[i];
            if (btn) btn.textContent = '⏳ Lendo ' + text.substring(0,10) + '... (' + (i+1) + '/' + optionsTexts.length + ')';
            input.click(); await new Promise(r => setTimeout(r, 1000));
            const targetLi = Array.from(document.querySelectorAll('.custom-dropdown li')).find(li => li.textContent.trim() === text);
            if (targetLi) targetLi.click();
            await new Promise(r => setTimeout(r, 1000));
            let btnBuscar = null;
            document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar')) btnBuscar = b; });
            if (btnBuscar) btnBuscar.click();
            await new Promise(r => setTimeout(r, 4000));
            const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
            const alunos = [];
            cardsAlunos.forEach(card => { const n = card.querySelector('.nome_aluno'); if (!n) return; alunos.push({ nome: n.textContent.trim().replace(/^\d+\s*[-.]?\s*/, '').toUpperCase(), status: 'Ativo' }); });
            if (alunos.length > 0) todasTurmas.push({ turmaSED: text, alunos: alunos });
        }
    }
    if (todasTurmas.length === 0) { if (btn) btn.textContent = 'Nenhum aluno encontrado'; setTimeout(() => { if (btn) btn.textContent = '📥 Extrair TODAS (Auto)'; }, 3000); return; }
    const payload = { type: 'SISPROF_IMPORT_ALUNOS_MULTI', turmas: todasTurmas, timestamp: Date.now() };
    chrome.runtime.sendMessage({ action: 'SAVE_STUDENTS', payload: payload }, (response) => { if (response && response.success) alert('✅ ' + todasTurmas.length + ' turmas salvas na nuvem!'); else alert('Erro: ' + (response ? response.error : 'Sem resposta.')); });
    if (btn) btn.textContent = '✅ ' + todasTurmas.length + ' turmas copiadas!';
    setTimeout(() => { if (btn) btn.textContent = '📥 Extrair TODAS (Auto)'; }, 3000);
}

function formatarDataBR(dataStr) { if (!dataStr) return ''; const parts = dataStr.split('-'); return parts[2] + '/' + parts[1] + '/' + parts[0]; }

var tentativas = 0;
var intervalo = setInterval(function() {
    if (document.body && !document.getElementById('sisprof-menu-flutuante') && !document.getElementById('sisprof-login-box')) { try { iniciarFluxoCompleto(); } catch(e) { console.error("Erro:", e); } }
    if (document.getElementById('sisprof-menu-flutuante') || document.getElementById('sisprof-login-box') || tentativas > 20) { clearInterval(intervalo); }
    tentativas++;
}, 2000);

setTimeout(iniciarFluxoCompleto, 1000);
