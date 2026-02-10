// --- LÓGICA PRINCIPAL (PROFESSOR/APP) ---

function iniciarApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('adminContainer').style.display = 'none';
    
    // Carregar dados
    carregarDadosUsuario().then(() => {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        
        let roleLabel = 'Painel do Professor';
        if (currentUser.role === 'gestor') roleLabel = 'Painel do Gestor';

        document.getElementById('currentDate').textContent = 
            `${today.toLocaleDateString('pt-BR', options)} | Olá, ${currentUser.nome}`;
        
        const subTitle = document.getElementById('painelSubtitle');
        if (subTitle) subTitle.textContent = roleLabel;

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

// --- DASHBOARD ---
function renderDashboard() {
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
                <h2>📅 Aulas de Hoje</h2>
                <div id="aulasHoje"></div>
            </div>
            <div class="card">
                <h2>🤝 Reuniões de Hoje</h2>
                <div id="reunioesHoje"></div>
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

    // Aulas
    const aulasHoje = (data.aulas || []).filter(a => a.data === today);
    const aulasHtml = aulasHoje.length > 0 ? aulasHoje.map(a => {
        const turma = (data.turmas || []).find(t => t.id == a.id_turma);
        return `<div class="btn btn-secondary" style="width:100%; text-align:left; margin-bottom:5px;">
            <strong>${turma ? turma.nome : 'Turma'}</strong> - ${a.conteudo || 'Aula'}
        </div>`;
    }).join('') : '<p class="empty-state">Nenhuma aula hoje</p>';
    document.getElementById('aulasHoje').innerHTML = aulasHtml;

    // Eventos
    const eventosHoje = (data.eventos || []).filter(e => e.data === today);
    const eventosHtml = eventosHoje.length > 0 ? eventosHoje.map(e => 
        `<div class="alert alert-info">${e.hora_inicio} - ${e.descricao}</div>`
    ).join('') : '<p class="empty-state">Sem eventos</p>';
    document.getElementById('reunioesHoje').innerHTML = eventosHtml;

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

function abrirModalNovaTurma() {
    document.getElementById('turmaId').value = '';
    document.getElementById('turmaAno').value = '';
    document.getElementById('turmaDisciplina').value = '';
    document.getElementById('tituloModalTurma').textContent = 'Nova Turma';
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
        showModal('modalNovaTurma');
    }
}

function salvarTurma(e) {
    e.preventDefault();
    const id = document.getElementById('turmaId').value;
    const nome = document.getElementById('turmaAno').value;
    const disciplina = document.getElementById('turmaDisciplina').value;
    const turno = document.getElementById('turmaTurno').value;

    if (id) {
        const t = data.turmas.find(x => x.id == id);
        if (t) { t.nome = nome; t.ano_serie = nome; t.disciplina = disciplina; t.turno = turno; }
    } else {
        if (!data.turmas) data.turmas = [];
        data.turmas.push({ id: Date.now(), nome, ano_serie: nome, disciplina, turno });
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
function abrirTurma(id) {
    turmaAtual = id;
    const turma = data.turmas.find(t => t.id == id);
    document.getElementById('turmaDetalheTitulo').textContent = turma.nome;
    
    // Setup Tabs
    const nav = document.querySelector('#turmaDetalhe nav');
    nav.innerHTML = `
        <button class="btn btn-secondary active" onclick="showTurmaTab('estudantes', event)">Estudantes</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('chamada', event)">Chamada</button>
        <button class="btn btn-secondary" onclick="showTurmaTab('ocorrencias', event)">Ocorrências</button>
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
    if (tab === 'ocorrencias') renderOcorrencias();
}

function renderEstudantes() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    const html = `
        <button class="btn btn-primary btn-sm" onclick="showModal('modalNovoEstudante')">+ Novo Estudante</button>
        <table style="margin-top:10px;">
            <thead><tr><th>Nome</th><th>Ações</th></tr></thead>
            <tbody>
                ${estudantes.map(e => `
                    <tr>
                        <td>${e.nome_completo}</td>
                        <td><button class="btn btn-danger btn-sm" onclick="removerEstudante(${e.id})">🗑️</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    document.getElementById('tabEstudantes').innerHTML = html;
}

function salvarEstudante(e) {
    e.preventDefault();
    const nome = document.getElementById('estudanteNome').value;
    if (!data.estudantes) data.estudantes = [];
    data.estudantes.push({
        id: Date.now(),
        id_turma: turmaAtual,
        nome_completo: nome,
        status: 'Ativo'
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
function renderChamada() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    const html = `
        <div class="form-row">
            <label>Data: <input type="date" id="chamadaData" value="${getTodayString()}"></label>
            <button class="btn btn-success" onclick="salvarChamadaManual()">Salvar Chamada</button>
        </div>
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
function renderOcorrencias() {
    const ocorrencias = (data.ocorrencias || []).filter(o => o.id_turma == turmaAtual);
    const html = `
        <div style="margin-bottom:10px;">
            <textarea id="novaOcorrenciaTexto" placeholder="Descreva a ocorrência..." rows="3"></textarea>
            <button class="btn btn-primary" onclick="salvarOcorrencia()">Registrar Ocorrência</button>
        </div>
        ${ocorrencias.map(o => `
            <div class="card" style="background:#fff5f5; margin-bottom:5px;">
                <small>${formatDate(o.data)}</small>
                <p>${o.relato}</p>
                <button class="btn btn-sm btn-danger" onclick="removerOcorrencia(${o.id})">🗑️</button>
            </div>
        `).join('')}
    `;
    document.getElementById('tabOcorrencias').innerHTML = html;
}

function salvarOcorrencia() {
    const texto = document.getElementById('novaOcorrenciaTexto').value;
    if (!texto) return;
    
    if (!data.ocorrencias) data.ocorrencias = [];
    data.ocorrencias.push({
        id: Date.now(),
        id_turma: turmaAtual,
        data: getTodayString(),
        relato: texto,
        ids_estudantes: [] // Simplificado
    });
    persistirDados();
    renderOcorrencias();
}

function removerOcorrencia(id) {
    if (confirm('Apagar?')) {
        data.ocorrencias = data.ocorrencias.filter(o => o.id != id);
        persistirDados();
        renderOcorrencias();
    }
}

// --- TUTORIA ---
function renderTutoria() {
    const tutorados = data.tutorados || [];
    const html = tutorados.length > 0 ? `
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
    document.getElementById('listaTutorados').innerHTML = html;
}

function salvarTutorado(e) {
    e.preventDefault();
    const nome = document.getElementById('tutoradoNome').value;
    const turma = document.getElementById('tutoradoTurma').value;
    
    if (!data.tutorados) data.tutorados = [];
    data.tutorados.push({ id: Date.now(), nome_estudante: nome, turma });
    persistirDados();
    closeModal('modalNovoTutorado');
    renderTutoria();
    e.target.reset();
}

function abrirFichaTutorado(id) {
    const t = data.tutorados.find(x => x.id == id);
    document.getElementById('tutoradoFichaNome').textContent = t.nome_estudante;
    showScreen('tutoradoDetalhe');
}

// --- AGENDA ---
let visualizacaoAgenda = 'mes';
let dataAtualAgenda = new Date();

function renderAgenda() {
    const ano = dataAtualAgenda.getFullYear();
    const mes = dataAtualAgenda.getMonth();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    document.getElementById('tituloCalendario').textContent = `${meses[mes]} ${ano}`;
    
    // Renderização simplificada do calendário
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    let html = '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:5px;">';
    
    for (let i = 1; i <= diasNoMes; i++) {
        const dataStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const eventos = (data.eventos || []).filter(e => e.data === dataStr);
        
        html += `
            <div class="calendario-dia" style="min-height:80px; border:1px solid #eee; padding:5px;">
                <strong>${i}</strong>
                ${eventos.map(e => `<div style="font-size:10px; background:#bee3f8; margin-top:2px;">${e.descricao}</div>`).join('')}
            </div>
        `;
    }
    html += '</div>';
    document.getElementById('calendarioView').innerHTML = html;
    renderListaEventos();
}

function renderListaEventos() {
    const eventos = (data.eventos || []).sort((a,b) => a.data.localeCompare(b.data));
    const html = eventos.map(e => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:5px;">
            <span>${formatDate(e.data)} - ${e.descricao}</span>
            <button class="btn btn-sm btn-danger" onclick="removerEvento(${e.id})">x</button>
        </div>
    `).join('');
    document.getElementById('listaEventos').innerHTML = html;
}

function salvarEvento(e) {
    e.preventDefault();
    const titulo = document.getElementById('eventoTitulo').value;
    const dataEvt = document.getElementById('eventoData').value;
    const inicio = document.getElementById('eventoHoraInicio').value;
    
    if (!data.eventos) data.eventos = [];
    data.eventos.push({
        id: Date.now(),
        descricao: titulo,
        data: dataEvt,
        hora_inicio: inicio,
        tipo: document.getElementById('eventoTipo').value
    });
    persistirDados();
    closeModal('modalNovoEvento');
    renderAgenda();
    e.target.reset();
}

function removerEvento(id) {
    if (confirm('Remover evento?')) {
        data.eventos = data.eventos.filter(e => e.id != id);
        persistirDados();
        renderAgenda();
    }
}

function navegarPeriodo(dir) {
    dataAtualAgenda.setMonth(dataAtualAgenda.getMonth() + dir);
    renderAgenda();
}

function alternarVisualizacao(tipo) {
    visualizacaoAgenda = tipo;
    renderAgenda();
}

function abrirModalEventoSlot(dataStr) {
    document.getElementById('eventoData').value = dataStr;
    showModal('modalNovoEvento');
}

// --- PREVIEW AGENDAMENTO (Placeholder) ---
function previewHorariosAuto(e) {
    e.preventDefault();
    alert('Funcionalidade de preview simplificada.');
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
    alert('Importação simulada com sucesso.');
    closeModal('modalImportarEstudantes');
}

function salvarEncontro(e) {
    e.preventDefault();
    // Lógica simplificada
    alert('Encontro registrado');
    closeModal('modalNovoEncontro');
}

function salvarTrabalho(e) {
    e.preventDefault();
    alert('Trabalho salvo');
    closeModal('modalNovoTrabalho');
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