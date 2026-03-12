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

function getStatusColor(status) {
    const cores = {
        'pendente': '#ffc107',
        'notificado': '#3182ce',
        'entregue': '#22c55e',
        'entregue_atraso': '#f59e0b',
        'nao_entregue': '#ef4444'
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
        ocorrencias: [], gradeHoraria: [], agendamentos: [],
        registrosAdministrativos: [], mapeamentos: []
    };
}