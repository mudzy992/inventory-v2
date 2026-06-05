# Matrica — deploy i Traefik

| Parametar | Vrijednost |
|-----------|------------|
| Host | `inventory-v2.ba101.top` |
| Frontend router | `inventory-v2-web` |
| API router | `inventory-v2-api` + `PathPrefix(\`/backend\`)` |
| Entrypoint | `websecure` |
| Cert resolver | `le` |
| Docker network | `web` (external) |
| MySQL | eksterni server (`DATABASE_URL` u `.env`) |
| Upload volume | bind mount `/mnt/shared-app-files/inventory-v2` → `/app/uploads` |

## URL

- App: `https://inventory-v2.ba101.top/`
- API: `https://inventory-v2.ba101.top/backend/...`

## Prefix

NestJS `setGlobalPrefix('backend')` — bez Traefik StripPrefix.

## Socket.IO

- Path: `/backend/socket.io`
- Namespace: `/notifications`
- Isti Traefik router (`inventory-v2-api`) — WS upgrade na backend servis

## Frontend kontejner

- **Bez nginx** — statički `dist/` preko `serve` na portu `3000`.
- Traefik labela: `loadbalancer.server.port=3000`.

## Upload fajlovi (backend)

- `UPLOAD_DIR=/app/uploads` u `.env` (putanja unutar kontejnera).
- Host bind mount: `/mnt/shared-app-files/inventory-v2:/app/uploads` u `docker-compose.prod.yml`.
- Struktura unutar root-a (aplikacija): `prenosnice/{warehouseId}/{godina}/...`, `templates/warehouses/{warehouseId}/...`.
- Prije prvog `up`: `mkdir -p /mnt/shared-app-files/inventory-v2` i `chown` za user `app` u kontejneru (provjeri `docker compose run --rm backend id app`).
