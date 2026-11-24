#!/usr/bin/env bash
# Instala o servidor de IA de TEXTO do EdiProf numa máquina Linux (feito para a Oracle Cloud
# "Always Free" com Ubuntu 22.04 ou 24.04; serve em qualquer Ubuntu/Debian). Ver LEIAME.md.
#
# Uso:  sudo bash instalar.sh seu-nome.duckdns.org
#
# O que faz (leva 1 a 3 minutos, não compila nada):
#   1. copia o servidor.py (só Python 3, já vem no Ubuntu) para /opt/sisprof-ia;
#   2. gera a CHAVE do app e pede as chaves do Gemini (ficam SÓ nesta máquina);
#   3. deixa o servidor rodando só por dentro (127.0.0.1:7862), como serviço;
#   4. instala o Caddy na frente (HTTPS grátis, Let's Encrypt) — sem apagar o bloco do
#      servidor de imagem, se ele estiver na mesma máquina;
#   5. abre as portas 80 e 443 no firewall da própria máquina.
# Rodar de novo é seguro: a chave do app e as chaves do Gemini são mantidas.
set -euo pipefail

DOMINIO="${1:-}"
if [ -z "$DOMINIO" ]; then echo "Uso: sudo bash instalar.sh seu-nome.duckdns.org"; exit 1; fi
if [ "$(id -u)" != "0" ]; then echo "Rode com sudo."; exit 1; fi

ORIGENS="${ORIGENS:-https://ediprof.vercel.app,https://rafanunesran.github.io}"
PASTA=/opt/sisprof-ia
AQUI="$(cd "$(dirname "$0")" && pwd)"

echo "== 1/5 Pacotes"
apt-get update -y
apt-get install -y python3 curl ca-certificates openssl debian-keyring debian-archive-keyring apt-transport-https gnupg

echo "== 2/5 Arquivos e chaves"
id sisprof >/dev/null 2>&1 || useradd --system --home /opt/sisprof --shell /usr/sbin/nologin sisprof
mkdir -p "$PASTA"
install -m 644 "$AQUI/servidor.py" "$PASTA/servidor.py"
if [ ! -s "$PASTA/chave.txt" ]; then openssl rand -hex 20 > "$PASTA/chave.txt"; fi
CHAVE="$(cat "$PASTA/chave.txt")"
touch "$PASTA/chaves-gemini.txt"
# Chaves do Gemini: por variável (GEMINI_KEYS="chave1,chave2") ou digitadas agora.
if [ -n "${GEMINI_KEYS:-}" ]; then
    echo "$GEMINI_KEYS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' >> "$PASTA/chaves-gemini.txt"
elif ! grep -qv '^\s*\(#.*\)\?$' "$PASTA/chaves-gemini.txt" && [ -t 0 ]; then
    echo "Cole as chaves do Gemini (começam com AIza), uma por vez, e Enter."
    echo "(o que você digitar não aparece na tela). Enter vazio termina."
    while true; do
        read -r -s -p "Chave do Gemini: " K; echo
        [ -z "$K" ] && break
        echo "$K" >> "$PASTA/chaves-gemini.txt"
    done
fi
# Tira linhas repetidas mantendo a ordem.
awk '!visto[$0]++' "$PASTA/chaves-gemini.txt" > "$PASTA/chaves-gemini.tmp" && mv "$PASTA/chaves-gemini.tmp" "$PASTA/chaves-gemini.txt"
chown -R sisprof:sisprof "$PASTA"
chmod 700 "$PASTA"; chmod 600 "$PASTA/chave.txt" "$PASTA/chaves-gemini.txt"
NCHAVES=$(grep -cv '^\s*\(#.*\)\?$' "$PASTA/chaves-gemini.txt" || true)

echo "== 3/5 Serviço sisprof-ia"
cat > /etc/systemd/system/sisprof-ia.service <<UNIT
[Unit]
Description=EdiProf - servidor de IA de texto (repassa ao Gemini)
After=network-online.target
Wants=network-online.target

[Service]
User=sisprof
WorkingDirectory=$PASTA
Environment=SISPROF_IA_PASTA=$PASTA
Environment=SISPROF_IA_ORIGENS=$ORIGENS
ExecStart=/usr/bin/python3 $PASTA/servidor.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=$PASTA
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable sisprof-ia >/dev/null 2>&1
systemctl restart sisprof-ia

echo "== 4/5 HTTPS (Caddy)"
if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
fi
BLOCO="$(cat <<CADDY
# >>> sisprof-ia (gerado por servidor-ia/instalar.sh)
$DOMINIO {
	request_body {
		max_size 3MB
	}
	reverse_proxy 127.0.0.1:7862 {
		transport http {
			read_timeout 120s
		}
	}
}
# <<< sisprof-ia
CADDY
)"
# Troca só o nosso bloco; o resto do Caddyfile (ex.: servidor de imagem) fica.
CF=/etc/caddy/Caddyfile
touch "$CF"
# O Caddyfile que vem com o pacote (":80 { root * /usr/share/caddy ... }") ocupa a porta 80
# de um jeito que atrapalha o certificado; se for só ele, começa do zero.
if grep -q '^:80' "$CF" && ! grep -q '>>> sisprof' "$CF"; then : > "$CF"; fi
awk '/^# >>> sisprof-ia/{pular=1} !pular{print} /^# <<< sisprof-ia/{pular=0}' "$CF" > "$CF.novo"
printf '%s\n' "$BLOCO" >> "$CF.novo"
mv "$CF.novo" "$CF"
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

echo "== 5/5 Firewall"
# A imagem Ubuntu da Oracle vem com o iptables fechando tudo menos a 22.
if command -v iptables >/dev/null; then
    for P in 80 443; do
        iptables -C INPUT -p tcp --dport $P -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $P -j ACCEPT
    done
    if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi
fi

sleep 2
echo
echo "================================================================"
if curl -fsS --max-time 5 http://127.0.0.1:7862/saude >/dev/null; then
    echo " Servidor rodando. Chaves do Gemini nesta máquina: $NCHAVES"
else
    echo " ATENÇÃO: o servidor não respondeu. Veja: journalctl -u sisprof-ia -n 30"
fi
[ "$NCHAVES" = "0" ] && echo " Falta pôr as chaves do Gemini: sudo nano $PASTA/chaves-gemini.txt"
echo
echo " 1) TESTE DE ALCANCE: na rede da escola, abra no navegador"
echo "      https://$DOMINIO/saude"
echo "    Se aparecer {\"ok\": true ...}, a escola deixa passar."
echo " 2) No EdiProf: Painel Super Admin → 🔑 Chaves de IA →"
echo "    🛰️ Servidor de IA próprio:"
echo "      Endereço: https://$DOMINIO"
echo "      Chave:    $CHAVE"
echo " (a chave do app também fica em $PASTA/chave.txt)"
echo " Lembrete: libere as portas 80 e 443 também na Oracle (Security List)."
echo "================================================================"
