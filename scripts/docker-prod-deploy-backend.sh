#!/usr/bin/env bash
# Produkcija: rebuild + recreate backend + uskladi upload permisije.
# Pokreni: bash scripts/docker-prod-deploy-backend.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:--f docker-compose.prod.yml}"

bash "$ROOT/scripts/docker-prod-build.sh"
docker compose $COMPOSE_FILE up -d --force-recreate backend
bash "$ROOT/scripts/fix-upload-permissions.sh"

echo ""
echo "Backend redeploy završen. Provjera:"
docker compose $COMPOSE_FILE exec backend id
