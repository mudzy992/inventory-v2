# Matrica — uloge i pristup

## Uloge

| Uloga | Kod | Opis |
|-------|-----|------|
| Administrator | `admin` | Puna konfiguracija sistema |
| Evidentičar | `evidenticar` | Evidencija u dodijeljenim parovima **skladište + kategorija** (+ opcionalno org suženje) |
| Skladištar | `skladistar` | Evidencija na dodijeljenim skladištima |
| Korisnik | `user` | Pregled vlastitog zaduženja, QR |

## Opseg evidentičara (`RegistrarAssignment`)

| Polje | Pravilo |
|-------|---------|
| `warehouseId` | Skladište dodjele (obavezno) |
| `categoryId` | Root kategorija; scope uključuje sve podkategorije |
| `orgUnitId` | Opcionalno — režim B (suženje na org podstablo) |

### Efektivno skladište (nearest-wins)

Za radnika/org jedinicu: `resolveEffectiveWarehouseId(orgUnitId)` — prvo skladište na org lancu prema korijenu.

- Ako je na **ED Zenica** definisano skladište, ono pokriva cijelo podstablo ispod — **Centralno** (Direkcija) ne vidi tu granu.
- Scope evidentičara za **zaduženo** i **radnike** koristi isti model (ne široko `expandOrgSubtree(warehouse.orgUnitId)`).

### Kanonski scope po entitetu

| Entitet | Režim A (`orgUnitId = null`) | Režim B |
|---------|------------------------------|---------|
| Oprema `skladiste` | `equipment.warehouseId = W` | ne vidi |
| Oprema `zaduzeno` | holder u org jedinicama gdje efektivno skladište = W | + holder u `expand(orgUnitId)` dodjele |
| Oprema `rashodovano` | `equipment.warehouseId = W` | holder u efektivnom W ∩ org podstablo |
| Lot (Skladišna roba) | `lot.warehouseId = W`, kategorija ∈ expand(C); uključuje `0/N` | ne vidi lotove |
| Radnik | efektivno skladište = W | + org ∈ expand(O) |
| Transfer / prenosnica | oprema u scope **OR** `fromPerson`/`toPerson` u scope radnika | isto, suženo |

Implementacija: [`registrar-scope.service.ts`](../../../../backend/src/common/services/registrar-scope.service.ts), [`collect-org-units-for-warehouse.util.ts`](../../../../backend/src/common/utils/collect-org-units-for-warehouse.util.ts).

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
| Režim A/B | `orgUnitId = null` → skladište + zaduženje; setovan → suženje bez skladišne opreme |

## CHANGELOG

Vidi `CHANGELOG.md` u ovom folderu.
