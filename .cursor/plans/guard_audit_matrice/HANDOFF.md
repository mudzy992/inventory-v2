# HANDOFF — Guard audit i implementacija (matrica po matrici)

**Datum:** 2026-06-15  
**Plan:** [.cursor/plans/guard_audit_matrice_ada12375.plan.md](../guard_audit_matrice_ada12375.plan.md)  
**Registry:** [.cursor/docs/matrices/GUARDS_REGISTRY.md](../../docs/matrices/GUARDS_REGISTRY.md)  
**Status:** Faza A + B + C (FE smoke) **završene**; P2 backlog **implementiran** (2026-06-16)

---

## P2 implementacija (2026-06-16)

| Stavka | Status |
|--------|--------|
| BE `LOCATION_MESSAGES` u `locations.service.ts` | ✓ |
| BE `TRANSFER_MESSAGES` (rashodovanje, cancel, mark_printed) | ✓ |
| BE `WAREHOUSE_STOCK_MESSAGES` (lot closed, cross-warehouse) | ✓ |
| BE `DISPOSAL_MESSAGES` u `withdrawFromList` | ✓ (assertPreListEnabled već postojao) |
| `canReactivateEquipment` + `EquipmentCard` | ✓ |
| `canCrossWarehouseIssue` u `registrar-stock-page` | ✓ |
| `canMarkDisposalList` u mark dialog | ✓ |
| `canReviewDisposalApproval` u disposal inbox | ✓ |
| `canWithdrawDisposalList` disable na list panel | ✓ |
| Inventory activate — keeper `employeeId` hint | ✓ (`inventory-activate-readiness.util` + SessionCommandCenter) |
| `canCloseInventoryCommittee` — predsjednik vs član | ✓ |
| Warehouse API — `keeper.user.employeeId` za FE hint | ✓ |

**Ostaje:** Settings enforcement cross-check (dokumentacija u settings MATRIX); puni API smoke (`npm run test:smoke:guards`).


## Faza C smoke — rezultati (2026-06-16)

### Automatski (pokrenuto)

| Test | Rezultat | Napomena |
|------|----------|----------|
| `npm run test:smoke:guards-fe` (backend) | **6/6 PASS** | `guards-phase-c.spec.ts` — svi FE helperi |
| `npm run test:smoke:guards` (backend) | **Nije pokrenut** | Zahtijeva `backend/.env` + API na `:3000` |

### Statička verifikacija (kod)

| Scenarij | FE | BE bypass | Status |
|----------|----|-----------|--------|
| Delete radnika s user računom | `EmployeesPage` → `canDeleteEmployee` + toast, disable (desktop + mobile) | `employees.service.remove` → 400 BS | ✓ (mobile bug fix: `handleDelete(emp.id)` → `handleDelete(emp)` + guard) |
| Delete šifrarnika `inUseCount > 0` | `equipment-catalog-panel` disable + toast | `equipment-catalog.service.remove` → 400 BS | ✓ |
| Rashod dugme disabled | `TransfersPage` button `disabled` + title | `transfers.service.create` rashodovanje → 400 BS | ✓ |
| Zaduženje kad `transfer.generation.enabled=false` | `canCreateTransferType` toast u `handleSubmit` | `assertTransferCreationAllowed` → 400 BS | ✓ |
| Spec edit na `zatvoreno` lotu | `canEditLotSpecifications` toast | `defineSpecifications` → 400 (EN poruka — P2) | ✓ FE/BE blok; poruka BE na EN |
| Relocation Prebaci bez šifrarnika | `canTransferRelocationLine` toast + disable | `executeSourceTransfer` → 400 BS | ✓ |

### Ručni smoke (još)

- [ ] Browser: toast vidljiv na svakom scenariju (vizuelno)
- [ ] API: `npm run test:smoke:guards` protiv lokalnog/staging API-ja
- [ ] DevTools: direktan `fetch` DELETE/POST zaobiđe FE → potvrdi 400/403 + BS `message`

**Pokretanje API smoke-a:**

```bash
cd backend
# popuni .env (DATABASE_*, JWT_SECRET)
npm run dev   # drugi terminal
npm run test:smoke:guards
```


## Šta je urađeno

### Dokumentacija (Faza A)

- [`GUARDS_REGISTRY.md`](../../docs/matrices/GUARDS_REGISTRY.md) — prepisan iz sažetih tabela u puni audit po modulu (19 matrica + appendix `employees`, `equipment-catalog`)
- Sažetna P0/P1/P2 tablica na vrhu registry-ja
- CHANGELOG ažuriran za logičke BE promjene:
  - [`locations/CHANGELOG.md`](../../docs/matrices/locations/CHANGELOG.md)
  - [`warehouse-stock/CHANGELOG.md`](../../docs/matrices/warehouse-stock/CHANGELOG.md)

### Backend (P0 fixovi + podaci za FE guardove)

| Fajl | Promjena |
|------|----------|
| `backend/src/modules/locations/locations.service.ts` | `deleteCanton` → `assertFeatureEnabled('features.locations')`; `findCities` vraća `disposalCommissionCount` |
| `backend/src/modules/warehouse-stock/warehouse-stock.service.ts` | `defineSpecifications` → `assertFeatureEnabled('features.registrar_stock')` |
| `backend/src/modules/employees/employees.service.ts` | Lista radnika uključuje delete-guard polja: `hasUserAccount`, `isOrgSigner`, `signedTransferCount`, `openRelocationCount` |
| `backend/src/modules/equipment-catalog/equipment-catalog.service.ts` | Lista šifrarnika uključuje `inUseCount` |

**Novi BE message moduli** (kreirani, još **nisu** wire-ani u servise — samo registry + FE parity):

- `backend/src/common/utils/transfer-messages.util.ts`
- `backend/src/common/utils/warehouse-stock-messages.util.ts`
- `backend/src/common/utils/maintenance-parts-messages.util.ts`
- `backend/src/common/utils/employee-relocation-messages.util.ts`
- `backend/src/common/utils/disposal-messages.util.ts`

### Frontend — novi guard moduli

- `frontend/src/helpers/guards/warehouse-stock-guards.ts`
- `frontend/src/helpers/guards/maintenance-parts-guards.ts`
- `frontend/src/helpers/guards/employee-relocation-guards.ts`
- `frontend/src/helpers/guards/disposal-guards.ts`

Prošireni: `transfer-guards.ts`, `warehouse-guards.ts`, `location-guards.ts`, `index.ts`

### Frontend — wire-ano u UI (P0 + P1 + P2)

| Komponenta | Guard |
|------------|-------|
| `EmployeesPage.tsx` | `canDeleteEmployee` — disable + toast + BE polja |
| `equipment-catalog-panel.tsx` | `canDeleteCatalogItem` + `inUseCount` |
| `LocationsPage.tsx` | `canDeleteCity` + `disposalCommissionCount` |
| `TransfersPage.tsx` | `canCreateTransferType`, `canCreateCrossServiceTransfer`; rashod dugme disabled; `runMutationWithRefresh` |
| `transfer-documents-tab.tsx` | `canSignTransfer`; `runMutationWithRefresh` |
| `registrar-stock-page.tsx` | `canEditLotSpecifications`, `canIssueFromLot` |
| `employee-relocation-page.tsx` | `canTransferRelocationLine`, `canResolveRelocationWhileFrozen` |
| `equipment-installed-parts-panel.tsx` | install/faulty/remove/replace guardi |
| `disposal-list-panel.tsx` | `canWithdrawDisposalList` |
| `warehouse-destruction-panel.tsx` | `canDestroyEquipment` + freeze disable + `runMutationWithRefresh` |

### Build status

- `frontend`: `npm run build` — **OK**
- `backend`: `npm run build` — **OK**
- Ručni smoke / API bypass testovi — **nisu pokrenuti**

---

## Donesene odluke

1. **Audit prvo, implementacija po prioritetu** — kompletan registry prije koda; P0→P1→P2 kroz cijeli projekat (ne po matrici).
2. **Employee delete guard** — BE lista vraća guard metadata (umjesto dodatnog endpointa) da FE može disable bez N+1.
3. **Catalog delete** — `inUseCount` na list endpointu (umjesto posebnog count poziva).
4. **Rashodovanje prenosnicom** — FE dugme trajno disabled + BE i dalje odbija `rashodovanje` create.
5. **BE message util-i** — kreirani za buduću centralizaciju; servisi još koriste postojeće inline/EN poruke na nekim mjestima.

---

## Otvoreni gapovi (P2 — sljedeća sesija)

| Prioritet | Stavka | Status |
|-----------|--------|--------|
| — | Settings enforcement cross-check (`features.*` ↔ servisi) | dokumentacija u settings MATRIX |
| — | API smoke `test:smoke:guards` protiv live servera | čeka `.env` + backend |

**Zatvoreno u P2 sesiji 2026-06-16:** locations/transfers BE poruke, reactivate, cross-warehouse UI, disposal mark/review/withdraw UI, inventory activate keeper hint, close_committee guard, warehouse keeper employeeId u API.

---

## Next steps (konkretno)

### 1. Commit (korisnik nije tražio — pitati prije commita)

```text
feat(guards): audit registry + wire FE guards across modules

- Expand GUARDS_REGISTRY.md with full per-action audit
- Wire canDeleteEmployee, canDeleteCatalogItem, transfer/stock/relocation/disposal guards
- BE: feature flags on deleteCanton/defineSpecifications; list metadata for delete guards
```

### 2. Faza C — verifikacija (15–30 min)

- [x] Employees: pokušaj delete radnika s user računom → FE toast, ne API (unit + kod; mobile fix)
- [x] Catalog: delete stavke s `inUseCount > 0` → disabled + toast (unit + kod)
- [x] Transfers: rashod dugme disabled; zaduženje s isključenim `transfer.generation.enabled` (unit + kod)
- [x] Registrar stock: spec edit na `zatvoreno` lotu → toast (unit + kod; BE poruka EN)
- [x] Relocation: Prebaci bez šifrarnika → toast (unit + kod)
- [ ] DevTools bypass FE → BE i dalje 400/403 s BS porukom (`test:smoke:guards` — čeka API)

### 3. P2 backlog (male diffe, po modulu)

1. Zamijeni EN poruke u `locations.service.ts` / `transfers.service.ts` s `*-messages.util.ts`
2. `canReactivateEquipment` + EquipmentCard
3. `canCrossWarehouseIssue` u cross-warehouse UI
4. Disposal mark/review UI guardi
5. Inventory committee president UI

### 4. Matrice (ako se mijenja logika)

- Update odgovarajući `MATRIX.md` + `CHANGELOG.md` + red u `GUARDS_REGISTRY.md`

---

## Fajlovi za brzi pregled (git)

**Modified:** 23 fajla (vidi `git status`)  
**Untracked:** 5 BE message util-a, 4 FE guard modula, plan fajl

**Ne dirati:** `.cursor/plans/compose_toast_matrice_714eeb6d.plan.md`

---

## Kontekst za nastavak

```
User: guard audit matrica po matrici — plan guard_audit_matrice_ada12375
Done: Faza A–C + P2 guard backlog (poruke, reactivate, cross-warehouse, disposal UI, inventory hints)
Next: API smoke kad server radi; settings enforcement cross-check po potrebi
Source: .cursor/docs/matrices/GUARDS_REGISTRY.md
```
