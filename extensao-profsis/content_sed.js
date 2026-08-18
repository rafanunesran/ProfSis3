// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// MODO ASSISTENTE (somente consulta) - v4.0
//
// Esta versão foi convertida do antigo "Robô" (que preenchia Chamada/Registro e extraía
// alunos/material automaticamente na SED) para um "Assistente" de consulta. Ele NÃO edita, NÃO
// salva e NÃO extrai nada na Sala do Futuro. Ele apenas:
//   - identifica as aulas do dia do professor (mesma agenda de antes, vinda do ProfSis);
//   - ao clicar numa turma, MOSTRA a lista de estudantes classificados como faltosos (só leitura);
//   - na tela de "Registro de Aulas Detalhes", MOSTRA o conteúdo já salvo no ProfSis para o
//     professor COPIAR e COLAR manualmente no registro da SED;
//   - na tela de "Lançamento de Frequências" (chamada), mostra automaticamente os faltosos da
//     turma aberta - também só leitura, sem marcar nem salvar nada.
//
// Todo o preenchimento/extração/automação da versão anterior ("Auto"/workflow, "Preencher
// Chamada", "Preencher Registro", "Extrair Alunos", "Extrair Material Digital") foi REMOVIDO.
// A versão anterior (com automações) está preservada em backup-robo-sis/ na raiz do repositório.

    console.log("🧑‍🏫 content_sed.js (Assistente - consulta) EXECUTADO - v" + chrome.runtime.getManifest().version);

// ==================== VARIÁVEIS GLOBAIS ====================
let extHistory = {};
// Payloads calculados e EMPURRADOS pelo app.js (dados frescos em memória, sempre com os faltosos da
// gestão) e salvos em rpa_data_history. O assistente PREFERE as faltas daqui às que ele mesmo
// recalcula do localStorage (mais confiável). Ver obterPayloadDaData.
let extPushedHistory = {};
let extDoneMarks = {};
let currentSelectedDate = "";
let profsisProfile = null;
let profsisAppData = null;

// ==================== TELA DE STATUS (sem formulário de login) ====================

function mostrarTelaStatus() {
    const oldMenu = document.getElementById('sisprof-menu-flutuante');
    if (oldMenu) oldMenu.remove();
    // Remove também a bolinha do minimizado, pra não ficar órfã (o painel que ela abre foi removido).
    const oldBolinha = document.getElementById('sisprof-bolinha');
    if (oldBolinha) oldBolinha.remove();
    if (document.getElementById('sisprof-status-box')) return;
    if (!document.body) { setTimeout(mostrarTelaStatus, 500); return; }

    console.log("🔍 Verificando status do ProfSis...");

    const div = document.createElement('div');
    div.id = 'sisprof-status-box';
    div.style.cssText = 'position:fixed; top:12px; right:12px; width:min(340px, calc(100vw - 24px)); max-width:calc(100vw - 24px); max-height:88vh; max-height:88dvh; overflow-y:auto; box-sizing:border-box; background:white; border:3px solid #3182ce; border-radius:10px; z-index:2147483000; padding:18px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5);';
    div.innerHTML =
        '<div style="background:#3182ce; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; text-align:center;">' +
            '🧑‍🏫 Assistente SisProf <span style="font-size:10px; opacity:0.7;">v' + chrome.runtime.getManifest().version + '</span>' +
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
        if (!chrome.runtime.lastError && data) {
            extDoneMarks = data.rpa_done_marks || {};
            extPushedHistory = data.rpa_data_history || {};
        }
        injetarMenu();
    });
    // Mantém os dados sempre frescos enquanto a tela da SED está aberta: além das faltas empurradas
    // pelo app.js (rpa_data_history), renova o profsisAppData inteiro (estudantes, faltosos da gestão,
    // baixa frequência) - sem isso, a lista de alunos em alerta mostrava um retrato do momento em que a
    // página abriu, ficando desatualizada quando a gestão/ProfSis mudava os dados depois.
    setInterval(() => {
        chrome.runtime.sendMessage({ action: 'GET_DATA' }, (data) => {
            if (!chrome.runtime.lastError && data && data.rpa_data_history) {
                extPushedHistory = data.rpa_data_history;
            }
        });
        atualizarDadosProfsisFresco();
    }, 4000);
}

// Guarda uma "assinatura" dos dados que a lista de alunos em alerta usa, pra só re-renderizar quando
// algo relevante mudar (evita piscar a tela a cada 4s à toa).
let ultimaAssinaturaDados = "";
function assinaturaDados(d) {
    if (!d) return "";
    try {
        return JSON.stringify([
            (d.estudantes || []).map(e => [e.id, e.id_turma, e.status]),
            (d.registrosAdministrativos || []).filter(r => r && r.tipo === 'Faltoso' && !r.arquivado).map(r => [r.estudanteId, r.nomeEstudante, r.turmaId]),
            (d.baixaFrequencia || []).map(b => [b.id, b.nome]),
            (d.turmas || []).map(t => [t.id, t.nome, t.disciplina]),
            d.lancamentosConcluidos || {}
        ]);
    } catch (e) { return String((d.estudantes || []).length) + '/' + String((d.registrosAdministrativos || []).length); }
}

// Puxa a versão MAIS RECENTE dos dados do ProfSis e, se algo mudou, atualiza profsisAppData e
// re-renderiza. Também cutuca o ProfSis (REQUEST_PROFSIS_DATA) pra ele reenviar dados frescos ao
// storage quando houver uma aba/WebView do ProfSis aberta.
function atualizarDadosProfsisFresco() {
    chrome.runtime.sendMessage({ action: 'REQUEST_PROFSIS_DATA' }, () => { void chrome.runtime.lastError; });
    chrome.runtime.sendMessage({ action: 'CHECK_PROFSIS_LOGIN' }, (resp) => {
        if (chrome.runtime.lastError) return;
        if (!resp || !resp.loggedIn || !resp.appData) return;
        const sig = assinaturaDados(resp.appData);
        if (sig === ultimaAssinaturaDados) return; // nada mudou
        ultimaAssinaturaDados = sig;
        profsisAppData = resp.appData;
        montarHistoricoLocal();
        atualizarInterfacePorData();
        atualizarPaineisSED();
        // Se um painel de alunos em alerta estiver aberto (clique manual numa turma), re-renderiza
        // com os dados novos. O caso da tela de Chamada já é coberto por atualizarPaineisSED acima.
        if (detalheTurmaId != null && detectarTipoTelaSED() !== 'chamada') {
            const turma = turmaPorId(detalheTurmaId);
            renderPainelDestacados(detalheTurmaId, turma ? (turma.nome + ' ' + (turma.disciplina || '')) : detalheTurmaTitulo);
        }
    });
}

// Payload usado para exibir uma data: prefere as FALTAS empurradas pelo app.js (dados frescos,
// sempre com os faltosos da gestão) e mantém o resto (registros/fechamento) do cálculo local.
function obterPayloadDaData(dataStr) {
    const local = extHistory[dataStr];
    const pushed = extPushedHistory[dataStr];
    if (!local && !pushed) return null;
    const base = local || { data: dataStr, faltas: [], registros: [], fechamento: [] };
    if (pushed && Array.isArray(pushed.faltas)) {
        return { ...base, faltas: pushed.faltas };
    }
    return base;
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

// Normaliza nome para casar faltoso (base local do professor x nome enviado pela gestão): sem
// acentos, espaços colapsados, maiúsculas. Mesmo critério do casamento de alunos do resto do robô.
function normalizeNomeFaltoso(s) {
    return s ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
}

// ===== Casamento de nome ProfSis x card da SED =====
// Quebra o nome em TOKENS significativos (sem acento, sem número/pontuação, sem conectores
// da/de/do...) e casa por CONTENÇÃO: o conjunto menor de tokens deve caber no maior.
const NOME_STOPWORDS = new Set(['DA','DE','DO','DAS','DOS','DI','DU','E']);
function tokensNome(s) {
    return normalizeNomeFaltoso(s)
        .replace(/[^A-Z\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1 && !NOME_STOPWORDS.has(t));
}
function nomesCasamPorToken(setA, setB) {
    if (!setA || !setB || setA.size === 0 || setB.size === 0) return false;
    const [menor, maior] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    if (menor.size < 2) {
        if (setA.size !== setB.size) return false;
        for (const t of setA) if (!setB.has(t)) return false;
        return true;
    }
    for (const t of menor) if (!maior.has(t)) return false;
    return true;
}

function montarPayloadPorData(dataStr) {
    const presencas = (profsisAppData.presencas || []);
    const estudantes = (profsisAppData.estudantes || []);
    const registrosAula = (profsisAppData.registrosAula || []);
    const registrosAdmin = (profsisAppData.registrosAdministrativos || []);

    // FALTOSOS: apenas alunos classificados como "Faltoso" pela gestão
    // A classificação vem de registrosAdministrativos onde tipo === 'Faltoso'
    // (registros arquivados pela gestão são ignorados)
    const faltososGestao = registrosAdmin.filter(r => r.tipo === 'Faltoso' && !r.arquivado);
    let alunosFaltantesNomes = [];

    faltososGestao.forEach(reg => {
        // Casa o faltoso na base local do professor por ID e, como FALLBACK, por NOME.
        let est = estudantes.find(e => e.id == reg.estudanteId);
        if (!est && reg.nomeEstudante) {
            const alvo = normalizeNomeFaltoso(reg.nomeEstudante);
            est = estudantes.find(e => normalizeNomeFaltoso(e.nome_completo) === alvo);
        }

        if (!est) {
            // Sem o aluno na base local (nem por id nem por nome), mas a gestão mandou o nome.
            if (reg.nomeEstudante) alunosFaltantesNomes.push({ nome: reg.nomeEstudante, id_turma: reg.turmaId || null });
            return;
        }
        // Apenas alunos ativos
        if (est.status && est.status !== 'Ativo') return;

        // Verifica se houve chamada neste dia para este aluno. Só fica presente (não aparece como
        // faltoso) se houver presença registrada; sem registro de falta -> falta (padrão do faltoso).
        const presencaDoDia = presencas.find(p => p.id_estudante == est.id && p.data === dataStr);
        if (!presencaDoDia || presencaDoDia.status === 'falta') {
            alunosFaltantesNomes.push({ nome: est.nome_completo, id_turma: est.id_turma, id_estudante: est.id });
        }
    });

    const registrosNoDia = registrosAula.filter(r => r.data === dataStr);
    const turmasProfsis = profsisAppData.turmas || [];

    // Mantém id_turma/turmaNome/disciplina em cada registro para dar para casar com a turma/disciplina
    // exibida na tela "Registro de Aulas Detalhes" da SED (professor com várias turmas no mesmo dia).
    const registros = registrosNoDia.map(r => {
        const turma = turmasProfsis.find(t => t.id == r.id_turma);
        return { conteudo: r.conteudo, id_turma: r.id_turma, turmaNome: turma ? turma.nome : null, disciplina: turma ? turma.disciplina : null };
    });

    return { data: dataStr, faltas: alunosFaltantesNomes, registros: registros, fechamento: [] };
}

// Turmas que o professor tem no dia — mesma lógica do card "Agenda do Dia" do dashboard do ProfSis
// (app.js renderDashboard): grade da escola + exceções do dia, cruzadas com horariosAulas do professor.
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

// ==================== DETECÇÃO DE TELA (CHAMADA x REGISTRO) ====================
// A SED usa a mesma extensão em duas telas: "Lançamento de Frequências" (chamada) e "Registro de
// Aulas Detalhes" (conteúdo da aula). O título em .txt-titulo é o jeito mais estável de saber onde
// estamos (a URL da SPA Blazor não muda de forma confiável entre elas).
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

// Palavras curtas a ignorar ao montar as iniciais de uma disciplina com várias palavras
// (ex.: "Esporte Musica e Arte" -> iniciais "EMA", ignorando o "e" do meio).
const STOPWORDS_INICIAIS_DISCIPLINA = ['e', 'de', 'da', 'do', 'das', 'dos', 'em'];

// Formas curtas/coloquiais de disciplina que professores digitam no ProfSis e que não batem nem por
// igualdade exata nem pelas iniciais (ex.: "Tec" pra "Tecnologia e Inovação").
const ABREVIACOES_DISCIPLINA = { 'tec': 'tecnologiaeinovacao' };

function expandirAbreviacaoDisciplina(nomeNormalizado) {
    return ABREVIACOES_DISCIPLINA[nomeNormalizado] || nomeNormalizado;
}

function iniciaisDisciplina(nome) {
    return (nome || '')
        .split(/[\s\-\/]+/)
        .map(p => p.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, ''))
        .filter(p => p && !STOPWORDS_INICIAIS_DISCIPLINA.includes(p.toLowerCase()))
        .map(p => p[0].toUpperCase())
        .join('');
}

// Compara dois nomes de disciplina "por proximidade" - iguais normalizados OU um dos dois é a
// sigla/iniciais do outro (ex.: "EMA" <-> "Esporte-Musica-Arte", "TI" <-> "Tecnologia e Inovação").
function disciplinasCasam(nomeA, nomeB) {
    if (!nomeA || !nomeB) return false;
    const normA = expandirAbreviacaoDisciplina(normalizeTextoSED(nomeA));
    const normB = expandirAbreviacaoDisciplina(normalizeTextoSED(nomeB));
    if (normA === normB) return true;
    const inicialA = normalizeTextoSED(iniciaisDisciplina(nomeA));
    const inicialB = normalizeTextoSED(iniciaisDisciplina(nomeB));
    return (!!inicialA && inicialA === normB) || (!!inicialB && inicialB === normA);
}

// Código série+letra (ex: "8C") a partir do nome da turma - usado pra casar a turma da tela da SED
// com a turma do ProfSis.
function extrairCodigoSerieTurmaSED(nome) {
    if (!nome) return null;
    const m = nome.match(/(\d+)\s*[º°o]?\.?\s*(?:ano|s[ée]rie)?\s*\.?\s*([A-Za-zÀ-ú])\b/i);
    if (!m) return null;
    return (m[1] + m[2]).toUpperCase();
}

// Lê a Turma/Disciplina exibidas no cabeçalho da tela atual da SED e acha, dentro dos registros do
// dia, o que pertence a essa turma+disciplina (importante quando o professor tem várias turmas no dia).
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
        const porDisciplina = candidatos.filter(r => disciplinasCasam(r.disciplina, disciplinaSED));
        if (porDisciplina.length > 0) candidatos = porDisciplina;
    }
    return candidatos.length > 0 ? candidatos[0] : null;
}

// Lê a Turma/Disciplina do cabeçalho da tela atual e acha o id da turma correspondente em
// profsisAppData.turmas - usado para mostrar automaticamente os faltosos da turma aberta na chamada.
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
        const porDisciplina = candidatos.filter(t => disciplinasCasam(t.disciplina, disciplinaSED));
        if (porDisciplina.length > 0) candidatos = porDisciplina;
    }
    return candidatos.length > 0 ? candidatos[0].id : null;
}

// ==================== MENU FLUTUANTE ====================

// Estado "minimizado" persistido (localStorage do domínio da SED), pra sobreviver às reinjeções do
// menu quando a página da Sala do Futuro atualiza/renavega.
const SISPROF_MENU_MIN_KEY = 'sisprof_menu_minimizado';
// Tela pequena (app no celular / janela estreita): o painel a 350px cobriria quase tudo, então o
// tratamento é diferente (começa minimizado por padrão, ver sisprofMenuEstaMinimizado).
function telaPequena() {
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    return w > 0 && w <= 600;
}
function sisprofMenuEstaMinimizado() {
    try {
        const v = localStorage.getItem(SISPROF_MENU_MIN_KEY);
        if (v === '1') return true;
        if (v === '0') return false;
        // Sem preferência salva ainda: em telas pequenas começa minimizado (bolinha), pra não cobrir a
        // tela inteira da SED; no desktop começa aberto, como antes. Assim que o professor abrir ou
        // minimizar manualmente, a escolha vira preferência salva ('0'/'1') e passa a ser respeitada.
        return telaPequena();
    } catch (e) { return false; }
}
function aplicarEstadoMenuMinimizado(minimizado) {
    const painel = document.getElementById('sisprof-menu-flutuante');
    const bolinha = document.getElementById('sisprof-bolinha');
    if (painel) painel.style.display = minimizado ? 'none' : 'block';
    if (bolinha) bolinha.style.display = minimizado ? 'flex' : 'none';
    try { localStorage.setItem(SISPROF_MENU_MIN_KEY, minimizado ? '1' : '0'); } catch (e) {}
}

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    if (!document.body) { setTimeout(injetarMenu, 500); return; }
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:12px; right:12px; width:min(350px, calc(100vw - 24px)); max-width:calc(100vw - 24px); box-sizing:border-box; background:white; border:3px solid #38a169; border-radius:10px; z-index:2147483000; padding:18px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5); max-height:88vh; max-height:88dvh; overflow-y:auto;';
    div.innerHTML = '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🧑‍🏫 Assistente SisProf <span style="font-size:10px; opacity:0.7;">v' + chrome.runtime.getManifest().version + '</span></span>' +
        '<div style="display:flex; gap:8px; align-items:center;"><span id="sisprof-user-name" style="font-size:11px; opacity:0.9; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
        '<span id="sisprof-minimizar" title="Minimizar" style="cursor:pointer; font-size:20px; line-height:1;">—</span><span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span></div></div>' +
        '<div id="sisprof-conteudo"><p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Conectado ao ProfSis! <span style="color:#718096; font-size:11px;">(modo consulta)</span></p>' +
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;"><label style="font-size:12px; font-weight:bold; color:#276749; display:block; margin-bottom:4px;">📅 Selecione o Dia:</label>' +
        '<div style="display:flex; gap:5px;"><input type="date" id="sisprof-data-input" style="flex:1; padding:6px; border:1px solid #cbd5e0; border-radius:4px; font-size:12px;"><button id="sisprof-btn-hoje" style="background:#38a169; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Hoje</button></div></div>' +
        '<div id="sisprof-status" style="background:#f7fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px; font-size:11px; color:#718096;">Verificando...</div>' +
        '<div style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; overflow:hidden;">' +
            '<div style="background:#f7fafc; padding:6px 8px; font-size:11px; font-weight:bold; color:#4a5568; border-bottom:1px solid #e2e8f0;">📚 Aulas do Dia <span style="font-weight:normal; color:#a0aec0;">— clique numa turma. ' + pontoDestaque('faltoso') + ' faltoso · ' + pontoDestaque('amarelado') + ' freq. &lt; 50%</span></div>' +
            '<div id="sisprof-lista-turmas"></div>' +
        '</div>' +
        '<div id="sisprof-detalhe" style="display:none; background:#fffaf0; border:1px solid #feebc8; border-radius:8px; padding:10px; margin-bottom:10px;"></div>' +
        '<div id="sisprof-registro" style="display:none; background:#f0fff4; border:1px solid #c6f6d5; border-radius:8px; padding:10px; margin-bottom:10px;"></div>' +
        '<hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;">' +
        '<button id="sisprof-btn-atualizar" style="width:100%; background:#dd6b20; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-bottom:8px;">🔄 Atualizar Assistente</button>' +
        '<button id="sisprof-btn-logout" style="width:100%; background:#718096; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px;">🚪 Desconectar</button></div>';
    document.body.appendChild(div);

    // Bolinha (☰) que aparece no lugar do menu quando minimizado.
    var bolinha = document.getElementById('sisprof-bolinha');
    if (!bolinha) {
        bolinha = document.createElement('div');
        bolinha.id = 'sisprof-bolinha';
        bolinha.title = 'Abrir Assistente SisProf';
        bolinha.style.cssText = 'position:fixed; top:20px; right:20px; width:52px; height:52px; background:#38a169; color:white; border-radius:50%; z-index:999999; box-shadow:0 4px 12px rgba(0,0,0,0.4); cursor:pointer; display:none; align-items:center; justify-content:center; font-size:24px; font-family:Arial;';
        bolinha.innerHTML = '☰';
        document.body.appendChild(bolinha);
    }
    bolinha.onclick = function() { aplicarEstadoMenuMinimizado(false); };

    if (profsisProfile && profsisProfile.nome) { const n = document.getElementById('sisprof-user-name'); if (n) n.textContent = profsisProfile.nome.split(' ')[0]; }
    document.getElementById('sisprof-fechar').onclick = function() { div.remove(); if (bolinha) bolinha.remove(); };
    document.getElementById('sisprof-minimizar').onclick = function() { aplicarEstadoMenuMinimizado(true); };

    // Reaplica o estado salvo: se estava minimizado, já entra como bolinha.
    if (sisprofMenuEstaMinimizado()) aplicarEstadoMenuMinimizado(true);
    document.getElementById('sisprof-btn-logout').onclick = function() { chrome.runtime.sendMessage({ action: 'PROFSIS_LOGOUT' }, () => { div.remove(); profsisProfile = null; profsisAppData = null; extHistory = {}; mostrarTelaStatus(); }); };
    document.getElementById('sisprof-btn-hoje').onclick = function() { const h = new Date().toISOString().split('T')[0]; document.getElementById('sisprof-data-input').value = h; currentSelectedDate = h; ocultarDetalheFaltosos(); atualizarInterfacePorData(); atualizarPaineisSED(); };
    document.getElementById('sisprof-data-input').addEventListener('change', function() { currentSelectedDate = this.value; ocultarDetalheFaltosos(); atualizarInterfacePorData(); atualizarPaineisSED(); });

    // Atualiza o assistente na hora, sem esperar o ciclo lento do Chrome (extensão) nem a próxima
    // abertura (app). No app usa a ponte nativa; na extensão força a checagem de update self-hosted.
    document.getElementById('sisprof-btn-atualizar').onclick = function() {
        const btn = this; const txt = btn.textContent; btn.disabled = true; btn.textContent = '⏳ Atualizando...';
        if (window.ProfSisNativeUpdate && typeof window.ProfSisNativeUpdate.atualizarRobo === 'function') {
            try { window.ProfSisNativeUpdate.atualizarRobo(); }
            catch (e) { btn.disabled = false; btn.textContent = txt; alert('Não foi possível atualizar agora. Tente reabrir o app.'); }
        } else {
            chrome.runtime.sendMessage({ action: 'FORCE_UPDATE_CHECK' }, function(r) {
                btn.disabled = false; btn.textContent = txt;
                const st = r && r.status;
                alert(st === 'update_available' ? 'Atualização encontrada! A extensão vai recarregar.'
                    : st === 'no_update' ? 'O Assistente já está na versão mais recente.'
                    : 'Verificação enviada. Se houver atualização, o Chrome aplica em instantes.');
            });
        }
    };

    let observerDebounce = null, observerBusy = false;
    const observer = new MutationObserver(() => {
        if (observerBusy) return;
        if (observerDebounce) clearTimeout(observerDebounce);
        observerDebounce = setTimeout(() => {
            // .txt-titulo existe em praticamente toda tela "page-interna" da SED (Chamada, Registro,
            // etc.) - usado aqui para reagir também na tela de Registro, que não tem .card_aluno.
            if (document.querySelector('.card_aluno, .card_aluno1') || document.querySelector('.txt-titulo')) {
                observerBusy = true;
                try { atualizarInterfacePorData(); atualizarPaineisSED(); } catch (e) {} finally { observerBusy = false; }
            }
        }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const h = new Date().toISOString().split('T')[0];
    document.getElementById('sisprof-data-input').value = h;
    currentSelectedDate = h;
    // Mostra a agenda do dia imediatamente, em qualquer tela (não depende de entrar na chamada).
    atualizarInterfacePorData();
    atualizarPaineisSED();

    // Limpa qualquer automação pendente deixada pela versão anterior (o "Robô"). O Assistente é
    // somente consulta e nunca executa workflows - se sobrou um estado no storage, descarta.
    try { chrome.storage.local.remove(['rpa_auto_workflow']); } catch (e) {}
}

// ==================== INTERFACE ====================

function atualizarInterfacePorData() {
    const statusEl = document.getElementById('sisprof-status');
    if (!statusEl) return;
    const payload = obterPayloadDaData(currentSelectedDate);
    if (!currentSelectedDate || !payload) {
        statusEl.innerHTML = '⏳ <strong>Sem dados para esta data.</strong><br>Verifique se há dados no ProfSis.';
        renderizarListaTurmasDoDia();
        return;
    }
    // Totais dos alunos em alerta somando as turmas do dia (classificação da gestão + freq. < 50%).
    let totFalt = 0, totAmar = 0;
    montarTurmasDoDia(currentSelectedDate).forEach(t => {
        const d = alunosDestacadosDaTurma(t.id);
        totFalt += d.filter(x => x.tipo === 'faltoso').length;
        totAmar += d.filter(x => x.tipo === 'amarelado').length;
    });
    const temRegistro = (payload.registros && payload.registros.length > 0 && payload.registros[0].conteudo) ? 'Sim' : 'Não';
    statusEl.innerHTML = '<strong>📅 ' + formatarDataBR(currentSelectedDate) + '</strong>' +
        '<br>' + pontoDestaque('faltoso') + ' Faltosos (Gestão): <strong>' + totFalt + '</strong>' +
        '<br>' + pontoDestaque('amarelado') + ' Frequência anual &lt; 50%: <strong>' + totAmar + '</strong>' +
        '<br>📝 Registro salvo: <strong>' + temRegistro + '</strong>';
    renderizarListaTurmasDoDia();
}

// Turma (objeto) a partir do id.
function turmaPorId(idTurma) {
    return (profsisAppData.turmas || []).find(t => String(t.id) === String(idTurma)) || null;
}

// Alunos em alerta de uma turma, na classificação da GESTÃO (independente da presença do dia -
// esta é uma lista de consulta, não decide falta). Cada item é { nome, tipo }:
//  - tipo 'faltoso'   -> classificado como "Faltoso" pela gestão (registrosAdministrativos);
//  - tipo 'amarelado' -> presença anual < 50% no ano (data.baixaFrequencia), quando NÃO é faltoso.
// Faltoso tem prioridade sobre amarelado (o aluno aparece uma vez só, no tipo mais grave).
function alunosDestacadosDaTurma(idTurma) {
    const estudantes = profsisAppData.estudantes || [];
    const registrosAdmin = profsisAppData.registrosAdministrativos || [];
    const baixaFreq = profsisAppData.baixaFrequencia || [];

    // Faltosos classificados pela gestão (arquivados são ignorados). Nada de filtro por presença do
    // dia: mostra exatamente quem a gestão marcou como Faltoso.
    const faltososReg = registrosAdmin.filter(r => r.tipo === 'Faltoso' && !r.arquivado);
    const baixaFreqIds = new Set(baixaFreq.map(b => String(b.id)));
    const baixaFreqNomes = new Set(baixaFreq.map(b => normalizeNomeFaltoso(b.nome)));

    const casaFaltoso = (est) => faltososReg.some(reg =>
        String(reg.estudanteId) === String(est.id) ||
        (reg.nomeEstudante && normalizeNomeFaltoso(reg.nomeEstudante) === normalizeNomeFaltoso(est.nome_completo)));

    const resultado = [];
    const nomesJaIncluidos = new Set();

    // 1) Alunos ATIVOS da turma na base local do professor.
    estudantes.forEach(est => {
        if (String(est.id_turma) !== String(idTurma)) return;
        if (est.status && est.status !== 'Ativo') return;
        const nomeNorm = normalizeNomeFaltoso(est.nome_completo);
        if (casaFaltoso(est)) {
            resultado.push({ nome: est.nome_completo, tipo: 'faltoso' });
            nomesJaIncluidos.add(nomeNorm);
        } else if (baixaFreqIds.has(String(est.id)) || baixaFreqNomes.has(nomeNorm)) {
            resultado.push({ nome: est.nome_completo, tipo: 'amarelado' });
            nomesJaIncluidos.add(nomeNorm);
        }
    });

    // 2) Faltosos que a gestão lançou mas que NÃO estão na base local do professor (aluno não
    //    importado). Atribui à turma pelo turmaId do registro - mesmo critério do robô antigo -
    //    pra não sumir com um faltoso classificado pela gestão.
    faltososReg.forEach(reg => {
        if (!reg.nomeEstudante) return;
        const nomeNorm = normalizeNomeFaltoso(reg.nomeEstudante);
        if (nomesJaIncluidos.has(nomeNorm)) return;
        const existeLocal = estudantes.some(e => normalizeNomeFaltoso(e.nome_completo) === nomeNorm || String(e.id) === String(reg.estudanteId));
        if (existeLocal) return;
        if (reg.turmaId != null && String(reg.turmaId) === String(idTurma)) {
            resultado.push({ nome: reg.nomeEstudante, tipo: 'faltoso' });
            nomesJaIncluidos.add(nomeNorm);
        }
    });

    // Faltosos (vermelho) primeiro, depois amarelados; alfabético dentro de cada grupo.
    const peso = { faltoso: 0, amarelado: 1 };
    resultado.sort((a, b) => (peso[a.tipo] - peso[b.tipo]) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return resultado;
}

// Aulas que o professor tem no dia selecionado. Cada turma é clicável (mostra os faltosos) e tem um
// checkbox de controle pessoal ("já lancei" - marca sincronizada entre dispositivos, não mexe na SED).
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
        const lancSync = (profsisAppData && profsisAppData.lancamentosConcluidos) || {};
        const isDone = lancSync[markKey] || extDoneMarks[markKey] || false;
        const destacados = alunosDestacadosDaTurma(turma.id);
        const nFalt = destacados.filter(d => d.tipo === 'faltoso').length;
        const nAmar = destacados.filter(d => d.tipo === 'amarelado').length;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:6px 8px; gap:6px;';
        div.innerHTML =
            '<span class="sisprof-turma-ver" title="Ver faltosos e alunos com frequência baixa desta turma" style="flex:1; cursor:pointer; font-size:12px; color:#2d3748; font-weight:600;">👁️ ' + escapeHtml(turma.nome + ' ' + turma.disciplina) + '</span>' +
            '<span class="sisprof-turma-badge" title="🔴 Faltosos (gestão) · 🟡 frequência anual < 50%" style="flex-shrink:0; cursor:pointer; font-size:10px; color:#4a5568; background:#f7fafc; border:1px solid #e2e8f0; border-radius:10px; padding:2px 8px; white-space:nowrap;">' + pontoDestaque('faltoso') + ' ' + nFalt + ' &nbsp; ' + pontoDestaque('amarelado') + ' ' + nAmar + '</span>' +
            '<input type="checkbox" class="sisprof-turma-done-chk" title="Marcar como lançada (controle pessoal - não mexe na SED)" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '>';
        container.appendChild(div);
        const verDestacados = function() { renderPainelDestacados(turma.id, turma.nome + ' ' + turma.disciplina); };
        div.querySelector('.sisprof-turma-ver').addEventListener('click', verDestacados);
        div.querySelector('.sisprof-turma-badge').addEventListener('click', verDestacados);
        div.querySelector('.sisprof-turma-done-chk').addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
            // Sincroniza a marca entre dispositivos (grava em data.lancamentosConcluidos via ProfSis).
            chrome.runtime.sendMessage({ action: 'SET_LANCAMENTO', key: key, value: this.checked });
            if (profsisAppData) { profsisAppData.lancamentosConcluidos = profsisAppData.lancamentosConcluidos || {}; if (this.checked) profsisAppData.lancamentosConcluidos[key] = true; else delete profsisAppData.lancamentosConcluidos[key]; }
        });
    });
    const last = container.lastElementChild;
    if (last) last.style.borderBottom = 'none';
}

// ==================== PAINEL DE ALUNOS EM ALERTA (somente leitura) ====================

// Turma atualmente exibida no painel de detalhe (pra re-renderizar com dados frescos no refresh).
let detalheTurmaId = null, detalheTurmaTitulo = "";

function ocultarDetalheFaltosos() {
    detalheTurmaId = null; detalheTurmaTitulo = "";
    const painel = document.getElementById('sisprof-detalhe');
    if (painel) { painel.style.display = 'none'; painel.innerHTML = ''; }
}

// Bolinha colorida do marcador: vermelha para faltoso, amarela para frequência baixa (<50%).
function pontoDestaque(tipo) {
    const cor = tipo === 'amarelado' ? '#f6c343' : '#e53e3e';
    return '<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:' + cor + '; vertical-align:middle;"></span>';
}

// Renderiza o painel de alunos em alerta de uma turma. Recalcula a lista SEMPRE a partir do
// profsisAppData atual (nunca de uma cópia congelada), pra refletir o dado mais recente.
function renderPainelDestacados(idTurma, titulo) {
    const painel = document.getElementById('sisprof-detalhe');
    if (!painel) return;
    detalheTurmaId = idTurma; detalheTurmaTitulo = titulo;
    const alunos = alunosDestacadosDaTurma(idTurma);
    let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        '<span style="font-weight:bold; font-size:12px; color:#2d3748;">Alunos em alerta — ' + escapeHtml(titulo) + '</span>' +
        '<span id="sisprof-detalhe-fechar" title="Fechar" style="cursor:pointer; color:#a0aec0; font-size:14px;">✖</span></div>';
    if (!alunos || alunos.length === 0) {
        html += '<div style="font-size:12px; color:#718096;">Nenhum aluno faltoso ou com frequência anual abaixo de 50% nesta turma.</div>';
    } else {
        const nFalt = alunos.filter(a => a.tipo === 'faltoso').length;
        const nAmar = alunos.filter(a => a.tipo === 'amarelado').length;
        html += '<ul style="margin:0; padding-left:2px; list-style:none; font-size:12px; color:#2d3748;">' +
            alunos.map(a => '<li style="margin-bottom:4px; display:flex; align-items:center; gap:8px;">' + pontoDestaque(a.tipo) + '<span>' + escapeHtml(a.nome) + '</span></li>').join('') +
            '</ul>' +
            '<div style="font-size:11px; color:#a0aec0; margin-top:8px; border-top:1px solid #feebc8; padding-top:6px;">' +
                pontoDestaque('faltoso') + ' Faltoso (gestão): <strong>' + nFalt + '</strong> &nbsp;·&nbsp; ' +
                pontoDestaque('amarelado') + ' Frequência anual &lt; 50%: <strong>' + nAmar + '</strong>' +
                '<br>lista somente para consulta' +
            '</div>';
    }
    painel.style.display = 'block';
    painel.innerHTML = html;
    const fechar = document.getElementById('sisprof-detalhe-fechar');
    if (fechar) fechar.onclick = ocultarDetalheFaltosos;
}

// ==================== PAINÉIS QUE DEPENDEM DA TELA DA SED ====================
// Atualiza os painéis de consulta conforme a tela aberta na Sala do Futuro:
//  - "Registro de Aulas Detalhes": mostra o conteúdo salvo no ProfSis para copiar/colar;
//  - "Lançamento de Frequências" (chamada): mostra os faltosos da turma aberta.
function atualizarPaineisSED() {
    const tipo = detectarTipoTelaSED();
    const painelReg = document.getElementById('sisprof-registro');

    if (painelReg) {
        if (tipo === 'registro') {
            const payload = obterPayloadDaData(currentSelectedDate);
            const registro = payload ? encontrarRegistroParaTela(payload) : null;
            if (registro && registro.conteudo) {
                painelReg.style.display = 'block';
                painelReg.innerHTML =
                    '<div style="font-weight:bold; font-size:12px; color:#276749; margin-bottom:4px;">📝 Registro salvo no ProfSis</div>' +
                    '<div style="font-size:11px; color:#718096; margin-bottom:6px;">Copie e cole no campo de registro da SED. O Assistente não preenche automaticamente.</div>' +
                    '<textarea id="sisprof-registro-txt" readonly style="width:100%; height:120px; box-sizing:border-box; border:1px solid #cbd5e0; border-radius:6px; padding:8px; font-size:12px; resize:vertical; font-family:Arial;">' + escapeHtml(registro.conteudo) + '</textarea>' +
                    '<button id="sisprof-registro-copiar" style="width:100%; margin-top:6px; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">📋 Copiar conteúdo</button>';
                const btnCopiar = document.getElementById('sisprof-registro-copiar');
                if (btnCopiar) btnCopiar.onclick = function() {
                    const txt = document.getElementById('sisprof-registro-txt');
                    const ok = copiarParaAreaTransferencia(registro.conteudo, txt);
                    const original = '📋 Copiar conteúdo';
                    btnCopiar.textContent = ok ? '✅ Copiado!' : '⚠️ Selecione o texto e use Ctrl+C';
                    setTimeout(() => { btnCopiar.textContent = original; }, 2200);
                };
            } else {
                painelReg.style.display = 'block';
                painelReg.innerHTML = '<div style="font-size:12px; color:#718096;">📝 Nenhum registro salvo no ProfSis para esta turma em ' + formatarDataBR(currentSelectedDate) + '. Nada para copiar.</div>';
            }
        } else {
            painelReg.style.display = 'none';
            painelReg.innerHTML = '';
        }
    }

    // Na tela de Chamada, mostra automaticamente os alunos em alerta da turma aberta na SED (só leitura).
    if (tipo === 'chamada') {
        const idTurma = encontrarIdTurmaDaTelaAtual();
        if (idTurma) {
            const turma = turmaPorId(idTurma);
            const titulo = turma ? (turma.nome + ' ' + (turma.disciplina || '')) : ('Turma ' + idTurma);
            renderPainelDestacados(idTurma, titulo);
        }
    }
}

// ==================== UTILITÁRIOS ====================

function formatarDataBR(dataStr) { if (!dataStr) return ''; const parts = dataStr.split('-'); return parts[2] + '/' + parts[1] + '/' + parts[0]; }

function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// Copia texto para a área de transferência. Preferimos selecionar o textarea + execCommand('copy')
// (mais confiável em content script), com navigator.clipboard como fallback.
function copiarParaAreaTransferencia(texto, textarea) {
    try {
        if (textarea) { textarea.focus(); textarea.select(); textarea.setSelectionRange(0, (texto || '').length); }
        if (document.execCommand('copy')) return true;
    } catch (e) {}
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(texto); return true; }
    } catch (e) {}
    return false;
}

// ==================== INICIALIZAÇÃO ====================

var tentativas = 0;
var intervalo = setInterval(function() {
    if (document.body && !document.getElementById('sisprof-menu-flutuante') && !document.getElementById('sisprof-status-box')) { try { mostrarTelaStatus(); } catch(e) { console.error("Erro:", e); } }
    if (document.getElementById('sisprof-menu-flutuante') || document.getElementById('sisprof-status-box') || tentativas > 20) { clearInterval(intervalo); }
    tentativas++;
}, 2000);

setTimeout(mostrarTelaStatus, 1000);
