# Matrica: Skladišni lot i izdavanje

## Model

- `WarehouseStockLot`: količinski ulaz robe na skladište
- `WarehouseStockLotReceipt`: pojedinačni prijem (ugovor + datum ulaza + količina) unutar lota; služi kao izvor istine za FIFO
- `Equipment.stockLotId`: veza izdanog komada prema lotu

## Statusi lota

| Status | Značenje |
|--------|----------|
| `ceka_specifikaciju` | Prijem skladištara; lot spec nije kompletna (ima obaveznih lot polja) |
| `spremno_za_izdavanje` | Evidentičar popunio obavezna lot polja (`optionalFields`), ili kategorija nema obaveznih lot polja |
| `zatvoreno` | `quantityOnHand = 0` |

## Uloge

| Akcija | skladistar | evidenticar | admin |
|--------|:----------:|:-----------:|:-----:|
| `POST .../stock-lots` (prijem) | ✓ keeper | — | ✓ |
| `PATCH .../specifications` | — | ✓ assignment A | ✓ |
| `POST .../issue` | — | ✓ assignment A | ✓ |
| `POST .../commission` (kolaudacija) | — | ✓ assignment A | ✓ |
| Čitanje lota | ✓ bez spec detalja u listi | ✓ puno | ✓ |

## Validacija polja

- **Lot spec** (`PATCH .../specifications`): polja iz `Category.optionalFields`; obavezna gdje `required = true`
- **Issue** (`POST .../issue`): **sva** polja iz `Category.fields` (unit polja) + globalni `inventoryNumber` + obavezni `affiliation`
- **Kolaudacija** (`POST .../commission`): ista validacija kao issue (sva unit polja + `inventoryNumber` + `affiliation`); **bez** `employeeId`
- Unit polja s `unique: true`: backend provjerava globalnu jedinstvenost pri izdavanju i kolaudaciji
- Pri prijemu lota: ako kategorija nema obaveznih lot polja → status odmah `spremno_za_izdavanje`
- Pri prijemu (po `catalogItemId`) u isto skladište: ako lot već postoji → **uvećava se postojeći lot** (`quantityOnHand/quantityReceived += qty`) i kreira se novi `WarehouseStockLotReceipt` (ugovor/datum važe samo za te komade)
- Issue payload `uniqueSpecifications`: sadrži sva unit polja (legacy ime polja u DTO)

## Izmjena lot specifikacije (evidentičar)

| Status lota | UI | API |
|-------------|-----|-----|
| `ceka_specifikaciju` | Forma + „Sačuvaj specifikaciju" | `PATCH .../specifications` |
| `spremno_za_izdavanje` | Forma + „Sačuvaj izmjene" | `PATCH .../specifications` |
| `zatvoreno` | Samo read-only | odbijeno (400) |

- Izmjena lot spec-a **ne retroaktivno** ažurira već izdatu opremu (snapshot pri `POST .../issue`).
- Freeze u gradu blokira save spec-a (isto kao issue).
- **UI kartica** (collapse): `ceka_specifikaciju` → automatski otvorena; nakon snimanja i na svakom sljedećem otvaranju lota zatvorena; korisnik ručno proširi za izmjenu, snimi → ponovo se zatvara.

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

**FIFO ugovor/datum:** pri `issue` se uzima najstariji `WarehouseStockLotReceipt` sa `quantityRemaining > 0` i taj `(contractNumber, entryDate)` se dodjeljuje kreiranom `Equipment` komadu.

## Kolaudacija (evidentičar)

`POST /stock-lots/:id/commission` — paralelna akcija uz issue, kad je lot `spremno_za_izdavanje` i `quantityOnHand > 0`.

1. Kreira `Equipment` direktno kao `skladiste` + `warehouseCondition: na_skladistu` na skladištu lota
2. **Nema** `Transfer` zapisa ni generisanja prenosnice
3. **Nema** zaduženja (`currentHolderId` null)
4. `quantityOnHand -= 1`; lot `zatvoreno` kad `quantityOnHand = 0`

**FIFO ugovor/datum:** pri `commission` se uzima najstariji `WarehouseStockLotReceipt` sa `quantityRemaining > 0` i taj `(contractNumber, entryDate)` se dodjeljuje kreiranom `Equipment` komadu.

**UI:** na detail lota dugmad „Izdaj 1 komad" i „Kolaudiraj 1 komad"; zajednička forma za inventurni broj i unit polja (`lot-unit-action-section.tsx`).

**Ograničenja:** nema cross-warehouse logike; freeze `stock_lot_issue` (isti kao issue).

Implementacija: [`finalize-stock-lot-commission.util.ts`](../../../../backend/src/modules/warehouse-stock/utils/finalize-stock-lot-commission.util.ts).

## Cross-warehouse izdavanje (admin)

Postavka: `transfer.allow_admin_cross_warehouse_issue` (private, default `false`).

Kad admin izda komad iz lota skladišta **W1** na radnika čije efektivno skladište je **W2 ≠ W1**:

1. Standardni issue (`zaduzenje` prenosnica iz W1 ako je uključena generacija)
2. Izvorni lot: `quantityOnHand -= 1`, `quantityReceived -= 1`
3. Ciljni lot na W2: **kanonski** lot po `catalogItemId` (`resolveCanonicalDestLotInTx`: otvoren → zadnji zatvoren reopen → create)
4. Ciljni lot: `quantityReceived += 1` (za `zaduzeno` bez `quantityOnHand` promjene → izdato +1)
5. `equipment.stockLotId` prelazi na ciljni lot; spec nasljeđivanje kao kod relocation dest-accept
6. Destinacijski lot: ako `quantityOnHand = 0` i `quantityReceived > 0` → `status = zatvoreno` (`maybeCloseDispatchedRelocationLotInTx`)
7. Sljedeći dispatch na isto skladište + isti tip: **isti kanonski lot** se reopen-uje i `quantityReceived += 1` (bez duplikata)

**Ograničenja:**

- Samo `admin`; evidentičar uvijek odbijen za cross-warehouse issue
- Obavezan `catalogItemId` na izvornom lotu
- Freeze provjera za grad izvornog i ciljnog skladišta

Implementacija: [`cross-warehouse-issue.util.ts`](../../../../backend/src/modules/warehouse-stock/utils/cross-warehouse-issue.util.ts), [`resolve-canonical-dest-lot.util.ts`](../../../../backend/src/modules/warehouse-stock/utils/resolve-canonical-dest-lot.util.ts).

## Notifikacije

- `warehouse_stock_received` → evidentičari s `RegistrarAssignment` za `(warehouseId, categoryId)`

## Freeze

- Tokom aktivnog popisa u gradu: blokiran `stock_lot_create` i `stock_lot_issue`

## Lista dodijeljene robe (evidentičar / admin)

| Endpoint | Opis |
|----------|------|
| `GET /warehouse-stock/assigned/groups` | Paginirani **grupni** prikaz po proizvodu (`catalogItemId` ili `categoryId` + `productName`) |
| `GET /warehouse-stock/assigned` | Pojedinačni lotovi; filter `groupKey` za expand grupe |

**Query filteri** (oba endpointa): `search`, `warehouseId`, `categoryId`, `status` (`ceka_specifikaciju` | `spremno_za_izdavanje` | `zatvoreno`), `groupKey` (samo flat lista).

**Default lista:** samo aktivni lotovi (`ceka_specifikaciju`, `spremno_za_izdavanje`). Filter `status=zatvoreno` → arhiva.

**Grupna agregacija** (`GET .../assigned/groups`):

| Metrika | Izvor |
|---------|--------|
| `totalOnHand`, `awaitingSpecCount`, `readyToIssueCount` | samo aktivni lotovi u grupi |
| `totalReceived`, `warehouseCount` | svi lotovi u grupi (uključujući `zatvoreno`) kad nema status filtera |
| Grupa u default listi | barem jedan aktivni lot |

Kad su svi lotovi u grupi `zatvoreno`, grupa **ne ulazi** u default pregled.

**Grupni ključ:**

- `catalog:{uuid}` kad postoji `catalogItemId`
- `product:{categoryId}::{normalizedProductName}` inače

**UI (Skladišna roba — `registrar-stock`):** kategorijsko razvrstavanje parent → podkategorija → grupe proizvoda (accordion) → redovi po skladištu → detail lota (spec/issue/kolaudacija). Filteri skladišta i statusa (uključujući **Zatvoreno** za arhivu); grupni red `onHand/received na stanju`.

**Frontend URL rutiranje:** React Router; deep link na lot `/registrar-stock/lots/:lotId`; ostale stranice `/dashboard`, `/registrar-stock`, itd. Javna oprema `/equipment/:equipmentId` bez prijave.

**Frontend bundle:** route-level `React.lazy` + `Suspense` (po stranici chunk); prefetch chunka na hover/focus navigacije; vendor split (`react`, `react-router`, `lucide`, `socket.io`).

**UI (Skladište — pregled ASSET lotova):** isti browse pattern (`warehouse-stock-browse-panel`).

**UI (Skladište — zalihe održavanje):** browse parent → podkategorija → tabela MAINTENANCE lotova (`warehouse-maintenance-stock-panel`).

**Shared browse:** `category-browse-breadcrumb`, `category-parent-grid`, `category-sub-grid`, `category-browse-stats.util`.

## Dijalozi (frontend)

- Form modali koriste `ModalRoot` sa default `closeOnBackdrop=false` i `enableEscape=false`.
- Zatvaranje isključivo eksplicitnim dugmetom (Odustani / Zatvori / X).

## Izdata oprema (detail lota)

- `issuedUnits` uključuje `currentHolder` (ime, org jedinica) za prikaz zaduženja i link na detalj opreme.
- Kolaudirani komadi (`status: skladiste`, bez `currentHolder`): u koloni nosioca prikazuje se ime skladišta lota.
