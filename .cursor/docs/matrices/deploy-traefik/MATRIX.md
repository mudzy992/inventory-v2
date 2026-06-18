# Matrica — deploy i Traefik

| Parametar | Vrijednost |
|-----------|------------|
| Host | `evidens.ba101.top` |
| Frontend router | `evidens-web` |
| API router | `evidens-api` + `PathPrefix(\`/backend\`)` |
| Entrypoint | `websecure` |
| Cert resolver | `le` |
| Docker network | `web` (external) |
| MySQL | eksterni server (`DATABASE_URL` u `.env`) |
| Upload volume | bind mount `/mnt/shared-app-files/inventory-v2` → `/app/uploads` |

## URL

- App: `https://evidens.ba101.top/`
- API: `https://evidens.ba101.top/backend/...`

## Prefix

NestJS `setGlobalPrefix('backend')` — bez Traefik StripPrefix.

## Socket.IO

- Path: `/backend/socket.io`
- Namespace: `/notifications`
- Isti Traefik router (`evidens-api`) — WS upgrade na backend servis

## Frontend kontejner

- **Bez nginx** — statički `dist/` preko `serve` na portu `3000`.
- Traefik labela: `loadbalancer.server.port=3000`.

## Upload fajlovi (backend)

- `UPLOAD_DIR=/app/uploads` u `.env` (putanja unutar kontejnera).
- Host bind mount: `/mnt/shared-app-files/inventory-v2:/app/uploads` u `docker-compose.prod.yml`.
- Struktura unutar root-a (aplikacija): `prenosnice/{warehouseId}/{godina}/...`, `templates/warehouses/{warehouseId}/...`.
- Prije prvog `up`: `mkdir -p /mnt/shared-app-files/inventory-v2` i `chown` za user `app` u kontejneru (provjeri `docker compose run --rm backend id app`).

## Docker image tagovi i build

| Servis | Image tag |
|--------|-----------|
| backend | `inventory-v2-backend:prod` |
| frontend | `inventory-v2-frontend:prod` |

Rebuild ostavlja dangling `<none>` image-e od prethodnih slojeva. Compose nema post-build hook — koristiti skriptu:

```bash
./scripts/docker-prod-build.sh
docker compose -f docker-compose.prod.yml up -d
```

Skripta pokreće `docker compose build` pa `docker image prune -f` (samo dangling, ne dira tagged image-e drugih projekata).

## Napomena (rebrand)

- Produktni naziv: **Evidens**; Git repo i DB ime ostaju `inventory-v2` / `inventory_v2`.
- Stari host (`inventory*.ba101.top`) može ostati kao privremeni Traefik alias tokom migracije.
