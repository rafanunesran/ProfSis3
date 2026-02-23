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
    window.location.href = 'index.html';
}

function getStorageKey(user) {
    if (user && user.role === 'gestor') {
        return 'app_data_school_' + (user.schoolId || 'default') + '_gestor';
    }
    // Prioriza o UID para segurança. Se não existir (modo local/antigo), usa o ID numérico.
    if (user && user.uid) {
        return 'app_data_' + user.uid;
    }
    return 'app_data_' + (user ? user.id : 'temp'); // Fallback
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