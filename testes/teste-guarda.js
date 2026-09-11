const fs = require('fs');
const core = fs.readFileSync('/home/user/ProfSis3/core.js', 'utf8');
function pegar(nome) {
  const i = core.indexOf('function ' + nome);
  if (i < 0) throw new Error('nao achei ' + nome);
  let n = 0;
  for (let k = core.indexOf('{', i); k < core.length; k++) {
    if (core[k] === '{') n++; else if (core[k] === '}') { n--; if (!n) return core.slice(i, k+1); }
  }
}
const corpo = `
let podePessoal = false;
function podeEnviarDadoPessoal() { return podePessoal; }
let falhas = 0;
function checa(nome, fn, deveBloquear) {
  let bloqueou = false, msg = '';
  try { fn(); } catch (e) { bloqueou = true; msg = e.message.slice(0, 58); }
  const ok = bloqueou === deveBloquear;
  if (!ok) falhas++;
  console.log((ok ? '  ok  ' : ' FALHA') + ' | ' + nome + (bloqueou ? ' -> ' + msg : ' -> passou'));
}
console.log('\\n== ANTES DO CORTE ==');
podePessoal = true;
checa('estudantes em app_data', () => assertSemDadosPessoais('app_data','app_data_x',{estudantes:[{nome_completo:'Ana'}]}), false);
console.log('\\n== DEPOIS DO CORTE ==');
podePessoal = false;
checa('estudantes em app_data', () => assertSemDadosPessoais('app_data','app_data_x',{estudantes:[{nome_completo:'Ana'}]}), true);
checa('ocorrencias em app_data', () => assertSemDadosPessoais('app_data','app_data_x',{ocorrencias:[{relato:'x'}]}), true);
checa('so camada nuvem (turmas)', () => assertSemDadosPessoais('app_data','app_data_x',{turmas:[{id:1,nome:'1A'}]}), false);
checa('nome_completo escondido fundo', () => assertSemDadosPessoais('app_data','q',{a:{b:[{c:{nome_completo:'Ana'}}]}}), true);
checa('ids_estudantes aninhado', () => assertSemDadosPessoais('shared_views','live_1',{resumo:{x:[{ids_estudantes:[1]}]}}), true);
checa('mapa da sala (so ids)', () => assertSemDadosPessoais('app_data','maps_school_1',{list:[{id_turma:9,assentos:{'3-2':1717}}]}), false);
checa('tutoria com nome abreviado', () => assertSemDadosPessoais('app_data','app_data_school_1_tutoria',{historico:[{data:'x',tema:'t',resumo:'r',nomeAbreviado:'Joao S.'}]}), false);
checa('backup em texto claro', () => assertSemDadosPessoais('app_data','backup_u1_slot_3',{estudantes:[{nome_completo:'Ana'}]}), true);
checa('backup cifrado de verdade', () => assertSemDadosPessoais('app_data','backup_u1_slot_3',{cifrado:true,ct:'AAAA',iv:'BB'}), false);
checa('parte de backup cifrado', () => assertSemDadosPessoais('app_data','backup_u1_slot_3_p2',{cifrado:true,parte:2,ct:'AAAA'}), false);
checa('envelope da chave', () => assertSemDadosPessoais('chaves_backup','u1',{salt:'a',wrapUsuario:'b'}), false);
console.log('\\n== DIVISAO DAS CAMADAS ==');
const d = getInitialData();
d.turmas=[{id:1}]; d.estudantes=[{id:7,nome_completo:'Ana'}]; d.campoInventadoAmanha=[{x:1}];
const s = dividirDados(d);
const t = (nome, cond) => { if (!cond) falhas++; console.log((cond?'  ok  ':' FALHA') + ' | ' + nome); };
t('estudantes ficam no local', !('estudantes' in s.nuvem) && 'estudantes' in s.local);
t('turmas vao para a nuvem', 'turmas' in s.nuvem);
t('campo novo cai no local (fail-closed)', 'campoInventadoAmanha' in s.local);
t('ida e volta identica', JSON.stringify(juntarDados(s.local, s.nuvem)) === JSON.stringify(d));
t('camada nuvem passa na guarda', (() => { try { assertSemDadosPessoais('app_data','k',s.nuvem); return true; } catch(e){ return false; } })());
t('abreviarNome', abreviarNome('Joao Pedro da Silva Souza') === 'Joao S.');
console.log('\\n' + (falhas ? falhas + ' FALHA(S)' : 'todos os ' + 18 + ' testes passaram'));
process.exit(falhas ? 1 : 0);
`;
eval([fs.readFileSync('/home/user/ProfSis3/shared.js','utf8'),
      core.match(/const LIMITE_VARREDURA = \d+;/)[0],
      pegar('_varrerChavesPessoais'), pegar('assertSemDadosPessoais'), corpo].join('\n;\n'));
