#!/usr/bin/env bash
# Instala o servidor de imagens do SisProf (Ateliê → desenhos com IA) numa máquina Linux
# (feito para a Oracle Cloud "Always Free", Ampere A1 / ARM, com Ubuntu 22.04 ou 24.04;
# também serve em máquina x86). Ver LEIAME.md.
#
# Uso:  sudo bash instalar.sh seu-nome.duckdns.org
#
# O que faz:
#   1. compila o stable-diffusion.cpp (só processador, sem placa de vídeo);
#   2. baixa o modelo SD-Turbo e converte para q8_0 (menor e mais rápido);
#   3. deixa o sd-server rodando só por dentro (127.0.0.1:7861), como serviço;
#   4. instala o Caddy na frente: HTTPS grátis (Let's Encrypt), exige a CHAVE,
#      só aceita pedidos do site do SisProf e só deixa passar a rota de gerar imagem;
#   5. abre as portas 80 e 443 no firewall da própria máquina.
# Rodar de novo é seguro: o que já existe é aproveitado (e a chave é mantida).
set -euo pipefail

DOMINIO="${1:-}"
if [ -z "$DOMINIO" ]; then echo "Uso: sudo bash instalar.sh seu-nome.duckdns.org"; exit 1; fi
if [ "$(id -u)" != "0" ]; then echo "Rode com sudo."; exit 1; fi

VERSAO_SDCPP="${VERSAO_SDCPP:-master-1052-f5df5f8}"
ORIGEM_SITE="${ORIGEM_SITE:-https://rafanunesran.github.io}"
PASTA=/opt/sisprof-imagem
MODELO_URL="${MODELO_URL:-https://huggingface.co/stabilityai/sd-turbo/resolve/main/sd_turbo.safetensors}"
NUCLEOS="$(nproc)"

mkdir -p "$PASTA/modelos"
if [ -f "$PASTA/chave.txt" ]; then CHAVE="$(cat "$PASTA/chave.txt")"; else CHAVE="$(openssl rand -hex 20)"; echo "$CHAVE" > "$PASTA/chave.txt"; chmod 600 "$PASTA/chave.txt"; fi

echo "== 1/5 Pacotes"
apt-get update -y
apt-get install -y git cmake build-essential curl ca-certificates openssl debian-keyring debian-archive-keyring apt-transport-https gnupg

# Máquina pequena (ex.: 1 núcleo / 1 a 6 GB): cria 4 GB de swap para a compilação e o modelo caberem.
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 6000 ] && [ ! -f /swapfile-sisprof ]; then
    echo "== Pouca memória (${MEM_MB} MB): criando swap de 4 GB"
    fallocate -l 4G /swapfile-sisprof && chmod 600 /swapfile-sisprof && mkswap /swapfile-sisprof && swapon /swapfile-sisprof
    grep -q swapfile-sisprof /etc/fstab || echo "/swapfile-sisprof none swap sw 0 0" >> /etc/fstab
fi
# Compilar com núcleos demais em máquina com pouca memória trava; limita a 1 por 2 GB.
JOBS=$(( MEM_MB / 2000 )); [ "$JOBS" -lt 1 ] && JOBS=1; [ "$JOBS" -gt "$NUCLEOS" ] && JOBS=$NUCLEOS

echo "== 2/5 Compilando o stable-diffusion.cpp ($VERSAO_SDCPP) — leva uns 10 a 20 minutos"
if [ ! -d "$PASTA/sdcpp" ]; then
    git clone --depth 1 --branch "$VERSAO_SDCPP" --recursive --shallow-submodules https://github.com/leejet/stable-diffusion.cpp "$PASTA/sdcpp"
fi
cd "$PASTA/sdcpp"
cmake -B build -DCMAKE_BUILD_TYPE=Release -DSD_SERVER_BUILD_FRONTEND=OFF
cmake --build build -j"$JOBS" --config Release
BIN="$PASTA/sdcpp/build/bin"
test -x "$BIN/sd-server" && test -x "$BIN/sd-cli"

echo "== 3/5 Modelo SD-Turbo"
cd "$PASTA/modelos"
if [ ! -f sd_turbo.q8_0.gguf ]; then
    if [ ! -f sd_turbo.safetensors ]; then
        if [ -n "${HF_TOKEN:-}" ]; then
            curl -fL --retry 3 -H "Authorization: Bearer $HF_TOKEN" -o sd_turbo.safetensors.part "$MODELO_URL"
        else
            curl -fL --retry 3 -o sd_turbo.safetensors.part "$MODELO_URL" || {
                echo "Não consegui baixar o modelo. Se o Hugging Face pediu login: crie uma conta grátis,"
                echo "aceite a licença em https://huggingface.co/stabilityai/sd-turbo , gere um token (Settings → Access Tokens)"
                echo "e rode de novo assim:  sudo HF_TOKEN=hf_xxx bash instalar.sh $DOMINIO"; exit 1; }
        fi
        mv sd_turbo.safetensors.part sd_turbo.safetensors
    fi
    "$BIN/sd-cli" -M convert -m sd_turbo.safetensors -o sd_turbo.q8_0.gguf --type q8_0
    rm -f sd_turbo.safetensors
fi

echo "== 4/5 Serviço sisprof-imagem"
id sisprof >/dev/null 2>&1 || useradd --system --home "$PASTA" --shell /usr/sbin/nologin sisprof
chown -R sisprof:sisprof "$PASTA/modelos"
cat > /etc/systemd/system/sisprof-imagem.service <<UNIT
[Unit]
Description=SisProf - servidor de imagens (stable-diffusion.cpp)
After=network.target

[Service]
User=sisprof
WorkingDirectory=$PASTA
ExecStart=$BIN/sd-server -m $PASTA/modelos/sd_turbo.q8_0.gguf -t $NUCLEOS --listen-ip 127.0.0.1 --listen-port 7861
Restart=always
RestartSec=5
Nice=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now sisprof-imagem
systemctl restart sisprof-imagem

echo "== 5/5 HTTPS (Caddy) e firewall"
if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<CADDY
$DOMINIO {
	header {
		Access-Control-Allow-Origin "$ORIGEM_SITE"
		Access-Control-Allow-Methods "GET, POST, OPTIONS"
		Access-Control-Allow-Headers "Content-Type, Authorization"
		Access-Control-Max-Age "86400"
		Vary "Origin"
	}
	@preflight method OPTIONS
	respond @preflight 204

	@saude path /saude
	respond @saude "ok" 200

	@semchave not header Authorization "Bearer $CHAVE"
	respond @semchave "chave errada" 401

	@gerar {
		method POST
		path /v1/images/generations
	}
	handle @gerar {
		request_body {
			max_size 64KB
		}
		reverse_proxy 127.0.0.1:7861 {
			transport http {
				read_timeout 300s
			}
		}
	}
	handle {
		respond "não encontrado" 404
	}
}
CADDY
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

# A imagem Ubuntu da Oracle vem com o iptables fechando tudo menos a 22.
if command -v iptables >/dev/null; then
    for P in 80 443; do
        iptables -C INPUT -p tcp --dport $P -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $P -j ACCEPT
    done
    if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi
fi

echo
echo "================================================================"
echo " Pronto. No SisProf: Painel Super Admin → 🔑 Chaves de IA →"
echo " 🖥️ Servidor de imagem próprio:"
echo "   Endereço: https://$DOMINIO"
echo "   Chave:    $CHAVE"
echo " (a chave também fica em $PASTA/chave.txt)"
echo " Lembrete: libere as portas 80 e 443 também na Oracle (Security List)."
echo "================================================================"
