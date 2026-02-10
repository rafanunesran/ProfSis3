// core.js - Lógica Central de Autenticação e Dados (Híbrido: Local + Firebase)

// --- CONFIGURAÇÃO HÍBRIDA (LOCAL vs FIREBASE) ---

// Detecta se está rodando localmente ou em produção
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

// CONFIGURAÇÃO: Para testar com o banco REAL (Firebase) mesmo no seu computador, mude para TRUE:
const FORCE_FIREBASE_LOCAL = false; 

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
        } else {
            console.error("⚠️ SDK do Firebase não carregado. Verifique sua conexão.");
        }
    } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
    }
} else {
    console.log("💻 Modo Desenvolvimento: LocalStorage Ativado");
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
            return null;
        }
    } else {
        // Comportamento LocalStorage
        let key = docId;
        if (docId === 'users_list') key = 'app_users';
        if (docId === 'schools_list') key = 'app_schools';
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }
}

async function saveData(collectionName, docId, dataObj) {
    if (USE_FIREBASE) {
        if (!db) return;
        try {
            console.log(`Salvando no Firebase: ${collectionName}/`);
            await db.collection(collectionName).doc(String(docId)).set(dataObj);
        } catch (error) {
            console.error("Erro ao salvar no Firebase:", error);
            alert("Erro ao salvar dados online. Verifique o console (F12).");
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
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const senha = document.getElementById('loginSenha').value;

    // Admin Hardcoded (Legado/Backup)
    if (email === 'rafael@adm' && senha === 'Amor@9391') {
        const adminUser = { id: 'admin', nome: 'Super Admin', email: email, role: 'super_admin' };
        localStorage.setItem('app_current_user', JSON.stringify(adminUser));
        currentUser = adminUser;
        if (typeof iniciarAdmin === 'function') iniciarAdmin();
        return;
    }

    // Busca usuários
    let users = [];
    if (USE_FIREBASE) {
        const usersData = await getData('system', 'users_list');
        users = (usersData && usersData.list && Array.isArray(usersData.list)) ? usersData.list : [];
    } else {
        users = JSON.parse(localStorage.getItem('app_users') || '[]');
    }

    const user = users.find(u => u.email === email && u.senha === senha);

    if (user) {
        localStorage.setItem('app_current_user', JSON.stringify(user));
        currentUser = user;
        if (typeof iniciarApp === 'function') iniciarApp();
    } else {
        alert('Email ou senha incorretos.');
    }
}

async function fazerCadastro(e) {
    e.preventDefault();
    const nome = document.getElementById('cadNome').value;
    const email = document.getElementById('cadEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadSenha').value;
    const escolaId = document.getElementById('cadEscola').value;

    let users = [];
    if (USE_FIREBASE) {
        const usersData = await getData('system', 'users_list');
        users = (usersData && usersData.list && Array.isArray(usersData.list)) ? usersData.list : [];
    } else {
        users = JSON.parse(localStorage.getItem('app_users') || '[]');
    }
    
    if (users.find(u => u.email === email)) {
        alert('Email já cadastrado.');
        return;
    }

    const newUser = {
        id: Date.now(),
        nome,
        email,
        senha,
        schoolId: escolaId,
        role: 'professor' // Default
    };

    users.push(newUser);
    if (USE_FIREBASE) {
        await saveData('system', 'users_list', { list: users });
    } else {
        localStorage.setItem('app_users', JSON.stringify(users));
    }
    
    alert('Cadastro realizado! Faça login.');
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

    container.innerHTML = `
        <div class="auth-box">
            <h2>🔐 Login</h2>
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
    let schools = [];
    if (USE_FIREBASE) {
        const data = await getData('system', 'schools_list');
        schools = (data && data.list && Array.isArray(data.list)) ? data.list : [];
    } else {
        schools = JSON.parse(localStorage.getItem('app_schools') || '[]');
    }

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
    const saved = localStorage.getItem(key);
    
    const initial = typeof getInitialData === 'function' ? getInitialData() : {};
    
    if (saved) {
        data = JSON.parse(saved);
        data = { ...initial, ...data };
    } else {
        data = initial;
    }
}

async function persistirDados() {
    if (!currentUser) return;
    if (USE_FIREBASE) {
        await saveData('app_data', getStorageKey(currentUser), data);
    } else {
        const key = typeof getStorageKey === 'function' ? getStorageKey(currentUser) : 'app_data_' + currentUser.id;
        localStorage.setItem(key, JSON.stringify(data));
    }
}