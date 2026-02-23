// core.js - Lógica Central de Autenticação e Dados (Híbrido: Local + Firebase)

// --- CONFIGURAÇÃO HÍBRIDA (LOCAL vs FIREBASE) ---

// Detecta se está rodando localmente ou em produção
const isLocalhost = Boolean(
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.startsWith('192.168.') || 
    window.location.hostname.startsWith('10.') || 
    window.location.protocol === 'file:'
);

// CONFIGURAÇÃO: Para testar com o banco REAL (Firebase) mesmo no seu computador, mude para TRUE:
const FORCE_FIREBASE_LOCAL = true; 

const USE_FIREBASE = !isLocalhost || FORCE_FIREBASE_LOCAL;

let db; // Variável global para o Firestore

// Variáveis Globais
let currentUser = null;
let data = (typeof getInitialData === 'function') ? getInitialData() : {};

if (USE_FIREBASE) {
    try {
        const firebaseConfig = {
            apiKey: "AIzaSyCOP_TE6YvVkg9E2DFuwfF7jDkBgxyc8ls",
            authDomain: "profsis3.firebaseapp.com",
            databaseURL: "https://profsis3-default-rtdb.firebaseio.com",
            projectId: "profsis3",
            storageBucket: "profsis3.firebasestorage.app",
            messagingSenderId: "944272675889",
            appId: "1:944272675889:web:2afc6a869f363aefedf110",
            measurementId: "G-2EJ3T4DPLG"
        };
        
        // Inicializa Firebase com verificação
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            firebase.auth(); // Inicializa o serviço de Autenticação
            firebase.analytics();
            console.log("🔥 Modo Produção: Firebase Ativado");
            mostrarIndicadorAmbiente('🔥 Online (Firebase)');
        } else {
            console.error("⚠️ SDK do Firebase não carregado. Verifique sua conexão.");
        }
    } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
    }
} else {
    console.log("💻 Modo Desenvolvimento: LocalStorage Ativado");
    mostrarIndicadorAmbiente('💻 Local (Offline)');
}

function mostrarIndicadorAmbiente(texto) {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '10px';
    div.style.right = '10px';
    div.style.background = 'rgba(0,0,0,0.7)';
    div.style.color = 'white';
    div.style.padding = '5px 10px';
    div.style.borderRadius = '5px';
    div.style.fontSize = '12px';
    div.style.zIndex = '9999';
    div.textContent = texto;
    document.body.appendChild(div);
}

// Funções Auxiliares de Dados (Abstração)
async function getData(collectionName, docId) {
    if (USE_FIREBASE) {
        if (!db) return null; // Se o Firebase deveria estar ativo mas não carregou, retorna null
        try {
            const doc = await db.collection(collectionName).doc(String(docId)).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error("Erro ao buscar no Firebase:", error);
            alert("Erro de conexão ao buscar dados. Verifique sua internet.");
            return null;
        }
    } else {
        // Comportamento LocalStorage
        let key = docId;
        if (docId === 'users_list') key = 'app_users';
        if (docId === 'schools_list') key = 'app_schools';
        const data = localStorage.getItem(key);
        if (!data) return null;

        try {
            const parsed = JSON.parse(data);
            // Compatibilidade: Se for array (formato antigo local), envelopa em { list: ... }
            if (Array.isArray(parsed) && (key === 'app_users' || key === 'app_schools')) {
                return { list: parsed };
            }
            return parsed;
        } catch (e) {
            console.error(`[Core] Erro ao processar JSON de ${key}:`, e);
            return null;
        }
    }
}

async function saveData(collectionName, docId, dataObj) {
    if (USE_FIREBASE) {
        if (!db) {
            alert("ERRO CRÍTICO: Banco de dados não conectado. Suas alterações NÃO serão salvas online.\nRecarregue a página.");
            return;
        }
        try {
            // SANITIZAÇÃO: Remove campos 'undefined' que fazem o Firebase travar
            const cleanData = JSON.parse(JSON.stringify(dataObj));
            
            console.log(`Salvando no Firebase: ${collectionName}/${docId}`);
            await db.collection(collectionName).doc(String(docId)).set(cleanData);
        } catch (error) {
            console.error("Erro ao salvar no Firebase:", error);
            alert(`Erro ao salvar dados online: ${error.message}\nVerifique se as Regras do Firestore permitem escrita.`);
        }
    } else {
        // Comportamento LocalStorage
        let key = docId;
        if (docId === 'users_list') key = 'app_users';
        if (docId === 'schools_list') key = 'app_schools';
        localStorage.setItem(key, JSON.stringify(dataObj));
    }
}

// --- FIM CONFIGURAÇÃO ---

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // [NOVO] Monitorar estado do login do Firebase (Mantém a sessão ativa)
    if (USE_FIREBASE && typeof firebase !== 'undefined') {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user && !currentUser) {
                // Se o Firebase diz que está logado, mas o app não sabe, recupera os dados
                const usersData = await getData('system', 'users_list');
                const users = (usersData && usersData.list) ? usersData.list : [];
                const userProfile = users.find(u => u.email === user.email);
                
                if (userProfile) {
                    currentUser = { ...userProfile, uid: user.uid }; // Vincula UID do Auth
                    localStorage.setItem('app_current_user', JSON.stringify(currentUser));
                    // Se estiver na tela de login, recarrega para entrar
                    if (document.getElementById('authContainer').style.display !== 'none') init();
                }
            }
        });
    }
});

function init() {
    // Verifica se é um link de compartilhamento
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
        // Aguarda carregamento do gestor.js se necessário, ou chama direto
        if (typeof carregarVistaCompartilhada === 'function') {
            carregarVistaCompartilhada(shareId);
        } else {
            window.addEventListener('load', () => carregarVistaCompartilhada(shareId));
        }
        return; // Interrompe o fluxo normal de login
    }

    // Tenta recuperar usuário da sessão
    const userJson = localStorage.getItem('app_current_user');
    if (userJson) {
        currentUser = JSON.parse(userJson);
        // Verificar role e redirecionar
        if (currentUser.role === 'super_admin') {
            if (typeof iniciarAdmin === 'function') iniciarAdmin();
        } else {
            if (typeof iniciarApp === 'function') iniciarApp();
        }
    } else {
        // Se não tem usuário, garante que a tela de login está visível
        renderLogin();
    }
}

// Funções de Auth
async function fazerLogin(e) {
    e.preventDefault();
    try {
        const email = document.getElementById('loginEmail').value.trim().toLowerCase();
        const senha = document.getElementById('loginSenha').value;

        // Admin Hardcoded (Legado/Backup) - Funciona mesmo sem banco de dados
        if ((email === 'rafael@adm' || email === 'rafael@adm.com') && senha === 'Amor@9391') {
            const adminUser = { id: 'admin', nome: 'Super Admin', email: email, role: 'super_admin' };
            localStorage.setItem('app_current_user', JSON.stringify(adminUser));
            currentUser = adminUser;
            if (typeof iniciarAdmin === 'function') iniciarAdmin();
            return;
        }

        // [NOVO] Tenta login via Firebase Auth primeiro
        if (USE_FIREBASE && typeof firebase !== 'undefined') {
            try {
                await firebase.auth().signInWithEmailAndPassword(email, senha);
                // O onAuthStateChanged vai lidar com o resto, mas buscamos o perfil aqui para agilizar
                const usersData = await getData('system', 'users_list');
                const users = (usersData && usersData.list) ? usersData.list : [];
                const user = users.find(u => u.email === email);
                
                if (user) {
                    localStorage.setItem('app_current_user', JSON.stringify(user));
                    currentUser = user;
                    if (typeof iniciarApp === 'function') iniciarApp();
                    return;
                }
            } catch (e) {
                // Se falhar (ex: usuário ainda não migrado), continua para o método antigo abaixo
                // Isso garante que ninguém fica trancado para fora durante a transição
                console.warn("Login Auth falhou (tentando legado):", e.code);
            }
        }

        // --- LOGIN DE TESTE RÁPIDO (Apenas Localhost) ---
        // Permite testar rápido no seu PC sem afetar a segurança da versão Online
        if (isLocalhost && email === 'prof@teste' && senha === '123') {
            const testUser = { id: 'test_prof', nome: 'Professor Teste', email: email, role: 'professor', schoolId: 'default' };
            localStorage.setItem('app_current_user', JSON.stringify(testUser));
            currentUser = testUser;
            if (typeof iniciarApp === 'function') iniciarApp();
            return;
        }
        // ----------------------------------------

        // Verificação de segurança: Se estiver online mas sem conexão com o banco
        if (USE_FIREBASE && !db) {
            alert("⚠️ Sistema Offline ou Erro de Conexão.\nNão foi possível conectar ao banco de dados para verificar seu usuário.\nTente recarregar a página.");
            return;
        }

        // Busca usuários
        const usersData = await getData('system', 'users_list');
        const users = (usersData && usersData.list && Array.isArray(usersData.list)) ? usersData.list : [];

        console.log(`[Login] Tentando: ${email} | Modo: ${USE_FIREBASE ? 'Firebase' : 'Local'} | Usuários encontrados: ${users.length}`);

        // Debug: Ajuda a entender se o banco está vazio
        if (users.length === 0) {
            const msg = USE_FIREBASE 
                ? "⚠️ A lista de usuários no Firebase está vazia ou não pôde ser carregada." 
                : "⚠️ A lista de usuários Local está vazia.";
            console.warn(msg);
        }

        const user = users.find(u => u.email === email && u.senha === senha);

        if (user) {
            localStorage.setItem('app_current_user', JSON.stringify(user));
            currentUser = user;
            if (typeof iniciarApp === 'function') iniciarApp();
        } else {
            console.log("Emails disponíveis:", users.map(u => u.email));
            if (users.length === 0) {
                alert(`Erro: Nenhum usuário encontrado no banco de dados (${USE_FIREBASE ? 'Online' : 'Local'}).\n\nDica: Entre como Admin (rafael@adm) para cadastrar usuários.`);
            } else {
                alert('Email ou senha incorretos.\nVerifique o console (F12) para ver a lista de emails cadastrados.');
            }
        }
    } catch (err) {
        console.error("Erro fatal no login:", err);
        alert("Ocorreu um erro inesperado. Veja o console.");
    }
}

async function fazerCadastro(e) {
    e.preventDefault();
    const nome = document.getElementById('cadNome').value;
    const email = document.getElementById('cadEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadSenha').value;
    const escolaId = document.getElementById('cadEscola').value;

    let userAuth = null;
    // [NOVO] Cadastro direto no Firebase Auth
    if (USE_FIREBASE && typeof firebase !== 'undefined') {
        try {
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, senha);
            userAuth = userCredential.user;
            // Continua para salvar os dados do perfil no banco (sem a senha)
        } catch (error) {
            alert("Erro ao criar conta: " + error.message);
            return;
        }
    }

    const usersData = await getData('system', 'users_list');
    const users = (usersData && usersData.list && Array.isArray(usersData.list)) ? usersData.list : [];
    
    if (users.find(u => u.email === email)) {
        alert('Email já cadastrado.');
        return;
    }

    const newUser = {
        id: Date.now(),
        id: userAuth ? userAuth.uid : Date.now(), // Usa UID como ID principal
        uid: userAuth ? userAuth.uid : null,      // Armazena o UID seguro
        nome,
        email,
        senha,
        schoolId: escolaId,
        role: 'professor' // Default
    };

    users.push(newUser);
    await saveData('system', 'users_list', { list: users });
    
    alert('Cadastro realizado! Faça login.');
    // Desloga o usuário recém-criado para forçar o fluxo de login padrão
    if (userAuth) {
        await firebase.auth().signOut();
    }
    renderLogin();
}

// Renderização de Telas de Auth
function renderLogin() {
    const container = document.getElementById('authContainer');
    if (!container) return;
    
    container.style.display = 'flex';
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.display = 'none';
    const adminContainer = document.getElementById('adminContainer');
    if (adminContainer) adminContainer.style.display = 'none';

    const statusDb = USE_FIREBASE ? '🔥 Banco: Online (Firebase)' : '💻 Banco: Local (Offline)';
    const colorDb = USE_FIREBASE ? '#e53e3e' : '#3182ce';

    container.innerHTML = `
        <div class="auth-box">
            <h2>🔐 Login</h2>
            <div style="text-align:center; margin-bottom:15px; font-size:12px; color:${colorDb}; font-weight:bold; background:#f7fafc; padding:5px; border-radius:4px; border:1px solid ${colorDb}40;">
                ${statusDb}
            </div>
            <form onsubmit="fazerLogin(event)">
                <label>Email: <input type="email" id="loginEmail" required></label>
                <label>Senha: 
                    <div class="password-wrapper">
                        <input type="password" id="loginSenha" required style="padding-right: 35px;">
                        <button type="button" class="toggle-password" onclick="toggleSenha('loginSenha', this)">👁️</button>
                    </div>
                </label>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">Entrar</button>
            </form>
            <span class="auth-link" onclick="renderCadastro()">Não tem conta? Cadastre-se</span>
        </div>
    `;
}

async function renderCadastro() {
    const data = await getData('system', 'schools_list');
    const schools = (data && data.list && Array.isArray(data.list)) ? data.list : [];

    if (schools.length === 0) schools.push({id: 'default', nome: 'Escola Padrão'});
    
    const options = schools.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');

    const container = document.getElementById('authContainer');
    container.innerHTML = `
        <div class="auth-box">
            <h2>📝 Cadastro</h2>
            <form onsubmit="fazerCadastro(event)">
                <label>Nome: <input type="text" id="cadNome" required></label>
                <label>Email: <input type="email" id="cadEmail" required></label>
                <label>Escola: 
                    <select id="cadEscola" required>
                        <option value="">Selecione...</option>
                        ${options}
                    </select>
                </label>
                <label>Senha: 
                    <div class="password-wrapper">
                        <input type="password" id="cadSenha" required style="padding-right: 35px;">
                        <button type="button" class="toggle-password" onclick="toggleSenha('cadSenha', this)">👁️</button>
                    </div>
                </label>
                <button type="submit" class="btn btn-success" style="width: 100%; margin-top: 10px;">Criar Conta</button>
            </form>
            <span class="auth-link" onclick="renderLogin()">Já tem conta? Faça Login</span>
        </div>
    `;
}

function toggleSenha(id, btn) {
    const input = document.getElementById(id);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

// Carregamento de Dados
async function carregarDadosUsuario() {
    if (!currentUser) return;
    // getStorageKey e getInitialData vêm de shared.js
    const key = typeof getStorageKey === 'function' ? getStorageKey(currentUser) : 'app_data_' + currentUser.id;
    
    // CORREÇÃO: Usar getData para buscar do Firebase quando online, ou LocalStorage quando offline
    const savedData = await getData('app_data', key);
    
    const initial = typeof getInitialData === 'function' ? getInitialData() : {};
    
    if (savedData) {
        data = { ...initial, ...savedData };
    } else {
        data = initial;
    }
}

async function persistirDados() {
    if (!currentUser) return;
    const key = typeof getStorageKey === 'function' ? getStorageKey(currentUser) : 'app_data_' + currentUser.id;
    // CORREÇÃO: Usar saveData unificado para garantir persistência no local correto (Firebase ou Local)
    await saveData('app_data', key, data);
}

// [NOVO] Função de Migração (Pode ser chamada pelo console ou botão de Admin)
async function migrarUsuariosParaFirebase() {
    if (!USE_FIREBASE || typeof firebase === 'undefined') return alert('Firebase não está ativo.');
    if (!confirm('ATENÇÃO: Isso tentará criar contas no Firebase Auth para TODOS os usuários da sua lista atual.\n\nO processo pode demorar. Abra o console (F12) para ver o progresso.\n\nContinuar?')) return;

    const usersData = await getData('system', 'users_list');
    const users = (usersData && usersData.list) ? usersData.list : [];
    
    // Busca escolas para definir um padrão caso o usuário não tenha
    const schoolsData = await getData('system', 'schools_list');
    const defaultSchoolId = (schoolsData && schoolsData.list && schoolsData.list.length > 0) ? schoolsData.list[0].id : 'default';

    console.log(`🚀 Iniciando migração de ${users.length} usuários...`);
    let sucessos = 0;
    let erros = 0;
    let jaExistentes = 0;
    let alterados = 0;

    for (const u of users) {
        if (!u.email || !u.senha) {
            console.warn(`⚠️ Pulado (sem email/senha): ${u.nome}`);
            continue;
        }

        // [CORREÇÃO AUTOMÁTICA DE EMAIL]
        // Se o email não tiver ponto depois do @ (ex: 'prof@peralta'), adiciona '.com'
        let emailFinal = u.email.trim();
        const parts = emailFinal.split('@');
        if (parts.length === 2 && !parts[1].includes('.')) {
            emailFinal = `${emailFinal}.com`;
            console.log(`✏️ Email ajustado: ${u.email} -> ${emailFinal}`);
            
            // Atualiza o objeto local para salvar no banco depois
            u.email = emailFinal; 
            alterados++;
        }

        // [CORREÇÃO AUTOMÁTICA DE ESCOLA]
        // Se usuário antigo não tiver escola, vincula à primeira encontrada
        if (!u.schoolId) {
            u.schoolId = defaultSchoolId;
            console.log(`🏫 Escola vinculada automaticamente para ${u.email}: ${u.schoolId}`);
            alterados++;
        }
        
        try {
            // Tenta criar o usuário
            await firebase.auth().createUserWithEmailAndPassword(emailFinal, u.senha);
            console.log(`✅ Criado: ${emailFinal}`);
            sucessos++;
        } catch (e) {
            if (e.code === 'auth/email-already-in-use') {
                console.log(`ℹ️ Já existe: ${emailFinal}`);
                jaExistentes++;
            } else {
                console.error(`❌ Erro em ${u.email}:`, e.message);
                erros++;
            }
        }
    }

    // Se houve alteração nos emails (adição de .com), salva a lista atualizada no banco
    if (alterados > 0) {
        console.log(`💾 Salvando ${alterados} emails corrigidos no banco de dados...`);
        await saveData('system', 'users_list', { list: users });
    }
    
    alert(`Migração Finalizada!\n\n✅ Criados: ${sucessos}\nℹ️ Já existiam: ${jaExistentes}\n❌ Erros: ${erros}`);
    
    // O loop de criação loga automaticamente no último usuário, então deslogamos para limpar
    firebase.auth().signOut().then(() => location.reload());
}