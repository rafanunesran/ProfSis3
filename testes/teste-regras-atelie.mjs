// As Regras do Firestore do "Ateliê" (artes/), no EMULADOR.
//
// A arte e' do professor que a criou: so' ele le, lista, muda e apaga; ninguem cria
// arte em nome de outro, e o dono nao passa a arte para outra conta.
//
// COMO RODAR (igual ao teste-regras-quiz.mjs)
//   1. npm i -D firebase-tools @firebase/rules-unit-testing firebase
//   2. npx firebase emulators:start --only firestore --project profsis-teste   (porta 8085, ou EMU_PORT)
//   3. node testes/teste-regras-atelie.mjs firestore.rules

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import fs from 'fs';

const arquivo = process.argv[2] || 'firestore.rules';
const env = await initializeTestEnvironment({
    projectId: 'profsis-teste',
    firestore: { rules: fs.readFileSync(arquivo, 'utf8'), host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8085) }
});
await env.clearFirestore();

const prof = env.authenticatedContext('prof1', { email: 'p@e.com' }).firestore();
const outro = env.authenticatedContext('prof2', { email: 'q@e.com' }).firestore();
const semConta = env.unauthenticatedContext().firestore();

const falhas = [];
async function caso(nome, esperado, promessa) {
    try {
        if (esperado) await assertSucceeds(promessa); else await assertFails(promessa);
        console.log('  ok     ' + nome);
    } catch (e) {
        console.log('  FALHA  ' + nome + '  — ' + (e && e.message || e).toString().slice(0, 160));
        falhas.push(nome);
    }
}

console.log('\nartes/');
await caso('professor cria a propria arte', true, setDoc(doc(prof, 'artes/a1'), { donoUid: 'prof1', titulo: 'Cartaz', elementos: [] }));
await caso('professor le a propria arte', true, getDoc(doc(prof, 'artes/a1')));
await caso('professor lista as proprias artes', true, getDocs(query(collection(prof, 'artes'), where('donoUid', '==', 'prof1'))));
await caso('professor atualiza a propria arte', true, setDoc(doc(prof, 'artes/a1'), { donoUid: 'prof1', titulo: 'Cartaz 2', elementos: [] }));
await caso('dono nao passa a arte para outra conta', false, updateDoc(doc(prof, 'artes/a1'), { donoUid: 'prof2' }));
await caso('OUTRO professor nao le a arte', false, getDoc(doc(outro, 'artes/a1')));
await caso('outro professor nao lista as artes de ninguem', false, getDocs(collection(outro, 'artes')));
await caso('outro professor nao altera', false, updateDoc(doc(outro, 'artes/a1'), { titulo: 'x' }));
await caso('outro professor nao apaga', false, deleteDoc(doc(outro, 'artes/a1')));
await caso('ninguem cria arte em nome de outro', false, setDoc(doc(outro, 'artes/a2'), { donoUid: 'prof1' }));
await caso('sem conta nao le', false, getDoc(doc(semConta, 'artes/a1')));
await caso('sem conta nao cria', false, setDoc(doc(semConta, 'artes/a3'), { donoUid: 'prof1' }));
await caso('professor apaga a propria arte', true, deleteDoc(doc(prof, 'artes/a1')));

await env.cleanup();
console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
