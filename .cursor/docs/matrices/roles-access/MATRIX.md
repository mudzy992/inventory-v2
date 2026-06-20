# Matrica — uloge i pristup

## Uloge

| Uloga | Kod | Opis |
|-------|-----|------|
| Administrator | `admin` | Puna konfiguracija sistema |
| Moderator | `moderator` | Org-scoped operativni admin + warehouse moderator za popisne komisije (vidi [moderator/MATRIX.md](../moderator/MATRIX.md)) |
| Evidentičar | `evidenticar` | Evidencija u dodijeljenim parovima **skladište + kategorija** (+ opcionalno org suženje) |
| Skladištar | `skladistar` | Evidencija na dodijeljenim skladištima |
| Koordinator popisa | `popis_koordinator` | Konfiguracija članova auto-slotova u draft sesiji za dodijeljena skladišta |
| Korisnik | `user` | Pregled vlastitog zaduženja, QR |

## Opseg evidentičara (`RegistrarAssignment`)

| Polje | Pravilo |
|-------|---------|
| `warehouseId` | Skladište dodjele (obavezno) |
| `categoryId` | Root kategorija; scope uključuje sve podkategorije |
| `orgUnitId` | Opcionalno — **režim B** (ciljana služba u efektivnom skladištu) |

Više dodjela po korisniku = **unija** (OR) scope-a.

### Pravila dodjele (admin / API validacija)

| Pravilo | Opis |
|---------|------|
| Ekskluzivnost A/B | Za isti par `(warehouseId, categoryId)` dozvoljen je **ili** jedan Režim A (`orgUnitId = null`) **ili** jedan ili više Režima B — nikad mix |
| Više B istog W+C | Dozvoljeno s **različitim** `orgUnitId` (različite službe) |
| Org ↔ skladište | Režim B: `resolveEffectiveWarehouse(orgUnitId) === warehouseId` na redu |
| Kategorija ↔ skladište | Parent `ASSET` kategorije koje skladište ima (oprema ili lot); fallback sve ASSET parent ako nema podataka |
| Duplikat | Isti `(warehouseId, categoryId, orgUnitId)` odbijen |

Implementacija validacije: [`registrar-assignment-validation.util.ts`](../../../../backend/src/modules/users/registrar-assignment-validation.util.ts), UI: [`registrar-assignment-rules.ts`](../../../../frontend/src/helpers/registrar-assignment-rules.ts).

**Primjer (3 reda):** A: W1+Cat1; B: W1+Cat2+Org1; B: W2+Cat1+Org2.

### Efektivno skladište (nearest-wins)

Za radnika/org jedinicu: `resolveEffectiveWarehouseId(orgUnitId)` — prvo skladište na org lancu prema korijenu.

- Ako je na **ED Zenica** definisano skladište, ono pokriva cijelo podstablo ispod — **Centralno** (Direkcija) ne vidi tu granu.
- Scope evidentičara za **zaduženo** i **radnike** koristi isti model (ne široko `expandOrgSubtree(warehouse.orgUnitId)`).

### Kanonski scope po entitetu

| Entitet | Režim A (`orgUnitId = null`) | Režim B |
|---------|------------------------------|---------|
| Oprema `skladiste` | `equipment.warehouseId = W` | ne vidi |
| Oprema `zaduzeno` | holder u org jedinicama gdje efektivno skladište = W | holder u `expand(orgUnitId) ∩ efektivno W` |
| Oprema `rashodovano` | `equipment.warehouseId = W` | ne vidi |
| Lot (Skladišna roba) | `lot.warehouseId = W`, kategorija ∈ expand(C); uključuje `0/N` | ne vidi lotove |
| Radnik | efektivno skladište = W | org ∈ `expand(O) ∩ efektivno W` |
| Transfer / prenosnica | oprema u scope **OR** `fromPerson`/`toPerson` u scope radnika | isto |
| Akcije transfera | zaduženje, razduženje, prenos, rashod (prema opremi u A) | **samo razduženje** (`canCreateTransferForEquipment`) |

Implementacija: [`registrar-scope.service.ts`](../../../../backend/src/common/services/registrar-scope.service.ts), [`collect-org-units-for-warehouse.util.ts`](../../../../backend/src/common/utils/collect-org-units-for-warehouse.util.ts).

### Cross-modul vidljivost (OR unija dodjela)

Više redova dodjele = **unija** scope-a u svim modulima ispod. Primjer: A W1+Cat1 · B W1+Cat2+Org1 · B W2+Cat1+Org2.

| Modul | API / servis | Režim A | Režim B |
|-------|--------------|---------|---------|
| Radnici | `employees.service` → `buildEmployeeWhere` | efektivno W | expand(O) ∩ efektivno W |
| Oprema | `equipment.service` → `buildEquipmentWhere` | skladište + zaduženo + rashod | samo zaduženo |
| Prenosnice / transferi | `transfers.service` → `buildTransferWhere` | oprema u scope **ILI** `fromPerson`/`toPerson` u scope radnika | isto, suženo |
| Skladišna roba | `warehouse-stock` → `buildStockLotWhere` | lotovi W+Cat | **ne vidi** |
| Kontrolna tabla | `GET /equipment/summary` (BE scoped) | scoped kategorije | scoped zaduženo |
| Skladišta (lista) | `warehouses.service` | warehouseIds iz dodjela | isto |
| Org. promjena | `employee-relocation` | samo Režim A redovi | B ne vidi relocation linije |
| Akcije na opremi | `canCreateTransferForEquipment` | pun set transfera | **samo razduženje** → ciljno skladište iz matching dodjele |

Frontend liste koriste paginirane API-je sa istim BE filterom; ne sužavaju OR uniju dodatnim client filterom.

## Pristup po modulu

| Modul | admin | evidenticar | skladistar | user |
|-------|:-----:|:-----------:|:----------:|:----:|
| Organizacija | CRUD | — | — | — |
| Lokacije | CRUD | R | — | — |
| Skladišta | CRUD | R (dodjele) | CRUD svoja | — |
| Kategorije | CRUD | R | — | — |
| Korisnici | CRUD | — | — | — |
| Komisija rashod | CRUD | approve + resolve | — | — |
| Popis | CRUD sesija | evidencija (scope) | — | — |
| Zaposlenici | CRUD | R (scope) | — | — |
| Oprema | CRUD | CRUD (scope) | CRUD (svoja skladišta) | R (own) |
| Skladišna roba | CRUD | R + issue (scope) | receive | — |
| Naljepnice | ✓ | ✓ | ✓ svoja | own |
| Transferi / Zaduženja | CRUD | CRUD (scope) | — | — |
| Prenosnice | CRUD | R (scope) | — | — |
| Org. promjena | CRUD | R + akcije (scope) | — | — |
| Kontrolna tabla | ✓ | ✓ (scope) | — | — |
| Moja oprema | ✓ | ✓ | ✓ | ✓ |
| QR skener | ✓ | ✓ | ✓ | ✓ |
| Notifikacije | ✓ | ✓ | ✓ | ✓ |
| Settings | CRUD private | R public | R public | R public |

## Cross-service prenos

- Samo `admin` kada je `features.cross_service_transfer = true`.
- Evidentičar: prenos izvan istog para (skladište + kategorija) tretira se kao cross-service (blokada ili flag).

## Upravljanje korisnicima (admin)

| Pravilo | Opis |
|---------|------|
| Pristup | Samo `admin` (`/users` CRUD) |
| Evidentičar | Obavezan `registrarScopes` (≥1 par skladište+kategorija) |
| Režim A/B | `orgUnitId = null` → Režim A (puna evidencija); setovan → Režim B (samo zaduženo + razduženje). Validacija A/B ekskluzivnosti po W+C |

## CHANGELOG

Vidi `CHANGELOG.md` u ovom folderu.
