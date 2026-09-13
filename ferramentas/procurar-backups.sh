#!/usr/bin/env bash
# ============================================================================
#  EXISTE BACKUP ANTIGO DO FIRESTORE NESTE PROJETO?
# ----------------------------------------------------------------------------
#  Esta é a última pergunta que o banco ainda não respondeu. O PITR está
#  desligado (já verificado), mas BACKUP AGENDADO é outro mecanismo, com outro
#  interruptor: se alguém o ligou algum dia, há cópias diárias guardadas por 7
#  dias e semanais por até 14 semanas — e uma semanal alcançaria JULHO.
#
#  Um backup antigo é a única coisa que traz de volta a camada pessoal que a
#  transição tirou do documento app_data_<uid> na nuvem.
#
#  ATENÇÃO ao que este script NÃO faz: ele não cria backup. Criar um backup
#  agora copiaria o estado de HOJE, que é justamente o estado sem os dados.
#  Backup guarda o presente; só restauração traz o passado.
#
#  ONDE RODAR: Cloud Shell (console.cloud.google.com, ícone de terminal).
#      bash procurar-backups.sh
# ============================================================================
set -uo pipefail

PROJETO="${PROJETO:-profsis3}"
REGIAO="${REGIAO:-southamerica-east1}"
DESTINO="${DESTINO:-recuperado}"

echo "== Projeto: $PROJETO | Região: $REGIAO =="
gcloud config set project "$PROJETO" >/dev/null 2>&1

echo
echo "== 1. Backups agendados guardados =="
SAIDA="$(gcloud firestore backups list --location="$REGIAO" --format='table(name.basename():label=ID, database.basename():label=BANCO, snapshotTime:label=RETRATO_DE, expireTime:label=EXPIRA, state:label=ESTADO)' 2>&1)"
echo "$SAIDA"

if echo "$SAIDA" | grep -qi "Listed 0 items\|^$"; then
    echo
    echo "Nenhum backup nesta região. Antes de desistir, as outras regiões:"
    for r in southamerica-east1 us-central1 nam5 eur3 southamerica-west1; do
        [ "$r" = "$REGIAO" ] && continue
        n="$(gcloud firestore backups list --location="$r" --format='value(name)' 2>/dev/null | wc -l)"
        echo "   $r: $n backup(s)"
    done
fi

echo
echo "== 2. Agendamentos configurados (dizem se algum dia houve backup) =="
gcloud firestore backups schedules list --database='(default)' 2>&1 | head -20

cat <<FIM

== 3. Se a lista do item 1 mostrou algum backup ==

Restaure num banco SEPARADO (a produção não é tocada), usando o ID da coluna ID:

    gcloud firestore databases restore \\
        --source-backup=projects/$PROJETO/locations/$REGIAO/backups/COLE_O_ID_AQUI \\
        --destination-database=$DESTINO

Depois, extraia um .profsis por professor:

    curl -sO https://raw.githubusercontent.com/rafanunesran/ProfSis3/main/ferramentas/extrair-profsis.js
    npm install firebase-admin
    BANCO=$DESTINO node extrair-profsis.js

== 4. Para nunca mais depender de sorte ==

    gcloud firestore databases update --database='(default)' --enable-pitr
    gcloud firestore backups schedules create --database='(default)' \\
        --recurrence=daily --retention=7d

Isto NÃO recupera o passado. Protege daqui para a frente.
FIM
