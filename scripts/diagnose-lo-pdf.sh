#!/usr/bin/env sh
# Dijagnostika LibreOffice DOCX→PDF konverzije na Document Worker servisu.
#
# NAPOMENA: od uvođenja Document Engine-a (BullMQ `document-generation` red +
# zaseban document-worker/ servis), LibreOffice VIŠE NIJE instaliran u
# backend kontejneru — backend samo enqueue-uje poslove i čita rezultate sa
# dijeljenog uploads volume-a. Ovaj skript zato cilja "document-worker"
# servis, ne "backend".
#
# Upotreba: ./scripts/diagnose-lo-pdf.sh [compose-file]
set -eu

COMPOSE_FILE="${1:--f docker-compose.prod.yml}"
SERVICE=document-worker

echo "==> UID/GID korisnika app u document-worker kontejneru"
docker compose $COMPOSE_FILE run --rm "$SERVICE" id

echo ""
echo "==> Health endpoint (interni, 127.0.0.1:8080/health unutar kontejnera)"
docker compose $COMPOSE_FILE exec "$SERVICE" sh -c \
  "node -e \"require('http').get('http://127.0.0.1:8080/health', r => { let b=''; r.on('data',d=>b+=d); r.on('end',()=>{console.log('status:', r.statusCode, b)}); })\""

echo ""
echo "==> Upload root i DOCX fajlovi (prvih 10)"
docker compose $COMPOSE_FILE exec "$SERVICE" sh -c '
  echo "UPLOAD_DIR=${UPLOAD_DIR:-/app/uploads}"
  ls -la "${UPLOAD_DIR:-/app/uploads}" 2>/dev/null || echo "upload root nedostupan"
  find "${UPLOAD_DIR:-/app/uploads}/prenosnice" -name "*.docx" 2>/dev/null | head -10
'

DOCX_PATH="$(docker compose $COMPOSE_FILE exec -T "$SERVICE" sh -c \
  'find "${UPLOAD_DIR:-/app/uploads}/prenosnice" -name "*.docx" 2>/dev/null | head -1')"

if [ -z "$DOCX_PATH" ]; then
  echo ""
  echo "Nema .docx u prenosnice/ — prvo otvorite prenosnicu u aplikaciji ili provjerite mount /app/uploads."
  exit 1
fi

echo ""
echo "==> Ručni test konverzije (van BullMQ reda, direktno soffice): $DOCX_PATH"
echo "    (Ovo NE testira sam Document Engine tok — za to koristite stvarno"
echo "     generisanje prenosnice u aplikaciji i pratite worker logove niže.)"
docker compose $COMPOSE_FILE exec "$SERVICE" sh -c "
  ls -la '$DOCX_PATH'
  soffice --headless -env:UserInstallation=file:///tmp/lo-diagnose \\
    --norestore --convert-to pdf --outdir /tmp '$DOCX_PATH'
  ls -la /tmp/*.pdf 2>/dev/null || echo 'PDF nije kreiran u /tmp'
  rm -rf /tmp/lo-diagnose /tmp/*.pdf 2>/dev/null || true
"

echo ""
echo "==> Zadnjih 50 linija logova document-worker servisa"
docker compose $COMPOSE_FILE logs --tail=50 "$SERVICE"
