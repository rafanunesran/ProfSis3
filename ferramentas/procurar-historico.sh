#!/usr/bin/env bash
# ============================================================================
#  EXISTE ALGUM HISTÓRICO NESTE PROJETO? — os lugares que faltaram
# ----------------------------------------------------------------------------
#  PITR e backups agendados já foram verificados e não existem. Mas o Firebase
#  guarda histórico em outros lugares, e cada um tem um interruptor próprio:
#
#    1. EXPORTS antigos para Cloud Storage. Um export é um dump completo do
#       banco num bucket. `operations list` mostra todo export já executado —
#       inclusive os feitos pelo Console, que ninguém lembra de ter feito.
#    2. Extensão FIRESTORE -> BIGQUERY. Se instalada, cada gravação vira uma
#       linha com o documento inteiro e a data. É histórico de verdade, com
#       versões — exatamente o que se procura quando um dado some.
#    3. REALTIME DATABASE. Produto separado do Firestore, com dados próprios.
#    4. LOGS DE AUDITORIA. Não guardam o conteúdo dos documentos, mas dizem
#       QUEM apagou O QUÊ e QUANDO. Não recupera; comprova.
#
#  Só lê. Não cria, não apaga, não altera nada.
#      bash procurar-historico.sh
# ============================================================================
set -uo pipefail
PROJETO="${PROJETO:-profsis3}"
gcloud config set project "$PROJETO" >/dev/null 2>&1
echo "== Projeto: $PROJETO =="

echo
echo "== 1. EXPORTS já executados (o mais promissor) =="
gcloud firestore operations list --format='table(name.basename():label=ID, metadata.operationState:label=ESTADO, metadata.outputUriPrefix:label=FOI_PARA, metadata.startTime:label=QUANDO)' 2>&1 | head -30
echo
echo "-- buckets do projeto (um export fica dentro de um deles):"
gcloud storage ls 2>&1 | head -20
echo
echo "-- procurando pastas com cara de export:"
for b in $(gcloud storage ls 2>/dev/null); do
    echo "   $b"
    gcloud storage ls "$b" 2>/dev/null | head -12 | sed 's/^/      /'
done

echo
echo "== 2. Extensão Firestore -> BigQuery (histórico com versões) =="
echo "-- funções da extensão (ext-firestore-bigquery-export-*):"
gcloud functions list --format='table(name.basename():label=FUNCAO, state:label=ESTADO, updateTime:label=ATUALIZADA)' 2>&1 | head -20
echo
echo "-- conjuntos do BigQuery:"
bq ls --format=pretty 2>&1 | head -20
echo "-- tabelas em firestore_export (se existir):"
bq ls --format=pretty firestore_export 2>&1 | head -20

echo
echo "== 3. Realtime Database =="
gcloud alpha firebase database instances list 2>&1 | head -10 || echo "   (comando indisponível — veja no Console: Build > Realtime Database)"

echo
echo "== 4. Quem apagou o quê, e quando =="
echo "-- operações administrativas no Firestore nos últimos 90 dias:"
gcloud logging read \
  'protoPayload.serviceName="firestore.googleapis.com" AND severity>=NOTICE' \
  --limit=25 --freshness=90d \
  --format='table(timestamp, protoPayload.methodName, protoPayload.authenticationInfo.principalEmail)' 2>&1 | head -30
echo
echo "-- exclusões registradas em log de acesso a dados (só aparece se estiver ligado):"
gcloud logging read \
  'protoPayload.methodName=~"Delete" AND resource.type="datastore_database"' \
  --limit=15 --freshness=90d --format='table(timestamp, protoPayload.methodName)' 2>&1 | head -20

cat <<'FIM'

== COMO LER ==
1. Achou um export em "FOI_PARA" -> é um dump completo do banco naquela data.
   Importe num banco separado e extraia:
       gcloud firestore databases create --database=recuperado --location=southamerica-east1
       gcloud firestore import gs://CAMINHO/DO/EXPORT --database=recuperado
2. Achou tabela em firestore_export -> cada linha é uma versão de um documento,
   com data. Consulta de exemplo (troque o nome da tabela):
       bq query --use_legacy_sql=false \
         'SELECT timestamp, operation, document_name, data
            FROM `profsis3.firestore_export.app_data_raw_changelog`
           WHERE document_name LIKE "%uvTjPvkmZxVicK2nSPvVSxcfcdg1%"
           ORDER BY timestamp'
3. Nada em nenhum dos quatro -> o Firebase realmente não guardou histórico
   neste projeto, e o log de auditoria serve como registro do que aconteceu.
FIM
