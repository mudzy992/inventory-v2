# Matrica — transferi

## Tipovi transfera

| Tip | From | To | Equipment efekat (na potpis) |
|-----|------|-----|------------------------------|
| zaduzenje | skladiste | osoba | status=zaduzeno, holder=toPerson |
| razduzenje | osoba | skladiste | status=skladiste, holder=null |
| rashodovanje | skladiste/osoba | rashod | status=rashodovano, holder=null |
| prenos | osoba | osoba | holder=toPerson |

## Status dokumenta

| Status | Značenje |
|--------|----------|
| raw | Kreiran, equipment se ne mijenja do potpisa |
| printed | Označen štampan (opciono) |
| uploaded | Sken uploadovan; još nije finalizovan |
| potpisan | Finalizovan; dodijeljen `documentNumber`; equipment ažuriran |
| cancelled | Otkazan |

## Inventory popis (`inventoryLineId`)

| Korak UI | Backend |
|----------|---------|
| RAW | `GET /transfers/:id/raw-document`; status `raw`/`printed` |
| Upload | `POST /uploads` → `uploaded` |
| Čeka zatvaranje | upload OK + sesija `active` — finalize **blokiran** |
| Primijenjeno | close job finalize ili `potpisan` nakon zatvaranja sesije |

## Broj dokumenta

- Format: `PRN-{godina}-{seq}` (4 znamenke)
- Rashod: `PRN-{godina}-RASH-{seq}`
- Dodjeljuje se pri `PATCH /backend/transfers/:id/sign`
- Draft: `DRAFT-{timestamp}` dok je `raw`

## Cross-service

- Detekcija: `detectCrossServiceTransfer` (org stabla, kao frontend prototip)
- `isCrossServiceTransfer=true` → **samo admin**
- Zahtijeva setting `features.cross_service_transfer=true`
- Evidentičar ne može kreirati/potpisati cross-service transfer

## Upload

- `POST /backend/uploads` — multipart `file` + `transferId`
- Putanja: `uploads/transfers/{godina}/{transferId}.{ext}`
- `scannedDocUrl` na transferu = relativna putanja
- `GET /backend/uploads/:id` — preuzimanje (uz auth + scope transfera)

## API (faza 3)

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| GET | `/backend/transfers` | admin, evidenticar, user (scope) |
| GET | `/backend/transfers/:id` | admin, evidenticar, user (scope) |
| POST | `/backend/transfers` | admin, evidenticar |
| PATCH | `/backend/transfers/:id/sign` | admin, evidenticar |
| POST | `/backend/uploads` | admin, evidenticar |
| GET | `/backend/uploads/:id` | admin, evidenticar, user (scope) |

## Scope

Evidentičar: transferi za opremu u istom scope-u kao equipment API.
