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

## Prenos opreme vs. prenosnica (postavke)

| Sloj | Ključ | Isključeno = |
|------|-------|--------------|
| Modul | `features.transfers` | Blokira sve prenose opreme (API, lot issue, popis relocation) |
| Dokument | `transfer.generation.enabled` | Nema prenosnica nigdje; prenosi opreme i dalje rade (direktno) |
| Dokument po tipu | `transfer.generation.on_*` | Nema prenosnice za taj tip; prenos opreme direktno |

`POST /transfers` vraća `{ mode: 'document', transfer }` ili `{ mode: 'direct', equipment }`.

## Evidencijska oprema (bez inv. broja)

- `requiresTransferDocument(equipment)` mora biti `true` da bi se kreirao dokument; inače **uvijek direct** (isti tok kao kad je `transfer.generation.enabled=false`).
- Vrijedi za `POST /transfers`, lot issue (evidencijska) i popis relocation (defense-in-depth).

## Generisanje prenosnica (postavke)

| Ključ | Default | Efekat |
|-------|---------|--------|
| `transfer.generation.enabled` | true | Master dokumenta: isključeno → svi tipovi bez prenosnice (direktan prenos opreme) |
| `transfer.generation.on_stock_lot_issue` | true | Lot: uključeno = transfer + prenosnica; isključeno = direktno zaduženje |
| `transfer.generation.on_zaduzenje` | true | Skladište → osoba: dokument ili direktno |
| `transfer.generation.on_prenos` | true | Osoba → osoba: dokument ili direktno |
| `transfer.generation.on_razduzenje` | true | Osoba → skladište: dokument ili direktno |
| `transfer.generate_print_pdf` | true | DOCX → PDF (LibreOffice `soffice` u backend Docker kontejneru) |
| `transfer.require_signed_pdf_upload` | true | Obavezan upload potpisanog PDF prije `sign` (samo dokument flow) |

Potpuno blokiranje prenosa opreme: `features.transfers=false`. Init bez prenosnica iz lota: `on_stock_lot_issue=false` (master može ostati uključen).

## Word obrazac (po skladištu)

- Upload: `POST /warehouses/:id/transfer-template` (.docx) — **validacija placeholdera + dry-run render**; upload **automatski aktivira** novu verziju.
- Aktivacija ručno: `PATCH /warehouses/:id/transfer-template/:templateId/activate` (ponovna validacija fajla na disku).
- Skladište mora imati `orgUnitId`; `POST /transfers` (document mode) **odbija** create ako skladište nema aktivni obrazac.
- Placeholderi u .docx: `{broj_prenosnice}`, `{predao}`, `{preuzeo}`, `{potpisnik}`, `{inv_broj}`, `{naziv_opreme}`, `{obrazlozenje}` (jednostruke vitičaste zagrade).
- Template putanja: `uploads/templates/warehouses/{warehouseId}/{id}.docx`

## Broj dokumenta

- Format: `{n}-{mm}/{godina}` (npr. `1-01/2026`, `42-06/2026`); rashod: `R/{n}-{mm}/{godina}`
- Brojač: `TransferDocumentSequence` po `documentWarehouseId` + godina + **mjesec** (reset svakog mjeseca na 1; nova godina počinje od 1)
- Dodjeljuje se pri **kreiranju** transfera (document mode) — odmah vidljiv na štampi
- Pri finalizaciji zadržava postojeći broj (osim legacy `DRAFT-*` / `PRN-*`)

## Putanje fajlova (`UPLOAD_DIR`)

| Tip | Putanja |
|-----|---------|
| Generisani DOCX | `prenosnice/{warehouseId}/{godina}/{broj}.docx` |
| Generisani PDF | `prenosnice/{warehouseId}/{godina}/{broj}.pdf` |
| Potpisani sken | `prenosnice/{warehouseId}/{godina}/{broj}-signed.pdf` |

`documentWarehouseId` na transferu: skladište za brojač/putanju/template (zaduženje → from, razduženje → to, rashod → from/equipment, **prenos → effective warehouse osobe koja predaje, zatim registrar assignment, zatim equipment warehouse**).

## UI — pregled za štampu

- `TransferDocumentPanel` i tab **Prenosnice**: **Preuzmi obrazac** / **Pregled za štampu** koriste `GET .../generated-document?format=docx|pdf` (Word template skladišta).
- Nema HTML fallback-a pri downloadu generisanog obrasca; greška prikazuje poruku (npr. nedostaje aktivni template).
- Ako PDF nije generisan (LibreOffice / postavka), prikaži poruku i ponudi DOCX download.
- Tabovi **Zaduženja** i **Prenosnice**: klik na red otvara `TransferDocumentDrawer` (desktop: desni drawer; mobile: bottom sheet) s automatskim PDF pregledom (`generated` na Na čekanju, `signed` na Potpisano).
- Inventory popis i `EquipmentCard` zadržavaju inline `TransferDocumentPanel`.

## Deploy — LibreOffice + UTF-8

- Backend image: `node:22-bookworm-slim`; runner instalira `libreoffice-writer`, `libreoffice-common`, `fontconfig`, `fonts-dejavu-core`, `fonts-liberation`, `fonts-noto-core`; app korisnik uid **100** / gid **101**.
- Bind mount `/mnt/shared-app-files/inventory-v2` → `/app/uploads`: pokrenuti `./scripts/fix-upload-permissions.sh` ako `soffice` javlja **Access Code 7** (nema write prava u `prenosnice/`).
- Env: `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`; `soffice` child proces isti env.
- Aktivni `.docx` obrazac treba koristiti font dostupan u kontejneru (DejaVu Sans, Liberation Sans, Calibri uz substitution) — ne egzotične fontove.
- Smoke nakon deploya: `docker compose exec backend which soffice`.
- PDF konverzija: LibreOffice piše `{broj}.pdf` u isti folder kao DOCX; ako PDF nedostaje u bazi, `GET ...?format=pdf` pokušava konvertovati iz postojećeg DOCX.
- Starije prenosnice: pri prvom `GET .../generated-document` backend poziva `ensureGeneratedArtifacts` — regeneriše DOCX iz aktivnog templatea ako nedostaje, zatim PDF iz DOCX-a.

## Planirano (kasnije)

- Bulk export ZIP po skladištu/godini: `GET /warehouses/:warehouseId/transfer-documents/export?year=` — **nije implementirano**.

## Inventory popis (`inventoryLineId`)

| Korak UI | Backend |
|----------|---------|
| Štampa | `GET /transfers/:id/generated-document?format=docx\|pdf` |
| Upload | `POST /uploads` (samo PDF) → `uploaded` |
| Čeka zatvaranje | upload OK + sesija `active` — finalize **blokiran** (samo dokument flow) |
| Primijenjeno | close job finalize (dokument) ili direktna promjena opreme (bez dokumenta) |

## Cross-service

- Detekcija: `detectCrossServiceTransfer` (org stabla, kao frontend prototip)
- `isCrossServiceTransfer=true` → **samo admin**
- Zahtijeva setting `features.cross_service_transfer=true`
- Evidentičar ne može kreirati/potpisati cross-service transfer

## UI — modul Zaduženja (tabovi)

| Tab | Izvor podataka | Svrha |
|-----|----------------|-------|
| Zaduženja | `GET /transfers?workflow=pending\|signed` (scope) | Historija prenosa + pod-tabovi Na čekanju (badge) / Potpisano; detalji u dijalogu |
| Trenutna zaduženja | `GET /equipment?status=zaduzeno` (isti registrar scope kao Oprema) | Pregled trenutno zadužene opreme; klik otvara `EquipmentCard` |
| Prenosnice | `GET /transfers?workflow=…` + dokument workflow | Kompaktna tabela (desktop) / kartice (mobile); pod-tabovi Čeka obradu / Potpisano |

- Navigacija: jedan sidebar unos **Zaduženja**; ruta `/documents` preusmjerava na tab Prenosnice (bookmark kompatibilnost).
- Akcije zaduženja i `InventoryFreezeActionHint` samo na tabu Zaduženja.
- Tab **Zaduženja**: pod-tab **Na čekanju** (`workflow=pending`, statusi `raw|printed|uploaded`) s badge brojem; **Potpisano** (`workflow=signed`). Klik na red otvara `TransferDocumentDrawer` s auto PDF pregledom.
- Tab **Prenosnice**: isti `workflow` filter i drawer; uklonjeni page-local summary chipovi.

## UI — odabir opreme za transfer

- Forma Zaduženja/Prenos/Razduži koristi `EquipmentAutocomplete` (`GET /equipment?search=&status=`, min. 2 znaka, debounce 300ms) — **Režim A** ili admin.
- **Režim B zaduženje:** `CustodyPoolEquipmentLookup` → `GET /equipment/resolve-custody-pool?inventoryNumber=` (tačan match, unified 404 poruka).
- Pretraga: inventurni broj + specifikacija (uključujući serijski broj kad postoji u kategoriji).
- Filter `status`: `skladiste` za zaduženje, `zaduzeno` za prenos/razduženje.
- `EquipmentCard` transfer modal ne koristi autocomplete (oprema je već poznata).

## UI — generisani dokument (PDF visibility)

- Dugmad **Obrazac (DOCX)** / **Štampa (PDF)** / **Pregled za štampu** prikazuju se samo kad `hasGeneratedDocument=true`.
- PDF akcije dodatno zahtijevaju `transfer.generate_print_pdf=true`.
- Kad obrazac nije dostupan: amber upozorenje bez download dugmadi.

## UI — odabir osobe za zaduženje

- Svi dijalozi gdje se bira osoba za zaduženje/prenos koriste `EmployeeAutocomplete` (`GET /employees/search?q=`, min. 2 znaka, debounce 300ms).
- Lokacije: forma Zaduženja (`TransfersPage`), transfer modal na kartici opreme (`EquipmentCard`), izdavanje iz lota (`registrar-stock`), popis — promjena lokacije na osobu (`session-lines-panel`).
- Frontend **ne** učitava punu lokalnu listu radnika za picker; scope je server-side.
- Scope po roli (`RegistrarScopeService.buildEmployeeWhere`):
  - **admin** — svi radnici
  - **evidenticar** — radnici u org. jedinicama registrar dodjela (Mode A/B) + vlastiti `employeeId`
- `POST /transfers` dodatno validira `toPersonId` kroz `canAccessEmployee` (`assertEmployeeInScope`).
- Pri `prenos` (osoba → osoba): trenutni nosilac isključen iz autocomplete rezultata (`excludeIds`).

## API

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| GET | `/backend/equipment/resolve-custody-pool?inventoryNumber=` | evidenticar (Režim B pool) |
| GET | `/backend/transfers` | admin, evidenticar, user (scope); query `workflow=pending\|signed` |
| GET | `/backend/transfers/:id` | admin, evidenticar, user (scope) |
| POST | `/backend/transfers` | admin, evidenticar |
| GET | `/backend/transfers/:id/generated-document` | admin, evidenticar |
| GET | `/backend/transfers/:id/raw-document` | admin, evidenticar (fallback HTML) |
| PATCH | `/backend/transfers/:id/sign` | admin, evidenticar |
| POST | `/backend/uploads` | admin, evidenticar (PDF) |
| GET | `/backend/uploads/:id` | admin, evidenticar, user (scope) |

## Scope

Evidentičar: transferi za opremu u istom scope-u kao equipment API.

### Validacija efektivnog skladišta (evidentičar)

| Tip | Pravilo |
|-----|---------|
| `zaduzenje` | `resolveForEmployee(toPersonId) === equipment.warehouseId` |
| `prenos` | `resolveForEmployee(from) === resolveForEmployee(to)` |

### Custody pool (Režim B)

- `Equipment.custodyOrgUnitId` — postavlja se na finalize `razduzenje` (`fromPerson.orgUnitId`), briše na `zaduzenje`.
- Pool match: `status=skladiste`, `warehouseId=assignment.warehouseId`, kategorija u scope, `custodyOrgUnitId ∈ expand(O) ∩ efektivno W`.
