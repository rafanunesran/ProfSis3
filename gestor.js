// --- LÓGICA DO GESTOR ---

function renderGestorPanel() {
    // Navegação de Gestor
    const nav = document.querySelector('nav');
    nav.innerHTML = `
        <button class="active" onclick="showScreen('dashboard', event)"><span class="icon">📊</span><span class="label">Dashboard Gestão</span></button>
        <button onclick="showScreen('turmas', event)"><span class="icon">👥</span><span class="label">Turmas</span></button>
        <button onclick="showScreen('registrosGestor', event)"><span class="icon">📂</span><span class="label">Registros</span></button>
        <button onclick="showScreen('ocorrenciasGestor', event)"><span class="icon">⚠️</span><span class="label">Ocorrências</span></button>
        <button onclick="showScreen('tutoriasGestor', event)"><span class="icon">🎓</span><span class="label">Tutorias</span></button>
        <button onclick="showScreen('horariosGestor', event)"><span class="icon">⏰</span><span class="label">Horários</span></button>
    `;
    
    // Criar telas do Gestor se não existirem
    const container = document.getElementById('appContainer');
    const innerContainer = container.querySelector('.container') || container;
    
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
        container.appendChild(hor);
    }

    renderDashboard();
    showScreen('dashboard');
    
    // Se a tela atual for tutorias, renderiza
    if (document.getElementById('tutoriasGestor').classList.contains('active')) {
        renderTutoriasGestor();
    }
}

function renderRegistrosGestor(isReadOnly = false) {
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
            // Faltosos aparecem indeterminadamente (não retorna null)
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
                    ${!isReadOnly ? `<button class="btn btn-secondary" onclick="compartilharRelatorio()">🔗 Compartilhar Online</button>` : ''}
                    ${!isReadOnly ? `<button class="btn btn-primary" onclick="abrirNovoRegistroGestao()">+ Novo Registro</button>` : ''}
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
                                    ${!isReadOnly ? '<th>Ações</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${grupos[turmaNome].map(r => `
                                    <tr>
                                        <td style="color: ${r.cor}; font-weight: bold;">${r.tipo}</td>
                                        <td>${r.estudanteNome}</td>
                                        <td>${formatDate(r.data)} ${r.tipo === 'Atestado' ? `(${r.dias} dias)` : ''} ${r.descricao ? `<br><small>${r.descricao}</small>` : ''}</td>
                                        ${!isReadOnly ? `
                                        <td>
                                            <button class="btn btn-danger btn-sm" onclick="removerRegistroGestao(${r.id})">🗑️</button>
                                        </td>
                                        ` : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `).join('')}
                ` : '<p class="empty-state">Nenhum registro vigente ou faltoso encontrado.</p>'}
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

    const estudantes = data.estudantes.filter(e => e.id_turma == turmaId);
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

function renderOcorrenciasGestor() {
    const todasOcorrencias = (data.ocorrencias || []).sort((a, b) => new Date(b.data) - new Date(a.data));
    
    // Filtro de Status
    let filtro = 'pendente';
    const radioChecked = document.querySelector('input[name="filtroOco"]:checked');
    if (radioChecked) filtro = radioChecked.value;
    
    const ocorrenciasFiltradas = todasOcorrencias.filter(o => {
        if (filtro === 'todas') return true;
        const status = o.status || 'pendente';
        return status === filtro;
    });

    const html = `
        <div class="card">
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
                    ${ocorrenciasFiltradas.length > 0 ? ocorrenciasFiltradas.map(o => {
                        const turma = data.turmas.find(t => t.id == o.id_turma);
                        // Usa o snapshot salvo pelo professor ou tenta montar com dados atuais
                        const turmaDisplay = o.turma_snapshot || (turma ? `${turma.nome} ${o.disciplina ? '- ' + o.disciplina : ''}` : '?');
                        
                        const envolvidos = (o.ids_estudantes || []).map(id => {
                            const est = (data.estudantes || []).find(e => e.id == id);
                            return est ? est.nome_completo : '?';
                        }).join(', ');

                        const isPendente = (o.status || 'pendente') === 'pendente';

                        return `
                            <tr>
                                <td>${formatDate(o.data)}</td>
                                <td>${turmaDisplay}</td>
                                <td>${o.autor || 'Gestão'}</td>
                                <td>${envolvidos || '-'}</td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="imprimirOcorrenciaGestor(${o.id})">📄 Baixar PDF</button>
                                </td>
                                <td>
                                    <button class="btn btn-sm ${isPendente ? 'btn-warning' : 'btn-success'}" onclick="toggleStatusOcorrencia(${o.id})">
                                        ${isPendente ? '⏳ Pendente' : '✅ Confirmada'}
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px; color:#a0aec0;">Nenhuma ocorrência nesta categoria.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
    document.getElementById('ocorrenciasGestor').innerHTML = html;
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
            <p style="white-space: pre-wrap; background: #f9f9f9; padding: 15px; border: 1px solid #ddd;">${o.relato}</p>
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
    if (typeof USE_FIREBASE === 'undefined' || !USE_FIREBASE) {
        alert('O compartilhamento requer que o sistema esteja ONLINE (Firebase).');
        return;
    }

    const confirmacao = confirm('Isso criará um link público de leitura para estes registros. Deseja continuar?');
    if (!confirmacao) return;

    // Prepara os dados para salvar (Snapshot do momento)
    const payload = {
        criadoEm: new Date().toISOString(),
        escolaId: (currentUser && currentUser.schoolId) ? currentUser.schoolId : 'default',
        dados: {
            registrosAdministrativos: data.registrosAdministrativos || [],
            estudantes: (data.estudantes || []).map(e => ({id: e.id, nome_completo: e.nome_completo})), // Minifica dados
            turmas: (data.turmas || []).map(t => ({id: t.id, nome: t.nome})) // Minifica dados
        }
    };

    try {
        const docRef = await db.collection('shared_views').add(payload);
        const link = `${window.location.origin}${window.location.pathname}?share=${docRef.id}`;
        
        prompt("Link gerado com sucesso! Copie e envie para os professores:", link);
    } catch (error) {
        console.error("Erro ao compartilhar:", error);
        alert("Erro ao gerar link.");
    }
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
            <div class="meta-info">Gerado em: ${new Date(docData.criadoEm).toLocaleDateString('pt-BR')} às ${new Date(docData.criadoEm).toLocaleTimeString('pt-BR')}</div>
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

// --- GRADE DE HORÁRIOS (GESTOR) ---

function renderHorariosGestor() {
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
            <h2>⏰ Configuração da Grade Horária</h2>
            <p style="color:#666; font-size:14px; margin-bottom:15px;">Defina os horários de aula para cada dia da semana.</p>
            
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
                        <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 5px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <span style="font-size: 12px; font-weight: 600; color: #4a5568;">${s.inicio} - ${s.fim}</span>
                            <button class="btn btn-danger btn-sm" style="margin:0; padding: 0 5px; font-size: 14px; line-height: 1;" onclick="removerBlocoHorario(${s.id})" title="Remover">×</button>
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
            const estudanteExistente = data.estudantes.find(e => e.nome_completo.toUpperCase() === nome);

            if (estudanteExistente) {
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
            if (u.role === 'gestor' || u.role === 'super_admin') return;
            
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
                                ${users.filter(u => u.role !== 'gestor' && u.role !== 'super_admin').map(u => {
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
            <h2 style="margin-top: 15px;">Tutorados de: ${profNome}</h2>
            
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
    
    // Filtra encontros deste aluno (encontros devem ter id_tutorado ou similar, adaptando conforme app.js)
    // Nota: app.js usa 'encontroTutorado' (value=id) no modal. Vamos assumir que salva como 'tutoradoId' ou similar.
    // Como o app.js original tinha apenas um alert no salvarEncontro, assumiremos que se fosse salvo, teria essa estrutura.
    // Para compatibilidade com o modalNovoEncontro do app.js, vamos supor que o objeto salvo tenha { tutoradoId: id, ... }
    // Se o app.js não salva, isso virá vazio, mas a estrutura está pronta.
    
    // Vamos injetar o HTML base e depois filtrar via JS local para não recarregar tudo
    const currentYear = new Date().getFullYear();
    
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
                    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir</button>
                </div>
            </div>

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