// CANCELAMENTO DA ASSINATURA, NA VERCEL: /api/cancelar
//
// A Vercel roteia por arquivo, entao o cancelamento precisa do proprio ponto de
// entrada (no Cloudflare Workers um so' arquivo atende os dois caminhos). A logica
// e' a mesma de sempre: ../webhook.mjs decide tudo, olhando o caminho da requisicao.
import { tratarRequisicao } from '../webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
