#!/usr/bin/env bash
# ============================================================================
#  RECUPERAR O BANCO DE UMA DATA ANTERIOR (PITR do Firestore)
# ----------------------------------------------------------------------------
#  É o único caminho para o que sumiu DO BANCO: documento apagado ou reescrito
#  não volta pelo aplicativo.
#
#  ONDE RODAR (sem instalar nada)
#    console.cloud.google.com > ícone do terminal no topo ("Ativar Cloud Shell").
#    O gcloud já vem pronto e logado. Cole este arquivo lá e rode:
#        bash recuperar-pitr.sh
#
#  O QUE ELE FAZ
#    1. Diz se há o que recuperar (PITR ligado? até que data?).
#    2. Exporta o retrato do banco no instante que você escolher.
#    3. Importa esse retrato num banco SEPARADO, chamado "recuperado".
#    O banco de produção NÃO é tocado em momento nenhum. Nada é sobrescrito.
#
#  PRAZO
#    A janela do PITR é de 7 dias e anda sozinha. Cada dia que passa leva junto
#    um dia do que dá para recuperar.
# ============================================================================
set -euo pipefail

PROJETO="${PROJETO:-}"
BANCO_ORIGEM="${BANCO_ORIGEM:-(default)}"
BANCO_DESTINO="${BANCO_DESTINO:-recuperado}"
INSTANTE="${INSTANTE:-}"          # ex.: 2026-09-06T12:00:00Z
BUCKET="${BUCKET:-}"

titulo() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
erro()   { printf '\033[31m%s\033[0m\n' "$1" >&2; }

titulo "1. Projeto"
if [ -z "$PROJETO" ]; then PROJETO="$(gcloud config get-value project 2>/dev/null || true)"; fi
if [ -z "$PROJETO" ] || [ "$PROJETO" = "(unset)" ]; then
    erro "Não sei o projeto. Rode:  PROJETO=seu-projeto bash $0"
    exit 1
fi
gcloud config set project "$PROJETO" >/dev/null
echo "Projeto: $PROJETO"

titulo "2. Há o que recuperar?"
# earliestVersionTime é o limite: antes disso o Firestore não tem mais as versões.
# Com PITR desligado ele fica em ~1 hora atrás; ligado, em 7 dias atrás.
DESCR="$(gcloud firestore databases describe --database="$BANCO_ORIGEM" --format=json)"
PITR="$(echo "$DESCR" | grep -o '"pointInTimeRecoveryEnablement": *"[^"]*"' | sed 's/.*: *"//;s/"//' || true)"
EARLIEST="$(echo "$DESCR" | grep -o '"earliestVersionTime": *"[^"]*"' | sed 's/.*: *"//;s/"//' || true)"
echo "PITR: ${PITR:-desconhecido}"
echo "Consigo voltar até: ${EARLIEST:-desconhecido}"

if [ "${PITR:-}" != "POINT_IN_TIME_RECOVERY_ENABLED" ]; then
    erro ""
    erro "O PITR NÃO está ligado neste banco."
    erro "Sem ele o Firestore guarda cerca de 1 hora de versões — não dá para voltar a"
    erro "uma data anterior. Este caminho está fechado; ligar agora não é retroativo."
    erro ""
    erro "Antes de desistir, procure BACKUPS AGENDADOS, que são outro mecanismo:"
    echo ""
    echo "    gcloud firestore backups list --location=SUA_REGIAO"
    echo ""
    erro "Havendo backup na lista, restaure-o num banco separado:"
    echo ""
    echo "    gcloud firestore databases restore \\"
    echo "        --source-backup=projects/$PROJETO/locations/REGIAO/backups/ID_DO_BACKUP \\"
    echo "        --destination-database=$BANCO_DESTINO"
    echo ""
    erro "E, para o futuro, ligue os dois (não recupera o passado, protege o que vem):"
    echo ""
    echo "    gcloud firestore databases update --database='$BANCO_ORIGEM' --enable-pitr"
    echo "    gcloud firestore backups schedules create --database='$BANCO_ORIGEM' \\"
    echo "        --recurrence=daily --retention=7d"
    exit 2
fi

titulo "3. Instante a recuperar"
if [ -z "$INSTANTE" ]; then
    erro "Escolha o instante ANTERIOR à perda e rode de novo, por exemplo:"
    echo ""
    echo "    INSTANTE=2026-09-06T12:00:00Z bash $0"
    echo ""
    echo "Precisa ser minuto cheio, em UTC (São Paulo = UTC-3: 09:00 daqui = 12:00Z),"
    echo "e não pode ser anterior a ${EARLIEST:-o limite acima}."
    exit 1
fi
echo "Instante: $INSTANTE"

titulo "4. Bucket para o retrato"
if [ -z "$BUCKET" ]; then
    BUCKET="gs://${PROJETO}-recuperacao-firestore"
    echo "Usando $BUCKET"
    if ! gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
        echo "Criando o bucket..."
        gcloud storage buckets create "$BUCKET" --location=us-central1
    fi
fi

PASTA="$BUCKET/pitr-$(echo "$INSTANTE" | tr -d ':-' )"

titulo "5. Exportando o retrato (leva alguns minutos)"
echo "De: $BANCO_ORIGEM  |  Em: $INSTANTE  |  Para: $PASTA"
gcloud firestore export "$PASTA" \
    --database="$BANCO_ORIGEM" \
    --snapshot-time="$INSTANTE" \
    --collection-ids=app_data,shared_attendance,system,espacos,access

titulo "6. Importando num banco SEPARADO"
if ! gcloud firestore databases describe --database="$BANCO_DESTINO" >/dev/null 2>&1; then
    REGIAO="$(echo "$DESCR" | grep -o '"locationId": *"[^"]*"' | sed 's/.*: *"//;s/"//' || echo us-central1)"
    echo "Criando o banco '$BANCO_DESTINO' em $REGIAO..."
    gcloud firestore databases create --database="$BANCO_DESTINO" --location="$REGIAO"
fi
# O import pede o caminho do metadado gerado pelo export.
METADADO="$(gcloud storage ls "$PASTA/**.overall_export_metadata" | head -1)"
echo "Importando $METADADO"
gcloud firestore import "$METADADO" --database="$BANCO_DESTINO"

titulo "Pronto"
cat <<FIM
O banco "$BANCO_DESTINO" tem agora o retrato de $INSTANTE.
A produção continua intacta.

Próximo passo — transformar isso em arquivos que o sistema importa:

    npm install firebase-admin
    BANCO=$BANCO_DESTINO PROJETO=$PROJETO node extrair-profsis.js

Ele grava um .profsis por professor em ./recuperados/. Cada um entra pelo botão
"Importar dados do arquivo" — e, se preferir juntar em vez de substituir, pela
Central de Resgate.
FIM
