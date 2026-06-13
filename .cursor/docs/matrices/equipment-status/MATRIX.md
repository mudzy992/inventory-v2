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
| admin | sve | update/delete; nema `POST /equipment` |
| skladistar | `skladiste` / rashod u keeper skladištima; lotovi preko warehouse-stock API | nema `Equipment` create; uništenje preko destroy API |
| evidenticar | scope A/B (`RegistrarAssignment`) | update u scope-u; nema `POST /equipment` |
| user | samo vlastito zaduženje | — |

## Transfer finalize — warehouseCondition

- `razduzenje` → `na_skladistu`
- `rashodovanje` → `na_skladistu` (spremno_za_unistenje postavlja faza 17)

## Nastanak opreme

- Pojedinačni `Equipment` nastaje iz `WarehouseStockLot` (evidentičar/admin), s `stockLotId`:
  - **Issue** (`POST .../issue`): zaduženje na radnika (`zaduzeno`), opciono transfer `zaduzenje`
  - **Kolaudacija** (`POST .../commission`): ostaje na skladištu (`skladiste` + `na_skladistu`), bez transfera
- `POST /equipment` — zabranjen za sve uloge (403); prijem robe = stock lot, ne direktan unos opreme
- UI modul **Oprema**: samo pregled i uređivanje postojećih stavki; nova oprema preko Skladišta → prijem → lot → izdavanje ili kolaudacija

## Ostalo

- `inventoryNumber` — unique u bazi
- `GET /backend/equipment/:id/qr` — `{ id, inventoryNumber, url }`
- Oprema samo na **leaf** kategoriji
