# Matrica — oprema i statusi

## Statusi

| Status | Značenje |
|--------|----------|
| `skladiste` | Na skladištu, bez zaduženja |
| `zaduzeno` | Zaduženo (`currentHolderId`) |
| `za_rashod` | Na listi za rashod (draft sesija); čeka odluku komisije |
| `rashodovano` | Rashodovano |

## `warehouseCondition` (kada je oprema u skladištu ili rashod u skladištu)

| Vrijednost | Značenje |
|------------|----------|
| `na_skladistu` | Normalno na skladištu ili rashod primljen u skladište |
| `spremno_za_unistenje` | Legacy — odobreno prije novog toka; skladištar može `destroy-equipment` |
| `unisteno` | Službeni otpis komisije rashoda (novi tok) ili legacy destroy |

## Pretraga opreme

- `GET /equipment?search=` — inv. broj, ugovor, bilješke + `contains` u JSON specifikaciji
- `GET /equipment?affiliation=` — filter po pripadnosti (`distribucija` | `snabdjevanje`)
- `specFieldId` + `specValue` — tačan match jednog polja specifikacije
- uz `categoryId` + `search` — pretraga samo po text poljima te kategorije

## Pripadnost (`affiliation`)

| Vrijednost | UI label | Default |
|------------|----------|---------|
| `distribucija` | Distribucija | da (postojeća oprema + forma izdavanja) |
| `snabdjevanje` | Snabdjevanje | — |

- Obavezno pri **issue** i **commission** iz lota (uz `inventoryNumber`)
- Izmjenjivo naknadno kroz `PATCH /equipment/:id` (admin/evidentičar u scope-u)
- Prikaz i filter na listama opreme (`EquipmentPage`, `EquipmentByCategoryPage`)

## Reaktivacija (admin)

- `POST /equipment/:id/reactivate` — `rashodovano` + `unisteno` → `skladiste` + `na_skladistu`, audit `EquipmentEvent.reaktivirano`

## Transfer finalize — warehouseCondition

- `razduzenje` → `na_skladistu`
- Transfer `rashodovanje` — **blokiran** za nove unose (koristiti listu za rashod)

## Pristup po ulozi

| Uloga | Čitanje | Pisanje |
|-------|---------|---------|
| admin | sve | update/delete; nema `POST /equipment` |
| skladistar | `skladiste` / rashod u keeper skladištima; lotovi preko warehouse-stock API | nema `Equipment` create; uništenje preko destroy API |
| evidenticar | scope A/B (`RegistrarAssignment`) | update u scope-u; nema `POST /equipment` |
| user | samo vlastito zaduženje | — |

## Nastanak opreme

- Pojedinačni `Equipment` nastaje iz `WarehouseStockLot` (evidentičar/admin), s `stockLotId`:
  - **Issue** (`POST .../issue`): zaduženje na radnika (`zaduzeno`), opciono transfer `zaduzenje`
  - **Kolaudacija** (`POST .../commission`): ostaje na skladištu (`skladiste` + `na_skladistu`), bez transfera
- `POST /equipment` — zabranjen za sve uloge (403); prijem robe = stock lot, ne direktan unos opreme
- UI modul **Oprema**: samo pregled i uređivanje postojećih stavki; nova oprema preko Skladišta → prijem → lot → izdavanje ili kolaudacija

## Knjigovodstveno vođena oprema (`isAccountingTracked`)

| Vrijednost | `inventoryNumber` | Prenosnice | Popis | Rashod |
|------------|-------------------|------------|-------|--------|
| `true` (default) | obavezan, unique | prema postavci | u opsegu | dozvoljeno |
| `false` (evidencijska) | `null` | uvijek direct, bez dokumenta | isključeno | isključeno |

**Invarijante (backend):**

- Samo **nadogradnja**: `false → true` uz novi unique `inventoryNumber`; zabranjeno uklanjanje broja / `true → false`
- Helper: `requiresTransferDocument` = `isInventoryCountable` = `isDisposalEligible` = `isAccountingTracked && inventoryNumber != null`
- Izvor: `equipment-accounting-tracked.util.ts` (BE + FE mirror)

**API:**

- Issue/commission: `isAccountingTracked?` (default true); `inventoryNumber` obavezan samo kad tracked
- `PATCH /equipment/:id` — upgrade-only za accounting polja
- `GET /equipment?isAccountingTracked=` — filter

**UI:**

- Izdavanje iz lota: toggle „Oprema se vodi“
- Liste: badge „Evidencijska“, filter knjigovodstveno/evidencijska
- Edit: sekcija „Dodaj inventurni broj“ za evidencijsku opremu

## Ostalo

- `inventoryNumber` — unique u bazi kad postoji; više `NULL` dozvoljeno (evidencijska)
- `GET /backend/equipment/:id/qr` — `{ id, inventoryNumber, url }` (`inventoryNumber` može biti `null`)
- Oprema samo na **leaf** kategoriji
