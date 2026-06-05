# Matrica: Godišnji popis (v4 — komisije po skladištu)

## Entiteti

- `InventorySession` = **POPIS za godinu i distribuciju**
  - npr. `POPIS 2026` za `OrgUnit.type = distribucija` (ED Zenica)
- `InventoryCommittee` = **komisija unutar sesije za skladište + jednu kategoriju**
  - npr. `Skladište Zenica — Računarska oprema` (s podkategorijama)
- `DisposalCommission` = **komisija rashoda vezana za tu komisiju popisa** (članovi se biraju odvojeno)
- `InventoryLine` = evidencija po opremi unutar komisije (statusi + relocation)
- `InventoryWarehouseCommittee` = **komisija po skladištu za lotove** (auto pri aktivaciji sesije)
- `InventoryWarehouseLine` = popis **lotova** (prisutnost + količina)

## Komisija po skladištu (auto — lotovi)

Pri `activate` sesije, za svako aktivno skladište u gradu distribucije:

- kreira se `InventoryWarehouseCommittee`
- članovi: skladištari (`WarehouseKeeper`) s `User.employeeId` (predsjednik + do 2 člana)
- ako nijedan keeper nema `employeeId`, aktivacija sesije pada s jasnom greškom

Opseg unosa:

- samo `WarehouseStockLot` s `quantityOnHand > 0` na tom skladištu
- statusi linije: `prisutna` | `nije_prisutna` | `ostecena` + `quantityCounted`

## Kreiranje sesije (admin)

| Korak | Polje | Pravilo |
|------:|-------|---------|
| 1 | `name` | naziv sesije, npr. `POPIS 2026` |
| 2 | `orgUnitId` | mora biti `OrgUnit.type = distribucija` |
| 3 | `year` | godina popisa |

Ograničenja:

- 1× sesija po `(orgUnitId, year)`
- admin može sesiju **aktivirati** i **zatvoriti**, ali **ne može unositi linije**
- aktivacija zahtijeva ≥1 popisnu komisiju (`InventoryCommittee`)

## Kreiranje komisije (admin, draft sesija)

| Korak | Polje | Pravilo |
|------:|-------|---------|
| 1 | `warehouseId` | aktivno skladište u org opsegu distribucije (podružnice u drugim gradovima uključene) |
| 2 | `categoryId` | roditeljska `ASSET` kategorija (prikaz i s 0 opreme u opsegu); broj komada informativan |
| 3 | `inventoryMembers[]` | 1× predsjednik (**aktivan `User`**) + ≥2× član; samo zaposlenici eligible za skladište |
| 4 | `disposalMembers[]` | isto |
| 5 | auto | kreira se `DisposalCommission` vezana uz komisiju |

Ograničenja:

- 1× komisija po `(sessionId, warehouseId, categoryId)`
- `MAINTENANCE` kategorije nisu dostupne
- članovi: u gradu skladišta i (warehouse coverage **ili** `RegistrarAssignment` za skladište)

## Ko smije unositi linije

- **Samo članovi popisne komisije** smiju unositi linije za tu komisiju
- admin ne može unositi (samo start/stop sesije)

## Statusi sesije

`draft` → `active` → `closing` → `closed`

Napomena: pri aktivaciji, ako nema perioda, postavlja se 01.12–31.12 za tu godinu.

## Opseg opreme (scope)

```
sessionCityId = effectiveLocationCityId(session.orgUnitId)

equipment je u opsegu komisije ako:
  equipment.status ≠ rashodovano
  AND category.categoryKind = ASSET
  AND equipment.categoryId ∈ expand(committee.categoryId)
  AND resolveEquipmentCityId(equipment) == sessionCityId
  AND (
    (status == skladiste AND equipment.warehouseId == committee.warehouseId)
    OR
    (status == zaduzeno AND holder u warehouse coverage)
  )
```

Legacy (`warehouseId IS NULL` na starim komisijama): opseg ostaje city-wide (read-only).

U Popisu, za unos linija važi: **članstvo komisije** je dovoljno (bez registrar-scope blokade), jer se promjene vode kao `pending` dok je sesija aktivna.

## Statusi linije

| Status | Pravilo |
|--------|---------|
| `prisutna` | pending evidencija |
| `ostecena` | `note` obavezna |
| `nije_prisutna` | `note` obavezna |
| `promjena_lokacije` | cilj: skladište ili osoba → RAW prenosnica odmah + upload tokom sesije; **finalize** na close job |
| `predlozen_rashod` | samo oprema `status=skladiste` (na skladištu); `note` obavezna → pending `disposal` |

## UI (admin)

| Element | Pravilo |
|---------|---------|
| Empty state | bez sesija → centrirana poruka + forma kreiranja |
| Sesije | lista sa statusom; command center za odabranu |
| Komisije | grupisane po skladištu; detalj s članovima i rashod komisijom |
| Wizard | 5 koraka: skladište → kategorija → popis → rashod → potvrda |

## API

- `POST /inventory-sessions` — `{ name, orgUnitId, year }` (admin)
- `GET /inventory-sessions?orgUnitId=...` (admin, evidentičar, user)
- `GET /inventory-sessions/:id/session-warehouses` (admin)
- `GET /inventory-sessions/:id/committees/setup-options?warehouseId=` (admin, draft)
- `GET /inventory-sessions/:id/committees` (admin, evidentičar, user)
- `POST /inventory-sessions/:id/committees` — `{ warehouseId, categoryId, name?, inventoryMembers, disposalMembers }` (admin)
- `GET /inventory-sessions/committees/:id/print-scope` (admin, evidentičar, user)
- `POST /inventory-sessions/committees/:id/lines` (evidentičar, user)
- `PATCH /inventory-sessions/:id/activate` (admin)
- `PATCH /inventory-sessions/:id/close` (admin)
