// GERAR O QR CODE DO PIX, NA VERCEL: /api/pix
//
// O professor escolhe o pacote na tela, e este endereco pede ao Mercado Pago um
// pagamento Pix com o valor daquele pacote — o valor sai de MP_PACOTES_PIX, nunca do
// navegador. Nenhuma chave Pix passa por aqui: quem recebe e' a conta do Mercado Pago
// do projeto, com a chave cadastrada la'.
import { tratarRequisicao } from '../webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
