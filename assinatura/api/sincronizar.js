// "JA' PAGUEI", NA VERCEL: /api/sincronizar
//
// O professor pede para o servico conferir no Mercado Pago se o pagamento dele ja'
// caiu — sem depender do aviso do Mercado Pago ter chegado. A logica esta' em
// ../webhook.mjs (sincronizarUsuario).
import { tratarRequisicao } from '../webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
