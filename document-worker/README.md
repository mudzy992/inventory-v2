# Document Worker — Evidens Document Engine

Zaseban, interni Docker servis koji konzumira BullMQ `document-generation`
red (postavljen od strane `backend/src/modules/documents/`) i konvertuje
DOCX/XLSX/ODT → PDF preko LibreOffice-a (`soffice --headless`).

Nije NestJS aplikacija — čist Node.js/TypeScript proces koji koristi
`bullmq` i `ioredis` direktno, jer mu ne treba HTTP server, DI kontejner ni
Prisma (ne dodiruje Postgres). Sav domenski upis (status posla, Socket.IO
obavještenja) radi backend proces, preko `DocumentConversionEventsService`
koji sluša isti BullMQ red (`QueueEvents`).

```
NestJS Backend  --BullMQ (document-generation)-->  Document Worker  --soffice-->  PDF
      |                                                                              |
      +-------------------- dijeljeni /app/uploads volume <------------------------+
```

## Zašto zaseban servis (ne u backend kontejneru)

- LibreOffice je težak (par stotina MB) i ima veliku napad površinu
  (parsiranje proizvoljnih binarnih Office formata) — nema razloga da bude
  u istom, javno izloženom (Traefik/Coolify) kontejneru kao HTTP API.
- Backend HTTP zahtjevi se time nikad ne blokiraju na LibreOffice-u
  (konverzija je asinhrona, preko queue-a).
- Worker se može nezavisno horizontalno skalirati (više replika istog
  image-a, svi konzumiraju isti BullMQ red) bez ikakve izmjene backend-a.
- Manji, brži backend image (bez LibreOffice paketa).

## Kako radi jedan posao

1. Backend (`TransferDocumentGenerationService`) renderuje DOCX
   (docxtemplater, brzo, u procesu) i poziva
   `DocumentConversionQueueService.enqueuePdfConversion(...)`, koji:
   - kreira `DocumentJob` Postgres red (status `queued`),
   - doda BullMQ posao u `document-generation` red sa payload-om
     `{ documentJobId, sourceFormat, targetFormat, sourceRelativePath,
     resultRelativePath }` — putanje su RELATIVNE na `UPLOAD_DIR`, nikad
     apsolutne (backend i worker mogu, u teoriji, imati drugačiji mount
     path).
2. Ovaj worker (bilo koja replika) pokupi posao, konvertuje fajl u
   izolovanom privremenom profilu, i atomski upiše rezultat na dijeljeni
   `UPLOAD_DIR` (piše u `<cilj>.tmp-<jobId>`, pa `rename` — čitalac nikad
   ne vidi polu-upisan fajl).
3. Backend (`DocumentConversionEventsService`, preko BullMQ `QueueEvents`)
   sluša `active`/`completed`/`failed` evente, ažurira `DocumentJob` red i
   emituje `document.job.updated` Socket.IO event pozivaocu.

Worker sam NIKAD ne dodiruje Postgres niti Socket.IO — namjerno, da mu
mrežni/ACL surface ostane minimalan.

## Konfiguracija (environment varijable)

Iste `REDIS_*` varijable kao backend (**isti ACL user/namespace, bez
proširenja ACL-a** — vidi glavni `.env.example`):

| Varijabla | Default | Opis |
|---|---|---|
| `REDIS_HOST` | `redis-core` | Host Redis platforme (isti kao backend) |
| `REDIS_PORT` | `6379` | |
| `REDIS_USERNAME` | — | Isti ACL user kao backend (`inventory-v2`) |
| `REDIS_PASSWORD` | — | |
| `REDIS_DB` | `0` | |
| `REDIS_KEY_PREFIX` | `inventory-v2` | Isti namespace kao backend |
| `REDIS_TLS` | `false` | |
| `DOCUMENT_QUEUE_NAME` | `document-generation` | Mora biti identično backend-ovom `DOCUMENT_GENERATION_QUEUE` |
| `UPLOAD_DIR` | `/app/uploads` | Isti volume kao backend |
| `DOCUMENT_WORKER_TMP_DIR` | `/tmp/document-worker` | Privremeni radni prostor — ODVOJEN od `UPLOAD_DIR` (zahtjev: temp ≠ generated) |
| `DOCUMENT_WORKER_CONCURRENCY` | `2` | Broj paralelnih `soffice` konverzija u ovom kontejneru |
| `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS` | `120000` | Tvrdi timeout po konverziji (SIGKILL nakon isteka) |
| `DOCUMENT_WORKER_HEALTH_PORT` | `8080` | Interni health port (127.0.0.1 SAMO) |
| `DOCUMENT_WORKER_SOFFICE_BIN` | `soffice` | Putanja do soffice binarnog fajla (rijetko potrebno mijenjati) |

## Sigurnost / produkcijska otpornost

- **Non-root**: isti `APP_UID`/`APP_GID` (default 100:101) kao backend,
  radi kompatibilnog pristupa dijeljenom `UPLOAD_DIR` volume-u.
- **Bez javne mreže**: nema `EXPOSE` u Dockerfile-u, nema `ports`/`expose`
  u docker-compose servisima, nema Traefik labela.
- **Health check**: mali HTTP server vezan ISKLJUČIVO za `127.0.0.1`
  (nedostupan van kontejnera) — provjerava da je `soffice` pokretljiv i da
  je Redis konekcija `ready`.
- **Izolacija po poslu**: svaki `soffice` poziv dobija svoj
  `-env:UserInstallation` profil (mkdtemp) — bezbjedno za concurrency > 1,
  bez lock kontencije.
- **Timeout + SIGKILL**: zaglavljeni/crashovani `soffice` proces se
  prisilno ubija nakon `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS`.
- **Garantovan cleanup**: privremeni profil/izlazni direktoriji se brišu u
  `finally` bloku, bez obzira na ishod.
- **Path traversal zaštita**: sve putanje iz posla se validiraju da ostaju
  unutar `UPLOAD_DIR`, čak i pored toga što payload kontroliše backend (a
  ne direktan korisnički unos).
- **Docker hardening**: `read_only: true` root fs + `tmpfs` na `/tmp`,
  `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`,
  `mem_limit`/`cpus`/`pids_limit` (vidi `docker-compose.yml` /
  `docker-compose.prod.yml`).
- **Retry**: BullMQ automatski ponavlja neuspjele poslove (default 2
  pokušaja za konverzije, fiksni razmak 10s — vidi
  `DocumentConversionQueueService`), bez učešća ovog worker-a.
- **Graceful shutdown**: na `SIGTERM`/`SIGINT`, worker prestaje primati
  nove poslove i čeka da se AKTIVNI posao završi prije izlaska
  (`stop_grace_period` u compose fajlovima mora biti veći od
  `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS`).

## Dodavanje novih tipova konverzije

Payload već nosi `sourceFormat` (`docx`/`xlsx`/`odt`) i `targetFormat`
(trenutno uvijek `'pdf'`). Za novi izvorni format:
1. Dodati ekstenziju u `SUPPORTED_SOURCE_EXTENSIONS` (`src/types.ts`, i
   ogledani unos u backend-u).
2. LibreOffice filter za PDF konverziju (`--convert-to pdf`) je isti za
   sve podržane Office formate — obično nije potrebna dodatna logika u
   `convert.ts`.

Za novi CILJNI format (npr. PNG umjesto PDF-a), proširiti `targetFormat`
uniju i `--convert-to` argument u `convert.ts` prema `input.targetFormat`.

## Lokalni razvoj

```sh
cd document-worker
npm install
REDIS_PASSWORD=... npm run dev   # tsx watch, ostale env varijable imaju razumne defaultе
```

Zahtijeva lokalno instaliran `soffice` (LibreOffice) na PATH-u, ili
pokretanje kroz Docker (`docker compose -f ../docker-compose.prod.yml build
document-worker`).
