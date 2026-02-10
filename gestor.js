// --- LÓGICA DO GESTOR ---

function renderGestorPanel() {
    // Navegação de Gestor
    const nav = document.querySelector('nav');
    nav.innerHTML = `
        <button class="active" onclick="showScreen('dashboard', event)"><span class="icon">📊</span><span class="label">Dashboard Gestão</span></button>
        <button onclick="showScreen('turmas', event)"><span class="icon">👥</span><span class="label">Turmas</span></button>
        <button onclick="showScreen('registrosGestor', event)"><span class="icon">📂</span><span class="label">Registros</span></button>
        <button onclick="showScreen('ocorrenciasGestor', event)"><span class="icon">⚠️</span><span class="label">Ocorrências</span></button>
        <button onclick="showScreen('horariosGestor', event)"><span class="icon">⏰</span><span class="label">Horários</span></button>
    `;
    
    // Criar telas do Gestor se não existirem
    const container = document.getElementById('appContainer');
    
    if (!document.getElementById('registrosGestor')) {
        const reg = document.createElement('div');
        reg.id = 'registrosGestor';
        reg.className = 'screen';
        container.appendChild(reg);
    }

    if (!document.getElementById('ocorrenciasGestor')) {
        const oco = document.createElement('div');
        oco.id = 'ocorrenciasGestor';
        oco.className = 'screen';
        container.appendChild(oco);
    }

    if (!document.getElementById('horariosGestor')) {
        const hor = document.createElement('div');
        hor.id = 'horariosGestor';
        hor.className = 'screen';
        container.appendChild(hor);
    }

    renderDashboard();
    showScreen('dashboard');
}

function renderRegistrosGestor() {
    const registros = data.registrosAdministrativos || [];
    const today = new Date();

    const lista = registros.map(r => {
        // Simulação de busca de estudante (em produção buscaria do banco)
        const estudante = data.estudantes.find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
        const turma = data.turmas.find(t => t.id == r.turmaId) || { nome: '?' };
        
        let status = 'Ativo';
        let cor = '#22c55e';

        if (r.tipo === 'Atestado') {
            const dataInicio = new Date(r.data);
            const dataFim = new Date(dataInicio);
            dataFim.setDate(dataFim.getDate() + parseInt(r.dias));
            
            if (today > dataFim) {
                status = 'Vencido';
                cor = '#718096';
            }
        } else if (r.tipo === 'Faltoso') {
            cor = '#ef4444';
        }

        return { ...r, estudanteNome: estudante.nome_completo, turmaNome: turma.nome, status, cor };
    });

    const html = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>📂 Registros Administrativos</h2>
                <button class="btn btn-primary" onclick="abrirNovoRegistroGestao()">+ Novo Registro</button>
            </div>
            <div style="margin-top: 20px;">
                ${lista.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Estudante</th>
                                <th>Turma</th>
                                <th>Data/Detalhes</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lista.map(r => `
                                <tr>
                                    <td style="color: ${r.cor}; font-weight: bold;">${r.tipo}</td>
                                    <td>${r.estudanteNome}</td>
                                    <td>${r.turmaNome}</td>
                                    <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''}</td>
                                    <td>
                                        <button class="btn btn-danger btn-sm" onclick="removerRegistroGestao(${r.id})">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">Nenhum registro encontrado.</p>'}
            </div>
        </div>
    `;
    document.getElementById('registrosGestor').innerHTML = html;
}

function abrirNovoRegistroGestao() {
    const turmas = data.turmas || [];
    const html = `
        <form onsubmit="salvarRegistroGestao(event)">
            <label>Turma:
                <select id="regGestaoTurma" onchange="carregarEstudantesRegGestao()" required>
                    <option value="">Selecione...</option>
                    ${turmas.map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}
                </select>
            </label>
            <label>Estudante:
                <select id="regGestaoEstudante" required disabled>
                    <option value="">Selecione a turma primeiro...</option>
                </select>
            </label>
            <label>Tipo:
                <select id="regGestaoTipo" onchange="toggleDiasAtestado()" required>
                    <option value="Atestado">Atestado Médico</option>
                    <option value="Faltoso">Aluno Faltoso</option>
                </select>
            </label>
            <label>Data Início:
                <input type="date" id="regGestaoData" value="${getTodayString()}" required>
            </label>
            <div id="divDiasAtestado">
                <label>Duração (dias):
                    <input type="number" id="regGestaoDias" value="1" min="1">
                </label>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top: 15px;">Salvar</button>
        </form>
    `;
    document.getElementById('formRegistroGestaoConteudo').innerHTML = html;
    showModal('modalNovoRegistroGestao');
}

function carregarEstudantesRegGestao() {
    const turmaId = document.getElementById('regGestaoTurma').value;
    const select = document.getElementById('regGestaoEstudante');
    
    if (!turmaId) {
        select.innerHTML = '<option value="">Selecione a turma primeiro...</option>';
        select.disabled = true;
        return;
    }

    const estudantes = data.estudantes.filter(e => e.id_turma == turmaId);
    select.innerHTML = `<option value="">Selecione...</option>` + 
        estudantes.map(e => `<option value="${e.id}">${e.nome_completo}</option>`).join('');
    select.disabled = false;
}

function toggleDiasAtestado() {
    const tipo = document.getElementById('regGestaoTipo').value;
    document.getElementById('divDiasAtestado').style.display = tipo === 'Atestado' ? 'block' : 'none';
}

function salvarRegistroGestao(e) {
    e.preventDefault();
    const novo = {
        id: Date.now(),
        turmaId: parseInt(document.getElementById('regGestaoTurma').value),
        estudanteId: parseInt(document.getElementById('regGestaoEstudante').value),
        tipo: document.getElementById('regGestaoTipo').value,
        data: document.getElementById('regGestaoData').value,
        dias: document.getElementById('regGestaoDias').value || 0
    };
    
    if (!data.registrosAdministrativos) data.registrosAdministrativos = [];
    data.registrosAdministrativos.push(novo);
    persistirDados();
    closeModal('modalNovoRegistroGestao');
    renderRegistrosGestor();
}

function removerRegistroGestao(id) {
    if (confirm('Excluir este registro?')) {
        data.registrosAdministrativos = data.registrosAdministrativos.filter(r => r.id !== id);
        persistirDados();
        renderRegistrosGestor();
    }
}

function renderOcorrenciasGestor() {
    const ocorrencias = (data.ocorrencias || []).sort((a, b) => new Date(b.data) - new Date(a.data));
    const html = `
        <div class="card">
            <h2>⚠️ Ocorrências da Escola</h2>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Turma</th>
                        <th>Relato</th>
                    </tr>
                </thead>
                <tbody>
                    ${ocorrencias.map(o => {
                        const turma = data.turmas.find(t => t.id == o.id_turma);
                        return `
                            <tr>
                                <td>${formatDate(o.data)}</td>
                                <td>${turma ? turma.nome : '?'}</td>
                                <td>${o.relato}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    document.getElementById('ocorrenciasGestor').innerHTML = html;
}