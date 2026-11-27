// As Regras do Firestore do link de equipamentos (equip_sessoes/), no EMULADOR.
//
// O estudante abre equipamento.html sem conta, entao equip_sessoes/registros e' um lugar
// do banco com escrita sem sessao. Este teste confere que a porta so' abre do jeito certo:
//   - a sessao e' lida pelo codigo, nao listada; so' o professor dela muda e apaga;
//   - o estudante cria registro so' com numero + equipamento (nada de nome), so' com
//     numero dentro da turma, so' com a hora do servidor, so' enquanto o link vale;
//   - o estudante nao le os registros dos colegas;
//   - os documentos compartilhados da escola (app_data/equip_*) passam pela regra de
//     sempre e recusam campo pessoal depois do corte.
//
// COMO RODAR (igual ao teste-regras-quiz.mjs)
//   1. npm i -D firebase-tools @firebase/rules-unit-testing firebase
//   2. npx firebase emulators:start --only firestore --project profsis-teste   (porta 8085)
//   3. node testes/teste-regras-equipamentos.mjs firestore.rules

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
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

const COD = 'K7M2PQ';
const daqui = min => Timestamp.fromMillis(Date.now() + min * 60000);
const sessao = (extra) => Object.assign({
    hostUid: 'prof1', aberta: true, turma: '1º A', horario: '07:00–07:50', total: 30,
    equipamentos: [{ id: 'eq1', rotulo: 'Notebook 01' }, { id: 'eq2', rotulo: 'Notebook 02' }],
    expiraEm: daqui(60), criadoEm: serverTimestamp()
}, extra || {});

console.log('\nequip_sessoes/');
await caso('codigo fora do formato e recusado', false, setDoc(doc(prof, 'equip_sessoes/abc'), sessao()));
await caso('codigo com letra ambigua (O, I, 0, 1) e recusado', false, setDoc(doc(prof, 'equip_sessoes/K7M2P0'), sessao()));
await caso('sessao em nome de outro professor e recusada', false, setDoc(doc(prof, 'equip_sessoes/' + COD), sessao({ hostUid: 'prof2' })));
await caso('estudante sem conta nao abre sessao', false, setDoc(doc(aluno, 'equip_sessoes/' + COD), sessao()));
await caso('sessao que vale mais de 18 h e recusada', false, setDoc(doc(prof, 'equip_sessoes/' + COD), sessao({ expiraEm: daqui(60 * 24) })));
await caso('total maior que 80 e recusado', false, setDoc(doc(prof, 'equip_sessoes/' + COD), sessao({ total: 500 })));
await caso('professor abre a sessao', true, setDoc(doc(prof, 'equip_sessoes/' + COD), sessao()));
await caso('estudante le a sessao pelo codigo', true, getDoc(doc(aluno, 'equip_sessoes/' + COD)));
await caso('ninguem lista as sessoes', false, getDocs(collection(aluno, 'equip_sessoes')));
await caso('outro professor nao muda a sessao', false, updateDoc(doc(outro, 'equip_sessoes/' + COD), { total: 3 }));
await caso('estudante nao muda a sessao', false, updateDoc(doc(aluno, 'equip_sessoes/' + COD), { total: 3 }));

console.log('\nregistros/');
const R = 'equip_sessoes/' + COD + '/registros';
const reg = (extra) => Object.assign({ num: 12, equip: 'eq1', tipo: 'pegou', em: serverTimestamp() }, extra || {});
await caso('estudante informa numero + equipamento', true, addDoc(collection(aluno, R), reg()));
await caso('estudante troca por defeito (com o anterior)', true, addDoc(collection(aluno, R), reg({ equip: 'eq2', tipo: 'defeito', anterior: 'eq1' })));
await caso('estudante digita um equipamento fora da lista', true, addDoc(collection(aluno, R), reg({ equip: 'txt:Notebook 31' })));
await caso('estudante corrige o numero (devolveu)', true, addDoc(collection(aluno, R), reg({ equip: '-', tipo: 'devolveu' })));
await caso('registro com NOME e recusado', false, addDoc(collection(aluno, R), reg({ nome: 'Ana Souza' })));
await caso('numero 0 e recusado', false, addDoc(collection(aluno, R), reg({ num: 0 })));
await caso('numero maior que a turma e recusado', false, addDoc(collection(aluno, R), reg({ num: 31 })));
await caso('numero em texto e recusado', false, addDoc(collection(aluno, R), reg({ num: '12' })));
await caso('equipamento vazio e recusado', false, addDoc(collection(aluno, R), reg({ equip: '' })));
await caso('equipamento gigante e recusado', false, addDoc(collection(aluno, R), reg({ equip: 'x'.repeat(61) })));
await caso('tipo inventado e recusado', false, addDoc(collection(aluno, R), reg({ tipo: 'roubou' })));
await caso('hora inventada pelo estudante e recusada', false, addDoc(collection(aluno, R), reg({ em: Timestamp.fromMillis(0) })));
await caso('estudante nao le os registros', false, getDocs(collection(aluno, R)));
await caso('outro professor nao le os registros', false, getDocs(collection(outro, R)));
await caso('professor da sessao le os registros', true, getDocs(collection(prof, R)));
const algum = (await getDocs(collection(prof, R))).docs[0];
await caso('estudante nao apaga registro', false, deleteDoc(doc(aluno, R + '/' + algum.id)));

console.log('\nlink fechado ou vencido');
await updateDoc(doc(prof, 'equip_sessoes/' + COD), { aberta: false });
await caso('link fechado nao aceita registro', false, addDoc(collection(aluno, R), reg()));
await updateDoc(doc(prof, 'equip_sessoes/' + COD), { aberta: true, expiraEm: Timestamp.fromMillis(Date.now() - 60000) });
await caso('link vencido nao aceita registro', false, addDoc(collection(aluno, R), reg()));

console.log('\nencerrar');
await caso('professor apaga um registro', true, deleteDoc(doc(prof, R + '/' + algum.id)));
await caso('estudante nao apaga a sessao', false, deleteDoc(doc(aluno, 'equip_sessoes/' + COD)));
await caso('outro professor nao apaga a sessao', false, deleteDoc(doc(outro, 'equip_sessoes/' + COD)));
await caso('professor apaga a sessao', true, deleteDoc(doc(prof, 'equip_sessoes/' + COD)));

console.log('\napp_data/equip_* (documentos compartilhados da escola)');
await caso('professor grava o cadastro da escola', true, setDoc(doc(prof, 'app_data/equip_school_77'), { equipamentos: [{ id: 'eq1', rotulo: 'Notebook 01', tipo: 'notebook', situacao: 'ok' }] }));
await caso('colega le o cadastro', true, getDoc(doc(outro, 'app_data/equip_school_77')));
await caso('estudante sem conta nao le o cadastro', false, getDoc(doc(aluno, 'app_data/equip_school_77')));
await caso('reserva com lista de estudantes e recusada (corte)', false, setDoc(doc(prof, 'app_data/equip_reservas_school_77_2026-11'), { reservas: [], estudantes: [{ nome_completo: 'Ana' }] }));
await caso('reserva sem dado pessoal passa', true, setDoc(doc(prof, 'app_data/equip_reservas_school_77_2026-11'), { reservas: [{ id: 'r1', data: '2026-11-27', inicio: '07:00', fim: '07:50', equipIds: ['eq1'] }] }));

await env.cleanup();
console.log(falhas.length ? '\n' + falhas.length + ' FALHA(S)' : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
