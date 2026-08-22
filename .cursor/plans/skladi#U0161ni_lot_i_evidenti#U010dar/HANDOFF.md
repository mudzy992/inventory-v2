# HANDOFF — Skladišni lot (završeno)

**Datum:** 2026-06-03  
**Status:** Plan u potpunosti implementiran.

## Poslovni tok (potvrđeno)

1. **Skladištar** — prijem: kategorija + naziv robe + količina (bez spec / inv. broja).
2. **Evidentičar** — korak 1: legacy (non-`unique`) polja kategorije na cijeli lot.
3. **Evidentičar** — korak 2: po komadu radnik + inventurni broj + `unique` polja (npr. serijski); legacy se ne ponavlja.
4. **Popis** — skladištar: samo neizdana roba (lotovi); kategorijske komisije i dalje za zaduženu / pojedinačnu opremu.
5. **Rashod/uništenje** — skladištar samo `rashodovano` + `spremno_za_unistenje`, ne normalna zaliha.

## Ključni fajlovi

| Sloj | Putanja |
|------|---------|
| Matrica | `.cursor/docs/matrices/warehouse-stock/MATRIX.md` |
| Backend | `backend/src/modules/warehouse-stock/` |
| Popis WH | `backend/src/modules/inventory-count/` (+ `inventory-warehouse-committee.controller.ts`) |
| UI evidentičar | `frontend/src/components/registrar-stock/registrar-stock-page.tsx` |
| UI skladištar | `frontend/src/components/warehouses/warehouse-stock-panel.tsx`, `inventory-count/warehouse-inventory-page.tsx` |

## Smoke test (preporuka)

- `amir.skladistar` / `user123` — prijem lota, popis (ako je sesija active).
- `kenan.hodzic` / `user123` — spec lota, izdaj 1 komad, provjeri transfer i 19/20.
- Admin — aktivacija sesije → warehouse komisije auto-kreirane.
