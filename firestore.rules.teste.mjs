// firestore.rules.teste.mjs — prova que as Regras fazem o que dizem fazer
// ============================================================================
//  POR QUE ESTE ARQUIVO EXISTE
//    Publicar Regras erradas trancou professores para fora do sistema em
//    07/09/2026, e a investigação levou horas porque ninguém conseguia dizer,
//    com certeza, o que as Regras permitiam. Ler o arquivo não basta: o
//    comportamento real só aparece executando.
//
//  COMO RODAR (fora do site publicado; nada aqui vai para o ar)
//    1. npm i -D firebase-tools @firebase/rules-unit-testing firebase
//    2. npx firebase emulators:start --only firestore --project profsis-teste
//    3. node firestore.rules.teste.mjs firestore.rules
//
//  ATENÇÃO: os casos abaixo assumem que a DATA DE CORTE JÁ PASSOU. Antes dela,
//  "grava COM estudantes" passa a ser PERMITIDO — e é assim que tem de ser.
// ============================================================================

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'profsis-teste',
  firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(process.argv[2] || 'regras.rules', 'utf8') }
});

// Semeia dados como se fosse o banco real (ignora as regras)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'system/users_list'), { list: [
    { id: 1, nome: 'Maria', email: 'maria@escola.com', uid: 'uid-maria', role: 'professor', schoolId: '77' }
  ]});
  await setDoc(doc(db, 'system/config_sistema'), { dataCorte: '2026-09-07T10:00:00Z' });
  await setDoc(doc(db, 'system/schools_list'), { list: [{ id: '77', nome: 'EE Teste' }] });
  await setDoc(doc(db, 'app_data/app_data_uid-maria'), { turmas: [{id:1}], estudantes: [{id:9,nome_completo:'Ana'}] });
  // Professora ANTIGA: sem documento em access/ (o "principio de ouro")
  // Professora NOVA aprovada:
  await setDoc(doc(db, 'access/uid-nova'), { approved: true, role: 'professor', schoolId: '77' });
  await setDoc(doc(db, 'access/uid-pendente'), { approved: false, role: 'professor', schoolId: '77' });
});

let falhas = 0, total = 0;
async function checa(nome, promessa, deveriaPassar) {
  total++;
  let ok;
  try { await promessa; ok = true; } catch (e) { ok = false; }
  const certo = ok === deveriaPassar;
  if (!certo) falhas++;
  console.log((certo ? '  ok  ' : ' FALHA') + ' | ' + (ok ? 'PERMITIU' : 'NEGOU   ') + ' | ' + nome +
              (certo ? '' : '  <-- esperado ' + (deveriaPassar ? 'PERMITIR' : 'NEGAR')));
}

const antiga  = env.authenticatedContext('uid-maria',    { email: 'maria@escola.com', email_verified: false }).firestore();
const nova    = env.authenticatedContext('uid-nova',     { email: 'nova@escola.com',  email_verified: false }).firestore();
const pend    = env.authenticatedContext('uid-pendente', { email: 'p@escola.com',     email_verified: false }).firestore();
const anonimo = env.unauthenticatedContext().firestore();

console.log('\n=== LOGIN: o que o app faz para entrar ===');
await checa('anonimo le schools_list (tela de cadastro)', getDoc(doc(anonimo,'system/schools_list')), true);
await checa('anonimo le users_list (caminho legado)     ', getDoc(doc(anonimo,'system/users_list')), false);
await checa('LOGADO le users_list  <<< O LOGIN DEPENDE  ', getDoc(doc(antiga,'system/users_list')), true);
await checa('LOGADO grava users_list (backfill do uid)  ', setDoc(doc(antiga,'system/users_list'),{list:[{id:1,email:'maria@escola.com',uid:'uid-maria'}]}), true);
await checa('LOGADO le config_sistema (data de corte)   ', getDoc(doc(antiga,'system/config_sistema')), true);
await checa('LOGADO le o proprio access                 ', getDoc(doc(antiga,'access/uid-maria')), true);

console.log('\n=== BACKUP CIFRADO ===');
await checa('LOGADO le a propria chave de backup        ', getDoc(doc(antiga,'chaves_backup/uid-maria')), true);
await checa('LOGADO grava a propria chave de backup     ', setDoc(doc(antiga,'chaves_backup/uid-maria'),{salt:'x',wrapUsuario:'y'}), true);
await checa('LOGADO grava a chave de OUTRO usuario      ', setDoc(doc(antiga,'chaves_backup/uid-nova'),{salt:'x'}), false);

console.log('\n=== DADOS DO PROFESSOR (corte JA ativo) ===');
await checa('professora ANTIGA le o proprio app_data    ', getDoc(doc(antiga,'app_data/app_data_uid-maria')), true);
await checa('grava SO camada nuvem (turmas)             ', setDoc(doc(antiga,'app_data/app_data_uid-maria'),{turmas:[{id:1}]}), true);
await checa('grava COM estudantes (deve ser negado)     ', setDoc(doc(antiga,'app_data/app_data_uid-maria'),{turmas:[],estudantes:[{id:9}]}), false);
await checa('grava backup CIFRADO                       ', setDoc(doc(antiga,'app_data/backup_uid-maria_slot_1'),{cifrado:true,iv:'a',ct:'b'}), true);
await checa('grava backup em texto claro (negado)       ', setDoc(doc(antiga,'app_data/backup_uid-maria_slot_2'),{estudantes:[{id:9}]}), false);
await checa('grava indice do backup                     ', setDoc(doc(antiga,'app_data/backup_index_uid-maria'),{slots:[{id:1}]}), true);
await checa('grava mapa da sala (so ids)                ', setDoc(doc(antiga,'app_data/maps_school_77'),{list:[{id_turma:1,assentos:{'0-0':9}}]}), true);
await checa('grava historico de tutoria                 ', setDoc(doc(antiga,'app_data/app_data_school_77_tutoria'),{historico:[{data:'x',resumo:'y'}]}), true);

console.log('\n=== PERFIS NOVOS ===');
await checa('aprovada le o proprio app_data             ', getDoc(doc(nova,'app_data/app_data_uid-nova')), true);
await checa('PENDENTE le app_data (deve ser negado)     ', getDoc(doc(pend,'app_data/app_data_uid-maria')), false);
await checa('pendente le users_list (precisa, no login) ', getDoc(doc(pend,'system/users_list')), true);

console.log('\n=== CONFIGURACOES (so super admin escreve) ===');
await checa('professor grava config_ia (negado)         ', setDoc(doc(antiga,'system/config_ia'),{chave:'x'}), false);
await checa('professor grava config_sistema (negado)    ', setDoc(doc(antiga,'system/config_sistema'),{dataCorte:'2030-01-01'}), false);
await checa('professor se auto-isenta do corte (negado) ', setDoc(doc(antiga,'access/uid-maria'),{modoOnlineCompleto:true}), false);

console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + total : 'todos os ' + total + ' casos corretos'));
await env.cleanup();
process.exit(falhas ? 1 : 0);
