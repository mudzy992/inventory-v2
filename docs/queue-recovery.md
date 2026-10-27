# Queue recovery — matrica otkazivanja i vlasništvo poslova

Kriterij iz §11 plana: **nijedan kritični posao ne smije ostati trajno
`queued` / `running` / `closing` bez vlasnika, a retry ne smije duplicirati
poslovnu promjenu.** Ovaj dokument je ljudski prikaz; izvršiva verzija je
`scripts/check-queue-recovery-contract.mjs` (matrica + CI gate) i devet
fault-injection provjera u `backend/prisma/check-*.ts`.

## Matrica

| # | Tok | Tačka otkaza | Zaglavljeno stanje | Oporavak | Idempotencija | CI provjera |
|---|---|---|---|---|---|---|
| 1 | Zatvaranje inventure | Redis nedostupan pri prvom `queue.add()` | `queued` | `InventorySessionCloseReconcilerService.reconcileQueuedJobs()` svakih 60 s + pri startu | `buildInventoryCloseRecoveryJobId(job.id, job.updatedAt)` | `check-inventory-close-reconciler-concurrency.ts` |
| 2 | Zatvaranje inventure | `SIGKILL` nakon što je pending-action side effect commitovan | `running` sa isteklim lease-om | `buildInventoryCloseJobClaimWhere()` + heartbeat obnova svakih 5 min | `leaseToken` UUID + uslovni `updateMany` | `check-inventory-close-lease-recovery.ts` |
| 3 | Zatvaranje inventure | Posljednji BullMQ attempt pao; admin ručno retry-uje | `failed` | `retryFailedCloseSession()` (samo admin, razlog + audit) | uslovni claim `status: 'failed'` | `check-inventory-manual-close-retry-race.ts` |
| 4 | Konverzija dokumenta | Pad između `DocumentJob.create()` i `queue.add()` | `queued` bez Bull posla | `reconcileStaleJobs()` — `missing` grana poslije 60 s grace-a | terminalni outbox key | `check-document-job-enqueue-crash-recovery.ts` |
| 5 | Konverzija dokumenta | **Worker ubijen / nema workera; Bull posao ostaje `waiting`/`active` zauvijek** | `running`/`queued` (vremenski ograničeno) | **`decideStaleRecovery()` + `DOCUMENT_JOB_STALE_TIMEOUT_MS`** | monotonic terminal status + `documentJobTerminalOutboxKey` | `check-document-job-stale-recovery.ts` |
| 6 | Konverzija dokumenta | Terminalni QueueEvents izgubljen poslije commit-a | nedostaje trajna notifikacija | `NotificationOutbox` sa jedinstvenim `idempotencyKey` | `document-job-terminal:<id>:done\|failed` | `check-document-job-terminal-outbox.ts` |
| 7 | Konverzija dokumenta | QueueEvents pretplata trka sa `completed`/`failed` eventom | `queued`/`running` nakon terminalnog Bull posla | startup + periodična `reconcileStaleJobs()` | uslovni `markDone`/`markFailed` | `check-document-event-reconcile-race.ts` |
| 8 | Generisanje DOCX prenosnice | Pad poslije pisanja DOCX fajla, prije status update-a | zastario `generatedDocxStatus` | trajni status + lease token + zaseban retry | `generatedDocxLeaseToken` + uslovni claim | `check-transfer-docx-crash-recovery.ts` |
| 9 | Notifikacije | Pad poslije poslovnog commita, prije emit-a | `pending` outbox | `NotificationOutboxRelayService` | jedinstven `idempotencyKey` | `check-notification-outbox-crash-replay.ts` |

## Nova zaštita: vremenski bound za `DocumentJob`

Ranija `reconcileStaleJobs()` je namjerno ignorirala BullMQ stanja
`waiting`/`active`/`delayed`/`prioritized` — ispravno za zdrav posao u toku,
ali fatalno ako document-worker padne i niko ga ne zamijeni: BullMQ nikad ne
šalje terminalni event, pa DB red ostaje `running` **zauvijek**.

`document-job-recovery-policy.util.ts` sada dodaje:

- `resolveDocumentJobStaleMs()` — strogo parsiranje
  `DOCUMENT_JOB_STALE_TIMEOUT_MS` (300 000 – 86 400 000 ms, default 1 800 000 =
  30 min). Neispravna vrijednost se loguje i koristi se default — konfiguracija
  nikad ne smije isključiti oporavak.
- `decideStaleRecovery()` — za svaki aktivni red odlučuje `none` / `missing` /
  `stuck`. Starost se računa od `startedAt` za `running`, od `createdAt` za
  `queued`. Terminalna BullMQ stanja i svježi poslovi ostaju netaknuti.
- `assertStaleTimeoutAfterWorkerTimeout()` — bound mora biti veći od
  `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS + 30 000 ms` (BullMQ `lockDuration`
  slack), inače bi se ispravna duga konverzija prerano proglasila mrtvom.
  Deployment readiness alat provjerava ovaj odnos
  (`document-job-stale-bound`).

Kad se posao proglasi `stuck`: `markFailed()` upiše terminalni status i **jedan**
trajni outbox red u istoj transakciji, pošalje jedan Socket.IO update, pokuša
ukloniti BullMQ posao (zaključan `active` posao se ne može ukloniti — benigno,
DB status je autoritet) i loguje `document_job_stale_recovered_failed`. Kasni
QueueEvent ne može ponovo otvoriti terminalni red niti duplirati notifikaciju.

## CI dokaz

`check-document-job-stale-recovery.ts` nad **pravim PostgreSQL i Redis/BullMQ**
kreira pet `DocumentJob` redova (dva zaglavljena 31 min, jedan svjež, jedan
svjež bez Bull posla, jedan star bez Bull posla), pokreće rekonsilijaciju i
potvrđuje:

- zaglavljeni `running` i `queued` redovi → `failed` sa tačno jednim outbox
  redom i jednim Socket.IO emit-om, Bull posao uklonjen;
- svjež `running` posao ostaje `running`, njegov Bull posao ostaje u redu;
- svjež red bez Bull posla ostaje `queued` (grace), stari bez Bull posla ide u
  `failed` kroz postojeću `missing` granu;
- drugi poziv rekonsilijacije ne pravi duplikate.

`check-queue-recovery-contract.mjs` statički poredi svih 9 redova matrice sa
izvornim kodom (simboli oporavka), `backend/package.json` skriptama i
`.github/workflows/ci.yml` koracima. `check-queue-recovery-contract.spec.mjs`
ima 8 scenarija uključujući 5 mutacija (uklonjen CI korak, nespojena skripta,
obrisana skripta, uklonjen simbol, uklonjena `stuck` grana, uklonjen bound).

## Preostala ograničenja

- Ako je `UPLOAD_DIR` nepouzdan ili sadrži symlink na koji zombi worker piše,
  terminalni DB status sprječava promjenu statusa ali ne i pisanje fajla.
  Upload root mora biti pouzdan direktorij (isto ograničenje kao kod upload
  containmenta).
- `bullJob.remove()` ne uspijeva za zaključan `active` posao; BullMQ stalled
  mehanizam i monotonic DB status su drugi sloj.
- Load test za veliki broj istovremenih konverzija i dalje nije urađen.
