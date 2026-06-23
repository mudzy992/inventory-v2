#!/usr/bin/env sh
# Dijagnostika LibreOffice DOCX→PDF u backend kontejneru.
# Upotreba: ./scripts/diagnose-lo-pdf.sh [compose-file]
set -eu

COMPOSE_FILE="${1:--f docker-compose.prod.yml}"
SERVICE=backend

echo "==> UID/GID korisnika app u kontejneru"
docker compose $COMPOSE_FILE run --rm "$SERVICE" id

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
echo "==> Test konverzije: $DOCX_PATH"
docker compose $COMPOSE_FILE exec "$SERVICE" sh -c "
  ls -la '$DOCX_PATH'
  soffice --headless -env:UserInstallation=file:///tmp/lo-diagnose \\
    --norestore --convert-to pdf --outdir /tmp '$DOCX_PATH'
  ls -la /tmp/10-06-2026.pdf 2>/dev/null || ls -la /tmp/*.pdf 2>/dev/null || echo 'PDF nije kreiran u /tmp'
"
