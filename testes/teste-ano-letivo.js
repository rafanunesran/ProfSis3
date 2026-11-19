// Funções puras da virada de ano (anoletivo.js). Não abre navegador nem banco.
const A = require('../anoletivo.js');

let falhas = 0;
const cobrar = (ok, texto) => { console.log((ok ? '   OK   ' : '   *** FALHOU *** ') + texto); if (!ok) falhas++; };

const BIMS = [
    { bim: 1, inicio: '2026-02-02', fim: '2026-04-17' },
    { bim: 4, inicio: '2026-10-05', fim: '2026-12-18' }
];
const BIMS_JANEIRO = [
    { bim: 1, inicio: '2026-02-02', fim: '2026-04-17' },
    { bim: 4, inicio: '2026-11-03', fim: '2027-01-29' }
];

console.log('1. ano letivo de uma data');
cobrar(A.anoLetivoDaData('2026-11-19', BIMS) === 2026, 'data dentro dos bimestres');
cobrar(A.anoLetivoDaData('2027-01-10', BIMS) === 2027, 'férias de janeiro já são do ano novo');
cobrar(A.anoLetivoDaData('2027-01-10', BIMS_JANEIRO) === 2026, 'bimestre que atravessa o réveillon fica no ano que começou');
cobrar(A.anoLetivoDaData('2026-05-01') === 2026, 'sem bimestres, vale o ano do calendário');
cobrar(A.anoLetivoDaData('') === null && A.anoLetivoDaData(undefined) === null, 'sem data, sem ano');
cobrar(A.anoLetivoAtual(BIMS, new Date(2026, 10, 19)) === 2026, 'ano atual pelo relógio');

console.log('2. ano de um registro');
cobrar(A.anoDoRegistro({ anoLetivo: 2025, data: '2026-03-01' }) === 2025, 'campo anoLetivo manda');
cobrar(A.anoDoRegistro({ data: '2025-08-01' }) === 2025, 'data do registro');
cobrar(A.anoDoRegistro({ id: 1, atualizadoEm: '2025-06-01T10:00:00Z' }) === 2025, 'carimbo de edição');
cobrar(A.anoDoRegistro({ id: new Date(2024, 5, 1).getTime() }) === 2024, 'id em milissegundos');
cobrar(A.anoDoRegistro({ id: 7, valor: '8' }) === null, 'sem pista nenhuma: null');

console.log('3. separar por ano não esconde o que não tem data');
const ocorr = [{ id: 1, data: '2025-05-01' }, { id: 2, data: '2026-05-01' }, { id: 3 }];
const s = A.separarPorAno(ocorr, 2026);
cobrar(s.doAno.map(o => o.id).join() === '2,3', 'deste ano + sem data ficam visíveis');
cobrar(s.outros.map(o => o.id).join() === '1', 'o do ano passado vai para o arquivo');

console.log('4. estudante que saiu');
const hoje = new Date(2026, 10, 19);
cobrar(!A.estudantePodeSerApagado({ status: 'Ativo', saiuEm: '2020-01-01' }, hoje), 'ativo nunca');
cobrar(!A.estudantePodeSerApagado({ status: 'Transferido' }, hoje), 'sem data de saída nunca');
cobrar(!A.estudantePodeSerApagado({ status: 'Transferido', saiuEm: '2026-03-01' }, hoje), 'antes de 1 ano não');
cobrar(A.estudantePodeSerApagado({ status: 'Transferido', saiuEm: '2025-11-01' }, hoje), 'depois de 1 ano sim');
const saiu = A.comDataDeSaida({ id: 1, status: 'Ativo' }, 'Transferido', hoje);
cobrar(saiu.saiuEm === '2026-11-19' && saiu.status === 'Transferido', 'saída carimba a data');
const original = { id: 1, status: 'Transferido', saiuEm: '2026-01-01' };
const outraSaida = A.comDataDeSaida(original, 'NCOM', hoje);
cobrar(outraSaida.saiuEm === '2026-01-01', 'trocar entre situações de saída mantém a data original');
const voltou = A.comDataDeSaida(original, 'Ativo', hoje);
cobrar(!('saiuEm' in voltou) && original.saiuEm === '2026-01-01', 'voltar a Ativo tira a data e não mexe no original');

console.log('5. retrato do ano');
const t25 = new Date(2025, 1, 10).getTime(), t26 = new Date(2026, 1, 10).getTime();
const data = {
    configBimestres: BIMS,
    turmas: [{ id: t25, nome: '1A' }, { id: t26, nome: '2A' }, { id: 5, nome: '3A', anoLetivo: 2025 }],
    estudantes: [{ id: 10, id_turma: t25, nome_completo: 'Ana Júlia' }, { id: 20, id_turma: t26, nome_completo: 'ANA JULIA' }],
    trabalhos: [{ id: 100, id_turma: t25 }, { id: 200, id_turma: t26 }],
    notas: [{ id: 1, id_trabalho: 100, id_estudante: 10, valor: '7' }, { id: 2, id_trabalho: 200, id_estudante: 20, valor: '9' }],
    presencas: [{ id_estudante: 10, data: '2025-04-01', status: 'falta' }, { id_estudante: 20, data: '2026-04-01', status: 'falta' }],
    ocorrencias: [{ id: 1, data: '2025-06-01', ids_estudantes: [10], tipo: 'disciplinar' }, { id: 2, data: '2026-06-01', ids_estudantes: [20], tipo: 'rapida' }]
};
const antes = JSON.stringify(data);
const r25 = A.montarRetratoDoAno(data, 2025);
cobrar(JSON.stringify(data) === antes, 'não altera os dados de origem');
cobrar(r25.turmas.map(t => t.nome).join() === '1A,3A', 'turmas de 2025');
cobrar(r25.notas.length === 1 && r25.notas[0].valor === '7', 'só as notas dos trabalhos de 2025');
cobrar(r25.ocorrencias.length === 1 && r25.presencas.length === 1, 'ocorrências e faltas de 2025');

console.log('6. histórico do aluno casa por nome entre anos');
const r26 = A.montarRetratoDoAno(data, 2026);
const h = A.historicoDoEstudante([r25, r26], 'ana julia');
cobrar(h.length === 2, 'achou nos dois anos mesmo com id diferente');
cobrar(h[0].anoLetivo === 2025 && h[0].disciplinares === 1 && h[0].faltas === 1, 'contagem de 2025');
cobrar(h[1].ocorrencias === 1 && h[1].disciplinares === 0, 'rápida não conta como disciplinar');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
