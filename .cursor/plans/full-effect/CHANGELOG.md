# Full Effect — CHANGELOG

## 2026-06-03 — QA org hijerarhija (CHECKLIST §4)

- `org-hierarchy-validation.util.spec.ts` + `npm run test:unit` (70 testova, matrica parent→child).
- CHECKLIST **43/44** (jedino opciono: server PDF prenosnica/rashod).

## 2026-06-03 — Post-18c (zapisnik rashod + handoff)

- API `GET /inventory-sessions/:id/disposal-report` + `build-disposal-report.util.ts`.
- UI: tab **Rashod** na admin sesiji (`SessionDisposalTab`, `DisposalReportSheet`).
- Toast na cijelom frontendu (nema više `alert()`).
- `roles-access` CHANGELOG faze 14–18.
- HANDOFF: napredak **42/44** CHECKLIST (~95%).

## 2026-06-03 — Faza 18c (notifikacije + polish)

- Notifikacije: `inventory_transfer_upload_pending`, `inventory_session_closed`, `disposal_approval_pending`.
- Socket: `inventory.close_job.updated`, `inventory.disposal_inbox.updated`.
- `ToastProvider`, `useInventorySocketEvents`, transfer stepper van popisa.
- Migracija `20260603170000_notification_types_phase18c`.

## 2026-06-03 — Faza 18a (Popis UI core)

### Backend
- `GET /inventory-sessions/freeze-banner` — aktivne sesije po gradu korisnika (admin: sve aktivne).

### Frontend
- Globalni freeze banner u `Layout` (`InventoryFreezeBanner` + hook).
- `TransferDocumentPanel`: inventory stepper (RAW → Upload → Čeka zatvaranje → Primijenjeno), RAW download, finalize blok poruka.
- `SessionLinesPanel`: filteri, progress header, mobile kartice (radio status), sheet prenosnice na `<md`.
- `SessionCommandCenter` na `InventoryCountPage`: agregati, close job progress, kolone tabele sesija.
- Član: CTA „Nastavi unos” na listi komisija.

### Matrice
- `inventory-count`, `transfers` — UI freeze banner + inventory stepper.

### Sljedeće
- Faza **18b**: org skladišta, warehouse detail, freeze na Oprema/Transferi.

## 2026-06-03 — Faza 18b (Org + warehouse UI)

### Frontend
- `WarehouseDetailView`: tabovi Na skladištu, Transferi, Rashod/Uništenje, Kontekst (orgUnitId edit admin).
- `OrganizationPage`: sekcija skladišta na čvoru + brzo kreiranje.
- `WarehousesPage`: orgUnitId pri kreiranju, badge Centralno/Org, detail navigacija, skladištar scope.
- `EquipmentPage`: pogled Po skladištima, freeze blokada nove opreme.
- `Dashboard`: dodjele warehouse+category+org, quick linkovi.
- `TransfersPage`: freeze hint, disabled akcije, `fromWarehouseId`/`toWarehouseId` na create.
- `InventoryFreezeActionHint` komponenta.

### Matrice
- `warehouses` MATRIX + CHANGELOG (detail view, org vezivanje).

### Sljedeće
- Faza **18c**: toast, Socket, notifikacije.

## 2026-06-03 — Handoff + bugfix (EquipmentPage)

- Fix: `ReferenceError: Cannot access 'user' before initialization` — `getCurrentUser()` prije `useMemo` koji koristi `user`.
- HANDOFF/BRAIN ažurirani za 18c; migracije sve deployane, build OK.

## 2026-06-03 — Scaffold + Faza 13 (start)

### Scaffold
- Kreiran folder `.cursor/plans/full-effect/` (overview, CHECKLIST, HANDOFF, BRAIN, segment docs, phases 13–18 + 18a–c).
- Link sekcija u `inventory-v2/CHECKLIST.md`.

### Faza 13 — Org foundation (done)
- `OrgUnit.effectiveSignerId` + migracija `20260603120000_org_effective_signer`.
- `SignerResolutionService` + validacija hijerarhije tipova.
- Frontend `OrganizationPage`: eksplicitni/efektivni potpisnik i lokacija.
- Matrica `org-hierarchy` + CHANGELOG.

### Faza 14 — RegistrarAssignment (done)
- Model `RegistrarAssignment` (warehouse + category + orgUnit?); migracija iz `UserRegistrarScope`.
- `RegistrarScopeService` režimi A/B; admin UI `user-access-fields`.
- Matrice: roles-access (TODO changelog entry kad ažurirana).

### Faza 15 — Transfer workflow v2 (backend done)
- Statusi: `raw`, `printed`, `uploaded`, `potpisan`, `cancelled`.
- Polja: `fromWarehouseId`, `toWarehouseId`, `createdByUserId`, `finalizedByUserId`, `printedAt`.
- `finalize` zahtijeva upload (settings `transfer.allow_finalize_without_upload`).
- Upload → `uploaded`; inventory finalize blokiran dok je sesija `active`.
- `GET /transfers/:id/raw-document` (HTML); `PATCH mark-printed`, `cancel`, `finalize`.
- Signer resolve pri create preko `SignerResolutionService`.
- Frontend stepper (faza 15 UI → 18): pending.

### Faza 17 — Popis i rashod (done)
- `InventoryFreezeService` + integracija.
- `predlozen_rashod`, `DisposalInventoryApproval`, inbox/review API.
- Close job: disposal kandidati, relocate finalize nakon uploada.
- Članstvo komisije: predsjednik = user only.
- Frontend: status rashod, disposal inbox panel, wizard članovi bez usera.
- Matrice: `inventory-count`, `disposal-commission` + CHANGELOG.

### Faza 16 — Skladišta (done)
- `WarehouseCondition.spremno_za_unistenje` + `EquipmentEvent` audit.
- Skladištar scope po keeper warehouses (`warehouse-keeper-access.util.ts`).
- API destroy: `POST /warehouses/:id/destroy-equipment/:equipmentId`, `GET .../ready-for-destruction`.
- Razduženje coverage: `warehouse-coverage.util.ts`.
- Frontend stub: tab “Za uništenje” na `WarehousesPage`.
- Matrice: `warehouses`, `equipment-status` + CHANGELOG.

### Handoff sesija 2026-06-03 (kraj — faze 16–17 + priprema 18a)

- Faze 16–17 implementirane; build OK.
- HANDOFF.md ažuriran za cold-start **faze 18a** (prioriteti, API, tokovi, smoke, gapovi).
- BRAIN.md → START 18a.
- Sljedeća sesija: Layout freeze banner, TransferDocumentPanel stepper, InventoryCount command center.

### Handoff sesija 2026-06-03 (ranije)

- HANDOFF.md proširen za cold-start (faze 13–15).
- inventory-v2/HANDOFF.md — link na full-effect handoff.
