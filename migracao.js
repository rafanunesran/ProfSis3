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
    // O nome precisa se explicar sozinho na pasta de Downloads. Um professor baixou
    // este arquivo achando que era o programa e tentou abri-lo; o nome antigo
    // ("profsis-fulano-data.profsis") nao ajudava a desfazer o engano.
    return 'copia-de-seguranca-profsis-' + quem + '-' + new Date().toISOString().slice(0, 10) + '.profsis';
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
    // Um professor de AEE pode não ter turma nenhuma, só tutorados: exigir turmas ou
    // estudantes recusaria justamente o arquivo dele.
    if (!dados || (!dados.turmas && !dados.estudantes && !dados.tutorados && !dados.ocorrencias)) {
        return alert('Este arquivo não parece um backup do SisProf.');
    }

    // Sem conta aberta não há onde gravar: getStorageKey() nasce do usuário. Gravar
    // assim mesmo seria escrever no vazio e recarregar por cima — que é exatamente
    // como uma importação "some" sem explicação.
    if (typeof currentUser === 'undefined' || !currentUser) {
        return alert('Entre na sua conta antes de importar.\n\n' +
                     'O arquivo é guardado na SUA conta neste aparelho, então preciso saber quem é você.');
    }

    const qtd = (dados.estudantes || []).length;
    const turmas = (dados.turmas || []).length;
    if (!confirm('Restaurar este arquivo vai SUBSTITUIR os dados deste aparelho.\n\n' +
        'No arquivo: ' + turmas + ' turma(s) e ' + qtd + ' estudante(s).\n\n' +
        'Continuar?')) return;

    data = Object.assign(getInitialData(), dados);
    window.dadosCarregados = true;
    await persistirDados();

    // Confere no aparelho ANTES de recarregar. persistirDados() desiste em silêncio em
    // mais de um caso, e recarregar por cima de uma gravação que não aconteceu apaga a
    // evidência e transforma a falha em mistério — foi assim que "importei e não
    // carregou" chegou até aqui.
    const conferido = await _conferirImportacao(dados);
    if (!conferido.ok) {
        alert('A importação NÃO foi concluída.\n\n' + conferido.motivo +
              '\n\nNada foi apagado e a página não vai recarregar. ' +
              'Guarde o arquivo e avise a gestão/suporte.');
        return;
    }

    alert('Dados importados neste aparelho:\n\n' +
          conferido.turmas + ' turma(s), ' + conferido.estudantes + ' estudante(s), ' +
          conferido.tutorados + ' tutorado(s).\n\nA página vai recarregar.');
    location.reload();
}

// Relê do IndexedDB, pela mesma chave que o app usa para carregar, e compara com o que
// veio no arquivo. É a única prova de que a importação sobreviveu ao recarregamento.
async function _conferirImportacao(dados) {
    const esperado = {
        turmas: (dados.turmas || []).length,
        estudantes: (dados.estudantes || []).length,
        tutorados: (dados.tutorados || []).length
    };
    if (typeof localGet !== 'function' || typeof getStorageKey !== 'function') {
        return Object.assign({ ok: true, motivo: '' }, esperado);   // sem como conferir: não trava o professor
    }
    let gravado = null;
    try { gravado = await localGet(getStorageKey(currentUser)); }
    catch (e) { return { ok: false, motivo: 'Não consegui reler o que foi gravado: ' + e.message }; }

    if (!gravado) return { ok: false, motivo: 'Nada chegou ao armazenamento deste aparelho.' };

    const real = {
        turmas: (gravado.turmas || []).length,
        estudantes: (gravado.estudantes || []).length,
        tutorados: (gravado.tutorados || []).length
    };
    if (real.estudantes < esperado.estudantes || real.tutorados < esperado.tutorados
        || real.turmas < esperado.turmas) {
        return { ok: false, motivo: 'O arquivo trazia ' + esperado.estudantes + ' estudante(s) e ' +
                 esperado.turmas + ' turma(s), mas só encontrei ' + real.estudantes + ' e ' +
                 real.turmas + ' gravados.' };
    }
    return Object.assign({ ok: true, motivo: '' }, real);
}

// ============================================================================
//  A TRANSIÇÃO PARA O MODO LOCAL FOI CANCELADA
// ----------------------------------------------------------------------------
//  O sistema voltou a ser online para todo mundo. O que ficava aqui — migração
//  forçada na abertura, modal que não se dispensava, pop-up duas vezes por dia e
//  a limpeza da nuvem — saiu de cena inteiro.
//
//  O que garante a adequação agora não é tirar o dado da nuvem, é ele subir
//  CIFRADO: a camada pessoal vai para app_data/pessoal_<chave> com a chave
//  derivada da senha do professor, que nunca sai do aparelho (ver core.js e
//  cripto.js). Para o banco é ruído; para qualquer terminal autorizado, basta a
//  senha. O controle de uso passou a ser o limite de telas (terminais.js).
//
//  O arquivo .profsis continua acima, inteiro: baixar e importar seguem sendo
//  rede de proteção — agora por escolha do professor, não por obrigação.
// ============================================================================

// Chamado por iniciarApp(). Não bloqueia nada: só conta o que mudou, uma vez por
// aparelho, e some quando a pessoa fecha.
async function aplicarRegraDoCorte() {
    try {
        if (typeof metaGet === 'function' && await metaGet('avisoModoOnlineVisto')) return;
    } catch (e) {}
    if (!currentUser) return;

    _mostrarAvisoModoOnline();

    try { if (typeof metaSet === 'function') await metaSet('avisoModoOnlineVisto', true); } catch (e) {}
}

function fecharAvisoModoOnline() {
    const m = document.getElementById('avisoModoOnline');
    if (m) m.remove();
}

function _mostrarAvisoModoOnline() {
    if (document.getElementById('avisoModoOnline')) return;
    const caixa = document.createElement('div');
    caixa.id = 'avisoModoOnline';
    caixa.style.cssText = 'position:fixed; right:16px; bottom:16px; z-index:9999; max-width:380px; ' +
        'background:#fff; border-left:4px solid #2b6cb0; border-radius:10px; padding:16px 18px; ' +
        'box-shadow:0 10px 30px rgba(0,0,0,.18); font-size:13px; color:#2d3748; line-height:1.55;';
    caixa.innerHTML =
        '<strong style="color:#2b6cb0;">Seus dados voltaram para a nuvem — cifrados</strong>' +
        '<p style="margin:8px 0 0;">Não é mais preciso migrar nada nem carregar arquivo: entre em ' +
        'qualquer computador com a sua conta e os dados estarão lá. No banco eles ficam ilegíveis; ' +
        'só o seu acesso abre.</p>' +
        '<p style="margin:8px 0 0; color:#718096;">Baixar uma cópia de segurança continua disponível ' +
        'em <strong>Backup e Segurança</strong>, quando você quiser.</p>' +
        '<button class="btn btn-sm btn-primary" style="width:100%; margin-top:12px;" ' +
        'onclick="fecharAvisoModoOnline()">Entendi</button>';
    document.body.appendChild(caixa);
}

// --- Restos em texto claro ---------------------------------------------------

// Contas que nunca converteram deixaram backups diários em TEXTO CLARO no banco,
// com estudante dentro. Eles não podem ficar assim — e apagar não é a única saída:
// aqui eles são CIFRADOS por cima do mesmo documento, então o histórico continua no
// banco, agora ilegível para o banco.
//
// Sem a chave no aparelho, não converte e não apaga nada: fica para a próxima
// abertura. O índice (backup_index_<uid>) nunca é tocado — não tem dado pessoal e é
// o que mantém o histórico listável no painel.
async function converterBackupsEmClaro(userId) {
    if (typeof db === 'undefined' || !db || !userId) return { convertidos: 0, motivo: 'sem banco' };
    const chave = (typeof obterChaveBackup === 'function') ? await obterChaveBackup() : null;
    if (!chave) return { convertidos: 0, motivo: 'sem chave neste aparelho' };

    const limite = (typeof BACKUP_MAX_DIAS === 'number' ? BACKUP_MAX_DIAS : 20);
    let convertidos = 0, falhas = 0;

    for (let i = 1; i <= limite; i++) {
        const id = 'backup_' + userId + '_slot_' + i;
        let doc = null;
        try { doc = await getData('app_data', id); } catch (e) { continue; }
        if (!doc || doc.cifrado === true) continue;          // não existe, ou já está cifrado

        try {
            const pacote = await cifrarPacote(doc, chave);
            await saveData('app_data', id, pacote.principal);
            for (const cont of pacote.continuacoes) {
                await saveData('app_data', id + '_p' + cont.parte, cont);
            }
            convertidos++;
        } catch (e) {
            console.warn('[Backups] Não consegui cifrar ' + id + ':', e);
            falhas++;
        }
    }

    if (convertidos) console.log('[Backups] Slots em texto claro cifrados: ' + convertidos);
    return { convertidos: convertidos, falhas: falhas };
}
