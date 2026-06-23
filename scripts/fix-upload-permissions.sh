#!/usr/bin/env bash
# Uskladi vlasništvo host upload foldera s UID/GID backend kontejnera.
# Upotreba: bash scripts/fix-upload-permissions.sh
#           COMPOSE_FILE="-f docker-compose.prod.yml" bash scripts/fix-upload-permissions.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:--f docker-compose.prod.yml}"
UPLOAD_HOST="${UPLOAD_HOST:-/mnt/shared-app-files/inventory-v2}"

IMAGE_UID="$(docker compose $COMPOSE_FILE run --rm --no-deps backend id -u)"
IMAGE_GID="$(docker compose $COMPOSE_FILE run --rm --no-deps backend id -g)"

RUNNING_UID=""
RUNNING_GID=""
if [ -n "$(docker compose $COMPOSE_FILE ps -q backend 2>/dev/null || true)" ]; then
  RUNNING_UID="$(docker compose $COMPOSE_FILE exec -T backend id -u 2>/dev/null || true)"
  RUNNING_GID="$(docker compose $COMPOSE_FILE exec -T backend id -g 2>/dev/null || true)"
fi

echo "Image app user:  uid=${IMAGE_UID} gid=${IMAGE_GID}"
if [ -n "$RUNNING_UID" ]; then
  echo "Running app user: uid=${RUNNING_UID} gid=${RUNNING_GID}"
fi

APP_UID="${IMAGE_UID}"
APP_GID="${IMAGE_GID}"

if [ -n "$RUNNING_UID" ] && [ "$RUNNING_UID" != "$IMAGE_UID" ]; then
  echo ""
  echo "UPOZORENJE: pokrenuti backend nije na novom image-u (uid ${RUNNING_UID} != ${IMAGE_UID})."
  echo "Prvo: bash scripts/docker-prod-build.sh"
  echo "      docker compose $COMPOSE_FILE up -d --force-recreate backend"
  echo ""
  echo "Privremeno usklađujem mount s POKRENUTIM uid=${RUNNING_UID} (preporuka: recreate pa 100:101)."
  APP_UID="${RUNNING_UID}"
  APP_GID="${RUNNING_GID}"
fi

echo "Host upload dir: ${UPLOAD_HOST}"

if [ ! -d "$UPLOAD_HOST" ]; then
  echo "Kreiram ${UPLOAD_HOST}"
  sudo mkdir -p "$UPLOAD_HOST"
fi

# Roditeljski path mora biti prolazan (execute) za kontejner korisnika
for parent in /mnt /mnt/shared-app-files "$UPLOAD_HOST"; do
  if [ -d "$parent" ]; then
    sudo chmod u+rwX,a+rX "$parent" 2>/dev/null || sudo chmod 755 "$parent"
  fi
done

sudo chown -R "${APP_UID}:${APP_GID}" "$UPLOAD_HOST"
sudo find "$UPLOAD_HOST" -type d -exec chmod 775 {} +
sudo find "$UPLOAD_HOST" -type f -exec chmod 664 {} +

echo ""
echo "Host (numeric):"
ls -lan "$UPLOAD_HOST" | head -5

if [ -z "$RUNNING_UID" ]; then
  echo "Backend nije pokrenut — preskačem write test."
  exit 0
fi

echo ""
echo "Provjera write u POKRENUTOM kontejneru:"
if docker compose $COMPOSE_FILE exec -T backend sh -c '
  UP="${UPLOAD_DIR:-/app/uploads}"
  echo "Container id: $(id)"
  ls -lan "$UP" | head -5
  TEST="$UP/.write-test-$$"
  touch "$TEST" && rm -f "$TEST" && echo "OK: write u upload root radi"
'; then
  echo "Gotovo."
else
  echo ""
  echo "Write i dalje ne radi. Provjeri user namespace / SELinux:"
  echo "  docker compose $COMPOSE_FILE exec backend ls -lan /app/uploads"
  echo "  ls -lanZ $UPLOAD_HOST   # SELinux kontekst"
  echo "  grep userns /etc/docker/daemon.json"
  exit 1
fi
