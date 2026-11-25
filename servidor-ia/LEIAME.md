# Servidor de IA de texto do EdiProf (passa os pedidos para o Gemini)

Esta pasta **não vai para o site** (o `scripts/montar-site.sh` copia uma lista fixa de
arquivos). É a receita para pôr uma máquina sua — pensada para a **Oracle Cloud (Always
Free)** — no meio do caminho entre o EdiProf e o Gemini.

## Para que serve

- **Rede da escola que bloqueia ou limita a IA:** o navegador só fala com o endereço da
  sua máquina; quem fala com o Google é a máquina.
- **Chaves do Gemini fora do navegador:** hoje as chaves cadastradas no Super Admin vão
  para o navegador de quem usa a IA. Com o servidor, elas ficam **só na máquina**
  (`/opt/sisprof-ia/chaves-gemini.txt`) e a tabela de chaves do Super Admin pode ficar vazia.

```
EdiProf (navegador) ──HTTPS + chave do app──▶ Caddy (443) ──▶ servidor.py (127.0.0.1:7862) ──▶ Gemini
                                                                └ chaves do Gemini ficam aqui
```

- Usado por tudo que gera texto com IA (Estagiário, Biblioteca ⚡ Rápido, Na Mosca!, Ateliê).
  O desenho do Ateliê continua com o servidor de imagem (`servidor-imagem/`).
- O app só usa o servidor se o endereço estiver cadastrado. Se o servidor falhar e ainda
  houver chaves na tabela do Super Admin, o app tenta do jeito antigo.
- **Proteção:** a "chave do app" (gerada na instalação) é exigida em todo pedido e só
  pedidos vindos de `https://ediprof.vercel.app` e `https://rafanunesran.github.io` são
  aceitos pelo navegador. Essa chave do app fica visível para quem usa o site (como a do
  servidor de imagem); ela **não** é a chave do Gemini.
- Só usa o Python 3 que já vem no Ubuntu. Não compila nada: a instalação leva 1 a 3 minutos.

## Jeito mais fácil: Cloudflare Worker (grátis, sem máquina)

O arquivo `cloudflare-worker.js` faz o mesmo que o `servidor.py`, mas roda na
Cloudflare. As chaves do Gemini ficam guardadas como "Secret" lá. Plano grátis: 100 mil
pedidos por dia.

1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com) (crie conta grátis se precisar).
2. **Workers & Pages → Create → Start with Hello World** (ou "Create Worker") →
   nome `ediprof-ia` → **Deploy**.
3. **Edit code**: apague tudo, cole o conteúdo de
   <https://raw.githubusercontent.com/rafanunesran/ProfSis3/main/servidor-ia/cloudflare-worker.js>
   → **Deploy**.
4. Volte ao Worker → **Settings → Variables and Secrets → + Add**:
   - Type **Secret**, Name `GEMINI_KEYS`, Value: as chaves do Gemini separadas por vírgula.
   - Type **Secret**, Name `CHAVE_APP`, Value: uma senha longa inventada (ex.: gere em
     <https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new>).
   → **Deploy**.
   Para o Worker também **desenhar** (Ateliê): **Settings → Bindings → + Add → Workers AI**,
   Variable name `AI` → **Deploy**. Usa o modelo Flux schnell da Cloudflare (o grátis dá
   uns 200 desenhos por dia). `/saude` passa a mostrar `"imagem": true`.
5. O endereço aparece no Worker (ex.: `https://ediprof-ia.seu-nome.workers.dev`). Teste de
   alcance: abra `.../saude` em casa e no wi-fi da escola.
6. EdiProf → Super Admin → 🔑 Chaves de IA → 🛰️ Servidor de IA próprio: endereço + a
   `CHAVE_APP` → Testar → Salvar.

Se a escola bloquear o `workers.dev`, dá para ligar um domínio próprio no Worker
(Settings → Domains & Routes), ou usar uma máquina (abaixo).

### Ler fotos (📥 Aviso da gestão)

Desde nov/2026 o servidor também lê prints junto com o texto (até 4 fotos por pedido), para a
tela "📥 Aviso da gestão". Quem colou o código antes disso precisa **colar o código novo** do
`cloudflare-worker.js` no editor da Cloudflare e clicar em Deploy (as chaves e o binding continuam).
Sem isso o app avisa: "o servidor ainda não lê fotos". Texto continua funcionando igual.

## Atalho: máquina nova pelo Cloud Shell

Sem a chave `.key` da máquina antiga? No site da Oracle, abra o **Cloud Shell** (ícone `>_`
no topo) e cole:

```bash
curl -fsSL https://raw.githubusercontent.com/rafanunesran/ProfSis3/main/servidor-ia/criar-maquina-oracle.sh | bash
```

Ele cria uma chave nova dentro do Cloud Shell, abre as portas 80/443 da rede
`rede-antigravity` e cria a máquina grátis `ediprof-ia` (Ubuntu 24.04). No fim mostra o
comando para entrar e o de instalar (já com o endereço `IP.sslip.io`, sem DuckDNS).

## Passo a passo

### 0. Entrar na máquina (SSH)

No console da Oracle: **Compute → Instances →** a sua máquina → copie o **Public IP address**.
No computador (PowerShell no Windows, ou Terminal), use a chave `.key` que a Oracle baixou
quando a máquina foi criada:

```bash
ssh -i caminho/da/chave.key ubuntu@IP_PUBLICO
```

(Na imagem Oracle Linux o usuário é `opc` em vez de `ubuntu`. Pelo celular dá com o Termux:
`pkg install openssh` e o mesmo comando.)

### 1. Um nome grátis (DuckDNS)

1. Entre em [duckdns.org](https://www.duckdns.org) (login com Google/GitHub).
2. Crie um subdomínio, ex.: `sisprof-ia` → fica `sisprof-ia.duckdns.org`.
3. Em **current ip**, ponha o IP público da máquina e clique **update ip**.

Se a escola bloquear o `duckdns.org` (alguns filtros bloqueiam "DNS dinâmico"), dá para
usar o próprio IP com o `sslip.io`, sem cadastro: `IP-COM-TRAÇOS.sslip.io`
(ex.: IP `129.151.10.20` → `129-151-10-20.sslip.io`). Basta rodar a instalação de novo com esse nome.

### 2. Abrir as portas 80 e 443 na Oracle

No console da Oracle: **Networking → Virtual Cloud Networks →** (a rede da máquina)
**→ Security Lists → Default Security List → Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Se o servidor de imagem já está nessa máquina, isso já foi feito.)

### 3. Instalar

Na máquina (por SSH):

```bash
git clone --depth 1 https://github.com/rafanunesran/ProfSis3.git || (cd ProfSis3 && git pull)
cd ProfSis3/servidor-ia
sudo bash instalar.sh sisprof-ia.duckdns.org
```

Ele pede as chaves do Gemini (cole uma, Enter; Enter vazio termina; o que você cola não
aparece). No fim mostra o **endereço** e a **chave do app**.

Para pôr ou tirar chaves do Gemini depois: `sudo nano /opt/sisprof-ia/chaves-gemini.txt`
(uma por linha; vale na hora, sem reiniciar).

### 4. Teste de alcance (na escola)

No wi-fi da escola, abra no navegador: `https://sisprof-ia.duckdns.org/saude`

- Apareceu `{"ok": true, ...}` → a escola deixa passar. Siga para o passo 5.
- Não abriu, mas em casa (ou no 4G) abre → a escola bloqueia esse endereço. Tente o
  nome `sslip.io` do passo 1.

### 5. Ligar no EdiProf

**Painel Super Admin → 🔑 Chaves de IA → 🛰️ Servidor de IA próprio**: cole o endereço e
a chave do app → **🧪 Testar** (mostra se a rede chega e faz um pedido de verdade) →
**💾 Salvar**.

Depois que funcionar, você pode **excluir** as chaves do Gemini da tabela do Super Admin:
assim elas param de ir para o navegador. (Se fizer isso e o servidor cair, a IA do app
para até ele voltar.)

## Conferir e consertar

```bash
systemctl status sisprof-ia caddy             # os dois devem estar "active (running)"
journalctl -u sisprof-ia -n 50                # pedidos (só rota e código, sem o texto)
curl https://sisprof-ia.duckdns.org/saude     # {"ok": true, "chaves": N}
```

- **"chave do servidor errada":** copie de novo de `sudo cat /opt/sisprof-ia/chave.txt`.
- **"Todas as chaves do servidor falharam":** a mensagem traz o erro de cada chave (cota,
  chave inválida, modelo aposentado...). É o mesmo problema que daria direto no Gemini.
- **Testar diz que não chegou:** confira o DuckDNS (IP certo) e as portas 80/443 (passo 2).
  O Caddy só tira o certificado com a 80 aberta: `journalctl -u caddy -n 50`.
- **Atualizar o servidor:** `cd ProfSis3 && git pull && sudo bash servidor-ia/instalar.sh sisprof-ia.duckdns.org`
  (mantém a chave do app e as chaves do Gemini).
- **Outro site/endereço do app:** `sudo ORIGENS=https://site1,https://site2 bash instalar.sh ...`
