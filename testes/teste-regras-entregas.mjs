// As Regras do Firestore das ENTREGAS ONLINE (entregas_tarefas/), no EMULADOR.
//
// O aluno entrega pelo StopMotion RAN sem conta, entao a entrega e' escrita sem sessao.
// Este teste confere que essa porta so' abre do jeito certo:
//   - tarefa: le-se pelo codigo, nao se lista; so' o dono muda ou apaga;
//   - entrega: so' com a tarefa aberta, so' os campos combinados, link do Drive,
//     hora do servidor; ninguem altera; so' o professor da tarefa le e apaga.
//
// COMO RODAR
//   1. npm i -D firebase-tools @firebase/rules-unit-testing firebase
//   2. npx firebase emulators:start --only firestore --project profsis-teste   (porta 8085, ou ajuste abaixo)
//   3. node testes/teste-regras-entregas.mjs firestore.rules

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import fs from 'fs';

const arquivo = process.argv[2] || 'firestore.rules';
const env = await initializeTestEnvironment({
    projectId: 'profsis-teste',
    firestore: { rules: fs.readFileSync(arquivo, 'utf8'), host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8085) }
});
await env.clearFirestore();

const prof = env.authenticatedContext('prof1', { email: 'p@e.com' }).firestore();
const outro = env.authenticatedContext('prof2', { email: 'q@e.com' }).firestore();
const aluno = env.unauthenticatedContext().firestore();

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

const COD = 'ABCD2345';
const T = 'entregas_tarefas/' + COD;
const tarefa = (uid, aberta = true) => ({ donoUid: uid, tipo: 'stopmotion', titulo: 'Stop motion', turma: '6A', disciplina: 'Arte', prazo: '', aberta, destinoUrl: '', criadaEm: serverTimestamp(), atualizadaEm: serverTimestamp() });

console.log('tarefa');
await caso('professor cria a tarefa', true, setDoc(doc(prof, T), tarefa('prof1')));
await caso('sem sessao nao cria tarefa', false, setDoc(doc(aluno, 'entregas_tarefas/ZZZZ2345'), tarefa('prof1')));
await caso('nao cria tarefa em nome de outro', false, setDoc(doc(outro, 'entregas_tarefas/YYYY2345'), tarefa('prof1')));
await caso('codigo fora do formato e recusado', false, setDoc(doc(prof, 'entregas_tarefas/abc'), tarefa('prof1')));
await caso('aluno le a tarefa pelo codigo', true, getDoc(doc(aluno, T)));
await caso('ninguem lista as tarefas', false, getDocs(collection(aluno, 'entregas_tarefas')));
await caso('outro professor nao muda a tarefa', false, updateDoc(doc(outro, T), { titulo: 'X' }));
await caso('dono nao passa a tarefa para outro', false, updateDoc(doc(prof, T), { donoUid: 'prof2' }));
await caso('dono muda o prazo', true, updateDoc(doc(prof, T), { prazo: '2026-12-01' }));

console.log('\nentregas/');
const E = T + '/entregas/';
const entrega = (extra) => Object.assign({ nome: 'Ana Souza', turma: '6A', projeto: 'Meu filme', arquivoUrl: 'https://drive.google.com/file/d/abc/view', arquivoId: 'abc', quadros: 40, segundos: 5, em: serverTimestamp() }, extra || {});
await caso('aluno entrega', true, setDoc(doc(aluno, E + 'e1'), entrega()));
await caso('entrega so com nome', true, setDoc(doc(aluno, E + 'e2'), { nome: 'Bia', em: serverTimestamp() }));
await caso('aluno nao altera a entrega', false, updateDoc(doc(aluno, E + 'e1'), { nome: 'Outro' }));
await caso('campo a mais e recusado', false, setDoc(doc(aluno, E + 'e3'), entrega({ nota: 10 })));
await caso('link fora do Drive e recusado', false, setDoc(doc(aluno, E + 'e4'), entrega({ arquivoUrl: 'https://evil.example/x' })));
await caso('nome gigante e recusado', false, setDoc(doc(aluno, E + 'e5'), entrega({ nome: 'x'.repeat(61) })));
await caso('hora inventada e recusada', false, setDoc(doc(aluno, E + 'e6'), entrega({ em: Timestamp.fromMillis(0) })));
await caso('aluno nao le as entregas', false, getDocs(collection(aluno, T + '/entregas')));
await caso('outro professor nao le as entregas', false, getDocs(collection(outro, T + '/entregas')));
await caso('professor le as entregas', true, getDocs(collection(prof, T + '/entregas')));
await caso('entrega em tarefa inexistente e recusada', false, setDoc(doc(aluno, 'entregas_tarefas/QQQQ2345/entregas/x'), entrega()));
await updateDoc(doc(prof, T), { aberta: false });
await caso('tarefa fechada nao recebe entrega', false, setDoc(doc(aluno, E + 'e7'), entrega()));

console.log('\napagar');
await caso('aluno nao apaga entrega', false, deleteDoc(doc(aluno, E + 'e1')));
await caso('professor apaga entrega', true, deleteDoc(doc(prof, E + 'e1')));
await caso('aluno nao apaga a tarefa', false, deleteDoc(doc(aluno, T)));
await caso('professor apaga a tarefa', true, deleteDoc(doc(prof, T)));

await env.cleanup();
console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
