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
        <button onclick="showScreen('aeeVisaoGeral', event)"><span class="icon">🌟</span><span class="label">Painel AEE</span></button>
        <button onclick="showScreen('horariosGestor', event)"><span class="icon">⏰</span><span class="label">Horários</span></button>
        <button onclick="showScreen('escolaGestor', event)"><span class="icon">🏫</span><span class="label">Escola</span></button>
        <button onclick="showScreen('biblioteca', event)"><span class="icon">📚</span><span class="label">Biblioteca</span></button>
        <button onclick="showScreen('ferramentas', event)"><span class="icon">🧰</span><span class="label">Ferramentas</span></button>
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
            <div style="margin-bottom: 20px; border-bottom: 1px solid #e3e8ef; display: flex; gap: 10px;">
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
                <button class="btn ${currentRegistrosTab === 'feriados' ? 'btn-primary' : 'btn-secondary'}"
                        onclick="currentRegistrosTab='feriados'; renderRegistrosGestor()">
                    🎉 Feriados e Recessos
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
    } else if (currentRegistrosTab === 'feriados') {
        renderAbaFeriados();
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
            
            <div class="card" style="background: #f6f8fb; border: 1px solid #e3e8ef; margin-bottom: 20px; padding: 15px;">
                <h4 style="margin-top: 0; color: #1b4488; margin-bottom: 10px;">Filtros</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                    <label style="flex: 1; min-width: 150px;">
                        <span style="font-size: 12px; font-weight: bold;">Bimestre:</span><br>
                        <select id="filtroArqBimestre" onchange="atualizarFiltrosArquivados()" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cdd5e1;">
                            <option value="0" ${stateArqBimestre === 0 ? 'selected' : ''}>Todos</option>
                            <option value="1" ${stateArqBimestre === 1 ? 'selected' : ''}>1º Bimestre</option>
                            <option value="2" ${stateArqBimestre === 2 ? 'selected' : ''}>2º Bimestre</option>
                            <option value="3" ${stateArqBimestre === 3 ? 'selected' : ''}>3º Bimestre</option>
                            <option value="4" ${stateArqBimestre === 4 ? 'selected' : ''}>4º Bimestre</option>
                        </select>
                    </label>
                    <label style="flex: 1; min-width: 150px;">
                        <span style="font-size: 12px; font-weight: bold;">Turma:</span><br>
                        <select id="filtroArqTurma" onchange="atualizarFiltrosArquivados()" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cdd5e1;">
                            <option value="0" ${stateArqTurma === 0 ? 'selected' : ''}>Todas</option>
                            ${(data.turmas || []).map(t => `<option value="${t.id}" ${stateArqTurma == t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}
                        </select>
                    </label>
                    <label style="flex: 2; min-width: 200px;">
                        <span style="font-size: 12px; font-weight: bold;">Buscar por Nome:</span><br>
                        <input type="text" id="filtroArqNome" value="${stateArqNome}" oninput="atualizarFiltrosArquivados()" placeholder="Digite o nome do estudante..." style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cdd5e1;">
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
                cor = '#5f6b7f';
            } else {
                cor = '#2563c9';
            }
        } else if (r.tipo === 'Faltoso') {
            cor = '#ef4444';
            if (estudante.status && estudante.status !== 'Ativo') {
                status = `Arquivado (${estudante.status})`;
                cor = '#5f6b7f';
            }
        }

        if (r.arquivado) {
            status = 'Arquivado';
            cor = '#5f6b7f';
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
                <h3 style="margin-top: 20px; border-bottom: 2px solid #e3e8ef; padding-bottom: 5px; color: #1c2536;">${bimKey}</h3>
                ${Object.keys(grupos[bimKey]).sort().map(turmaNome => `
                    <h4 style="margin-top: 15px; color: #3d4759; background: #eef2f7; padding: 5px 10px; border-radius: 4px;">${turmaNome}</h4>
                    <table>
                        <thead><tr><th>Tipo</th><th>Status</th><th>Estudante</th><th>Data/Detalhes</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${grupos[bimKey][turmaNome].map(r => `
                                <tr>
                                    <td style="color: ${r.cor}; font-weight: bold;">${r.tipo}</td>
                                    <td><span class="badge" style="background:${r.status === 'Vencido' ? '#e3e8ef' : '#edf3fd'}; color:${r.cor}; font-size:10px;">${r.status}</span></td>
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
            <p style="color:#5f6b7f; font-size:14px; margin-bottom:20px;">Defina as datas de início e fim de cada bimestre. Isso será usado pelos professores para o cálculo de atestados e relatórios.</p>
            
            <form onsubmit="salvarConfigBimestres(event)">
                <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    ${config.map((c, i) => `
                        <div class="card" style="padding:15px; background:#f6f8fb; border:1px solid #e3e8ef;">
                            <h4 style="margin-top:0; color:#1b4488;">${c.bim}º Bimestre</h4>
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

// --- Feriados e Recessos (usado para NÃO marcar compromissos no Google Agenda dos professores) ---
function renderAbaFeriados() {
    const feriados = (data.feriadosEscolares || []).slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const cidade = data.escolaCidade || '';
    const uf = data.escolaUF || '';

    const linhas = feriados.map((f, i) => linhaFeriadoHTML(f.data, f.nome, i)).join('');

    const html = `
        <div>
            <h2>🎉 Feriados, Recessos e Férias</h2>
            <p style="color:#5f6b7f; font-size:14px; margin-bottom:16px;">
                Estas datas são respeitadas na sincronização com o Google Agenda dos professores: nenhum compromisso é
                marcado em feriados, recessos ou férias. As datas fora dos bimestres já contam automaticamente como férias/recesso.
                Os <strong>feriados nacionais</strong> são calculados automaticamente — cadastre aqui apenas os
                <strong>municipais/estaduais e recessos locais</strong>.
            </p>

            <div class="card" style="background:#f6f8fb; border:1px solid #e3e8ef; padding:15px; margin-bottom:16px;">
                <h4 style="margin-top:0; color:#1b4488;">Localização da escola (para feriados regionais)</h4>
                <div style="display:flex; gap:15px; flex-wrap:wrap;">
                    <label style="flex:2; min-width:180px;"><span style="font-size:12px; font-weight:bold;">Cidade:</span><br>
                        <input type="text" id="feriadoCidade" value="${cidade}" placeholder="Ex.: Osasco" style="width:100%; padding:6px;"></label>
                    <label style="flex:1; min-width:80px;"><span style="font-size:12px; font-weight:bold;">UF:</span><br>
                        <input type="text" id="feriadoUF" value="${uf}" maxlength="2" placeholder="SP" style="width:100%; padding:6px; text-transform:uppercase;"></label>
                </div>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
                <button class="btn btn-secondary btn-sm" onclick="adicionarLinhaFeriado()">+ Adicionar data</button>
                <button class="btn btn-secondary btn-sm" onclick="sugerirFeriadosNacionais()">✨ Sugerir feriados nacionais do ano</button>
            </div>

            <div id="listaFeriados">
                ${linhas || '<p style="color:#999; font-size:13px;">Nenhum feriado/recesso cadastrado ainda.</p>'}
            </div>

            <button type="button" class="btn btn-primary" style="margin-top:20px; width:100%; padding:12px;" onclick="salvarFeriados()">💾 Salvar Feriados e Recessos</button>
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
}

function linhaFeriadoHTML(dataVal, nomeVal, idx) {
    return `
        <div class="feriado-linha" style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
            <input type="date" class="feriado-data" value="${dataVal || ''}" style="padding:6px;">
            <input type="text" class="feriado-nome" value="${(nomeVal || '').replace(/"/g, '&quot;')}" placeholder="Nome (ex.: Aniversário da cidade / Recesso)" style="flex:1; padding:6px;">
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
        </div>`;
}

function adicionarLinhaFeriado() {
    const lista = document.getElementById('listaFeriados');
    // Se estava com a mensagem de vazio, limpa antes.
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', linhaFeriadoHTML('', '', Date.now()));
}

function sugerirFeriadosNacionais() {
    if (typeof CalendarioEscolar === 'undefined') return alert('Módulo de calendário não carregado.');
    const ano = new Date().getFullYear();
    const nacionais = CalendarioEscolar.feriadosNacionais(ano);
    const lista = document.getElementById('listaFeriados');
    const existentes = new Set(Array.from(lista.querySelectorAll('.feriado-data')).map(el => el.value));
    if (lista.querySelector('p')) lista.innerHTML = '';
    Object.keys(nacionais).sort().forEach(dataStr => {
        if (existentes.has(dataStr)) return;
        lista.insertAdjacentHTML('beforeend', linhaFeriadoHTML(dataStr, nacionais[dataStr], Date.now()));
    });
    alert('Feriados nacionais do ano ' + ano + ' adicionados à lista. Revise e clique em Salvar.');
}

function salvarFeriados() {
    const linhas = document.querySelectorAll('#listaFeriados .feriado-linha');
    const feriados = [];
    linhas.forEach(l => {
        const dataVal = l.querySelector('.feriado-data').value;
        const nomeVal = l.querySelector('.feriado-nome').value.trim();
        if (dataVal) feriados.push({ data: dataVal, nome: nomeVal || 'Feriado/Recesso' });
    });

    data.feriadosEscolares = feriados;
    data.escolaCidade = (document.getElementById('feriadoCidade').value || '').trim();
    data.escolaUF = (document.getElementById('feriadoUF').value || '').trim().toUpperCase();

    persistirDados();
    alert('Feriados e recessos salvos! A agenda dos professores será atualizada na próxima sincronização.');
    renderRegistrosGestor();
}

async function renderAbaAlertasBuscaAtiva(forceRefresh = false) {
    const container = document.getElementById('registrosGestorContent');
    
    if (forceRefresh || !document.getElementById('resultadoBuscaAtiva')) {
        container.innerHTML = `
            <div class="card" style="margin-bottom: 15px; background: #f6f8fb; border: 1px solid #e3e8ef; padding: 15px;">
                <h4 style="margin-top: 0; color: #1b4488; margin-bottom: 15px;">Filtros de Busca Ativa</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                    <label>
                        <span style="font-size: 12px; font-weight: bold;">Vigência:</span><br>
                        <select id="filtroVigenciaBA" onchange="processarAlertasBuscaAtiva()" style="padding: 6px; border-radius: 4px; border: 1px solid #cdd5e1;">
                            <option value="total">Total (Ano Letivo)</option>
                            <option value="1">1º Bimestre</option>
                            <option value="2">2º Bimestre</option>
                            <option value="3">3º Bimestre</option>
                            <option value="4">4º Bimestre</option>
                        </select>
                    </label>
                    <label>
                        <span style="font-size: 12px; font-weight: bold;">Porcentagem Limite (Baixa Freq.):</span><br>
                        <input type="number" id="filtroPorcentagemBA" value="70" max="100" min="0" onchange="processarAlertasBuscaAtiva()" style="padding: 6px; width: 80px; border-radius: 4px; border: 1px solid #cdd5e1;"> %
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; padding-bottom: 6px;">
                        <input type="checkbox" id="filtroOcultarFaltososBA" onchange="processarAlertasBuscaAtiva()">
                        <span style="font-size: 13px; font-weight: bold; color: #3d4759;">Ocultar alunos já marcados como Faltosos</span>
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
            const marcarDia = (masterId, dia) => {
                if (!daysByTurma[masterId]) daysByTurma[masterId] = new Set();
                daysByTurma[masterId].add(dia);
            };
            const marcarFalta = (dia, idEst, profId) => {
                if (!attendanceData[dia]) attendanceData[dia] = {};
                if (!attendanceData[dia][idEst]) attendanceData[dia][idEst] = [];
                if (!attendanceData[dia][idEst].some(x => String(x) === String(profId))) attendanceData[dia][idEst].push(profId);
            };

            // 1. O caminho de hoje: o recorte cifrado que cada professor publica no
            //    ambiente da escola (listaescola.js). Desde a adequação, `presencas` não
            //    está mais no documento em claro do professor, e ler só dele dava zero
            //    falta para a escola inteira.
            const comRecorte = new Set();
            if (typeof lerContribuicoesDaEscola === 'function') {
                const contrib = await lerContribuicoesDaEscola({ forcar: true });
                contrib.lista.forEach(c => {
                    comRecorte.add(String(c.autorId));
                    const d = c.dados || {};
                    Object.keys(d.chamadas || {}).forEach(masterId => (d.chamadas[masterId] || []).forEach(dia => marcarDia(masterId, dia)));
                    Object.keys(d.faltas || {}).forEach(dia => (d.faltas[dia] || []).forEach(idEst => marcarFalta(dia, idEst, c.autorId)));
                });
            }

            // 2. Conta isenta / antes do corte: o documento em claro ainda traz `presencas`.
            const usersData = await getData('system', 'users_list');
            const users = (usersData && usersData.list) ? usersData.list : [];
            const teachers = users.filter(u => u.schoolId === schoolId && u.role !== 'super_admin' && !comRecorte.has(String(u.id)));

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
                        if (masterId) marcarDia(masterId, r.data);
                    });
                }

                if (res.data.presencas) {
                    res.data.presencas.forEach(p => {
                        const studentMaster = allStudents.find(s => s.id == p.id_estudante);
                        const masterId = studentMaster ? studentMaster.id_turma : null;
                        if (masterId) marcarDia(masterId, p.data);
                        if (p.status === 'falta') marcarFalta(p.data, p.id_estudante, res.teacherId);
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
            listHtml += `<div style="font-size: 11px; color: #5f6b7f; margin-bottom: 10px; background: #eef2f7; padding: 5px; border-radius: 4px;">
                <strong>Legenda:</strong> PB = Presença Bruta | DA = Presença Descontando Atestado
            </div>`;
        }

        Object.keys(byTurma).sort().forEach(turmaName => {
            listHtml += `<div class="card" style="margin-bottom:10px; background:white;">
                <h5 style="margin:0 0 5px 0; padding-bottom:5px; border-bottom:1px solid #e3e8ef;">${turmaName}</h5>
                <ul style="margin:0; padding-left:10px; font-size:13px; list-style-type:none;">`;
            byTurma[turmaName].forEach(item => {
                const faltosoBadge = item.isFaltoso ? `<span style="background:#fed7d7; color:#c53030; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:bold;">🚨 Faltoso</span>` : `<button class="btn btn-danger" style="margin-left:8px; padding:2px 8px; font-size:10px; border-radius:4px;" onclick="marcarComoFaltosoBuscaAtiva(${item.student.id}, ${item.student.id_turma})">+ Marcar Faltoso</button>`;
                
                const detailHtml = item.detail ? `<span style="color:#3d4759;">${item.detail}</span> | ` : '';
                const atestadoHtml = item.atestadosInfo ? `<div style="color:#d69e2e; font-size:12px; margin-top:2px;">${item.atestadosInfo}</div>` : '';

                listHtml += `<li style="margin-bottom:8px; display:flex; flex-direction:column; border-bottom:1px dashed #eef2f7; padding-bottom:5px;">
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                        ${getAeePrefix(item.student)}<strong>${item.student.nome_completo}</strong>: 
                        ${detailHtml}
                        <strong style="color:#1b4488;">${item.percInfo}</strong>
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
        <div style="display: flex; gap: 5px; margin-bottom: 0px; border-bottom: 2px solid #e3e8ef; position: relative; z-index: 1;">
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
        activeStyle = 'background:#edf3fd; border:1px solid #d3e2fa;';
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
                        <h3 style="margin-top: 20px; border-bottom: 2px solid #e3e8ef; padding-bottom: 5px; color: #1c2536;">${turmaNome}</h3>
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

// Traz para o painel as ocorrências que os professores publicaram (listaescola.js) e, se
// chegou alguma coisa, grava e redesenha. Roda em segundo plano: a tela abre na hora com o
// que já está no painel, e a busca nos professores não atrasa o clique.
let _buscandoOcorrenciasProfessores = false;
async function atualizarOcorrenciasDosProfessores(redesenhar) {
    if (_buscandoOcorrenciasProfessores || typeof trazerOcorrenciasDosProfessores !== 'function') return;
    _buscandoOcorrenciasProfessores = true;
    try {
        const mudou = await trazerOcorrenciasDosProfessores();
        if (mudou > 0) {
            await persistirDados();
            if (typeof redesenhar === 'function') redesenhar();
        }
    } catch (e) {
        console.warn('[Ocorrências] Não consegui trazer as ocorrências dos professores:', e);
    } finally {
        _buscandoOcorrenciasProfessores = false;
    }
}

function renderOcorrenciasGestor() {
    atualizarOcorrenciasDosProfessores(() => {
        const tela = document.getElementById('ocorrenciasGestor');
        if (tela && tela.innerHTML) renderOcorrenciasGestorTela();
    });
    renderOcorrenciasGestorTela();
}

function renderOcorrenciasGestorTela() {
    const todasOcorrencias = (data.ocorrencias || []).sort((a, b) => new Date(b.data) - new Date(a.data));
    
    // Filtra por tipo
    const disciplinares = todasOcorrencias.filter(o => o.tipo !== 'rapida');
    const rapidas = todasOcorrencias.filter(o => o.tipo === 'rapida');

    const html = `
        <div class="card">
            <div style="margin-bottom: 20px; border-bottom: 1px solid #e3e8ef; display: flex; gap: 10px;">
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
                <div style="background: #eef2f7; padding: 5px 15px; border-radius: 20px; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 13px; font-weight: bold; color: #3d4759;">Visualizar:</span>
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
                                    <div style="background:#f6f8fb; padding:10px; border-radius:6px; border:1px solid #eef2f7; font-size:13px; color:#3d4759; white-space: pre-wrap;">
                                        <strong>📝 Relato:</strong> ${o.relato}
                                    </div>
                                    ${devolutivaHtml}
                                </td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px; color:#7a869a;">Nenhuma ocorrência nesta categoria.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderAbaRapidas(lista) {
    return `
        <div>
            <h2>⚡ Histórico de Registros Rápidos</h2>
            <p style="color:#5f6b7f; font-size:13px; margin-bottom:15px;">Estes registros são apenas informativos e não geram alertas no dashboard.</p>
            
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
                                <td><span style="background:#edf3fd; color:#1b4488; padding:2px 8px; border-radius:10px; font-size:12px;">${o.relato}</span></td>
                                <td>${o.autor}</td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px; color:#7a869a;">Nenhum registro rápido encontrado.</td></tr>'}
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
            <p style="color:#5f6b7f;">Defina as opções que aparecerão para os professores (ex: "Sem material", "Conversa paralela").</p>
            
            <div style="display:flex; gap:10px; margin-bottom:20px; background:#f6f8fb; padding:15px; border-radius:8px;">
                <input type="text" id="novaOpcaoRapida" placeholder="Ex: Esqueceu material" style="flex-grow:1;">
                <button class="btn btn-success" onclick="adicionarOpcaoRapida()">+ Adicionar</button>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                ${opcoes.map((op, index) => `
                    <div style="border:1px solid #e3e8ef; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; background:white;">
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
            <p style="white-space: pre-wrap; background: #f9f9f9; padding: 15px; border: 1px solid #cdd5e1; border-radius: 5px;">${o.relato}</p>
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

    const confirmacao = confirm('Isso ativará um link permanente de leitura, aberto a qualquer pessoa que\nreceba o endereço (sem login).\n\nO link mostra APENAS quantitativos por turma e por tipo de registro.\nNome de estudante NÃO é publicado.\n\nEle se atualiza sozinho a cada lançamento seu.\n\nDeseja continuar?');
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

// [CONFORMIDADE] O link público (?share=) é lido por qualquer visitante, sem login
// (shared_views tem allow read: if true nas Regras). Até a adequação de setembro/2026 ele
// publicava a lista de estudantes com nome completo. Agora o documento carrega SOMENTE
// contagens por turma e por tipo de registro - nenhum nome, nenhum id de estudante.
// Se precisar acrescentar algo aqui, lembre que tudo neste payload é público na internet.
function resumirRegistrosAdministrativos(registros, turmas) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const nomeTurma = {};
    (turmas || []).forEach(t => { nomeTurma[t.id] = t.nome; });

    const porTurma = {};
    const totais = {};

    (registros || []).forEach(r => {
        // Mesma regra de vigência da tela: atestado vencido não entra na contagem.
        if (r.tipo === 'Atestado' && r.data) {
            const partes = String(r.data).split('-');
            const inicio = new Date(partes[0], partes[1] - 1, partes[2]);
            const fim = new Date(inicio);
            fim.setDate(fim.getDate() + (parseInt(r.dias) || 1) - 1);
            if (hoje > fim) return;
        }

        const turma = nomeTurma[r.turmaId] || 'Sem turma';
        const tipo = r.tipo || 'Outro';
        if (!porTurma[turma]) porTurma[turma] = { total: 0, tipos: {} };
        porTurma[turma].total++;
        porTurma[turma].tipos[tipo] = (porTurma[turma].tipos[tipo] || 0) + 1;
        totais[tipo] = (totais[tipo] || 0) + 1;
    });

    return { porTurma, totais, total: Object.values(totais).reduce((a, b) => a + b, 0) };
}

async function atualizarLinkCompartilhamentoGestor() {
    // Verifica se está online e se é gestor
    if (typeof db === 'undefined' || !db || !currentUser || !currentUser.schoolId || currentViewMode !== 'gestor') return;

    const schoolId = String(currentUser.schoolId);
    const shareId = `live_${schoolId}`;

    const payload = {
        criadoEm: new Date().toISOString(),
        escolaId: schoolId,
        isLive: true,
        versao: 2, // v2 = só números. v1 (com nomes) foi descontinuado.
        resumo: resumirRegistrosAdministrativos(data.registrosAdministrativos, data.turmas)
    };

    await db.collection('shared_views').doc(shareId).set(payload);
}

async function carregarVistaCompartilhada(shareId) {
    // Substitui o corpo do documento para exibir apenas o relatório limpo (estilo "nova aba/html")
    document.body.innerHTML = `
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f6f8fb; color: #1c2536; margin: 0; padding: 40px; }
            .report-container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            h1 { text-align: center; color: #1b4488; margin-bottom: 10px; font-size: 28px; }
            .meta-info { text-align: center; color: #5f6b7f; font-size: 14px; margin-bottom: 40px; border-bottom: 1px solid #e3e8ef; padding-bottom: 20px; }
            h3 { color: #1c2536; border-bottom: 2px solid #e3e8ef; padding-bottom: 8px; margin-top: 30px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e3e8ef; }
            th { background-color: #f6f8fb; font-weight: 600; color: #3d4759; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
            tr:hover { background-color: #f6f8fb; }
            .badge { padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; display: inline-block; }
            .empty-state { text-align: center; padding: 40px; color: #7a869a; font-style: italic; background: #f9fafb; border-radius: 8px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #cdd5e1; }
            @media print {
                body { background: white; padding: 0; }
                .report-container { box-shadow: none; padding: 0; }
            }
        </style>
        <div class="report-container">
            <div id="loading" style="text-align: center; padding: 50px; color: #3d4759;">Carregando dados do relatório...</div>
        </div>
    `;

    const docData = await getData('shared_views', shareId);
    const container = document.querySelector('.report-container');

    if (!docData) {
        container.innerHTML = '<div class="empty-state" style="color: #e53e3e;">Link inválido ou expirado.</div>';
        return;
    }

    // Documento no formato antigo (v1, com nomes de estudante). Não renderizamos mais esse
    // conteúdo: o gestor precisa reabrir o painel uma vez para o link se regravar como v2.
    if (!docData.resumo) {
        container.innerHTML = `
            <h1>Relatório de Registros Administrativos</h1>
            <div class="empty-state">Este link está sendo atualizado para o novo formato, que não exibe
            dados de estudantes. Peça para a gestão abrir o painel uma vez.</div>`;
        return;
    }

    const resumo = docData.resumo;
    const turmasOrdenadas = Object.keys(resumo.porTurma || {}).sort();
    const quando = new Date(docData.criadoEm);

    let html = `
        <h1>Relatório de Registros Administrativos</h1>
        ${docData.isLive ? '<div style="text-align:center; margin-top:-10px; margin-bottom:10px;"><span class="badge" style="background:#f0fff4; color:#276749; font-size:10px; border:1px solid #c6f6d5;">ATUALIZAÇÃO EM TEMPO REAL</span></div>' : ''}
        <div class="meta-info">${docData.isLive ? 'Última atualização' : 'Gerado em'}: ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR')}</div>
    `;

    if (turmasOrdenadas.length > 0) {
        const tipos = Object.keys(resumo.totais || {}).sort();
        html += `<h3>Registros vigentes por turma</h3>
            <table><thead><tr><th>Turma</th>${tipos.map(t => `<th style="text-align:center;">${t}</th>`).join('')}<th style="text-align:center;">Total</th></tr></thead><tbody>`;
        turmasOrdenadas.forEach(turma => {
            const linha = resumo.porTurma[turma];
            html += `<tr><td><strong>${turma}</strong></td>
                ${tipos.map(t => `<td style="text-align:center;">${linha.tipos[t] || 0}</td>`).join('')}
                <td style="text-align:center;"><strong>${linha.total}</strong></td></tr>`;
        });
        html += `<tr style="background:#f6f8fb;"><td><strong>Total</strong></td>
            ${tipos.map(t => `<td style="text-align:center;"><strong>${resumo.totais[t] || 0}</strong></td>`).join('')}
            <td style="text-align:center;"><strong>${resumo.total || 0}</strong></td></tr>`;
        html += `</tbody></table>`;
    } else {
        html += '<div class="empty-state">Nenhum registro vigente encontrado.</div>';
    }

    html += `<div class="footer">Este relatório apresenta apenas quantitativos. Dados de estudantes
        não são publicados neste link.</div>`;
    container.innerHTML = html;
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
            <p style="color:#5f6b7f; font-size:14px; margin-bottom:20px;">
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

            <div id="containerDiagnosticoOrfaos" style="margin-top: 40px; border-top: 2px dashed #cdd5e1; padding-top: 20px;">
                <h3 style="color: #c53030;">🔍 Busca por Dados Órfãos (Vestígios)</h3>
                <p style="font-size:13px; color:#5f6b7f; margin-bottom:15px;">Esta ferramenta verifica se existem notas, faltas ou ocorrências "perdidas" que ficaram no banco de dados após um aluno ser apagado ou unificado incorretamente no passado.</p>
                <button class="btn btn-secondary" onclick="executarDiagnosticoOrfaos()">Executar Varredura de Diagnóstico</button>
                <div id="resultadoDiagnosticoOrfaos" style="margin-top:15px;"></div>
            </div>
        </div>
    `;
    document.getElementById('registrosGestorContent').innerHTML = html;
}

async function executarDiagnosticoOrfaos() {
    const resDiv = document.getElementById('resultadoDiagnosticoOrfaos');
    resDiv.innerHTML = '<p style="color:#2563c9; font-weight:bold;">⏳ Analisando integridade do banco de dados...</p>';

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
                    <p style="color:#5f6b7f; font-size:14px; margin:0;">Defina a rotina semanal (Seg-Sex).</p>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-info" onclick="abrirGerenciadorTiposHorario()">⚙️ Tipos</button>
                    <button class="btn btn-warning" onclick="abrirGerenciadorDiasAtipicos()">📅 Dia Atípico</button>
                </div>
            </div>
            
            <div style="background: #eef2f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e3e8ef;">
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
            <div style="background: #f6f8fb; border: 1px solid #e3e8ef; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; min-width: 140px;">
                <h3 style="text-align: center; border-bottom: 2px solid #cdd5e1; padding-bottom: 5px; margin-bottom: 10px; color: #1c2536; font-size: 14px;">${dia.nome}</h3>
                
                <div style="flex-grow: 1;">
                    ${slots.length > 0 ? slots.map(s => `
                        <div style="background: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 5px; border: 1px solid #e3e8ef; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 12px; font-weight: 600; color: #3d4759;">${s.inicio} - ${s.fim}</span>
                                <button class="btn btn-danger btn-sm" style="margin:0; padding: 0 5px; font-size: 14px; line-height: 1;" onclick="removerBlocoHorario(${s.id})" title="Remover">×</button>
                            </div>
                            <input type="text" placeholder="Rótulo (ex: 1ª Aula)" value="${s.label || ''}" 
                                style="width:100%; margin-bottom:4px; font-size:11px; padding:2px; border:1px solid #cdd5e1; border-radius:3px;"
                                onblur="atualizarLabelBloco(${s.id}, this.value)">
                            <select style="width:100%; font-size:11px; padding:2px; border:1px solid #cdd5e1; border-radius:3px; background-color: ${s.tipo ? '#edf3fd' : '#fff'};" onchange="atualizarTipoBloco(${s.id}, this.value)">
                                <option value="">🔓 Livre (Prof. Escolhe)</option>
                                ${data.tiposHorarioFixo.map(t => `<option value="${t.id}" ${s.tipo === t.id ? 'selected' : ''}>${t.nome} (Fixo)</option>`).join('')}
                            </select>
                        </div>
                    `).join('') : '<p style="font-size: 12px; color: #7a869a; text-align: center; padding: 10px;">--</p>'}
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
            <p style="color:#5f6b7f;">Cadastre opções como Almoço, Café, Reunião, etc. para travar na grade.</p>
            
            <div style="display:flex; gap:10px; margin-bottom:20px; background:#f6f8fb; padding:15px; border-radius:8px;">
                <input type="text" id="novoTipoNome" placeholder="Nome (ex: 🧘 Yoga)" style="flex-grow:1;">
                <button class="btn btn-success" onclick="adicionarTipoHorario()">+ Adicionar</button>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                ${data.tiposHorarioFixo.map((t, index) => `
                    <div style="border:1px solid #e3e8ef; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; background:white;">
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
            <p style="color:#5f6b7f;">Use para dias com horários diferentes (Ex: Conselho, Eventos, Provas).</p>

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
            .map(g => ({ ...g, id: novoId() })); // Novos IDs para não alterar a padrão
    }

    // Renderiza editor simples
    let html = `
        <h3 style="border-bottom:1px solid #e3e8ef; padding-bottom:5px;">Editando: ${formatDate(dataStr)} ${isNovo ? '(Novo)' : '(Salvo)'}</h3>
        
        <div id="listaBlocosAtipicos">
            ${blocos.map((b, idx) => `
                <div class="bloco-atipico-item" style="display:flex; gap:10px; align-items:center; margin-bottom:10px; background:white; padding:10px; border:1px solid #cdd5e1; border-radius:5px;">
                    <input type="time" class="inicio" value="${b.inicio}">
                    <span>até</span>
                    <input type="time" class="fim" value="${b.fim}">
                    <select class="tipo"><option value="">Livre</option>${data.tiposHorarioFixo.map(t => `<option value="${t.id}" ${b.tipo === t.id ? 'selected' : ''}>${t.nome}</option>`).join('')}</select>
                    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">🗑️</button>
                </div>
            `).join('')}
        </div>

        <button class="btn btn-secondary btn-sm" onclick="adicionarBlocoAtipicoUI()">+ Adicionar Horário</button>
        
        <div style="margin-top:20px; border-top:1px solid #e3e8ef; padding-top:15px; display:flex; justify-content:flex-end; gap:10px;">
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
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:10px; background:white; padding:10px; border:1px solid #cdd5e1; border-radius:5px;";
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
            novosBlocos.push({ id: novoId(), inicio, fim, tipo, diaSemana: -1 }); // diaSemana -1 indica exceção
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
            id: novoId(), 
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
//
// Entrada: listas de alunos em CSV (qualquer separador), .htm ou .xlsx. Várias listas costumam
// sair com o MESMO nome de arquivo, então a turma não pode vir do nome do arquivo (era o que a
// versão anterior fazia) - e nem sempre está DENTRO do arquivo.
//
// Por isso a turma é identificada pela própria lista de alunos: 50 nomes coincidindo com os de uma
// turma cadastrada é uma impressão digital tão decisiva quanto uma matrícula. Só duas colunas são
// lidas - o nome do aluno e a situação dele. Qualquer outra coluna (documentos, datas, e-mails) é
// descartada na leitura e nunca chega ao banco.
//
// As duas colunas são reconhecidas pelo cabeçalho; quando o cabeçalho não é reconhecido, ou quando
// o reconhecimento errou, a prévia deixa escolher qual coluna é o nome e qual é a situação.
//
// Roda só no modo gestor, onde `data` JÁ É o documento da escola (getStorageKey, shared.js:81):
// `persistirDados()` grava no lugar certo e `turma.id` já é o masterId que os professores enxergam.

// Como a turma é reconhecida: as mudanças de um ano (transferência, matrícula nova) nunca atingem
// a maioria dos estudantes, então a lista certa sempre divide mais da metade dos nomes com a turma
// que já está cadastrada. A semelhança é o coeficiente de Dice sobre os nomes normalizados -
// 2·comuns / (nomes no arquivo + nomes na turma) -, que não dá 100% a uma turma pequena só porque
// os poucos alunos dela aparecem numa lista grande (era o defeito de dividir pelo menor dos dois).
//
// Todas as listas são comparadas com todas as turmas DE UMA VEZ e distribuídas pela maior
// semelhança primeiro, uma turma por lista. Assim listas com o mesmo nome de arquivo - o caso
// comum - vão cada uma para a sua turma, e duas listas nunca caem na mesma sem aviso.
const IMPORT_MASSA_LIMIAR_CASAMENTO = 0.5;
// Diferença abaixo disto entre a melhor turma livre e a segunda é empate: a pessoa escolhe.
const IMPORT_MASSA_EMPATE = 0.03;

// A situação como costuma vir escrita nas listas -> status do ProfSis (enum de index.html:246).
const IMPORT_MASSA_STATUS = {
    'ativo': 'Ativo',
    'ativa': 'Ativo',
    'matriculado': 'Ativo',
    'matriculada': 'Ativo',
    'transferido': 'Transferido',
    'transferida': 'Transferido',
    'remanejamento': 'Remanejado',
    'remanejado': 'Remanejado',
    'remanejada': 'Remanejado',
    'baixa-transferencia': 'Baixa-Transferencia',
    'baixa transferencia': 'Baixa-Transferencia',
    'ncom': 'NCOM',
    'nao comparecimento': 'NCOM'
};

// Cabeçalhos reconhecidos sozinhos. Comparação normalizada (sem acento, minúsculo, espaço único).
const IMPORT_MASSA_CABECALHOS_NOME = ['nome do aluno', 'nome do estudante', 'nome aluno', 'nome estudante',
    'aluno', 'aluno(a)', 'estudante', 'nome', 'nome completo', 'nome do aluno(a)'];

function normalizarNomeImportMassa(nome) {
    return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizarCabecalhoImportMassa(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function lerTextoArquivoImportMassa(file) {
    return decodificarTextoArquivo(await file.arrayBuffer());
}

// Devolve uma matriz de células (linhas x colunas) - o mesmo formato que
// XLSX.utils.sheet_to_json(..., {header:1}) produz, pra que os três formatos sigam daqui pra frente
// exatamente o mesmo caminho.
async function lerMatrizArquivoImportMassa(file) {
    const nome = (file.name || '').toLowerCase();

    if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
        await carregarBibliotecaBaseCurricular('xlsx');
        const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        const aba = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, blankrows: false });
    }

    const texto = await lerTextoArquivoImportMassa(file);

    if (nome.endsWith('.htm') || nome.endsWith('.html')) {
        // Planilha "Publicar como Página da Web": uma <table> limpa. Ler pelo DOM elimina de
        // uma vez delimitador, aspas e encoding (o charset vem declarado no próprio HTML).
        const doc = new DOMParser().parseFromString(texto, 'text/html');
        return Array.from(doc.querySelectorAll('table tr'))
            .map(tr => Array.from(tr.querySelectorAll('td, th')).map(c => c.textContent.trim()));
    }

    // CSV (ou .txt): separador detectado, aspas respeitadas (shared.js).
    return lerCsvMatriz(texto);
}

// Acha a linha de cabeçalho e as duas únicas colunas que interessam. Comparação normalizada: a
// versão anterior fazia includes('nome do aluno') em texto cru e quebrava com qualquer variação de
// caixa ou acento.
function detectarColunasImportMassa(linhas) {
    const limite = Math.min(linhas.length, 15);
    for (let i = 0; i < limite; i++) {
        const cols = (linhas[i] || []).map(normalizarCabecalhoImportMassa);
        const idxNome = cols.findIndex(c => IMPORT_MASSA_CABECALHOS_NOME.indexOf(c) !== -1);
        if (idxNome === -1) continue;
        const idxSituacao = cols.findIndex(c => c.indexOf('situacao') !== -1 || c.indexOf('status') !== -1);
        return { linhaHeader: i, idxNome, idxSituacao };
    }
    return null;
}

// Quando nenhum cabeçalho é reconhecido: a primeira linha com mais de uma célula preenchida vira
// o cabeçalho e a coluna do nome fica EM BRANCO, para quem importa escolher. Chutar a coluna
// importaria a coluna errada inteira sem ninguém perceber.
function colunasManuaisImportMassa(linhas) {
    const limite = Math.min(linhas.length, 15);
    let linhaHeader = 0;
    for (let i = 0; i < limite; i++) {
        if ((linhas[i] || []).filter(c => String(c || '').trim()).length > 1) { linhaHeader = i; break; }
    }
    return { linhaHeader, idxNome: -1, idxSituacao: -1, manual: true };
}

// Rótulos das colunas para os seletores de mapeamento: "A · Nome do Aluno".
function rotulosColunasImportMassa(linhas, linhaHeader) {
    const cab = linhas[linhaHeader] || [];
    const largura = Math.max(cab.length, ...linhas.slice(linhaHeader, linhaHeader + 20).map(l => (l || []).length));
    const letra = (n) => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
    const rotulos = [];
    for (let i = 0; i < largura; i++) {
        const titulo = String(cab[i] || '').trim();
        const exemplo = String(((linhas[linhaHeader + 1] || [])[i]) || '').trim();
        rotulos.push(letra(i) + ' · ' + (titulo || '(sem título)') + (exemplo ? ' — ex.: ' + exemplo.slice(0, 30) : ''));
    }
    return rotulos;
}

// Só nome e situação saem daqui. Duplicata dentro do mesmo arquivo é ignorada (fica a 1ª ocorrência).
function extrairAlunosImportMassa(linhas, colunas) {
    const alunos = [];
    const vistos = new Set();

    for (let i = colunas.linhaHeader + 1; i < linhas.length; i++) {
        const linha = linhas[i] || [];
        const nome = String(linha[colunas.idxNome] || '').trim();
        if (!nome) continue;

        const chave = normalizarNomeImportMassa(nome);
        if (!chave || vistos.has(chave)) continue;
        vistos.add(chave);

        const situacaoBruta = colunas.idxSituacao !== -1 ? String(linha[colunas.idxSituacao] || '').trim() : '';
        const chaveStatus = normalizarCabecalhoImportMassa(situacaoBruta);
        const conhecido = !situacaoBruta || Object.prototype.hasOwnProperty.call(IMPORT_MASSA_STATUS, chaveStatus);

        alunos.push({
            nome: nome,
            chave: chave,
            status: IMPORT_MASSA_STATUS[chaveStatus] || 'Ativo',
            situacaoBruta: situacaoBruta,
            statusReconhecido: conhecido
        });
    }
    return alunos;
}

// Agrupa as turmas cadastradas por turma FÍSICA: a mesma turma aparece uma vez por disciplina e
// todas compartilham o roster, então contam como um alvo só.
function agruparTurmasFisicasImportMassa() {
    const grupos = new Map();

    (data.turmas || []).forEach(t => {
        const chave = String(t.masterId || t.id);
        if (!grupos.has(chave)) {
            grupos.set(chave, { chave: chave, turmaId: t.id, ids: [], rotulos: [] });
        }
        const grupo = grupos.get(chave);
        grupo.ids.push(t.id);
        grupo.rotulos.push(t.nome + (t.disciplina ? ' - ' + t.disciplina : ''));
    });

    const lista = Array.from(grupos.values());
    lista.forEach(grupo => {
        grupo.rotulo = grupo.rotulos[0] + (grupo.rotulos.length > 1 ? ' (+' + (grupo.rotulos.length - 1) + ')' : '');
        grupo.rosterAtivos = new Set();
        grupo.rosterTodos = new Set();
        (data.estudantes || []).forEach(e => {
            if (grupo.ids.some(id => id == e.id_turma)) {
                const chave = normalizarNomeImportMassa(e.nome_completo);
                if (!chave) return;
                grupo.rosterTodos.add(chave);
                if (!e.status || e.status === 'Ativo') grupo.rosterAtivos.add(chave);
            }
        });
    });
    return lista;
}

// Pontua o arquivo contra cada turma física. Compara com o roster INTEIRO (não só os ativos): quem
// saiu continua listado na lista exportada, e ignorá-los baixaria a nota da turma certa.
// Semelhança da lista com cada turma física, da maior para a menor.
function pontuarTurmasImportMassa(alunos, grupos) {
    const chavesArquivo = new Set(alunos.map(a => a.chave));
    return grupos.map(grupo => {
        let comuns = 0;
        chavesArquivo.forEach(c => { if (grupo.rosterTodos.has(c)) comuns++; });
        const total = chavesArquivo.size + grupo.rosterTodos.size;
        return { grupo: grupo, comuns: comuns, score: total ? (2 * comuns) / total : 0 };
    }).sort((a, b) => b.score - a.score || b.comuns - a.comuns);
}

// A melhor turma para UMA lista, sem olhar as outras listas (importação pela tela da turma).
function casarTurmaImportMassa(alunos, grupos) {
    const placar = pontuarTurmasImportMassa(alunos, grupos);
    const melhor = placar[0];
    if (!melhor || melhor.score < IMPORT_MASSA_LIMIAR_CASAMENTO) {
        return { grupo: null, score: melhor ? melhor.score : 0, motivo: 'sem_correspondencia', placar };
    }
    const segundo = placar[1];
    if (segundo && (melhor.score - segundo.score) < IMPORT_MASSA_EMPATE) {
        return { grupo: null, score: melhor.score, motivo: 'ambiguo', rival: segundo.grupo.rotulo, placar };
    }
    return { grupo: melhor.grupo, score: melhor.score, placar };
}

// Distribui as listas entre as turmas: todos os pares (lista, turma) acima do limiar, do mais
// parecido para o menos, e cada lista e cada turma usadas uma vez só. Lista cuja turma foi
// escolhida à mão não entra na disputa, e a turma dela sai do jogo.
function distribuirTurmasImportMassa(itens, grupos) {
    const ocupadas = new Set();
    const disputando = [];
    itens.forEach(item => {
        if (item.erro || item.pendente || !item.alunos || !item.alunos.length) return;
        if (item.motivo === 'manual') { if (item.grupoChave) ocupadas.add(item.grupoChave); return; }
        if (item.motivo === 'manual_vazio') return;
        item.placar = pontuarTurmasImportMassa(item.alunos, grupos);
        item.grupoChave = '';
        item.score = item.placar[0] ? item.placar[0].score : 0;
        item.motivo = 'sem_correspondencia';
        item.rival = null;
        disputando.push(item);
    });

    const pares = [];
    disputando.forEach(item => item.placar.forEach(p => {
        if (p.score >= IMPORT_MASSA_LIMIAR_CASAMENTO) pares.push({ item, p });
    }));
    pares.sort((a, b) => b.p.score - a.p.score || b.p.comuns - a.p.comuns);

    const resolvidos = new Set();
    pares.forEach(({ item, p }) => {
        if (resolvidos.has(item) || ocupadas.has(p.grupo.chave)) return;
        // Empate com outra turma ainda livre: não chuta.
        const rival = item.placar.find(q => q.grupo.chave !== p.grupo.chave && !ocupadas.has(q.grupo.chave));
        resolvidos.add(item);
        if (rival && (p.score - rival.score) < IMPORT_MASSA_EMPATE) {
            item.motivo = 'ambiguo';
            item.rival = rival.grupo.rotulo;
            item.score = p.score;
            return;
        }
        item.grupoChave = p.grupo.chave;
        item.score = p.score;
        item.comuns = p.comuns;
        item.motivo = 'automatico';
        ocupadas.add(p.grupo.chave);
    });

    // Quem ficou sem turma porque a sua melhor já foi para uma lista mais parecida.
    disputando.forEach(item => {
        if (item.grupoChave || item.motivo === 'ambiguo') return;
        const melhor = item.placar[0];
        if (melhor && melhor.score >= IMPORT_MASSA_LIMIAR_CASAMENTO && ocupadas.has(melhor.grupo.chave)) {
            item.motivo = 'ocupada';
            item.rival = melhor.grupo.rotulo;
        }
    });
}

// Aplica um arquivo já casado com uma turma. Recebe o array `estudantes` por parâmetro pra poder
// rodar sobre uma CÓPIA na prévia e sobre o array real na confirmação - assim o que a tela mostra é
// literalmente o que vai ser gravado.
//
// O status vem do próprio arquivo ("Situação do Aluno"): quem o arquivo diz que saiu fica
// Transferido/Remanejado, em vez de ser reativado como 'Ativo' só por aparecer na lista.
// `opcoes.marcarAusentes: false` (importação de uma turma só, pela tela da turma) só acrescenta e
// atualiza: quem não veio no arquivo fica como está.
function aplicarArquivoImportMassa(estudantes, turmaId, alunos, novoId, opcoes) {
    const marcarAusentes = !(opcoes && opcoes.marcarAusentes === false);
    const criados = [];
    const alterados = [];
    const sumiram = [];

    const chavesArquivo = new Set(alunos.map(a => a.chave));
    const daTurma = estudantes.filter(e => e.id_turma == turmaId);
    const porChave = new Map();
    daTurma.forEach(e => {
        const chave = normalizarNomeImportMassa(e.nome_completo);
        if (!porChave.has(chave)) porChave.set(chave, e);
    });

    alunos.forEach(aluno => {
        const existente = porChave.get(aluno.chave);
        if (!existente) {
            estudantes.push({ id: novoId(), id_turma: turmaId, nome_completo: aluno.nome, status: aluno.status });
            criados.push({ nome: aluno.nome, status: aluno.status });
        } else if ((existente.status || 'Ativo') !== aluno.status) {
            alterados.push({ nome: existente.nome_completo, de: existente.status || 'Ativo', para: aluno.status, chave: aluno.chave });
            existente.status = aluno.status;
        }
    });

    // Ativo na turma que não veio no arquivo. Deve ser raro agora (o export lista quem saiu também),
    // então é mais provável ser lista truncada: mesma trava de app.js:2317 - se o arquivo tem menos
    // da metade dos ativos, não desativa ninguém, pra não esvaziar a turma por engano.
    const ativos = daTurma.filter(e => !e.status || e.status === 'Ativo');
    if (marcarAusentes && alunos.length * 2 >= ativos.length) {
        ativos.forEach(e => {
            const chave = normalizarNomeImportMassa(e.nome_completo);
            if (!chavesArquivo.has(chave)) {
                e.status = 'Transferido';
                sumiram.push({ nome: e.nome_completo, chave: chave });
            }
        });
    }

    return { criados, alterados, sumiram };
}

// Gerador de id que não repete dentro do lote (Date.now() + random, como no resto do app, colide
// quando se cria dezenas de alunos no mesmo milissegundo).
function criarGeradorIdImportMassa(estudantes) {
    let maior = Date.now();
    estudantes.forEach(e => { const n = Number(e.id); if (n > maior) maior = n; });
    return () => ++maior;
}

let importMassaItens = [];
let importMassaGrupos = [];

function abrirModalImportacaoMassa() {
    if (!document.getElementById('modalImportacaoMassa')) {
        const div = document.createElement('div');
        div.id = 'modalImportacaoMassa';
        div.className = 'modal';
        div.innerHTML = `
            <div class="modal-content" style="max-width: 780px; max-height: 88vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>📂 Atualização de Estudantes em Massa</h2>
                    <button class="close-btn" onclick="closeModal('modalImportacaoMassa')">×</button>
                </div>
                <p style="font-size:13px; color:#3d4759; margin-top:0;">
                    Selecione as listas de alunos (uma por turma). O nome do arquivo não importa: a turma é
                    reconhecida pela própria lista de alunos. As colunas de nome e situação são
                    reconhecidas pelo cabeçalho e podem ser trocadas na prévia.
                </p>

                <div style="margin: 16px 0; padding: 15px; background: #f6f8fb; border: 2px dashed #cdd5e1; border-radius: 8px; text-align: center;">
                    <input type="file" id="filesMassa" multiple accept=".csv,.txt,.htm,.html,.xlsx,.xls" onchange="analisarArquivosMassa()">
                    <p style="margin:10px 0 0; font-size:12px; color:#5f6b7f;">Formatos aceitos: .csv (separado por ponto e vírgula, vírgula ou tabulação), .xlsx e .htm</p>
                </div>

                <div id="previewMassa" style="margin-bottom: 16px; display:none;"></div>

                <div style="display:flex; justify-content: flex-end; gap: 10px; border-top:1px solid #e3e8ef; padding-top:15px;">
                    <button class="btn btn-secondary" onclick="closeModal('modalImportacaoMassa')">Cancelar</button>
                    <button class="btn btn-success" id="btnConfirmarMassa" onclick="processarImportacaoMassa()" disabled>Confirmar e Atualizar</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    importMassaItens = [];
    importMassaGrupos = [];
    document.getElementById('filesMassa').value = '';
    document.getElementById('previewMassa').style.display = 'none';
    document.getElementById('previewMassa').innerHTML = '';
    document.getElementById('btnConfirmarMassa').disabled = true;
    showModal('modalImportacaoMassa');
}

async function analisarArquivosMassa() {
    const files = document.getElementById('filesMassa').files;
    const preview = document.getElementById('previewMassa');
    if (!files || files.length === 0) return;

    preview.style.display = 'block';
    preview.innerHTML = '<p style="font-size:13px; color:#3d4759;">🔄 Lendo arquivos e procurando as turmas...</p>';
    document.getElementById('btnConfirmarMassa').disabled = true;

    importMassaGrupos = agruparTurmasFisicasImportMassa();
    importMassaItens = [];

    for (const file of Array.from(files)) {
        const item = { nomeArquivo: file.name, alunos: [], grupoChave: '', score: 0, erro: null, aviso: null };
        try {
            const linhas = await lerMatrizArquivoImportMassa(file);
            if (!linhas.length) throw new Error('O arquivo está vazio.');
            item.linhas = linhas;
            item.colunas = detectarColunasImportMassa(linhas) || colunasManuaisImportMassa(linhas);
            item.rotulosColunas = rotulosColunasImportMassa(linhas, item.colunas.linhaHeader);
            aplicarColunasItemImportMassa(item);
        } catch (e) {
            item.erro = e.message;
        }
        importMassaItens.push(item);
    }

    // Listas com o mesmo nome de arquivo são o caso comum: numera para dar para distinguir.
    const repetidos = {};
    importMassaItens.forEach(i => { repetidos[i.nomeArquivo] = (repetidos[i.nomeArquivo] || 0) + 1; });
    const vistos = {};
    importMassaItens.forEach(i => {
        if (repetidos[i.nomeArquivo] < 2) return;
        vistos[i.nomeArquivo] = (vistos[i.nomeArquivo] || 0) + 1;
        i.nomeArquivo += ' (' + vistos[i.nomeArquivo] + ')';
    });

    renderPreviaImportMassa();
}

// Relê os alunos do arquivo com as colunas escolhidas e casa a turma de novo. Usado na leitura e
// toda vez que alguém troca a coluna do nome ou da situação na prévia.
function aplicarColunasItemImportMassa(item) {
    item.alunos = [];
    item.aviso = null;
    item.pendente = null;
    item.grupoChave = '';
    item.score = 0;
    item.motivo = null;

    if (item.colunas.idxNome === -1) {
        item.pendente = 'Não reconheci a coluna do nome. Escolha abaixo qual coluna é o nome do aluno.';
        return;
    }

    item.alunos = extrairAlunosImportMassa(item.linhas, item.colunas);
    if (item.alunos.length === 0) {
        item.pendente = 'Nenhum nome encontrado nessa coluna. Confira a coluna do nome.';
        return;
    }

    if (item.colunas.idxSituacao === -1) {
        item.aviso = 'Sem coluna de situação — todos entram como Ativo.';
    } else {
        const desconhecidos = [...new Set(item.alunos.filter(a => !a.statusReconhecido).map(a => a.situacaoBruta))];
        if (desconhecidos.length) item.aviso = 'Situação não reconhecida (entra como Ativo): ' + desconhecidos.join(', ');
    }

    // A turma é decidida por distribuirTurmasImportMassa, olhando todas as listas juntas.
}

function alterarColunaImportMassa(indice, campo, valor) {
    const item = importMassaItens[indice];
    if (!item || !item.colunas) return;
    const n = parseInt(valor, 10);
    if (campo === 'nome') item.colunas.idxNome = isNaN(n) ? -1 : n;
    if (campo === 'situacao') item.colunas.idxSituacao = isNaN(n) ? -1 : n;
    const turmaEscolhida = item.motivo === 'manual' ? item.grupoChave : '';
    aplicarColunasItemImportMassa(item);
    // Quem já escolheu a turma na mão não perde a escolha por ter trocado a coluna.
    if (turmaEscolhida && item.alunos.length) { item.grupoChave = turmaEscolhida; item.motivo = 'manual'; }
    renderPreviaImportMassa();
}

// Os dois seletores "qual coluna é o quê", mostrados em cada arquivo da prévia.
function htmlMapeamentoColunasImportMassa(item, indice) {
    if (!item.rotulosColunas) return '';
    const opcoes = (atual, vazio) => [`<option value="">${vazio}</option>`].concat(
        item.rotulosColunas.map((r, i) => `<option value="${i}" ${i === atual ? 'selected' : ''}>${escaparHtmlImportMassa(r)}</option>`)
    ).join('');
    return `
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; font-size:11px; color:#3d4759;">
            <label style="flex:1; min-width:140px;">Coluna do nome
                <select style="width:100%; padding:3px; font-size:11px;" onchange="alterarColunaImportMassa(${indice}, 'nome', this.value)">${opcoes(item.colunas.idxNome, '— escolher —')}</select>
            </label>
            <label style="flex:1; min-width:140px;">Coluna da situação
                <select style="width:100%; padding:3px; font-size:11px;" onchange="alterarColunaImportMassa(${indice}, 'situacao', this.value)">${opcoes(item.colunas.idxSituacao, '(nenhuma — todos Ativos)')}</select>
            </label>
        </div>`;
}

function escaparHtmlImportMassa(texto) {
    return String(texto || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function alterarTurmaImportMassa(indice, valor) {
    if (!importMassaItens[indice]) return;
    importMassaItens[indice].grupoChave = valor;
    // "— escolher turma —" escolhido de propósito também é escolha: a distribuição não refaz.
    importMassaItens[indice].motivo = valor ? 'manual' : 'manual_vazio';
    renderPreviaImportMassa();
}

// Roda a aplicação real sobre uma cópia dos estudantes, na ordem em que os arquivos serão
// processados, e guarda a prévia de cada item. Como é a mesma função da confirmação, o que a tela
// mostra não pode divergir do que será gravado (e efeitos entre arquivos aparecem na prévia).
function recalcularPreviasImportMassa() {
    const copia = JSON.parse(JSON.stringify(data.estudantes || []));
    const novoId = criarGeradorIdImportMassa(copia);

    importMassaItens.forEach(item => {
        item.previa = null;
        if (item.erro || item.pendente || !item.grupoChave) return;
        const grupo = importMassaGrupos.find(g => g.chave === item.grupoChave);
        if (!grupo) return;
        item.previa = aplicarArquivoImportMassa(copia, grupo.turmaId, item.alunos, novoId);
    });
}

function renderPreviaImportMassa() {
    distribuirTurmasImportMassa(importMassaItens, importMassaGrupos);
    recalcularPreviasImportMassa();

    const preview = document.getElementById('previewMassa');
    const usados = new Map();
    importMassaItens.forEach(item => {
        if (!item.grupoChave) return;
        usados.set(item.grupoChave, (usados.get(item.grupoChave) || 0) + 1);
    });

    const linhas = importMassaItens.map((item, indice) => {
        const opcoes = ['<option value="">— escolher turma —</option>'].concat(
            importMassaGrupos.map(g => `<option value="${g.chave}" ${g.chave === item.grupoChave ? 'selected' : ''}>${g.rotulo}</option>`)
        ).join('');

        if (item.erro) {
            return `
                <tr style="background:#fff5f5;">
                    <td style="padding:8px; border:1px solid #e3e8ef;">${item.nomeArquivo}</td>
                    <td style="padding:8px; border:1px solid #e3e8ef;" colspan="3">
                        <span style="color:#c53030;">❌ ${item.erro}</span>
                    </td>
                </tr>`;
        }

        let selo;
        if (item.motivo === 'manual') {
            selo = '<span style="color:#1f55ad; font-size:11px;">escolhida por você</span>';
        } else if (item.grupoChave) {
            selo = `<span style="color:#276749; font-size:11px;">✅ reconhecida pelos nomes: ${item.comuns} em comum (${Math.round(item.score * 100)}% de semelhança)</span>`;
        } else if (item.motivo === 'ocupada') {
            selo = `<span style="color:#b7791f; font-size:11px;">⚠️ parece "${escaparHtmlImportMassa(item.rival)}", mas outra lista combina mais com ela — escolha</span>`;
        } else if (item.pendente) {
            selo = '<span style="color:#7a869a; font-size:11px;">escolha a coluna do nome primeiro</span>';
        } else if (item.motivo === 'ambiguo') {
            selo = `<span style="color:#b7791f; font-size:11px;">⚠️ empate com "${item.rival}" — escolha</span>`;
        } else {
            selo = '<span style="color:#c53030; font-size:11px;">turma não reconhecida — escolha</span>';
        }

        const duplicada = item.grupoChave && usados.get(item.grupoChave) > 1
            ? '<div style="color:#c53030; font-size:11px;">⚠️ outro arquivo aponta pra esta mesma turma</div>' : '';

        const p = item.previa;
        const resumo = p
            ? `<span style="color:#276749;">+${p.criados.length} novos</span> · ` +
              `<span style="color:#b7791f;">${p.alterados.length} mudam de status</span> · ` +
              `<span style="color:#c53030;">${p.sumiram.length} sumiram da lista</span>`
            : '<span style="color:#7a869a;">—</span>';

        return `
            <tr>
                <td style="padding:8px; border:1px solid #e3e8ef; font-size:12px;">
                    ${escaparHtmlImportMassa(item.nomeArquivo)}
                    ${item.pendente ? `<div style="color:#c53030; font-size:11px;">⚠️ ${item.pendente}</div>` : ''}
                    ${item.aviso ? `<div style="color:#b7791f; font-size:11px;">⚠️ ${escaparHtmlImportMassa(item.aviso)}</div>` : ''}
                    ${htmlMapeamentoColunasImportMassa(item, indice)}
                </td>
                <td style="padding:8px; border:1px solid #e3e8ef;">
                    <select style="width:100%; padding:5px; font-size:12px;" onchange="alterarTurmaImportMassa(${indice}, this.value)">${opcoes}</select>
                    ${selo}
                    ${duplicada}
                </td>
                <td style="padding:8px; border:1px solid #e3e8ef; text-align:center; font-size:12px;">${item.alunos.length}</td>
                <td style="padding:8px; border:1px solid #e3e8ef; font-size:11px;">${resumo}</td>
            </tr>`;
    }).join('');

    preview.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
                <tr style="background:#eef2f7;">
                    <th style="padding:8px; border:1px solid #e3e8ef; text-align:left;">Arquivo</th>
                    <th style="padding:8px; border:1px solid #e3e8ef; text-align:left;">Turma</th>
                    <th style="padding:8px; border:1px solid #e3e8ef;">Alunos</th>
                    <th style="padding:8px; border:1px solid #e3e8ef; text-align:left;">O que vai mudar</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
    preview.style.display = 'block';

    document.getElementById('btnConfirmarMassa').disabled = !importMassaItens.some(i => !i.erro && !i.pendente && i.grupoChave);
}

// Cruza quem saiu de uma turma com quem entrou em outra DENTRO DO MESMO LOTE, pra o relatório poder
// dizer pra onde a pessoa foi em vez de só "saiu".
function rastrearDestinosImportMassa() {
    const destinos = new Map();
    importMassaItens.forEach(item => {
        if (item.erro || item.pendente || !item.grupoChave) return;
        const grupo = importMassaGrupos.find(g => g.chave === item.grupoChave);
        if (!grupo) return;
        item.alunos.forEach(a => {
            if (a.status === 'Ativo') destinos.set(a.chave, grupo.rotulo);
        });
    });
    return destinos;
}

async function processarImportacaoMassa() {
    const aplicaveis = importMassaItens.filter(i => !i.erro && !i.pendente && i.grupoChave);
    if (aplicaveis.length === 0) return alert('Nenhum arquivo pronto para importar.');

    const totalSaidas = aplicaveis.reduce((soma, i) => soma + (i.previa ? i.previa.alterados.filter(a => a.para !== 'Ativo').length + i.previa.sumiram.length : 0), 0);
    if (!confirm(`Atualizar ${aplicaveis.length} turma(s)?\n\n${totalSaidas} aluno(s) deixarão de estar ativos.`)) return;

    if (!data.estudantes) data.estudantes = [];
    const novoId = criarGeradorIdImportMassa(data.estudantes);
    const destinos = rastrearDestinosImportMassa();
    const relatorio = [];

    aplicaveis.forEach(item => {
        const grupo = importMassaGrupos.find(g => g.chave === item.grupoChave);
        if (!grupo) return;
        const resultado = aplicarArquivoImportMassa(data.estudantes, grupo.turmaId, item.alunos, novoId);
        relatorio.push({ turma: grupo.rotulo, arquivo: item.nomeArquivo, resultado: resultado });
    });

    await persistirDados();
    mostrarRelatorioImportMassa(relatorio, destinos);

    if (typeof renderTurmas === 'function' && document.getElementById('turmas') && document.getElementById('turmas').classList.contains('active')) {
        renderTurmas();
    }
}

// Relatório no lugar do alert() que existia: as saídas são a parte destrutiva, então saem nominais.
function mostrarRelatorioImportMassa(relatorio, destinos) {
    const totais = relatorio.reduce((acc, r) => {
        acc.criados += r.resultado.criados.length;
        acc.alterados += r.resultado.alterados.length;
        acc.sumiram += r.resultado.sumiram.length;
        return acc;
    }, { criados: 0, alterados: 0, sumiram: 0 });

    const paraOnde = (chave) => {
        const destino = destinos.get(chave);
        return destino ? ` → <strong>${destino}</strong>` : '';
    };

    const blocos = relatorio.map(r => {
        const saidas = r.resultado.alterados.filter(a => a.para !== 'Ativo');
        const voltas = r.resultado.alterados.filter(a => a.para === 'Ativo');
        const linha = (texto) => `<li style="margin-bottom:2px;">${texto}</li>`;

        const partes = [];
        if (r.resultado.criados.length) {
            partes.push(`<div style="color:#276749; margin-top:6px;">✔️ ${r.resultado.criados.length} novo(s)</div>
                <ul style="margin:4px 0 0 18px; padding:0; font-size:11px; color:#3d4759;">
                    ${r.resultado.criados.map(c => linha(`${c.nome}${c.status !== 'Ativo' ? ` <em>(${c.status})</em>` : ''}`)).join('')}
                </ul>`);
        }
        if (voltas.length) {
            partes.push(`<div style="color:#1f55ad; margin-top:6px;">🔄 ${voltas.length} reativado(s)</div>
                <ul style="margin:4px 0 0 18px; padding:0; font-size:11px; color:#3d4759;">
                    ${voltas.map(a => linha(`${a.nome} <em>(${a.de} → Ativo)</em>`)).join('')}
                </ul>`);
        }
        if (saidas.length) {
            partes.push(`<div style="color:#c53030; margin-top:6px;">➡️ ${saidas.length} saíram desta turma</div>
                <ul style="margin:4px 0 0 18px; padding:0; font-size:11px; color:#3d4759;">
                    ${saidas.map(a => linha(`${a.nome} <em>(${a.para})</em>${paraOnde(a.chave)}`)).join('')}
                </ul>`);
        }
        if (r.resultado.sumiram.length) {
            partes.push(`<div style="color:#c53030; margin-top:6px;">❌ ${r.resultado.sumiram.length} sumiram da lista (marcados Transferido)</div>
                <ul style="margin:4px 0 0 18px; padding:0; font-size:11px; color:#3d4759;">
                    ${r.resultado.sumiram.map(s => linha(`${s.nome}${paraOnde(s.chave)}`)).join('')}
                </ul>`);
        }
        if (partes.length === 0) partes.push('<div style="color:#5f6b7f; margin-top:6px; font-size:12px;">Nada mudou.</div>');

        return `<div style="border:1px solid #e3e8ef; border-radius:6px; padding:10px; margin-bottom:10px;">
            <strong style="color:#1b4488;">${r.turma}</strong>
            <span style="font-size:11px; color:#7a869a;"> — ${r.arquivo}</span>
            ${partes.join('')}
        </div>`;
    }).join('');

    const preview = document.getElementById('previewMassa');
    preview.innerHTML = `
        <div style="padding:10px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:6px; margin-bottom:12px;">
            <strong style="color:#276749;">Importação concluída</strong>
            <div style="font-size:12px; color:#2f855a; margin-top:4px;">
                ${relatorio.length} turma(s) · +${totais.criados} novos · ${totais.alterados} mudaram de status · ${totais.sumiram} sumiram da lista
            </div>
        </div>
        ${blocos}
    `;
    document.getElementById('btnConfirmarMassa').disabled = true;
    document.getElementById('filesMassa').value = '';
    importMassaItens = [];
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
                <p style="color:#5f6b7f; margin-bottom:20px;">
                    Gestor: <strong>${currentUser.nome}</strong> | Escola ID: <strong>${mySchoolId || 'Não definido'}</strong>
                </p>
                
                <!-- PROFESSORES VINCULADOS -->
                ${professoresDaEscola.length > 0 ? `
                    <h3 style="color: #1b4488; border-bottom: 1px solid #e3e8ef; padding-bottom: 5px;">Professores da Escola</h3>
                    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
                        ${professoresDaEscola.map(p => `
                            <div style="border: 1px solid #e3e8ef; padding: 15px; border-radius: 8px; background: #f6f8fb; cursor: pointer; transition: all 0.2s;" 
                                 onmouseover="this.style.background='#edf3fd'; this.style.borderColor='#2563c9';" 
                                 onmouseout="this.style.background='#f6f8fb'; this.style.borderColor='#e3e8ef';"
                                 onclick="verTutoradosProfessor('${p.id}', '${p.nome}')">
                                <div style="font-weight: bold; color: #1b4488; font-size: 16px;">${p.nome}</div>
                                <div style="font-size: 12px; color: #5f6b7f; margin-top: 5px;">${p.email}</div>
                                <div style="margin-top: 10px; text-align: right; font-size: 12px; color: #2563c9;">Ver Tutorados →</div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="empty-state">Nenhum professor vinculado oficialmente.</p>'}

                <!-- PROFESSORES SEM VÍNCULO (ANTIGOS) -->
                ${professoresSemVinculo.length > 0 ? `
                    <div style="margin-top: 30px; border-top: 2px dashed #cdd5e1; padding-top: 20px;">
                        <h3 style="color: #d69e2e;">⚠️ Professores Sem Vínculo (Antigos)</h3>
                        <p style="font-size:13px; color:#5f6b7f; margin-bottom:15px;">Estes usuários não têm escola definida. Clique em "Vincular" para trazê-los para sua escola.</p>
                        
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
                                <tr style="background: #eef2f7;">
                                    <th style="padding:8px; border:1px solid #e3e8ef;">Nome</th>
                                    <th style="padding:8px; border:1px solid #e3e8ef;">Email</th>
                                    <th style="padding:8px; border:1px solid #e3e8ef;">Escola ID (Atual)</th>
                                    <th style="padding:8px; border:1px solid #e3e8ef;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.filter(u => u.role !== 'super_admin').map(u => {
                                    const uSchoolId = u.schoolId ? String(u.schoolId) : '';
                                    const match = uSchoolId === mySchoolId;
                                    return `
                                    <tr style="background: ${match ? '#f0fff4' : '#fff'};">
                                        <td style="padding:8px; border:1px solid #e3e8ef;">${u.nome}</td>
                                        <td style="padding:8px; border:1px solid #e3e8ef;">${u.email}</td>
                                        <td style="padding:8px; border:1px solid #e3e8ef;"><strong>${uSchoolId || '(Vazio)'}</strong></td>
                                        <td style="padding:8px; border:1px solid #e3e8ef; color: ${match ? 'green' : 'red'}; font-weight:bold;">
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
        <div style="background:#f6f8fb; padding:15px; border-radius:8px; border:1px solid #e3e8ef; margin-top:15px; font-size:13px;">
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
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #cdd5e1;">
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

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; border-bottom: 1px solid #e3e8ef; padding-bottom:10px;">
                <div>
                    <h2 style="margin:0;">Relatório de Tutoria</h2>
                    <div style="color:#5f6b7f;"><strong>Professor:</strong> ${profNome} | <strong>Estudante:</strong> ${alunoNome}</div>
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
        <div style="border: 1px solid #cdd5e1; padding: 15px; border-radius: 6px; margin-bottom: 10px; page-break-inside: avoid;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>📅 ${formatDate(e.data)}</strong>
                <span style="font-size:12px; background:#eef2f7; padding:2px 8px; border-radius:10px;">${e.tema || 'Sem tema'}</span>
            </div>
            <p style="white-space: pre-wrap; color: #3d4759; margin:0;">${e.resumo || ''}</p>
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

// --- NOTAS OFICIAIS: só a EXIBIÇÃO do que já foi importado ---
//
// A página "Notas Oficiais" do gestor (importação de Mapão e de avaliações por planilha/PDF/IA)
// foi retirada por não ter tido uso prático. O que já foi gravado continua aparecendo na ficha
// do estudante e na de tutoria, por isso ficam só as duas funções de exibição abaixo.

function normNomeNotasOficiais(s) {
    // Mesma convenção de normalização de nome usada no resto do app (gestor.js:1938, app.js:6460)
    return (s || '').trim().toUpperCase();
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

    if (!currentUser || (!currentUser.schoolId && !currentUser.espacoId)) {
        tela.innerHTML = `
            <div class="card" style="margin:20px 0;">
                <h2>🏫 Escola</h2>
                <p class="empty-state">Seu usuário não está vinculado a nenhuma escola. Peça ao administrador para vincular você a uma escola.</p>
            </div>`;
        return;
    }

    // [FASE 3] Espaço quando houver; system/schools_list para quem ainda não tem.
    const escola = (typeof resolverEscolaAtual === 'function') ? await resolverEscolaAtual() : null;

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

    const cartaoCodigo = await montarCartaoCodigoEspaco(escola);
    const cartaoLista = await montarCartaoListaEscola();

    tela.innerHTML = `
        ${cartaoCodigo}
        ${cartaoLista}
        <div class="card" style="margin:20px 0;">
            <h2>🏫 Configurações da Escola</h2>
            <p style="color:#5f6b7f; font-size:14px; margin-bottom:15px;">Ajuste os dados da sua escola. Essas informações aparecem no cabeçalho do sistema e em documentos.</p>
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
            <p style="color:#5f6b7f; font-size:14px; margin-bottom:15px;">Libere o acesso de perfis novos, altere o perfil ou ative/inative o acesso de edição. Perfis novos só acessam os dados da escola após a sua liberação. Professores inativos continuam acessando o sistema em modo somente leitura.</p>
            <div id="listaProfessoresGestor"></div>
        </div>`;

    renderListaProfessoresGestor();
}

// [FASE 3] O código de convite do espaço.
//
// O código NÃO fica guardado no servidor: é o portão de entrada da escola, e um
// portão que o banco conhece não é portão nenhum.
// Consequência assumida: só aparece aqui no aparelho onde o espaço foi
// criado (ou onde alguém entrou com ele). Sumiu de todos os aparelhos, o caminho é
// gerar um novo — os colegas que já entraram continuam dentro.
async function montarCartaoCodigoEspaco(escola) {
    const ref = (typeof resolverEspaco === 'function') ? resolverEspaco(currentUser) : { espacoId: null };
    const espacoId = ref.espacoId || (escola && escola.espacoId) || null;
    if (!espacoId) return '';

    let codigo = null;
    try { codigo = (typeof codigoEspacoGuardado === 'function') ? await codigoEspacoGuardado() : null; }
    catch (e) { codigo = null; }

    const miolo = codigo
        ? `<div style="font-family:monospace; font-size:24px; letter-spacing:2px; color:#22543d; background:#fff;
                       border:2px dashed #9ae6b4; border-radius:8px; padding:12px; text-align:center; user-select:all;"
                id="codigoEspacoTexto">${formatarCodigo(codigo)}</div>
           <p style="font-size:12px; color:#3d4759; margin:8px 0 0;">Passe este código aos colegas da escola:
              é com ele que eles entram, sem precisar de liberação.</p>`
        : `<p style="font-size:13px; color:#744210; background:#fffaf0; border:1px solid #fbd38d;
                     border-radius:8px; padding:10px 12px; margin:0;">
             O código não está guardado neste aparelho — e o servidor não tem cópia dele, de propósito.
             Peça a quem criou o espaço, ou gere um código novo abaixo.</p>`;

    return `
        <div class="card" style="margin:20px 0; border-left:4px solid #38a169;">
            <h2>🔑 Código de convite do espaço</h2>
            ${miolo}
            <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                ${codigo ? '<button class="btn btn-sm btn-secondary" onclick="copiarCodigoEspaco()">📋 Copiar</button>' : ''}
                <button class="btn btn-sm btn-danger" onclick="gerarCodigoEspacoGestor('${espacoId}')">♻️ Gerar novo código</button>
            </div>
        </div>`;
}

// A lista da escola que os professores enxergam.
//
// Desde a adequação de setembro/2026 o documento em claro da gestão não leva mais
// `estudantes` (CAMPOS_PESSOAIS, shared.js), e a camada pessoal de cada conta é
// cifrada com a chave DELA. Sem esta publicação, transferência, matrícula nova e
// exclusão feitas aqui não chegam a professor nenhum — e ninguém percebe, porque a
// turma continua na tela com a lista do dia da virada.
async function montarCartaoListaEscola() {
    if (typeof lerListaEscola !== 'function') return '';

    const estado = await lerListaEscola('gestor', { forcar: true });
    let miolo = '';

    if (estado.estado === 'ok') {
        const d = estado.dados || {};
        const quando = d.geradoEm ? new Date(d.geradoEm).toLocaleString('pt-BR') : 'data desconhecida';
        miolo = `<p style="margin:0; font-size:14px; color:#22543d;">
                    ✅ Publicada em <strong>${quando}</strong> —
                    ${(d.estudantes || []).length} estudante(s) e ${(d.ocorrencias || []).length} ocorrência(s).
                 </p>
                 <p style="font-size:12px; color:#3d4759; margin:8px 0 0;">Os professores recebem esta lista ao abrir a turma.</p>`;
    } else if (estado.estado === 'vazio') {
        miolo = `<p style="margin:0; font-size:14px; color:#744210;">
                    Ainda não publicada. Enquanto isso, os professores não recebem as mudanças feitas aqui.
                 </p>`;
    } else {
        miolo = `<p style="margin:0; font-size:14px; color:#742a2a;">
                    Não consegui ler a lista publicada: ${estado.erro || estado.estado}.
                 </p>`;
    }

    return `
        <div class="card" style="margin:20px 0; border-left:4px solid #2563c9;">
            <h2>📋 Lista da escola para os professores</h2>
            ${miolo}
            <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                <button class="btn btn-sm btn-primary" onclick="publicarListaEscolaAgora()">📤 Publicar agora</button>
            </div>
            <p style="font-size:11px; color:#5f6b7f; margin:10px 0 0;">
                A publicação é automática a cada alteração. Este botão serve para conferir na hora.
            </p>
        </div>`;
}

async function publicarListaEscolaAgora() {
    let r = await publicarListaEscola(data, 'gestor', { forcar: true });

    // A recusa não pode ser uma parede: a escola que REALMENTE esvaziou a lista
    // (fim de ano, recadastro inteiro) precisa conseguir publicar isso. O que ela
    // não pode é acontecer por descuido, num painel que abriu sem os dados.
    if (r.estado === 'recusado') {
        const sair = confirm('Não publiquei ainda, de propósito.\n\n' +
            'Este painel está com a lista VAZIA e a lista publicada tem conteúdo. Publicar assim ' +
            'apagaria a lista de TODOS os professores da escola de uma vez.\n\n' +
            'Se o painel abriu sem carregar os estudantes, clique em Cancelar, recarregue a página ' +
            'e confira a aba Turmas antes de tentar de novo.\n\n' +
            'Foi você que esvaziou a lista de propósito? Então confirme para publicar assim mesmo.');
        if (!sair) { renderEscolaGestor(); return; }
        r = await publicarListaEscola(data, 'gestor', { forcar: true, mesmoVazio: true });
    }

    if (r.estado === 'ok') {
        alert('Lista publicada. Os professores passam a ver as alterações ao abrir a turma.');
    } else {
        alert('Não consegui publicar: ' + (r.erro || r.estado));
    }
    renderEscolaGestor();
}

function copiarCodigoEspaco() {
    const el = document.getElementById('codigoEspacoTexto');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim())
        .then(() => alert('Código copiado.'))
        .catch(() => alert('Não consegui copiar. Selecione o código e copie na mão.'));
}

async function gerarCodigoEspacoGestor(espacoId) {
    if (!confirm('Gerar um código novo?\n\nO código atual deixa de funcionar para NOVOS cadastros. ' +
                 'Quem já entrou continua dentro normalmente.')) return;
    try {
        const atual = (typeof codigoEspacoGuardado === 'function') ? await codigoEspacoGuardado() : null;
        const novo = await gerarNovoCodigoEspaco(espacoId, atual);
        alert('Código novo do espaço:\n\n    ' + formatarCodigo(novo) + '\n\nAnote e passe aos colegas.');
        renderEscolaGestor();
    } catch (e) {
        alert('Não consegui gerar o código: ' + (e && e.message));
    }
}

async function salvarConfigEscolaGestor(e) {
    if (e) e.preventDefault();
    if (!currentUser || (!currentUser.schoolId && !currentUser.espacoId)) return;

    // [FASE 3] Grava de volta no MESMO lugar de onde veio: no espaço, se houver, senão
    // na lista antiga. Salvar sempre no schools_list faria a edição sumir da tela de
    // quem já usa espaço — o cabeçalho lê o espaço.
    const ref = (typeof resolverEspaco === 'function') ? resolverEspaco(currentUser) : { espacoId: null };
    const sData = await getData('system', 'schools_list');
    const schools = (sData && sData.list && Array.isArray(sData.list)) ? sData.list : [];
    const escola = ref.espacoId
        ? (await getData('espacos', ref.espacoId))
        : schools.find(s => s.id == currentUser.schoolId);

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

    if (ref.espacoId) {
        await saveData('espacos', ref.espacoId, escola);
        if (typeof lembrarEspaco === 'function') await lembrarEspaco(ref.espacoId, null, escola);
    } else {
        await saveData('system', 'schools_list', { list: schools });
    }
    alert('Configurações da escola salvas com sucesso!');
    renderEscolaGestor();
}

function formatarDataPtBr(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
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

    // Perfis novos aguardando liberação (approved === false). Ficam em destaque no topo.
    const pendentes = professores.filter(u => u.approved === false);
    const liberados = professores.filter(u => u.approved !== false);

    // --- SEÇÃO: AGUARDANDO LIBERAÇÃO ---
    let htmlPendentes = '';
    if (pendentes.length > 0) {
        htmlPendentes = `
            <div style="border:1px solid #f6c177; background:#fffaf0; border-radius:10px; padding:14px 16px; margin-bottom:18px;">
                <h3 style="color:#b7791f; margin:0 0 4px;">🔔 Novos perfis aguardando sua liberação (${pendentes.length})</h3>
                <p style="color:#8a6d3b; font-size:13px; margin:0 0 12px;">Estes cadastros ainda <strong>não têm acesso aos dados da escola</strong>. Confirme quem faz parte da sua equipe para liberar o uso das ferramentas.</p>
                <table>
                    <thead>
                        <tr><th>Nome</th><th>E-mail</th><th>Solicitado em</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                        ${pendentes.map(u => {
                            const recusado = u.rejected === true;
                            return `
                            <tr>
                                <td>${u.nome || '(sem nome)'}</td>
                                <td style="font-size:12px; color:#5f6b7f;">${u.email || '—'}</td>
                                <td style="font-size:12px; color:#5f6b7f;">${formatarDataPtBr(u.pendingSince) || '—'}${recusado ? ' <span class="badge badge-danger">Recusado</span>' : ''}</td>
                                <td>
                                    <button class="btn btn-success btn-sm" onclick="aprovarProfessorGestor('${u.id}')" title="Liberar acesso">✅ Liberar acesso</button>
                                    ${recusado ? '' : `<button class="btn btn-danger btn-sm" onclick="recusarProfessorGestor('${u.id}')" title="Recusar acesso">✋ Recusar</button>`}
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // --- SEÇÃO: PERFIS LIBERADOS ---
    const htmlLiberados = liberados.length === 0
        ? '<p class="empty-state">Nenhum perfil liberado ainda.</p>'
        : `
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
                ${liberados.map(u => {
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

    container.innerHTML = htmlPendentes + htmlLiberados;
}

// [SEGURANÇA] Libera o acesso de um perfil novo. Só depois disto o usuário passa a
// carregar os dados da escola e usar as ferramentas (ver gate em iniciarApp/app.js).
async function aprovarProfessorGestor(id) {
    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    const user = users.find(u => String(u.id) === String(id));
    if (!user) return;

    // Guarda: só perfis da própria escola, nunca super_admin.
    if (user.schoolId != currentUser.schoolId || user.role === 'super_admin') {
        alert('Você só pode liberar perfis da sua própria escola.');
        return;
    }

    if (!confirm(`Liberar o acesso de "${user.nome || user.email || 'este perfil'}"?\n\nEle poderá acessar os dados e as ferramentas da escola.`)) return;

    user.approved = true;
    user.rejected = false;
    user.active = true; // garante acesso de edição ao liberar
    user.approvedAt = new Date().toISOString();
    user.approvedBy = currentUser.nome || currentUser.email || 'gestor';
    await saveData('system', 'users_list', { list: users });
    // [SEGURANÇA] Libera também no banco (Regras do Firestore) — access/{uid}.approved = true.
    await gravarAcessoUsuario(user.uid || user.id, {
        approved: true,
        role: user.role || 'professor',
        schoolId: user.schoolId,
        email: user.email || '',
        approvedAt: user.approvedAt,
        approvedBy: user.approvedBy
    });
    renderListaProfessoresGestor();
}

// [SEGURANÇA] Recusa a liberação de um perfil novo. Ele continua sem acesso aos dados
// da escola (permanece na tela de "acesso não liberado"). Pode ser liberado depois.
async function recusarProfessorGestor(id) {
    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    const user = users.find(u => String(u.id) === String(id));
    if (!user) return;

    if (user.schoolId != currentUser.schoolId || user.role === 'super_admin') {
        alert('Você só pode recusar perfis da sua própria escola.');
        return;
    }

    if (!confirm(`Recusar o acesso de "${user.nome || user.email || 'este perfil'}"?\n\nO perfil continuará sem acesso aos dados da escola. Você poderá liberá-lo depois, se quiser.`)) return;

    user.approved = false;
    user.rejected = true;
    user.rejectedAt = new Date().toISOString();
    user.rejectedBy = currentUser.nome || currentUser.email || 'gestor';
    await saveData('system', 'users_list', { list: users });
    // [SEGURANÇA] Mantém bloqueado no banco (Regras do Firestore) — access/{uid}.approved = false.
    await gravarAcessoUsuario(user.uid || user.id, {
        approved: false,
        role: user.role || 'professor',
        schoolId: user.schoolId,
        email: user.email || '',
        rejectedAt: user.rejectedAt,
        rejectedBy: user.rejectedBy
    });
    renderListaProfessoresGestor();
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
    // [SEGURANÇA] Reflete o novo perfil no documento de acesso (mantém liberado). Só perfis
    // já liberados chegam aqui (o botão de editar perfil não aparece para pendentes).
    await gravarAcessoUsuario(user.uid || user.id, {
        approved: true,
        role: role,
        schoolId: user.schoolId,
        email: user.email || ''
    });
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
