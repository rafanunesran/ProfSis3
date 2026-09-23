# Servidor do "Baixar vídeo por link"

Esta pasta **não vai para o site** (o passo "Montar _site" do `deploy.yml` copia uma
lista explícita de arquivos). É a receita do servidor que a aba
**Ferramentas → Vídeo → Baixar vídeo por link** usa.

## Por que precisa de servidor

Um link de página de vídeo não é o arquivo: é uma página que monta o player. Tirar o
arquivo de lá exige ler a página do jeito que um navegador lê, e o navegador proíbe um
site (o SisProf) de ler a página de outro site. Quem faz isso é o
[cobalt](https://github.com/imputnet/cobalt), um servidor de código aberto: o SisProf
manda o link, o cobalt devolve o arquivo.

Os servidores públicos do cobalt não servem: o oficial só atende o site dele, e os da
comunidade caem, mudam ou bloqueiam uso por outros sites. Por isso o SisProf tem o seu.

Sem servidor cadastrado, a ferramenta continua baixando **links diretos** de arquivo
(terminados em `.mp4`, `.webm`...).

## Opção A — Render (sem instalar nada, tem plano gratuito)

1. [render.com](https://render.com) → **New → Web Service → Existing Image**.
2. Image URL: `ghcr.io/imputnet/cobalt:11`
3. Nome: por exemplo `sisprof-video`. O endereço fica `https://sisprof-video.onrender.com`.
4. **Environment Variables**:

   | Nome | Valor |
   |---|---|
   | `API_URL` | `https://sisprof-video.onrender.com/` (o seu endereço, com `/` no fim) |
   | `API_PORT` | `10000` |
   | `CORS_WILDCARD` | `0` |
   | `CORS_URL` | `https://rafanunesran.github.io` |
   | `RATELIMIT_MAX` | `20` |
   | `DURATION_LIMIT` | `3600` |

5. **Create Web Service** e espere ficar *Live*.

No plano gratuito o servidor **dorme** depois de 15 minutos parado: o primeiro download
depois disso demora cerca de um minuto (os seguintes são normais). O plano pago mais
barato não dorme.

## Opção B — VPS própria (Docker)

Para quem já tem uma máquina (ou aluga uma, a partir de uns US$ 5/mês):

1. Aponte um subdomínio (ex.: `video.seudominio.com.br`) para o IP da máquina.
2. Copie `docker-compose.yml` desta pasta, troque `video.seudominio.com.br` nos dois lugares.
3. `docker compose up -d`. O HTTPS sai sozinho (Caddy + Let's Encrypt).

Esta opção traz também o `yt-session-generator`, que ajuda com sites que só entregam o
vídeo a um "navegador de verdade".

## Ligar no SisProf

1. Entre como super admin → **Painel Super Admin → 🎬 Download de vídeo**.
2. Cole o endereço (ex.: `https://sisprof-video.onrender.com`) → **Testar** → **Salvar**.

Pronto: a partir daí, qualquer professor com o plano cola o link e baixa. Dá para
cadastrar um segundo servidor como reserva.

## Limites que continuam existindo

- Vídeo **privado** ou que exige login não baixa (a ferramenta explica isso).
- Alguns sites bloqueiam servidores de nuvem de tempos em tempos. Quando um site para de
  funcionar, o cobalt normalmente corrige em poucos dias; na VPS o `watchtower` atualiza
  sozinho, no Render use **Manual Deploy → Deploy latest reference**.
- A chave opcional do painel fica visível para quem abre o site (vai no pedido do
  navegador). A proteção real é o `CORS_URL` + o limite de pedidos por minuto.
