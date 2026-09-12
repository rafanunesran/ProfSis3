// ============================================================================
//  DO BANCO RECUPERADO PARA ARQUIVOS QUE O SISTEMA IMPORTA
// ----------------------------------------------------------------------------
//  Roda DEPOIS de recuperar-pitr.sh. Lê o banco "recuperado" (nunca a produção),
//  junta, para cada professor, o documento principal com todos os backups
//  diários dele, e grava um .profsis por pessoa em ./recuperados/.
//
//  POR QUE JUNTAR EM VEZ DE ESCOLHER UM
//    O documento principal tem o estado do dia; um backup de três dias antes
//    pode ter a nota que foi apagada depois. Juntando por `id`, o que existe em
//    qualquer um dos dois entra, e nada se perde na escolha.
//
//  COMO RODAR (no Cloud Shell, na mesma pasta)
//      npm install firebase-admin
//      BANCO=recuperado node extrair-profsis.js
//
//  O que ele NÃO consegue abrir: os documentos `pessoal_*`, que são cifrados com
//  a senha do professor. Esses voltam sozinhos quando a pessoa entra no sistema
//  com e-mail e senha — a chave nunca sai do aparelho dela, nem para o suporte.
// ============================================================================

const fs = require('fs');
const path = require('path');

const LISTAS_CONHECIDAS = ['turmas', 'estudantes', 'horariosAulas', 'aulas', 'presencas',
    'atrasos', 'trabalhos', 'notas', 'compensacoes', 'tutorados', 'encontros', 'eventos',
    'ocorrencias', 'gradeHoraria', 'agendamentos', 'registrosAula', 'registrosAdministrativos',
    'mapeamentos', 'caderno'];

const PARA_CONTAR = ['turmas', 'estudantes', 'tutorados', 'ocorrencias', 'notas',
    'presencas', 'encontros', 'registrosAdministrativos'];

function censo(d) {
    const c = {};
    PARA_CONTAR.forEach(k => { c[k] = Array.isArray(d && d[k]) ? d[k].length : 0; });
    return c;
}

function total(c) { return PARA_CONTAR.reduce((s, k) => s + (c[k] || 0), 0); }

function pareceDados(d) {
    return !!d && typeof d === 'object' && LISTAS_CONHECIDAS.some(k => Array.isArray(d[k]));
}

// União por `id`, caindo para a forma inteira do registro quando não há id.
// Mesma regra da Central de Resgate: nada do que existe em qualquer lado se perde.
function unir(base, vindo) {
    const saida = Object.assign({}, base || {});
    Object.keys(vindo || {}).forEach(chave => {
        const novo = vindo[chave];
        if (Array.isArray(novo)) {
            const atual = Array.isArray(saida[chave]) ? saida[chave].slice() : [];
            const vistos = new Set(atual.map(it => (it && it.id != null) ? 'id:' + it.id : 'js:' + JSON.stringify(it)));
            novo.forEach(it => {
                const assinatura = (it && it.id != null) ? 'id:' + it.id : 'js:' + JSON.stringify(it);
                if (vistos.has(assinatura)) return;
                vistos.add(assinatura);
                atual.push(it);
            });
            saida[chave] = atual;
            return;
        }
        const vazioAqui = saida[chave] === undefined || saida[chave] === null || saida[chave] === '';
        if (vazioAqui && novo !== undefined) saida[chave] = novo;
    });
    return saida;
}

// De quem é este documento? O nome carrega o dono em todos os formatos que o
// sistema já usou.
function donoDoDocumento(id) {
    let m = /^backup_(.+)_slot_\d+$/.exec(id);
    if (m) return { dono: m[1], tipo: 'backup' };
    m = /^app_data_school_(.+)_(gestor|aee|projeto|tutoria)$/.exec(id);
    if (m) return { dono: 'escola-' + m[1] + '-' + m[2], tipo: 'escola' };
    m = /^app_data_(.+)$/.exec(id);
    if (m) return { dono: m[1], tipo: 'principal' };
    return null;
}

// O coração, separado de propósito: é função pura, então dá para provar que ela
// junta certo sem precisar de banco nenhum.
function montarPacotes(documentos) {
    const porDono = {};
    Object.keys(documentos).forEach(id => {
        const corpo = documentos[id];
        if (id.indexOf('pessoal_') === 0) return;           // cifrado: não abre aqui
        if (id.indexOf('backup_index_') === 0) return;      // índice não tem dado
        if (!pareceDados(corpo)) return;
        if (corpo.cifrado === true) return;                 // backup cifrado
        const quem = donoDoDocumento(id);
        if (!quem) return;
        if (!porDono[quem.dono]) porDono[quem.dono] = { dono: quem.dono, origens: [], dados: {} };
        porDono[quem.dono].origens.push(id);
        porDono[quem.dono].dados = unir(porDono[quem.dono].dados, corpo);
    });

    return Object.keys(porDono).map(dono => {
        const item = porDono[dono];
        const c = censo(item.dados);
        return {
            dono: dono,
            arquivo: 'recuperado-' + dono.replace(/[^A-Za-z0-9_-]+/g, '-') + '.profsis',
            origens: item.origens.sort(),
            censo: c,
            total: total(c),
            pacote: {
                formato: 'profsis',
                versao: 1,
                geradoEm: new Date().toISOString(),
                origem: 'recuperacao-pitr:' + item.origens.join('+'),
                dados: item.dados
            }
        };
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);
}

async function main() {
    // O projeto do ProfSis vem escrito aqui pelo mesmo motivo do recuperar-pitr.sh:
    // o Cloud Shell costuma abrir com outro selecionado.
    const projeto = process.env.PROJETO || 'profsis3';
    const banco = process.env.BANCO || 'recuperado';
    if (banco === '(default)') {
        console.error('Recuso ler o banco de produção por engano. Use o banco recuperado (BANCO=recuperado).');
        process.exit(1);
    }

    let admin;
    try { admin = require('firebase-admin'); }
    catch (e) {
        console.error('Falta a biblioteca. Rode:  npm install firebase-admin');
        process.exit(1);
    }

    admin.initializeApp({ projectId: projeto });
    const db = admin.firestore();
    db.settings({ databaseId: banco });

    console.log('Lendo app_data do banco "' + banco + '"...');
    const documentos = {};
    let lidos = 0;
    const snap = await db.collection('app_data').get();
    snap.forEach(doc => { documentos[doc.id] = doc.data(); lidos++; });
    console.log(lidos + ' documento(s) lidos.');

    const pacotes = montarPacotes(documentos);
    if (!pacotes.length) {
        console.log('Nenhum documento com conteúdo. Confira se o instante escolhido é anterior à perda.');
        return;
    }

    const pasta = path.join(process.cwd(), 'recuperados');
    fs.mkdirSync(pasta, { recursive: true });
    const resumo = [];
    pacotes.forEach(p => {
        fs.writeFileSync(path.join(pasta, p.arquivo), JSON.stringify(p.pacote));
        const linha = PARA_CONTAR.filter(k => p.censo[k] > 0).map(k => p.censo[k] + ' ' + k).join(' · ');
        console.log('  ' + p.arquivo + '  ->  ' + linha);
        console.log('      de: ' + p.origens.join(', '));
        resumo.push([p.dono, p.arquivo, linha, p.origens.join(' ')].join('\t'));
    });
    fs.writeFileSync(path.join(pasta, 'RESUMO.tsv'), resumo.join('\n') + '\n');

    console.log('\n' + pacotes.length + ' arquivo(s) em ' + pasta);
    console.log('No Cloud Shell, baixe com:  cloudshell download recuperados/NOME.profsis');
    console.log('No sistema: "Importar dados do arquivo" (substitui) ou Central de Resgate > Mesclar (junta).');
}

module.exports = { montarPacotes, unir, donoDoDocumento, censo };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
