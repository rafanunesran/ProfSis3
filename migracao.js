// migracao.js — Transição para a versão local (adequação SEDUC, setembro/2026)
// ============================================================================
//  O QUE ESTE ARQUIVO FAZ
//    1. Lembra o professor, duas vezes por dia, de que a data de corte está vindo.
//    2. Faz a transição quando ele pede (ou sozinho, na primeira abertura depois
//       do corte): leva o dado pessoal para o aparelho e limpa a nuvem.
//    3. Gera e lê o arquivo .profsis — a cópia de segurança que o professor leva
//       consigo. Até o backup cifrado existir, é a única rede de proteção contra
//       perder o aparelho, então a transição não termina sem ele.
// ============================================================================

const PROFSIS_ARQUIVO_VERSAO = 1;

// --- Arquivo .profsis -------------------------------------------------------

function nomeArquivoProfsis() {
    const quem = (currentUser && (currentUser.nome || currentUser.email) || 'professor')
        .toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    return 'profsis-' + quem + '-' + new Date().toISOString().slice(0, 10) + '.profsis';
}

// Baixa TUDO (as duas camadas) num arquivo só. Devolve true se o download começou.
function exportarArquivoProfsis() {
    if (!data) { alert('Ainda não há dados carregados para exportar.'); return false; }
    try {
        const pacote = {
            formato: 'profsis',
            versao: PROFSIS_ARQUIVO_VERSAO,
            geradoEm: new Date().toISOString(),
            usuario: currentUser ? { nome: currentUser.nome, email: currentUser.email, role: currentUser.role } : null,
            dados: data
        };
        const blob = new Blob([JSON.stringify(pacote)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivoProfsis();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return true;
    } catch (e) {
        console.error('[Migração] Falha ao gerar o arquivo:', e);
        alert('Não consegui gerar o arquivo de segurança: ' + e.message);
        return false;
    }
}

function abrirSeletorArquivoProfsis() {
    let input = document.getElementById('inputArquivoProfsis');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'inputArquivoProfsis';
        input.accept = '.profsis,.json';
        input.style.display = 'none';
        input.onchange = importarArquivoProfsis;
        document.body.appendChild(input);
    }
    input.click();
}

async function importarArquivoProfsis(evento) {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;

    const texto = await arquivo.text();
    let pacote;
    try { pacote = JSON.parse(texto); }
    catch (e) { return alert('Não consegui ler o arquivo: ele não parece um .profsis válido.'); }

    // Aceita tanto o .profsis novo quanto o backup .json antigo (que era o `data` cru).
    const dados = (pacote && pacote.formato === 'profsis') ? pacote.dados : pacote;
    if (!dados || (!dados.turmas && !dados.estudantes)) {
        return alert('Este arquivo não parece um backup do SisProf.');
    }

    const qtd = (dados.estudantes || []).length;
    const turmas = (dados.turmas || []).length;
    if (!confirm('Restaurar este arquivo vai SUBSTITUIR os dados deste aparelho.\n\n' +
        'No arquivo: ' + turmas + ' turma(s) e ' + qtd + ' estudante(s).\n\n' +
        'Continuar?')) return;

    data = Object.assign(getInitialData(), dados);
    window.dadosCarregados = true;
    await persistirDados();
    alert('Dados restaurados. A página vai recarregar.');
    location.reload();
}

// --- A transição ------------------------------------------------------------

// Apaga os documentos de chamada compartilhada da escola. Eles mapeiam
// idDoEstudante -> professores que marcaram falta, ou seja, são dado pessoal
// pseudonimizado, e o recurso deixa de existir depois da transição.
async function _apagarChamadaCompartilhada(schoolId) {
    if (typeof db === 'undefined' || !db || !schoolId) return 0;
    try {
        const prefixo = 'school_' + schoolId + '_';
        const snap = await db.collection('shared_attendance')
            .orderBy(firebase.firestore.FieldPath.documentId())
            .startAt(prefixo).endAt(prefixo + '').limit(500).get();
        let n = 0;
        for (const doc of snap.docs) { await doc.ref.delete(); n++; }
        return n;
    } catch (e) {
        console.warn('[Migração] Não consegui limpar a chamada compartilhada:', e);
        return 0;
    }
}

// Os backups diários antigos estão em texto claro no Firestore, com estudantes
// dentro. São exatamente o que não pode ficar online, então saem.
async function _apagarBackupsEmClaro(userId) {
    if (typeof db === 'undefined' || !db || !userId) return 0;
    const limite = (typeof BACKUP_MAX_DIAS === 'number' ? BACKUP_MAX_DIAS : 20);
    let n = 0;
    const alvos = ['backup_index_' + userId];
    for (let i = 1; i <= limite; i++) alvos.push('backup_' + userId + '_slot_' + i);
    for (const id of alvos) {
        try { await db.collection('app_data').doc(id).delete(); n++; }
        catch (e) { /* já não existia, ou regra negou — segue */ }
    }
    return n;
}

let _migracaoEmAndamento = false;

// Leva o dado pessoal para o aparelho e limpa a nuvem. Idempotente: rodar duas
// vezes não faz mal. Devolve true se concluiu.
async function migrarParaLocal(opcoes) {
    opcoes = opcoes || {};
    if (_migracaoEmAndamento) return false;
    if (window.usuarioOnlineCompleto) {
        console.log('[Migração] Conta isenta pelo super admin — nada a fazer.');
        return false;
    }
    if (!currentUser) return false;

    _migracaoEmAndamento = true;
    try {
        const chave = getStorageKey(currentUser);

        // 1. Garante que temos os dados em mãos. Se a leitura da nuvem falhou, PARAR:
        //    migrar em cima de uma leitura falha apagaria o trabalho do professor.
        if (!window.dadosCarregados || window.bloquearEscritaNuvem) {
            alert('Não consegui confirmar seus dados com o servidor agora.\n\n' +
                  'A transição foi adiada para não arriscar seus registros. ' +
                  'Tente de novo com uma conexão estável.');
            return false;
        }

        const { local, nuvem } = dividirDados(data);
        const qtdEstudantes = (data.estudantes || []).length;

        // 2. O arquivo de segurança vem ANTES de qualquer escrita destrutiva.
        //    Enquanto o backup cifrado não existe, é a única rede de proteção.
        if (!opcoes.pularArquivo) {
            const baixou = exportarArquivoProfsis();
            if (!baixou && !confirm('Não consegui gerar o arquivo de segurança.\n\n' +
                'Continuar mesmo assim? Seus dados ficarão apenas neste aparelho.')) return false;
        }

        // 3. Dado pessoal para o aparelho.
        await localSet(chave, local);

        // 4. Nuvem regravada só com a camada que não identifica estudante.
        //    O .set() sobrescreve o documento inteiro, então os campos pessoais somem.
        await saveData('app_data', chave, nuvem);

        // 5. Espelhos antigos do localStorage.
        try { localStorage.removeItem(chave); } catch (e) {}

        // 6. Link público e chamada compartilhada.
        if (currentUser.schoolId) {
            await _apagarChamadaCompartilhada(currentUser.schoolId);
            if (currentUser.role === 'gestor' && typeof atualizarLinkCompartilhamentoGestor === 'function') {
                try { await atualizarLinkCompartilhamentoGestor(); } catch (e) {}
            }
        }

        // 7. Backups em texto claro.
        await _apagarBackupsEmClaro(currentUser.uid || currentUser.id);

        // 8. Marca a transição feita neste aparelho.
        await metaSet('migracaoV2', new Date().toISOString());
        window.dadosMigradosLocalmente = true;

        console.log('[Migração] Concluída. ' + qtdEstudantes + ' estudante(s) agora só neste aparelho.');
        if (!opcoes.silencioso) {
            alert('Transição concluída.\n\n' +
                  qtdEstudantes + ' estudante(s) e todos os registros ligados a eles agora ficam ' +
                  'SOMENTE neste aparelho.\n\n' +
                  'Turmas, agenda, planos de aula e documentação continuam funcionando online.\n\n' +
                  'Guarde bem o arquivo .profsis que acabou de baixar: por enquanto ele é a sua ' +
                  'única cópia de segurança.');
        }
        return true;
    } catch (e) {
        console.error('[Migração] Falhou:', e);
        alert('A transição não pôde ser concluída: ' + e.message + '\n\nSeus dados não foram alterados.');
        return false;
    } finally {
        _migracaoEmAndamento = false;
    }
}

// --- Aviso ao professor -----------------------------------------------------

function _periodoDoDia() { return new Date().getHours() < 12 ? 'manha' : 'tarde'; }
function _diaHoje() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function _diasAteCorte() {
    return Math.ceil((dataCorte().getTime() - agoraConfiavel().getTime()) / 86400000);
}

function _textoPrazo() {
    const ms = dataCorte().getTime() - agoraConfiavel().getTime();
    if (ms <= 0) return 'O prazo terminou.';
    const dias = Math.floor(ms / 86400000);
    const horas = Math.floor((ms % 86400000) / 3600000);
    if (dias > 0) return 'Faltam ' + dias + ' dia(s) e ' + horas + ' hora(s).';
    return 'Faltam ' + horas + ' hora(s).';
}

function fecharAvisoCorte() {
    const m = document.getElementById('modalAvisoCorte');
    if (m) m.remove();
}

async function _confirmarTransicaoPeloAviso() {
    fecharAvisoCorte();
    if (!confirm('A transição vai levar os dados dos seus estudantes para ESTE aparelho e ' +
        'apagá-los da nuvem.\n\nUm arquivo de segurança será baixado antes.\n\nDeseja continuar?')) return;
    const ok = await migrarParaLocal();
    if (ok) location.reload();
}

function _mostrarModalCorte(jaPassou) {
    fecharAvisoCorte();
    const quando = dataCorte().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.id = 'modalAvisoCorte';
    div.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10000;' +
        'display:flex; align-items:center; justify-content:center; padding:16px;';
    div.innerHTML =
        '<div style="background:#fff; border-radius:12px; max-width:540px; width:100%; padding:26px 28px;' +
        'box-shadow:0 20px 40px rgba(0,0,0,0.25); max-height:90vh; overflow:auto;">' +
            '<h2 style="margin:0 0 6px; color:#2c5282; font-size:20px;">' +
                (jaPassou ? 'Seus dados precisam vir para este aparelho' : 'Mudança no dia ' + quando) + '</h2>' +
            '<p style="color:#718096; font-size:13px; margin:0 0 16px;">' +
                (jaPassou ? 'O prazo terminou.' : _textoPrazo()) + '</p>' +
            '<p style="color:#2d3748; font-size:14px; line-height:1.6;">' +
                'Para atender à determinação da Secretaria, <strong>nome de estudante, ocorrências, ' +
                'frequência, notas e tutoria deixam de ficar guardados na internet</strong> e passam a ' +
                'viver somente no seu aparelho.</p>' +
            '<p style="color:#2d3748; font-size:14px; line-height:1.6;">' +
                'Turmas, agenda, planos de aula, documentação e a biblioteca continuam funcionando ' +
                'online normalmente.</p>' +
            '<div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:12px 14px; margin:16px 0;">' +
                '<strong style="color:#975a16; font-size:13px;">O que isso exige de você</strong>' +
                '<p style="margin:6px 0 0; font-size:13px; color:#744210; line-height:1.55;">' +
                'Como os dados passam a ficar só aqui, <strong>baixe o arquivo de segurança</strong> e ' +
                'guarde-o. Se trocar de aparelho ou limpar os dados do navegador, é por ele que você ' +
                'recupera tudo.</p>' +
            '</div>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:18px;">' +
                '<button class="btn btn-primary" onclick="exportarArquivoProfsis()" ' +
                    'style="flex:1; min-width:190px;">Baixar meus dados agora</button>' +
                '<button class="btn btn-success" onclick="_confirmarTransicaoPeloAviso()" ' +
                    'style="flex:1; min-width:190px;">Fazer a transição agora</button>' +
            '</div>' +
            (jaPassou ? '' :
                '<div style="text-align:center; margin-top:14px;">' +
                '<span onclick="fecharAvisoCorte()" style="cursor:pointer; color:#718096; font-size:13px; ' +
                'text-decoration:underline;">Depois</span></div>') +
        '</div>';
    document.body.appendChild(div);
}

// Uma vez de manhã e uma à tarde, por aparelho. Depois do corte, uma vez por dia,
// até a pessoa ter migrado.
async function verificarAvisoCorte() {
    if (window.usuarioOnlineCompleto) return;
    if (!currentUser) return;

    const estado = estadoCorte();
    if (estado === 'migrado' || estado === 'migrado_isento') return;

    const hoje = _diaHoje();
    const periodo = estado === 'apos' ? 'dia' : _periodoDoDia();

    let registro = {};
    try { registro = (await metaGet('avisoCorte')) || {}; } catch (e) {}
    const jaVistos = registro[hoje] || [];
    if (jaVistos.indexOf(periodo) !== -1) return;

    _mostrarModalCorte(estado === 'apos');

    // Guarda só o dia de hoje: não interessa manter histórico.
    try { await metaSet('avisoCorte', { [hoje]: jaVistos.concat([periodo]) }); } catch (e) {}
}

// Quem deixa o sistema aberto o dia inteiro atravessa o meio-dia sem recarregar —
// e passaria pela data de corte sem perceber. Meia hora é frequência suficiente.
function iniciarVigilanciaCorte() {
    if (window._vigilanciaCorteAtiva) return;
    window._vigilanciaCorteAtiva = true;
    setInterval(() => {
        if (estadoCorte() === 'apos' && !window.dadosMigradosLocalmente) {
            migrarParaLocal({ silencioso: false });
        } else {
            verificarAvisoCorte();
        }
    }, 30 * 60 * 1000);
}

// Chamado por iniciarApp() logo depois de os dados carregarem.
async function aplicarRegraDoCorte() {
    if (estadoCorte() === 'apos') {
        // Passou da data e a pessoa não migrou: migra agora, antes de qualquer tela.
        _mostrarModalCorte(true);
        await migrarParaLocal({ silencioso: true });
    } else {
        await verificarAvisoCorte();
    }
    iniciarVigilanciaCorte();
}
