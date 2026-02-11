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
    if (tab === 'ocorrencias') renderOcorrencias();
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

// --- ATRASOS ---
function renderAtrasos() {
    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaAtual);
    const atrasos = (data.atrasos || []).filter(a => a.id_turma == turmaAtual);
    
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
                <label>Minutos: <input type="number" id="atrasoMinutos" value="10" style="width:80px;"></label>
                <button class="btn btn-warning" onclick="salvarAtraso()">Registrar</button>
            </div>
        </div>

        <h3>Histórico de Atrasos</h3>
        <table>
            <thead><tr><th>Data</th><th>Estudante</th><th>Tempo</th><th>Ações</th></tr></thead>
            <tbody>
                ${atrasos.length > 0 ? atrasos.map(a => {
                    const est = estudantes.find(e => e.id == a.id_estudante);
                    return `
                        <tr>
                            <td>${formatDate(a.data)}</td>
                            <td>${est ? est.nome_completo : 'Excluído'}</td>
                            <td>${a.minutos} min</td>
                            <td><button class="btn btn-danger btn-sm" onclick="removerAtraso(${a.id})">🗑️</button></td>
                        </tr>
                    `;
                }).join('') : '<tr><td colspan="4" style="text-align:center; color:#999;">Nenhum atraso registrado.</td></tr>'}
            </tbody>
        </table>
    `;
    document.getElementById('tabAtrasos').innerHTML = html;
}

function salvarAtraso() {
    const estudanteId = document.getElementById('atrasoEstudante').value;
    const minutos = document.getElementById('atrasoMinutos').value;
    
    if (!estudanteId) return alert('Selecione um estudante.');
    
    if (!data.atrasos) data.atrasos = [];
    data.atrasos.push({
        id: Date.now(),
        id_turma: turmaAtual,
        id_estudante: parseInt(estudanteId),
        data: getTodayString(),
        minutos: minutos
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

async function renderAgenda() {
    const ano = dataAtualAgenda.getFullYear();
    const mes = dataAtualAgenda.getMonth();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    document.getElementById('tituloCalendario').textContent = `${meses[mes]} ${ano}`;
    document.getElementById('containerGradeHoraria').style.display = visualizacaoAgenda === 'grade' ? 'block' : 'none';
    document.getElementById('containerCalendario').style.display = visualizacaoAgenda !== 'grade' ? 'block' : 'none';
    
    if (visualizacaoAgenda === 'grade') {
        await renderGradeHorariaProfessor();
        return;
    }

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
    
    // Atualiza botões
    document.getElementById('btnVisMes').className = tipo === 'mes' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('btnVisSemana').className = tipo === 'semana' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('btnVisGrade').className = tipo === 'grade' ? 'btn btn-primary' : 'btn btn-secondary';
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
        
        // Procura a linha de cabeçalho específica para começar a ler os dados depois dela
        let dataStartIndex = -1;
        const headerSignature = 'Nome do Aluno;Situação do Aluno';
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(headerSignature)) {
                dataStartIndex = i + 1;
                break;
            }
        }

        if (dataStartIndex === -1) {
            alert('Formato de arquivo inválido. Cabeçalho "Nome do Aluno;Situação do Aluno" não encontrado.');
            return;
        }

        if (!data.estudantes) data.estudantes = [];
        let nextId = data.estudantes.length > 0 ? Math.max(...data.estudantes.map(e => e.id)) + 1 : 1;
        let count = 0;

        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(';');
            const nome = parts[0] ? parts[0].trim() : '';
            const status = parts[1] ? parts[1].trim() : 'Ativo';

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
    if (currentUser && currentUser.schoolId) {
        const key = 'app_data_school_' + currentUser.schoolId + '_gestor';
        const gestorData = await getData('app_data', key);
        
        if (gestorData && gestorData.gradeHoraria) {
            gradeEscola = gestorData.gradeHoraria;
        }
    }

    if (gradeEscola.length === 0) {
        container.innerHTML = '<p class="empty-state">A gestão ainda não configurou a grade de horários.</p>';
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
                const turmaSelecionada = aulaSalva ? aulaSalva.id_turma : '';

                return `
                    <div style="background:#f7fafc; padding:8px; margin-bottom:8px; border-radius:4px; border:1px solid #e2e8f0;">
                        <div style="font-size:12px; font-weight:bold; color:#4a5568;">${bloco.inicio} - ${bloco.fim}</div>
                        <select style="width:100%; margin-top:5px; font-size:12px;" onchange="salvarAulaGrade(${bloco.id}, this.value)">
                            <option value="">-- Livre --</option>
                            ${turmas.map(t => `<option value="${t.id}" ${t.id == turmaSelecionada ? 'selected' : ''}>${t.nome}</option>`).join('')}
                        </select>
                    </div>
                `;
            }).join('')}
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function salvarAulaGrade(blocoId, turmaId) {
    if (!data.horariosAulas) data.horariosAulas = [];
    
    // Remove registro anterior desse bloco
    data.horariosAulas = data.horariosAulas.filter(a => a.id_bloco != blocoId);
    
    if (turmaId) {
        data.horariosAulas.push({
            id: Date.now() + Math.random(),
            id_bloco: blocoId,
            id_turma: turmaId
        });
    }
    persistirDados();
}