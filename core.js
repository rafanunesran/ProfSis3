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

// ============================================================================
//  DATA DE CORTE — 07/09/2026, 7h
// ----------------------------------------------------------------------------
//  A versão nova sai antes do corte e NÃO migra ninguém à força: o professor
//  baixa, é lembrado duas vezes por dia e faz a transição quando quiser. Na data
//  marcada, o envio de dado pessoal para o Firestore é bloqueado para todos.
//
//  QUEM REALMENTE BLOQUEIA SÃO AS REGRAS DO FIRESTORE. O que está aqui é
//  experiência de uso: mensagem clara, transição suave, nada de erro seco. Quem
//  abrir o console e chamar saveData() na mão esbarra na regra do servidor.
// ============================================================================

// 07/09/2026 07:00 em São Paulo (UTC-3) = 10:00 UTC.
const DATA_CORTE_PADRAO = '2026-09-07T10:00:00Z';

// A MESMA data está escrita, na mão, dentro do firestore.rules
// (depoisDoCorte). Adiar o corte exige mudar os dois lugares — é de propósito: o
// cliente sozinho não decide se a lei vale. Esta cópia existe para o aplicativo
// saber o que o servidor vai recusar ANTES de tentar, em vez de descobrir por
// "Missing or insufficient permissions" a cada salvamento.
const DATA_CORTE_REGRA = '2026-09-07T10:00:00Z';

// Adiar ou antecipar o corte: campo `dataCorte` em system/config_sistema (só o super
// admin escreve, ver firestore.rules). Mudar aqui exigiria publicar o site de novo.
// ATENÇÃO: a data também está escrita na Regra do Firestore. Adiar de verdade é
// mexer nos dois lugares — de propósito, para o cliente sozinho não decidir.
let _dataCorte = new Date(DATA_CORTE_PADRAO);
let _desvioRelogioMs = 0;

function dataCorte() { return _dataCorte; }

// Hora em que confiamos: a do dispositivo corrigida pelo desvio medido contra o
// servidor. Sem rede não há como medir — mas sem rede também não há função online
// para bloquear, então o relógio local basta.
function agoraConfiavel() {
    return new Date(Date.now() + _desvioRelogioMs);
}

// O relógio do aparelho não serve sozinho: bastaria atrasar a data para continuar
// mandando dado pessoal para a nuvem. Pegamos a hora do cabeçalho `Date` da
// resposta HTTP (é um cabeçalho liberado para leitura entre origens) e guardamos o
// desvio. Também gravamos a última hora conhecida: se o relógio "voltar no tempo"
// depois disso, sabemos que foi mexido e ignoramos.
async function sincronizarRelogioServidor() {
    const enderecos = [window.location.href, 'https://firestore.googleapis.com/'];
    for (const url of enderecos) {
        try {
            const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            const cabecalho = resp.headers.get('date');
            if (!cabecalho) continue;
            const t = Date.parse(cabecalho);
            if (isNaN(t)) continue;
            _desvioRelogioMs = t - Date.now();
            try { if (typeof metaSet === 'function') await metaSet('ultimaHoraConhecida', t); } catch (e) {}
            return true;
        } catch (e) { /* offline, CORS, proxy — tenta o próximo */ }
    }

    // Sem rede: usa a última hora que já vimos como piso, para o relógio atrasado
    // não devolver o modo online a quem já passou do corte.
    try {
        if (typeof metaGet === 'function') {
            const ultima = await metaGet('ultimaHoraConhecida');
            if (ultima && Date.now() < ultima) _desvioRelogioMs = ultima - Date.now();
        }
    } catch (e) {}
    return false;
}

// Leitura direta no db, e não por getData(): getData marca falhaLeituraFirestore e
// mostra alerta de conexão ao usuário, o que não cabe numa configuração best-effort.
async function carregarConfigCorte() {
    if (!USE_FIREBASE || typeof db === 'undefined' || !db) return;
    if (typeof firebase === 'undefined' || !firebase.auth().currentUser) return;
    try {
        const doc = await db.collection('system').doc('config_sistema').get();
        const cfg = doc.exists ? doc.data() : null;
        if (cfg && cfg.dataCorte) {
            const d = new Date(cfg.dataCorte);
            if (!isNaN(d.getTime())) _dataCorte = d;
        }
    } catch (e) { console.warn('[SisProf] Não foi possível ler a data de corte:', e); }
}

// O super admin pode marcar contas específicas para seguirem 100% online (ver
// firestore.rules: só ele grava este campo). A marca vale para a guarda, para a
// persistência e para a migração — a conta se comporta como antes da adequação.
async function carregarIsencaoOnline() {
    window.usuarioOnlineCompleto = false;
    if (!USE_FIREBASE || typeof db === 'undefined' || !db) return;
    const fbUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!fbUser) return;
    try {
        const doc = await db.collection('access').doc(fbUser.uid).get();
        window.usuarioOnlineCompleto = !!(doc.exists && doc.data().modoOnlineCompleto === true);
        if (window.usuarioOnlineCompleto) console.log('[SisProf] Conta isenta do corte (modo online completo).');
    } catch (e) { console.warn('[SisProf] Não consegui ler o documento de acesso:', e); }
}

// Três estados, um lugar só. Consultado pela guarda, pela persistência e pela interface.
//   'antes'   — ainda dá para usar tudo online; o pop-up lembra do prazo.
//   'migrado' — este aparelho já fez a transição; dado pessoal fica aqui.
//   'apos'    — passou da data e a pessoa ainda não migrou; migra na abertura.
function estadoCorte() {
    if (window.usuarioOnlineCompleto) return 'migrado_isento';
    if (window.dadosMigradosLocalmente) return 'migrado';
    return agoraConfiavel() >= dataCorte() ? 'apos' : 'antes';
}

// Dado pessoal ainda pode subir para a nuvem?
function podeEnviarDadoPessoal() {
    const e = estadoCorte();
    if (e !== 'antes' && e !== 'migrado_isento') return false;
    // O aplicativo pode achar que ainda está antes do corte (relógio do aparelho,
    // configuração adiada) enquanto a Regra do Firestore, que tem a data escrita na
    // mão, já está depois. Nesse desacordo quem manda é a Regra: insistir só produz
    // recusa a cada salvamento — e o professor não tem como adivinhar o motivo.
    // A conta isenta é a exceção, porque a Regra também a isenta.
    if (e === 'antes' && regraDoServidorBloqueiaPessoal()) return false;
    return true;
}

// A Regra já está depois do corte? (Para a conta isenta, a Regra não bloqueia.)
function regraDoServidorBloqueiaPessoal() {
    if (window.usuarioOnlineCompleto) return false;
    try { return agoraConfiavel() >= new Date(DATA_CORTE_REGRA); }
    catch (e) { return false; }
}

// ============================================================================
//  GUARDA DE SAÍDA — nada de pessoal atravessa para o Firestore
// ----------------------------------------------------------------------------
//  saveData é o ÚNICO ponto de gravação do sistema inteiro, então esta é a única
//  porta que precisa de porteiro. A guarda existe para que uma edição futura,
//  feita sem lembrar desta adequação, falhe alto em vez de vazar em silêncio.
// ============================================================================

const LIMITE_VARREDURA = 200000; // nós visitados; evita travar a interface em `data` grande

function _varrerChavesPessoais(valor, orcamento) {
    if (orcamento.n++ > LIMITE_VARREDURA || valor === null || typeof valor !== 'object') return null;
    if (Array.isArray(valor)) {
        for (const item of valor) {
            const achado = _varrerChavesPessoais(item, orcamento);
            if (achado) return achado;
        }
        return null;
    }
    for (const chave of Object.keys(valor)) {
        if (CHAVES_PESSOAIS_PROFUNDAS.indexOf(chave) !== -1) return chave;
        const achado = _varrerChavesPessoais(valor[chave], orcamento);
        if (achado) return achado;
    }
    return null;
}

// "Missing or insufficient permissions" não diz NADA a quem está tentando trabalhar,
// e pouco a quem vai consertar: não diz qual documento, com quais campos, nem em que
// estado o aplicativo estava. Sem isso, todo diagnóstico vira adivinhação — e neste
// projeto a adivinhação já custou dias. Esta função responde as três coisas.
function explicarRecusaDeGravacao(colecao, docId, obj) {
    const chaves = (obj && typeof obj === 'object') ? Object.keys(obj) : [];
    const pessoais = (typeof CAMPOS_PESSOAIS !== 'undefined')
        ? chaves.filter(k => CAMPOS_PESSOAIS.indexOf(k) !== -1) : [];
    const estado = (typeof estadoCorte === 'function') ? estadoCorte() : '?';

    let causa;
    if (pessoais.length) {
        causa = 'O documento levava dado de estudante (' + pessoais.join(', ') + ') e, depois ' +
                'do corte, a Regra do Firestore recusa isso. Se esta conta deveria ser isenta, ' +
                'peça ao super admin para ligar o "modo online completo" — e conferir que as ' +
                'Regras publicadas já têm a cláusula de isenção.';
    } else if (colecao === 'access') {
        causa = 'Ninguém altera o próprio documento de acesso — só a gestão ou o super admin.';
    } else {
        causa = 'A Regra publicada não permite esta gravação para o seu perfil. ' +
                'Mostre este aviso à gestão/suporte: é com ele que dá para achar a causa.';
    }

    return 'Não consegui salvar na nuvem.\n\n' + causa +
           '\n\n--- para o suporte ---\n' +
           'documento: ' + colecao + '/' + docId + '\n' +
           'campos: ' + (chaves.join(', ') || '(nenhum)') + '\n' +
           'estado: ' + estado + (window.usuarioOnlineCompleto ? ' (conta isenta)' : '') + '\n' +
           'hora confiável: ' + (typeof agoraConfiavel === 'function' ? agoraConfiavel().toISOString() : '?') +
           '\n\nO que você fez continua guardado NESTE APARELHO — nada foi perdido.';
}

function assertSemDadosPessoais(colecao, docId, obj) {
    if (podeEnviarDadoPessoal()) return;          // antes do corte, ou usuário isento
    if (!obj || typeof obj !== 'object') return;

    const id = String(docId || '');
    // Blocos opacos: o conteúdo já está cifrado, não há o que inspecionar.
    // O nome `backup_` NÃO basta para isentar — só isenta se vier mesmo cifrado.
    // Enquanto o backup cifrado não existe (Fase 2), isso mantém o backup diário,
    // que grava o `data` inteiro em texto claro, fora da nuvem depois do corte.
    if (id.indexOf('backup_') === 0 && obj.cifrado === true) return;
    if (colecao === 'compartilhado_cifrado' || colecao === 'chaves_backup') return;

    const topo = Object.keys(obj).filter(k => CAMPOS_PESSOAIS.indexOf(k) !== -1);
    if (topo.length) {
        throw new Error('[Conformidade] Bloqueado o envio de dado pessoal para ' +
            colecao + '/' + id + '. Campos: ' + topo.join(', ') +
            '. Esses dados ficam no aparelho — ver CAMPOS_PESSOAIS em shared.js.');
    }

    const profundo = _varrerChavesPessoais(obj, { n: 0 });
    if (profundo) {
        throw new Error('[Conformidade] Bloqueado o envio para ' + colecao + '/' + id +
            ': encontrei o campo "' + profundo + '" aninhado no documento.');
    }
}

// Funções Auxiliares de Dados (Abstração)
async function getData(collectionName, docId) {
    if (USE_FIREBASE) {
        if (!db) return null; // Se o Firebase deveria estar ativo mas não carregou, retorna null
        try {
            const doc = await db.collection(collectionName).doc(String(docId)).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            // [PROTEÇÃO CONTRA PERDA DE DADOS] Uma leitura que FALHA não é a mesma coisa
            // que "não existem dados". Antes, os dois casos retornavam null e o app
            // carregava vazio — e o salvamento seguinte sobrescrevia a nuvem com vazio.
            // Marcamos a falha para que carregarDadosUsuario() bloqueie o salvamento.
            window.falhaLeituraFirestore = true;
            // Guardamos QUAL foi a falha: "negado pelas Regras" e "sem internet" pedem
            // conversas diferentes com o professor, e tratá-las igual já custou caro.
            window.ultimaLeituraNegada = !!(error && error.code === 'permission-denied');
            console.error(`Erro ao buscar ${collectionName}/${docId}:`, error && error.code, error);
            if (error && error.code === 'permission-denied') {
                console.warn('[SisProf] Leitura negada pelas Regras do Firestore (não é falta de internet).');
            } else {
                alert("Erro de conexão ao buscar dados. Verifique sua internet.");
            }
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
    // [MODO SOMENTE LEITURA] Professor inativado pela gestão acessa o sistema, mas não
    // pode gravar alterações. Este é o ponto único de persistência (Firebase e localStorage),
    // então basta bloquear aqui. O super_admin nunca é afetado.
    if (currentUser && currentUser.active === false && currentUser.role !== 'super_admin') {
        alert('Sua conta está inativada. Você está em modo somente leitura e não pode salvar alterações.\n\nFale com a gestão da sua escola para reativar seu acesso.');
        return;
    }

    // [CONFORMIDADE] Porteiro único: nada de pessoal sai daqui depois do corte.
    // Deixamos estourar de propósito — falhar alto é melhor que vazar calado.
    assertSemDadosPessoais(collectionName, docId, dataObj);

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
            
            try {
                // Espelho local. Era localStorage (teto de ~5 MB, que uma escola grande
                // estoura); agora vai para o IndexedDB, via localdb.js.
                //
                // MESCLA em vez de substituir, e a razão é séria: depois da transição o
                // que sobe para a nuvem é só a camada não-pessoal, e um espelho que
                // substituísse apagaria os estudantes da cópia local — a única que
                // existe. Preservamos as chaves que o documento local já tem e que a
                // gravação atual não traz.
                if (!String(docId).startsWith('backup_') && typeof localSet === 'function') {
                    const existente = await localGet(String(docId));
                    const mesclado = (existente && typeof existente === 'object' && !Array.isArray(existente))
                        ? Object.assign({}, existente, cleanData)
                        : cleanData;
                    await localSet(String(docId), mesclado);
                }
            } catch (localError) {
                console.warn("Aviso: Espelho local falhou:", localError);
            }
        } catch (error) {
            console.error("Erro ao salvar no Firebase:", error);
            // "Sem permissão" com sessão e "sem permissão" sem sessão são problemas
            // diferentes, e mandar conferir as Regras quando o que falta é a sessão
            // já fez o responsável procurar no lugar errado.
            if (!sessaoFirebaseAtiva()) {
                if (typeof mostrarBannerSemSessao === 'function') mostrarBannerSemSessao();
                alert('Não consegui salvar: você está no sistema, mas sem sessão no Firebase.\n\n' +
                      'O banco recusa gravação assim. Clique em "Entrar de novo" na faixa do topo ' +
                      '(ou saia e entre com e-mail e senha). Nada foi apagado.');
            } else if (error && error.code === 'permission-denied') {
                alert(explicarRecusaDeGravacao(collectionName, docId, dataObj));
            } else {
                alert(`Erro ao salvar dados online: ${error.message}\nVerifique se as Regras do Firestore permitem escrita.`);
            }
        }
    } else {
        // Comportamento LocalStorage
        let key = docId;
        if (docId === 'users_list') key = 'app_users';
        if (docId === 'schools_list') key = 'app_schools';
        try {
            localStorage.setItem(key, JSON.stringify(dataObj));
        } catch (e) {
            alert("Erro de armazenamento local: Limite de cota excedido (aprox. 5MB).\n\nA memória do navegador está cheia.");
        }
    }
}

// --- FUNÇÕES DE COMPARTILHAMENTO DE CHAMADA (SYNC) ---

async function getFaltasCompartilhadas(dataStr) {
    // Verifica se está online e configurado
    if (typeof db === 'undefined' || !db || !currentUser || !currentUser.schoolId) return {};
    
    try {
        const docId = `school_${currentUser.schoolId}_${dataStr}`;
        const doc = await db.collection('shared_attendance').doc(docId).get();
        if (doc.exists) {
            return doc.data().absences || {};
        }
    } catch (e) {
        console.error("Erro ao buscar faltas compartilhadas:", e);
    }
    return {};
}

async function sincronizarFaltasCompartilhadas(dataStr, mapEstadoFaltas) {
    if (typeof db === 'undefined' || !db || !currentUser || !currentUser.schoolId) return;

    const docId = `school_${currentUser.schoolId}_${dataStr}`;
    const docRef = db.collection('shared_attendance').doc(docId);

    try {
        // Garante que o documento existe (sem sobrescrever se já existir)
        await docRef.set({ created: true }, { merge: true });

        // Prepara atualizações em lote (usando update com dot notation para chaves dinâmicas)
        const updates = {};
        
        for (const [studentId, isAbsent] of Object.entries(mapEstadoFaltas)) {
            const fieldPath = `absences.${studentId}`;
            // Se falta: Adiciona ID do professor. Se presença: Remove ID do professor.
            updates[fieldPath] = isAbsent 
                ? firebase.firestore.FieldValue.arrayUnion(currentUser.id)
                : firebase.firestore.FieldValue.arrayRemove(currentUser.id);
        }
        
        await docRef.update(updates);
    } catch (e) {
        console.error("Erro ao sincronizar faltas compartilhadas:", e);
    }
}

// --- FIM CONFIGURAÇÃO ---

// --- MODELOS DA IA (Google Gemini) ---
// O Google aposenta modelos de tempos em tempos - o gemini-2.0-flash saiu do ar em 01/06/2026 - e a
// partir daí a API responde "models/<velho> is no longer available. Please update your code to use
// models/<novo>", o que chegava no professor como "A Inteligência Artificial falhou ou rejeitou o
// pedido". Pra isso não voltar a acontecer:
//   1. a lista de modelos fica num lugar só (usada pelo Estagiário IA e pela extração de notas);
//   2. o Administrador pode trocar de modelo sem mexer no código, pelo painel Super Admin
//      (config_ia.geminiModel - um nome, ou vários separados por vírgula, em ordem de preferência);
//   3. quando a API avisa que o modelo foi aposentado, a própria mensagem diz qual usar no lugar, e a
//      tentativa seguinte já sai com o modelo novo (ver modeloGeminiSubstituto).
const MODELOS_GEMINI_PADRAO = ['gemini-3.6-flash', 'gemini-2.5-flash'];

function listarModelosGemini(configIA) {
    const personalizados = String((configIA && configIA.geminiModel) || '')
        .split(',').map(m => m.trim()).filter(m => m);
    return personalizados.length ? personalizados : MODELOS_GEMINI_PADRAO.slice();
}

// Extrai o modelo sugerido pela própria API na mensagem de modelo aposentado/inexistente
// ("... is no longer available. Please update your code to use models/gemini-3.6-flash").
// Devolve null quando o erro é de outro tipo (cota, chave inválida, rede...).
function modeloGeminiSubstituto(mensagemErro) {
    const m = /use\s+models\/([A-Za-z0-9._-]+)/i.exec(String(mensagemErro || ''));
    return m ? m[1] : null;
}

// Inicialização
// [CORREÇÃO CRÍTICA] Espera o Firebase Auth restaurar a sessão salva.
// Sem isso, o app lia o Firestore antes de existir token e as Regras negavam a leitura
// ("permission-denied"), que a interface mostrava como "Erro de conexão".
// onAuthStateChanged dispara uma primeira vez assim que o SDK decide o estado (com
// usuário ou null). O timeout evita travar a abertura caso o SDK não responda.
function aguardarAuthPronto(timeoutMs) {
    return new Promise((resolve) => {
        if (!USE_FIREBASE || typeof firebase === 'undefined' || !firebase.auth) return resolve();
        let resolvido = false;
        const done = () => { if (!resolvido) { resolvido = true; resolve(); } };
        try {
            const unsub = firebase.auth().onAuthStateChanged(() => { if (unsub) unsub(); done(); });
        } catch (e) {
            console.warn('[SisProf] Falha ao aguardar o Auth:', e);
            return done();
        }
        setTimeout(done, timeoutMs || 8000);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Armazenamento local primeiro: é dele que sai a marca de transição já feita, e é
    // para ele que o espelho antigo do localStorage é trazido.
    if (typeof localdbPreparar === 'function') {
        try { await localdbPreparar(); } catch (e) { console.warn('[SisProf] localdb:', e); }
    }
    try {
        if (typeof metaGet === 'function') window.dadosMigradosLocalmente = !!(await metaGet('migracaoV2'));
    } catch (e) {}

    await aguardarAuthPronto();

    // Hora do servidor e configuração do corte. Ambas best-effort: sem rede o app abre
    // igual, usando o relógio local (e sem rede não há função online para bloquear).
    try { await sincronizarRelogioServidor(); } catch (e) {}
    try { await carregarConfigCorte(); } catch (e) {}
    try { await carregarIsencaoOnline(); } catch (e) {}

    init();

    // [NOVO] Monitorar estado do login do Firebase (Mantém a sessão ativa)
    if (USE_FIREBASE && typeof firebase !== 'undefined') {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user && !currentUser) {
                // Se o Firebase diz que está logado, mas o app não sabe, recupera os dados
                const usersData = await getData('system', 'users_list');
                const users = (usersData && usersData.list) ? usersData.list : [];
                // Comparação tolerante: case-insensitive e tolera ausência de ".com"
                const normalizeEmail = (e) => (e || '').trim().toLowerCase().replace(/\.com$/, '');
                const userEmailNorm = normalizeEmail(user.email);
                const userProfile = users.find(u => normalizeEmail(u.email) === userEmailNorm);
                
                if (userProfile) {
                    // Sincroniza o email do Auth no perfil para buscas futuras
                    userProfile.email = user.email;
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
    const params = new URLSearchParams(window.location.search);
    
    // Verifica se é um link de compartilhamento
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
// As contas no Firebase Auth foram criadas por migrarUsuariosParaFirebase(), que
// ACRESCENTA '.com' quando o domínio não tem ponto ('prof@peralta' -> 'prof@peralta.com').
// O professor continua digitando o endereço curto, que é o que está na users_list.
// Enquanto o login legado funcionava sem sessão, isso passava batido; com as Regras
// publicadas exigindo autenticação para ler a lista, esse descompasso passou a trancar
// a pessoa do lado de fora. Aqui tentamos as duas formas antes de desistir.
function variacoesDeEmail(email) {
    const formas = [email];
    const partes = String(email).split('@');
    if (partes.length === 2 && !partes[1].includes('.')) formas.push(email + '.com');
    return formas;
}

async function entrarNoAuth(email, senha) {
    let ultimoErro = null;
    for (const tentativa of variacoesDeEmail(email)) {
        try {
            await firebase.auth().signInWithEmailAndPassword(tentativa, senha);
            if (tentativa !== email) console.log('[Login] Entrou com o e-mail ajustado:', tentativa);
            return { ok: true, email: tentativa };
        } catch (err) {
            ultimoErro = err;
            const code = err && err.code;
            // Só vale insistir quando o problema é o endereço não existir. Senha errada
            // com o endereço certo não melhora tentando outra forma do endereço.
            if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') break;
        }
    }
    return { ok: false, erro: ultimoErro };
}

// Mostra o código do erro junto da mensagem. Sem ele, todo relato de "não consigo
// entrar" vira adivinhação: o Firebase devolve auth/invalid-credential tanto para
// senha errada quanto para conta inexistente quando a proteção contra enumeração de
// e-mails está ligada, e só o código distingue os demais casos (conta desativada,
// excesso de tentativas). O código não revela nada sensível.
function mensagemCredencial(codigo) {
    let texto = 'Não consegui entrar com esses dados.\n\n';

    if (codigo === 'auth/too-many-requests') {
        texto += 'O Firebase bloqueou temporariamente as tentativas para esta conta. ' +
                 'Espere alguns minutos antes de tentar de novo.';
    } else if (codigo === 'auth/user-disabled') {
        texto += 'Esta conta está desativada. Fale com a gestão.';
    } else {
        texto += 'Pode ser a senha, ou o e-mail estar cadastrado de outra forma. ' +
                 'Se não lembra a senha, use "Esqueceu a senha?" logo abaixo.';
    }

    if (codigo) texto += '\n\n(código: ' + codigo + ')';
    return texto;
}

// Credencial recusada pelo Firebase Auth. Em vez de mandar a pessoa procurar o
// link "Esqueceu a senha?" e digitar o e-mail de novo, oferece o envio aqui mesmo,
// com o endereço que ela acabou de usar.
//
// Este caso ficou comum depois que as Regras passaram a exigir sessão para ler
// system/users_list: antes, o caminho legado conferia a senha guardada na lista e
// deixava entrar SEM passar pelo Auth, mascarando contas cuja senha no Auth nunca
// coincidiu. Fechado o atalho, a divergência aparece — e o reparo é redefinir a
// senha, que preserva o UID e, com ele, o acesso aos dados do professor.
async function ofereceRedefinirSenha(email, codigo) {
    const querEnviar = confirm(mensagemCredencial(codigo) +
        '\n\n---\n\nQuer que eu envie agora um link de redefinição de senha para\n' +
        email + ' ?');
    if (!querEnviar) return;

    try {
        await firebase.auth().sendPasswordResetEmail(email);
        alert('Se existir uma conta com este e-mail, o link acabou de ser enviado.\n\n' +
              'Abra a caixa de entrada (confira o spam), defina a senha nova e volte aqui.\n\n' +
              'Seus dados continuam no lugar — o que muda é só a senha.');
    } catch (err) {
        console.warn('[Login] Falha ao enviar redefinição:', err && err.code);
        alert('Não consegui enviar o link: ' + (err && err.message ? err.message : 'erro desconhecido') +
              '\n\nFale com a gestão do sistema.');
    }
}

// Promove um login legado a uma sessão de verdade no Firebase Auth.
//
// Por que isto existe: o caminho legado confere a senha guardada em
// system/users_list e deixa entrar. Só que o Firestore não sabe nada disso — ele
// só reconhece sessão do Auth. Resultado: a pessoa entra e nada carrega, porque
// as Regras negam app_data para quem não está autenticado. Deixar app_data aberto
// sem sessão não é opção: é a lista de estudantes.
//
// Não abre brecha: só criamos a conta depois de a senha bater com a que está na
// users_list, que é a mesma prova que o login legado já aceitava para dar acesso
// total à interface.
//
// Devolve true quando, ao final, existe sessão no Auth.
async function promoverParaAuth(email, senha) {
    if (!USE_FIREBASE || typeof firebase === 'undefined') return false;
    if (firebase.auth().currentUser) return true;

    // Mesma normalização usada quando as contas foram criadas em massa
    // (migrarUsuariosParaFirebase acrescenta ".com" a domínio sem ponto).
    const partes = String(email).split('@');
    const emailAuth = (partes.length === 2 && !partes[1].includes('.')) ? email + '.com' : email;

    try {
        await firebase.auth().createUserWithEmailAndPassword(emailAuth, senha);
        console.log('[Login] Acesso criado no Firebase Auth para', emailAuth);
        return true;
    } catch (err) {
        const code = err && err.code;

        if (code === 'auth/email-already-in-use') {
            // A conta existe, mas com OUTRA senha — é o caso de quem vinha entrando
            // só pelo caminho legado. Não há como obter sessão sem a senha correta.
            const enviar = confirm(
                'Você entrou, mas seus dados ficam guardados numa área protegida que ' +
                'exige uma senha de acesso atualizada.\n\n' +
                'A senha que você usa aqui é diferente da que está registrada nessa ' +
                'área, e por isso o sistema não consegue carregar suas turmas.\n\n' +
                'Quer receber agora um link para definir a senha de acesso em\n' +
                emailAuth + ' ?');
            if (enviar) {
                try {
                    await firebase.auth().sendPasswordResetEmail(emailAuth);
                    alert('Link enviado. Abra o e-mail (confira o spam), defina a senha e ' +
                          'entre de novo com ela.\n\nSeus dados continuam no lugar.');
                } catch (e2) {
                    alert('Não consegui enviar o link: ' + (e2 && e2.message ? e2.message : 'erro') +
                          '\n\nAvise a gestão do sistema.');
                }
            }
            return false;
        }

        if (code === 'auth/weak-password') {
            alert('Você entrou, mas para carregar seus dados o sistema precisa de uma ' +
                  'senha com pelo menos 6 caracteres.\n\nAvise a gestão para atualizar seu acesso.');
            return false;
        }

        console.warn('[Login] Não foi possível criar o acesso no Auth:', code);
        return false;
    }
}

async function fazerLogin(e) {
    e.preventDefault();
    try {
        const email = document.getElementById('loginEmail').value.trim().toLowerCase();
        const senha = document.getElementById('loginSenha').value;
        // Por que o Firebase Auth recusou. Usado lá embaixo para dizer à pessoa o que
        // realmente aconteceu, em vez de um "usuário não encontrado" que engana.
        let erroAuth = null;
        // O Firebase Auth aceitou e-mail e senha? Se aceitou, qualquer falha DEPOIS
        // disso não é problema de credencial — e não pode ser relatada como se fosse.
        let authOk = false;

        // --- LOGIN DO SUPER ADMIN ---
        // [SEGURANÇA] Este bloco já teve a senha do administrador escrita no código.
        // Como core.js é publicado no GitHub Pages, ela ficava legível para qualquer
        // pessoa que abrisse o arquivo — e era a MESMA senha da conta no Firebase Auth.
        // Pior: quando a conta não existia, o código a criava com a senha que fosse
        // digitada, então um estranho podia se tornar super admin.
        //
        // Hoje não há credencial no código. O administrador entra pelo Firebase Auth
        // como qualquer outro usuário; o que concede o papel é o e-mail estar em
        // ADMIN_EMAILS **e** estar verificado — a mesma regra que o firestore.rules
        // confere em isSuperAdmin().
        if (ehEmailAdmin(email)) {
            if (!USE_FIREBASE || typeof firebase === 'undefined') {
                alert('O acesso de administrador exige conexão com o Firebase.');
                return;
            }

            const emailAdmin = normalizarEmailAdmin(email);
            try {
                await firebase.auth().signInWithEmailAndPassword(emailAdmin, senha);
            } catch (err) {
                console.warn('Falha ao autenticar o admin:', err && err.code);
                if (err && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
                    alert('Não consegui entrar com ' + emailAdmin + '.\n\n' +
                          'Se esta conta ainda não existe, crie-a pela tela de Cadastro ' +
                          '(ou pelo Console do Firebase) e verifique o e-mail antes de voltar aqui.');
                } else {
                    alert('E-mail ou senha incorretos.');
                }
                return;
            }

            let fbUser = firebase.auth().currentUser;

            if (adminExigeVerificacao(emailAdmin)) {
                // reload() atualiza o cadastro (emailVerified) e getIdToken(true) renova o
                // TOKEN, que é o que as Regras leem. Sem o segundo, quem acabou de clicar
                // no link de verificação em outra aba continuaria carregando um token
                // dizendo email_verified:false e levaria "permissão negada" sem entender.
                try { await fbUser.reload(); await fbUser.getIdToken(true); } catch (e) {}
                fbUser = firebase.auth().currentUser;

                if (!fbUser || !fbUser.emailVerified) {
                    const enviar = confirm('Falta confirmar este e-mail.\n\n' +
                        'Os poderes de administrador só valem com o e-mail verificado — é o que ' +
                        'impede outra pessoa de se cadastrar com o seu endereço e assumir o painel.\n\n' +
                        'Enviar o link de verificação para ' + emailAdmin + ' agora?');
                    if (enviar) {
                        try {
                            await fbUser.sendEmailVerification();
                            alert('Link enviado. Abra o e-mail, clique no link e entre de novo aqui.');
                        } catch (e) {
                            alert('Não consegui enviar o link: ' + e.message);
                        }
                    }
                    // Encerra a sessão: mantê-la aberta sem verificação só produziria
                    // erros de permissão confusos em cada tela do painel.
                    await firebase.auth().signOut();
                    return;
                }
            }

            await prepararBackupCifrado(senha);
            const adminUser = {
                id: 'admin', nome: 'Super Admin', email: emailAdmin,
                role: 'super_admin', uid: fbUser ? fbUser.uid : undefined
            };
            localStorage.setItem('app_current_user', JSON.stringify(adminUser));
            currentUser = adminUser;
            if (typeof iniciarAdmin === 'function') iniciarAdmin();
            return;
        }

        // [NOVO] Tenta login via Firebase Auth primeiro
        if (USE_FIREBASE && typeof firebase !== 'undefined') {
            try {
                const entrada = await entrarNoAuth(email, senha);
                if (!entrada.ok) throw (entrada.erro || new Error('falha no login'));
                authOk = true;
                // O onAuthStateChanged vai lidar com o resto, mas buscamos o perfil aqui para agilizar
                const usersData = await getData('system', 'users_list');
                const users = (usersData && usersData.list) ? usersData.list : [];
                // Comparação tolerante: case-insensitive e tolera ausência de ".com"
                // (necessário porque emails antigos no banco podem não ter ".com")
                const normalizeEmail = (e) => (e || '').trim().toLowerCase().replace(/\.com$/, '');
                const emailNorm = normalizeEmail(email);
                const user = users.find(u => normalizeEmail(u.email) === emailNorm);
                
                if (user) {
                    // Sincroniza o email do Auth no perfil para buscas futuras
                    user.email = email;
                    // [IMPORTANTE] Grava o uid do Firebase Auth no perfil. Usuários antigos têm
                    // `id` numérico (Date.now()), diferente do uid — sem isto o gestor liberaria
                    // o acesso no documento errado (access/{id} em vez de access/{uid}).
                    const authUid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
                    if (authUid && user.uid !== authUid) {
                        user.uid = authUid;
                        try { await saveData('system', 'users_list', { list: users }); }
                        catch (e) { console.warn('Não foi possível gravar o uid no perfil:', e); }
                    }
                    localStorage.setItem('app_current_user', JSON.stringify(user));
                    currentUser = user;
                    await prepararBackupCifrado(senha);
                    if (typeof iniciarApp === 'function') iniciarApp();
                    return;
                }
            } catch (e) {
                // Se falhar (ex: usuário ainda não migrado), continua para o método antigo abaixo
                // Isso garante que ninguém fica trancado para fora durante a transição
                erroAuth = (e && e.code) || 'desconhecido';
                console.warn("Login Auth falhou (tentando legado):", erroAuth);
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

        // Busca usuários. Zera a marca antes: precisamos saber se ESTA leitura falhou,
        // e não se alguma leitura anterior da sessão falhou.
        window.falhaLeituraFirestore = false;
        const usersData = await getData('system', 'users_list');
        const leituraNegada = window.falhaLeituraFirestore === true;
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
            // O login legado coloca a pessoa DENTRO da interface, mas não cria sessão
            // no Firebase Auth — e o Firestore só confia em sessão do Auth. Sem ela,
            // toda leitura de app_data é negada e o professor vê "não foi possível
            // carregar seus dados da nuvem" logo depois de entrar.
            //
            // Como a senha acabou de ser conferida contra a users_list, temos a mesma
            // evidência que o caminho legado já aceita para deixar entrar. Usamos ela
            // para criar a conta no Auth e resolver isso de uma vez, sem pedir nada.
            await promoverParaAuth(email, senha);

            localStorage.setItem('app_current_user', JSON.stringify(user));
            currentUser = user;
            await prepararBackupCifrado(senha);
            if (typeof iniciarApp === 'function') iniciarApp();
        } else {
            // [DIAGNÓSTICO HONESTO] Antes, qualquer falha caía em "Nenhum usuário
            // encontrado no banco de dados" — mensagem falsa quando a lista existe e
            // apenas não pôde ser lida, e que mandava o professor para o caminho errado.
            //
            // O caminho legado confere a senha guardada em system/users_list, e as Regras
            // do Firestore só liberam esse documento para quem já está autenticado. Ou
            // seja: quem não tem conta no Firebase Auth não consegue nem chegar à
            // verificação. A saída é a conta existir no Auth — não afrouxar a Regra, que
            // exporia o e-mail de todos os profissionais (e a senha de quem ainda não
            // foi migrado) para qualquer pessoa na internet.
            // [IMPORTANTE] Se o Auth aceitou a credencial, o problema está em outro
            // lugar: leitura negada pelas Regras, perfil ausente da lista, ou uma falha
            // depois do login. Dizer "senha incorreta" aqui manda a pessoa trocar uma
            // senha que está certa e esconde a causa real — foi exatamente o que
            // aconteceu ao investigar o bloqueio de 07/09.
            if (authOk) {
                console.error('[Login] Auth aceitou a credencial, mas o perfil não pôde ser carregado.',
                              { leituraNegada: leituraNegada, usuariosLidos: users.length, erroPosLogin: erroAuth });
                alert('Sua senha está correta e o acesso foi reconhecido, mas não consegui ' +
                      'carregar o seu perfil.\n\n' +
                      (leituraNegada
                        ? 'O banco recusou a leitura da lista de usuários (Regras do Firestore).'
                        : 'Seu perfil não foi encontrado na lista de usuários da escola.') +
                      '\n\nAvise a gestão — não adianta trocar a senha.' +
                      (erroAuth ? '\n\n(código: ' + erroAuth + ')' : ''));
            } else if (leituraNegada) {
                if (erroAuth === 'auth/user-not-found') {
                    alert('Não encontrei uma conta de acesso com este e-mail.\n\n' +
                          'Confira se digitou o endereço exatamente como está cadastrado. ' +
                          'Se estiver certo, peça à gestão para conferir seu acesso — seus dados ' +
                          'estão preservados, é só a entrada que precisa ser acertada.');
                } else if (erroAuth) {
                    await ofereceRedefinirSenha(email, erroAuth);
                } else {
                    alert('Não consegui verificar seus dados agora.\n\n' +
                          'Confira sua conexão e tente de novo.');
                }
            } else if (users.length === 0) {
                alert('A lista de usuários está vazia neste banco.\n\n' +
                      'Se o sistema acabou de ser instalado, cadastre o primeiro usuário.');
            } else {
                await ofereceRedefinirSenha(email, erroAuth);
            }
        }
    } catch (err) {
        console.error("Erro fatal no login:", err);
        alert("Ocorreu um erro inesperado. Veja o console.");
    }
}

// Prepara a chave do backup cifrado. Chamado nos caminhos de login que têm a senha
// em mãos — é o que faz o backup cifrado ser invisível para o professor: ele nunca
// inventa nem digita uma "senha de backup". Best-effort de propósito: falha de rede
// ou navegador sem WebCrypto não pode impedir ninguém de entrar no sistema.
async function prepararBackupCifrado(senha) {
    try {
        if (typeof desbloquearChaveBackup !== 'function') return;
        const fbUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        if (!fbUser || !senha) return;
        await desbloquearChaveBackup(fbUser.uid, senha);
    } catch (e) {
        console.warn('[SisProf] Não foi possível preparar a chave de backup:', e);
    }
}

async function solicitarResetSenha() {
    const email = prompt("Por favor, insira seu e-mail para redefinir a senha:");
    if (!email) {
        return; // User cancelled the prompt
    }

    if (typeof firebase === 'undefined' || !USE_FIREBASE) {
        alert('A redefinição de senha só está disponível no modo online (Firebase).');
        return;
    }

    try {
        await firebase.auth().sendPasswordResetEmail(email);
        alert('Se o e-mail estiver cadastrado em nosso sistema, um link para redefinição de senha foi enviado.');
    } catch (error) {
        // For security, don't reveal if the user was not found.
        // Log the error for debugging purposes.
        console.error("Erro ao tentar enviar e-mail de redefinição:", error);
        // Show the same generic message to the user.
        alert('Se o e-mail estiver cadastrado em nosso sistema, um link para redefinição de senha foi enviado.');
    }
}

async function fazerCadastro(e) {
    e.preventDefault();
    const nome = document.getElementById('cadNome').value;
    const email = document.getElementById('cadEmail').value.trim().toLowerCase();
    const senha = document.getElementById('cadSenha').value;

    const aceiteTermos = document.getElementById('cadAceiteTermos');
    if (aceiteTermos && !aceiteTermos.checked) {
        alert('Para criar a conta, é necessário ler e aceitar os Termos de Uso.');
        return;
    }

    // [FASE 3] O código é conferido ANTES de criar a conta no Auth. Errar o código
    // não pode deixar uma conta órfã no Firebase Auth para trás.
    const vaiCriarEspaco = !!window.cadastroCriandoEspaco;
    const campoCodigo = document.getElementById('cadCodigo');
    let espacoEncontrado = null;

    if (!vaiCriarEspaco) {
        const codigoDigitado = campoCodigo ? campoCodigo.value : '';
        if (!normalizarCodigo(codigoDigitado)) {
            alert('Digite o código do espaço da sua escola, ou escolha "criar um espaço novo".');
            return;
        }
        try {
            espacoEncontrado = await buscarEspacoPorCodigo(codigoDigitado);
        } catch (e) {
            // Enquanto as Regras novas não forem publicadas no console do Firebase, a
            // leitura do índice é NEGADA — e dizer "sem internet" para quem está com
            // internet manda a pessoa procurar o problema no lugar errado.
            alert(e && e.message === 'negado'
                ? 'A entrada por código ainda não foi liberada no banco de dados.\n\nAvise a gestão/suporte: falta publicar as Regras novas do Firestore. Sua conta ainda NÃO foi criada.'
                : 'Não consegui conferir o código agora — parece falta de conexão.\n\nTente de novo quando a internet voltar. Sua conta ainda NÃO foi criada.');
            return;
        }
        if (!espacoEncontrado) {
            alert('Código não encontrado.\n\nConfira com o colega que passou o código: são 12 letras e números, e os hífens não fazem diferença.');
            return;
        }
    } else {
        const nomeEscola = document.getElementById('cadEscolaNome');
        if (!nomeEscola || !nomeEscola.value.trim()) {
            alert('Informe o nome da escola para criar o espaço.');
            return;
        }
    }

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

    // O espaço só pode ser criado com sessão aberta — por isso vem depois do Auth.
    let codigoNovoEspaco = null;
    if (vaiCriarEspaco) {
        try {
            const criado = await criarEspaco(
                { nome: document.getElementById('cadEscolaNome').value.trim() },
                userAuth ? userAuth.uid : null);
            espacoEncontrado = { espacoId: criado.espacoId, espaco: criado.espaco };
            codigoNovoEspaco = criado.codigo;
        } catch (e) {
            // Com criarEspaco() estrito, isto agora dispara de verdade quando o banco
            // recusa - antes a criação "dava certo" e o professor saía com um código
            // que não levava a lugar nenhum.
            alert('A conta foi criada, mas o espaço da escola NÃO foi criado.\n\n' + e.message +
                  '\n\nNenhum código foi gerado. Avise a gestão/suporte e faça login depois ' +
                  'para criar o espaço pelo painel.');
            return;
        }
    }

    const espacoId = espacoEncontrado ? espacoEncontrado.espacoId : null;
    // A chave dos documentos continua nascendo do id legado: nada se move de lugar.
    const escolaId = espacoEncontrado ? (espacoEncontrado.espaco.legacySchoolId || espacoId) : null;
    const papel = vaiCriarEspaco ? 'gestor' : 'professor';

    const usersData = await getData('system', 'users_list');
    const users = (usersData && usersData.list && Array.isArray(usersData.list)) ? usersData.list : [];
    
    if (users.find(u => u.email === email)) {
        alert('Email já cadastrado.');
        return;
    }

    const newUser = {
        id: userAuth ? userAuth.uid : Date.now(),
        nome,
        email,
        // [SEGURANÇA] A senha NÃO é gravada em system/users_list. Ela vive só no Firebase Auth.
        // Até setembro/2026 este documento guardava a senha em texto claro e as Regras deixavam
        // qualquer pessoa logada lê-lo, ou seja: qualquer usuário via a senha de todos. O login
        // usa signInWithEmailAndPassword; o campo `senha` só sobrevive em perfis antigos ainda
        // não limpos por sincronizarUIDsERemoverSenhas() (admin.js).
        uid: userAuth ? userAuth.uid : undefined,
        schoolId: escolaId,
        espacoId: espacoId,
        legacySchoolId: escolaId,
        role: papel,
        // [FASE 3] Quem entrou com o código do espaço JÁ está liberado: o código é o
        // portão. A fila de aprovação some para cadastros novos — ela continua de pé
        // só para os perfis que já estão pendentes hoje (ver renderTelaAguardandoAprovacao).
        approved: true,
        aprovadoPeloCodigo: true,
        aceitouTermos: true,
        dataAceiteTermos: new Date().toISOString()
    };

    // Sem Firebase Auth (modo local) não há onde guardar a credencial senão aqui.
    if (!userAuth) newUser.senha = senha;

    users.push(newUser);
    await saveData('system', 'users_list', { list: users });

    // [SEGURANÇA] Cria o documento de acesso do novo usuário como PENDENTE. Isso é feito
    // enquanto ele ainda está autenticado (logo após createUserWithEmailAndPassword), pois
    // as Regras do Firestore só permitem o próprio usuário criar seu access/{uid} com
    // approved:false. A liberação para true é exclusiva do gestor/admin.
    if (userAuth) {
        await gravarAcessoUsuario(userAuth.uid, {
            approved: true,
            role: papel,
            schoolId: escolaId,
            espacoId: espacoId,
            legacySchoolId: escolaId,
            email,
            createdAt: new Date().toISOString()
        });
    }

    // Guarda o espaço neste aparelho: é de onde sai o timbre dos documentos sem rede
    // e, para quem criou, é o ÚNICO lugar onde o código fica — ele não vai para o banco.
    if (espacoId && typeof lembrarEspaco === 'function') {
        await lembrarEspaco(espacoId, codigoNovoEspaco, espacoEncontrado.espaco);
    }

    if (codigoNovoEspaco) {
        alert('Espaço criado!\n\nO CÓDIGO DA SUA ESCOLA É:\n\n    ' + formatarCodigo(codigoNovoEspaco) + '\n\n' +
              'Anote agora e passe aos colegas — é com ele que eles entram.\n' +
              'Este código NÃO fica guardado no servidor: ele fica só neste aparelho, no seu painel de gestor.\n\n' +
              'Se perder, você poderá gerar um novo pelo painel da escola.');
    } else {
        alert('Cadastro realizado!\n\nVocê já está no espaço "' + (espacoEncontrado.espaco.nome || 'da sua escola') + '".\n\nFaça login para começar.');
    }
    // Desloga o usuário recém-criado para forçar o fluxo de login padrão
    if (userAuth) {
        await firebase.auth().signOut();
    }
    renderLogin();
}

// --- LIBERAÇÃO DE ACESSO PELO GESTOR (perfis novos) ---
// Perfil novo (approved === false) fica bloqueado até a gestão da escola confirmar.
// Usuários antigos (sem o campo `approved`) são tratados como já liberados para não
// travar quem já usava o sistema. O super_admin nunca é bloqueado.
function usuarioAguardandoAprovacao(user) {
    if (!user) return false;
    if (user.role === 'super_admin') return false;
    // [FASE 3] Quem entrou com o código do espaço já passou pelo portão. A fila
    // continua existindo apenas para os perfis que ficaram pendentes ANTES dela
    // acabar — esses ainda precisam do gestor, e não podem ser esquecidos aqui.
    if (user.espacoId) return false;
    return user.approved === false;
}

// ============================================================================
//  QUEM É SUPER ADMIN
// ----------------------------------------------------------------------------
//  Esta lista espelha isSuperAdmin() no firestore.rules. Mudar aqui sem mudar lá
//  não concede poder nenhum: quem decide é o servidor.
// ============================================================================
const ADMIN_EMAILS = [
    'rafaelnf93@gmail.com',   // conta definitiva — caixa postal real
    'rafael@adm.com'          // LEGADO — ver abaixo
];

// O e-mail do administrador só vale VERIFICADO. Sem isso, enquanto a conta não
// existisse no Firebase Auth, qualquer pessoa que se cadastrasse com esse endereço
// viraria super admin — o cadastro não confere quem é dono da caixa postal.
//
// EXCEÇÃO TEMPORÁRIA: `rafael@adm.com` tem domínio falso, não recebe e-mail e
// portanto NUNCA poderá ser verificada. Fica isenta só enquanto serve de rede de
// segurança durante a troca.
//
//  >>> REMOVER `rafael@adm.com` DAS DUAS LISTAS (e das Regras do Firestore, e do
//  >>> Console do Firebase) assim que o acesso por rafaelnf93@gmail.com estiver
//  >>> confirmado. A senha dessa conta foi publicada no histórico do repositório,
//  >>> que é público — aposentá-la é a correção, não trocar a senha.
//  >>> Ver CONFORMIDADE-SEDUC.md, seção 4-A.
const ADMIN_EMAILS_SEM_VERIFICACAO = ['rafael@adm.com'];

// Apelido do e-mail principal, usado em mensagens e no perfil da sessão.
const ADMIN_EMAIL = ADMIN_EMAILS[0];

// Aceita o atalho histórico "rafael@adm" (sem .com) que muita gente digitava.
function normalizarEmailAdmin(email) {
    const e = String(email || '').trim().toLowerCase();
    return e === 'rafael@adm' ? 'rafael@adm.com' : e;
}

function ehEmailAdmin(email) {
    return ADMIN_EMAILS.indexOf(normalizarEmailAdmin(email)) !== -1;
}

function adminExigeVerificacao(email) {
    return ADMIN_EMAILS_SEM_VERIFICACAO.indexOf(normalizarEmailAdmin(email)) === -1;
}

// Grava/atualiza o documento de acesso por usuário na coleção `access` do Firestore.
// Esse documento (access/{uid}) é a fonte da verdade que as Regras do Firestore usam
// para liberar ou bloquear o acesso aos dados da escola:
//   - cadastro  -> { approved: false }  (o próprio usuário cria, só pode ser "false")
//   - liberação -> { approved: true }   (gestor/admin)
//   - recusa    -> { approved: false }  (gestor/admin)
// Escreve com merge para não apagar campos já existentes. É best-effort e silencioso
// (não interrompe o fluxo se as regras/rede recusarem).
async function gravarAcessoUsuario(uid, dados) {
    if (!uid || !USE_FIREBASE || typeof db === 'undefined' || !db) return;
    try {
        const clean = JSON.parse(JSON.stringify(dados || {}));
        await db.collection('access').doc(String(uid)).set(clean, { merge: true });
    } catch (e) {
        console.warn('Não foi possível gravar o documento de acesso (access/' + uid + '):', e && e.message);
    }
}

// ============================================================================
//  SESSÃO NO FIREBASE AUTH — a diferença entre "estar no sistema" e "poder gravar"
// ----------------------------------------------------------------------------
//  init() abre o painel a partir do `app_current_user` guardado no localStorage,
//  SEM exigir sessão no Auth. Isso é de propósito (é o que deixa o sistema abrir
//  sem rede), mas produz um estado traiçoeiro: a pessoa está dentro, vê tudo, e
//  toda gravação é recusada pelas Regras — que pedem `request.auth != null`.
//
//  Foi exatamente o que aconteceu com o super admin em 11/09/2026: as Regras
//  estavam publicadas, o painel abria, e "Gerar espaços e códigos" respondia
//  "Missing or insufficient permissions". A conta vinha de um `app_current_user`
//  gravado na época em que o administrador entrava sem Auth nenhum — e esse
//  registro sobrevive para sempre no navegador.
//
//  Agora o sistema diz isso na cara, em vez de deixar a pessoa descobrir por
//  tentativa e erro.
// ============================================================================
function sessaoFirebaseAtiva() {
    if (!USE_FIREBASE) return true;
    if (typeof firebase === 'undefined' || !firebase.auth) return false;
    try { return !!firebase.auth().currentUser; } catch (e) { return false; }
}

// Sem rede, não ter sessão é normal e não há o que fazer a respeito — o aviso só
// atrapalharia quem está trabalhando no aparelho.
function precisaAvisarSemSessao() {
    if (sessaoFirebaseAtiva()) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return !!currentUser;
}

function mostrarBannerSemSessao() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('bannerSemSessao')) return;
    const banner = document.createElement('div');
    banner.id = 'bannerSemSessao';
    banner.style.cssText = 'position:sticky; top:0; z-index:10002; background:#975a16; color:#fff; ' +
        'padding:12px 16px; text-align:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.25);';
    banner.innerHTML =
        '<div style="max-width:780px; margin:0 auto;">' +
          '<strong>Você está no sistema, mas sem sessão no Firebase.</strong><br>' +
          '<span style="font-size:13px; opacity:.95;">Dá para ver tudo, mas o banco recusa qualquer ' +
          'gravação — é o que faz aparecer "sem permissão" ao salvar. Entrar de novo resolve; ' +
          'nada é apagado.</span>' +
          '<div style="margin-top:9px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">' +
            '<button class="btn btn-sm" style="background:#fff; color:#975a16; font-weight:bold;" ' +
              'onclick="entrarDeNovo()">Entrar de novo</button>' +
            '<button class="btn btn-sm" style="background:transparent; color:#fff; text-decoration:underline;" ' +
              'onclick="this.closest(\'#bannerSemSessao\').remove()">Agora não</button>' +
          '</div>' +
        '</div>';
    document.body.insertBefore(banner, document.body.firstChild);
}

// Encerra só a sessão local e volta ao login. NÃO apaga dado: o que o professor
// tem continua em app_data_<uid> e no IndexedDB deste aparelho.
async function entrarDeNovo() {
    try { if (USE_FIREBASE && typeof firebase !== 'undefined' && firebase.auth) await firebase.auth().signOut(); }
    catch (e) {}
    localStorage.removeItem('app_current_user');
    location.reload();
}

// --- ACEITE ÚNICO DOS TERMOS DE USO (usuários já cadastrados) ---
// Usuários criados antes destes Termos não têm o campo `aceitouTermos`. Ao entrarem,
// exibimos um popup único exigindo a concordância; sem aceite, o acesso é encerrado.
function precisaAceitarTermos(user) {
    if (!user) return false;
    if (user.role === 'super_admin') return false; // Admin não passa por este fluxo
    return !user.aceitouTermos;
}

function verificarAceiteTermos() {
    if (!precisaAceitarTermos(currentUser)) return;
    const modal = document.getElementById('modalAceiteTermos');
    if (!modal) return;
    const check = document.getElementById('checkAceiteTermos');
    const btn = document.getElementById('btnConfirmarTermos');
    if (check) check.checked = false;
    if (btn) btn.disabled = true;
    modal.style.display = 'flex';
}

function toggleBtnAceiteTermos() {
    const check = document.getElementById('checkAceiteTermos');
    const btn = document.getElementById('btnConfirmarTermos');
    if (btn) btn.disabled = !(check && check.checked);
}

async function confirmarAceiteTermos() {
    const check = document.getElementById('checkAceiteTermos');
    if (!check || !check.checked) {
        alert('É necessário marcar a caixa de concordância para continuar.');
        return;
    }
    const agora = new Date().toISOString();
    // Persiste o aceite no perfil do usuário no banco (deixa rastro do consentimento)
    try {
        if (currentUser && currentUser.email) {
            const usersData = await getData('system', 'users_list');
            const users = (usersData && usersData.list && Array.isArray(usersData.list)) ? usersData.list : [];
            const alvo = currentUser.email.trim().toLowerCase();
            const idx = users.findIndex(u => (u.email || '').trim().toLowerCase() === alvo);
            if (idx !== -1) {
                users[idx].aceitouTermos = true;
                users[idx].dataAceiteTermos = agora;
                await saveData('system', 'users_list', { list: users });
            }
        }
    } catch (e) {
        console.warn('Não foi possível registrar o aceite dos termos no banco:', e);
    }
    // Atualiza a sessão local para o popup não reaparecer
    currentUser.aceitouTermos = true;
    currentUser.dataAceiteTermos = agora;
    localStorage.setItem('app_current_user', JSON.stringify(currentUser));
    const modal = document.getElementById('modalAceiteTermos');
    if (modal) modal.style.display = 'none';
}

function recusarTermos() {
    alert('Para utilizar o SisProf é necessário concordar com os Termos de Uso.\nO acesso será encerrado.');
    const modal = document.getElementById('modalAceiteTermos');
    if (modal) modal.style.display = 'none';
    if (typeof logout === 'function') logout();
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

    const statusClass = USE_FIREBASE ? 'online' : 'offline';
    const statusText = USE_FIREBASE ? '🔥 Online (Firebase)' : '💻 Local (Offline)';

    container.innerHTML = `
        <div class="auth-box">
            <h2>🔐 Login</h2>
            <div class="status-indicator ${statusClass}">${statusText}</div>
            <form onsubmit="fazerLogin(event)">
                <label>Email: <input type="email" id="loginEmail" required></label>
                <label>Senha: 
                    <div class="password-wrapper">
                        <input type="password" id="loginSenha" required>
                        <button type="button" class="toggle-password" onclick="toggleSenha('loginSenha', this)">👁️</button>
                    </div>
                </label>
                <button type="submit" class="btn btn-primary">Entrar</button>
            </form>
            <div class="auth-links-container">
                <span class="auth-link" onclick="solicitarResetSenha()">Esqueceu a senha?</span>
                <span class="auth-link" onclick="renderCadastro()">Não tem conta? Cadastre-se</span>
            </div>
            <div style="text-align:center; margin-top:12px;">
                <a href="termos.html" target="_blank" class="auth-link" style="font-size:12px;">📄 Termos de Uso</a>
            </div>
        </div>
    `;
}

// [FASE 3] O cadastro deixa de ser "escolha a escola numa lista e espere alguém
// liberar". Quem tem o código do espaço entra direto; quem não tem, cria o espaço
// dele e vira o gestor. O código é o portão — não há mais fila de aprovação.
function alternarCriacaoEspaco(criar) {
    const bloco = document.getElementById('blocoCriarEspaco');
    const campoCodigo = document.getElementById('blocoCodigoEspaco');
    const codigo = document.getElementById('cadCodigo');
    const nomeEscola = document.getElementById('cadEscolaNome');
    if (!bloco || !campoCodigo) return;
    bloco.style.display = criar ? 'block' : 'none';
    campoCodigo.style.display = criar ? 'none' : 'block';
    if (codigo) codigo.required = !criar;
    if (nomeEscola) nomeEscola.required = !!criar;
    window.cadastroCriandoEspaco = !!criar;
}

async function renderCadastro() {
    const container = document.getElementById('authContainer');
    container.innerHTML = `
        <div class="auth-box">
            <h2>📝 Cadastro</h2>
            <form onsubmit="fazerCadastro(event)">
                <label>Nome: <input type="text" id="cadNome" required></label>
                <label>Email: <input type="email" id="cadEmail" required></label>
                <div id="blocoCodigoEspaco">
                    <label>Código do espaço da sua escola:
                        <input type="text" id="cadCodigo" required placeholder="Ex: ABCD-EFGH-JKMN"
                               autocapitalize="characters" autocomplete="off"
                               style="text-transform:uppercase; letter-spacing:1px;">
                    </label>
                    <p style="font-size:12px; color:#718096; margin:-4px 0 8px;">
                        Peça o código a um colega que já usa o sistema na sua escola.
                    </p>
                </div>
                <div id="blocoCriarEspaco" style="display:none; background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <label>Nome da escola:
                        <input type="text" id="cadEscolaNome" placeholder="Ex: E.E. Prof.ª Francisca Peralta">
                    </label>
                    <p style="font-size:12px; color:#718096; margin:4px 0 0;">
                        Você vai receber um código para passar aos colegas — e será o gestor deste espaço.
                    </p>
                </div>
                <label>Senha: 
                    <div class="password-wrapper">
                        <input type="password" id="cadSenha" required>
                        <button type="button" class="toggle-password" onclick="toggleSenha('cadSenha', this)">👁️</button>
                    </div>
                </label>
                <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; color:#4a5568; margin-top:6px; font-weight:normal;">
                    <input type="checkbox" id="cadAceiteTermos" style="margin-top:2px; width:auto;">
                    <span>Li e concordo com os <a href="termos.html" target="_blank" class="auth-link" style="font-size:12px;">Termos de Uso</a>. Estou ciente de que os dados são de caráter auxiliar, não oficiais, não podem ser usados de forma pública, e que a escola e os desenvolvedores não se responsabilizam pelo uso da plataforma nem pelos dados publicados.</span>
                </label>
                <button type="submit" class="btn btn-success">Criar Conta</button>
            </form>
            <div class="auth-links-container" style="justify-content: center; flex-direction:column; gap:6px;">
                <span class="auth-link" id="linkCriarEspaco" onclick="alternarCriacaoEspaco(true); this.style.display='none'; document.getElementById('linkTenhoCodigo').style.display='inline';">Não tenho código — criar um espaço novo</span>
                <span class="auth-link" id="linkTenhoCodigo" style="display:none;" onclick="alternarCriacaoEspaco(false); this.style.display='none'; document.getElementById('linkCriarEspaco').style.display='inline';">Já tenho um código de convite</span>
                <span class="auth-link" onclick="renderLogin()">Já tem conta? Faça Login</span>
            </div>
        </div>
    `;
    window.cadastroCriandoEspaco = false;
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
// Retorna true se os dados foram carregados com segurança; false se a leitura falhou
// (permissão negada / rede). Quem chama usa isso para LIBERAR ou BLOQUEAR o salvamento:
// salvar depois de uma leitura falha apagaria os dados do professor na nuvem.
async function carregarDadosUsuario() {
    if (!currentUser) return false;
    const key = typeof getStorageKey === 'function' ? getStorageKey(currentUser) : 'app_data_' + currentUser.id;

    window.falhaLeituraFirestore = false;
    window.bloquearEscritaNuvem = false;

    const initial = typeof getInitialData === 'function' ? getInitialData() : {};

    // 1) Camada LOCAL — dado pessoal do estudante. Não depende de rede e, depois da
    //    transição, é a fonte da verdade.
    let local = null;
    try { if (typeof localGet === 'function') local = await localGet(key); }
    catch (e) { console.warn('[SisProf] Não consegui ler a cópia local:', e); }

    // 2) Camada NUVEM — turmas, agenda, planos de aula, documentação.
    const nuvem = await getData('app_data', key);

    // Conta que nunca converteu ainda tem dado pessoal EM CLARO neste documento. Saber
    // disso é o que impede o salvamento seguinte de apagá-lo antes de existir a cópia
    // cifrada — a única cópia na nuvem não pode morrer numa gravação que falhou.
    window.nuvemTemPessoalEmClaro = !!(nuvem && typeof CAMPOS_PESSOAIS !== 'undefined'
        && Object.keys(nuvem).some(k => CAMPOS_PESSOAIS.indexOf(k) !== -1));

    if (window.falhaLeituraFirestore) {
        // [PROTEÇÃO] Leitura falhou. NÃO assumir "conta vazia": salvar depois disso
        // apagaria os dados do professor na nuvem. Mostramos o que temos no aparelho e
        // travamos só a escrita na NUVEM — o trabalho local continua podendo ser salvo.
        window.bloquearEscritaNuvem = true;
        data = juntarDados(local, null);
        console.warn('[SisProf] Nuvem não respondeu. Trabalhando com a cópia deste aparelho; envio para a nuvem bloqueado.');
        return !!local;
    }

    // Antes da transição nada mudou: a nuvem continua sendo a fonte completa, como
    // sempre foi. Só depois de migrar é que a camada local passa a mandar no pessoal.
    if (podeEnviarDadoPessoal() && nuvem) {
        data = Object.assign({}, initial, nuvem);
        window.pessoalCifradoLido = false;   // neste modo a camada cifrada não é usada
        return true;
    }

    data = juntarDados(local, nuvem);

    // [FASE 7] A camada pessoal cifrada. É ela que faz uma máquina nova funcionar sem
    // arquivo: o aparelho não tem os estudantes, a nuvem tem — ilegível para ela.
    window.pessoalCifradoLido = false;
    window.pessoalSemChave = false;
    const remoto = await lerCamadaPessoalCifrada(key);

    if (remoto.estado === 'vazio') {
        // Nada lá: esta sessão sabe o que há na nuvem (nada), então pode gravar.
        window.pessoalCifradoLido = true;
    } else if (remoto.estado === 'ok') {
        window.pessoalCifradoLido = true;
        const localVazio = !local || ((local.estudantes || []).length === 0
                                   && (local.tutorados || []).length === 0
                                   && (local.ocorrencias || []).length === 0);
        // O aparelho manda quando tem algo; a nuvem só entra quando o aparelho está
        // vazio. Assim um terminal desatualizado nunca sobrescreve o trabalho local.
        if (localVazio) {
            data = juntarDados(remoto.dados, nuvem);
            try { if (typeof localSet === 'function') await localSet(key, data); } catch (e) {}
            console.log('[SisProf] Camada pessoal recuperada da nuvem (cifrada).');
        }
    } else if (remoto.estado === 'sem-chave') {
        window.pessoalSemChave = true;
        console.warn('[SisProf] Há dados cifrados na nuvem, mas a chave não está neste aparelho.');
    } else {
        console.warn('[SisProf] Camada pessoal cifrada não pôde ser lida; envio suspenso.');
    }

    return true;
}

// Lê um documento do professor juntando as duas camadas. Use sempre que o documento
// puder conter dado pessoal (o painel AEE da escola, por exemplo): depois do corte a
// nuvem devolve só a parte não-pessoal, e a parte pessoal está no aparelho.
async function lerDocUsuario(chave) {
    let local = null;
    try { if (typeof localGet === 'function') local = await localGet(chave); }
    catch (e) { console.warn('[SisProf] Cópia local de ' + chave + ':', e); }

    const nuvem = await getData('app_data', chave);

    if (podeEnviarDadoPessoal()) return nuvem || local || null;
    if (!local && !nuvem) return null;
    return juntarDados(local, nuvem);
}

// Grava o `data` do professor separando as duas camadas. É chamada por
// persistirDados() (app.js), que é quem sabe a hora certa de salvar.
// ============================================================================
//  CAMADA PESSOAL CIFRADA NA NUVEM  (Fase 7)
// ----------------------------------------------------------------------------
//  O modo local puro custou caro: quem trocava de maquina ficava sem os dados e
//  dependia de lembrar de um arquivo. Agora a camada pessoal TAMBEM sobe, cifrada
//  com a chave da conta (a mesma do backup da Fase 2, derivada da senha e guardada
//  so' no aparelho). Para o Firestore e' ruido; para qualquer terminal autorizado,
//  basta a senha.
//
//  A Regra do Firestore nao precisou mudar para isto: semCamposPessoais() olha as
//  CHAVES do documento, e um pacote cifrado nao tem nenhuma delas. Se um dia alguem
//  gravar dado em claro com este nome, a Regra recusa sozinha.
// ============================================================================
function chavePessoalCifrada(chave) { return 'pessoal_' + chave; }

// Terminal que entrou pela sessao restaurada (onAuthStateChanged) nao passou pela
// senha, entao nao tem a chave. Ha' dado cifrado esperando por ele na nuvem e nao
// adianta ficar em silencio: sem a chave, o aparelho nao ve' os estudantes E nao
// pode subir nada, porque gravar sem ter lido apagaria o que esta' la'.
function mostrarBannerPessoalSemChave() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('bannerPessoalSemChave')) return;
    const banner = document.createElement('div');
    banner.id = 'bannerPessoalSemChave';
    banner.style.cssText = 'position:sticky; top:0; z-index:10002; background:#2a4365; color:#fff; ' +
        'padding:12px 16px; text-align:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.25);';
    banner.innerHTML =
        '<div style="max-width:780px; margin:0 auto;">' +
          '<strong>Seus dados estão na nuvem, cifrados — e a chave não está neste aparelho.</strong><br>' +
          '<span style="font-size:13px; opacity:.95;">Informe a senha da sua conta uma vez para abrir. ' +
          'Ela não é enviada a lugar nenhum: serve para derivar a chave aqui mesmo.</span>' +
          '<div style="margin-top:9px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">' +
            '<button class="btn btn-sm" style="background:#fff; color:#2a4365; font-weight:bold;" ' +
              'onclick="desbloquearPessoalComSenha()">Abrir meus dados</button>' +
            '<button class="btn btn-sm" style="background:transparent; color:#fff; text-decoration:underline;" ' +
              'onclick="this.closest(\'#bannerPessoalSemChave\').remove()">Agora não</button>' +
          '</div>' +
        '</div>';
    document.body.insertBefore(banner, document.body.firstChild);
}

async function desbloquearPessoalComSenha() {
    const fbUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!fbUser) return alert('Entre de novo com e-mail e senha para abrir seus dados.');

    const senha = prompt('Senha da sua conta (' + (fbUser.email || '') + '):');
    if (!senha) return;
    try {
        await desbloquearChaveBackupComSenha(fbUser.uid, senha);
        const chave = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
        if (!chave) throw new Error('a chave não ficou disponível');
        alert('Chave aberta neste aparelho. A página vai recarregar para trazer seus dados.');
        location.reload();
    } catch (e) {
        alert('Não consegui abrir com essa senha.\n\n' + (e && e.message) +
              '\n\nSe você redefiniu a senha por e-mail, os dados cifrados antes da troca ' +
              'só voltam pela restauração do suporte. Avise a gestão.');
    }
}

// Le e decifra a camada pessoal da nuvem. Devolve:
//   { estado: 'ok', dados }        decifrou
//   { estado: 'vazio' }            nao existe la' (nada a perder)
//   { estado: 'sem-chave' }        existe, mas este aparelho nao tem a chave
//   { estado: 'erro', erro }       existe e nao deu para ler
async function lerCamadaPessoalCifrada(chave) {
    const id = chavePessoalCifrada(chave);
    const doc = await getData('app_data', id);
    if (window.falhaLeituraFirestore) return { estado: 'erro', erro: 'leitura da nuvem falhou' };
    if (!doc) return { estado: 'vazio' };

    const dek = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
    if (!dek) return { estado: 'sem-chave' };

    try {
        const dados = await decifrarPacote(doc, dek, (n) => getData('app_data', id + '_p' + n));
        return { estado: 'ok', dados: dados };
    } catch (e) {
        console.error('[SisProf] Não consegui decifrar a camada pessoal:', e);
        return { estado: 'erro', erro: e.message };
    }
}

// Sobe a camada pessoal cifrada.
//
// A TRAVA QUE NAO PODE FALTAR: um pacote cifrado vazio e' indistinguivel de um cheio
// a olho nu, entao gravar por cima sem ter lido o que estava la' apagaria tudo sem
// ninguem perceber. So' grava quando esta sessao SABE o que ha' na nuvem - porque
// decifrou, ou porque confirmou que nao existe nada.
async function enviarCamadaPessoalCifrada(chave, dados) {
    if (window.pessoalCifradoLido !== true) {
        console.warn('[SisProf] Camada pessoal não enviada: esta sessão não confirmou o que há na nuvem.');
        return false;
    }
    const dek = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
    if (!dek) { window.pessoalSemChave = true; return false; }

    const id = chavePessoalCifrada(chave);
    const pessoal = dividirDados(dados).local;
    try {
        const pacote = await cifrarPacote(pessoal, dek);
        await saveData('app_data', id, pacote.principal);
        for (const cont of pacote.continuacoes) {
            await saveData('app_data', id + '_p' + cont.parte, cont);
        }
        // Sobras de uma versao anterior com MAIS partes confundiriam a remontagem.
        const antes = window._partesPessoal || 1;
        for (let i = pacote.principal.partes + 1; i <= antes; i++) {
            try { await db.collection('app_data').doc(id + '_p' + i).delete(); }
            catch (e) { console.warn('[SisProf] Sobra da camada pessoal não removida:', e); }
        }
        window._partesPessoal = pacote.principal.partes;

        // Uma vez por sessão, reler e decifrar o que acabou de subir. Gravar e nunca
        // conferir é como o backup que ninguém testou: parece existir até o dia em que
        // precisa. Falhando aqui, a conta NÃO é dada por convertida.
        if (!window._pessoalConferidoNestaSessao) {
            try {
                const volta = await lerCamadaPessoalCifrada(chave);
                if (volta.estado !== 'ok') {
                    console.error('[SisProf] O pacote cifrado não voltou legível:', volta.estado);
                    return false;
                }
                window._pessoalConferidoNestaSessao = true;
            } catch (e) {
                console.error('[SisProf] Não consegui conferir o pacote cifrado:', e);
                return false;
            }
        }
        return true;
    } catch (e) {
        console.error('[SisProf] Falha ao enviar a camada pessoal cifrada:', e);
        return false;
    }
}

async function salvarDadosUsuario(chave, dados) {
    if (typeof localSet === 'function') await localSet(chave, dados);

    if (window.bloquearEscritaNuvem) return;

    if (podeEnviarDadoPessoal()) {
        // Antes do corte (ou usuário isento pelo super admin): sobe tudo, como hoje.
        await saveData('app_data', chave, dados);
        return;
    }

    // A ORDEM AQUI E' A PROTECAO, e ela ja' esteve errada: o documento em claro era
    // reescrito primeiro (o que remove os campos pessoais que ainda estivessem la') e a
    // camada cifrada ia depois. Falhando a segunda - sem chave, rede, Regra -, o banco
    // ficava SEM COPIA NENHUMA do dado pessoal. Cifrado primeiro, claro depois.
    const cifradoOk = await enviarCamadaPessoalCifrada(chave, dados);

    if (window.nuvemTemPessoalEmClaro && !cifradoOk) {
        // Esta conta ainda tem o dado pessoal em claro na nuvem e a cópia cifrada não
        // entrou. Reescrever o documento agora apagaria a única cópia que existe lá.
        // Melhor um documento desatualizado do que nenhum: o trabalho está salvo no
        // aparelho e a faixa do topo avisa.
        console.warn('[SisProf] Documento em claro preservado: a cópia cifrada não foi gravada.');
        window.pessoalNaoSincronizou = true;
        return;
    }

    await saveData('app_data', chave, dividirDados(dados).nuvem);
    if (cifradoOk) {
        window.nuvemTemPessoalEmClaro = false;   // convertida: o pessoal agora é o pacote cifrado
        window.pessoalNaoSincronizou = false;
    }
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