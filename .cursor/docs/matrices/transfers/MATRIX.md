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
| uploaded | Potpisani PDF uploadovan; još nije finalizovan |
| potpisan | Finalizovan; dodijeljen `documentNumber`; equipment ažuriran |
| cancelled | Otkazan |

## Generisanje prenosnica (postavke)

| Ključ | Default | Efekat |
|-------|---------|--------|
| `transfer.generation.enabled` | true | Master: isključeno → blok `POST /transfers`, izdavanje iz lota i draft na popisu |
| `transfer.generation.on_stock_lot_issue` | true | Izdavanje iz lota: uključeno = transfer + prenosnica; isključeno = direktno zaduženje bez transfera (init) |
| `transfer.generation.on_zaduzenje` | true | Skladište → osoba |
| `transfer.generation.on_prenos` | true | Osoba → osoba |
| `transfer.generation.on_razduzenje` | true | Osoba → skladište |
| `transfer.generation.on_rashodovanje` | true | **Zastarjelo** — novi rashod ide preko liste/komisije; `POST /transfers` tip `rashodovanje` blokiran |
| `transfer.generate_print_pdf` | true | DOCX → PDF (LibreOffice `soffice` na serveru) |
| `transfer.require_signed_pdf_upload` | true | Obavezan upload potpisanog PDF prije `sign` |

Init / masovno zaduživanje iz lota bez prenosnica: `transfer.generation.enabled=true`, `transfer.generation.on_stock_lot_issue=false`. Potpuno blokiranje prenosa: `transfer.generation.enabled=false`.

## Word obrazac (po skladištu)

- Upload: `POST /warehouses/:id/transfer-template` (.docx)
- Aktivacija: `PATCH /warehouses/:id/transfer-template/:templateId/activate`
- Skladište mora imati `orgUnitId`
- Placeholderi u .docx: `{broj_prenosnice}`, `{predao}`, `{preuzeo}`, `{potpisnik}`, `{inv_broj}`, `{naziv_opreme}`, `{obrazlozenje}`
- Template putanja: `uploads/templates/warehouses/{warehouseId}/{id}.docx`

## Broj dokumenta

- Format: `{n}/{godina}` (npr. `42/2026`); rashod: `R/{n}/{godina}`
- Brojač: `TransferDocumentSequence` po `documentWarehouseId` + godina (reset svake godine)
- Dodjeljuje se pri `PATCH /transfers/:id/sign`
- Draft: `DRAFT-*` dok je `raw` (u generisanom DOCX za štampu)

## Putanje fajlova (`UPLOAD_DIR`)

| Tip | Putanja |
|-----|---------|
| Generisani DOCX | `prenosnice/{warehouseId}/{godina}/{broj}.docx` |
| Generisani PDF | `prenosnice/{warehouseId}/{godina}/{broj}.pdf` |
| Potpisani sken | `prenosnice/{warehouseId}/{godina}/{broj}-signed.pdf` |

`documentWarehouseId` na transferu: skladište za brojač/putanju (zaduženje → from, razduženje → to, rashod → from/equipment, prenos → equipment/holder warehouse).

## UI — pregled za štampu

- `TransferDocumentPanel`: dugme **Pregled za štampu** → iframe `GET .../generated-document?format=pdf` (odvojeno od pregleda uploadovanog skena).
- Ako PDF nije generisan (LibreOffice / postavka), prikaži poruku i ponudi DOCX download.

## Planirano (kasnije)

- Bulk export ZIP po skladištu/godini: `GET /warehouses/:warehouseId/transfer-documents/export?year=` — **nije implementirano**.

## Inventory popis (`inventoryLineId`)

| Korak UI | Backend |
|----------|---------|
| Štampa | `GET /transfers/:id/generated-document?format=docx\|pdf` (fallback HTML: `raw-document`) |
| Upload | `POST /uploads` (samo PDF) → `uploaded` |
| Čeka zatvaranje | upload OK + sesija `active` — finalize **blokiran** |
| Primijenjeno | close job finalize ili `potpisan` nakon zatvaranja sesije |

## Cross-service

- Detekcija: `detectCrossServiceTransfer` (org stabla, kao frontend prototip)
- `isCrossServiceTransfer=true` → **samo admin**
- Zahtijeva setting `features.cross_service_transfer=true`
- Evidentičar ne može kreirati/potpisati cross-service transfer

## UI — modul Zaduženja (tabovi)

| Tab | Izvor podataka | Svrha |
|-----|----------------|-------|
| Zaduženja | `GET /transfers` (scope) | Historija prenosa + akcije Zaduži/Prenos/Razduži/Rashod |
| Trenutna zaduženja | `GET /equipment?status=zaduzeno` (isti registrar scope kao Oprema) | Pregled trenutno zadužene opreme, uključujući direktno izdavanje iz lota bez prenosnice |
| Prenosnice | `GET /transfers` + dokument workflow | Štampa, upload i potpis prenosnica (`features.documents`) |

- Navigacija: jedan sidebar unos **Zaduženja**; ruta `/documents` preusmjerava na tab Prenosnice (bookmark kompatibilnost).
- Akcije zaduženja i `InventoryFreezeActionHint` samo na tabu Zaduženja.

## API

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| GET | `/backend/transfers` | admin, evidenticar, user (scope) |
| GET | `/backend/transfers/:id` | admin, evidenticar, user (scope) |
| POST | `/backend/transfers` | admin, evidenticar |
| GET | `/backend/transfers/:id/generated-document` | admin, evidenticar |
| GET | `/backend/transfers/:id/raw-document` | admin, evidenticar (fallback HTML) |
| PATCH | `/backend/transfers/:id/sign` | admin, evidenticar |
| POST | `/backend/uploads` | admin, evidenticar (PDF) |
| GET | `/backend/uploads/:id` | admin, evidenticar, user (scope) |

## Scope

Evidentičar: transferi za opremu u istom scope-u kao equipment API.
