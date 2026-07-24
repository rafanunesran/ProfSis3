// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// v3.2.1 - Na tela de Registro, quando a turma não tem dobradinha (sem abas em #tabsNavegacao), o
// "Horário de Aula" também é o widget multi-select (.multi-select-container) - mesmo usado na
// Chamada -, não um campo já visível como se assumia. selecionarHorarioAulaChamada virou
// selecionarHorarioAulaMultiSelect (compartilhada pelas duas telas) e passou a ser chamada também
// aqui antes de esperar (aguardarCondicao, não mais uma checagem única) o textarea aparecer.
// v3.2.0 - Removido o fallback de texto por IA (e o botão "Configurar Chave Groq" adicionado na
// v3.1.10) - quando não há registro nem rascunho salvo no ProfSis, agora sorteia uma atividade
// genérica de uma lista fixa (ATIVIDADES_GENERICAS_REGISTRO) em vez de chamar IA. O método de puxar
// de registros/rascunhos do ProfSis (encontrarRegistroParaTela/registro.conteudo) não muda em nada -
// só o que acontece depois dele não achar nenhum conteúdo.
// v3.1.9 - O fallback de texto via IA (sem registro salvo no ProfSis) só rodava em modo automático;
// no botão manual sempre abortava com "Nenhum registro (ou rascunho do Estagiário) encontrado...".
// Agora roda nos dois caminhos, e a mensagem de sucesso avisa quando o texto salvo foi gerado por
// IA (geradoPorIA em prosseguirComConteudo), pra o professor saber que não é o conteúdo real dele.
// v3.1.8 - selecionarDataSED desistia na hora (callback(false)) se .ui-datepicker-month/
// .ui-datepicker-year ainda não existissem no DOM, mesmo pra data de hoje (mês/ano já corretos,
// nenhuma navegação necessária) - só que o robô automático considera a tela de Registro "pronta"
// assim que #tabsNavegacao/o textarea aparecem (aguardarTelaDetalheEExecutar), o que pode acontecer
// antes do calendário montar. Agora tenta de novo (mesmo tentativas/450ms do resto da função) em vez
// de desistir na primeira checagem.
// v3.1.7 - A tela de Registro tem um campo "Bimestre" (<select name="Model.NumeroBimestre">,
// nativo) que a extensão nunca selecionava. Agora selecionarBimestreRegistro calcula o bimestre da
// data selecionada (detectarBimestreAtual, mesma função já usada pro catálogo de Material Digital)
// e marca o <select> logo depois da data e antes de esperar as abas de "Horário de Aula" - as abas
// exibidas podem depender do bimestre escolhido.
// v3.1.6 - preencherRegistroNaTela esperava um setTimeout fixo de 1200ms depois de selecionar a data
// antes de prosseguir - mesma família de bug do calendário/Chamada: a SED (Blazor) monta as abas de
// "Horário de Aula" (#tabsNavegacao) aos poucos, e esse delay fixo às vezes prosseguia antes de
// todas as abas terem renderizado (ex.: aula dobradinha). Agora reaproveita
// aguardarTelaRegistroEstavel (já usada em extrairMaterialDigitalSilencioso) pra só prosseguir
// quando a contagem de abas parar de mudar.
// v3.1.5 - selecionarHorarioAulaChamada (v3.1.4) fechava o menu do widget "Horário de Aula" logo
// depois de clicar no checkbox, sem esperar nada - a SED (Blazor) processa esse clique de forma
// assíncrona, então fechar cedo demais interrompia o processamento e a seleção revertia sozinha pra
// "Selecione ..." (sintoma: "abre e fecha mas não marca"). Agora usa aguardarCondicao (mesmo poller
// do fix do calendário) pra confirmar que o texto do próprio botão do widget realmente virou o
// horário escolhido antes de fechar o menu, e reporta falha clara em vez de seguir com o horário
// errado se isso não acontecer a tempo.
// v3.1.4 - A tela de Chamada tem um campo "Horário de Aula" (widget .multi-select-container, por
// cima de um <select multiple id="inputAula"> escondido) que a SED deixa em branco ("Selecione ...")
// por padrão - nem o robô automático nem o botão manual nunca preenchiam esse campo, então o Salvar
// acontecia sem saber pra qual horário/período a frequência era. Agora, depois de clicar em
// Pesquisar, selecionarHorarioAulaChamada acha os blocos (inicio/fim) que a turma da tela tem no dia
// (montarBlocosDaTurmaNoDia, mesma lógica de contarAulasNoDia) e marca o(s) checkbox(es)
// correspondente(s) no widget antes de marcar faltas e salvar.
// v3.1.3 - O número de versão exibido no painel flutuante (mostrarTelaStatus/injetarMenu) e nos
// console.log estava escrito à mão nessas strings, dessincronizado do manifest.json - por isso
// continuava mostrando uma versão antiga mesmo depois de bumps de versão. Agora lê sempre
// chrome.runtime.getManifest().version, então nunca mais fica desatualizado nessas duas telas/logs.
// v3.1.2 - Corrige selecionarDataSED: os <select> de mês/ano do calendário (.ui-datepicker-month/
// .ui-datepicker-year) só têm UMA <option> (a do mês exibido), então escrever .value neles nunca
// navegava de verdade - datas retroativas que caíam no mês anterior (ex.: pendência do dia 30 com o
// mês já virado) silenciosamente não eram selecionadas. Agora navega clicando nas setas ◀/▶ (como um
// usuário faria) até alcançar o mês/ano alvo, e reporta falha clara (via reportarResultado) se a seta
// necessária estiver desabilitada (prazo de lançamento da SED já vencido) em vez de seguir na data
// errada sem avisar - ver preencherChamadaNaTela/preencherRegistroNaTela.
// v3.1.1 - A tela de Registro só mostra o campo de texto depois de selecionar o "Horário de Aula"
// (aba em #tabsNavegacao) - antes disso o preenchimento abortava com "Não encontrei o campo de texto
// do registro". Agora percorre todas as abas (ver preencherTextoRegistroEmTodasAsAbas), preenchendo o
// texto em cada uma antes de salvar. Vale tanto pro botão manual quanto pro modo automático.
//
// v3.1.0 - Casamento de disciplina por sigla/proximidade (ex.: "EMA" <-> "Esporte-Musica-Arte", ver
// disciplinasCasam/iniciaisDisciplina) nas 3 funções que casavam só por igualdade exata. Registro sem
// conteúdo salvo no ProfSis agora tem fallback: em modo automático, gera um texto curto e genérico via
// IA (mesma chave/roteador de "IA Estagiário", ver gerarTextoRegistroFallbackIA em background.js) em
// vez de abortar; no botão manual o comportamento não muda.
//
// v3.0.1 - Ajuste pós-teste real: em modo automático a Chamada agora finaliza (clica Salvar) mesmo
// sem nenhuma falta no dia, e trata os dois modais de confirmação que a SED abre depois do Salvar
// ("Salvar frequência" e "Alterações salvas") - usando o atalho "Registro de aulas" do segundo modal
// para pular direto para o Registro da mesma turma quando disponível (ver confirmarModalSalvarFrequencia/
// aguardarModalAlteracoesSalvas).
//
// v3.0.0 - Botão "Auto" por aula no card "Aulas do Dia": navega sozinho pela SED (lista de Chamada
// -> preenchimento -> lista de Registro -> preenchimento) e marca a aula como concluída ao final,
// reaproveitando o preenchimento existente em modo silencioso (ver WORKFLOW AUTOMÁTICO abaixo).
// Convenção de versionamento a partir daqui: ajuste pontual incrementa o último dígito (3.0.1,
// 3.0.2...), mudança de escopo médio incrementa o dígito do meio (3.1.0).
//
// v2.9.0 - Aulas dobradinhas: marca "Replicar Frequência" na chamada e seleciona ao menos uma aula
// de Material Digital em CADA aba do Registro (não só a ativa). Botão "Extrair Alunos" agora só
// aparece na tela de chamada (espelhando o botão de Material, que já só aparecia no Registro).

    console.log("🤖 content_sed.js EXECUTADO - v" + chrome.runtime.getManifest().version);

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
            '🤖 Robô SisProf <span style="font-size:10px; opacity:0.7;">v' + chrome.runtime.getManifest().version + '</span>' +
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
    // (registros arquivados pela gestão são ignorados - não devem mais marcar falta)
    const faltososGestao = registrosAdmin.filter(r => r.tipo === 'Faltoso' && !r.arquivado);
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

// Mesma busca de contarAulasNoDia, mas devolvendo os blocos (com inicio/fim) em vez da contagem -
// usada por selecionarHorarioAulaMultiSelect pra saber qual(is) horário(s) marcar no widget "Horário
// de Aula" (usado tanto na tela de Chamada quanto na de Registro, quando a turma não tem dobradinha).
function montarBlocosDaTurmaNoDia(idTurma, dataStr) {
    if (!dataStr || !idTurma) return [];
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
    });
}

// Normaliza "H:MM"/"HH:MM" pra sempre ter 2 dígitos na hora, pra comparar com tolerância o horário da
// grade (bloco.inicio/fim) contra o value dos checkboxes do widget da SED (ex.: "07:50 às 08:40").
function normalizarHorarioAula(s) {
    return (s || '').trim().replace(/(^|\D)(\d)(?=:)/g, '$10$2');
}

// Seleciona, no widget "Horário de Aula" (.multi-select-container), o(s) checkbox(es) cujo horário
// bate com os blocos que a turma da tela atual tem no dia selecionado - usado tanto na tela de
// Chamada quanto na de Registro (quando a turma não tem dobradinha, essa tela usa o MESMO widget em
// vez de abas). Se o botão já mostra o horário certo (ex.: só existe 1 horário possível e a SED já
// deixa pré-selecionado), não mexe em nada. Senão, clica nos checkboxes (nunca define .checked/.value
// direto, porque é o clique que a SED escuta pra sincronizar o <select multiple id="inputAula">
// escondido atrás do widget) até bater com o horário certo.
function selecionarHorarioAulaMultiSelect(callback) {
    callback = callback || function () {};
    const idTurma = encontrarIdTurmaDaTelaAtual();
    const blocos = idTurma ? montarBlocosDaTurmaNoDia(idTurma, currentSelectedDate) : [];
    const botao = document.querySelector('.multi-select-button');
    if (!idTurma || blocos.length === 0 || !botao) { callback(true); return; }

    const valoresAlvo = blocos.map(b => normalizarHorarioAula((b.inicio || '') + ' às ' + (b.fim || '')));
    const botaoMostraAlvo = () => valoresAlvo.some(v => normalizarHorarioAula(botao.textContent).includes(v));

    // Já estava selecionado (ex.: robô rodando de novo numa aula já marcada) - não mexe em nada.
    if (botaoMostraAlvo()) { callback(true); return; }

    botao.click(); // abre o menu

    aguardarCondicao(
        () => document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]').length > 0,
        () => {
            document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]').forEach(chk => {
                const deveEstarMarcado = valoresAlvo.includes(normalizarHorarioAula(chk.value));
                if (chk.checked !== deveEstarMarcado) chk.click();
            });
            // A SED (Blazor) processa o clique do checkbox de forma assíncrona - espera o texto do
            // próprio botão do widget realmente virar o horário escolhido antes de fechar. Fechar
            // cedo demais (como antes, com um setTimeout fixo) fecha o menu antes da seleção "colar"
            // no componente, revertendo pra "Selecione ..." sem avisar nada.
            aguardarCondicao(
                botaoMostraAlvo,
                () => { botao.click(); callback(true); },
                () => { botao.click(); callback(false); }
            );
        },
        () => { botao.click(); callback(false); }
    );
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

// v3.1.0: palavras curtas a ignorar ao montar as iniciais de uma disciplina com várias palavras
// (ex.: "Esporte Musica e Arte" -> iniciais "EMA", ignorando o "e" do meio).
const STOPWORDS_INICIAIS_DISCIPLINA = ['e', 'de', 'da', 'do', 'das', 'dos', 'em'];

// v3.2.2: formas curtas/coloquiais de disciplina que professores digitam no ProfSis e que não batem
// nem por igualdade exata nem pelas iniciais (ex.: "Tec" pra "Tecnologia e Inovação" - iniciais dessa
// disciplina são "TI", não "TEC"). Chaves/valores já em formato normalizeTextoSED (sem espaço/acento).
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

// v3.1.0: compara dois nomes de disciplina "por proximidade" - iguais normalizados (como já era
// antes), OU um dos dois é a sigla/iniciais do outro (ex.: "EMA" <-> "Esporte-Musica-Arte", "TI" <->
// "Tecnologia e Inovação"). Cobre o caso em que o ProfSis guarda a sigla e a SED mostra o nome por
// extenso (ou vice-versa) - só entra em jogo DEPOIS que a igualdade exata já falhou, então não
// afrouxa a exigência de exatamente 1 candidato final nas funções que a usam.
function disciplinasCasam(nomeA, nomeB) {
    if (!nomeA || !nomeB) return false;
    const normA = expandirAbreviacaoDisciplina(normalizeTextoSED(nomeA));
    const normB = expandirAbreviacaoDisciplina(normalizeTextoSED(nomeB));
    if (normA === normB) return true;
    const inicialA = normalizeTextoSED(iniciaisDisciplina(nomeA));
    const inicialB = normalizeTextoSED(iniciaisDisciplina(nomeB));
    return (!!inicialA && inicialA === normB) || (!!inicialB && inicialB === normA);
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
        const porDisciplina = candidatos.filter(r => disciplinasCasam(r.disciplina, disciplinaSED));
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
        const porDisciplina = candidatos.filter(t => disciplinasCasam(t.disciplina, disciplinaSED));
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
            '<span>🤖 SisProf <span style="font-size:10px; opacity:0.7;">v' + chrome.runtime.getManifest().version + '</span></span>' +
        '<div style="display:flex; gap:8px; align-items:center;"><span id="sisprof-user-name" style="font-size:11px; opacity:0.9; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
        '<span id="sisprof-minimizar" style="cursor:pointer; font-size:16px;">▶</span><span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span></div></div>' +
        '<div id="sisprof-conteudo"><p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Conectado ao ProfSis!</p>' +
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;"><label style="font-size:12px; font-weight:bold; color:#276749; display:block; margin-bottom:4px;">📅 Selecione o Dia:</label>' +
        '<div style="display:flex; gap:5px;"><input type="date" id="sisprof-data-input" style="flex:1; padding:6px; border:1px solid #cbd5e0; border-radius:4px; font-size:12px;"><button id="sisprof-btn-hoje" style="background:#38a169; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Hoje</button></div></div>' +
        '<div id="sisprof-status" style="background:#f7fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px; font-size:11px; color:#718096;">Verificando...</div>' +
        '<div id="sisprof-auto-status" style="display:none;"></div>' +
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
                try { atualizarInterfacePorData(); atualizarModoBotaoPreencher(); atualizarVisibilidadeBotaoMaterial(); atualizarVisibilidadeBotaoExtrairAlunos(); avancarWorkflowAutoSeNecessario(); } catch (e) {} finally { observerBusy = false; }
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
    // Workflow automático (v3.0): se há uma automação pendente (ex.: acabamos de recarregar após um
    // location.href disparado por ela), sincroniza a data selecionada com a do workflow (senão ficaria
    // presa em "hoje", vide bloco acima) e retoma a máquina de estados a partir do storage.
    chrome.storage.local.get(['rpa_auto_workflow'], (result) => {
        const wf = result.rpa_auto_workflow;
        if (wf && wf.ativo && wf.data) {
            currentSelectedDate = wf.data;
            document.getElementById('sisprof-data-input').value = wf.data;
            atualizarInterfacePorData();
        }
        atualizarPainelStatusWorkflow(wf);
        avancarWorkflowAutoSeNecessario();
    });
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
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:6px 8px; gap:6px;';
        div.innerHTML =
            '<button class="sisprof-turma-auto-btn" title="Preencher automaticamente Chamada e Registro desta aula" style="flex-shrink:0; font-size:11px; padding:3px 6px; border-radius:4px; border:1px solid #cbd5e0; cursor:pointer; background:' + (isDone ? '#e6fffa' : '#ebf8ff') + ';">' + (isDone ? '🔄' : '🤖') + '</button>' +
            '<span style="font-size:12px; color:#2d3748; font-weight:600; flex:1;">' + turma.nome + ' ' + turma.disciplina + '</span>' +
            '<input type="checkbox" class="sisprof-turma-done-chk" data-key="' + markKey + '" ' + (isDone ? 'checked' : '') + '>';
        container.appendChild(div);
        div.querySelector('.sisprof-turma-done-chk').addEventListener('change', function() {
            const key = this.getAttribute('data-key');
            extDoneMarks[key] = this.checked;
            chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
        });
        div.querySelector('.sisprof-turma-auto-btn').addEventListener('click', function() {
            if (isDone && !confirm('Esta aula já está marcada como concluída. Refazer o preenchimento automático (Chamada + Registro)?')) return;
            iniciarWorkflowAuto(turma);
        });
    });
    const last = container.lastElementChild;
    if (last) last.style.borderBottom = 'none';
}

// ==================== PREENCHIMENTO ====================

// Seleciona uma data no calendário inline da SED (jQuery UI Datepicker) e avisa via callback(sucesso)
// se o dia realmente foi clicado. Os <select> de mês/ano (.ui-datepicker-month/.ui-datepicker-year)
// só têm UMA <option> cada - a do mês/ano exibido no momento - então escrever neles não navega o
// calendário (não existe essa <option> pra escolher). A navegação real é pelas setas ◀/▶
// (.ui-datepicker-prev/.ui-datepicker-next); a SED desabilita a seta quando o prazo de lançamento
// daquele mês já venceu ("prazo de até 5 dias corridos"), o que é sinalizado aqui como falha em vez
// de tentar forçar.
function selecionarDataSED(dataStr, callback) {
    callback = callback || function () {};
    if (!dataStr) { callback(false); return; }
    const parts = dataStr.split('-');
    const year = parseInt(parts[0], 10); const month = parseInt(parts[1], 10) - 1; const day = parseInt(parts[2], 10);

    const clicarDia = () => {
        const dayCells = document.querySelectorAll('td[data-handler="selectDay"][data-month="' + month + '"][data-year="' + year + '"]');
        for (const cell of dayCells) {
            const link = cell.querySelector('a.ui-state-default');
            if (link && link.textContent.trim() == day) { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
        }
        return false;
    };

    const navegarEClicar = (tentativas) => {
        tentativas = tentativas || 0;
        const monthSelect = document.querySelector('.ui-datepicker-month');
        const yearSelect = document.querySelector('.ui-datepicker-year');
        if (!monthSelect || !yearSelect) {
            // O calendário ainda pode não ter montado (Blazor) - tenta de novo em vez de desistir na
            // hora. No robô automático, a tela é considerada "pronta" assim que #tabsNavegacao ou o
            // textarea aparecem (ver aguardarTelaDetalheEExecutar), o que pode acontecer antes do
            // calendário existir no DOM.
            if (tentativas >= 14) { callback(false); return; }
            setTimeout(() => navegarEClicar(tentativas + 1), 450);
            return;
        }
        const mesExibido = parseInt(monthSelect.value, 10);
        const anoExibido = parseInt(yearSelect.value, 10);

        if (mesExibido === month && anoExibido === year) { callback(clicarDia()); return; }
        if (tentativas >= 14) { callback(false); return; } // trava de segurança (bem mais que o normalmente necessário)

        const alvoAntesDoExibido = year < anoExibido || (year === anoExibido && month < mesExibido);
        const seta = document.querySelector(alvoAntesDoExibido ? '.ui-datepicker-prev' : '.ui-datepicker-next');
        if (!seta || seta.classList.contains('ui-state-disabled')) { callback(false); return; }
        seta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => navegarEClicar(tentativas + 1), 450);
    };

    navegarEClicar();
}


// Reporta um resultado de preenchimento sem travar a thread quando rodando no workflow automático
// (v3.0): em modo automático chama opts.aoConcluir com {ok, erro, mensagem} em vez de alert(),
// permitindo que o orquestrador decida avançar ou abortar; no botão manual (opts ausente) o
// comportamento continua idêntico ao de antes (alert() bloqueante).
function reportarResultado(opts, ok, mensagem, extra) {
    if (opts && opts.modoAutomatico) {
        if (opts.aoConcluir) opts.aoConcluir(Object.assign({ ok: ok, erro: ok ? null : mensagem, mensagem: mensagem }, extra || {}));
    } else {
        alert(mensagem);
    }
}

// Aciona o botão a partir da tela de "Lançamento de Frequências": seleciona a data, clica em
// Pesquisar/Buscar para carregar os alunos e então marca as faltas (e fechamento, se aplicável).
// Não mexe em nenhum campo de texto de registro - essa tela só cuida de presença.
// opts = { modoAutomatico, aoConcluir } (v3.0): quando chamada pelo workflow automático, btn é null
// e nenhum alert() é disparado - ver reportarResultado/executarPreenchimentoChamada.
function preencherChamadaNaTela(btn, opts) {
    opts = opts || {};
    const oldText = btn ? btn.textContent : null;
    if (btn) { btn.textContent = '⏳ Preenchendo...'; btn.disabled = true; }
    selecionarDataSED(currentSelectedDate, (selecionou) => {
        if (!selecionou) {
            if (btn) { btn.textContent = oldText; btn.disabled = false; }
            reportarResultado(opts, false, 'Não consegui selecionar o dia ' + formatarDataBR(currentSelectedDate) + ' no calendário da SED. A SED só libera lançamento dentro de um prazo (ex.: "5 dias corridos") - se o prazo desse mês já venceu, não é possível lançar essa data.');
            return;
        }
        setTimeout(() => {
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            let btnBuscar = null;
            buttons.forEach(b => { const t = (b.innerText || b.value || '').toLowerCase(); if (t.includes('pesquisar') || t.includes('buscar') || t.includes('listar')) btnBuscar = b; });
            if (btnBuscar) btnBuscar.click();
            setTimeout(() => {
                selecionarHorarioAulaMultiSelect((selecionouHorario) => {
                    if (!selecionouHorario) {
                        if (btn) { btn.textContent = oldText; btn.disabled = false; }
                        reportarResultado(opts, false, 'Não consegui selecionar o "Horário de Aula" na tela de Chamada - o campo continuou em "Selecione ...". Tente novamente ou selecione o horário manualmente antes de preencher.');
                        return;
                    }
                    const payload = extHistory[currentSelectedDate];
                    if (payload) executarPreenchimentoChamada(payload, opts);
                    else reportarResultado(opts, false, 'Sem dados de chamada para esta data.');
                    if (btn) { btn.textContent = oldText; btn.disabled = false; }
                });
            }, 2500);
        }, 1000);
    });
}

// Aciona o botão a partir da tela "Registro de Aulas Detalhes": seleciona a data no calendário da
// SED e preenche o texto do registro casado com a turma/disciplina desta tela. Não mexe em faltas.
// opts = { modoAutomatico, aoConcluir } (v3.0), mesmo contrato de preencherChamadaNaTela.
function preencherRegistroNaTela(btn, opts) {
    opts = opts || {};
    const oldText = btn ? btn.textContent : null;
    if (btn) { btn.textContent = '⏳ Preenchendo...'; btn.disabled = true; }
    selecionarDataSED(currentSelectedDate, (selecionou) => {
        if (!selecionou) {
            if (btn) { btn.textContent = oldText; btn.disabled = false; }
            reportarResultado(opts, false, 'Não consegui selecionar o dia ' + formatarDataBR(currentSelectedDate) + ' no calendário da SED. A SED só libera lançamento dentro de um prazo (ex.: "5 dias corridos") - se o prazo desse mês já venceu, não é possível lançar essa data.');
            return;
        }
        selecionarBimestreRegistro((selecionouBimestre) => {
            if (!selecionouBimestre) {
                if (btn) { btn.textContent = oldText; btn.disabled = false; }
                reportarResultado(opts, false, 'Não consegui selecionar o "Bimestre" na tela de Registro para a data ' + formatarDataBR(currentSelectedDate) + '.');
                return;
            }
            // Espera as abas de "Horário de Aula" (#tabsNavegacao) pararem de aparecer antes de
            // prosseguir - a SED (Blazor) monta essas abas aos poucos (ver aguardarTelaRegistroEstavel,
            // já usada em extrairMaterialDigitalSilencioso), então um delay fixo às vezes prosseguia
            // antes de todas as abas (ex.: aula dobradinha) terem renderizado. Espera depois do
            // bimestre porque as abas exibidas podem depender de qual bimestre está selecionado.
            aguardarTelaRegistroEstavel(() => {
                const payload = extHistory[currentSelectedDate];
                if (payload) executarPreenchimentoRegistro(payload, opts);
                else reportarResultado(opts, false, 'Sem dados de registro para esta data.');
                if (btn) { btn.textContent = oldText; btn.disabled = false; }
            });
        });
    });
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

function executarPreenchimentoChamada(payload, opts) {
    opts = opts || {};
    // Sincroniza o banco de alunos silenciosamente a cada chamada preenchida (manual ou robô
    // completo) - os cards da turma já estão carregados na tela neste ponto (ver
    // preencherChamadaNaTela/aguardarTelaDetalheEExecutar).
    extrairAlunosSilencioso();
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

    const finalizarChamada = () => {
        setTimeout(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar');
            });
            if (!btnSalvar) { reportarResultado(opts, false, '✅ Concluído! ⚠️ Clique em "Salvar" manualmente.'); return; }
            btnSalvar.click();
            if (!opts.modoAutomatico) { reportarResultado(opts, true, '✅ Concluído! Faltas preenchidas e salvas na SED.'); return; }
            // Modo automático (v3.0.1): o clique acima só ABRE o modal "Salvar frequência" - a SED
            // exige confirmar de novo dentro dele, e só então mostra "Alterações salvas" (ver
            // confirmarModalSalvarFrequencia/aguardarModalAlteracoesSalvas abaixo).
            confirmarModalSalvarFrequencia(opts);
        }, 500);
    };
    // v3.0.1: em modo automático finaliza mesmo sem faltas - a SED exige confirmar a frequência
    // mesmo com 0 ausências (o modal de confirmação mostra "Ausências: 0" normalmente), e o
    // workflow automático precisa desse Salvar para poder seguir para o Registro. No botão manual
    // mantém o comportamento de sempre (só clica Salvar quando há alguma interação).
    if (opts.modoAutomatico || interagidos > 0) finalizarChamada();
    else reportarResultado(opts, false, 'Nenhuma falta pendente ou tela de chamada não encontrada.');
}

// v3.0.1: após clicar em "Salvar" na Chamada, a SED abre um modal de confirmação ("Salvar
// frequência", com contagem de presenças/ausências) que exige um SEGUNDO clique em "Salvar" dentro
// dele - só então a frequência é de fato persistida. Usado só em modo automático (no botão manual o
// professor confirma esse modal ele mesmo, como sempre fez).
function confirmarModalSalvarFrequencia(opts) {
    aguardarCondicao(
        () => encontrarBotaoEmModal('salvar frequência', 'salvar'),
        (btn) => { btn.click(); aguardarModalAlteracoesSalvas(opts); },
        () => reportarResultado(opts, false, 'Cliquei em "Salvar" mas o modal de confirmação da frequência não apareceu a tempo.')
    );
}

// v3.0.1: depois de confirmar o modal acima, a SED mostra "Alterações salvas" com um atalho direto
// para a tela de Registro de Aulas da MESMA turma/disciplina/data - se existir, usa-o (evita ter que
// navegar pela lista de Registro de novo); senão reporta sucesso normal e o workflow cai no fluxo
// antigo por lista (ver aguardarTelaDetalheEExecutar).
function aguardarModalAlteracoesSalvas(opts) {
    aguardarCondicao(
        () => encontrarModalPorTitulo('alterações salvas'),
        () => {
            const btnRegistro = encontrarBotaoEmModal('alterações salvas', 'registro de aulas');
            if (btnRegistro) { btnRegistro.click(); reportarResultado(opts, true, '✅ Concluído! Frequência salva e confirmada na SED.', { jaNavegouParaRegistro: true }); }
            else reportarResultado(opts, true, '✅ Concluído! Frequência salva e confirmada na SED.', { jaNavegouParaRegistro: false });
        },
        () => reportarResultado(opts, false, 'Cliquei em "Salvar" no modal, mas não vi a confirmação "Alterações salvas".')
    );
}

// v3.0.1: acha, dentro de algum modal ABERTO/VISÍVEL (.modal-content com dimensões > 0 - Bootstrap
// costuma deixar modais fechados no DOM com display:none, então só checar presença não basta), o
// botão do rodapé cujo texto contenha substringBotao. Se tituloModalAlvo for informado, exige que o
// <h4> do modal contenha esse texto antes de procurar o botão (evita casar com outro modal aberto).
// Usa normalizeTextoSED (já existente) para tolerar acentos e o texto do ícone Material dentro do
// botão (ex.: "save" + "Salvar" viram "savesalvar", que ainda contém "salvar").
function encontrarBotaoEmModal(tituloModalAlvo, substringBotao) {
    const normSub = normalizeTextoSED(substringBotao);
    const modais = Array.from(document.querySelectorAll('.modal-content')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });
    for (const modal of modais) {
        if (tituloModalAlvo) {
            const h4 = modal.querySelector('h4');
            if (!h4 || !normalizeTextoSED(h4.textContent).includes(normalizeTextoSED(tituloModalAlvo))) continue;
        }
        const botoes = Array.from(modal.querySelectorAll('.modal-footer button, .modal-footer a'));
        const alvo = botoes.find(b => normalizeTextoSED(b.textContent).includes(normSub));
        if (alvo) return alvo;
    }
    return null;
}

// v3.0.1: mesma ideia de encontrarBotaoEmModal, mas devolve o próprio modal (visível) cujo <h4>
// contenha tituloAlvo - usado para confirmar que "Alterações salvas" apareceu, antes de procurar o
// botão de atalho para o Registro.
function encontrarModalPorTitulo(tituloAlvo) {
    const normAlvo = normalizeTextoSED(tituloAlvo);
    return Array.from(document.querySelectorAll('.modal-content')).find(modal => {
        const rect = modal.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return false;
        const h4 = modal.querySelector('h4');
        return h4 && normalizeTextoSED(h4.textContent).includes(normAlvo);
    }) || null;
}

// Preenche o campo de texto na tela "Registro de Aulas Detalhes". O registro certo é escolhido
// casando a Turma/Disciplina exibidas no cabeçalho da SED com os registros do ProfSis para o dia
// (ver encontrarRegistroParaTela) - importante quando o professor tem mais de uma turma no mesmo dia.
function executarPreenchimentoRegistro(payload, opts) {
    opts = opts || {};
    // Sincroniza o catálogo de Material Digital silenciosamente antes de preencher - os dois mexem
    // nas mesmas abas de #tabsNavegacao, então precisa terminar a extração antes de começar a
    // navegar de novo pra preencher (ver extrairMaterialDigitalSilencioso).
    extrairMaterialDigitalSilencioso((dadosMaterial) => executarPreenchimentoRegistroDepoisDeExtrair(payload, opts, dadosMaterial));
}

// Lista fixa de atividades genéricas sorteada em executarPreenchimentoRegistroDepoisDeExtrair quando
// não há registro nem rascunho salvo no ProfSis pra turma/disciplina/data da tela - substitui a
// geração por IA (Groq/OpenAI/Gemini) que a extensão usava antes, sem depender de rede/chave alguma.
const ATIVIDADES_GENERICAS_REGISTRO = [
    // Introdução e Diagnóstico
    'Levantamento de Conhecimentos Prévios', 'Aula Expositiva Dialogada', 'Contextualização do Tema', 'Análise de Estudo de Caso',
    // Desenvolvimento e Prática
    'Exercício de Fixação', 'Aula Prática ou Laboratório', 'Leitura Guiada e Interpretação', 'Rotação por Estações',
    'Oficina Criativa / Produção', 'Análise de Mídias', 'Aula Invertida',
    // Interação e Aprofundamento
    'Debate e Argumentação Orientada', 'Trabalho em Grupo (Planejamento)', 'Seminário de Apresentação', 'Conexões Interdisciplinares',
    // Revisão e Avaliação
    'Construção de Mapa Mental Coletivo', 'Correção Comentada', 'Avaliação Diagnóstica / Simulado', 'Autoavaliação e Feedback',
    'Encerramento e Reflexão'
];

// Sorteia (aleatoriamente) um card de Material Digital SEM "aula com tarefa" dentre todos os
// extraídos das abas - usado como fallback quando o registro do ProfSis não tem card marcado ou
// quando não há registro salvo. Nunca sorteia "aula com tarefa" (card.temTarefa) pra não liberar
// uma atividade pro aluno sem o professor ter decidido isso num registro real. null se não houver
// nenhum card sem tarefa disponível.
function sortearCardSemTarefa(dadosMaterial) {
    if (!dadosMaterial || !dadosMaterial.sessoes) return null;
    const semTarefa = [];
    for (const sessao of dadosMaterial.sessoes) {
        for (const card of (sessao.cards || [])) {
            if (!card.temTarefa) semTarefa.push(card);
        }
    }
    if (semTarefa.length === 0) return null;
    return semTarefa[Math.floor(Math.random() * semTarefa.length)];
}

function executarPreenchimentoRegistroDepoisDeExtrair(payload, opts, dadosMaterial) {
    const registro = encontrarRegistroParaTela(payload);

    // Preenche o textarea com conteudoTexto, marca o Material Digital (se houver) e salva - mesmo
    // caminho de sempre, usado tanto para o conteúdo real do ProfSis quanto para a atividade genérica
    // sorteada (ver fallback abaixo).
    const prosseguirComConteudo = (conteudoTexto, cardsMaterialDigital, foiSorteio) => {
        const continuarComMaterialESalvar = () => {
            const finalizarSalvamentoRegistro = (avisoCards) => {
                setTimeout(() => {
                    const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                        const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                        return text.includes('salvar') || text.includes('gravar');
                    });
                    const sufixoAviso = (avisoCards && avisoCards.length > 0)
                        ? ('\n\n⚠️ Não encontrei na tela o(s) card(s) do Material Digital: ' + avisoCards.join(', ') + '. Marque manualmente se necessário.')
                        : '';
                    const sufixoCardAuto = (foiSorteio && cardsMaterialDigital && cardsMaterialDigital.length > 0)
                        ? (' Marquei o card "' + cardsMaterialDigital[0].titulo + '" (sem tarefa).')
                        : '';
                    const sufixoSorteio = foiSorteio ? '\n\n🎲 Sem registro salvo no ProfSis - usei uma atividade genérica sorteada: "' + conteudoTexto + '".' + sufixoCardAuto : '';
                    if (btnSalvar) { btnSalvar.click(); reportarResultado(opts, true, '✅ Registro preenchido e salvo na SED.' + sufixoSorteio + sufixoAviso); }
                    else reportarResultado(opts, false, '✅ Registro preenchido! ⚠️ Clique em "Salvar" manualmente.' + sufixoSorteio + sufixoAviso);
                }, 400);
            };

            // Marca de volta os cards do Material Digital selecionados no ProfSis ANTES de salvar,
            // para que o clique em Salvar grave texto + cards de uma vez só. O 3º argumento (true)
            // garante ao menos uma aula marcada em CADA aba (dobradinha) - se o card salvo/sorteado
            // não existir numa aba, sorteia um card sem tarefa daquela aba.
            if (cardsMaterialDigital && cardsMaterialDigital.length > 0) {
                marcarCardsMaterialDigitalNaTela(cardsMaterialDigital, finalizarSalvamentoRegistro, true);
            } else {
                finalizarSalvamentoRegistro([]);
            }
        };

        const tabs = Array.from(document.querySelectorAll('#tabsNavegacao .nav-link'));
        if (tabs.length === 0) {
            // Tela sem abas de "Horário de Aula" (turma sem dobradinha) - aqui esse campo é o MESMO
            // widget multi-select da tela de Chamada (.multi-select-container), não abas. Confirma
            // ele primeiro (não mexe se já estiver certo) e só então espera (aguardarCondicao, em vez
            // de checar uma vez só) o campo de texto aparecer - ele pode não existir ainda mesmo com
            // o widget certo, a tela leva um instante pra renderizar.
            selecionarHorarioAulaMultiSelect(() => {
                aguardarCondicao(
                    () => document.querySelectorAll('textarea[name="o.Descricao"]').length > 0,
                    () => {
                        document.querySelectorAll('textarea[name="o.Descricao"]').forEach(txt => {
                            txt.value = conteudoTexto;
                            txt.dispatchEvent(new Event('input', { bubbles: true }));
                            txt.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        continuarComMaterialESalvar();
                    },
                    () => reportarResultado(opts, false, 'Não encontrei o campo de texto do registro nesta tela.\n\nSe a SED exigir escolher o "Horário de Aula" antes de mostrar o campo, selecione-o manualmente e clique em "Preencher Registro" de novo.')
                );
            });
            return;
        }

        // v3.1.1: a SED só mostra o campo de texto do registro depois de selecionar o "Horário de
        // Aula" (aba em #tabsNavegacao) - percorre TODAS as abas (mesmo padrão já usado em
        // marcarCardsMaterialDigitalNaTela/extrairTodasAsSessoes, porque aulas dobradinhas têm mais
        // de uma aba e provavelmente exigem o campo preenchido em cada uma), espera cada uma
        // renderizar e preenche o texto onde o campo existir, depois volta pra aba original.
        preencherTextoRegistroEmTodasAsAbas(tabs, conteudoTexto, (totalPreenchidas) => {
            if (totalPreenchidas === 0) {
                reportarResultado(opts, false, 'Selecionei o(s) "Horário(s) de Aula" mas não encontrei o campo de texto do registro em nenhuma aba.');
                return;
            }
            continuarComMaterialESalvar();
        });
    };

    if (registro && registro.conteudo) {
        // Registro salvo no ProfSis: usa o conteúdo salvo. Se ele TEM card marcado, usa o card salvo;
        // se NÃO tem card, sorteia um card sem tarefa (mesmo fallback do caminho sem-registro abaixo)
        // pra nunca salvar um registro sem nenhum card marcado.
        let cards = registro.cardsMaterialDigital;
        if (!cards || cards.length === 0) {
            const cardFallback = sortearCardSemTarefa(dadosMaterial);
            cards = cardFallback ? [cardFallback] : null;
        }
        prosseguirComConteudo(registro.conteudo, cards);
        return;
    }

    // Sem registro nem rascunho salvo no ProfSis - sorteia uma atividade genérica da lista fixa
    // (ATIVIDADES_GENERICAS_REGISTRO) em vez de abortar - tanto no botão manual quanto no robô
    // automático. Substitui a geração por IA usada antes (não depende mais de rede/chave nenhuma).
    // Além do texto, sorteia também um card de Material Digital SEM tarefa (ver sortearCardSemTarefa)
    // em vez de deixar a tela sem nenhum card marcado.
    const atividadeSorteada = ATIVIDADES_GENERICAS_REGISTRO[Math.floor(Math.random() * ATIVIDADES_GENERICAS_REGISTRO.length)];
    const cardFallback = sortearCardSemTarefa(dadosMaterial);
    prosseguirComConteudo(atividadeSorteada, cardFallback ? [cardFallback] : null, true);
}

// v3.1.1: preenche o texto do registro em CADA aba de #tabsNavegacao ("Horário de Aula") - a SED só
// renderiza o campo de texto da aba ativa por vez (mesma limitação de marcarCardsMaterialDigitalNaTela
// logo abaixo), e aulas dobradinhas têm mais de uma aba que provavelmente também exige o campo
// preenchido. Clica em cada aba, espera renderizar (mesmo tempo de espera já usado nas outras funções
// de aba deste arquivo), preenche o textarea se existir, e ao final volta pra aba em que estava.
function preencherTextoRegistroEmTodasAsAbas(tabs, conteudoTexto, callback) {
    const indiceOriginal = tabs.findIndex(t => t.classList.contains('active'));
    let i = 0, preenchidas = 0;
    function proximaAba() {
        if (i >= tabs.length) {
            if (indiceOriginal >= 0 && tabs[indiceOriginal]) tabs[indiceOriginal].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            setTimeout(() => callback(preenchidas), 300);
            return;
        }
        const tab = tabs[i];
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => {
            const areas = document.querySelectorAll('textarea[name="o.Descricao"]');
            if (areas.length > 0) {
                areas.forEach(txt => {
                    txt.value = conteudoTexto;
                    txt.dispatchEvent(new Event('input', { bubbles: true }));
                    txt.dispatchEvent(new Event('change', { bubbles: true }));
                });
                preenchidas++;
            }
            i++;
            proximaAba();
        }, 350);
    }
    proximaAba();
}

// Marca os cards-alvo dentro de um pane específico. Casa por TÍTULO (não pelo id salvo no registro)
// porque o mesmo card ("Aula 1 - ...") tem um id numérico DIFERENTE em cada aba/sessão do
// #tabsNavegacao, mas o catálogo de títulos é o mesmo em todas as abas. Retorna os títulos de
// cardsAlvo que foram encontrados e marcados NESTE pane.
function marcarCardsAlvoNoPane(pane, cardsAlvo, garantirAoMenosUm) {
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

    // Garante pelo menos UM card marcado neste pane (a SED exige uma aula marcada em CADA aba de
    // dobradinha antes de salvar). Se nenhum card-alvo casou aqui e ainda não há nada marcado neste
    // pane, sorteia um card SEM "aula com tarefa" que exista NESTE pane e marca. Assim, mesmo que o
    // card salvo/sorteado pertença a outra aba, cada aba fica com uma aula selecionada.
    if (garantirAoMenosUm && encontrados.length === 0) {
        const jaMarcado = blocos.some(b => { const c = b.querySelector('input[type="checkbox"]'); return c && c.checked; });
        if (!jaMarcado) {
            const semTarefa = blocos.filter(b => b.querySelector('input[type="checkbox"]') && !/aula com tarefa/i.test(b.textContent || ''));
            if (semTarefa.length > 0) {
                const escolhido = semTarefa[Math.floor(Math.random() * semTarefa.length)];
                const checkbox = escolhido.querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.checked) checkbox.click();
                const tituloEl = escolhido.querySelector('label p b');
                if (tituloEl && !encontrados.includes(tituloEl.textContent.trim())) encontrados.push(tituloEl.textContent.trim());
            }
        }
    }
    return encontrados;
}

// Marca de volta na SED os checkboxes do "Material Digital" selecionados no ProfSis (cardsAlvo:
// [{id, titulo, codigo}], no máximo 2). Em aulas dobradinhas (2 abas em #tabsNavegacao, ex: "13ª aula" /
// "14ª aula") a SED exige pelo menos uma aula marcada em CADA aba antes de salvar - por isso navega por
// TODAS as abas (não só a ativa), reaproveitando o mesmo padrão de extrairTodasAsSessoes, marcando o(s)
// mesmo(s) card(s)-alvo em cada uma (pode repetir a mesma aula nas duas abas, o que é esperado). Ao
// final volta pra aba em que o professor estava. Só avisa no callback os títulos que não foram
// encontrados em NENHUMA aba - nunca interrompe o preenchimento por não achar um card.
function marcarCardsMaterialDigitalNaTela(cardsAlvo, callback, garantirAoMenosUm) {
    if (!cardsAlvo || cardsAlvo.length === 0) { callback([]); return; }

    const tabs = Array.from(document.querySelectorAll('#tabsNavegacao .nav-link'));
    if (tabs.length === 0) {
        const pane = document.querySelector('.tab-content .tab-pane.show.active') || document.querySelector('.tab-content .tab-pane');
        const encontrados = marcarCardsAlvoNoPane(pane, cardsAlvo, garantirAoMenosUm);
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
            marcarCardsAlvoNoPane(pane, cardsAlvo, garantirAoMenosUm).forEach(t => { if (!encontradosGlobal.includes(t)) encontradosGlobal.push(t); });
            i++;
            proximaAba();
        }, 350);
    }
    proximaAba();
}

// ==================== WORKFLOW AUTOMÁTICO (v3.0) ====================
// Botão "Auto" por linha do card "Aulas do Dia": navega sozinho pela SED (lista de Chamada -> tela
// de preenchimento -> lista de Registro -> tela de preenchimento), reaproveitando as funções de
// preenchimento acima em modo silencioso (opts.modoAutomatico, ver reportarResultado), e marca a
// aula como concluída ao final. Todo o estado vive em chrome.storage.local['rpa_auto_workflow']
// porque navegar para as URLs de listagem (location.href) sempre recarrega o documento e destrói as
// variáveis de memória deste content script - a retomada NUNCA confia em memória, sempre relê o
// storage do zero (ver avancarWorkflowAutoSeNecessario).

const URL_LISTA_CHAMADA = 'https://saladofuturoprofessor.educacao.sp.gov.br/diario-classe__frequencia___lancamento';
const URL_LISTA_REGISTRO = 'https://saladofuturoprofessor.educacao.sp.gov.br/diario-classe__registrodeaulas';

const ROTULOS_ETAPA_WORKFLOW = {
    ir_para_lista_chamada: 'Abrindo lista de Chamada',
    clicar_item_lista_chamada: 'Selecionando turma na Chamada',
    preencher_chamada: 'Preenchendo Chamada',
    ir_para_lista_registro: 'Abrindo lista de Registro',
    clicar_item_lista_registro: 'Selecionando turma no Registro',
    preencher_registro: 'Preenchendo Registro',
    concluido: 'Concluído',
    erro: 'Erro'
};

let workflowBusy = false;

function isUrlListaChamada(href) { href = href || ''; return href.indexOf('diario-classe__frequencia___lancamento') !== -1 && href.indexOf('Detalhes') === -1; }
function isUrlListaRegistro(href) { return (href || '').indexOf('diario-classe__registrodeaulas') !== -1; }

// Confirma por ESTRUTURA do DOM (não só URL/título, que na SPA Blazor nem sempre é confiável - ver
// comentário em detectarTipoTelaSED) que a tela de listagem de turma/disciplina carregou. A mesma
// estrutura serve tanto para a lista de Chamada quanto para a de Registro.
function estaNaTelaListagemSED() {
    return !!document.querySelector('section.conteudoItens > a.item');
}

// Lê os itens da tela de listagem (turma/disciplina) tal como renderizados pela SED: nome da turma
// no <b> do primeiro <p>, disciplina no segundo <p> no formato "CÓDIGO - Nome" (prefixo removido).
function lerItensListaSED() {
    return Array.from(document.querySelectorAll('section.conteudoItens > a.item')).map(el => {
        const ps = el.querySelectorAll('p');
        const bTurma = ps[0] ? ps[0].querySelector('b') : null;
        const turmaNome = (bTurma ? bTurma.textContent : (ps[0] ? ps[0].textContent : '')).trim();
        const disciplinaBruta = ps[1] ? ps[1].textContent.trim() : '';
        const disciplina = disciplinaBruta.replace(/^\d+\s*-\s*/, '').trim();
        return { el: el, turmaNome: turmaNome, disciplina: disciplina };
    });
}

// Acha, na tela de listagem atual, o item cuja turma+disciplina corresponde ao alvo - mesma cascata
// de casamento já usada em encontrarIdTurmaDaTelaAtual/encontrarRegistroParaTela (linhas ~296-321 e
// ~264-291): tenta por código de série+letra primeiro, cai para nome normalizado, desempata por
// disciplina normalizada. NUNCA retorna um item ambíguo - se não achar exatamente 1 candidato,
// devolve {erro} em vez de arriscar clicar na turma errada.
function encontrarItemNaListaSED(turmaNomeAlvo, disciplinaAlvo) {
    const itens = lerItensListaSED();
    if (itens.length === 0) return { erro: 'A lista de turmas/disciplinas está vazia nesta tela.' };

    const codigoAlvo = extrairCodigoSerieTurmaSED(turmaNomeAlvo);
    let candidatos = [];
    if (codigoAlvo) candidatos = itens.filter(i => extrairCodigoSerieTurmaSED(i.turmaNome) === codigoAlvo);
    if (candidatos.length === 0) {
        const normAlvo = normalizeTextoSED(turmaNomeAlvo);
        candidatos = itens.filter(i => normalizeTextoSED(i.turmaNome) === normAlvo);
    }
    if (candidatos.length > 1 && disciplinaAlvo) {
        const porDisciplina = candidatos.filter(i => disciplinasCasam(i.disciplina, disciplinaAlvo));
        if (porDisciplina.length > 0) candidatos = porDisciplina;
    }
    if (candidatos.length === 0) return { erro: 'Não encontrei a turma "' + turmaNomeAlvo + '" / disciplina "' + disciplinaAlvo + '" na lista da SED.' };
    if (candidatos.length > 1) return { erro: 'Encontrei mais de uma turma/disciplina correspondente a "' + turmaNomeAlvo + '" / "' + disciplinaAlvo + '" - não é seguro escolher automaticamente.' };
    return { item: candidatos[0].el };
}

// Poller genérico: chama checarFn() a cada intervaloMs até ela retornar algo truthy (chama
// aoSucesso com o valor) ou até maxTentativas esgotar (chama aoTimeout) - nunca espera
// indefinidamente nem age "no escuro". Usado por todas as esperas do workflow abaixo.
function aguardarCondicao(checarFn, aoSucesso, aoTimeout, intervaloMs, maxTentativas) {
    intervaloMs = intervaloMs || 450;
    maxTentativas = maxTentativas || 22;
    let tentativas = 0;
    (function tick() {
        let valor;
        try { valor = checarFn(); } catch (e) { valor = null; }
        if (valor) { aoSucesso(valor); return; }
        tentativas++;
        if (tentativas >= maxTentativas) { aoTimeout(); return; }
        setTimeout(tick, intervaloMs);
    })();
}

// Persiste a nova etapa, atualiza o painel de status e só então segue - nunca avança em memória
// sem antes gravar no storage (é o storage que garante a retomada após reload).
function transicionarWorkflow(wf, novaEtapa, callback) {
    wf.etapa = novaEtapa;
    wf.tentativasEtapaAtual = 0;
    wf.ultimaAtualizacaoEm = Date.now();
    wf.log = wf.log || [];
    wf.log.push({ etapa: novaEtapa, ok: true, ts: wf.ultimaAtualizacaoEm });
    chrome.storage.local.set({ rpa_auto_workflow: wf }, () => {
        atualizarPainelStatusWorkflow(wf);
        if (callback) callback();
    });
}

// Aborta o workflow com um motivo visível (nunca fica tentando indefinidamente nem clica "no
// escuro"). Não remove o objeto do storage automaticamente - o professor pode querer ver o motivo
// do erro; só é limpo ao clicar "Fechar" no painel ou ao iniciar um novo Auto.
function abortarWorkflow(wf, motivoErro, callback) {
    wf.etapa = 'erro';
    wf.erro = motivoErro;
    wf.ativo = false;
    wf.ultimaAtualizacaoEm = Date.now();
    wf.log = wf.log || [];
    wf.log.push({ etapa: 'erro', ok: false, ts: wf.ultimaAtualizacaoEm, motivo: motivoErro });
    chrome.storage.local.set({ rpa_auto_workflow: wf }, () => {
        atualizarPainelStatusWorkflow(wf);
        if (callback) callback();
    });
}

// Marca a aula como concluída (mesmo mecanismo do checkbox manual, content_sed.js ~470-474) e
// finaliza o workflow.
function marcarWorkflowConcluido(wf, callback) {
    wf.etapa = 'concluido';
    wf.ativo = false;
    wf.ultimaAtualizacaoEm = Date.now();
    wf.log = wf.log || [];
    wf.log.push({ etapa: 'concluido', ok: true, ts: wf.ultimaAtualizacaoEm });
    extDoneMarks[wf.markKey] = true;
    chrome.runtime.sendMessage({ action: 'SAVE_MARKS', marks: extDoneMarks });
    chrome.storage.local.set({ rpa_auto_workflow: wf }, () => {
        atualizarPainelStatusWorkflow(wf);
        renderizarListaTurmasDoDia();
        if (callback) callback();
    });
}

// Espera a tela de listagem (Chamada ou Registro) carregar, clica no item que casa com a turma do
// workflow e avança para a etapa de preenchimento. Aborta se a lista não carregar a tempo ou se o
// casamento for ambíguo/vazio.
function aguardarClicarItemLista(wf, tipoLista, callback) {
    aguardarCondicao(
        estaNaTelaListagemSED,
        () => {
            const resultado = encontrarItemNaListaSED(wf.turmaNome, wf.disciplina);
            if (resultado.erro) { abortarWorkflow(wf, resultado.erro, callback); return; }
            resultado.item.click();
            const proximaEtapa = tipoLista === 'chamada' ? 'preencher_chamada' : 'preencher_registro';
            transicionarWorkflow(wf, proximaEtapa, callback);
        },
        () => { abortarWorkflow(wf, 'Não consegui abrir a lista de ' + tipoLista + ' a tempo.', callback); }
    );
}

// Espera a tela de detalhe (preenchimento) carregar e então dispara o preenchimento silencioso
// (modoAutomatico), avançando para a próxima etapa só quando o preenchimento reporta sucesso real.
function aguardarTelaDetalheEExecutar(wf, tipoLista, callback) {
    const condicaoPronta = () => {
        if (tipoLista === 'chamada') return detectarTipoTelaSED() === 'chamada' && document.querySelector('.card_aluno, .card_aluno1');
        return detectarTipoTelaSED() === 'registro' && (document.querySelector('textarea[name="o.Descricao"]') || document.querySelector('#tabsNavegacao'));
    };
    aguardarCondicao(
        condicaoPronta,
        () => {
            // A tela pode ter recarregado do zero (location.href) - garante que a data usada pelo
            // preenchimento é a do workflow, não "hoje" (que injetarMenu define por padrão).
            currentSelectedDate = wf.data;
            const aoConcluir = (resultado) => {
                if (!resultado.ok) { abortarWorkflow(wf, resultado.erro || resultado.mensagem || ('Falha ao preencher ' + tipoLista + '.'), callback); return; }
                if (tipoLista === 'chamada') {
                    // v3.0.1: se o modal "Alterações salvas" já nos levou direto para o Registro da
                    // mesma turma/disciplina/data (ver aguardarModalAlteracoesSalvas), pula a lista
                    // de seleção - senão cai no fluxo antigo por lista.
                    const proximaEtapa = resultado.jaNavegouParaRegistro ? 'preencher_registro' : 'ir_para_lista_registro';
                    transicionarWorkflow(wf, proximaEtapa, callback);
                } else {
                    marcarWorkflowConcluido(wf, callback);
                }
            };
            if (tipoLista === 'chamada') preencherChamadaNaTela(null, { modoAutomatico: true, aoConcluir: aoConcluir });
            else preencherRegistroNaTela(null, { modoAutomatico: true, aoConcluir: aoConcluir });
        },
        () => { abortarWorkflow(wf, 'A tela de ' + tipoLista + ' não carregou a tempo.', callback); }
    );
}

// Máquina de estados central: sempre lê o storage do zero (nunca confia em variável de memória) e
// decide a ação com base em (etapa salva, estrutura do DOM atual). Chamada em dois pontos: no boot
// do content script (cobre reload completo de documento) e no MutationObserver já existente (cobre
// navegação client-side da SPA Blazor sem reload). workflowBusy evita reentrância entre os dois.
function avancarWorkflowAutoSeNecessario() {
    if (workflowBusy) return;
    chrome.storage.local.get(['rpa_auto_workflow'], (result) => {
        const wf = result.rpa_auto_workflow;
        if (!wf || !wf.ativo) return;
        if (wf.etapa === 'concluido' || wf.etapa === 'erro') return;

        workflowBusy = true;
        const done = () => { workflowBusy = false; };

        switch (wf.etapa) {
            case 'ir_para_lista_chamada':
                if (isUrlListaChamada(location.href)) transicionarWorkflow(wf, 'clicar_item_lista_chamada', done);
                else { location.href = URL_LISTA_CHAMADA; /* reload real vai acontecer; não chama done() de propósito */ }
                break;
            case 'clicar_item_lista_chamada':
                aguardarClicarItemLista(wf, 'chamada', done);
                break;
            case 'preencher_chamada':
                aguardarTelaDetalheEExecutar(wf, 'chamada', done);
                break;
            case 'ir_para_lista_registro':
                if (isUrlListaRegistro(location.href)) transicionarWorkflow(wf, 'clicar_item_lista_registro', done);
                else { location.href = URL_LISTA_REGISTRO; /* reload real vai acontecer; não chama done() de propósito */ }
                break;
            case 'clicar_item_lista_registro':
                aguardarClicarItemLista(wf, 'registro', done);
                break;
            case 'preencher_registro':
                aguardarTelaDetalheEExecutar(wf, 'registro', done);
                break;
            default:
                done();
        }
    });
}

// Disparada pelo clique no botão "Auto" (ou "Refazer") de uma linha do card "Aulas do Dia".
function iniciarWorkflowAuto(turma) {
    chrome.storage.local.get(['rpa_auto_workflow'], (result) => {
        const existente = result.rpa_auto_workflow;
        if (existente && existente.ativo && String(existente.turmaId) !== String(turma.id)) {
            alert('Já existe uma automação em andamento para outra turma ("' + existente.turmaNome + ' ' + existente.disciplina + '"). Aguarde ela terminar ou recarregue a página para cancelar antes de iniciar outra.');
            return;
        }
        const agora = Date.now();
        const wf = {
            ativo: true,
            turmaId: turma.id,
            turmaNome: turma.nome,
            disciplina: turma.disciplina,
            data: currentSelectedDate,
            markKey: currentSelectedDate + '_turma_' + turma.id,
            etapa: 'ir_para_lista_chamada',
            tentativasEtapaAtual: 0,
            iniciadoEm: agora,
            ultimaAtualizacaoEm: agora,
            log: [],
            erro: null
        };
        chrome.storage.local.set({ rpa_auto_workflow: wf }, () => {
            atualizarPainelStatusWorkflow(wf);
            avancarWorkflowAutoSeNecessario();
        });
    });
}

// Painel não-bloqueante de progresso (nunca usa alert()). Reaproveita o mesmo elemento
// #sisprof-auto-status injetado em injetarMenu, irmão do #sisprof-status existente.
function atualizarPainelStatusWorkflow(wf) {
    const painel = document.getElementById('sisprof-auto-status');
    if (!painel) return;
    if (!wf || (!wf.ativo && wf.etapa !== 'erro')) {
        painel.style.display = 'none';
        painel.innerHTML = '';
        return;
    }
    const corFundo = wf.etapa === 'erro' ? '#fff5f5' : '#ebf8ff';
    const corBorda = wf.etapa === 'erro' ? '#feb2b2' : '#90cdf4';
    painel.style.cssText = 'display:block; background:' + corFundo + '; border:1px solid ' + corBorda + '; border-radius:8px; padding:8px 10px; margin-bottom:10px; font-size:11px; color:#2d3748;';
    let html = '<div style="font-weight:bold; margin-bottom:4px;">🤖 ' + wf.turmaNome + ' ' + wf.disciplina + '</div>';
    if (wf.etapa === 'erro') {
        html += '<div style="color:#c53030; margin-bottom:6px;">❌ ' + (wf.erro || 'Erro desconhecido.') + '</div>';
        html += '<button id="sisprof-auto-status-fechar" style="background:#c53030; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;">Fechar</button>';
    } else {
        html += '<div>' + (wf.etapa === 'concluido' ? '✅ ' : '⏳ ') + (ROTULOS_ETAPA_WORKFLOW[wf.etapa] || wf.etapa) + '</div>';
    }
    painel.innerHTML = html;
    const btnFechar = document.getElementById('sisprof-auto-status-fechar');
    if (btnFechar) btnFechar.onclick = function() {
        chrome.storage.local.remove(['rpa_auto_workflow']);
        painel.style.display = 'none';
        painel.innerHTML = '';
    };
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

// Raspa os cards de aluno atualmente na tela (nome + turma selecionada). Usada tanto pelo botão
// "Extrair Alunos" quanto pela atualização silenciosa disparada ao preencher a chamada. Retorna
// null se não houver nenhum card na tela.
function coletarAlunosDaTela() {
    const cardsAlunos = document.querySelectorAll(SELETOR_CARDS_ALUNO);
    if (cardsAlunos.length === 0) return null;

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

    return { alunos, turmaSelecionada };
}

// Atualiza o banco de alunos em segundo plano, sem esperar estabilização de cards e sem nenhum
// alert()/notificação - chamada automaticamente a cada preenchimento de chamada (manual ou pelo
// robô completo, ver executarPreenchimentoChamada). payload.silencioso avisa o listener
// SisProf_Update_Students (app.js) para não mostrar a notificação de novos alunos.
function extrairAlunosSilencioso() {
    const dados = coletarAlunosDaTela();
    if (!dados || dados.alunos.length === 0) return;

    const payload = { alunos: dados.alunos, turmaSED: dados.turmaSelecionada, timestamp: Date.now(), silencioso: true };
    chrome.runtime.sendMessage({ action: 'UPDATE_STUDENTS_DB', payload: payload }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn('[SisProf Ext] Atualização silenciosa de alunos falhou:', chrome.runtime.lastError.message);
            return;
        }
        if (response && response.success) console.log('[SisProf Ext] Alunos atualizados silenciosamente:', response.resultado);
        else console.warn('[SisProf Ext] Atualização silenciosa de alunos não teve sucesso:', response && response.error);
    });
}

function iniciarExtrairAlunos() {
    const btn = document.getElementById('sisprof-btn-extrair');
    if (btn) { btn.textContent = '⏳ Aguardando lista carregar...'; btn.disabled = true; }

    aguardarCardsEstaveis(() => {
        const dados = coletarAlunosDaTela();
        if (!dados) {
            if (btn) { btn.textContent = '📥 Extrair Alunos (Atualizar Banco)'; btn.disabled = false; }
            return alert('Nenhum aluno encontrado na tela. Abra a tela de chamada da turma desejada primeiro!');
        }

        if (btn) btn.textContent = '⏳ Extraindo e atualizando...';

        const { alunos, turmaSelecionada } = dados;

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

// Coleta pura (sem UI) usada tanto pelo botão "Extrair Material Digital" quanto pela sincronização
// silenciosa disparada a cada registro preenchido: espera as abas estabilizarem, lê os cards de
// todas elas e o cabeçalho de Turma/Disciplina. Devolve { sessoes, turmaSelecionada,
// disciplinaSelecionada } ou { erro } com a mesma mensagem que já era mostrada no botão manual.
function coletarSessoesMaterialDigital(callback) {
    aguardarTelaRegistroEstavel(() => {
        extrairTodasAsSessoes((sessoes) => {
            if (sessoes.length === 0) {
                callback({ erro: 'Nenhum card de "Material Digital" encontrado nas abas desta tela.' });
                return;
            }

            let turmaSelecionada = "Desconhecida";
            let disciplinaSelecionada = "";
            document.querySelectorAll('.font-cabecalho-filtro').forEach(span => {
                if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim();
                if (span.textContent.includes('Disciplina:')) disciplinaSelecionada = span.textContent.replace('Disciplina:', '').trim();
            });

            if (!disciplinaSelecionada) {
                callback({ erro: 'Não encontrei a Disciplina no cabeçalho desta tela - o catálogo é compartilhado por disciplina/série, então preciso dela pra salvar corretamente.' });
                return;
            }

            callback({ sessoes: sessoes, turmaSelecionada: turmaSelecionada, disciplinaSelecionada: disciplinaSelecionada });
        });
    });
}

// Acha em qual bimestre cai currentSelectedDate, usando a config de bimestres da escola (sincronizada
// no profsisAppData quando o professor abre uma turma vinculada à gestão - mesmo dado usado em
// app.js). Mesma lógica de configBimestres.find já usada lá, duplicada aqui porque a extensão só tem
// a cópia enviada pelo app, não acesso direto ao Firestore da gestão. null se não houver config ainda.
function detectarBimestreAtual() {
    const configBimestres = (profsisAppData && profsisAppData.configBimestres) || [];
    const data = currentSelectedDate || new Date().toISOString().split('T')[0];
    const config = configBimestres.find(c => data >= c.inicio && data <= c.fim);
    return config ? config.bim : null;
}

// Seleciona o "Bimestre" (<select name="Model.NumeroBimestre">, nativo - diferente do widget
// "Horário de Aula" da Chamada) da tela de Registro de Aulas Detalhes, com base no bimestre
// calculado pra data selecionada (detectarBimestreAtual, já usada pro catálogo de Material Digital).
function selecionarBimestreRegistro(callback) {
    callback = callback || function () {};
    const select = document.querySelector('select[name="Model.NumeroBimestre"]');
    const bimestreAlvo = detectarBimestreAtual();
    if (!select || !bimestreAlvo) { callback(true); return; } // nada configurado/nenhum campo nesta tela - segue em frente

    if (String(select.value) === String(bimestreAlvo)) { callback(true); return; } // já estava certo

    const temOpcao = Array.from(select.options).some(o => o.value === String(bimestreAlvo));
    if (!temOpcao) { callback(false); return; } // bimestre calculado não existe nesta tela - não força um valor errado

    select.value = String(bimestreAlvo);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    // Confirma que a mudança realmente "colou" antes de prosseguir - mesma cautela já aplicada aos
    // outros campos (calendário/"Horário de Aula" da Chamada): a SED pode reagir de forma assíncrona
    // (Blazor), inclusive reconstruindo as abas de "Horário de Aula" com base no bimestre escolhido.
    aguardarCondicao(
        () => String(select.value) === String(bimestreAlvo),
        () => callback(true),
        () => callback(false)
    );
}

// Botão "Extrair Material Digital": lê Turma/Disciplina do cabeçalho (mesmo padrão de
// encontrarRegistroParaTela/iniciarExtrairAlunos) e todos os cards de todas as abas/sessões, envia
// para o background salvar no catálogo compartilhado da escola (coleção shared_material_digital,
// agrupado por disciplina+série - visível a qualquer turma/professor da escola com essa combinação).
function iniciarExtrairMaterialDigital() {
    const btn = document.getElementById('sisprof-btn-extrair-material');
    if (btn) { btn.textContent = '⏳ Lendo abas...'; btn.disabled = true; }

    coletarSessoesMaterialDigital((dados) => {
        if (btn) { btn.textContent = '📥 Extrair Material Digital (Atualizar Catálogo)'; btn.disabled = false; }

        if (dados.erro) { alert(dados.erro); return; }

        const { sessoes, turmaSelecionada, disciplinaSelecionada } = dados;
        const payload = { turmaSED: turmaSelecionada, disciplinaSED: disciplinaSelecionada, sessoes: sessoes, bimestre: detectarBimestreAtual(), timestamp: Date.now() };
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
}

// Sincroniza o catálogo de Material Digital em segundo plano, sem alert()/notificação - chamada
// automaticamente a cada preenchimento de registro (manual ou robô completo, ver
// executarPreenchimentoRegistro). Roda ANTES do preenchimento em si (nunca em paralelo), porque as
// duas rotinas navegam clicando pelas mesmas abas de #tabsNavegacao - rodar junto causaria cliques
// concorrentes. Sempre chama aoConcluir() ao final (sucesso, erro ou nada pra extrair).
function extrairMaterialDigitalSilencioso(aoConcluir) {
    coletarSessoesMaterialDigital((dados) => {
        // IMPORTANTE: repassa `dados` (com .sessoes) ao callback - executarPreenchimentoRegistro usa
        // isso pra sortear um card sem tarefa quando o registro não tem card. Antes chamávamos
        // aoConcluir() sem argumento, então dadosMaterial ficava undefined e nenhum card era marcado.
        if (!dados || dados.erro) { aoConcluir(dados); return; }

        const payload = { turmaSED: dados.turmaSelecionada, disciplinaSED: dados.disciplinaSelecionada, sessoes: dados.sessoes, bimestre: detectarBimestreAtual(), timestamp: Date.now(), silencioso: true };
        chrome.runtime.sendMessage({ action: 'UPDATE_MATERIAL_DIGITAL_DB', payload: payload }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[SisProf Ext] Atualização silenciosa do catálogo de Material Digital falhou:', chrome.runtime.lastError.message);
            } else if (response && response.success) {
                console.log('[SisProf Ext] Catálogo de Material Digital atualizado silenciosamente:', response.resultado);
            } else {
                console.warn('[SisProf Ext] Atualização silenciosa do catálogo de Material Digital não teve sucesso:', response && response.error);
            }
            aoConcluir(dados);
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
