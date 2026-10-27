# Evidens

**Sub-naslov:** Evidencija i zaduženje opreme

Web aplikacija za evidenciju opreme po organizacionoj hijerarhiji — zaduženja, prenosi, dokumenti, QR.

| | |
|---|---|
| **Produkcija** | https://evidens.ba101.top |
| **API** | https://evidens.ba101.top/backend |
| **GitHub** | [mudzy992/inventory-v2](https://github.com/mudzy992/inventory-v2) |

## Struktura

```
inventory-v2/
├── backend/          # NestJS + Prisma (faza 1+)
├── frontend/         # React + Vite + Tailwind
├── document-worker/  # Document Engine — LibreOffice worker (DOCX/XLSX/ODT → PDF), zaseban interni servis
├── docker/           # rezervisano (routing isključivo preko Traefik labela)
└── .cursor/          # plan, matrice, pravila
```

## Lokalni razvoj

```bash
# 1. Backend (port 3000)
cd backend
npm install
npm run prisma:generate
npm run db:migrate
npm run db:seed    # prazan — bez demo korisnika
npm run dev

# 2. Frontend (port 5173, drugi terminal)
cd frontend
npm install
npm run dev
```

Frontend u dev modu šalje requeste na **`/backend`** (Vite proxy → `http://localhost:3000`).  
U Network tabu vidiš `localhost:5173/backend/...` — to je ispravno; Vite prosljeđuje na backend.

Produkcijski build koristi `VITE_API_URL` (npr. `https://evidens.ba101.top/backend`).

Provjera: `GET http://localhost:3000/backend/health` · prvi start → setup wizard u browseru.

Demo korisnici (opcionalno): u `backend/` pokreni `npm run db:seed:demo` → `admin` / `admin123`.

Potpuni wipe baze (dev): `cd backend && npx prisma migrate reset`.

## Env

1. Kopiraj `.env.example` → `.env` (već postoji template).
2. Popuni **eksterni PostgreSQL** (`DATABASE_HOST`, `DATABASE_URL`, …) — ovo je primarna baza.
   MySQL konfiguracija je zadržana u `.env.example` kao zakomentarisani backup/rollback — vidi
   [migracija-mysql-postgres.md](migracija-mysql-postgres.md).
3. Podesi `DATABASE_POOL_MAX` prema broju backend replika i PostgreSQL `max_connections` (default 10; vidi komentar u `.env.example`).
4. Postavi `JWT_SECRET`.
5. **Ne** stavljaj `NODE_ENV` u `.env` — Vite dev to ne podržava (koristi se samo u Dockeru).

`.env` nije u gitu.

Socket.IO u dev modu ide preko Vite proxyja (`/backend` → `localhost:3000`); backend mora raditi prije nego što se frontend spoji.

## Docker

```bash
# Dev (bez Traefik)
docker compose up --build

# Produkcija (Traefik mreža web mora postojati)
docker compose -f docker-compose.prod.yml up -d --build
```

Oba compose fajla sada uključuju i `document-worker` servis (Document
Engine — DOCX/XLSX/ODT → PDF preko LibreOffice-a, BullMQ
`document-generation` red). Interni je, bez javne domene — pokreće se
automatski sa ostalim servisima. Detalji: [document-worker/README.md](document-worker/README.md).

## Operativni signali u logovima

Backend emituje jedan red JSON-a po važnom infrastrukturnom događaju. Periodični
(30 s) signali: `http_request_metrics` (latencijski histogram/p95, stopa 5xx i 4xx,
normalizirane rute), `inventory_close_job_metrics` (queued/running/failed starost,
istekli lease-ovi), `rate_limit_metrics` (odluke, 429 burst, fail-open/fail-closed
kvarovi i uzastopni Redis prekidi), `upload_reject_metrics`, `postgres_pool_latency`,
`redis_connection_health`, `bullmq_queue_metrics` i `notification_outbox_backlog`.
Pragovi za inventory close alarm (`inventory.close.metrics.*`) također su privatne
postavke; default-i su 10 nezavršenih poslova, 300 s queued, 1800 s running i
300 s neriješenog failed posla. `rate_limit.metrics.*` default-i su 5 fail-open
odluka, 3 uzastopna kvara i 25 odbijenica (429) po intervalu; svaki fail-closed
odbijen zahtjev odmah daje upozorenje. Pojedinačni Redis kvarovi se loguju kao
`rate_limit_check_failed` bez klijentske IP adrese ili Redis ključa.
Svaki HTTP zahtjev ima i `http_request` red sa `correlationId` iz `X-Request-Id`
headera, metodom, statusom, trajanjem i normaliziranom `route`. Pragovi za HTTP
alarm (`http.metrics.*`) su privatne postavke u administratorskom UI-ju; default-i
su 5% 5xx, 1000 ms p95, 5 apsolutnih 5xx i minimalni uzorak od 20 zahtjeva.
Logovi ne sadrže query stringove u agregatima, tijela, tokene ni imena datoteka.
Svi aplikacijski logovi (uključujući greške workera, schedulera i dokumenata) su
jedan red JSON-a sa stabilnim `event` imenom, `level` i `correlationId`; CI provjera
`test:integration:structured-logs` zabranjuje nove free-form `logger.*` poruke.

## Plan i matrice

- [Plan overview](.cursor/plans/inventory-v2/00_overview.md)
- [Checklist](.cursor/plans/inventory-v2/CHECKLIST.md)
- [Design tokens](.cursor/docs/design-tokens.md)
