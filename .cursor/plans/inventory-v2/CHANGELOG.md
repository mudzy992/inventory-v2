# Plan changelog — Opremnica

## 2026-06-03 (skladišni lot + evidentičar + popis skladišta)

- Plan [skladišni_lot_i_evidentičar](../skladišni_lot_i_evidentičar/CHECKLIST.md): **100% gotovo**.
- Bulk prijem (`WarehouseStockLot`), spec/issue evidentičara, auto popisne komisije po skladištu.
- Matrica: `.cursor/docs/matrices/warehouse-stock/`.

## 2026-06-02 (handoff — registrar scope + popis v2)

- Evidentičar: `UserRegistrarScope` (grad + kategorija), komisije po gradu, frontend scope.
- Popis v2: wizard, auto komisija rashoda, štampa po radnicima, relocation skladište/osoba.
- Migracije: `20260601120000_registrar_scope_city_commissions`, `20260602120000_inventory_committee_scope_v2`.
- Ažuriran `HANDOFF.md` za sljedeću sesiju.

## 2026-05-29 (handoff — domenski moduli)

- Ažuriran `HANDOFF.md`: lokacije, skladišta, skladistar, naljepnice, komisija rashod, popis; mapa UI menija; seed korisnici; next steps (QA, deploy, UX polish).
- Sidebar fix dokumentovan (Lokacije, Skladišta, … u `Layout.tsx`).

## 2026-05-29 (handoff)

- Ažuriran `HANDOFF.md` za nastavak sesije (faze 0–4 gotove, faza 5 sljedeća).

## 2026-05-29 (faza 4)

- Frontend API integracija: auth, data provider, CRUD preko backenda.
- Uklonjen localStorage kao primarni store.

## 2026-05-29 (faza 3)

- Transferi: CRUD, sign flow, PRN brojevi, cross-service (admin + flag).
- Upload skenova transfera (`POST/GET /backend/uploads`).

## 2026-05-29 (faza 1–2)

- Faza 1: NestJS + Prisma 7 backend foundation (auth, settings, health).
- Faza 2: Domain API (org-units, employees, categories, equipment + QR).

## 2026-05-29

- Rebrand: **Inventory v2** (`inventory-v2.ba101.top`, `mudzy992/inventory-v2`).
- Faza 0: monorepo u `Documents\GitHub\inventory-v2`, frontend + backend placeholder.
- Eksterni MySQL (bez DB kontejnera); `.env` kreiran lokalno (nije u gitu).
- Design tokens (primary #1d4ed8, accent #0d9488, …).
- Docker compose + Traefik labele za produkciju.
