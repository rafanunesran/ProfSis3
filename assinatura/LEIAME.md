# Assinatura automática — Mercado Pago

Esta pasta é **código de servidor**. Ela não vai para o site: o passo "Montar _site"
do `.github/workflows/deploy.yml` copia uma lista explícita de arquivos, e a pasta
`assinatura/` não está nela — só o `assinatura.js` da raiz, que é o front.

## O problema que isto resolve

O SisProf é um site estático (GitHub Pages) com Firestore. Não existe servidor para
o Mercado Pago avisar quando a mensalidade entra, falha ou é cancelada — por isso,
até aqui, contribuinte era **marcado na mão** no painel do Super Admin.

O webhook é o pedacinho de servidor que fecha esse ciclo:

```
professor clica "Assinar"  →  checkout do Mercado Pago (ele digita o cartão)
                                        ↓
                        cobrança mensal automática, todo mês
                                        ↓
   Mercado Pago  →  POST neste webhook  →  grava assinaturas/<uid> no Firestore
                                        ↓
                       o app lê o documento e libera o plano
```

O número do cartão **nunca** passa pelo SisProf nem pelo Firestore. Quem guarda o
cartão e faz a cobrança recorrente é o Mercado Pago.

## Os planos

| Plano | Valor | O que dá |
|---|---|---|
| Gratuito | R$ 0 | Tudo que o sistema sempre teve |
| Apoia-se | R$ 10,00/mês | Mesmas funções gratuitas + selo 💛 (apoio ao projeto) |
| Professor | R$ 20,00/mês | Tudo do Apoia-se + as funções premium |

Os valores moram em `regras.mjs` (servidor) e em `assinatura.js` (navegador).
`testes/teste-webhook-mp.js` compara os dois arquivos e falha se desencontrarem.

## Passo 1 — criar os planos no Mercado Pago

1. Mercado Pago → **Seu negócio → Assinaturas → Criar plano de assinatura**.
2. Crie dois planos, ambos com frequência **mensal**:
   - `SisProf — Apoia-se`, R$ 10,00
   - `SisProf — Professor`, R$ 20,00
3. Copie o **link de pagamento** de cada um (algo como
   `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=...`).
4. No SisProf: **Painel Super Admin → 💳 Assinaturas** → cole os dois links → Salvar.
   O app gruda o `external_reference` (o uid de quem clicou) no link, e é assim que o
   webhook sabe de quem é o pagamento. Quando o Mercado Pago não devolve essa
   referência, o webhook procura o e-mail do pagador na lista de usuários.

## Passo 2 — publicar o webhook (Cloudflare Workers)

```bash
npm install -g wrangler        # uma vez
cd assinatura
wrangler login
wrangler deploy                # usa o wrangler.toml desta pasta
```

Guarde os segredos (eles **nunca** entram no repositório):

```bash
wrangler secret put MP_ACCESS_TOKEN          # token de produção do Mercado Pago
wrangler secret put MP_WEBHOOK_SECRET        # "chave secreta" do webhook (passo 3)
wrangler secret put FIREBASE_SERVICE_ACCOUNT # o JSON da conta de serviço, inteiro
wrangler secret put MP_PLANO_APOIASE_ID      # opcional: id do plano de R$ 10
wrangler secret put MP_PLANO_PROFESSOR_ID    # opcional: id do plano de R$ 20
```

`FIREBASE_PROJECT_ID` já está no `wrangler.toml` (`profsis3`).

A conta de serviço sai do Console do Firebase → **Configurações do projeto → Contas
de serviço → Gerar nova chave privada**. Cole o JSON inteiro (ou o mesmo JSON em
base64, se o painel estragar as quebras de linha).

### Alternativa: Vercel

O mesmo código roda como função Edge. Crie `api/webhook-assinatura.js` no projeto da
Vercel com:

```js
import { tratarRequisicao } from '../assinatura/webhook.mjs';
export const config = { runtime: 'edge' };
export default (request) => tratarRequisicao(request, process.env);
```

E cadastre as mesmas variáveis em Settings → Environment Variables.

## Passo 3 — apontar o Mercado Pago para o webhook

Mercado Pago → **Suas integrações → sua aplicação → Webhooks/Notificações**:

- URL: o endereço do Worker (ex.: `https://sisprof-assinatura.<conta>.workers.dev`)
- Eventos: **Assinaturas** (`subscription_preapproval`) e **Pagamentos recorrentes**
  (`subscription_authorized_payment`)
- Copie a **chave secreta** que a tela mostra e guarde como `MP_WEBHOOK_SECRET`

Abrir a URL no navegador (GET) deve responder *"SisProf - webhook de assinatura no ar."*.

## Passo 4 — publicar as Regras do Firestore

O arquivo `firestore.rules` da raiz ganhou três blocos novos. Console do Firebase →
Firestore → Regras → cole o arquivo inteiro → Publicar.

O ponto importante: **ninguém escreve em `assinaturas/<uid>`** — nem o dono da conta.
Só o webhook (que usa conta de serviço e passa por cima das Regras) e o super admin.
Se o professor pudesse escrever o próprio documento, uma linha no console do
navegador bastaria para ele se declarar assinante do plano Professor.

## Passo 5 — encerrar o plano antigo de R$ 7,00

No painel do Mercado Pago, cancele as assinaturas do valor antigo. Não é preciso
avisar ninguém à mão: quem pagava vê, ao entrar no sistema, um aviso explicando que a
cobrança foi encerrada e escolhendo entre **continuar no gratuito**, **Apoia-se
(R$ 10)** ou **Professor (R$ 20)**. A escolha fica registrada e o aviso não volta.

## Como ligar uma função nova no plano Professor

No começo da função, uma linha:

```js
function gerarRelatorioTurma() {
    if (!exigirPremium('Relatório automático da turma')) return;
    // ... daqui para baixo, só quem tem o plano Professor
}
```

`exigirPremium` abre o pop-up dos planos já explicando o que foi bloqueado. Para
marcar o botão no menu, use `selosPremiumHtml()`.

**Registro honesto:** esse portão é *regra de uso*, não barreira de segurança — em
aplicativo de navegador, quem entende de console contorna. O que não dá para
contornar é o documento `assinaturas/<uid>`, e é nele que a cobrança se apoia.

## Testes

```bash
node testes/teste-webhook-mp.js     # regras puras: não abre navegador nem rede
node testes/teste-assinatura.js     # a tela, num Chromium com Firebase de mentira
```
