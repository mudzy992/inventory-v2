# HANDOFF — Inventory v2

## Status (2026-05-29)

**Faza 0 — djelimično završena**

## Urađeno

- Repo na `C:\Users\m.ceric\Documents\GitHub\inventory-v2`
- `frontend/` — Vite prototip premješten sa Desktopa
- `backend/` — placeholder (Dockerfile, uploads, README)
- `.env` + `.env.example` (MySQL/JWT placeholderi za korisnika)
- `docker-compose.yml`, `docker-compose.prod.yml` (Traefik labele, bez MySQL servisa)
- Design tokens + `index.css` @theme
- Plan folder `.cursor/plans/inventory-v2/`
- Git: `main` commit `eaafaa2`, remote `origin` → `mudzy992/inventory-v2`
- **Push:** kreiraj prazan repo `inventory-v2` na GitHubu (mudzy992), zatim `git push -u origin main` ili GitHub Desktop

## Sljedeće

1. Korisnik popuni `.env` (DATABASE_*, JWT_SECRET).
2. Faza 1: NestJS + Prisma scaffold u `backend/`.
3. Faza 4: frontend API integracija.

## Test

- `cd frontend && npm install && npm run dev` — provjeriti lokalno.
