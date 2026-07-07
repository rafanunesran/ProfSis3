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

    let html = `
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom: 15px;">
            <button class="btn btn-info" onclick="abrirModalConfigGerais()">⚙️ Config. Globais (Estado/Região)</button>
        </div>
    `;

    html += escolas.length > 0 ? `
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

function garantirCamposEscola() {
    const form = document.querySelector('#modalAdminEscola form');
    if (form && !document.getElementById('adminEscolaNomeCompleto')) {
        const btnSubmit = form.querySelector('button[type="submit"]');
        if (btnSubmit) {
            const extras = document.createElement('div');
            extras.innerHTML = `
                <label>Nome Completo da Escola (Para Documentos):
                    <input type="text" id="adminEscolaNomeCompleto" style="width:100%; padding:8px; margin-bottom:10px;" placeholder="Ex: E.E. PEI PROFESSORA FRANCISCA LISBOA PERALTA">
                </label>
                <label>Logo da Escola (Cabeçalho e Docs):
                    <input type="file" accept="image/*" style="width:100%; margin-bottom:10px;" onchange="converterImagemBase64(this, 'adminEscolaLogoBase64', 'previewLogoEscola')">
                    <input type="hidden" id="adminEscolaLogoBase64">
                    <div style="margin-bottom:10px;">
                        <img id="previewLogoEscola" style="max-height:80px; display:none; border-radius: 4px;">
                    </div>
                </label>
            `;
            form.insertBefore(extras, btnSubmit);
        }
    }
}

function converterImagemBase64(input, hiddenId, previewId) {
    if (input.files && input.files[0]) {
        if (input.files[0].size > 2 * 1024 * 1024) {
            alert('A imagem é muito grande. Escolha uma imagem de até 2MB.');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const hiddenField = document.getElementById(hiddenId);
            if(hiddenField) hiddenField.value = e.target.result;
            const preview = document.getElementById(previewId);
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function abrirModalConfigGerais() {
    const configData = await getData('system', 'config_sistema') || {};
    
    if (!document.getElementById('modalConfigGerais')) {
        const div = document.createElement('div');
        div.id = 'modalConfigGerais';
        div.className = 'modal';
        document.body.appendChild(div);
    }
    
    document.getElementById('modalConfigGerais').innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3>⚙️ Configurações Globais (Estado/Região)</h3>
            <p style="font-size:12px; color:#666;">Estas configurações aparecem no cabeçalho dos documentos gerados (ex: Planos de Aula).</p>
            <form onsubmit="salvarConfigGerais(event)">
                <label>Região (Ex: REGIÃO OSASCO):
                    <input type="text" id="configRegiao" value="${configData.regiao || ''}" style="width:100%; padding:8px; margin-bottom:10px;">
                </label>
                <label>Logo do Estado/Governo:
                    <input type="file" accept="image/*" style="width:100%; margin-bottom:10px;" onchange="converterImagemBase64(this, 'configLogoEstadoBase64', 'previewLogoEstado')">
                    <input type="hidden" id="configLogoEstadoBase64" value="${configData.logoEstado || ''}">
                    <div style="margin-bottom:10px;">
                        <img id="previewLogoEstado" src="${configData.logoEstado || ''}" style="max-height:80px; ${configData.logoEstado ? 'display:block;' : 'display:none;'} border-radius: 4px;">
                    </div>
                </label>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('modalConfigGerais')">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Salvar</button>
                </div>
            </form>
        </div>
    `;
    showModal('modalConfigGerais');
}

async function salvarConfigGerais(e) {
    e.preventDefault();
    const configData = await getData('system', 'config_sistema') || {};
    configData.regiao = document.getElementById('configRegiao').value;
    configData.logoEstado = document.getElementById('configLogoEstadoBase64').value;
    
    await saveData('system', 'config_sistema', configData);
    alert('Configurações globais salvas com sucesso!');
    closeModal('modalConfigGerais');
}

function abrirModalEscola() {
    garantirCamposEscola();
    document.getElementById('adminEscolaId').value = '';
    document.getElementById('adminEscolaNome').value = '';
    document.getElementById('adminEscolaEndereco').value = '';
    document.getElementById('adminEscolaNomeCompleto').value = '';
    document.getElementById('adminEscolaLogoBase64').value = '';
    const preview = document.getElementById('previewLogoEscola');
    if (preview) preview.style.display = 'none';
    document.getElementById('tituloModalEscola').textContent = 'Nova Escola';
    showModal('modalAdminEscola');
}

async function editarEscola(id) {
    garantirCamposEscola();
    const escolas = await fetchEscolas();
    const escola = escolas.find(e => e.id == id);
    if (escola) {
        document.getElementById('adminEscolaId').value = escola.id;
        document.getElementById('adminEscolaNome').value = escola.nome;
        document.getElementById('adminEscolaEndereco').value = escola.endereco || '';
        document.getElementById('adminEscolaNomeCompleto').value = escola.nomeCompleto || '';
        document.getElementById('adminEscolaLogoBase64').value = escola.logoEscola || '';
        const preview = document.getElementById('previewLogoEscola');
        if (preview) {
            if (escola.logoEscola) {
                preview.src = escola.logoEscola;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        }
        document.getElementById('tituloModalEscola').textContent = 'Editar Escola';
        showModal('modalAdminEscola');
    }
}

async function salvarEscola(e) {
    e.preventDefault();
    const id = document.getElementById('adminEscolaId').value;
    const nome = document.getElementById('adminEscolaNome').value;
    const endereco = document.getElementById('adminEscolaEndereco').value;
    const nomeCompleto = document.getElementById('adminEscolaNomeCompleto').value;
    const logoEscola = document.getElementById('adminEscolaLogoBase64').value;
    let escolas = await fetchEscolas();

    if (id) {
        const escola = escolas.find(e => e.id == id);
        if (escola) {
            escola.nome = nome;
            escola.endereco = endereco;
            escola.nomeCompleto = nomeCompleto;
            escola.logoEscola = logoEscola;
        }
    } else {
        escolas.push({ id: Date.now(), nome, endereco, nomeCompleto, logoEscola });
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
                ${usersEscola.map(u => {
                    const roleMap = {
                        'gestor': { label: 'Gestor', class: 'badge-warning' },
                        'aee': { label: 'AEE', class: 'badge-success' },
                        'projeto': { label: 'Projeto', class: 'badge-info' },
                        'professor': { label: 'Professor', class: 'badge-info' }
                    };
                    const roleInfo = roleMap[u.role] || roleMap['professor'];
                    return `
                    <tr>
                        <td>${u.nome}</td>
                        <td>${u.email}</td>
                        <td><span class="badge ${roleInfo.class}">${roleInfo.label}</span></td>
                        <td>
                            <button class="btn btn-warning btn-sm" onclick="resetarSenhaAuth('${u.email}')" title="Enviar email de redefinição">📧 Senha</button>
                            <button class="btn btn-secondary btn-sm" onclick="editarUsuarioAdmin('${u.id}')" title="Alterar Perfil/Nome">✏️ Perfil</button>
                            <button class="btn btn-danger btn-sm" onclick="excluirUsuarioAdmin(${u.id})">🗑️</button>
                        </td>
                    </tr>
                `}).join('')}
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
    
    const selectRole = document.getElementById('adminUsuarioRole');
    selectRole.innerHTML = `
        <option value="professor">Professor</option>
        <option value="gestor">Gestor</option>
        <option value="aee">AEE</option>
        <option value="projeto">Projeto</option>
    `;
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
        const selectRole = document.getElementById('adminUsuarioRole');
        selectRole.innerHTML = `
            <option value="professor">Professor</option>
            <option value="gestor">Gestor</option>
            <option value="aee">AEE</option>
            <option value="projeto">Projeto</option>
        `;

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
                        <p style="font-size: 13px; color: #666;">Cria usuários no Firebase Auth baseados na lista atual.</p>
                        <button class="btn btn-warning" onclick="migrarUsuariosParaFirebase()">🚀 Migrar Usuários para Auth</button>
                    </div>

                    <div style="flex: 1; background: #ebf8ff; padding: 15px; border-radius: 8px; border: 1px solid #bee3f8;">
                        <h3>4. Migração de Dados (Perfis)</h3>
                        <p style="font-size: 13px; color: #666;">Recupera listas de alunos de perfis AEE/Projeto que foram salvas individualmente antes da mudança para o modo compartilhado.</p>
                        <button class="btn btn-info" onclick="migrarDadosAEECompartilhado()">🚀 Migrar Dados AEE/Projeto</button>
                    </div>

                    <div style="flex: 1; background: #faf5ff; padding: 15px; border-radius: 8px; border: 1px solid #d6bcfa;">
                        <h3>🤖 Chave de IA (Gemini)</h3>
                        <p style="font-size: 13px; color: #666;">Configure a chave da API para evitar vazamentos no GitHub.</p>
                        <button class="btn btn-primary" onclick="configurarChaveIA()">🔑 Configurar Chave</button>
                    </div>

                    <div style="flex: 1; background: #f0fff4; padding: 15px; border-radius: 8px; border: 1px solid #9ae6b4;">
                        <h3>📚 Base Curricular Oficial</h3>
                        <p style="font-size: 13px; color: #666;">Envie a planilha de escopo-sequência e os PDFs oficiais (Cadernos, Material Digital, Guia Priorizado) que o Estagiário IA usa como fonte de verdade.</p>
                        <button class="btn btn-success" onclick="abrirModalBaseCurricular()">📚 Gerenciar Base Curricular</button>
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

async function migrarDadosAEECompartilhado() {
    if (!confirm('Isso irá buscar as listas de "Meus Alunos" antigas de cada usuário AEE/Projeto e adicioná-las à nova lista compartilhada da escola. Deseja continuar?')) return;

    console.log('Iniciando migração de dados AEE/Projeto...');
    let totalMigrados = 0;
    let perfisProcessados = 0;

    try {
        const usersData = await getData('system', 'users_list');
        const users = (usersData && usersData.list) ? usersData.list : [];

        const aeeUsers = users.filter(u => u.role === 'aee' || u.role === 'projeto');

        for (const user of aeeUsers) {
            if (!user.uid || !user.schoolId) {
                console.warn(`Pulando ${user.nome} (sem UID ou ID da escola).`);
                continue;
            }

            const oldKey = `app_data_${user.uid}`;
            const newKey = `app_data_school_${user.schoolId}_${user.role}`;

            const oldData = await getData('app_data', oldKey);

            if (oldData && oldData.tutorados && oldData.tutorados.length > 0) {
                console.log(`Encontrados ${oldData.tutorados.length} alunos para ${user.nome} no perfil ${user.role}.`);
                perfisProcessados++;

                let sharedData = await getData('app_data', newKey);
                if (!sharedData) sharedData = { tutorados: [] };
                if (!sharedData.tutorados) sharedData.tutorados = [];

                let migradosNestePerfil = 0;
                oldData.tutorados.forEach(alunoAntigo => {
                    const jaExiste = sharedData.tutorados.some(a => a.id_estudante_origem == alunoAntigo.id_estudante_origem);
                    if (!jaExiste) {
                        sharedData.tutorados.push(alunoAntigo);
                        migradosNestePerfil++;
                    }
                });

                if (migradosNestePerfil > 0) {
                    console.log(`Migrando ${migradosNestePerfil} novos alunos para o repositório compartilhado '${user.role}' da escola ${user.schoolId}.`);
                    await saveData('app_data', newKey, sharedData);
                    totalMigrados += migradosNestePerfil;
                }
            }
        }
        alert(`Migração concluída!\n\nPerfis com dados encontrados: ${perfisProcessados}\nTotal de alunos novos migrados: ${totalMigrados}`);
    } catch (e) {
        console.error("Erro durante a migração AEE/Projeto:", e);
        alert('Ocorreu um erro durante a migração. Verifique o console (F12).');
    }
}

async function configurarChaveIA() {
    const configData = await getData('system', 'config_ia') || {};
    const chaveAtual = configData.apiKey || '';

    const novaChave = prompt("Insira a chave da API do Google Gemini:\n(Se quiser adicionar mais de uma, separe por vírgula)", chaveAtual);

    if (novaChave !== null) {
        configData.apiKey = novaChave.trim();
        await saveData('system', 'config_ia', configData);
        alert('Chave de API salva com segurança no banco de dados!');
    }
}

// --- BASE CURRICULAR OFICIAL (fundamentação do Estagiário IA) ---
// Coleções compartilhadas entre TODAS as escolas (Currículo Paulista é o mesmo pra rede toda, ao
// contrário do catálogo de Material Digital que é por escola): curriculo_escopo_sequencia (linhas da
// planilha oficial), curriculo_chunks_embeddings (trechos de PDF com embedding pra busca semântica) e
// curriculo_ingest_manifest (um doc por arquivo já enviado, pra saber o que já foi processado).

// Estado "armado" dos botões de reenvio (planilha/PDF já enviados antes com o mesmo conteúdo) e da
// remoção por linha - tudo via UI inline no próprio modal, sem depender de confirm()/alert() nativos
// do navegador (que o Chrome pode passar a suprimir silenciosamente numa aba depois que o usuário marca
// "impedir que esta página crie caixas de diálogo adicionais" num popup anterior).
let uploadXlsxArmadoBaseCurricular = false;
let uploadPdfArmadoBaseCurricular = false;
const docsArmadosParaRemocaoBaseCurricular = new Map(); // manifestDocId -> timeoutId

function mostrarMensagemBaseCurricular(texto, tipo) {
    const el = document.getElementById('baseCurricularMensagem');
    if (!el) return;
    const estilos = {
        sucesso: { bg: '#f0fff4', border: '#9ae6b4', cor: '#276749' },
        erro: { bg: '#fff5f5', border: '#feb2b2', cor: '#c53030' },
        aviso: { bg: '#fffaf0', border: '#fbd38d', cor: '#975a16' },
        info: { bg: '#ebf8ff', border: '#bee3f8', cor: '#2b6cb0' }
    };
    const estilo = estilos[tipo] || estilos.info;
    el.style.display = 'block';
    el.style.background = estilo.bg;
    el.style.border = `1px solid ${estilo.border}`;
    el.style.color = estilo.cor;
    el.textContent = texto;
}

function esconderMensagemBaseCurricular() {
    const el = document.getElementById('baseCurricularMensagem');
    if (el) el.style.display = 'none';
}

function resetUploadArmadoBaseCurricular(tipo) {
    if (tipo === 'xlsx') {
        uploadXlsxArmadoBaseCurricular = false;
        const btn = document.getElementById('btnProcessarXlsxBaseCurricular');
        if (btn) btn.textContent = 'Processar e Enviar';
    }
    if (tipo === 'pdf') {
        uploadPdfArmadoBaseCurricular = false;
        const btn = document.getElementById('btnProcessarPdfBaseCurricular');
        if (btn) btn.textContent = 'Processar e Enviar';
    }
    esconderMensagemBaseCurricular();
}

function abrirModalBaseCurricular() {
    if (!document.getElementById('modalBaseCurricular')) {
        const div = document.createElement('div');
        div.id = 'modalBaseCurricular';
        div.className = 'modal';
        document.body.appendChild(div);
    }

    // Reseta qualquer estado "armado" de uma sessão anterior do modal.
    uploadXlsxArmadoBaseCurricular = false;
    uploadPdfArmadoBaseCurricular = false;
    docsArmadosParaRemocaoBaseCurricular.forEach(timeoutId => clearTimeout(timeoutId));
    docsArmadosParaRemocaoBaseCurricular.clear();

    const seriesCheckboxesFundamental = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
        .map(s => `<label style="font-size:12px; display:inline-flex; align-items:center; gap:3px; margin-right:8px;"><input type="checkbox" class="chk-serie-base-curricular" value="${s}">${s}º</label>`)
        .join('');
    // Ensino Médio usa "EM1/EM2/EM3" (não "1/2/3") porque turmas de EM aqui também são nomeadas com
    // "Ano" (ex: "1º Ano EM") - reaproveitar os mesmos valores 1/2/3 do Fundamental colidiria com o
    // 1º/2º/3º Ano do Fundamental na hora de buscar. Ver resolverSerieChaveCurriculoOficial (mesmo
    // critério aplicado do lado da busca, em ia_estagiario.js).
    const seriesCheckboxesMedio = ['1', '2', '3']
        .map(s => `<label style="font-size:12px; display:inline-flex; align-items:center; gap:3px; margin-right:8px;"><input type="checkbox" class="chk-serie-base-curricular" value="EM${s}">${s}ª EM</label>`)
        .join('');

    document.getElementById('modalBaseCurricular').innerHTML = `
        <div class="modal-content" style="max-width: 750px;">
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                <h2 style="margin:0;">📚 Base Curricular Oficial</h2>
                <button class="btn btn-sm btn-danger" style="padding:2px 8px;" onclick="closeModal('modalBaseCurricular')">×</button>
            </div>
            <p style="font-size:13px; color:#666; margin-bottom:15px;">Os documentos enviados aqui ficam disponíveis pra todas as escolas da rede usarem como fonte de verdade no Estagiário IA (não precisa reenviar por escola).</p>

            <div id="baseCurricularMensagem" style="display:none; margin-bottom:15px; padding:10px 12px; border-radius:6px; font-size:13px;"></div>

            <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
                <div style="flex:1; min-width:260px; background:#f7fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                    <h3 style="margin-top:0; font-size:15px;">📊 Planilha de Escopo-Sequência (.xlsx)</h3>
                    <p style="font-size:12px; color:#718096;">Cada aba = uma disciplina. As colunas de Bimestre/Aula/Habilidade/Conteúdo são lidas automaticamente.</p>
                    <input type="file" id="baseCurricularArquivoXlsx" accept=".xlsx" style="width:100%; margin-bottom:10px; font-size:12px;" onchange="resetUploadArmadoBaseCurricular('xlsx')">
                    <button class="btn btn-primary btn-sm" id="btnProcessarXlsxBaseCurricular" onclick="processarPlanilhaCurriculo()">Processar e Enviar</button>
                </div>
                <div style="flex:1; min-width:260px; background:#fffaf0; padding:15px; border-radius:8px; border:1px solid #fbd38d;">
                    <h3 style="margin-top:0; font-size:15px;">📄 Documento em PDF</h3>
                    <select id="baseCurricularTipoPdf" style="width:100%; padding:6px; margin-bottom:8px; font-size:12px;">
                        <option value="caderno_aluno">Caderno do Aluno</option>
                        <option value="caderno_professor">Caderno do Professor</option>
                        <option value="material_digital_pdf">Material Digital</option>
                        <option value="guia_priorizado">Guia Priorizado</option>
                        <option value="outros">Outros (documento esporádico)</option>
                    </select>
                    <input type="text" id="baseCurricularDisciplinaPdf" placeholder="Disciplina (deixe em branco se cobrir várias)" style="width:100%; padding:6px; margin-bottom:8px; font-size:12px; box-sizing:border-box;">
                    <div style="margin-bottom:8px;">
                        <label style="font-size:11px; font-weight:bold; display:block; margin-bottom:3px;">Série(s) - Ensino Fundamental:</label>
                        ${seriesCheckboxesFundamental}
                    </div>
                    <div style="margin-bottom:8px;">
                        <label style="font-size:11px; font-weight:bold; display:block; margin-bottom:3px;">Série(s) - Ensino Médio:</label>
                        ${seriesCheckboxesMedio}
                        <label style="font-size:12px; display:inline-flex; align-items:center; gap:3px; font-weight:bold; margin-left:10px;"><input type="checkbox" id="chkSerieTodasBaseCurricular">Todas (Fund. + Médio)</label>
                    </div>
                    <input type="file" id="baseCurricularArquivoPdf" accept=".pdf" style="width:100%; margin-bottom:8px; font-size:12px;" onchange="resetUploadArmadoBaseCurricular('pdf')">
                    <p style="font-size:11px; color:#718096; margin-bottom:10px;">🤖 O texto é extraído com IA (Gemini), que lida bem com colunas/tabelas - usa a mesma chave já configurada na "Chave de IA".</p>
                    <button class="btn btn-primary btn-sm" id="btnProcessarPdfBaseCurricular" onclick="processarPdfCurriculo()">Processar e Enviar</button>
                </div>
            </div>

            <div id="baseCurricularProgresso" style="display:none; margin-bottom:15px;">
                <div style="background:#e2e8f0; border-radius:6px; overflow:hidden; height:18px;">
                    <div id="baseCurricularBarraProgresso" style="background:#4299e1; height:100%; width:0%; transition:width .2s;"></div>
                </div>
                <p id="baseCurricularProgressoTexto" style="font-size:12px; color:#666; margin-top:4px;"></p>
            </div>

            <h3 style="font-size:15px; border-top:1px solid #e2e8f0; padding-top:15px;">Documentos já enviados</h3>
            <div id="listaBaseCurricular" style="max-height:220px; overflow-y:auto;">Carregando...</div>
        </div>
    `;
    showModal('modalBaseCurricular');
    listarDocumentosBaseCurricular();
}

function carregarScriptBaseCurricular(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Falha ao carregar biblioteca: ' + src));
        document.head.appendChild(script);
    });
}

async function carregarBibliotecaBaseCurricular(tipo) {
    if (tipo === 'xlsx' && typeof XLSX === 'undefined') {
        await carregarScriptBaseCurricular('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    }
}

async function calcularHashArquivoBaseCurricular(arrayBuffer) {
    const buffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizarIdManifestoBaseCurricular(nomeArquivo) {
    return nomeArquivo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 120);
}

function definirProgressoBaseCurricular(texto, percentual) {
    const container = document.getElementById('baseCurricularProgresso');
    const barra = document.getElementById('baseCurricularBarraProgresso');
    const label = document.getElementById('baseCurricularProgressoTexto');
    if (!container) return;
    container.style.display = 'block';
    if (barra && typeof percentual === 'number') barra.style.width = Math.round(percentual) + '%';
    if (label) label.textContent = texto || '';
}

function esconderProgressoBaseCurricular() {
    const container = document.getElementById('baseCurricularProgresso');
    if (container) container.style.display = 'none';
}

async function apagarDocsEmLotesBaseCurricular(snap) {
    if (snap.empty) return;
    const lotes = [];
    let loteAtual = db.batch();
    let contador = 0;
    snap.forEach(doc => {
        loteAtual.delete(doc.ref);
        contador++;
        if (contador === 450) { lotes.push(loteAtual); loteAtual = db.batch(); contador = 0; }
    });
    if (contador > 0) lotes.push(loteAtual);
    for (const lote of lotes) await lote.commit();
}

// --- Planilha de Escopo-Sequência ---

// Formatos de coluna conhecidos das planilhas oficiais. A planilha "Anos Iniciais" traz código+texto
// da habilidade juntos numa célula (HABILIDADES); a planilha "Anos Finais" (eletivas complementares)
// traz em colunas separadas (HABILIDADE - CÓDIGO / HABILIDADE - TEXTO). Uma aba com cabeçalhos que não
// batem com nenhum formato conhecido é ignorada (com aviso) em vez de gravar dado errado.
const FORMATOS_PLANILHA_CURRICULO = [
    {
        chave: 'AI_PADRAO',
        detectar: headers => headers.includes('HABILIDADES') && !headers.includes('HABILIDADE - CÓDIGO'),
        campos: { ciclo: 'CICLO', ano: 'ANO', bimestre: 'BIMESTRE', aula: 'AULA', unidadeTematica: 'UNIDADE TEMÁTICA', objetoConhecimento: 'OBJETO DE CONHECIMENTO', titulo: 'TÍTULO', conteudo: 'CONTEÚDO', objetivos: 'OBJETIVOS' },
        habilidadesTipo: 'combinada', colunaHabilidade: 'HABILIDADES'
    },
    {
        chave: 'AF_COMPLEMENTAR',
        detectar: headers => headers.includes('HABILIDADE - CÓDIGO') && headers.includes('HABILIDADE - TEXTO'),
        campos: { ciclo: 'CICLO', ano: 'ANO', bimestre: 'BIMESTRE', aula: 'AULA', unidadeTematica: 'UNIDADE TEMÁTICA', objetoConhecimento: 'OBJETO DE CONHECIMENTO', titulo: 'TÍTULO DA AULA', conteudo: 'CONTEÚDO', objetivos: 'OBJETIVOS' },
        habilidadesTipo: 'separada', colunaCodigo: 'HABILIDADE - CÓDIGO', colunaTexto: 'HABILIDADE - TEXTO'
    }
];

function detectarFormatoPlanilhaCurriculo(headers) {
    return FORMATOS_PLANILHA_CURRICULO.find(f => f.detectar(headers)) || null;
}

function extrairHabilidadesCombinadasCurriculo(celula) {
    if (!celula) return [];
    const linhas = String(celula).split(/\n+/).map(l => l.trim()).filter(Boolean);
    const resultado = [];
    linhas.forEach(linha => {
        const m = linha.match(/EF\d{2}[A-Z]{2,4}\d{2,3}[A-Z]?/);
        if (m) {
            const texto = linha.replace(m[0], '').replace(/^[\s()\-–:]+/, '').replace(/[)\s]+$/, '').trim();
            resultado.push({ codigo: m[0], texto: texto || linha });
        } else if (resultado.length > 0) {
            resultado[resultado.length - 1].texto += ' ' + linha;
        } else {
            resultado.push({ codigo: '', texto: linha });
        }
    });
    return resultado;
}

function extrairHabilidadesSeparadasCurriculo(celulaCodigo, celulaTexto) {
    if (!celulaCodigo && !celulaTexto) return [];
    const limpa = s => String(s || '').replace(/^[\s\-–]+/, '').trim();
    const codigos = String(celulaCodigo || '').split(/\n+/).map(limpa).filter(Boolean);
    const textos = String(celulaTexto || '').split(/\n+/).map(limpa).filter(Boolean);
    const tamanho = Math.max(codigos.length, textos.length);
    const resultado = [];
    for (let i = 0; i < tamanho; i++) resultado.push({ codigo: codigos[i] || '', texto: textos[i] || '' });
    return resultado;
}

// Diferencia Ensino Médio de Ensino Fundamental quando os dois usam "Ano" pro mesmo número (ex: "1º
// Ano" do Fundamental vs "1º Ano EM"/"1º Ano do Ensino Médio") - sem isso, extrairSerieChaveMaterialDigital
// sozinha devolveria "1" pros dois, misturando os documentos dos dois segmentos na busca do Estagiário.
// Prefixa com "EM" só quando o texto original menciona "EM" ou "Médio". Duplicada em ia_estagiario.js
// (mesma convenção já usada no projeto pra funções pequenas usadas em contextos/arquivos diferentes).
function resolverSerieChaveCurriculoOficial(serieOriginal) {
    const digito = extrairSerieChaveMaterialDigital(serieOriginal);
    if (!digito) return '';
    const original = String(serieOriginal || '');
    // Sigla "EM" só em maiúsculas (ex: "1º Ano EM") - em minúsculas "em" é só a preposição comum do
    // português (ex: "6º Ano em Período Integral"), que não deve disparar a detecção.
    const temSiglaEM = /\bEM\b/.test(original);
    const semAcento = original.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const temPalavraMedio = /medio/.test(semAcento);
    return (temSiglaEM || temPalavraMedio) ? ('EM' + digito) : digito;
}

// Normaliza uma linha bruta da planilha (já lida pelo SheetJS como objeto {coluna: valor}) pro schema
// comum de curriculo_escopo_sequencia. Retorna null pra linhas "ruído" (ex: linhas espaçadoras de
// vendor tipo "MATIFIC", que não têm título nem conteúdo preenchidos).
function normalizarLinhaPlanilhaCurriculo(linhaBruta, formato, nomeAba, numeroLinha) {
    const val = campo => (linhaBruta[campo] !== undefined && linhaBruta[campo] !== null) ? String(linhaBruta[campo]).trim() : '';
    const c = formato.campos;
    const titulo = val(c.titulo);
    const conteudo = val(c.conteudo);
    if (!titulo && !conteudo) return null;

    const habilidades = formato.habilidadesTipo === 'combinada'
        ? extrairHabilidadesCombinadasCurriculo(val(formato.colunaHabilidade))
        : extrairHabilidadesSeparadasCurriculo(val(formato.colunaCodigo), val(formato.colunaTexto));

    const serieOriginal = val(c.ano);
    const unidadeTematica = val(c.unidadeTematica);
    const objetoConhecimento = val(c.objetoConhecimento);
    const objetivos = val(c.objetivos);
    const textoBuscavel = normalizarTextoComparacaoMaterialDigital(
        [titulo, unidadeTematica, objetoConhecimento, conteudo, objetivos].filter(Boolean).join(' ')
    );

    return {
        serieChave: resolverSerieChaveCurriculoOficial(serieOriginal),
        serieOriginal,
        ciclo: val(c.ciclo),
        bimestre: val(c.bimestre).replace(/\D/g, ''),
        aula: val(c.aula),
        unidadeTematica,
        objetoConhecimento,
        titulo,
        conteudo,
        objetivos,
        habilidades,
        textoBuscavel,
        fonteAba: nomeAba,
        fonteLinha: numeroLinha,
        atualizadoEm: Date.now()
    };
}

async function gravarLinhasCurriculoEmLotes(linhas, fonteArquivo, fonteAba) {
    const TAMANHO_LOTE = 450;
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const fatia = linhas.slice(i, i + TAMANHO_LOTE);
        const lote = db.batch();
        fatia.forEach(linha => {
            const ref = db.collection('curriculo_escopo_sequencia').doc();
            lote.set(ref, Object.assign({}, linha, { fonteArquivo, fonteAba }));
        });
        await lote.commit();
    }
}

async function apagarLinhasAbaCurriculo(fonteArquivo, fonteAba) {
    const snap = await db.collection('curriculo_escopo_sequencia')
        .where('fonteArquivo', '==', fonteArquivo)
        .where('fonteAba', '==', fonteAba)
        .get();
    await apagarDocsEmLotesBaseCurricular(snap);
}

async function processarPlanilhaCurriculo() {
    if (typeof db === 'undefined' || !db) return mostrarMensagemBaseCurricular('Sem conexão com o banco de dados.', 'erro');
    const input = document.getElementById('baseCurricularArquivoXlsx');
    if (!input.files || !input.files[0]) return mostrarMensagemBaseCurricular('Selecione um arquivo .xlsx primeiro.', 'aviso');
    const arquivo = input.files[0];
    const btn = document.getElementById('btnProcessarXlsxBaseCurricular');

    try {
        esconderMensagemBaseCurricular();
        definirProgressoBaseCurricular('Verificando arquivo...', 0);
        const bytes = await arquivo.arrayBuffer();
        const hash = await calcularHashArquivoBaseCurricular(bytes.slice(0));
        const manifestId = 'xlsx_' + sanitizarIdManifestoBaseCurricular(arquivo.name);
        const manifestExistente = await getData('curriculo_ingest_manifest', manifestId);

        // Em vez de um confirm() nativo (que o navegador pode passar a suprimir silenciosamente),
        // o próprio botão "armar" - primeiro clique avisa e troca o texto do botão; o clique
        // seguinte no botão já armado é que efetivamente reprocessa.
        if (manifestExistente && manifestExistente.hashConteudo === hash && !uploadXlsxArmadoBaseCurricular) {
            esconderProgressoBaseCurricular();
            uploadXlsxArmadoBaseCurricular = true;
            if (btn) btn.textContent = '⚠️ Já enviado — Confirmar Substituição';
            mostrarMensagemBaseCurricular(`O arquivo "${arquivo.name}" já foi enviado antes com o mesmo conteúdo (${manifestExistente.totalUnidades} linhas). Clique em "Confirmar Substituição" pra reprocessar mesmo assim.`, 'aviso');
            return;
        }
        uploadXlsxArmadoBaseCurricular = false;
        if (btn) btn.textContent = 'Processar e Enviar';

        definirProgressoBaseCurricular('Carregando biblioteca de leitura de planilhas...', 2);
        await carregarBibliotecaBaseCurricular('xlsx');

        definirProgressoBaseCurricular('Lendo planilha...', 5);
        const workbook = XLSX.read(bytes, { type: 'array' });
        let totalLinhas = 0;
        const abasIgnoradas = [];
        const nomesAbas = workbook.SheetNames;

        for (let i = 0; i < nomesAbas.length; i++) {
            const nomeAba = nomesAbas[i];
            definirProgressoBaseCurricular(`Processando aba "${nomeAba}" (${i + 1}/${nomesAbas.length})...`, ((i + 1) / nomesAbas.length) * 90);

            const planilha = workbook.Sheets[nomeAba];
            const linhasBrutas = XLSX.utils.sheet_to_json(planilha, { defval: '' });
            if (linhasBrutas.length === 0) continue;

            const formato = detectarFormatoPlanilhaCurriculo(Object.keys(linhasBrutas[0]));
            if (!formato) { abasIgnoradas.push(nomeAba); continue; }

            const linhasNormalizadas = linhasBrutas
                .map((linha, idx) => normalizarLinhaPlanilhaCurriculo(linha, formato, nomeAba, idx + 2))
                .filter(Boolean);

            await apagarLinhasAbaCurriculo(arquivo.name, nomeAba);
            await gravarLinhasCurriculoEmLotes(linhasNormalizadas, arquivo.name, nomeAba);
            totalLinhas += linhasNormalizadas.length;
        }

        await saveData('curriculo_ingest_manifest', manifestId, {
            chaveArquivo: arquivo.name,
            tipoDocumento: 'escopo_sequencia_xlsx',
            hashConteudo: hash,
            totalUnidades: totalLinhas,
            ingeridoEm: Date.now()
        });

        esconderProgressoBaseCurricular();
        uploadXlsxArmadoBaseCurricular = false;
        if (btn) btn.textContent = 'Processar e Enviar';
        let msg = `Planilha processada! ${totalLinhas} linhas gravadas.`;
        if (abasIgnoradas.length) msg += ` Abas não reconhecidas (ignoradas): ${abasIgnoradas.join(', ')}.`;
        mostrarMensagemBaseCurricular(msg, abasIgnoradas.length ? 'aviso' : 'sucesso');
        input.value = '';
        listarDocumentosBaseCurricular();
    } catch (e) {
        console.error(e);
        esconderProgressoBaseCurricular();
        uploadXlsxArmadoBaseCurricular = false;
        if (btn) btn.textContent = 'Processar e Enviar';
        mostrarMensagemBaseCurricular('Erro ao processar planilha: ' + e.message, 'erro');
    }
}

// --- Documentos em PDF (Cadernos, Material Digital, Guia Priorizado) ---

// Divisor de texto em chunks (~1000-1200 caracteres, sobreposição de ~150-200) sem depender de
// biblioteca externa: quebra por parágrafo (ou por frase, se o parágrafo sozinho já for grande demais)
// e carrega uma "cauda" do chunk anterior pro próximo, pra não perder contexto na fronteira.
function dividirEmChunksCurriculo(paginas, tamanhoAlvo = 1100, sobreposicao = 180) {
    const chunks = [];
    let atual = '';
    let paginaInicioAtual = 1;

    const empurrarChunk = (paginaFim) => {
        const texto = atual.trim();
        if (texto) chunks.push({ texto, paginaInicio: paginaInicioAtual, paginaFim });
    };

    paginas.forEach((textoPagina, idx) => {
        const numeroPagina = idx + 1;
        const trechos = textoPagina.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/).filter(Boolean);
        trechos.forEach(trecho => {
            if (atual.length > 0 && (atual.length + trecho.length + 1) > tamanhoAlvo) {
                empurrarChunk(numeroPagina);
                atual = atual.slice(-sobreposicao) + ' ' + trecho;
                paginaInicioAtual = numeroPagina;
            } else {
                atual = (atual + ' ' + trecho).trim();
            }
        });
    });
    empurrarChunk(paginas.length || paginaInicioAtual);
    return chunks;
}

async function obterEmbeddingGeminiBaseCurricular(texto, apiKey, taskType) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // "model" precisa vir também no corpo (além de já estar na URL) - o endpoint embedContent
            // exige esse campo, diferente do generateContent usado no roteador multi-IA. Sem ele a
            // API retorna erro em toda chamada (era a causa do "0 trechos gravados").
            body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: texto }] }, taskType }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errObj = await response.json().catch(() => ({}));
            throw new Error(errObj.error ? errObj.error.message : response.statusText);
        }
        const json = await response.json();
        return (json.embedding && json.embedding.values) ? json.embedding.values : null;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

async function apagarChunksArquivoCurriculo(fonteArquivo) {
    const snap = await db.collection('curriculo_chunks_embeddings').where('fonteArquivo', '==', fonteArquivo).get();
    await apagarDocsEmLotesBaseCurricular(snap);
}

// --- Extração de PDF via Gemini (alternativa ao PDF.js pra documentos com layout complexo) ---
// O Gemini lê o PDF como documento nativo/multimodal (texto + imagem de cada página ao mesmo tempo),
// então lida melhor com colunas/tabelas do que a extração crua do PDF.js. Usa a mesma chave já
// exigida pros embeddings - sem provedor/custo novo.

function arrayBufferParaBase64BaseCurricular(buffer) {
    const bytes = new Uint8Array(buffer);
    let binario = '';
    const TAMANHO_BLOCO = 0x8000;
    for (let i = 0; i < bytes.length; i += TAMANHO_BLOCO) {
        const bloco = bytes.subarray(i, i + TAMANHO_BLOCO);
        binario += String.fromCharCode.apply(null, bloco);
    }
    return btoa(binario);
}

// A IA devolve o texto com marcadores "===PAGINA N===" (pedido no prompt) pra preservar a numeração
// de página nos chunks depois - se por algum motivo ela não seguir o formato, cai pro fallback de
// tratar a resposta inteira como uma única "página".
function converterTranscricaoIaEmPaginas(texto) {
    const partes = String(texto || '').split(/===\s*PAGINA\s*(\d+)\s*===/i);
    const paginas = [];
    for (let i = 1; i < partes.length; i += 2) {
        const numero = parseInt(partes[i], 10);
        const conteudo = (partes[i + 1] || '').trim();
        if (numero > 0) paginas[numero - 1] = conteudo;
    }
    for (let i = 0; i < paginas.length; i++) if (!paginas[i]) paginas[i] = '';
    return paginas.length > 0 ? paginas : [String(texto || '').trim()];
}

async function extrairTextoPdfComGemini(arrayBuffer, apiKey) {
    const base64 = arrayBufferParaBase64BaseCurricular(arrayBuffer);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { inline_data: { mime_type: 'application/pdf', data: base64 } },
                        { text: 'Transcreva TODO o texto deste documento, respeitando a ordem de leitura correta (colunas, tabelas, seções) e sem resumir, traduzir ou comentar nada. Para cada página do documento, comece uma linha exatamente no formato ===PAGINA N=== (N = número da página, começando em 1), seguida do texto transcrito daquela página. Retorne apenas o texto transcrito com esses marcadores, nada mais.' }
                    ]
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errObj = await response.json().catch(() => ({}));
            throw new Error(errObj.error ? errObj.error.message : response.statusText);
        }
        const json = await response.json();
        if (!json.candidates || json.candidates.length === 0 || !json.candidates[0].content) {
            throw new Error('A IA não retornou um conteúdo válido.');
        }
        return json.candidates[0].content.parts[0].text || '';
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

async function processarPdfCurriculo() {
    if (typeof db === 'undefined' || !db) return mostrarMensagemBaseCurricular('Sem conexão com o banco de dados.', 'erro');
    const inputArquivo = document.getElementById('baseCurricularArquivoPdf');
    if (!inputArquivo.files || !inputArquivo.files[0]) return mostrarMensagemBaseCurricular('Selecione um arquivo PDF primeiro.', 'aviso');
    const arquivo = inputArquivo.files[0];
    const btn = document.getElementById('btnProcessarPdfBaseCurricular');

    const tipoDocumento = document.getElementById('baseCurricularTipoPdf').value;
    const disciplina = document.getElementById('baseCurricularDisciplinaPdf').value.trim();
    const todasSeries = document.getElementById('chkSerieTodasBaseCurricular').checked;
    const serieChaves = todasSeries
        ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'EM1', 'EM2', 'EM3']
        : Array.from(document.querySelectorAll('.chk-serie-base-curricular:checked')).map(chk => chk.value);
    if (serieChaves.length === 0) return mostrarMensagemBaseCurricular('Selecione ao menos uma série (ou marque "Todas").', 'aviso');

    const configData = await getData('system', 'config_ia') || {};
    const apiKeys = (configData.apiKey || '').split(',').map(k => k.trim()).filter(Boolean);
    const chaveGemini = apiKeys.find(k => !k.startsWith('sk-') && !k.startsWith('gsk_'));
    if (!chaveGemini) return mostrarMensagemBaseCurricular('É necessário ter uma chave do Google Gemini configurada (card "Chave de IA" acima) pra gerar os embeddings de busca.', 'aviso');

    try {
        esconderMensagemBaseCurricular();
        definirProgressoBaseCurricular('Verificando arquivo...', 0);
        const bytes = await arquivo.arrayBuffer();
        const hash = await calcularHashArquivoBaseCurricular(bytes.slice(0));
        const manifestId = 'pdf_' + sanitizarIdManifestoBaseCurricular(arquivo.name);
        const manifestExistente = await getData('curriculo_ingest_manifest', manifestId);

        // Mesmo padrão de botão "armado" usado na planilha - ver processarPlanilhaCurriculo.
        if (manifestExistente && manifestExistente.hashConteudo === hash && !uploadPdfArmadoBaseCurricular) {
            esconderProgressoBaseCurricular();
            uploadPdfArmadoBaseCurricular = true;
            if (btn) btn.textContent = '⚠️ Já enviado — Confirmar Substituição';
            mostrarMensagemBaseCurricular(`O arquivo "${arquivo.name}" já foi enviado antes com o mesmo conteúdo (${manifestExistente.totalUnidades} trechos). Clique em "Confirmar Substituição" pra reprocessar mesmo assim.`, 'aviso');
            return;
        }
        uploadPdfArmadoBaseCurricular = false;
        if (btn) btn.textContent = 'Processar e Enviar';

        definirProgressoBaseCurricular('Extraindo texto do PDF com IA (Gemini, pode levar mais tempo)...', 5);
        const textoIa = await extrairTextoPdfComGemini(bytes, chaveGemini);
        const paginas = converterTranscricaoIaEmPaginas(textoIa);

        const textoTotal = paginas.join(' ').trim();
        if (textoTotal.length < 200) {
            esconderProgressoBaseCurricular();
            mostrarMensagemBaseCurricular('Não foi possível extrair texto suficiente deste PDF (pode ser um PDF escaneado sem OCR, que este processo não suporta ainda).', 'erro');
            return;
        }

        const chunks = dividirEmChunksCurriculo(paginas);
        await apagarChunksArquivoCurriculo(arquivo.name);

        let processados = 0;
        let falhas = 0;
        let ultimoErroEmbedding = '';
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            definirProgressoBaseCurricular(`Processando trecho ${i + 1}/${chunks.length}...`, ((i + 1) / chunks.length) * 90);

            try {
                const embedding = await obterEmbeddingGeminiBaseCurricular(chunk.texto, chaveGemini, 'RETRIEVAL_DOCUMENT');
                if (embedding) {
                    await db.collection('curriculo_chunks_embeddings').add({
                        serieChaves,
                        disciplinaOriginal: disciplina || null,
                        tipoDocumento,
                        fonteArquivo: arquivo.name,
                        chunkIndex: i,
                        paginaInicio: chunk.paginaInicio,
                        paginaFim: chunk.paginaFim,
                        texto: chunk.texto,
                        embedding,
                        embeddingModel: 'text-embedding-004',
                        atualizadoEm: Date.now()
                    });
                    processados++;
                } else {
                    falhas++;
                    ultimoErroEmbedding = 'A API retornou sem os valores do embedding (resposta vazia/inesperada).';
                }
            } catch (e) {
                console.warn('[Base Curricular] Falha ao gerar embedding de um trecho, pulando:', e);
                falhas++;
                // Guarda a mensagem real (não só a contagem) pra mostrar no final - antes disso só
                // dava pra ver o motivo abrindo o console (F12), o que escondia do Super Admin se
                // era chave inválida, modelo não encontrado, cota excedida, CORS etc.
                ultimoErroEmbedding = e.message || String(e);
            }

            // Pequeno intervalo entre chamadas de embedding (mesmo em caso de falha, já que o
            // limite de taxa da API conta a tentativa) - proteção extra ao processar muitos
            // trechos em sequência.
            if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, 150));
        }

        await saveData('curriculo_ingest_manifest', manifestId, {
            chaveArquivo: arquivo.name,
            tipoDocumento: 'pdf_chunk',
            hashConteudo: hash,
            totalUnidades: processados,
            ingeridoEm: Date.now()
        });

        esconderProgressoBaseCurricular();
        uploadPdfArmadoBaseCurricular = false;
        if (btn) btn.textContent = 'Processar e Enviar';
        let msg = `PDF processado! ${processados} trechos gravados.`;
        if (falhas > 0) msg += ` ⚠️ ${falhas} trecho(s) falharam ao gerar embedding. Último erro: ${ultimoErroEmbedding}`;
        mostrarMensagemBaseCurricular(msg, falhas > 0 ? 'aviso' : 'sucesso');
        inputArquivo.value = '';
        listarDocumentosBaseCurricular();
    } catch (e) {
        console.error(e);
        esconderProgressoBaseCurricular();
        uploadPdfArmadoBaseCurricular = false;
        if (btn) btn.textContent = 'Processar e Enviar';
        mostrarMensagemBaseCurricular('Erro ao processar PDF: ' + e.message, 'erro');
    }
}

// --- Lista e remoção de documentos já enviados ---

async function listarDocumentosBaseCurricular() {
    const container = document.getElementById('listaBaseCurricular');
    if (!container) return;
    if (typeof db === 'undefined' || !db) { container.innerHTML = '<p>Sem conexão com o banco.</p>'; return; }

    try {
        const snap = await db.collection('curriculo_ingest_manifest').orderBy('ingeridoEm', 'desc').get();
        if (snap.empty) { container.innerHTML = '<p class="empty-state">Nenhum documento enviado ainda.</p>'; return; }

        let html = '<table style="font-size:12px;"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Unidades</th><th>Enviado em</th><th>Ações</th></tr></thead><tbody>';
        snap.forEach(doc => {
            const d = doc.data();
            const dataFormatada = d.ingeridoEm ? new Date(d.ingeridoEm).toLocaleString('pt-BR') : '-';
            // Padrão de dois cliques em vez de confirm() nativo - ver onCliqueRemoverBaseCurricular.
            const acaoHtml = docsArmadosParaRemocaoBaseCurricular.has(doc.id)
                ? `<button class="btn btn-danger btn-sm" onclick="onCliqueRemoverBaseCurricular('${doc.id}')">⚠️ Confirmar</button> <button class="btn btn-secondary btn-sm" onclick="cancelarRemocaoBaseCurricular('${doc.id}')">Cancelar</button>`
                : `<button class="btn btn-danger btn-sm" onclick="onCliqueRemoverBaseCurricular('${doc.id}')">🗑️ Remover</button>`;
            html += `<tr>
                <td>${d.chaveArquivo || '-'}</td>
                <td>${d.tipoDocumento || '-'}</td>
                <td>${d.totalUnidades ?? '-'}</td>
                <td>${dataFormatada}</td>
                <td>${acaoHtml}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p>Erro ao carregar lista de documentos.</p>';
    }
}

// Primeiro clique "arma" a remoção (troca o botão pra um estado de confirmação, com timeout que
// reverte sozinho); clicar de novo enquanto armado é que efetivamente remove. Substitui o confirm()
// nativo, que pode ser suprimido silenciosamente pelo navegador depois de várias caixas de diálogo
// nessa mesma aba.
function onCliqueRemoverBaseCurricular(manifestDocId) {
    if (docsArmadosParaRemocaoBaseCurricular.has(manifestDocId)) {
        clearTimeout(docsArmadosParaRemocaoBaseCurricular.get(manifestDocId));
        docsArmadosParaRemocaoBaseCurricular.delete(manifestDocId);
        removerDocumentoBaseCurricular(manifestDocId);
        return;
    }
    const timeoutId = setTimeout(() => {
        docsArmadosParaRemocaoBaseCurricular.delete(manifestDocId);
        listarDocumentosBaseCurricular();
    }, 5000);
    docsArmadosParaRemocaoBaseCurricular.set(manifestDocId, timeoutId);
    listarDocumentosBaseCurricular();
}

function cancelarRemocaoBaseCurricular(manifestDocId) {
    if (docsArmadosParaRemocaoBaseCurricular.has(manifestDocId)) {
        clearTimeout(docsArmadosParaRemocaoBaseCurricular.get(manifestDocId));
        docsArmadosParaRemocaoBaseCurricular.delete(manifestDocId);
    }
    listarDocumentosBaseCurricular();
}

async function removerDocumentoBaseCurricular(manifestDocId) {
    try {
        const doc = await db.collection('curriculo_ingest_manifest').doc(manifestDocId).get();
        if (!doc.exists) return;
        const d = doc.data();

        const snap = d.tipoDocumento === 'escopo_sequencia_xlsx'
            ? await db.collection('curriculo_escopo_sequencia').where('fonteArquivo', '==', d.chaveArquivo).get()
            : await db.collection('curriculo_chunks_embeddings').where('fonteArquivo', '==', d.chaveArquivo).get();

        await apagarDocsEmLotesBaseCurricular(snap);
        await db.collection('curriculo_ingest_manifest').doc(manifestDocId).delete();

        mostrarMensagemBaseCurricular(`Documento "${d.chaveArquivo || ''}" removido.`, 'sucesso');
        listarDocumentosBaseCurricular();
    } catch (e) {
        console.error(e);
        mostrarMensagemBaseCurricular('Erro ao remover: ' + e.message, 'erro');
    }
}