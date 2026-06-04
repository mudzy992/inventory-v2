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
