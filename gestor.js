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
    const ocorrencias = (data.ocorrencias || []).sort((a, b) => new Date(b.data) - new Date(a.data));
    const html = `
        <div class="card">
            <h2>⚠️ Ocorrências da Escola</h2>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Turma</th>
                        <th>Envolvidos</th>
                        <th>Relato</th>
                    </tr>
                </thead>
                <tbody>
                    ${ocorrencias.map(o => {
                        const turma = data.turmas.find(t => t.id == o.id_turma);
                        const envolvidos = (o.ids_estudantes || []).map(id => {
                            const est = (data.estudantes || []).find(e => e.id == id);
                            return est ? est.nome_completo : '?';
                        }).join(', ');

                        return `
                            <tr>
                                <td>${formatDate(o.data)}</td>
                                <td>${turma ? turma.nome : '?'}</td>
                                <td>${envolvidos || '-'}</td>
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