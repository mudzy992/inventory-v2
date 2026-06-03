# Inventory v2 — master checklist

## Faza 0 — Foundation
- [x] Premjestiti postojeći kod u `frontend/` (GitHub path)
- [x] `git init` + `.gitignore`
- [x] `git init` + commit na `main`
- [x] `origin` → `https://github.com/mudzy992/inventory-v2.git`
- [ ] Push (GitHub Desktop ili `git push -u origin main` nakon kreiranja repoa na GitHubu)
- [x] `.cursor/rules/00_project.mdc` + `.cursorrules`
- [x] `.env.example` + `.env` + `README.md`
- [x] Color scheme (design-tokens.md)

## Faza 1 — Backend foundation
- [x] `backend/` NestJS scaffold
- [x] Prisma schema + prva migracija
- [x] Auth (JWT) + seed admin
- [x] Settings registry + API
- [x] Health endpoint

## Faza 2 — Domain core
- [x] Org units API (tree)
- [x] Employees API
- [x] Categories API (dynamic fields)
- [x] Equipment API + QR
- [x] Matrice: org, categories, equipment, roles (djelomično)

## Faza 3 — Transfers & documents
- [x] Transfer CRUD + sign flow
- [x] Upload servis
- [x] Cross-service admin rule
- [x] Matrica: transfers

## Faza 4 — Frontend integration
- [x] API client + auth
- [x] Zamjena localStorage store-a
- [x] Vite proxy / env
- [ ] i18n BS (+ EN keys) — infrastruktura kasnije
- [ ] Responsive polish

## Faza 5 — Realtime
- [x] Socket.IO gateway
- [x] Notifications REST + WS
- [x] Matrica: notifications

## Faza 6 — Docker deploy
- [x] Dockerfiles (frontend, backend)
- [x] docker-compose.yml (dev)
- [x] docker-compose.prod.yml + Traefik labele
- [ ] DNS + deploy na server
- [ ] Matrica: deploy-traefik

## Faza 8 — Lokacije (plan domenski moduli)
- [x] Canton/City + org `locationCityId` / effective
- [x] LocationsModule + admin UI
- [x] Matrica: locations

## Faza 9 — Skladišta, naljepnice, prenosnice UI
- [x] Warehouse + skladistar + equipment warehouse fields
- [x] LabelPrintSheet + selekcija na listama
- [x] TransferDocumentPanel (RAW / sken / download)
- [x] Matrice: warehouses, labels

## Faza 10 — Komisija rashod
- [x] DisposalCommission + approval workflow
- [x] Matrica: disposal-commission

## Faza 11 — Godišnji popis
- [x] InventorySession + blokada transfera + linije
- [x] Matrica: inventory-count
- [x] Popis v2: wizard komisije + kategorije + auto komisija rashoda
- [x] Štampana lista po radnicima + user pregled po kategorijama
- [x] Relocation linija: skladište / osoba (ne grad)
- [ ] Zapisnik popisa PDF/HTML (faza 2)
- [x] Print page x/y robustno (JS paginacija u `inventory-print-sheet.tsx`)

## Faza — Evidentičar registrar scope (2026-06)
- [x] UserRegistrarScope + migracija
- [x] RegistrarScopeService + JWT/users
- [x] Komisije rashod/popis po cityId
- [x] Frontend scope (Dashboard, Equipment, Transfers, …)
- [x] User admin: dodjele grad + kategorija
- [x] Matrice: roles-access, locations, …

## Skladišni lot + evidentičar (2026-06-03)

Plan: [skladišni_lot_i_evidentičar/CHECKLIST.md](../skladišni_lot_i_evidentičar/CHECKLIST.md) — **100% gotovo**

- [x] Schema + migracija `20260603170000_warehouse_stock_lots`
- [x] Backend `warehouse-stock` + popis WH komisije
- [x] Frontend: prijem lota, RegistrarStock, WarehouseInventory
- [x] Matrica `warehouse-stock`

## Full effect (faze 13–18 + 18a–c)

Master checklist i HANDOFF: [`.cursor/plans/full-effect/CHECKLIST.md`](../full-effect/CHECKLIST.md) · [HANDOFF](../full-effect/HANDOFF.md) · [BRAIN](../full-effect/BRAIN.md)

- [x] Faza 13 — effective signer + org hierarchy
- [x] Faza 14 — RegistrarAssignment A/B
- [x] Faza 15 — Transfer workflow v2 (backend; UI u 18)
- [ ] Faza 16 — Skladištar scope + destroy
- [ ] Faza 17 — Inventory freeze + disposal
- [ ] Faza 18a–c — UI full effect

## Faza 7 — QA
- [ ] Test plan izvršen
- [x] HANDOFF.md
- [ ] Gap analysis (ako treba)
