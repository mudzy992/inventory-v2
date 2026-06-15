# Changelog — deploy-traefik

## 2026-06-15

- Eksplicitni image tagovi `inventory-v2-backend:prod` / `inventory-v2-frontend:prod` u `docker-compose.prod.yml`.
- Skripta `scripts/docker-prod-build.sh`: build + `docker image prune -f` za uklanjanje dangling image-a nakon rebuild-a.

## 2026-06-05

- Produkcija: upload bind mount `/mnt/shared-app-files/inventory-v2` → `/app/uploads` (umjesto named volume).
- Backend Dockerfile: dummy `DATABASE_URL` u build stage-u za `prisma generate` (Prisma 7 config); prava URL iz `.env` samo u runtime.

## 2026-05-29

- Inicijalna specifikacija za ba101.top + mreža web.
