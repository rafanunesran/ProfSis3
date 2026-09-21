// Adaptador para a Vercel (funcao Edge). O codigo de verdade esta' em webhook.mjs —
// aqui so' se troca a forma de entregar a requisicao e as variaveis de ambiente.
//
// Para usar: copie este arquivo para `api/webhook-assinatura.js` no projeto da
// Vercel, junto com a pasta assinatura/, e cadastre os mesmos segredos do LEIAME.
import { tratarRequisicao } from './webhook.mjs';

export const config = { runtime: 'edge' };

export default function handler(request) {
    return tratarRequisicao(request, process.env);
}
