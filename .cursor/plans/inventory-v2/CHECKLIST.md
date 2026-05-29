# Inventory v2 — master checklist

## Faza 0 — Foundation
- [x] Premjestiti postojeći kod u `frontend/` (GitHub path)
- [x] `git init` + `.gitignore`
- [ ] GitHub repo `mudzy992/inventory-v2` + push
- [x] `.cursor/rules/00_project.mdc` + `.cursorrules`
- [x] `.env.example` + `.env` + `README.md`
- [x] Color scheme (design-tokens.md)

## Faza 1 — Backend foundation
- [ ] `backend/` NestJS scaffold
- [ ] Prisma schema + prva migracija
- [ ] Auth (JWT) + seed admin
- [ ] Settings registry + API
- [ ] Health endpoint

## Faza 2 — Domain core
- [ ] Org units API (tree)
- [ ] Employees API
- [ ] Categories API (dynamic fields)
- [ ] Equipment API + QR
- [ ] Matrice: org, categories, equipment, roles (djelomično)

## Faza 3 — Transfers & documents
- [ ] Transfer CRUD + sign flow
- [ ] Upload servis
- [ ] Cross-service admin rule
- [ ] Matrica: transfers

## Faza 4 — Frontend integration
- [ ] API client + auth
- [ ] Zamjena localStorage store-a
- [ ] Vite proxy / env
- [ ] i18n BS (+ EN keys)
- [ ] Responsive polish

## Faza 5 — Realtime
- [ ] Socket.IO gateway
- [ ] Notifications REST + WS
- [ ] Matrica: notifications

## Faza 6 — Docker deploy
- [ ] Dockerfiles (frontend, backend)
- [ ] docker-compose.yml (dev)
- [ ] docker-compose.prod.yml + Traefik labele
- [ ] DNS + deploy na server
- [ ] Matrica: deploy-traefik

## Faza 7 — QA
- [ ] Test plan izvršen
- [ ] HANDOFF.md
- [ ] Gap analysis (ako treba)
