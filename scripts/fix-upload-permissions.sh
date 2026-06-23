#!/usr/bin/env bash
# Uskladi vlasništvo host upload foldera s UID/GID korisnika app u backend image-u.
# Upotreba: ./scripts/fix-upload-permissions.sh [-f docker-compose.prod.yml]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${1:--f docker-compose.prod.yml}"
UPLOAD_HOST="${UPLOAD_HOST:-/mnt/shared-app-files/inventory-v2}"

APP_UID="$(docker compose $COMPOSE_FILE run --rm --no-deps backend id -u)"
APP_GID="$(docker compose $COMPOSE_FILE run --rm --no-deps backend id -g)"

echo "Backend app user: uid=${APP_UID} gid=${APP_GID}"
echo "Host upload dir: ${UPLOAD_HOST}"

if [ ! -d "$UPLOAD_HOST" ]; then
  echo "Kreiram ${UPLOAD_HOST}"
  sudo mkdir -p "$UPLOAD_HOST"
fi

sudo chown -R "${APP_UID}:${APP_GID}" "$UPLOAD_HOST"
sudo chmod -R u+rwX,g+rwX "$UPLOAD_HOST"

echo "Provjera write u kontejneru:"
docker compose $COMPOSE_FILE exec backend sh -c '
  TEST="${UPLOAD_DIR:-/app/uploads}/.write-test-$$"
  touch "$TEST" && rm -f "$TEST" && echo "OK: write u upload root radi"
'

echo "Gotovo."
