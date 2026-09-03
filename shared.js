// Funções Utilitárias e de Sessão Compartilhadas

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function getNextId(array) {
    return array && array.length > 0 ? Math.max(...array.map(i => i.id)) + 1 : 1;
}

function getAeePrefix(e) {
    if (e && (e.aee_categoria_diagnostico || e.aee_diagnostico || e.aee_categoria_projeto || e.is_aee_mapped)) {
        return `<span style="background:#e6fffa; color:#276749; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:bold; border:1px solid #b2f5ea; margin-right:5px;" title="Estudante acompanhado pelo AEE">AEE</span>`;
    }
    return '';
}

function getStatusColor(status) {
    const cores = {
        'pendente': '#ffc107',
        'notificado': '#3182ce',
        'entregue': '#22c55e',
        'entregue_atraso': '#f59e0b',
        'nao_entregue': '#ef4444',
        'nao_fez_folha': '#718096'
    };
    return cores[status] || '#718096';
}

// Gerenciamento de Sessão
function checkAuth(requiredRole) {
    const userJson = localStorage.getItem('app_current_user');
    if (!userJson) {
        window.location.href = 'index.html';
        return null;
    }
    const user = JSON.parse(userJson);
    
    // Verificar expiração (72h)
    const lastAccess = localStorage.getItem('app_last_access');
    if (lastAccess && (Date.now() - parseInt(lastAccess) > 72 * 60 * 60 * 1000)) {
        alert('Sessão expirada.');
        logout();
        return null;
    }
    localStorage.setItem('app_last_access', Date.now());

    // Verificar Permissão
    if (requiredRole && user.role !== requiredRole && user.role !== 'super_admin') {
        alert('Acesso não autorizado para este perfil.');
        window.location.href = 'index.html';
        return null;
    }
    return user;
}

function logout() {
    localStorage.removeItem('app_current_user');
    localStorage.removeItem('app_last_access');
    sessionStorage.removeItem('app_view_mode');
    
    // Se o Firebase estiver ativo, desloga dele também para evitar login automático ao recarregar
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error("Erro ao deslogar do Firebase:", error);
            window.location.href = 'index.html'; // Redireciona mesmo com erro
        });
    } else {
        window.location.href = 'index.html';
    }
}

function getStorageKey(user) {
    // A variável global `currentViewMode` é definida em app.js e reflete o painel que o usuário está vendo.
    const effectiveRole = (typeof currentViewMode !== 'undefined' && currentViewMode) ? currentViewMode : (user ? user.role : null);

    // Se o usuário for um gestor e estiver no modo gestor, usa a chave de gestor.
    if (effectiveRole === 'gestor') {
        return 'app_data_school_' + (user.schoolId || 'default') + '_gestor';
    }

    // Se a visualização for de AEE ou Projeto (seja por um gestor ou pelo próprio perfil), usa a chave compartilhada.
    if (effectiveRole === 'aee' || effectiveRole === 'projeto') {
        return `app_data_school_${user.schoolId || 'default'}_${effectiveRole}`;
    }

    // Para todos os outros casos (incluindo um gestor vendo como professor, ou um professor normal),
    // usa a chave pessoal do usuário, baseada no seu UID seguro.
    if (user && user.uid) {
        return 'app_data_' + user.uid;
    }
    
    return 'app_data_' + (user ? user.id : 'temp'); // Fallback para usuários antigos/locais sem UID
}

function getInitialData() {
    return {
        turmas: [], estudantes: [], horariosAulas: [], aulas: [],
        presencas: [], atrasos: [], trabalhos: [], notas: [],
        compensacoes: [], tutorados: [], encontros: [], eventos: [],
        ocorrencias: [], gradeHoraria: [], agendamentos: [], registrosAula: [],
        registrosAdministrativos: [], mapeamentos: [],
        caderno: []
    };
}
// ============================================================================
//  CLASSIFICAÇÃO DOS DADOS — camada LOCAL x camada NUVEM
// ----------------------------------------------------------------------------
//  A Secretaria não permite que dado pessoal de estudante fique em ambiente
//  externo. Este bloco é a fonte única da verdade sobre o que pode subir para o
//  Firestore e o que fica no aparelho do profissional.
//
//  REGRA DE OURO: campo DESCONHECIDO é tratado como PESSOAL.
//  Quem criar um campo novo em `data` amanhã não precisa lembrar desta lista —
//  o campo simplesmente não sobe. Para publicar algo novo na nuvem é preciso
//  escrevê-lo aqui de propósito, olhando para ele.
// ============================================================================

// Fica só no aparelho. Nunca sai em texto claro.
const CAMPOS_PESSOAIS = [
    'estudantes',              // nome completo, situação
    'presencas', 'atrasos',    // frequência por estudante
    'trabalhos', 'notas', 'compensacoes',
    'tutorados',               // inclui os Anexos III/IV inteiros (t.anexoPaee, t.anexosIV)
    'encontros', 'agendamentos', // tutoria: relato e agenda por estudante
    'ocorrencias',             // relato + ids_estudantes
    'registrosAdministrativos',// atestados, busca ativa
    'caderno', 'baixaFrequencia',
    'notasAvaliacoesGestor', 'notasBimestraisOficiais', 'lotesMapaoGestor'
];

// Não identifica estudante. Continua na nuvem, como sempre esteve.
const CAMPOS_NUVEM = [
    'turmas', 'horariosAulas', 'aulas',
    'gradeHoraria', 'gradeHorariaExcecoes', 'tiposHorarioFixo',
    'schoolGrade', 'schoolExceptions',
    'eventos',                 // compromissos gerais (a agenda de tutoria é `agendamentos`)
    'registrosAula', 'avisosMural',
    'configBimestres', 'feriadosEscolares', 'opcoesOcorrenciaRapida',
    'avaliacoesGestor',        // a DEFINIÇÃO da avaliação; as notas são pessoais
    'mapeamentos',             // só {id_turma, linhas, colunas, assentos:{"3-2": idEstudante}}
    'googleCalendar', 'escolaUF', 'escolaCidade'
];

// Chaves que denunciam dado pessoal em QUALQUER profundidade, mesmo dentro de um
// documento com formato próprio (o histórico de tutoria, o mapa da sala...).
// Usadas pela varredura de segurança em core.js.
const CHAVES_PESSOAIS_PROFUNDAS = [
    'nome_completo', 'nome_estudante', 'nome_estudante_norm', 'estudanteNome',
    'ids_estudantes', 'estudanteId', 'anexoPaee', 'anexosIV', 'relato'
];

function campoEhPessoal(chave) {
    return CAMPOS_NUVEM.indexOf(chave) === -1;
}

// Separa o `data` do app nas duas camadas. Disjunto por construção: cada chave cai
// em exatamente um lado, então a ordem de remontagem não importa.
function dividirDados(dados) {
    const local = {};
    const nuvem = {};
    Object.keys(dados || {}).forEach(chave => {
        if (campoEhPessoal(chave)) local[chave] = dados[chave];
        else nuvem[chave] = dados[chave];
    });
    return { local: local, nuvem: nuvem };
}

// Remonta o `data` a partir das duas camadas, com os padrões de getInitialData()
// preenchendo o que faltar (conta nova, ou aparelho que ainda não tem a parte local).
//
// Cada lado contribui SOMENTE com as chaves que lhe pertencem. Isso importa: antes da
// transição os dois documentos são cópias completas, e deixar o lado local sobrescrever
// tudo faria o professor que usou outro aparelho ontem ver a turma de anteontem.
function juntarDados(local, nuvem) {
    return Object.assign({},
        getInitialData(),
        dividirDados(nuvem || {}).nuvem,
        dividirDados(local || {}).local);
}

// "João Pedro da Silva Souza" -> "João S." — usado onde o nome precisa aparecer para
// um colega sem que o nome completo viaje (histórico de tutoria compartilhado).
function abreviarNome(nomeCompleto) {
    const partes = String(nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '';
    if (partes.length === 1) return partes[0];
    const ultimo = partes[partes.length - 1];
    return partes[0] + ' ' + ultimo.charAt(0).toUpperCase() + '.';
}
