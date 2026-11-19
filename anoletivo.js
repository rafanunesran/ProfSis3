// anoletivo.js — base para a virada de ano letivo (PREPARAÇÃO, ainda NÃO usado)
// ============================================================================
//  POR QUE ISTO EXISTE
//    Hoje o sistema não sabe de que ano é cada coisa: nota, ocorrência, falta e
//    turma ficam todas na mesma lista, para sempre. Quando o ano virar, as faltas
//    e ocorrências de 2026 contariam no perfil de 2027 (ver perfisParaGrupos em
//    app.js), e o professor teria as turmas velhas misturadas com as novas.
//
//    Decisões do dono (nov/2026):
//      1. ocorrências e notas ficam guardadas SEPARADAS por ano e não entram nos
//         cálculos de nota e média do ano atual — servem para perfil, comportamento
//         e montagem de grupos;
//      2. estudante que saiu fica arquivado ~1 ano para consulta, depois é apagado;
//      3. turmas novas continuam entrando por CSV ou à mão;
//      4. turmas do professor ficam arquivadas por ano, com consulta.
//
//  O QUE ESTE ARQUIVO FAZ
//    Só funções PURAS: recebem dados, devolvem resposta, não gravam nada, não
//    apagam nada e não mexem na tela. NENHUMA tela chama estas funções ainda, e o
//    arquivo não é carregado pelo index.html nem copiado por scripts/montar-site.sh.
//    Ligar cada uma é um passo separado, combinado com o dono.
//
//  Testes: node testes/teste-ano-letivo.js
// ============================================================================
(function (global) {
    'use strict';

    // Quanto tempo o estudante que saiu fica guardado para consulta.
    const DIAS_ARQUIVO_ESTUDANTE = 365;

    // Situações que significam "saiu da turma". Ativo (ou vazio) é o contrário.
    function statusEhAtivoAno(status) {
        return !status || String(status).trim().toLowerCase() === 'ativo';
    }

    function anoDeTextoData(texto) {
        const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(texto || ''));
        return m ? parseInt(m[1], 10) : null;
    }

    // Ano letivo de uma data 'AAAA-MM-DD'. No Brasil o ano letivo é o ano do
    // calendário; o único cuidado é o bimestre que atravessa o réveillon (escola
    // que termina em janeiro): se a data cai dentro dos bimestres cadastrados, vale
    // o ano em que o PRIMEIRO bimestre começou.
    function anoLetivoDaData(dataStr, configBimestres) {
        const anoCivil = anoDeTextoData(dataStr);
        if (anoCivil === null) return null;
        const bims = (configBimestres || []).filter(b => b && b.inicio && b.fim);
        if (bims.length) {
            const inicio = bims.reduce((m, b) => (b.inicio < m ? b.inicio : m), bims[0].inicio);
            const fim = bims.reduce((m, b) => (b.fim > m ? b.fim : m), bims[0].fim);
            if (dataStr >= inicio && dataStr <= fim) return anoDeTextoData(inicio);
        }
        return anoCivil;
    }

    function hojeTexto(hoje) {
        const d = hoje instanceof Date ? hoje : new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function anoLetivoAtual(configBimestres, hoje) {
        return anoLetivoDaData(hojeTexto(hoje), configBimestres);
    }

    // id criado com Date.now() (13 dígitos) carrega a data em que nasceu.
    function anoDoIdTempo(id) {
        const n = Number(id);
        if (!isFinite(n) || n < 1e12 || n > 9e12) return null;
        return new Date(n).getFullYear();
    }

    // De que ano letivo é um registro qualquer (nota, ocorrência, falta, trabalho,
    // turma). Ordem de confiança:
    //   1. `anoLetivo` gravado no próprio registro (o campo do futuro);
    //   2. a data do registro (`data`, `data_entrega`, `inicio`);
    //   3. o carimbo `atualizadoEm` (carimbarRegistro, shared.js) — é a última
    //      edição, não o nascimento, por isso vem depois da data;
    //   4. o id em milissegundos.
    // Sem nenhuma pista devolve null: quem chama decide (e o seguro é tratar como
    // "do ano atual", para nada sumir da tela).
    function anoDoRegistro(reg, configBimestres) {
        if (!reg || typeof reg !== 'object') return null;
        const gravado = parseInt(reg.anoLetivo, 10);
        if (gravado > 1900) return gravado;
        const datas = [reg.data, reg.data_entrega, reg.dataEntrega, reg.inicio];
        for (const d of datas) {
            const a = anoLetivoDaData(d, configBimestres);
            if (a) return a;
        }
        if (reg.atualizadoEm) {
            const a = anoDeTextoData(String(reg.atualizadoEm).slice(0, 10));
            if (a) return a;
        }
        return anoDoIdTempo(reg.id);
    }

    // Separa uma lista em "deste ano" e "de outros anos". O que não tem ano
    // conhecido fica em "deste ano": é o lado que continua aparecendo, então
    // nenhuma nota some da tela por falta de data.
    function separarPorAno(lista, ano, configBimestres) {
        const doAno = [], outros = [];
        (lista || []).forEach(r => {
            const a = anoDoRegistro(r, configBimestres);
            (a === null || a === ano ? doAno : outros).push(r);
        });
        return { doAno, outros };
    }

    // Nome do estudante para casar o mesmo aluno entre anos (o id muda quando a
    // gestão importa a lista nova por CSV; o nome normalizado, não).
    function chaveNomeEstudante(nome) {
        return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .trim().toUpperCase().replace(/\s+/g, ' ');
    }

    function diasEntre(deTexto, ateTexto) {
        const a = Date.parse(String(deTexto).slice(0, 10) + 'T12:00:00Z');
        const b = Date.parse(String(ateTexto).slice(0, 10) + 'T12:00:00Z');
        if (isNaN(a) || isNaN(b)) return null;
        return Math.round((b - a) / 86400000);
    }

    // O estudante que saiu já pode ser apagado? Só com TODAS as condições:
    //   - não está Ativo;
    //   - tem a data em que saiu (`saiuEm`) — sem ela, NUNCA (não dá para saber
    //     se faz um ano ou um dia);
    //   - passou o prazo do arquivo.
    function estudantePodeSerApagado(est, hoje, dias) {
        if (!est || statusEhAtivoAno(est.status)) return false;
        if (!est.saiuEm) return false;
        const passados = diasEntre(est.saiuEm, hojeTexto(hoje));
        return passados !== null && passados >= (dias || DIAS_ARQUIVO_ESTUDANTE);
    }

    // Carimbo para quando o status mudar. Devolve um registro NOVO (não altera o
    // que recebeu): saiu → guarda a data; voltou a Ativo → tira a data.
    function comDataDeSaida(est, novoStatus, hoje) {
        const novo = Object.assign({}, est, { status: novoStatus });
        if (statusEhAtivoAno(novoStatus)) delete novo.saiuEm;
        else if (statusEhAtivoAno(est && est.status) || !novo.saiuEm) novo.saiuEm = hojeTexto(hoje);
        return novo;
    }

    // Retrato de um ano, para o arquivo. Copia (não move) tudo o que é daquele ano:
    // as turmas e o que pertence a elas (estudantes, trabalhos e notas desses
    // trabalhos) e os registros com data (presenças, ocorrências, atrasos, caderno).
    // `data` não é alterado.
    function montarRetratoDoAno(data, ano, configBimestres) {
        const d = data || {};
        const bims = configBimestres || d.configBimestres;
        const copia = x => JSON.parse(JSON.stringify(x));
        const turmas = (d.turmas || []).filter(t => {
            const a = anoDoRegistro(t, bims);
            return a === ano;
        });
        const idsTurma = new Set(turmas.map(t => String(t.id)));
        const daTurma = lista => (lista || []).filter(x => idsTurma.has(String(x.id_turma)));
        const trabalhos = daTurma(d.trabalhos);
        const idsTrab = new Set(trabalhos.map(t => String(t.id)));
        const porData = lista => (lista || []).filter(r => anoDoRegistro(r, bims) === ano);
        return copia({
            anoLetivo: ano,
            configBimestres: bims || [],
            turmas,
            estudantes: daTurma(d.estudantes),
            trabalhos,
            notas: (d.notas || []).filter(n => idsTrab.has(String(n.id_trabalho))),
            presencas: porData(d.presencas),
            atrasos: porData(d.atrasos),
            ocorrencias: porData(d.ocorrencias),
            caderno: porData(d.caderno)
        });
    }

    // Perfil de um aluno nos anos arquivados, para comportamento e grupos. Casa por
    // nome normalizado (o id pode ter mudado). Não entra em nota nem média.
    function historicoDoEstudante(retratos, nome) {
        const chave = chaveNomeEstudante(nome);
        return (retratos || []).map(r => {
            const ids = new Set((r.estudantes || [])
                .filter(e => chaveNomeEstudante(e.nome_completo) === chave).map(e => String(e.id)));
            if (!ids.size) return null;
            const ocorr = (r.ocorrencias || []).filter(o => (o.ids_estudantes || []).some(x => ids.has(String(x))));
            const faltas = (r.presencas || []).filter(p => ids.has(String(p.id_estudante)) && p.status === 'falta').length;
            return {
                anoLetivo: r.anoLetivo,
                ocorrencias: ocorr.length,
                disciplinares: ocorr.filter(o => o.tipo !== 'rapida').length,
                faltas
            };
        }).filter(Boolean);
    }

    const API = {
        DIAS_ARQUIVO_ESTUDANTE,
        anoLetivoDaData,
        anoLetivoAtual,
        anoDoRegistro,
        separarPorAno,
        chaveNomeEstudante,
        estudantePodeSerApagado,
        comDataDeSaida,
        montarRetratoDoAno,
        historicoDoEstudante
    };
    global.AnoLetivo = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
