// --- LÓGICA PRINCIPAL (PROFESSOR/APP) ---

function iniciarApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('adminContainer').style.display = 'none';
    
    // Carregar dados
    carregarDadosUsuario().then(async () => {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        
        let roleLabel = 'Painel do Professor';
        if (currentUser.role === 'gestor') roleLabel = 'Painel do Gestor';

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

        if (currentUser.role === 'gestor') {
            renderGestorPanel();
        } else {
            renderProfessorPanel();
        }
    });
}

function renderProfessorPanel() {
    const nav = document.querySelector('nav');
    nav.innerHTML = `
        <button class="active" onclick="showScreen('dashboard', event)"><span class="icon">📊</span><span class="label">Dashboard</span></button>
        <button onclick="showScreen('turmas', event)"><span class="icon">👥</span><span class="label">Turmas</span></button>
        <button onclick="showScreen('tutoria', event)"><span class="icon">🎓</span><span class="label">Tutoria</span></button>
        <button onclick="showScreen('agenda', event)"><span class="icon">📅</span><span class="label">Agenda</span></button>
    `;
    renderDashboard();
    showScreen('dashboard');
}

function showScreen(screenId, evt) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
    
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }

    if (screenId === 'dashboard') renderDashboard();
    if (screenId === 'turmas') renderTurmas();
    if (screenId === 'tutoria') renderTutoria();
    if (screenId === 'agenda') renderAgenda();
    if (screenId === 'registrosGestor') renderRegistrosGestor();
    if (screenId === 'ocorrenciasGestor') renderOcorrenciasGestor();
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
    if (currentUser && currentUser.role === 'gestor') {
        const ocorrencias = (data.ocorrencias || []);
        const registros = (data.registrosAdministrativos || []);
        const eventosHoje = (data.eventos || []).filter(e => e.data === today);

        dashboardContainer.innerHTML = `
            <div class="grid">
                <div class="card">
                    <h2>⚠️ Ocorrências</h2>
                    <div style="font-size: 24px; font-weight: bold; color: #e53e3e;">
                        ${ocorrencias.length} <span style="font-size:14px; color:#718096; font-weight:normal;">registradas</span>
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
                <div class="card">
                    <h2>🤝 Reuniões de Hoje</h2>
                    <div id="reunioesHoje"></div>
                </div>
            </div>
            <div class="card" style="margin-top: 20px;">
                <h2>📊 Resumo da Escola</h2>
                <p>Total de Turmas: ${(data.turmas || []).length}</p>
                <p>Total de Estudantes: ${(data.estudantes || []).length}</p>
            </div>
        `;

        // Renderizar Eventos para Gestor
        const eventosHtml = eventosHoje.length > 0 ? eventosHoje.map(e => 
            `<div class="alert alert-info">${e.hora_inicio} - ${e.descricao}</div>`
        ).join('') : '<p class="empty-state">Sem reuniões hoje</p>';
        document.getElementById('reunioesHoje').innerHTML = eventosHtml;
        
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
        <div class="card">
            <h2>⚠️ Alertas</h2>
            <div id="alertas"></div>
        </div>
    `;

    // Agenda do Dia (Baseada na Grade)
    const gradeEscola = await getGradeEscola();
    const diaSemanaHoje = new Date().getDay(); // 0=Dom, 1=Seg...
    
    // Filtra blocos do dia atual
    const blocosHoje = gradeEscola.filter(g => g.diaSemana == diaSemanaHoje).sort((a,b) => a.inicio.localeCompare(b.inicio));
    const minhasAulas = data.horariosAulas || [];

    let agendaHtml = '';
    if (blocosHoje.length === 0) {
        agendaHtml = '<p class="empty-state">Sem grade configurada para hoje.</p>';
    } else {
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
            } else {
                // Estudo, Reunião, APCG, etc.
                return `<div class="alert alert-info" style="margin-bottom:5px;">
                    <strong>${bloco.inicio}</strong> - ${aula.tipo.toUpperCase()} ${aula.tema ? '('+aula.tema+')' : ''}
                </div>`;
            }
        }).join('');
    }
    document.getElementById('agendaHoje').innerHTML = agendaHtml;

    // Tutorias Hoje (Mantido)
    const tutoriasHoje = []; // Placeholder se quiser listar agendamentos específicos
    document.getElementById('tutoriasHoje').innerHTML = tutoriasHoje.length > 0 ? '' : '<p class="empty-state">Nenhum agendamento específico.</p>';

    // Alertas
    let alertas = [];
    const atrasosHoje = (data.atrasos || []).filter(a => a.data === today);
    if (atrasosHoje.length > 0) alertas.push(`<div class="alert alert-warning">${atrasosHoje.length} atrasos hoje</div>`);
    if (alertas.length === 0) alertas.push('<div class="alert alert-success">Tudo tranquilo!</div>');
    document.getElementById('alertas').innerHTML = alertas.join('');
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
    document.getElementById('listaTurmas').innerHTML = html || '<p class="empty-state">Nenhuma turma.</p>';
}

async function abrirModalNovaTurma() {
    document.getElementById('turmaId').value = '';
    document.getElementById('turmaAno').value = '';
    document.getElementById('turmaDisciplina').value = '';
    document.getElementById('tituloModalTurma').textContent = 'Nova Turma';
    
    // Gestor define apenas Ano/Série; Professor define Disciplina
    if (currentUser && currentUser.role === 'gestor') {
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
        
        if (currentUser && currentUser.role === 'gestor') {
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

    if (currentUser.role === 'gestor') {
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
    if (currentUser.role !== 'gestor' && turma.masterId && currentUser.schoolId) {
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
            
            persistirDados(); // Salva a atualização localmente
        }
    }
    
    // Setup Tabs
    const nav = document.querySelector('#turmaDetalhe nav');
    nav.innerHTML = `
        <button class="btn btn-secondary active" onclick="showTurmaTab('estudantes', event)">👥 Estudantes</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('chamada', event)">✅ Chamada</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('atrasos', event)">⏰ Atrasos</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('trabalhos', event)">📝 Trabalhos</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('ocorrencias', event)">⚠️ Ocorrências</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('mapeamento', event)">🗺️ Mapeamento</button>
    `;
    
    showScreen('turmaDetalhe');
    showTurmaTab('estudantes');
}

function showTurmaTab(tab, evt) {
    document.querySelectorAll('.turma-tab').forEach(t => t.style.display = 'none');
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).style.display = 'block';
    
    if (evt) {
        document.querySelectorAll('#turmaDetalhe nav button').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');
    }

    if (tab === 'estudantes') renderEstudantes();
    if (tab === 'chamada') renderChamada();
    if (tab === 'ocorrencias') {
        tempOcorrenciaIds = []; // Reseta seleção ao entrar na aba
        renderOcorrencias();
    }
    if (tab === 'atrasos') renderAtrasos();
    if (tab === 'trabalhos') renderTrabalhos();
    if (tab === 'mapeamento') renderMapeamento();
}

function renderEstudantes() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    const isGestor = currentUser && currentUser.role === 'gestor';
    
    const html = `
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
    statusSelect.disabled = (currentUser && currentUser.role !== 'gestor');
    
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
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    
    // Validação de Dia de Aula
    const gradeEscola = await getGradeEscola();
    const minhasAulas = (data.horariosAulas || []).filter(a => a.id_turma == turmaAtual);
    const blocosTurma = gradeEscola.filter(g => minhasAulas.some(a => a.id_bloco == g.id));
    const diasPermitidos = [...new Set(blocosTurma.map(g => g.diaSemana))]; // Ex: [1, 3, 5]

    const html = `
        <div class="form-row">
            <label>Data: <input type="date" id="chamadaData" value="${getTodayString()}" onchange="validarDataChamada([${diasPermitidos}])"></label>
            <button class="btn btn-success" id="btnSalvarChamada" onclick="salvarChamadaManual()">Salvar Chamada</button>
        </div>
        <div id="avisoChamada" style="color:#e53e3e; display:none; margin-bottom:10px; font-weight:bold;">⚠️ Esta turma não tem aula agendada para este dia da semana.</div>
        <table>
            <thead><tr><th>Estudante</th><th>Presença</th></tr></thead>
            <tbody>
                ${estudantes.map(e => `
                    <tr>
                        <td>${e.nome_completo}</td>
                        <td><input type="checkbox" class="presenca-check" data-id="${e.id}" checked></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
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

// --- OCORRÊNCIAS ---
let tempOcorrenciaIds = []; // Variável temporária para armazenar seleção

function renderOcorrencias() {
    const ocorrencias = (data.ocorrencias || []).filter(o => o.id_turma == turmaAtual);
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);

    // Filtra estudantes disponíveis e selecionados
    const disponiveis = estudantes.filter(e => !tempOcorrenciaIds.includes(e.id));
    const selecionados = estudantes.filter(e => tempOcorrenciaIds.includes(e.id));

    // Preserva o texto digitado caso haja re-renderização
    const textoAtual = document.getElementById('novaOcorrenciaTexto') ? document.getElementById('novaOcorrenciaTexto').value : '';

    const html = `
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

            return `
            <div class="card" style="background:#fff5f5; margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between;">
                    <small style="font-weight:bold;">${formatDate(o.data)}</small>
                    <div>
                        <button class="btn btn-sm btn-secondary" onclick="imprimirOcorrencia(${o.id})">🖨️ Imprimir</button>
                        <button class="btn btn-sm btn-danger" onclick="removerOcorrencia(${o.id})">🗑️</button>
                    </div>
                </div>
                <p style="margin: 5px 0; font-size: 13px; color: #c53030;"><strong>Envolvidos:</strong> ${nomes || 'Nenhum selecionado'}</p>
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

function salvarOcorrencia() {
    const texto = document.getElementById('novaOcorrenciaTexto').value;
    const ids = tempOcorrenciaIds;

    if (!texto) return alert('Descreva a ocorrência.');
    
    if (!data.ocorrencias) data.ocorrencias = [];
    data.ocorrencias.push({
        id: Date.now(),
        id_turma: turmaAtual,
        data: getTodayString(),
        relato: texto,
        ids_estudantes: ids
    });
    persistirDados();
    
    // Limpa estado
    tempOcorrenciaIds = [];
    document.getElementById('novaOcorrenciaTexto').value = '';
    renderOcorrencias();
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

// --- TUTORIA ---
let agendaLimit = 10; // Controle de paginação da agenda

function renderTutoria() {
    const tutorados = data.tutorados || [];
    
    // 1. Botões Superiores
    const htmlTop = `
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button class="btn btn-primary" onclick="abrirModalNovoTutorado()">+ Novo Tutorado</button>
            <button class="btn btn-success" onclick="showModal('modalNovoEncontro')">Registrar Encontro</button>
        </div>
    `;

    // 2. Lista de Tutorados
    const htmlTutorados = tutorados.length > 0 ? `
        <table>
            <thead><tr><th>Nome</th><th>Turma</th></tr></thead>
            <tbody>
                ${tutorados.map(t => `
                    <tr>
                        <td><a href="#" onclick="abrirFichaTutorado(${t.id})">${t.nome_estudante}</a></td>
                        <td>${t.turma}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p class="empty-state">Nenhum tutorado.</p>';
    
    document.getElementById('listaTutorados').innerHTML = htmlTop + htmlTutorados;

    // 3. Seção de Agendamento e Controles
    const agendamentos = (data.agendamentos || []).sort((a,b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio));
    const today = getTodayString();
    const futuros = agendamentos.filter(a => a.data >= today);

    const htmlAgendaControls = `
        <div class="card" style="background: #f0fff4; margin-bottom: 15px; border: 1px solid #c6f6d5;">
            <h3 style="margin-top:0; font-size:16px;">Agendamento Rápido</h3>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <select id="selAgendarTutorado" style="flex-grow:1;">
                    <option value="">Selecione o Tutorado...</option>
                    ${tutorados.map(t => `<option value="${t.id}">${t.nome_estudante}</option>`).join('')}
                </select>
                <button class="btn btn-success" onclick="agendarProximoTutorado()">Agendar</button>
            </div>
        </div>
        
        <div style="margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Próximas Janelas</h3>
            <button class="btn btn-secondary btn-sm" onclick="gerarAgendamentosTutoria()">🔄 Gerar Agenda (6 Meses)</button>
        </div>
    `;

    // 4. Lista de Agenda (Limitada com botão Ampliar)
    const visibleAgenda = futuros.slice(0, agendaLimit);

    const htmlAgendaList = visibleAgenda.length > 0 ? `
        <div style="max-height: 300px; overflow-y: auto;">
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
        <button class="btn btn-danger btn-sm" onclick="desvincularTutorado(${t.id})">Desvincular Tutorado</button>
    `;

    showScreen('tutoradoDetalhe');
}

function desvincularTutorado(id) {
    if (confirm('Tem certeza? O estudante sairá da sua lista, mas os registros de encontros passados serão mantidos.')) {
        data.tutorados = data.tutorados.filter(t => t.id != id);
        persistirDados();
        showScreen('tutoria');
    }
}

async function gerarAgendamentosTutoria() {
    if (!confirm('Gerar janelas de atendimento para os próximos 6 meses baseadas na sua Grade de Horários?')) return;

    const gradeEscola = await getGradeEscola();
    const meusHorarios = data.horariosAulas || [];
    
    // Filtra blocos onde o professor marcou 'tutoria'
    const blocosTutoria = gradeEscola.filter(g => 
        meusHorarios.some(a => a.id_bloco == g.id && a.tipo === 'tutoria')
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
    // Lógica simplificada
    alert('Encontro registrado');
    closeModal('modalNovoEncontro');
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
    document.getElementById('estudanteGeralNome').textContent = nome;
    
    const isGestor = currentUser && currentUser.role === 'gestor';

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
    const ocorrencias = (data.ocorrencias || []).filter(o => {
        // Verifica se o ID do aluno está na lista de envolvidos da ocorrência (se houver) 
        // ou se a ocorrência está ligada à turma e precisamos cruzar dados (simplificado aqui para buscar pelo contexto da turma se necessário, mas idealmente a ocorrência tem ids_estudantes)
        // Assumindo estrutura simples onde ocorrência pode ter ids_estudantes ou ser geral da turma.
        // Se sua estrutura de ocorrência não tem lista de estudantes explícita, essa filtragem pode precisar de ajuste.
        // Vou assumir que filtramos por turma onde ele passou:
        return false; // Placeholder se não houver vínculo direto na ocorrência
    });
    // Como o modelo de dados de ocorrência no código fornecido é simples (id_turma, relato), 
    // vamos listar as turmas por onde ele passou:
    const historicoTurmas = todosRegistrosAluno.map(e => {
        const t = data.turmas.find(turma => turma.id == e.id_turma);
        return `<div class="badge badge-info" style="margin-right:5px;">${t ? t.nome : 'Turma Excluída'} (${e.status})</div>`;
    }).join('');
    
    document.getElementById('estudanteGeralOcorrencias').innerHTML = `
        <p><strong>Histórico de Matrículas:</strong></p>
        <div style="margin-bottom:15px;">${historicoTurmas}</div>
        <p><em>Para ver ocorrências específicas, o sistema buscará em todas as turmas acima.</em></p>
    `;

    // VISIBILIDADE POR PERFIL
    // Gestor vê apenas: Faltas, Atrasos, Ocorrências.
    // Professor vê tudo (Notas, Compensações, etc).
    
    const divNotas = document.getElementById('estudanteGeralNotas');
    const h3Notas = divNotas.previousElementSibling; // Seleciona o título <h3>Notas...
    
    const divComp = document.getElementById('estudanteGeralCompensacoes');
    const h3Comp = divComp.previousElementSibling; // Seleciona o título <h3>Compensações...

    if (isGestor) {
        if(h3Notas) h3Notas.style.display = 'none';
        divNotas.style.display = 'none';
        
        if(h3Comp) h3Comp.style.display = 'none';
        divComp.style.display = 'none';
    } else {
        if(h3Notas) h3Notas.style.display = 'block';
        divNotas.style.display = 'block';
        
        if(h3Comp) h3Comp.style.display = 'block';
        divComp.style.display = 'block';
        
        // Preenche com placeholders ou dados reais do professor
        divNotas.innerHTML = '<p class="empty-state">Sem notas registradas.</p>';
        divComp.innerHTML = '<p class="empty-state">Sem compensações.</p>';
    }
}

// --- MAPEAMENTO ---
function renderMapeamento() {
    document.getElementById('tabMapeamento').innerHTML = `
        <div class="empty-state" style="padding: 50px; text-align: center;">
            <h3>🗺️ Mapeamento de Sala</h3>
            <p>Esta funcionalidade será configurada em breve.</p>
        </div>
    `;
}

// --- GRADE HORÁRIA (PROFESSOR) ---
async function renderGradeHorariaProfessor() {
    const container = document.getElementById('containerGradeHoraria');
    container.innerHTML = '<p>Carregando grade da escola...</p>';

    // 1. Buscar a Grade configurada pelo Gestor (Dados da Escola)
    let gradeEscola = [];
    
    // Debug: Ajuda a verificar se o usuário está vinculado à escola correta
    console.log(`[Grade] Renderizando para: ${currentUser.email} | Escola ID: ${currentUser.schoolId}`);

    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        
        if (gestorData && gestorData.gradeHoraria) {
            gradeEscola = gestorData.gradeHoraria;
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

    let html = '<div class="grid" style="grid-template-columns: repeat(5, 1fr); gap: 10px;">';

    for (let d = 1; d <= 5; d++) {
        const blocosDia = gradeEscola.filter(g => g.diaSemana == d).sort((a,b) => a.inicio.localeCompare(b.inicio));
        
        html += `<div class="card" style="padding:10px;">
            <h3 style="text-align:center; border-bottom:1px solid #eee; margin-bottom:10px;">${dias[d]}</h3>
            ${blocosDia.map(bloco => {
                const aulaSalva = minhasAulas.find(a => a.id_bloco == bloco.id);
                
                // Determina o valor selecionado (ID da turma ou tipo especial)
                let valorSelecionado = '';
                if (aulaSalva) {
                    valorSelecionado = (['tutoria', 'estudo', 'apcg', 'atpca', 'reuniao', 'almoco', 'cafe', 'ped_presenc'].includes(aulaSalva.tipo)) ? aulaSalva.tipo : aulaSalva.id_turma;
                }
                const descricao = (aulaSalva && (aulaSalva.tipo === 'estudo' || aulaSalva.tipo === 'reuniao')) ? (aulaSalva.tema || '') : '';

                return `
                    <div style="background:#f7fafc; padding:8px; margin-bottom:8px; border-radius:4px; border:1px solid #e2e8f0;">
                        <div style="font-size:12px; font-weight:bold; color:#4a5568;">${bloco.inicio} - ${bloco.fim}</div>
                        <select style="width:100%; margin-top:5px; font-size:12px;" onchange="salvarAulaGrade('${bloco.id}', this.value)">
                            <option value="">-- Livre --</option>
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
                            </optgroup>
                        </select>
                        ${(valorSelecionado === 'estudo' || valorSelecionado === 'reuniao') ? `
                            <input type="text" placeholder="${valorSelecionado === 'estudo' ? 'Tema do estudo...' : 'Descrição da reunião...'}" value="${descricao}" 
                                style="width:100%; margin-top:5px; font-size:11px; padding:4px; border:1px solid #cbd5e0; border-radius:3px;"
                                onblur="salvarDescricaoAula('${bloco.id}', this.value)">
                        ` : ''}
                    </div>
                `;
            }).join('')}
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

        if (['tutoria', 'estudo', 'apcg', 'atpca', 'reuniao', 'almoco', 'cafe', 'ped_presenc'].includes(valor)) {
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