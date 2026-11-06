# Servidor de imagens do SisProf (Ateliê → desenhos com IA)

Esta pasta **não vai para o site** (o `deploy.yml` copia uma lista fixa de arquivos).
É a receita para rodar, **de graça**, uma IA que desenha numa máquina sua — pensada
para a máquina da **Oracle Cloud (Always Free)**, mas serve em qualquer Ubuntu.

## Como fica

```
Ateliê (navegador)  ──HTTPS + chave──▶  Caddy (porta 443)  ──▶  sd-server (127.0.0.1:7861)
                                         └ só aceita o site do SisProf             └ SD-Turbo, no processador
```

- **IA:** [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) com o
  modelo **SD-Turbo** (Stability AI). Roda só no processador, sem placa de vídeo.
  Licença: Stability AI Community License (grátis para escola e para quem fatura
  menos de US$ 1 milhão/ano).
- **HTTPS:** o site do SisProf é `https`, e o navegador não deixa ele chamar um servidor
  `http`. O Caddy tira o certificado sozinho (Let's Encrypt), de graça. Para isso
  precisa de um nome: um subdomínio grátis do **DuckDNS** serve.
- **Proteção:** pede uma chave (gerada na instalação), só aceita pedidos vindos de
  `https://rafanunesran.github.io` e só deixa passar a rota de gerar imagem. A chave
  fica visível para quem abre o site (vai no pedido do navegador), como no servidor de
  vídeo: a proteção real é a origem + a máquina fazer uma imagem por vez.
- **Tempo:** depende da máquina. Ampere com 4 núcleos: algo como 10 a 30 s por imagem
  (512×512). Máquina com 1 núcleo: pode passar de 1 minuto. O Ateliê espera até
  3 minutos; se o servidor não responder, cai no Gemini e depois no desenho em linhas.

## Passo a passo

### 1. Um nome grátis (DuckDNS)

1. Entre em [duckdns.org](https://www.duckdns.org) (login com Google/GitHub).
2. Crie um subdomínio, ex.: `sisprof-img` → fica `sisprof-img.duckdns.org`.
3. Em **current ip**, ponha o **IP público** da máquina da Oracle e clique **update ip**.

### 2. Abrir as portas 80 e 443 na Oracle

No console da Oracle: **Networking → Virtual Cloud Networks →** (a rede da máquina)
**→ Security Lists → Default Security List → Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(O firewall de dentro da máquina o script já abre.)

### 3. Instalar

Entre na máquina por SSH e rode:

```bash
git clone --depth 1 https://github.com/rafanunesran/ProfSis3.git
cd ProfSis3/servidor-imagem
sudo bash instalar.sh sisprof-img.duckdns.org
```

Leva de 15 a 40 minutos (compila o programa e baixa o modelo, ~5 GB, que vira ~2 GB).
No fim aparecem o **endereço** e a **chave**. A chave também fica em
`/opt/sisprof-imagem/chave.txt`.

Se o download do modelo pedir login no Hugging Face: crie uma conta grátis, aceite a
licença em <https://huggingface.co/stabilityai/sd-turbo>, gere um token em
*Settings → Access Tokens* e rode `sudo HF_TOKEN=hf_xxx bash instalar.sh sisprof-img.duckdns.org`.

### 4. Ligar no SisProf

**Painel Super Admin → 🔑 Chaves de IA → 🖥️ Servidor de imagem próprio**: cole o
endereço (`https://sisprof-img.duckdns.org`) e a chave → **Testar** (gera uma imagem de
teste e mostra o tempo) → **Salvar**.

A partir daí o Ateliê tenta, nesta ordem: **seu servidor → Gemini/OpenAI (se a chave
tiver acesso a imagem) → desenho em linhas pela IA de texto**.

## Conferir e consertar

```bash
systemctl status sisprof-imagem caddy        # os dois devem estar "active (running)"
journalctl -u sisprof-imagem -n 50           # o que a IA está fazendo
curl https://sisprof-img.duckdns.org/saude   # deve responder "ok"
```

- **Testar diz "não conectou":** veja se o DuckDNS aponta para o IP certo e se as portas
  80/443 estão abertas na Oracle (passo 2). O Caddy só consegue o certificado com a 80 aberta.
- **"chave errada":** copie de novo de `/opt/sisprof-imagem/chave.txt`.
- **IP da máquina mudou:** atualize no DuckDNS.
- **Atualizar a IA:** `sudo VERSAO_SDCPP=<tag nova> bash instalar.sh sisprof-img.duckdns.org`
  depois de apagar `/opt/sisprof-imagem/sdcpp`.
