// As Regras do Firestore do "Na Mosca!" (quizzes/ e quiz_salas/), no EMULADOR.
//
// O aluno entra sem conta, entao quiz_salas e' o unico lugar do banco com escrita sem
// sessao. Este teste confere que essa porta so' abre do jeito certo:
//   - quiz com gabarito: so' o dono le;
//   - sala: le-se pelo PIN, nao se lista; so' o professor dela muda o estado;
//   - aluno entra com apelido e 0 ponto (nao com 99999 pontos), e nao altera ninguem;
//   - resposta: uma por pergunta, so' a pergunta aberta, so' dentro do tempo, hora do servidor;
//   - as respostas e a lista de jogadores so' o professor le.
//
// COMO RODAR
//   1. npm i -D firebase-tools @firebase/rules-unit-testing firebase
//   2. npx firebase emulators:start --only firestore --project profsis-teste   (porta 8085, ou ajuste abaixo)
//   3. node testes/teste-regras-quiz.mjs firestore.rules

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
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

console.log('\nquizzes/');
await caso('professor cria o proprio quiz', true, setDoc(doc(prof, 'quizzes/q1'), { donoUid: 'prof1', titulo: 'T', perguntas: [] }));
await caso('professor le o proprio quiz', true, getDoc(doc(prof, 'quizzes/q1')));
await caso('professor lista os proprios quizzes', true, getDocs(query(collection(prof, 'quizzes'), where('donoUid', '==', 'prof1'))));
await caso('OUTRO professor nao le o quiz (tem gabarito)', false, getDoc(doc(outro, 'quizzes/q1')));
await caso('aluno sem conta nao le o quiz', false, getDoc(doc(aluno, 'quizzes/q1')));
await caso('ninguem cria quiz em nome de outro', false, setDoc(doc(outro, 'quizzes/q2'), { donoUid: 'prof1' }));
await caso('outro professor nao apaga', false, deleteDoc(doc(outro, 'quizzes/q1')));

console.log('\nquiz_salas/');
const PIN = '482915';
await caso('professor abre a sala', true, setDoc(doc(prof, 'quiz_salas/' + PIN), { hostUid: 'prof1', estado: 'sala', indice: -1, total: 2, pergunta: null, gabarito: null }));
await caso('PIN fora do formato e recusado', false, setDoc(doc(prof, 'quiz_salas/012345'), { hostUid: 'prof1', estado: 'sala' }));
await caso('sala em nome de outro professor e recusada', false, setDoc(doc(outro, 'quiz_salas/111111'), { hostUid: 'prof1', estado: 'sala' }));
await caso('outro professor nao toma a sala (PIN ocupado)', false, setDoc(doc(outro, 'quiz_salas/' + PIN), { hostUid: 'prof2', estado: 'sala' }));
await caso('aluno le a sala pelo PIN', true, getDoc(doc(aluno, 'quiz_salas/' + PIN)));
await caso('aluno NAO lista as salas (varrer PINs)', false, getDocs(collection(aluno, 'quiz_salas')));
await caso('aluno nao muda o estado da sala', false, updateDoc(doc(aluno, 'quiz_salas/' + PIN), { estado: 'fim' }));
await caso('professor nao passa a sala para outro dono', false, updateDoc(doc(prof, 'quiz_salas/' + PIN), { hostUid: 'prof2' }));

console.log('\njogadores/');
const J = 'quiz_salas/' + PIN + '/jogadores/';
await caso('aluno entra com apelido e 0 ponto', true, setDoc(doc(aluno, J + 'j1'), { apelido: 'Raio', pontos: 0, entrouEm: serverTimestamp() }));
await caso('aluno NAO entra com pontos', false, setDoc(doc(aluno, J + 'j2'), { apelido: 'Esperto', pontos: 99999, entrouEm: serverTimestamp() }));
await caso('aluno nao entra com campo extra', false, setDoc(doc(aluno, J + 'j3'), { apelido: 'X', pontos: 0, entrouEm: serverTimestamp(), acertos: 50 }));
await caso('apelido gigante e recusado', false, setDoc(doc(aluno, J + 'j4'), { apelido: 'x'.repeat(40), pontos: 0, entrouEm: serverTimestamp() }));
await caso('aluno le o proprio jogador', true, getDoc(doc(aluno, J + 'j1')));
await caso('aluno nao altera os proprios pontos', false, updateDoc(doc(aluno, J + 'j1'), { pontos: 5000 }));
await caso('aluno nao lista os jogadores', false, getDocs(collection(aluno, 'quiz_salas/' + PIN + '/jogadores')));
await caso('professor lista os jogadores', true, getDocs(collection(prof, 'quiz_salas/' + PIN + '/jogadores')));
await caso('professor da os pontos', true, updateDoc(doc(prof, J + 'j1'), { pontos: 900 }));
await caso('outro professor nao mexe nos pontos', false, updateDoc(doc(outro, J + 'j1'), { pontos: 0 }));

console.log('\nrespostas/');
const R = 'quiz_salas/' + PIN + '/respostas/';
const resp = (j, i, e) => ({ jogadorId: j, indice: i, escolha: e, em: serverTimestamp() });
await caso('resposta antes de a pergunta abrir e recusada', false, setDoc(doc(aluno, R + 'j1_0'), resp('j1', 0, 1)));
await updateDoc(doc(prof, 'quiz_salas/' + PIN), { estado: 'pergunta', indice: 0, pergunta: { texto: 'P', opcoes: ['a', 'b', 'c'], tempo: 20 }, abertaEm: serverTimestamp() });
await caso('aluno responde a pergunta aberta', true, setDoc(doc(aluno, R + 'j1_0'), resp('j1', 0, 1)));
await caso('aluno nao responde duas vezes', false, setDoc(doc(aluno, R + 'j1_0'), resp('j1', 0, 2)));
await caso('resposta de outra pergunta e recusada', false, setDoc(doc(aluno, R + 'j1_1'), resp('j1', 1, 0)));
await caso('alternativa que nao existe e recusada', false, setDoc(doc(aluno, R + 'jX_0'), resp('j1', 0, 7)));
await caso('id que nao bate com o jogador e recusado', false, setDoc(doc(aluno, R + 'outro_0'), resp('j1', 0, 0)));
await caso('jogador que nao entrou nao responde', false, setDoc(doc(aluno, R + 'fantasma_0'), resp('fantasma', 0, 0)));
await caso('hora inventada pelo aluno e recusada', false, setDoc(doc(aluno, R + 'j1_0b'), { jogadorId: 'j1', indice: 0, escolha: 0, em: Timestamp.fromMillis(0) }));
await caso('aluno nao le as respostas', false, getDocs(collection(aluno, 'quiz_salas/' + PIN + '/respostas')));
await caso('professor le as respostas da pergunta', true, getDocs(query(collection(prof, 'quiz_salas/' + PIN + '/respostas'), where('indice', '==', 0))));
// Tempo esgotado: a pergunta abriu ha' 60 s (o professor grava a hora, o tempo e' 20 s).
await setDoc(doc(aluno, J + 'j9'), { apelido: 'Atrasado', pontos: 0, entrouEm: serverTimestamp() });
await updateDoc(doc(prof, 'quiz_salas/' + PIN), { abertaEm: Timestamp.fromMillis(Date.now() - 60000) });
await caso('resposta depois do tempo e recusada', false, setDoc(doc(aluno, R + 'j9_0'), resp('j9', 0, 0)));

console.log('\nencerrar');
await caso('professor apaga a resposta', true, deleteDoc(doc(prof, R + 'j1_0')));
await caso('professor apaga o jogador', true, deleteDoc(doc(prof, J + 'j1')));
await caso('aluno nao apaga a sala', false, deleteDoc(doc(aluno, 'quiz_salas/' + PIN)));
await updateDoc(doc(prof, 'quiz_salas/' + PIN), { estado: 'fim' });
await caso('ninguem entra numa sala encerrada', false, setDoc(doc(aluno, J + 'j5'), { apelido: 'Tarde', pontos: 0, entrouEm: serverTimestamp() }));
await caso('professor apaga a sala', true, deleteDoc(doc(prof, 'quiz_salas/' + PIN)));

await env.cleanup();
console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
