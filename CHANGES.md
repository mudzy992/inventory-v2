# CHANGES.md — Redis + Socket.IO integracija (produkcijska priprema)

## Kontekst

Socket.IO je u projektu **već postojao** (`NotificationsGateway`, JWT-autentifikovan,
per-user rooms) — nije bilo potrebe da se implementira iznova. Ono što je nedostajalo
i što je urađeno u ovoj izmjeni jeste: (1) Redis adapter za taj Socket.IO sloj (bez
njega broadcast radi ispravno samo dok postoji tačno jedna backend instanca), i
(2) stvarna Redis integracija koja koristi platformu iz prethodne isporuke
(`redis-platform`) da izvuče konkretnu, mjerljivu vrijednost iz ove aplikacije —
ne "Redis radi caching" uopšteno, nego targetirane izmjene na mjestima gdje je
profiliranje koda pokazalo stvaran problem.

## Šta je urađeno i zašto (redom po dobitku)

### 1. BullMQ umjesto hand-rolled DB-polling worker-a (najveći dobitak)
`InventorySessionCloseWorkerService` je ranije radio `setInterval(1200ms)` →
Postgres upit "ima li queued posla" **bez obzira da li ga stvarno ima** — konstantno
opterećenje baze 24/7 čak i kad platforma potpuno miruje. Zamijenjeno pravim BullMQ
queue-om (`inventory-session-close`): `closeSession()` sada radi `queue.add()` umjesto
da se osloni na polling da "nekad primijeti" novi red; worker (`WorkerHost`/`@Processor`)
se budi isključivo kad Redis javi novi posao. Dodatno dobijeno besplatno: retry sa
exponential backoff (3 pokušaja), `concurrency: 2`, dead-letter vidljivost neuspjelih
poslova. Postgres `inventorySessionCloseJob` red je namjerno ostao sistem-od-istine za
progres/audit — frontend polling/socket eventi rade identično kao ranije, nula izmjena
na frontend strani.

### 2. Socket.IO Redis adapter
`NotificationsGateway` je i dalje radio ispravno, ali samo u single-instance
deploymentu (Socket.IO rooms su in-memory po defaultu). Dodat `@socket.io/redis-adapter`
u `main.ts` preko custom `RedisIoAdapter` — sada `server.to(room).emit(...)` radi
ispravno bez obzira koja instanca primi HTTP zahtjev i na koju je instancu klijent
povezan. Graceful fallback: ako Redis nije dostupan pri startu, aplikacija nastavlja
sa in-memory adapterom (ne pada).

### 3. JWT strategy cache (najveći "brzi" dobitak po zahtjevu)
`JwtStrategy.validate()` je na **svaki** autentifikovani HTTP/WebSocket zahtjev radio
1 Prisma upit sa 4 uključene relacije (registrar/coordinator/moderator dodjele).
Sada se rezultat kešira 30s po korisniku (`auth:user:{id}`), sa eksplicitnom
invalidacijom u `UsersService.update()` (rola/pristup/isActive promjene su odmah
vidljive, ne čekaju TTL).

### 4. Settings cache + N+1 eliminacija u production-mode provjerama
`SettingsService` čita se na skoro svakom write putu (feature flag provjere).
`InventoryProductionModeService.findProductionLockOrgUnitIdsForCity()` je radio
N upita u petlji (po jedan po distribuciji u gradu) na **svaki** poziv. Oboje sad
prolaze kroz kratak TTL cache-aside (30s), sa eksplicitnom invalidacijom na
`SettingsService.updateValue()`/`upsertValues()`.

### 5. Distribuirani lock za dnevni cron
`InventorySchedulerService.handleDailyInventoryJobs()` (`@Cron('5 0 * * *')`) bi se,
kad se backend ikad skalira na više replika, izvršio na SVAKOJ replici nezavisno →
duplirane draft sesije/zatvaranja. Dodat Redis `SET NX PX` lock (15min TTL) — danas
bezopasno (jedna instanca), sutra ispravno bez ikakvih daljih izmjena.

### 6. Redis-backed rate limiting na `/auth/login`
Brute-force zaštita koja je ranije potpuno nedostajala. Fixed-window brojač
(`INCR` + `EXPIRE`) po IP adresi, default 10 pokušaja/60s (`RATE_LIMIT_LOGIN_MAX`,
`RATE_LIMIT_LOGIN_WINDOW_SEC`). `main.ts` dobija `app.set('trust proxy', 1)` da bi
`request.ip` bio tačan iza Traefik/Coolify proxyja.

### 7. Cache za javni equipment lookup (QR kod stranica)
`PublicEquipmentService.findOne()` — neautentifikovan, QR-skeniranje-vođen endpoint,
potencijalno najveći anonimni saobraćaj u aplikaciji — radio je equipment upit sa 4
nivoa relacija PLUS neograničen `orgUnit.findMany()` (svi org unit-i u sistemu) na
**svaki** poziv. Sad kešira cijeli konstruisan odgovor 60s po equipment ID-u.

## Novi fajlovi

```
backend/src/redis/
  redis.config.ts          — env config (host/port/ACL user/keyPrefix/TLS)
  redis.constants.ts        — DI token
  redis.module.ts            — globalni modul, opšti ioredis klijent
  redis.service.ts           — cache-aside, distributed lock, rate-limit primitiva
  redis-io.adapter.ts        — Socket.IO Redis adapter
  redis-rate-limit.guard.ts  — guard za /auth/login

backend/src/queues/
  bullmq.module.ts           — globalna BullMQ konekcija (posebna od RedisService)

backend/src/modules/inventory-count/
  inventory-session-close.queue.ts   — queue naziv + payload tip (dijeljeno)
```

## Izmijenjeni fajlovi (backend)

`main.ts`, `app.module.ts`, `common/common.module.ts`,
`common/services/inventory-production-mode.service.ts`,
`modules/auth/strategies/jwt.strategy.ts`, `modules/auth/auth.controller.ts`,
`modules/users/users.service.ts`, `modules/settings/settings.service.ts`,
`modules/public-equipment/public-equipment.service.ts`,
`modules/inventory-scheduler/inventory-scheduler.service.ts`,
`modules/inventory-count/inventory-count.service.ts`,
`modules/inventory-count/inventory-count.module.ts`,
`modules/inventory-count/inventory-session-close-worker.service.ts` (potpuno
prepravljen iz `setInterval` pollera u `WorkerHost`/`@Processor`), `package.json`.

## Izmijenjeni fajlovi (infra)

`docker-compose.yml` (Coolify — dodat `redis_net`, `REDIS_*`/`RATE_LIMIT_*`/
`INVENTORY_SCHEDULER_ENABLED` env), `docker-compose.prod.yml` (standalone Traefik
put — dodat paketovani `redis` servis jer se ne oslanja na Coolify `redis_net`
konvenciju), `.env.example`.

## Kako se ova aplikacija uklapa u prethodno isporučenu Redis platformu

Ova aplikacija se ponaša kao "Application" primjer iz `redis-platform` isporuke:
poseban ACL user (`inventory-v2`), ograničen na `~inventory-v2:*` key/pubsub
namespace preko `REDIS_KEY_PREFIX`. Da bi ovo stvarno radilo u Coolify-ju:

1. Na centralnoj Redis platformi (`acl/users.acl`) koristiti **kanonsko
   pravilo** iz [`deploy/redis/users.acl.example`](deploy/redis/users.acl.example)
   (cijeli vodič: [`docs/redis-acl.md`](docs/redis-acl.md)):
   ```
   # <PREFIX> = REDIS_KEY_PREFIX bez dvotačke
   user inventory-v2 on ><JAKA_LOZINKA> \
     ~inventory-v2:* &inventory-v2:* \
     &inventory-v2:#/#* &inventory-v2:#/notifications#* \
     +@all -@admin -@dangerous +info
   ```
   **OBJE ose su obavezne i nezavisne:** `~inventory-v2:*` su ključevi,
   `&…` su Pub/Sub kanali. Redis 7 starta sa `resetchannels`, ali — što je
   ključno — za `PSUBSCRIBE` poredi pattern **doslovno** (`strcmp`), ne kao
   glob. Zato `&inventory-v2:*` sam po sebi NIJE dovoljan: potrebna su dva
   dodatna, egzaktna `&` unosa za `inventory-v2:#/#*` (root namespace) i
   `inventory-v2:#/notifications#*`. Bez njih Redis vraća
   `NOPERM No permissions to access a channel` na `PSUBSCRIBE inventory-v2:#/#*`.
   Svaki novi Socket.IO namespace traži svoj `&` unos. Ranija uža allowlista
   kategorija ovdje nije dovoljna: ioredis šalje `INFO`/`CLIENT SETINFO`, a
   BullMQ koristi `EVAL`/`EVALSHA` Lua skripte (`+info` gasi ioredis warning).
   zatim `redis-cli -a $REDIS_ADMIN_PASSWORD ACL LOAD` i
   `ACL GETUSER inventory-v2` za potvrdu `channels` reda.
2. U Coolify env varijablama za ovaj backend servis postaviti `REDIS_PASSWORD` na
   istu vrijednost.
3. Backend servis ove aplikacije mora biti na `redis_net` mreži (već dodato u
   `docker-compose.yml`) — Coolify to automatski poštuje jer je `redis_net`
   deklarisan kao `external: true`.

## KORAK KOJI SE MORA RUČNO URADITI PRIJE BUILD-A (network sandbox ograničenje)

Ova izmjena je rađena u okruženju bez pristupa internetu, pa `package-lock.json`
**NIJE** ažuriran za nove pakete (`ioredis`, `bullmq`, `@nestjs/bullmq`,
`@socket.io/redis-adapter`) dodate u `backend/package.json`. `Dockerfile` koristi
`npm ci`, koji zahtijeva da lockfile tačno odgovara `package.json` — build će
propasti dok se ovo ne uradi:

```bash
cd backend
npm install     # regeneriše package-lock.json sa novim paketima
git add package.json package-lock.json
git commit -m "Add Redis/BullMQ/Socket.IO-adapter dependencies"
```

Ovo je jednokratan korak, lokalno ili u CI-u sa internet pristupom, prije prvog
build-a nakon ove izmjene.

## Deploy checklist (Coolify)

1. `npm install` u `backend/` (vidi gore) i commit ažuriranog `package-lock.json`.
2. Potvrditi da centralna Redis platforma (`redis-core`) radi na istom serveru,
   na `redis_net` mreži (prethodna isporuka).
3. Dodati/potvrditi `inventory-v2` ACL usera na Redis platformi (vidi gore).
4. U Coolify env varijablama za backend servis ove aplikacije postaviti:
   `REDIS_HOST=redis-core`, `REDIS_PORT=6379`, `REDIS_USERNAME=inventory-v2`,
   `REDIS_PASSWORD=<lozinka iz users.acl>`, `REDIS_KEY_PREFIX=inventory-v2`.
   (Ostale `REDIS_*`/`RATE_LIMIT_*` varijable imaju razumne default vrijednosti
   u `docker-compose.yml`, opciono ih je prepisati.)
5. Redeploy backend servisa (Coolify će build-ovati novi image preko
   `docker-compose.yml`, koji sad uključuje `redis_net`).
6. Nakon deploya, provjeriti backend logove za:
   - `Redis ready (keyPrefix="inventory-v2:")` — opšti Redis klijent povezan.
   - `socketio_redis_adapter_connected` (`channelNamespace: "inventory-v2:"`) — WebSocket adapter povezan.
   Ako umjesto toga piše `socketio_redis_acl_denied`, `socketio_redis_adapter_fallback`
   ili "connection error", provjeriti **& kanal** grant, prefiks, lozinku i mrežu
   prije nego što se nastavi (vidi `docs/redis-acl.md`). `/health/ready` vraća
   `socketio.mode`; `in_memory` na više replika nije ispravan rad.
7. Funkcionalni test: zatvoriti test inventurnu sesiju i potvrditi da se
   `inventory.close_job.updated` eventi i dalje primaju uživo u frontend-u
   (potvrđuje da BullMQ worker i Socket.IO adapter rade zajedno ispravno).

## Šta NIJE mijenjano (namjerno, van obima)

- Frontend kod — nula izmjena; svi Socket.IO event nazivi/payload-i ostali su
  identični, pa postojeći `use-inventory-socket-events.ts` i slični hookovi rade
  bez izmjena.
- Prisma šema — `inventorySessionCloseJob`/`inventoryPendingAction` tabele ostaju
  iste; BullMQ je dodat KAO orkestracija IZNAD postojećeg DB modela progres-a, ne
  kao zamjena za njega.
- Nije uveden Redis kao "single point of failure" za čitanje podataka: sve
  cache-aside metode (`RedisService.getJson`/`setJson`/`remember`) degradiraju na
  direktan DB upit ako Redis nije dostupan — aplikacija radi (sporije) i bez
  Redis-a. Jedino distribuirani lock i rate-limit guard imaju eksplicitno
  drugačiju (namjerno dokumentovanu) fail-open/fail-closed politiku — vidi
  komentare u `redis.service.ts` i `redis-rate-limit.guard.ts`.
