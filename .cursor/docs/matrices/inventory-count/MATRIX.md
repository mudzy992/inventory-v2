# Matrica: Godišnji popis (v3 — sesija po distribuciji)

## Entiteti

- `InventorySession` = **POPIS za godinu i distribuciju**
  - npr. `POPIS 2026` za `OrgUnit.type = distribucija` (ED Zenica)
- `InventoryCommittee` = **komisija unutar sesije za jednu kategoriju**
  - npr. `Računarska oprema` (s podkategorijama)
- `DisposalCommission` = **komisija rashoda vezana za tu komisiju popisa** (članovi se biraju odvojeno)
- `InventoryLine` = evidencija po opremi unutar komisije (statusi + relocation)
- `InventoryWarehouseCommittee` = **komisija po skladištu** (auto pri aktivaciji sesije)
- `InventoryWarehouseLine` = popis **lotova** (prisutnost + količina)

## Komisija po skladištu (auto)

Pri `activate` sesije, za svako aktivno skladište u gradu distribucije:

- kreira se `InventoryWarehouseCommittee`
- članovi: skladištari (`WarehouseKeeper`) s `User.employeeId` (predsjednik + do 2 člana)
- ako nijedan keeper nema `employeeId`, aktivacija sesije pada s jasnom greškom

Opseg unosa:

- samo `WarehouseStockLot` s `quantityOnHand > 0` na tom skladištu
- statusi linije: `prisutna` | `nije_prisutna` | `ostecena` + `quantityCounted`

Kategorijske komisije i dalje popisuju zaduženu / pojedinačnu opremu (uključujući `skladiste` komade izdanje u sistem).

## Kreiranje sesije (admin)

| Korak | Polje | Pravilo |
|------:|-------|---------|
| 1 | `name` | naziv sesije, npr. `POPIS 2026` |
| 2 | `orgUnitId` | mora biti `OrgUnit.type = distribucija` |
| 3 | `year` | godina popisa |

Ograničenja:
- 1× sesija po `(orgUnitId, year)`
- admin može sesiju **aktivirati** i **zatvoriti**, ali **ne može unositi linije**

## Kreiranje komisije (admin, unutar sesije)

Za svaku kategoriju u distribuciji admin kreira komisiju popisa, i uz nju komisiju rashoda.

| Korak | Polje | Pravilo |
|------:|-------|---------|
| 1 | `categoryId` | tačno 1 roditeljska kategorija (opseg uključuje podkategorije) |
| 2 | `inventoryMembers[]` | 1× predsjednik (**aktivan `User`**) + ≥2× član (mogu biti samo `Employee`) |
| 3 | `disposalMembers[]` | 1× predsjednik (**aktivan `User`**) + ≥2× član (mogu biti samo `Employee`) |
| 4 | auto | kreira se `DisposalCommission` vezana uz komisiju |

Ograničenja:
- 1× komisija po `(sessionId, categoryId)` (poslovno pravilo)

## Ko smije unositi linije

- **Samo članovi popisne komisije** smiju unositi linije za tu komisiju
- admin ne može unositi (samo start/stop sesije)

## Statusi sesije

`draft` → `active` → `closed`

Napomena: pri aktivaciji, ako nema perioda, postavlja se 01.12–31.12 za tu godinu.

## Opseg opreme (scope)

```
sessionCityId = effectiveLocationCityId(session.orgUnitId)

equipment je u opsegu komisije ako:
  equipment.status ≠ rashodovano
  AND equipment.categoryId ∈ expand(committee.categoryId)
  AND resolveEquipmentCityId(equipment) == sessionCityId
```

Evidentičar dodatno mora biti u `registrar scope` (grad+kategorija) u drugim modulima.\n+\n+U Popisu, za unos linija važi: **članstvo komisije** je dovoljno (bez registrar-scope blokade), jer se promjene vode kao `pending` dok je sesija aktivna.

## Statusi linije

| Status | Pravilo |
|--------|---------|
| `prisutna` | pending evidencija |
| `ostecena` | `note` obavezna |
| `nije_prisutna` | `note` obavezna |
| `promjena_lokacije` | cilj: skladište ili osoba → RAW prenosnica odmah + upload tokom sesije; **finalize** na close job |
| `predlozen_rashod` | samo oprema `status=skladiste` (na skladištu); `note` obavezna → pending `disposal` |

Rashod (popisni tok):
- Tokom `active` sesije: **zabranjen** transfer `rashodovanje` van popisa (`InventoryFreezeService`).
- Na close: `disposal` pending → `DisposalInventoryApproval` (status `pending`).
- Predsjednik komisije rashoda odobrava → oprema `rashodovano` + `warehouseCondition=spremno_za_unistenje`.

## Blokada i zatvaranje

| Pravilo | Detalj |
|---------|--------|
| Freeze (`InventoryFreezeService`) | blokira: prijem u skladište, PATCH status/holder/warehouse, transfer create/finalize (osim `inventoryLineId`) |
| Blokada transfera | ista logika — aktivna sesija u gradu opreme |
| Temp/pending promjene | tokom `active` sesije oprema se ne mijenja; pending akcije na close |
| Zatvaranje sesije | obavezan upload za `promjena_lokacije`; `active` → `closing` → async job → `closed` |

## Zaključavanje komisije (popisna lista)

- Zaključavanje se radi **po komisiji** (kategorija) i vrši ga **predsjednik** komisije.
- Zaključana komisija je read-only: ne mogu se snimati linije.
- Zaključavanje služi kao kontrola unosa (read-only) prije zatvaranja sesije.\n+- Stvarne akcije (transfer/rashod) se izvršavaju tek na zatvaranje sesije kroz async job.

## Štampa (A4)

- Odabir: **distribucija → sesija → komisija (kategorija)**
- Zaglavlje: naziv sesije, distribucija, kategorija, godina
- Sadržaj: grupisano po zaduženom radniku (+ sekcija skladište)
- Footer: potpisi komisije, stranica X/Y

## UI (faza 18a)

| Element | Pravilo |
|---------|---------|
| Freeze banner | `GET /inventory-sessions/freeze-banner` → globalni banner u Layout dok postoji `active` sesija u gradu korisnika |
| Command center | agregati: komisije zatvorene/ukupno, linije, prenosnice čekaju upload, greške close job-a |
| Filteri linija | `Samo neevidentirano`, `Čeka prenosnicu`, `Greška primjene` |
| Prenosnica (inventory) | stepper RAW → Upload → Čeka zatvaranje (sesija `active`) → Primijenjeno; finalize blokiran dok je sesija aktivna |
| Mobile | kartice + bottom sheet za prenosnicu (`<md`) |

## API

- `POST /inventory-sessions` — `{ name, orgUnitId, year }` (admin)
- `GET /inventory-sessions?orgUnitId=...` (admin, evidentičar)
- `GET /inventory-sessions/freeze-banner` — aktivne sesije za banner (sve uloge uklj. skladištar)
- `GET /inventory-sessions/:id/committees` (admin, evidentičar, user)
- `POST /inventory-sessions/:id/committees` — `{ categoryId, name?, inventoryMembers, disposalMembers }` (admin)
- `GET /inventory-sessions/committees/:id/print-scope` (admin, evidentičar, user)
- `POST /inventory-sessions/committees/:id/lines` (evidentičar, user; backend provjerava članstvo komisije)
- `GET /inventory-sessions/:id/close-job` (status async zatvaranja)
- `PATCH /inventory-sessions/:id/activate` (admin)
- `PATCH /inventory-sessions/:id/close` (admin)
- `GET /inventory-sessions/:id/report` — zapisnik sesije (JSON)
- `GET /inventory-sessions/:id/disposal-inbox` — inbox predsjednika rashoda
- `GET /inventory-sessions/:id/disposal-report` — zapisnik rashodovanja (JSON + štampa HTML u UI)
- `PATCH /inventory-sessions/disposal-approvals/:id` — `{ approved, note? }`
