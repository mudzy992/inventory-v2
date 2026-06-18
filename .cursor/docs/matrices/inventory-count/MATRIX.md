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
- **globalno** samo jedna otvorena sesija (`draft` | `active` | `closing`); nova se ne može kreirati dok postoji otvorena
- pri kreiranju sesije automatski se generišu slotovi: **sva aktivna skladišta** iz tabele `warehouses` × sve roditeljske `ASSET` kategorije
- svaki slot = `InventoryCommittee` + `DisposalCommission` bez članova (`membersConfigured=false`)
- admin može sesiju **aktivirati** i **zatvoriti**, ali **ne može unositi linije**
- aktivacija zahtijeva da **svi** slotovi imaju `membersConfigured=true`
- aktivacija **odbija** ako postoje stavke na listi za rashod (`listed`) bez dodijeljene komisije

## Auto slotovi (draft sesija)

| Pravilo | Opis |
|---------|------|
| Provisioning | `createSession`, `ensureDraftSessionForDistribution`, `POST reconcile-slots` — **sva aktivna skladišta** (ne org-stablo distribucije) |
| Idempotentnost | ponovni poziv ne duplira `(sessionId, warehouseId, categoryId)` |
| Koordinator | `PATCH committees/:id` dodjeljuje članove; `warehouseId`/`categoryId` read-only |
| Brisanje slota | zabranjeno dok je `membersConfigured=false` |
| Ručni create | `POST committees` samo ako `features.inventory_manual_committee_create=true` |

## Lista za rashod (draft sesija)

| Akcija | Ko | Pravilo |
|--------|-----|---------|
| Označi opremu | evidentičar / admin | samo dok je sesija `draft` |
| Opseg | sistem | postoji slot `(sessionId, warehouseId, parentCategoryId)`; skladište: `equipment.warehouseId`, zatim `stockLot.warehouseId`, registrar dodjela, zadnji transfer `zaduzenje`, org nosioca |
| Eligible sesije | API | `GET eligible-for-equipment/:equipmentId` |
| Auto razduženje | sistem | `zaduzeno` → skladište (prenosnica po postavkama) |
| Povrat s liste | admin | samo `draft`, stavka `listed` |
| Dodjela komisiji | sistem | pri konfiguraciji članova slota (`membersConfigured=true`) |
| Status opreme | sistem | pri označavanju → `za_rashod`; povrat/brisanje sesije → `skladiste`; approve → `rashodovano` |

## Brisanje draft sesije (admin)

- `DELETE /inventory-sessions/:id` — kaskadno briše slotove, listu rashoda, approvals, `DisposalCommission` i ostale veze sesije
- oprema u statusu `za_rashod` zbog liste → vraća se na `skladiste` (izvršena razduženja se ne poništavaju)

## Globalni lock sesije

| Pravilo | Opis |
|---------|------|
| Otvorena | `draft`, `active`, `closing` |
| Kreiranje | blokirano dok postoji bilo koja otvorena sesija u sistemu |
| Scheduler | Jan 1 / lock dan — skip + log ako je lock aktivan |

## Konfiguracija komisije (admin / koordinator, draft sesija)

| Korak | Polje | Pravilo |
|------:|-------|---------|
| 1 | odabir slota | skladište + kategorija (`membersConfigured=false`) |
| 2 | `inventoryMembers[]` | 1× predsjednik (**aktivan `User`**) + ≥2× član |
| 3 | `disposalMembers[]` | isto |
| auto | | `DisposalCommission` već postoji; dodjeljuju se članovi |

Ograničenja:

- 1× komisija po `(sessionId, warehouseId, categoryId)`
- `MAINTENANCE` kategorije nisu u slotovima
- članovi: efektivno skladište zaposlenika = `committee.warehouseId` **ili** `RegistrarAssignment` za to skladište (grad nije kriterij)

## Ko smije unositi linije

- **Samo članovi popisne komisije** smiju unositi linije za tu komisiju
- admin ne može unositi (samo start/stop sesije)

## Statusi sesije

`draft` → `active` → `closing` → `closed`

Napomena: pri aktivaciji, ako nema perioda, postavlja se 01.12–31.12 za tu godinu.

## Opseg opreme (scope)

### Komisija sa skladištem (`warehouseId` postavljen)

```
equipment je u opsegu komisije ako:
  equipment.status ∉ { rashodovano, za_rashod }
  AND category.categoryKind = ASSET
  AND equipment.categoryId ∈ expand(committee.categoryId)
  AND (
    (status == skladiste AND equipment.warehouseId == committee.warehouseId)
    OR
    (status == zaduzeno AND holder.orgUnitId u podstablu warehouse.orgUnitId)
  )
```

Grad nosioca i `Warehouse.cityId` **nisu** kriterij opsega — bitno je samo warehouse coverage (nasljeđivanje efektivnog skladišta u org hijerarhiji).

### Legacy komisija (`warehouseId IS NULL`, read-only)

```
resolveEquipmentCityId(equipment) == effectiveLocationCityId(session.orgUnitId)
```

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
| Wizard (create) | 4 koraka: slot (skladište+kategorija) → popis → rashod → potvrda |
| Wizard (edit) | 2 koraka: samo članovi popisne i rashod komisije; slot (skladište/kategorija) read-only |
| Popisna lista (štampa) | Naziv opreme: `{lot.productName} — {serijski}? — {kategorija}`; bez lota `—`; Kol. prazna; footer 3 potpisne linije na svakoj stranici; bez Grad/Godina u zaglavlju |

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
- `GET /inventory-sessions/eligible-for-equipment/:equipmentId` (evidentičar/admin)
- `POST /inventory-sessions/:id/reconcile-slots` (admin)
- `GET/POST /inventory-sessions/:id/disposal-list` (evidentičar/admin; POST samo draft)
- `DELETE /inventory-sessions/:id/disposal-list/:equipmentId` (admin, draft)

## Inventory freeze (warehouse)

Tokom aktivne sesije ili produkcijskog locka, mutacije su blokirane **po skladištu**, ne po gradu nosioca.

```
equipmentWarehouseId =
  status=skladiste → equipment.warehouseId
  status=zaduzeno  → resolveForEmployee(currentHolderId)

frozen ako postoji aktivna sesija s InventoryCommittee.warehouseId = equipmentWarehouseId
  OR production lock za distribuciju te sesije (warehouse u komisiji)
```

Izuzeci: admin; transfer/akcija s `inventoryLineId`; modul Popis i Komisija rashoda.

API: `GET /inventory-sessions/freeze-banner` — sesije filtrirane po skladištima korisnika (registrar, keeper, efektivno skladište).

## Produkcijski režim (faza 5)

| Pravilo | Opis |
|---------|------|
| `inventory.production_mode=false` | Ponašanje kao ručni režim (faze 1–4) |
| Lock datum | Od `inventory.lock_date` do `closed` sesije: blok warehouse-stock (osim admin) |
| Auto draft | Job kreira `POPIS {year}` po distribuciji (idempotentno) + auto slotovi; ponavlja se i **1.1.** |
| Auto close | Na `session_end_date` — samo ako nema pending `DisposalInventoryApproval` |
| Koordinator | `popis_koordinator` + `InventoryCoordinatorAssignment`: CRUD komisija u draft, bez activate/close sesije |
| Scheduler | `INVENTORY_SCHEDULER_ENABLED=true` + cron `5 0 * * *` (TZ iz postavke) |
- `DELETE /inventory-sessions/:id/disposal-list/:equipmentId` (admin, draft)
