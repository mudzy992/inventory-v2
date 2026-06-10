# HANDOFF — evidentičar dodjele (validacija, scope, UX)

**Plan:** [`.cursor/plans/evidentičar_dodjele_fdb4bb7a.plan.md`](../evidentičar_dodjele_fdb4bb7a.plan.md)  
**Cross-issue plan:** [`.cursor/plans/evidentičar_cross-issue_scope_242f8187.plan.md`](../evidentičar_cross-issue_scope_242f8187.plan.md)  
**Matrica:** [`.cursor/docs/matrices/roles-access/MATRIX.md`](../../docs/matrices/roles-access/MATRIX.md)  
**Changelog:** [`.cursor/docs/matrices/roles-access/CHANGELOG.md`](../../docs/matrices/roles-access/CHANGELOG.md)  
**Datum handoffa:** 2026-06-10 (sesija 4)  
**Status:** Cross-warehouse issue + scope korekcija **završeni** · **transfer scope ID-based fix + lot UX** implementirani · ručni QA **djelimično**

---

## Sažetak

Modularni model dodjela (više redova = **OR unija**) nepromijenjen u šemi. Implementirano: validacija A/B, Režim B, transferi po opremi, **admin cross-warehouse issue** iz lota, dokumentacija cross-modul scope-a. U sesiji 3 **ispravljen** preširok transfer/equipment filter (warehouse-based) i **`GET /employees/search`** sada koristi isti scope kao lista radnika.

**Kanonsko pravilo scope-a (potvrđeno od korisnika):** evidentičar vidi **samo** radnike/opremu/transfer-e koji padaju u dodjele Režim A **ili** Režim B — ništa van toga, čak ni nakon cross-warehouse issue.

**Build/test:** `backend npm run test:unit` → **170 pass** · `frontend npm run build` ✅ (prethodna sesija)

---

## Kanonski model dodjela

| Red | Dodjela | Radnici | Oprema | Lotovi | Transferi / prenosnice |
|-----|---------|---------|--------|--------|------------------------|
| **A** | W + Cat | efektivno skladište = W | skladiste + zaduženo + rashod | da | oprema u scope **ILI** from/to osoba u scope |
| **B** | W + Cat + Org | `expand(O) ∩ efektivno W` | samo `zaduzeno` | ne | isto; akcije **samo razduženje** |

**Pravilo:** za isti `(warehouseId, categoryId)` — ili A **ili** B (jedan ili više B s različitim org), nikad mix.

**Primjer 3 reda:** A W1+Cat1 · B W1+Cat2+Org1 · B W2+Cat1+Org2.

---

## Ključni fajlovi

| Sloj | Fajl | Uloga |
|------|------|-------|
| Scope (BE) | `backend/src/common/services/registrar-scope.service.ts` | `buildEquipmentWhere`, `buildEmployeeWhere`, `buildTransferWhere`, `canAccessTransfer` |
| Scope (FE) | `frontend/src/helpers/registrar-scope.ts` | Mirror za UI gate-ove |
| Validacija | `backend/src/modules/users/registrar-assignment-validation.util.ts` | A/B ekskluzivnost, org↔W |
| Cross-issue | `backend/src/modules/warehouse-stock/utils/cross-warehouse-issue.util.ts` | Lot računovodstvo W1→W2 |
| Cross-issue | `backend/src/modules/warehouse-stock/warehouse-stock.service.ts` | `issueUnit` admin grana |
| Cross-issue FE | `frontend/src/components/registrar-stock/registrar-stock-page.tsx` | Admin banner |
| Postavka | `transfer.allow_admin_cross_warehouse_issue` | Registry, tab Prenosi |
| Radnici search | `backend/src/modules/employees/employees.service.ts` | `search()` + `buildEmployeeWhere` |
| Transferi | `backend/src/modules/transfers/transfers.service.ts` | `canAccessTransfer` → registrar scope |
| Matrice | `.cursor/docs/matrices/roles-access/`, `warehouse-stock/`, `settings/` | Source of truth |

---

## Šta je urađeno po sesijama

### Sesija 1–2 (validacija A/B + cross-issue plan)

- Validacija dodjela (FE + BE), Režim B samo zaduženo, `canCreateTransferForEquipment`
- Admin UI dodjela (`RegistrarScopeRow`, autocomplete)
- Postavka `transfer.allow_admin_cross_warehouse_issue`
- Cross-warehouse `issueUnit`: dest lot auto-kreiranje, lot deltas, `stockLotId`→W2
- Cross-modul tabela u `roles-access/MATRIX.md`

### Sesija 3 (scope korekcija)

1. **Uklonjen** preširok transfer scope (`fromWarehouseId` / `documentWarehouseId` / `stockLot.warehouseId` bez provjere radnika) — korisnik eksplicitno: vidi samo po dodjeli.
2. **`canAccessTransfer`** — samo: oprema u scope **ILI** `fromPerson`/`toPerson` u scope radnika (usklađeno s `buildTransferWhere`).
3. **`GET /employees/search`** — primjenjuje `buildEmployeeWhere` (fix: autocomplete na Zaduženjima prikazivao sve radnike).
4. Uklonjen `stockLot`-only filter na opremi (zaduženo mora ići preko holdera u dodjeli).
5. Testovi ažurirani: `canAccessTransfer` po toPerson scope; `cross-warehouse-issue.util.spec.ts` ostaje.

### Sesija 4 (transfer scope + lot UX)

1. **`buildTransferWhere`** — ID-based filter (`equipmentId` / `fromPersonId` / `toPersonId`) umjesto ugniježđenog `{ equipment: equipmentWhere }` (fix: Zaduženja/Prenosnice sada prate isti scope kao Oprema za A+B uniju).
2. **Transfer include** — `orgUnitId` na `fromPerson`/`toPerson` za detail pristup.
3. **Oprema UX** — `stockLot.productName` u listi; tab „Sva oprema“: lot prvi, bez Datum ulaza; „Po kategorijama“: drill-down sub → lot → oprema (`GET /equipment/lot-groups`).

---

## Cross-warehouse issue — očekivano ponašanje

| Uloga | Šta vidi nakon admin issue W1→radnik W2 |
|-------|----------------------------------------|
| **Admin** | sve |
| **Evidentičar W2** (dodjela pokriva radnika) | radnik, oprema `zaduzeno`, transfer/prenosnicu (preko `toPerson` ili opreme) |
| **Evidentičar W1** (radnik **nije** u W1 scope) | **ne vidi** transfer ni opremu tog radnika — ispravno |
| **Evidentičar** | cross-warehouse issue → **403** (samo admin) |

Korisnik je potvrdio da cross-issue **funkcioniše**; otvoreno je bilo da li W2 evidentičar vidi Zaduženja/Prenosnice — riješeno vraćanjem na assignment-based scope (ne warehouse-based).

---

## Ručni QA (preostaje)

### Dodjele A/B

- [ ] 1–8: checklist iz sesije 1–2 (A/B ekskluzivnost, ED Zenica regresija, razduženje cilj W2…)

### Cross-modul OR unija

- [ ] 9–12: Dashboard, skladišna roba, oprema/radnici/transferi za 3-redni primjer
- [ ] Zaduženja + Prenosnice: isti broj transfera kao scoped oprema **s prenosnicom** (filter „Svi tipovi“)
- [ ] Oprema: lot naziv u „Sva oprema“; Po kategorijama → lot → oprema drill-down

### Cross-warehouse issue (admin)

- [x] ~13: issue W1→W2 (korisnik: funkcioniše)
- [ ] 14: postavka OFF → 403
- [ ] 15: evidentičar cross-issue → 403

### Scope radnika (sesija 3)

- [ ] Evidentičar A+B: lista radnika = unija A i B org jedinica, ništa više
- [ ] Autocomplete radnika na **Zaduženjima** (search) = isti skup kao lista
- [ ] Nakon cross-issue: W2 evidentičar vidi transfer u **Zaduženja** i **Prenosnice** **samo** ako je radnik u njegovoj dodjeli
- [ ] W1 evidentičar **ne** vidi taj transfer ako radnik nije u W1 scope

---

## Poznata ograničenja

- Cross-warehouse issue zahtijeva `catalogItemId` na izvornom lotu.
- FE kategorije u dropdownu dodjela derivirane iz `store.equipment` — BE validira puni set.
- Nema migracije šeme — `RegistrarAssignment` nepromijenjen.
- `canCreateTransferType` ostaje grubi gate; fina kontrola = `canCreateTransferForEquipment`.

---

## Za sljedeću sesiju

1. Proći QA checklist (gore), posebno stavke 14–15 i scope radnika.
2. Commit/PR ako korisnik traži (predložena poruka: `feat(registrar): cross-warehouse issue and assignment-scoped employee search`).
3. Eventualno: ručno potvrditi 3-redni evidentičar na staging podacima.

### Brzi kontekst za agenta

- Scope = **samo** dodjela (OR A+B), ne široko skladište.
- Cross-warehouse **issue** ≠ drugačija dodjela — admin postavka + lot transfer; vidljivost i dalje po radniku/opremi u dodjeli.
- Ne miješati Režim A i B na istom `(W, Cat)`.
- Plan fajlove **ne mijenjati** osim ako korisnik traži.

---

## Komande

```bash
cd backend && npm run test:unit
cd frontend && npm run build
```
