// resgate.js — Central de Resgate (recuperar o que a transição cancelada levou)
// ============================================================================
//  O QUE ACONTECEU
//    Entre a Fase 1 e o cancelamento do modo local, `migrarParaLocal()` fazia,
//    DEPOIS que o professor baixava o arquivo e confirmava:
//      4. regravava app_data/<chave> só com a camada não-pessoal
//         (o .set() apaga os campos pessoais que estavam no documento);
//      5. removia o espelho do localStorage;
//      6. apagava a chamada compartilhada da escola;
//      7. apagava backup_index_<uid> E os 20 slots backup_<uid>_slot_N.
//    O passo 7 era `_apagarBackupsEmClaro()`, e ele ENGOLIA as falhas: slot que a
//    Regra do Firestore recusou apagar continua no banco até hoje — invisível,
//    porque o índice que o listava foi embora no mesmo laço.
//
//  O QUE ESTE ARQUIVO FAZ
//    Vasculha TODAS as origens que podem ter sobrevivido, sem depender do índice,
//    mostra quanto cada uma tem e deixa o professor MESCLAR (nada é perdido) ou
//    substituir. E reconstrói o índice, para os slots órfãos voltarem a aparecer
//    no "Histórico na Nuvem" de sempre.
//
//  ORDEM DE ESPERANÇA (da mais provável para a menos)
//    1. Este aparelho: a transição só apagava a nuvem DEPOIS de gravar no
//       IndexedDB e CONFERIR o que gravou. Quem migrou tem a cópia inteira aqui.
//    2. O arquivo .profsis: o botão de concluir só habilitava depois do download.
//    3. Slots na nuvem cujo apagamento a Regra recusou.
//    4. A camada pessoal cifrada (pessoal_<chave>), que veio na Fase 7.
//    5. Documento em claro que ficou pela metade (transição interrompida).
//    Documento apagado de verdade do Firestore só volta pelo PITR do projeto —
//    ver RECUPERACAO-BACKUPS.md na raiz do repositório.
// ============================================================================

const RESGATE_CAMPOS_CENSO = ['turmas', 'estudantes', 'tutorados', 'ocorrencias',
                              'notas', 'presencas', 'encontros', 'registrosAdministrativos'];

function _resgateCenso(d) {
    const c = {};
    RESGATE_CAMPOS_CENSO.forEach(k => { c[k] = Array.isArray(d && d[k]) ? d[k].length : 0; });
    return c;
}

function _resgateTotal(censo) {
    return RESGATE_CAMPOS_CENSO.reduce((s, k) => s + (censo[k] || 0), 0);
}

// "1 turmas" faz o professor desconfiar da ferramenta bem na hora em que ele precisa
// confiar nela. Singular e plural escritos à mão, com acento.
const RESGATE_NOMES = {
    turmas: ['turma', 'turmas'],
    estudantes: ['estudante', 'estudantes'],
    tutorados: ['tutorado', 'tutorados'],
    ocorrencias: ['ocorrência', 'ocorrências'],
    notas: ['nota', 'notas'],
    presencas: ['presença', 'presenças'],
    encontros: ['encontro', 'encontros'],
    registrosAdministrativos: ['registro administrativo', 'registros administrativos']
};

function _resgateNome(chave, n) {
    const par = RESGATE_NOMES[chave];
    if (!par) return chave;
    return n === 1 ? par[0] : par[1];
}

function _resgateResumo(censo) {
    return RESGATE_CAMPOS_CENSO.filter(k => censo[k] > 0)
        .map(k => censo[k] + ' ' + _resgateNome(k, censo[k])).join(' · ') || 'vazio';
}

// Um documento do app tem pelo menos uma das listas conhecidas. Serve para separar
// "isto é uma cópia dos dados" de "isto é um índice/configuração".
function _resgateParecemDados(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const conhecidas = Object.keys(typeof getInitialData === 'function' ? getInitialData() : {});
    return conhecidas.some(k => Array.isArray(obj[k]));
}

// --- Leitura da nuvem sem alarde ------------------------------------------
// getData() dispara alert() quando a leitura falha por rede. Uma varredura chega a
// ler 80 documentos: seriam 80 caixas de diálogo na cara do professor. Aqui a falha
// é só um `null` e um aviso no console.
async function _resgateLerNuvem(id) {
    if (typeof db === 'undefined' || !db) return null;
    try {
        const doc = await db.collection('app_data').doc(String(id)).get();
        return doc.exists ? doc.data() : null;
    } catch (e) {
        console.warn('[Resgate] Não consegui ler app_data/' + id + ':', e && e.code);
        return null;
    }
}

// Decifra um pacote (backup ou camada pessoal) remontando as continuações _pN.
// Devolve null quando não há chave neste aparelho — quem chama avisa o professor.
async function _resgateDecifrar(id, doc) {
    const chave = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
    if (!chave) return null;
    return decifrarPacote(doc, chave, (n) => _resgateLerNuvem(id + '_p' + n));
}

// --- Onde procurar ---------------------------------------------------------

// Todas as chaves de documento que esta conta pode ter usado: a de agora, a do UID,
// a do id antigo (contas anteriores ao Firebase Auth) e as da escola por perfil.
// Um gestor que migrou no modo professor apagou a chave pessoal, não a de gestor.
function _resgateChavesProvaveis() {
    const u = currentUser || {};
    const chaves = [];
    const por = (k) => { if (k && chaves.indexOf(k) === -1) chaves.push(k); };

    if (typeof getStorageKey === 'function') por(getStorageKey(u));
    if (u.uid) por('app_data_' + u.uid);
    if (u.id) por('app_data_' + u.id);
    const escola = u.schoolId || 'default';
    ['gestor', 'aee', 'projeto'].forEach(p => por('app_data_school_' + escola + '_' + p));
    return chaves;
}

function _resgateIdsDeUsuario() {
    const u = currentUser || {};
    const ids = [];
    if (u.uid) ids.push(u.uid);
    if (u.id && u.id !== u.uid) ids.push(String(u.id));
    return ids;
}

// --- A varredura -----------------------------------------------------------
// Devolve { achados: [...], avisos: [...] }. Cada achado traz os dados já em mãos:
// nada é lido duas vezes, e o professor pode baixar antes de decidir.
async function resgateVarrer(aoAndar) {
    const achados = [];
    const avisos = [];
    const anda = (t) => { try { if (aoAndar) aoAndar(t); } catch (e) {} };

    const guardar = (origem, rotulo, detalhe, dados) => {
        if (!_resgateParecemDados(dados)) return;
        const censo = _resgateCenso(dados);
        if (_resgateTotal(censo) === 0) return;      // documento vazio não é resgate
        achados.push({ origem, rotulo, detalhe, censo, dados });
    };

    // 1. Este aparelho (IndexedDB). É a origem mais provável e a única que não
    //    depende de rede, então vem primeiro — e sem o filtro das chaves prováveis:
    //    varremos TUDO que está gravado, inclusive chave de conta antiga.
    anda('Procurando neste aparelho...');
    try {
        const chaves = (typeof localKeys === 'function') ? await localKeys() : [];
        for (const k of chaves) {
            const d = await localGet(k);
            guardar('aparelho', 'Cópia neste aparelho', String(k), d);
        }
    } catch (e) { avisos.push('Não consegui ler o armazenamento deste aparelho: ' + e.message); }

    // 2. Espelho antigo em localStorage. A transição removia o da chave migrada, mas
    //    quem tinha mais de um perfil costuma ter outros intactos.
    anda('Procurando no armazenamento antigo do navegador...');
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || (k.indexOf('app_data') !== 0 && k.indexOf('backup_') !== 0)) continue;
            let d = null;
            try { d = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
            guardar('navegador', 'Resto no armazenamento antigo', k, d);
        }
    } catch (e) {}

    // 3. Documentos principais na nuvem. Depois do passo 4 da transição eles têm só
    //    turmas e agenda — mas a transição interrompida no meio deixou documento
    //    completo, e é dele que sai o estudante de volta.
    anda('Procurando na nuvem...');
    for (const chave of _resgateChavesProvaveis()) {
        const doc = await _resgateLerNuvem(chave);
        if (doc) guardar('nuvem', 'Documento na nuvem', chave, doc);

        // 4. Camada pessoal cifrada (Fase 7).
        const idCifrado = (typeof chavePessoalCifrada === 'function')
            ? chavePessoalCifrada(chave) : 'pessoal_' + chave;
        const cif = await _resgateLerNuvem(idCifrado);
        if (cif) {
            try {
                const aberto = await _resgateDecifrar(idCifrado, cif);
                if (aberto) guardar('nuvem', 'Camada pessoal cifrada', idCifrado, aberto);
                else avisos.push('Há dados CIFRADOS na nuvem (' + idCifrado + '), mas a chave não está ' +
                                 'neste aparelho. Saia e entre de novo com e-mail e senha e repita a busca.');
            } catch (e) {
                avisos.push('Encontrei ' + idCifrado + ' mas não consegui abrir: ' + e.message);
            }
        }
    }

    // 5. Os slots, por força bruta. O índice foi a primeira coisa apagada, então
    //    perguntar a ele é perguntar a quem já não sabe. Vamos de 1 a 20 em cada id.
    const limite = (typeof BACKUP_MAX_DIAS === 'number' ? BACKUP_MAX_DIAS : 20);
    for (const uid of _resgateIdsDeUsuario()) {
        const slotsVivos = [];
        for (let i = 1; i <= limite; i++) {
            anda('Procurando backups diários (' + i + '/' + limite + ')...');
            const id = 'backup_' + uid + '_slot_' + i;
            const doc = await _resgateLerNuvem(id);
            if (!doc) {
                // Sobrou continuação sem o principal? É a marca de um backup cifrado
                // cujo documento-cabeça foi apagado: o conteúdo existe, mas sem o
                // cabeçalho (iv, nº de partes) não há como remontar. Vale relatar.
                const orfa = await _resgateLerNuvem(id + '_p2');
                if (orfa) avisos.push('Restou um pedaço do backup do slot ' + i + ' sem o documento ' +
                                      'principal (apagado). Só o PITR do projeto traz esse de volta.');
                continue;
            }
            let dados = doc;
            if (doc.cifrado === true) {
                try {
                    dados = await _resgateDecifrar(id, doc);
                    if (!dados) {
                        avisos.push('O backup do slot ' + i + ' está cifrado e a chave não está neste ' +
                                    'aparelho. Entre de novo com e-mail e senha e repita a busca.');
                        continue;
                    }
                } catch (e) { avisos.push('Slot ' + i + ' não abriu: ' + e.message); continue; }
            }
            const censo = _resgateCenso(dados);
            if (_resgateTotal(censo) === 0) continue;
            achados.push({
                origem: 'backup', rotulo: 'Backup diário — slot ' + i, detalhe: id,
                censo: censo, dados: dados, slot: i, uid: uid
            });
            slotsVivos.push(i);
        }
        if (slotsVivos.length) {
            const index = await _resgateLerNuvem('backup_index_' + uid);
            const listados = (index && Array.isArray(index.slots)) ? index.slots.map(s => s.id) : [];
            const invisiveis = slotsVivos.filter(i => listados.indexOf(i) === -1);
            if (invisiveis.length) {
                avisos.push('SOBREVIVERAM ' + invisiveis.length + ' backup(s) que o "Histórico na Nuvem" ' +
                            'não lista, porque o índice foi apagado na transição (slots ' +
                            invisiveis.join(', ') + '). O botão "Refazer o índice" devolve a listagem.');
            }
        }
    }

    // O melhor achado primeiro: quem tem mais estudante costuma ser a cópia inteira.
    achados.sort((a, b) => _resgateTotal(b.censo) - _resgateTotal(a.censo));
    return { achados: achados, avisos: avisos };
}

// --- Varredura profunda: listar a coleção ----------------------------------
// A varredura acima só encontra o que ela consegue ADIVINHAR o nome. Quando a conta
// mudou de uid, a escola mudou de id, ou o documento nasceu com outra chave, o dado
// está lá e nenhuma tentativa de adivinhação chega nele.
//
// As Regras dão `allow read` em app_data, e no Firestore `read` inclui `list`: dá
// para percorrer a coleção e ver os nomes de verdade. É lento e lê muito documento,
// então é um botão separado, não o caminho padrão.
//
// DADO DOS OUTROS NÃO FICA AQUI. De documento que não é desta conta guardamos só a
// contagem, para o professor poder dizer "esse número parece o meu" — nunca o
// conteúdo, que é justamente o que a adequação existe para proteger.
function _resgateTokensDaConta() {
    const u = currentUser || {};
    return [u.uid, u.id, u.schoolId, u.legacySchoolId, u.espacoId]
        .filter(Boolean).map(String);
}

async function resgateVarreduraProfunda(aoAndar) {
    if (typeof db === 'undefined' || !db) return { meus: [], outros: [], lidos: 0, erro: 'sem banco' };
    const tokens = _resgateTokensDaConta();
    const meus = [], outros = [];
    let lidos = 0, ultimo = null, erro = null;

    try {
        for (let pagina = 0; pagina < 60; pagina++) {
            if (aoAndar) aoAndar('Percorrendo a coleção... ' + lidos + ' documento(s) lidos.');
            let q = db.collection('app_data')
                      .orderBy(firebase.firestore.FieldPath.documentId()).limit(100);
            if (ultimo) q = q.startAfter(ultimo);
            const snap = await q.get();
            if (snap.empty) break;

            snap.docs.forEach(doc => {
                lidos++;
                const corpo = doc.data();
                if (!_resgateParecemDados(corpo)) return;
                const censo = _resgateCenso(corpo);
                if (_resgateTotal(censo) === 0) return;
                if (tokens.some(t => doc.id.indexOf(t) !== -1)) {
                    meus.push({ origem: 'colecao', rotulo: 'Documento encontrado na coleção',
                                detalhe: doc.id, censo: censo, dados: corpo });
                } else {
                    outros.push({ id: doc.id, censo: censo });   // só a contagem
                }
            });

            ultimo = snap.docs[snap.docs.length - 1];
            if (snap.docs.length < 100) break;
        }
    } catch (e) {
        erro = (e && e.code === 'permission-denied')
            ? 'as Regras não deixam listar a coleção com esta conta'
            : ((e && e.message) || String(e));
    }
    return { meus: meus, outros: outros, lidos: lidos, erro: erro };
}

// --- Mesclagem -------------------------------------------------------------
// União, nunca substituição: o que está na tela hoje permanece, e o que só existe
// no achado entra. Vale para TODAS as listas do `data`, e não só para as seis que a
// mesclagem antiga conhecia — um resgate que devolve notas e esquece atestados não
// é resgate, é meia notícia.
function resgateUniao(atual, achado) {
    const base = Object.assign({}, (typeof getInitialData === 'function' ? getInitialData() : {}), atual || {});
    const novo = Object.assign({}, base);
    const relatorio = {};

    Object.keys(achado || {}).forEach(chave => {
        const vindo = achado[chave];

        if (Array.isArray(vindo)) {
            const aqui = Array.isArray(novo[chave]) ? novo[chave].slice() : [];
            // Identidade por mesmoRegistro() (shared.js), NUNCA só pelo id: ids antigos
            // colidem, e deduplicar por id aqui apagava a nota de um estudante por causa
            // da nota de outro. O índice por id mantém a busca barata sem essa troca.
            const porId = {};
            aqui.forEach(it => {
                const k = (it && it.id != null) ? String(it.id) : 'js:' + JSON.stringify(it);
                (porId[k] = porId[k] || []).push(it);
            });
            let entraram = 0;
            vindo.forEach(it => {
                const k = (it && it.id != null) ? String(it.id) : 'js:' + JSON.stringify(it);
                const candidatos = porId[k] || [];
                if (candidatos.some(j => mesmoRegistro(j, it))) return;
                (porId[k] = candidatos).push(it);
                aqui.push(it);
                entraram++;
            });
            novo[chave] = aqui;
            if (entraram) relatorio[chave] = entraram;
            return;
        }

        // Campo solto (configuração, objeto). Só preenche o que falta: o de hoje manda.
        const vazioAqui = novo[chave] === undefined || novo[chave] === null || novo[chave] === '';
        if (vazioAqui && vindo !== undefined) { novo[chave] = vindo; relatorio[chave] = 1; }
    });

    return { dados: novo, relatorio: relatorio };
}

// Grava e CONFERE relendo do aparelho. Salvar e acreditar é o que transformou
// "importei e sumiu" em mistério uma vez; aqui a conferência vem antes da festa.
async function _resgateGravarEConferir(novos) {
    data = novos;
    window.dadosCarregados = true;
    await persistirDados();

    if (typeof localGet !== 'function' || typeof getStorageKey !== 'function') return { ok: true };
    let gravado = null;
    try { gravado = await localGet(getStorageKey(currentUser)); }
    catch (e) { return { ok: false, motivo: 'não consegui reler o que foi gravado: ' + e.message }; }
    if (!gravado) return { ok: false, motivo: 'nada chegou ao armazenamento deste aparelho.' };

    const esperado = _resgateCenso(novos), real = _resgateCenso(gravado);
    const faltando = RESGATE_CAMPOS_CENSO.filter(k => real[k] < esperado[k]);
    if (faltando.length) {
        return { ok: false, motivo: 'gravou menos do que devia em: ' +
                 faltando.map(k => _resgateNome(k, 2)).join(', ') + '.' };
    }
    return { ok: true };
}

// Este achado pertence ao documento que está aberto agora?
//
// Quem é gestor E professor na mesma conta tem dois documentos, e eles se parecem: os
// dois têm turmas, estudantes, ocorrências. Mesclar o do Gestor dentro do painel do
// Professor mistura os dois para sempre, e SUBSTITUIR troca um pelo outro - levando
// junto as notas e as faltas que só existiam no que foi substituído.
function _resgateAvisoDeOutroDocumento(achado) {
    const atual = (typeof getStorageKey === 'function') ? getStorageKey(currentUser) : null;
    const dele = String(achado && achado.detalhe || '');
    if (!atual || !dele || dele === atual) return '';
    if (dele.indexOf('backup_') === 0) return '';          // backup é da própria conta
    if (dele.indexOf('app_data') !== 0 && dele.indexOf('pessoal_') !== 0) return '';

    const painel = (k) => k.indexOf('_gestor') !== -1 ? 'Painel do Gestor'
                   : k.indexOf('_aee') !== -1 ? 'Painel AEE'
                   : k.indexOf('_projeto') !== -1 ? 'Painel de Projetos'
                   : k.indexOf('_tutoria') !== -1 ? 'documento de tutoria da escola'
                   : 'painel do Professor';
    return '⚠️ ATENÇÃO: esta cópia é de OUTRO documento.\n\n' +
           'Você está no ' + painel(atual) + ' (' + atual + ')\n' +
           'e esta cópia veio do ' + painel(dele) + ' (' + dele + ').\n\n' +
           'São documentos separados, com conteúdos parecidos. Juntá-los mistura os dois, ' +
           'e substituir troca um pelo outro — levando junto o que só existia no seu.\n\n';
}

async function resgateMesclar(indice) {
    const achado = (window._resgateAchados || [])[indice];
    if (!achado) return;

    const { dados: novos, relatorio } = resgateUniao(data, achado.dados);
    const linhas = Object.keys(relatorio).map(k => '  • ' + relatorio[k] + ' ' + _resgateNome(k, relatorio[k]));
    if (!linhas.length) {
        return alert('Nada de novo nesta cópia: tudo o que ela tem já está nos seus dados de hoje.\n\n' +
                     'Nada foi alterado.');
    }
    if (!confirm(_resgateAvisoDeOutroDocumento(achado) +
                 'MESCLAR (nada é apagado)\n\nDe "' + achado.rotulo + '" vão entrar:\n\n' +
                 linhas.join('\n') + '\n\nO que você lançou hoje continua como está. Continuar?')) return;

    try {
        const r = await _resgateGravarEConferir(novos);
        if (!r.ok) {
            return alert('A mesclagem NÃO foi concluída: ' + r.motivo +
                         '\n\nNada foi apagado e a página não vai recarregar. Avise a gestão/suporte.');
        }
        alert('✅ Recuperado.\n\n' + linhas.join('\n') + '\n\nA página vai recarregar.');
        location.reload();
    } catch (e) {
        alert('Erro ao mesclar: ' + e.message);
    }
}

async function resgateSubstituir(indice) {
    const achado = (window._resgateAchados || [])[indice];
    if (!achado) return;

    const agora = _resgateCenso(data || {});
    const vem = achado.censo;
    const perde = RESGATE_CAMPOS_CENSO.filter(k => vem[k] < agora[k]);

    let texto = _resgateAvisoDeOutroDocumento(achado) +
                'SUBSTITUIR TUDO pelos dados de "' + achado.rotulo + '".\n\n' +
                'Hoje: ' + _resgateResumo(agora) + '\nNesta cópia: ' + _resgateResumo(vem) + '\n\n';
    if (perde.length) {
        texto += '⚠️ Esta cópia tem MENOS registros em: ' + perde.map(k => _resgateNome(k, 2)).join(', ') + '.\n' +
                 'Se não tiver certeza, use MESCLAR — ela traz o que falta sem tirar nada.\n\n';
    }
    if (!confirm(texto + 'Continuar?')) return;
    if (perde.length && !confirm('Confirma mesmo? O que existe hoje em ' + perde.map(k => _resgateNome(k, 2)).join(', ') +
                                 ' e não está nesta cópia será perdido.')) return;

    try {
        const novos = Object.assign((typeof getInitialData === 'function' ? getInitialData() : {}), achado.dados);
        const r = await _resgateGravarEConferir(novos);
        if (!r.ok) {
            return alert('A restauração NÃO foi concluída: ' + r.motivo + '\n\nNada foi apagado.');
        }
        alert('✅ Dados restaurados. A página vai recarregar.');
        location.reload();
    } catch (e) {
        alert('Erro ao restaurar: ' + e.message);
    }
}

// Baixa o achado como .profsis SEM tocar nos dados de hoje. É a saída para quem
// encontrou algo e quer guardar antes de decidir qualquer coisa.
function resgateBaixar(indice) {
    const achado = (window._resgateAchados || [])[indice];
    if (!achado) return;
    try {
        const pacote = {
            formato: 'profsis',
            versao: (typeof PROFSIS_ARQUIVO_VERSAO === 'number' ? PROFSIS_ARQUIVO_VERSAO : 1),
            geradoEm: new Date().toISOString(),
            origem: 'resgate:' + achado.origem + ':' + achado.detalhe,
            usuario: currentUser ? { nome: currentUser.nome, email: currentUser.email, role: currentUser.role } : null,
            dados: achado.dados
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(pacote)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resgate-' + String(achado.detalhe).replace(/[^A-Za-z0-9_-]+/g, '-') + '.profsis';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert('Não consegui gerar o arquivo: ' + e.message); }
}

// Refaz backup_index_<uid> a partir dos slots que a varredura encontrou vivos. O
// índice não guarda dado pessoal — só id, data e rótulo —, então pode subir sempre.
async function resgateRefazerIndice() {
    const vivos = (window._resgateAchados || []).filter(a => a.origem === 'backup');
    if (!vivos.length) return alert('A busca não encontrou backups diários para indexar.');

    const porUid = {};
    vivos.forEach(a => { (porUid[a.uid] = porUid[a.uid] || []).push(a); });

    let total = 0;
    for (const uid of Object.keys(porUid)) {
        const id = 'backup_index_' + uid;
        const atual = await _resgateLerNuvem(id);
        const slots = (atual && Array.isArray(atual.slots)) ? atual.slots.slice() : [];
        porUid[uid].forEach(a => {
            if (slots.some(s => s.id === a.slot)) return;
            slots.push({
                id: a.slot, timestamp: Date.now(), dateStr: (typeof dataLocalISO === 'function' ? dataLocalISO() : ''),
                label: 'Recuperado pela Central de Resgate (' + _resgateResumo(a.censo) + ')', partes: 1
            });
            total++;
        });
        try {
            await saveData('app_data', id, { slots: slots, nextSlot: Math.max(...slots.map(s => s.id)) + 1 });
        } catch (e) { return alert('Não consegui gravar o índice: ' + e.message); }
    }
    alert(total ? ('✅ ' + total + ' backup(s) voltaram para o "Histórico na Nuvem".')
                : 'O índice já listava todos os backups encontrados.');
}

// --- A tela ----------------------------------------------------------------

function abrirCentralResgate() {
    const antigo = document.getElementById('modalCentralResgate');
    if (antigo) antigo.remove();

    document.body.insertAdjacentHTML('beforeend',
        '<div id="modalCentralResgate" class="modal active"><div class="modal-content" style="max-width:720px;">' +
            '<div class="modal-header">' +
                '<h2>🛟 Central de Resgate</h2>' +
                '<button class="close-btn" onclick="this.closest(\'.modal\').remove()">×</button>' +
            '</div>' +
            '<p style="font-size:13px; color:#4a5568; line-height:1.6; margin-bottom:14px;">' +
                'Procura seus dados em <strong>todas</strong> as origens que sobraram: este aparelho, o ' +
                'armazenamento antigo do navegador, os documentos na nuvem, a camada cifrada e os 20 slots ' +
                'de backup diário — um por um, sem depender do índice (que a transição apagou).</p>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">' +
                '<button class="btn btn-primary" style="flex:2; min-width:220px;" onclick="resgateProcurar()">🔍 Procurar em tudo</button>' +
                '<button class="btn btn-success" style="flex:1; min-width:180px;" onclick="abrirSeletorArquivoProfsis()">📂 Tenho o arquivo .profsis</button>' +
            '</div>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
                '<button class="btn btn-secondary" style="flex:1; min-width:220px;" onclick="resgateProcurar(true)" ' +
                    'title="Percorre a coleção inteira em vez de adivinhar o nome da chave. Demora mais.">' +
                    '🐢 Não achou? Procurar documento por documento</button>' +
            '</div>' +
            '<div id="resgateStatus" style="padding:12px; background:#f7fafc; border-radius:8px; ' +
                'font-size:13px; color:#4a5568; text-align:center;">Clique em "Procurar em tudo" para começar.</div>' +
            '<div id="resgateAvisos" style="margin-top:12px;"></div>' +
            '<div id="resgateLista" style="margin-top:12px; max-height:340px; overflow-y:auto;"></div>' +
            '<button class="btn btn-secondary" style="width:100%; margin-top:16px;" ' +
                'onclick="this.closest(\'.modal\').remove()">Fechar</button>' +
        '</div></div>');
}

async function resgateProcurar(profunda) {
    const status = document.getElementById('resgateStatus');
    const lista = document.getElementById('resgateLista');
    const avisos = document.getElementById('resgateAvisos');
    if (!status) return;
    lista.innerHTML = ''; avisos.innerHTML = '';
    status.innerHTML = 'Procurando...';

    let r;
    try { r = await resgateVarrer(t => { status.textContent = t; }); }
    catch (e) { status.innerHTML = '<span style="color:#c53030;">A busca falhou: ' + e.message + '</span>'; return; }

    if (profunda) {
        const p = await resgateVarreduraProfunda(t => { status.textContent = t; });
        // Documento que a varredura por nome já trouxe não entra de novo.
        const jaTem = new Set(r.achados.map(a => a.detalhe));
        p.meus.forEach(a => { if (!jaTem.has(a.detalhe)) r.achados.push(a); });
        if (p.erro) r.avisos.push('A varredura documento por documento parou: ' + p.erro + '.');
        else r.avisos.push('Percorri ' + p.lidos + ' documento(s) da coleção.' +
            (p.outros.length ? ' ' + p.outros.length + ' têm conteúdo mas não trazem nenhum ' +
             'identificador desta conta no nome — se algum número abaixo for o seu, me diga o nome ' +
             'do documento: ' + p.outros.slice(0, 12).map(o => o.id + ' (' + _resgateResumo(o.censo) + ')').join('; ')
             : ''));
        r.achados.sort((a, b) => _resgateTotal(b.censo) - _resgateTotal(a.censo));
    }

    // Gravações que o banco recusou: o trabalho está no aparelho e nunca subiu.
    try {
        if (typeof listarGravacoesRecusadas === 'function') {
            const fila = await listarGravacoesRecusadas();
            if (fila.length) {
                r.avisos.unshift('O banco RECUSOU ' + fila.length + ' gravação(ões) desta conta (a mais ' +
                    'recente em ' + (fila[0].quando || '?').slice(0, 16).replace('T', ' ') + ', motivo: ' +
                    (fila[0].codigo || fila[0].motivo) + '). O que você digitou está guardado NESTE ' +
                    'APARELHO, mas não subiu. Depois que a causa for corrigida, use "Reenviar o que foi recusado".');
                window._resgateTemRecusadas = true;
            }
        }
    } catch (e) {}

    window._resgateAchados = r.achados;

    if (r.avisos.length) {
        avisos.innerHTML = r.avisos.map(a =>
            '<div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:10px 12px; ' +
            'margin-bottom:8px; font-size:12px; color:#744210; line-height:1.5;">⚠️ ' + a + '</div>').join('') +
            (r.achados.some(a => a.origem === 'backup')
                ? '<button class="btn btn-sm btn-info" style="width:100%; margin-bottom:8px;" ' +
                  'onclick="resgateRefazerIndice()">🗂️ Refazer o índice dos backups</button>' : '') +
            (window._resgateTemRecusadas
                ? '<button class="btn btn-sm btn-warning" style="width:100%; margin-bottom:8px;" ' +
                  'onclick="resgateReenviar()">📤 Reenviar o que foi recusado</button>' : '');
    }

    if (!r.achados.length) {
        status.innerHTML = '<span style="color:#c53030; font-weight:bold;">Nada encontrado nesta conta ' +
            'e neste aparelho.</span><br><span style="font-size:12px;">Se você migrou em OUTRO computador ou ' +
            'navegador, abra o sistema lá e repita a busca: a cópia ficou no aparelho de quem migrou. ' +
            'Se tiver o arquivo .profsis na pasta de Downloads, use o botão ao lado.</span>';
        return;
    }

    status.innerHTML = '<span style="color:#276749; font-weight:bold;">✅ ' + r.achados.length +
        ' cópia(s) encontrada(s).</span> <span style="font-size:12px;">Mesclar não apaga nada — comece por ele.</span>';

    const cor = { aparelho: '#276749', backup: '#2b6cb0', nuvem: '#6b46c1', navegador: '#975a16' };
    lista.innerHTML = r.achados.map((a, i) =>
        '<div style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:8px; background:#fff;">' +
            '<div style="font-weight:bold; color:' + (cor[a.origem] || '#2d3748') + '; font-size:13px;">' + a.rotulo + '</div>' +
            '<div style="font-size:11px; color:#a0aec0; margin-bottom:6px; word-break:break-all;">' + a.detalhe + '</div>' +
            '<div style="font-size:12px; color:#2d3748; margin-bottom:10px;">' + _resgateResumo(a.censo) + '</div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                '<button class="btn btn-sm btn-success" onclick="resgateMesclar(' + i + ')" ' +
                    'title="Traz o que falta sem tirar nada do que existe hoje">🧩 Mesclar</button>' +
                '<button class="btn btn-sm btn-secondary" onclick="resgateBaixar(' + i + ')" ' +
                    'title="Salva esta cópia num arquivo sem mexer nos seus dados">💾 Baixar</button>' +
                '<button class="btn btn-sm btn-warning" onclick="resgateSubstituir(' + i + ')" ' +
                    'title="Substitui TUDO por esta cópia">⚠️ Substituir</button>' +
            '</div>' +
        '</div>').join('');
}

// Reenvia, com o que está no espelho do aparelho, o que o banco recusou. Serve para o
// dia em que a causa da recusa for corrigida: o trabalho sobe em vez de ficar preso.
async function resgateReenviar() {
    if (typeof reenviarGravacoesRecusadas !== 'function') return;
    if (!confirm('Reenviar para a nuvem o que o banco recusou?\n\nO conteúdo vem da cópia ' +
                 'deste aparelho. Nada é apagado.')) return;
    const r = await reenviarGravacoesRecusadas();
    if (r.subiram && !r.continuamRecusadas) {
        alert('✅ ' + r.subiram + ' documento(s) subiram agora.');
    } else if (r.continuamRecusadas) {
        alert('Ainda recusado: ' + r.continuamRecusadas + ' de ' + r.total + ' documento(s).\n\n' +
              'A causa da recusa continua de pé — enquanto ela não for corrigida, o trabalho fica ' +
              'guardado neste aparelho e não sobe. Nada foi perdido.');
    } else {
        alert('Não havia cópia local dos documentos recusados para reenviar.');
    }
}
