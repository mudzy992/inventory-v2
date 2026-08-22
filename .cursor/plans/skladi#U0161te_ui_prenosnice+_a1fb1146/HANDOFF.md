# HANDOFF — Skladište UI + dopune prenosnica

**Datum:** 2026-06-04  
**Plan:** [skladište_ui_prenosnice+_a1fb1146.plan.md](../skladište_ui_prenosnice+_a1fb1146.plan.md)  
**Status:** Nije započeto — spremno za implementaciju u novoj sesiji.

---

## Za novu sesiju (copy-paste prompt)

```
Implementiraj plan iz .cursor/plans/skladište_ui_prenosnice+_a1fb1146.plan.md.
Pročitaj HANDOFF u .cursor/plans/skladište_ui_prenosnice+_a1fb1146/HANDOFF.md.
Ne mijenjaj sam plan fajl. Redoslijed: backend create validacija → WarehouseContextPanel → WarehousesPage → PDF preview → notifikacije → template download → matrice.
Svi todo-i u planu su pending.
```

---

## Šta je već urađeno (prethodni plan — prenosnice faza 1)

Ovo **ne treba ponovo raditi**; nova sesija gradi na tome.

| Oblast | Stanje |
|--------|--------|
| Registry postavki | `transfer.generation.*`, `transfer.require_signed_pdf_upload`, `transfer.generate_print_pdf` u [`settings.registry.ts`](../../../backend/src/modules/settings/settings.registry.ts) |
| Policy | [`transfer-generation-policy.util.ts`](../../../backend/src/modules/transfers/utils/transfer-generation-policy.util.ts) — enforcement na transfers, stock-lot, inventory |
| Prisma | `WarehouseTransferTemplate`, `TransferDocumentSequence`, polja na `Transfer`; migracija `20260604140000_transfer_document_templates` |
| Broj dokumenta | `{n}/{godina}`, rashod `R/{n}/{godina}`, po `documentWarehouseId` |
| DOCX generisanje | [`transfer-document-generation.service.ts`](../../../backend/src/modules/transfers/transfer-document-generation.service.ts) (docxtemplater) |
| API template | `POST/GET/PATCH` na [`warehouses.controller.ts`](../../../backend/src/modules/warehouses/warehouses.controller.ts) |
| Upload potpisani PDF | [`uploads.service.ts`](../../../backend/src/modules/uploads/uploads.service.ts) → `prenosnice/{warehouseId}/{year}/...-signed.pdf` |
| UI (djelimično) | [`warehouse-transfer-template-panel.tsx`](../../../frontend/src/components/warehouses/warehouse-transfer-template-panel.tsx) u tabu Kontekst; [`TransferDocumentPanel`](../../../frontend/src/components/TransferDocumentPanel.tsx) DOCX/PDF download |

**Parent plan:** [prenosnice_registry_template_405fe1ef.plan.md](../prenosnice_registry_template_405fe1ef.plan.md) (završen).

---

## Šta ovaj plan traži (sve pending)

### Faza A — Tab Kontekst

- Novi [`warehouse-context-panel.tsx`](../../../frontend/src/components/warehouses/warehouse-context-panel.tsx): layout kao ostali tabovi (`FormCard`, puna širina).
- Admin uređuje: `name`, `cityId`, `address`, `orgUnitId` (obavezno), `keeperUserIds` (min 1), `notes`.
- Sekcija 2: postojeći `WarehouseTransferTemplatePanel` u drugom `FormCard`.
- [`warehouse-detail-view.tsx`](../../../frontend/src/components/warehouses/warehouse-detail-view.tsx): `tab === 'context'` → samo `WarehouseContextPanel`.

### Faza B — Kreiranje skladišta

- Backend: [`create-warehouse.dto.ts`](../../../backend/src/modules/warehouses/dto/create-warehouse.dto.ts) — `orgUnitId` + `keeperUserIds` obavezni (`@ArrayMinSize(1)`).
- [`warehouses.service.ts`](../../../backend/src/modules/warehouses/warehouses.service.ts) `create` — validacija org + keeper.
- Frontend: [`WarehousesPage.tsx`](../../../frontend/src/components/WarehousesPage.tsx) — labele, bez „centralno“, disabled dok forma nevalja.
- [`org-unit-warehouses-section.tsx`](../../../frontend/src/components/organization/org-unit-warehouses-section.tsx) — quick create: obavezan izbor skladištara.

### Faza C — PDF preview

- [`TransferDocumentPanel.tsx`](../../../frontend/src/components/TransferDocumentPanel.tsx): iframe za `GET .../generated-document?format=pdf` (odvojeno od preview skena).

### Faza D — Notifikacija upload pending

- Prisma enum: `transfer_signed_upload_pending` + migracija.
- `notifyTransferSignedUploadPending` u [`notifications.service.ts`](../../../backend/src/modules/notifications/notifications.service.ts).
- Poziv iz [`transfers.service.ts`](../../../backend/src/modules/transfers/transfers.service.ts) nakon `create` ako `transfer.require_signed_pdf_upload`.
- Frontend mapper za tip notifikacije (ako postoji centralni).

### Faza E — Arhiva templatea

- `GET /warehouses/:id/transfer-template/:templateId/download` (admin stream .docx).
- UI: arhiva neaktivnih verzija, Preuzmi + Aktiviraj.

### Faza F — **Izvan scope-a**

- Bulk export ZIP po skladištu/godini — samo dokumentovati u matrici kao planirano.

---

## Donesene odluke

| Tema | Odluka |
|------|--------|
| Centralno skladište | **Ne** pri kreiranju — `orgUnitId` i bar jedan skladištar obavezni (usklađeno s prenosnicama) |
| Legacy `orgUnitId = null` | Postojeći zapisi ostaju; matrica: centralno = legacy |
| Bulk export | Kasnija faza — ne implementirati sada |
| PDF preview | Samo `TransferDocumentPanel` (DocumentsPage opciono, manji scope) |
| Notifikacija na create | Samo ako `transfer.require_signed_pdf_upload`; bez ponavljanja/remindera |

---

## Ključni fajlovi za dirati

```
backend/src/modules/warehouses/
  dto/create-warehouse.dto.ts
  warehouses.service.ts
  warehouses.controller.ts
  warehouse-transfer-template.service.ts

backend/src/modules/transfers/transfers.service.ts
backend/src/modules/notifications/notifications.service.ts
backend/prisma/schema.prisma + nova migracija (enum)

frontend/src/components/warehouses/
  warehouse-context-panel.tsx          (NOVO)
  warehouse-detail-view.tsx
  warehouse-transfer-template-panel.tsx
frontend/src/components/WarehousesPage.tsx
frontend/src/components/organization/org-unit-warehouses-section.tsx
frontend/src/components/TransferDocumentPanel.tsx
frontend/src/api/warehouse-transfer-template-api.ts

.cursor/docs/matrices/warehouses/
.cursor/docs/matrices/notifications/
.cursor/docs/matrices/transfers/
```

---

## Rizici / napomene

1. **LibreOffice** — PDF preview u UI radi samo ako server generiše PDF (`transfer.generate_print_pdf` + `soffice`). Inače prikaži poruku i DOCX download ([`backend/Dockerfile`](../../../backend/Dockerfile) ima komentar za `apk add libreoffice`).
2. **Enum migracija** — MySQL `ALTER TABLE` za `NotificationType`; prati pattern iz `20260603170000_notification_types_phase18c`.
3. **Postojeća centralna skladišta** — PATCH konteksta ne smije dozvoliti brisanje `orgUnitId` ako je prenosnica obavezna; forma treba zahtijevati org i na edit.
4. **Route order** — novi `GET .../transfer-template/:templateId/download` registrirati prije generičkih `:id` ruta ako treba (provjeri [`warehouses.controller.ts`](../../../backend/src/modules/warehouses/warehouses.controller.ts)).

---

## Otvorena pitanja

- Nema blokera — sve definisano u planu.

---

## Preporučeni redoslijed implementacije

1. Backend create DTO + `warehouses.service.create`
2. `WarehouseContextPanel` + refaktor detail view
3. `WarehousesPage` + org quick create
4. PDF iframe u `TransferDocumentPanel`
5. Notification enum + servis + hook
6. Template download API + UI arhiva
7. Matrice + CHANGELOG

---

## Test status

| Šta | Status |
|-----|--------|
| Ovaj plan | Nije implementiran |
| Prenosnice faza 1 | Backend `npm run build` OK; `npm run test:unit` OK; frontend `npm run build` OK |
| Migracija prenosnica | `20260604140000_transfer_document_templates` — pokrenuti `npm run db:migrate` na okruženju ako nije |

### Smoke test (nakon implementacije ovog plana)

1. Admin → Skladišta → Novo: bez org ili bez skladištara → greška; validan unos → uspjeh.
2. Detalj skladišta → Kontekst: isti vizuelni stil kao Na skladištu; save svih polja.
3. Upload + aktiviraj template; arhiva: preuzmi staru verziju.
4. Kreiraj transfer (RAW) → notifikacija „čeka potpisani PDF“.
5. Pregled za štampu (iframe) → upload PDF → sign.

### Komande

```bash
cd backend && npm run build && npm run test:unit
cd backend && npm run db:migrate    # ako nova enum migracija
cd frontend && npm run build
```

---

## Matrice (ažurirati na kraju)

- [`.cursor/docs/matrices/warehouses/MATRIX.md`](../../../.cursor/docs/matrices/warehouses/MATRIX.md) + `CHANGELOG.md`
- [`.cursor/docs/matrices/notifications/MATRIX.md`](../../../.cursor/docs/matrices/notifications/MATRIX.md) + `CHANGELOG.md`
- [`.cursor/docs/matrices/transfers/MATRIX.md`](../../../.cursor/docs/matrices/transfers/MATRIX.md) — bulk ZIP kao planirano
