// ENTRADA DO WEBHOOK NA VERCEL.
//
// A logica de verdade esta' em ../webhook.mjs — aqui so' se troca a forma de
// receber a requisicao e de ler os segredos.
//
// COMO A VERCEL ENXERGA ISTO
//   No painel do projeto, "Root Directory" precisa ser `assinatura`. Com isso a
//   Vercel enxerga SO' esta pasta, e nao publica uma segunda copia do site (o site
//   vive no GitHub Pages; duas copias do SisProf no ar seria confusao garantida).
//   O endereco publicado fica: https://<projeto>.vercel.app/api/webhook
//
// Runtime Edge de proposito: e' onde `crypto.subtle` existe e onde nao ha' cold
// start pesado. O `firebase-admin` nao roda aqui — e' justamente por isso que o
// acesso ao Firestore e' feito pela API REST (../firestore-rest.mjs).
import { tratarRequisicao } from '../webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
