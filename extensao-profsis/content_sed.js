// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// v2.12.0 - "Preencher Chamada" agora seleciona sozinho o Horário de Aula (multi-select da SED,
// obrigatório antes dos cards de aluno aparecerem) casado com a grade da turma da tela, além do
// dia. Os faltosos são buscados na hora via FETCH_CHAMADA_DIRETO (documento da escola/gestão +
// documento do professor), não do cache local - antes um Faltoso podia sumir dependendo da turma
// se o professor não tivesse aberto aquela turma no ProfSis para sincronizar. A marcação de faltas
// vale só para a turma exibida na tela e segue em frente mesmo sem chamada lançada nesse dia (não
// depende de lançamento prévio) - marca falta pros faltosos e presença pro resto, e lança do
// mesmo jeito. Ao clicar em Salvar na Chamada, a turma do dia é marcada como "Lançado" automaticamente.
// "Preencher Registro" também seleciona sozinho o Bimestre e o Horário de Aula (mesmo multi-select
// da Chamada) antes de preencher, e busca o conteúdo do registro direto no Firestore
// (FETCH_REGISTRO_DIRETO), não do cache local, para nunca preencher um texto desatualizado.

    console.log("🤖 content_sed.js EXECUTADO - v2.12.0");

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
    
    return { data: dataStr, faltas: alunosFaltantesNomes, registros: construirRegistrosDoDia(profsisAppData, dataStr), fechamento: [] };
}

// Mantém id_turma/turmaNome/disciplina em cada registro (em vez de só o texto) para dar para casar
// com a turma/disciplina exibida na tela "Registro de Aulas Detalhes" da SED - sem isso, um
// professor com mais de uma turma no mesmo dia sempre pegaria o registro errado (o primeiro da
// lista) ao preencher o Registro de uma turma que não é a primeira.
// Recebe `appData` como parâmetro (em vez de ler profsisAppData direto) para poder ser usada tanto
// com o cache local quanto com dados buscados na hora direto do Firestore (ver preencherRegistroNaTela).
function construirRegistrosDoDia(appData, dataStr) {
    const registrosAula = appData.registrosAula || [];
    const turmasProfsis = appData.turmas || [];
    return registrosAula
        .filter(r => r.data === dataStr)
        .map(r => {
            const turma = turmasProfsis.find(t => t.id == r.id_turma);
            return { conteudo: r.conteudo, id_turma: r.id_turma, turmaNome: turma ? turma.nome : null, disciplina: turma ? turma.disciplina : null };
        });
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

// Horários (início/fim) que a turma tem na grade em um dia específico - usado para casar com as
// opções do "Horário de Aula" da SED, tanto na tela de Chamada quanto na de Registro de Aulas (é o
// mesmo widget ".input-aula-hora" nas duas). Mesma fonte de dados/regra do montarTurmasDoDia, mas
// filtrada para uma única turma (pode haver mais de um bloco no dia, ex: aula geminada).
function obterBlocosDaTurmaNoDia(turmaId, dataStr) {
    if (!turmaId || !dataStr) return [];
    const gradeEscola = profsisAppData.schoolGrade || [];
    const excecoesGrade = profsisAppData.schoolExceptions || [];
    const minhasAulas = profsisAppData.horariosAulas || [];
    const diaSemana = new Date(dataStr + 'T12:00:00').getDay();
    const excecaoDoDia = excecoesGrade.find(e => e.data === dataStr);
    const blocosDoDia = excecaoDoDia
        ? (excecaoDoDia.blocos || [])
        : gradeEscola.filter(g => g.diaSemana == diaSemana);
    return blocosDoDia
        .filter(bloco => {
            const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
            return aula && aula.tipo === 'aula' && aula.id_turma == turmaId;
        })
        .map(bloco => ({ inicio: bloco.inicio, fim: bloco.fim }));
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

// Lê a Turma/Disciplina exibidas no cabeçalho da tela atual da SED (Chamada e Registro usam o
// mesmo padrão de cabeçalho) e acha a turma correspondente no ProfSis - usado tanto para casar o
// Registro certo quanto para saber de qual turma marcar os faltosos e qual horário selecionar.
function obterTurmaDaTelaSED() {
    const turmasProfsis = profsisAppData.turmas || [];
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
        candidatos = turmasProfsis.filter(t => extrairCodigoSerieTurmaSED((t.nome || '').split('-')[0]) === codigoSED);
    }
    if (candidatos.length === 0) {
        const normTurmaSED = normalizeTextoSED(turmaSED);
        candidatos = turmasProfsis.filter(t => normalizeTextoSED((t.nome || '').split('-')[0]) === normTurmaSED);
    }
    if (candidatos.length > 1 && disciplinaSED) {
        const normDiscSED = normalizeTextoSED(disciplinaSED);
        const porDisciplina = candidatos.filter(t => normalizeTextoSED(t.disciplina) === normDiscSED);
        if (porDisciplina.length > 0) candidatos = porDisciplina;
    }
    return candidatos.length > 0 ? candidatos[0] : null;
}

// Acha, dentro dos registros do dia, o que pertence à turma+disciplina exibida no cabeçalho.
function encontrarRegistroParaTela(payload) {
    if (!payload || !payload.registros || payload.registros.length === 0) return null;
    if (payload.registros.length === 1) return payload.registros[0];

    const turma = obterTurmaDaTelaSED();
    if (!turma) return null;
    const candidatos = payload.registros.filter(r => r.id_turma == turma.id);
    return candidatos.length > 0 ? candidatos[0] : null;
}

// ==================== MENU FLUTUANTE ====================

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    if (!document.body) { setTimeout(injetarMenu, 500); return; }
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:350px; background:white; border:3px solid #38a169; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5); max-height:90vh; overflow-y:auto;';
    div.innerHTML = '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🤖 SisProf <span style="font-size:10px; opacity:0.7;">v2.12.0</span></span>' +
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
        '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">📥 Extrair Alunos (Atualizar Banco)</button>' +
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
    let observerDebounce = null, observerBusy = false;
    const observer = new MutationObserver(() => {
        if (observerBusy) return;
        if (observerDebounce) clearTimeout(observerDebounce);
        observerDebounce = setTimeout(() => {
            // .txt-titulo existe em praticamente toda tela "page-interna" da SED (Chamada, Registro,
            // etc.) - usado aqui para também reagir na tela de Registro, que não tem .card_aluno.
            if (document.querySelector('.card_aluno, .card_aluno1') || document.querySelector('.txt-titulo')) {
                observerBusy = true;
                try { atualizarInterfacePorData(); atualizarModoBotaoPreencher(); } catch (e) {} finally { observerBusy = false; }
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


// Casa os horários da grade da turma (obterBlocosDaTurmaNoDia) com as opções do "Horário de Aula"
// da SED - um multi-select próprio (não é um <select> comum), presente tanto na Chamada (onde é
// obrigatório pros cards de aluno com o checkbox de falta/presença aparecerem) quanto no Registro
// de Aulas (onde é obrigatório pro campo de texto aparecer). Os itens do menu ficam sempre no DOM
// (só ficam visíveis quando o usuário abre o combo), então clicá-los funciona mesmo sem abrir o
// combo; só clicamos em ".multi-select-button" se ainda não achamos nenhum item (caso a SED só
// monte o menu no primeiro clique).
function selecionarHorarioSED(blocos, callback, tentativas) {
    tentativas = tentativas || 0;
    const checkboxes = document.querySelectorAll('.input-aula-hora .multi-select-menuitem input[type="checkbox"]');
    if (checkboxes.length === 0) {
        if (tentativas >= 5) { callback(); return; }
        const btnAbrir = document.querySelector('.input-aula-hora .multi-select-button');
        if (btnAbrir) btnAbrir.click();
        setTimeout(() => selecionarHorarioSED(blocos, callback, tentativas + 1), 300);
        return;
    }

    const normHora = s => (s || '').replace(/\s+/g, ' ').trim();
    const alvos = blocos.map(b => normHora(b.inicio + ' às ' + b.fim));
    let algumMarcado = false;
    checkboxes.forEach(chk => {
        const bate = alvos.includes(normHora(chk.value));
        if (bate) { algumMarcado = true; if (!chk.checked) chk.click(); }
        else if (blocos.length > 0 && chk.checked) { chk.click(); }
    });
    // Não achamos o horário da grade dessa turma (grade não cadastrada, exceção do dia, etc.) -
    // se só existe uma opção na tela, marca ela mesmo assim para não travar o preenchimento por
    // falta de horário selecionado.
    if (!algumMarcado && blocos.length === 0 && checkboxes.length === 1 && !checkboxes[0].checked) {
        checkboxes[0].click();
    }
    setTimeout(callback, 500);
}

// Bimestre (1 a 4) cujo período (configBimestres, cadastrado pela gestão) cobre a data selecionada
// - usado para marcar o <select name="Model.NumeroBimestre"> da tela de Registro de Aulas.
function obterBimestreDoDia(dataStr) {
    if (!dataStr) return null;
    const configBimestres = profsisAppData.configBimestres || [];
    const config = configBimestres.find(c => c.inicio && c.fim && dataStr >= c.inicio && dataStr <= c.fim);
    return config ? config.bim : null;
}

// Seleciona o Bimestre na tela "Registro de Aulas Detalhes" (select comum, ao contrário do
// Horário de Aula). Sem bimestre calculado ou sem a opção correspondente no <select>, não mexe em
// nada - o professor decide manualmente nesse caso, em vez de arriscar gravar no bimestre errado.
function selecionarBimestreSED(bimestre, callback) {
    const select = document.querySelector('select[name="Model.NumeroBimestre"]');
    if (!select || !bimestre) { callback(); return; }
    const valorAlvo = String(bimestre);
    const temOpcao = Array.from(select.options).some(o => o.value === valorAlvo);
    if (temOpcao && select.value !== valorAlvo) {
        select.value = valorAlvo;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setTimeout(callback, 400);
}

// Espera os cards de aluno da Chamada terminarem de renderizar com o checkbox de falta/presença
// (só aparece depois do Horário de Aula ser selecionado). Desiste depois de ~3s e segue em frente
// de qualquer forma - o preenchimento não deve travar só porque a SED demorou ou não tem nenhuma
// chamada lançada ainda para esse dia/horário.
function aguardarChamadaRenderizada(callback, tentativas) {
    tentativas = tentativas || 0;
    const temCard = document.querySelector('.card_aluno1 input[type="checkbox"], .card_aluno input[type="checkbox"], .grid-listagem > div[class*="card_aluno"] input[type="checkbox"]');
    if (temCard || tentativas >= 8) { callback(); return; }
    setTimeout(() => aguardarChamadaRenderizada(callback, tentativas + 1), 400);
}

// Mesma ideia da anterior, mas para o campo de texto do Registro de Aulas, que só aparece depois
// de Bimestre + Horário de Aula selecionados.
function aguardarCampoRegistroRenderizado(callback, tentativas) {
    tentativas = tentativas || 0;
    const temCampo = document.querySelector('textarea[name="o.Descricao"]');
    if (temCampo || tentativas >= 8) { callback(); return; }
    setTimeout(() => aguardarCampoRegistroRenderizado(callback, tentativas + 1), 400);
}

// Aciona o botão a partir da tela de "Lançamento de Frequências": seleciona a data e o Horário de
// Aula (casado com a grade da turma exibida na tela) e então marca as faltas. Continua mesmo que a
// SED ainda não tenha nenhuma chamada lançada nesse dia/horário - o objetivo é justamente lançar.
// Não mexe em nenhum campo de texto de registro - essa tela só cuida de presença.
function preencherChamadaNaTela(btn) {
    const oldText = btn.textContent; btn.textContent = '⏳ Buscando faltosos no banco...'; btn.disabled = true;
    selecionarDataSED(currentSelectedDate);
    chrome.runtime.sendMessage({ action: 'FETCH_CHAMADA_DIRETO' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
            const erro = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response && response.error);
            alert('⚠️ Não foi possível buscar os faltosos no banco' + (erro ? (': ' + erro) : '') + '.\n\nFaça login no ProfSis pelo menos uma vez para a extensão salvar sua sessão.');
            btn.textContent = oldText; btn.disabled = false;
            return;
        }
        btn.textContent = '⏳ Preenchendo...';
        setTimeout(() => {
            // Compatibilidade com telas antigas da SED que exigiam clicar em Pesquisar/Buscar antes
            // de listar os alunos (a tela atual já lista direto após escolher data + horário).
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let btnBuscar = null;
            buttons.forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar') || t.includes('listar')) btnBuscar = b; });
            if (btnBuscar) btnBuscar.click();

            const turma = obterTurmaDaTelaSED();
            const turmasParaFaltas = (response.dados.turmas && response.dados.turmas.length) ? response.dados.turmas : (profsisAppData.turmas || []);
            const blocos = turma ? obterBlocosDaTurmaNoDia(turma.id, currentSelectedDate) : [];
            const faltas = construirFaltasDoDia(response.dados, currentSelectedDate, turmasParaFaltas);
            selecionarHorarioSED(blocos, () => {
                aguardarChamadaRenderizada(() => {
                    const historico = extHistory[currentSelectedDate];
                    const payload = { faltas: faltas, fechamento: (historico && historico.fechamento) || [] };
                    executarPreenchimentoChamada(payload, turma ? turma.id : null);
                    btn.textContent = oldText; btn.disabled = false;
                });
            });
        }, 800);
    });
}

// Monta a lista de faltosos do dia cruzando (1) os alunos classificados como "Faltoso" pela
// GESTÃO no documento da escola (turmas vinculadas via masterId - a fonte de verdade, buscada ao
// vivo em FETCH_CHAMADA_DIRETO) com (2) os classificados no próprio documento do professor (turmas
// sem vínculo com a gestão), e só marca falta de fato se: não houve chamada registrada nesse dia
// para o aluno (continua/lança mesmo assim) OU a chamada registrada já é "falta". Aluno presente
// numa chamada existente nunca entra na lista.
function construirFaltasDoDia(dados, dataStr, turmasLocais) {
    const presencas = dados.presencas || [];
    const faltantes = [];

    const avaliarEIncluir = (est, idTurmaLocal) => {
        if (!est || (est.status && est.status !== 'Ativo')) return;
        const presencaDoDia = presencas.find(p => p.id_estudante == est.id && p.data === dataStr);
        if (!presencaDoDia || presencaDoDia.status === 'falta') {
            faltantes.push({ nome: est.nome_completo, id_turma: idTurmaLocal, id_estudante: est.id });
        }
    };

    // Turmas vinculadas à gestão: usa o "Faltoso" e os alunos do documento da escola direto,
    // casando pela masterId - não depende do professor ter aberto essa turma no ProfSis para
    // sincronizar localmente (era a causa de faltosos sumirem dependendo da turma).
    if (dados.estudantesGestor && dados.registrosAdministrativosGestor) {
        dados.registrosAdministrativosGestor
            .filter(r => r.tipo === 'Faltoso')
            .forEach(reg => {
                const est = dados.estudantesGestor.find(e => e.id == reg.estudanteId);
                if (!est) return;
                const turmaLocal = turmasLocais.find(t => t.masterId == est.id_turma);
                if (!turmaLocal) return; // faltoso de uma turma que este professor não leciona
                avaliarEIncluir(est, turmaLocal.id);
            });
    }

    // Turmas sem vínculo com a gestão: usa o "Faltoso" cadastrado no próprio documento do
    // professor (também serve de fallback caso o documento da escola não tenha sido lido).
    (dados.registrosAdministrativosProfessor || [])
        .filter(r => r.tipo === 'Faltoso')
        .forEach(reg => {
            const est = (dados.estudantesProfessor || []).find(e => e.id == reg.estudanteId);
            if (!est) return;
            avaliarEIncluir(est, est.id_turma);
        });

    return faltantes;
}

// Aciona o botão a partir da tela "Registro de Aulas Detalhes": seleciona Data, Bimestre e Horário
// de Aula (casado com a grade da turma exibida na tela) e só então preenche o texto do registro.
// Não mexe em faltas. O conteúdo do registro é buscado direto no Firestore (FETCH_REGISTRO_DIRETO
// no background), e não do cache local (profsisAppData) - evita preencher um texto desatualizado
// quando o professor edita/cria o registro no ProfSis sem reabrir/ressincronizar a aba antes de vir
// preencher na SED.
function preencherRegistroNaTela(btn) {
    const oldText = btn.textContent; btn.textContent = '⏳ Buscando registro no Firebase...'; btn.disabled = true;
    selecionarDataSED(currentSelectedDate);
    chrome.runtime.sendMessage({ action: 'FETCH_REGISTRO_DIRETO' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
            const erro = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response && response.error);
            alert('⚠️ Não foi possível buscar o registro no Firebase' + (erro ? (': ' + erro) : '') + '.\n\nFaça login no ProfSis pelo menos uma vez para a extensão salvar sua sessão.');
            btn.textContent = oldText; btn.disabled = false;
            return;
        }
        btn.textContent = '⏳ Preenchendo...';
        setTimeout(() => {
            const turma = obterTurmaDaTelaSED();
            const blocos = turma ? obterBlocosDaTurmaNoDia(turma.id, currentSelectedDate) : [];
            const bimestre = obterBimestreDoDia(currentSelectedDate);
            selecionarBimestreSED(bimestre, () => {
                selecionarHorarioSED(blocos, () => {
                    aguardarCampoRegistroRenderizado(() => {
                        const payload = { registros: construirRegistrosDoDia(response.dados, currentSelectedDate) };
                        executarPreenchimentoRegistro(payload);
                        btn.textContent = oldText; btn.disabled = false;
                    });
                });
            });
        }, 1200);
    });
}

// turmaId (opcional) restringe as faltas à turma exibida na tela - importante quando o professor
// tem faltosos classificados pela gestão em mais de uma turma no mesmo dia. Quando não é possível
// identificar a turma da tela, cai para todos os faltosos do dia (continua mesmo assim).
function executarPreenchimentoChamada(payload, turmaId) {
    const normalize = s => s ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
    let interagidos = 0;

    // Marca apenas os faltosos classificados pela gestão para a turma desta tela. Roda mesmo
    // quando não há nenhum faltoso (ou nenhuma chamada anterior) - nesse caso todo mundo fica
    // marcado como presente, mas a chamada é lançada do mesmo jeito.
    {
        const faltasDaTurma = turmaId ? (payload.faltas || []).filter(a => a.id_turma == turmaId) : (payload.faltas || []);
        const alunosAlvo = faltasDaTurma.map(a => normalize(a.nome));
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

    if (interagidos > 0) {
        setTimeout(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar');
            });
            if (btnSalvar) {
                btnSalvar.click();
                marcarTurmaComoFeita(turmaId);
                alert('✅ Concluído! Faltas preenchidas e salvas na SED.');
            } else alert('✅ Concluído! ⚠️ Clique em "Salvar" manualmente.');
        }, 500);
    } else alert('Nenhuma falta pendente ou tela de chamada não encontrada.');
}

// Marca a turma do dia selecionado como "Lançado" na lista "Aulas do Dia" (mesmo checkbox que o
// usuário marcaria manualmente) - só roda depois do clique em "Salvar" da SED, confirmando que a
// chamada dessa turma foi mesmo enviada.
function marcarTurmaComoFeita(turmaId) {
    if (!turmaId || !currentSelectedDate) return;
    const key = currentSelectedDate + '_turma_' + turmaId;
    extDoneMarks[key] = true;
    chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
    renderizarListaTurmasDoDia();
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

    setTimeout(() => {
        const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
            const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
            return text.includes('salvar') || text.includes('gravar');
        });
        if (btnSalvar) { btnSalvar.click(); alert('✅ Registro preenchido e salvo na SED.'); }
        else alert('✅ Registro preenchido! ⚠️ Clique em "Salvar" manualmente.');
    }, 400);
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
