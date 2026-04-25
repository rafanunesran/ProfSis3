// --- LÓGICA DO GESTOR ---

let currentRegistrosTab = 'administrativos'; // 'administrativos', 'busca_ativa', 'bimestres', 'arquivados' ou 'limpeza'

function renderGestorPanel() {
    // Navegação de Gestor
    const nav = document.querySelector('nav');
    nav.innerHTML = `
        <button class="active" onclick="showScreen('dashboard', event)"><span class="icon">📊</span><span class="label">Dashboard Gestão</span></button>
        <button onclick="showScreen('turmas', event)"><span class="icon">👥</span><span class="label">Turmas</span></button>
        <button onclick="showScreen('registrosGestor', event)"><span class="icon">📂</span><span class="label">Registros</span></button>
        <button onclick="showScreen('ocorrenciasGestor', event)"><span class="icon">⚠️</span><span class="label">Ocorrências</span></button>
        <button onclick="showScreen('tutoriasGestor', event)"><span class="icon">🎓</span><span class="label">Tutorias</span></button>
        <button onclick="showScreen('aeeVisaoGeral', event)"><span class="icon">🌟</span><span class="label">Painel AEE</span></button>
        <button onclick="showScreen('horariosGestor', event)"><span class="icon">⏰</span><span class="label">Horários</span></button>
    `;
    
    // Criar telas do Gestor se não existirem
    const container = document.getElementById('appContainer');
    const innerContainer = container.querySelector('.container') || container;
    
    if (!document.getElementById('registrosGestor')) {
        const reg = document.createElement('div');
        reg.id = 'registrosGestor';
        reg.className = 'screen';
        innerContainer.appendChild(reg);
    }

    if (!document.getElementById('ocorrenciasGestor')) {
        const oco = document.createElement('div');
        oco.id = 'ocorrenciasGestor';
        oco.className = 'screen';
        innerContainer.appendChild(oco);
    }

    if (!document.getElementById('tutoriasGestor')) {
        const tut = document.createElement('div');
        tut.id = 'tutoriasGestor';
        tut.className = 'screen';
        innerContainer.appendChild(tut);
    }

    if (!document.getElementById('horariosGestor')) {
        const hor = document.createElement('div');
        hor.id = 'horariosGestor';
        hor.className = 'screen';
        innerContainer.appendChild(hor);
    }

    renderDashboard();
    showScreen('dashboard');
    
    // Se a tela atual for tutorias, renderiza
    if (document.getElementById('tutoriasGestor').classList.contains('active')) {
        renderTutoriasGestor();
    }
}

function renderRegistrosGestor() {
    const html = `
        <div class="card">
            <div style="margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 10px;">
                <button class="btn ${currentRegistrosTab === 'administrativos' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentRegistrosTab='administrativos'; renderRegistrosGestor()">
                    📂 Vigentes
                </button>
                <button class="btn ${currentRegistrosTab === 'arquivados' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentRegistrosTab='arquivados'; renderRegistrosGestor()">
                    🗄️ Arquivados
                </button>
                <button class="btn ${currentRegistrosTab === 'busca_ativa' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentRegistrosTab='busca_ativa'; renderRegistrosGestor()">
                    🚨 Alertas Busca Ativa
                </button>
                <button class="btn ${currentRegistrosTab === 'bimestres' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentRegistrosTab='bimestres'; renderRegistrosGestor()">
                    📅 Config. Bimestres
                </button>
                <button class="btn ${currentRegistrosTab === 'limpeza' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentRegistrosTab='limpeza'; renderRegistrosGestor()">
                    🧹 Limpeza de Duplicados
                </button>
            </div>

            <div id="registrosGestorContent">
                <!-- Content will be injected here -->
            </div>
        </div>
    `;
    document.getElementById('registrosGestor').innerHTML = html;

    // Agora, chama o renderizador correto para a aba ativa
    if (currentRegistrosTab === 'administrativos') {
        renderAbaRegistrosAdministrativos();
    } else if (currentRegistrosTab === 'busca_ativa') {
        renderAbaAlertasBuscaAtiva();
    } else if (currentRegistrosTab === 'bimestres') {
        renderAbaConfigBimestres();
    } else if (currentRegistrosTab === 'arquivados') {
        renderAbaRegistrosArquivados();
    } else if (currentRegistrosTab === 'limpeza') {
        renderAbaLimpezaDados();
    }
}

function renderAbaRegistrosArquivados() {
    const registros = data.registrosAdministrativos || [];
    const configBimestres = data.configBimestres || [];
    
    // Filtro de Bimestre (Padrão: Todos)
    const selBim = document.getElementById('filtroArqBimestre') ? parseInt(document.getElementById('filtroArqBimestre').value) : 0; 

    const getBimestreParaData = (dataStr) => {
        const match = configBimestres.find(c => dataStr >= c.inicio && dataStr <= c.fim);
        return match ? match.bim : null;
    };

    // Processar todos os dados (incluindo vencidos)
    let lista = registros.map(r => {
        const estudante = data.estudantes.find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
        const turma = data.turmas.find(t => t.id == r.turmaId) || { nome: '?' };
        const bim = getBimestreParaData(r.data);
        
        let status = 'Ativo';
        let cor = '#22c55e';

        if (r.tipo === 'Atestado') {
            const parts = r.data.split('-');
            const dataInicio = new Date(parts[0], parts[1]-1, parts[2]);
            const dataFim = new Date(dataInicio);
            dataFim.setDate(dataFim.getDate() + (parseInt(r.dias) || 1) - 1);
            const today = new Date();
            today.setHours(0,0,0,0);
            
            if (today > dataFim) {
                status = 'Vencido';
                cor = '#718096';
            } else {
                cor = '#3182ce';
            }
        } else if (r.tipo === 'Faltoso') {
            cor = '#ef4444';
            if (estudante.status && estudante.status !== 'Ativo') {
                status = `Arquivado (${estudante.status})`;
                cor = '#718096';
            }
        }

        return { ...r, estudanteNome: estudante.nome_completo, turmaNome: turma.nome, status, cor, bim };
    });

    if (selBim > 0) lista = lista.filter(item => item.bim === selBim);

    // Agrupar por Bimestre e depois por Turma
    const grupos = {};
    lista.forEach(item => {
        const key = item.bim ? `${item.bim}º Bimestre` : 'Sem Bimestre / Férias';
        if (!grupos[key]) grupos[key] = {};
        if (!grupos[key][item.turmaNome]) grupos[key][item.turmaNome] = [];
        grupos[key][item.turmaNome].push(item);
    });

    const bimestresOrdenados = Object.keys(grupos).sort();

    const html = `
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>🗄️ Arquivo Histórico de Registros</h2>
                <div>
                    <label style="font-size:14px; font-weight:bold;">Filtrar Bimestre: </label>
                    <select id="filtroArqBimestre" onchange="renderAbaRegistrosArquivados()" style="padding: 5px; border-radius: 4px;">
                        <option value="0" ${selBim === 0 ? 'selected' : ''}>Todos</option>
                        <option value="1" ${selBim === 1 ? 'selected' : ''}>1º Bimestre</option>
                        <option value="2" ${selBim === 2 ? 'selected' : ''}>2º Bimestre</option>
                        <option value="3" ${selBim === 3 ? 'selected' : ''}>3º Bimestre</option>
                        <option value="4" ${selBim === 4 ? 'selected' : ''}>4º Bimestre</option>
                    </select>
                </div>
            </div>
            ${bimestresOrdenados.length > 0 ? bimestresOrdenados.map(bimKey => `
                <h3 style="margin-top: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; color: #2d3748;">${bimKey}</h3>
                ${Object.keys(grupos[bimKey]).sort().map(turmaNome => `
                    <h4 style="margin-top: 15px; color: #4a5568; background: #edf2f7; padding: 5px 10px; border-radius: 4px;">${turmaNome}</h4>
                    <table>
                        <thead><tr><th>Tipo</th><th>Status</th><th>Estudante</th><th>Data/Detalhes</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${grupos[bimKey][turmaNome].map(r => `
                                <tr>
                                    <td style="color: ${r.cor}; font-weight: bold;">${r.tipo}</td>
                                    <td><span class="badge" style="background:${r.status === 'Vencido' ? '#e2e8f0' : '#ebf8ff'}; color:${r.cor}; font-size:10px;">${r.status}</span></td>
                                    <td>${r.estudanteNome}</td>
                                    <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''} ${r.descricao ? `<br><small>${r.descricao}</small>` : ''}</td>
                                    <td><button class="btn btn-danger btn-sm" onclick="removerRegistroGestao(${r.id})">🗑️</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `).join('')}
            `).join('') : '<p class="empty-state">Nenhum registro histórico encontrado.</p>'}
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
}

function renderAbaConfigBimestres() {
    // Inicializa com valores padrão se não houver configuração salva
    const config = data.configBimestres || [
        { bim: 1, inicio: '', fim: '' },
        { bim: 2, inicio: '', fim: '' },
        { bim: 3, inicio: '', fim: '' },
        { bim: 4, inicio: '', fim: '' }
    ];

    const html = `
        <div>
            <h2>📅 Configuração de Períodos Bimestrais</h2>
            <p style="color:#666; font-size:14px; margin-bottom:20px;">Defina as datas de início e fim de cada bimestre. Isso será usado pelos professores para o cálculo de atestados e relatórios.</p>
            
            <form onsubmit="salvarConfigBimestres(event)">
                <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    ${config.map((c, i) => `
                        <div class="card" style="padding:15px; background:#f8fafc; border:1px solid #e2e8f0;">
                            <h4 style="margin-top:0; color:#2c5282;">${c.bim}º Bimestre</h4>
                            <label style="font-size:12px; font-weight:bold;">Início:</label>
                            <input type="date" class="bim-inicio" data-idx="${i}" value="${c.inicio}" required style="width:100%; margin-bottom:10px;">
                            <label style="font-size:12px; font-weight:bold;">Fim:</label>
                            <input type="date" class="bim-fim" data-idx="${i}" value="${c.fim}" required style="width:100%;">
                        </div>
                    `).join('')}
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top:20px; width:100%; padding:12px;">💾 Salvar Calendário Escolar</button>
            </form>
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
}

function salvarConfigBimestres(e) {
    e.preventDefault();
    const inits = document.querySelectorAll('.bim-inicio');
    const ends = document.querySelectorAll('.bim-fim');
    
    data.configBimestres = Array.from(inits).map((el, i) => ({
        bim: i + 1,
        inicio: el.value,
        fim: ends[i].value
    }));

    persistirDados();
    alert('Calendário atualizado! Os professores já podem visualizar as métricas baseadas nestas datas.');
    renderRegistrosGestor();
}

async function renderAbaAlertasBuscaAtiva() {
    const container = document.getElementById('registrosGestorContent');
    container.innerHTML = '<div><p>Analisando dados de frequência de toda a escola... Isso pode levar um momento.</p></div>';

    // --- 1. Coleta de Dados ---
    const allStudents = data.estudantes || [];
    const allTurmas = data.turmas || [];
    const schoolId = currentUser.schoolId;

    if (!schoolId) {
        container.innerHTML = '<p class="empty-state" style="color:red;">Erro: ID da escola não encontrado para o gestor.</p>';
        return;
    }

    // [MODIFICADO] Busca dados diretamente dos perfis dos professores para garantir histórico retroativo completo
    const attendanceData = {}; // { dateStr: { studentId: [teacherId, ...] } }
    
    try {
        const usersData = await getData('system', 'users_list');
        const users = (usersData && usersData.list) ? usersData.list : [];
        
        // Filtra professores da escola
        const teachers = users.filter(u => u.schoolId === schoolId && u.role !== 'super_admin');
        
        // Busca dados de cada professor em paralelo (mais rápido)
        const promises = teachers.map(async (t) => {
            // Usa UID se disponível (padrão novo), senão ID
            const storageKey = (t.uid) ? 'app_data_' + t.uid : 'app_data_' + t.id;
            const profData = await getData('app_data', storageKey);
            return { teacherId: t.id, data: profData };
        });

        const results = await Promise.all(promises);

        results.forEach(res => {
            if (res.data && res.data.presencas) {
                res.data.presencas.forEach(p => {
                    if (p.status === 'falta') {
                        if (!attendanceData[p.data]) attendanceData[p.data] = {};
                        if (!attendanceData[p.data][p.id_estudante]) attendanceData[p.data][p.id_estudante] = [];
                        
                        // Adiciona ID do professor se ainda não estiver na lista
                        if (!attendanceData[p.data][p.id_estudante].includes(res.teacherId)) {
                            attendanceData[p.data][p.id_estudante].push(res.teacherId);
                        }
                    }
                });
            }
        });
    } catch (e) {
        console.error("Erro ao agregar dados:", e);
        container.innerHTML = `<p class="empty-state" style="color:red;">Erro ao processar dados: ${e.message}</p>`;
        return;
    }

    // Filtra datas para o ano atual e ordena
    const currentYear = new Date().getFullYear();
    const sortedDates = Object.keys(attendanceData)
        .filter(d => d.startsWith(String(currentYear)))
        .sort();

    // --- 2. Processamento dos Alertas ---
    const alerts = { consecutive: [], weekly: [], percentage: [] };
    const MIN_TEACHERS_FOR_ABSENCE = 1;

    const wasAbsent = (studentId, dateStr) => {
        const dayData = attendanceData[dateStr];
        if (!dayData || !dayData[studentId]) return false;
        return dayData[studentId].length >= MIN_TEACHERS_FOR_ABSENCE;
    };

    const todayForWeek = new Date();
    const dayOfWeek = todayForWeek.getDay(); // 0=Sun, 1=Mon
    const lastSunday = new Date(todayForWeek);
    lastSunday.setDate(todayForWeek.getDate() - dayOfWeek);
    lastSunday.setHours(0, 0, 0, 0);

    const mondayOfPreviousWeek = new Date(lastSunday);
    mondayOfPreviousWeek.setDate(lastSunday.getDate() - 7);

    const sundayOfPreviousWeek = new Date(lastSunday);
    sundayOfPreviousWeek.setDate(lastSunday.getDate() - 1);

    for (const student of allStudents) {
        if(student.status !== 'Ativo') continue;

        // a) Faltas Consecutivas
        let consecutiveCount = 0, maxConsecutive = 0;
        for (const dateStr of sortedDates) {
            if (wasAbsent(student.id, dateStr)) consecutiveCount++;
            else { maxConsecutive = Math.max(maxConsecutive, consecutiveCount); consecutiveCount = 0; }
        }
        maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        if (maxConsecutive >= 3) alerts.consecutive.push({ student, detail: `${maxConsecutive} dias consecutivos` });

        // b) Faltas na Semana Passada
        let lastWeekAbsences = 0;
        for (const dateStr of sortedDates) {
            const d = new Date(dateStr + 'T12:00:00');
            if (d >= mondayOfPreviousWeek && d <= sundayOfPreviousWeek && wasAbsent(student.id, dateStr)) {
                lastWeekAbsences++;
            }
        }
        if (lastWeekAbsences >= 3) alerts.weekly.push({ student, detail: `${lastWeekAbsences} faltas na semana passada` });

        // c) Baixa Frequência
        if (sortedDates.length > 0) {
            const totalAbsences = sortedDates.filter(dateStr => wasAbsent(student.id, dateStr)).length;
            const presencePercentage = ((sortedDates.length - totalAbsences) / sortedDates.length) * 100;
            if (presencePercentage < 70) alerts.percentage.push({ student, detail: `${presencePercentage.toFixed(0)}% de presença` });
        }
    }

    // --- 3. Renderização ---
    const renderAlertList = (alertList, title) => {
        if (alertList.length === 0) return `<h4>${title}</h4><p class="empty-state">Nenhum alerta.</p>`;
        const byTurma = {};
        alertList.forEach(item => {
            const turma = allTurmas.find(t => t.id == item.student.id_turma);
            const turmaName = turma ? turma.nome : "Turma Desconhecida";
            if (!byTurma[turmaName]) byTurma[turmaName] = [];
            byTurma[turmaName].push(item);
        });

        let listHtml = `<h4>${title} (${alertList.length})</h4>`;
        Object.keys(byTurma).sort().forEach(turmaName => {
            listHtml += `<div class="card" style="margin-bottom:10px; background:white;">
                <h5 style="margin:0 0 5px 0; padding-bottom:5px; border-bottom:1px solid #eee;">${turmaName}</h5>
                <ul style="margin:0; padding-left:20px; font-size:13px;">`;
            byTurma[turmaName].forEach(item => {
                listHtml += `<li><strong>${item.student.nome_completo}</strong>: ${item.detail}</li>`;
            });
            listHtml += `</ul></div>`;
        });
        return listHtml;
    };

    container.innerHTML = `
        <div class="grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 20px; align-items: start;">
            <div style="background:#fff5f5; padding:15px; border-radius:8px; border:1px solid #feb2b2;">
                ${renderAlertList(alerts.consecutive, '🚨 Faltas Consecutivas')}
            </div>
            <div style="background:#fffaf0; padding:15px; border-radius:8px; border:1px solid #fbd38d;">
                ${renderAlertList(alerts.weekly, '📅 Faltas na Semana')}
            </div>
            <div style="background:#ebf8ff; padding:15px; border-radius:8px; border:1px solid #bee3f8;">
                ${renderAlertList(alerts.percentage, '📉 Baixa Frequência')}
            </div>
        </div>
    `;
}

function renderAbaRegistrosAdministrativos() {
    const registros = data.registrosAdministrativos || [];
    const today = new Date();
    today.setHours(0,0,0,0);

    // 1. Processar e Filtrar
    let lista = registros.map(r => {
        // Simulação de busca de estudante (em produção buscaria do banco)
        const estudante = data.estudantes.find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
        const turma = data.turmas.find(t => t.id == r.turmaId) || { nome: '?' };
        
        let status = 'Ativo';
        let cor = '#22c55e';

        if (r.tipo === 'Atestado') {
            // Ajuste de data para evitar problemas de fuso horário (YYYY-MM-DD)
            const parts = r.data.split('-');
            const dataInicio = new Date(parts[0], parts[1]-1, parts[2]);
            
            const dataFim = new Date(dataInicio);
            // Subtrai 1 porque se é 1 dia, começa e termina hoje
            dataFim.setDate(dataFim.getDate() + (parseInt(r.dias) || 1) - 1);
            
            if (today > dataFim) {
                status = 'Vencido';
                return null; // Filtra atestados vencidos ("aparecem enquanto vigente")
            }
        } else if (r.tipo === 'Faltoso') {
            cor = '#ef4444';
            // [MODIFICADO] Faltosos caem para o arquivo se o estudante não estiver Ativo
            if (estudante.status && estudante.status !== 'Ativo') {
                return null;
            }
        }

        return { ...r, estudanteNome: estudante.nome_completo, turmaNome: turma.nome, status, cor };
    }).filter(item => item !== null);

    // 2. Agrupar por Turma
    const grupos = {};
    lista.forEach(item => {
        if (!grupos[item.turmaNome]) grupos[item.turmaNome] = [];
        grupos[item.turmaNome].push(item);
    });

    const turmasOrdenadas = Object.keys(grupos).sort();

    const html = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>📂 Registros Administrativos</h2>
                <div>
                    <button class="btn btn-secondary" onclick="compartilharRelatorio()">🔗 Compartilhar Online</button>
                    <button class="btn btn-primary" onclick="abrirNovoRegistroGestao()">+ Novo Registro</button>
                </div>
            </div>
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
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${grupos[turmaNome].map(r => `
                                    <tr>
                                        <td style="color: ${r.cor}; font-weight: bold;">${r.tipo}</td>
                                        <td>${r.estudanteNome}</td>
                                        <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''} ${r.descricao ? `<br><small>${r.descricao}</small>` : ''}</td>
                                        <td>
                                            <button class="btn btn-danger btn-sm" onclick="removerRegistroGestao(${r.id})">🗑️</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `).join('')}
                ` : '<p class="empty-state">Nenhum registro vigente ou faltoso encontrado.</p>'}
            </div>
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
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
                    <option value="Observacao">Observação</option>
                    <option value="Atestado">Atestado Médico</option>
                    <option value="Faltoso">Aluno Faltoso</option>
                </select>
            </label>
            <label>Data Início:
                <input type="date" id="regGestaoData" value="${getTodayString()}" required>
            </label>
            <div id="divDiasAtestado" style="display:none;">
                <label>Duração (dias):
                    <input type="number" id="regGestaoDias" value="1" min="1">
                </label>
            </div>
            <div id="divDescricaoObs">
                <label>Descrição/Observação:
                    <textarea id="regGestaoDescricao" rows="3"></textarea>
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

    const estudantes = data.estudantes
        .filter(e => e.id_turma == turmaId && e.status === 'Ativo')
        .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
    select.innerHTML = `<option value="">Selecione...</option>` + 
        estudantes.map(e => `<option value="${e.id}">${e.nome_completo}</option>`).join('');
    select.disabled = false;
}

function toggleDiasAtestado() {
    const tipo = document.getElementById('regGestaoTipo').value;
    document.getElementById('divDiasAtestado').style.display = tipo === 'Atestado' ? 'block' : 'none';
    document.getElementById('divDescricaoObs').style.display = tipo === 'Observacao' ? 'block' : 'none';
}

function salvarRegistroGestao(e) {
    e.preventDefault();
    const novo = {
        id: Date.now(),
        turmaId: parseInt(document.getElementById('regGestaoTurma').value),
        estudanteId: parseInt(document.getElementById('regGestaoEstudante').value),
        tipo: document.getElementById('regGestaoTipo').value,
        data: document.getElementById('regGestaoData').value,
        dias: document.getElementById('regGestaoDias').value || 0,
        descricao: document.getElementById('regGestaoDescricao').value || ''
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

let currentOcorrenciaTab = 'disciplinares'; // disciplinares, rapidas, config

function renderOcorrenciasGestor() {
    const todasOcorrencias = (data.ocorrencias || []).sort((a, b) => new Date(b.data) - new Date(a.data));
    
    // Filtra por tipo
    const disciplinares = todasOcorrencias.filter(o => o.tipo !== 'rapida');
    const rapidas = todasOcorrencias.filter(o => o.tipo === 'rapida');

    const html = `
        <div class="card">
            <div style="margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 10px;">
                <button class="btn ${currentOcorrenciaTab === 'disciplinares' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentOcorrenciaTab='disciplinares'; renderOcorrenciasGestor()">
                    ⚠️ Disciplinares
                </button>
                <button class="btn ${currentOcorrenciaTab === 'rapidas' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentOcorrenciaTab='rapidas'; renderOcorrenciasGestor()">
                    ⚡ Registros Rápidos
                </button>
                <button class="btn ${currentOcorrenciaTab === 'config' ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="currentOcorrenciaTab='config'; renderOcorrenciasGestor()">
                    ⚙️ Configuração
                </button>
            </div>

            ${currentOcorrenciaTab === 'disciplinares' ? renderAbaDisciplinares(disciplinares) : ''}
            ${currentOcorrenciaTab === 'rapidas' ? renderAbaRapidas(rapidas) : ''}
            ${currentOcorrenciaTab === 'config' ? renderAbaConfigOcorrencias() : ''}
        </div>
    `;
    document.getElementById('ocorrenciasGestor').innerHTML = html;
}

function abrirModalDevolutiva(ocorrenciaId) {
    const ocorrencia = data.ocorrencias.find(o => o.id == ocorrenciaId);
    if (ocorrencia) {
        document.getElementById('devolutivaOcorrenciaId').value = ocorrenciaId;
        document.getElementById('devolutivaTexto').value = ocorrencia.devolutiva || '';
        showModal('modalDevolutiva');
    }
}

function salvarDevolutiva(e) {
    e.preventDefault();
    const ocorrenciaId = document.getElementById('devolutivaOcorrenciaId').value;
    const texto = document.getElementById('devolutivaTexto').value;

    const ocorrencia = data.ocorrencias.find(o => o.id == ocorrenciaId);
    if (ocorrencia) {
        ocorrencia.devolutiva = texto;
        persistirDados();
        closeModal('modalDevolutiva');
        renderOcorrenciasGestor();
    }
}

function renderAbaDisciplinares(lista) {
    // Filtro de Status
    let filtro = 'pendente';
    const radioChecked = document.querySelector('input[name="filtroOco"]:checked');
    if (radioChecked) filtro = radioChecked.value;

    const filtradas = lista.filter(o => {
        if (filtro === 'todas') return true;
        const status = o.status || 'pendente';
        return status === filtro;
    });

    return `
        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                <h2>⚠️ Ocorrências da Escola</h2>
                <div style="background: #edf2f7; padding: 5px 15px; border-radius: 20px; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 13px; font-weight: bold; color: #4a5568;">Visualizar:</span>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                        <input type="radio" name="filtroOco" value="pendente" onclick="renderOcorrenciasGestor()" ${filtro === 'pendente' ? 'checked' : ''}> Pendentes
                    </label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                        <input type="radio" name="filtroOco" value="confirmada" onclick="renderOcorrenciasGestor()" ${filtro === 'confirmada' ? 'checked' : ''}> Confirmadas
                    </label>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                        <input type="radio" name="filtroOco" value="todas" onclick="renderOcorrenciasGestor()" ${filtro === 'todas' ? 'checked' : ''}> Todas
                    </label>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Turma - Disciplina</th>
                        <th>Autor</th>
                        <th>Envolvidos</th>
                        <th>Arquivo</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtradas.length > 0 ? filtradas.map(o => {
                        const turma = data.turmas.find(t => t.id == o.id_turma);
                        // Usa o snapshot salvo pelo professor ou tenta montar com dados atuais
                        const turmaDisplay = o.turma_snapshot || (turma ? `${turma.nome} ${o.disciplina ? '- ' + o.disciplina : ''}` : '?');
                        
                        const envolvidos = (o.ids_estudantes || []).map(id => {
                            const est = (data.estudantes || []).find(e => e.id == id);
                            return est ? est.nome_completo : '?';
                        }).join(', ');

                        const isPendente = (o.status || 'pendente') === 'pendente';

                        // DEVOLUTIVA HTML
                        let devolutivaHtml = '';
                        if (o.devolutiva) {
                            devolutivaHtml = `
                                <div style="background:#f0fff4; padding:10px; border-radius:6px; border:1px solid #c6f6d5; font-size:13px; color:#276749; white-space: pre-wrap; margin-top:10px; position:relative;">
                                    <strong>✅ Devolutiva da Gestão:</strong> ${o.devolutiva}
                                    <button class="btn btn-sm btn-secondary" style="position:absolute; top:5px; right:5px; padding: 2px 6px;" onclick="abrirModalDevolutiva(${o.id})">✏️</button>
                                </div>
                            `;
                        } else {
                            devolutivaHtml = `
                                <div style="margin-top:10px; text-align:right;">
                                    <button class="btn btn-sm btn-info" onclick="abrirModalDevolutiva(${o.id})">➕ Adicionar Devolutiva</button>
                                </div>
                            `;
                        }
                        return `
                            <tr>
                                <td style="border-bottom:none;">${formatDate(o.data)}</td>
                                <td style="border-bottom:none;">${turmaDisplay}</td>
                                <td style="border-bottom:none;">${o.autor || 'Gestão'}</td>
                                <td style="border-bottom:none;">${envolvidos || '-'}</td>
                                <td style="border-bottom:none;">
                                    <button class="btn btn-sm btn-secondary" onclick="imprimirOcorrenciaGestor(${o.id})">📄 Baixar PDF</button>
                                </td>
                                <td style="border-bottom:none;">
                                    <button class="btn btn-sm ${isPendente ? 'btn-warning' : 'btn-success'}" onclick="toggleStatusOcorrencia(${o.id})">
                                        ${isPendente ? '⏳ Pendente' : '✅ Confirmada'}
                                    </button>
                                </td>
                            </tr>
                            <tr>
                                <td colspan="6" style="padding-top:0; padding-bottom:15px;">
                                    <div style="background:#f7fafc; padding:10px; border-radius:6px; border:1px solid #edf2f7; font-size:13px; color:#4a5568; white-space: pre-wrap;">
                                        <strong>📝 Relato:</strong> ${o.relato}
                                    </div>
                                    ${devolutivaHtml}
                                </td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px; color:#a0aec0;">Nenhuma ocorrência nesta categoria.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderAbaRapidas(lista) {
    return `
        <div>
            <h2>⚡ Histórico de Registros Rápidos</h2>
            <p style="color:#666; font-size:13px; margin-bottom:15px;">Estes registros são apenas informativos e não geram alertas no dashboard.</p>
            
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Turma</th>
                        <th>Estudante</th>
                        <th>Ocorrência</th>
                        <th>Professor</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.length > 0 ? lista.map(o => {
                        const envolvidos = (o.ids_estudantes || []).map(id => {
                            const est = (data.estudantes || []).find(e => e.id == id);
                            return est ? est.nome_completo : '?';
                        }).join(', ');

                        return `
                            <tr>
                                <td>${formatDate(o.data)}</td>
                                <td>${o.turma_snapshot || '-'}</td>
                                <td><strong>${envolvidos}</strong></td>
                                <td><span style="background:#ebf8ff; color:#2c5282; padding:2px 8px; border-radius:10px; font-size:12px;">${o.relato}</span></td>
                                <td>${o.autor}</td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px; color:#a0aec0;">Nenhum registro rápido encontrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderAbaConfigOcorrencias() {
    const opcoes = data.opcoesOcorrenciaRapida || [];
    
    return `
        <div>
            <h2>⚙️ Configuração de Ocorrências Rápidas</h2>
            <p style="color:#666;">Defina as opções que aparecerão para os professores (ex: "Sem material", "Conversa paralela").</p>
            
            <div style="display:flex; gap:10px; margin-bottom:20px; background:#f7fafc; padding:15px; border-radius:8px;">
                <input type="text" id="novaOpcaoRapida" placeholder="Ex: Esqueceu material" style="flex-grow:1;">
                <button class="btn btn-success" onclick="adicionarOpcaoRapida()">+ Adicionar</button>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                ${opcoes.map((op, index) => `
                    <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; background:white;">
                        <span>${op}</span>
                        <button class="btn btn-sm btn-danger" onclick="removerOpcaoRapida(${index})">🗑️</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function adicionarOpcaoRapida() {
    const input = document.getElementById('novaOpcaoRapida');
    const valor = input.value.trim();
    if (!valor) return;

    if (!data.opcoesOcorrenciaRapida) data.opcoesOcorrenciaRapida = [];
    data.opcoesOcorrenciaRapida.push(valor);
    persistirDados();
    renderOcorrenciasGestor();
}

function removerOpcaoRapida(index) {
    if (!confirm('Remover esta opção?')) return;
    data.opcoesOcorrenciaRapida.splice(index, 1);
    persistirDados();
    renderOcorrenciasGestor();
}

function toggleStatusOcorrencia(id) {
    const o = data.ocorrencias.find(x => x.id == id);
    if (o) {
        o.status = (o.status === 'confirmada') ? 'pendente' : 'confirmada';
        persistirDados();
        renderOcorrenciasGestor();
    }
}

function imprimirOcorrenciaGestor(id) {
    const o = data.ocorrencias.find(x => x.id == id);
    if (!o) return;

    const envolvidos = (o.ids_estudantes || []).map(id => {
        const est = (data.estudantes || []).find(e => e.id == id);
        return est ? est.nome_completo : 'Excluído';
    }).join(', ');

    const devolutivaHtml = o.devolutiva ? `
        <hr>
        <h3>Devolutiva da Gestão:</h3>
        <p style="white-space: pre-wrap; background: #f0fff4; padding: 15px; border: 1px solid #c6f6d5; color: #2f855a; border-radius: 5px;">${o.devolutiva}</p>
    ` : '';

    const conteudo = `
        <div style="font-family: Arial, sans-serif; padding: 40px;">
            <h1 style="text-align: center;">Registro de Ocorrência</h1>
            <hr>
            <p><strong>Data:</strong> ${formatDate(o.data)}</p>
            <p><strong>Professor/Autor:</strong> ${o.autor || 'Gestão'}</p>
            <p><strong>Turma/Disciplina:</strong> ${o.turma_snapshot || 'N/A'}</p>
            <p><strong>Estudantes Envolvidos:</strong> ${envolvidos}</p>
            <p><strong>Status:</strong> ${o.status ? o.status.toUpperCase() : 'PENDENTE'}</p>
            <hr>
            <h3>Relato:</h3>
            <p style="white-space: pre-wrap; background: #f9f9f9; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">${o.relato}</p>
            ${devolutivaHtml}
            <br><br><br>
            <div style="display: flex; justify-content: space-between; margin-top: 50px;">
                <div style="border-top: 1px solid #000; width: 40%; text-align: center; padding-top: 5px;">Assinatura do Responsável</div>
                <div style="border-top: 1px solid #000; width: 40%; text-align: center; padding-top: 5px;">Assinatura da Coordenação</div>
            </div>
        </div>
    `;

    const janela = window.open('', '', 'width=800,height=600');
    janela.document.write('<html><head><title>Ocorrência - ' + formatDate(o.data) + '</title></head><body>');
    janela.document.write(conteudo);
    janela.document.write('<script>window.print();</script>');
    janela.document.write('</body></html>');
    janela.document.close();
}

async function compartilharRelatorio() {
    if (typeof db === 'undefined' || !db) {
        alert('O compartilhamento requer que o sistema esteja ONLINE (Firebase).');
        return;
    }

    const confirmacao = confirm('Isso ativará um link permanente de leitura para estes registros. Ele será atualizado automaticamente toda vez que você realizar um lançamento.\n\nDeseja continuar?');
    if (!confirmacao) return;

    const schoolId = (currentUser && currentUser.schoolId) ? String(currentUser.schoolId) : 'default';
    const shareId = `live_${schoolId}`;
    const link = `${window.location.origin}${window.location.pathname}?share=${shareId}`;

    try {
        await atualizarLinkCompartilhamentoGestor();
        prompt("Link permanente ativado/atualizado com sucesso! Copie e envie para os professores:", link);
    } catch (error) {
        console.error("Erro ao compartilhar:", error);
        alert("Erro ao gerar link.");
    }
}

async function atualizarLinkCompartilhamentoGestor() {
    // Verifica se está online e se é gestor
    if (typeof db === 'undefined' || !db || !currentUser || !currentUser.schoolId || currentViewMode !== 'gestor') return;

    const schoolId = String(currentUser.schoolId);
    const shareId = `live_${schoolId}`;
    
    // Prepara dados minificados para o relatório (Snapshot do estado atual)
    const payload = {
        criadoEm: new Date().toISOString(),
        escolaId: schoolId,
        isLive: true,
        dados: {
            registrosAdministrativos: data.registrosAdministrativos || [],
            estudantes: (data.estudantes || []).map(e => ({id: e.id, nome_completo: e.nome_completo})),
            turmas: (data.turmas || []).map(t => ({id: t.id, nome: t.nome}))
        }
    };

    await db.collection('shared_views').doc(shareId).set(payload);
}

async function carregarVistaCompartilhada(shareId) {
    // Substitui o corpo do documento para exibir apenas o relatório limpo (estilo "nova aba/html")
    document.body.innerHTML = `
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7fafc; color: #2d3748; margin: 0; padding: 40px; }
            .report-container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            h1 { text-align: center; color: #2c5282; margin-bottom: 10px; font-size: 28px; }
            .meta-info { text-align: center; color: #718096; font-size: 14px; margin-bottom: 40px; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; }
            h3 { color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f8fafc; font-weight: 600; color: #4a5568; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
            tr:hover { background-color: #f7fafc; }
            .badge { padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; display: inline-block; }
            .empty-state { text-align: center; padding: 40px; color: #a0aec0; font-style: italic; background: #f9fafb; border-radius: 8px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #cbd5e0; }
            @media print {
                body { background: white; padding: 0; }
                .report-container { box-shadow: none; padding: 0; }
            }
        </style>
        <div class="report-container">
            <div id="loading" style="text-align: center; padding: 50px; color: #4a5568;">Carregando dados do relatório...</div>
        </div>
    `;

    const docData = await getData('shared_views', shareId);
    const container = document.querySelector('.report-container');
    
    if (docData && docData.dados) {
        data = docData.dados; // Popula dados globais
        const registros = data.registrosAdministrativos || [];
        const today = new Date();
        today.setHours(0,0,0,0);

        // Processamento dos dados (Filtragem e Agrupamento)
        let lista = registros.map(r => {
            const estudante = (data.estudantes || []).find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
            const turma = (data.turmas || []).find(t => t.id == r.turmaId) || { nome: '?' };
            
            let cor = '#22c55e'; let bg = '#f0fff4';

            if (r.tipo === 'Atestado') {
                const parts = r.data.split('-');
                const dataInicio = new Date(parts[0], parts[1]-1, parts[2]);
                const dataFim = new Date(dataInicio);
                dataFim.setDate(dataFim.getDate() + (parseInt(r.dias) || 1) - 1);
                
                if (today > dataFim) return null; // Filtra vencidos
                
                cor = '#3182ce'; bg = '#ebf8ff';
            } else if (r.tipo === 'Faltoso') {
                cor = '#e53e3e'; bg = '#fff5f5';
            }

            return { ...r, estudanteNome: estudante.nome_completo, turmaNome: turma.nome, cor, bg };
        }).filter(item => item !== null);

        const grupos = {};
        lista.forEach(item => {
            if (!grupos[item.turmaNome]) grupos[item.turmaNome] = [];
            grupos[item.turmaNome].push(item);
        });
        const turmasOrdenadas = Object.keys(grupos).sort();

        // Construção do HTML do Relatório
        let html = `
            <h1>Relatório de Registros Administrativos</h1>
            ${docData.isLive ? '<div style="text-align:center; margin-top:-10px; margin-bottom:10px;"><span class="badge" style="background:#f0fff4; color:#276749; font-size:10px; border:1px solid #c6f6d5;">🔄 ATUALIZAÇÃO EM TEMPO REAL</span></div>' : ''}
            <div class="meta-info">${docData.isLive ? 'Última atualização' : 'Gerado em'}: ${new Date(docData.criadoEm).toLocaleDateString('pt-BR')} às ${new Date(docData.criadoEm).toLocaleTimeString('pt-BR')}</div>
        `;

        if (lista.length > 0) {
            turmasOrdenadas.forEach(turmaNome => {
                html += `<h3>${turmaNome}</h3><table><thead><tr><th style="width:120px;">Tipo</th><th>Estudante</th><th>Detalhes</th></tr></thead><tbody>`;
                grupos[turmaNome].forEach(r => {
                    html += `<tr>
                        <td><span class="badge" style="color:${r.cor}; background-color:${r.bg};">${r.tipo}</span></td>
                        <td><strong>${r.estudanteNome}</strong></td>
                        <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `<span style="color:#718096; font-size:0.9em;">(${r.dias} dias)</span>` : ''}</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
            });
        } else {
            html += '<div class="empty-state">Nenhum registro vigente encontrado.</div>';
        }
        html += `<div class="footer">Sistema Escolar - Relatório Compartilhado</div>`;
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="empty-state" style="color: #e53e3e;">Link inválido ou expirado.</div>';
    }
}

// --- FERRAMENTA DE LIMPEZA DE DUPLICADOS ---

function renderAbaLimpezaDados() {
    const estudantes = data.estudantes || [];
    const histograma = {};
    
    // Agrupa por nome normalizado (sem espaços extras e em caixa alta)
    estudantes.forEach(e => {
        const nomeNorm = e.nome_completo.trim().toUpperCase();
        if (!histograma[nomeNorm]) histograma[nomeNorm] = [];
        histograma[nomeNorm].push(e);
    });

    const duplicados = Object.entries(histograma).filter(([nome, lista]) => lista.length > 1);

    const html = `
        <div>
            <h2>🧹 Ferramenta de Limpeza de Duplicados</h2>
            <p style="color:#666; font-size:14px; margin-bottom:20px;">
                Esta ferramenta identifica estudantes com o mesmo nome completo e unifica seus registros (faltas, ocorrências, etc) em um único ID. 
                Isso resolve problemas causados por atualizações via CSV onde nomes idênticos acabaram gerando IDs diferentes.
            </p>

            ${duplicados.length > 0 ? `
                <div class="alert alert-warning" style="margin-bottom:20px; background:#fffaf0; padding:15px; border-radius:8px; border:1px solid #fbd38d;">
                    <strong>⚠️ Atenção:</strong> Foram encontrados <strong>${duplicados.length}</strong> nomes com duplicidade de registro.
                </div>
                <table style="width:100%;">
                    <thead>
                        <tr>
                            <th>Nome Completo</th>
                            <th>Registros no Banco</th>
                            <th>Turmas Detectadas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${duplicados.map(([nome, lista]) => {
                            const turmas = lista.map(e => {
                                const t = data.turmas.find(turma => turma.id == e.id_turma);
                                return t ? t.nome : '?';
                            }).join(', ');
                            return `
                                <tr>
                                    <td><strong>${nome}</strong></td>
                                    <td>${lista.length} registros</td>
                                    <td><small>${turmas}</small></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <button class="btn btn-primary" style="margin-top:20px; width:100%; padding:15px; font-weight:bold;" onclick="executarLimpezaDuplicados()">
                    🚀 Unificar Estudantes e Corrigir Histórico
                </button>
            ` : `
                <p class="empty-state">✅ Nenhum estudante duplicado encontrado. Seu banco de dados está limpo!</p>
            `}
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
}

async function executarLimpezaDuplicados() {
    if (!confirm('Este processo irá fundir todos os estudantes duplicados. O primeiro ID encontrado para cada nome será mantido e todos os outros registros (faltas, ocorrências, tutorias, etc) serão transferidos para ele. Deseja continuar?')) return;

    const estudantes = data.estudantes || [];
    const histograma = {};
    
    estudantes.forEach(e => {
        const nomeNorm = e.nome_completo.trim().toUpperCase();
        if (!histograma[nomeNorm]) histograma[nomeNorm] = [];
        histograma[nomeNorm].push(e);
    });

    let totalUnificados = 0;
    const novosEstudantes = [];

    for (const [nome, lista] of Object.entries(histograma)) {
        if (lista.length === 1) {
            novosEstudantes.push(lista[0]);
            continue;
        }

        // Temos duplicados: Master é o primeiro da lista
        const master = lista[0];
        const masterId = master.id;
        const idsDuplicados = lista.slice(1).map(e => e.id);
        
        // Função auxiliar para atualizar referências
        const atualizarRef = (listaDados, campoId) => {
            if (listaDados && Array.isArray(listaDados)) {
                listaDados.forEach(item => {
                    if (idsDuplicados.includes(item[campoId])) item[campoId] = masterId;
                });
            }
        };

        atualizarRef(data.presencas, 'id_estudante');
        atualizarRef(data.atrasos, 'id_estudante');
        atualizarRef(data.registrosAdministrativos, 'estudanteId');
        atualizarRef(data.compensacoes, 'id_estudante');
        atualizarRef(data.tutorados, 'id_estudante_origem');

        // Ocorrências (ids_estudantes é um array de envolvidos)
        if (data.ocorrencias) {
            data.ocorrencias.forEach(o => {
                if (o.ids_estudantes) {
                    o.ids_estudantes = o.ids_estudantes.map(id => idsDuplicados.includes(id) ? masterId : id);
                    o.ids_estudantes = [...new Set(o.ids_estudantes)]; // Remove duplicatas no array
                }
            });
        }

        novosEstudantes.push(master);
        totalUnificados += idsDuplicados.length;
    }

    data.estudantes = novosEstudantes;
    
    // Deduplicação de Presenças (Evita múltiplas entradas para o mesmo dia após o merge)
    if (data.presencas) {
        const seen = new Set();
        data.presencas = data.presencas.filter(p => {
            const key = `${p.id_estudante}-${p.data}-${p.status}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    await persistirDados();
    alert(`Limpeza concluída!\n\nRegistros de estudantes unificados: ${totalUnificados}`);
    renderRegistrosGestor();
}

// --- GRADE DE HORÁRIOS (GESTOR) ---

function renderHorariosGestor() {
    // Renderização Padrão (Semanal)
    // Inicializa tipos padrão se não existirem
    if (!data.tiposHorarioFixo) {
        data.tiposHorarioFixo = [
            { id: 'tutoria', nome: '🎓 Tutoria' },
            { id: 'almoco', nome: '🍽️ Almoço' },
            { id: 'cafe', nome: '☕ Café' },
            { id: 'atpca', nome: '📚 ATPCA' },
            { id: 'apcg', nome: '📝 APCG' },
            { id: 'reuniao', nome: '🤝 Reunião' }
        ];
    }

    const grade = (data.gradeHoraria || []);
    const dias = [
        { id: 1, nome: 'Segunda' },
        { id: 2, nome: 'Terça' },
        { id: 3, nome: 'Quarta' },
        { id: 4, nome: 'Quinta' },
        { id: 5, nome: 'Sexta' }
    ];

    let html = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div>
                    <h2 style="margin:0;">⏰ Grade Horária Padrão</h2>
                    <p style="color:#666; font-size:14px; margin:0;">Defina a rotina semanal (Seg-Sex).</p>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-info" onclick="abrirGerenciadorTiposHorario()">⚙️ Tipos</button>
                    <button class="btn btn-warning" onclick="abrirGerenciadorDiasAtipicos()">📅 Dia Atípico</button>
                </div>
            </div>
            
            <div style="background: #edf2f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                <h3 style="margin-top:0; font-size: 16px; margin-bottom: 10px;">Adicionar Horário em Lote</h3>
                <div class="form-row" style="align-items: flex-end; gap: 15px; display: flex; flex-wrap: wrap;">
                    <label>Início: <input type="time" id="loteInicio"></label>
                    <label>Fim: <input type="time" id="loteFim"></label>
                    <div style="flex-grow: 1;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Repetir nos dias:</label>
                        <div style="display:flex; gap: 15px; flex-wrap: wrap;">
                            <label><input type="checkbox" class="lote-dia" value="1"> Seg</label>
                            <label><input type="checkbox" class="lote-dia" value="2"> Ter</label>
                            <label><input type="checkbox" class="lote-dia" value="3"> Qua</label>
                            <label><input type="checkbox" class="lote-dia" value="4"> Qui</label>
                            <label><input type="checkbox" class="lote-dia" value="5"> Sex</label>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="salvarGradeLote()">Adicionar</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; overflow-x: auto;">
    `;

    dias.forEach(dia => {
        const slots = grade.filter(g => g.diaSemana == dia.id).sort((a,b) => a.inicio.localeCompare(b.inicio));
        
        html += `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; min-width: 140px;">
                <h3 style="text-align: center; border-bottom: 2px solid #cbd5e0; padding-bottom: 5px; margin-bottom: 10px; color: #2d3748; font-size: 14px;">${dia.nome}</h3>
                
                <div style="flex-grow: 1;">
                    ${slots.length > 0 ? slots.map(s => `
                        <div style="background: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 5px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 12px; font-weight: 600; color: #4a5568;">${s.inicio} - ${s.fim}</span>
                                <button class="btn btn-danger btn-sm" style="margin:0; padding: 0 5px; font-size: 14px; line-height: 1;" onclick="removerBlocoHorario(${s.id})" title="Remover">×</button>
                            </div>
                            <input type="text" placeholder="Rótulo (ex: 1ª Aula)" value="${s.label || ''}" 
                                style="width:100%; margin-bottom:4px; font-size:11px; padding:2px; border:1px solid #cbd5e0; border-radius:3px;"
                                onblur="atualizarLabelBloco(${s.id}, this.value)">
                            <select style="width:100%; font-size:11px; padding:2px; border:1px solid #cbd5e0; border-radius:3px; background-color: ${s.tipo ? '#ebf8ff' : '#fff'};" onchange="atualizarTipoBloco(${s.id}, this.value)">
                                <option value="">🔓 Livre (Prof. Escolhe)</option>
                                ${data.tiposHorarioFixo.map(t => `<option value="${t.id}" ${s.tipo === t.id ? 'selected' : ''}>${t.nome} (Fixo)</option>`).join('')}
                            </select>
                        </div>
                    `).join('') : '<p style="font-size: 12px; color: #a0aec0; text-align: center; padding: 10px;">--</p>'}
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;
    document.getElementById('horariosGestor').innerHTML = html;
}

// --- GERENCIADOR DE TIPOS DE HORÁRIO ---
function abrirGerenciadorTiposHorario() {
    const html = `
        <div class="card">
            <button class="btn btn-secondary" onclick="renderHorariosGestor()">← Voltar</button>
            <h2 style="margin-top:15px;">⚙️ Gerenciar Tipos de Horário Fixo</h2>
            <p style="color:#666;">Cadastre opções como Almoço, Café, Reunião, etc. para travar na grade.</p>
            
            <div style="display:flex; gap:10px; margin-bottom:20px; background:#f7fafc; padding:15px; border-radius:8px;">
                <input type="text" id="novoTipoNome" placeholder="Nome (ex: 🧘 Yoga)" style="flex-grow:1;">
                <button class="btn btn-success" onclick="adicionarTipoHorario()">+ Adicionar</button>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                ${data.tiposHorarioFixo.map((t, index) => `
                    <div style="border:1px solid #e2e8f0; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; background:white;">
                        <span>${t.nome}</span>
                        <button class="btn btn-sm btn-danger" onclick="removerTipoHorario(${index})">🗑️</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    document.getElementById('horariosGestor').innerHTML = html;
}

function adicionarTipoHorario() {
    const nome = document.getElementById('novoTipoNome').value.trim();
    if (!nome) return;
    const id = 'custom_' + Date.now();
    data.tiposHorarioFixo.push({ id, nome });
    persistirDados();
    abrirGerenciadorTiposHorario();
}

function removerTipoHorario(index) {
    if (!confirm('Remover este tipo?')) return;
    data.tiposHorarioFixo.splice(index, 1);
    persistirDados();
    abrirGerenciadorTiposHorario();
}

// --- DIAS ATÍPICOS (EXCEÇÕES) ---

function abrirGerenciadorDiasAtipicos() {
    const html = `
        <div class="card" style="border-left: 5px solid #ed8936;">
            <button class="btn btn-secondary" onclick="renderHorariosGestor()">← Voltar para Grade Padrão</button>
            <h2 style="margin-top:15px; color:#c05621;">📅 Configurar Dia Atípico</h2>
            <p style="color:#666;">Use para dias com horários diferentes (Ex: Conselho, Eventos, Provas).</p>

            <div style="margin: 20px 0; padding: 15px; background: #fffaf0; border: 1px solid #ed8936; border-radius: 8px;">
                <label style="font-weight:bold;">Selecione a Data:</label>
                <div style="display:flex; gap:10px; margin-top:5px;">
                    <input type="date" id="dataAtipica" onchange="carregarDiaAtipico()" style="padding:8px;">
                    <button class="btn btn-primary" onclick="carregarDiaAtipico()">Carregar</button>
                </div>
            </div>

            <div id="editorDiaAtipico" style="display:none;">
                <!-- Conteúdo carregado via JS -->
            </div>
        </div>
    `;
    document.getElementById('horariosGestor').innerHTML = html;
}

function carregarDiaAtipico() {
    const dataStr = document.getElementById('dataAtipica').value;
    if (!dataStr) return;

    const container = document.getElementById('editorDiaAtipico');
    const excecoes = data.gradeHorariaExcecoes || [];
    const excecaoExistente = excecoes.find(e => e.data === dataStr);

    // Se não existe exceção, pegamos a grade padrão do dia da semana como base
    let blocos = [];
    let isNovo = true;

    if (excecaoExistente) {
        blocos = excecaoExistente.blocos;
        isNovo = false;
    } else {
        // Pega dia da semana (0-6, ajusta para 1-5)
        // Note: input date é YYYY-MM-DD. new Date() pode ter fuso, melhor usar split
        const parts = dataStr.split('-');
        const dateObj = new Date(parts[0], parts[1]-1, parts[2]);
        const diaSemana = dateObj.getDay(); // 0=Dom, 1=Seg...
        
        // Copia a grade padrão para editar
        blocos = (data.gradeHoraria || [])
            .filter(g => g.diaSemana == diaSemana)
            .map(g => ({ ...g, id: Date.now() + Math.random() })); // Novos IDs para não alterar a padrão
    }

    // Renderiza editor simples
    let html = `
        <h3 style="border-bottom:1px solid #eee; padding-bottom:5px;">Editando: ${formatDate(dataStr)} ${isNovo ? '(Novo)' : '(Salvo)'}</h3>
        
        <div id="listaBlocosAtipicos">
            ${blocos.map((b, idx) => `
                <div class="bloco-atipico-item" style="display:flex; gap:10px; align-items:center; margin-bottom:10px; background:white; padding:10px; border:1px solid #ddd; border-radius:5px;">
                    <input type="time" class="inicio" value="${b.inicio}">
                    <span>até</span>
                    <input type="time" class="fim" value="${b.fim}">
                    <select class="tipo"><option value="">Livre</option>${data.tiposHorarioFixo.map(t => `<option value="${t.id}" ${b.tipo === t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}</select>
                    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">🗑️</button>
                </div>
            `).join('')}
        </div>

        <button class="btn btn-secondary btn-sm" onclick="adicionarBlocoAtipicoUI()">+ Adicionar Horário</button>
        
        <div style="margin-top:20px; border-top:1px solid #eee; padding-top:15px; display:flex; justify-content:flex-end; gap:10px;">
            ${!isNovo ? `<button class="btn btn-danger" onclick="excluirDiaAtipico('${dataStr}')">Restaurar Padrão</button>` : ''}
            <button class="btn btn-success" onclick="salvarDiaAtipico('${dataStr}')">💾 Salvar Exceção</button>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

function adicionarBlocoAtipicoUI() {
    const div = document.createElement('div');
    div.className = 'bloco-atipico-item';
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:10px; background:white; padding:10px; border:1px solid #ddd; border-radius:5px;";
    div.innerHTML = `
        <input type="time" class="inicio"> <span>até</span> <input type="time" class="fim">
        <select class="tipo"><option value="">Livre</option>${data.tiposHorarioFixo.map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}</select>
        <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">🗑️</button>
    `;
    document.getElementById('listaBlocosAtipicos').appendChild(div);
}

function salvarDiaAtipico(dataStr) {
    const itens = document.querySelectorAll('.bloco-atipico-item');
    const novosBlocos = [];

    itens.forEach(div => {
        const inicio = div.querySelector('.inicio').value;
        const fim = div.querySelector('.fim').value;
        const tipo = div.querySelector('.tipo').value;
        if (inicio && fim) {
            novosBlocos.push({ id: Date.now() + Math.random(), inicio, fim, tipo, diaSemana: -1 }); // diaSemana -1 indica exceção
        }
    });

    if (!data.gradeHorariaExcecoes) data.gradeHorariaExcecoes = [];
    
    // Remove anterior se houver
    data.gradeHorariaExcecoes = data.gradeHorariaExcecoes.filter(e => e.data !== dataStr);
    
    // Adiciona novo
    data.gradeHorariaExcecoes.push({
        data: dataStr,
        blocos: novosBlocos.sort((a,b) => a.inicio.localeCompare(b.inicio))
    });

    persistirDados();
    alert('Configuração para o dia ' + formatDate(dataStr) + ' salva com sucesso!');
    carregarDiaAtipico(); // Recarrega para atualizar botões
}

function excluirDiaAtipico(dataStr) {
    if (!confirm('Deseja remover a configuração específica deste dia e voltar a usar a grade semanal padrão?')) return;
    
    if (data.gradeHorariaExcecoes) {
        data.gradeHorariaExcecoes = data.gradeHorariaExcecoes.filter(e => e.data !== dataStr);
        persistirDados();
        alert('Dia restaurado para o padrão.');
        carregarDiaAtipico();
    }
}

function salvarGradeLote() {
    const inicio = document.getElementById('loteInicio').value;
    const fim = document.getElementById('loteFim').value;
    const checks = document.querySelectorAll('.lote-dia:checked');

    if (!inicio || !fim) return alert('Defina o horário de início e fim.');
    if (inicio >= fim) return alert('O horário de fim deve ser maior que o início.');
    if (checks.length === 0) return alert('Selecione pelo menos um dia.');

    if (!data.gradeHoraria) data.gradeHoraria = [];

    checks.forEach(chk => {
        data.gradeHoraria.push({ 
            id: Date.now() + Math.random(), 
            diaSemana: parseInt(chk.value), 
            inicio, 
            fim 
        });
    });
    
    persistirDados();
    renderHorariosGestor();
}

function atualizarTipoBloco(id, valor) {
    const bloco = data.gradeHoraria.find(g => g.id == id);
    if (bloco) {
        bloco.tipo = valor; // Salva o tipo fixo (ex: 'tutoria', 'almoco') ou vazio
        persistirDados();
        // Re-renderiza para atualizar a cor do select
        renderHorariosGestor();
    }
}

function atualizarLabelBloco(id, valor) {
    const bloco = data.gradeHoraria.find(g => g.id == id);
    if (bloco) {
        bloco.label = valor;
        persistirDados();
    }
}

function removerBlocoHorario(id) {
    if (confirm('Remover este bloco?')) {
        data.gradeHoraria = data.gradeHoraria.filter(g => g.id !== id);
        persistirDados();
        renderHorariosGestor();
    }
}

// --- IMPORTAÇÃO EM MASSA (ESTUDANTES) ---

function abrirModalImportacaoMassa() {
    // Cria o modal dinamicamente se não existir
    if (!document.getElementById('modalImportacaoMassa')) {
        const div = document.createElement('div');
        div.id = 'modalImportacaoMassa';
        div.className = 'modal';
        div.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <h3>📂 Importação em Massa de Estudantes</h3>
                <p style="font-size:13px; color:#666;">Selecione os arquivos CSV de cada turma. O sistema tentará identificar a turma pelo nome do arquivo.</p>
                
                <div style="margin: 20px 0; padding: 15px; background: #f7fafc; border: 2px dashed #cbd5e0; text-align: center;">
                    <input type="file" id="filesMassa" multiple accept=".csv" onchange="analisarArquivosMassa()">
                    <p style="margin-top:10px; font-size:12px;">Formatos: .csv (separado por ponto e vírgula)</p>
                </div>

                <div id="previewMassa" style="max-height: 200px; overflow-y: auto; margin-bottom: 20px; border: 1px solid #e2e8f0; display:none;">
                    <!-- Lista de arquivos e turmas detectadas -->
                </div>

                <div style="display:flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-secondary" onclick="closeModal('modalImportacaoMassa')">Cancelar</button>
                    <button class="btn btn-success" id="btnConfirmarMassa" onclick="processarImportacaoMassa()" disabled>Confirmar e Atualizar</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }
    
    document.getElementById('filesMassa').value = '';
    document.getElementById('previewMassa').style.display = 'none';
    document.getElementById('btnConfirmarMassa').disabled = true;
    showModal('modalImportacaoMassa');
}

let mapaArquivosTurmas = []; // Armazena { file, turmaId }

function analisarArquivosMassa() {
    const files = document.getElementById('filesMassa').files;
    const preview = document.getElementById('previewMassa');
    const btn = document.getElementById('btnConfirmarMassa');
    const turmas = data.turmas || [];

    if (files.length === 0) return;

    mapaArquivosTurmas = [];
    let html = '<table style="width:100%; font-size:12px;"><thead><tr><th>Arquivo</th><th>Turma Detectada</th></tr></thead><tbody>';

    // Função auxiliar para normalizar strings para comparação (remove acentos, espaços, lowercase)
    const normalize = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

    Array.from(files).forEach(file => {
        const nomeArquivo = normalize(file.name.replace('.csv', ''));
        
        // Tenta encontrar a turma que mais se parece com o nome do arquivo
        // Ex: Arquivo "6A.csv" deve bater com Turma "6º Ano A" ou "6A"
        const turmaMatch = turmas.find(t => {
            const nomeTurma = normalize(t.nome);
            return nomeTurma.includes(nomeArquivo) || nomeArquivo.includes(nomeTurma);
        });

        if (turmaMatch) {
            mapaArquivosTurmas.push({ file, turmaId: turmaMatch.id });
            html += `<tr><td>${file.name}</td><td style="color:green;">✅ ${turmaMatch.nome}</td></tr>`;
        } else {
            mapaArquivosTurmas.push({ file, turmaId: null });
            html += `<tr><td>${file.name}</td><td style="color:red;">❌ Não identificada</td></tr>`;
        }
    });

    html += '</tbody></table>';
    preview.innerHTML = html;
    preview.style.display = 'block';
    
    // Habilita botão se pelo menos uma turma foi identificada
    btn.disabled = mapaArquivosTurmas.every(m => m.turmaId === null);
}

async function processarImportacaoMassa() {
    if (!confirm('Isso atualizará a lista de estudantes. Alunos existentes em outras turmas serão movidos (remanejados) para as novas turmas detectadas. Continuar?')) return;

    let processados = 0;
    let novos = 0;
    let remanejados = 0;

    if (!data.estudantes) data.estudantes = [];

    for (const item of mapaArquivosTurmas) {
        if (!item.turmaId) continue; // Pula arquivos sem turma

        const text = await item.file.text(); // Leitura assíncrona do arquivo
        const lines = text.split('\n');
        
        // Detecta colunas
        let idxNome = -1;
        let idxStatus = -1;
        
        // Procura cabeçalho nas primeiras 10 linhas
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const cols = lines[i].split(';').map(c => c.trim().toLowerCase()); // CSV padrão excel/pt-br usa ;
            if (cols.includes('nome do aluno')) {
                idxNome = cols.indexOf('nome do aluno');
                // Tenta achar status ou situação
                idxStatus = cols.findIndex(c => c.includes('situação') || c.includes('situacao') || c.includes('status'));
                break;
            }
        }

        if (idxNome === -1) continue; // Arquivo inválido

        // Processa linhas
        for (const line of lines) {
            const parts = line.split(';');
            if (parts.length <= idxNome) continue;

            const nome = parts[idxNome].trim().toUpperCase(); // Normaliza nome para Upper
            if (!nome || nome.includes('NOME DO ALUNO')) continue; // Pula cabeçalho ou vazio

            const status = (idxStatus !== -1 && parts.length > idxStatus) ? parts[idxStatus].trim() : 'Ativo';

            // LÓGICA DE UPSERT / REMANEJAMENTO
            const estudanteExistente = data.estudantes.find(e => e.nome_completo.trim().toUpperCase() === nome);

            if (estudanteExistente) {
                // Evita duplicidade/atualização se não houve mudança
                if (estudanteExistente.id_turma == item.turmaId && estudanteExistente.status === status) {
                    continue;
                }

                // Se já existe, atualiza a turma (Remanejamento) e status
                if (estudanteExistente.id_turma != item.turmaId) remanejados++;
                estudanteExistente.id_turma = item.turmaId;
                estudanteExistente.status = status;
            } else {
                // Novo estudante
                data.estudantes.push({
                    id: Date.now() + Math.floor(Math.random() * 1000), // ID único inteiro
                    id_turma: item.turmaId,
                    nome_completo: nome, // Salva como veio, mas a busca é case insensitive
                    status: status
                });
                novos++;
            }
            processados++;
        }
    }

    persistirDados();
    closeModal('modalImportacaoMassa');
    alert(`Processamento Concluído!\n\nProcessados: ${processados}\nNovos Alunos: ${novos}\nRemanejados: ${remanejados}`);
    
    // Atualiza a tela se estiver em Turmas
    if (document.getElementById('turmas').classList.contains('active')) {
        renderTurmas();
    }
}

// --- TUTORIAS (GESTOR) ---

async function renderTutoriasGestor() {
    const container = document.getElementById('tutoriasGestor');
    if (!container) return;
    
    container.innerHTML = '<div class="card"><p>🔄 Carregando dados do sistema...</p></div>';

    try {
        // 1. Buscar todos os usuários
        const usersData = await getData('system', 'users_list');
        const users = (usersData && usersData.list) ? usersData.list : [];

        // 2. Identificar ID da escola atual
        const mySchoolId = currentUser.schoolId ? String(currentUser.schoolId) : '';

        // 3. Filtrar professores (Da escola e Sem Vínculo/Antigos)
        const professoresDaEscola = [];
        const professoresSemVinculo = [];

        users.forEach(u => {
            if (u.role === 'super_admin') return;
            
            const uSchoolId = u.schoolId ? String(u.schoolId) : '';
            
            if (uSchoolId === mySchoolId) {
                professoresDaEscola.push(u);
            } else if (!uSchoolId) {
                // Usuários antigos ou sem escola definida
                professoresSemVinculo.push(u);
            }
        });

        // 4. Renderizar HTML
        const html = `
            <div class="card">
                <h2>🎓 Acompanhamento de Tutorias</h2>
                <p style="color:#666; margin-bottom:20px;">
                    Gestor: <strong>${currentUser.nome}</strong> | Escola ID: <strong>${mySchoolId || 'Não definido'}</strong>
                </p>
                
                <!-- PROFESSORES VINCULADOS -->
                ${professoresDaEscola.length > 0 ? `
                    <h3 style="color: #2c5282; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Professores da Escola</h3>
                    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
                        ${professoresDaEscola.map(p => `
                            <div style="border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: #f7fafc; cursor: pointer; transition: all 0.2s;" 
                                 onmouseover="this.style.background='#ebf8ff'; this.style.borderColor='#3182ce';" 
                                 onmouseout="this.style.background='#f7fafc'; this.style.borderColor='#e2e8f0';"
                                 onclick="verTutoradosProfessor('${p.id}', '${p.nome}')">
                                <div style="font-weight: bold; color: #2c5282; font-size: 16px;">${p.nome}</div>
                                <div style="font-size: 12px; color: #718096; margin-top: 5px;">${p.email}</div>
                                <div style="margin-top: 10px; text-align: right; font-size: 12px; color: #3182ce;">Ver Tutorados →</div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="empty-state">Nenhum professor vinculado oficialmente.</p>'}

                <!-- PROFESSORES SEM VÍNCULO (ANTIGOS) -->
                ${professoresSemVinculo.length > 0 ? `
                    <div style="margin-top: 30px; border-top: 2px dashed #cbd5e0; padding-top: 20px;">
                        <h3 style="color: #d69e2e;">⚠️ Professores Sem Vínculo (Antigos)</h3>
                        <p style="font-size:13px; color:#666; margin-bottom:15px;">Estes usuários não têm escola definida. Clique em "Vincular" para trazê-los para sua escola.</p>
                        
                        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
                            ${professoresSemVinculo.map(p => `
                                <div style="border: 1px dashed #ed8936; padding: 15px; border-radius: 8px; background: #fffaf0;">
                                    <div style="font-weight: bold; color: #744210; font-size: 16px;">${p.nome}</div>
                                    <div style="font-size: 12px; color: #744210; margin-top: 5px;">${p.email}</div>
                                    <div style="margin-top: 10px; display:flex; gap:5px;">
                                        <button class="btn btn-sm btn-warning" onclick="vincularProfessor('${p.id}')" style="width:100%;">🔗 Vincular à Escola</button>
                                        <button class="btn btn-sm btn-secondary" onclick="verTutoradosProfessor('${p.id}', '${p.nome}')">👁️ Ver</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- DIAGNÓSTICO (Se ambos vazios) -->
                ${(professoresDaEscola.length === 0 && professoresSemVinculo.length === 0) ? `
                    <div class="empty-state" style="margin-top:20px; background:#fff5f5; border:1px solid #feb2b2; color:#c53030;">
                        <p><strong>Diagnóstico:</strong> Nenhum professor encontrado no sistema (nem vinculado, nem solto).</p>
                    </div>
                    <div style="margin-top: 20px; overflow-x: auto;">
                        <table style="width:100%; font-size:12px; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #edf2f7;">
                                    <th style="padding:8px; border:1px solid #e2e8f0;">Nome</th>
                                    <th style="padding:8px; border:1px solid #e2e8f0;">Email</th>
                                    <th style="padding:8px; border:1px solid #e2e8f0;">Escola ID (Atual)</th>
                                    <th style="padding:8px; border:1px solid #e2e8f0;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.filter(u => u.role !== 'super_admin').map(u => {
                                    const uSchoolId = u.schoolId ? String(u.schoolId) : '';
                                    const match = uSchoolId === mySchoolId;
                                    return `
                                    <tr style="background: ${match ? '#f0fff4' : '#fff'};">
                                        <td style="padding:8px; border:1px solid #e2e8f0;">${u.nome}</td>
                                        <td style="padding:8px; border:1px solid #e2e8f0;">${u.email}</td>
                                        <td style="padding:8px; border:1px solid #e2e8f0;"><strong>${uSchoolId || '(Vazio)'}</strong></td>
                                        <td style="padding:8px; border:1px solid #e2e8f0; color: ${match ? 'green' : 'red'}; font-weight:bold;">
                                            ${match ? '✅ Compatível' : '❌ Diferente'}
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="card"><h3 style="color:red">Erro Técnico:</h3><p>${e.message}</p></div>`;
    }
}

async function vincularProfessor(id) {
    if (!confirm('Deseja vincular este professor à sua escola atual? Ele passará a aparecer na lista principal.')) return;
    
    try {
        const usersData = await getData('system', 'users_list');
        const users = (usersData && usersData.list) ? usersData.list : [];
        const user = users.find(u => u.id == id);
        
        if (user) {
            user.schoolId = currentUser.schoolId; // Atualiza o ID
            await saveData('system', 'users_list', { list: users });
            alert(`Professor ${user.nome} vinculado com sucesso!`);
            renderTutoriasGestor(); // Recarrega a tela
        } else {
            alert('Usuário não encontrado.');
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao vincular: ' + e.message);
    }
}

async function verTutoradosProfessor(profId, profNome) {
    const container = document.getElementById('tutoriasGestor');
    container.innerHTML = '<div class="card"><p>Carregando dados do professor...</p></div>';

    // Busca os dados específicos do professor (app_data_ID)
    const key = 'app_data_' + profId;
    const profData = await getData('app_data', key);
    const tutorados = (profData && profData.tutorados) ? profData.tutorados : [];

    const html = `
        <div class="card">
            <button class="btn btn-secondary" onclick="renderTutoriasGestor()">← Voltar para Professores</button>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <h2 style="margin: 0;">Tutorados de: ${profNome}</h2>
                <button class="btn btn-primary" onclick="imprimirTodosRelatoriosTutoriaGestor('${profId}', '${profNome}')">🖨️ Imprimir Todos</button>
            </div>
            
            ${tutorados.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Estudante</th>
                            <th>Turma</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tutorados.map(t => `
                            <tr>
                                <td><strong>${t.nome_estudante}</strong></td>
                                <td>${t.turma}</td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="verRelatorioTutoriaAluno('${profId}', '${profNome}', '${t.id}', '${t.nome_estudante}')">📄 Ver Relatório</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<p class="empty-state">Este professor não possui tutorados cadastrados.</p>'}
        </div>
    `;

    container.innerHTML = html;
}

async function verRelatorioTutoriaAluno(profId, profNome, alunoId, alunoNome) {
    const container = document.getElementById('tutoriasGestor');
    container.innerHTML = '<div class="card"><p>Gerando relatório...</p></div>';

    // Busca dados novamente para garantir frescor
    const key = 'app_data_' + profId;
    const profData = await getData('app_data', key);
    const encontros = (profData && profData.encontros) ? profData.encontros : []; // Assumindo que encontros são salvos aqui
    const tutorados = (profData && profData.tutorados) ? profData.tutorados : [];
    const tutoradoInfo = tutorados.find(t => t.id == alunoId);
    
    // Filtra encontros deste aluno (encontros devem ter id_tutorado ou similar, adaptando conforme app.js)
    // Nota: app.js usa 'encontroTutorado' (value=id) no modal. Vamos assumir que salva como 'tutoradoId' ou similar.
    // Como o app.js original tinha apenas um alert no salvarEncontro, assumiremos que se fosse salvo, teria essa estrutura.
    // Para compatibilidade com o modalNovoEncontro do app.js, vamos supor que o objeto salvo tenha { tutoradoId: id, ... }
    // Se o app.js não salva, isso virá vazio, mas a estrutura está pronta.
    
    // Vamos injetar o HTML base e depois filtrar via JS local para não recarregar tudo
    const currentYear = new Date().getFullYear();
    
    const calcIdade = (dn) => {
        if(!dn) return '';
        const today = new Date();
        const bd = new Date(dn);
        let age = today.getFullYear() - bd.getFullYear();
        const m = today.getMonth() - bd.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
        return age;
    };

    const infoHtml = tutoradoInfo ? `
        <div style="background:#f7fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0; margin-top:15px; font-size:13px;">
            <table style="width:100%; border-collapse:collapse;">
                <tr>
                    <td style="padding-bottom:5px;"><strong>Data Nasc:</strong> ${formatDate(tutoradoInfo.data_nascimento)} (${calcIdade(tutoradoInfo.data_nascimento)} anos)</td>
                    <td style="padding-bottom:5px;"><strong>Tel. Aluno:</strong> ${tutoradoInfo.telefone_aluno || '-'}</td>
                </tr>
                <tr>
                    <td style="padding-bottom:5px;"><strong>Responsável:</strong> ${tutoradoInfo.nome_responsavel || '-'}</td>
                    <td style="padding-bottom:5px;"><strong>Tel. Resp:</strong> ${tutoradoInfo.telefone_responsavel || '-'}</td>
                </tr>
            </table>
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #cbd5e0;">
                <p style="margin:3px 0;"><strong>Projeto de Vida:</strong> ${tutoradoInfo.projeto_vida || '-'}</p>
                <p style="margin:3px 0;"><strong>Clube:</strong> ${tutoradoInfo.clube_1 || '-'} / ${tutoradoInfo.clube_2 || '-'}</p>
                <p style="margin:3px 0;"><strong>Eletiva:</strong> ${tutoradoInfo.eletiva_1 || '-'} / ${tutoradoInfo.eletiva_2 || '-'}</p>
            </div>
        </div>
    ` : '';

    const html = `
        <div class="card">
            <div class="no-print">
                <button class="btn btn-secondary" onclick="verTutoradosProfessor('${profId}', '${profNome}')">← Voltar para Lista</button>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; border-bottom: 1px solid #eee; padding-bottom:10px;">
                <div>
                    <h2 style="margin:0;">Relatório de Tutoria</h2>
                    <div style="color:#666;"><strong>Professor:</strong> ${profNome} | <strong>Estudante:</strong> ${alunoNome}</div>
                </div>
                <div class="no-print" style="display:flex; gap:10px; align-items:center;">
                    <select id="filtroSemestre" onchange="filtrarRelatorioTutoriaUI()" style="margin:0; padding:8px;">
                        <option value="1">1º Semestre ${currentYear}</option>
                        <option value="2">2º Semestre ${currentYear}</option>
                        <option value="todos">Todo o Ano</option>
                    </select>
                    <button class="btn btn-primary" onclick="imprimirRelatorioTutoriaGestorSimplificado('${profNome}', '${alunoNome}')">🖨️ Imprimir</button>
                </div>
            </div>

            ${infoHtml}

            <div id="listaEncontrosRelatorio" style="margin-top: 20px;">
                <!-- Preenchido via JS -->
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Armazena dados temporariamente no DOM para filtragem
    // Filtra encontros onde o ID do tutorado bate (pode ser string ou number, comparamos solto)
    const encontrosAluno = encontros.filter(e => e.tutoradoId == alunoId || e.encontroTutorado == alunoId); 
    container.dataset.encontros = JSON.stringify(encontrosAluno);
    container.dataset.tutoradoInfo = JSON.stringify(tutoradoInfo || {});
    
    filtrarRelatorioTutoriaUI();
}

function filtrarRelatorioTutoriaUI() {
    const container = document.getElementById('tutoriasGestor');
    const listaDiv = document.getElementById('listaEncontrosRelatorio');
    const semestre = document.getElementById('filtroSemestre').value;
    const encontros = JSON.parse(container.dataset.encontros || '[]');

    const filtrados = encontros.filter(e => {
        if (semestre === 'todos') return true;
        const d = new Date(e.data);
        const mes = d.getMonth(); // 0-11
        if (semestre === '1') return mes <= 5; // Jan-Jun
        if (semestre === '2') return mes >= 6; // Jul-Dez
        return true;
    });

    filtrados.sort((a,b) => new Date(b.data) - new Date(a.data));

    if (filtrados.length === 0) {
        listaDiv.innerHTML = '<p class="empty-state">Nenhum registro de encontro encontrado para este período.</p>';
        return;
    }

    listaDiv.innerHTML = filtrados.map(e => `
        <div style="border: 1px solid #cbd5e0; padding: 15px; border-radius: 6px; margin-bottom: 10px; page-break-inside: avoid;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>📅 ${formatDate(e.data)}</strong>
                <span style="font-size:12px; background:#edf2f7; padding:2px 8px; border-radius:10px;">${e.tema || 'Sem tema'}</span>
            </div>
            <p style="white-space: pre-wrap; color: #4a5568; margin:0;">${e.resumo || ''}</p>
        </div>
    `).join('');
}

function imprimirRelatorioTutoriaGestorSimplificado(profNome, alunoNome) {
    const container = document.getElementById('tutoriasGestor');
    const semestreVal = document.getElementById('filtroSemestre').value;
    const encontros = JSON.parse(container.dataset.encontros || '[]');
    const t = JSON.parse(container.dataset.tutoradoInfo || '{}');
    
    const calcIdade = (dn) => {
        if(!dn) return '';
        const today = new Date();
        const bd = new Date(dn);
        let age = today.getFullYear() - bd.getFullYear();
        const m = today.getMonth() - bd.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
        return age;
    };
    
    // Filtra conforme seleção na tela
    const currentYear = new Date().getFullYear();
    const filtrados = encontros.filter(e => {
        if (semestreVal === 'todos') return true;
        const d = new Date(e.data);
        const mes = d.getMonth();
        if (semestreVal === '1') return mes <= 5;
        if (semestreVal === '2') return mes >= 6;
        return true;
    });
    
    // Ordenação (Mais antigo para mais novo para leitura sequencial)
    filtrados.sort((a,b) => new Date(a.data) - new Date(b.data));

    // Nome da Escola (Pega do cabeçalho da aplicação)
    const nomeEscola = document.querySelector('header h1') ? document.querySelector('header h1').textContent.replace('SisProf - ', '') : 'Escola';
    
    // Texto do Semestre
    let semLabel = semestreVal === 'todos' ? `Ano de ${currentYear}` : `${semestreVal}º Semestre de ${currentYear}`;

    const html = `
        <html>
        <head>
            <title>Relatório de Tutoria</title>
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
                <div class="sub-header">Relatório de Tutoria - ${semLabel}</div>
            </div>
            
            <div class="info">
                <table style="width:100%; border-collapse:collapse;">
                    <tr><td colspan="2"><strong>Professor Tutor:</strong> ${profNome}</td></tr>
                    <tr><td colspan="2"><strong>Estudante Tutorado:</strong> ${alunoNome}</td></tr>
                    <tr>
                        <td><strong>Data Nasc:</strong> ${formatDate(t.data_nascimento)} (${calcIdade(t.data_nascimento)} anos)</td>
                        <td><strong>Tel. Aluno:</strong> ${t.telefone_aluno || '-'}</td>
                    </tr>
                    <tr>
                        <td><strong>Responsável:</strong> ${t.nome_responsavel || '-'}</td>
                        <td><strong>Tel. Resp:</strong> ${t.telefone_responsavel || '-'}</td>
                    </tr>
                </table>
                <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;">
                    <p style="margin:2px 0;"><strong>Projeto de Vida:</strong> ${t.projeto_vida || '-'}</p>
                    <p style="margin:2px 0;"><strong>Clube:</strong> ${t.clube_1 || '-'} / ${t.clube_2 || '-'}</p>
                    <p style="margin:2px 0;"><strong>Eletiva:</strong> ${t.eletiva_1 || '-'} / ${t.eletiva_2 || '-'}</p>
                </div>
            </div>

            ${filtrados.length > 0 ? filtrados.map(e => `
                <div class="registro">
                    <div class="registro-titulo">${e.tema || 'Sem Título'}</div>
                    <div class="registro-texto">${e.resumo || ''}</div>
                </div>
            `).join('') : '<p style="text-align:center; font-style:italic;">Nenhum registro encontrado para este período.</p>'}

            <script>window.print();</script>
        </body>
        </html>
    `;
    
    const win = window.open('', '', 'width=900,height=800');
    win.document.write(html);
    win.document.close();
}

async function imprimirTodosRelatoriosTutoriaGestor(profId, profNome) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    const defaultSem = currentMonth < 6 ? 1 : 2;
    
    const input = prompt(`Gerar relatório em massa.\nDigite o Semestre e Ano (ex: ${defaultSem}/${currentYear}):`, `${defaultSem}/${currentYear}`);
    if (!input) return;
    
    const parts = input.split('/');
    if (parts.length !== 2) return alert('Formato inválido.');
    
    const semestre = parseInt(parts[0]);
    const ano = parseInt(parts[1]);

    // Busca dados
    const key = 'app_data_' + profId;
    const profData = await getData('app_data', key);
    const tutorados = (profData && profData.tutorados) ? profData.tutorados : [];
    const encontros = (profData && profData.encontros) ? profData.encontros : [];

    if (tutorados.length === 0) return alert('Nenhum tutorado encontrado para este professor.');

    // Ordena alunos alfabeticamente
    tutorados.sort((a,b) => a.nome_estudante.localeCompare(b.nome_estudante));

    // Nome da Escola
    const nomeEscola = document.querySelector('header h1') ? document.querySelector('header h1').textContent.replace('SisProf - ', '') : 'Escola';
    const semLabel = `${semestre}º Semestre de ${ano}`;

    let html = `
        <html>
        <head>
            <title>Relatórios de Tutoria - ${profNome}</title>
            <style>
                body { font-family: Arial, sans-serif; color: #000; line-height: 1.4; }
                .page-break { page-break-after: always; padding: 40px; }
                h1 { text-align: center; font-size: 20px; margin: 0 0 5px 0; text-transform: uppercase; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                .sub-header { font-size: 14px; margin-top: 5px; }
                .info { margin-bottom: 20px; font-size: 14px; border: 1px solid #ccc; padding: 10px; border-radius: 5px; background: #f9f9f9; }
                .registro { margin-bottom: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
                .registro:last-child { border-bottom: none; }
                .registro-titulo { font-weight: bold; font-size: 14px; margin-bottom: 3px; }
                .registro-data { font-size: 12px; color: #555; margin-bottom: 5px; }
                .registro-texto { white-space: pre-wrap; text-align: justify; font-size: 13px; }
            </style>
        </head>
        <body>
    `;

    tutorados.forEach(t => {
        // Filtra encontros do aluno no período
        const calcIdade = (dn) => {
            if(!dn) return '';
            const today = new Date();
            const bd = new Date(dn);
            let age = today.getFullYear() - bd.getFullYear();
            const m = today.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
            return age;
        };

        const encontrosAluno = encontros.filter(e => {
            if (e.tutoradoId != t.id && e.encontroTutorado != t.id) return false;
            const d = new Date(e.data);
            if (d.getFullYear() !== ano) return false;
            const mes = d.getMonth();
            if (semestre === 1) return mes <= 5;
            if (semestre === 2) return mes >= 6;
            return false;
        }).sort((a,b) => new Date(a.data) - new Date(b.data));

        html += `<div class="page-break">
            <div class="header">
                <h1>${nomeEscola}</h1>
                <div class="sub-header">Relatório de Tutoria - ${semLabel}</div>
            </div>
            <div class="info">
                <table style="width:100%; border-collapse:collapse;">
                    <tr><td colspan="2"><strong>Professor Tutor:</strong> ${profNome}</td></tr>
                    <tr><td colspan="2"><strong>Estudante Tutorado:</strong> ${t.nome_estudante} (${t.turma})</td></tr>
                    <tr>
                        <td><strong>Data Nasc:</strong> ${formatDate(t.data_nascimento)} (${calcIdade(t.data_nascimento)} anos)</td>
                        <td><strong>Tel. Aluno:</strong> ${t.telefone_aluno || '-'}</td>
                    </tr>
                </table>
                <div style="margin-top:5px; padding-top:5px; border-top:1px dashed #ccc;">
                    <p style="margin:2px 0;"><strong>Projeto de Vida:</strong> ${t.projeto_vida || '-'}</p>
                </div>
            </div>
            ${encontrosAluno.length > 0 ? encontrosAluno.map(e => `<div class="registro"><div class="registro-data">📅 ${formatDate(e.data)}</div><div class="registro-titulo">${e.tema || 'Sem Título'}</div><div class="registro-texto">${e.resumo || ''}</div></div>`).join('') : '<p style="text-align:center; font-style:italic; color:#777;">Nenhum registro encontrado neste semestre.</p>'}
            <div style="margin-top:50px; border-top:1px solid #000; width:200px; text-align:center; font-size:10px; padding-top:5px;">Visto da Coordenação</div>
        </div>`;
    });

    html += `<script>window.print();</script></body></html>`;

    const win = window.open('', '', 'width=900,height=800');
    win.document.write(html);
    win.document.close();
}