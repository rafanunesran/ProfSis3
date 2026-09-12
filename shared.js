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

// Identificador de registro.
//
// Era `Date.now() + Math.random()`, e isso COLIDE de verdade: um double guarda ~15
// dígitos significativos, o timestamp já ocupa 13, e sobra quase nada para a parte
// aleatória. Numa importação de mapão, em que centenas de registros nascem no mesmo
// milissegundo, o resultado apareceu numa conta real: 57 notas bimestrais com o id de
// OUTRO estudante. Como toda mesclagem e toda edição procuram o registro pelo id, uma
// nota some por causa da nota de outra pessoa — sem erro, sem aviso.
//
// Agora o id é uma string: o mesmo tempo (para continuar ordenável) mais bits de
// aleatoriedade que ninguém soma a coisa nenhuma. Ids antigos, numéricos, continuam
// valendo — a comparação no sistema é solta (==), e nada precisa ser convertido.
function novoId() {
    const aleatorio = (typeof crypto !== 'undefined' && crypto.getRandomValues)
        ? Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36)).join('')
        : Math.random().toString(36).slice(2, 12);
    return Date.now().toString(36) + '-' + aleatorio;
}

// Dois registros são o MESMO registro?
//
// Perguntar só pelo id não serve: ids antigos colidem (ver novoId acima), e numa conta
// real 57 notas bimestrais carregavam o id de outro estudante. Toda junção que
// perguntava "já existe alguém com este id?" respondia "sim" e descartava a nota certa.
//
// Regra: ids diferentes, registros diferentes. Ids iguais e conteúdo idêntico, é o
// mesmo. Ids iguais e conteúdo diferente, olhamos a IDENTIDADE NATURAL do registro —
// de quem é, de qual trabalho, de qual bimestre. Divergindo, são registros distintos
// que por azar nasceram com o mesmo id, e os dois ficam. Na dúvida, nada se perde.
const CAMPOS_DE_IDENTIDADE = ['nome_estudante_norm', 'nome_estudante', 'nome_completo',
    'nome_estudante_display', 'id_estudante', 'id_trabalho', 'id_turma', 'disciplina',
    'bimestre', 'data', 'nome'];

function identidadeNatural(r) {
    if (!r || typeof r !== 'object') return '';
    return CAMPOS_DE_IDENTIDADE
        .filter(c => r[c] !== undefined && r[c] !== null && r[c] !== '')
        .map(c => c + '=' + String(r[c]).toUpperCase())
        .join('|');
}

function mesmoRegistro(a, b) {
    if (!a || !b) return false;
    if (a.id === undefined || b.id === undefined) return JSON.stringify(a) === JSON.stringify(b);
    if (String(a.id) !== String(b.id)) return false;
    if (JSON.stringify(a) === JSON.stringify(b)) return true;
    const ia = identidadeNatural(a), ib = identidadeNatural(b);
    if (!ia || !ib) return true;              // sem como distinguir: mantém o de hoje
    return ia === ib;
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

// "Vazio" para efeito de remontagem: nada que o professor tenha escrito. Um array
// sem itens, um objeto sem chaves e uma string em branco contam como ausência.
function _semConteudo(valor) {
    if (valor === undefined || valor === null || valor === '') return true;
    if (Array.isArray(valor)) return valor.length === 0;
    if (typeof valor === 'object') return Object.keys(valor).length === 0;
    return false;
}

// A conta isenta do corte ("100% online") tem a nuvem como fonte da verdade, e é
// assim que ela deve continuar. Mas um aparelho que fez a transição ANTES de o super
// admin ligar a isenção guarda estudantes que a nuvem não tem mais — a transição os
// tirou de lá. Sem isto, a conta isenta abriria com a lista de estudantes vazia.
//
// A nuvem continua mandando: daqui só entram as chaves PESSOAIS que a nuvem não traz.
// Nada que a nuvem tenha é sobrescrito, então o aparelho parado não ressuscita o que
// o professor apagou de outro lugar.
function completarComLocal(nuvem, local) {
    const base = Object.assign({}, nuvem || {});
    const pessoal = dividirDados(local || {}).local;
    Object.keys(pessoal).forEach(chave => {
        if (_semConteudo(base[chave]) && !_semConteudo(pessoal[chave])) base[chave] = pessoal[chave];
    });
    return base;
}

// Quanto dado pessoal existe aqui dentro. Depois da transição a camada local é a
// ÚNICA cópia do que identifica estudante — chamada, nota, ocorrência, tutoria — e
// "carregou vazio" e "está vazio" deixam de ser a mesma coisa: o primeiro é uma
// falha de leitura, o segundo é uma conta nova. Confundir os dois custa o ano
// letivo de um professor, porque o salvamento seguinte grava o vazio por cima.
//
// O censo é a prova material: é gravado a cada salvamento e conferido a cada
// abertura. Conta qualquer chave pessoal, não uma lista fixa, então um campo novo
// entra na proteção sozinho.
function censoPessoal(dados) {
    const pessoal = dividirDados(dados || {}).local;
    const por = {};
    let total = 0;
    Object.keys(pessoal).forEach(chave => {
        const valor = pessoal[chave];
        const n = Array.isArray(valor) ? valor.length
                : (valor && typeof valor === 'object' ? Object.keys(valor).length : 0);
        if (n) { por[chave] = n; total += n; }
    });
    return { por: por, total: total, em: new Date().toISOString() };
}

// O que sumiu entre um censo e outro, em texto que o professor entende.
function descreverPerda(antes, depois) {
    const nomes = {
        presencas: 'chamadas', notas: 'notas', ocorrencias: 'ocorrências',
        estudantes: 'estudantes', tutorados: 'tutorados', encontros: 'encontros de tutoria',
        atrasos: 'atrasos', trabalhos: 'trabalhos', compensacoes: 'compensações',
        registrosAula: 'registros de aula', registrosAdministrativos: 'registros administrativos',
        caderno: 'anotações do caderno', mapeamentos: 'mapas de sala'
    };
    const partes = [];
    Object.keys((antes && antes.por) || {}).forEach(chave => {
        const tinha = antes.por[chave];
        const tem = ((depois && depois.por) || {})[chave] || 0;
        if (tinha > tem) partes.push((tinha - tem) + ' ' + (nomes[chave] || chave));
    });
    return partes;
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
