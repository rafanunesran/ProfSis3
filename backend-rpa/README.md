# ProfSis3 — Servidor de IA (proxy) + RPA

Servidor Node/Express que resolve o **bloqueio da API do Google na rede da escola**: o navegador do
professor chama **este servidor** (hospedado fora da rede da escola), que fala com a IA
(Gemini/OpenAI/Groq/Nvidia) e devolve o documento pronto. O professor só clica e recebe.

> As chaves de IA ficam **apenas no servidor** (variável `IA_API_KEYS`). O site não precisa mais
> guardar a chave quando o proxy está ativo.

## Rotas
- `POST /api/ia-generate` — body `{ "prompt": "..." }` → `{ "ok": true, "text": "..." }` (ou `{ ok:false, error }`, HTTP 502). O site (ia_estagiario.js) faz o parse do JSON.
- `GET /api/ia-health` — `{ ok:true, temChave:boolean }` para checar rápido se subiu certo.
- (Rotas de RPA da SED já existentes: `/api/login-rpa`, `/api/sync-chamada`, `/api/fetch-turmas-estado`.)

## Variáveis de ambiente
| Variável | Obrigatória | Descrição |
|---|---|---|
| `IA_API_KEYS` | sim | Uma ou mais chaves de IA separadas por vírgula. O provedor é detectado pelo prefixo: Gemini (padrão), OpenAI `sk-`, Groq `gsk_`, Nvidia `nvapi-`. |
| `ALLOWED_ORIGIN` | recomendado | Origem liberada no CORS, ex.: `https://rafanunesran.github.io`. Padrão `*` (aberto). |
| `IA_PROXY_TOKEN` | opcional | Se definido, o servidor exige o header `x-ia-token` igual a este valor (anti-abuso). Cole o mesmo valor no painel Super Admin. |
| `PORT` | não | Porta (o serviço de hospedagem costuma injetar automaticamente). |

## Rodar localmente
```bash
cd backend-rpa
npm install
IA_API_KEYS="SUA_CHAVE_GEMINI" node server.js
# testar:
curl -s -X POST http://localhost:3000/api/ia-generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Responda APENAS com o JSON {\"ok\":true}"}'
```

## Publicar (ex.: Render)
1. Crie um **Web Service** apontando para este repositório, com **Root Directory** = `backend-rpa`.
2. Build: `npm install` · Start: `node server.js`.
3. Em **Environment**, defina `IA_API_KEYS` (sua chave do Gemini), `ALLOWED_ORIGIN` (o domínio do site) e, opcionalmente, `IA_PROXY_TOKEN`.
4. Publique e copie a **URL pública** (ex.: `https://profsis-ia.onrender.com`).
5. No site: **Super Admin → 🔑 Chaves de IA → Servidor de IA (proxy)** → cole a URL (e o token, se usou) → **Salvar servidor**.
6. Teste na rede da escola: gerar um Plano de Aula deve funcionar; na aba **Network** a chamada vai para a URL do servidor, não para `googleapis.com`.

> Existe também `render.yaml` como referência de configuração. Confirme que a rede da escola libera o
> domínio do servidor escolhido (o filtro bloqueia só o `googleapis.com`, mas convém testar).

## Observações
- Node 18+ (usa `fetch` global). Veja `package.json` (`engines`).
- O `playwright` continua como dependência por causa das rotas de RPA da SED. Se você for usar **só** o proxy de IA, pode removê-lo do `package.json` para acelerar o deploy — não é usado por `/api/ia-generate`.
