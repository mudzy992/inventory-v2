# Matrica — oprema i statusi

## Statusi

| Status | Značenje |
|--------|----------|
| `skladiste` | Na skladištu, bez zaduženja |
| `zaduzeno` | Zaduženo (`currentHolderId`) |
| `rashodovano` | Rashodovano |

## `warehouseCondition` (kada je oprema u skladištu ili rashod u skladištu)

| Vrijednost | Značenje |
|------------|----------|
| `na_skladistu` | Normalno na skladištu ili rashod primljen u skladište |
| `spremno_za_unistenje` | Odobreno za uništenje (komisija rashoda, faza 17) |
| `unisteno` | Finalno uništeno (skladištar `destroy-equipment`) |

## Pristup po ulozi

| Uloga | Čitanje | Pisanje |
|-------|---------|---------|
| admin | sve | sve (+ delete) |
| skladistar | `skladiste` / rashod u keeper skladištima; lotovi preko warehouse-stock API | nema `Equipment` create; uništenje preko destroy API |
| evidenticar | scope A/B (`RegistrarAssignment`) | u scope-u (ne skladišna oprema u režimu B) |
| user | samo vlastito zaduženje | — |

## Transfer finalize — warehouseCondition

- `razduzenje` → `na_skladistu`
- `rashodovanje` → `na_skladistu` (spremno_za_unistenje postavlja faza 17)

## Nastanak opreme

- Pojedinačni `Equipment` nastaje pri **issue** iz `WarehouseStockLot` (evidentičar), s `stockLotId` i transferom `zaduzenje`
- Skladištar ne kreira `Equipment` direktno

## Ostalo

- `inventoryNumber` — unique u bazi
- `GET /backend/equipment/:id/qr` — `{ id, inventoryNumber, url }`
- Oprema samo na **leaf** kategoriji
