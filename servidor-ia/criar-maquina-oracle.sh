#!/usr/bin/env bash
# Cria, pelo Cloud Shell da Oracle, uma máquina grátis para o servidor de IA do EdiProf.
# Rodar NO CLOUD SHELL (o terminal que abre dentro do site da Oracle), não na máquina:
#
#   curl -fsSL https://raw.githubusercontent.com/rafanunesran/ProfSis3/main/servidor-ia/criar-maquina-oracle.sh | bash
#
# O que faz:
#   1. cria uma chave SSH nova dentro do Cloud Shell (~/.ssh/ediprof) - nada para baixar;
#   2. abre as portas 80 e 443 na Security List da rede (guarda uma cópia das regras antes);
#   3. cria a máquina "ediprof-ia" (Ubuntu 24.04): tenta a VM.Standard.E2.1.Micro e, se não
#      houver vaga, a VM.Standard.A1.Flex com 1 OCPU e 6 GB (as duas são Always Free);
#   4. mostra o IP e o comando para entrar.
# Variáveis opcionais: REDE (nome da rede, padrão rede-antigravity), NOME (padrão ediprof-ia).
set -uo pipefail

REDE="${REDE:-rede-antigravity}"
NOME="${NOME:-ediprof-ia}"
C="${OCI_TENANCY:-}"
falha() { echo; echo "❌ $*"; exit 1; }
[ -n "$C" ] || falha "Rode isto no Cloud Shell da Oracle (não achei a variável OCI_TENANCY)."
command -v oci >/dev/null || falha "Comando oci não encontrado. Rode no Cloud Shell da Oracle."

echo "== 1/4 Chave SSH"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# O Cloud Shell roda em modo FIPS, que não aceita chave ed25519: usa RSA 4096.
[ -f ~/.ssh/ediprof ] && [ -f ~/.ssh/ediprof.pub ] || { rm -f ~/.ssh/ediprof ~/.ssh/ediprof.pub; ssh-keygen -t rsa -b 4096 -N "" -q -f ~/.ssh/ediprof -C ediprof-ia; }
[ -s ~/.ssh/ediprof.pub ] || falha "Não consegui criar a chave SSH."
echo "   chave em ~/.ssh/ediprof (fica só no seu Cloud Shell)"

echo "== 2/4 Rede $REDE"
AD=$(oci iam availability-domain list -c "$C" --query 'data[0].name' --raw-output) || falha "Não consegui listar as zonas."
VCN=$(oci network vcn list -c "$C" --display-name "$REDE" --query 'data[0].id' --raw-output)
[ -n "$VCN" ] && [ "$VCN" != "null" ] || falha "Não achei a rede $REDE. Rode de novo com REDE=nome-da-rede antes do comando."
SUB=$(oci network subnet list -c "$C" --vcn-id "$VCN" --query 'data[?"prohibit-public-ip-on-vnic"==`false`] | [0].id' --raw-output)
[ -n "$SUB" ] && [ "$SUB" != "null" ] || falha "A rede $REDE não tem subnet pública."
SL=$(oci network subnet get --subnet-id "$SUB" --query 'data."security-list-ids"[0]' --raw-output)
oci network security-list get --security-list-id "$SL" --query 'data."ingress-security-rules"' > ~/regras-antes.json || falha "Não consegui ler as regras da rede."
python3 - "$HOME/regras-antes.json" "$HOME/regras-novas.json" <<'PY'
import json, re, sys
regras = json.load(open(sys.argv[1]))
# A saída do oci vem em kebab-case; a entrada do update espera camelCase.
def camel(o):
    if isinstance(o, dict):
        return {re.sub(r'-([a-z])', lambda m: m.group(1).upper(), k): camel(v) for k, v in o.items() if v is not None}
    if isinstance(o, list):
        return [camel(x) for x in o]
    return o
regras = camel(regras)
def aberta(p):
    for r in regras:
        if r.get('source') != '0.0.0.0/0' or r.get('protocol') not in ('6', 'all'):
            continue
        if r.get('protocol') == 'all':
            return True
        f = ((r.get('tcpOptions') or {}).get('destinationPortRange'))
        if f is None or f['min'] <= p <= f['max']:
            return True
    return False
faltam = [p for p in (80, 443) if not aberta(p)]
for p in faltam:
    regras.append({'source': '0.0.0.0/0', 'sourceType': 'CIDR_BLOCK', 'protocol': '6', 'isStateless': False,
                   'tcpOptions': {'destinationPortRange': {'min': p, 'max': p}}, 'description': 'EdiProf IA'})
json.dump(regras, open(sys.argv[2], 'w'))
print('FALTAM' if faltam else 'OK', *faltam)
PY
if grep -q . ~/regras-novas.json && python3 -c "import json,sys; sys.exit(0 if len(json.load(open('$HOME/regras-novas.json'))) > len(json.load(open('$HOME/regras-antes.json'))) else 1)"; then
    oci network security-list update --security-list-id "$SL" --ingress-security-rules "file://$HOME/regras-novas.json" --force >/dev/null \
        && echo "   portas 80 e 443 abertas (cópia das regras antigas em ~/regras-antes.json)" \
        || echo "   ⚠️ não consegui abrir as portas; abra pelo site (Security List → Add Ingress Rules)"
else
    echo "   portas 80 e 443 já estavam abertas"
fi

echo "== 3/4 Criando a máquina $NOME (leva 1 a 3 minutos)"
ID=$(oci compute instance list -c "$C" --display-name "$NOME" --lifecycle-state RUNNING --query 'data[0].id' --raw-output 2>/dev/null)
if [ -n "$ID" ] && [ "$ID" != "null" ]; then
    echo "   já existe uma $NOME ligada; usando ela"
else
    ID=""
    for FORMA in VM.Standard.E2.1.Micro VM.Standard.A1.Flex; do
        IMG=$(oci compute image list -c "$C" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "$FORMA" \
              --sort-by TIMECREATED --sort-order DESC --query 'data[?!contains("display-name", `Minimal`)] | [0].id' --raw-output 2>/dev/null)
        [ -n "$IMG" ] && [ "$IMG" != "null" ] || { echo "   sem imagem Ubuntu 24.04 para $FORMA"; continue; }
        EXTRA=()
        [ "$FORMA" = "VM.Standard.A1.Flex" ] && EXTRA=(--shape-config '{"ocpus":1,"memoryInGBs":6}')
        echo "   tentando $FORMA..."
        if ID=$(oci compute instance launch -c "$C" --availability-domain "$AD" --shape "$FORMA" "${EXTRA[@]}" \
                --image-id "$IMG" --subnet-id "$SUB" --assign-public-ip true --display-name "$NOME" \
                --ssh-authorized-keys-file ~/.ssh/ediprof.pub --wait-for-state RUNNING \
                --query 'data.id' --raw-output 2>~/erro-criar.txt); then
            ID=$(echo "$ID" | grep -o 'ocid1\.instance[^" ]*' | head -1)
            [ -n "$ID" ] && break
        fi
        MSG=$(grep -o '"message": "[^"]*' ~/erro-criar.txt | head -1 | cut -d'"' -f4)
        [ -n "$MSG" ] || MSG=$(grep -v '^\s*$' ~/erro-criar.txt | tail -2 | tr '\n' ' ')
        echo "   não deu: $MSG"
        ID=""
    done
    [ -n "$ID" ] || falha "Não consegui criar a máquina (detalhes em ~/erro-criar.txt). Mande um print para o Claude."
fi

echo "== 4/4 IP"
IP=""
for i in $(seq 1 20); do
    IP=$(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output 2>/dev/null)
    [ -n "$IP" ] && [ "$IP" != "null" ] && break
    sleep 5
done
[ -n "$IP" ] && [ "$IP" != "null" ] || falha "A máquina foi criada, mas não achei o IP público. Veja em Compute → Instances."
echo "$IP" > ~/ediprof-ip.txt
NOMEHTTPS="$(echo "$IP" | tr . -).sslip.io"

echo
echo "================================================================"
echo " Máquina pronta. IP: $IP"
echo " Espere 1 minuto (ela ainda está ligando) e entre com:"
echo
echo "   ssh -i ~/.ssh/ediprof -o StrictHostKeyChecking=accept-new ubuntu@$IP"
echo
echo " Já dentro dela, instale com:"
echo
echo "   git clone --depth 1 https://github.com/rafanunesran/ProfSis3.git && cd ProfSis3/servidor-ia && sudo bash instalar.sh $NOMEHTTPS"
echo "================================================================"
