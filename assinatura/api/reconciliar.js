// A VARREDURA DIARIA, NA VERCEL: /api/reconciliar
//
// Chamada pelo Cron (ver vercel.json). Derruba o acesso de quem venceu e nao pagou,
// e devolve o acesso de quem pagou e cuja notificacao se perdeu no caminho.
// Autenticada por ASSINATURA_CRON_SECRET — nao e' endereco para ficar aberto.
import { tratarRequisicao } from '../webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
