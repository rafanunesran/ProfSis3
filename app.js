// --- LÓGICA PRINCIPAL (PROFESSOR/APP) ---

let currentViewMode = null; // Controle de estado: 'gestor' ou 'professor'

async function iniciarApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('adminContainer').style.display = 'none';
    
    // [CORREÇÃO] Sincroniza perfil do usuário ao iniciar
    // Isso garante que usuários antigos recebam o 'schoolId' assim que ele for corrigido no banco
    if (currentUser && currentUser.email) {
        try {
            const usersData = await getData('system', 'users_list');
            const users = (usersData && usersData.list) ? usersData.list : [];
            const freshUser = users.find(u => u.email === currentUser.email);
            if (freshUser) {
                // Mantém o ID da sessão (Auth), mas atualiza dados do perfil (Escola, Role)
                const currentId = currentUser.id;
                const currentUid = currentUser.uid;
                currentUser = { ...freshUser, id: currentId };
                if (currentUid) currentUser.uid = currentUid;
                localStorage.setItem('app_current_user', JSON.stringify(currentUser));
            }
        } catch (e) { console.warn('Erro ao sincronizar perfil:', e); }
    }

    // Define o modo inicial se ainda não estiver definido
    if (!currentViewMode && currentUser) currentViewMode = currentUser.role;

    // Configura flag para carregar dados pessoais se um Gestor estiver no modo Professor
    if (currentUser && currentUser.role === 'gestor') {
        currentUser.forceProfessorMode = (currentViewMode === 'professor');
    }

    // Carregar dados
    carregarDadosUsuario().then(async () => {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

        let roleLabel = 'Painel do Professor';
        if (currentViewMode === 'gestor') roleLabel = 'Painel do Gestor';

        document.getElementById('currentDate').textContent = 
            `${today.toLocaleDateString('pt-BR', options)} | Olá, ${currentUser.nome}`;
        
        const subTitle = document.getElementById('painelSubtitle');
        if (subTitle) subTitle.textContent = roleLabel;

        // Atualiza o título com o nome da escola
        let nomeEscola = 'Escola';
        if (currentUser && currentUser.schoolId) {
            const sData = await getData('system', 'schools_list');
            const schools = (sData && sData.list) ? sData.list : [];
            
            const escola = schools.find(s => s.id == currentUser.schoolId);
            if (escola) nomeEscola = escola.nome;
        }
        const headerTitle = document.querySelector('#appContainer h1');
        if (headerTitle) headerTitle.textContent = `SisProf - ${nomeEscola}`;

        // Injeta o botão de alternância se for Gestor
        if (currentUser.role === 'gestor') {
            injectGestorToggleButton();
        }

        // Injeta botão de Perfil e aplica tema
        injectProfileButton();
        aplicarTemaSalvo();

        // Renderiza conforme o modo de visualização atual
        if (currentViewMode === 'gestor') {
            renderGestorPanel();
        } else {
            renderProfessorPanel();
        }
    });
}

// Função para injetar o botão de alternância no header
function injectGestorToggleButton() {
    const container = document.getElementById('headerUserArea');
    if (!container || document.getElementById('btnAlternarModo')) return;

    const btn = document.createElement('button');
    btn.id = 'btnAlternarModo';
    btn.className = currentViewMode === 'gestor' ? 'btn btn-sm btn-info' : 'btn btn-sm btn-warning';
    btn.style.marginTop = '5px';
    btn.style.marginRight = '5px';
    btn.textContent = currentViewMode === 'gestor' ? '👁️ Ver como Professor' : '🛡️ Voltar para Gestão';
    btn.onclick = alternarModoGestor;

    // Insere antes do botão Sair
    const btnSair = container.querySelector('.btn-danger');
    container.insertBefore(btn, btnSair);
}

// Função para injetar o botão de Perfil
function injectProfileButton() {
    const container = document.getElementById('headerUserArea');
    if (!container || document.getElementById('btnPerfilUser')) return;

    const btn = document.createElement('button');
    btn.id = 'btnPerfilUser';
    btn.className = 'btn btn-sm btn-secondary';
    btn.style.marginTop = '5px';
    btn.style.marginRight = '5px';
    btn.innerHTML = '👤 Perfil';
    btn.onclick = abrirModalPerfil;

    // Insere antes do botão Sair (e depois do botão de Gestor se houver)
    const btnSair = container.querySelector('.btn-danger');
    container.insertBefore(btn, btnSair);
}

// --- SISTEMA DE TEMAS ---
const TEMAS_APP = {
    'padrao': { nome: 'Padrão (Azul)', cor: '#3182ce', bgHeader: 'linear-gradient(135deg, #3182ce, #2c5282)', bgBody: '#f7fafc' },
    'natureza': { nome: 'Natureza (Verde)', cor: '#38a169', bgHeader: 'linear-gradient(135deg, #38a169, #276749)', bgBody: '#f0fff4' },
    'sunset': { nome: 'Pôr do Sol (Laranja)', cor: '#dd6b20', bgHeader: 'linear-gradient(135deg, #dd6b20, #c05621)', bgBody: '#fffaf0' },
    'oceano': { nome: 'Oceano (Ciano)', cor: '#0bc5ea', bgHeader: 'linear-gradient(135deg, #0bc5ea, #0987a0)', bgBody: '#ebf8ff' },
    'roxo': { nome: 'Cyber (Roxo)', cor: '#805ad5', bgHeader: 'linear-gradient(135deg, #805ad5, #553c9a)', bgBody: '#faf5ff' },
    'dark': { nome: 'Modo Escuro', cor: '#63b3ed', bgHeader: 'linear-gradient(135deg, #2d3748, #1a202c)', bgBody: '#1a202c', isDark: true }
};

function abrirModalPerfil() {
    if (!currentUser) return;

    document.getElementById('perfilNome').textContent = currentUser.nome;
    document.getElementById('perfilEmail').textContent = currentUser.email;
    document.getElementById('perfilRole').textContent = (currentUser.role || 'Professor').toUpperCase();
    
    const containerTemas = document.getElementById('listaTemas');
    const temaAtual = (currentUser && currentUser.theme) ? currentUser.theme : (localStorage.getItem('app_theme') || 'padrao');

    containerTemas.innerHTML = Object.entries(TEMAS_APP).map(([key, tema]) => `
        <button onclick="mudarTema('${key}')" style="
            background: ${tema.bgHeader}; 
            color: white; 
            border: ${temaAtual === key ? '3px solid #000' : '1px solid #ddd'}; 
            padding: 10px; 
            border-radius: 8px; 
            cursor: pointer; 
            font-weight: bold;
            opacity: ${temaAtual === key ? '1' : '0.8'};
        ">
            ${temaAtual === key ? '✅ ' : ''}${tema.nome}
        </button>
    `).join('');

    showModal('modalPerfilUsuario');
}

async function mudarTema(temaKey) {
    // 1. Atualiza Localmente
    localStorage.setItem('app_theme', temaKey);
    
    if (currentUser) {
        currentUser.theme = temaKey;
        localStorage.setItem('app_current_user', JSON.stringify(currentUser));
    }

    aplicarTemaSalvo();
    abrirModalPerfil(); // Re-renderiza para atualizar a seleção visual

    // 2. Salva Online (Persistência)
    if (currentUser && currentUser.email) {
        try {
            const usersData = await getData('system', 'users_list');
            const users = (usersData && usersData.list) ? usersData.list : [];
            const idx = users.findIndex(u => u.email === currentUser.email);
            
            if (idx !== -1) {
                users[idx].theme = temaKey;
                await saveData('system', 'users_list', { list: users });
            }
        } catch (e) { console.error("Erro ao salvar tema online:", e); }
    }
}

function salvarBackgroundPersonalizado(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                // Salva a imagem em Base64 no LocalStorage
                localStorage.setItem('app_custom_bg', e.target.result);
                aplicarTemaSalvo();
                alert('Fundo atualizado com sucesso!');
            } catch (err) {
                alert('A imagem é muito grande para ser salva no navegador. Tente uma imagem menor (abaixo de 3MB).');
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function removerBackgroundPersonalizado() {
    localStorage.removeItem('app_custom_bg');
    aplicarTemaSalvo();
}

function aplicarTemaSalvo() {
    let temaKey = (currentUser && currentUser.theme) ? currentUser.theme : (localStorage.getItem('app_theme') || 'padrao');
    const tema = TEMAS_APP[temaKey];
    if (!tema) return;

    // Remove estilo anterior se houver
    const oldStyle = document.getElementById('theme-style-override');
    if (oldStyle) oldStyle.remove();

    // Verifica se tem background personalizado salvo
    const customBg = localStorage.getItem('app_custom_bg');

    if (temaKey === 'padrao' && !customBg) return; // Se for padrão e sem imagem, não faz nada

    // Cria CSS dinâmico para sobrescrever cores principais
    const style = document.createElement('style');
    style.id = 'theme-style-override';
    
    let css = `
        /* Header e Botões Principais */
        header { background: ${tema.bgHeader} !important; }
        .btn-primary { background-color: ${tema.cor} !important; border-color: ${tema.cor} !important; }
        .btn-primary:hover { opacity: 0.9; }
        
        /* Menu Principal (Nav) */
        nav button.active { background-color: ${tema.cor} !important; border-color: ${tema.cor} !important; color: #fff !important; }
        nav button.active .icon { color: #fff !important; }
        
        /* Títulos e Textos Coloridos */
        h2, h3, h4 { color: ${tema.cor} !important; }
        .turma-nav-btn.active { color: ${tema.cor} !important; border-bottom-color: ${tema.cor} !important; }
        
        /* Cards e Bordas */
        .card { border-left-color: ${tema.cor} !important; }
        
        /* Ícones e Badges */
        .icon { color: ${tema.cor} !important; }
        
        /* Ajustes específicos para manter consistência */
        a { color: ${tema.cor} !important; }
        
        /* Sobrescreve cores inline comuns usadas no app.js */
        [style*="color: #2c5282"], [style*="color:#2c5282"],
        [style*="color: #3182ce"], [style*="color:#3182ce"],
        [style*="color: #2b6cb0"], [style*="color:#2b6cb0"] {
            color: ${tema.cor} !important;
        }
        [style*="border-left: 4px solid #3182ce"] {
            border-left-color: ${tema.cor} !important;
        }
    `;

    // --- LÓGICA DE BACKGROUND PERSONALIZADO ---
    if (customBg) {
        css += `
            body { 
                background-image: url('${customBg}') !important; 
                background-size: cover !important; 
                background-attachment: fixed !important; 
                background-position: center !important;
                background-repeat: no-repeat !important;
            }
            /* Efeito Fumé (Transparência) nos Containers para ler o texto */
            .card, .modal-content, .auth-box, .turma-tab {
                background-color: ${tema.isDark ? 'rgba(45, 55, 72, 0.85)' : 'rgba(255, 255, 255, 0.85)'} !important;
                backdrop-filter: blur(3px); /* Efeito de vidro fosco */
            }
        `;
    } else {
        css += `body { background-color: ${tema.bgBody} !important; }`;
    }

    // --- REGRAS ESPECÍFICAS PARA MODO ESCURO ---
    if (tema.isDark) {
        // Se tiver imagem, usa fundo escuro transparente, senão usa sólido
        const bgCard = customBg ? 'rgba(45, 55, 72, 0.85)' : '#2d3748';
        css += `
            body, .container { color: #e2e8f0 !important; }
            .card, .modal-content, .auth-box { background-color: ${bgCard} !important; color: #e2e8f0 !important; border-color: #4a5568 !important; }
            input, select, textarea { background-color: #4a5568 !important; color: #fff !important; border-color: #718096 !important; }
            table th { background-color: #4a5568 !important; color: #fff !important; }
            table td { border-bottom-color: #4a5568 !important; color: #e2e8f0 !important; }
            .btn-secondary { background-color: #4a5568 !important; border-color: #718096 !important; color: #e2e8f0 !important; }
            
            /* Força elementos com fundo claro a ficarem escuros */
            [style*="background: #f7fafc"], [style*="background:#f7fafc"],
            [style*="background: white"], [style*="background:white"],
            [style*="background: #fff"], [style*="background:#fff"],
            [style*="background: #fffaf0"], [style*="background:#fffaf0"],
            [style*="background: #ebf8ff"], [style*="background:#ebf8ff"] {
                background-color: ${bgCard} !important;
                color: #e2e8f0 !important;
                border-color: #4a5568 !important;
            }
            
            /* Ajusta textos que eram escuros para ficarem claros */
            [style*="color: #4a5568"], [style*="color:#4a5568"],
            [style*="color: #2d3748"], [style*="color:#2d3748"],
            [style*="color: #718096"], [style*="color:#718096"] {
                color: #cbd5e0 !important;
            }
            
            /* Ajuste específico para Mural de Avisos (Vermelho escuro -> Rosa claro) */
            [style*="color: #7b341e"], [style*="color:#7b341e"] {
                color: #ffe4e6 !important;
            }
        `;
    }

    style.innerHTML = css;
    document.head.appendChild(style);
}

// Função que realiza a troca de contexto
function alternarModoGestor() {
    currentViewMode = (currentViewMode === 'gestor') ? 'professor' : 'gestor';
    
    // Atualiza o botão
    const btn = document.getElementById('btnAlternarModo');
    if (btn) btn.remove(); // Remove para recriar com o estado novo ou apenas atualiza a UI recarregando o app
    iniciarApp(); // Recarrega a interface com o novo modo
}

function renderProfessorPanel() {
    const nav = document.querySelector('nav');
    nav.innerHTML = `
        <button class="active" onclick="showScreen('dashboard', event)"><span class="icon">📊</span><span class="label">Dashboard</span></button>
        <button onclick="showScreen('turmas', event)"><span class="icon">👥</span><span class="label">Turmas</span></button>
        <button onclick="showScreen('tutoria', event)"><span class="icon">🎓</span><span class="label">Tutoria</span></button>
        <button onclick="showScreen('agenda', event)"><span class="icon">📅</span><span class="label">Agenda</span></button>
        <button onclick="showScreen('registrosProfessor', event)"><span class="icon">📂</span><span class="label">Registros</span></button>
    `;
    renderDashboard();
    showScreen('dashboard');
}

function showScreen(screenId, evt) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        screen.style.display = ''; // Remove display:none inline se existir
    }
    
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }

    if (screenId === 'dashboard') renderDashboard();
    if (screenId === 'turmas') renderTurmas();
    if (screenId === 'tutoria') renderTutoria();
    if (screenId === 'agenda') renderAgenda();
    if (screenId === 'registrosProfessor') renderRegistrosProfessor();
    if (screenId === 'registrosGestor') renderRegistrosGestor();
    if (screenId === 'ocorrenciasGestor') renderOcorrenciasGestor();
    if (screenId === 'tutoriasGestor') renderTutoriasGestor();
    if (screenId === 'horariosGestor') renderHorariosGestor();
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    if (modalId === 'modalNovoEncontro') {
        const select = document.getElementById('encontroTutorado');
        select.innerHTML = (data.tutorados || []).map(t => 
            `<option value="${t.id}">${t.nome_estudante}</option>`
        ).join('');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Helper para buscar grade da escola
async function getGradeEscola() {
    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        return (gestorData && gestorData.gradeHoraria) ? gestorData.gradeHoraria : [];
    }
    return [];
}

// --- DASHBOARD ---
async function renderDashboard() {
    const today = getTodayString();
    const dashboardContainer = document.getElementById('dashboard');
    
    // Limpa o conteúdo atual para evitar sobreposição ou duplicidade
    dashboardContainer.innerHTML = '';
    
    // 1. VISÃO DO GESTOR
    if (currentViewMode === 'gestor') {
        // Filtra ocorrências pendentes que NÃO sejam do tipo 'rapida'
        const ocorrencias = (data.ocorrencias || []).filter(o => (o.status || 'pendente') === 'pendente' && o.tipo !== 'rapida');
        const registros = (data.registrosAdministrativos || []);
        const avisosRaw = (data.avisosMural || []);
        const avisos = Array.from(new Map(avisosRaw.map(item => [item.id, item])).values());

        dashboardContainer.innerHTML = `
            <div class="grid">
                <div class="card">
                    <h2>⚠️ Ocorrências</h2>
                    <div style="font-size: 24px; font-weight: bold; color: #e53e3e;">
                        ${ocorrencias.length} <span style="font-size:14px; color:#718096; font-weight:normal;">pendentes</span>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="showScreen('ocorrenciasGestor')" style="margin-top:10px;">Ver Todas</button>
                </div>
                <div class="card">
                    <h2>📂 Administrativo</h2>
                    <div style="font-size: 24px; font-weight: bold; color: #3182ce;">
                        ${registros.length} <span style="font-size:14px; color:#718096; font-weight:normal;">registros</span>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="showScreen('registrosGestor')" style="margin-top:10px;">Gerenciar</button>
                </div>
            </div>

            <div class="card" style="margin-top: 20px;">
                <h2>📢 Avisos (Mural)</h2>
                <div id="listaAvisosDashboard" style="max-height: 100px; overflow-y: auto; margin-bottom: 10px;">
                    ${avisos.length > 0 ? avisos.map(a => `
                        <div style="font-size:12px; border-bottom:1px solid #eee; padding:5px 0; display:flex; justify-content:space-between;">
                            <span>${a.texto.substring(0, 30)}...</span>
                            <button class="btn btn-xs btn-danger" style="padding:0 5px;" onclick="excluirAviso(${a.id})">×</button>
                        </div>
                    `).join('') : '<p class="empty-state">Nenhum aviso ativo.</p>'}
                </div>
                <button class="btn btn-primary btn-sm" onclick="abrirModalNovoAviso()">+ Novo Aviso</button>
            </div>
            <div class="card" style="margin-top: 20px;">
                <h2>📊 Resumo da Escola</h2>
                <p>Total de Turmas: ${(data.turmas || []).length}</p>
                <p>Total de Estudantes: ${(data.estudantes || []).length}</p>
            </div>
        `;
        
        return; // IMPORTANTE: Encerra aqui para não carregar a visão do professor abaixo
    }

    // 2. VISÃO DO PROFESSOR (Padrão)
    // Reconstrói a estrutura HTML padrão caso tenha sido alterada
    dashboardContainer.innerHTML = `
        <div class="grid">
            <div class="card">
                <h2>📅 Agenda do Dia</h2>
                <div id="agendaHoje"><p>Carregando...</p></div>
            </div>
            <div class="card">
                <h2>👥 Tutorias/Ações</h2>
                <div id="tutoriasHoje"></div>
            </div>
        </div>
        <div class="card" style="margin-top: 20px;">
            <h2>📢 Quadro de Avisos</h2>
            <div id="avisosGerais"></div>
        </div>
    `;

    // Agenda do Dia (Baseada na Grade)
    let gradeEscola = [];
    let excecoesGrade = [];
    
    // Busca dados da Escola (Gestor) para sincronizar Avisos e Grade
    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        if (gestorData) {
            gradeEscola = gestorData.gradeHoraria || [];
            excecoesGrade = gestorData.gradeHorariaExcecoes || [];
            if (gestorData.avisosMural) data.avisosMural = gestorData.avisosMural;
            if (gestorData.registrosAdministrativos) data.registrosAdministrativos = gestorData.registrosAdministrativos;
        }
    } else { gradeEscola = await getGradeEscola(); }

    const diaSemanaHoje = new Date().getDay(); // 0=Dom, 1=Seg...
    
    // LÓGICA DE EXCEÇÃO (DIA ATÍPICO)
    // Verifica se há uma grade específica para a data de hoje
    const excecaoHoje = excecoesGrade.find(e => e.data === today);
    
    let blocosHoje = [];
    if (excecaoHoje) {
        blocosHoje = excecaoHoje.blocos; // Usa a grade específica
    } else {
        blocosHoje = gradeEscola.filter(g => g.diaSemana == diaSemanaHoje).sort((a,b) => a.inicio.localeCompare(b.inicio));
    }

    const minhasAulas = data.horariosAulas || [];

    let agendaHtml = '';
    if (blocosHoje.length === 0) {
        agendaHtml = '<p class="empty-state">Sem grade configurada para hoje.</p>';
    } else {
        if (excecaoHoje) {
            agendaHtml += `<div class="alert alert-warning" style="margin-bottom:10px; font-size:12px;">⚠️ Horário Especial Definido pela Gestão</div>`;
        }

        agendaHtml = blocosHoje.map(bloco => {
            const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
            
            if (!aula) {
                return `<div class="alert alert-secondary" style="opacity:0.6;">${bloco.inicio} - Livre</div>`;
            }
            
            if (aula.tipo === 'aula' && aula.id_turma) {
                const turma = (data.turmas || []).find(t => t.id == aula.id_turma);
                return `<button class="btn btn-primary" style="width:100%; margin-bottom:5px; text-align:left; display:flex; justify-content:space-between;" onclick="abrirTurma(${aula.id_turma})">
                    <span><strong>${bloco.inicio}</strong> - ${turma ? turma.nome : 'Turma Removida'}</span>
                    <span>Ir para Turma →</span>
                </button>`;
            } else if (aula.tipo === 'tutoria') {
                return `<button class="btn btn-info" style="width:100%; margin-bottom:5px; text-align:left; display:flex; justify-content:space-between;" onclick="showScreen('tutoria')">
                    <span><strong>${bloco.inicio}</strong> - Tutoria</span>
                    <span>Registrar →</span>
                </button>`;
            } else if (bloco.tipo === 'evento') {
                return `<div class="alert alert-warning" style="margin-bottom:5px;">
                    <strong>${bloco.inicio}</strong> - EVENTO / ATIVIDADE ESPECIAL
                </div>`;
            } else {
                // Estudo, Reunião, APCG, etc.
                return `<div class="alert alert-info" style="margin-bottom:5px;">
                    <strong>${bloco.inicio}</strong> - ${aula.tipo.toUpperCase()} ${aula.tema ? '('+aula.tema+')' : ''}
                </div>`;
            }
        }).join('');
    }
    document.getElementById('agendaHoje').innerHTML = agendaHtml;

    // Tutorias Hoje
    const agendamentosHoje = (data.agendamentos || []).filter(a => a.data === today && a.tutoradoId);
    agendamentosHoje.sort((a,b) => a.inicio.localeCompare(b.inicio));

    const htmlTutorias = agendamentosHoje.length > 0 ? agendamentosHoje.map(a => {
        const tutorado = (data.tutorados || []).find(t => t.id == a.tutoradoId);
        const nome = tutorado ? tutorado.nome_estudante : 'Desconhecido';
        return `
            <button class="btn btn-success" style="width:100%; margin-bottom:5px; text-align:left; display:flex; justify-content:space-between; align-items:center;" onclick="registrarEncontroAtalho(${a.tutoradoId})">
                <span><strong>${a.inicio}</strong> - ${nome}</span>
                <span>📝 Registrar</span>
            </button>
        `;
    }).join('') : '<p class="empty-state">Nenhum agendamento de tutoria para hoje.</p>';

    document.getElementById('tutoriasHoje').innerHTML = htmlTutorias;

    // --- AVISOS E ALERTAS POR TURMA ---
    const turmas = data.turmas || [];
    // Deduplica avisos por ID para evitar repetição visual
    const avisosRaw = data.avisosMural || [];
    const avisosMural = Array.from(new Map(avisosRaw.map(item => [item.id, item])).values());
    const registros = data.registrosAdministrativos || [];
    const todayDate = new Date();
    todayDate.setHours(0,0,0,0);

    let htmlAvisos = '';

    // 1. Mural de Avisos (Consolidado: Gerais + Específicos do Professor)
    const meusIds = new Set(turmas.map(t => String(t.id)));
    turmas.forEach(t => { if(t.masterId) meusIds.add(String(t.masterId)); });

    // [CORREÇÃO] Verificação segura para evitar erro em dados antigos
    const avisosExibir = avisosMural.filter(a => {
        const alvos = Array.isArray(a.turmasAlvo) ? a.turmasAlvo : [];
        return alvos.includes('todas') || alvos.some(id => meusIds.has(id));
    });

    if (avisosExibir.length > 0) {
        htmlAvisos += `
            <div style="margin-bottom: 20px; background: #fffaf0; padding: 15px; border-radius: 8px; border-left: 4px solid #ed8936;">
                <h3 style="margin-top:0; color: #c05621; font-size: 16px;">📢 Mural de Avisos</h3>
                <ul style="margin: 0; padding-left: 20px; color: #7b341e;">
                    ${avisosExibir.map(a => `<li style="margin-bottom: 5px;">${a.texto}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // 2. Agrupamento por Turma
    let htmlTurmas = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">';
    let temAvisosTurma = false;

    // Agrupa turmas que compartilham o mesmo masterId (mesma turma física)
    const gruposTurmas = {};
    turmas.forEach(t => {
        const key = t.masterId || t.id;
        if (!gruposTurmas[key]) {
            gruposTurmas[key] = {
                nomeBase: t.nome,
                disciplinas: [],
                ids: [],
                masterId: t.masterId
            };
        }
        if (t.disciplina) gruposTurmas[key].disciplinas.push(t.disciplina);
        gruposTurmas[key].ids.push(t.id);
    });

    Object.values(gruposTurmas).forEach(grupo => {
        const registrosTurma = registros.filter(r => 
            (grupo.masterId && r.turmaId == grupo.masterId) || 
            grupo.ids.includes(r.turmaId)
        );
        
        const ativos = registrosTurma.filter(r => {
            if (r.tipo === 'Atestado') {
                const parts = r.data.split('-');
                const fim = new Date(parts[0], parts[1]-1, parts[2]);
                fim.setDate(fim.getDate() + (parseInt(r.dias) || 1) - 1);
                return todayDate <= fim;
            }
            return true; 
        });

        if (ativos.length > 0) {
            temAvisosTurma = true;
            const disciplinasStr = grupo.disciplinas.length > 0 ? ` <span style="font-size:0.8em; font-weight:normal; color:#718096;">(${grupo.disciplinas.join(', ')})</span>` : '';
            
            htmlTurmas += `
                <div class="card" style="border: 1px solid #e2e8f0; background: #fff; padding: 15px;">
                    <h4 style="margin-top:0; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #2c5282; margin-bottom: 10px;">${grupo.nomeBase}${disciplinasStr}</h4>
                    <div><strong style="font-size:12px; color:#3182ce;">📂 Administrativo:</strong><ul style="margin:0; padding-left:15px; font-size:13px; color: #4a5568;">${ativos.map(r => {
                        const est = (data.estudantes || []).find(e => e.id == r.estudanteId);
                        const nomeEst = est ? est.nome_completo : 'Estudante';
                        let icon = r.tipo === 'Atestado' ? '🔵' : (r.tipo === 'Faltoso' ? '🔴' : '📝');
                        return `<li>${icon} <strong>${nomeEst}</strong>: ${r.tipo}</li>`;
                    }).join('')}</ul></div>
                </div>
            `;
        }
    });
    htmlTurmas += '</div>';

    if (temAvisosTurma) htmlAvisos += htmlTurmas;
    if (htmlAvisos === '') htmlAvisos = '<p class="empty-state">Nenhum aviso ou alerta para suas turmas.</p>';
    
    document.getElementById('avisosGerais').innerHTML = htmlAvisos;
}

// --- TURMAS ---
function renderTurmas() {
    const html = (data.turmas || []).map(t => `
        <div class="card" style="margin-bottom:10px; border-left: 4px solid #3182ce;">
            <div style="display:flex; justify-content:space-between;">
                <h3 onclick="abrirTurma(${t.id})" style="cursor:pointer; color:#2c5282;">${t.nome} - ${t.disciplina}</h3>
                <div>
                    <button class="btn btn-sm btn-secondary" onclick="editarTurma(${t.id})">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="removerTurma(${t.id})">🗑️</button>
                </div>
            </div>
            <div style="font-size:12px; color:#718096;">${t.turno}</div>
        </div>
    `).join('');
    
    const btnMassa = (currentViewMode === 'gestor') 
        ? `<div style="margin-bottom: 15px; padding: 10px; background: #ebf8ff; border: 1px solid #bee3f8; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
             <span>📂 Atualização de Estudantes em Massa (Vários CSVs)</span>
             <button class="btn btn-primary" onclick="abrirModalImportacaoMassa()">Importar Arquivos</button>
           </div>` 
        : '';

    document.getElementById('listaTurmas').innerHTML = btnMassa + (html || '<p class="empty-state">Nenhuma turma.</p>');
}

async function abrirModalNovaTurma() {
    document.getElementById('turmaId').value = '';
    document.getElementById('turmaAno').value = '';
    document.getElementById('turmaDisciplina').value = '';
    document.getElementById('tituloModalTurma').textContent = 'Nova Turma';
    
    // Gestor define apenas Ano/Série; Professor define Disciplina
    if (currentViewMode === 'gestor') {
        document.getElementById('divTurmaDisciplina').style.display = 'none';
        document.getElementById('containerTurmaAnoInput').style.display = 'block';
        document.getElementById('containerTurmaAnoSelect').style.display = 'none';
    } else {
        document.getElementById('divTurmaDisciplina').style.display = 'block';
        document.getElementById('containerTurmaAnoInput').style.display = 'none';
        document.getElementById('containerTurmaAnoSelect').style.display = 'block';

        // Carregar turmas do Gestor (Escola)
        const select = document.getElementById('turmaAnoSelect');
        select.innerHTML = '<option>Carregando...</option>';

        let turmasEscola = [];
        if (currentUser && currentUser.schoolId) {
            const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
            const gestorData = await getData('app_data', key);
            if (gestorData && gestorData.turmas) turmasEscola = gestorData.turmas;
        }

        select.innerHTML = turmasEscola.length > 0 
            ? turmasEscola.map(t => `<option value="${t.id}" data-nome="${t.nome}">${t.nome} (${t.turno})</option>`).join('')
            : '<option value="">Nenhuma turma cadastrada pela gestão</option>';
    }
    showModal('modalNovaTurma');
}

function editarTurma(id) {
    const turma = data.turmas.find(t => t.id == id);
    if (turma) {
        document.getElementById('turmaId').value = turma.id;
        document.getElementById('turmaAno').value = turma.ano_serie || turma.nome;
        document.getElementById('turmaDisciplina').value = turma.disciplina;
        document.getElementById('turmaTurno').value = turma.turno;
        document.getElementById('tituloModalTurma').textContent = 'Editar Turma';
        
        if (currentViewMode === 'gestor') {
            document.getElementById('divTurmaDisciplina').style.display = 'none';
            document.getElementById('containerTurmaAnoInput').style.display = 'block';
            document.getElementById('containerTurmaAnoSelect').style.display = 'none';
        } else {
            document.getElementById('divTurmaDisciplina').style.display = 'block';
            document.getElementById('containerTurmaAnoInput').style.display = 'none';
            document.getElementById('containerTurmaAnoSelect').style.display = 'block';
        }
        showModal('modalNovaTurma');
    }
}

function salvarTurma(e) {
    e.preventDefault();
    const id = document.getElementById('turmaId').value;
    const disciplina = document.getElementById('turmaDisciplina').value;
    const turno = document.getElementById('turmaTurno').value;
    
    let nome = '';
    let masterId = null;

    if (currentViewMode === 'gestor') {
        nome = document.getElementById('turmaAno').value;
    } else {
        // Professor pega do Select
        const select = document.getElementById('turmaAnoSelect');
        masterId = select.value; // ID da turma do Gestor
        nome = select.options[select.selectedIndex].text;
        // Remove o turno do texto se estiver no formato "Nome (Turno)"
        nome = nome.split(' (')[0];
    }

    if (id) {
        const t = data.turmas.find(x => x.id == id);
        if (t) { t.nome = nome; t.ano_serie = nome; t.disciplina = disciplina; t.turno = turno; if(masterId) t.masterId = masterId; }
    } else {
        if (!data.turmas) data.turmas = [];
        // masterId serve para vincular a turma do professor à turma original da escola
        data.turmas.push({ id: Date.now(), nome, ano_serie: nome, disciplina, turno, masterId: masterId });
    }
    persistirDados();
    closeModal('modalNovaTurma');
    renderTurmas();
}

function removerTurma(id) {
    if (confirm('Excluir turma?')) {
        data.turmas = data.turmas.filter(t => t.id != id);
        persistirDados();
        renderTurmas();
    }
}

let turmaAtual = null;
async function abrirTurma(id) {
    turmaAtual = id;
    const turma = data.turmas.find(t => t.id == id);
    document.getElementById('turmaDetalheTitulo').textContent = turma.nome;

    // --- SINCRONIZAÇÃO DE ALUNOS (PROFESSOR) ---
    // Se for professor e a turma tiver um vínculo (masterId), atualiza a lista de alunos
    if (currentViewMode !== 'gestor' && turma.masterId && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);

        if (gestorData && gestorData.estudantes) {
            // 1. Pega os alunos da turma original do gestor
            const alunosGestor = gestorData.estudantes.filter(e => e.id_turma == turma.masterId);
            
            // 2. Remove os alunos antigos dessa turma na base local do professor
            if (!data.estudantes) data.estudantes = [];
            data.estudantes = data.estudantes.filter(e => e.id_turma != turmaAtual);

            // 3. Adiciona os alunos atualizados (mantendo o ID original do aluno para preservar notas/presença)
            alunosGestor.forEach(alunoMaster => {
                // Clona o aluno e ajusta o id_turma para o ID da turma do professor
                const alunoLocal = { ...alunoMaster, id_turma: turmaAtual };
                data.estudantes.push(alunoLocal);
            });

            // Sincroniza Registros Administrativos (Atestados/Faltosos) para o Dashboard
            if (gestorData.registrosAdministrativos) {
                data.registrosAdministrativos = gestorData.registrosAdministrativos;
            }
            if (gestorData.avisosMural) {
                data.avisosMural = gestorData.avisosMural;
            }
            
            persistirDados(); // Salva a atualização localmente
        }
    }
    
    // Setup Tabs
    const nav = document.querySelector('#turmaDetalhe nav');
    // Estilos inline para o comportamento de expandir/contrair
    nav.innerHTML = `
        <style>
            .turma-nav-btn {
                display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px;
                background: transparent; border: none; cursor: pointer;
                color: #718096; border-bottom: 3px solid transparent;
                transition: all 0.2s; font-size: 16px;
            }
            .turma-nav-btn.active { color: #3182ce; border-bottom: 3px solid #3182ce; background: #ebf8ff; border-radius: 4px 4px 0 0; }
            .turma-nav-btn .label { display: none; font-size: 14px; font-weight: bold; }
            .turma-nav-btn.active .label { display: inline; }
            .turma-nav-btn:hover { background: #f7fafc; }
        </style>
        <button class="turma-nav-btn active" onclick="showTurmaTab('estudantes', event)"><span class="icon">👥</span><span class="label">Estudantes</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('chamada', event)"><span class="icon">✅</span><span class="label">Chamada</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('registros', event)"><span class="icon">📂</span><span class="label">Registros</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('atrasos', event)"><span class="icon">⏰</span><span class="label">Atrasos</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('trabalhos', event)"><span class="icon">📝</span><span class="label">Trabalhos</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('compensacoes', event)"><span class="icon">⚖️</span><span class="label">Compensações</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('ocorrencias', event)"><span class="icon">⚠️</span><span class="label">Ocorrências</span></button>
        <button class="turma-nav-btn" onclick="showTurmaTab('mapeamento', event)"><span class="icon">🗺️</span><span class="label">Mapeamento</span></button>
    `;
    
    showScreen('turmaDetalhe');
    showTurmaTab('estudantes');
}

function showTurmaTab(tab, evt) {
    document.querySelectorAll('.turma-tab').forEach(t => t.style.display = 'none');
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).style.display = 'block';
    
    if (evt) {
        document.querySelectorAll('#turmaDetalhe nav .turma-nav-btn').forEach(b => b.classList.remove('active'));
        evt.currentTarget.classList.add('active');
    }

    if (tab === 'estudantes') renderEstudantes();
    if (tab === 'chamada') renderChamada();
    if (tab === 'registros') renderTurmaRegistros();
    if (tab === 'ocorrencias') {
        tempOcorrenciaIds = []; // Reseta seleção ao entrar na aba
        renderOcorrencias();
    }
    if (tab === 'atrasos') renderAtrasos();
    if (tab === 'trabalhos') renderTrabalhos();
    if (tab === 'compensacoes') renderCompensacoes();
    if (tab === 'mapeamento') renderMapeamento();
}

function renderEstudantes() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    const isGestor = currentViewMode === 'gestor';

    // --- MURAL DE AVISOS (Registros Administrativos) ---
    const registros = data.registrosAdministrativos || [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Busca Avisos Gerais para esta turma
    const turmaObj = (data.turmas || []).find(t => t.id == turmaAtual);
    const masterId = turmaObj ? turmaObj.masterId : null;

    const avisosRaw = data.avisosMural || [];
    const avisosUnique = Array.from(new Map(avisosRaw.map(item => [item.id, item])).values());
    const avisosMural = avisosUnique.filter(a => 
        a.turmasAlvo.includes('todas') || 
        a.turmasAlvo.includes(turmaAtual.toString()) ||
        (masterId && a.turmasAlvo.includes(masterId.toString()))
    );

    // Filtra registros relevantes para esta turma
    const avisosTurma = registros.filter(r => {
        // Verifica se o aluno pertence a esta turma (pelo ID do aluno na lista filtrada acima)
        const alunoNaTurma = estudantes.find(e => e.id == r.estudanteId);
        if (!alunoNaTurma) return false;

        // Lógica de validade (Atestados vencidos não aparecem, Faltosos e Observações aparecem sempre ou por um tempo)
        if (r.tipo === 'Atestado') {
            const parts = r.data.split('-');
            const dataInicio = new Date(parts[0], parts[1]-1, parts[2]);
            const dataFim = new Date(dataInicio);
            dataFim.setDate(dataFim.getDate() + (parseInt(r.dias) || 1) - 1);
            return today <= dataFim;
        }
        return true; // Faltoso e Observação mostramos sempre (ou poderia filtrar por data recente)
    });

    let muralHtml = '';
    if (avisosTurma.length > 0 || avisosMural.length > 0) {
        const atestados = avisosTurma.filter(r => r.tipo === 'Atestado');
        const faltosos = avisosTurma.filter(r => r.tipo === 'Faltoso');
        const observacoes = avisosTurma.filter(r => r.tipo === 'Observacao');

        muralHtml = `
            <div class="card" style="background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                <h3 style="margin-top:0; color: #2d3748; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">📌 Dashboard da Turma</h3>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    ${avisosMural.length > 0 ? `
                        <div style="flex: 1; min-width: 200px; background: #fffaf0; padding: 15px; border-radius: 8px; border-left: 4px solid #ed8936;">
                            <div style="font-weight: bold; color: #c05621; margin-bottom: 5px;">📢 Avisos da Gestão</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #7b341e;">
                                ${avisosMural.map(a => `<li style="margin-bottom: 3px;">${a.texto}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${atestados.length > 0 ? `
                        <div style="flex: 1; min-width: 200px; background: #ebf8ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3182ce;">
                            <div style="font-weight: bold; color: #2c5282; margin-bottom: 5px;">🔵 Atestados (${atestados.length})</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #2a4365;">
                                ${atestados.map(r => {
                                    const est = estudantes.find(e => e.id == r.estudanteId);
                                    return `<li style="margin-bottom: 3px;"><strong>${est ? est.nome_completo : 'Desconhecido'}</strong>: ${r.dias} dias</li>`;
                                }).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${faltosos.length > 0 ? `
                        <div style="flex: 1; min-width: 200px; background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #e53e3e;">
                            <div style="font-weight: bold; color: #c53030; margin-bottom: 5px;">🔴 Faltosos (${faltosos.length})</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #742a2a;">
                                ${faltosos.map(r => {
                                    const est = estudantes.find(e => e.id == r.estudanteId);
                                    return `<li style="margin-bottom: 3px;"><strong>${est ? est.nome_completo : 'Desconhecido'}</strong></li>`;
                                }).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${observacoes.length > 0 ? `
                        <div style="flex: 1; min-width: 200px; background: #fffff0; padding: 15px; border-radius: 8px; border-left: 4px solid #d69e2e;">
                            <div style="font-weight: bold; color: #744210; margin-bottom: 5px;">🟡 Observações (${observacoes.length})</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #744210;">
                                ${observacoes.map(r => {
                                    const est = estudantes.find(e => e.id == r.estudanteId);
                                    return `<li style="margin-bottom: 3px;"><strong>${est ? est.nome_completo : 'Desconhecido'}</strong>: ${r.descricao}</li>`;
                                }).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    const html = `
        ${muralHtml}
        ${isGestor ? `
            <div style="display:flex; gap: 10px; margin-bottom: 10px;">
                <button class="btn btn-primary btn-sm" onclick="abrirModalNovoEstudante()">+ Novo Estudante</button>
                <button class="btn btn-secondary btn-sm" onclick="showModal('modalImportarEstudantes')">📂 Importar CSV</button>
            </div>
        ` : ''}
        <table style="margin-top:10px;">
            <thead><tr><th>Nome</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
                ${estudantes.map(e => `
                    <tr>
                        <td><a href="#" onclick="abrirEstudanteDetalhe(${e.id})" style="font-weight:bold; text-decoration:none; color:#2b6cb0;">${e.nome_completo}</a></td>
                        <td><span style="font-size:12px; padding:2px 6px; border-radius:4px; background:#edf2f7;">${e.status || 'Ativo'}</span></td>
                        <td>${isGestor ? `<button class="btn btn-danger btn-sm" onclick="removerEstudante(${e.id})">🗑️</button>` : '<span style="color:#ccc;">-</span>'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    document.getElementById('tabEstudantes').innerHTML = html;
}

function abrirModalNovoEstudante() {
    document.getElementById('estudanteNome').value = '';
    const statusSelect = document.getElementById('estudanteStatus');
    statusSelect.value = 'Ativo';
    
    // Apenas gestor pode editar o status; Professor vê travado em 'Ativo'
    statusSelect.disabled = (currentViewMode !== 'gestor');
    
    showModal('modalNovoEstudante');
}

function salvarEstudante(e) {
    e.preventDefault();
    const nome = document.getElementById('estudanteNome').value;
    // Garante que se não for gestor, o status seja semstor') ? document.getElementById('estudanteStatus').value : 'Ativo';
    
    if (!data.estudantes) data.estudantes = [];
    data.estudantes.push({
        id: Date.now(),
        id_turma: turmaAtual,
        nome_completo: nome,
        status: status
    });
    persistirDados();
    closeModal('modalNovoEstudante');
    renderEstudantes();
    e.target.reset();
}

function removerEstudante(id) {
    if (confirm('Remover estudante?')) {
        data.estudantes = data.estudantes.filter(e => e.id != id);
        persistirDados();
        renderEstudantes();
    }
}

// --- CHAMADA ---
async function renderChamada() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual && (!e.status || e.status === 'Ativo'));
    
    // Preserva a data selecionada se já estiver na tela, senão usa hoje
    const dataSelecionada = document.getElementById('chamadaData') ? document.getElementById('chamadaData').value : getTodayString();
    
    // Validação de Dia de Aula
    const gradeEscola = await getGradeEscola();
    const minhasAulas = (data.horariosAulas || []).filter(a => a.id_turma == turmaAtual);
    const blocosTurma = gradeEscola.filter(g => minhasAulas.some(a => a.id_bloco == g.id));
    const diasPermitidos = [...new Set(blocosTurma.map(g => g.diaSemana))]; // Ex: [1, 3, 5]

    const isGestor = currentViewMode === 'gestor';

    // Verifica status da chamada (baseado se há faltas registradas para esta turma nesta data)
    const faltasRegistradas = (data.presencas || []).filter(p => p.data == dataSelecionada && estudantes.some(e => e.id == p.id_estudante));
    const statusTexto = faltasRegistradas.length > 0 ? 'Registrada (Faltas)' : 'Pendente / Todos Presentes';
    const statusCor = faltasRegistradas.length > 0 ? '#2f855a' : '#d69e2e'; // Verde escuro vs Laranja escuro
    const statusBg = faltasRegistradas.length > 0 ? '#f0fff4' : '#fffaf0';

    const html = `
        <div style="margin-bottom:15px;"><button class="btn btn-info" onclick="renderRelatorioMensalFaltas()">📅 Relatório Mensal de Faltas</button></div>
        <div class="form-row" style="display:flex; justify-content:space-between; align-items:center;">
            <label>Data: <input type="date" id="chamadaData" value="${dataSelecionada}" onchange="renderChamada()"></label>
            <div style="padding: 5px 10px; border-radius: 6px; background: ${statusBg}; color: ${statusCor}; border: 1px solid ${statusCor}; font-weight: bold; font-size: 13px;">
                Status: ${statusTexto}
            </div>
        </div>
        <div id="avisoChamada" style="color:#e53e3e; display:none; margin-bottom:10px; font-weight:bold;">⚠️ Esta turma não tem aula agendada para este dia da semana.</div>
        <table>
            <thead><tr><th>Estudante</th><th>Presença</th></tr></thead>
            <tbody>
                ${estudantes.map(e => {
                    // Verifica registros administrativos vigentes para a data selecionada
                    let badges = '';
                    const registros = data.registrosAdministrativos || [];
                    
                    // Filtra registros deste aluno
                    const regsAluno = registros.filter(r => r.estudanteId == e.id);
                    
                    regsAluno.forEach(r => {
                        if (r.tipo === 'Faltoso') {
                            badges += `<span style="background:#fed7d7; color:#c53030; font-size:11px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:bold;">Faltoso</span>`;
                        } else if (r.tipo === 'Atestado') {
                            // Verifica se a data da chamada cai dentro do período do atestado
                            const parts = r.data.split('-');
                            const inicio = new Date(parts[0], parts[1]-1, parts[2]);
                            const fim = new Date(inicio);
                            fim.setDate(fim.getDate() + (parseInt(r.dias) || 1) - 1);
                            
                            const dataChamadaParts = dataSelecionada.split('-');
                            const dataChamadaObj = new Date(dataChamadaParts[0], dataChamadaParts[1]-1, dataChamadaParts[2]);
                            
                            if (dataChamadaObj >= inicio && dataChamadaObj <= fim) {
                                badges += `<span style="background:#bee3f8; color:#2c5282; font-size:11px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:bold;">Atestado (${r.dias}d)</span>`;
                            }
                        }
                    });

                    return `
                    <tr>
                        <td>
                            ${e.nome_completo}
                            ${badges}
                        </td>
                        <td><input type="checkbox" class="presenca-check" data-id="${e.id}" ${badges.includes('Atestado') ? '' : 'checked'}></td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        <button class="btn btn-success" id="btnSalvarChamada" onclick="salvarChamadaManual()" style="width:100%; margin-top:15px; padding: 12px; font-size: 16px;">💾 Salvar Chamada</button>
    `;
    document.getElementById('tabChamada').innerHTML = html;
    
    // Valida data inicial
    setTimeout(() => validarDataChamada(diasPermitidos), 100);
}

function validarDataChamada(diasPermitidos) {
    const input = document.getElementById('chamadaData');
    if(!input) return;
    
    const diaSemana = new Date(input.value + 'T12:00:00').getDay(); // 0=Dom, 1=Seg...
    const btn = document.getElementById('btnSalvarChamada');
    const aviso = document.getElementById('avisoChamada');
    
    // Se diasPermitidos estiver vazio, assume que não foi configurado e libera. Se tiver, valida.
    const bloqueado = diasPermitidos.length > 0 && !diasPermitidos.includes(diaSemana);
    
    btn.disabled = bloqueado;
    aviso.style.display = bloqueado ? 'block' : 'none';
}

function salvarChamadaManual() {
    const dataChamada = document.getElementById('chamadaData').value;
    const checks = document.querySelectorAll('.presenca-check');
    
    if (!data.presencas) data.presencas = [];
    
    checks.forEach(chk => {
        const estId = parseInt(chk.getAttribute('data-id'));
        const presente = chk.checked;
        
        // Remove anterior se houver
        data.presencas = data.presencas.filter(p => !(p.id_estudante == estId && p.data == dataChamada));
        
        if (!presente) { // Salva apenas faltas para economizar espaço ou conforme lógica
            data.presencas.push({
                id: Date.now() + Math.random(),
                id_estudante: estId,
                data: dataChamada,
                status: 'falta'
            });
        }
    });
    
    persistirDados();
    alert('Chamada salva!');
}

function renderRelatorioMensalFaltas() {
    const today = new Date();
    const mesInput = document.getElementById('relFaltaMes');
    const anoInput = document.getElementById('relFaltaAno');
    
    const mesAtual = mesInput ? parseInt(mesInput.value) : today.getMonth();
    const anoAtual = anoInput ? parseInt(anoInput.value) : today.getFullYear();

    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual && (!e.status || e.status === 'Ativo'));
    const presencas = data.presencas || [];

    const daysInMonth = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const diasUteis = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(anoAtual, mesAtual, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) diasUteis.push(d); // Apenas dias úteis (Seg-Sex)
    }

    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const html = `
        <button class="btn btn-secondary" style="margin-bottom:15px;" onclick="renderChamada()">← Voltar para Chamada Diária</button>
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3>Relatório Mensal de Faltas</h3>
                <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Imprimir</button>
            </div>
            <div class="form-row" style="background:#f7fafc; padding:10px; border-radius:8px; margin-bottom:15px;">
                <label>Mês: <select id="relFaltaMes" onchange="renderRelatorioMensalFaltas()">${meses.map((m, i) => `<option value="${i}" ${i === mesAtual ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
                <label>Ano: <input type="number" id="relFaltaAno" value="${anoAtual}" onchange="renderRelatorioMensalFaltas()" style="width:80px;"></label>
            </div>
            <div style="overflow-x:auto;">
                <table style="font-size: 12px; border-collapse: collapse; width: 100%; min-width: 800px;">
                    <thead>
                        <tr>
                            <th style="text-align:left; min-width: 200px; position:sticky; left:0; background:#fff; z-index:10; border-bottom:2px solid #cbd5e0;">Estudante</th>
                            ${diasUteis.map(d => `<th style="text-align:center; width: 25px; padding: 2px; border-bottom:2px solid #cbd5e0;"><button class="btn btn-sm btn-outline-secondary" onclick="verFaltasDoDia(${d}, ${mesAtual}, ${anoAtual})" style="padding:2px 5px; font-size:10px; min-width:25px; cursor:pointer;" title="Ver lista de faltas">${d}</button></th>`).join('')}
                            <th style="text-align:center; border-bottom:2px solid #cbd5e0;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${estudantes.map(e => {
                            let totalFaltas = 0;
                            const cols = diasUteis.map(d => {
                                const dataStr = `${anoAtual}-${String(mesAtual+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                const falta = presencas.find(p => p.id_estudante == e.id && p.data == dataStr && p.status == 'falta');
                                if (falta) totalFaltas++;
                                return `<td style="text-align:center; background: ${falta ? '#fed7d7' : ''}; color: ${falta ? '#c53030' : '#e2e8f0'}; border: 1px solid #e2e8f0; padding: 4px;">${falta ? 'F' : '•'}</td>`;
                            }).join('');
                            return `<tr><td style="position:sticky; left:0; background:#fff; border-bottom: 1px solid #e2e8f0; font-weight:bold; padding: 8px;">${e.nome_completo}</td>${cols}<td style="text-align:center; font-weight:bold; color: ${totalFaltas > 0 ? '#e53e3e' : '#2d3748'}; border-bottom: 1px solid #e2e8f0;">${totalFaltas}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    document.getElementById('tabChamada').innerHTML = html;
}

function verFaltasDoDia(dia, mes, ano) {
    const dataStr = `${ano}-${String(mes+1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const dataFormatada = `${String(dia).padStart(2, '0')}/${String(mes+1).padStart(2, '0')}/${ano}`;
    
    // Filtra estudantes da turma atual
    const estudantesTurma = (data.estudantes || []).filter(e => e.id_turma == turmaAtual && (!e.status || e.status === 'Ativo'));
    
    // Busca quem faltou neste dia
    const faltosos = estudantesTurma.filter(e => {
        return (data.presencas || []).some(p => p.id_estudante == e.id && p.data == dataStr && p.status == 'falta');
    });

    const listaNomes = faltosos.map(e => e.nome_completo).sort();
    const textoCopia = `Faltas dia ${dataFormatada}:\n${listaNomes.join('\n')}`;

    const html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
            <h3 style="margin:0;">Faltas em ${dataFormatada}</h3>
            <div>
                <button class="btn btn-secondary" onclick="copiarTextoFaltas('${encodeURIComponent(textoCopia)}')" title="Copiar Lista">📋</button>
                <button class="btn btn-secondary" onclick="closeModal('modalDetalheFaltasDia')" title="Fechar" style="margin-left:5px;">✖</button>
            </div>
        </div>
        <div style="max-height:300px; overflow-y:auto;">
            ${listaNomes.length > 0 
                ? `<ul style="padding-left:20px;">${listaNomes.map(nome => `<li>${nome}</li>`).join('')}</ul>` 
                : '<p class="empty-state">Nenhuma falta registrada neste dia.</p>'}
        </div>
        <div style="margin-top:10px; font-size:12px; color:#666; text-align:right;">Total: ${listaNomes.length}</div>
    `;

    document.getElementById('conteudoDetalheFaltasDia').innerHTML = html;
    showModal('modalDetalheFaltasDia');
}

function copiarTextoFaltas(textoEncoded) {
    const texto = decodeURIComponent(textoEncoded);
    navigator.clipboard.writeText(texto).then(() => alert('Lista copiada para a área de transferência!'));
}

// --- OCORRÊNCIAS ---
let tempOcorrenciaIds = []; // Variável temporária para armazenar seleção

async function renderOcorrencias() {
    const ocorrencias = (data.ocorrencias || []).filter(o => o.id_turma == turmaAtual).sort((a, b) => new Date(b.data) - new Date(a.data));
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    
    // Buscar opções de ocorrência rápida
    let opcoesRapidas = [];
    if (currentViewMode === 'gestor') {
        opcoesRapidas = data.opcoesOcorrenciaRapida || [];
    } else if (currentUser.schoolId) {
        // Professor busca da escola
        try {
            const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
            const gestorData = await getData('app_data', key);
            if (gestorData && gestorData.opcoesOcorrenciaRapida) {
                opcoesRapidas = gestorData.opcoesOcorrenciaRapida;
            }
        } catch(e) { console.log('Erro ao buscar opções rápidas'); }
    }

    // Filtra estudantes disponíveis e selecionados
    const disponiveis = estudantes.filter(e => !tempOcorrenciaIds.includes(e.id));
    const selecionados = estudantes.filter(e => tempOcorrenciaIds.includes(e.id));

    // Preserva o texto digitado caso haja re-renderização
    const textoAtual = document.getElementById('novaOcorrenciaTexto') ? document.getElementById('novaOcorrenciaTexto').value : '';

    const html = `
        <!-- OCORRÊNCIA RÁPIDA -->
        ${opcoesRapidas.length > 0 ? `
        <div class="card" style="margin-bottom: 20px; border: 1px solid #bee3f8; background: #ebf8ff;">
            <h3 style="color: #2c5282; margin-top:0;">⚡ Registro Rápido</h3>
            <div class="form-row" style="align-items: flex-end;">
                <label style="flex-grow:1;">Estudante:
                    <select id="selEstudanteRapido">
                        <option value="">Selecione...</option>
                        ${estudantes.map(e => `<option value="${e.id}">${e.nome_completo}</option>`).join('')}
                    </select>
                </label>
                <label style="flex-grow:1;">Ocorrência:
                    <select id="selOpcaoRapida">
                        <option value="">Selecione...</option>
                        ${opcoesRapidas.map(op => `<option value="${op}">${op}</option>`).join('')}
                    </select>
                </label>
                <button class="btn btn-info" onclick="salvarOcorrenciaRapida()">Registrar</button>
            </div>
        </div>
        ` : ''}

        <div class="card" style="margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <h3>Nova Ocorrência</h3>
            
            <div style="margin-bottom: 10px;">
                <label style="font-weight:bold; display:block; margin-bottom:5px;">Adicionar Estudante:</label>
                <div style="display:flex; gap:5px;">
                    <select id="selEstudanteOcorrencia" style="flex-grow:1;">
                        <option value="">Selecione...</option>
                        ${disponiveis.map(e => `<option value="${e.id}">${e.nome_completo}</option>`).join('')}
                    </select>
                    <button class="btn btn-secondary" onclick="adicionarEstudanteOcorrencia()">Adicionar</button>
                </div>
            </div>

            <div style="margin-bottom: 10px;">
                <label style="font-weight:bold; display:block; margin-bottom:5px;">Estudantes Envolvidos:</label>
                <div style="background: #f7fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; min-height: 40px;">
                    ${selecionados.length > 0 ? selecionados.map(e => `
                        <div style="display:inline-block; background:white; padding:2px 8px; border-radius:12px; border:1px solid #cbd5e0; margin-right:5px; margin-bottom:5px; font-size:12px;">
                            ${e.nome_completo} <span style="cursor:pointer; color:red; font-weight:bold; margin-left:5px;" onclick="removerEstudanteOcorrencia(${e.id})">×</span>
                        </div>
                    `).join('') : '<span style="color:#a0aec0; font-size:12px;">Nenhum estudante selecionado.</span>'}
                </div>
            </div>

            <textarea id="novaOcorrenciaTexto" placeholder="Descreva a ocorrência..." rows="3" style="width:100%; margin-bottom:10px;">${textoAtual}</textarea>
            <button class="btn btn-primary" onclick="salvarOcorrencia()">Registrar Ocorrência</button>
        </div>

        <h3>Histórico</h3>
        ${ocorrencias.map(o => {
            const nomes = (o.ids_estudantes || []).map(id => {
                const est = estudantes.find(e => e.id == id);
                return est ? est.nome_completo : 'Excluído';
            }).join(', ');
            
            const isRapida = o.tipo === 'rapida';
            const cardStyle = isRapida ? 'background:#ebf8ff; border-left:4px solid #3182ce;' : 'background:#fff5f5; border-left:4px solid #e53e3e;';

            return `
            <div class="card" style="${cardStyle} margin-bottom:5px; padding:10px;">
                <div style="display:flex; justify-content:space-between;">
                    <small style="font-weight:bold;">${formatDate(o.data)} ${isRapida ? '⚡' : ''}</small>
                    <div>
                        <button class="btn btn-sm btn-secondary" onclick="imprimirOcorrencia(${o.id})">🖨️ Imprimir</button>
                        <button class="btn btn-sm btn-danger" onclick="removerOcorrencia(${o.id})">🗑️</button>
                    </div>
                </div>
                <p style="margin: 5px 0; font-size: 13px; color: ${isRapida ? '#2c5282' : '#c53030'};"><strong>Envolvidos:</strong> ${nomes || 'Nenhum selecionado'}</p>
                <p>${o.relato}</p>
            </div>
        `}).join('')}
    `;
    document.getElementById('tabOcorrencias').innerHTML = html;

    // Restaura foco se havia texto
    if(textoAtual) {
        const txt = document.getElementById('novaOcorrenciaTexto');
        if(txt) {
            txt.focus();
            txt.setSelectionRange(txt.value.length, txt.value.length);
        }
    }
}

function adicionarEstudanteOcorrencia() {
    const sel = document.getElementById('selEstudanteOcorrencia');
    const id = parseInt(sel.value);
    if (id) {
        tempOcorrenciaIds.push(id);
        renderOcorrencias();
    }
}

function removerEstudanteOcorrencia(id) {
    tempOcorrenciaIds = tempOcorrenciaIds.filter(x => x !== id);
    renderOcorrencias();
}

async function salvarOcorrenciaRapida() {
    const idEstudante = document.getElementById('selEstudanteRapido').value;
    const opcao = document.getElementById('selOpcaoRapida').value;

    if (!idEstudante || !opcao) return alert('Selecione o estudante e a ocorrência.');

    // Reutiliza a lógica de salvamento, mas com tipo 'rapida'
    // Passamos o ID do estudante como array para manter compatibilidade
    await registrarOcorrenciaNoBanco({
        ids: [parseInt(idEstudante)],
        texto: opcao,
        tipo: 'rapida'
    });
    
    alert('Registro rápido salvo!');
    renderOcorrencias();
}

async function salvarOcorrencia() {
    const texto = document.getElementById('novaOcorrenciaTexto').value;
    const ids = tempOcorrenciaIds;

    if (!texto) return alert('Descreva a ocorrência.');
    
    await registrarOcorrenciaNoBanco({
        ids: ids,
        texto: texto,
        tipo: 'disciplinar'
    });
    
    // Limpa estado
    tempOcorrenciaIds = [];
    document.getElementById('novaOcorrenciaTexto').value = '';
    renderOcorrencias();
}

// Função auxiliar para centralizar o salvamento
async function registrarOcorrenciaNoBanco({ ids, texto, tipo }) {
    // Identifica a turma correta para o contexto (Local vs Gestão)
    const turmaObj = (data.turmas || []).find(t => t.id == turmaAtual);
    const idTurmaGestao = (turmaObj && turmaObj.masterId) ? turmaObj.masterId : turmaAtual;
    const nomeTurmaCompleto = turmaObj ? `${turmaObj.nome} - ${turmaObj.disciplina || ''}` : 'Turma Desconhecida';
    const disciplina = turmaObj ? turmaObj.disciplina : '';

    const novaOcorrencia = {
        id: Date.now(),
        id_turma: turmaAtual,
        data: getTodayString(),
        relato: texto,
        ids_estudantes: ids,
        autor: currentUser.nome,
        status: tipo === 'rapida' ? 'registrada' : 'pendente', // Rápidas não ficam pendentes
        tipo: tipo, // 'rapida' ou 'disciplinar'
        turma_snapshot: nomeTurmaCompleto, // Salva o nome como está agora
        disciplina: disciplina
    };

    if (!data.ocorrencias) data.ocorrencias = [];
    data.ocorrencias.push(novaOcorrencia);
    await persistirDados();
    
    // Sincroniza com a Gestão (se for professor vinculado)
    if (currentViewMode !== 'gestor' && currentUser.schoolId) {
        try {
            const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
            const gestorData = await getData('app_data', key);
            
            if (gestorData) {
                if (!gestorData.ocorrencias) gestorData.ocorrencias = [];
                // Salva com o ID da turma da gestão para que o gestor saiba de qual turma é
                gestorData.ocorrencias.push({ ...novaOcorrencia, id_turma: idTurmaGestao });
                await saveData('app_data', key, gestorData);
            }
        } catch (e) {
            console.error('Erro ao sincronizar ocorrência:', e);
        }
    }
}

function removerOcorrencia(id) {
    if (confirm('Apagar?')) {
        data.ocorrencias = data.ocorrencias.filter(o => o.id != id);
        persistirDados();
        renderOcorrencias();
    }
}

function imprimirOcorrencia(id) {
    const o = data.ocorrencias.find(x => x.id == id);
    if (!o) return;

    const turma = data.turmas.find(t => t.id == o.id_turma);
    const estudantes = (data.estudantes || []).filter(e => (o.ids_estudantes || []).includes(e.id));
    const nomes = estudantes.map(e => e.nome_completo).join(', ');

    const conteudo = `
        <div style="font-family: Arial, sans-serif; padding: 40px;">
            <h1 style="text-align: center;">Registro de Ocorrência</h1>
            <hr>
            <p><strong>Data:</strong> ${formatDate(o.data)}</p>
            <p><strong>Professor:</strong> ${currentUser.nome}</p>
            <p><strong>Turma:</strong> ${turma ? turma.nome : '?'}</p>
            <p><strong>Estudantes Envolvidos:</strong> ${nomes}</p>
            <hr>
            <h3>Relato:</h3>
            <p style="white-space: pre-wrap;">${o.relato}</p>
            <br><br><br>
            <div style="display: flex; justify-content: space-between; margin-top: 50px;">
                <div style="border-top: 1px solid #000; width: 40%; text-align: center; padding-top: 5px;">Assinatura do Professor</div>
                <div style="border-top: 1px solid #000; width: 40%; text-align: center; padding-top: 5px;">Assinatura da Coordenação</div>
            </div>
        </div>
    `;

    const janela = window.open('', '', 'width=800,height=600');
    janela.document.write('<html><head><title>Imprimir Ocorrência</title></head><body>');
    janela.document.write(conteudo);
    janela.document.write('<script>window.print();</script>');
    janela.document.write('</body></html>');
    janela.document.close();
}

// --- ATRASOS ---
function renderAtrasos() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    
    // Filtro de Meses
    const currentYear = new Date().getFullYear();
    const mesInicio = document.getElementById('filtroAtrasoMesInicio') ? parseInt(document.getElementById('filtroAtrasoMesInicio').value) : 0; // Jan
    const mesFim = document.getElementById('filtroAtrasoMesFim') ? parseInt(document.getElementById('filtroAtrasoMesFim').value) : 11; // Dez

    let atrasos = (data.atrasos || []).filter(a => a.id_turma == turmaAtual);
    atrasos = atrasos.filter(a => {
        const d = new Date(a.data);
        return d.getMonth() >= mesInicio && d.getMonth() <= mesFim && d.getFullYear() === currentYear;
    });

    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const html = `
        <div class="card" style="background: #fffaf0; margin-bottom: 20px;">
            <h3>Registrar Atraso</h3>
            <div class="form-row" style="align-items: flex-end;">
                <label style="flex-grow:1;">Estudante:
                    <select id="atrasoEstudante">
                        <option value="">Selecione...</option>
                        ${estudantes.map(e => `<option value="${e.id}">${e.nome_completo}</option>`).join('')}
                    </select>
                </label>
                <button class="btn btn-warning" onclick="salvarAtraso()">Registrar</button>
            </div>
        </div>

        <h3>Histórico de Atrasos</h3>
        <div style="margin-bottom: 10px; display: flex; gap: 10px; align-items: center;">
            <label>De: <select id="filtroAtrasoMesInicio" onchange="renderAtrasos()">${meses.map((m, i) => `<option value="${i}" ${i === mesInicio ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
            <label>Até: <select id="filtroAtrasoMesFim" onchange="renderAtrasos()">${meses.map((m, i) => `<option value="${i}" ${i === mesFim ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        </div>

        <table>
            <thead><tr><th>Data</th><th>Estudante</th><th>Ações</th></tr></thead>
            <tbody>
                ${atrasos.length > 0 ? atrasos.map(a => {
                    const est = estudantes.find(e => e.id == a.id_estudante);
                    return `
                        <tr>
                            <td>${formatDate(a.data)}</td>
                            <td>${est ? est.nome_completo : 'Excluído'}</td>
                            <td><button class="btn btn-danger btn-sm" onclick="removerAtraso(${a.id})">🗑️</button></td>
                        </tr>
                    `;
                }).join('') : '<tr><td colspan="3" style="text-align:center; color:#999;">Nenhum atraso registrado neste período.</td></tr>'}
            </tbody>
        </table>
    `;
    document.getElementById('tabAtrasos').innerHTML = html;
}

function salvarAtraso() {
    const estudanteId = document.getElementById('atrasoEstudante').value;
    
    if (!estudanteId) return alert('Selecione um estudante.');
    
    if (!data.atrasos) data.atrasos = [];
    data.atrasos.push({
        id: Date.now(),
        id_turma: turmaAtual,
        id_estudante: parseInt(estudanteId),
        data: getTodayString()
    });
    persistirDados();
    renderAtrasos();
}

function removerAtraso(id) {
    if (confirm('Remover este registro de atraso?')) {
        data.atrasos = data.atrasos.filter(a => a.id != id);
        persistirDados();
        renderAtrasos();
    }
}

// --- REGISTROS DE AULA (DIÁRIO DE CLASSE) ---
function renderTurmaRegistros() {
    // Busca registros específicos de aula (não administrativos)
    const registros = (data.registrosAula || []).filter(r => r.id_turma == turmaAtual);
    
    // Ordena por data (mais recente primeiro)
    registros.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    const html = `
        <div style="margin-bottom: 20px;">
            <button class="btn btn-primary" onclick="abrirModalNovoRegistroAula()">+ Novo Registro de Aula</button>
        </div>

        <h3>Histórico de Aulas</h3>
        <div class="grid" style="grid-template-columns: 1fr;">
            ${registros.length > 0 ? registros.map(r => `
                <div class="card" style="border-left: 4px solid #3182ce; margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h4 style="margin:0 0 10px 0; color:#2c5282;">📅 ${formatDate(r.data)}</h4>
                        <button class="btn btn-sm btn-danger" onclick="removerRegistroAula(${r.id})">🗑️</button>
                    </div>
                    <p style="white-space: pre-wrap; margin:0; color:#4a5568;">${r.conteudo}</p>
                </div>
            `).join('') : '<p class="empty-state">Nenhum registro de aula encontrado.</p>'}
        </div>
    `;
    document.getElementById('tabRegistros').innerHTML = html;
}

function abrirModalNovoRegistroAula() {
    document.getElementById('regAulaData').value = getTodayString();
    document.getElementById('regAulaConteudo').value = '';
    showModal('modalNovoRegistroAula');
}

function salvarRegistroAula(e) {
    e.preventDefault();
    const dataReg = document.getElementById('regAulaData').value;
    const conteudo = document.getElementById('regAulaConteudo').value;
    
    if (!dataReg || !conteudo) return alert('Preencha todos os campos.');
    
    if (!data.registrosAula) data.registrosAula = [];
    
    data.registrosAula.push({
        id: Date.now(),
        id_turma: turmaAtual,
        data: dataReg,
        conteudo: conteudo
    });
    
    persistirDados();
    closeModal('modalNovoRegistroAula');
    renderTurmaRegistros();
}

function removerRegistroAula(id) {
    if(confirm('Excluir este registro de aula?')) {
        data.registrosAula = data.registrosAula.filter(r => r.id !== id);
        persistirDados();
        renderTurmaRegistros();
    }
}

// --- REGISTROS DE AULA (DIÁRIO DE CLASSE) ---
function renderTurmaRegistros() {
    // Busca registros específicos de aula (não administrativos)
    const registros = (data.registrosAula || []).filter(r => r.id_turma == turmaAtual);
    
    // Ordena por data (mais recente primeiro)
    registros.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    const html = `
        <div style="margin-bottom: 20px;">
            <button class="btn btn-primary" onclick="abrirModalNovoRegistroAula()">+ Novo Registro de Aula</button>
        </div>

        <h3>Histórico de Aulas</h3>
        <div class="grid" style="grid-template-columns: 1fr;">
            ${registros.length > 0 ? registros.map(r => `
                <div class="card" style="border-left: 4px solid #3182ce; margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h4 style="margin:0 0 10px 0; color:#2c5282;">📅 ${formatDate(r.data)}</h4>
                        <button class="btn btn-sm btn-danger" onclick="removerRegistroAula(${r.id})">🗑️</button>
                    </div>
                    <p style="white-space: pre-wrap; margin:0; color:#4a5568;">${r.conteudo}</p>
                </div>
            `).join('') : '<p class="empty-state">Nenhum registro de aula encontrado.</p>'}
        </div>
    `;
    document.getElementById('tabRegistros').innerHTML = html;
}

function abrirModalNovoRegistroAula() {
    document.getElementById('regAulaData').value = getTodayString();
    document.getElementById('regAulaConteudo').value = '';
    showModal('modalNovoRegistroAula');
}

function salvarRegistroAula(e) {
    e.preventDefault();
    const dataReg = document.getElementById('regAulaData').value;
    const conteudo = document.getElementById('regAulaConteudo').value;
    
    if (!dataReg || !conteudo) return alert('Preencha todos os campos.');
    
    if (!data.registrosAula) data.registrosAula = [];
    
    data.registrosAula.push({
        id: Date.now(),
        id_turma: turmaAtual,
        data: dataReg,
        conteudo: conteudo
    });
    
    persistirDados();
    closeModal('modalNovoRegistroAula');
    renderTurmaRegistros();
}

function removerRegistroAula(id) {
    if(confirm('Excluir este registro de aula?')) {
        data.registrosAula = data.registrosAula.filter(r => r.id !== id);
        persistirDados();
        renderTurmaRegistros();
    }
}

// --- TRABALHOS ---
function renderTrabalhos() {
    const trabalhos = (data.trabalhos || []).filter(t => t.id_turma == turmaAtual);
    
    const html = `
        <button class="btn btn-primary" onclick="showModal('modalNovoTrabalho')" style="margin-bottom:15px;">+ Novo Trabalho/Atividade</button>
        
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
            ${trabalhos.map(t => `
                <div class="card" style="border-left: 4px solid #805ad5;">
                    <h4>${t.titulo}</h4>
                    <p style="font-size:12px; color:#666;">Peso: ${t.peso}</p>
                    <div style="margin-top:10px; display:flex; gap:5px;">
                        <button class="btn btn-sm btn-secondary" onclick="alert('Funcionalidade de lançar notas virá em breve')">📝 Notas</button>
                        <button class="btn btn-sm btn-danger" onclick="removerTrabalho(${t.id})">🗑️</button>
                    </div>
                </div>
            `).join('')}
        </div>
        ${trabalhos.length === 0 ? '<p class="empty-state">Nenhum trabalho atribuído.</p>' : ''}
    `;
    document.getElementById('tabTrabalhos').innerHTML = html;
}

function removerTrabalho(id) {
    if (confirm('Excluir trabalho?')) {
        data.trabalhos = data.trabalhos.filter(t => t.id != id);
        persistirDados();
        renderTrabalhos();
    }
}

// --- COMPENSAÇÕES DE AUSÊNCIAS ---
function renderCompensacoes() {
    const today = new Date();
    // Padrão: Mês anterior para "consolidado", ou atual se for dia 20+
    let defaultMes = today.getMonth() - 1; 
    let defaultAno = today.getFullYear();
    if (defaultMes < 0) { defaultMes = 11; defaultAno--; }

    // Recupera seleção anterior se houver (para não resetar ao clicar em status)
    const selMes = document.getElementById('compMes') ? parseInt(document.getElementById('compMes').value) : defaultMes;
    const selAno = document.getElementById('compAno') ? parseInt(document.getElementById('compAno').value) : defaultAno;

    // Filtros da Tabela (Recupera estado ou define padrão "Todos")
    const selMesFiltro = document.getElementById('filtroCompMes') ? parseInt(document.getElementById('filtroCompMes').value) : -1;
    const selAnoFiltro = document.getElementById('filtroCompAno') ? parseInt(document.getElementById('filtroCompAno').value) : defaultAno;

    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    // 1. Buscar Compensações Já Criadas para esta turma
    let compensacoes = (data.compensacoes || []).filter(c => c.id_turma == turmaAtual);
    
    // Aplica Filtro na Tabela
    if (selMesFiltro !== -1) {
        compensacoes = compensacoes.filter(c => c.mes_referencia === selMesFiltro && c.ano_referencia === selAnoFiltro);
    }
    
    compensacoes.sort((a,b) => b.id - a.id);

    const html = `
        <div class="card" style="background: #f0fff4; border: 1px solid #c6f6d5; margin-bottom: 20px;">
            <h3 style="margin-top:0; color: #276749;">Nova Atribuição de Compensação</h3>
            <p style="font-size:12px; color:#555;">Selecione o mês e defina a atividade. O sistema atribuirá automaticamente para todos os alunos com faltas no período.</p>
            
            <div class="form-row" style="align-items: flex-end; margin-bottom: 10px;">
                <label>Mês Referência: <select id="compMes">${meses.map((m, i) => `<option value="${i}" ${i === selMes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
                <label>Ano: <input type="number" id="compAno" value="${selAno}" style="width:80px;"></label>
            </div>

            <div style="margin-bottom: 10px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">Atividade de Compensação:</label>
                <input type="text" id="atividadeCompensacao" placeholder="Ex: Resumo do Cap. 5, Lista de Exercícios..." style="width:100%;">
            </div>

            <button class="btn btn-success" onclick="gerarCompensacoesAutomatico()">🚀 Gerar Compensações</button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; margin-bottom:10px;">
            <h3 style="margin:0;">Controle de Entregas</h3>
            <div style="font-size:13px;">
                <label>Filtrar: <select id="filtroCompMes" onchange="renderCompensacoes()" style="padding:2px;">
                    <option value="-1" ${selMesFiltro === -1 ? 'selected' : ''}>Todos</option>
                    ${meses.map((m, i) => `<option value="${i}" ${i === selMesFiltro ? 'selected' : ''}>${m}</option>`).join('')}
                </select></label>
                <input type="number" id="filtroCompAno" value="${selAnoFiltro}" onchange="renderCompensacoes()" style="width:50px; padding:2px;">
            </div>
        </div>
        <div style="overflow-x:auto;">
            <table>
                <thead>
                    <tr>
                        <th>Estudante</th>
                        <th>Ref.</th>
                        <th>Atividade</th>
                        <th>Status (Clique para alterar)</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${compensacoes.length > 0 ? compensacoes.map(c => {
                        const est = (data.estudantes || []).find(e => e.id == c.id_estudante);
                        const nomeEst = est ? est.nome_completo : 'Excluído';
                        const statusMap = {
                            'pendente': { label: '⏳ Pendente', color: '#d69e2e', bg: '#fffaf0' },
                            'notificado': { label: '📩 Notificado', color: '#3182ce', bg: '#ebf8ff' },
                            'entregue': { label: '✅ Entregue', color: '#2f855a', bg: '#f0fff4' },
                            'nao_entregue': { label: '❌ Não Entregue', color: '#e53e3e', bg: '#fff5f5' }
                        };
                        const st = statusMap[c.status] || statusMap['pendente'];

                        // Gera o log minimizado (Ex: A 12/1 Notf 14/1)
                        const logMinimizado = (c.historico || []).map(h => {
                            if (!h.data) return '';
                            const d = new Date(h.data);
                            const dia = d.getDate();
                            const mes = d.getMonth() + 1;
                            const mapSigla = { 'pendente': 'A', 'notificado': 'Notf', 'entregue': 'E', 'nao_entregue': 'X' };
                            return `<span style="margin-right:4px;">${mapSigla[h.status] || '?'} ${dia}/${mes}</span>`;
                        }).join('');

                        return `
                            <tr>
                                <td>
                                    <strong>${nomeEst}</strong>
                                    <div style="font-size:10px; color:#718096; margin-top:2px;">${logMinimizado}</div>
                                </td>
                                <td style="font-size:12px;">${meses[c.mes_referencia]}/${c.ano_referencia}</td>
                                <td>${c.atividade} <br><span style="font-size:10px; color:#666;">Faltas: ${c.qtd_faltas}</span></td>
                                <td>
                                    <button onclick="toggleStatusCompensacao(${c.id})" style="border:1px solid ${st.color}; background:${st.bg}; color:${st.color}; padding:5px 10px; border-radius:15px; font-weight:bold; cursor:pointer; width: 130px;">
                                        ${st.label}
                                    </button>
                                </td>
                                <td><button class="btn btn-danger btn-sm" onclick="removerCompensacao(${c.id})">🗑️</button></td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="5" style="text-align:center; color:#999;">Nenhuma compensação registrada.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
    document.getElementById('tabCompensacoes').innerHTML = html;
}

function gerarCompensacoesAutomatico() {
    const mes = parseInt(document.getElementById('compMes').value);
    const ano = parseInt(document.getElementById('compAno').value);
    const atividade = document.getElementById('atividadeCompensacao').value;

    if (!atividade) return alert('Digite a descrição da atividade.');

    // Filtra presenças do mês/ano selecionado
    const presencas = (data.presencas || []).filter(p => {
        const d = new Date(p.data);
        // Ajuste de fuso simples ou apenas comparação de mês/ano
        // getMonth() é 0-based
        return d.getMonth() === mes && d.getFullYear() === ano && p.status === 'falta';
    });

    // Agrupa por estudante
    const contagem = {};
    presencas.forEach(p => {
        if (!contagem[p.id_estudante]) contagem[p.id_estudante] = 0;
        contagem[p.id_estudante]++;
    });

    // Filtra estudantes da turma atual que têm faltas
    const estudantesComFalta = (data.estudantes || [])
        .filter(e => e.id_turma == turmaAtual && contagem[e.id] > 0)
        .map(e => ({ ...e, faltas: contagem[e.id] }))
        .sort((a,b) => b.faltas - a.faltas);

    if (estudantesComFalta.length === 0) {
        return alert('Nenhuma falta registrada para esta turma neste mês.');
    }

    if (!confirm(`Encontrados ${estudantesComFalta.length} estudantes com faltas. Confirmar atribuição da atividade "${atividade}" para todos?`)) return;

    if (!data.compensacoes) data.compensacoes = [];

    let count = 0;
    estudantesComFalta.forEach(e => {
        // Evita duplicidade exata (mesmo aluno, mês, ano e atividade)
        const jaExiste = data.compensacoes.some(c => 
            c.id_estudante == e.id && 
            c.mes_referencia == mes && 
            c.ano_referencia == ano && 
            c.atividade === atividade
        );

        if (jaExiste) return;

        data.compensacoes.push({
            id: Date.now() + Math.random(),
            id_turma: turmaAtual,
            id_estudante: e.id,
            mes_referencia: mes,
            ano_referencia: ano,
            atividade: atividade,
            qtd_faltas: e.faltas,
            status: 'pendente', // pendente -> notificado -> entregue -> nao_entregue
            data_criacao: getTodayString(),
            historico: [{ status: 'pendente', data: getTodayString() }] // Log inicial
        });
        count++;
    });

    persistirDados();
    alert(`${count} compensações atribuídas com sucesso!`);
    renderCompensacoes();
}

function toggleStatusCompensacao(id) {
    const comp = data.compensacoes.find(c => c.id == id);
    if (!comp) return;

    const ciclo = ['pendente', 'notificado', 'entregue', 'nao_entregue'];
    const atualIdx = ciclo.indexOf(comp.status);
    const proximoIdx = (atualIdx + 1) % ciclo.length;
    
    comp.status = ciclo[proximoIdx];
    
    // Adiciona ao histórico
    if (!comp.historico) comp.historico = [];
    comp.historico.push({ status: comp.status, data: getTodayString() });

    persistirDados();
    renderCompensacoes();
}

function removerCompensacao(id) {
    if(confirm('Excluir esta atribuição?')) {
        data.compensacoes = data.compensacoes.filter(c => c.id !== id);
        persistirDados();
        renderCompensacoes();
    }
}

// --- TUTORIA ---
let agendaLimit = 50; // Controle de paginação da agenda (Aumentado para mostrar mais dias)

function renderTutoria() {
    const tutorados = data.tutorados || [];
    
    // 1. Botões Superiores
    const htmlTop = `
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="abrirModalNovoTutorado()">+ Novo Tutorado</button>
            <button class="btn btn-secondary" onclick="imprimirListaTutorados()">🖨️ Lista por Turma</button>
            <button class="btn btn-secondary" onclick="imprimirAgendamentosTutorados()">🖨️ Cartões Agendamento</button>
            <button class="btn btn-success" onclick="showModal('modalNovoEncontro')">Registrar Encontro</button>
        </div>
    `;

    // 2. Lista de Tutorados (Agrupados por Turma e Ordem Alfabética)
    const porTurma = {};
    tutorados.forEach(t => {
        if (!porTurma[t.turma]) porTurma[t.turma] = [];
        porTurma[t.turma].push(t);
    });
    
    const turmasOrdenadas = Object.keys(porTurma).sort();
    
    let htmlTutorados = '';
    if (turmasOrdenadas.length > 0) {
        turmasOrdenadas.forEach(turma => {
            porTurma[turma].sort((a, b) => a.nome_estudante.localeCompare(b.nome_estudante));
            
            htmlTutorados += `<h4 style="margin-top:15px; margin-bottom:5px; color:#2c5282; border-bottom:1px solid #e2e8f0;">${turma}</h4>`;
            htmlTutorados += `<table style="margin-top:0;"><tbody>`;
            htmlTutorados += porTurma[turma].map(t => `
                    <tr>
                        <td><a href="#" onclick="abrirFichaTutorado(${t.id})">${t.nome_estudante}</a></td>
                    </tr>
            `).join('');
            htmlTutorados += `</tbody></table>`;
        });
    } else {
        htmlTutorados = '<p class="empty-state">Nenhum tutorado.</p>';
    }
    
    document.getElementById('listaTutorados').innerHTML = htmlTop + htmlTutorados;

    // 3. Seção de Agendamento e Controles
    const agendamentos = (data.agendamentos || []).sort((a,b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio));
    const today = getTodayString();
    const futuros = agendamentos.filter(a => a.data >= today);

    const htmlAgendaControls = `
        <div class="card" style="background: #f0fff4; margin-bottom: 15px; border: 1px solid #c6f6d5;">
            <h3 style="margin-top:0; font-size:16px;">Organização Automática</h3>
            <p style="font-size:12px; color:#666; margin-bottom:10px;">Limpa agendamentos futuros e reorganiza todos os tutorados nos horários disponíveis.</p>
            <button class="btn btn-info" onclick="agendarTodosTutorados()">🔄 Reorganizar e Agendar Todos</button>
        </div>
        
        <div style="margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Próximas Janelas</h3>
        </div>
    `;

    // 4. Lista de Agenda (Limitada com botão Ampliar)
    const visibleAgenda = futuros.slice(0, agendaLimit);

    const htmlAgendaList = visibleAgenda.length > 0 ? `
        <div style="max-height: 600px; overflow-y: auto;">
            ${visibleAgenda.map(a => {
                // Busca nome do tutorado se estiver ocupado
                let statusLabel = 'Livre';
                let statusColor = '#718096';
                let cardBorder = '#cbd5e0';
                
                if (a.tutoradoId) {
                    const t = tutorados.find(x => x.id == a.tutoradoId);
                    statusLabel = t ? t.nome_estudante : 'Tutorado (Excluído)';
                    statusColor = '#2f855a';
                    cardBorder = '#22c55e';
                }

                return `
                <div class="card" style="padding: 10px; margin-bottom: 8px; border-left: 4px solid ${cardBorder}; background: #fff;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${formatDate(a.data)}</strong> <span style="font-size:12px; color:#666;">${a.inicio} - ${a.fim}</span>
                            <div style="font-size:14px; font-weight:bold; color:${statusColor}; margin-top:2px;">${statusLabel}</div>
                        </div>
                        ${!a.tutoradoId ? `<button class="btn btn-sm btn-danger" onclick="removerAgendamento(${a.id})">🗑️</button>` : ''}
                    </div>
                </div>
            `}).join('')}
        </div>
        ${futuros.length > agendaLimit ? `<button class="btn btn-secondary" style="width:100%; margin-top:10px;" onclick="expandirAgendaTutoria()">Ampliar (+10)</button>` : ''}
    ` : '<p class="empty-state">Nenhuma agenda gerada.</p>';
    
    document.getElementById('listaEncontros').innerHTML = htmlAgendaControls + htmlAgendaList;
}

function expandirAgendaTutoria() {
    agendaLimit += 10;
    renderTutoria();
}

function agendarProximoTutorado() {
    const id = document.getElementById('selAgendarTutorado').value;
    if (!id) return alert('Selecione um tutorado.');
    
    const today = getTodayString();
    // Encontra o primeiro slot livre no futuro
    const slot = (data.agendamentos || [])
        .sort((a,b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio))
        .find(a => !a.tutoradoId && a.data >= today);
        
    if (slot) {
        slot.tutoradoId = parseInt(id);
        persistirDados();
        renderTutoria();
        alert('Agendado para ' + formatDate(slot.data) + ' às ' + slot.inicio);
    } else {
        alert('Não há horários livres na agenda. Gere mais horários.');
    }
}

async function agendarTodosTutorados() {
    if (!confirm('ATENÇÃO: O sistema irá gerar horários baseados na sua Grade de Tutoria até o fim do semestre e distribuir seus tutorados rotativamente.\n\nAgendamentos futuros existentes serão reorganizados. Continuar?')) return;

    const tutorados = data.tutorados || [];
    if (tutorados.length === 0) return alert('Você não possui tutorados cadastrados.');

    // 1. Definir Fim do Semestre
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth(); // 0-11
    let dataFim;

    if (mes < 6) { // 1º Semestre (até 30 de Junho)
        dataFim = new Date(ano, 5, 30);
    } else { // 2º Semestre (até 20 de Dezembro)
        dataFim = new Date(ano, 11, 20);
    }

    // 2. Obter Grade de Horários (Tutoria)
    const gradeEscola = await getGradeEscola();
    const meusHorarios = data.horariosAulas || [];
    
    // Filtra blocos de Tutoria (Fixos ou Definidos pelo Professor)
    const blocosTutoria = gradeEscola.filter(g => 
        (g.tipo === 'tutoria') || 
        meusHorarios.some(a => a.id_bloco == g.id && a.tipo === 'tutoria')
    );

    if (blocosTutoria.length === 0) return alert('Não há horários de Tutoria definidos na sua Agenda (Grade). Configure-os primeiro na tela de Agenda.');

    if (!data.agendamentos) data.agendamentos = [];
    const today = getTodayString();

    // 3. Limpar atribuições futuras (mantendo os slots, mas esvaziando o aluno para reorganizar)
    data.agendamentos.forEach(a => {
        if (a.data >= today) {
            a.tutoradoId = null;
        }
    });

    // 4. Gerar Slots até o fim do semestre
    let cursor = new Date();
    cursor.setDate(cursor.getDate() + 1); // Começa amanhã

    while (cursor <= dataFim) {
        const diaSemana = cursor.getDay(); // 0=Dom, 1=Seg...
        
        // Se for dia útil (1-5)
        if (diaSemana >= 1 && diaSemana <= 5) {
            const blocosDoDia = blocosTutoria.filter(b => b.diaSemana == diaSemana);
            const dataStr = cursor.toISOString().split('T')[0];

            blocosDoDia.forEach(b => {
                // Verifica se já existe o slot
                const existe = data.agendamentos.find(a => a.data === dataStr && a.inicio === b.inicio);
                if (!existe) {
                    data.agendamentos.push({
                        id: Date.now() + Math.random(),
                        data: dataStr,
                        inicio: b.inicio,
                        fim: b.fim,
                        tutoradoId: null
                    });
                }
            });
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    // 5. Distribuir Alunos (Round Robin / Rotativo)
    // Pega todos os slots livres futuros ordenados
    const slotsLivres = data.agendamentos
        .filter(a => a.data >= today && !a.tutoradoId)
        .sort((a,b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio));

    if (slotsLivres.length === 0) return alert('Nenhum horário disponível gerado.');

    let tIndex = 0;
    // Ordena tutorados alfabeticamente para garantir ordem consistente
    tutorados.sort((a,b) => a.nome_estudante.localeCompare(b.nome_estudante));

    slotsLivres.forEach(slot => {
        slot.tutoradoId = tutorados[tIndex].id;
        tIndex = (tIndex + 1) % tutorados.length; // Cicla pelos alunos
    });

    persistirDados();
    renderTutoria();
    alert(`Agenda gerada até ${formatDate(dataFim.toISOString().split('T')[0])}.\n${slotsLivres.length} atendimentos agendados e distribuídos.`);
}

async function abrirModalNovoTutorado() {
    // Carregar dados da escola (Gestor)
    let turmasEscola = [];
    let estudantesEscola = [];
    
    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        if (gestorData) {
            turmasEscola = gestorData.turmas || [];
            estudantesEscola = gestorData.estudantes || [];
        }
    }

    // Salva temporariamente no DOM para acesso no onchange
    const modal = document.getElementById('modalNovoTutorado');
    modal.dataset.estudantes = JSON.stringify(estudantesEscola);

    const selectTurma = document.getElementById('tutoradoTurmaSelect');
    selectTurma.innerHTML = '<option value="">Selecione a Turma...</option>' + 
        turmasEscola.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
    
    const selectEstudante = document.getElementById('tutoradoEstudanteSelect');
    selectEstudante.innerHTML = '<option value="">Selecione a Turma primeiro...</option>';
    selectEstudante.disabled = true;

    showModal('modalNovoTutorado');
}

function carregarEstudantesTutorado() {
    const modal = document.getElementById('modalNovoTutorado');
    const estudantesEscola = JSON.parse(modal.dataset.estudantes || '[]');
    const turmaId = document.getElementById('tutoradoTurmaSelect').value;
    const selectEstudante = document.getElementById('tutoradoEstudanteSelect');

    if (!turmaId) {
        selectEstudante.innerHTML = '<option value="">Selecione a Turma primeiro...</option>';
        selectEstudante.disabled = true;
        return;
    }

    const filtrados = estudantesEscola.filter(e => e.id_turma == turmaId);
    selectEstudante.innerHTML = '<option value="">Selecione o Estudante...</option>' + 
        filtrados.map(e => `<option value="${e.id}">${e.nome_completo}</option>`).join('');
    selectEstudante.disabled = false;
}

function salvarTutorado(e) {
    e.preventDefault();
    const selectTurma = document.getElementById('tutoradoTurmaSelect');
    const selectEstudante = document.getElementById('tutoradoEstudanteSelect');
    
    const turmaNome = selectTurma.options[selectTurma.selectedIndex].text;
    const estudanteNome = selectEstudante.options[selectEstudante.selectedIndex].text;
    const estudanteId = selectEstudante.value;

    if (!estudanteId) return alert('Selecione um estudante.');
    
    if (!data.tutorados) data.tutorados = [];
    
    // Evitar duplicidade
    if (data.tutorados.find(t => t.id_estudante_origem == estudanteId)) {
        return alert('Este estudante já é seu tutorado.');
    }

    data.tutorados.push({ 
        id: Date.now(), 
        nome_estudante: estudanteNome, 
        turma: turmaNome,
        id_estudante_origem: estudanteId 
    });

    persistirDados();
    closeModal('modalNovoTutorado');
    renderTutoria();
}

function abrirFichaTutorado(id) {
    const t = data.tutorados.find(x => x.id == id);
    if (!t) return;
    
    const titleEl = document.getElementById('tutoradoFichaNome');
    titleEl.textContent = t.nome_estudante;
    
    // Injeta botão de desvincular se não existir
    let actionContainer = document.getElementById('tutoradoAcoesContainer');
    if (!actionContainer) {
        actionContainer = document.createElement('div');
        actionContainer.id = 'tutoradoAcoesContainer';
        actionContainer.style.marginTop = '10px';
        titleEl.parentNode.insertBefore(actionContainer, titleEl.nextSibling);
    }
    
    actionContainer.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="imprimirRelatorioTutorado(${t.id}, '${t.nome_estudante}')">🖨️ Relatório Semestral</button>
            <button class="btn btn-danger btn-sm" onclick="desvincularTutorado(${t.id})">Desvincular Tutorado</button>
        </div>
    `;

    // Preencher listas (Agendamentos e Histórico)
    const agendamentos = (data.agendamentos || []).filter(a => a.tutoradoId == id && a.data >= getTodayString()).sort((a,b) => a.data.localeCompare(b.data));
    const encontros = (data.encontros || []).filter(e => e.tutoradoId == id).sort((a,b) => b.data.localeCompare(a.data)); // Decrescente

    document.getElementById('tutoradoFichaAgendamentos').innerHTML = agendamentos.length > 0 
        ? agendamentos.map(a => `<div class="card" style="padding:10px; margin-bottom:5px; border-left:4px solid #3182ce; background:#fff;"><strong>${formatDate(a.data)}</strong> às ${a.inicio}</div>`).join('')
        : '<p class="empty-state">Nenhum agendamento futuro.</p>';

    document.getElementById('tutoradoFichaHistorico').innerHTML = encontros.length > 0
        ? encontros.map(e => `
            <div class="card" style="padding:10px; margin-bottom:5px; background:#f7fafc; border:1px solid #e2e8f0;">
                <div style="font-weight:bold; color:#2d3748;">${formatDate(e.data)} - ${e.tema}</div>
                <p style="margin:5px 0 0 0; font-size:13px; color:#4a5568; white-space:pre-wrap;">${e.resumo}</p>
            </div>`).join('')
        : '<p class="empty-state">Nenhum encontro registrado.</p>';

    showScreen('tutoradoDetalhe');
}

function imprimirRelatorioTutorado(id, nome) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    const defaultSem = currentMonth < 6 ? 1 : 2;
    
    const input = prompt(`Digite o Semestre e Ano para o relatório (ex: ${defaultSem}/${currentYear}):`, `${defaultSem}/${currentYear}`);
    if (!input) return;
    
    const parts = input.split('/');
    if (parts.length !== 2) return alert('Formato inválido. Use Semestre/Ano (ex: 1/2026).');
    
    const semestre = parseInt(parts[0]);
    const ano = parseInt(parts[1]);
    
    if (![1, 2].includes(semestre) || isNaN(ano)) {
        return alert('Semestre deve ser 1 ou 2, e Ano deve ser válido.');
    }

    // Filtra Encontros
    const encontros = (data.encontros || []).filter(e => {
        if (e.tutoradoId != id) return false;
        const d = new Date(e.data);
        const mes = d.getMonth();
        const anoEnc = d.getFullYear();
        
        if (anoEnc !== ano) return false;
        if (semestre === 1) return mes <= 5;
        if (semestre === 2) return mes >= 6;
        return false;
    }).sort((a,b) => new Date(a.data) - new Date(b.data)); // Crescente para leitura

    if (encontros.length === 0) return alert('Nenhum registro encontrado para este período.');

    // Nome da Escola (Pega do cabeçalho)
    const nomeEscola = document.querySelector('header h1') ? document.querySelector('header h1').textContent.replace('SisProf - ', '') : 'Escola';

    const html = `
        <html>
        <head>
            <title>Relatório de Tutoria - ${nome}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; color: #000; line-height: 1.5; }
                h1 { text-align: center; font-size: 22px; margin: 0 0 5px 0; text-transform: uppercase; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                .sub-header { font-size: 16px; margin-top: 5px; }
                .info { margin-bottom: 30px; font-size: 14px; border: 1px solid #ccc; padding: 15px; border-radius: 5px; }
                .registro { margin-bottom: 25px; }
                .registro-titulo { font-weight: bold; font-size: 15px; margin-bottom: 5px; text-decoration: underline; }
                .registro-texto { white-space: pre-wrap; text-align: justify; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${nomeEscola}</h1>
                <div class="sub-header">Relatório de Tutoria - ${semestre}º Semestre de ${ano}</div>
            </div>
            
            <div class="info">
                <p style="margin: 5px 0;"><strong>Professor Tutor:</strong> ${currentUser.nome}</p>
                <p style="margin: 5px 0;"><strong>Estudante Tutorado:</strong> ${nome}</p>
            </div>

            ${encontros.map(e => `
                <div class="registro">
                    <div class="registro-titulo">${e.tema || 'Sem Título'}</div>
                    <div class="registro-texto">${e.resumo || ''}</div>
                </div>
            `).join('')}

            <script>window.print();</script>
        </body>
        </html>
    `;

    const win = window.open('', '', 'width=900,height=800');
    win.document.write(html);
    win.document.close();
}

function desvincularTutorado(id) {
    if (confirm('Tem certeza? O estudante sairá da sua lista, mas os registros de encontros passados serão mantidos.')) {
        data.tutorados = data.tutorados.filter(t => t.id != id);
        persistirDados();
        showScreen('tutoria');
    }
}

function imprimirListaTutorados() {
    const tutorados = data.tutorados || [];
    if (tutorados.length === 0) return alert('Nenhum tutorado para imprimir.');

    // Agrupar por turma
    const porTurma = {};
    tutorados.forEach(t => {
        if (!porTurma[t.turma]) porTurma[t.turma] = [];
        porTurma[t.turma].push(t);
    });

    const turmasOrdenadas = Object.keys(porTurma).sort();

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; font-size: 12px;">
            <h2 style="text-align: center; margin: 0 0 10px 0;">Lista de Tutorados</h2>
            <p style="text-align: center; margin-bottom: 15px;">Professor: ${currentUser.nome}</p>
            <div style="column-count: 2; column-gap: 20px;">
    `;

    turmasOrdenadas.forEach(turma => {
        html += `
            <div style="break-inside: avoid; margin-bottom: 15px;">
                <h3 style="border-bottom: 1px solid #000; padding-bottom: 2px; margin: 0 0 5px 0; font-size: 14px;">${turma}</h3>
                <ul style="margin: 0; padding-left: 20px;">
        `;
        
        porTurma[turma].sort((a,b) => a.nome_estudante.localeCompare(b.nome_estudante)).forEach(t => {
            html += `
                <li style="margin-bottom: 2px;">${t.nome_estudante}</li>
            `;
        });

        html += `</ul></div>`;
    });

    html += `</div>`;

    const janela = window.open('', '', 'width=800,height=600');
    janela.document.write('<html><head><title>Lista de Tutorados</title></head><body>');
    janela.document.write(html);
    janela.document.write('<script>window.print();</script>');
    janela.document.write('</body></html>');
    janela.document.close();
}

function imprimirAgendamentosTutorados() {
    const agendamentos = (data.agendamentos || []).filter(a => a.tutoradoId);
    const tutorados = data.tutorados || [];
    
    if (agendamentos.length === 0) return alert('Nenhum agendamento com tutorado vinculado para imprimir.');

    // Agrupar por aluno
    const porAluno = {};
    agendamentos.forEach(a => {
        if (!porAluno[a.tutoradoId]) porAluno[a.tutoradoId] = [];
        porAluno[a.tutoradoId].push(a);
    });

    let html = `
        <style>
            body { font-family: Arial, sans-serif; }
            .card { border: 1px solid #000; padding: 10px; width: 48%; box-sizing: border-box; margin-bottom: 15px; page-break-inside: avoid; border-radius: 5px; float: left; margin-right: 2%; height: 160px; }
            .card:nth-child(2n) { margin-right: 0; }
            .container { overflow: hidden; }
            @media print { .no-print { display: none; } }
        </style>
        <div style="padding: 20px;">
            <h2 style="text-align: center; margin-bottom: 10px;">Cartões de Agendamento</h2>
            <div class="container">
    `;

    const today = getTodayString();

    Object.keys(porAluno).forEach(tId => {
        const t = tutorados.find(x => x.id == tId);
        if (!t) return;

        // Filtrar futuros e ordenar (pega os próximos 3)
        const appts = porAluno[tId]
            .filter(a => a.data >= today)
            .sort((a,b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio))
            .slice(0, 3);

        if (appts.length === 0) return;

        html += `
            <div class="card">
                <h3 style="margin: 0 0 5px 0; border-bottom: 1px solid #ccc; padding-bottom: 5px; font-size: 16px;">${t.nome_estudante}</h3>
                <p style="margin: 0 0 10px 0; font-size: 12px;"><strong>Turma:</strong> ${t.turma}</p>
                <strong style="font-size: 12px;">Próximos Atendimentos:</strong>
                <ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 13px;">
                    ${appts.map(a => `<li>${formatDate(a.data)} às ${a.inicio}</li>`).join('')}
                </ul>
            </div>
        `;
    });

    html += `</div></div>`;

    const janela = window.open('', '', 'width=800,height=600');
    janela.document.write('<html><head><title>Cartões de Agendamento</title></head><body>');
    janela.document.write(html);
    janela.document.write('<script>window.print();</script>');
    janela.document.write('</body></html>');
    janela.document.close();
}

async function gerarAgendamentosTutoria() {
    if (!confirm('Gerar janelas de atendimento para os próximos 6 meses baseadas na sua Grade de Horários?')) return;

    const gradeEscola = await getGradeEscola();
    const meusHorarios = data.horariosAulas || [];
    
    // Filtra blocos onde o professor marcou 'tutoria'
    const blocosTutoria = gradeEscola.filter(g => 
        (g.tipo === 'tutoria') || // Definido pelo Gestor (Fixo)
        meusHorarios.some(a => a.id_bloco == g.id && a.tipo === 'tutoria') // Definido pelo Professor
    );

    if (blocosTutoria.length === 0) {
        alert('Você não definiu horários de Tutoria na sua Grade de Horários (Agenda).');
        return;
    }

    if (!data.agendamentos) data.agendamentos = [];

    const hoje = new Date();
    let count = 0;

    // Gera para os próximos 6 meses (~180 dias)
    for (let i = 0; i < 180; i++) {
        const d = new Date();
        d.setDate(hoje.getDate() + i);
        const diaSemana = d.getDay(); // 0=Dom, 1=Seg...

        const blocosHoje = blocosTutoria.filter(b => b.diaSemana == diaSemana);

        blocosHoje.forEach(b => {
            const dataStr = d.toISOString().split('T')[0];
            // Verifica se já existe agendamento neste dia/horario
            const exists = data.agendamentos.find(a => a.data === dataStr && a.inicio === b.inicio);
            if (!exists) {
                data.agendamentos.push({
                    id: Date.now() + Math.random(),
                    data: dataStr,
                    inicio: b.inicio,
                    fim: b.fim,
                    tutoradoId: null // Livre
                });
                count++;
            }
        });
    }

    persistirDados();
    alert(`${count} janelas de tutoria geradas.`);
    renderTutoria();
}

function removerAgendamento(id) {
    if (confirm('Remover esta janela de atendimento?')) {
        data.agendamentos = data.agendamentos.filter(a => a.id != id);
        persistirDados();
        renderTutoria();
    }
}

// --- AGENDA ---
async function renderAgenda() {
    await renderGradeHorariaProfessor();
}

async function imprimirAgendaMensal() {
    // 1. Solicita o Mês/Ano
    const input = prompt("Digite o Mês e Ano para a Agenda (ex: 03/2026):", new Date().toLocaleDateString('pt-BR', {month: '2-digit', year: 'numeric'}));
    if (!input) return;

    const [mesStr, anoStr] = input.split('/');
    const mes = parseInt(mesStr) - 1; // JS conta meses de 0 a 11
    const ano = parseInt(anoStr);

    if (isNaN(mes) || isNaN(ano)) return alert("Data inválida. Use o formato MM/AAAA");

    // 2. Carrega o Template HTML (Agenda.html)
    let templateHtml = '';
    try {
        const response = await fetch('Agenda.html');
        if (!response.ok) throw new Error('Arquivo Agenda.html não encontrado.');
        templateHtml = await response.text();
    } catch (e) {
        console.error(e);
        return alert('Erro ao carregar o modelo de impressão (Agenda.html). Verifique se o arquivo está na pasta do sistema.');
    }

    // Helper para Feriados (Nacionais e Osasco)
    function getFeriado(data) {
        const d = data.getDate();
        const m = data.getMonth() + 1;
        const y = data.getFullYear();
        const key = `${d}/${m}`;

        const fixos = {
            '1/1': 'Confraternização Universal',
            '19/2': 'Emancipação de Osasco',
            '21/4': 'Tiradentes',
            '1/5': 'Dia do Trabalho',
            '13/6': 'Santo Antônio',
            '9/7': 'Rev. Constitucionalista',
            '7/9': 'Independência',
            '12/10': 'N. Sra. Aparecida',
            '2/11': 'Finados',
            '15/11': 'Proc. da República',
            '20/11': 'Consciência Negra',
            '25/12': 'Natal'
        };
        if (fixos[key]) return fixos[key];

        // Páscoa (Algoritmo de Meeus/Jones/Butcher)
        const a = y % 19, b = Math.floor(y/100), c = y%100, d_val = Math.floor(b/4), e = b%4, f = Math.floor((b+8)/25);
        const g = Math.floor((b-f+1)/3), h = (19*a+b-d_val-g+15)%30, i = Math.floor(c/4), k = c%4, l = (32+2*e+2*i-h-k)%7;
        const m_val = Math.floor((a+11*h+22*l)/451), month = Math.floor((h+l-7*m_val+114)/31), day = ((h+l-7*m_val+114)%31)+1;
        const pascoa = new Date(y, month-1, day);

        const check = (diff, nome) => {
            const dt = new Date(pascoa); dt.setDate(pascoa.getDate() + diff);
            return (dt.getDate() === d && (dt.getMonth()+1) === m) ? nome : null;
        };

        return check(-47, 'Carnaval') || check(-2, 'Sexta-feira Santa') || check(60, 'Corpus Christi');
    }

    // 3. Prepara os dados da Grade Fixa
    const gradeEscola = await getGradeEscola();
    const minhasAulas = data.horariosAulas || [];
    const turmas = data.turmas || [];

    // Mapeia a grade fixa por dia da semana (1=Seg, 2=Ter...)
    const gradePorDia = {};
    for (let d = 1; d <= 5; d++) {
        const blocosDia = gradeEscola.filter(g => g.diaSemana == d).sort((a,b) => a.inicio.localeCompare(b.inicio));
        gradePorDia[d] = blocosDia.map(bloco => {
            const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
            let texto = '';
            if (aula) {
                if (aula.tipo === 'aula' && aula.id_turma) {
                    const t = turmas.find(x => x.id == aula.id_turma);
                    texto = t ? `${t.nome} ${t.disciplina || ''}` : 'Turma?';
                } else if ((aula.tipo === 'estudo' || aula.tipo === 'reuniao') && aula.tema) {
                    texto = aula.tema;
                } else {
                    texto = aula.tipo.toUpperCase(); // ESTUDO, TUTORIA, ETC
                }
            }
            // Se for intervalo/almoço fixo (definido pelo gestor), usa o tipo do bloco
            if (!texto && bloco.tipo) texto = bloco.tipo.toUpperCase();
            
            // Define o rótulo final (Apenas Gestor)
            const labelFinal = bloco.label || '';

            return { inicio: bloco.inicio, fim: bloco.fim, texto, label: labelFinal };
        });
    }

    // 4. Manipula o DOM do Template
    const parser = new DOMParser();
    const doc = parser.parseFromString(templateHtml, 'text/html');

    // Adiciona BASE tag para carregar CSS/Imagens relativos corretamente
    const base = doc.createElement('base');
    base.href = window.location.href;
    doc.head.appendChild(base);

    // A. Atualizar Cabeçalho (Escola, Professor, Mês)
    const nomeEscola = document.querySelector('#appContainer h1').textContent.replace('SisProf - ', '');
    const nomeProf = currentUser.nome;
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const tituloAgenda = `AGENDA MENSAL DE TRABALHO – Prof. ${nomeProf} - ${meses[mes]} ${ano}`;

    // Procura células para substituir
    const cells = doc.querySelectorAll('td');
    cells.forEach(td => {
        // Substitui nome da escola se encontrar o padrão do template
        if (td.textContent.includes('UNIDADE REGIONAL') || td.textContent.includes('E.E.')) {
            // Tenta manter a formatação substituindo apenas o nome da escola antiga
            if (td.textContent.includes('E.E.')) {
                td.innerHTML = td.innerHTML.replace(/E\.E\..*?(?=<br>|$)/, nomeEscola);
            }
        }
        // Substitui o título da agenda
        if (td.textContent.includes('AGENDA MENSAL DE TRABALHO')) {
            td.textContent = tituloAgenda;
        }
    });

    // B. Mapear e Preencher o Grid
    // Encontra os blocos de semanas procurando por "2ªfeira"
    const rows = Array.from(doc.querySelectorAll('tr'));
    let weekBlocks = [];
    
    rows.forEach((tr, index) => {
        if (tr.textContent.includes('2ªfeira') && tr.textContent.includes('3ª feira')) {
            weekBlocks.push({
                headerRowIndex: index,
                dateRowIndex: index + 1, // A linha logo abaixo dos dias da semana contém as datas
                lessonRowsStartIndex: index + 2 // As aulas começam na linha seguinte
            });
        }
    });

    // Lógica de Datas
    let currentDay = new Date(ano, mes, 1);
    // Ajusta para a segunda-feira da semana do dia 1
    let startOffset = currentDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6; // Domingo volta 6
    currentDay.setDate(currentDay.getDate() - startOffset);

    weekBlocks.forEach((block, blkIdx) => {
        // Verifica se a semana tem dias no mês selecionado
        let hasDaysInMonth = false;
        for (let i = 0; i < 5; i++) {
            const d = new Date(currentDay);
            d.setDate(d.getDate() + i);
            if (d.getMonth() === mes) hasDaysInMonth = true;
        }

        if (!hasDaysInMonth) {
            // Se a semana estiver vazia (fora do mês), oculta as linhas do bloco
            const nextBlock = weekBlocks[blkIdx + 1];
            const endIndex = nextBlock ? nextBlock.headerRowIndex : rows.length;
            for (let r = block.headerRowIndex; r < endIndex; r++) {
                if (rows[r]) rows[r].style.display = 'none';
            }
            currentDay.setDate(currentDay.getDate() + 7);
            return;
        }

        // 1. Preencher Datas (Seg-Sex)
        const dateRow = rows[block.dateRowIndex];
        if (!dateRow) return;
        
        // As células de data são as colunas 3 a 7 (índices 3,4,5,6,7) no template padrão
        const dateCells = Array.from(dateRow.children).slice(3, 8);

        for (let i = 0; i < 5; i++) { // 0=Seg, 4=Sex
            const d = new Date(currentDay);
            d.setDate(d.getDate() + i);
            
            const diaMes = d.getDate();
            const isCurrentMonth = d.getMonth() === mes;
            const feriado = isCurrentMonth ? getFeriado(d) : null;
            
            if (dateCells[i]) {
                dateCells[i].textContent = isCurrentMonth ? diaMes : '';
                // Opcional: mudar cor de fundo se não for do mês
                if (!isCurrentMonth) dateCells[i].style.backgroundColor = '#f2f2f2';
                if (feriado) {
                    dateCells[i].style.backgroundColor = '#ffebee'; // Fundo avermelhado no cabeçalho do dia
                    dateCells[i].title = feriado;
                }
            }

            // 2. Preencher Aulas
            const diaSemana = i + 1; // 1=Seg
            const aulasDoDia = gradePorDia[diaSemana] || [];
            
            // let aulaIndex = 0; // Removido em favor do mapeamento por rótulo
            
            // Percorre as linhas de aula (aprox 10 linhas, pulando almoço)
            for (let r = 0; r < 12; r++) { 
                const lessonRow = rows[block.lessonRowsStartIndex + r];
                if (!lessonRow) continue;
                
                // Pega a célula correspondente ao dia
                const lessonCells = Array.from(lessonRow.children);
                
                // Tenta identificar o rótulo da linha (Coluna C no Excel, índice 2 aqui considerando TH)
                // Estrutura esperada: TH(0), TD(1), TD(2-Label), TD(3-Seg)...
                const labelCell = lessonCells[2]; 
                const rowLabel = labelCell ? labelCell.textContent.trim() : '';

                // Se a linha não tiver rótulo (ex: Almoço, Espaçamento), pula para manter o original do template
                if (!rowLabel) continue;

                // Ajuste de índice: Header(0) + Spacer(1) + Label(2) + Seg(3)...
                const cell = lessonCells[3 + i];
                
                if (cell) {
                    if (feriado) {
                        // Limpa o dia e marca Feriado
                        cell.innerHTML = `<div style="font-size:10px; font-weight:bold; color:#c53030; text-align:center;">FERIADO<br><span style="font-size:8px; font-weight:normal; color:#000;">${feriado}</span></div>`;
                        cell.style.backgroundColor = '#fff5f5';
                        continue;
                    }

                    // Tenta encontrar uma aula que corresponda a este rótulo (ex: "1ª Aula")
                    // Se não tiver rótulo definido na grade, tenta usar a ordem sequencial como fallback se necessário,
                    // mas a solicitação pede identificação explícita.
                    
                    // Normaliza strings para comparação
                    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const aulaCorrespondente = aulasDoDia.find(a => normalize(a.label) === normalize(rowLabel));

                    if (isCurrentMonth && aulaCorrespondente) {
                        const a = aulaCorrespondente;
                        // Insere o texto da aula (Turma ou Atividade)
                        cell.innerHTML = `<div style="font-size:9px; overflow:hidden;">${a.texto}</div>`;
                    } else {
                        cell.textContent = '';
                    }
                }
            }
        }
        // Avança uma semana
        currentDay.setDate(currentDay.getDate() + 7);
    });

    // 5. Abre Janela de Impressão
    // Injeta CSS para garantir que a impressão seja exata (cores de fundo e gráficos)
    const printStyle = doc.createElement('style');
    printStyle.innerHTML = `
        @media print { 
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } 
        }
        /* Oculta os cabeçalhos de linha (1, 2, 3...) removendo-os do fluxo */
        .row-headers-background { display: none !important; }
        
        /* Oculta os cabeçalhos de coluna (A, B, C...) mas MANTÉM a largura para não quebrar a tabela */
        .column-headers-background { 
            border: none !important; 
            background: transparent !important; 
            color: transparent !important; 
            height: 0 !important; 
            line-height: 0 !important; 
            padding: 0 !important;
            overflow: hidden !important;
            font-size: 0 !important;
        }
    `;
    doc.head.appendChild(printStyle);
    
    // Adiciona BASE tag para garantir que CSS/Imagens relativos carreguem na nova janela
    if (!doc.querySelector('base')) {
        const base = doc.createElement('base');
        base.href = window.location.href;
        doc.head.appendChild(base);
    }

    const win = window.open('', '', 'width=1200,height=800');
    // Removemos o Doctype forçado para manter o modo de renderização original (Quirks vs Standard)
    win.document.write(doc.documentElement.outerHTML);
    win.document.close();
    
    // Delay para carregar estilos
    setTimeout(() => { win.print(); }, 500);
}

// --- PREVIEW AGENDAMENTO (Placeholder) ---
async function previewHorariosAuto(e) {
    e.preventDefault();
    
    const usarGrade = document.getElementById('usarGradeTutoria').checked;
    
    if (usarGrade) {
        const gradeEscola = await getGradeEscola();
        const meusHorarios = data.horariosAulas || [];
        
        // Encontra blocos marcados como 'tutoria'
        const blocosTutoria = gradeEscola.filter(g => 
            meusHorarios.some(a => a.id_bloco == g.id && a.tipo === 'tutoria')
        );

        if (blocosTutoria.length === 0) {
            alert('Você não definiu horários de Tutoria na sua Grade de Horários.');
            return;
        }

        const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
        const lista = document.getElementById('listaHorariosPreview');
        lista.innerHTML = blocosTutoria.map(b => `<div style="padding:5px; border-bottom:1px solid #eee;">${dias[b.diaSemana]}: ${b.inicio} - ${b.fim}</div>`).join('');
        document.getElementById('qtdHorariosGerados').textContent = blocosTutoria.length + ' blocos/semana';
    } else {
        document.getElementById('listaHorariosPreview').innerHTML = '<p>Geração manual (sem grade).</p>';
    }
    
    document.getElementById('areaPreviewAgendamento').style.display = 'block';
}

function confirmarDistribuicaoAuto() {
    alert('Agendamentos gerados!');
    closeModal('modalGerarAgendamento');
}

function toggleRecorrenciaUI() {
    const val = document.getElementById('eventoRecorrenciaTipo').value;
    document.getElementById('divRecorrenciaFim').style.display = val !== 'nao' ? 'block' : 'none';
}

function toggleAgendamentoRecorrenciaUI() {
    // Placeholder
}

function importarEstudantes(e) {
    e.preventDefault();
    const fileInput = document.getElementById('arquivoEstudantes');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Selecione um arquivo CSV.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        const lines = text.split('\n');
        
        let headerIndex = -1;
        let idxNome = -1;
        let idxStatus = -1;
        
        // 1. Encontrar o cabeçalho dinamicamente
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('Nome do Aluno')) {
                const cols = line.split(';').map(c => c.trim());
                idxNome = cols.indexOf('Nome do Aluno');
                idxStatus = cols.indexOf('Situação do Aluno');
                
                if (idxNome !== -1) {
                    headerIndex = i;
                    break;
                }
            }
        }

        if (headerIndex === -1) {
            alert('Erro: Cabeçalho "Nome do Aluno" não encontrado no arquivo CSV.');
            return;
        }

        if (!data.estudantes) data.estudantes = [];
        let nextId = data.estudantes.length > 0 ? Math.max(...data.estudantes.map(e => e.id)) + 1 : 1;
        let count = 0;

        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(';');
            
            // Verifica se a linha tem colunas suficientes
            if (parts.length <= idxNome) continue;

            const nome = parts[idxNome].trim();
            const status = (idxStatus !== -1 && parts.length > idxStatus) ? parts[idxStatus].trim() : 'Ativo';
            
            // Verifica se tem nome e se já não existe na turma
            if (nome && !data.estudantes.find(e => e.id_turma == turmaAtual && e.nome_completo === nome)) {
                data.estudantes.push({ id: nextId++, id_turma: turmaAtual, nome_completo: nome, status: status });
                count++;
            }
        }

        persistirDados();
        alert(`Importação concluída! ${count} estudantes adicionados.`);
        closeModal('modalImportarEstudantes');
        renderEstudantes();
        fileInput.value = ''; // Limpa o input
    };
    reader.readAsText(file);
}

function salvarEncontro(e) {
    e.preventDefault();
    const tutoradoId = document.getElementById('encontroTutorado').value;
    const dataEncontro = document.getElementById('encontroData').value;
    const tema = document.getElementById('encontroTema').value;
    const resumo = document.getElementById('encontroResumo').value;

    if (!data.encontros) data.encontros = [];
    data.encontros.push({
        id: Date.now(),
        tutoradoId: tutoradoId,
        data: dataEncontro,
        tema: tema,
        resumo: resumo
    });
    
    persistirDados();
    alert('Encontro registrado com sucesso!');
    closeModal('modalNovoEncontro');
}

function registrarEncontroAtalho(tutoradoId) {
    showModal('modalNovoEncontro');
    const select = document.getElementById('encontroTutorado');
    if (select) select.value = tutoradoId;
    document.getElementById('encontroData').value = getTodayString();
}

function salvarTrabalho(e) {
    e.preventDefault();
    const titulo = document.getElementById('trabalhoTitulo').value;
    const peso = document.getElementById('trabalhoPeso').value;

    if (!data.trabalhos) data.trabalhos = [];
    data.trabalhos.push({
        id: Date.now(),
        id_turma: turmaAtual,
        titulo: titulo,
        peso: peso
    });
    
    persistirDados();
    closeModal('modalNovoTrabalho');
    renderTrabalhos();
    e.target.reset();
}

function salvarDetalhesEvento(e) {
    e.preventDefault();
    alert('Detalhes salvos');
    closeModal('modalDetalhesEvento');
}

function excluirEventoAtual() {
    alert('Excluído');
    closeModal('modalDetalhesEvento');
}

// --- DETALHES DO ESTUDANTE (Painel Unificado por Nome) ---
let estudanteAtualDetalhe = null;

function abrirEstudanteDetalhe(id) {
    // Encontra o estudante clicado
    const estudante = data.estudantes.find(e => e.id == id);
    if (!estudante) return;

    estudanteAtualDetalhe = estudante;
    showScreen('estudanteDetalhe');
    renderEstudanteGeral();
}

function renderEstudanteGeral() {
    if (!estudanteAtualDetalhe) return;
    
    const nome = estudanteAtualDetalhe.nome_completo;
    
    // Verifica se é tutorado do usuário atual
    const tutoradoEntry = (data.tutorados || []).find(t => t.id_estudante_origem == estudanteAtualDetalhe.id);
    
    const htmlNome = tutoradoEntry 
        ? `${nome} <div style="font-size: 14px; color: #3182ce; font-weight: normal; margin-top: 4px;">🎓 Tutor: ${currentUser.nome}</div>` 
        : nome;

    document.getElementById('estudanteGeralNome').innerHTML = htmlNome;
    
    const isGestor = currentViewMode === 'gestor';

    // LÓGICA DE UNIFICAÇÃO:
    // Encontra TODOS os IDs que esse aluno possui no sistema (em qualquer turma), baseado no Nome Completo.
    // Isso permite que registros de quando ele era "Remanejado" em outra turma apareçam aqui.
    const todosRegistrosAluno = data.estudantes.filter(e => e.nome_completo === nome);
    const todosIds = todosRegistrosAluno.map(e => e.id);

    // 1. Frequência (Soma de todas as turmas)
    const faltas = (data.presencas || [])
        .filter(p => todosIds.includes(p.id_estudante) && p.status === 'falta')
        .length;
    
    document.getElementById('estudanteGeralFrequencia').innerHTML = `
        <div style="font-size: 24px; color: #e53e3e; font-weight: bold;">${faltas} <span style="font-size:14px; color:#718096; font-weight:normal;">faltas totais</span></div>
        <p style="font-size:12px; color:#666;">(Soma de todos os registros deste nome)</p>
    `;

    // 2. Atrasos
    const atrasos = (data.atrasos || [])
        .filter(a => todosIds.includes(a.id_estudante))
        .length;
    
    document.getElementById('estudanteGeralAtrasos').innerHTML = `
        <div style="font-size: 24px; color: #d69e2e; font-weight: bold;">${atrasos} <span style="font-size:14px; color:#718096; font-weight:normal;">atrasos</span></div>
    `;

    // 3. Ocorrências
    let ocorrenciasAluno = (data.ocorrencias || []).filter(o => {
        return (o.ids_estudantes || []).some(id => todosIds.includes(id));
    });

    // Filtro por Perfil: Professor vê apenas as suas; Gestor vê todas
    if (!isGestor) {
        ocorrenciasAluno = ocorrenciasAluno.filter(o => o.autor === currentUser.nome);
    }
    
    ocorrenciasAluno.sort((a,b) => new Date(b.data) - new Date(a.data));

    const historicoTurmas = todosRegistrosAluno.map(e => {
        const t = data.turmas.find(turma => turma.id == e.id_turma);
        return `<div class="badge badge-info" style="margin-right:5px;">${t ? t.nome : 'Turma Excluída'} (${e.status})</div>`;
    }).join('');
    
    // Histórico de Atestados (Incluindo expirados)
    const atestadosAluno = (data.registrosAdministrativos || [])
        .filter(r => todosIds.includes(r.estudanteId) && r.tipo === 'Atestado')
        .sort((a,b) => new Date(b.data) - new Date(a.data));

    const htmlAtestados = atestadosAluno.length > 0 ? `
        <p><strong>Histórico de Atestados:</strong></p>
        <ul style="margin-bottom:15px; padding-left:20px; font-size:13px; color:#2c5282;">
            ${atestadosAluno.map(a => `<li><strong>${formatDate(a.data)}</strong> (${a.dias} dias): ${a.descricao || 'Sem observações'}</li>`).join('')}
        </ul>
    ` : '<p style="font-size:13px; color:#718096; margin-bottom:15px;">Nenhum atestado registrado.</p>';

    document.getElementById('estudanteGeralOcorrencias').innerHTML = `
        <p><strong>Histórico de Matrículas:</strong></p>
        <div style="margin-bottom:15px;">${historicoTurmas}</div>
        
        ${htmlAtestados}
        
        ${ocorrenciasAluno.length > 0 ? `
            <table style="font-size:13px;">
                <thead><tr><th>Data</th><th>Tipo</th><th>Relato</th><th>Autor</th></tr></thead>
                <tbody>
                    ${ocorrenciasAluno.map(o => `
                        <tr style="${o.tipo === 'rapida' ? 'background:#ebf8ff;' : 'background:#fff5f5;'}">
                            <td>${formatDate(o.data)}</td>
                            <td>${o.tipo === 'rapida' ? '⚡ Rápida' : '⚠️ Disciplinar'}</td>
                            <td>${o.relato}</td>
                            <td>${o.autor || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '<p class="empty-state">Nenhuma ocorrência registrada para este estudante (neste perfil).</p>'}
    `;

    // VISIBILIDADE POR PERFIL
    // Gestor vê apenas: Faltas, Atrasos, Ocorrências.
    // Professor vê tudo (Notas, Compensações, etc).
    // ATUALIZAÇÃO: Gestor agora vê TUDO também (Visualização Unificada).
    
    const divNotas = document.getElementById('estudanteGeralNotas');
    const h3Notas = divNotas.previousElementSibling; // Seleciona o título <h3>Notas...
    
    const divComp = document.getElementById('estudanteGeralCompensacoes');
    const h3Comp = divComp.previousElementSibling; // Seleciona o título <h3>Compensações...

    // Garante que tudo esteja visível para Professor e Gestor
    if(h3Notas) h3Notas.style.display = 'block';
    divNotas.style.display = 'block';
    
    if(h3Comp) h3Comp.style.display = 'block';
    divComp.style.display = 'block';
    
    // Preenche com placeholders se estiver vazio (caso o gestor não tenha dados de notas carregados)
    if (!divNotas.innerHTML || divNotas.innerHTML.trim() === '') {
        divNotas.innerHTML = '<p class="empty-state">Sem notas registradas.</p>';
    }
    if (!divComp.innerHTML || divComp.innerHTML.trim() === '') {
        divComp.innerHTML = '<p class="empty-state">Sem compensações.</p>';
    }
}

// --- MAPEAMENTO ---
let estudanteSelecionadoMap = null; // Variável para controlar a seleção interativa

async function renderMapeamento() {
    const container = document.getElementById('tabMapeamento');
    if (!container) return;
    
    container.innerHTML = '<div style="padding:40px; text-align:center; color:#718096;">🔄 Sincronizando mapa da sala...</div>';

    const turma = (data.turmas || []).find(t => t.id == turmaAtual);
    if (!turma) return;
    
    // ID Compartilhado: Se for professor (tem masterId), usa o do gestor. Se for gestor, usa o próprio.
    const sharedTurmaId = turma.masterId || turma.id;

    let mapeamentos = [];
    if (currentUser && currentUser.schoolId) {
        const key = 'maps_school_' + currentUser.schoolId;
        const doc = await getData('app_data', key);
        mapeamentos = (doc && doc.list) ? doc.list : [];
    } else {
        mapeamentos = data.mapeamentos || [];
    }

    let mapeamento = mapeamentos.find(m => m.id_turma == sharedTurmaId);
    
    if (!mapeamento) {
        // Se não existir, cria um layout padrão 6x6 e continua
        mapeamento = { id: Date.now(), id_turma: sharedTurmaId, linhas: 6, colunas: 6, assentos: {} };
        mapeamentos.push(mapeamento);
        if (currentUser && currentUser.schoolId) { await saveData('app_data', 'maps_school_' + currentUser.schoolId, { list: mapeamentos }); } 
        else { data.mapeamentos = mapeamentos; persistirDados(); }
    }

    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual && (!e.status || e.status === 'Ativo')).sort((a,b) => a.nome_completo.localeCompare(b.nome_completo));

    // Grid de Carteiras
    // Nota: "Fileiras" geralmente são colunas verticais na sala de aula.
    let gridHtml = `<div style="display:grid; grid-template-columns: repeat(${mapeamento.colunas}, 1fr); gap:10px; flex-grow:1;">`;
    
    for (let r = 0; r < mapeamento.linhas; r++) {
        for (let c = 0; c < mapeamento.colunas; c++) {
            const key = `${r}-${c}`;
            const estudanteId = mapeamento.assentos[key];
            const estudante = estudantes.find(e => e.id == estudanteId);
            
            // Estilo dinâmico e Atributos de Drag & Drop
            const cursorStyle = estudanteSelecionadoMap ? 'cursor: alias; border-color: #3182ce; background: #ebf8ff;' : (estudanteId ? 'cursor: grab;' : '');
            const dragAttr = estudanteId ? `draggable="true" ondragstart="dragStartMap(event, 'seat', ${estudanteId}, '${key}')" ondragend="dragEndMap(event)"` : '';
            const dropAttr = `ondragover="allowDropMap(event)" ondrop="dropMap(event, '${key}')"`;
            
            // Botão para limpar carteira (já que removemos o select com opção vazio)
            const btnLimpar = estudanteId ? `<div onclick="atribuirLugarMapeamento('${key}', null); event.stopPropagation();" style="position:absolute; top:2px; right:2px; cursor:pointer; color:#e53e3e; font-weight:bold; font-size:12px; line-height:1; padding:2px; z-index:10;" title="Remover aluno">×</div>` : '';
            
            gridHtml += `
                <div class="card-assento" ${dragAttr} ${dropAttr} onclick="clicarAssentoMap('${key}', event)" style="background:white; border:1px solid #cbd5e0; padding:5px; border-radius:6px; text-align:center; min-height:60px; display:flex; flex-direction:column; justify-content:center; box-shadow:0 1px 2px rgba(0,0,0,0.05); position:relative; ${cursorStyle}">
                    ${btnLimpar}
                    <div style="font-size:11px; font-weight:${estudante ? 'bold' : 'normal'}; color:${estudante ? '#2d3748' : '#a0aec0'}; pointer-events:none; user-select:none; padding: 0 5px;">
                        ${estudante ? estudante.nome_completo : '<span style="color:#e2e8f0;">(Vazio)</span>'}
                    </div>
                    <!-- Overlay para capturar clique quando houver seleção -->
                    ${estudanteSelecionadoMap ? `<div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:5;"></div>` : ''}
                    <div style="font-size:9px; color:#cbd5e0; margin-top:2px;">F${c+1}-C${r+1}</div>
                </div>
            `;
        }
    }
    gridHtml += '</div>';

    // Identifica estudantes não mapeados
    const assentosOcupados = Object.values(mapeamento.assentos).map(id => Number(id));
    const estudantesNaoMapeados = estudantes.filter(e => !assentosOcupados.includes(e.id));

    // --- HISTÓRICO DE ALTERAÇÕES ---
    const historico = mapeamento.historico || [];
    // Ordena do mais recente para o mais antigo para exibição
    const historicoExibicao = [...historico].sort((a, b) => b.timestamp - a.timestamp);

    const htmlHistorico = `
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
            <h4 style="color: #2d3748; margin-bottom: 10px;">🕒 Histórico de Alterações</h4>
            <div style="max-height: 150px; overflow-y: auto; background: #f7fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                ${historicoExibicao.length > 0 ? historicoExibicao.map(h => {
                    const dataHora = new Date(h.timestamp).toLocaleString('pt-BR');
                    return `<div style="font-size: 12px; color: #4a5568; margin-bottom: 5px; border-bottom: 1px solid #edf2f7; padding-bottom: 2px;">
                        <strong>${h.autor}</strong> - ${dataHora} <span style="color: #718096;">(${h.qtd} ações)</span>
                    </div>`;
                }).join('') : '<p style="font-size: 12px; color: #a0aec0;">Nenhuma alteração registrada.</p>'}
            </div>
        </div>
    `;

    const html = `
        <style>@media print { .no-print { display: none !important; } }</style>
        <style>.is-dragging select { pointer-events: none !important; opacity: 0.5; } .is-dragging .card-assento { border: 2px dashed #3182ce !important; background: #ebf8ff !important; }</style>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
            <h3 style="margin:0;">🗺️ Mapeamento da Sala</h3>
            <div style="display:flex; gap:5px;">
                <button class="btn btn-sm btn-secondary" onclick="ajustarMapeamento('addLinha')" title="Adicionar Linha (Fundo)">+ Linha</button>
                <button class="btn btn-sm btn-secondary" onclick="ajustarMapeamento('remLinha')" title="Remover Linha">- Linha</button>
                <button class="btn btn-sm btn-secondary" onclick="ajustarMapeamento('addCol')" title="Adicionar Fileira (Lateral)">+ Fileira</button>
                <button class="btn btn-sm btn-secondary" onclick="ajustarMapeamento('remCol')" title="Remover Fileira">- Fileira</button>
                <button class="btn btn-sm btn-danger" onclick="resetarMapeamento()" style="margin-left:10px;">🗑️ Resetar</button>
            </div>
        </div>
        
        <div class="card" style="background:#f7fafc; overflow-x:auto; border:1px solid #e2e8f0; padding: 20px;">
            <div style="background:#2d3748; color:white; padding:5px; text-align:center; border-radius:4px; margin-bottom:15px; font-weight:bold; letter-spacing:1px;">📺 LOUSA (Frente)</div>
            ${gridHtml}
        </div>
        <div class="no-print" style="margin-top:10px; text-align:right;">
            <button class="btn btn-primary" onclick="imprimirMapeamentoSala()">🖨️ Imprimir Mapa</button>
        </div>

        <!-- Controle de Estudantes Não Mapeados -->
        <div class="no-print" style="margin-top: 20px;">
            ${estudantesNaoMapeados.length > 0 ? `
                <div style="padding: 15px; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h4 style="margin:0; color: #c53030;">⚠️ Estudantes sem lugar definido (${estudantesNaoMapeados.length})</h4>
                        ${estudanteSelecionadoMap ? '<span style="font-size:12px; color:#3182ce; font-weight:bold; animation: pulse 1s infinite;">👈 Clique em uma carteira acima para sentar o aluno</span>' : '<span style="font-size:11px; color:#718096;">Clique no nome para selecionar e depois clique na carteira</span>'}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${estudantesNaoMapeados.map(e => {
                            const isSelected = estudanteSelecionadoMap == e.id;
                            const style = isSelected 
                                ? 'background:#3182ce; color:white; border:1px solid #2c5282; box-shadow: 0 0 5px rgba(66,153,225,0.5); transform: scale(1.05);' 
                                : 'background:white; color:#c53030; border:1px solid #fc8181; cursor:pointer;';
                            
                            return `<div draggable="true" ondragstart="dragStartMap(event, 'list', ${e.id})" ondragend="dragEndMap(event)" onclick="toggleSelecaoMap(${e.id})" style="padding:4px 12px; border-radius:15px; font-size:12px; transition:all 0.2s; display:flex; align-items:center; ${style}">
                                👤 ${e.nome_completo}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            ` : `
                <div style="padding: 15px; background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 8px; text-align:center; color: #2f855a; font-weight:bold;">
                    ✅ Todos os estudantes ativos estão mapeados!
                </div>
            `}
        </div>
        ${htmlHistorico}
        <style>
            @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        </style>
    `;
    
    container.innerHTML = html;
}

function toggleSelecaoMap(id) {
    if (estudanteSelecionadoMap == id) {
        estudanteSelecionadoMap = null; // Desmarcar
    } else {
        estudanteSelecionadoMap = id; // Marcar
    }
    renderMapeamento(); // Atualiza visualmente
}

function clicarAssentoMap(coord, event) {
    if (estudanteSelecionadoMap) {
        atribuirLugarMapeamento(coord, estudanteSelecionadoMap);
        estudanteSelecionadoMap = null; // Limpa seleção após atribuir
    }
}

// --- FUNÇÕES DE DRAG & DROP ---
function dragStartMap(ev, type, id, coord) {
    // Salva dados do arrasto: tipo (lista/assento), ID do aluno e coordenada de origem (se houver)
    ev.dataTransfer.setData("text/plain", JSON.stringify({type, id, coord}));
    ev.dataTransfer.effectAllowed = "move";
    document.body.classList.add('is-dragging');
}

function dragEndMap(ev) {
    document.body.classList.remove('is-dragging');
}

function allowDropMap(ev) {
    ev.preventDefault(); // Necessário para permitir o drop
    ev.dataTransfer.dropEffect = "move";
}

async function dropMap(ev, targetCoord) {
    ev.preventDefault();
    document.body.classList.remove('is-dragging');
    const dataStr = ev.dataTransfer.getData("text/plain");
    if (!dataStr) return;
    
    let dragData;
    try { dragData = JSON.parse(dataStr); } catch(e) { return; }

    const { type, id, coord: sourceCoord } = dragData;
    const sourceId = Number(id);
    
    // Carrega dados do mapa
    const turma = (data.turmas || []).find(t => t.id == turmaAtual);
    if (!turma) return;
    const sharedTurmaId = turma.masterId || turma.id;

    let mapeamentos = [];
    if (currentUser && currentUser.schoolId) {
        const key = 'maps_school_' + currentUser.schoolId;
        const doc = await getData('app_data', key);
        mapeamentos = (doc && doc.list) ? doc.list : [];
    } else {
        mapeamentos = data.mapeamentos || [];
    }

    const m = mapeamentos.find(x => x.id_turma == sharedTurmaId);
    if (!m) return;

    const targetId = m.assentos[targetCoord];

    // Lógica de Troca/Atribuição
    if (type === 'seat' && sourceCoord === targetCoord) return; // Soltou no mesmo lugar

    if (type === 'list') {
        // Verifica se já está sentado em outro lugar (previne duplicação)
        let oldCoord = null;
        for (const [k, v] of Object.entries(m.assentos)) {
            if (v == sourceId) { oldCoord = k; break; }
        }
        if (oldCoord) delete m.assentos[oldCoord];

        // Da Lista -> Carteira (Se ocupada, sobrescreve/troca implicitamente)
        m.assentos[targetCoord] = sourceId;
    } else if (type === 'seat') {
        // Carteira -> Carteira
        if (targetId) {
            // Troca (Swap)
            m.assentos[sourceCoord] = targetId;
            m.assentos[targetCoord] = sourceId;
        } else {
            // Move (Livre)
            delete m.assentos[sourceCoord];
            m.assentos[targetCoord] = sourceId;
        }
    }

    // Atualiza histórico
    atualizarHistoricoMapa(m);

    // Salva
    if (currentUser && currentUser.schoolId) {
        await saveData('app_data', 'maps_school_' + currentUser.schoolId, { list: mapeamentos });
    } else {
        data.mapeamentos = mapeamentos;
        persistirDados();
    }
    renderMapeamento();
}

async function imprimirMapeamentoSala() {
    // 1. Get Data
    const turma = (data.turmas || []).find(t => t.id == turmaAtual);
    if (!turma) return alert('Turma não encontrada.');

    const sharedTurmaId = turma.masterId || turma.id;

    let mapeamentos = [];
    if (currentUser && currentUser.schoolId) {
        const key = 'maps_school_' + currentUser.schoolId;
        const doc = await getData('app_data', key);
        mapeamentos = (doc && doc.list) ? doc.list : [];
    } else {
        mapeamentos = data.mapeamentos || [];
    }

    const mapeamento = mapeamentos.find(m => m.id_turma == sharedTurmaId);
    if (!mapeamento) return alert('Nenhum mapeamento encontrado para esta turma.');

    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual && (!e.status || e.status === 'Ativo'));

    // 2. Build HTML for printing
    let gridHtml = `<div style="display:grid; grid-template-columns: repeat(${mapeamento.colunas}, 1fr); gap:10px;">`;
    for (let r = 0; r < mapeamento.linhas; r++) {
        for (let c = 0; c < mapeamento.colunas; c++) {
            const key = `${r}-${c}`;
            const estudanteId = mapeamento.assentos[key];
            const estudante = estudantes.find(e => e.id == estudanteId);
            
            gridHtml += `
                <div style="border: 1px solid #333; padding: 5px; border-radius: 4px; text-align: center; min-height: 60px; display: flex; flex-direction: column; justify-content: center; page-break-inside: avoid;">
                    <div style="font-size: 10px; font-weight: ${estudante ? 'bold' : 'normal'}; color: ${estudante ? '#000' : '#aaa'};">
                        ${estudante ? estudante.nome_completo : '(Vazio)'}
                    </div>
                </div>
            `;
        }
    }
    gridHtml += '</div>';

    const printHtml = `
        <html>
        <head>
            <title>Mapeamento - ${turma.nome}</title>
            <style>
                @page { size: A4 landscape; margin: 1cm; }
                body { font-family: Arial, sans-serif; }
                h1 { text-align: center; margin-bottom: 20px; font-size: 18px; }
                .lousa { background: #333; color: white; padding: 8px; text-align: center; border-radius: 4px; margin-bottom: 20px; font-weight: bold; letter-spacing: 1px; }
            </style>
        </head>
        <body>
            <h1>Mapeamento da Sala - ${turma.nome}</h1>
            <div class="lousa">LOUSA (Frente)</div>
            ${gridHtml}
        </body>
        </html>
    `;

    // 3. Open print window
    const janela = window.open('', '', 'width=1123,height=794');
    janela.document.write(printHtml);
    janela.document.write('<script>window.print();</script>');
    janela.document.close();
}

async function ajustarMapeamento(acao) {
    const turma = (data.turmas || []).find(t => t.id == turmaAtual);
    if (!turma) return;
    const sharedTurmaId = turma.masterId || turma.id;

    let mapeamentos = [];
    if (currentUser && currentUser.schoolId) {
        const key = 'maps_school_' + currentUser.schoolId;
        const doc = await getData('app_data', key);
        mapeamentos = (doc && doc.list) ? doc.list : [];
    } else {
        mapeamentos = data.mapeamentos || [];
    }

    const m = mapeamentos.find(x => x.id_turma == sharedTurmaId);
    if (!m) return;
    
    if (acao === 'addLinha') m.linhas++;
    if (acao === 'remLinha' && m.linhas > 1) m.linhas--;
    if (acao === 'addCol') m.colunas++;
    if (acao === 'remCol' && m.colunas > 1) m.colunas--;
    
    // Atualiza histórico
    atualizarHistoricoMapa(m);

    if (currentUser && currentUser.schoolId) {
        await saveData('app_data', 'maps_school_' + currentUser.schoolId, { list: mapeamentos });
    } else {
        data.mapeamentos = mapeamentos;
        persistirDados();
    }
    renderMapeamento();
}

async function atribuirLugarMapeamento(coord, idEstudante) {
    const turma = (data.turmas || []).find(t => t.id == turmaAtual);
    if (!turma) return;
    const sharedTurmaId = turma.masterId || turma.id;

    let mapeamentos = [];
    if (currentUser && currentUser.schoolId) {
        const key = 'maps_school_' + currentUser.schoolId;
        const doc = await getData('app_data', key);
        mapeamentos = (doc && doc.list) ? doc.list : [];
    } else {
        mapeamentos = data.mapeamentos || [];
    }

    const m = mapeamentos.find(x => x.id_turma == sharedTurmaId);
    if (!m) return;
    
    const novoId = idEstudante ? Number(idEstudante) : null;
    
    // Verifica se o estudante já está em outro lugar
    let coordAntiga = null;
    if (novoId) {
        for (const [key, val] of Object.entries(m.assentos)) {
            if (val == novoId && key !== coord) {
                coordAntiga = key;
                break;
            }
        }
    }
    
    const ocupanteAtual = m.assentos[coord];
    
    if (coordAntiga) {
        // Estudante já sentado em outro lugar
        if (ocupanteAtual) {
            // Troca (Swap)
            if (confirm('Este estudante já está sentado em outro lugar. Deseja trocar os dois de lugar?')) {
                m.assentos[coordAntiga] = ocupanteAtual;
                m.assentos[coord] = novoId;
            } else {
                renderMapeamento(); // Reverte visualmente
                return;
            }
        } else {
            // Move
            if (confirm('Mover estudante para este novo lugar?')) {
                delete m.assentos[coordAntiga];
                m.assentos[coord] = novoId;
            } else {
                renderMapeamento(); // Reverte
                return;
            }
        }
    } else {
        // Apenas atribui (sobrescreve se tiver alguém)
        if (novoId) {
            m.assentos[coord] = novoId;
        } else {
            delete m.assentos[coord];
        }
    }
    
    // Atualiza histórico
    atualizarHistoricoMapa(m);

    if (currentUser && currentUser.schoolId) {
        await saveData('app_data', 'maps_school_' + currentUser.schoolId, { list: mapeamentos });
    } else {
        data.mapeamentos = mapeamentos;
        persistirDados();
    }
    renderMapeamento();
}

async function resetarMapeamento() {
    if (!confirm('Isso apagará todo o layout e as posições. Continuar?')) return;

    const turma = (data.turmas || []).find(t => t.id == turmaAtual);
    if (!turma) return;
    const sharedTurmaId = turma.masterId || turma.id;

    let mapeamentos = [];
    if (currentUser && currentUser.schoolId) {
        const key = 'maps_school_' + currentUser.schoolId;
        const doc = await getData('app_data', key);
        mapeamentos = (doc && doc.list) ? doc.list : [];
    } else {
        mapeamentos = data.mapeamentos || [];
    }

    mapeamentos = mapeamentos.filter(m => m.id_turma != sharedTurmaId);
    // Nota: Ao resetar (excluir), o histórico também é perdido pois faz parte do objeto do mapa.
    // Se quiser manter o histórico mesmo resetando o layout, precisaria salvar o histórico separado ou recriar o objeto mapa vazio mantendo o histórico.
    // Neste caso, o reset apaga tudo conforme o alerta.
    
    if (currentUser && currentUser.schoolId) {
        await saveData('app_data', 'maps_school_' + currentUser.schoolId, { list: mapeamentos });
    } else {
        data.mapeamentos = mapeamentos;
        persistirDados();
    }
    renderMapeamento();
}

// Função auxiliar para agrupar histórico de alterações no mapa
function atualizarHistoricoMapa(m) {
    if (!m.historico) m.historico = [];
    
    const now = Date.now();
    const TEMPO_AULA_MS = 50 * 60 * 1000; // 50 minutos
    const autor = currentUser.nome;
    
    // Pega o último registro (assumindo ordem cronológica de inserção)
    const last = m.historico.length > 0 ? m.historico[m.historico.length - 1] : null;

    // Verifica se é o mesmo autor e se está dentro do intervalo de tempo
    if (last && last.autor === autor && (now - last.timestamp) < TEMPO_AULA_MS) {
        // Agrupa: atualiza o timestamp para o momento atual e incrementa contador
        last.timestamp = now;
        last.qtd = (last.qtd || 1) + 1;
    } else {
        // Novo registro
        m.historico.push({
            autor: autor,
            timestamp: now,
            qtd: 1
        });
    }
}

// --- GRADE HORÁRIA (PROFESSOR) ---
async function renderGradeHorariaProfessor() {
    const container = document.getElementById('containerGradeHoraria');
    container.innerHTML = '<p>Carregando grade da escola...</p>';

    // 1. Buscar a Grade configurada pelo Gestor (Dados da Escola)
    let gradeEscola = [];
    let tiposFixos = [];
    
    // Debug: Ajuda a verificar se o usuário está vinculado à escola correta
    console.log(`[Grade] Renderizando para: ${currentUser.email} | Escola ID: ${currentUser.schoolId}`);

    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        
        if (gestorData && gestorData.gradeHoraria) {
            gradeEscola = gestorData.gradeHoraria;
            tiposFixos = gestorData.tiposHorarioFixo || [];
            console.log(`[Grade] Encontrados ${gradeEscola.length} blocos de horário.`);
        } else {
            console.warn(`[Grade] Nenhum dado encontrado na chave: ${key}`);
        }
    }

    if (gradeEscola.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>A gestão ainda não configurou a grade de horários.</p>
                <p style="font-size:12px; color:#666;">Verifique se sua conta está vinculada à escola correta (ID: ${currentUser ? currentUser.schoolId : 'N/A'}).</p>
            </div>`;
        return;
    }

    // 2. Renderizar a Grade
    const dias = {1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta'};
    const turmas = data.turmas || [];
    const minhasAulas = data.horariosAulas || []; // Onde salvamos as escolhas do professor

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <p style="color:#718096; font-size:14px; margin:0;">Configure sua disponibilidade semanal.</p>
            <button class="btn btn-secondary" onclick="imprimirAgendaMensal()">🖨️ Imprimir Agenda Mensal</button>
        </div>
        <div class="grid" style="grid-template-columns: repeat(5, 1fr); gap: 15px; align-items: start;">
    `;

    for (let d = 1; d <= 5; d++) {
        const blocosDia = gradeEscola.filter(g => g.diaSemana == d).sort((a,b) => a.inicio.localeCompare(b.inicio));
        
        html += `<div style="background:white; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e2e8f0; overflow:hidden;">
            <div style="background:#f7fafc; padding:8px 0; text-align:center; font-weight:bold; color:#2d3748; font-size:14px; border-bottom:1px solid #edf2f7;">${dias[d]}</div>
            <div style="padding:10px;">
            ${blocosDia.map(bloco => {
                const aulaSalva = minhasAulas.find(a => a.id_bloco == bloco.id);
                
                // VERIFICAÇÃO DE BLOCO FIXO (GESTOR)
                if (bloco.tipo && bloco.tipo !== '') {
                    // Tenta achar no dinâmico, senão usa hardcoded
                    let label = bloco.tipo.toUpperCase();
                    const tipoObj = tiposFixos.find(t => t.id === bloco.tipo);
                    if (tipoObj) label = tipoObj.nome;
                    else if ({
                        'tutoria': '🎓 Tutoria', 'almoco': '🍽️ Almoço', 'cafe': '☕ Café',
                        'atpca': '📚 ATPCA', 'apcg': '📝 APCG', 'reuniao': '🤝 Reunião'
                    }[bloco.tipo]) label = { 'tutoria': '🎓 Tutoria', 'almoco': '🍽️ Almoço', 'cafe': '☕ Café', 'atpca': '📚 ATPCA', 'apcg': '📝 APCG', 'reuniao': '🤝 Reunião' }[bloco.tipo];
                    
                    return `
                        <div style="background:#edf2f7; padding:8px; margin-bottom:8px; border-radius:6px; border-left:3px solid #cbd5e0; opacity: 0.8;">
                            <div style="font-size:10px; color:#718096; margin-bottom:2px;">${bloco.inicio} - ${bloco.fim}</div>
                            <div style="font-size:12px; font-weight:bold; color:#4a5568;">🔒 ${label}</div>
                        </div>
                    `;
                }
                
                // Determina o valor selecionado (ID da turma ou tipo especial)
                let valorSelecionado = '';
                // Rótulo: Apenas leitura (Definido pelo Gestor)
                const labelDisplay = bloco.label || '';

                if (aulaSalva) {
                    valorSelecionado = (['tutoria', 'estudo', 'apcg', 'atpca', 'reuniao', 'almoco', 'cafe', 'ped_presenc', 'eletiva'].includes(aulaSalva.tipo)) ? aulaSalva.tipo : aulaSalva.id_turma;
                }
                const descricao = (aulaSalva && (aulaSalva.tipo === 'estudo' || aulaSalva.tipo === 'reuniao')) ? (aulaSalva.tema || '') : '';

                // Estilo dinâmico baseado na seleção
                let borderLeftColor = 'transparent';
                let bgStyle = 'background: #fff;';
                if (valorSelecionado) {
                    borderLeftColor = '#3182ce'; // Azul se tiver algo selecionado
                    bgStyle = 'background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05);';
                } else {
                    bgStyle = 'background: #fff; border: 1px dashed #e2e8f0;';
                }

                return `
                    <div style="${bgStyle} padding:8px; margin-bottom:8px; border-radius:6px; border-left: 3px solid ${borderLeftColor}; transition: all 0.2s;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <div style="font-size:10px; color:#a0aec0; font-weight:600;">${bloco.inicio} - ${bloco.fim}</div>
                            ${labelDisplay ? `<div style="font-size:10px; font-weight:bold; color:#4a5568; background:#edf2f7; padding:1px 4px; border-radius:3px;">${labelDisplay}</div>` : ''}
                        </div>
                        
                        <select style="width:100%; border:none; background:transparent; font-size:12px; color:#2d3748; font-weight:600; cursor:pointer; outline:none; padding:0;" onchange="salvarAulaGrade('${bloco.id}', this.value)">
                            <option value="" style="color:#a0aec0;">-- Selecionar --</option>
                            <optgroup label="Turmas">
                                ${turmas.map(t => `<option value="${t.id}" ${t.id == valorSelecionado ? 'selected' : ''}>${t.nome} - ${t.disciplina || ''}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Outros">
                                <option value="tutoria" ${valorSelecionado === 'tutoria' ? 'selected' : ''}>Tutoria</option>
                                <option value="estudo" ${valorSelecionado === 'estudo' ? 'selected' : ''}>Estudo</option>
                                <option value="apcg" ${valorSelecionado === 'apcg' ? 'selected' : ''}>APCG</option>
                                <option value="atpca" ${valorSelecionado === 'atpca' ? 'selected' : ''}>ATPCA</option>
                                <option value="reuniao" ${valorSelecionado === 'reuniao' ? 'selected' : ''}>Reunião</option>
                                <option value="almoco" ${valorSelecionado === 'almoco' ? 'selected' : ''}>Almoço</option>
                                <option value="cafe" ${valorSelecionado === 'cafe' ? 'selected' : ''}>Café</option>
                                <option value="ped_presenc" ${valorSelecionado === 'ped_presenc' ? 'selected' : ''}>Ped. Presenç</option>
                                <option value="eletiva" ${valorSelecionado === 'eletiva' ? 'selected' : ''}>Eletiva</option>
                            </optgroup>
                        </select>
                        ${(valorSelecionado === 'estudo' || valorSelecionado === 'reuniao') ? `
                            <input type="text" placeholder="${valorSelecionado === 'estudo' ? 'Tema do estudo...' : 'Descrição da reunião...'}" value="${descricao}" 
                                style="width:100%; margin-top:4px; font-size:11px; padding:2px 0; border:none; border-bottom:1px solid #e2e8f0; background:transparent; outline:none;"
                                onblur="salvarDescricaoAula('${bloco.id}', this.value)">
                        ` : ''}
                    </div>
                `;
            }).join('')}
            </div>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function salvarAulaGrade(blocoId, valor) {
    if (!data.horariosAulas) data.horariosAulas = [];
    
    // Remove registro anterior desse bloco (comparação solta para string/number)
    data.horariosAulas = data.horariosAulas.filter(a => a.id_bloco != blocoId);
    
    if (valor) {
        const novo = {
            id: Date.now() + Math.random(),
            id_bloco: Number(blocoId), // Garante formato numérico
            tipo: 'aula', // default
            id_turma: null,
            tema: ''
        };

        if (['tutoria', 'estudo', 'apcg', 'atpca', 'reuniao', 'almoco', 'cafe', 'ped_presenc', 'eletiva'].includes(valor)) {
            novo.tipo = valor;
        } else {
            novo.tipo = 'aula';
            novo.id_turma = valor;
        }
        data.horariosAulas.push(novo);
    }
    persistirDados();
    renderGradeHorariaProfessor(); // Re-renderiza para mostrar/esconder o campo de tema
}

function salvarDescricaoAula(blocoId, texto) {
    // Comparação solta (==) para garantir compatibilidade string/number
    const aula = (data.horariosAulas || []).find(a => a.id_bloco == blocoId);
    if (aula && (aula.tipo === 'estudo' || aula.tipo === 'reuniao')) {
        aula.tema = texto;
        persistirDados();
    }
}

async function renderRegistrosProfessor() {
    // Garante que o container da tela existe
    if (!document.getElementById('registrosProfessor')) {
        const div = document.createElement('div');
        div.id = 'registrosProfessor';
        div.className = 'screen';
        document.querySelector('#appContainer .container').appendChild(div);
    }

    const screen = document.getElementById('registrosProfessor');
    screen.innerHTML = '<div class="card"><p>Carregando registros da gestão...</p></div>';

    let registros = [];
    let estudantes = [];
    let turmas = [];

    // Busca dados da escola (Gestor)
    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        if (gestorData) {
            registros = gestorData.registrosAdministrativos || [];
            estudantes = gestorData.estudantes || [];
            turmas = gestorData.turmas || [];
        }
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    // Filtra e processa
    let lista = registros.map(r => {
        const est = estudantes.find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
        const turma = turmas.find(t => t.id == r.turmaId) || { nome: '?' };
        
        let cor = '#22c55e'; // Verde (Observação/Outros)

        if (r.tipo === 'Atestado') {
            const parts = r.data.split('-');
            const dataInicio = new Date(parts[0], parts[1]-1, parts[2]);
            const dataFim = new Date(dataInicio);
            dataFim.setDate(dataFim.getDate() + (parseInt(r.dias) || 1) - 1);
            
            if (today > dataFim) return null; // Oculta vencidos
            cor = '#3182ce'; // Azul
        } else if (r.tipo === 'Faltoso') {
            cor = '#ef4444'; // Vermelho
        }

        return { ...r, estudanteNome: est.nome_completo, turmaNome: turma.nome, cor };
    }).filter(item => item !== null);

    // Agrupa por Turma
    const grupos = {};
    lista.forEach(item => {
        if (!grupos[item.turmaNome]) grupos[item.turmaNome] = [];
        grupos[item.turmaNome].push(item);
    });
    const turmasOrdenadas = Object.keys(grupos).sort();

    const html = `
        <div class="card">
            <h2>📂 Registros da Gestão (Faltas/Atestados)</h2>
            <div style="margin-top: 20px;">
                ${lista.length > 0 ? `
                    ${turmasOrdenadas.map(turmaNome => `
                        <h3 style="margin-top: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; color: #2d3748;">${turmaNome}</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Estudante</th>
                                    <th>Data/Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${grupos[turmaNome].map(r => `
                                    <tr>
                                        <td style="color: ${r.cor}; font-weight: bold;">${r.tipo}</td>
                                        <td>${r.estudanteNome}</td>
                                        <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''} ${r.descricao ? `<br><small>${r.descricao}</small>` : ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `).join('')}
                ` : '<p class="empty-state">Nenhum registro vigente encontrado.</p>'}
            </div>
        </div>
    `;
    screen.innerHTML = html;
}

// --- AVISOS MURAL (GESTOR) ---
function abrirModalNovoAviso() {
    const turmas = data.turmas || [];
    const container = document.getElementById('listaTurmasAviso');
    
    container.innerHTML = `
        <label style="font-weight:bold; margin-bottom:5px; display:block;">
            <input type="checkbox" onchange="toggleTodasTurmasAviso(this)"> Selecionar Todas
        </label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; max-height:150px; overflow-y:auto; border:1px solid #eee; padding:5px;">
            ${turmas.map(t => `
                <label style="font-size:12px;">
                    <input type="checkbox" class="chk-turma-aviso" value="${t.id}"> ${t.nome}
                </label>
            `).join('')}
        </div>
    `;
    
    document.getElementById('textoNovoAviso').value = '';
    showModal('modalNovoAviso');
}

function toggleTodasTurmasAviso(source) {
    const checkboxes = document.querySelectorAll('.chk-turma-aviso');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

function salvarAviso() {
    const texto = document.getElementById('textoNovoAviso').value;
    const checkboxes = document.querySelectorAll('.chk-turma-aviso:checked');
    const todasCheckbox = document.querySelector('input[onchange="toggleTodasTurmasAviso(this)"]');
    
    if (!texto) return alert('Digite o aviso.');
    if (checkboxes.length === 0) return alert('Selecione pelo menos uma turma.');

    const turmasAlvo = todasCheckbox.checked ? ['todas'] : Array.from(checkboxes).map(cb => cb.value);

    if (!data.avisosMural) data.avisosMural = [];
    data.avisosMural.push({
        id: Date.now(),
        texto,
        data: getTodayString(),
        turmasAlvo
    });

    persistirDados();
    closeModal('modalNovoAviso');
    renderDashboard(); // Atualiza o card no dashboard
}

function excluirAviso(id) {
    if(!confirm('Excluir este aviso?')) return;
    data.avisosMural = data.avisosMural.filter(a => a.id !== id);
    persistirDados();
    renderDashboard();
}