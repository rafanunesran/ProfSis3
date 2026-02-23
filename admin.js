// --- LÓGICA DO SUPER ADMIN ---
let escolaAtualAdmin = null;

function iniciarAdmin() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'block';
    renderAdminEscolas();
    renderBackupOptions(); // Nova função
}

async function fetchEscolas() {
    const data = await getData('system', 'schools_list');
    return (data && data.list && Array.isArray(data.list)) ? data.list : [];
}

async function saveEscolasData(escolas) {
    await saveData('system', 'schools_list', { list: escolas });
}

async function renderAdminEscolas() {
    const escolas = await fetchEscolas();
    document.getElementById('adminEscolasScreen').style.display = 'block';
    document.getElementById('adminEscolaDetalheScreen').style.display = 'none';
    document.getElementById('adminBackupScreen').style.display = 'none';

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
    document.getElementById('adminBackupScreen').style.display = 'none';
    
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
    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
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
                            <button class="btn btn-warning btn-sm" onclick="resetarSenhaAuth('${u.email}')" title="Enviar email de redefinição">📧 Senha</button>
                            <button class="btn btn-secondary btn-sm" onclick="editarUsuarioAdmin('${u.id}')" title="Alterar Perfil/Nome">✏️ Perfil</button>
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
    alert('A criação de novos usuários deve ser feita pela tela pública de "Cadastro" para garantir a segurança da senha.');
    // A criação direta pelo admin não é segura no lado do cliente.
    showModal('modalAdminUsuario');
}

// [NOVO] Função para abrir modal de edição
async function editarUsuarioAdmin(id) {
    const data = await getData('system', 'users_list');
    const users = (data && data.list) ? data.list : [];
    const user = users.find(u => u.id == id);

    if (user) {
        document.getElementById('adminUsuarioId').value = user.id;
        document.getElementById('adminUsuarioNome').value = user.nome;
        document.getElementById('adminUsuarioEmail').value = user.email;
        document.getElementById('adminUsuarioRole').value = user.role || 'professor';
        
        // Senha não é editável por aqui no modo Firebase
        const senhaInput = document.getElementById('adminUsuarioSenha');
        senhaInput.value = '';
        senhaInput.placeholder = 'Gerenciado pelo Auth (Inalterável aqui)';
        senhaInput.disabled = true;

        document.getElementById('tituloModalUsuarioAdmin').textContent = 'Editar Usuário';
        showModal('modalAdminUsuario');
    }
}

async function salvarUsuarioAdmin(e) {
    e.preventDefault();
    const id = document.getElementById('adminUsuarioId').value;
    const nome = document.getElementById('adminUsuarioNome').value;
    const email = document.getElementById('adminUsuarioEmail').value.trim().toLowerCase();
    const senha = document.getElementById('adminUsuarioSenha').value;
    const role = document.getElementById('adminUsuarioRole').value;

    const data = await getData('system', 'users_list');
    const users = (data && data.list && Array.isArray(data.list)) ? data.list : [];

    if (id) {
        const u = users.find(x => x.id == id);
        if (u) {
            u.nome = nome;
            u.email = email;
            if (senha) u.senha = senha;
            // Se estiver editando, não mexe na senha (segurança do Auth)
            if (senha && !USE_FIREBASE) u.senha = senha; 
            u.role = role;
            if (!u.schoolId && escolaAtualAdmin) u.schoolId = escolaAtualAdmin;
        }
    } else {
        if (users.find(u => u.email === email)) {
            alert('Email já cadastrado!');
            return;
        }
        users.push({ id: Date.now(), nome, email, senha: senha || '123456', role, schoolId: escolaAtualAdmin, mustChangePassword: true });
        // A criação de novos usuários deve ser feita pela tela de cadastro pública
        // para que o Firebase Auth possa lidar com a senha de forma segura.
        alert('Função desativada. Use a tela de "Cadastro" pública para criar novos usuários.');
        closeModal('modalAdminUsuario');
        return;
    }

    await saveData('system', 'users_list', { list: users });
    closeModal('modalAdminUsuario');
    renderListaUsuariosAdmin();
}

async function excluirUsuarioAdmin(id) {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
        const data = await getData('system', 'users_list');
        let users = (data && data.list && Array.isArray(data.list)) ? data.list : [];
        users = users.filter(u => u.id != id);
        await saveData('system', 'users_list', { list: users });
        renderListaUsuariosAdmin();
    }
}

// [NOVO] Função para resetar senha via Firebase Auth
async function resetarSenhaAuth(email) {
    // Verifica se está usando Firebase
    if (typeof firebase === 'undefined' || (typeof USE_FIREBASE !== 'undefined' && !USE_FIREBASE)) {
        alert('No modo Local (Offline), você pode alterar a senha clicando no botão de Editar (lápis) e mudando o texto manualmente.');
        return;
    }

    if (!confirm(`Deseja enviar um e-mail de redefinição de senha para:\n${email}?`)) return;

    try {
        await firebase.auth().sendPasswordResetEmail(email);
        alert(`✅ Sucesso!\n\nUm e-mail foi enviado para ${email} com um link para ele criar uma nova senha.`);
    } catch (error) {
        console.error("Erro reset senha:", error);
        if (error.code === 'auth/user-not-found') {
            alert('Erro: Este usuário existe na sua lista, mas não foi encontrado no Firebase Auth.\n\nUse o botão "Migrar Usuários" na aba de Backup.');
        } else {
            alert('Erro ao enviar e-mail: ' + error.message);
        }
    }
}

async function sincronizarUIDsERemoverSenhas() {
    if (!USE_FIREBASE || typeof firebase === 'undefined') return alert('Firebase não está ativo.');
    if (!confirm('ATENÇÃO: Este processo irá logar em cada conta para obter o ID de segurança (UID) e REMOVER a senha do banco de dados. É um passo CRUCIAL para a segurança.\n\nO processo pode demorar. Abra o console (F12) para ver o progresso.\n\nContinuar?')) return;

    const usersData = await getData('system', 'users_list');
    if (!usersData || !usersData.list) return alert('Lista de usuários não encontrada.');
    const users = usersData.list;

    console.log(`🚀 Iniciando sincronização de ${users.length} usuários...`);
    let sucessos = 0;
    let erros = 0;
    let jaSincronizados = 0;
    let alterado = false;

    // Precisamos da senha do admin para re-logar no final do processo
    const adminEmail = currentUser.email;
    const adminPass = prompt(`Para re-autenticar no final, por favor, insira a senha do Super Admin (${adminEmail}):`);
    if (!adminPass) return alert('Senha do admin necessária para continuar.');

    for (const u of users) {
        // Pula o super admin hardcoded e usuários já limpos
        if (u.id === 'admin' || (u.uid && !u.hasOwnProperty('senha'))) {
            console.log(`ℹ️ Já limpo/ignorado: ${u.email}`);
            jaSincronizados++;
            continue;
        }

        if (!u.email || !u.senha) {
            console.warn(`⚠️ Pulado (sem email/senha): ${u.nome}`);
            if (u.senha) delete u.senha; // Limpa mesmo se não tiver email
            continue;
        }

        try {
            const userCredential = await firebase.auth().signInWithEmailAndPassword(u.email, u.senha);
            const userAuth = userCredential.user;

            console.log(`✅ Logado como ${u.email}, UID: ${userAuth.uid}`);
            u.uid = userAuth.uid; // Adiciona o UID
            delete u.senha;       // REMOVE A SENHA
            alterado = true;
            sucessos++;

            await firebase.auth().signOut(); // Desloga para o próximo

        } catch (e) {
            console.error(`❌ Erro ao logar em ${u.email}:`, e.message);
            erros++;
            if (firebase.auth().currentUser) await firebase.auth().signOut();
        }
    }

    if (alterado) {
        console.log(`💾 Salvando lista de usuários atualizada no banco de dados...`);
        await saveData('system', 'users_list', { list: users });
    }

    alert(`Sincronização Finalizada!\n\n✅ Sincronizados e Limpos: ${sucessos}\nℹ️ Já estavam OK: ${jaSincronizados}\n❌ Erros: ${erros}\n\nO sistema será recarregado.`);
    location.reload();
}

// --- BACKUP E MIGRAÇÃO ---
function renderBackupOptions() {
    // Cria a tela de backup se não existir
    if (!document.getElementById('adminBackupScreen')) {
        const div = document.createElement('div');
        div.id = 'adminBackupScreen';
        div.style.display = 'none';
        div.innerHTML = `
            <div class="card" style="margin-top: 20px; border-left: 5px solid #805ad5;">
                <h2>💾 Backup e Migração de Dados</h2>
                <p>Use esta ferramenta para transferir dados do seu computador (Local) para a internet (Firebase) ou para fazer cópias de segurança.</p>
                
                <div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap;">
                    <div style="flex: 1; background: #f7fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h3>1. Exportar (Baixar)</h3>
                        <p style="font-size: 13px; color: #666;">Gera um arquivo com todos os dados atuais deste navegador.</p>
                        <button class="btn btn-primary" onclick="exportarDadosSistema()">⬇️ Baixar Arquivo de Dados</button>
                    </div>

                    <div style="flex: 1; background: #f7fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h3>2. Importar (Subir)</h3>
                        <p style="font-size: 13px; color: #666;">Envia os dados de um arquivo para o sistema atual (Local ou Firebase).</p>
                        <input type="file" id="fileBackupImport" accept=".json" style="margin-bottom: 10px;">
                        <button class="btn btn-success" onclick="importarDadosSistema()">⬆️ Importar e Salvar</button>
                    </div>

                    <div style="flex: 1; background: #fffaf0; padding: 15px; border-radius: 8px; border: 1px solid #fbd38d;">
                        <h3>3. Migração Auth</h3>
                        <h3>3. Migração Inicial</h3>
                        <p style="font-size: 13px; color: #666;">Cria usuários no Firebase Auth baseados na lista atual.</p>
                        <button class="btn btn-warning" onclick="migrarUsuariosParaFirebase()">🚀 Migrar Usuários para Auth</button>
                    </div>
                </div>
            </div>
        `;
        document.querySelector('#adminContainer .container').appendChild(div);
    }
    
    // Adiciona botão no header se não existir
    const header = document.querySelector('#adminContainer header div');
    if (!document.getElementById('btnNavBackup')) {
        const btn = document.createElement('button');
        btn.id = 'btnNavBackup';
        btn.className = 'btn btn-secondary';
        btn.style.marginRight = '10px';
        btn.textContent = '💾 Migração';
        btn.onclick = () => {
            document.getElementById('adminEscolasScreen').style.display = 'none';
            document.getElementById('adminEscolaDetalheScreen').style.display = 'none';
            document.getElementById('adminBackupScreen').style.display = 'block';
        };
        header.insertBefore(btn, header.lastElementChild); // Antes do Sair
    }
}

function exportarDadosSistema() {
    const backup = {};
    // Coleta tudo do LocalStorage que pertence ao app
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('app_') || key === 'users_list' || key === 'schools_list') {
            backup[key] = JSON.parse(localStorage.getItem(key));
        }
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "profsis_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

async function importarDadosSistema() {
    const fileInput = document.getElementById('fileBackupImport');
    const file = fileInput.files[0];
    if (!file) return alert('Selecione um arquivo .json');

    if (!confirm('ATENÇÃO: Isso substituirá os dados atuais pelos do arquivo. Se estiver online, salvará no Firebase. Continuar?')) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            
            // Processa cada chave
            for (const [key, value] of Object.entries(backup)) {
                if (key === 'app_users') await saveData('system', 'users_list', { list: value });
                else if (key === 'app_schools') await saveData('system', 'schools_list', { list: value });
                else if (key.startsWith('app_data_')) await saveData('app_data', key, value);
                else localStorage.setItem(key, JSON.stringify(value)); // Outros locais
            }
            alert('Importação concluída com sucesso! Recarregue a página.');
            location.reload();
        } catch (err) {
            alert('Erro ao importar: ' + err.message);
        }
    };
    reader.readAsText(file);
}