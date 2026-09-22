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

## Passo 2 — publicar o webhook na Vercel

O plano gratuito da Vercel dá conta com folga: este webhook é chamado algumas vezes
por assinatura, por mês.

1. [vercel.com](https://vercel.com) → **Add New… → Project** → importe o repositório
   `rafanunesran/ProfSis3`.
2. **Root Directory: `assinatura`** (clique em *Edit*, ao lado do campo, e escolha a
   pasta). Isso é o que importa mais nesta tela: com a raiz apontando para cá, a
   Vercel enxerga só esta pasta e **não publica uma segunda cópia do site** — o
   SisProf continua morando no GitHub Pages.
3. Framework Preset: **Other**. Não há build command nem output directory.
4. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   |---|---|
   | `MP_ACCESS_TOKEN` | token de **produção** do Mercado Pago (começa com `APP_USR-`) |
   | `MP_WEBHOOK_SECRET` | a chave secreta do webhook (vem no passo 3) |
   | `FIREBASE_PROJECT_ID` | `profsis3` |
   | `FIREBASE_SERVICE_ACCOUNT` | o JSON inteiro da conta de serviço |
   | `MP_PLANO_APOIASE_ID` | opcional: id do plano de R$ 10 |
   | `MP_PLANO_PROFESSOR_ID` | opcional: id do plano de R$ 20 |
   | `ORIGENS_PERMITIDAS` | opcional: origens que podem chamar o cancelamento, separadas por vírgula (o padrão já inclui `https://rafanunesran.github.io`) |
   | `MP_PACOTES_PIX` | pacotes de apoio no Pix: `apoiase:3:30,professor:3:60,professor:12:240` (plano:meses:valor) |
   | `CRON_SECRET` | segredo da varredura diária. **O nome importa**: só com ele exatamente assim a Vercel manda o cabeçalho de autorização no cron |
   | `DIAS_TOLERANCIA` | opcional: carência usada pela varredura (o painel guarda a que a tela usa) |

   Marque os três ambientes (Production, Preview, Development).
5. **Deploy**. Três endereços nascem daqui:
   - `https://<seu-projeto>.vercel.app/api/webhook` — o webhook do Mercado Pago
   - `https://<seu-projeto>.vercel.app/api/cancelar` — o cancelamento pedido pelo professor
   - `https://<seu-projeto>.vercel.app/api/reconciliar` — a varredura diária (roda pelo
     Cron configurado no `vercel.json`, todo dia às 9h UTC; não fica aberta na internet)
6. Abra esse endereço no navegador. Ele responde
   *"SisProf - webhook de assinatura no ar."* — se responder 404, a Root Directory
   não ficou em `assinatura`.

A conta de serviço sai do Console do Firebase → **Configurações do projeto → Contas
de serviço → Gerar nova chave privada**. Cole o JSON inteiro no campo (ou o mesmo
JSON em base64, se o painel estragar as quebras de linha). Essa chave dá acesso
total ao banco: ela vive só nas variáveis da Vercel, nunca no repositório.

O `MP_WEBHOOK_SECRET` você só terá no passo 3 — cadastre um valor qualquer agora e
volte para corrigi-lo depois (Settings → Environment Variables → Edit → **Redeploy**,
porque variável nova só vale no deploy seguinte). Enquanto ele estiver errado, o
webhook recusa tudo com 401, de propósito: um webhook aberto deixaria qualquer
pessoa na internet se declarar assinante do plano Professor.

### Alternativa: Cloudflare Workers

O mesmo código roda como Worker, sem mudar nada:

```bash
npm install -g wrangler
cd assinatura
wrangler login
wrangler deploy                              # usa o wrangler.toml desta pasta
wrangler secret put MP_ACCESS_TOKEN          # e os demais segredos da tabela acima
```

## Passo 3 — apontar o Mercado Pago para o webhook

Mercado Pago → **Suas integrações → sua aplicação → Webhooks/Notificações**:

- URL: o endereço publicado no passo 2 (ex.: `https://sisprof.vercel.app/api/webhook`)
- Eventos: **Assinaturas** (`subscription_preapproval`) e **Pagamentos recorrentes**
  (`subscription_authorized_payment`)
- Copie a **chave secreta** que a tela mostra, guarde como `MP_WEBHOOK_SECRET` e **refaça o
  deploy** (variável de ambiente nova só entra em vigor no deploy seguinte)

O painel do Mercado Pago tem um botão **Simular notificação**: use-o depois de salvar.
Uma simulação bem-sucedida responde 200; 401 quer dizer que o segredo não confere.

## Passo 4 — publicar as Regras do Firestore

O arquivo `firestore.rules` da raiz ganhou três blocos novos. Console do Firebase →
Firestore → Regras → cole o arquivo inteiro → Publicar.

O ponto importante: **ninguém escreve em `assinaturas/<uid>`** — nem o dono da conta.
Só o webhook (que usa conta de serviço e passa por cima das Regras) e o super admin.
Se o professor pudesse escrever o próprio documento, uma linha no console do
navegador bastaria para ele se declarar assinante do plano Professor.

## Passo 5 — cadastrar o endereço do serviço no painel

**Painel Super Admin → 💳 Assinaturas → Endereço do serviço**: cole
`https://<seu-projeto>.vercel.app/api` (sem `/webhook` e sem `/cancelar` — o sistema
completa o caminho).

É isso que faz o botão **Cancelar assinatura** cancelar de dentro do SisProf. Sem
esse endereço o botão continua aparecendo, mas manda o professor cancelar à mão no
painel do Mercado Pago — e nunca diz que cancelou sem ter cancelado.

## Passo 6 — migrar quem foi marcado à mão

O selo de apoiador agora sai **só do pagamento confirmado**. Quem estava marcado à
mão (o campo antigo `contribuidor`) perde o selo no instante em que esta versão entra
no ar, porque aquele campo deixou de conceder qualquer coisa — e deixou por um motivo
concreto: as Regras liberam escrita em `system/*` para qualquer conta logada, então
bastava uma linha no console do navegador para pendurar o selo no próprio nome sem
pagar nada.

**Painel Super Admin → 💳 Assinaturas → 💛 Migrar apoiadores marcados à mão.** Cada
marca antiga vira uma *cortesia registrada* em `assinaturas/<uid>`, com `versaoMs: 0`
— assim a primeira cobrança de verdade substitui a cortesia sozinha. Rodar duas vezes
não duplica nada, e contas sem uid do Firebase são puladas (rode "Sincronizar UIDs"
antes para incluí-las).

## Passo 7 — encerrar o plano antigo de R$ 7,00

No painel do Mercado Pago, cancele as assinaturas do valor antigo. Não é preciso
avisar ninguém à mão: quem pagava vê, ao entrar no sistema, um aviso explicando que a
cobrança foi encerrada e escolhendo entre **continuar no gratuito**, **Apoia-se
(R$ 10)** ou **Professor (R$ 20)**. A escolha fica registrada e o aviso não volta.

## O que concede o apoio (e o que não concede)

| Situação | Selo 💛 | Premium |
|---|---|---|
| Clicou em "Assinar" e o cartão ainda não passou (`pendente`) | não | não |
| Pagamento confirmado pelo Mercado Pago (`ativa`) | sim | só no plano Professor |
| Cobrança do mês falhou (`pausada`) | não | não |
| Cancelou, por conta própria ou pelo Mercado Pago (`cancelada`) | não | não |
| Cortesia concedida pelo super admin | sim | conforme o plano concedido |
| Campo `contribuidor` no perfil, sem pagamento | **não** | **não** |
| Pix aprovado, dentro da validade | sim | conforme o pacote |
| Pix ou cartão vencido além da carência | **não** | **não** |
| Vencido, mas ainda dentro da carência | sim (com aviso na tela) | sim (com aviso) |

A última linha é a que mudou. Existe uma única fonte: `assinaturas/<uid>`, escrito só
pelo webhook (conta de serviço) e pelo super admin. A vitrine "Obrigado a quem é
parça" veio junto: agora mora em `contribuintes/<uid>`, mesma proteção, guardando só
nome abreviado e escola — nem plano, nem valor, nem e-mail.

## O corte por atraso (a parte que não depende de aviso)

O corte por cartão recusado já vinha do webhook. Mas ele depende de o Mercado Pago
**avisar** — e existe um caso que aviso nenhum cobre: a notificação que se perde.
Webhook fora do ar por umas horas, deploy no meio do caminho, evento não reenviado, e
o documento fica `ativa` para sempre. A pessoa segue com premium e selo sem pagar, e
ninguém descobre, porque não existe evento para descobrir.

Por isso o acesso tem **prazo**, e o prazo é conferido em três lugares independentes:

1. **Na tela**, a cada abertura: compara `proximaCobranca` (cartão) ou `validoAte`
   (Pix) com hoje. Vencido além da carência → plano gratuito na hora, premium
   bloqueado, selo removido, tarja de apoio de volta. Não depende de banco nem de
   webhook.
2. **No webhook**, quando o Mercado Pago avisa (cartão recusado, cancelamento).
3. **Na varredura diária** (`/api/reconciliar`), que conserta o banco: derruba quem
   venceu e — importante — **devolve o acesso de quem pagou e cujo aviso se perdeu**,
   perguntando ao Mercado Pago como a assinatura está de verdade.

A **carência** fica em Painel Super Admin → 💳 Assinaturas → *Dias de carência*
(padrão 5). Ela existe porque a cobrança recorrente não cai no minuto exato: o Mercado
Pago tenta de novo por alguns dias, e cortar no primeiro segundo de atraso seria
cortar por causa da fila do banco, não por falta de pagamento. Dentro da carência a
tela **avisa** ("seu acesso continua por 3 dia(s)") em vez de cortar — quem esqueceu
merece o aviso, não a surpresa.

## Pix: apoio sem cartão

O Mercado Pago **não faz cobrança recorrente no Pix** — recorrência automática lá é
cartão, e não há como mudar isso do nosso lado. Então o Pix entra por outro caminho:
**pacote de meses**. O professor paga uma vez, o apoio vale pelo período e vence
sozinho. Nada fica sendo cobrado sem autorização, e não há o que cancelar.

Como montar:

1. No Mercado Pago, crie um **link de pagamento** para cada pacote (ex.: R$ 60,00 para
   3 meses de Professor). O link aceita Pix.
2. **Painel Super Admin → 💳 Assinaturas → Pacotes de apoio no Pix**, um por linha:
   `professor;3;60;https://mpago.la/xxxx`
3. **Cadastre os mesmos pacotes na variável `MP_PACOTES_PIX`** do serviço, no formato
   `plano:meses:valor`. Isto não é redundância: o link de pagamento do Mercado Pago nem
   sempre devolve a referência de quem pagou, e é pelo **valor recebido** que o servidor
   reconhece qual pacote foi. Se os dois lugares discordarem, o professor paga e o
   sistema não credita.

Regras que o servidor aplica:

- só `status: approved` credita — Pix pendente não libera nada;
- pagamento fora dos pacotes cadastrados **não vira plano por acidente** (a conta pode
  receber outras coisas);
- o mesmo Pix avisado duas vezes não credita o dobro (o id do pagamento é a defesa);
- renovar **antes** de vencer soma a partir da data que a pessoa já tinha — ninguém
  perde os dias que faltavam por pagar adiantado.

## Como o cancelamento funciona

O navegador não pode falar com a API do Mercado Pago: o token de produção ficaria no
código, à vista de todos. Então o botão chama `POST /api/cancelar` levando o **ID
token do Firebase Auth** da sessão, e o servidor:

1. confere o crachá contra as chaves públicas do Google (assinatura RS256, `aud`,
   `iss`, `exp` — ver `auth-firebase.mjs`). Confiar no uid que o navegador manda
   deixaria qualquer pessoa cancelar a assinatura de qualquer outra;
2. lê `assinaturas/<uid>` — só a assinatura de quem está pedindo;
3. cancela no Mercado Pago (`PUT /preapproval/<id>`);
4. derruba o plano para gratuito na hora e tira o nome da vitrine, sem esperar o
   webhook voltar. Um aviso atrasado do Mercado Pago não reativa o que a pessoa
   acabou de cancelar (o carimbo de versão cuida da ordem).

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
