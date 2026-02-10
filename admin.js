// --- LÓGICA DO SUPER ADMIN ---
let escolaAtualAdmin = null;

function iniciarAdmin() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'block';
    renderAdminEscolas();
}

async function fetchEscolas() {
    if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
        const data = await getData('system', 'schools_list');
        return (data && data.list && Array.isArray(data.list)) ? data.list : [];
    }
    return JSON.parse(localStorage.getItem('app_schools') || '[]');
}

async function saveEscolasData(escolas) {
    if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
        await saveData('system', 'schools_list', { list: escolas });
    } else {
        localStorage.setItem('app_schools', JSON.stringify(escolas));
    }
}

async function renderAdminEscolas() {
    const escolas = await fetchEscolas();
    document.getElementById('adminEscolasScreen').style.display = 'block';
    document.getElementById('adminEscolaDetalheScreen').style.display = 'none';

    const html = escolas.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Endereço</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${escolas.map(e => `
                    <tr>
                        <td><strong>${e.nome}</strong></td>
                        <td>${e.endereco || '-'}</td>
                        <td>
                            <button class="btn btn-info btn-sm" onclick="verUsuariosEscola('${e.id}')">👥 Usuários</button>
                            <button class="btn btn-secondary btn-sm" onclick="editarEscola('${e.id}')">✏️</button>
                            <button class="btn btn-danger btn-sm" onclick="excluirEscola('${e.id}')">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p class="empty-state">Nenhuma escola cadastrada.</p>';

    document.getElementById('listaEscolasAdmin').innerHTML = html;
}

function abrirModalEscola() {
    document.getElementById('adminEscolaId').value = '';
    document.getElementById('adminEscolaNome').value = '';
    document.getElementById('adminEscolaEndereco').value = '';
    document.getElementById('tituloModalEscola').textContent = 'Nova Escola';
    showModal('modalAdminEscola');
}

async function editarEscola(id) {
    const escolas = await fetchEscolas();
    const escola = escolas.find(e => e.id == id);
    if (escola) {
        document.getElementById('adminEscolaId').value = escola.id;
        document.getElementById('adminEscolaNome').value = escola.nome;
        document.getElementById('adminEscolaEndereco').value = escola.endereco || '';
        document.getElementById('tituloModalEscola').textContent = 'Editar Escola';
        showModal('modalAdminEscola');
    }
}

async function salvarEscola(e) {
    e.preventDefault();
    const id = document.getElementById('adminEscolaId').value;
    const nome = document.getElementById('adminEscolaNome').value;
    const endereco = document.getElementById('adminEscolaEndereco').value;
    let escolas = await fetchEscolas();

    if (id) {
        const escola = escolas.find(e => e.id == id);
        if (escola) {
            escola.nome = nome;
            escola.endereco = endereco;
        }
    } else {
        escolas.push({ id: Date.now(), nome, endereco });
    }
    await saveEscolasData(escolas);
    closeModal('modalAdminEscola');
    renderAdminEscolas();
}

async function excluirEscola(id) {
    if (confirm('Tem certeza? Isso não excluirá os usuários, mas eles ficarão sem escola.')) {
        let escolas = await fetchEscolas();
        escolas = escolas.filter(e => e.id != id);
        await saveEscolasData(escolas);
        renderAdminEscolas();
    }
}

async function verUsuariosEscola(escolaId) {
    escolaAtualAdmin = escolaId;
    const escolas = await fetchEscolas();
    const escola = escolas.find(e => e.id == escolaId);
    
    document.getElementById('adminEscolasScreen').style.display = 'none';
    document.getElementById('adminEscolaDetalheScreen').style.display = 'block';
    
    const container = document.getElementById('adminEscolaDetalheScreen');
    container.innerHTML = `
        <div class="card">
            <button class="btn btn-secondary" onclick="renderAdminEscolas()">← Voltar para Escolas</button>
            <h2 style="margin-top: 15px;">Escola: ${escola ? escola.nome : 'Desconhecida'}</h2>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin: 20px 0;">
                <h3>👥 Usuários Cadastrados</h3>
                <button class="btn btn-primary" onclick="abrirModalUsuarioAdmin()">+ Novo Usuário</button>
            </div>
            <div id="listaUsuariosEscolaAdmin"></div>
        </div>
    `;
    
    renderListaUsuariosAdmin();
}

async function renderListaUsuariosAdmin() {
    let users = [];
    if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
        const data = await getData('system', 'users_list');
        users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    } else {
        users = JSON.parse(localStorage.getItem('app_users') || '[]');
    }
    const usersEscola = users.filter(u => u.schoolId == escolaAtualAdmin);

    const html = usersEscola.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Perfil</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${usersEscola.map(u => `
                    <tr>
                        <td>${u.nome}</td>
                        <td>${u.email}</td>
                        <td><span class="badge ${u.role === 'gestor' ? 'badge-warning' : 'badge-info'}">${u.role || 'Professor'}</span></td>
                        <td>
                            <button class="btn btn-danger btn-sm" onclick="excluirUsuarioAdmin(${u.id})">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p class="empty-state">Nenhum usuário vinculado a esta escola.</p>';

    document.getElementById('listaUsuariosEscolaAdmin').innerHTML = html;
}

function abrirModalUsuarioAdmin() {
    document.getElementById('adminUsuarioId').value = '';
    document.getElementById('adminUsuarioNome').value = '';
    document.getElementById('adminUsuarioEmail').value = '';
    document.getElementById('adminUsuarioSenha').value = '';
    document.getElementById('adminUsuarioRole').value = 'professor';
    document.getElementById('tituloModalUsuarioAdmin').textContent = 'Novo Usuário';
    showModal('modalAdminUsuario');
}

async function salvarUsuarioAdmin(e) {
    e.preventDefault();
    const id = document.getElementById('adminUsuarioId').value;
    const nome = document.getElementById('adminUsuarioNome').value;
    const email = document.getElementById('adminUsuarioEmail').value.trim().toLowerCase();
    const senha = document.getElementById('adminUsuarioSenha').value;
    const role = document.getElementById('adminUsuarioRole').value;

    let users = [];
    if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
        const data = await getData('system', 'users_list');
        users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    } else {
        users = JSON.parse(localStorage.getItem('app_users') || '[]');
    }

    if (id) {
        const u = users.find(x => x.id == id);
        if (u) {
            u.nome = nome;
            u.email = email;
            if (senha) u.senha = senha;
            u.role = role;
            if (!u.schoolId && escolaAtualAdmin) u.schoolId = escolaAtualAdmin;
        }
    } else {
        if (users.find(u => u.email === email)) {
            alert('Email já cadastrado!');
            return;
        }
        users.push({ id: Date.now(), nome, email, senha: senha || '123456', role, schoolId: escolaAtualAdmin, mustChangePassword: true });
    }

    if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
        await saveData('system', 'users_list', { list: users });
    } else {
        localStorage.setItem('app_users', JSON.stringify(users));
    }
    closeModal('modalAdminUsuario');
    renderListaUsuariosAdmin();
}

async function excluirUsuarioAdmin(id) {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
        let users = [];
        if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
            const data = await getData('system', 'users_list');
            users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
        } else {
            users = JSON.parse(localStorage.getItem('app_users') || '[]');
        }

        users = users.filter(u => u.id != id);

        if (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
            await saveData('system', 'users_list', { list: users });
        } else {
            localStorage.setItem('app_users', JSON.stringify(users));
        }
        renderListaUsuariosAdmin();
    }
}