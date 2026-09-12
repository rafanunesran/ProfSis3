// A conversao do banco recuperado em arquivos .profsis. Nao abre navegador nem
// banco: roda a funcao pura de ferramentas/extrair-profsis.js.
//
// O que ela precisa acertar: juntar o documento principal com os backups do MESMO
// professor (o backup de tres dias antes pode ter a nota que sumiu depois), nao
// misturar professores, e nao produzir arquivo do que nao da' para abrir.
const { montarPacotes, donoDoDocumento } = require('../ferramentas/extrair-profsis.js');

let falhas = 0;
const cobrar = (ok, texto) => { console.log((ok ? '   OK   ' : '   *** FALHOU *** ') + texto); if (!ok) falhas++; };

const BANCO = {
  // Professora Maria: o documento principal perdeu a nota 2, que o backup guarda.
  'app_data_u1': {
    turmas: [{ id: 1, nome: '1A' }],
    eventos: [{ id: 1, data: '2026-09-05' }],
    estudantes: [{ id: 7, nome_completo: 'Ana' }],
    notas: [{ id: 1, valor: 8 }] },
  'backup_u1_slot_3': {
    turmas: [{ id: 1, nome: '1A' }, { id: 2, nome: '2B' }],
    estudantes: [{ id: 7, nome_completo: 'Ana' }, { id: 8, nome_completo: 'Bruno' }],
    notas: [{ id: 1, valor: 8 }, { id: 2, valor: 9 }] },
  'backup_u1_slot_4': { notas: [{ id: 3, valor: 10 }] },
  // Professor Joao: outra conta, nao pode se misturar.
  'app_data_u2': { turmas: [{ id: 9 }], estudantes: [{ id: 99, nome_completo: 'Carla' }] },
  // Documento da escola.
  'app_data_school_77_gestor': { turmas: [{ id: 5 }], eventos: [{ id: 2 }] },
  // O que nao da' para aproveitar:
  'pessoal_app_data_u1': { cifrado: true, dados: 'ruido' },
  'backup_u1_slot_9': { cifrado: true, partes: 1, dados: 'ruido' },
  'backup_index_u1': { slots: [{ id: 3 }] },
  'app_data_u3': { turmas: [] },                       // vazio
  'qualquer_outra_coisa': { turmas: [{ id: 1 }] }      // nome fora dos formatos
};

console.log('1. de quem e cada documento');
cobrar(donoDoDocumento('backup_u1_slot_3').dono === 'u1', 'backup de slot aponta para o dono');
cobrar(donoDoDocumento('app_data_u1').dono === 'u1', 'documento principal aponta para o dono');
cobrar(donoDoDocumento('app_data_school_77_gestor').dono === 'escola-77-gestor', 'documento de escola e separado');
cobrar(donoDoDocumento('qualquer_outra_coisa') === null, 'nome fora do padrao nao vira dono');

console.log('2. os pacotes');
const pacotes = montarPacotes(BANCO);
const porDono = {};
pacotes.forEach(p => porDono[p.dono] = p);
pacotes.forEach(p => console.log('   ' + p.arquivo + ' <- ' + p.origens.join(', ')
  + '  | ' + JSON.stringify(p.censo)));

const maria = porDono['u1'];
cobrar(!!maria, 'a professora tem pacote');
cobrar(maria.censo.notas === 3, 'a NOTA QUE SO EXISTIA NO BACKUP entrou (3 notas somadas)');
cobrar(maria.censo.turmas === 2 && maria.censo.estudantes === 2, 'turma e estudante que so o backup tinha entraram');
cobrar((maria.pacote.dados.eventos || []).length === 1, 'a agenda do documento principal veio junto');
cobrar(JSON.stringify(maria.pacote).indexOf('Carla') === -1, 'nada do outro professor vazou para este arquivo');
cobrar(maria.origens.length === 3 && maria.origens.indexOf('backup_u1_slot_9') === -1,
       'o backup cifrado ficou de fora (nao da para abrir aqui)');
cobrar(maria.pacote.formato === 'profsis' && maria.pacote.versao === 1,
       'o arquivo sai no formato que o botao Importar aceita');

cobrar(!!porDono['u2'] && porDono['u2'].censo.estudantes === 1, 'o outro professor tem o proprio arquivo');
cobrar(!!porDono['escola-77-gestor'], 'o documento da escola vira arquivo separado');
cobrar(!porDono['u3'], 'documento vazio nao vira arquivo');
cobrar(!pacotes.some(p => JSON.stringify(p.pacote).indexOf('ruido') !== -1), 'nada de cifrado entrou nos arquivos');

console.log(falhas ? ('\n*** ' + falhas + ' falha(s) ***') : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
