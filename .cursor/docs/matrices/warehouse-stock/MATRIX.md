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

## Notifikacije

- `warehouse_stock_received` → evidentičari s `RegistrarAssignment` za `(warehouseId, categoryId)`

## Freeze

- Tokom aktivnog popisa u gradu: blokiran `stock_lot_create` i `stock_lot_issue`
