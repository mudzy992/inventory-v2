# Changelog — deploy-traefik

## 2026-06-05

- Produkcija: upload bind mount `/mnt/shared-app-files/inventory-v2` → `/app/uploads` (umjesto named volume).
- Backend Dockerfile: dummy `DATABASE_URL` u build stage-u za `prisma generate` (Prisma 7 config); prava URL iz `.env` samo u runtime.

## 2026-05-29

- Inicijalna specifikacija za ba101.top + mreža web.
