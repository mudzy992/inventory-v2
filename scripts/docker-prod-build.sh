#!/usr/bin/env bash
# Build produkcijskih image-a. Pokreni: bash scripts/docker-prod-build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
docker compose -f docker-compose.prod.yml build "$@"
docker image prune -f
