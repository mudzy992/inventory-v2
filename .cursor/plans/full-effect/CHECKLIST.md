# Full Effect — master CHECKLIST

Referenca: [full-effect.md](../../docs/full-effect.md) · Izvršni mozak: [BRAIN.md](./BRAIN.md)

## §1 Potpisnik — faza 13
- [x] `effectiveSignerId` + migracija — `schema.prisma`, `20260603120000_org_effective_signer`
- [x] `SignerResolutionService` — `signer-resolution.service.ts`
- [x] Integracija org-units create/update + refresh
- [x] Matrica org-hierarchy parent→child

## §2 Lokacija create — faza 13
- [x] `POST /org-units` + `locationCityId` u create
- [x] UI efektivna lokacija — `OrganizationPage.tsx`

## §4 Hijerarhija — faza 13
- [x] `assertValidOrgUnitParentChild` — `org-hierarchy-validation.util.ts`
- [x] Edge-case testovi (automatski) — `org-hierarchy-validation.util.spec.ts`, `npm run test:unit`

## §5 Evidentičar — faza 14
- [x] `RegistrarAssignment` model + migracija
- [x] Režim A/B — `registrar-scope.service.ts`
- [x] Admin UI warehouse+org — `user-access-fields.tsx`
- [x] Matrica roles-access CHANGELOG (faze 14–18)
- [x] Matrica transfers CHANGELOG (18a stepper)

## §6 Transferi — faza 15
- [x] Status machine backend
- [x] `fromWarehouseId` / `toWarehouseId`
- [x] Upload → `uploaded`
- [x] Finalize + equipment update
- [x] Settings `transfer.allow_finalize_without_upload`
- [x] Inventory finalize blok dok `active`
- [x] RAW document `GET .../raw-document`
- [x] UI stepper RAW→Upload→Čeka zatvaranje→Primijenjeno (inventory mode) — faza 18a
- [ ] Server PDF (trenutno HTML) — opciono kasnije (jedina otvorena CHECKLIST stavka)

## §7 Skladišta — faza 16
- [x] Skladištar read po `warehouseId` — `warehouse-keeper-access.util.ts`, `equipment-access.util.ts`
- [x] `spremno_za_unistenje` marker — enum + migracija `20260603150000_warehouse_destroy_workflow`
- [x] `POST .../destroy-equipment` + `GET .../ready-for-destruction`
- [x] Coverage razduženje — `warehouse-coverage.util.ts`
- [x] `EquipmentEvent` audit
- [x] Matrice warehouses + equipment-status
- [x] Frontend stub tab “Za uništenje” — `WarehousesPage`, `warehouse-destruction-panel.tsx`

## §11 Popis/rashod — faza 17
- [x] `InventoryFreezeService` — `inventory-freeze.service.ts` + integracija equipment/transfers/warehouses
- [x] `predlozen_rashod` + disposal apply (close job → `DisposalInventoryApproval`)
- [x] `DisposalInventoryApproval` + inbox API + review
- [x] Session report — `GET /inventory-sessions/:id/report`
- [x] Blokada rashoda van popisa (freeze + `rashodovanje` tokom active)
- [x] Članstvo: predsjednik = user, članovi = employee
- [x] Relocate: draft pri unosu + finalize na close (upload obavezan)
- [x] Rashod zapisnik HTML štampa + API `disposal-report` (JSON)

## §11.12 UI — faze 18a–c
- [x] 18a: progress header, filteri (neevidentirano / prenosnica / greška), freeze banner u Layout
- [x] 18a: inventory stepper prenosnice (RAW → Upload → Čeka zatvaranje → Primijenjeno)
- [x] 18a: admin command center + close job progress; mobile kartice + sheet prenosnice
- [x] 18b: org skladišta (sekcija u org modalu), warehouse detail tabovi, po skladištima
- [x] 18b: evidentičar dashboard dodjele, freeze hint na Oprema/Transferi/Skladišta
- [x] 18b: transfer create šalje fromWarehouseId/toWarehouseId
- [x] 18c: notifikacije, toast, Socket refresh (close job, disposal), empty states, legacy rashod label, transfer stepper van popisa

## §19 Skladišni lot + popis skladišta — plan 2026-06-03
- [x] `WarehouseStockLot` + migracija `20260603170000_warehouse_stock_lots`
- [x] Modul `warehouse-stock` (prijem, spec, issue, notifikacije, freeze)
- [x] `InventoryWarehouseCommittee` auto pri activate + linije po lotu
- [x] Frontend: `RegistrarStockPage`, `warehouse-stock-panel`, `WarehouseInventoryPage`
- [x] Matrica `warehouse-stock` + CHANGELOG matrica
- [x] Detalj: [skladišni_lot_i_evidentičar/CHECKLIST.md](../skladišni_lot_i_evidentičar/CHECKLIST.md)

## Out of scope
- [x] §3 Municipality/Place — registar u `00_overview.md`
- [x] Scheduled 01.12–31.12 — stub OK
