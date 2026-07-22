// --- LÓGICA DO GESTOR ---

let currentRegistrosTab = 'administrativos'; // 'administrativos', 'busca_ativa', 'bimestres', 'arquivados' ou 'limpeza'
let currentBuscaAtivaSubTab = 'consecutive'; // 'consecutive', 'weekly', 'percentage'
let cacheBuscaAtiva = null;
let stateArqBimestre = 0;
let stateArqTurma = 0;
let stateArqNome = '';

function renderGestorPanel() {
    // Navegação de Gestor
    const nav = document.querySelector('nav');
    nav.innerHTML = `
        <button class="active" onclick="showScreen('dashboard', event)"><span class="icon">📊</span><span class="label">Dashboard Gestão</span></button>
        <button onclick="showScreen('turmas', event)"><span class="icon">👥</span><span class="label">Turmas</span></button>
        <button onclick="showScreen('registrosGestor', event)"><span class="icon">📂</span><span class="label">Registros</span></button>
        <button onclick="showScreen('ocorrenciasGestor', event)"><span class="icon">⚠️</span><span class="label">Ocorrências</span></button>
        <button onclick="showScreen('tutoriasGestor', event)"><span class="icon">🎓</span><span class="label">Tutorias</span></button>
        <button onclick="showScreen('notasOficiaisGestor', event)"><span class="icon">🧮</span><span class="label">Notas Oficiais</span></button>
        <button onclick="showScreen('aeeVisaoGeral', event)"><span class="icon">🌟</span><span class="label">Painel AEE</span></button>
        <button onclick="showScreen('horariosGestor', event)"><span class="icon">⏰</span><span class="label">Horários</span></button>
        <button onclick="showScreen('escolaGestor', event)"><span class="icon">🏫</span><span class="label">Escola</span></button>
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

    if (!document.getElementById('notasOficiaisGestor')) {
        const not = document.createElement('div');
        not.id = 'notasOficiaisGestor';
        not.className = 'screen';
        innerContainer.appendChild(not);
    }

    if (!document.getElementById('horariosGestor')) {
        const hor = document.createElement('div');
        hor.id = 'horariosGestor';
        hor.className = 'screen';
        innerContainer.appendChild(hor);
    }

    if (!document.getElementById('escolaGestor')) {
        const esc = document.createElement('div');
        esc.id = 'escolaGestor';
        esc.className = 'screen';
        innerContainer.appendChild(esc);
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
    const container = document.getElementById('registrosGestorContent');
    container.innerHTML = `
        <div id="arquivadosContainer">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <h2 style="margin: 0;">🗄️ Arquivo Histórico de Registros</h2>
                <button class="btn btn-primary" onclick="abrirNovoRegistroGestao()">+ Novo Registro</button>
            </div>
            
            <div class="card" style="background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 20px; padding: 15px;">
                <h4 style="margin-top: 0; color: #2c5282; margin-bottom: 10px;">Filtros</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                    <label style="flex: 1; min-width: 150px;">
                        <span style="font-size: 12px; font-weight: bold;">Bimestre:</span><br>
                        <select id="filtroArqBimestre" onchange="atualizarFiltrosArquivados()" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e0;">
                            <option value="0" ${stateArqBimestre === 0 ? 'selected' : ''}>Todos</option>
                            <option value="1" ${stateArqBimestre === 1 ? 'selected' : ''}>1º Bimestre</option>
                            <option value="2" ${stateArqBimestre === 2 ? 'selected' : ''}>2º Bimestre</option>
                            <option value="3" ${stateArqBimestre === 3 ? 'selected' : ''}>3º Bimestre</option>
                            <option value="4" ${stateArqBimestre === 4 ? 'selected' : ''}>4º Bimestre</option>
                        </select>
                    </label>
                    <label style="flex: 1; min-width: 150px;">
                        <span style="font-size: 12px; font-weight: bold;">Turma:</span><br>
                        <select id="filtroArqTurma" onchange="atualizarFiltrosArquivados()" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e0;">
                            <option value="0" ${stateArqTurma === 0 ? 'selected' : ''}>Todas</option>
                            ${(data.turmas || []).map(t => `<option value="${t.id}" ${stateArqTurma == t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}
                        </select>
                    </label>
                    <label style="flex: 2; min-width: 200px;">
                        <span style="font-size: 12px; font-weight: bold;">Buscar por Nome:</span><br>
                        <input type="text" id="filtroArqNome" value="${stateArqNome}" oninput="atualizarFiltrosArquivados()" placeholder="Digite o nome do estudante..." style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e0;">
                    </label>
                </div>
            </div>
            
            <div id="listaArquivadosContent"></div>
        </div>
    `;
    renderListaArquivados();
}

function atualizarFiltrosArquivados() {
    stateArqBimestre = parseInt(document.getElementById('filtroArqBimestre').value) || 0;
    stateArqTurma = parseInt(document.getElementById('filtroArqTurma').value) || 0;
    stateArqNome = document.getElementById('filtroArqNome').value.toLowerCase();
    renderListaArquivados();
}

function renderListaArquivados() {
    const registros = data.registrosAdministrativos || [];
    const configBimestres = data.configBimestres || [];

    const getBimestreParaData = (dataStr) => {
        const match = configBimestres.find(c => dataStr >= c.inicio && dataStr <= c.fim);
        return match ? match.bim : null;
    };

    // Processar todos os dados (incluindo vencidos)
    let lista = registros.map(r => {
        const estudante = (data.estudantes || []).find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
        const turma = (data.turmas || []).find(t => t.id == r.turmaId) || { nome: '?' };
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

        if (r.arquivado) {
            status = 'Arquivado';
            cor = '#718096';
        }

        return { ...r, estudanteNome: estudante.nome_completo, turmaNome: turma.nome, status, cor, bim };
    });

    if (stateArqBimestre > 0) lista = lista.filter(item => item.bim === stateArqBimestre);
    if (stateArqTurma > 0) lista = lista.filter(item => item.turmaId === stateArqTurma);
    if (stateArqNome) lista = lista.filter(item => item.estudanteNome.toLowerCase().includes(stateArqNome));

    // Agrupar por Bimestre e depois por Turma
    const grupos = {};
    lista.forEach(item => {
        const key = item.bim ? `${item.bim}º Bimestre` : 'Sem Bimestre / Férias';
        if (!grupos[key]) grupos[key] = {};
        if (!grupos[key][item.turmaNome]) grupos[key][item.turmaNome] = [];
        grupos[key][item.turmaNome].push(item);
    });

    const bimestresOrdenados = Object.keys(grupos).sort();

    const html = bimestresOrdenados.length > 0 ? bimestresOrdenados.map(bimKey => `
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
                                    <td>${getAeePrefix((data.estudantes || []).find(e => e.id == r.estudanteId))}${r.estudanteNome}</td>
                                    <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''} ${r.descricao ? `<br><small>${r.descricao}</small>` : ''}</td>
                                    <td>
                                        ${r.arquivado ? `<button class="btn btn-secondary btn-sm" onclick="desarquivarRegistroGestao(${r.id})" title="Reativar registro">↩️</button>` : ''}
                                        <button class="btn btn-danger btn-sm" onclick="removerRegistroGestao(${r.id})" title="Excluir permanentemente">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `).join('')}
            `).join('') : '<p class="empty-state">Nenhum registro histórico encontrado.</p>';
    document.getElementById('listaArquivadosContent').innerHTML = html;
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

async function renderAbaAlertasBuscaAtiva(forceRefresh = false) {
    const container = document.getElementById('registrosGestorContent');
    
    if (forceRefresh || !document.getElementById('resultadoBuscaAtiva')) {
        container.innerHTML = `
            <div class="card" style="margin-bottom: 15px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px;">
                <h4 style="margin-top: 0; color: #2c5282; margin-bottom: 15px;">Filtros de Busca Ativa</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                    <label>
                        <span style="font-size: 12px; font-weight: bold;">Vigência:</span><br>
                        <select id="filtroVigenciaBA" onchange="processarAlertasBuscaAtiva()" style="padding: 6px; border-radius: 4px; border: 1px solid #cbd5e0;">
                            <option value="total">Total (Ano Letivo)</option>
                            <option value="1">1º Bimestre</option>
                            <option value="2">2º Bimestre</option>
                            <option value="3">3º Bimestre</option>
                            <option value="4">4º Bimestre</option>
                        </select>
                    </label>
                    <label>
                        <span style="font-size: 12px; font-weight: bold;">Porcentagem Limite (Baixa Freq.):</span><br>
                        <input type="number" id="filtroPorcentagemBA" value="70" max="100" min="0" onchange="processarAlertasBuscaAtiva()" style="padding: 6px; width: 80px; border-radius: 4px; border: 1px solid #cbd5e0;"> %
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; padding-bottom: 6px;">
                        <input type="checkbox" id="filtroOcultarFaltososBA" onchange="processarAlertasBuscaAtiva()">
                        <span style="font-size: 13px; font-weight: bold; color: #4a5568;">Ocultar alunos já marcados como Faltosos</span>
                    </label>
                    <button class="btn btn-sm btn-secondary" onclick="renderAbaAlertasBuscaAtiva(true)">🔄 Atualizar Dados</button>
                </div>
            </div>
            <div id="resultadoBuscaAtiva">
                <p>Analisando dados de frequência de toda a escola... Isso pode levar um momento.</p>
            </div>
        `;
    }

    const resultadoDiv = document.getElementById('resultadoBuscaAtiva');

    if (forceRefresh || !cacheBuscaAtiva) {
        resultadoDiv.innerHTML = '<p>Analisando dados de frequência de toda a escola... Isso pode levar um momento.</p>';
        
        const allStudents = data.estudantes || [];
        const allTurmas = data.turmas || [];
        const schoolId = currentUser.schoolId;

        if (!schoolId) {
            resultadoDiv.innerHTML = '<p class="empty-state" style="color:red;">Erro: ID da escola não encontrado para o gestor.</p>';
            return;
        }

        const attendanceData = {}; 
        const daysByTurma = {}; 
        
        try {
            const usersData = await getData('system', 'users_list');
            const users = (usersData && usersData.list) ? usersData.list : [];
            const teachers = users.filter(u => u.schoolId === schoolId && u.role !== 'super_admin');
            
            const promises = teachers.map(async (t) => {
                const storageKey = (t.uid) ? 'app_data_' + t.uid : 'app_data_' + t.id;
                const profData = await getData('app_data', storageKey);
                return { teacherId: t.id, data: profData };
            });

            const results = await Promise.all(promises);

            results.forEach(res => {
                if (!res.data) return;

                if (res.data.registrosAula) {
                    res.data.registrosAula.forEach(r => {
                        const tProf = (res.data.turmas || []).find(t => t.id == r.id_turma);
                        const masterId = tProf ? tProf.masterId : null;
                        if (masterId) {
                            if (!daysByTurma[masterId]) daysByTurma[masterId] = new Set();
                            daysByTurma[masterId].add(r.data);
                        }
                    });
                }

                if (res.data.presencas) {
                    res.data.presencas.forEach(p => {
                        const studentMaster = allStudents.find(s => s.id == p.id_estudante);
                        const masterId = studentMaster ? studentMaster.id_turma : null;
                        
                        if (masterId) {
                            if (!daysByTurma[masterId]) daysByTurma[masterId] = new Set();
                            daysByTurma[masterId].add(p.data);
                        }

                        if (p.status === 'falta') {
                            if (!attendanceData[p.data]) attendanceData[p.data] = {};
                            if (!attendanceData[p.data][p.id_estudante]) attendanceData[p.data][p.id_estudante] = [];
                            
                            if (!attendanceData[p.data][p.id_estudante].includes(res.teacherId)) {
                                attendanceData[p.data][p.id_estudante].push(res.teacherId);
                            }
                        }
                    });
                }
            });

            cacheBuscaAtiva = {
                allStudents,
                allTurmas,
                attendanceData,
                daysByTurma
            };

        } catch (e) {
            console.error("Erro ao agregar dados:", e);
            resultadoDiv.innerHTML = `<p class="empty-state" style="color:red;">Erro ao processar dados: ${e.message}</p>`;
            return;
        }
    }

    processarAlertasBuscaAtiva();
}

function processarAlertasBuscaAtiva() {
    if (!cacheBuscaAtiva) return;

    const { allStudents, allTurmas, attendanceData, daysByTurma } = cacheBuscaAtiva;
    const resultadoDiv = document.getElementById('resultadoBuscaAtiva');

    const vigencia = document.getElementById('filtroVigenciaBA') ? document.getElementById('filtroVigenciaBA').value : 'total';
    const percentLimit = document.getElementById('filtroPorcentagemBA') ? parseFloat(document.getElementById('filtroPorcentagemBA').value) : 70;
    const ocultarFaltosos = document.getElementById('filtroOcultarFaltososBA') ? document.getElementById('filtroOcultarFaltososBA').checked : false;

    const currentYear = new Date().getFullYear();
    const alerts = { consecutive: [], weekly: [], percentage: [] };
    const MIN_TEACHERS_FOR_ABSENCE = 1;

    const allAtestados = (data.registrosAdministrativos || []).filter(r => r.tipo === 'Atestado');
    const allFaltosos = (data.registrosAdministrativos || []).filter(r => r.tipo === 'Faltoso');
    const configBimestres = data.configBimestres || [];

    const hasAtestadoOnDate = (studentId, dateStr) => {
        const studentAtestados = allAtestados.filter(r => r.estudanteId == studentId);
        const checkDate = new Date(dateStr + 'T12:00:00');
        for (const ates of studentAtestados) {
            const parts = ates.data.split('-');
            const inicio = new Date(parts[0], parts[1]-1, parts[2]);
            const fim = new Date(inicio);
            fim.setDate(fim.getDate() + (parseInt(ates.dias) || 1) - 1);
            if (checkDate >= inicio && checkDate <= fim) return true;
        }
        return false;
    };

    const wasAbsent = (studentId, dateStr) => {
        const dayData = attendanceData[dateStr];
        if (!dayData || !dayData[studentId]) return false;
        return dayData[studentId].length >= MIN_TEACHERS_FOR_ABSENCE;
    };

    const todayForWeek = new Date();
    const dayOfWeek = todayForWeek.getDay();
    const lastSunday = new Date(todayForWeek);
    lastSunday.setDate(todayForWeek.getDate() - dayOfWeek);
    lastSunday.setHours(0, 0, 0, 0);

    const mondayOfPreviousWeek = new Date(lastSunday);
    mondayOfPreviousWeek.setDate(lastSunday.getDate() - 7);

    const sundayOfPreviousWeek = new Date(lastSunday);
    sundayOfPreviousWeek.setDate(lastSunday.getDate() - 1);

    let dataInicioVigencia = null;
    let dataFimVigencia = null;

    if (vigencia !== 'total') {
        const bimestre = configBimestres.find(b => b.bim == parseInt(vigencia));
        if (bimestre && bimestre.inicio && bimestre.fim) {
            dataInicioVigencia = bimestre.inicio;
            dataFimVigencia = bimestre.fim;
        }
    }

    for (const student of allStudents) {
        if(student.status !== 'Ativo') continue;

        const isFaltosoFlag = allFaltosos.some(r => r.estudanteId == student.id);
        
        if (ocultarFaltosos && isFaltosoFlag) continue;

        let studentDates = Array.from(daysByTurma[student.id_turma] || [])
            .filter(d => d.startsWith(String(currentYear)))
            .sort();

        if (dataInicioVigencia && dataFimVigencia) {
            studentDates = studentDates.filter(d => d >= dataInicioVigencia && d <= dataFimVigencia);
        }

        if (studentDates.length === 0) continue;

        let atestadosDoAluno = allAtestados.filter(r => r.estudanteId == student.id);
        let atestadosCount = 0;
        let diasAtestadoTotal = 0;

        if (dataInicioVigencia && dataFimVigencia) {
            const vigenciaInicio = new Date(dataInicioVigencia + 'T12:00:00');
            const vigenciaFim = new Date(dataFimVigencia + 'T12:00:00');
            
            const atestadosFiltrados = atestadosDoAluno.filter(ates => {
                const parts = ates.data.split('-');
                const inicioAtes = new Date(parts[0], parts[1]-1, parts[2]);
                const fimAtes = new Date(inicioAtes);
                fimAtes.setDate(fimAtes.getDate() + (parseInt(ates.dias) || 1) - 1);
                return inicioAtes <= vigenciaFim && fimAtes >= vigenciaInicio;
            });
            
            atestadosCount = atestadosFiltrados.length;
            
            atestadosFiltrados.forEach(ates => {
                const parts = ates.data.split('-');
                const inicioAtes = new Date(parts[0], parts[1]-1, parts[2]);
                const fimAtes = new Date(inicioAtes);
                fimAtes.setDate(fimAtes.getDate() + (parseInt(ates.dias) || 1) - 1);
                
                const start = inicioAtes > vigenciaInicio ? inicioAtes : vigenciaInicio;
                const end = fimAtes < vigenciaFim ? fimAtes : vigenciaFim;
                
                if (start <= end) {
                    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
                    diasAtestadoTotal += diffDays;
                }
            });
        } else {
            atestadosCount = atestadosDoAluno.length;
            diasAtestadoTotal = atestadosDoAluno.reduce((acc, curr) => acc + (parseInt(curr.dias) || 1), 0);
        }
        
        const absencesList = studentDates.filter(dateStr => wasAbsent(student.id, dateStr));
        const totalAbsences = absencesList.length;
        const presencePercentage = studentDates.length > 0 ? ((studentDates.length - totalAbsences) / studentDates.length) * 100 : 100;
        
        const absencesWithoutAtestado = absencesList.filter(dateStr => !hasAtestadoOnDate(student.id, dateStr)).length;
        const adjustedPresencePercentage = studentDates.length > 0 ? ((studentDates.length - absencesWithoutAtestado) / studentDates.length) * 100 : 100;

        const atestadosInfo = atestadosCount > 0 ? `🏥 ${atestadosCount} atestado(s) (${diasAtestadoTotal} dias)` : '';
        const percInfo = `<span title="PB = Presença Bruta | DA = Presença Descontando Atestado">PB: ${presencePercentage.toFixed(0)}% | DA: ${adjustedPresencePercentage.toFixed(0)}%</span>`;

        // a) Faltas Consecutivas
        let consecutiveCount = 0, maxConsecutive = 0;
        for (const dateStr of studentDates) {
            if (wasAbsent(student.id, dateStr)) consecutiveCount++;
            else { maxConsecutive = Math.max(maxConsecutive, consecutiveCount); consecutiveCount = 0; }
        }
        maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        if (maxConsecutive >= 3) alerts.consecutive.push({ student, detail: `${maxConsecutive} dias consecutivos`, atestadosInfo, percInfo, isFaltoso: isFaltosoFlag });

        // b) Faltas na Semana Passada
        let lastWeekAbsences = 0;
        for (const dateStr of studentDates) {
            const d = new Date(dateStr + 'T12:00:00');
            if (d >= mondayOfPreviousWeek && d <= sundayOfPreviousWeek && wasAbsent(student.id, dateStr)) {
                lastWeekAbsences++;
            }
        }
        if (lastWeekAbsences >= 3) alerts.weekly.push({ student, detail: `${lastWeekAbsences} faltas na semana passada`, atestadosInfo, percInfo, isFaltoso: isFaltosoFlag });

        // c) Baixa Frequência
        if (adjustedPresencePercentage < percentLimit) alerts.percentage.push({ student, detail: '', atestadosInfo, percInfo, isFaltoso: isFaltosoFlag });
    }

    const renderAlertList = (alertList, title) => {
        if (alertList.length === 0) return `<p class="empty-state">Nenhum estudante encontrado com este alerta no momento.</p>`;
        const byTurma = {};
        alertList.forEach(item => {
            const turma = allTurmas.find(t => t.id == item.student.id_turma);
            const turmaName = turma ? turma.nome : "Turma Desconhecida";
            if (!byTurma[turmaName]) byTurma[turmaName] = [];
            byTurma[turmaName].push(item);
        });

        let listHtml = `<h4 style="margin-top:0;">${title} (${alertList.length})</h4>`;
        
        if (currentBuscaAtivaSubTab === 'percentage') {
            listHtml += `<div style="font-size: 11px; color: #718096; margin-bottom: 10px; background: #edf2f7; padding: 5px; border-radius: 4px;">
                <strong>Legenda:</strong> PB = Presença Bruta | DA = Presença Descontando Atestado
            </div>`;
        }

        Object.keys(byTurma).sort().forEach(turmaName => {
            listHtml += `<div class="card" style="margin-bottom:10px; background:white;">
                <h5 style="margin:0 0 5px 0; padding-bottom:5px; border-bottom:1px solid #eee;">${turmaName}</h5>
                <ul style="margin:0; padding-left:10px; font-size:13px; list-style-type:none;">`;
            byTurma[turmaName].forEach(item => {
                const faltosoBadge = item.isFaltoso ? `<span style="background:#fed7d7; color:#c53030; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:bold;">🚨 Faltoso</span>` : `<button class="btn btn-danger" style="margin-left:8px; padding:2px 8px; font-size:10px; border-radius:4px;" onclick="marcarComoFaltosoBuscaAtiva(${item.student.id}, ${item.student.id_turma})">+ Marcar Faltoso</button>`;
                
                const detailHtml = item.detail ? `<span style="color:#4a5568;">${item.detail}</span> | ` : '';
                const atestadoHtml = item.atestadosInfo ? `<div style="color:#d69e2e; font-size:12px; margin-top:2px;">${item.atestadosInfo}</div>` : '';

                listHtml += `<li style="margin-bottom:8px; display:flex; flex-direction:column; border-bottom:1px dashed #edf2f7; padding-bottom:5px;">
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                        ${getAeePrefix(item.student)}<strong>${item.student.nome_completo}</strong>: 
                        ${detailHtml}
                        <strong style="color:#2c5282;">${item.percInfo}</strong>
                        ${faltosoBadge}
                    </div>
                    ${atestadoHtml}
                </li>`;
            });
            listHtml += `</ul></div>`;
        });
        return listHtml;
    };

    const percentText = percentLimit < 100 ? `Menos de ${percentLimit}%` : `${percentLimit}%`;

    const subTabs = `
        <div style="display: flex; gap: 5px; margin-bottom: 0px; border-bottom: 2px solid #e2e8f0; position: relative; z-index: 1;">
            <button class="btn btn-sm ${currentBuscaAtivaSubTab === 'consecutive' ? 'btn-primary' : 'btn-secondary'}" 
                    style="border-radius: 8px 8px 0 0; padding: 10px 20px; border-bottom: none; font-weight: bold; margin-bottom: -2px;"
                    onclick="currentBuscaAtivaSubTab='consecutive'; processarAlertasBuscaAtiva()">
                🚨 Consecutivas (${alerts.consecutive.length})
            </button>
            <button class="btn btn-sm ${currentBuscaAtivaSubTab === 'weekly' ? 'btn-primary' : 'btn-secondary'}" 
                    style="border-radius: 8px 8px 0 0; padding: 10px 20px; border-bottom: none; font-weight: bold; margin-bottom: -2px;"
                    onclick="currentBuscaAtivaSubTab='weekly'; processarAlertasBuscaAtiva()">
                📅 Semana Passada (${alerts.weekly.length})
            </button>
            <button class="btn btn-sm ${currentBuscaAtivaSubTab === 'percentage' ? 'btn-primary' : 'btn-secondary'}" 
                    style="border-radius: 8px 8px 0 0; padding: 10px 20px; border-bottom: none; font-weight: bold; margin-bottom: -2px;"
                    onclick="currentBuscaAtivaSubTab='percentage'; processarAlertasBuscaAtiva()">
                📉 Baixa Frequência (${alerts.percentage.length})
            </button>
        </div>
    `;

    let activeContent = '';
    let activeStyle = '';
    if (currentBuscaAtivaSubTab === 'consecutive') {
        activeContent = renderAlertList(alerts.consecutive, 'Faltas Consecutivas (3 ou mais dias seguidos)');
        activeStyle = 'background:#fff5f5; border:1px solid #feb2b2;';
    } else if (currentBuscaAtivaSubTab === 'weekly') {
        activeContent = renderAlertList(alerts.weekly, 'Faltas na Semana Anterior (3 ou mais no total)');
        activeStyle = 'background:#fffaf0; border:1px solid #fbd38d;';
    } else {
        activeContent = renderAlertList(alerts.percentage, `Baixa Frequência (${percentText} de presença DA)`);
        activeStyle = 'background:#ebf8ff; border:1px solid #bee3f8;';
    }

    resultadoDiv.innerHTML = `
        <div style="margin-top: 10px;">
            ${subTabs}
            <div style="padding:25px; border-radius:0 0 8px 8px; min-height: 300px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); ${activeStyle}">
                ${activeContent}
            </div>
        </div>
    `;
}

function marcarComoFaltosoBuscaAtiva(estudanteId, turmaId) {
    if(!confirm('Deseja registrar este aluno como "Faltoso" no painel administrativo?')) return;
    
    if (!data.registrosAdministrativos) data.registrosAdministrativos = [];
    
    const exists = data.registrosAdministrativos.some(r => r.estudanteId == estudanteId && r.tipo === 'Faltoso');
    if (exists) {
        alert('Este aluno já está marcado como faltoso.');
        return;
    }

    data.registrosAdministrativos.push({
        id: Date.now(),
        turmaId: parseInt(turmaId),
        estudanteId: parseInt(estudanteId),
        tipo: 'Faltoso',
        data: getTodayString(),
        dias: 0,
        descricao: 'Marcado via Busca Ativa'
    });
    
    persistirDados();
    renderAbaAlertasBuscaAtiva();
}

function renderAbaRegistrosAdministrativos() {
    const registros = data.registrosAdministrativos || [];
    const today = new Date();
    today.setHours(0,0,0,0);

    // 1. Processar e Filtrar
    let lista = registros.map(r => {
        // Simulação de busca de estudante (em produção buscaria do banco)
        const estudante = (data.estudantes || []).find(e => e.id == r.estudanteId) || { nome_completo: 'Desconhecido' };
        
        if (estudante.status && estudante.status !== 'Ativo') {
            return null;
        }

        if (r.arquivado) {
            return null;
        }

        const turma = (data.turmas || []).find(t => t.id == r.turmaId) || { nome: '?' };
        
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
                                        <td>${getAeePrefix((data.estudantes || []).find(e => e.id == r.estudanteId))}${r.estudanteNome}</td>
                                        <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''} ${r.descricao ? `<br><small>${r.descricao}</small>` : ''}</td>
                                        <td>
                                            <button class="btn btn-secondary btn-sm" onclick="arquivarRegistroGestao(${r.id})" title="Arquivar (mantém no histórico)">🗄️ Arquivar</button>
                                            <button class="btn btn-danger btn-sm" onclick="removerRegistroGestao(${r.id})" title="Excluir permanentemente">🗑️</button>
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

function arquivarRegistroGestao(id) {
    const registro = (data.registrosAdministrativos || []).find(r => r.id === id);
    if (!registro) return;
    if (confirm('Arquivar este registro? Ele sairá da lista de registros ativos, mas continuará disponível no Arquivo Histórico.')) {
        registro.arquivado = true;
        registro.arquivadoEm = getTodayString();
        persistirDados();
        renderRegistrosGestor();
    }
}

function desarquivarRegistroGestao(id) {
    const registro = (data.registrosAdministrativos || []).find(r => r.id === id);
    if (!registro) return;
    registro.arquivado = false;
    delete registro.arquivadoEm;
    persistirDados();
    renderRegistrosGestor();
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
                            return est ? (getAeePrefix(est) + est.nome_completo) : '?';
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
                            return est ? (getAeePrefix(est) + est.nome_completo) : '?';
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

    // [MODIFICADO] Identifica duplicados apenas se houver mais de um registro 'Ativo' para o mesmo nome
    const duplicados = Object.entries(histograma).filter(([nome, lista]) => {
        const ativos = lista.filter(e => e.status === 'Ativo');
        return ativos.length > 1;
    });

    const html = `
        <div>
            <h2>🧹 Ferramenta de Limpeza de Duplicados</h2>
            <p style="color:#666; font-size:14px; margin-bottom:20px;">
                Esta ferramenta identifica estudantes com o mesmo nome completo que aparecem como <strong>Ativo</strong> em mais de um registro. 
                Alunos que mudaram de turma (com status Remanejado ou Transferido) são preservados e não são considerados duplicados para unificação, garantindo a integridade do histórico de movimentação.
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
                                const statusLabel = e.status === 'Ativo' ? `<strong>${e.status}</strong>` : e.status;
                                return t ? `${t.nome} (${statusLabel})` : '?';
                            }).join(', ');
                            return `
                                <tr>
                                    <td><strong>${nome}</strong></td>
                                    <td>${lista.length} registros (${lista.filter(x => x.status === 'Ativo').length} ativos)</td>
                                    <td><small>${turmas}</small></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <button class="btn btn-primary" style="margin-top:20px; width:100%; padding:15px; font-weight:bold;" onclick="executarLimpezaDuplicados()">
                    🚀 Unificar Registros Ativos e Corrigir Histórico
                </button>
            ` : `
                <p class="empty-state">✅ Nenhum estudante duplicado encontrado. Seu banco de dados está limpo!</p>
            `}

            <div id="containerDiagnosticoOrfaos" style="margin-top: 40px; border-top: 2px dashed #cbd5e0; padding-top: 20px;">
                <h3 style="color: #c53030;">🔍 Busca por Dados Órfãos (Vestígios)</h3>
                <p style="font-size:13px; color:#666; margin-bottom:15px;">Esta ferramenta verifica se existem notas, faltas ou ocorrências "perdidas" que ficaram no banco de dados após um aluno ser apagado ou unificado incorretamente no passado.</p>
                <button class="btn btn-secondary" onclick="executarDiagnosticoOrfaos()">Executar Varredura de Diagnóstico</button>
                <div id="resultadoDiagnosticoOrfaos" style="margin-top:15px;"></div>
            </div>
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
}

async function executarDiagnosticoOrfaos() {
    const resDiv = document.getElementById('resultadoDiagnosticoOrfaos');
    resDiv.innerHTML = '<p style="color:#3182ce; font-weight:bold;">⏳ Analisando integridade do banco de dados...</p>';

    const validIds = new Set((data.estudantes || []).map(e => Number(e.id)));
    const relatorio = [];
    
    const checkOrphans = (lista, campoId, nomeTabela) => {
        if (!lista || !Array.isArray(lista)) return;
        const orfaos = lista.filter(item => {
            const id = Number(item[campoId]);
            return id && !validIds.has(id);
        });
        if (orfaos.length > 0) {
            relatorio.push({ tabela: nomeTabela, qtd: orfaos.length });
        }
    };

    // Varredura em todas as tabelas sensíveis
    checkOrphans(data.presencas, 'id_estudante', 'Faltas/Chamadas');
    checkOrphans(data.atrasos, 'id_estudante', 'Registros de Atraso');
    checkOrphans(data.registrosAdministrativos, 'estudanteId', 'Atestados/Observações');
    checkOrphans(data.compensacoes, 'id_estudante', 'Atividades de Compensação');
    checkOrphans(data.notas, 'id_estudante', 'Avaliações e Notas');
    checkOrphans(data.caderno, 'id_estudante', 'Vistos de Caderno');
    checkOrphans(data.tutorados, 'id_estudante_origem', 'Controle de Tutoria');

    // Ocorrências (Lógica específica para array de envolvidos)
    const oOrfaos = (data.ocorrencias || []).filter(o => 
        o.ids_estudantes && o.ids_estudantes.some(id => !validIds.has(Number(id)))
    );
    if (oOrfaos.length > 0) relatorio.push({ tabela: 'Ocorrências Disciplinares', qtd: oOrfaos.length });

    if (relatorio.length === 0) {
        resDiv.innerHTML = `
            <div style="background: #f0fff4; border: 1px solid #9ae6b4; padding: 15px; border-radius: 8px; color: #2f855a;">
                <strong>✅ Integridade Confirmada!</strong><br>
                Não encontramos vestígios de dados órfãos. Todos os registros estão devidamente vinculados aos alunos atuais.
            </div>`;
    } else {
        let html = `
            <div style="background: #fff5f5; border: 1px solid #feb2b2; padding: 15px; border-radius: 8px;">
                <h4 style="margin-top:0; color:#c53030;">⚠️ Foram encontrados dados sem vínculo (órfãos):</h4>
                <table style="width:100%; font-size:12px; margin-top:10px;">
                    <thead><tr style="text-align:left;"><th>Categoria</th><th>Registros Perdidos</th></tr></thead>
                    <tbody>
                        ${relatorio.map(r => `<tr><td>${r.tabela}</td><td><strong>${r.qtd}</strong></td></tr>`).join('')}
                    </tbody>
                </table>
                <p style="margin-top:15px; font-size:11px; color:#742a2a;">
                    <strong>Por que isso aconteceu?</strong> Provavelmente alguns alunos foram apagados manualmente ou unificados antes da correção que fizemos na função de limpeza. <br>
                    <strong>Nota:</strong> Se você notar que faltam notas de um aluno específico, esses números acima confirmam que os dados ainda estão no banco, mas "escondidos" por falta de um ID válido.
                </p>
            </div>`;
        resDiv.innerHTML = html;
    }
}

async function executarLimpezaDuplicados() {
    if (!confirm('Este processo irá fundir os registros de estudantes que possuem mais de um status "Ativo". O primeiro ID ativo encontrado para cada nome será o mestre. Registros históricos de remanejamento serão mantidos se não houver conflito de ativos. Deseja continuar?')) return;

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
        const ativos = lista.filter(e => e.status === 'Ativo');

        // [MODIFICADO] Se não houver duplicidade de "Ativos", mantém os registros como estão (incluindo remanejados)
        if (ativos.length <= 1) {
            lista.forEach(e => novosEstudantes.push(e));
            continue;
        }

        // Temos duplicados REAIS (Mais de um Ativo): Master é o primeiro Ativo da lista
        const master = ativos[0];
        const masterId = master.id;
        
        // Os IDs que serão fundidos no Master (outros Ativos e eventuais históricos deste mesmo nome)
        const idsDuplicados = lista.filter(e => e.id !== masterId).map(e => e.id);
        
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
        atualizarRef(data.notas, 'id_estudante');
        atualizarRef(data.caderno, 'id_estudante');
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
                                <td>${getAeePrefix(t)}<strong>${t.nome_estudante}</strong></td>
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

    // Notas Oficiais (Mapão/Avaliações da Gestão) — vivem no `data` do próprio gestor, sem necessidade
    // de busca adicional (esta função já roda na sessão do gestor).
    const notasHtml = montarTabelaNotasOficiaisHtml({
        notasBimestraisOficiais: data.notasBimestraisOficiais,
        avaliacoesGestor: data.avaliacoesGestor,
        notasAvaliacoesGestor: data.notasAvaliacoesGestor
    }, normNomeNotasOficiais(alunoNome));

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

            ${notasHtml ? `<div style="margin-top:15px;">${notasHtml}</div>` : ''}

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
    container.dataset.notasOficiaisHtml = notasHtml || '';

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
    const notasHtml = container.dataset.notasOficiaisHtml || '';

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

            ${notasHtml ? `<div class="info">${notasHtml}</div>` : ''}

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

        const notasHtmlAluno = montarTabelaNotasOficiaisHtml({
            notasBimestraisOficiais: data.notasBimestraisOficiais,
            avaliacoesGestor: data.avaliacoesGestor,
            notasAvaliacoesGestor: data.notasAvaliacoesGestor
        }, normNomeNotasOficiais(t.nome_estudante));

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
            ${notasHtmlAluno ? `<div class="info">${notasHtmlAluno}</div>` : ''}
            ${encontrosAluno.length > 0 ? encontrosAluno.map(e => `<div class="registro"><div class="registro-data">📅 ${formatDate(e.data)}</div><div class="registro-titulo">${e.tema || 'Sem Título'}</div><div class="registro-texto">${e.resumo || ''}</div></div>`).join('') : '<p style="text-align:center; font-style:italic; color:#777;">Nenhum registro encontrado neste semestre.</p>'}
            <div style="margin-top:50px; border-top:1px solid #000; width:200px; text-align:center; font-size:10px; padding-top:5px;">Visto da Coordenação</div>
        </div>`;
    });

    html += `<script>window.print();</script></body></html>`;

    const win = window.open('', '', 'width=900,height=800');
    win.document.write(html);
    win.document.close();
}

// --- NOTAS OFICIAIS (GESTOR) — Upload de Avaliações e Mapão Bimestral via IA ---

let notasOficiaisModo = 'avaliacao'; // 'avaliacao' | 'mapao'
let notasOficiaisRegistrosPendentes = []; // linhas extraídas pela IA, editáveis antes de confirmar

function normNomeNotasOficiais(s) {
    // Mesma convenção de normalização de nome usada no resto do app (gestor.js:1938, app.js:6460)
    return (s || '').trim().toUpperCase();
}

function renderNotasOficiaisGestor() {
    const container = document.getElementById('notasOficiaisGestor');
    if (!container) return;

    const turmas = data.turmas || [];
    const avaliacoes = (data.avaliacoesGestor || []).slice().sort((a, b) => b.criadoEm - a.criadoEm);
    const lotesMapao = (data.lotesMapaoGestor || []).slice().sort((a, b) => b.dataImportacao - a.dataImportacao);

    container.innerHTML = `
        <div class="card">
            <h2>🧮 Notas Oficiais</h2>
            <p style="color:#666; margin-bottom:20px; font-size:13px;">
                Envie a planilha/PDF de uma <strong>avaliação</strong> (ex: Prova Paulista) ou do <strong>mapão bimestral</strong>.
                Uma IA extrai as notas por aluno/disciplina/bimestre; você revisa antes de salvar.
            </p>

            <div style="margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
                    <label style="font-size:12px; font-weight:bold;">Turmas <span id="contadorTurmasNotasOficiais" style="font-weight:normal; color:#3182ce;"></span></label>
                    ${turmas.length > 0 ? `
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn btn-xs btn-secondary" onclick="marcarTodasTurmasVisiveisNotasOficiais()">Marcar todas</button>
                            <button type="button" class="btn btn-xs btn-secondary" onclick="limparSelecaoTurmasNotasOficiais()">Limpar</button>
                        </div>
                    ` : ''}
                </div>
                ${turmas.length > 0 ? `<input type="text" placeholder="🔍 Buscar turma..." oninput="filtrarListaTurmasNotasOficiais(this.value)" style="width:100%; padding:8px; margin-bottom:6px; border:1px solid #cbd5e0; border-radius:6px; box-sizing:border-box; font-size:13px;">` : ''}
                <div id="listaTurmasNotasOficiaisContainer" style="max-height:260px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; background:#fff;">
                    ${turmas.length === 0 ? '<p class="empty-state" style="margin:0; padding:10px;">Nenhuma turma cadastrada.</p>' : turmas.map(t => `
                        <label class="linha-turma-notas-oficiais" data-nome="${normalizarTextoComparacaoMaterialDigital(t.nome)}" style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:13px;">
                            <input type="checkbox" class="chk-turma-notas-oficiais" value="${t.id}" onchange="atualizarEstadoLinhaTurmaNotasOficiais(this)">
                            <span>${t.nome}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <div style="margin-bottom: 15px; display:flex; gap: 15px;">
                <label><input type="radio" name="notasOficiaisModoRadio" value="avaliacao" checked onchange="toggleModoNotasOficiais('avaliacao')"> Avaliação (ex: Prova Paulista, Simulado)</label>
                <label><input type="radio" name="notasOficiaisModoRadio" value="mapao" onchange="toggleModoNotasOficiais('mapao')"> Mapão Bimestral (notas oficiais)</label>
            </div>

            <div id="camposAvaliacaoNotasOficiais" style="margin-bottom: 15px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div class="form-row">
                    <label style="flex:2;">Nome da Avaliação:
                        <input type="text" id="notasOficiaisNomeAvaliacao" placeholder="Ex: Prova Paulista - 2º Bimestre">
                    </label>
                    <label style="flex:1;">Bimestre:
                        <select id="notasOficiaisBimestre">
                            <option value="1">1º Bimestre</option>
                            <option value="2">2º Bimestre</option>
                            <option value="3">3º Bimestre</option>
                            <option value="4">4º Bimestre</option>
                        </select>
                    </label>
                </div>
            </div>

            <div id="infoMapaoNotasOficiais" style="display:none; margin-bottom: 15px; background:#ebf8ff; padding:12px; border-radius:8px; border:1px solid #bee3f8; font-size:12px; color:#2c5282;">
                O mapão normalmente já traz todas as notas bimestrais lançadas até agora. Não é preciso escolher o bimestre — a IA identifica cada coluna/bimestre presente no arquivo. Reenviar um mapão mais atualizado apenas corrige as notas já registradas, sem duplicar.
            </div>

            <div class="form-row" style="margin-bottom: 10px;">
                <label style="flex:1;">Arquivo (.xlsx ou .pdf):
                    <input type="file" id="notasOficiaisArquivo" accept=".xlsx,.pdf">
                </label>
            </div>

            <button class="btn btn-primary" id="btnProcessarNotasOficiais" onclick="processarArquivoNotasOficiais()">Processar</button>

            <div id="progressoNotasOficiais" style="display:none; margin-top:15px;">
                <div style="background:#e2e8f0; border-radius:6px; overflow:hidden; height:18px;">
                    <div id="barraProgressoNotasOficiais" style="background:#4299e1; height:100%; width:30%; transition:width .2s;"></div>
                </div>
                <p id="textoProgressoNotasOficiais" style="font-size:12px; color:#666; margin-top:4px;"></p>
            </div>

            <div id="revisaoNotasOficiais" style="margin-top:20px;"></div>

            <h3 style="margin-top:30px; border-top:1px solid #e2e8f0; padding-top:15px;">Avaliações Cadastradas</h3>
            <div id="listaAvaliacoesGestor">
                ${avaliacoes.length === 0 ? '<p class="empty-state">Nenhuma avaliação cadastrada ainda.</p>' : `
                    <table style="font-size:13px;">
                        <thead><tr><th>Nome</th><th>Turmas</th><th>Bimestre</th><th>Disciplinas</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${avaliacoes.map(a => {
                                const nomesTurmas = (a.id_turmas || []).map(id => turmas.find(x => x.id == id)).filter(Boolean).map(t => t.nome);
                                return `<tr>
                                    <td>${a.nome}</td>
                                    <td>${nomesTurmas.join(', ') || 'Turma removida'}</td>
                                    <td>${a.bimestre}º</td>
                                    <td>${(a.disciplinas || []).join(', ') || '-'}</td>
                                    <td><button class="btn btn-sm btn-danger" onclick="removerAvaliacaoGestor(${a.id})">🗑️</button></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `}
            </div>

            <h3 style="margin-top:30px; border-top:1px solid #e2e8f0; padding-top:15px;">Histórico de Mapões Enviados</h3>
            <div id="listaLotesMapaoGestor">
                ${lotesMapao.length === 0 ? '<p class="empty-state">Nenhum mapão enviado ainda.</p>' : `
                    <table style="font-size:13px;">
                        <thead><tr><th>Arquivo</th><th>Turmas</th><th>Enviado em</th><th>Registros</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${lotesMapao.map(l => `<tr>
                                <td>${l.nomeArquivo || '-'}</td>
                                <td>${(l.turmas || []).join(', ') || '-'}</td>
                                <td>${new Date(l.dataImportacao).toLocaleString('pt-BR')}</td>
                                <td>${l.totalRegistros}</td>
                                <td><button class="btn btn-sm btn-danger" onclick="removerLoteMapaoGestor(${l.id})">🗑️ Excluir</button></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        </div>
    `;
}

function toggleModoNotasOficiais(modo) {
    notasOficiaisModo = modo;
    document.getElementById('camposAvaliacaoNotasOficiais').style.display = modo === 'avaliacao' ? 'block' : 'none';
    document.getElementById('infoMapaoNotasOficiais').style.display = modo === 'mapao' ? 'block' : 'none';
}

// Destaca a linha marcada/desmarcada e atualiza o contador - dá feedback visual claro de quais
// turmas estão selecionadas (a versão anterior, uma grade de checkboxes sem destaque, não deixava
// isso claro e cortava nomes de turma longos).
function atualizarEstadoLinhaTurmaNotasOficiais(checkbox) {
    const linha = checkbox.closest('.linha-turma-notas-oficiais');
    if (linha) linha.style.background = checkbox.checked ? '#ebf8ff' : '';
    const total = document.querySelectorAll('.chk-turma-notas-oficiais:checked').length;
    const contador = document.getElementById('contadorTurmasNotasOficiais');
    if (contador) contador.textContent = total > 0 ? `(${total} selecionada${total > 1 ? 's' : ''})` : '';
}

function filtrarListaTurmasNotasOficiais(termo) {
    const termoNorm = normalizarTextoComparacaoMaterialDigital(termo);
    document.querySelectorAll('.linha-turma-notas-oficiais').forEach(linha => {
        linha.style.display = (linha.dataset.nome || '').includes(termoNorm) ? 'flex' : 'none';
    });
}

function marcarTodasTurmasVisiveisNotasOficiais() {
    document.querySelectorAll('.linha-turma-notas-oficiais').forEach(linha => {
        if (linha.style.display === 'none') return;
        const chk = linha.querySelector('.chk-turma-notas-oficiais');
        chk.checked = true;
        atualizarEstadoLinhaTurmaNotasOficiais(chk);
    });
}

function limparSelecaoTurmasNotasOficiais() {
    document.querySelectorAll('.chk-turma-notas-oficiais').forEach(chk => {
        chk.checked = false;
        atualizarEstadoLinhaTurmaNotasOficiais(chk);
    });
}

function removerAvaliacaoGestor(id) {
    if (!confirm('Excluir esta avaliação e todas as notas vinculadas a ela?')) return;
    data.avaliacoesGestor = (data.avaliacoesGestor || []).filter(a => a.id != id);
    data.notasAvaliacoesGestor = (data.notasAvaliacoesGestor || []).filter(n => n.id_avaliacao != id);
    persistirDados();
    renderNotasOficiaisGestor();
}

// Remove só os registros de data.notasBimestraisOficiais que ainda pertencem a este lote (ou seja,
// que não foram sobrescritos por um mapão mais novo desde então - reenviar um mapão mais atualizado
// por cima já atualiza o loteId do registro, então excluir um lote antigo nunca apaga um valor que
// já foi corrigido por um envio posterior).
function removerLoteMapaoGestor(id) {
    if (!confirm('Excluir este mapão enviado? Isso remove as notas oficiais lançadas por ele (as que não foram atualizadas por um envio mais recente).')) return;
    data.notasBimestraisOficiais = (data.notasBimestraisOficiais || []).filter(n => !(n.origem && n.origem.loteId == id));
    data.lotesMapaoGestor = (data.lotesMapaoGestor || []).filter(l => l.id != id);
    persistirDados();
    renderNotasOficiaisGestor();
}

function definirProgressoNotasOficiais(texto, percentual) {
    const container = document.getElementById('progressoNotasOficiais');
    const barra = document.getElementById('barraProgressoNotasOficiais');
    const label = document.getElementById('textoProgressoNotasOficiais');
    if (!container) return;
    container.style.display = 'block';
    if (barra && typeof percentual === 'number') barra.style.width = Math.round(percentual) + '%';
    if (label) label.textContent = texto || '';
}

// Retorna tanto a estrutura por aba (usada pelo parser determinístico) quanto o texto achatado
// (usado como fallback pra IA), a partir de uma única leitura do workbook.
function extrairAbasXlsxNotasOficiais(arrayBuffer) {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const abas = workbook.SheetNames.map(nomeAba => ({
        nome: nomeAba,
        linhas: XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, raw: false, blankrows: false })
    }));
    let texto = '';
    abas.forEach(aba => {
        texto += `\n--- Aba: ${aba.nome} ---\n`;
        aba.linhas.forEach(linha => { texto += linha.join(' | ') + '\n'; });
    });
    return { abas, texto };
}

// --- Parser específico do formato oficial SED ("Registro e Controle do Rendimento Escolar") ---
// Esse export tem um bloco de metadados (rótulo na coluna A / valor na coluna B, incluindo "Turma:"
// e "Tipo Fechamento:" - é daqui que sai o bimestre, não de uma coluna) e um cabeçalho em DUAS linhas:
// nome da disciplina em célula mesclada (só a 1ª coluna do trio vem preenchida - "forward-fill" pega
// as próximas duas) e, na linha seguinte, os sub-cabeçalhos M/F/AC (Média/Faltas/Atividade
// Complementar) repetidos por disciplina. Só a coluna M interessa pra nota.

const MESES_FECHAMENTO_BIMESTRE = {
    primeiro: 1, primeira: 1,
    segundo: 2, segunda: 2,
    terceiro: 3, terceira: 3,
    quarto: 4, quarta: 4
};

function detectarMetadadosSed(linhas) {
    let turma = null;
    let bimestre = null;
    for (let i = 0; i < Math.min(linhas.length, 15); i++) {
        const linha = linhas[i] || [];
        const rotulo = normalizarTextoComparacaoMaterialDigital(String(linha[0] || ''));
        if (!turma && /\bturma\b/.test(rotulo)) {
            turma = String(linha[1] || '').trim() || null;
        }
        if (!bimestre && /fechamento/.test(rotulo)) {
            const valorNorm = normalizarTextoComparacaoMaterialDigital(String(linha[1] || ''));
            const chave = Object.keys(MESES_FECHAMENTO_BIMESTRE).find(k => valorNorm.includes(k));
            if (chave) bimestre = MESES_FECHAMENTO_BIMESTRE[chave];
        }
    }
    return { turma, bimestre };
}

function detectarCabecalhoSed(linhas) {
    for (let i = 0; i < Math.min(linhas.length, 20) - 1; i++) {
        const linhaDisciplinas = linhas[i] || [];
        const normalizados = linhaDisciplinas.map(c => normalizarTextoComparacaoMaterialDigital(String(c || '')));
        const idxNome = normalizados.findIndex(c => /\baluno\b/.test(c));
        if (idxNome === -1) continue;

        const linhaSubHeader = linhas[i + 1] || [];
        const subNormalizados = linhaSubHeader.map(c => normalizarTextoComparacaoMaterialDigital(String(c || '')).trim());
        if (!subNormalizados.some(c => c === 'm')) continue; // confirma que é o par de linhas certo (disciplina + M/F/AC)

        // Forward-fill: célula mesclada só preenche a 1ª coluna do trio da disciplina.
        let disciplinaAtual = null;
        const colunasM = [];
        linhaDisciplinas.forEach((celula, idx) => {
            if (idx === idxNome) return;
            const texto = String(celula || '').trim();
            if (texto) disciplinaAtual = texto;
            if (subNormalizados[idx] === 'm' && disciplinaAtual) {
                colunasM.push({ idx, disciplina: disciplinaAtual });
            }
        });
        if (colunasM.length === 0) continue;

        return { linhaHeader: i + 1, idxNome, idxSituacao: idxNome + 1, colunasM };
    }
    return null;
}

function extrairRegistrosSed(linhas, cabecalho, bimestreDoArquivo) {
    const registros = [];
    for (let i = cabecalho.linhaHeader + 1; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!linha || !linha[cabecalho.idxNome]) continue;
        const nome = String(linha[cabecalho.idxNome] || '').trim();
        if (!nome) continue;

        const situacao = normalizarTextoComparacaoMaterialDigital(String(linha[cabecalho.idxSituacao] || ''));
        if (situacao && !situacao.includes('ativo')) continue;

        cabecalho.colunasM.forEach(cm => {
            const valorBruto = linha[cm.idx];
            if (valorBruto === undefined || valorBruto === null || String(valorBruto).trim() === '') return;
            registros.push({ nome_estudante: nome, disciplina: cm.disciplina, bimestre: bimestreDoArquivo, valor: String(valorBruto).trim() });
        });
    }
    return registros;
}

// Filtra pra correspondência plausível contra o roster desta turma - evita ruído de outras
// turmas/abas quando o workbook compila a escola inteira num arquivo só.
function filtrarRegistrosPorRoster(registros, roster) {
    return registros.filter(r => {
        const nomeNorm = normNomeNotasOficiais(r.nome_estudante);
        if (roster.some(e => normNomeNotasOficiais(e.nome_completo) === nomeNorm)) return true;
        const normA = normalizarTextoComparacaoMaterialDigital(r.nome_estudante);
        return roster.some(e => {
            const normB = normalizarTextoComparacaoMaterialDigital(e.nome_completo);
            const dist = distanciaLevenshteinMaterialDigital(normA, normB);
            const sim = 1 - (dist / Math.max(normA.length, normB.length, 1));
            return sim >= 0.6;
        });
    });
}

function tentarExtracaoSed(abas, roster) {
    let registros = [];
    abas.forEach(aba => {
        const cabecalho = detectarCabecalhoSed(aba.linhas);
        if (!cabecalho) return;
        const metadados = detectarMetadadosSed(aba.linhas);
        if (!metadados.bimestre) return; // sem "Tipo Fechamento" reconhecível, não dá pra saber o bimestre
        registros = registros.concat(extrairRegistrosSed(aba.linhas, cabecalho, metadados.bimestre));
    });
    return filtrarRegistrosPorRoster(registros, roster);
}

// --- Extração determinística de planilha (sem IA) ---
// Planilhas de nota costumam ter colunas estruturadas (Nome, Disciplina, notas por bimestre) -
// detectar e ler essas colunas direto é instantâneo, gratuito e não tem risco de a IA inventar um
// valor. A IA fica reservada só pra quando esse formato não é reconhecido, ou pra PDF (sem colunas).

function detectarCabecalhoPlanilhaNotasOficiais(linhas) {
    for (let i = 0; i < Math.min(linhas.length, 15); i++) {
        const linhaOriginal = linhas[i] || [];
        const normalizados = linhaOriginal.map(c => normalizarTextoComparacaoMaterialDigital(String(c || '')));
        const idxNome = normalizados.findIndex(c => /\b(nome|aluno|estudante)\b/.test(c));
        if (idxNome === -1) continue;

        const idxDisciplina = normalizados.findIndex(c => /\b(disciplina|materia|componente)\b/.test(c));

        const colunasBimestre = [];
        let idxNotaUnica = -1;
        linhaOriginal.forEach((celulaOriginal, idx) => {
            if (idx === idxNome || idx === idxDisciplina) return;
            const texto = String(celulaOriginal || '');
            const m = texto.match(/([1-4])\s*[ºoa°]?\s*bim/i) || texto.match(/bim\s*([1-4])/i);
            if (m) {
                const bimestre = parseInt(m[1]);
                const prefixo = texto.slice(0, m.index).replace(/[-–_]+$/, '').trim();
                colunasBimestre.push({ idx, bimestre, disciplinaEmbutida: prefixo.length >= 2 ? prefixo : null });
            } else if (idxNotaUnica === -1 && /\b(nota|valor|resultado|media|média)\b/i.test(texto)) {
                idxNotaUnica = idx;
            }
        });

        if (colunasBimestre.length > 0 || idxNotaUnica !== -1) {
            return { linhaHeader: i, idxNome, idxDisciplina, idxNotaUnica, colunasBimestre };
        }
    }
    return null;
}

function extrairRegistrosDeterministicos(linhas, header, modo, nomeAba, bimestreSelecionado) {
    const registros = [];
    for (let i = header.linhaHeader + 1; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!linha || linha[header.idxNome] === undefined) continue;
        const nome = String(linha[header.idxNome] || '').trim();
        if (!nome) continue;

        const disciplinaColuna = header.idxDisciplina !== -1 ? String(linha[header.idxDisciplina] || '').trim() : '';

        if (header.colunasBimestre.length > 0 && (modo === 'mapao' || header.idxNotaUnica === -1)) {
            header.colunasBimestre.forEach(cb => {
                const valorBruto = linha[cb.idx];
                if (valorBruto === undefined || valorBruto === null || String(valorBruto).trim() === '') return;
                const disciplina = disciplinaColuna || cb.disciplinaEmbutida || nomeAba;
                registros.push({ nome_estudante: nome, disciplina, bimestre: cb.bimestre, valor: String(valorBruto).trim() });
            });
        } else if (header.idxNotaUnica !== -1) {
            const valorBruto = linha[header.idxNotaUnica];
            if (valorBruto === undefined || valorBruto === null || String(valorBruto).trim() === '') continue;
            const disciplina = disciplinaColuna || nomeAba;
            registros.push({ nome_estudante: nome, disciplina, bimestre: bimestreSelecionado, valor: String(valorBruto).trim() });
        }
    }
    return registros;
}

function tentarExtracaoDeterministicaXlsx(abas, modo, roster, bimestreSelecionado) {
    let registros = [];
    abas.forEach(aba => {
        const header = detectarCabecalhoPlanilhaNotasOficiais(aba.linhas);
        if (!header) return;
        registros = registros.concat(extrairRegistrosDeterministicos(aba.linhas, header, modo, aba.nome, bimestreSelecionado));
    });
    return filtrarRegistrosPorRoster(registros, roster);
}

async function extrairTextoPdfNotasOficiais(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let texto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        texto += content.items.map(it => it.str).join(' ') + '\n';
    }
    return texto;
}

const LIMITE_CONTEUDO_NOTAS_OFICIAIS = 50000;

function montarPromptNotasOficiais(modo, nomeAvaliacao, bimestreSelecionado, conteudo, nomesAlunos) {
    const listaNomes = nomesAlunos.join(', ');
    let conteudoTruncado = conteudo;
    if (conteudoTruncado.length > LIMITE_CONTEUDO_NOTAS_OFICIAIS) {
        conteudoTruncado = conteudoTruncado.slice(0, LIMITE_CONTEUDO_NOTAS_OFICIAIS) + '\n[...conteúdo truncado...]';
    }

    const instrucao = modo === 'mapao'
        ? `Este é o "mapão bimestral": um mapa oficial de notas por aluno, por disciplina, por bimestre. O arquivo pode conter colunas de mais de um bimestre (ex: 1ºBim, 2ºBim, 3ºBim) e pode conter alunos de outras turmas além da lista abaixo. Extraia UMA linha para cada combinação existente de aluno + disciplina + bimestre.`
        : `Esta é a avaliação nomeada "${nomeAvaliacao}", referente ao ${bimestreSelecionado}º bimestre. O arquivo pode conter alunos de outras turmas além da lista abaixo. Nem toda disciplina é necessariamente testada - extraia apenas as disciplinas que realmente aparecem no arquivo para cada aluno, não invente notas para disciplinas ausentes. Use bimestre=${bimestreSelecionado} em todas as linhas.`;

    return `Você é um assistente extremamente preciso que extrai notas escolares de planilhas/PDFs para um sistema de gestão escolar. Precisão é mais importante que completude: é melhor omitir uma linha duvidosa do que inventar ou arredondar um valor.

${instrucao}

Lista de alunos desta turma (só extraia linhas para alunos desta lista; ignore qualquer nome que não esteja aqui, mesmo que apareça no arquivo — pode ser aluno de outra turma. Use estes nomes exatos ao identificar o aluno no arquivo, mesmo que o arquivo tenha nomes abreviados, com erro de digitação ou fora de ordem):
${listaNomes}

Conteúdo extraído do arquivo:
"""
${conteudoTruncado}
"""

Retorne APENAS um JSON válido, sem marcação markdown, no formato exato:
{"registros": [{"nome_estudante": "...", "disciplina": "...", "bimestre": 1, "valor": "..."}]}

Regras estritas:
- Copie o valor da nota EXATAMENTE como está escrito na fonte, sem arredondar e sem converter formato (ex: se está "7,5" retorne "7,5", não "7.5" nem "8").
- Se a célula indicar ausência/dispensa (ex: "-", "FALTOU", "AUSENTE", "ISENTO", "NC"), copie esse texto literal em "valor" — não invente um número.
- Se uma célula estiver ilegível, vazia, ou você não tiver certeza do valor, OMITA a linha inteira — não adivinhe.
- Não invente notas para aluno/disciplina/bimestre que não estão claramente no arquivo.
- "disciplina" deve ser o nome da matéria como aparece no arquivo (ex: "Matemática", "Língua Portuguesa").`;
}

async function chamarIAExtracaoNotas(promptText) {
    let apiKeys = [];
    const configData = await getData('system', 'config_ia');
    if (configData && configData.apiKey) {
        apiKeys = configData.apiKey.split(',').map(k => k.trim()).filter(k => k);
    }
    if (apiKeys.length === 0) {
        throw new Error('A chave da API não foi configurada. Peça ao Administrador para entrar no painel Super Admin e adicioná-la na aba Migração.');
    }

    let success = false;
    let lastError = '';
    let respostaTexto = '';

    const tentativas = 3;
    const modelosFallback = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

    for (let i = 0; i < tentativas && !success; i++) {
        const modeloAtual = modelosFallback[i % modelosFallback.length];

        for (const currentKey of apiKeys) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);

                if (currentKey.startsWith('sk-') && !currentKey.startsWith('sk-ant-')) {
                    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: 'Você deve retornar APENAS um JSON válido. Nenhuma formatação markdown.' },
                                { role: 'user', content: promptText }
                            ],
                            temperature: 0.1,
                            response_format: { type: "json_object" }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`OpenAI Erro: ${response.statusText}`);
                    const apiDataObj = await response.json();
                    respostaTexto = apiDataObj.choices[0].message.content;

                } else if (currentKey.startsWith('gsk_')) {
                    const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                { role: 'system', content: 'Você deve retornar APENAS um JSON válido. Nenhuma formatação markdown.' },
                                { role: 'user', content: promptText }
                            ],
                            temperature: 0.1,
                            response_format: { type: "json_object" }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`Groq Erro: ${response.statusText}`);
                    const apiDataObj = await response.json();
                    respostaTexto = apiDataObj.choices[0].message.content;

                } else {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeloAtual}:generateContent?key=${currentKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: { temperature: 0.1, response_mime_type: "application/json" }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        const errorObj = await response.json();
                        throw new Error(errorObj.error ? errorObj.error.message : response.statusText);
                    }
                    const apiDataObj = await response.json();
                    if (!apiDataObj.candidates || apiDataObj.candidates.length === 0 || !apiDataObj.candidates[0].content) {
                        throw new Error('A IA não retornou um conteúdo válido.');
                    }
                    respostaTexto = apiDataObj.candidates[0].content.parts[0].text;
                }

                success = true;
                break;
            } catch (err) {
                lastError = err.name === 'AbortError' ? 'Tempo de resposta esgotado.' : err.message;
                console.warn(`⚠️ Falha na API de extração de notas (Tentativa ${i + 1}):`, lastError);
            }
        }
        if (!success && i < tentativas - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    if (!success) {
        throw new Error(`A Inteligência Artificial falhou ou rejeitou o pedido.\nMotivo: ${lastError}`);
    }

    let jsonLimpo = respostaTexto.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
    const jsonMatch = jsonLimpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonLimpo = jsonMatch[0];

    return JSON.parse(jsonLimpo);
}

async function processarArquivoNotasOficiais() {
    const turmasSelecionadas = Array.from(document.querySelectorAll('.chk-turma-notas-oficiais:checked')).map(chk => chk.value);
    const arquivoInput = document.getElementById('notasOficiaisArquivo');
    const arquivo = arquivoInput.files[0];

    if (turmasSelecionadas.length === 0) return alert('Selecione ao menos uma turma.');
    if (!arquivo) return alert('Selecione um arquivo (.xlsx ou .pdf).');

    const modo = notasOficiaisModo;
    const nomeAvaliacao = document.getElementById('notasOficiaisNomeAvaliacao').value.trim();
    const bimestreSelecionado = parseInt(document.getElementById('notasOficiaisBimestre').value);

    if (modo === 'avaliacao' && !nomeAvaliacao) return alert('Informe o nome da avaliação.');

    const btn = document.getElementById('btnProcessarNotasOficiais');
    btn.disabled = true;
    document.getElementById('revisaoNotasOficiais').innerHTML = '';

    try {
        const ext = arquivo.name.split('.').pop().toLowerCase();
        const arrayBuffer = await arquivo.arrayBuffer();

        let abas = null; // só existe pra xlsx - permite tentar o parser determinístico
        let conteudoTexto = '';

        if (ext === 'pdf') {
            definirProgressoNotasOficiais('Carregando leitor de PDF...', 5);
            await carregarBibliotecaBaseCurricular('pdf');
            definirProgressoNotasOficiais('Lendo arquivo...', 15);
            conteudoTexto = await extrairTextoPdfNotasOficiais(arrayBuffer);
        } else {
            definirProgressoNotasOficiais('Carregando leitor de planilha...', 5);
            await carregarBibliotecaBaseCurricular('xlsx');
            definirProgressoNotasOficiais('Lendo arquivo...', 15);
            const extraido = extrairAbasXlsxNotasOficiais(arrayBuffer);
            abas = extraido.abas;
            conteudoTexto = extraido.texto;
        }

        if (conteudoTexto.length > LIMITE_CONTEUDO_NOTAS_OFICIAIS) {
            document.getElementById('revisaoNotasOficiais').innerHTML = `
                <div style="background:#fffaf0; border:1px solid #fbd38d; color:#7b341e; padding:10px; border-radius:6px; font-size:12px; margin-bottom:10px;">
                    ⚠️ Este arquivo é grande (${conteudoTexto.length.toLocaleString('pt-BR')} caracteres). Se alguma turma cair no processamento por IA, parte do conteúdo pode ter sido cortada — confira com atenção se todas as linhas esperadas aparecem na revisão abaixo.
                </div>
            `;
        }

        // Uma turma por vez, em cadeia: (1) parser do formato oficial SED ("Registro e Controle do
        // Rendimento Escolar"), (2) parser genérico de colunas (v3), (3) IA - só avança pro próximo
        // se o anterior não achar NADA pra essa turma (sem gate de confiança: o que for achado é
        // aceito, e quem não aparecer em nenhuma linha fica visível no resumo de cobertura abaixo,
        // sem chamar IA pra completar - decisão do usuário, pra manter controle total com o gestor).
        // PDF não tem coluna estruturada, então vai direto pra IA. Cada chamada de IA usa o roster
        // restrito àquela turma, o que permite distinguir turmas dentro de um arquivo só sem precisar
        // cortar/filtrar o conteúdo (arriscaria perder linhas legítimas).
        let todosRegistros = [];
        const resumosCobertura = [];

        for (let i = 0; i < turmasSelecionadas.length; i++) {
            const idTurma = turmasSelecionadas[i];
            const turmaObj = (data.turmas || []).find(t => t.id == idTurma);
            const roster = (data.estudantes || []).filter(e => e.id_turma == idTurma && (!e.status || e.status === 'Ativo'));

            if (roster.length === 0) continue;

            const progressoBase = 20 + Math.round((i / turmasSelecionadas.length) * 70);
            const labelTurma = turmaObj ? turmaObj.nome : `turma ${i + 1}`;
            let registrosTurma = [];
            let metodoUsado = null;

            if (abas) {
                definirProgressoNotasOficiais(`Lendo planilha (formato SED)... turma ${i + 1} de ${turmasSelecionadas.length} (${labelTurma})`, progressoBase);
                const registrosSed = tentarExtracaoSed(abas, roster);
                if (registrosSed.length > 0) {
                    registrosTurma = registrosSed;
                    metodoUsado = 'planilha';
                } else {
                    definirProgressoNotasOficiais(`Lendo planilha (formato genérico)... turma ${i + 1} de ${turmasSelecionadas.length} (${labelTurma})`, progressoBase);
                    const registrosGenericos = tentarExtracaoDeterministicaXlsx(abas, modo, roster, bimestreSelecionado);
                    if (registrosGenericos.length > 0) {
                        registrosTurma = registrosGenericos;
                        metodoUsado = 'planilha';
                    }
                }
            }

            if (registrosTurma.length === 0) {
                definirProgressoNotasOficiais(`Processando com IA... turma ${i + 1} de ${turmasSelecionadas.length} (${labelTurma})`, progressoBase);
                const prompt = montarPromptNotasOficiais(modo, nomeAvaliacao, bimestreSelecionado, conteudoTexto, roster.map(e => e.nome_completo));
                const resultado = await chamarIAExtracaoNotas(prompt);
                registrosTurma = Array.isArray(resultado.registros) ? resultado.registros : [];
                metodoUsado = 'ia';
            }

            registrosTurma = registrosTurma.map(r => ({ ...r, _id_turma_origem: idTurma, _metodo: metodoUsado }));

            const nomesEncontrados = new Set(registrosTurma.map(r => normNomeNotasOficiais(r.nome_estudante)));
            const faltantes = roster.filter(e => !nomesEncontrados.has(normNomeNotasOficiais(e.nome_completo)));
            resumosCobertura.push({
                turmaNome: labelTurma,
                total: roster.length,
                encontrados: roster.length - faltantes.length,
                faltantes: faltantes.map(e => e.nome_completo)
            });

            todosRegistros = todosRegistros.concat(registrosTurma);
        }

        if (todosRegistros.length === 0) {
            alert('Não foi possível extrair nenhum registro deste arquivo. Verifique se o arquivo contém as notas esperadas.');
            return;
        }

        definirProgressoNotasOficiais(`${todosRegistros.length} registros extraídos. Revise antes de salvar.`, 100);
        montarRevisaoNotasOficiais(todosRegistros, bimestreSelecionado, resumosCobertura);
    } catch (err) {
        console.error(err);
        alert('Erro ao processar o arquivo: ' + err.message);
    } finally {
        btn.disabled = false;
    }
}

const TEXTOS_AUSENCIA_NOTA_OFICIAL = ['-', 'FALTOU', 'AUSENTE', 'ISENTO', 'NC', 'N/A', 'DISPENSADO'];

function valorNotaOficialPareceValido(valor) {
    const v = String(valor || '').trim().toUpperCase();
    if (v === '') return false;
    if (TEXTOS_AUSENCIA_NOTA_OFICIAL.includes(v)) return true;
    const num = parseFloat(v.replace(',', '.'));
    return !isNaN(num) && num >= 0 && num <= 10;
}

function montarRevisaoNotasOficiais(registros, bimestreSelecionado, resumosCobertura) {
    // Cada linha guarda a turma de origem (definida na chamada de IA que a gerou) e resolve seu
    // candidato de aluno só dentro do roster daquela turma — evita colisão de nomes entre turmas
    // diferentes selecionadas na mesma leva de upload.
    notasOficiaisRegistrosPendentes = registros.map((r, idx) => {
        const idTurmaOrigem = r._id_turma_origem;
        const rosterTurma = (data.estudantes || []).filter(e => e.id_turma == idTurmaOrigem && (!e.status || e.status === 'Ativo'));
        const nomeNorm = normNomeNotasOficiais(r.nome_estudante);
        let candidato = rosterTurma.find(e => normNomeNotasOficiais(e.nome_completo) === nomeNorm);

        if (!candidato) {
            // Sugestão por similaridade (nome com acento/abreviação diferente)
            const normA = normalizarTextoComparacaoMaterialDigital(r.nome_estudante);
            let melhor = null, melhorSimilaridade = 0;
            rosterTurma.forEach(e => {
                const normB = normalizarTextoComparacaoMaterialDigital(e.nome_completo);
                const dist = distanciaLevenshteinMaterialDigital(normA, normB);
                const sim = 1 - (dist / Math.max(normA.length, normB.length, 1));
                if (sim > melhorSimilaridade) { melhorSimilaridade = sim; melhor = e; }
            });
            if (melhor && melhorSimilaridade >= 0.6) candidato = melhor;
        }

        return {
            _idx: idx,
            id_turma_origem: idTurmaOrigem,
            metodo: r._metodo || 'ia',
            nome_original: r.nome_estudante || '',
            estudanteId: candidato ? candidato.id : '',
            disciplina: r.disciplina || '',
            bimestre: parseInt(r.bimestre) || bimestreSelecionado || 1,
            valor: r.valor != null ? String(r.valor) : '',
            ignorar: !candidato
        };
    });

    const turmas = data.turmas || [];
    const container = document.getElementById('revisaoNotasOficiais');
    const htmlAviso = container.innerHTML; // preserva o aviso de truncamento, se houver

    // Resumo de cobertura por turma: não tenta completar via IA (decisão do usuário) - só deixa
    // visível quem ficou sem nenhuma linha extraída, pra o gestor decidir o que fazer.
    const htmlCobertura = (resumosCobertura || []).map(r => {
        const cor = r.faltantes.length === 0 ? '#276749' : '#7b341e';
        const fundo = r.faltantes.length === 0 ? '#f0fff4' : '#fffaf0';
        return `
            <div style="background:${fundo}; border:1px solid #e2e8f0; color:${cor}; padding:8px 12px; border-radius:6px; font-size:12px; margin-bottom:6px;">
                <strong>${r.turmaNome}:</strong> ${r.encontrados} de ${r.total} alunos com nota lançada nesta leitura.
                ${r.faltantes.length > 0 ? `<br>Sem nenhuma linha: ${r.faltantes.join(', ')}` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = htmlAviso + htmlCobertura + `
        <h3>Revisão antes de salvar (${notasOficiaisRegistrosPendentes.length} linhas)</h3>
        <p style="font-size:12px; color:#666;">Confira o aluno de cada linha (a extração pode errar o casamento de nomes). Linhas em laranja têm um valor de nota que não parece válido — confira antes de salvar. Linhas marcadas "Ignorar" não serão salvas.</p>
        <div style="overflow-x:auto;">
            <table style="font-size:13px;">
                <thead><tr><th>Turma</th><th>Origem</th><th>Nome no Arquivo</th><th>Aluno</th><th>Disciplina</th><th>Bimestre</th><th>Nota</th><th>Ignorar</th></tr></thead>
                <tbody id="tbodyRevisaoNotasOficiais">
                    ${notasOficiaisRegistrosPendentes.map(r => {
                        const rosterTurma = (data.estudantes || []).filter(e => e.id_turma == r.id_turma_origem && (!e.status || e.status === 'Ativo'));
                        const turmaObj = turmas.find(t => t.id == r.id_turma_origem);
                        const valorSuspeito = !valorNotaOficialPareceValido(r.valor);
                        const corFundo = r.ignorar ? 'background:#fff5f5;' : (valorSuspeito ? 'background:#fffaf0;' : '');
                        const badgeMetodo = r.metodo === 'planilha'
                            ? '<span style="background:#e6fffa; color:#234e52; border:1px solid #b2f5ea; font-size:10px; padding:2px 6px; border-radius:4px;" title="Lido direto da planilha, sem IA">📊 Planilha</span>'
                            : '<span style="background:#faf5ff; color:#553c9a; border:1px solid #e9d8fd; font-size:10px; padding:2px 6px; border-radius:4px;" title="Extraído por IA">🤖 IA</span>';
                        return `
                        <tr style="${corFundo}">
                            <td>${turmaObj ? turmaObj.nome : '-'}</td>
                            <td>${badgeMetodo}</td>
                            <td>${r.nome_original}</td>
                            <td>
                                <select onchange="atualizarCampoRevisaoNotas(${r._idx}, 'estudanteId', this.value)">
                                    <option value="">Não encontrado</option>
                                    ${rosterTurma.map(e => `<option value="${e.id}" ${e.id == r.estudanteId ? 'selected' : ''}>${e.nome_completo}</option>`).join('')}
                                </select>
                            </td>
                            <td><input type="text" value="${r.disciplina}" style="width:120px;" onchange="atualizarCampoRevisaoNotas(${r._idx}, 'disciplina', this.value)"></td>
                            <td><input type="number" min="1" max="4" value="${r.bimestre}" style="width:50px;" onchange="atualizarCampoRevisaoNotas(${r._idx}, 'bimestre', this.value)"></td>
                            <td><input type="text" value="${r.valor}" style="width:60px; ${valorSuspeito ? 'border-color:#dd6b20;' : ''}" title="${valorSuspeito ? 'Valor não parece uma nota válida (0-10 ou texto de ausência)' : ''}" onchange="atualizarCampoRevisaoNotas(${r._idx}, 'valor', this.value)"></td>
                            <td><input type="checkbox" ${r.ignorar ? 'checked' : ''} onchange="atualizarCampoRevisaoNotas(${r._idx}, 'ignorar', this.checked)"></td>
                        </tr>
                    `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:15px; display:flex; gap:10px;">
            <button class="btn btn-success" onclick="confirmarGravacaoNotasOficiais()">✅ Confirmar e Salvar</button>
            <button class="btn btn-secondary" onclick="renderNotasOficiaisGestor()">Cancelar</button>
        </div>
    `;

    // Trava modo/bimestre/nome enquanto a revisão está aberta: como confirmarGravacaoNotasOficiais()
    // relê esses campos do formulário (para não interpolar texto livre do gestor num onclick), eles não
    // podem mudar entre "Processar com IA" e "Confirmar e Salvar". A turma de cada linha já ficou fixada
    // em `id_turma_origem` no momento da extração, então as turmas não precisam ficar travadas.
    document.getElementById('notasOficiaisNomeAvaliacao').disabled = true;
    document.getElementById('notasOficiaisBimestre').disabled = true;
    document.querySelectorAll('input[name="notasOficiaisModoRadio"]').forEach(r => r.disabled = true);
}

function atualizarCampoRevisaoNotas(idx, campo, valor) {
    const registro = notasOficiaisRegistrosPendentes.find(r => r._idx === idx);
    if (!registro) return;
    if (campo === 'ignorar') {
        registro.ignorar = valor;
    } else if (campo === 'bimestre') {
        registro.bimestre = parseInt(valor) || 1;
    } else {
        registro[campo] = valor;
    }
    if (campo === 'estudanteId') {
        registro.ignorar = !valor;
    }
}

async function confirmarGravacaoNotasOficiais() {
    const modo = notasOficiaisModo;
    const nomeAvaliacao = document.getElementById('notasOficiaisNomeAvaliacao').value.trim();
    const bimestreSelecionado = parseInt(document.getElementById('notasOficiaisBimestre').value);

    const validos = notasOficiaisRegistrosPendentes.filter(r => !r.ignorar && r.estudanteId && r.valor !== '');
    if (validos.length === 0) return alert('Nenhuma linha válida para salvar (verifique o casamento de alunos).');

    const agora = Date.now();
    const nomeArquivoInput = document.getElementById('notasOficiaisArquivo');
    const nomeArquivo = nomeArquivoInput.files[0] ? nomeArquivoInput.files[0].name : '';

    if (modo === 'mapao') {
        if (!data.notasBimestraisOficiais) data.notasBimestraisOficiais = [];
        if (!data.lotesMapaoGestor) data.lotesMapaoGestor = [];

        const loteId = agora;
        const turmasDoLote = new Set();

        validos.forEach(r => {
            const estudante = (data.estudantes || []).find(e => e.id == r.estudanteId);
            if (!estudante) return;
            const nomeNorm = normNomeNotasOficiais(estudante.nome_completo);
            const disciplinaNorm = normalizarTextoComparacaoMaterialDigital(r.disciplina);

            let existente = data.notasBimestraisOficiais.find(n =>
                n.id_turma == estudante.id_turma &&
                n.bimestre == r.bimestre &&
                normNomeNotasOficiais(n.nome_estudante_norm) === nomeNorm &&
                normalizarTextoComparacaoMaterialDigital(n.disciplina) === disciplinaNorm
            );

            if (existente) {
                existente.valor = r.valor;
                existente.origem = { tipo: 'mapao', nomeArquivo, dataImportacao: agora, loteId };
            } else {
                data.notasBimestraisOficiais.push({
                    id: agora + Math.random(),
                    nome_estudante_norm: nomeNorm,
                    nome_estudante_display: estudante.nome_completo,
                    disciplina: r.disciplina,
                    bimestre: r.bimestre,
                    valor: r.valor,
                    id_turma: estudante.id_turma,
                    origem: { tipo: 'mapao', nomeArquivo, dataImportacao: agora, loteId }
                });
            }
            turmasDoLote.add(estudante.id_turma);
        });

        const nomesTurmasDoLote = [...turmasDoLote].map(id => {
            const t = (data.turmas || []).find(x => x.id == id);
            return t ? t.nome : 'Turma removida';
        });
        data.lotesMapaoGestor.push({
            id: loteId,
            nomeArquivo,
            turmas: nomesTurmasDoLote,
            dataImportacao: agora,
            totalRegistros: validos.length
        });
    } else {
        if (!data.avaliacoesGestor) data.avaliacoesGestor = [];
        if (!data.notasAvaliacoesGestor) data.notasAvaliacoesGestor = [];

        const disciplinasEnvolvidas = [...new Set(validos.map(r => r.disciplina).filter(Boolean))];
        const turmasEnvolvidas = [...new Set(validos.map(r => r.id_turma_origem).filter(Boolean))];

        let avaliacao = data.avaliacoesGestor.find(a =>
            a.bimestre == bimestreSelecionado && a.nome.trim().toLowerCase() === nomeAvaliacao.trim().toLowerCase()
        );

        if (!avaliacao) {
            avaliacao = { id: agora, nome: nomeAvaliacao, bimestre: bimestreSelecionado, id_turmas: turmasEnvolvidas, disciplinas: disciplinasEnvolvidas, criadoEm: agora };
            data.avaliacoesGestor.push(avaliacao);
        } else {
            avaliacao.disciplinas = [...new Set([...(avaliacao.disciplinas || []), ...disciplinasEnvolvidas])];
            avaliacao.id_turmas = [...new Set([...(avaliacao.id_turmas || []), ...turmasEnvolvidas])];
        }

        validos.forEach(r => {
            const estudante = (data.estudantes || []).find(e => e.id == r.estudanteId);
            if (!estudante) return;
            const nomeNorm = normNomeNotasOficiais(estudante.nome_completo);
            const disciplinaNorm = normalizarTextoComparacaoMaterialDigital(r.disciplina);

            let existente = data.notasAvaliacoesGestor.find(n =>
                n.id_avaliacao == avaliacao.id &&
                normNomeNotasOficiais(n.nome_estudante_norm) === nomeNorm &&
                normalizarTextoComparacaoMaterialDigital(n.disciplina) === disciplinaNorm
            );

            if (existente) {
                existente.valor = r.valor;
                existente.atualizadoEm = agora;
            } else {
                data.notasAvaliacoesGestor.push({
                    id: agora + Math.random(),
                    id_avaliacao: avaliacao.id,
                    nome_estudante_norm: nomeNorm,
                    nome_estudante_display: estudante.nome_completo,
                    disciplina: r.disciplina,
                    valor: r.valor,
                    atualizadoEm: agora
                });
            }
        });
    }

    await persistirDados();
    alert(`Notas salvas com sucesso! (${validos.length} registros)`);
    notasOficiaisRegistrosPendentes = [];
    document.getElementById('notasOficiaisArquivo').value = '';
    document.getElementById('progressoNotasOficiais').style.display = 'none';
    renderNotasOficiaisGestor();
}

// Monta o HTML de notas oficiais (mapão + avaliações da gestão) de um único aluno, reaproveitado
// tanto na ficha do estudante (app.js:renderEstudanteGeral/preencherNotasOficiaisEstudante) quanto
// na ficha de tutoria (card inline e relatório imprimível do gestor). `dadosGestor` é sempre o
// formato {notasBimestraisOficiais, avaliacoesGestor, notasAvaliacoesGestor}, vindo do `data` do
// próprio gestor ou buscado entre-documentos quando quem vê é professor/tutor.
function montarTabelaNotasOficiaisHtml(dadosGestor, nomeNorm) {
    const mapao = (dadosGestor.notasBimestraisOficiais || []).filter(n => normNomeNotasOficiais(n.nome_estudante_norm) === nomeNorm);
    const notasAvaliacoes = (dadosGestor.notasAvaliacoesGestor || []).filter(n => normNomeNotasOficiais(n.nome_estudante_norm) === nomeNorm);

    if (mapao.length === 0 && notasAvaliacoes.length === 0) return '';

    let html = '';

    if (mapao.length > 0) {
        const porDisciplina = {};
        mapao.forEach(n => {
            if (!porDisciplina[n.disciplina]) porDisciplina[n.disciplina] = {};
            porDisciplina[n.disciplina][n.bimestre] = n.valor;
        });
        html += `
            <div style="margin-bottom:15px;">
                <p style="font-weight:bold; font-size:13px; margin-bottom:5px;">📋 Notas Oficiais (Mapão Bimestral)</p>
                <table style="font-size:12px;">
                    <thead><tr><th>Disciplina</th><th>1º Bim</th><th>2º Bim</th><th>3º Bim</th><th>4º Bim</th></tr></thead>
                    <tbody>
                        ${Object.keys(porDisciplina).sort().map(disc => `
                            <tr>
                                <td>${disc}</td>
                                ${[1, 2, 3, 4].map(b => `<td style="text-align:center;">${porDisciplina[disc][b] || '-'}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    if (notasAvaliacoes.length > 0) {
        const porAvaliacao = {};
        notasAvaliacoes.forEach(n => {
            if (!porAvaliacao[n.id_avaliacao]) porAvaliacao[n.id_avaliacao] = [];
            porAvaliacao[n.id_avaliacao].push(n);
        });
        html += `
            <div>
                <p style="font-weight:bold; font-size:13px; margin-bottom:5px;">📝 Avaliações da Gestão</p>
                ${Object.keys(porAvaliacao).map(idAval => {
                    const avaliacao = (dadosGestor.avaliacoesGestor || []).find(a => a.id == idAval);
                    const registros = porAvaliacao[idAval];
                    return `<div style="font-size:12px; margin-bottom:6px;">
                        <strong>${avaliacao ? avaliacao.nome : 'Avaliação'}</strong>${avaliacao ? ` (${avaliacao.bimestre}º Bim.)` : ''}:
                        ${registros.map(r => `${r.disciplina}: <strong>${r.valor}</strong>`).join(' | ')}
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    return html;
}
// ==================== PÁGINA "ESCOLA" (VISÃO GESTOR) ====================
// Permite ao gestor configurar a própria escola (nome, região, logo) e gerenciar
// os perfis dos professores (alterar perfil e ativar/inativar). O gestor NÃO vê
// e-mail e NÃO exclui usuários (exclusão é exclusiva do super admin).

const ROLE_MAP_GESTOR = {
    'gestor': { label: 'Gestor', class: 'badge-warning' },
    'aee': { label: 'AEE', class: 'badge-success' },
    'projeto': { label: 'Projeto', class: 'badge-info' },
    'professor': { label: 'Professor', class: 'badge-info' }
};

async function renderEscolaGestor() {
    const tela = document.getElementById('escolaGestor');
    if (!tela) return;

    if (!currentUser || !currentUser.schoolId) {
        tela.innerHTML = `
            <div class="card" style="margin:20px 0;">
                <h2>🏫 Escola</h2>
                <p class="empty-state">Seu usuário não está vinculado a nenhuma escola. Peça ao administrador para vincular você a uma escola.</p>
            </div>`;
        return;
    }

    const sData = await getData('system', 'schools_list');
    const schools = (sData && sData.list && Array.isArray(sData.list)) ? sData.list : [];
    const escola = schools.find(s => s.id == currentUser.schoolId);

    if (!escola) {
        tela.innerHTML = `
            <div class="card" style="margin:20px 0;">
                <h2>🏫 Escola</h2>
                <p class="empty-state">A escola vinculada ao seu usuário ainda não foi cadastrada pelo administrador. A lista de professores continua disponível abaixo.</p>
            </div>
            <div class="card" style="margin:20px 0;">
                <h2>👥 Professores da Escola</h2>
                <div id="listaProfessoresGestor"></div>
            </div>`;
        renderListaProfessoresGestor();
        return;
    }

    const logoPreview = escola.logoEscola
        ? `<img id="previewLogoEscolaGestor" src="${escola.logoEscola}" style="max-height:80px; display:block; border-radius:4px; margin-top:8px;">`
        : `<img id="previewLogoEscolaGestor" style="max-height:80px; display:none; border-radius:4px; margin-top:8px;">`;

    tela.innerHTML = `
        <div class="card" style="margin:20px 0;">
            <h2>🏫 Configurações da Escola</h2>
            <p style="color:#666; font-size:14px; margin-bottom:15px;">Ajuste os dados da sua escola. Essas informações aparecem no cabeçalho do sistema e em documentos.</p>
            <form onsubmit="salvarConfigEscolaGestor(event)">
                <label>Nome da Escola:
                    <input type="text" id="escolaGestorNome" value="${escola.nome || ''}" required style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>Nome Completo (para documentos):
                    <input type="text" id="escolaGestorNomeCompleto" value="${escola.nomeCompleto || ''}" placeholder="Ex: E.E. PEI PROFESSORA FRANCISCA LISBOA PERALTA" style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>Região:
                    <input type="text" id="escolaGestorRegiao" value="${escola.regiao || ''}" placeholder="Ex: REGIÃO OSASCO" style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>E-mail da Escola:
                    <input type="email" id="escolaGestorEmail" value="${escola.email || ''}" placeholder="Ex: e010790a@educacao.sp.gov.br" style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>Endereço:
                    <input type="text" id="escolaGestorEndereco" value="${escola.endereco || ''}" placeholder="Ex: Av. Prof. Lourenço Filho, 560 – Jd. Elvira, Osasco – SP" style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>Telefone(s):
                    <input type="text" id="escolaGestorTelefone" value="${escola.telefone || ''}" placeholder="Ex: (11) 3686-3167 / (11) 3686-1671" style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>Logo da Escola:
                    <input type="file" accept="image/*" style="width:100%; margin-bottom:5px;" onchange="converterImagemBase64(this, 'escolaGestorLogoBase64', 'previewLogoEscolaGestor')">
                    <input type="hidden" id="escolaGestorLogoBase64" value="${escola.logoEscola || ''}">
                    ${logoPreview}
                </label>
                <button type="submit" class="btn btn-primary" style="margin-top:15px;">💾 Salvar Configurações</button>
            </form>
        </div>

        <div class="card" style="margin:20px 0;">
            <h2>👥 Professores da Escola</h2>
            <p style="color:#666; font-size:14px; margin-bottom:15px;">Altere o perfil ou ative/inative o acesso de edição. Professores inativos continuam acessando o sistema em modo somente leitura.</p>
            <div id="listaProfessoresGestor"></div>
        </div>`;

    renderListaProfessoresGestor();
}

async function salvarConfigEscolaGestor(e) {
    if (e) e.preventDefault();
    if (!currentUser || !currentUser.schoolId) return;

    const sData = await getData('system', 'schools_list');
    const schools = (sData && sData.list && Array.isArray(sData.list)) ? sData.list : [];
    const escola = schools.find(s => s.id == currentUser.schoolId);

    if (!escola) {
        alert('A escola ainda não foi cadastrada pelo administrador. Não é possível salvar as configurações.');
        return;
    }

    escola.nome = document.getElementById('escolaGestorNome').value.trim();
    escola.nomeCompleto = document.getElementById('escolaGestorNomeCompleto').value.trim();
    escola.regiao = document.getElementById('escolaGestorRegiao').value.trim();
    escola.email = document.getElementById('escolaGestorEmail').value.trim();
    escola.endereco = document.getElementById('escolaGestorEndereco').value.trim();
    escola.telefone = document.getElementById('escolaGestorTelefone').value.trim();
    escola.logoEscola = document.getElementById('escolaGestorLogoBase64').value;

    await saveData('system', 'schools_list', { list: schools });
    alert('Configurações da escola salvas com sucesso!');
    renderEscolaGestor();
}

async function renderListaProfessoresGestor() {
    const container = document.getElementById('listaProfessoresGestor');
    if (!container) return;

    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    const professores = users.filter(u => u.schoolId == currentUser.schoolId && u.role !== 'super_admin');

    if (professores.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum professor vinculado a esta escola.</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Perfil</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${professores.map(u => {
                    const roleInfo = ROLE_MAP_GESTOR[u.role] || ROLE_MAP_GESTOR['professor'];
                    const ativo = (u.active !== false); // undefined = ativo
                    const isSelf = (currentUser && (String(u.id) === String(currentUser.id) || (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase())));
                    const statusBadge = ativo
                        ? `<span class="badge badge-success">Ativo</span>`
                        : `<span class="badge badge-danger">Inativo</span>`;
                    let acoes;
                    if (isSelf) {
                        acoes = `<span style="color:#999; font-size:12px;">Você (edite pelo admin)</span>`;
                    } else {
                        acoes = `
                            <button class="btn btn-secondary btn-sm" onclick="editarPerfilProfessorGestor('${u.id}')" title="Alterar Perfil">✏️ Perfil</button>
                            <button class="btn ${ativo ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleAtivoProfessorGestor('${u.id}')" title="${ativo ? 'Inativar acesso de edição' : 'Reativar'}">${ativo ? '🚫 Inativar' : '✅ Ativar'}</button>`;
                    }
                    return `
                    <tr>
                        <td>${u.nome || '(sem nome)'}</td>
                        <td><span class="badge ${roleInfo.class}">${roleInfo.label}</span></td>
                        <td>${statusBadge}</td>
                        <td>${acoes}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

function garantirModalPerfilProfessorGestor() {
    if (document.getElementById('modalPerfilProfessorGestor')) return;
    const modal = document.createElement('div');
    modal.id = 'modalPerfilProfessorGestor';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Alterar Perfil</h2>
                <button class="close-btn" onclick="closeModal('modalPerfilProfessorGestor')">×</button>
            </div>
            <form onsubmit="salvarPerfilProfessorGestor(event)">
                <input type="hidden" id="perfilProfessorGestorId">
                <p id="perfilProfessorGestorNome" style="font-weight:bold; margin-bottom:10px;"></p>
                <label>Tipo de Perfil:
                    <select id="perfilProfessorGestorRole" style="width:100%; padding:8px; margin-bottom:10px;">
                        <option value="professor">Professor</option>
                        <option value="gestor">Gestor</option>
                        <option value="aee">AEE</option>
                        <option value="projeto">Projeto</option>
                    </select>
                </label>
                <button type="submit" class="btn btn-primary" style="width:100%;">Salvar</button>
            </form>
        </div>`;
    document.body.appendChild(modal);
}

async function editarPerfilProfessorGestor(id) {
    garantirModalPerfilProfessorGestor();
    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    const user = users.find(u => String(u.id) === String(id));
    if (!user) return;

    if (user.schoolId != currentUser.schoolId || user.role === 'super_admin') {
        alert('Você só pode alterar professores da sua própria escola.');
        return;
    }

    document.getElementById('perfilProfessorGestorId').value = user.id;
    document.getElementById('perfilProfessorGestorNome').textContent = user.nome || '(sem nome)';
    document.getElementById('perfilProfessorGestorRole').value = user.role || 'professor';
    showModal('modalPerfilProfessorGestor');
}

async function salvarPerfilProfessorGestor(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('perfilProfessorGestorId').value;
    const role = document.getElementById('perfilProfessorGestorRole').value;

    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    const user = users.find(u => String(u.id) === String(id));
    if (!user) return;

    // Guarda de segurança: só a própria escola, nunca o próprio usuário, nunca super_admin
    const isSelf = (String(user.id) === String(currentUser.id) || (user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase()));
    if (user.schoolId != currentUser.schoolId || user.role === 'super_admin' || isSelf) {
        alert('Ação não permitida.');
        return;
    }

    user.role = role;
    await saveData('system', 'users_list', { list: users });
    closeModal('modalPerfilProfessorGestor');
    renderListaProfessoresGestor();
}

async function toggleAtivoProfessorGestor(id) {
    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    const user = users.find(u => String(u.id) === String(id));
    if (!user) return;

    const isSelf = (String(user.id) === String(currentUser.id) || (user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase()));
    if (user.schoolId != currentUser.schoolId || user.role === 'super_admin' || isSelf) {
        alert('Ação não permitida.');
        return;
    }

    const ativoAtual = (user.active !== false);
    const novoEstado = !ativoAtual;
    const acao = novoEstado ? 'reativar' : 'inativar';
    if (!confirm(`Deseja ${acao} o acesso de edição de "${user.nome || 'este professor'}"?${novoEstado ? '' : '\n\nEle continuará acessando o sistema, mas em modo somente leitura.'}`)) return;

    user.active = novoEstado;
    await saveData('system', 'users_list', { list: users });
    renderListaProfessoresGestor();
}
