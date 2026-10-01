// O LIVRO-CAIXA, NA VERCEL: /api/financeiro
//
// A tela financeira do super admin pede "busca os pagamentos dos ultimos N dias no
// Mercado Pago". So' o super admin passa. A logica esta' em ../financeiro.mjs.
import { tratarRequisicao } from '../webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
