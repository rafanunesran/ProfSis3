// listaescola.js — a lista da escola volta para os professores, cifrada
// ============================================================================
//  O QUE QUEBROU, E POR QUE ISTO EXISTE
//    Antes da adequação, o professor abria a turma e o sistema lia
//    `app_data/app_data_school_<escola>_gestor` direto do banco: lá estavam os
//    estudantes em texto claro, e o gestor incluir, transferir ou excluir alguém
//    aparecia para o professor na abertura seguinte.
//
//    A adequação de setembro/2026 tirou `estudantes` (e `ocorrencias`, e
//    `registrosAdministrativos`) do documento em claro — ver CAMPOS_PESSOAIS em
//    shared.js. Cada profissional passou a guardar a sua camada pessoal cifrada
//    com a chave DELE (app_data/pessoal_<chave>, core.js), e chave de um não abre
//    o pacote do outro. Resultado prático, silencioso e diário: `gestorData.estudantes`
//    virou `undefined`, o bloco de sincronização de `abrirTurma` parou de rodar
//    inteiro, e a lista do professor congelou no dia da virada. Transferência,
//    matrícula nova e exclusão feitas pela gestão não chegavam a ninguém.
//
//    A CONFORMIDADE-SEDUC.md já previa o conserto ("a visão nominal do gestor
//    volta depois, cifrada com uma chave que só a escola tem") e a Fase 3 já
//    tinha deixado o segredo pronto: o CÓDIGO DE CONVITE do espaço, que fica nos
//    aparelhos e NÃO é gravado no servidor (espacos.js). É dele que a chave sai.
//
//  O DESENHO, EM UMA FRASE
//    O gestor publica um retrato da lista cifrado com PBKDF2(código do espaço,
//    salt do espaço); quem tem o código da escola — e só quem tem — abre.
//
//  O QUE ISSO PROTEGE, E O QUE NÃO PROTEGE
//    Para o Firestore, para o Google e para quem invadir o banco, o documento é
//    ruído: o código não está lá, de propósito, e sem ele não há o que derivar.
//    NÃO protege contra quem tem o código — que é exatamente o ponto: o código é
//    a credencial da escola, e a escola precisa enxergar a própria lista.
//
//  ONDE MORA CADA COISA
//    - código do espaço ...... IndexedDB do aparelho (meta `codigoEspaco`)
//    - salt .................. espacos/<espacoId>.salt (público; salt não é segredo)
//    - lista cifrada ......... app_data/lista_school_<escola>_<painel> (+ _p2, _p3...)
//
//  POR QUE A REGRA DO FIRESTORE NÃO PRECISOU MUDAR
//    `semCamposPessoais()` olha as CHAVES do documento, e um pacote cifrado não
//    tem nenhuma delas — só `cifrado`, `iv`, `ct`, `partes`. O contrário também
//    vale: tentar gravar a lista em claro com este nome continua sendo recusado.
// ============================================================================

// Painéis que publicam alguma coisa para o resto da escola. O professor lê os três.
const LISTA_ESCOLA_PAINEIS = ['gestor', 'aee', 'projeto'];

// Mesmo custo do envelope de backup (cripto.js). Não é economia de tempo que
// protege aqui: é o código de 12 caracteres do espaço.
const LISTA_ESCOLA_ITERACOES = 210000;
const LISTA_ESCOLA_PREFIXO = 'profsis-lista-v1:';

// Quanto tempo um retrato já decifrado vale nesta sessão. Abrir quatro turmas
// seguidas não pode custar quatro PBKDF2 de 210 mil rodadas; por outro lado, o
// professor que espera a transferência que a gestão acabou de fazer não pode
// ficar minutos com a lista velha.
const LISTA_ESCOLA_CACHE_MS = 15000;

let _chaveEscolaCache = null;      // { espacoId, chave }
let _motivoSemChaveEscola = null;  // 'sem-espaco' | 'sem-codigo' | 'sem-salt'
let _cacheLista = {};              // docId -> { quando, resultado }
let _ultimoPublicado = {};         // docId -> JSON do último recorte que subiu
let _partesPublicadas = {};        // docId -> quantas partes o último envio usou
let _timerPublicacao = null;

// --- A chave da escola -------------------------------------------------------

function _bytesLista(texto) { return new TextEncoder().encode(String(texto)); }

// PBKDF2(código do espaço, salt do espaço) -> AES-GCM 256.
// O prefixo separa esta chave de qualquer outra derivada do mesmo código no futuro:
// derivar duas chaves iguais para usos diferentes é o tipo de erro que só aparece
// quando já é tarde.
async function derivarChaveEscola(codigo, salt) {
    const limpo = (typeof normalizarCodigo === 'function') ? normalizarCodigo(codigo) : String(codigo || '');
    const base = await crypto.subtle.importKey(
        'raw', _bytesLista(LISTA_ESCOLA_PREFIXO + limpo), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: _bytesLista(salt), iterations: LISTA_ESCOLA_ITERACOES, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Por que a lista não abriu. Serve para a tela dizer a coisa certa: "sua escola
// ainda não tem espaço" e "o código não está neste aparelho" pedem conversas
// diferentes, e tratá-las igual manda o professor procurar no lugar errado.
function motivoSemChaveEscola() { return _motivoSemChaveEscola; }

// Qual espaço, para efeito da chave. O perfil manda; o aparelho serve de rede.
//
// A rede não é preciosismo: a Fase 3 vinculou ao espaço quem se cadastrou depois
// dela, e o perfil de quem já usava o sistema ficou sem `espacoId` mesmo com a
// escola tendo espaço. Sem este segundo lugar, esses professores veriam "sua escola
// não tem espaço" olhando para uma lista publicada pelo espaço da própria escola.
async function espacoDaEscolaAtual() {
    const ref = (typeof resolverEspaco === 'function')
        ? resolverEspaco(typeof currentUser !== 'undefined' ? currentUser : null)
        : { espacoId: null };
    if (ref && ref.espacoId) return ref.espacoId;
    if (typeof metaGet !== 'function') return null;
    try { return (await metaGet('espacoId')) || null; } catch (e) { return null; }
}

async function obterChaveEscola(forcar) {
    const espacoId = await espacoDaEscolaAtual();

    // Escola que nunca virou espaço não tem segredo comum nenhum: não há o que
    // derivar, e inventar um (o id da escola, o nome dela) seria fingir cifra —
    // qualquer pessoa autenticada leria a lista inteira.
    if (!espacoId) { _motivoSemChaveEscola = 'sem-espaco'; return null; }

    if (!forcar && _chaveEscolaCache && _chaveEscolaCache.espacoId === espacoId) {
        _motivoSemChaveEscola = null;
        return _chaveEscolaCache.chave;
    }

    let codigo = null;
    try { codigo = (typeof codigoEspacoGuardado === 'function') ? await codigoEspacoGuardado() : null; }
    catch (e) { codigo = null; }
    if (!codigo) { _motivoSemChaveEscola = 'sem-codigo'; return null; }

    const espaco = await getData('espacos', espacoId);
    // Espaço criado antes do campo `salt` existir cai no próprio id: ele é único,
    // estável e público — que é tudo o que se pede de um salt.
    const salt = (espaco && espaco.salt) || espacoId;

    const chave = await derivarChaveEscola(codigo, salt);
    _chaveEscolaCache = { espacoId: espacoId, chave: chave };
    _motivoSemChaveEscola = null;
    return chave;
}

// Trocou o código (ou entrou num espaço): o que estava derivado não vale mais.
function limparCacheListaEscola() {
    _chaveEscolaCache = null;
    _cacheLista = {};
    _ultimoPublicado = {};
}

// --- O documento -------------------------------------------------------------

function docListaEscola(schoolId, painel) {
    return 'lista_school_' + schoolId + '_' + (painel || 'gestor');
}

function _escolaAtualId() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!u) return null;
    const ref = (typeof resolverEspaco === 'function') ? resolverEspaco(u) : null;
    return (ref && ref.legacySchoolId) || u.schoolId || null;
}

// O que cada painel publica. É uma lista curta DE PROPÓSITO: o que sobe é o que o
// professor precisa para montar a turma, e nada além. Campo pessoal novo em `data`
// não entra aqui sozinho — alguém tem de escrevê-lo, olhando para ele.
function recorteDaEscola(painel, dados) {
    const d = dados || {};
    const recorte = { v: 1, painel: painel, geradoEm: new Date().toISOString() };

    if (painel === 'gestor') {
        recorte.estudantes = d.estudantes || [];
        recorte.registrosAdministrativos = d.registrosAdministrativos || [];
        recorte.ocorrencias = d.ocorrencias || [];
    } else {
        // AEE e Projeto: o que o professor usa é a marcação do tutorado (o alerta
        // 🧩 na lista da turma). Os Anexos III/IV NÃO saem do painel que os escreveu.
        recorte.tutorados = (d.tutorados || []).map(t => ({
            id: t.id,
            id_estudante_origem: t.id_estudante_origem,
            nome_estudante: t.nome_estudante,
            aee_diagnostico: t.aee_diagnostico || '',
            aee_categoria_diagnostico: t.aee_categoria_diagnostico || '',
            aee_categoria_projeto: t.aee_categoria_projeto || ''
        }));
    }
    return recorte;
}

// --- Publicar (gestor / AEE / projeto) ---------------------------------------

// Devolve { estado, ... }:
//   'ok'            publicou
//   'igual'         nada mudou desde o último envio (não gasta gravação)
//   'sem-espaco'    a escola não é um espaço com código: não há chave possível
//   'sem-codigo'    o código não está neste aparelho
//   'recusado'      o retrato viria vazio por cima de um cheio (ver abaixo)
//   'erro'          a gravação falhou
//
// Duas chaves em `opcoes`, e elas NÃO são a mesma coisa:
//   forcar       publica mesmo que nada tenha mudado (o botão "publicar agora");
//   mesmoVazio   publica mesmo que o retrato esvazie a lista de todos os professores.
// Já estiveram juntas numa só, e o teste pegou: quem só queria conferir na hora
// ganhava de brinde o poder de apagar a lista da escola inteira.
async function publicarListaEscola(dados, painel, opcoes) {
    const alvo = painel || (typeof currentViewMode !== 'undefined' ? currentViewMode : null);
    if (LISTA_ESCOLA_PAINEIS.indexOf(alvo) === -1) return { estado: 'painel-nao-publica' };

    const schoolId = _escolaAtualId();
    if (!schoolId) return { estado: 'sem-escola' };

    // A mesma trava que segura a gravação normal (core.js): aparelho cuja cópia
    // local não carregou por inteiro não publica retrato nenhum.
    if (window.bloquearEscritaLocal || window.bloquearEscritaNuvem) return { estado: 'bloqueado' };

    const chave = await obterChaveEscola();
    if (!chave) return { estado: motivoSemChaveEscola() || 'sem-chave' };

    const id = docListaEscola(schoolId, alvo);
    const recorte = recorteDaEscola(alvo, dados);

    // Gravação que não muda nada é gravação à toa: persistirDados() roda a cada
    // clique do gestor, e o retrato quase sempre é o mesmo.
    const assinatura = JSON.stringify(Object.assign({}, recorte, { geradoEm: null }));
    if (!(opcoes && opcoes.forcar) && _ultimoPublicado[id] === assinatura) return { estado: 'igual' };

    // A TRAVA QUE NÃO PODE FALTAR: publicar uma lista VAZIA por cima de uma cheia
    // apaga a turma de todos os professores da escola de uma vez, e em silêncio —
    // eles só veem a tela vazia no dia seguinte. Um painel que abriu sem os dados
    // (chave pessoal ausente, leitura que falhou) é exatamente esse caso.
    const vazio = _recorteVazio(recorte);
    if (vazio && !(opcoes && opcoes.mesmoVazio)) {
        const atual = await lerListaEscola(alvo, { forcar: true });
        if (atual.estado === 'ok' && !_recorteVazio(atual.dados)) {
            console.warn('[Lista da escola] Publicação recusada: o retrato viria vazio por cima de um com conteúdo.');
            return { estado: 'recusado' };
        }
    }

    try {
        const pacote = await cifrarPacote(recorte, chave);
        await saveData('app_data', id, pacote.principal);
        for (const cont of pacote.continuacoes) {
            await saveData('app_data', id + '_p' + cont.parte, cont);
        }
        // Sobras de uma versão anterior com MAIS partes confundiriam a remontagem.
        const antes = _partesPublicadas[id] || 1;
        for (let i = pacote.principal.partes + 1; i <= antes; i++) {
            try { await db.collection('app_data').doc(id + '_p' + i).delete(); }
            catch (e) { console.warn('[Lista da escola] Sobra não removida:', e); }
        }
        _partesPublicadas[id] = pacote.principal.partes;
        _ultimoPublicado[id] = assinatura;
        delete _cacheLista[id];
        return { estado: 'ok', geradoEm: recorte.geradoEm, partes: pacote.principal.partes };
    } catch (e) {
        console.error('[Lista da escola] Falha ao publicar:', e);
        return { estado: 'erro', erro: e && e.message };
    }
}

function _recorteVazio(r) {
    if (!r) return true;
    return !(r.estudantes || []).length
        && !(r.tutorados || []).length
        && !(r.ocorrencias || []).length
        && !(r.registrosAdministrativos || []).length;
}

// persistirDados() roda a cada digitação do gestor. Publicar em cima de cada uma
// seria uma gravação por tecla; esperar o dedo sair do teclado basta.
function agendarPublicacaoListaEscola(dados) {
    if (_timerPublicacao) clearTimeout(_timerPublicacao);
    _timerPublicacao = setTimeout(() => {
        _timerPublicacao = null;
        // O `data` global é REATRIBUÍDO em alguns caminhos (restauração de backup,
        // importação de arquivo). Publicar o objeto capturado quatro segundos atrás
        // seria publicar a lista de antes da restauração.
        const agora = (typeof data !== 'undefined' && data) ? data : dados;
        publicarListaEscola(agora).then(r => {
            if (r.estado !== 'ok' && r.estado !== 'igual' && r.estado !== 'painel-nao-publica') {
                console.warn('[Lista da escola] Não publicada:', r.estado);
            }
        }).catch(e => console.warn('[Lista da escola] Publicação falhou:', e));
    }, 4000);
}

// --- Ler (professor) ---------------------------------------------------------

// Devolve { estado, dados }:
//   'ok'          decifrou
//   'vazio'       a gestão ainda não publicou nada
//   'sem-espaco'  a escola não é um espaço com código
//   'sem-codigo'  existe lista publicada, mas o código não está neste aparelho
//   'erro'        existe e não deu para ler (rede, ou chave que não abre)
async function lerListaEscola(painel, opcoes) {
    const alvo = painel || 'gestor';
    const schoolId = _escolaAtualId();
    if (!schoolId) return { estado: 'sem-escola' };

    const id = docListaEscola(schoolId, alvo);
    const agora = Date.now();
    const cache = _cacheLista[id];
    if (!(opcoes && opcoes.forcar) && cache && (agora - cache.quando) < LISTA_ESCOLA_CACHE_MS) {
        return cache.resultado;
    }

    const antes = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = false;
    const doc = await getData('app_data', id);
    const falhou = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = antes;

    // Leitura que FALHOU não é "não existe": devolver 'vazio' aqui faria o professor
    // achar que a gestão não publicou nada, e — pior — daria por boa uma lista vazia.
    if (falhou) return { estado: 'erro', erro: 'leitura da nuvem falhou' };
    if (!doc) return _guardarCache(id, { estado: 'vazio' });
    if (!doc.cifrado) return _guardarCache(id, { estado: 'erro', erro: 'documento não está no formato cifrado' });

    const chave = await obterChaveEscola();
    if (!chave) return { estado: motivoSemChaveEscola() || 'sem-chave' };

    try {
        const dados = await decifrarPacote(doc, chave, (n) => getData('app_data', id + '_p' + n));
        return _guardarCache(id, { estado: 'ok', dados: dados });
    } catch (e) {
        // Chave errada e pacote corrompido dão o mesmo erro no AES-GCM. O caso comum
        // é o código ter sido trocado depois da publicação.
        console.error('[Lista da escola] Não consegui decifrar:', e);
        return { estado: 'erro', erro: 'a chave deste aparelho não abre a lista publicada' };
    }
}

function _guardarCache(id, resultado) {
    _cacheLista[id] = { quando: Date.now(), resultado: resultado };
    return resultado;
}

// --- Receber o código num aparelho que não o tem -----------------------------

// Confere o código contra o índice do espaço ANTES de guardar. Guardar um código
// errado seria pior do que não ter nenhum: a lista continuaria fechada, e o motivo
// passaria a ser "a chave não abre" em vez de "falta o código".
async function guardarCodigoEscolaDigitado(codigo) {
    const achado = await buscarEspacoPorCodigo(codigo);
    if (!achado) throw new Error('Código não encontrado.');

    const meu = await espacoDaEscolaAtual();
    const minhaEscola = _escolaAtualId();

    // Duas maneiras de o código ser o da SUA escola: ele leva ao espaço que o seu
    // perfil já declara, ou — para quem é anterior à Fase 3 e não tem espaço no
    // perfil — ao espaço que aponta para a MESMA escola de sempre (legacySchoolId).
    // Um código de outra escola não passa por nenhuma das duas.
    const daMinhaEscola = meu
        ? achado.espacoId === meu
        : String((achado.espaco && achado.espaco.legacySchoolId) || '') === String(minhaEscola || '');

    if (!daMinhaEscola) throw new Error('Este código é de outra escola.');

    await lembrarEspaco(achado.espacoId, codigo, achado.espaco);
    limparCacheListaEscola();
    return true;
}

// Existe lista publicada e este aparelho não tem o código. Ficar em silêncio é o
// que fazia o professor achar que a gestão não tinha mexido em nada.
function mostrarBannerListaEscolaSemChave(motivo) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('bannerListaEscolaSemChave')) return;
    if (window._listaEscolaBannerDispensado) return;

    const semEspaco = motivo === 'sem-espaco';
    const banner = document.createElement('div');
    banner.id = 'bannerListaEscolaSemChave';
    banner.style.cssText = 'position:sticky; top:0; z-index:10001; background:#744210; color:#fff; ' +
        'padding:12px 16px; text-align:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.25);';
    banner.innerHTML =
        '<div style="max-width:780px; margin:0 auto;">' +
          '<strong>A lista da sua escola está cifrada e a chave não está neste aparelho.</strong><br>' +
          '<span style="font-size:13px; opacity:.95;">' +
            (semEspaco
              ? 'Seu perfil ainda não está vinculado ao espaço da escola. Se a gestão já lhe passou o ' +
                'código, informe-o aqui; se a escola ainda não tem um, peça à gestão para criar no painel da Escola.'
              : 'Informe uma vez o código da escola (o mesmo do convite). Ele não é enviado a lugar nenhum: ' +
                'fica neste aparelho e serve para abrir a lista que a gestão publica.') +
          '</span>' +
          '<div style="margin-top:9px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">' +
            '<button class="btn btn-sm" style="background:#fff; color:#744210; font-weight:bold;" ' +
              'onclick="informarCodigoDaEscola()">Informar o código</button>' +
            '<button class="btn btn-sm" style="background:transparent; color:#fff; text-decoration:underline;" ' +
              'onclick="window._listaEscolaBannerDispensado=true; this.closest(\'#bannerListaEscolaSemChave\').remove()">Agora não</button>' +
          '</div>' +
        '</div>';
    document.body.insertBefore(banner, document.body.firstChild);
}

async function informarCodigoDaEscola() {
    const digitado = prompt('Código da escola (12 letras e números; os hífens não fazem diferença):');
    if (!digitado) return;
    try {
        await guardarCodigoEscolaDigitado(digitado);
        alert('Código guardado neste aparelho. A página vai recarregar para trazer a lista da escola.');
        location.reload();
    } catch (e) {
        const msg = (e && e.message) === 'rede'
            ? 'Não consegui conferir o código agora — parece falta de conexão.'
            : ((e && e.message) === 'negado'
                ? 'O banco recusou a consulta do código. Avise a gestão/suporte.'
                : (e && e.message) || 'Não consegui guardar o código.');
        alert(msg);
    }
}
