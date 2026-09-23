// listaescola.js — a lista da escola é da escola inteira
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
//  O DESENHO, EM UMA FRASE
//    A ESCOLA É UM AMBIENTE COMPARTILHADO: o painel da gestão publica a lista num
//    documento da escola e todo mundo da escola lê — sem código para digitar, sem
//    chave para guardar, sem passo de configuração nenhum.
//
//  ENTÃO POR QUE O DOCUMENTO É CIFRADO
//    Porque a Regra do Firestore recusa `estudantes` em claro depois do corte, e a
//    guarda do próprio app também (assertSemDadosPessoais, em core.js). A cifra
//    serve a isso: o nome do estudante não fica legível no banco. A chave é da
//    escola, mora em `app_data/chave_lista_school_<escola>` e nasce sozinha na
//    primeira publicação — ninguém digita, ninguém guarda, ninguém perde.
//
//  O QUE PROTEGE DE VERDADE: A REGRA, NÃO A CIFRA
//    Chave guardada ao lado do dado seria enfeite se qualquer pessoa autenticada
//    pudesse ler os dois documentos. É por isso que o par lista+chave é o PRIMEIRO
//    do sistema em que a Regra do Firestore confere `schoolId`: os dois só saem do
//    banco para quem tem a mesma escola no próprio `access/<uid>`. Sem a Regra
//    publicada no console, a cifra vale contra um dump do banco e nada mais — está
//    escrito assim também na CONFORMIDADE-SEDUC.md, sem promessa maior do que é.
//
//  ONDE MORA CADA COISA
//    - chave da escola ....... app_data/chave_lista_school_<escola>
//    - lista cifrada ......... app_data/lista_school_<escola>_<painel> (+ _p2, _p3...)
// ============================================================================

// Painéis que publicam alguma coisa para o resto da escola. O professor lê os três.
const LISTA_ESCOLA_PAINEIS = ['gestor', 'aee', 'projeto'];

// Quanto tempo um retrato já decifrado vale nesta sessão. Abrir quatro turmas
// seguidas não pode custar quatro leituras e quatro decifragens; por outro lado, o
// professor que espera a transferência que a gestão acabou de fazer não pode ficar
// minutos olhando para a lista velha.
const LISTA_ESCOLA_CACHE_MS = 15000;

let _chaveEscolaCache = null;   // { schoolId, chave }
let _cacheLista = {};           // docId -> { quando, resultado }
let _ultimoPublicado = {};      // docId -> JSON do último recorte que subiu
let _partesPublicadas = {};     // docId -> quantas partes o último envio usou
let _timerPublicacao = null;

// --- Os endereços da escola --------------------------------------------------

function _escolaAtualId() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!u) return null;
    // `legacySchoolId` é o id que nomeia TODOS os documentos do sistema, com espaço
    // ou sem espaço (ver espacos.js). Nada muda de lugar por causa desta função.
    const ref = (typeof resolverEspaco === 'function') ? resolverEspaco(u) : null;
    return (ref && ref.legacySchoolId) || u.schoolId || null;
}

function docListaEscola(schoolId, painel) {
    return 'lista_school_' + schoolId + '_' + (painel || 'gestor');
}

function docChaveEscola(schoolId) {
    return 'chave_lista_school_' + schoolId;
}

// --- A chave da escola -------------------------------------------------------
//
// Uma chave por escola, criada na primeira publicação e guardada no ambiente da
// escola. Quem entra pela escola encontra a chave lá: não existe aparelho "sem a
// chave", não existe professor que precise pedir nada a ninguém para ver a lista.

async function _importarChaveEscola(b64) {
    return crypto.subtle.importKey(
        'raw', b64ParaBytes(b64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// `criarSeFaltar` só é verdade em quem PUBLICA. Quem lê nunca cria chave: chave
// ausente significa que o painel ainda não publicou, e inventar uma aqui só
// produziria uma chave que não abre nada — e que atrapalharia a de verdade.
async function obterChaveEscola(criarSeFaltar) {
    const schoolId = _escolaAtualId();
    if (!schoolId) return null;

    if (_chaveEscolaCache && _chaveEscolaCache.schoolId === schoolId) return _chaveEscolaCache.chave;

    const id = docChaveEscola(schoolId);
    const doc = await getData('app_data', id);
    if (doc && doc.chave) {
        const chave = await _importarChaveEscola(doc.chave);
        _chaveEscolaCache = { schoolId: schoolId, chave: chave };
        return chave;
    }
    if (!criarSeFaltar) return null;

    const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const bruta = bytesParaB64(await crypto.subtle.exportKey('raw', nova));
    await saveData('app_data', id, { chave: bruta, criadoEm: new Date().toISOString() });

    // Relê antes de usar. Dois painéis publicando no mesmo minuto criariam duas
    // chaves, e a segunda tornaria ilegível o que a primeira acabou de publicar.
    // Quem relê usa a que ficou, e as duas sessões convergem para a mesma.
    const conferido = await getData('app_data', id);
    const valendo = (conferido && conferido.chave) ? conferido.chave : bruta;
    const chave = await _importarChaveEscola(valendo);
    _chaveEscolaCache = { schoolId: schoolId, chave: chave };
    return chave;
}

function limparCacheListaEscola() {
    _chaveEscolaCache = null;
    _cacheLista = {};
    _ultimoPublicado = {};
    if (typeof _cacheContribuicoes !== 'undefined') _cacheContribuicoes = null;
}

// --- O que cada painel publica ----------------------------------------------
//
// É uma lista curta DE PROPÓSITO: sobe o que o professor precisa para montar a
// turma, e nada além. Campo pessoal novo em `data` não entra aqui sozinho — alguém
// tem de escrevê-lo, olhando para ele. É a mesma regra de ouro de CAMPOS_NUVEM.
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

function _recorteVazio(r) {
    if (!r) return true;
    return !(r.estudantes || []).length
        && !(r.tutorados || []).length
        && !(r.ocorrencias || []).length
        && !(r.registrosAdministrativos || []).length;
}

// --- Publicar (gestor / AEE / projeto) ---------------------------------------

// Devolve { estado, ... }:
//   'ok'         publicou
//   'igual'      nada mudou desde o último envio (não gasta gravação)
//   'recusado'   o retrato viria vazio por cima de um cheio (ver abaixo)
//   'erro'       a gravação falhou
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
    if (_recorteVazio(recorte) && !(opcoes && opcoes.mesmoVazio)) {
        const atual = await lerListaEscola(alvo, { forcar: true });
        if (atual.estado === 'ok' && !_recorteVazio(atual.dados)) {
            console.warn('[Lista da escola] Publicação recusada: o retrato viria vazio por cima de um com conteúdo.');
            return { estado: 'recusado' };
        }
    }

    try {
        const r = await _gravarCifradoNaEscola(id, recorte);
        if (r.estado !== 'ok') return r;
        _ultimoPublicado[id] = assinatura;
        return r;
    } catch (e) {
        console.error('[Lista da escola] Falha ao publicar:', e);
        return { estado: 'erro', erro: e && e.message };
    }
}

// Cifra com a chave da escola e grava em `id` (+ _p2, _p3...). É o único jeito de algo
// pessoal chegar ao ambiente da escola: `saveData` recusaria o recorte em claro.
async function _gravarCifradoNaEscola(id, recorte) {
    const chave = await obterChaveEscola(true);
    if (!chave) return { estado: 'sem-chave' };

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
    delete _cacheLista[id];
    return { estado: 'ok', geradoEm: recorte.geradoEm, partes: pacote.principal.partes };
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

// --- Ler (qualquer pessoa da escola) -----------------------------------------

// Devolve { estado, dados }:
//   'ok'      decifrou
//   'vazio'   o painel ainda não publicou nada
//   'erro'    existe e não deu para ler (rede, chave ausente, chave que não abre)
async function lerListaEscola(painel, opcoes) {
    const alvo = painel || 'gestor';
    const schoolId = _escolaAtualId();
    if (!schoolId) return { estado: 'sem-escola' };

    const id = docListaEscola(schoolId, alvo);
    const cache = _cacheLista[id];
    if (!(opcoes && opcoes.forcar) && cache && (Date.now() - cache.quando) < LISTA_ESCOLA_CACHE_MS) {
        return cache.resultado;
    }

    const r = await _lerCifradoDaEscola(id);
    // Erro de rede/chave não entra no cache: a próxima abertura tenta de novo.
    if (r.estado === 'erro' && r.naoGuardar) return r;
    return _guardarCache(id, r);
}

async function _lerCifradoDaEscola(id) {
    const antes = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = false;
    const doc = await getData('app_data', id);
    const falhou = window.falhaLeituraFirestore;
    window.falhaLeituraFirestore = antes;

    // Leitura que FALHOU não é "não existe": devolver 'vazio' aqui faria o professor
    // achar que a gestão não publicou nada, e — pior — daria por boa uma lista vazia.
    if (falhou) return { estado: 'erro', erro: 'leitura da nuvem falhou', naoGuardar: true };
    if (!doc) return { estado: 'vazio' };
    if (!doc.cifrado) return { estado: 'erro', erro: 'documento não está no formato cifrado' };

    const chave = await obterChaveEscola(false);
    if (!chave) return { estado: 'erro', erro: 'a chave desta escola não foi encontrada', naoGuardar: true };

    try {
        const dados = await decifrarPacote(doc, chave, (n) => getData('app_data', id + '_p' + n));
        return { estado: 'ok', dados: dados };
    } catch (e) {
        console.error('[Lista da escola] Não consegui decifrar:', e);
        return { estado: 'erro', erro: 'a chave da escola não abre a lista publicada', naoGuardar: true };
    }
}

function _guardarCache(id, resultado) {
    _cacheLista[id] = { quando: Date.now(), resultado: resultado };
    return resultado;
}

// ============================================================================
//  O QUE O PROFESSOR DEVOLVE PARA A ESCOLA: OCORRÊNCIAS E FALTAS
// ----------------------------------------------------------------------------
//  Antes da adequação, duas coisas saíam da conta do professor para a escola:
//    - a ocorrência era copiada para `app_data_school_<escola>_gestor`, e o gestor a
//      via na hora, com a devolutiva voltando para o professor;
//    - a Busca Ativa do gestor lia `presencas` direto do documento de cada professor,
//      e era isso que mapeava o aluno faltoso na escola inteira.
//  Com `ocorrencias` e `presencas` fora do documento em claro (CAMPOS_PESSOAIS) e a
//  camada pessoal cifrada com a chave de CADA conta, as duas pararam em silêncio: a
//  cópia da ocorrência só rodava antes do corte, e a Busca Ativa passou a achar zero
//  falta em todo mundo.
//
//  O conserto segue o mesmo desenho da lista: a escola é um ambiente compartilhado.
//  Cada professor publica o SEU recorte, cifrado com a chave da escola, em
//  `lista_school_<escola>_prof_<id>` — a mesma família de documento que a Regra do
//  Firestore já só entrega a quem é da escola, sem nenhuma Regra nova.
//
//  O recorte é curto e escrito à mão, como `recorteDaEscola`:
//    - ocorrências das turmas vinculadas à gestão, com a turma trocada pela da gestão;
//    - faltas por dia (ids de estudante da lista da escola, sem nome);
//    - os dias em que houve chamada/registro em cada turma da gestão — é o que a Busca
//      Ativa usa para calcular a porcentagem de presença.
//  Turma sem vínculo com a gestão não sai daqui: os ids dela não são os da escola.
// ============================================================================

// Quanto tempo o conjunto dos recortes dos colegas vale nesta sessão. A chamada abre
// uma vez por turma e o relatório mensal consulta 31 dias seguidos: sem isto, cada dia
// custaria uma leitura por professor da escola.
const CONTRIBUICOES_CACHE_MS = 60000;
// Faltas mais antigas que isto não sobem: nenhum relatório olha para trás mais de um ano.
const CONTRIBUICAO_JANELA_DIAS = 400;

let _cacheContribuicoes = null;   // { schoolId, quando, lista }
let _timerContribuicao = null;

function _idSeguro(v) {
    return String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '_');
}

function docContribuicaoProfessor(schoolId, autorId) {
    return docListaEscola(schoolId, 'prof_' + _idSeguro(autorId));
}

// Painel pessoal = tudo que não é painel da escola. Só ele tem turmas com `masterId`
// e `presencas` do próprio professor.
function _ehPainelDoProfessor() {
    const modo = (typeof currentViewMode !== 'undefined') ? currentViewMode : null;
    return LISTA_ESCOLA_PAINEIS.indexOf(modo) === -1;
}

function recorteDoProfessor(dados, autor) {
    const d = dados || {};
    const masterDe = {};
    (d.turmas || []).forEach(t => { if (t && t.masterId != null && t.masterId !== '') masterDe[String(t.id)] = t.masterId; });

    // abrirTurma clona o aluno da gestão MANTENDO o id: é o que permite dizer, pelo id,
    // de qual turma da escola é a falta.
    const turmaMasterDoAluno = {};
    (d.estudantes || []).forEach(e => {
        const m = masterDe[String(e.id_turma)];
        if (m != null) turmaMasterDoAluno[String(e.id)] = m;
    });

    const limite = new Date(Date.now() - CONTRIBUICAO_JANELA_DIAS * 86400000).toISOString().slice(0, 10);
    const faltas = {};     // 'AAAA-MM-DD' -> [idEstudante]
    const chamadas = {};   // masterId -> ['AAAA-MM-DD']
    const marcarDia = (m, dia) => {
        const k = String(m);
        if (!chamadas[k]) chamadas[k] = [];
        if (chamadas[k].indexOf(dia) === -1) chamadas[k].push(dia);
    };

    (d.presencas || []).forEach(p => {
        if (!p || !p.data || p.data < limite) return;
        const m = turmaMasterDoAluno[String(p.id_estudante)];
        if (m == null) return;
        marcarDia(m, p.data);
        if (p.status === 'falta') {
            if (!faltas[p.data]) faltas[p.data] = [];
            if (faltas[p.data].indexOf(p.id_estudante) === -1) faltas[p.data].push(p.id_estudante);
        }
    });
    (d.registrosAula || []).forEach(r => {
        if (!r || !r.data || r.data < limite) return;
        const m = masterDe[String(r.id_turma)];
        if (m != null) marcarDia(m, r.data);
    });

    // Só a ocorrência que nasceu numa turma do professor: as que o coordenador importou
    // da escola já estão com a turma da gestão e não são dele para republicar.
    const ocorrencias = (d.ocorrencias || [])
        .filter(o => o && masterDe[String(o.id_turma)] != null)
        .map(o => Object.assign({}, o, { id_turma: masterDe[String(o.id_turma)], id_turma_professor: o.id_turma }));

    const a = autor || {};
    return {
        v: 1, painel: 'prof',
        autorId: a.id != null ? a.id : null,
        autorNome: a.nome || '',
        geradoEm: new Date().toISOString(),
        ocorrencias: ocorrencias,
        faltas: faltas,
        chamadas: chamadas
    };
}

function _contribuicaoVazia(r) {
    return !r || (!(r.ocorrencias || []).length && !Object.keys(r.faltas || {}).length && !Object.keys(r.chamadas || {}).length);
}

// Devolve { estado } como publicarListaEscola: 'ok', 'igual', 'recusado', 'erro',
// 'nao-e-professor', 'sem-escola', 'bloqueado', 'sem-vinculo'.
async function publicarContribuicaoProfessor(dados, opcoes) {
    if (!_ehPainelDoProfessor()) return { estado: 'nao-e-professor' };
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!u || u.id == null) return { estado: 'sem-escola' };
    const schoolId = _escolaAtualId();
    if (!schoolId) return { estado: 'sem-escola' };
    if (window.bloquearEscritaLocal || window.bloquearEscritaNuvem) return { estado: 'bloqueado' };

    const d = dados || {};
    // Professor sem nenhuma turma da gestão não tem o que devolver para a escola.
    if (!(d.turmas || []).some(t => t && t.masterId != null && t.masterId !== '')) return { estado: 'sem-vinculo' };

    const id = docContribuicaoProfessor(schoolId, u.id);
    const recorte = recorteDoProfessor(d, u);
    const assinatura = JSON.stringify(Object.assign({}, recorte, { geradoEm: null }));
    if (!(opcoes && opcoes.forcar) && _ultimoPublicado[id] === assinatura) return { estado: 'igual' };

    // Mesma trava da lista: um aparelho que abriu sem a camada pessoal publicaria um
    // recorte vazio e apagaria da escola as faltas e ocorrências deste professor.
    if (_contribuicaoVazia(recorte) && !(opcoes && opcoes.mesmoVazio)) {
        const atual = await _lerCifradoDaEscola(id);
        if (atual.estado === 'ok' && !_contribuicaoVazia(atual.dados)) {
            console.warn('[Escola] Recorte do professor recusado: viria vazio por cima de um com conteúdo.');
            return { estado: 'recusado' };
        }
    }

    try {
        const r = await _gravarCifradoNaEscola(id, recorte);
        if (r.estado === 'ok') {
            _ultimoPublicado[id] = assinatura;
            _cacheContribuicoes = null;
        }
        return r;
    } catch (e) {
        console.error('[Escola] Falha ao publicar o recorte do professor:', e);
        return { estado: 'erro', erro: e && e.message };
    }
}

function agendarPublicacaoContribuicao(dados) {
    if (!_ehPainelDoProfessor()) return;
    if (_timerContribuicao) clearTimeout(_timerContribuicao);
    _timerContribuicao = setTimeout(() => {
        _timerContribuicao = null;
        const agora = (typeof data !== 'undefined' && data) ? data : dados;
        publicarContribuicaoProfessor(agora).then(r => {
            if (['ok', 'igual', 'nao-e-professor', 'sem-vinculo', 'sem-escola'].indexOf(r.estado) === -1) {
                console.warn('[Escola] Recorte do professor não publicado:', r.estado);
            }
        }).catch(e => console.warn('[Escola] Publicação do recorte falhou:', e));
    }, 4000);
}

// Quem é da escola, pela users_list (é onde o sistema inteiro já procura os professores
// da escola — Busca Ativa, tutoria, relatório mensal).
async function _professoresDaEscola(schoolId) {
    const usersData = await getData('system', 'users_list');
    const users = (usersData && Array.isArray(usersData.list)) ? usersData.list : [];
    return users.filter(u => u && u.id != null && u.role !== 'super_admin'
        && (String(u.schoolId) === String(schoolId) || String(u.legacySchoolId) === String(schoolId)));
}

// Todos os recortes publicados pelos professores da escola.
// Devolve [{ autorId, autorNome, dados }]. Recorte ilegível é pulado e contado em
// `falhas`, para a tela poder dizer que a conta pode estar incompleta.
async function lerContribuicoesDaEscola(opcoes) {
    const schoolId = _escolaAtualId();
    if (!schoolId) return { estado: 'sem-escola', lista: [], falhas: 0 };

    const c = _cacheContribuicoes;
    if (!(opcoes && opcoes.forcar) && c && c.schoolId === schoolId && (Date.now() - c.quando) < CONTRIBUICOES_CACHE_MS) {
        return c.resultado;
    }

    const profs = await _professoresDaEscola(schoolId);
    let falhas = 0;
    const lidos = await Promise.all(profs.map(async p => {
        const r = await _lerCifradoDaEscola(docContribuicaoProfessor(schoolId, p.id));
        if (r.estado === 'ok') {
            return { autorId: p.id, autorNome: p.nome || (r.dados && r.dados.autorNome) || '', dados: r.dados };
        }
        if (r.estado === 'erro') falhas++;
        return null;
    }));

    const resultado = { estado: 'ok', lista: lidos.filter(Boolean), falhas: falhas };
    _cacheContribuicoes = { schoolId: schoolId, quando: Date.now(), resultado: resultado };
    return resultado;
}

// { idEstudante: [autorId, ...] } das faltas do dia, no formato que a chamada já usava
// com o antigo `shared_attendance`.
function faltasDoDiaNasContribuicoes(contribuicoes, dataStr) {
    const mapa = {};
    ((contribuicoes && contribuicoes.lista) || []).forEach(c => {
        const ids = ((c.dados && c.dados.faltas) || {})[dataStr] || [];
        ids.forEach(idEst => {
            const k = String(idEst);
            if (!mapa[k]) mapa[k] = [];
            if (mapa[k].indexOf(c.autorId) === -1) mapa[k].push(c.autorId);
        });
    });
    return mapa;
}

// --- Gestor: trazer as ocorrências dos professores para o painel -------------
//
// Junta por id. O que é do PROFESSOR (relato, envolvidos, data, turma) vem do recorte
// dele; o que é da GESTÃO (status, devolutiva) nunca é sobrescrito pelo recorte — é o
// gestor quem confirma e responde, e a resposta volta ao professor pela lista publicada.
// Devolve quantas ocorrências entraram ou mudaram.
async function trazerOcorrenciasDosProfessores(opcoes) {
    if (typeof currentViewMode === 'undefined' || currentViewMode !== 'gestor') return 0;
    if (typeof data === 'undefined' || !data) return 0;

    const contrib = await lerContribuicoesDaEscola(opcoes);
    if (!contrib.lista.length) return 0;

    if (!data.ocorrencias) data.ocorrencias = [];
    const doProfessor = ['relato', 'ids_estudantes', 'data', 'tipo', 'turma_snapshot', 'disciplina', 'autor', 'id_turma'];
    let mudou = 0;

    contrib.lista.forEach(c => {
        ((c.dados && c.dados.ocorrencias) || []).forEach(o => {
            if (!o || o.id == null) return;
            const existente = data.ocorrencias.find(x => x.id == o.id);
            if (!existente) {
                const nova = Object.assign({}, o, { autorId: c.autorId });
                delete nova.id_turma_professor;
                if (!nova.status) nova.status = nova.tipo === 'rapida' ? 'registrada' : 'pendente';
                data.ocorrencias.push(nova);
                mudou++;
                return;
            }
            let alterou = false;
            doProfessor.forEach(campo => {
                if (o[campo] === undefined) return;
                if (JSON.stringify(existente[campo]) !== JSON.stringify(o[campo])) {
                    existente[campo] = o[campo];
                    alterou = true;
                }
            });
            if (existente.autorId == null) { existente.autorId = c.autorId; alterou = true; }
            if (alterou) mudou++;
        });
    });

    return mudou;
}

function limparCacheContribuicoes() {
    _cacheContribuicoes = null;
}
