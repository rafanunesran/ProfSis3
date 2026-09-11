// firestore.rules.teste.mjs — compara as Regras NOVAS com as que já estão no ar
// ============================================================================
//  POR QUE ESTE ARQUIVO EXISTE
//    Em 07/09/2026 uma publicação de Regras trancou professores para fora, e
//    demorou a ser diagnosticada porque ninguém sabia dizer o que havia mudado
//    de fato. Testar uma regra isolada não basta: o que importa é a DIFERENÇA
//    em relação ao que já funciona.
//
//    Este teste roda os dois arquivos no emulador e mostra, lado a lado, cada
//    cenário real do sistema. Toda linha marcada "MUDOU" precisa ser uma
//    mudança que você QUIS fazer. Se um caminho de login mudar, não publique.
//
//  COMO RODAR
//    1. npm i -D firebase-tools @firebase/rules-unit-testing firebase
//    2. npx firebase emulators:start --only firestore --project profsis-teste
//    3. git show <commit-que-esta-no-ar>:firestore.rules > /tmp/base.rules
//    4. node firestore.rules.teste.mjs /tmp/base.rules firestore.rules
// ============================================================================

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
import fs from 'fs';

const cenarios = [
  // [nome, uid, claims, operacao]
  ['ANTIGO sem access: le users_list (LOGIN)', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>getDoc(doc(d,'system/users_list'))],
  ['ANTIGO sem access: le app_data          ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>getDoc(doc(d,'app_data/app_data_u-antigo'))],
  ['ANTIGO sem access: grava camada nuvem   ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'app_data/app_data_u-antigo'),{turmas:[]})],
  ['ANTIGO sem access: grava COM estudantes ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'app_data/app_data_u-antigo'),{estudantes:[{id:1}]})],
  ['APROVADO: le users_list (LOGIN)         ', 'u-aprov',  {email:'b@e.com',email_verified:false}, d=>getDoc(doc(d,'system/users_list'))],
  ['APROVADO: le app_data                   ', 'u-aprov',  {email:'b@e.com',email_verified:false}, d=>getDoc(doc(d,'app_data/app_data_u-aprov'))],
  ['PENDENTE: le users_list (LOGIN)         ', 'u-pend',   {email:'c@e.com',email_verified:false}, d=>getDoc(doc(d,'system/users_list'))],
  ['PENDENTE: le app_data                   ', 'u-pend',   {email:'c@e.com',email_verified:false}, d=>getDoc(doc(d,'app_data/app_data_u-pend'))],
  ['SEM email_verified no token: le app_data', 'u-antigo', {email:'a@e.com'},                       d=>getDoc(doc(d,'app_data/app_data_u-antigo'))],
  ['TOKEN VAZIO: le app_data                ', 'u-antigo', {},                                      d=>getDoc(doc(d,'app_data/app_data_u-antigo'))],
  ['grava mapa da sala                      ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'app_data/maps_school_77'),{list:[]})],
  ['grava backup cifrado                    ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'app_data/backup_u-antigo_slot_1'),{cifrado:true,iv:'a',ct:'b'})],
  ['grava chaves_backup propria             ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'chaves_backup/u-antigo'),{salt:'x'})],
  ['shared_views COM estudantes             ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'shared_views/live_77'),{estudantes:[{id:1}]})],
  ['shared_views so contagens               ', 'u-antigo', {email:'a@e.com',email_verified:false}, d=>setDoc(doc(d,'shared_views/live_77'),{resumo:{total:3}})],

  // --- Fase 3: espacos com codigo de convite -------------------------------
  // O codigo e' conferido na tela de CADASTRO, antes de existir sessao: estes
  // dois primeiros cenarios sao o caminho de entrada de todo usuario novo.
  ['SEM SESSAO: le indice do codigo (CADASTRO)', null,     null,                                   d=>getDoc(doc(d,'espacos_indice/hash-do-codigo'))],
  ['SEM SESSAO: le o espaco pelo id           ', null,     null,                                   d=>getDoc(doc(d,'espacos/esp-1'))],
  ['LOGADO: VARRE a colecao de espacos        ', 'u-antigo',{email:'a@e.com',email_verified:false}, d=>getDocs(collection(d,'espacos'))],
  ['LOGADO: entra em espaco que EXISTE        ', 'u-novo',  {email:'n@e.com',email_verified:false}, d=>setDoc(doc(d,'access/u-novo'),{approved:true,role:'professor',espacoId:'esp-1'})],
  ['LOGADO: entra em espaco INEXISTENTE       ', 'u-novo2', {email:'n2@e.com',email_verified:false},d=>setDoc(doc(d,'access/u-novo2'),{approved:true,role:'professor',espacoId:'esp-nao-existe'})],
  ['GESTOR do espaco: edita o espaco          ', 'u-gestor',{email:'g@e.com',email_verified:false}, d=>updateDoc(doc(d,'espacos/esp-1'),{nome:'Nome novo'})],
  ['PROFESSOR: edita o espaco                 ', 'u-aprov', {email:'b@e.com',email_verified:false}, d=>updateDoc(doc(d,'espacos/esp-1'),{nome:'Invadido'})],
  ['LOGADO: CRIA espaco                       ', 'u-aprov', {email:'b@e.com',email_verified:false}, d=>setDoc(doc(d,'espacos/esp-novo'),{nome:'Nova',legacySchoolId:'99'})],
  ['SEM SESSAO: CRIA espaco                   ', null,      null,                                   d=>setDoc(doc(d,'espacos/esp-invasor'),{nome:'X'})],
  ['LOGADO: sonda no indice (set)             ', 'u-aprov', {email:'b@e.com',email_verified:false}, d=>setDoc(doc(d,'espacos_indice/_sonda_u-aprov'),{sonda:true})],
];

async function rodar(arquivo) {
  const env = await initializeTestEnvironment({ projectId:'cmp-'+Math.random().toString(36).slice(2,8),
    firestore:{ host:'127.0.0.1', port:8080, rules: fs.readFileSync(arquivo,'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const d = c.firestore();
    await setDoc(doc(d,'system/users_list'),{list:[{id:1,email:'a@e.com'}]});
    await setDoc(doc(d,'access/u-aprov'),{approved:true,role:'professor'});
    await setDoc(doc(d,'access/u-pend'),{approved:false,role:'professor'});
    await setDoc(doc(d,'app_data/app_data_u-antigo'),{turmas:[]});
    await setDoc(doc(d,'app_data/app_data_u-aprov'),{turmas:[]});
    await setDoc(doc(d,'app_data/app_data_u-pend'),{turmas:[]});
    await setDoc(doc(d,'access/u-gestor'),{approved:true,role:'gestor',espacoId:'esp-1'});
    await setDoc(doc(d,'espacos/esp-1'),{nome:'Escola Teste',legacySchoolId:'77',salt:'aa'});
    await setDoc(doc(d,'espacos_indice/hash-do-codigo'),{espacoId:'esp-1'});
  });
  const ctx = {};
  const res = [];
  for (const [nome, uid, claims, op] of cenarios) {
    const k = uid + JSON.stringify(claims);
    if (!ctx[k]) ctx[k] = (claims === null)
        ? env.unauthenticatedContext().firestore()
        : env.authenticatedContext(uid, claims).firestore();
    try { await op(ctx[k]); res.push('permite'); } catch(e) { res.push('NEGA   '); }
  }
  await env.cleanup();
  return res;
}

const antes = await rodar(process.argv[2] || '/tmp/base.rules');
const depois = await rodar(process.argv[3] || 'firestore.rules');
console.log('  ORIGINAL | NOVA     | cenario');
console.log('  ---------|----------|------------------------------------------');
let mudancas = 0;
cenarios.forEach(([nome], i) => {
  const dif = antes[i] !== depois[i];
  if (dif) mudancas++;
  console.log('  ' + antes[i] + '  | ' + depois[i] + '  | ' + nome + (dif ? '   <<< MUDOU' : ''));
});
console.log('\n  ' + mudancas + ' mudanca(s) de comportamento em ' + cenarios.length + ' cenarios');
process.exit(0);
