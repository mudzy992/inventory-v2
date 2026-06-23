## 2026-06-23 — Upload mount permisije (PDF Access Code 7)

- Backend Docker: fiksni app uid/gid 100/101; skripta `scripts/fix-upload-permissions.sh` za host bind mount.
- `docx-to-pdf`: konverzija u `/tmp`, kopija PDF-a u `prenosnice/`; log za EACCES.

## 2026-06-23 — Drawer akcije gore + auto-regeneracija starih prenosnica

- Drawer širi (`85vw`), akcije u gornjoj traci, PDF ispod u punoj visini.
- `ensureGeneratedArtifacts`: starije prenosnice bez DOCX/PDF regenerišu se pri prvom downloadu/pregledu.
- LibreOffice u Dockeru: `HOME=/tmp`, izolovan `UserInstallation` profil po konverziji.

## 2026-06-23 — PDF konverzija fix + drawer layout

- `convertDocxToPdf`: ispravna provjera izlaznog `.pdf` (LibreOffice ne piše `x.pdf`).
- `GET .../generated-document?format=pdf`: on-demand konverzija iz postojećeg DOCX ako PDF još nije u bazi.
- Drawer: slide-in animacija; desktop split (PDF lijevo, akcije desno); mobile bottom sheet.

## 2026-06-22 — Docker LibreOffice + drawer prenosnica + UTF-8 PDF

- Backend Docker: `node:22-bookworm-slim` (sve faze), LibreOffice + fontovi (DejaVu, Liberation, Noto), `LANG=C.UTF-8`.
- `soffice` konverzija DOCX→PDF s UTF-8 env u child procesu.
- UI: `TransferDocumentDrawer` (desktop desni drawer / mobile bottom sheet) s auto PDF pregledom; primjena na tabovima Zaduženja i Prenosnice.
- Tab Potpisano: auto pregled uploadanog skena + download potpisane prenosnice.
- Popisna lista PDF: DejaVu Sans embed (jspdf) za ispravne dijakritike.

## 2026-06-22 — UX modul Zaduženja

- Tab Zaduženja: pod-tabovi Na čekanju (badge) / Potpisano; `GET /transfers?workflow=pending|signed`; detalji prenosnice u dijalogu.
- Tab Prenosnice: kompaktna desktop tabela, workflow pod-tabovi; PDF/DOCX dugmad samo kad je obrazac dostupan.
- `EquipmentAutocomplete` u formi transfera (pretraga po inv. broju / serijskom).
- Tab Trenutna zaduženja: poboljšana tabela + `EquipmentCard` na klik.
- Guardi: `canShowTransferGeneratedDocx`, `canShowTransferGeneratedPdf`.

## 2026-06-19 — Autocomplete za odabir osobe pri zaduženju

- Nova komponenta `EmployeeAutocomplete`: server-side pretraga (`GET /employees/search`), zamjena `<select>` i hibridnih pretraga.
- Primjena: Zaduženja forma, kartica opreme (transfer), izdavanje iz lota, popis (promjena lokacije na osobu).
- Scope radnika po roli ostaje na backendu (`buildEmployeeWhere` / `canAccessEmployee`); frontend ne drži punu listu.

## 2026-06-19 — Broj prenosnice po mjesecu + naziv opreme iz lota

- Format broja: `{n}-{mm}/{godina}` (npr. `1-01/2026`); dodjela pri kreiranju, ne `DRAFT-*`.
- Sekvenca po skladištu + godina + mjesec (`TransferDocumentSequence.month`).
- `{naziv_opreme}`: `stockLot.productName` + serijski broj iz specifikacije (ako postoji).

## 2026-06-19 — Word template: validacija, auto-aktivacija, UI

- Upload `.docx` validira obavezne placeholdere + dry-run docxtemplater; greška vraća listu nedostajućih polja.
- Upload automatski aktivira novu verziju; `POST /transfers` (document) blokira create bez aktivnog obrasca.
- `documentWarehouseId` za tip `prenos`: prioritet holder warehouse → registrar assignment → equipment warehouse.
- UI: uklonjen HTML „Štampaj“ fallback; preuzimanje/pregled koriste generisani DOCX/PDF.

## 2026-06-16 — Evidencijska oprema bez prenosnice

- `POST /transfers`: oprema bez inv. broja (`isAccountingTracked=false`) uvijek `mode: direct`, neovisno o `transfer.generation.*`.

## 2026-06-18 — Prenos opreme vs. prenosnica

- Dvoslojni model: `features.transfers` blokira prenos opreme; `transfer.generation.*` kontroliše samo dokumente.
- `POST /transfers`: `mode: direct` (odmah ažurira opremu) ili `mode: document` (postojeći workflow).
- Lot issue i popis relocation: direktan prenos kad dokument isključen; master `generation.enabled=false` više ne blokira izdavanje.
- Uklonjeni registry ključevi: `transfer.generation.on_rashodovanje`, `transfer.require_upload_before_sign`.

## 2026-06-17 — Rashod samo sa skladišta

- `transfer.generation.on_rashodovanje` deprecated u postavkama; novi rashod preko liste/komisije popisa.

## 2026-06-17 — Finalizacija nakon uploada

- UI: `uploaded` / `printed` status prikazuje „Finalizuj prenosnicu" kad postoji `scannedDocUrl` i `transfer.require_signed_pdf_upload` je ispunjen.
- `TransferDocumentPanel`, `transfer-documents-tab`, `TransfersPage`, `EquipmentCard`: `allowSign` za sve nefinalizirane statuse.

## 2026-06-15 — FE guard transfer generation

- `canCreateTransferType` + `TRANSFER_GUARD_MESSAGES` za provjeru postavki generisanja prenosnica.

## 2026-06-10 — Modul Zaduženja: tabovi

- UI: tabovi **Zaduženja** (historija prenosa), **Trenutna zaduženja** (equipment `status=zaduzeno`, bez obaveze prenosnice), **Prenosnice** (bivši DocumentsPage).
- Sidebar: uklonjen zaseban unos Prenosnice; `/documents` → tab Prenosnice unutar Zaduženja.

## 2026-06-10 — Cross-warehouse izdavanje (admin)

- Postavka `transfer.allow_admin_cross_warehouse_issue`: admin može izdati iz lota W1 na radnika u efektivnom skladištu W2; lot računovodstvo kao relocation dest-accept.

## 2026-06-08 — Lot issue bez prenosnice (init)

- `transfer.generation.on_stock_lot_issue=false`: izdavanje iz lota zadužuje opremu direktno bez `Transfer` zapisa i bez DOCX/PDF.
- Master `transfer.generation.enabled=false` i dalje blokira izdavanje iz lota.

## 2026-06-04 — UI dopune

- `TransferDocumentPanel`: iframe pregled generisanog PDF prije uploada potpisanog.
- Notifikacija `transfer_signed_upload_pending` na create kad je obavezan upload PDF-a.
- Bulk ZIP export dokumentovan kao planirano (van scope-a).

## 2026-06-04 — Prenosnice: registry, template, generisanje

- Postavke `transfer.generation.*`, `transfer.require_signed_pdf_upload`, `transfer.generate_print_pdf`.
- Broj `{n}/{godina}` po skladištu (`TransferDocumentSequence`); rashod `R/{n}/{godina}`.
- Word .docx template po skladištu; docxtemplater; putanje `prenosnice/{warehouseId}/{godina}/`.
- Upload potpisanog PDF obavezan (samo `application/pdf`).
- PDF za štampu: LibreOffice `soffice` na serveru kad je `transfer.generate_print_pdf=true`.

## 2026-06-03 — Faza 18a UI

- Statusi `printed`, `uploaded`, `cancelled` u matrici.
- Inventory stepper: RAW → Upload → Čeka zatvaranje → Primijenjeno; finalize blok dok je sesija `active`.

## 2026-05-29

- Transfer CRUD + sign flow, document numbers PRN-*.
- Upload servis za skenirane dokumente transfera.
- Cross-service pravilo (admin + feature flag).
