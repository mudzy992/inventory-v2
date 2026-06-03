---
name: popis-temp-actions-on-close
overview: Promjene u Popisu se čuvaju kao pending (temp) tokom aktivne sesije i ne mijenjaju opremu niti kreiraju transfere odmah. Na zatvaranje sesije (admin) pokreće se async job koji sekvencijalno primjenjuje pending akcije u intervalima (transferi/rashod), uz progres i audit, a članovi komisije mogu evidentirati bez registrar-scope blokade.
todos:
  - id: schema-pending-actions
    content: Dodati Prisma modele za pending akcije + close job, migracija + generate.
    status: completed
  - id: backend-recordline-pending
    content: "Promijeniti recordLine: bypass registrar-scope za committee members i kreirati/updated pending akcije umjesto instant transfera."
    status: completed
  - id: backend-close-job-worker
    content: Implementirati async close job + worker koji intervalno primjenjuje pending akcije i zapisuje progres.
    status: completed
  - id: backend-progress-endpoints
    content: Dodati endpoint(e) za čitanje statusa job-a i progres brojeva.
    status: completed
  - id: frontend-pending-ui
    content: Prikaz pending/applied/failed u Popisu; omogućiti edit/undo dok je pending.
    status: completed
  - id: frontend-close-progress
    content: Admin UI za zatvaranje sesije sa progresom (polling) + final state.
    status: completed
  - id: docs-update-matrix
    content: Ažurirati inventory-count MATRIX/CHANGELOG za novi pending+async flow.
    status: completed
isProject: false
---

# Popis: temp promjene + async primjena na zatvaranje sesije

## Cilj
- Tokom `InventorySession.status=active`: članovi komisije (predsjednik + članovi) mogu evidentirati sve promjene u Popisu **bez** "Equipment outside your registrar scope" blokade.
- Sve promjene u Popisu se snimaju kao **pending (temp)** i UI ih prikazuje kao pending; korisnik može mijenjati/undo do zatvaranja sesije.
- Na `PATCH /inventory-sessions/:id/close` (admin): ne radimo masovno u requestu, nego kreiramo **async job** koji sekvencijalno primjenjuje promjene (u intervalima), prikazuje progres i završni rezultat.

## Backend promjene

### 1) Bypass registrar scope za committee flow
U [`backend/src/modules/inventory-count/inventory-count.service.ts`](backend/src/modules/inventory-count/inventory-count.service.ts) u `recordLine`:
- Ukloniti/izmijeniti dio koji baca `Equipment outside your registrar scope` za `evidenticar`.
- Novo pravilo: ako je korisnik **član komisije** za taj `committeeId`, onda može evidentirati liniju bez registrar-scope provjere (scope je i dalje bitan u drugim modulima).

### 2) "Temp" model (pending akcije)
Dodati novi Prisma model npr. `InventoryPendingAction` (ili `InventoryLineAction`) koji predstavlja šta treba primijeniti na zatvaranje:
- Identifikatori: `sessionId`, `committeeId`, `equipmentId`, `inventoryLineId`.
- `kind`: `relocate_to_warehouse | relocate_to_person | disposal | mark_present | mark_damaged | mark_missing`.
- `payload` (JSON) za parametre (npr. toPersonId, note, warehouseId/autoresolve).
- `status`: `pending | running | applied | failed | skipped`.
- `attempts`, `lastError`, `appliedAt`, `createdAt`.

Napomena: statusi poput `prisutna/ostecena/nije_prisutna` ne mijenjaju `Equipment` direktno, ali po zahtjevu se i oni vode kao pending do zatvaranja (finalizacija).

### 3) recordLine više ne kreira Transfer odmah
U `recordLine`:
- Snimiti/updated `InventoryLine` kao "pending evidence".
- Umjesto `createRelocationTransfer(...)` (odmah), kreirati/updated odgovarajući `InventoryPendingAction`.
- Ako korisnik promijeni status (npr. iz `promjena_lokacije` u `prisutna`), prethodni pending action za tu opremu se označi `skipped` ili se zamijeni.

### 4) Async job za zatvaranje sesije
Dodati:
- `InventorySessionCloseJob` model (sessionId, status queued/running/done/failed, progress counts, startedAt/endedAt, lastError).
- `PATCH /inventory-sessions/:id/close`:
  - Validira da su komisije zaključane (ili u planu zadržati postojeće: blokirati ako ima pending prenosnica).
  - Setuje sesiju u `closing`.
  - Kreira job `queued` i odmah vraća response.
- Background worker (NestJS provider) u `inventory-count` modulu:
  - Periodično (npr. svakih 1–2s) pokupi 1 job `queued`, pređe u `running`.
  - U petlji uz throttle (npr. 200–500ms) primjenjuje pending akcije jedna po jedna:
    - relocation→ kreira `Transfer(raw)` i odmah ga `sign`/upload ne radi (ostaje postojeći flow), ili po vašem pravilu generiše `potpisan` tek kad dokument postoji.
    - razduženje na skladište: koristi već implementirani autoresolve skladišta.
    - osoba-osoba: kreira `Transfer(raw)`.
    - rashod: kreira `TransferType=rashodovanje` (approval flow ostaje).
    - prisutna/ostecena/nije_prisutna: označi `applied` (finalizacija evidencije).
  - Ako neka akcija faila: označi `failed`, nastavi dalje (ili stop—definisati u implementaciji), i job na kraju bude `done` uz listu failed.

### 5) API za progres
- `GET /inventory-sessions/:id/close-job` (ili `/inventory-sessions/:id/status`) vraća job status + brojeve pending/applied/failed.

## Frontend promjene

### 6) Pending prikaz i edit/undo
U [`frontend/src/components/inventory-count/session-lines-panel.tsx`](frontend/src/components/inventory-count/session-lines-panel.tsx):
- Status badge: `Pending` / `Applied` / `Failed`.
- Omogućiti izmjene dok je sesija `active` i dok akcija nije u `running/applied`.

### 7) Admin zatvaranje sesije
U [`frontend/src/components/InventoryCountPage.tsx`](frontend/src/components/InventoryCountPage.tsx):
- Na `Zatvori sesiju`: pozove close endpoint (koji enqueuje job).
- UI prikazuje progres (poll `GET close-job`), i on completion setuje sesiju `closed` + omogućava zapisnik.

## Matrica + changelog
Ažurirati `.cursor/docs/matrices/inventory-count/*`:
- Nova pravila: "pending tokom active", "async apply na close", "committee bypass registrar-scope u popisu".

```mermaid
flowchart TD
  member[CommitteeMember] -->|recordLine| pendingLine[InventoryLine(pending)]
  pendingLine --> pendingAction[InventoryPendingAction(pending)]
  admin[Admin] -->|closeSession| enqueueJob[CloseJob(queued)]
  enqueueJob --> worker[Worker(interval)]
  worker -->|apply one-by-one| applied[Action(applied/failed)]
  worker -->|finish| sessionClosed[Session(closed)]
```
