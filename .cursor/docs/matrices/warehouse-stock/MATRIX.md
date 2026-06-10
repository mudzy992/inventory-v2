# Matrica: Skladišni lot i izdavanje

## Model

- `WarehouseStockLot`: količinski ulaz robe na skladište
- `Equipment.stockLotId`: veza izdanog komada prema lotu

## Statusi lota

| Status | Značenje |
|--------|----------|
| `ceka_specifikaciju` | Prijem skladištara, spec prazna |
| `spremno_za_izdavanje` | Evidentičar popunio non-unique polja kategorije |
| `zatvoreno` | `quantityOnHand = 0` |

## Uloge

| Akcija | skladistar | evidenticar | admin |
|--------|:----------:|:-----------:|:-----:|
| `POST .../stock-lots` (prijem) | ✓ keeper | — | ✓ |
| `PATCH .../specifications` | — | ✓ assignment A | ✓ |
| `POST .../issue` | — | ✓ assignment A | ✓ |
| Čitanje lota | ✓ bez spec detalja u listi | ✓ puno | ✓ |

## Validacija polja

- **Lot spec**: obavezna polja kategorije gdje `unique = false`
- **Issue**: obavezna polja gdje `unique = true` + globalni `inventoryNumber`

## Izdavanje

**S prenosnicom** (`transfer.generation.on_stock_lot_issue=true`, default):

1. Kreira `Equipment` (`skladiste` + `warehouseId`) u transakciji
2. Kreira i finalizira transfer `zaduzenje` → `zaduzeno`, `warehouseId` null
3. Generiše DOCX/PDF prenosnice (ako postoji template)
4. `quantityOnHand -= 1`

**Bez prenosnice** (`on_stock_lot_issue=false`, globalno uključeno):

1. Kreira `Equipment` direktno kao `zaduzeno` s `currentHolderId`
2. Nema `Transfer` zapisa ni generisanja dokumenta
3. `quantityOnHand -= 1`

## Cross-warehouse izdavanje (admin)

Postavka: `transfer.allow_admin_cross_warehouse_issue` (private, default `false`).

Kad admin izda komad iz lota skladišta **W1** na radnika čije efektivno skladište je **W2 ≠ W1**:

1. Standardni issue (`zaduzenje` prenosnica iz W1 ako je uključena generacija)
2. Izvorni lot: `quantityOnHand -= 1`, `quantityReceived -= 1`
3. Ciljni lot na W2: pronađi otvoreni lot po `catalogItemId` ili kreiraj `incomingRelocation` lot
4. Ciljni lot: `quantityReceived += 1` (za `zaduzeno` bez `quantityOnHand` promjene → izdato +1)
5. `equipment.stockLotId` prelazi na ciljni lot; spec nasljeđivanje kao kod relocation dest-accept

**Ograničenja:**

- Samo `admin`; evidentičar uvijek odbijen za cross-warehouse issue
- Obavezan `catalogItemId` na izvornom lotu
- Freeze provjera za grad izvornog i ciljnog skladišta

Implementacija: [`cross-warehouse-issue.util.ts`](../../../../backend/src/modules/warehouse-stock/utils/cross-warehouse-issue.util.ts).

## Notifikacije

- `warehouse_stock_received` → evidentičari s `RegistrarAssignment` za `(warehouseId, categoryId)`

## Freeze

- Tokom aktivnog popisa u gradu: blokiran `stock_lot_create` i `stock_lot_issue`

## Lista dodijeljene robe (evidentičar / admin)

| Endpoint | Opis |
|----------|------|
| `GET /warehouse-stock/assigned/groups` | Paginirani **grupni** prikaz po proizvodu (`catalogItemId` ili `categoryId` + `productName`) |
| `GET /warehouse-stock/assigned` | Pojedinačni lotovi; filter `groupKey` za expand grupe |

**Query filteri** (oba endpointa): `search`, `warehouseId`, `categoryId`, `status`, `groupKey` (samo flat lista).

**Grupni ključ:**

- `catalog:{uuid}` kad postoji `catalogItemId`
- `product:{categoryId}::{normalizedProductName}` inače

**UI:** accordion grupa → redovi po skladištu → detail lota (postojeći tok spec/issue).

## Izdata oprema (detail lota)

- `issuedUnits` uključuje `currentHolder` (ime, org jedinica) za prikaz zaduženja i link na detalj opreme.
