// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// v2.9.0 - Aulas dobradinhas: marca "Replicar Frequência" na chamada e seleciona ao menos uma aula
// de Material Digital em CADA aba do Registro (não só a ativa). Botão "Extrair Alunos" agora só
// aparece na tela de chamada (espelhando o botão de Material, que já só aparecia no Registro).

    console.log("🤖 content_sed.js EXECUTADO - v2.9.0");

// ==================== VARIÁVEIS GLOBAIS ====================
let extHistory = {};
let extDoneMarks = {};
let currentSelectedDate = "";
let profsisProfile = null;
let profsisAppData = null;

// ==================== TELA DE STATUS (sem formulário de login) ====================

function mostrarTelaStatus() {
    const oldMenu = document.getElementById('sisprof-menu-flutuante');
    if (oldMenu) oldMenu.remove();
    if (document.getElementById('sisprof-status-box')) return;
    if (!document.body) { setTimeout(mostrarTelaStatus, 500); return; }
    
    console.log("🔍 Verificando status do ProfSis...");
    
    const div = document.createElement('div');
    div.id = 'sisprof-status-box';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:340px; background:white; border:3px solid #3182ce; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5);';
    div.innerHTML = 
        '<div style="background:#3182ce; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; text-align:center;">' +
            '🤖 Robô SisProf <span style="font-size:10px; opacity:0.7;">v2.1.0</span>' +
        '</div>' +
        '<div id="sisprof-status-content" style="text-align:center;">' +
            '<p style="font-size:13px; color:#4a5568;">⏳ Verificando conexão com o ProfSis...</p>' +
        '</div>';
    
    document.body.appendChild(div);
    
    // Pede ao background para verificar o login do ProfSis
    chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[SisProf Ext] Erro:', chrome.runtime.lastError);
            mostrarErroConexao(div);
            return;
        }
        
        if (response && response.loggedIn) {
            console.log('[SisProf Ext] ✅ ProfSis logado:', response.user.nome || response.user.email);
            profsisProfile = response.user;
            profsisAppData = response.appData || {};
            div.remove();
            iniciarFluxoCompleto();
        } else if (response && response.tabFound) {
            mostrarAvisoLogin(div);
        } else {
            mostrarBotaoAbrirProfSis(div);
        }
    });
}

function mostrarErroConexao(div) {
    const content = div.querySelector('#sisprof-status-content');
    content.innerHTML = 
        '<p style="font-size:13px; color:#e53e3e; margin-bottom:15px;">❌ Erro de conexão com a extensão.</p>' +
        '<button id="sisprof-btn-retry" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">🔄 Tentar Novamente</button>';
    document.getElementById('sisprof-btn-retry').onclick = function() { div.remove(); mostrarTelaStatus(); };
}

function mostrarAvisoLogin(div) {
    const content = div.querySelector('#sisprof-status-content');
    content.innerHTML = 
        '<p style="font-size:13px; color:#dd6b20; margin-bottom:10px;">⚠️ O ProfSis está aberto mas você não está logado.</p>' +
        '<p style="font-size:12px; color:#718096; margin-bottom:15px;">Faça login no ProfSis e depois clique no botão abaixo.</p>' +
        '<button id="sisprof-btn-recheck" style="width:100%; background:#38a169; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; margin-bottom:8px;">🔄 Já fiz login - Verificar</button>' +
        '<button id="sisprof-btn-open-profsis" style="width:100%; background:#3182ce; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px;">🌐 Ir para o ProfSis</button>';
    document.getElementById('sisprof-btn-recheck').onclick = function() { div.remove(); mostrarTelaStatus(); };
    document.getElementById('sisprof-btn-open-profsis').onclick = function() { chrome.runtime.sendMessage({ action: 'OPEN_PROFSIS' }); };
}

function mostrarBotaoAbrirProfSis(div) {
    const content = div.querySelector('#sisprof-status-content');
    content.innerHTML = 
        '<p style="font-size:13px; color:#e53e3e; margin-bottom:10px;">🔴 O ProfSis não está aberto.</p>' +
        '<p style="font-size:12px; color:#718096; margin-bottom:15px;">Abra o ProfSis, faça login e depois clique no botão abaixo para conectar.</p>' +
        '<button id="sisprof-btn-open-profsis" style="width:100%; background:#3182ce; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; margin-bottom:8px;">🌐 Abrir ProfSis</button>' +
        '<button id="sisprof-btn-recheck" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px;">✅ Já abri e loguei - Conectar</button>';
    document.getElementById('sisprof-btn-open-profsis').onclick = function() { chrome.runtime.sendMessage({ action: 'OPEN_PROFSIS' }); };
    document.getElementById('sisprof-btn-recheck').onclick = function() { div.remove(); mostrarTelaStatus(); };
}

// ==================== FLUXO PRINCIPAL ====================

function iniciarFluxoCompleto() {
    if (profsisProfile) {
        carregarDadosProfSis();
    } else {
        chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.loggedIn) { mostrarTelaStatus(); return; }
            profsisProfile = response.user;
            profsisAppData = response.appData || {};
            carregarDadosProfSis();
        });
    }
}

function carregarDadosProfSis() {
    console.log('[SisProf Ext] Dados do ProfSis:', Object.keys(profsisAppData || {}).length, 'chaves');
    if (!profsisAppData || Object.keys(profsisAppData).length === 0) {
        console.log('[SisProf Ext] Sem dados - pedindo ao ProfSis...');
        chrome.runtime.sendMessage({ action: 'REQUEST_PROFSIS_DATA' });
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (response) => {
                if (response && response.loggedIn && response.appData) { profsisAppData = response.appData; }
                montarHistoricoLocal();
                chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
                    if (!chrome.runtime.lastError && data) extDoneMarks = data.rpa_done_marks || {};
                    injetarMenu();
                });
            });
        }, 3000);
        return;
    }
    montarHistoricoLocal();
    chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
        if (!chrome.runtime.lastError && data) extDoneMarks = data.rpa_done_marks || {};
        injetarMenu();
    });
}

// ==================== MONTAGEM DE HISTÓRICO ====================

function montarHistoricoLocal() {
    extHistory = {};
    const hoje = new Date();
    for (let i = 0; i < 30; i++) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i);
        const dataStr = d.toISOString().split('T')[0];
        extHistory[dataStr] = montarPayloadPorData(dataStr);
    }
    console.log('[SisProf Ext] Histórico montado:', Object.keys(extHistory).length, 'dias');
}

function montarPayloadPorData(dataStr) {
    const presencas = (profsisAppData.presencas || []);
    const estudantes = (profsisAppData.estudantes || []);
    const registrosAula = (profsisAppData.registrosAula || []);
    const registrosAdmin = (profsisAppData.registrosAdministrativos || []);
    
    // FALTOSOS: apenas alunos classificados como "Faltoso" pela gestão
    // A classificação vem de registrosAdministrativos onde tipo === 'Faltoso'
    const faltososGestao = registrosAdmin.filter(r => r.tipo === 'Faltoso');
    let alunosFaltantesNomes = [];
    
    faltososGestao.forEach(reg => {
        const est = estudantes.find(e => e.id == reg.estudanteId);
        if (!est) return;
        // Apenas alunos ativos
        if (est.status && est.status !== 'Ativo') return;
        
        // Verifica se houve chamada neste dia para este aluno
        const presencaDoDia = presencas.find(p => p.id_estudante == est.id && p.data === dataStr);
        
        if (!presencaDoDia) {
            // Não houve chamada - considera como falta
            alunosFaltantesNomes.push({ nome: est.nome_completo, id_turma: est.id_turma, id_estudante: est.id });
        } else if (presencaDoDia.status === 'falta') {
            // Houve chamada e o aluno faltou
            alunosFaltantesNomes.push({ nome: est.nome_completo, id_turma: est.id_turma, id_estudante: est.id });
        }
        // Se houve chamada e o aluno esteve presente, NÃO inclui (não faltou)
    });
    
    const registrosNoDia = registrosAula.filter(r => r.data === dataStr);
    const turmasProfsis = profsisAppData.turmas || [];

    // Mantém id_turma/turmaNome/disciplina em cada registro (em vez de só o texto) para dar para
    // casar com a turma/disciplina exibida na tela "Registro de Aulas Detalhes" da SED - sem isso,
    // um professor com mais de uma turma no mesmo dia sempre pegaria o registro errado (o primeiro
    // da lista) ao preencher o Registro de uma turma que não é a primeira.
    const registros = registrosNoDia.map(r => {
        const turma = turmasProfsis.find(t => t.id == r.id_turma);
        return { conteudo: r.conteudo, id_turma: r.id_turma, turmaNome: turma ? turma.nome : null, disciplina: turma ? turma.disciplina : null, cardsMaterialDigital: r.cardsMaterialDigital || [] };
    });

    return { data: dataStr, faltas: alunosFaltantesNomes, registros: registros, fechamento: [] };
}

// Turmas que o professor tem no dia — mesma lógica do card "Agenda do Dia" do dashboard do ProfSis
// (app.js renderDashboard): grade da escola + exceções do dia, cruzadas com horariosAulas do professor.
// Usa schoolGrade/schoolExceptions (cópia que o ProfSis salva no professor ao abrir uma turma),
// já que a extensão não tem acesso direto ao documento da gestão.
function montarTurmasDoDia(dataStr) {
    if (!dataStr) return [];
    const gradeEscola = profsisAppData.schoolGrade || [];
    const excecoesGrade = profsisAppData.schoolExceptions || [];
    const minhasAulas = profsisAppData.horariosAulas || [];
    const turmas = profsisAppData.turmas || [];
    const diaSemana = new Date(dataStr + 'T12:00:00').getDay();
    const excecaoDoDia = excecoesGrade.find(e => e.data === dataStr);
    const blocosDoDia = excecaoDoDia
        ? (excecaoDoDia.blocos || [])
        : gradeEscola.filter(g => g.diaSemana == diaSemana).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));

    const lista = [];
    blocosDoDia.forEach(bloco => {
        const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
        if (aula && aula.tipo === 'aula' && aula.id_turma) {
            const turma = turmas.find(t => t.id == aula.id_turma);
            if (turma && turma.nome && turma.disciplina && !lista.some(t => t.id === turma.id)) {
                lista.push({ id: turma.id, nome: turma.nome, disciplina: turma.disciplina });
            }
        }
    });
    return lista;
}

// Conta quantas aulas (blocos da grade) a turma tem no dia, sem deduplicar - mesma lógica de
// getAulasNoDia (app.js): 2 ou mais = "aula dobradinha" (duas aulas seguidas da mesma turma+disciplina
// no mesmo dia, que exigem marcar "Replicar Frequência" na tela de chamada da SED).
function contarAulasNoDia(idTurma, dataStr) {
    if (!dataStr || !idTurma) return 0;
    const gradeEscola = profsisAppData.schoolGrade || [];
    const excecoesGrade = profsisAppData.schoolExceptions || [];
    const minhasAulas = profsisAppData.horariosAulas || [];
    const diaSemana = new Date(dataStr + 'T12:00:00').getDay();
    const excecaoDoDia = excecoesGrade.find(e => e.data === dataStr);
    const blocosDoDia = excecaoDoDia
        ? (excecaoDoDia.blocos || [])
        : gradeEscola.filter(g => g.diaSemana == diaSemana);

    return blocosDoDia.filter(bloco => {
        const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
        return aula && aula.tipo === 'aula' && String(aula.id_turma) === String(idTurma);
    }).length;
}

// ==================== DETECÇÃO DE TELA (CHAMADA x REGISTRO) ====================
// A SED usa a mesma extensão em duas telas bem diferentes: "Lançamento de Frequências" (chamada)
// e "Registro de Aulas Detalhes" (conteúdo da aula). O título em .txt-titulo é o jeito mais estável
// de saber em qual delas estamos (a URL da SPA Blazor não muda de forma confiável entre elas).
function detectarTipoTelaSED() {
    const tituloEl = document.querySelector('.txt-titulo');
    const titulo = tituloEl ? tituloEl.textContent.trim() : '';
    if (/registro de aulas detalhes/i.test(titulo)) return 'registro';
    if (/lan[cç]amento de frequ[êe]ncias?/i.test(titulo)) return 'chamada';
    return null;
}

function normalizeTextoSED(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

// Mesma lógica de extrairCodigoSerieTurma do background.js (código série+letra, ex: "8C"), duplicada
// aqui porque content script e service worker rodam em contextos separados e não compartilham funções.
function extrairCodigoSerieTurmaSED(nome) {
    if (!nome) return null;
    const m = nome.match(/(\d+)\s*[ºo°]?\.?\s*(?:ano|s[ée]rie)?\s*\.?\s*([A-Za-zÀ-ú])\b/i);
    if (!m) return null;
    return (m[1] + m[2]).toUpperCase();
}

// Lê a Turma/Disciplina exibidas no cabeçalho da tela atual da SED (mesmo padrão usado em
// iniciarExtrairAlunos) e acha, dentro dos registros do dia, o que pertence a essa turma+disciplina.
function encontrarRegistroParaTela(payload) {
    if (!payload || !payload.registros || payload.registros.length === 0) return null;
    if (payload.registros.length === 1) return payload.registros[0];

    let turmaSED = null, disciplinaSED = null;
    document.querySelectorAll('.font-cabecalho-filtro').forEach(span => {
        const t = span.textContent || '';
        if (t.includes('Turma:')) turmaSED = t.replace(/^.*Turma:/i, '').trim();
        if (t.includes('Disciplina:')) disciplinaSED = t.replace(/^.*Disciplina:/i, '').trim();
    });
    if (!turmaSED) return null;

    const codigoSED = extrairCodigoSerieTurmaSED(turmaSED);
    let candidatos = [];
    if (codigoSED) {
        candidatos = payload.registros.filter(r => extrairCodigoSerieTurmaSED((r.turmaNome || '').split('-')[0]) === codigoSED);
    }
    if (candidatos.length === 0) {
        const normTurmaSED = normalizeTextoSED(turmaSED);
        candidatos = payload.registros.filter(r => normalizeTextoSED((r.turmaNome || '').split('-')[0]) === normTurmaSED);
    }
    if (candidatos.length > 1 && disciplinaSED) {
        const normDiscSED = normalizeTextoSED(disciplinaSED);
        const porDisciplina = candidatos.filter(r => normalizeTextoSED(r.disciplina) === normDiscSED);
        if (porDisciplina.length > 0) candidatos = porDisciplina;
    }
    return candidatos.length > 0 ? candidatos[0] : null;
}

// Lê a Turma/Disciplina do cabeçalho da tela atual (mesmo padrão de encontrarRegistroParaTela) e acha
// o id da turma correspondente em profsisAppData.turmas - usado para saber se a turma tem dobradinha
// no dia (ver contarAulasNoDia).
function encontrarIdTurmaDaTelaAtual() {
    let turmaSED = null, disciplinaSED = null;
    document.querySelectorAll('.font-cabecalho-filtro').forEach(span => {
        const t = span.textContent || '';
        if (t.includes('Turma:')) turmaSED = t.replace(/^.*Turma:/i, '').trim();
        if (t.includes('Disciplina:')) disciplinaSED = t.replace(/^.*Disciplina:/i, '').trim();
    });
    if (!turmaSED) return null;

    const turmas = profsisAppData.turmas || [];
    const codigoSED = extrairCodigoSerieTurmaSED(turmaSED);
    let candidatos = [];
    if (codigoSED) {
        candidatos = turmas.filter(t => extrairCodigoSerieTurmaSED((t.nome || '').split('-')[0]) === codigoSED);
    }
    if (candidatos.length === 0) {
        const normTurmaSED = normalizeTextoSED(turmaSED);
        candidatos = turmas.filter(t => normalizeTextoSED((t.nome || '').split('-')[0]) === normTurmaSED);
    }
    if (candidatos.length > 1 && disciplinaSED) {
        const normDiscSED = normalizeTextoSED(disciplinaSED);
        const porDisciplina = candidatos.filter(t => normalizeTextoSED(t.disciplina) === normDiscSED);
        if (porDisciplina.length > 0) candidatos = porDisciplina;
    }
    return candidatos.length > 0 ? candidatos[0].id : null;
}

// ==================== MENU FLUTUANTE ====================

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    if (!document.body) { setTimeout(injetarMenu, 500); return; }
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:350px; background:white; border:3px solid #38a169; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5); max-height:90vh; overflow-y:auto;';
    div.innerHTML = '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🤖 SisProf <span style="font-size:10px; opacity:0.7;">v2.9.0</span></span>' +
        '<div style="display:flex; gap:8px; align-items:center;"><span id="sisprof-user-name" style="font-size:11px; opacity:0.9; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
        '<span id="sisprof-minimizar" style="cursor:pointer; font-size:16px;">▶</span><span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span></div></div>' +
        '<div id="sisprof-conteudo"><p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Conectado ao ProfSis!</p>' +
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;"><label style="font-size:12px; font-weight:bold; color:#276749; display:block; margin-bottom:4px;">📅 Selecione o Dia:</label>' +
        '<div style="display:flex; gap:5px;"><input type="date" id="sisprof-data-input" style="flex:1; padding:6px; border:1px solid #cbd5e0; border-radius:4px; font-size:12px;"><button id="sisprof-btn-hoje" style="background:#38a169; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Hoje</button></div></div>' +
        '<div id="sisprof-status" style="background:#f7fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px; font-size:11px; color:#718096;">Verificando...</div>' +
        '<div style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; overflow:hidden;">' +
            '<div style="background:#f7fafc; padding:6px 8px; font-size:11px; font-weight:bold; color:#4a5568; border-bottom:1px solid #e2e8f0;">📚 Aulas do Dia</div>' +
            '<div id="sisprof-lista-turmas"></div>' +
        '</div>' +
        '<button id="sisprof-btn-preencher" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;">✅ Preencher Chamada</button>' +
        '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px; display:none;">📥 Extrair Alunos (Atualizar Banco)</button>' +
        '<button id="sisprof-btn-extrair-material" style="width:100%; background:#805ad5; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px; display:none;">📥 Extrair Material Digital (Atualizar Catálogo)</button>' +
        '<hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;">' +
        '<button id="sisprof-btn-logout" style="width:100%; background:#718096; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px;">🚪 Desconectar</button></div>';
    document.body.appendChild(div);
    if (profsisProfile && profsisProfile.nome) { const n = document.getElementById('sisprof-user-name'); if (n) n.textContent = profsisProfile.nome.split(' ')[0]; }
    document.getElementById('sisprof-fechar').onclick = function() { div.remove(); };
    document.getElementById('sisprof-minimizar').onclick = function() { const c = document.getElementById('sisprof-conteudo'); c.style.display = c.style.display === 'none' ? 'block' : 'none'; this.innerHTML = c.style.display === 'none' ? '◀' : '▶'; };
    document.getElementById('sisprof-btn-logout').onclick = function() { chrome.runtime.sendMessage({ action: 'PROFSIS_LOGOUT' }, () => { div.remove(); profsisProfile = null; profsisAppData = null; extHistory = {}; mostrarTelaStatus(); }); };
    document.getElementById('sisprof-btn-hoje').onclick = function() { const h = new Date().toISOString().split('T')[0]; document.getElementById('sisprof-data-input').value = h; currentSelectedDate = h; atualizarInterfacePorData(); };
    document.getElementById('sisprof-data-input').addEventListener('change', function() { currentSelectedDate = this.value; atualizarInterfacePorData(); });
    document.getElementById('sisprof-btn-preencher').onclick = function() {
        if (!currentSelectedDate) { alert('Selecione um dia primeiro.'); return; }
        const tipoTela = detectarTipoTelaSED();
        if (tipoTela === 'registro') { preencherRegistroNaTela(this); }
        else if (tipoTela === 'chamada') { preencherChamadaNaTela(this); }
        else { alert('Não foi possível identificar se esta é a tela de Chamada ou de Registro da SED. Abra "Lançamento de Frequências" ou "Registro de Aulas Detalhes" e tente novamente.'); }
    };
    document.getElementById('sisprof-btn-extrair').onclick = iniciarExtrairAlunos;
    document.getElementById('sisprof-btn-extrair-material').onclick = iniciarExtrairMaterialDigital;
    let observerDebounce = null, observerBusy = false;
    const observer = new MutationObserver(() => {
        if (observerBusy) return;
        if (observerDebounce) clearTimeout(observerDebounce);
        observerDebounce = setTimeout(() => {
            // .txt-titulo existe em praticamente toda tela "page-interna" da SED (Chamada, Registro,
            // etc.) - usado aqui para também reagir na tela de Registro, que não tem .card_aluno.
            if (document.querySelector('.card_aluno, .card_aluno1') || document.querySelector('.txt-titulo')) {
                observerBusy = true;
                try { atualizarInterfacePorData(); atualizarModoBotaoPreencher(); atualizarVisibilidadeBotaoMaterial(); atualizarVisibilidadeBotaoExtrairAlunos(); } catch (e) {} finally { observerBusy = false; }
            }
        }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const h = new Date().toISOString().split('T')[0];
    document.getElementById('sisprof-data-input').value = h;
    currentSelectedDate = h;
    // Mostra a agenda do dia imediatamente, em qualquer tela (não depende de entrar na chamada)
    atualizarInterfacePorData();
    atualizarModoBotaoPreencher();
    atualizarVisibilidadeBotaoMaterial();
    atualizarVisibilidadeBotaoExtrairAlunos();
}

// O botão "Extrair Material Digital" só faz sentido na tela "Registro de Aulas Detalhes" (só ela tem
// #tabsNavegacao) - fica escondido nas demais telas para não confundir com "Extrair Alunos".
function atualizarVisibilidadeBotaoMaterial() {
    const btn = document.getElementById('sisprof-btn-extrair-material');
    if (!btn) return;
    btn.style.display = (detectarTipoTelaSED() === 'registro') ? 'block' : 'none';
}

// Mesma ideia do botão de Material, espelhada: "Extrair Alunos" só faz sentido na tela de chamada
// ("Lançamento de Frequências", que tem os cards de aluno) - fica escondido nas demais telas.
function atualizarVisibilidadeBotaoExtrairAlunos() {
    const btn = document.getElementById('sisprof-btn-extrair');
    if (!btn) return;
    btn.style.display = (detectarTipoTelaSED() === 'chamada') ? 'block' : 'none';
}

// Ajusta o rótulo/ação do botão único conforme a tela da SED (Chamada ou Registro).
function atualizarModoBotaoPreencher() {
    const btn = document.getElementById('sisprof-btn-preencher');
    if (!btn) return;
    const tipo = detectarTipoTelaSED();
    if (tipo === 'registro') {
        btn.textContent = '✅ Preencher Registro';
        btn.title = 'Preenche o texto do registro de aula (conteúdo) da turma/disciplina desta tela.';
    } else {
        // Padrão "Chamada" também quando a tela ainda não foi identificada (ex: carregando).
        btn.textContent = '✅ Preencher Chamada';
        btn.title = 'Marca as faltas da turma desta tela.';
    }
}

// ==================== INTERFACE ====================

function atualizarInterfacePorData() {
    const statusEl = document.getElementById('sisprof-status');
    if (!statusEl) return;
    if (!currentSelectedDate || !extHistory[currentSelectedDate]) {
        statusEl.innerHTML = '⏳ <strong>Sem dados para esta data.</strong><br>Verifique se há chamadas no ProfSis.';
        renderizarListaTurmasDoDia();
        return;
    }
    const payload = extHistory[currentSelectedDate];
    const numFaltas = (payload.faltas && payload.faltas.length) ? payload.faltas.length : 0;
    const temRegistro = (payload.registros && payload.registros.length > 0 && payload.registros[0].conteudo) ? 'Sim' : 'Não';
    statusEl.innerHTML = '<strong>📅 ' + formatarDataBR(currentSelectedDate) + '</strong><br>🔴 Faltosos (Gestão): <strong>' + numFaltas + '</strong><br>📝 Registro: <strong>' + temRegistro + '</strong>';
    renderizarListaTurmasDoDia();
}

// Aulas que o professor tem no dia selecionado (consulta a agenda: gradeHoraria + horariosAulas),
// com checkbox para marcar como concluído.
function renderizarListaTurmasDoDia() {
    const container = document.getElementById('sisprof-lista-turmas');
    if (!container) return;
    const turmas = montarTurmasDoDia(currentSelectedDate);
    if (turmas.length === 0) {
        container.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0; font-size:12px;">Nenhuma aula para este dia.</div>';
        return;
    }
    container.innerHTML = '';
    turmas.forEach(turma => {
        const markKey = currentSelectedDate + '_turma_' + turma.id;
        const isDone = extDoneMarks[markKey] || false;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:6px 8px;';
        div.innerHTML =
            '<span style="font-size:12px; color:#2d3748; font-weight:600;">' + turma.nome + ' ' + turma.disciplina + '</span>' +
            '<input type="checkbox" class="sisprof-turma-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '>';
        container.appendChild(div);
        div.querySelector('.sisprof-turma-done-chk').addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
        });
    });
    const last = container.lastElementChild;
    if (last) last.style.borderBottom = 'none';
}

// ==================== PREENCHIMENTO ====================

function selecionarDataSED(dataStr) {
    if (!dataStr) return;
    const parts = dataStr.split('-');
    const year = parseInt(parts[0], 10); const month = parseInt(parts[1], 10) - 1; const day = parseInt(parts[2], 10);
    const monthSelect = document.querySelector('.ui-datepicker-month'); const yearSelect = document.querySelector('.ui-datepicker-year');
    let changed = false;
    if (monthSelect && monthSelect.value != month) { monthSelect.value = month; monthSelect.dispatchEvent(new Event('change', { bubbles: true })); changed = true; }
    if (yearSelect && yearSelect.value != year) { yearSelect.value = year; yearSelect.dispatchEvent(new Event('change', { bubbles: true })); changed = true; }
    const clickDay = () => { const dayCells = document.querySelectorAll('td[data-handler="selectDay"][data-month="' + month + '"][data-year="' + year + '"]'); for (const cell of dayCells) { const link = cell.querySelector('a.ui-state-default'); if (link && link.textContent.trim() == day) { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); break; } } };
    if (changed) setTimeout(clickDay, 500); else clickDay();
}


// Aciona o botão a partir da tela de "Lançamento de Frequências": seleciona a data, clica em
// Pesquisar/Buscar para carregar os alunos e então marca as faltas (e fechamento, se aplicável).
// Não mexe em nenhum campo de texto de registro - essa tela só cuida de presença.
function preencherChamadaNaTela(btn) {
    const oldText = btn.textContent; btn.textContent = '⏳ Preenchendo...'; btn.disabled = true;
    selecionarDataSED(currentSelectedDate);
    setTimeout(() => {
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
        let btnBuscar = null;
        buttons.forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar') || t.includes('listar')) btnBuscar = b; });
        if (btnBuscar) btnBuscar.click();
        setTimeout(() => {
            const payload = extHistory[currentSelectedDate];
            if (payload) executarPreenchimentoChamada(payload);
            btn.textContent = oldText; btn.disabled = false;
        }, 2500);
    }, 1000);
}

// Aciona o botão a partir da tela "Registro de Aulas Detalhes": seleciona a data no calendário da
// SED e preenche o texto do registro casado com a turma/disciplina desta tela. Não mexe em faltas.
function preencherRegistroNaTela(btn) {
    const oldText = btn.textContent; btn.textContent = '⏳ Preenchendo...'; btn.disabled = true;
    selecionarDataSED(currentSelectedDate);
    setTimeout(() => {
        const payload = extHistory[currentSelectedDate];
        if (payload) executarPreenchimentoRegistro(payload);
        else alert('Sem dados de registro para esta data.');
        btn.textContent = oldText; btn.disabled = false;
    }, 1200);
}

// Marca o checkbox "Replicar Frequência" da tela de chamada (sem id/classe própria, só identificável
// pelo texto do label irmão) - necessário em aulas dobradinhas para a frequência valer pras duas aulas.
// Retorna true só se de fato clicou (para contar como interação em executarPreenchimentoChamada).
function marcarCheckboxReplicarFrequencia() {
    const label = Array.from(document.querySelectorAll('label')).find(l => normalizeTextoSED(l.textContent) === 'replicarfrequencia');
    if (!label) return false;
    const container = label.closest('div') || label.parentElement;
    const checkbox = container ? container.querySelector('input[type="checkbox"]') : null;
    if (!checkbox || checkbox.checked) return false;
    checkbox.click();
    return true;
}

function executarPreenchimentoChamada(payload) {
    const normalize = s => s ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    let interagidos = 0;

    // Marca apenas os faltosos classificados pela gestão
    // payload.faltas agora contém apenas os faltosos da gestão que realmente faltaram
    if (payload.faltas && payload.faltas.length > 0) {
        const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
        document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]').forEach(card => {
            const nomeElement = card.querySelector('.nome_aluno');
            if (!nomeElement) return;
            let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
            const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]');
            if (!checkbox) return;
            const levouFalta = alunosAlvo.includes(nomeAluno);
            const deveEstarPresente = !levouFalta;
            if (checkbox.checked !== deveEstarPresente) { checkbox.click(); interagidos++; }
        });
    }

    // Fechamento bimestre se aplicável (tela própria, identificada pelo próprio seletor abaixo)
    if (payload.fechamento && payload.fechamento.length > 0) {
        const isFechamentoScreen = document.querySelector('.boxAulasPlanejadasRealizadas');
        if (isFechamentoScreen) {
            const alunosFechamento = payload.fechamento;
            document.querySelectorAll('.card_aluno, .card_aluno1').forEach(card => {
                const nomeElement = card.querySelector('.nome_aluno');
                if (!nomeElement) return;
                const nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
                const dadosAluno = alunosFechamento.find(a => normalize(a.nome) === nomeAluno);
                if (dadosAluno) {
                    const inputs = card.querySelectorAll('input[type="number"]');
                    const txt = card.querySelector('textarea.form-control');
                    if (inputs.length >= 4) {
                        if (dadosAluno.nota !== '') { inputs[1].value = dadosAluno.nota; inputs[1].dispatchEvent(new Event('input', {bubbles: true})); inputs[1].dispatchEvent(new Event('change', {bubbles: true})); }
                        inputs[2].value = dadosAluno.faltas; inputs[2].dispatchEvent(new Event('input', {bubbles: true})); inputs[2].dispatchEvent(new Event('change', {bubbles: true}));
                        inputs[3].value = dadosAluno.ausencias_compensadas; inputs[3].dispatchEvent(new Event('input', {bubbles: true})); inputs[3].dispatchEvent(new Event('change', {bubbles: true}));
                        interagidos++;
                    }
                    if (txt && dadosAluno.nota !== '') { txt.value = dadosAluno.justificativa; txt.dispatchEvent(new Event('input', {bubbles: true})); txt.dispatchEvent(new Event('change', {bubbles: true})); }
                }
            });
        }
    }

    // Aula dobradinha (2 aulas da mesma turma+disciplina no dia): marca "Replicar Frequência" pra
    // frequência valer nas duas. Conta como interação pra garantir o Salvar mesmo sem faltas no dia.
    const idTurmaTela = encontrarIdTurmaDaTelaAtual();
    if (idTurmaTela && contarAulasNoDia(idTurmaTela, currentSelectedDate) >= 2) {
        if (marcarCheckboxReplicarFrequencia()) interagidos++;
    }

    if (interagidos > 0) {
        setTimeout(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar');
            });
            if (btnSalvar) { btnSalvar.click(); alert('✅ Concluído! Faltas preenchidas e salvas na SED.'); }
            else alert('✅ Concluído! ⚠️ Clique em "Salvar" manualmente.');
        }, 500);
    } else alert('Nenhuma falta pendente ou tela de chamada não encontrada.');
}

// Preenche o campo de texto na tela "Registro de Aulas Detalhes". O registro certo é escolhido
// casando a Turma/Disciplina exibidas no cabeçalho da SED com os registros do ProfSis para o dia
// (ver encontrarRegistroParaTela) - importante quando o professor tem mais de uma turma no mesmo dia.
function executarPreenchimentoRegistro(payload) {
    const registro = encontrarRegistroParaTela(payload);
    if (!registro || !registro.conteudo) {
        alert('Nenhum registro (ou rascunho do Estagiário) encontrado no ProfSis para a turma/disciplina e data desta tela.');
        return;
    }

    const areas = document.querySelectorAll('textarea[name="o.Descricao"]');
    if (areas.length === 0) {
        alert('Não encontrei o campo de texto do registro nesta tela.\n\nSe a SED exigir escolher o "Horário de Aula" antes de mostrar o campo, selecione-o manualmente e clique em "Preencher Registro" de novo.');
        return;
    }
    areas.forEach(txt => {
        txt.value = registro.conteudo;
        txt.dispatchEvent(new Event('input', { bubbles: true }));
        txt.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const finalizarSalvamentoRegistro = (avisoCards) => {
        setTimeout(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('salvar') || text.includes('gravar');
            });
            const sufixoAviso = (avisoCards && avisoCards.length > 0)
                ? ('\n\n⚠️ Não encontrei na tela o(s) card(s) do Material Digital: ' + avisoCards.join(', ') + '. Marque manualmente se necessário.')
                : '';
            if (btnSalvar) { btnSalvar.click(); alert('✅ Registro preenchido e salvo na SED.' + sufixoAviso); }
            else alert('✅ Registro preenchido! ⚠️ Clique em "Salvar" manualmente.' + sufixoAviso);
        }, 400);
    };

    // Marca de volta os cards do Material Digital selecionados no ProfSis ANTES de salvar, para que o
    // clique em Salvar grave texto + cards de uma vez só.
    if (registro.cardsMaterialDigital && registro.cardsMaterialDigital.length > 0) {
        marcarCardsMaterialDigitalNaTela(registro.cardsMaterialDigital, finalizarSalvamentoRegistro);
    } else {
        finalizarSalvamentoRegistro([]);
    }
}

// Marca os cards-alvo dentro de um pane específico. Casa por TÍTULO (não pelo id salvo no registro)
// porque o mesmo card ("Aula 1 - ...") tem um id numérico DIFERENTE em cada aba/sessão do
// #tabsNavegacao, mas o catálogo de títulos é o mesmo em todas as abas. Retorna os títulos de
// cardsAlvo que foram encontrados e marcados NESTE pane.
function marcarCardsAlvoNoPane(pane, cardsAlvo) {
    const blocos = pane ? Array.from(pane.querySelectorAll(SELETOR_CARDS_MATERIAL_DIGITAL)) : [];
    const encontrados = [];
    cardsAlvo.forEach(alvo => {
        const tituloAlvo = normalizeTextoSED(alvo.titulo);
        const bloco = blocos.find(b => {
            const tituloEl = b.querySelector('label p b');
            return tituloEl && normalizeTextoSED(tituloEl.textContent) === tituloAlvo;
        });
        const checkbox = bloco ? bloco.querySelector('input[type="checkbox"]') : null;
        if (checkbox) {
            if (!checkbox.checked) checkbox.click();
            encontrados.push(alvo.titulo || alvo.id);
        }
    });
    return encontrados;
}

// Marca de volta na SED os checkboxes do "Material Digital" selecionados no ProfSis (cardsAlvo:
// [{id, titulo, codigo}], no máximo 2). Em aulas dobradinhas (2 abas em #tabsNavegacao, ex: "13ª aula" /
// "14ª aula") a SED exige pelo menos uma aula marcada em CADA aba antes de salvar - por isso navega por
// TODAS as abas (não só a ativa), reaproveitando o mesmo padrão de extrairTodasAsSessoes, marcando o(s)
// mesmo(s) card(s)-alvo em cada uma (pode repetir a mesma aula nas duas abas, o que é esperado). Ao
// final volta pra aba em que o professor estava. Só avisa no callback os títulos que não foram
// encontrados em NENHUMA aba - nunca interrompe o preenchimento por não achar um card.
function marcarCardsMaterialDigitalNaTela(cardsAlvo, callback) {
    if (!cardsAlvo || cardsAlvo.length === 0) { callback([]); return; }

    const tabs = Array.from(document.querySelectorAll('#tabsNavegacao .nav-link'));
    if (tabs.length === 0) {
        const pane = document.querySelector('.tab-content .tab-pane.show.active') || document.querySelector('.tab-content .tab-pane');
        const encontrados = marcarCardsAlvoNoPane(pane, cardsAlvo);
        callback(cardsAlvo.map(a => a.titulo || a.id).filter(t => !encontrados.includes(t)));
        return;
    }

    const indiceOriginal = tabs.findIndex(t => t.classList.contains('active'));
    const encontradosGlobal = [];
    let i = 0;

    function proximaAba() {
        if (i >= tabs.length) {
            if (indiceOriginal >= 0 && tabs[indiceOriginal]) tabs[indiceOriginal].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            setTimeout(() => {
                const naoEncontrados = cardsAlvo.map(a => a.titulo || a.id).filter(t => !encontradosGlobal.includes(t));
                callback(naoEncontrados);
            }, 300);
            return;
        }
        const tab = tabs[i];
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => {
            const pane = document.querySelector('.tab-content .tab-pane.show.active') || document.querySelector('.tab-content .tab-pane');
            marcarCardsAlvoNoPane(pane, cardsAlvo).forEach(t => { if (!encontradosGlobal.includes(t)) encontradosGlobal.push(t); });
            i++;
            proximaAba();
        }, 350);
    }
    proximaAba();
}

// ==================== EXTRAIR ALUNOS (atualiza direto no banco) ====================

const SELETOR_CARDS_ALUNO = '.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno';

// A SED é uma SPA (Blazor) que renderiza os cards de aluno aos poucos. Raspar a tela imediatamente
// ao clicar pode pegar uma lista PARCIAL (poucos cards ainda montados) - o que já fez a extensão
// marcar erroneamente a maioria da turma como "Transferido". Por isso, só considera a lista pronta
// quando a contagem de cards não mudar entre duas checagens seguidas.
function aguardarCardsEstaveis(callback, tentativas) {
    tentativas = tentativas || 0;
    const contagem1 = document.querySelectorAll(SELETOR_CARDS_ALUNO).length;
    setTimeout(() => {
        const contagem2 = document.querySelectorAll(SELETOR_CARDS_ALUNO).length;
        if (contagem2 === contagem1 || tentativas >= 6) {
            callback();
        } else {
            aguardarCardsEstaveis(callback, tentativas + 1);
        }
    }, 400);
}

function iniciarExtrairAlunos() {
    const btn = document.getElementById('sisprof-btn-extrair');
    if (btn) { btn.textContent = '⏳ Aguardando lista carregar...'; btn.disabled = true; }

    aguardarCardsEstaveis(() => {
        const cardsAlunos = document.querySelectorAll(SELETOR_CARDS_ALUNO);
        if (cardsAlunos.length === 0) {
            if (btn) { btn.textContent = '📥 Extrair Alunos (Atualizar Banco)'; btn.disabled = false; }
            return alert('Nenhum aluno encontrado na tela. Abra a tela de chamada da turma desejada primeiro!');
        }

        if (btn) btn.textContent = '⏳ Extraindo e atualizando...';

        const alunos = [];
        cardsAlunos.forEach(card => {
            const nomeElement = card.querySelector('.nome_aluno');
            if (!nomeElement) return;
            let nomeCompleto = nomeElement.textContent.trim().replace(/^\d+\s*[-.]?\s*/, '');
            alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
        });

        // Detecta a turma selecionada na SED
        let turmaSelecionada = "Desconhecida";
        const selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
        if (selectTurma && selectTurma.options[selectTurma.selectedIndex]) {
            turmaSelecionada = selectTurma.options[selectTurma.selectedIndex].text.trim();
        } else {
            document.querySelectorAll('.font-cabecalho-filtro').forEach(span => {
                if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim();
            });
        }

        console.log('[SisProf Ext] Extraindo', alunos.length, 'alunos da turma', turmaSelecionada);

        // Pede ao background para escrever direto no Firestore (ou, se não houver sessão salva, via aba do ProfSis)
        const payload = { alunos: alunos, turmaSED: turmaSelecionada, timestamp: Date.now() };
        chrome.runtime.sendMessage({ action: 'UPDATE_STUDENTS_DB', payload: payload }, (response) => {
            if (btn) { btn.textContent = '📥 Extrair Alunos (Atualizar Banco)'; btn.disabled = false; }
            if (chrome.runtime.lastError) {
                alert('⚠️ Erro de comunicação com a extensão: ' + chrome.runtime.lastError.message);
                return;
            }
            if (response && response.success) {
                const r = response.resultado;
                const via = response.direct ? 'direto no banco' : 'via aba do ProfSis';
                const detalhes = r ? ('\n\n✔️ Novos: ' + r.adicionados + ' | 🔄 Reativados: ' + r.reativados) : '';
                const d = r && r.debugInfo;
                const diagnostico = d
                    ? '\n\n🔎 Gravado em:\nConta (uid): ' + d.uid + '\nEscola (schoolId): ' + (d.schoolId || '-') +
                      '\nTexto lido na SED: "' + d.turmaSED + '"' +
                      '\nTurma local casada: "' + (d.turmaNomeLocal || '?') + '"' + (d.turmaDisciplinaLocal ? ' - ' + d.turmaDisciplinaLocal : '') +
                      '\n' + (d.masterId ? ('Documento da escola (turma vinculada), id_turma=' + d.masterId) : ('Documento pessoal do professor, id_turma=' + d.turmaId))
                    : '';
                alert('✅ ' + alunos.length + ' aluno(s) processados ' + via + '!\n\nTurma: ' + turmaSelecionada + detalhes + diagnostico);
            } else {
                alert('⚠️ Não foi possível atualizar o banco.\n' + (response ? response.error : 'Sem resposta da extensão.') + '\n\nDica: faça login no ProfSis pelo menos uma vez para a extensão salvar sua sessão.');
            }
        });
    });
}

// ==================== EXTRAIR MATERIAL DIGITAL (catálogo de aulas do currículo) ====================

const SELETOR_CARDS_MATERIAL_DIGITAL = '.selecao_grid_registro';

// A tela "Registro de Aulas Detalhes" (Blazor) monta as abas de #tabsNavegacao aos poucos, igual à
// lista de alunos - por isso espera o número de abas parar de mudar antes de navegar por elas.
function aguardarTelaRegistroEstavel(callback, tentativas) {
    tentativas = tentativas || 0;
    const contagem1 = document.querySelectorAll('#tabsNavegacao .nav-link').length;
    setTimeout(() => {
        const contagem2 = document.querySelectorAll('#tabsNavegacao .nav-link').length;
        if ((contagem2 === contagem1 && contagem2 > 0) || tentativas >= 6) {
            callback();
        } else {
            aguardarTelaRegistroEstavel(callback, tentativas + 1);
        }
    }, 400);
}

// Extrai os cards de "Material Digital" (Aula 1, Aula 2...) da aba atualmente visível. Cada card vira
// {id, horario, titulo, codigo, temTarefa} - id+horario vêm do id do checkbox (card-registro-{ID}-{HORARIO}).
function extrairCardsDaAbaAtiva() {
    const pane = document.querySelector('.tab-content .tab-pane.show.active') || document.querySelector('.tab-content .tab-pane');
    if (!pane) return [];
    const cards = [];
    pane.querySelectorAll(SELETOR_CARDS_MATERIAL_DIGITAL).forEach(bloco => {
        const checkbox = bloco.querySelector('input[type="checkbox"]');
        if (!checkbox || !checkbox.id) return;
        const m = checkbox.id.match(/^card-registro-(\d+)-(.+)$/);
        if (!m) return;
        const tituloEl = bloco.querySelector('label p b');
        const codigoEl = bloco.querySelector('label span');
        const temTarefa = /aula com tarefa/i.test(bloco.textContent || '');
        cards.push({
            id: m[1],
            horario: m[2],
            titulo: tituloEl ? tituloEl.textContent.trim() : '',
            codigo: codigoEl ? codigoEl.textContent.trim() : '',
            temTarefa: temTarefa
        });
    });
    return cards;
}

// Percorre TODAS as abas de #tabsNavegacao (o Blazor só renderiza o .tab-pane da aba ativa por vez),
// extrai os cards de cada uma e devolve o professor pra aba em que estava ao final - não altera a tela
// pra ele. Só faz sentido na tela "Registro de Aulas Detalhes" (só ela tem #tabsNavegacao).
function extrairTodasAsSessoes(callback) {
    const tabs = Array.from(document.querySelectorAll('#tabsNavegacao .nav-link'));
    if (tabs.length === 0) { callback([]); return; }

    const indiceOriginal = tabs.findIndex(t => t.classList.contains('active'));
    const sessoes = [];
    let i = 0;

    function proximaAba() {
        if (i >= tabs.length) {
            if (indiceOriginal >= 0 && tabs[indiceOriginal]) tabs[indiceOriginal].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            setTimeout(() => callback(sessoes), 300);
            return;
        }
        const tab = tabs[i];
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => {
            const cards = extrairCardsDaAbaAtiva();
            if (cards.length > 0) sessoes.push({ aba: (tab.textContent || '').trim(), cards: cards });
            i++;
            proximaAba();
        }, 350);
    }
    proximaAba();
}

// Botão "Extrair Material Digital": lê Turma/Disciplina do cabeçalho (mesmo padrão de
// encontrarRegistroParaTela/iniciarExtrairAlunos) e todos os cards de todas as abas/sessões, envia
// para o background salvar no catálogo compartilhado da escola (coleção shared_material_digital,
// agrupado por disciplina+série - visível a qualquer turma/professor da escola com essa combinação).
function iniciarExtrairMaterialDigital() {
    const btn = document.getElementById('sisprof-btn-extrair-material');
    if (btn) { btn.textContent = '⏳ Lendo abas...'; btn.disabled = true; }

    aguardarTelaRegistroEstavel(() => {
        extrairTodasAsSessoes((sessoes) => {
            if (btn) { btn.textContent = '📥 Extrair Material Digital (Atualizar Catálogo)'; btn.disabled = false; }

            if (sessoes.length === 0) {
                alert('Nenhum card de "Material Digital" encontrado nas abas desta tela.');
                return;
            }

            let turmaSelecionada = "Desconhecida";
            let disciplinaSelecionada = "";
            document.querySelectorAll('.font-cabecalho-filtro').forEach(span => {
                if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim();
                if (span.textContent.includes('Disciplina:')) disciplinaSelecionada = span.textContent.replace('Disciplina:', '').trim();
            });

            if (!disciplinaSelecionada) {
                alert('Não encontrei a Disciplina no cabeçalho desta tela - o catálogo é compartilhado por disciplina/série, então preciso dela pra salvar corretamente.');
                return;
            }

            const payload = { turmaSED: turmaSelecionada, disciplinaSED: disciplinaSelecionada, sessoes: sessoes, timestamp: Date.now() };
            chrome.runtime.sendMessage({ action: 'UPDATE_MATERIAL_DIGITAL_DB', payload: payload }, (response) => {
                if (chrome.runtime.lastError) {
                    alert('⚠️ Erro de comunicação com a extensão: ' + chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.success) {
                    const totalCards = sessoes.reduce((acc, s) => acc + s.cards.length, 0);
                    alert('✅ Catálogo atualizado! ' + sessoes.length + ' sessão(ões) e ' + totalCards + ' aula(s) do Material Digital salvas para "' + disciplinaSelecionada + '" - ' + turmaSelecionada + ' (compartilhado com a escola toda).');
                } else {
                    alert('⚠️ Não foi possível salvar o catálogo.\n' + (response ? response.error : 'Sem resposta da extensão.'));
                }
            });
        });
    });
}

// ==================== UTILITÁRIOS ====================

function formatarDataBR(dataStr) { if (!dataStr) return ''; const parts = dataStr.split('-'); return parts[2] + '/' + parts[1] + '/' + parts[0]; }

// ==================== INICIALIZAÇÃO ====================

var tentativas = 0;
var intervalo = setInterval(function() {
    if (document.body && !document.getElementById('sisprof-menu-flutuante') && !document.getElementById('sisprof-status-box')) { try { mostrarTelaStatus(); } catch(e) { console.error("Erro:", e); } }
    if (document.getElementById('sisprof-menu-flutuante') || document.getElementById('sisprof-status-box') || tentativas > 20) { clearInterval(intervalo); }
    tentativas++;
}, 2000);

setTimeout(mostrarTelaStatus, 1000);
