# Backend — detaljan plan implementacije audita

**Status:** implementacija u toku. Već zatvoreno: prenosnica escape-uje dinamički HTML; ranjivi proxy/Multer/Socket.IO dependency lanac je patchovan, a backend lockfile prolazi `npm audit` bez nalaza; production CORS allow-lista je fail-closed za HTTP i WebSocket; user scope izmjene i refresh rotacija su transakcijski zaštićene; production setup odbija nedostajući token, bootstrap se serijalizuje i početne postavke upisuju se u istoj transakciji; uploadi imaju pre-parser limite, signature/ZIP provjere i temp-file/rename + DB transakciju sa cleanup-om na grešku; inventory-close poslovi imaju retry/reconciliation; FIFO lot dekrementi i transfer state transitions su conditional/atomarni; WebSocket odbija neaktivne korisnike i employee deactivation prekida njihove aktivne socket sesije; izabrani write endpointi koriste validirane DTO-e; category reparent provjerava ciklus pod advisory lock-om; CSV ćelije neutralizuju formule, a equipment CSV se sada šalje backpressure-aware streamom u 500-rednim cursor stranicama; readiness provjerava PostgreSQL, shared Redis i obje BullMQ queue konekcije. Dodana je PostgreSQL TLS konfiguracija sa peer verifikacijom/CA podrškom i CI provjera stvarnog ponašanja partial unique indeksa; Redis konfiguracija u backendu i document-workeru sada strogo validira boolean TLS i port/DB numeričke vrijednosti; grešna vrijednost za TLS više ne može tiho isključiti enkripciju. Document-worker ima config/health/TLS unit testove i live Redis readiness provjeru, uz build i dependency audit u zasebnom CI jobu. Refresh tokeni se automatski čiste jednom dnevno u UTC-u u ograničenim batch-ovima, uz složeni expiry indeks. CI za ranije pushanu promjenu `6dcfe57` (run `40227562390`) prošao je frontend, backend i worker; tada je backend suite imao 414 testova, a CI uključuje PostgreSQL migracije, settings-defaults, inventory race, disposal-approval race i Redis rate-limit/lease-renewal integration testove. Pending-action retry commit `8ad07bf` prošao je CI run `40230286269` na frontend, backend i document-worker jobovima; backend CI je prošao Prisma/migration provjere, PostgreSQL inventory/disposal race integracije, Redis testove, lint, typecheck, build i svih 423 unit testa. Proširena PostgreSQL disposal integracija je prošla: same-session retry čuva review status, a nova sesija ponovo otvara approval. Nastavak za stale lease recovery commit `bfcd73a` prošao je CI run `40231642660` na sva tri joba; backend je prošao novu migraciju, expired close-lease PostgreSQL integraciju, lint, typecheck, build i svih 426 unit testova. Dodatna PostgreSQL provjera stvarnog `SIGKILL` nakon disposal side-effect commita prošla je u CI run-u `40232428101`, zajedno sa frontend/backend/document-worker provjerama. Produkcijski TLS/Redis ACL i proxy topologija i dalje traže deployment/staging potvrdu; javni QR privacy odluka i ostale neriješene tačke ostaju otvorene. Posljednji završeni observability paket `b393e85` uveo je request/job correlation ID, redakciju logova i strukturirani `http_request` signal; CI run `40391502604` je zelen na backend, frontend i document-worker jobovima. Paket `825d790`/`bbee7e5` je zatim dodao konfigurabilni `DATABASE_POOL_MAX`, `postgres_pool_latency` signal, podešive pragove i očuvanje JSON logova kroz `CorrelationLogger`; prvi CI run `40400986820` je otkrio lazy `pg.Pool` redoslijed, a ispravka prolazi u run-u `40401867512` na sva tri joba. Sljedeći observability paket `c2e5f9f` uvodi `redis_connection_health` signal, procesne reconnect/error brojače i strukturirane Redis lifecycle/cache/lock logove; CI run `40407334471` je zelen na sva tri joba. Naredni paket `385d586` dodaje `upload_rejected`/`upload_reject_metrics` signale, procesne brojače po razlogu/operaciji i strukturirane upload cleanup greške; CI run `40465018093` je zelen na sva tri joba. Paket HTTP metrika zatim dodaje `http_request_metrics` signal sa histogramskim p95, stopom 5xx i normaliziranim rutama, uz četiri nove privatne postavke i namjensku CI provjeru povezivanja; CI run `40469547725` je zelen na sva tri joba. Sljedeći paket uvodi DB-backed `inventory_close_job_metrics` signal za starost/status close poslova i istekle lease-ove, uz četiri nove privatne postavke i PostgreSQL integracijsku provjeru; CI run `40472185008` je zelen na sva tri joba. Naredni paket dodaje `rate_limit_metrics` i `rate_limit_check_failed` signale za rate-limit odluke, Redis kvarove i fail-open/fail-closed puteve, uz tri nove privatne postavke i Redis integracijsku provjeru; CI run `40478241036` je zelen na sva tri joba. Zatim je dovršen prelazak svih preostalih free-form aplikacijskih logova u strukturirani JSON, uz popravku redakcije tajni unutar serijalizovanih JSON poruka i statičku CI zaštitu od regresije; CI run `40481512849` je zelen na sva tri joba. Posljednji observability paket dodaje `business_state_transition_metrics` nad devet stvarnih conditional write tačaka, čime je zatvorena stavka metrika poslovnih state-transitiona; CI run `40486439959` je zelen na sva tri joba. Zatim je zatvoren P1 nalaz Redis TLS verifikacije (§0.4): oba procesa eksplicitno čuvaju peer/hostname provjeru, a novi CI korak generiše stvarni CA/server cert i odbacuje pogrešan hostname, nepouzdan CA i plaintext kroz pravi `ioredis` handshake; prvi run `40491072778` je otkrio CI-specifičnu pretpostavku DNS hosta u unit specu, ispravka `21c66dc` prolazi u run-u `40491773900` na sva tri joba. Sljedeći paket zatvara P1 nalaz PostgreSQL TLS/CA runtime dokaza (§0.5): `resolveDatabaseConfig` eksplicitno čuva peer/hostname verifikaciju uz TLSv1.2 floor i fail-closed obradu konfliktnog `sslmode`, a novi CI korak koristi stvarni CA/server lanac i `pg.Client` kroz TLS-only PostgreSQL wire stub. Zatim je zatvoren P1 nalaz multi-instance Socket.IO adaptera (§0.6): otkriveno i ispravljeno da ioredis `keyPrefix` ne prefiksuje pub/sub kanale, dodani su adapter `key`, `socketio_adapter_mode` signal, readiness polje, opt-in fail-closed politika i CI dokaz cross-instance dostave i ACL prefiksne izolacije na tri replike. Zatim je zatvoren P2 nalaz schema-drift zaštite (§0.7): SHA-256 manifest `schema.prisma` i svih migracija, CI gate bez baze za nepromjenjivost historije i nerecenzirani destruktivni SQL, uz osvježen migracijski README. Sljedeći paket (§0.8) uklanja tihi `npm ci || npm install` fallback iz document-worker image-a i dodaje dependency-free CI politiku za reproduktivnost sva tri produkcijska image-a: tačan lockfile COPY, isključivo `npm ci`, usklađen Node 22, sinhronizovani lockfile-i, odobreni HTTPS registry sa integrity hashom i zabrana zaostalih Dockerfile varijanti u compose buildu. Zatim je riješen produkcijski `NOPERM No permissions to access a channel` incident (§0.9): kanonski Redis ACL sa obaveznim `&<PREFIX>:*` i egzaktnim `&` grantovima za oba `PSUBSCRIBE` patterna (Redis 7 ih poredi doslovno), Pub/Sub preflight u Socket.IO adapteru koji degradira umjesto da ruši proces, pravi Redis 7 ACL CI dokaz i ispravljen BullMQ `maxRetriesPerRequest` warning. Zatim je zatvoren P2 nalaz revokacije sesija (§0.10): `cachedAt`/revocation marker u auth kešu, marker-first fail-closed invalidation prije commit-a, transakcijsko gašenje refresh tokena u oba deaktivacijska puta, in-transaction `isActive` re-check u refresh rotaciji i live Redis+PostgreSQL CI dokaz. Zatim je zatvoren P2 nalaz javnog QR endpointa (§0.11): zamrznut privacy contract za svih 12 polja uz dokumentovan accepted-risk, list cap za historiju, ograničen org-unit upit, TypeScript compiler API gate koji drži backend i frontend DTO u sinhronu i runtime asercija oblika odgovora. Zatim je zatvoren P2 nalaz upload read autorizacije (§0.12): striktni query DTO, fail-closed allow-lista sa egzhaustivnim autorizatorom, containment putanje na write+download i uklanjanje internog `path` iz javnog odgovora. Zatim je implementiran HTTP hardening paket (§0.13): dependency-free sigurnosni headeri sa uslovnim HSTS-om i no-store za auth/setup, reverzibilni env flagovi, te opt-in globalni rate limit nad istim atomarnim Lua brojačem uz health izuzeća i fail-open/closed politiku. Na kraju je dodan deployment readiness contract (§0.14): jedan dependency-free alat koji u repo modi čuva sigurne compose default-e i operator vodiče, a u `--env` modi daje operatoru PASS/WARN/FAIL izvještaj za svih 19 preostalih deployment stavki, uz eksplicitne MANUAL provjere za certifikate, live ACL i proxy lanac. Zatim je zatvorena posljednja P1 stored-XSS površina (§0.15): generirani HTML dokument prenosnice sada ima runtime tag allow-list, hash-based CSP sa sandbox-om izračunat iz stvarnog stila, attachment default sa sanitizovanim imenom fajla i no-store headerima, uz reverzibilni `inline` režim. Zatim je zatvoren posljednji veći kodni kriterij (§0.16): vremenski ograničen oporavak za DocumentJob redove čiji BullMQ posao nikad ne dođe do terminalnog stanja, plus izvršiva matrica 9 crash pointova koja svakom toku garantuje oporavak, idempotenciju i CI fault-injection provjeru. Na kraju su dodani mjerljivi performansni budžeti (§0.17): umjesto flaky vremenskih pragova CI mjeri broj DB upita, veličinu CSV batcha, cap-ove i granice paginacije, uz široki wall-clock smoke signal i 11 unit scenarija. Na kraju je urađen neovisni code-only audit (§0.18, ocjena 8.1/10) koji je otkrio i ispravio P1 zastarjele autorizacijske keševe, mrtvi kod sa sirovim logovima, revokaciju refresh tokena pri promjeni lozinke i neograničene array DTO-e, uz 15 ocijenjenih nalaza i formalno delegirane preostale deployment stavke. Zatim su zatvoreni nalazi N-5/6/7/8/12 iz neovisnog audita (§0.19): keširani org/warehouse graf sa jednim bounded upitom, batch notifikacijski INSERT, durable stock i relocation outbox unutar transakcija, 7 karakterizacijskih specova; vlasnik je potvrdio aktivni TLS na Redis i PostgreSQL kroz `TLS_VERIFIED=true`. Ocjena koda 8.8/10.
**Osnova:** [`backend-audit.md`](./backend-audit.md), koji sadrži nalaze, izvore u kodu i početnu faznu podjelu
**Opseg:** backend API, PostgreSQL/Prisma, Redis/BullMQ/Socket.IO, uploadi, background poslovi, sigurnost, testovi i operativna spremnost.

> Ovaj dokument razrađuje redoslijed i kriterije prihvatanja. Ne predstavlja odobrenje za promjenu poslovnih pravila. Prije promjene ponašanja (npr. javnih QR podataka, djelimično neuspjele inventure, statusa prenosa) potrebno je potvrditi očekivanja sa vlasnikom procesa.

## 1. Cilj i pravila izvođenja

Cilj je zatvoriti potvrđene sigurnosne i integritetske rizike bez velikog „big-bang“ refaktora. Raditi u malim, pregledljivim promjenama, uz test prije ili zajedno sa svakom izmjenom.

1. **Prvo reprodukcija, pa izmjena.** Zabilježiti postojeće ponašanje i napraviti test koji prikazuje kvar/rizik.
2. **Jedna poslovna tema po promjeni.** Dependency update, upload promjena, transakcije i refaktor servisa ne spajati u jedan veliki diff.
3. **Baza je autoritet za integritet.** Pre-check u aplikaciji služi za razumljivu poruku; unique constraint, conditional update ili transakcija sprečavaju race.
4. **Asinhroni poslovi moraju biti oporavljivi.** Svaki DB posao mora imati definisanog vlasnika, retry pravilo, idempotency i reconciliation.
5. **Kompatibilan rollout.** Migracije prvo proširiti kompatibilno, zatim objaviti kod koji koristi novo polje/indeks, a tek kasnije ukloniti zastarjelo.
6. **Ne izlagati tajne ili PII u testovima/logovima.** Koristiti sintetičke podatke, anonimizovane fixture-e i konfiguracije bez produkcijskih credentiala.
7. **Svaki paket završava jasnim prihvatanjem.** Ne prelaziti na veći refaktor dok testovi i observability ne pokažu da je promjena sigurna.

## 2. Prioriteti i redoslijed

| Talas | Fokus | Zašto ovim redom |
|---:|---|---|
| 0 | Baseline i runtime provjere | Razdvaja potvrđene kodne probleme od deployment pretpostavki i čuva rollback put. |
| 1 | Kritična sigurnost: dependency chain, upload, HTML, setup/config | Smanjuje neposrednu izloženost prije većih funkcionalnih zahvata. |
| 2 | Atomičnost auth/user promjena i invalidacija pristupa | Sprečava nevažeće scope-ove, dupli refresh i pristup deaktiviranih korisnika. |
| 3 | Inventory close i pouzdanost queue/outbox tokova | Sprečava trajno zaglavljene ili duplirane poslovne poslove. |
| 4 | Konkurentnost, ograničenja i privatnost domenskih podataka | Učvršćuje zalihe, transfere, kategorije, izvještaje i javni QR. |
| 5 | Integracioni testovi, health i release gate | Održava popravke dokazivim pri sljedećim isporukama. |
| 6 | Refaktor i performanse | Raditi tek uz stabilan karakterizacijski test i mjerenje. |

P1 iz audita ne mora značiti isti redoslijed za svaki deployment. Ako stvarna konfiguracija pokaže da su TLS, CORS ili setup već zaštićeni na infrastrukturnom sloju, dokumentovati dokaz i zatvoriti nalaz kao potvrđeno mitigovan — ne uvoditi paralelnu, nepotrebnu konfiguraciju.

## 3. Talas 0 — baseline, staging i deployment dokazi

### 0.1 Zabilježiti reproduktivni baseline

- Sačuvati branch/commit, Node/npm verziju, lockfile hash, `npm run test:unit` rezultat i backend/document-worker build rezultate.
- CI rezultat za posljednju promjenu: run `40227562390` za commit `6dcfe57` prošao je frontend/backend/document-worker provjere, uključujući typecheck, build, lint, dependency audit, 414 backend testova i 12 worker testova; backend job generiše Prisma client, primjenjuje Postgres migracije te pokreće settings-defaults, inventory race, disposal-approval race i Redis rate-limit/lease-renewal integration testove.
- Nastaviti koristiti hosted CI kao provjeru punog builda; lokalni rezultat bez generisanog Prisma clienta ne zamjenjuje CI kompilaciju.
- Sačuvati `npm audit` JSON za backend i zavisnosti workera. Advisory brojevi su vremenski promjenjivi; svaki update se poredi sa novim izvještajem.

### 0.2 Potvrditi produkcijske granice

Bez unošenja tajni u repozitorij ili chat, provjeriti u staging/prod konfiguraciji:

- Koji proxy terminira TLS, kojim redoslijedom prolaze proxy-i i da li je backend direktno dostupan s interneta.
- Efektivni CORS origin allow-list, `trust proxy`, TLS za PostgreSQL/Redis, Redis ACL i CA mount.
- Da li je `SETUP_TOKEN` obavezan prije prvog administratora i kako se rotira.
- Da li transfer HTML endpoint ostaje unutar istog browser origin-a ili se preuzima kao attachment.
- Koji procesi/replice dijele upload filesystem i koliko DB konekcija koriste zajedno.

### 0.3 Migracijski i rollback rehearsal

- Na praznoj Postgres bazi izvršiti sve migracije od početka.
- Na staging kopiji bez ličnih podataka izvršiti upgrade od trenutne verzije.
- Zabilježiti vrijeme, blokade, indeksne operacije i rollback/restore korake.
- Ažurirati migration README tako da odgovara stvarnom direktoriju migracija.

**Kriteriji izlaza:** ponovljiv testni okoliš; potvrđen DB/Redis TLS ili jasno evidentiran gap; migracije prolaze na praznoj i upgrade bazi; poznat rollback postupak.

### 0.4 Redis TLS verifikacija (kod + CI dokaz)

P1 nalaz „Redis TLS sa stvarnim chain-om i Node hostname verification" zatvoren je u repozitoriju; preostaje samo potvrda stvarnog deployment CA fajla i ACL-a od strane vlasnika platforme.

**Implementacija.** `backend/src/redis/redis.config.ts::buildRedisTlsOptions` i `document-worker/src/redis-connection.ts::buildRedisTlsOptions` sada za svaki TLS Redis klijent eksplicitno postavljaju `rejectUnauthorized: true`, `minVersion: 'TLSv1.2'` i `servername: config.host` kada je host DNS ime. Za IP literal `servername` se namjerno ne postavlja — tada Node provjerava IP `subjectAltName` certifikata. Bez `REDIS_CA_CERT_PATH` koristi se sistemski trust store; sa putanjom se CA PEM čita kao trust anchor. `REDIS_TLS=false` je jedini put do plaintext konekcije; oba config readera strogo validiraju boolean.

**Test.** `backend/prisma/check-redis-tls-handshake.ts` (`npm run test:integration:redis-tls-handshake`, CI korak `Verify Redis TLS certificate and hostname verification`) generiše pravi CA + server cert lanac preko `openssl` (SAN `DNS:localhost`, `IP:127.0.0.1`), pokreće TLS-only RESP stub bez Redis binaryja i dokazuje:

1. oba buildera vraćaju identične, eksplicitno sigurne TLS opcije (CA, `rejectUnauthorized`, `minVersion`, SNI, bez `checkServerIdentity` override-a);
2. `readRedisConfig()` i `loadConfig()` jednako čitaju `REDIS_TLS`/`REDIS_CA_CERT_PATH`, a `false` isključuje TLS objekat;
3. statički sken 512 TS fajlova backend + worker zabranjuje `rejectUnauthorized: false`, `checkServerIdentity: () => …` i `NODE_TLS_REJECT_UNAUTHORIZED=0`;
4. `.env.example` i `docker-compose.prod.yml` dokumentuju read-only CA mount za oba servisa;
5. handshake sa ispravnim CA/hostname-om je `authorized: true` i vraća `+PONG`, plaintext `PING` ne dobija odgovor, a pogrešan hostname i nepouzdan CA padaju sa certifikacijskim greškama;
6. pravi `ioredis` klijent prolazi ready check i `PING` kroz TLS, a sa pogrešnim SNI ne dostiže `ready`.

Unit specovi `backend/src/redis/redis.config.spec.ts` i `document-worker/src/redis-connection.spec.ts` pokrivaju DNS/IP SNI razliku i zabranu bypass-a.

**CI dokaz.** Kodni commit `87472a4` je u run-u `40491072778` pao samo na backend unit specu jer je CI `REDIS_HOST=127.0.0.1` (IP → bez SNI) zamijenio pretpostavljeni DNS host u jednoj tvrdnji; ispravka `21c66dc` koristi eksplicitni DNS host. Run `40491773900` je `completed success` na svim jobovima (backend, frontend, document-worker), uključujući korak `Verify Redis TLS certificate and hostname verification`.

**Ostaje vlasniku/deploymentu (Redis):** montirati stvarni `redis-ca.crt` na oba servisa kada se koristi vanjski TLS Redis (u `docker-compose.yml` je već, u `docker-compose.prod.yml` su pripremljene zakomentarisane read-only mount linije), potvrditi da `REDIS_HOST` odgovara CN/SAN certifikata, te provjeriti Redis ACL korisnika i njegov key/pubsub pattern na live instanci.

### 0.5 PostgreSQL TLS/CA verifikacija u runtime (kod + CI dokaz)

**Implementacija.** `backend/src/prisma/database-config.util.ts::resolveSslConfig` sada uz `rejectUnauthorized: true` eksplicitno postavlja `minVersion: 'TLSv1.2'` i `servername` za DNS host (za IP host se provjerava IP SAN certifikata). Sva četiri podržana moda očuvana su, ali **svaki uključeni** mod (`require`, `verify-ca`, `verify-full`) znači verifikovanu TLS vezu — `require` nije enkripcija bez provjere peer-a. Dodana je fail-closed zaštita: ako `sslmode` unutar `DATABASE_URL` i `DATABASE_SSL_MODE` nisu saglasni oko toga da li je TLS uključen, startup puca umjesto tihe downgrade promjene; `sslrootcert` bez CA fajla više ne poništava `DATABASE_SSL_CA`. `createPrismaClientOptions()` i dalje prosljeđuje `ssl: config.ssl` u `pg.Pool`.

**Test.** `backend/prisma/check-postgres-tls-handshake.ts` (`npm run test:integration:postgres-tls-handshake`, CI korak `Verify PostgreSQL TLS certificate and hostname verification`) dijeli `openssl` CA helper iz `prisma/utils/tls-test-chain.util.ts` sa Redis checkom. Pokreće TLS-only, in-process PostgreSQL wire stub (SSLRequest → `S` → pravi TLS upgrade → StartupMessage → `SELECT 1`) i dokazuje:

1. `resolveDatabaseConfig()` za `verify-full` vraća tačno `{ rejectUnauthorized: true, minVersion: 'TLSv1.2', ca, servername }` bez `checkServerIdentity` override-a;
2. pravi `pg.Client` sa svakim uključenim modom uspješno izvršava `SELECT 1` kroz verificirani TLS;
3. `sslmode=disable` daje `ssl: undefined` i ne može se proći kroz TLS-only endpoint;
4. konflikt `sslmode` oko uključenja TLS-a, `sslmode=prefer`, CA uz isključen TLS i nepostojeći CA fajl — svi pucaju pri čitanju konfiguracije;
5. pogrešan CA (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), certifikat za tuđi hostname (`ERR_TLS_CERT_ALTNAME_INVALID`) i plaintext startup bivaju odbijeni od strane stvarnog `pg` klijenta;
6. statička provjera `create-prisma-client.ts` (koristi `resolveDatabaseConfig()` + `ssl: config.ssl`, bez verifikacijskog bypass-a) i deployment provjera `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` (`DATABASE_SSL_MODE`/`DATABASE_SSL_CA` su eksplicitni u oba compose fajla).

Unit spec `backend/src/prisma/database-config.util.spec.ts` pokriva SNI za DNS/IP, sve modove, konflikt downgrade-a, `sslrootcert` fallback, neispravan CA i pool budžet.

**CI dokaz.** Commit `5451ed1` prolazi u run-u `40496185060` (`completed success` na backend, frontend i document-worker jobovima). Koraci `Verify Redis TLS certificate and hostname verification` (33) i `Verify PostgreSQL TLS certificate and hostname verification` (34), lint, typecheck i svih 684 backend unit testova su zeleni; lokalno potvrđeni su i `npx nest build`, 14/14 FE guardova i 15/15 worker unit testova.

**Ostaje vlasniku/deploymentu:** montirati stvarni PostgreSQL CA fajl kada baza koristi privatni CA, potvrditi da CN/SAN certifikata odgovara `DATABASE_HOST`, te potvrditi da vanjski `DATABASE_URL` ne sadrži `sslmode` koji je u suprotnosti sa `DATABASE_SSL_MODE`.

### 0.6 Multi-instance Socket.IO adapter (kanali, ACL namespace, readiness)

**Pronađeni bug (P1).** `RedisIoAdapter` je na pub/sub klijente stavljao ioredis opciju `keyPrefix: config.keyPrefix`. ioredis primjenjuje `keyPrefix` samo na komande koje imaju ključeve (`GET`, `SET`, …); za `PUBLISH`, `SUBSCRIBE` i `PSUBSCRIBE` je `getKeyIndexes()` prazan, pa prefiks **nije bio primijenjen**. Adapter je bez `key` opcije koristio default kanale `socket.io#…`, `socket.io-request#…` i `socket.io-response#…` — izvan ACL pub/sub namespace-a `<prefix>:*` opisanog u `redis.config.ts`, uz rizik miješanja eventa više deploymenta na istom Redisu.

**Implementacija.**
- `createAdapter(pubClient, subClient, { key: config.keyPrefix })` sada imenuje sve kanale `<prefix>:#…`, `<prefix>:-request#…` i `<prefix>:-response#…`; ioredis `keyPrefix` je uklonjen sa ova dva namjenska klijenta jer za pub/sub nema efekta.
- Novi `backend/src/redis/socketio-adapter.registry.ts` bilježi efektivni režim (`not_initialized` / `shared_redis` / `in_memory`) kroz strukturirani `socketio_adapter_mode` log. `RedisIoAdapter.getMode()` daje instancni režim, a `close()` oslobađa pub/sub klijente (prethodno su pri neuspjehu ostajali priključeni).
- `/health/ready` sada vraća `socketio: { mode, sharedAdapterRequired }`. Običan Redis `PING` ne može dokazati da je **ovaj proces** instalirao shared adapter; novo polje to rješava.
- `SOCKETIO_REQUIRE_SHARED_ADAPTER` (default `false`, strogo `true`/`false`) je opt-in fail-closed politika: kada je `true`, nedostupnost shared adaptera prekida startup umjesto tihe degradacije, a readiness vraća 503 ako je režim `in_memory`. Za deployment sa više backend replika ovo treba biti `true`. Dodan je u `.env.example` i oba compose fajla (samo backend servis).

**Napomena za rollout:** stari i novi channel namespace nisu kompatibilni — pri uvođenju ove promjene restartovati sve backend replike u istom koraku, inače stare i nove instance neće vidjeti međusobne broadcast-e tokom rolling deploya.

**Test.** `backend/prisma/check-socketio-shared-adapter.ts` (`npm run test:integration:socketio-shared-adapter`, CI korak `Verify multi-instance Socket.IO shared Redis adapter`) koristi `backend/prisma/utils/resp-pubsub-test-server.util.ts` — in-process RESP server sa stvarnim `PUBLISH`/`(P)SUBSCRIBE` fan-outom, bez Redis binaryja — i `socket.io-client` (dev zavisnost) za prave WebSocket konekcije na **tri nezavisna Socket.IO servera** (replike A i B sa prefiksom `inventory-v2:`, replika C sa `other-deployment:`). Dokazuje:
1. emit iz replike B stiže na klijenta spojenog na repliku A (`serverB.to(room).emit` → `clientA`), i obrnuto;
2. `/health/ready` prijavljuje `mode: shared_redis`;
3. replika C ne prima evente A/B i obrnuto (prefiksna izolacija);
4. nijedan `psubscribe`/`subscribe`/`publish` kanal ne koristi default `socket.io#`, svi su unutar konfigurisanog `<prefix>:*`;
5. statički se provjerava `createAdapter(..., { key: config.keyPrefix })` i `main.ts` wiring, te prisustvo `SOCKETIO_REQUIRE_SHARED_ADAPTER` u `.env.example` i oba compose fajla;
6. pri nedostupnom Redisu default režim pada na `in_memory`, `true` politika puca pri startupu, neispravna vrijednost se odbija, a readiness daje 503.

Mutacijski dokaz: privremeno uklanjanje `key` opcije iz `createAdapter` uzrokuje pad checka na tvrdnji „prefix B must not reach prefix A clients". Unit specovi: `socketio-adapter.registry.spec.ts` (režim, validacija flaga, live env) i prošireni `health.controller.spec.ts` (readiness sa shared i degradiranim adapterom).

**CI dokaz.** Commit `166a92c` prolazi u run-u `40500839777` (`completed success` na backend, frontend i document-worker jobovima). Korak `Verify multi-instance Socket.IO shared Redis adapter` (35), raniji TLS koraci (33, 34), lint, typecheck, svih 688 backend unit testova, frontend guardovi i dependency audit su zeleni. `socket.io-client@4.8.3` je dodan kao dev zavisnost uz ažuriran `backend/package-lock.json`; `npm audit` za backend i worker i dalje prijavljuje 0 nalaza.

**Ostaje vlasniku/deploymentu:** postaviti `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` na višereplikanskim okruženjima, potvrditi da Redis ACL dozvoljava `&<prefix>:*` pub/sub kanale, te isplanirati istovremeni restart svih replika pri rolloutu.

### 0.7 Schema-drift gate i nepromjenjivost migracijske historije

**Problem.** `prisma migrate deploy` na svježoj CI bazi uvijek ponavlja **trenutne** SQL fajlove. Ako neko naknadno izmijeni već primijenjenu migraciju ili promijeni `schema.prisma` bez nove migracije, CI to ne vidi — baza se uvijek gradi iznova. `prisma migrate status` i `migrate deploy` ne čuvaju historiju izvan `_prisma_migrations` tabele, koja u CI svaki put počinje od nule. Audit je zato tražio „schema-drift test" i „CI blokira release na migracijskom drift-u".

**Implementacija (bez potrebe za bazom).**
- `backend/prisma/schema-drift.manifest.json` (izvan `migrations/` da ga Prisma engine ne dira) sadrži `version`, `provider`, SHA-256 `prisma/schema.prisma` i uređenu listu `{ name, sha256 }` za svih sedam `migration.sql` fajlova.
- `backend/prisma/utils/migration-drift.util.ts` izlaže čiste funkcije `collectMigrationSnapshot()`, `buildMigrationManifest()`, `parseMigrationManifest()` i `verifyMigrationSnapshot()`; `backend/prisma/check-migration-drift.ts` je CLI (`--update` regeneriše manifest).
- `npm run prisma:manifest` je jedini namjerni način da se snapshot osvježi; `npm run test:integration:migration-drift` je CI gate (korak `Verify migration history and schema snapshot`), a `npm run test:unit:migration-drift` pokriva 10 scenarija nad temp fixture stablom.

**Šta gate odbija:** promjenu `schema.prisma` bez nove migracije; prepravljanje/brisanje/preuređivanje zabilježenih `migration.sql`; novu migraciju koja nije upisana u manifest; neispravna imena direktorija (`YYYYMMDDHHMMSS_slug`) i nestrogo rastući redoslijed; direktorij koji ne sadrži tačno jedan neprazan `migration.sql`; BOM; pogrešan `migration_lock.toml` provider; neispravan/neformatiran manifest. Destruktivni SQL (`DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `DROP TYPE`, `TRUNCATE`, `DELETE FROM`) traži eksplicitni `-- migration-review: <razlog>` marker u istom fajlu. Tri nezavisne provjere čuvaju SQL-only parcijalni indeks `document_jobs_active_source_unique` (u tačno jednoj migraciji, dokumentovan u `schema.prisma` i u migracijskom README-ju) jer ga Prisma DSL ne može izraziti.

**Mutacijski dokaz.** Privremeno dodavanje SQL-a u već zabilježenu migraciju javlja `... was rewritten after being recorded — applied migrations are immutable`; komentar u `schema.prisma` bez nove migracije javlja `schema.prisma changed without a reviewed migration`; novi direktorij sa `DROP TABLE "User";` bez markera javlja istovremeno `migration list changed (expected 7, found 8)` i `DROP TABLE requires -- migration-review: <reason>`. Nakon vraćanja sve tri mutacije check ponovo prolazi.

**Workflow i dokumentacija.** `backend/prisma/migrations/README.md` je osvježen: nova migracija → pregled SQL-a → `schema.prisma` → `npm run prisma:manifest` → commit migracije + manifesta + sheme. Ako se manifest ne regeneriše, CI namjerno pada. README također opisuje marker za destruktivni SQL.

**CI dokaz.** Commit `e52827b` prolazi u run-u `40504534546` (`completed success` na backend, frontend i document-worker jobovima). Novi korak `Verify migration history and schema snapshot` (9) je zelen, kao i `Validate Prisma schema and migrations` (7), `Verify SQL-only migration invariant` (8), lint (37), typecheck (38), svih 698 backend unit testova (39) i build (41). Lokalno su potvrđeni i `test:unit:migration-drift` (10/10), idempotentna regeneracija manifesta, Redis/PostgreSQL TLS handshake dokazi, Socket.IO shared adapter, business-transition i structured-logs integracije, 14/14 FE guardova, 15/15 worker unit testova, worker build i `npm audit` = 0 nalaza.

**Ograničenje (namjerno):** ovo je repozitorijski gate, ne live introspection. `prisma migrate diff --from-config-datasource --to-schema …` nad **staging kopijom** baze ostaje deployment korak za otkrivanje ručnih DDL promjena na živoj bazi; sandbox ne može preuzeti Prisma schema-engine, pa je on svjesno ostavljen vlasniku umjesto da se doda neprovjerljiv CI korak.

### 0.8 Reproducibilnost produkcijskih image-a (supply-chain / lockfile gate)

**Problem.** CI `npm audit --audit-level=low` opisuje **commitovane** lockfile-ove. `document-worker/Dockerfile` je međutim imao `COPY package.json package-lock.json* ./` i `RUN npm ci 2>/dev/null || npm install`: ako `npm ci` padne iz **bilo kojeg** razloga (oštećen lockfile, integrity mismatch, nedostupan registry, izmijenjen `package.json`), fallback tiho gradi image sa nepovezanim verzijama — uz potisnutu grešku. Drugim riječima, auditirano stablo nije moralo biti deployano stablo. Komentar u Dockerfile-u je opravdavao fallback "nedostatkom lockfile-a", ali `document-worker/package-lock.json` je već bio trackovan. U repo-u postoje i zaostale varijante `backend/Dockerfile copy` i `frontend/Dockerfilefr` (hardkodirane produkcijske URL-ove, jedna instalira LibreOffice u javno izloženi backend); compose datoteke ih ne koriste, ali ništa nije sprječavalo da se na njih slučajno prebaci.

**Implementacija.**
- `document-worker/Dockerfile` sada kopira **tačan** `package.json` + `package-lock.json` i izvršava samo `RUN npm ci` — bez `||`, bez `2>/dev/null`, bez `npm install`. Lockfile je obavezan uslov builda.
- `scripts/check-container-dependency-policy.mjs` je dependency-free gate (samo `node:` builtini) koji se izvršava iz korijena repo-a **prije** bilo kojeg `npm ci` u CI koraku `Verify container dependency and lockfile policy`. Eksportuje čiste `analyzeDockerfile()`, `analyzeLockfile()`, `analyzeCiWorkflow()`, `analyzeComposeRefs()` i `checkWorkspace()` funkcije.
- `scripts/check-container-dependency-policy.spec.mjs` pokriva 12 scenarija (`node --test`), uključujući i stvarno stanje repo-a.

**Šta gate odbija:** wildcards u `COPY package-lock.json*`; izostanak `RUN npm ci`; bilo koji `npm install` u kanonskom Dockerfile-u; `||` fallback i `2>/dev/null` na npm instrukcijama (uključujući višelinijske `RUN … \` instrukcije, dok se nepovezani `||` kod `groupadd/useradd` namjerno ignoriše); `node:` base major koji se ne poklapa sa `node-version: 22` u CI; `lockfileVersion != 3`; lockfile root koji nije sinhronizovan sa `package.json` (ime, verzija, `dependencies`/`devDependencies`/`optionalDependencies`); `resolved` URL-ove van `https://registry.npmjs.org/`, bez integrity hash-a ili sa `git+`/`file:` spec-ovima; `*`/`latest` dependency range-ove; CI bez `npm ci`/`npm audit --audit-level=low` za svaki workspace; compose `build.dockerfile` koji ne pokazuje na kanonski `Dockerfile` ili na nepostojeći fajl.

**Mutacijski dokaz.** Vraćanje `RUN npm ci 2>/dev/null || npm install` u worker Dockerfile daje tri greške (`npm install resolves unpinned versions`, `shell fallback`, `2>/dev/null hides install/integrity failures`); promjena jednog CI `npm audit --audit-level=low` u `--audit-level=high` daje `expected at least 3 … found 2`. Nakon vraćanja obje mutacije gate ponovo prolazi.

**CI dokaz.** Commit `b83de16` prolazi u run-u `40507199884` (`completed success` na backend, frontend i document-worker jobovima). Novi korak `Verify container dependency and lockfile policy` (5) je zelen, kao i `Verify migration history and schema snapshot` (10), lint (38), typecheck (39), 698 backend unit testova (40), build (42) i `npm audit` (43). Lokalno su potvrđeni 12/12 policy specova, 10/10 migration-drift specova, 14/14 FE guardova, 15/15 worker unit testova, worker build, YAML parse svih workflow/compose datoteka i `npm audit --audit-level=low` = 0 nalaza za sva tri workspace-a.

**Ograničenje:** gate provjerava deklarativnu politiku i integritet lockfile-a, ne gradi Docker image (u CI nema Docker build koraka). Stvarni `docker build` iz clean checkouta ostaje deployment provjera; `npm ci` u sva tri CI joba već dokazuje da se lockfile može reproducirati na registryju.

### 0.9 Redis ACL kanali za Socket.IO adapter (NOPERM incident)

**Incident (prijava iz produkcije).** Nakon uvođenja adapter `key` opcije (§0.6), backend puca pri startu:

```
BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null and will be overridden by BullMQ.
ReplyError: NOPERM No permissions to access a channel
    command: { name: 'psubscribe', args: [ 'inventory-v2:#/#*' ] }
```

**Uzrok (dvije sloja).** Redis ACL ima dvije nezavisne ose: `~<prefix>:*` za
ključeve i `&<pattern>` za Pub/Sub kanale; Redis 7 kreira usere sa
`resetchannels`, pa korisnik koji ima samo key grant ne smije `PSUBSCRIBE`.
Međutim — što je otkrio prvi CI run `40513334908` nad **pravim** Redis 7.4 —
ni `&inventory-v2:*` nije dovoljan. U `src/acl.c` (`ACLCheckChannelAgainstList`)
piše: *„the pattern provided in PSUBSCRIBE can only be matched as a literal
against an ACL pattern (using plain string compare)"*, implementirano kao
`is_pattern && !strcmp(pattern, channel)`. `PUBLISH`/`SUBSCRIBE` koriste glob
poklapanje, ali `PSUBSCRIBE` traži **doslovno jednak** `&` unos za svaki
pattern. Adapter pravi po jedan pattern po namespaceu — aplikacija ima `/` i
`/notifications` — pa su potrebna dva egzaktna granta. Samo `+allchannels`
(ili `&*`) zaobilazi pravilo, ali ukida izolaciju kanala između deploymenta.
Biblioteka poziva `psubscribe()` bez callbacka, pa odbijeni ioredis promise
završava kao neuhvaćena greška i ruši proces. `CHANGES.md` je ranije imao ACL
primjer sa jednim `&inventory-v2:*` i užom allowlistom kategorija koja ne
pokriva `INFO` (ioredis ready check) ni `EVAL` (BullMQ).

**Implementacija.**
- `deploy/redis/users.acl.example` — kanonsko, parsabilno pravilo:
  `~<PREFIX>:*`, `&<PREFIX>:*` (glob za PUBLISH/SUBSCRIBE), plus **egzaktni**
  `&<PREFIX>:#/#*` i `&<PREFIX>:#/notifications#*`, uz
  `+@all -@admin -@dangerous +info`. `docs/redis-acl.md` je operativni vodič
  sa `ACL GETUSER`/`ACL SETUSER`/`ACL LOAD` komandama, napomenom o navodnicima
  u shellu, provjerom `REDIS_KEY_PREFIX` i troubleshootingom. Ažurirani su
  `CHANGES.md`, `.env.example`, `README.md` i audit.
- `backend/src/redis/socketio-channel-contract.util.ts` — jedan izvor istine
  za tačna imena kanala (izvedena iz konstruktora `@socket.io/redis-adapter`
  i `@WebSocketGateway({ namespace: 'notifications' })`), Redis ACL glob
  matcher, parser `&`/`~` grantova i `assertAclChannelCoverage()` koji za
  `PSUBSCRIBE` traži **egzaktan** unos a za ostale kanale glob. 13 unit
  scenarija dokazuje da sam `&inventory-v2:*` ne prolazi, da jedan egzaktni
  pattern nije dovoljan za dva namespacea, da `+allchannels` jeste, i da
  `&inventory-v2:bull*` ne pokriva ništa.
- `RedisIoAdapter.connectToRedis()` prije `createAdapter()` radi **Pub/Sub
  preflight** na zasebnoj konekciji: `PSUBSCRIBE` svih patterna, `SUBSCRIBE`
  svih request/response kanala oba namespacea i bezopasni `PUBLISH` na kanal
  koji adapter ne sluša. `NOPERM` se pretvara u strukturirani
  `socketio_redis_acl_denied` (korisnik, namespace, potrebni `&` grantovi) i
  graceful `in_memory` fallback umjesto pada procesa; uz
  `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` i dalje fail-closed.
- BullMQ upozorenje je uklonjeno: `buildBullMqRedisOptions()` (backend) i
  `buildBullMqRedisOptions()` (document-worker) postavljaju
  `maxRetriesPerRequest: null`; opšti klijent i adapter zadržavaju `3`. Svi
  `BullModule`, `QueueEvents`, worker i CI integracijski klijenti koriste novi
  builder, a statički gate u `check-redis-acl-channels.ts` zabranjuje povratak
  na `connection: buildBaseRedisOptions(...)`.

**Dokazi.** `check-socketio-acl-denial.ts` (bez Redis binaryja, nad proširenim
RESP stubom koji vraća pravi `-NOPERM …`) dokazuje: granted ACL →
`shared_redis`; denied → `in_memory` + `socketio_redis_acl_denied` bez ijednog
`PUBLISH`; fail-closed → odbijen start. `check-redis-acl-channels.ts` protiv
**pravog Redis 7 ACL-a** kreira tri ACL usera: kanonsko pravilo (prolaz,
stvarna Pub/Sub dostava kroz pattern), glob-only `&inventory-v2:*`
(`PUBLISH` prolazi, `PSUBSCRIBE` dobija tačan `NOPERM` — dokaz literalnog
poređenja) i preuski `&inventory-v2:bull*` (NOPERM u oba smjera); zatim
potvrđuje ponašanje tri `RedisIoAdapter` instance i briše testne usere.
Statički dio poredi `SOCKETIO_NAMESPACES` sa stvarnim gateway deklaracijama,
provjerava `.env.example` i BullMQ retry politiku. CI koraci:
`Verify Socket.IO ACL denial degrades instead of crashing` i
`Verify Redis ACL channel grants for Socket.IO and BullMQ`.

**Dijagnoza stvarnog ACL-a sa platforme (vlasnikov `ACL GETUSER inventory-v2`
na `127.0.0.1:6380`).** Komande (`-@all +@read +@write +@keyspace +@string
+@list +@stream +@sortedset +@hash +@blocking +@pubsub … +ping +info +eval
+evalsha +client|setname`) i ključevi (`~inventory-v2:* ~bull:inventory-v2:*`)
su **ispravni** — `+@pubsub` već sadrži `PSUBSCRIBE`. `channels` ima
`&inventory-v2:*` (glob) i osam **starih** `&socket.io…` egzaktnih grantova,
koji su odgovarali adapteru dok je `key` bio default `socket.io`; nijedan nije
jednak novim `inventory-v2:#/#*` / `inventory-v2:#/notifications#*`. Zato je
minimalna ispravka **samo dva aditivna `&` unosa**, bez diranja komandi,
ključeva ili `+@all`:

```sh
redis-cli -p 6380 -a "$REDIS_ADMIN_PASSWORD" \
  ACL SETUSER inventory-v2 '&inventory-v2:#/#*' '&inventory-v2:#/notifications#*'
redis-cli -p 6380 -a "$REDIS_ADMIN_PASSWORD" ACL SAVE
```

`ACL SETUSER` je aditivan za `&` (`ACLSetSelector`, `op[0] == '&'`), `ACL SAVE`
perzistira runtime u `aclfile`; `ACL LOAD` je ispravan samo nakon ručne izmjene
fajla. U Redis 7 ne postoji `-&pattern`, pa stare `socket.io` unose treba
ostaviti (ili `resetchannels` + ponovo unijeti cijelu listu). Live CI check sada
vjerno reproducira taj ACL (`LEGACY_RULE`), dokazuje `NOPERM` prije, zatim
izvršava upravo tu dvograntnu komandu i dokazuje `shared_redis` kroz pravi
`RedisIoAdapter` — bez promjene ijedne komande ili ključa.

**CI ispravka.** Prvi run `40513334908` je pao upravo zato što je test koristio
samo `&inventory-v2:*`; `psubscribe inventory-v2:#/#*` je odbijen. Redis 7.4
source (`ACLCheckChannelAgainstList`) je potvrdio literalni `strcmp`, nakon
čega su kanonsko pravilo, contract util, preflight, unit specovi i live check
ažurirani za oba namespacea.

**CI dokaz.** Run `40513334908` je prvo pao na novom live ACL koraku i time
otkrio literalno `PSUBSCRIBE` poređenje; nakon ispravke commit `a12a7d2`
prolazi u run-u `40516953348` (`completed success` na sva tri joba). Koraci
`Verify Socket.IO ACL denial degrades instead of crashing` (38) i
`Verify Redis ACL channel grants for Socket.IO and BullMQ` (39) su zeleni, kao i
lint, typecheck, 712 backend unit testova, 14 FE guardova, 16 worker unit
testova, buildovi i `npm audit` = 0 za sva tri workspace-a. Log koraka 39
sadrži `Redis ACL channel check passed (3 canonical & grants, literal
PSUBSCRIBE matching proven on real Redis 7, adapter preflight degrades instead
of crashing, BullMQ retry policy enforced)` i pravi `socketio_redis_acl_denied`
zapis za preuski ACL. Naknadni commit `e0ff5b4` (dijagnoza stvarnog
`ACL GETUSER` sa platforme i dokaz minimalne dvograntne ispravke nad
istim, vjerno reproduciranim legacy ACL-om) prolazi u run-u `40521156610`
(`completed success` na sva tri joba); korak 39 javlja `Redis ACL channel
check passed (3 canonical & grants, literal PSUBSCRIBE matching + minimal
two-grant fix proven on real Redis 7, adapter preflight degrades instead of
crashing, BullMQ retry policy enforced)`.

**Ostaje vlasniku/deploymentu:** primijeniti kanonsko pravilo na centralnoj
Redis platformi, `ACL LOAD`, **restartovati backend i document-worker**
(postojeće konekcije ne ponavljaju `PSUBSCRIBE`), te potvrditi
`socketio_redis_adapter_connected` i `socketio.mode: "shared_redis"` u
`/health/ready`. Ako se doda novi Socket.IO namespace, dodati njegov
`&<prefix>:#/<namespace>#*` grant. Ako je `REDIS_KEY_PREFIX` drugačiji od
`inventory-v2`, u ACL-u zamijeniti `<PREFIX>` istom vrijednošću.


### 0.10 Atomarna, fail-closed revokacija sesija pri deaktivaciji (nalaz 9)

**Problem.** `JwtStrategy` kešira `AuthenticatedUser` 30 s u `auth:user:<id>`.
Deaktivacija (`UsersService.update` i `EmployeesService.update` za vezani
korisnik) je radila `RedisService.del(...)` **poslije** commit-a, a
`RedisService.del()` guta greške. Tri konkretna prozora:
- `setJson` u `JwtStrategy` je fire-and-forget — zahtjev koji je čitao bazu
  prije deaktivacije može upisati zastarjeli unos **poslije** brisanja i
  vratiti staru ulogu/identitet na punih 30 s;
- Redis ispad tokom `DEL` ostavlja keš netaknutim bez ikakvog signala;
- deaktivacija nije dirala `RefreshToken` redove — `AuthService.refresh()`
  jest proveravao `isActive`, ali izvan transakcije, pa su tokeni ostajali u
  bazi i (uz reaktivaciju) ponovo bili upotrebljivi.

**Implementacija.**
- `backend/src/modules/auth/auth-cache.util.ts` — `cachedAt` na svakom keš
  unosu (mjereno **prije** DB čitanja) i `auth:revoked:<id>` marker sa
  `revokedAt` i TTL-om dvostruko dužim od keša (60 s). `isFreshAuthCache()`
  prihvata unos samo ako je mlađi od markera; neispravan/legacy unos ili
  neparsiriv marker prisiljava DB čitanje (fail-closed).
- `auth-session-revocation.util.ts` — `prepareUserSessionRevocation()` piše
  marker **prije** deaktivacijske transakcije i propagira Redis grešku
  (nema tihe degradacije); `revokeRefreshTokensInTransaction()` gasi sve
  aktivne refresh tokene **u istoj transakciji** kao `user.update`;
  `sweepRefreshTokensAfterCommit()` hvata tokene koje je kreirao `refresh()`
  koji se trkao s commitom.
- `AuthService.refresh()` sada unutar rotacijske transakcije ponovo čita
  `isActive` prije conditional claim-a, pa deaktivacija koja se commitovala u
  međuvremenu ne može izdati novi par tokena.
- `NotificationsGateway.disconnectUser()` loguje strukturirani
  `notifications_user_sockets_disconnected` za audit trail.

**Dokazi.** 16 unit scenarija (`auth-cache.util.spec.ts`,
`auth-session-revocation.util.spec.ts`, `jwt.strategy.spec.ts`) pokrivaju
vremenske granice markera, legacy/malformirane unose, odbijeni Redis write,
kasni `setJson` koji ne smije oživjeti identitet, i reaktivaciju bez trajne
blokade. `check-auth-session-revocation.ts` nad **pravim Redis 7 i pravim
PostgreSQL**: kreira korisnika + 2 refresh tokena, kešira identitet, piše
marker, u jednoj transakciji deaktivira korisnika i gasi tokene, dokazuje
`UnauthorizedException` i odbacivanje naknadno upisanog starog keša, provjerava
TTL markera i fail-closed ponašanje, te potvrđuje da reaktivacija radi.
Statički gate (`--static`) zabranjuje povratak na `redisService.del(authUserCacheKey)`
i traži da oba servisa pozivaju marker + transakcijsku revokaciju +
`disconnectUserSockets`. CI korak:
`Verify auth session revocation (deactivation + refresh tokens)`.

**CI dokaz.** Commit `60ed14e` prolazi u run-u `40528220036` (`completed
success` na sva tri joba). Novi korak `Verify auth session revocation
(deactivation + refresh tokens)` (40) je zelen, kao i lint (41), typecheck
(42), 728 backend unit testova (43), build (45) i `npm audit` (46). Lokalno su
potvrđeni 16/16 novih unit scenarija, 14/14 FE guardova, 16/16 worker unit
testova, statički gateovi (container policy, Redis ACL, migration drift),
Redis/PostgreSQL TLS handshake dokazi, strukturirani logovi i `npm audit`
= 0 nalaza za sva tri workspace-a.

**Ograničenje / ostaje vlasniku:** `disconnectUserSockets` i dalje doseže samo
instance do kojih stiže Socket.IO adapter — ako je zbog lošeg ACL-a adapter u
`in_memory` režimu, udaljene replike neće dobiti disconnect. Zato višereplikanski
deployment i dalje mora postaviti `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` i
kanonski Redis ACL (§0.9). Marker je Redis-only najbolji napor: potpuno
odricanje bez Redis keystore-a tražilo bi token-version kolonu u JWT-ju.


### 0.11 Javni QR privacy contract i ograničenje historije (nalaz 11 / §4.23)

**Problem.** `GET /public/equipment/:id` je jedini neautentifikovani equipment
endpoint, a vraća puno ime/titulu/org putanju držaoca, cijelu historiju
transfera sa imenima strana i brojevima dokumenata, te dinamičke
specifikacije. Audit je tražio privacy policy / minimalni DTO i list cap.
Dodatno, `buildResponse()` je na svakom cache miss učitao **sve** transfere i
**cijelo** org stablo (`orgUnit.findMany()`), iako je trebalo samo putanju
predaka jednog držaoca.

**Odluka vlasnika (poštovana):** zadržati sva postojeća DTO polja, uključujući
identitet i historiju; privatnosni rizik ostaje dokumentovan kao
`accepted-risk`. Umjesto uklanjanja podataka, **zamrznut je tačan oblik
odgovora** — svaka izmjena polja sada traži eksplicitnu reviziju.

**Implementacija.**
- `backend/src/modules/public-equipment/public-equipment.contract.ts` —
  `PUBLIC_EQUIPMENT_DECISION` (accepted-risk), `PUBLIC_EQUIPMENT_SHAPES` (12
  root + 4 ugniježđena oblika), 10 dokumentovanih PII putanja, hard cap 1000,
  `verifyPublicEquipmentShape()` / `assertPublicEquipmentShape()`,
  `resolvePublicEquipmentMovementLimit()` (1–1000, default 200, fail-closed na
  nevaljan env), `buildOrgUnitPath()` (ciklus zaštita + max dubina 20) i
  reprezentativni fixture.
- `PublicEquipmentService`: `take: this.movementLimit` u `transfers` include,
  `loadOrgUnitAncestors()` umjesto `findMany()` cijelog stabla, runtime
  `assertPublicEquipmentShape(response)` prije vraćanja (fail-closed 500 umjesto
  objavljivanja nerecenziranog polja). DTO polja su **nepromijenjena**.
- `PUBLIC_EQUIPMENT_MAX_MOVEMENTS` u `.env.example`, `docker-compose.yml` i
  `docker-compose.prod.yml`; operativni vodič `docs/public-qr-privacy.md` sa
  tabelom svih polja, osjetljivosti, kontrolama i 4-koračnim review procesom.

**Dokazi.** 16 unit scenarija (`public-equipment.contract.spec.ts`,
`public-equipment.service.contract.spec.ts`) pokrivaju dodano/uklonjeno root i
ugniježđeno polje, opaki `specifications` map, hard cap, strogo parsiranje
env-a, ciklus/dubinu org putanje, `take` koji se zaista prosljeđuje u Prisma,
izostanak `findMany()`, feature flag i fail-closed konstrukciju servisa.
`check-public-equipment-contract.ts` koristi **TypeScript compiler API** da
pročita backend i frontend interfejse i uporedi ih sa kontraktom; provjerava i
runtime aserciju, `take`, rate-limit guard, jedinu `@Get(':id')` rutu, feature
flag, env/compose konfiguraciju i da vodič dokumentuje svako polje.
**Mutacijski dokaz:** dodavanje `holderEmail` u frontend DTO i uklanjanje
`disposalReason` iz kontrakta oba padaju sa `diverges from the reviewed public
QR privacy contract` (exit 1); nakon vraćanja gate prolazi. CI korak:
`Verify public QR privacy contract`.

**CI dokaz.** Commit `c422be5` prolazi u run-u `40550059321` (`completed
success` na sva tri joba). Novi korak `Verify public QR privacy contract` (41)
je zelen, kao i prethodni `Verify auth session revocation` (40), lint (42),
typecheck (43), 744 backend unit testova (44), build (46) i `npm audit` (47).
Lokalno su potvrđeni 16/16 novih unit scenarija, 14/14 FE guardova, 16/16
worker unit testova, svi statički gateovi (container policy, Redis ACL,
migration drift, auth revocation), TLS handshake dokazi, strukturirani logovi i
`npm audit` = 0 nalaza za sva tri workspace-a.

**Ograničenje / ostaje vlasniku:** prihvaćeni rizik objavljivanja identiteta i
historije i dalje postoji (opcije: maskiranje, kraća historija sa indikatorom,
zaseban javni token sa užim DTO-jem). Rate limit je i dalje fail-open po
defaultu; load test QR endpointa nije urađen. Anti-enumeration se oslanja na
UUID + rate limit.


### 0.12 Upload read allow-list, autorizacija i containment (§4.18)

**Problem.** `GET /uploads?entityType=...&entityId=...` je uzimao dva
nevalidirana `@Query` stringa. `UploadsService.findByEntity()` je pozivao
`TransfersService.findOne()` (scope provjera korisnika) **samo** za
`entityType === 'transfer'`; za `equipment`/`other` (ostale vrijednosti Prisma
`UploadEntityType` enuma) provjera se preskakala i vraćani su metapodaci
uploada, uključujući interni `path`. `getFileStream()` je imao isti uslov, pa
je red sa drugim tipom ili bez `entityId` bio preuzet bez autorizacije.
Putanja iz baze se spajala sa `UPLOAD_DIR` običnim `join()`, bez containment
provjere. Iako aplikacija danas piše samo `transfer` redove, svaki budući tip
bi odmah bio čitljiv bez scope checka.

**Implementacija.**
- `ListUploadsQueryDto` — `@IsIn(UPLOAD_READABLE_ENTITY_TYPES)` +
  `@IsUUID()`; globalni `ValidationPipe` sa `forbidNonWhitelisted` odbija
  nepoznate tipove, loše id-jeve i dodatne parametre.
- `upload-access-policy.util.ts` — `UPLOAD_READABLE_ENTITY_TYPES = ['transfer']`,
  `requireReadableUploadEntityType()` (BadRequest),
  `requireAuthorizableStoredUpload()` (Forbidden za red bez vlasnika ili bez
  read politike) i `resolveUploadAbsolutePath()` (odbija `..`, apsolutne
  putanje, drive prefikse, backslash, NUL; provjera `root + sep` prefiksa).
- `UploadsService.findByEntity()` i `getFileStream()` obavezno pozivaju
  `authorizeUploadRead()` — egzhaustivni `switch` sa `const exhaustive: never`
  granom. Dodavanje tipa bez autorizatora je compile error. `path` više ne
  ide u list select; frontend `UploadMeta` je ažuriran. Containment se
  primjenjuje i na write i na download stranu.
- Operativni vodič: `docs/upload-read-policy.md`.

**Dokazi.** 14 unit scenarija (DTO, allow-lista, stored-row, traversal
payloadi, redoslijed autorizacije, uspješan download kroz pravi temp fajl,
odbijeni tipovi i escaping putanja). `check-upload-read-policy.ts` koristi
TypeScript compiler API da preko AST-ja uporedi
`UPLOAD_READABLE_ENTITY_TYPES` sa `case` granama `authorizeUploadRead()`,
zabranjuje stari `entityType as 'transfer'` cast i uslovnu autorizaciju, traži
containment na obje putanje i `path` bez curenja u select/frontend.
**Mutacijski dokaz:** dodavanje `'equipment'` u allow-listu bez `case` grane
i vraćanje `path: true` u select oba padaju (exit 1); nakon vraćanja gate
prolazi. CI korak: `Verify upload read allow-list and path containment`.

**CI dokaz / ispravka.** Prvi run `40553884541` je pao na koraku
`Verify structured operational logs` (33): novi error messages su koristili
`${String(...)}` u template literalima, što gate `check-structured-logs.ts`
namjerno zabranjuje kao raw interpolaciju. Zamijenjeno je sa
`JSON.stringify(...)`. Ispravka `11caadb` prolazi u run-u `40554511456`
(`completed success` na sva tri joba): korak
`Verify upload read allow-list and path containment` (42) je zelen, kao i
strukturirani logovi (33), raniji gateovi (40, 41), lint (43), typecheck (44),
758 backend unit testova (45), build (47) i `npm audit` (48). Lokalno su uz
`pipefail` potvrđeni 14/14 novih specova, 14/14 FE guardova, 16/16 worker
unit testova, frontend build, svi statički gateovi i `npm audit` = 0 za sva tri
workspace-a.

**Ograničenje:** containment ne dereferencira simboličke linkove — `UPLOAD_DIR`
mora biti pouzdan direktorij. Ako se doda novi entity type, obavezno je
slijediti 4-koračni proces u `docs/upload-read-policy.md`.


### 0.13 HTTP hardening — sigurnosni headeri i opt-in globalni rate limit

**Problem.** Audit §"API bootstrap / HTTP" je ostavio otvorenu „odluku o
Helmetu i globalnom rate-limitu": backend nije slao nikakve sigurnosne
headere, `X-Powered-By: Express` je otkrivao stack, auth/setup odgovori nisu
bili `no-store`, a osim per-route guardova nije postojao nikakav globalni
limiter. Uvođenje punog Helmeta bi defaultnim CSP-om slomilo generiranu
`text/html` prenosnicu sa inline stilovima, pa je rješenje napravljeno kao
eksplicitan, reverzibilan policy sloj bez nove zavisnosti.

**Implementacija.**
- `backend/src/common/http/http-hardening.util.ts` — `SECURITY_HEADERS_CATALOG`
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `X-DNS-Prefetch-Control`, `Permissions-Policy`), uklanjanje `X-Powered-By`,
  HSTS **samo za stvarne HTTPS zahtjeve** (`X-Forwarded-Proto: https` ili TLS
  socket), `Cache-Control: no-store` na `/auth/*` i `/setup/*`. CSP i CORP su
  namjerno izostavljeni — ostaju odluka vlasnika.
- Strogo parsiranje `SECURITY_HEADERS_ENABLED` (default `true`),
  `HSTS_MAX_AGE_SECONDS` (0–31 536 000, default 180 dana).
- `GLOBAL_RATE_LIMIT_ENABLED` ostaje **opt-in (default `false`)** — globalni
  limit mijenja ponašanje svih ruta. Kada je uključen, koristi isti atomarni
  Lua brojač iz `RedisService.incrementRateLimitCounter()`, SHA-256 hash
  klijentskog IP-a kao ključ (IP nikad u Redis ključu ni logu), `429` +
  `Retry-After`/`RateLimit-*` headere, postojeći `rate_limit_metrics` registar
  (`global_http`) i strukturirani `global_rate_limit_check_failed`. `/health/*`
  je uvijek izuzet. `GLOBAL_RATE_LIMIT_FAIL_CLOSED` bira fail-open (default)
  ili `503` pri Redis ispadu.
- `main.ts` registrira oba middleware-a prije ruta, gasi `x-powered-by` i
  loguje efektivni `http_hardening_config`. Svih šest varijabli je u
  `.env.example`, `docker-compose.yml` i `docker-compose.prod.yml`; vodič
  `docs/http-hardening.md`.

**Dokazi.** 11 unit scenarija (sve granice configa, izostanak CSP/CORP, HSTS
samo uz HTTPS, health izuzeća, no-store putevi, hashirani ključevi, 429 +
`Retry-After`, 503/propust kod Redis kvara). `check-http-hardening.ts` pokreće
**pravi `node:http` server** sa oba middleware-a preko `fetch()` i potvrđuje
headere, HSTS uslov, izostanak `X-Powered-By`, health izuzeće, prag 429,
no-store i fail-open/fail-closed; statički dio provjerava `main.ts`, env,
compose i vodič. **Mutacijski dokaz:** uklanjanje registracije
`securityHeadersMiddleware` i tiha promjena defaulta globalnog limita u `true`
oba padaju (exit 1); nakon vraćanja gate prolazi. CI korak:
`Verify HTTP hardening policy`.

**CI dokaz.** Commit `cd19f0e` prolazi u run-u `40558495208` (`completed
success` na sva tri joba). Novi korak `Verify HTTP hardening policy` (43) je
zelen, kao i strukturirani logovi (33), raniji gateovi (40–42), lint (44),
typecheck (45), 769 backend unit testova (46), build (48) i `npm audit` (49).
Lokalno su uz `pipefail` potvrđeni 11/11 novih specova, 14/14 FE guardova,
16/16 worker unit testova, frontend build, svi statički gateovi i `npm audit`
= 0 za sva tri workspace-a.

**Ostaje vlasniku:** CSP strategija za HTML prenosnicu (nonce/hash ili PDF
attachment), eventualni CORP, odluka hoće li se globalni limit uključiti i s
kojim pragom, te `GLOBAL_RATE_LIMIT_FAIL_CLOSED=true` ako se dostupnost
žrtvuje zarad zaštite.


### 0.14 Deployment readiness contract (jedna provjera za sav preostali rep)

**Problem.** Svaki prethodni paket je ostavio mali deployment rep koji se ne
može zatvoriti iz koda: stvarni CA fajlovi i SAN podudarnost, Redis ACL na
live instanci, CORS/proxy lanac, `SETUP_TOKEN`/`JWT_SECRET`, broj replika,
`SOCKETIO_REQUIRE_SHARED_ADAPTER`, pool budžet, HSTS/rate-limit/cap flagovi.
Do sada su to bile razbacane rečenice po dokumentima.

**Implementacija.** `scripts/check-deployment-readiness.mjs` — dependency-free
ESM alat sa dva načina rada:

- **repo moda (CI, bez tajni):** provjerava da `.env.example` i
  `docker-compose.yml` izlažu svih 17 deployment varijabli, da oba compose
  fajla čuvaju sigurne default-e (`DATABASE_SSL_MODE=verify-full`,
  `GLOBAL_RATE_LIMIT_ENABLED=false`, `SECURITY_HEADERS_ENABLED=true`,
  `PUBLIC_EQUIPMENT_MAX_MOVEMENTS=200`, `SOCKETIO_REQUIRE_SHARED_ADAPTER=false`,
  `DATABASE_POOL_MAX=10`, `NODE_ENV=production`), da su CA putanje izložene, da
  kanonski ACL obrazac u svojoj `user` liniji ima glob + oba egzaktna
  `&<PREFIX>:#/…` granta + `+info`, da postoji svih 5 operator vodiča i da se
  `REDIS_KEY_PREFIX` poklapa sa ACL namespace-om.
- **`--env <file>` (operator na serveru):** 19 pravila nad stvarnim
  vrijednostima — tajne, CORS/frontend podudarnost, PostgreSQL TLS mod i
  `sslmode` konflikt, CA mount, Redis TLS/SNI, ACL prefiks, replike i
  shared-adapter flag, pool budžet, headeri, HSTS, globalni limit, javni QR
  cap. Tri pravila koja alat ne može izvršiti umjesto čovjeka (cert SAN,
  `ACL GETUSER`) su eksplicitna **MANUAL** upozorenja sa uputom.
- `--strict` pretvara upozorenja u greške; `--json` daje mašinski čitljiv
  izvještaj. Alat **nikad ne ispisuje vrijednosti tajni**.

Vodič: `docs/deployment-readiness.md`. CI korak
`Verify deployment readiness contract` pokreće repo modu i
`scripts/check-deployment-readiness.spec.mjs`.

**Dokazi.** 14 unit scenarija: parser `.env` fajla, prolaz repozitorija,
hardened env bez grešaka, `--strict`, sve pojedinačne granice (tajne, CORS,
DB TLS konflikt, Redis TLS/SNI, replike, pool, HSTS, rate-limit, QR cap),
format izvještaja bez tajni, te tri mutacije repo politike (uklonjen egzaktni
ACL grant, nesiguran compose default, obrisan operator vodič) — sve padaju.
Ručno su potvrđeni i `PASS WITH WARNINGS` za realističan hardened `.env` i
`FAIL` (11 grešaka) za namjerno loš `.env`.

**CI dokaz.** Commit `e35b00b` prolazi u run-u `40561846255` (`completed
success` na sva tri joba). Novi korak `Verify deployment readiness contract`
(6) je zelen, kao i svi raniji gateovi (41–44), lint (45), typecheck (46), 769
backend unit testova (47), build (49) i `npm audit` (50). Lokalno su uz
`pipefail` potvrđeni 14/14 novih scenarija, 12/12 container policy scenarija,
repo moda (`11 pass, 0 fail`), hardened `--env` moda (`PASS WITH WARNINGS` sa
3 očekivane MANUAL provjere), namjerno loš `--env` (`FAIL`, 11 grešaka),
frontend build i `npm audit` = 0 za sva tri workspace-a.

**Ograničenje:** alat ne može vidjeti stvarni certifikat, live ACL korisnika ni
mrežnu topologiju iza proxyja — zato su te tri provjere namjerno `MANUAL/WARN`
i opisane u vodiču. On garantuje da **konfiguracija u repou i env fajlu** ne
može tiho skliznuti s ranije utvrđenih sigurnih vrijednosti.


### 0.15 Sigurnost generiranog HTML dokumenta prenosnice (P1 stored XSS, CSP odluka)

**Problem.** `GET /transfers/:id/raw-document` vraća `text/html` generiran iz
poslovnih podataka (`reason`, `notes`, imena, inventurni broj, broj dokumenta).
Escaping je ranije dodan, ali kontroler je i dalje imao samo
`@Header('Content-Type', 'text/html')` — bez attachment zaglavlja, bez CSP-a i
bez runtime provjere da buduća izmjena buildera neće ponovo uvesti markup.
To je bila posljednja P1 površina za stored XSS i ujedno razlog zašto globalni
HTTP hardening nije smio postaviti CSP.

**Implementacija.**
- `transfer-document-security.util.ts` — `verifyTransferDocumentSafety()` /
  `assertSafeTransferDocument()`: HTML5 doctype, allow-lista tagova
  (`html/head/meta/title/style/body/h1/p/strong/table/tr/th/td/br`), zabrana
  `on*` handlera, `javascript:`/`data:text/html` URL-ova i sirovog `<` unutar
  `<style>`; kršenje fail-closed prije slanja odgovora.
- `buildTransferDocumentCsp(html)` računa SHA-256 **iz stvarnog** inline
  `<style>` bloka svakog odgovora (ne hard-kodirani hash), pa politika
  `default-src 'none'; style-src 'sha256-…'; script-src 'none'; …
  frame-ancestors 'none'; sandbox` ne može zastariti kad se stil promijeni.
- `buildTransferDocumentHeaders()` dodaje `Content-Disposition: attachment`
  (default, reverzibilno na `inline` kroz
  `TRANSFER_RAW_DOCUMENT_DISPOSITION`), sanitizovano ime fajla iz `<title>`
  (bez CRLF/navodnika/`..`), `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Kontroler koristi `@Res({ passthrough: true })` i postavlja headere iz
  stvarnog dokumenta. Escaping ostaje primarni kontrolni mehanizam (preuzeti
  fajl otvoren sa diska gubi response header-e).
- Nova varijabla u `.env.example`, oba compose fajla i deployment readiness
  provjeri (`transfer-raw-disposition`); vodič
  `docs/transfer-document-security.md`. Ažurirani su `docs/http-hardening.md`
  (globalni CSP i dalje izostaje, ali dokument ima svoj), `main.ts` komentar i
  readiness lista operator vodiča.

**Dokazi.** 10 unit scenarija: allow-lista za stvarni dokument, inertni XSS
payloadi, CSP iz stvarnog style hash-a (promjena stila mijenja hash), više
`<style>` blokova, 9 varijanti neispravnog markup-a, kompletan header set,
`inline` režim, header-injection kroz broj dokumenta, sanitizacija imena i
strogo parsiranje disposition-a. `check-transfer-document-security.ts` ima
statički gate nad kontrolerom/builderom/env-om/compose-om/readiness alatom/
vodičem i runtime dokaz sa hostilnim payload-om, plus **5 mutacija** (ubачен
`<script>`, uklonjen style blok, izmijenjen stil, `inline`, CRLF u broju
dokumenta). CI korak: `Verify generated HTML document security`.

**CI dokaz.** Commit `009df37` prolazi u run-u `40565904205` (`completed
success` na sva tri joba). Novi korak `Verify generated HTML document security`
(45) je zelen, kao i deployment readiness (6), strukturirani logovi (34), svi
raniji gateovi (41–44), lint (46), typecheck (47), 779 backend unit testova
(48), build (50) i `npm audit` (51). Lokalno su uz `pipefail` potvrđeni 10/10
novih specova, 15/15 readiness scenarija, 12/12 container policy scenarija,
frontend/worker build i `npm audit` = 0 za sva tri workspace-a.

**Ostaje vlasniku:** eventualni globalni CSP/CORP za ostatak aplikacije,
potvrda origin/proxy topologije i odluka treba li `inline` režim za print
workflow (default `attachment` je sigurniji).


### 0.16 Queue recovery — matrica otkazivanja i vremenski bound za DocumentJob

**Problem (posljednji veći kodni kriterij iz §11).** Svi kritični async tokovi
već su imali pojedinačne fault-injection dokaze, ali nijedan nije pokrivao
slučaj gdje document-worker padne, a njegov BullMQ posao ostane
`waiting`/`active` **zauvijek** (nema workera koji bi ga preuzeo). Tada BullMQ
nikad ne emituje terminalni event, a `reconcileStaleJobs()` je namjerno
ignorisala ta stanja — `DocumentJob` red bi ostao `running` bez vlasnika.
Uz to nije postojala jedna matrica koja bi garantovala da svaki crash point
ima oporavak, idempotencijski ključ i CI provjeru.

**Implementacija.**
- `document-job-recovery-policy.util.ts` — `resolveDocumentJobStaleMs()`
  (`DOCUMENT_JOB_STALE_TIMEOUT_MS`, 5 min – 24 h, default 30 min),
  `documentJobAgeMs()`, `decideStaleRecovery()` (`none`/`missing`/`stuck`) i
  `assertStaleTimeoutAfterWorkerTimeout()` (bound mora biti >
  `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS` + 30 s BullMQ lock slack).
- `DocumentConversionEventsService.reconcileStaleJobs()` sada za `stuck`
  granu radi `markFailed()` (terminalni status + jedan trajni outbox red u
  istoj transakciji), jedan Socket.IO emit, best-effort `bullJob.remove()` i
  strukturirani `document_job_stale_recovered_failed`. Neispravna env
  vrijednost se loguje i koristi default — konfiguracija ne smije isključiti
  oporavak. Svježi poslovi i terminalna BullMQ stanja ostaju netaknuti.
- `scripts/check-queue-recovery-contract.mjs` — izvršiva matrica 9 crash
  pointova (zatvaranje inventure ×3, konverzija dokumenata ×4, DOCX prenosnica,
  notifikacije); za svaki red provjerava simbole oporavka u izvornom kodu,
  idempotencijski ključ, postojanje `backend/prisma/check-*.ts` provjere,
  npm skriptu i CI korak. Vodič `docs/queue-recovery.md`.
- Nova varijabla u `.env.example`, oba compose fajla i deployment readiness
  provjeri (`document-job-stale-bound` poredi bound sa worker timeoutom).
  Readiness sada čuva 19 varijabli i 7 operator vodiča.

**Dokazi.** 7 unit scenarija za policy (granice, starost po statusu, grace za
missing, terminalna stanja, svježi vs stuck za 6 BullMQ stanja, odnos bounda i
worker timeouta, stabilna korisnička poruka). `check-document-job-stale-recovery.ts`
nad **pravim PostgreSQL + Redis/BullMQ** pravi 5 redova (2 zaglavljena 31 min,
1 svjež, 1 svjež bez Bull posla, 1 star bez Bull posla) i dokazuje terminalizaciju,
tačno jedan outbox red i jedan emit, očuvanje svježeg posla, postojeću `missing`
granu i idempotentnost ponovljene rekonsilijacije. `check-queue-recovery-contract.spec.mjs`
ima 8 scenarija sa 6 mutacija (CI korak, npm skripta, simbol, `stuck` grana,
compose bound). CI koraci: `Verify queue recovery contract` i
`Verify stale DocumentJob recovery`.

**CI dokaz / ispravka.** Prvi run `40571136024` je pao samo na koraku
`Verify stale DocumentJob recovery` (29): BullMQ `queue.getJob()` za uklonjeni
posao vraća `undefined`, a test je očekivao `null`. Ispravka `8b812ee` prolazi
u run-u `40571636153` (`completed success` na sva tri joba) — korak 29 zelen,
kao i `Verify queue recovery contract` (7), svih osam prethodnih recovery
provjera, lint (48), typecheck (49), 786 backend unit testova (50), build (52) i
`npm audit` (53). Log koraka 29 sadrži dva očekivana
`document_job_stale_recovered_failed` zapisa (`bullJobState: waiting`,
`ageMs ~1 860 000`, `staleTimeoutMs: 300000`). Lokalno su uz `pipefail`
potvrđeni 7/7 policy specova, 8/8 recovery-contract scenarija, 16/16 readiness
scenarija, 12/12 container policy scenarija, svi statički gateovi, 786 backend
unit testova, frontend/worker build i `npm audit` = 0.

**Ograničenje:** zombi worker i dalje može fizički pisati fajl ako je Bull posao
bio zaključan (`remove()` ne uspijeva), ali ne može promijeniti terminalni DB
status ni duplirati notifikaciju. `UPLOAD_DIR` mora biti pouzdan. Load test za
veliki broj istovremenih konverzija ostaje otvoren.


### 0.17 Mjerljivi performansni budžeti (Faza 5 / §11)

**Problem.** Posljednji kriterij iz §11 („Promjene velikih servisa imaju
characterization tests i mjerljive performansne kriterije") i Faza 5 audita
(„izmjerena p95 latencija/DB query budget") nisu bili pretvoreni u release
gate. Ranije su postojale pojedinačne mjere — cursor pagination za CSV export,
`MAX_PAGE_OFFSET`, bulk cap 100, `PUBLIC_EQUIPMENT_MAX_MOVEMENTS`, bounded org
path — ali nijedna provjera nije garantovala da se neće vratiti N+1 obrazac
ili neograničen `findMany()`.

**Odluka o metodi.** Vremenski pragovi na dijeljenom CI runneru su flaky, pa se
ugovor zasniva na **jedinicama posla**: broj aplikacijskih DB poziva, veličina
batcha, cap-ovi i gornje granice paginacije. **wall-clock** se mjeri samo kao
vrlo širok sekundarni smoke signal.

**Implementacija.**
- `backend/src/common/performance/performance-budget.util.ts` —
  `PERFORMANCE_BUDGETS` (CSV batch 500, 3 upita za 1200 redova, max page size
  10 000, max offset 100 000, bulk 100, javni QR 200/1000, org dubina 20,
  ≤ 25 QR upita, ≤ 8 list upita, stale bound 30 min), `QueryRecorder`,
  `expectedCursorPageQueries()`, `verifyQueryBudget()`,
  `assertNoViolations()` i `buildBudgetReport()`.
- `check-performance-budgets.ts` — statički gate nad izvornim kodom
  (`iterateCursorPages`, `take: this.movementLimit`, odsustvo
  `orgUnit.findMany()`, `@ArrayMaxSize(100)`, `MAX_PAGE_OFFSET`, settings
  granice, env timeouti, vodič) + deterministički runtime dokazi: 1200
  sintetičkih redova kroz pravi cursor paging (tačno 3 upita po 500, bez
  duplikata), simulirani list request (6 upita, bez N+1), cap paginacije, i
  2000 `escapeCsvCell()` poziva sa širokim 2 s smoke pragom.
- 11 unit scenarija uključuju javni QR sa 250 transfera (cap 200, ≤ 20 org
  upita, bez `findMany`, ≤ 25 ukupno) i validaciju bulk DTO-a na 100/101
  stavku. Vodič `docs/performance-budgets.md`; CI korak
  `Verify performance budgets`; readiness sada čuva 8 operator vodiča.

**CI dokaz.** Commit `3ca7aab` prolazi u run-u `40574749641` (`completed
success` na sva tri joba). Novi korak `Verify performance budgets` (48) je
zelen, kao i svi raniji gateovi (7, 19, 25–29, 47), lint (49), typecheck (50),
797 backend unit testova (51), build (53) i `npm audit` (54). Izvještaj koraka
48: `Performance budgets: PASS (7/7 within budget)` — CSV export 3/3 upita,
max take 500/500, list 6/8 upita, page size 100/10000, offset 100000/100000,
CSV escaping smoke ~2 ms / 2000 ms. Lokalno su uz `pipefail` potvrđeni 11/11
novih specova, 36 root scenarija, svi statički gateovi, frontend/worker build i
`npm audit` = 0 za sva tri workspace-a.

**Ograničenje:** ovo nije load test pod stvarnim saobraćajem — ne mjeri
konkurentnost, mrežnu latenciju ni PostgreSQL plan upita na velikom datasetu.
`QueryRecorder` broji aplikacijske Prisma pozive (jedan `findMany` sa
relacijama može biti više SQL upita), što je dovoljno za otkrivanje N+1
regresija. Pravi p95 SLO treba pratiti kroz postojeće `http_request_metrics`
i zaseban staging `k6`/`autocannon` test.


### 0.18 Neovisni code-only audit i nove ispravke (2026-10-27)

**Zahtjev vlasnika:** ponoviti audit kompletnog backend koda neovisno od
dokumentacije, za realnu sliku i ocjenu. Rezultat: `docs/backend-code-audit-2026-10-27.md`.

**Metod:** 377 izvornih fajlova / 33 758 linija, 148 spec fajlova, 24
kontrolera, 90 DTO-a, 58 transakcija, 168 `findMany` poziva, 97 strukturiranih
evenata, 37 integracijskih provjera, 42 CI koraka. Sve mjereno iz koda.

**Nalaz P1 (ispravljen):** procesni keševi autorizacijskog scope-a u
`RegistrarScopeService` / `ModeratorScopeService` nikad se nisu invalidirali —
promjena hijerarhije ostavljala je zastarjele odluke do restarta, a replike su
se mogle razilaziti. Dodan `scope-cache.registry.ts` (TTL 30 s + verzija),
`invalidateScopeCaches()` na 9 write mjesta, 6 unit scenarija i CI korak
`Verify authorization scope cache freshness`.

**Ostale ispravke:** uklonjen mrtvi `docx-to-pdf.util.ts` (6 `console.error`
koji su zaobilazili structured-log gate) i gate proširen na `console.*`; promjena
lozinke sada gasi refresh tokene u istoj transakciji (`'password_changed'`);
svih 8 neograničenih array DTO-a dobilo `@ArrayMaxSize(200)` uz statičku
provjeru u performance gate-u.

**Otvoreni nalazi (ocijenjeni, ne implementirani):** N-5 `resolveForOrgUnit()`
full-table skenovi / 157 `findMany` bez `take`; N-6/N-8 preostale notifikacije
van outboxa; N-7 `handleOrgUnitChange()` poslije commit-a; N-9 sirovi query
parametri; N-10 tihi fallback `JWT_REFRESH_TTL`; N-11 rate-limit na refresh;
N-12 characterization testovi za 7 velikih servisa; N-13/N-14/N-15 održivost.

**Ocjena:** **8.1/10** (u odnosu na početnih 6.6/10). Detaljna tabela po
oblastima i poređenje sa ranijim optimističnim tvrdnjama u audit dokumentu.

**CI dokaz.** Commit `28fe737` prolazi u run-u `40581127648` (`completed
success` na sva tri joba). Novi korak `Verify authorization scope cache
freshness` (49) je zelen, kao i `Verify performance budgets` (48),
`Verify structured operational logs` (36), `Verify auth session revocation`
(43), lint (50), typecheck (51), 803 backend unit testova (52), build (54) i
`npm audit` (55). Lokalno su uz `pipefail` potvrđeni 6/6 scope-cache scenarija,
8/8 performance budžeta, 36 root scenarija, svi statički gateovi i `npm audit`
= 0 za sva tri workspace-a.

**Delegirane vlasničke stavke (formalno zatvorene u repou):** CA/SAN potvrda,
live ACL `GETUSER`, proxy lanac i staging p95 load test — preuzima vlasnik,
provjerljivo kroz `check-deployment-readiness.mjs --env .env`.


### 0.19 Zatvaranje N-5/6/7/8/12 i vlasnička potvrda TLS-a

**Kontekst.** Neovisni code-only audit (§0.18, `docs/backend-code-audit-2026-10-27.md`)
ostavio je pet rangiranih nalaza. Vlasnik je zatražio njihovo zatvaranje i
potvrdio da je **TLS već aktivan na Redis i PostgreSQL** — to je sada unosivo u
`check-deployment-readiness.mjs` kroz `TLS_VERIFIED=true` (`.env.example` ga
dokumentuje), pa `db-cert-san` / `redis-cert-san` prelaze iz MANUAL/warn u pass.

**Rješenja.**
- **N-5:** `WarehouseResolutionService` kešira org/warehouse graf po TTL/verziji;
  nova `findEmployeeIdsForWarehouse()` radi jedan bounded upit;
  `InventoryCountService` više ne zove `resolveForEmployee()` u petlji.
  5 unit scenarija.
- **N-6:** `createForUsers()` koristi `notification.createManyAndReturn()` — jedan
  INSERT za cijeli fan-out, emit ostaje po korisniku.
- **N-8:** `buildWarehouseStockReceivedOutboxRows(tx, lotIds)` +
  `tx.notificationOutbox.createMany({ skipDuplicates: true })` unutar oba stock
  receive puta; post-commit petlja i direktni notifier su uklonjeni.
- **N-7:** `handleOrgUnitChange(..., tx, notificationsEnabled)` se izvršava u
  istoj transakciji kao `employee.update()`; `supersedeOpenCasesInTx()` i
  idempotentni relocation outbox ključevi. Bez nove tabele/migracije.
- **N-12:** 7 `*.service.characterization.spec.ts` fajlova (ponašajni + izvorni
  testovi) i `check-audit-findings.ts` gate koji ih čuva.

**Dokazi.** 5 N-5 specova, 7×2 karakterizacijska scenarija, 17 readiness
scenarija (uključujući TLS_VERIFIED), 8 N-5..N-12 statičkih tvrdnji u
`Verify independent audit findings (N-5..N-12)`. Ocjena koda: **8.8/10**
(performanse 6.5→8.5, integritet 8.5→9.3, testovi 6.5→8.5).

**CI dokaz.** Commit `2b8f592` prolazi u run-u `40586562199` (`completed
success` na sva tri joba). Korak `Verify independent audit findings (N-5..N-12)`
(50) je zelen, kao i scope freshness (49), performance budgets (48),
strukturirani logovi (36), lint (51), typecheck (52), 824 backend unit testa
(53), build (55) i `npm audit` (56). Lokalno su potvrđeni 19 novih unit
scenarija, 37 root scenarija, svi statički gateovi, frontend/worker build i
`npm audit` = 0 za sva tri workspace-a.

**Ostaje otvoreno (P2/P3, ne blokira):** N-9 sirovi query parametri, N-10 tihi
`JWT_REFRESH_TTL` fallback, N-11 rate-limit na refresh/logout, N-13 rasuti role
checkovi, N-14 magic advisory lock brojevi, N-15 razdvajanje 3 050-line servisa.

## 4. Talas 1 — sigurnosni P1 nalazi

### 1.1 Dependency nadogradnje kao odvojeni, mali paketi

**Red:** proxy/rate-limit relevantni paketi → upload/Multer lanac → ostali backend runtime advisories → dev-only alati.

1. Napraviti lockfile baseline i listu direktnih/transitivnih dependency-ja, njihovih runtime upotreba i dostupnih patch verzija.
2. Ažurirati najmanji mogući raspon verzija; prvo `proxy-addr`/Express lanac jer IP login rate-limit zavisi od `request.ip` i trust-proxy topologije.
3. Posebno pregledati Multer update zbog promjena upload ponašanja i Nest platform-express kompatibilnosti.
4. Pokrenuti testove, build, upload/auth/Socket regression suite i `npm audit` ponovo.
5. Pregledati advisories koji ostanu: napisati da li je paket runtime ili dev-only, da li je putanja reachable i ko prihvata rezidualni rizik.

**Prihvatanje:** nema kritičnih/visokih runtime advisories bez dokumentovanog izuzetka i vlasnika rizika; lockfile diff je pregledan; relevantni regresioni testovi prolaze.

### 1.2 Uvesti jedinstvenu upload politiku prije bufferovanja

Obuhvatiti `uploads` i DOCX template upload kroz zajednički, konfigurabilni policy sloj.

- Postaviti Multer `limits` prije nego što fajl uđe u memory storage: maksimalna veličina, broj fajlova, broj/veličina polja i prihvatljive field names.
- Odbiti prazne, prevelike i neočekivane fajlove prije daljeg procesiranja; API vratiti stabilan 4xx kod i poruku bez stack trace-a.
- Za PDF provjeriti signature/sniffed content i strukturu u dozvoljenom obimu; MIME/ekstenzija klijenta koristiti samo kao dodatnu provjeru.
- Za DOCX ograničiti compressed bytes, broj ZIP entries, ukupne uncompressed bytes i compression ratio prije čitanja XML-a ili renderovanja.
- Napraviti testove MIME spoofing-a, pogrešnog potpisa, oversized input-a i ZIP dekompresijskog budžeta.
- Pisati u privremeni naziv unutar kontrolisanog direktorija; završiti validaciju prije finalnog rename-a. Ako DB zapis ili konačni rename ne uspije, očistiti temp/final fajl gdje je bezbjedno i evidentirati cleanup grešku.
- Dodati periodični/startup reconciler za stare temp fajlove i fajlove bez DB metapodataka; ne brisati fajl samo na osnovu starosti bez provjere ownership-a.
- Prije rollout-a izmjeriti očekivane najveće legitimne PDF/DOCX fajlove sa poslovnim korisnicima; limite ne birati napamet.

**Prihvatanje:** hard limit se primjenjuje prije parsiranja/bufferovanja; validacija stvarnog sadržaja prolazi; DB failure ne ostavlja neotkriven orphan; dozvoljeni dokumenti i download ACL rade kao prije.

#### Stored transfer-template path containment (P2 — implementation added)

- Putanja template-a iz baze se sada normalizuje i provjerava da ostane unutar `UPLOAD_DIR`; apsolutne putanje, traversal izvan root-a i root direktorij kao fajl odbijaju se kao neispravan interni zapis.
- Isti resolver koriste download, activation i generisanje prenosnice; testovi pokrivaju validnu relativnu putanju, traversal, apsolutnu putanju i root. Lokalni lint i 406 unit testova su prošli, a CI run `40222506782` je prošao sve workflow jobove.

### 1.3 Ukloniti stored HTML injection iz prenosnica

- Potvrditi endpoint response i origin u stvarnom deployment-u.
- Ako poslovni proces zahtijeva HTML preview, escape-ovati sve tekstualne čvorove i atribute kontekstualno; ne umetati raw vrijednosti iz `reason`, `notes`, imena, labela ili inventurnih brojeva.
- Razmotriti `Content-Disposition: attachment` ili generisani PDF samo nakon potvrde da je to kompatibilno sa postojećim potpisivanjem/štampom.
- Dodati regression testove za `<script>`, `</td><script>`, `img onerror`, quote/attribute payload i unicode/ampersand tekst; očekivati prikaz kao tekst, ne izvršavanje.
- Provjeriti i druge HTML/CSV export putanje u istom modulu da fix nije samo za jedan template.

**Prihvatanje:** nijedna vrijednost iz DTO/DB ne može postati izvršni markup; postojeće legitimne vrijednosti se ispravno prikazuju/štampaju.

### 1.4 Učiniti setup i produkcijski HTTP config fail-safe

- Startup u production režimu odbija prazan ili placeholder `SETUP_TOKEN` prije inicijalizacije prvog admina; dokumentovati tajni provisioning i rotaciju.
- Serializovati bootstrap jedinstvenim DB/advisory lock-om ili ekvivalentnim single-winner mehanizmom; provjeriti stanje unutar iste transakcijske granice.
- Uključiti company/system settings u transakciju ili uvesti idempotentan oporavak prije nego što setup označi uspjeh.
- Zamijeniti CORS fallback `origin: true` sa eksplicitnom allow-listom u production; startup treba odbiti praznu ili wildcard konfiguraciju uz credentials. Dev fallback mora biti eksplicitan po environmentu.
- Provjeriti trusted proxy hop count prema stvarnoj topologiji; ne mijenjati `trust proxy` samo da bi se utišao audit bez provjere da direktni klijenti ne mogu falsifikovati forwarded headers.

**Prihvatanje:** dva paralelna setup zahtjeva daju tačno jednog pobjednika; production startup ne može raditi sa otvorenim CORS/setup defaultom; dev režim i dokumentovani deployment i dalje rade.

## 5. Talas 2 — atomičnost identiteta i dodjela pristupa

### 2.1 Atomarni `UsersService.update()`

- Prije koda nacrtati sve entitete koje update može mijenjati: user, role, moderator/org/warehouse/registrar dodjele i povezani employee podaci.
- Premjestiti assignment delete/create i user promjene u jednu Prisma transakciju; validacije koje zavise od baze ponoviti u transakciji.
- Invalidirati auth/scope cache **nakon commit-a**. Ako invalidacija ne uspije, koristiti pouzdan retry/event mehanizam ili kratak TTL kao dodatnu mitigaciju, ne prijevremeno brisanje.
- Testirati rollback na grešci svakog koraka, downgrade role-a, self-edit, moderator granice, duplu dodjelu i paralelnu izmjenu.

**Prihvatanje:** ni jedan neuspjeli update ne ostavlja djelimično izbrisane/dodijeljene scope-ove; endpoint poruke za validation/unique conflict ostaju stabilne.

### 2.2 Atomarna refresh rotacija i sesijski životni ciklus

- Uvesti compare-and-set revoke (`where revokedAt IS NULL`) i provjeriti da je pogođen tačno jedan red; novi token se kreira u istoj transakciji.
- Paralelni refresh test: od dva istovremena zahtjeva najviše jedan izdaje novi validan refresh token; drugi dobija kontrolisani unauthorized odgovor.
- Provjeriti logout, expiry, revoke, password/account deactivation i cleanup starih refresh redova.
- P2 retention: `RefreshTokenCleanupService` jednom dnevno (03:00 UTC) briše istekle redove u batch-ovima do 20.000 po pokretanju; složeni `(expiresAt, id)` indeks podržava determinističko skeniranje, a preostali redovi se nastavljaju narednim danom. Testovi pokrivaju aktivne tokene, batch limit i cleanup rezultat.
- Dodati metrike za refresh failure/reuse bez logovanja tokena ili token hash-a.

**Prihvatanje:** dupli refresh ne može proizvesti dvije aktivne rotacije; logout/deactivation ponašanje je pokriveno integration testom.

### 2.3 Jedinstvena invalidacija deaktiviranog korisnika

- Napraviti shared servis/API za promjenu aktivnog statusa i auth-cache invalidaciju; koristiti ga iz Users i Employees toka.
- Pri deaktivaciji opozvati relevantne refresh tokene prema odobrenoj sesijskoj politici.
- WebSocket: provjeriti korisnika i status pri connect-u; za aktivne sesije uvesti event/registry kojim se konekcije deaktiviranog korisnika odmah prekidaju. Provjera samo pri connect-u nije dovoljna ako zahtjev traži trenutni revoke.
- Testirati REST nakon deaktivacije, WebSocket već otvoren prije deaktivacije, reconnect i drugi backend instance.

**Prihvatanje:** deaktivirani user ne dobija novi REST/WS pristup; cache ne produžava pristup izvan dogovorene granice.

## 6. Talas 3 — pouzdanost inventurnog zatvaranja i background poslova

### 3.1 Definisati jedan state machine

Prije implementacije dogovoriti tačno značenje i prelaze za inventory close, npr.:

`queued → running → done | failed` (sa lease-token/expiry recovery za napušteni `running` posao)

- **Odluka vlasnika procesa:** inventurna sesija ostaje zatvorena i pending action greške se evidentiraju; retry iscrpljen ili trajna/business greška ostaje `failed` uz `failedCount`.
- **Odluka o retry-u:** samo poznate prolazne DB/connection greške dobijaju najviše 3 pokušaja ukupno, sa eksponencijalnim čekanjem 250 ms pa 500 ms (cap 2 s); business/validation i neklasifikovane greške se ne ponavljaju. Retry izvršava close worker u okviru obrade akcije; BullMQ i dalje upravlja retry-em samog close posla.
- Lease/heartbeat recovery je implementiran: lease traje 2 minute, heartbeat se obnavlja svakih 30 sekundi, a reconciler ponovo enqueue-a queued i istekle running poslove. Ručni retry je zaseban, admin-only tok samo za `failed` posao dok je sesija još `closing`; zahtijeva razlog (5–500 znakova) i u istoj DB transakciji bilježi audit zapis. Završena sesija/job se ne mogu ponovo otvoriti.

### 3.2 Atomarni claim, idempotency i recovery

**Pending-action retry implementacija:** `applyPendingAction()` sada ponavlja samo eksplicitno allowlistane prolazne Prisma/PostgreSQL/network greške, najviše 3 pokušaja ukupno, uz 250/500 ms backoff. Trajne, business i nepoznate greške ne dobijaju retry: akcija se bilježi kao `failed`, a close worker nastavlja i zatvara sesiju uz `failedCount > 0`, po odobrenoj poslovnoj odluci. Pokušaji uključuju početni claim i dodatne retry pokušaje. Relocation finalize već je idempotentan preko terminalnog transfer statusa; direktni relocation retry prepoznaje ciljano warehouse/person stanje nakon mogućeg ambiguous commit-a. Disposal retry u istoj sesiji sada ne resetuje terminalni review status i za pending zapis mijenja samo line link pod uslovom da status i dalje `pending`; nova sesija i dalje otvara novi pending review.

Dodani su unit testovi za retry, lease claim i reconciler te PostgreSQL integracija koja u child procesu uradi disposal approval commit pa ga prisilno prekine sa `SIGKILL` prije statusa akcije; worker oporavi lease i replay potvrđuje da postoji samo jedan approval. Osnovni lease recovery prošao je CI run `40231642660` (426 backend unit testova), a stvarni process-kill/replay scenario prošao je CI run `40232428101`. Nova migracija, Prisma validacija, PostgreSQL/Redis integracije, lint, typecheck, build i 432 unit testa prošli su u CI run-u `40234427074`. Prethodni run `40234238392` otkrio je zastarjele test-double metode u process-kill integraciji; ažurirane su u commit-u `59f8942` prije uspješnog rerun-a.

- Implementirano: conditional DB claim uz unikatni lease token, expiry od 2 minute i heartbeat svakih 30 sekundi. Pri takeover-u se pending actions ostavljene `running` atomarno vraćaju u `pending`; terminalne akcije se ne diraju.
- Progress brojači i terminalni action status se commituju u jednoj transakciji pod istim lease tokenom; close-job finalizacija i session zatvaranje su također transakcijski. API response mapperi izostavljaju interne lease kolone, pa response shape ostaje nepromijenjen.
- Relocation/disposal DB promjene su zaštićene replayom. Notification outbox je uveden za disposal approval pending i zatvaranje sesije: idempotentni outbox zapisi se kreiraju u istoj DB transakciji kao approval/session close, a relay upsert-a jednu Notification po outbox ID-u. Socket.IO je at-least-once signal: pad nakon emit-a, a prije mark-as-delivered može proizvesti dupli event; REST Notification zapis ostaje jedinstven i trajno čitljiv.
- Ako se DB queued zapis kreira, a `queue.add()` padne, status ostaje retryable; startup/periodični reconciler sada traži queued poslove i running poslove sa isteklim ili starim null lease-om, uz deterministički recovery job ID.
- Admin-only `POST /inventory-sessions/:id/close-job/retry` prihvata obavezan razlog, upisuje audit zapis i vraća samo failed posao sesije koja je i dalje `closing` u `queued`. Kompletirana sesija i job nisu retryable. Ako Redis enqueue ne uspije, DB zapis ostaje queued za postojeći reconciler.
- Dodan PostgreSQL CI test `check-inventory-pending-action-outcomes.ts`: nad stvarnim DB close-job/action zapisima injektuje dvije poznate prolazne greške pa uspješan treći pokušaj, te trajnu grešku za drugu akciju. Provjerava tačno tri pokušaja za transient, bez retry-a za permanent, `failedCount`/`lastError` evidenciju i da se sesija ipak zatvori sa close jobom `done`. Dvije worker instance istovremeno dobijaju isti job; test provjerava da DB lease claim dopušta samo jednom da primijeni akcije. Izabrani pending-action ugovor prošao je run `40315214840`; proširena provjera duple worker isporuke i atomičnog claim-a prošla je zajedno sa ostalim CI provjerama u run-u `40320587282`.
- Proširen `check-inventory-close-reconciler-concurrency.ts`: `closeSession()` prvo komituje `closing/queued`, dok enqueue mock simulira Redis grešku nakon commita; zatim dvije reconciler instance istovremeno čitaju durable DB job i dodaju ga u stvarni BullMQ/Redis queue. Test provjerava da posao ostane retryable i da deterministički recovery ID bude u queue-u tačno jednom. PostgreSQL/Redis integracija i kompletni backend/frontend/document-worker CI prošli su u run-u `40317337619`; prošireni scenario (enqueuing failure + simultaneous reconciliation) također je prošao run `40320587282`.
- Dodan `check-inventory-manual-close-retry-race.ts` za dva admin zahtjeva nad istim failed jobom: test sinhronizuje transakcije nakon čitanja `failed` statusa, pa provjerava da conditional update daje jednog pobjednika, jedan kontrolisani `ConflictException`, samo jedan queue enqueue i tačno jedan audit red sa actor-om i normalizovanim razlogom. Cijeli backend/PostgreSQL/Redis, frontend i document-worker CI prošao je u run-u `40318393918`.

### 3.3 Fault-injection i prihvatanje

Testirati najmanje:

- Redis nedostupan prije i poslije DB enqueue zapisa.
- Worker proces se ugasi tokom obrade i nakon side effect-a, ali prije DB completion statusa.
- Isti job isporučen dva puta ili paralelno na dvije worker instance.
- Retry admin-only na failed close job dok je sesija još `closing`, odbijanje za već zatvoren session/job i audit trail razloga.
- Djelimično neuspjela pending action i odluka o finalnom session statusu.
- Reconciler pokrenut istovremeno na dvije backend instance.

**Prihvatanje:** nijedan validan posao ne ostaje trajno u `closing/queued/running` bez vlasnika; retry je dokazano bez duplih poslovnih posljedica; stanje API-ja i UI-ja odgovara dogovorenom poslovnom ishodu.

### 3.4 Outbox za kritične side-effecte

Transactional notification outbox je uveden za događaje koji nastaju pri inventory close obradi: disposal approval pending i inventory session closed. Ostale, nepovezane notification tokove nisu obuhvaćeni ovim paketom.

- Business row i per-user outbox zapisi nastaju u istoj PostgreSQL transakciji; jedinstveni idempotency key sprečava dupliciranje pri replay-u.
- Relay claim-a event uz lease, kreira Notification preko unique `outboxId` upsert-a i tek onda emituje Socket.IO signal. Greške se retry-uju bez gubitka outbox reda, uz eksponencijalni backoff od 5 sekundi do najviše 1 sata; istekli `running` lease se preuzima nakon restarta.
- Socket.IO je at-least-once; ponovljeni signal nosi isti Notification ID. Persisted Notification/outbox su izvor istine, a klijent može deduplikovati po ID-u.
- Unit testovi pokrivaju stabilan idempotency key, `skipDuplicates` i notification upsert prije emit-a. Dodan je `check-notification-outbox-crash-replay.ts`: child relay uradi stvarni PostgreSQL notification upsert, zabilježi emit side-effect pa se prisilno ugasi prije mark-as-delivered; parent provjerava istekli lease recovery, ponovni emit istog Notification ID-a, tačno jedan DB Notification i terminalni `delivered` outbox status. Hosted CI run `40321346138` prošao je process-kill/replay integraciju, PostgreSQL/Redis provjere, lint, typecheck, backend unit/build, frontend i document-worker provjere.

**Prihvatanje:** commit approval-a/session close ne može izgubiti odabrani outbox event; ponovljeni relay ne kreira dupli Notification DB zapis.

## 7. Talas 4 — konkurentnost i domenske invarijante

### 4.1 Transferi i promjene statusa

- Conditional status transition za finalize/cancel/markPrinted već koristi affected-row count; unit testovi `claim-transfer-finalize.util.spec.ts` pokrivaju otvoreni claim, uže tranzicije i odbijanje nakon konkurentne terminalne promjene.
- Gdje stanje više redova mora mijenjati zajedno, koristiti transakciju i dosljedan lock/update redoslijed.
- **Post-commit rizik — implementirano i CI-verifikovano:** transfer create/finalize sada atomarno upisuje notification outbox događaje u istoj transakciji kao poslovnu promjenu; stock-lot issue radi isto. Primaoci dobijaju idempotentne `transfer:<id>:<type>:<userId>` ključeve, a postojeći relay pravi trajne Notification zapise prije ponovljivog Socket.IO signala. Direktni post-commit notification loopovi su uklonjeni; crash/replay test je prošao u CI run-u `40321346138`.
- Odabrani ugovor je da poslovni commit pobjeđuje: DOCX render više ne blokira/poništava create/finalize. Migracija dodaje DOCX status, pokušaje, lease token/expiry i grešku; queued/stale-running poslovi se obrađuju kroz 5-sekundni reconciler, a lease claim je atomaran. Greške prelaze u `failed`, HTTP transfer akcija ostaje uspješna, a postojeći retry endpoint ponavlja DOCX kada nedostaje/neuspješan je pa PDF konverziju. Status endpoint sada vraća DOCX state i dostupnost, a `TransferDocumentPanel` prikazuje stanje, poll-uje queued/running i nudi ručni retry za failed.
- Uklonjena je pre-commit provjera aktivnog predloška: nedostajući/neispravan predložak je dokumentacijski neuspjeh koji se evidentira nakon commita. API DTO ne izlaže lease token, pokušaje, interne greške ni generated file paths. Otkazani transferi se ne claim-uju za DOCX generisanje.
- Nova PostgreSQL CI integracija ubija stvarni child worker sa `SIGKILL` nakon što DOCX postoji na disku, ali prije DB finalize update-a. Provjerava `running` + lease, odsutan DB path i prvi pokušaj, zatim ističe lease, poziva stvarni reconciler i potvrđuje drugi pokušaj, `done`, očišćen lease/error i čitljiv konačni DOCX na determinističkoj putanji. Proširena je da ubije drugi worker poslije DOCX DB finalize-a, ali prije PDF enqueue-a: potvrđuje da nema `DocumentJob`, a zatim poziva stvarni PDF download fallback (koji delegira na `retryPdfGeneration()`) i `DocumentConversionQueueService` sa kontrolisanim BullMQ adapterom te provjerava HTTP `409 processing` i kreiranje queued DB posla sa ispravnim izvorom, ciljem i Bull job ID-em. Time se dokazuje eksplicitni retry put za oba crash prozora. Proširena integracija je prošla u hosted PostgreSQL CI run-u `40326482157` zajedno s backend lint/typecheck/unit/build, frontend i document-worker provjerama.
- Nova PostgreSQL + Redis CI integracija ubija proces unutar `DocumentConversionQueueService.queue.add()` nakon što je stvarni `DocumentJob` već commitovan, ali prije nego što Redis/BullMQ primi posao. Provjerava orphan `queued` red bez `bullJobId`, zatim pokreće stvarni `DocumentConversionEventsService.onModuleInit()` i provjerava da nedostajući BullMQ posao postaje `failed` sa retry porukom; ponovni enqueue mora napraviti novi `DocumentJob` i BullMQ ID, uz sačuvan failed red kao audit istoriju. Test je dodatno otkrio da je enqueue servis vraćao stale objekat bez upravo vezanog `bullJobId`; `attachBullJobId()` sada vraća ažurirani DB red pa je i rezultat enqueue-a konzistentan. Startup recovery sada ne proglašava job izgubljenim tokom prvih 60 sekundi (mogući enqueue u drugoj instanci), a reconciler provjerava aktivne poslove svakih 30 sekundi. Osnovni crash/retry test je prošao u hosted CI run-u `40330663082`.
- Dodana PostgreSQL + Redis integracija simulira izgubljeni `completed` QueueEvent: stvarni BullMQ worker završi posao nakon prve reconciliation provjere, dok DB red ostane `running`; naredni periodic reconcile čita stvarno `completed` stanje i popravi DB na `done`. CI/npm wiring je dodan, a test je prošao u hosted PostgreSQL + Redis run-u `40333051652` zajedno s backend lint/typecheck/unit/build, frontend i document-worker provjerama.
- Zatvorena je utrka između asinhronih `active`/`completed`/`failed` QueueEvents handlera: `DocumentJobsService` sada uslovno mijenja status samo iz `queued`/`running`, pa su `done` i `failed` terminalni. Event servis i reconciler izvršavaju sinhronizaciju PDF putanje i Socket.IO notifikaciju samo kada conditional update stvarno pobijedi. Zakašnjeli `active` više ne vraća završeni posao u `running`, duplicirani terminalni eventi ne ponavljaju domenske efekte, a kasniji `incrementAttempts` ne mijenja terminalni brojač pokušaja. Dodana su dva unit testa za side-effect idempotentnost, a PostgreSQL/Redis integracija pokriva oba terminalna statusa. Lokalno su prošli lint i svih 438 unit testova; hosted PostgreSQL + Redis CI run `40336974440` potvrdio je integraciju, backend typecheck/unit/build, frontend i document-worker provjere.
- Ispravljen je PDF download fallback kada je fajl obrisan s diska: ako posljednji `DocumentJob` ima status `done`, a `generatedPdfPath` na transferu je zastario ili `null`, servis sada popravlja pointer prema stvarnom rezultatu posla. Ako ni rezultat završenog posla ne postoji, zakazuje novu konverziju i vraća `409 processing` umjesto trajnog `409 done`; dok je novi posao `queued`/`running`, ne pravi dupli enqueue. Ako je stari PDF još čitljiv, a novi završeni posao ima vlastiti rezultat, preferira se novi rezultat. Dodano je pet unit testova nad stvarnim temp fajlovima i proširena PostgreSQL integracija za crash recovery. Lokalno su prošli lint i svih 443 unit testa; hosted PostgreSQL + Redis CI run `40339472851` potvrdio je proširenu integraciju, backend typecheck/unit/build, frontend i document-worker provjere.
- `GET /transfers/:id/generated-document/status` sada uz postojeća polja vraća i `hasGeneratedPdf`, izračunato iz stvarno čitljivog rezultata najnovijeg `done` posla ili `transfer.generatedPdfPath`. Time `status: 'done'` više ne implicira dostupan PDF ako je fajl obrisan. Sve pohranjene relativne putanje generisanih DOCX/PDF datoteka rješavaju se kroz `resolveGeneratedDocumentPath`, koji odbija apsolutne putanje, `../` traversal, null bajtove i bilo koju lokaciju izvan upload roota; neispravna DB putanja se tretira kao nedostajući fajl i vodi ka regeneraciji. Dodano je sedam unit testova za status, dostupnost i path containment. Lokalno su prošli lint i svih 450 unit testova; hosted PostgreSQL + Redis CI run `40344431522` potvrdio je backend typecheck/unit/build, sve integracije, frontend i document-worker provjere.
- `TransferDocumentPanel` sada koristi `status` i `hasGeneratedPdf` iz status endpointa. Jedan polling efekat prati DOCX i PDF posao, zaustavlja se na terminalnom statusu i prikazuje korisniku da se PDF generiše, da je konverzija pala, ili da je posao `done` ali fajl nedostaje pa će preuzimanje pokrenuti regeneraciju. Pravila za polling i poruke izdvojena su u čisti FE util i pokrivena sa tri nova guard testa. Lokalno su prošli FE typecheck/production build, 13 FE guard testova, backend lint i 450 backend unit testova; hosted CI run `40364737327` potvrdio je FE/build/specs, backend PostgreSQL/Redis integracije, typecheck/unit/build i document-worker provjere.
- `SocketProvider` sada sluša već postojeći `document.job.updated` signal i kroz `useDocumentJobUpdates` ga dostavlja samo panelu za odgovarajući `sourceType`/`sourceId`. `TransferDocumentPanel` na taj signal odmah osvježava durable status. Polling ostaje fallback dok je socket diskonektovan ili dok korisnik ne primi svoj prvi realtime event — backend ciljano emituje samo korisniku koji je zatražio konverziju, pa drugi posmatrači ne bi smjeli ostati bez ažuriranja. Nakon reconnecta se realtime povjerenje resetuje jer se Redis Stream eventi ne replayaju. Pravilo odluke je testirano jednim novim FE guard testom. Lokalno su prošli FE typecheck/production build i 14 FE guard testova; hosted CI run `40367567009` potvrdio je FE/build/specs, backend PostgreSQL/Redis integracije, typecheck/unit/build i document-worker provjere.
- Zatvoren je preostali notification rizik za Document Engine: svaki terminal `done`/`failed` prelazak sada u istoj DB transakciji kreira idempotentan `NotificationOutbox` red za aktivnog korisnika koji je zatražio konverziju. Ključ `document-job-terminal:<jobId>:<status>` sprječava duplikate iz QueueEvents handlera i periodičnog reconciler-a, a postojeći relay pravi trajnu `Notification` bez potrebe za novom migracijom (`type: 'info'`). Socket.IO ostaje niskolatentni signal, ali više nije jedini kanal. Poštuje se `notifications.enabled`; ako settings store padne, notifikacija se ipak čuva. Anonimni i neaktivni korisnici ne dobijaju outbox red. Dodano je devet unit testova za builder i transakcijsku perzistenciju, a PostgreSQL/Redis race integracija sada potvrđuje oba terminalna outbox reda. Lokalno su prošli lint i svih 459 unit testova; hosted PostgreSQL + Redis CI run `40372270939` potvrdio je proširenu race integraciju, backend typecheck/unit/build, FE guard specs/build i document-worker provjere.
- Dodana je zasebna PostgreSQL integracija koja spaja cijeli lanac: stvarni `DocumentJobsService` kreira `done`/`failed` outbox redove, stvarni `NotificationOutboxRelayService` i `NotificationsService` ih isporučuju u tačno dvije trajne `Notification` tabele i dva `notification.created` signala, a ponovljeni relay ne pravi duplikate. Novi npm script i CI korak su uključeni. Lokalno su prošli lint, `git diff --check` i svih 459 unit testova; hosted PostgreSQL CI run `40375442945` potvrdio je novi korak uz sve ostale integracije, typecheck/unit/build, FE i document-worker provjere.
- Dodan unit test za stabilne per-recipient transfer outbox ključeve. Lokalno su prošli backend lint, svih 434 backend unit testa i frontend production build. Lokalni Prisma generate/backend typecheck/build nije moguć jer schema-engine preuzimanje sa `binaries.prisma.sh` pada TLS handshake-om. Prvi hosted CI run `40238066222` našao je nepodudaranje povratnog DTO tipa nakon uklanjanja internih fields; tip je korigovan u `a733a48`. CI `40238184749` je potom prošao migraciju/shema validaciju, PostgreSQL/Redis integracije, backend/frontend/document-worker typecheck, testove, buildove i dependency audit.

**Prihvatanje:** poslovni commit ostaje uspješan uz kasniji notification/DOCX kvar; outbox je trajan i idempotentan, DOCX status/retry je vidljiv, a CI potvrđuje migraciju, typecheck/build i konkurentnost.

### 4.2 Warehouse stock i maintenance lotovi

- Zamijeniti pre-check + decrement sa atomic conditional decrement gdje je moguće (`quantityOnHand >= requested`) i provjeriti pogođeni red.
- U istoj transakciji zapisati movement/event i povezanu opremu/maintenance promjenu.
- Maintenance part statusi (faulty/remove/replace) i disposal approval review koriste conditional update; promjene opreme, zaliha i eventi ostaju u istoj transakciji.
- Implementirano nakon odluke vlasnika: `BulkCreateStockLotDto.items` ima gornju granicu od 100 unosa; DTO test potvrđuje da 100 prolazi, a 101 se odbija. Backend/PostgreSQL/Redis CI run `40235730013` prošao je lint, typecheck, unit testove, migracije i build. Obrada unutar transakcije i dalje je serijska, pa batching treba razmatrati tek uz mjerenje trajanja.
- Zatvoreno: uklonjene su serijske `canAccessStockLot` provjere za svaki red u `listMaintenanceLots` i `listAvailableLotsForHost`. Oba endpointa sada dodaju `RegistrarScopeService.buildStockLotWhere(user)` u Prisma `where` filter, čime se scope primjenjuje u bazi koristeći isti shared predicate kao warehouse-stock list; sačuvani su admin/keeper pristup i fail-closed ponašanje za non-registrar role. Novi service testovi potvrđuju oba query filtra i da per-lot authorization više nije pozvan. Backend lint i 436 unit testova prošli lokalno; hosted CI run `40285691141` je potvrdio Prisma generation, PostgreSQL/Redis integracije, typecheck, build, lint, unit testove i frontend/document-worker provjere. Lokalni `tsc --noEmit` nije validan bez generisanog Prisma clienta (lokalni `prisma generate` je ranije blokiran TLS-om).
- PostgreSQL test `check-stock-lot-decrement-race.ts` pokreće dvije transakcije koje istovremeno pokušavaju potrošiti posljednju jedinicu kroz isti helper; potvrđuje tačno jedan uspjeh, jedan kontrolisani insufficient-stock odgovor, quantity 0 i zatvaranje lota. Test je dodat u obavezni branch CI i prošao u run-u `40282514202`.

**Prihvatanje:** quantity nikad nije negativan niti se potrošnja evidentira bez odgovarajućeg lot movement-a.

### 4.3 Inventura, komisije i scheduler

- `recordLine` i `recordWarehouseLine` sada zaključavaju aktivnu parent sesiju (`SELECT ... FOR UPDATE`) u istoj transakciji prije upisa; oba committee-close toka koriste isti session lock, a committee status se provjerava ponovo nakon zaključavanja.
- PostgreSQL CI integration test sada koristi dvije stvarne transakcije: record-side čeka dok close-side zaključa i zatvori aktivnu sesiju; nakon otključavanja helper ponovo provjerava status i odbija kasniji write. Test je prošao u CI run-u `40221562648`; unit test pokriva active-session guard rezultat.
- PostgreSQL CI integration test pokreće dvije istovremene review transakcije nad istim pending disposal approval zapisom; tačno jedna mora commit-ovati terminalni status, a druga dobiti `Approval already reviewed`. Scenario je prošao u CI run-u `40222094387`; CI je time pokrio close-vs-record i disposal-review race, dok pending-action retry još traži zaseban Postgres integration scenario.
- Inventory cron je sada eksplicitno vezan za 00:05 UTC; `inventory.scheduler_timezone` se koristi za poslovni kalendarski datum, a invalidna IANA zona se loguje i preskače bez rušenja scheduler procesa.
- Redis lease se obnavlja svakih 5 minuta preko token-checked Lua `PEXPIRE`; 15-minutni TTL i dalje čisti lease nakon pada procesa, a token-checked release sprečava brisanje tuđeg locka.
- Unit testovi pokrivaju vlasnički token i TTL argumente; live Redis CI test potvrđuje renewal/TTL/release, deterministički timestamp testovi pokrivaju DST promjene i granicu godine.

**Prihvatanje:** zatvorena komisija/sesija ne prima kasniji write; isti periodični job se ne izvršava duplo; timezone prelazi imaju jedno očekivano ponašanje.

### 4.4 Kategorije i numeric settings

- Parent promjena u kategoriji se validira u transakciji pod PostgreSQL advisory transaction lock-om; nakon lock-a se ponovo čita cijelo stablo, pa dva paralelna reparent-a ne mogu zajedno uvesti ciklus. Prisma raw lock query vraća serializabilan integer umjesto PostgreSQL `void` rezultata. Unit testovi pokrivaju self/descendant i validno reparentovanje; stvarni PostgreSQL test za dva paralelna update-a prošao je u CI run-u `40283745919`.
- `upload.max_mb`, `lists.default_page_size` i `lists.max_page_size` sada odbijaju non-finite vrijednosti, pogrešan tip, decimale i vrijednosti izvan key-specific raspona; dodatno se provjerava `default_page_size <= max_page_size`. Boolean settings odbijaju neprepoznate stringove umjesto da ih tiho pretvore u `false`.
- Svaki novi numeric setting mora deklarisati odgovarajući min/max/integer policy u registry-ju.

**Prihvatanje:** kategorijsko stablo je aciklično; nevažeći setting se odbija sa field-level 400 prije upisa/cache invalidacije.

#### Settings default initialization (P2 — implementation added)

- `SettingsService.ensureDefaults()` sada koristi registry-driven upsert-e u jednoj Prisma transakciji; višestruke replike mogu sigurno inicijalizovati iste ključeve bez check-then-create race-a.
- Postojeće admin vrijednosti ostaju netaknute, a registry metadata se usklađuje; cache ključevi se invalidiraju tek nakon uspješnog commit-a.
- Unit test pokriva transakcijsku granicu i cache invalidaciju; hosted CI ima PostgreSQL test koji istovremeno pokreće dvije inicijalizacije i provjerava da nema duplih/izgubljenih vrijednosti.

### 4.5 CSV i javni QR

- CSV: zaštititi ćelije koje spreadsheet može tretirati kao formulu (`=`, `+`, `-`, `@` i relevantni leading control/whitespace slučajevi), uz test Excel/LibreOffice kompatibilnosti; escaping delimitera sam po sebi nije dovoljan.
- Ograničiti broj export redova ili koristiti streaming; definisati timeout/memorijski budžet. Testirati response prekid i velika, ali dozvoljena izvlačenja.
- Javni QR: vlasnik procesa je odabrao zadržati postojeći DTO, uključujući ime/titulu/organizacijski put i historiju kretanja; ova odluka ne uklanja privacy rizik ni potrebu za redovnim preispitivanjem.
- Anti-enumeration bez nepotrebnog odavanja da li ID postoji; load test na cache miss-u.

#### Javni QR rate limit (P2 — implementation added)

- `GET /public/equipment/:id` sada koristi poseban Redis fixed-window bucket po klijentskoj IP adresi, nezavisan od login bucket-a; podrazumijevano 60 zahtjeva u 60 sekundi, višak dobija 429.
- `RATE_LIMIT_PUBLIC_EQUIPMENT_MAX`, `RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC` i `RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED` dokumentovani su u `.env.example` i proslijeđeni kroz oba Compose deploymenta; konfiguracija se strogo validira. Outage ponašanje je fail-open po defaultu, uz opciju 503 fail-closed.
- Guardovi su registrovani u odgovarajućim Nest modulima i Redis zavisnost se injektuje eksplicitnim tokenom; HTTP integration test pokreće stvarnu Nest rutu, potvrđuje 429 na trećem pozivu i da odbijeni zahtjev ne dođe do service sloja. Unit testovi pokrivaju route guard metadata, odvojene Redis ključeve, prag/prozor, neispravnu konfiguraciju i Redis outage policy.
- Vlasnik procesa je odabrao zadržati postojeći javni response DTO, uključujući historiju transfera; ovaj paket nije mijenjao javna polja. Anti-enumeration/load test ostaju otvoreni; rate limit ne mijenja response DTO.

**Prihvatanje:** export ne izvršava formule i ima predvidivu gornju granicu; javni QR response je dokumentovan i privacy-odobren.

## 8. Talas 5 — API ugovori, health, observability i release zaštita

### 5.1 DTO i autoritativna autorizacija

- Zamijeniti interface/inline `@Body()` tipove class DTO-ima sa `class-validator` pravilima, `transform`, max length i enum/range validacijom.
- Dodati e2e/controller testove da nepoznata polja budu odbijena i da invalid payload ne dođe do service/database sloja.
- Proći kroz scope-sensitive list/detail/write rute: testirati drugi tenant/org/warehouse i potvrditi da se ne može doći do podataka preko ID-a ili relacije.
- Uskladiti query string enum/ID tipove i explicit allow-list za generičke upload/entity rute.

#### Transfer-template upload DTO (P2 — implementation added)

- Multipart `label` se sada validira kroz DTO: optional string, najviše 120 znakova, a nepoznata polja se odbijaju. Time se sprečava 500 greška zbog pogrešnog tipa ili prekoračenja PostgreSQL `VarChar(120)` limita.
- Unit test pokriva odsutan/validan label, pogrešan tip, predugu vrijednost i nepoznato polje; lint i 407 unit testova, uz puni CI run `40223006751`, prolaze.

#### Bounded pagination offsets (P2 — implementation added)

- `parsePagination()` i direktni `paginate()` pozivi sada odbijaju `skip` iznad 100.000 redova sa HTTP 400; neskalabilan offset više ne može postati neograničen DB scan.
- Testovi pokrivaju granicu, prevelike/nesigurne page vrijednosti i potvrđuju da direktni `paginate()` odbije zahtjev prije bilo kojeg DB upita. Za dublje navigacije treba uvesti cursor-based endpoint, ne povećavati limit bez mjerenja.

### 5.2 Health i runtime observability

#### Liveness and readiness probes (P2 — implementation added)

- `GET /health/live` je process-only liveness endpoint i ne zavisi od DB/Redis/queue dostupnosti. `GET /health/ready` ostaje readiness provjera PostgreSQL-a, shared Redis-a i obje kritične BullMQ queue konekcije, sa timeout-om po provjeri.
- Legacy `GET /health` zadržava postojeći DB-only ugovor radi kompatibilnosti; Compose healthchecks u oba deployment fajla koriste `/health/ready` i računaju globalni `API_PREFIX` (uključujući prazan prefix). Orkestrator može koristiti `/health/live` za liveness i `/health/ready` za prijem saobraćaja.
- Unit test potvrđuje da liveness ostaje `ok` i kada su sve zavisnosti nedostupne; testovi, typecheck i build prošli su u CI run-u `40224257666`.

#### Login rate-limit resilience (P2 — implementation added)

- `RedisRateLimitGuard` je eksplicitno registrovan u `AuthModule` (isto kao public QR guard u svom modulu), tako da Nest može injektovati Redis servis u rutu označenu sa `@UseGuards`.
- `RedisService.incrementRateLimitCounter()` koristi jednu Lua skriptu za `INCR` i TTL; ključevi bez TTL-a iz ranijih verzija popravljaju se pri narednom hitu, bez promjene fixed-window semantics.
- `RATE_LIMIT_LOGIN_FAIL_CLOSED=false` zadržava postojeći fail-open default; `true` vraća 503 kad Redis nije dostupan. Max/window i policy vrijednosti se validiraju pri pokretanju.
- Unit testovi pokrivaju Lua poziv, input/response validaciju i oba outage režima; branch CI izvršava i live Redis test sa paralelnim inkrementima, expiry provjerom i legacy TTL repair.
- Opći `redis_connection_health` signal sada prati ready/reconnect/PING stanje shared klijenta, ali zaseban rate-limit Redis failure brojač i dalje ostaje otvorena uža metrika.

#### Notification outbox backlog signal (P2 — implementation added)

- `NotificationOutboxMetricsService` svakih 30 sekundi čita broj `pending` i `running` outbox redova te starost najstarijeg nedostavljenog reda. Log linija `notification_outbox_backlog` je stabilan JSON događaj bez user ID-jeva, naslova ili sadržaja notifikacija; `log` je rutinski nivo, a `warn` se aktivira kada se pređe prag broja redova ili starosti. Log collector može direktno alertovati na `warn` ili neprazan `reasons` niz.
- Dodane su privatne, admin-editabilne postavke `notifications.outbox.warn_backlog_count` (default 50) i `notifications.outbox.warn_age_seconds` (default 300), s validiranim rasponima. Ako settings store padne ili vrati nevažeću vrijednost, koriste se sigurni defaulti; DB greška se bilježi ali ne ruši scheduler.
- Sedam unit testova pokriva prikupljanje metrika, konfiguraciju, fallback, healthy/warn logove i izolaciju DB greške. Lokalno su prošli lint i svih 466 unit testova; hosted CI run `40378439779` potvrdio je backend typecheck/unit/build, sve PostgreSQL/Redis integracije, FE i document-worker provjere.

#### BullMQ queue depth/lag signal (P2 — implementation added)

- `QueueMetricsService` svakih 30 sekundi čita `waiting`, `active`, `delayed` i `failed` brojeve za `inventory-session-close` i `document-generation`, plus starost najstarijeg waiting i aktivnog posla. Log događaj `bullmq_queue_metrics` ne čita job payload-e i ne sadrži PII; `warn` se aktivira na prag backlog-a, waiting lag-a ili predugog aktivnog posla, sa odgovarajućim `reasons` nizom.
- Dodane su privatne postavke `queues.metrics.warn_backlog_count` (50), `queues.metrics.warn_waiting_seconds` (300) i `queues.metrics.warn_active_seconds` (1800). Nevažeće ili nedostupne postavke padaju na default; Redis greška se bilježi po queue-u bez rušenja scheduler-a.
- Osam unit testova pokriva izračun starosti, evaluaciju pragova, konfiguraciju i izolaciju greške. Nova Redis integracija koristi stvarni BullMQ `Queue`/`Worker` sa aktivnim, waiting i delayed poslovima te potvrđuje stvarne count/age metrike. Lokalno su prošli lint i svih 474 unit testova. Prvi hosted CI run `40383318996` je otkrio duplicirani `imports` ključ u `HealthModule` (TS1117); ispravka `e85b7bf` je prošla u run-u `40384114725` sa svim backend/frontend/document-worker provjerama.

#### Request/correlation ID i redakcija logova (P2 — implementation added)

- Express middleware čita `X-Request-Id` (ili `X-Correlation-Id` alias), odbija nesigurne vrijednosti s kontrolnim znakovima/`..`, generiše UUID ako header nedostaje, vraća ID u response headeru i izlaže ga kroz CORS `exposedHeaders`. `AsyncLocalStorage` drži ID kroz cijeli HTTP poziv.
- `CorrelationLogger` dodaje `[cid=...]` slobodnim porukama, a već strukturirane JSON događaje ostavlja JSON-om i obogaćuje ih autoritativnim `correlationId` i `level` poljima. `http_request` log sadrži samo metodu, put **bez query stringa**, status i trajanje — ne tijelo ni headere. `redactSensitiveText` uklanja authorization/cookie, lozinke, refresh/access tokene, JWT-ove, e-mail adrese, secret query parametre i apsolutne container putanje iz poruka i error objekata.
- `correlationId` se propagira u payload `inventory-session-close` i `document-generation` poslova. HTTP pozivi zadržavaju svoj ID; scheduleri dobijaju novi. Inventory close worker izvršava cijeli posao unutar tog konteksta, a QueueEvents handleri koriste stabilan `document-job:<jobId>` kontekst. Document Worker loguje `correlationId` bez apsolutnih putanja i bez job payload-a.
- Dodano je 16 backend unit testova za normalizaciju, ALS, redakciju, middleware i job payload-e, te 2 document-worker testa za format korelacije. Ažuriran je postojeći reconciler test i PostgreSQL/Redis integracija za konkurentne reconcilere. Lokalno su prošli backend lint i 490 unit testova, ciljani `tsc` nad novim common fajlovima, te 14 document-worker unit testova i build. Prvi hosted CI run `40390460552` je pao jer je integracijski test još očekivao stari close-job payload bez `correlationId`; ispravka `a8036c0` je prošla u run-u `40391103687` sa svim backend/frontend/document-worker provjerama.

#### PostgreSQL pool/latency signal (P2 — implementation added)

- `DATABASE_POOL_MAX` (default 10, validirani raspon 1–100) sada konfiguriše stvarni `pg.Pool` koji se predaje `PrismaPg` adapteru; `disposeExternalPool: true` osigurava zatvaranje pool-a na `$disconnect()`, a `onPoolError`/`onConnectionError` loguju strukturirane `postgres_pool_error`/`postgres_connection_error` događaje bez connection stringa. `.env.example`, `docker-compose.yml` i `docker-compose.prod.yml` dokumentuju budžet `replike × pool max + worker/migracije/maintenance < max_connections`.
- `PostgresMetricsService` svakih 30 sekundi čita stvarne `totalCount`/`idleCount`/`waitingCount` brojače iz process-local pool registry-ja i izvršava bezopasnu `SELECT 1` probu. JSON događaj `postgres_pool_latency` nosi latenciju, iskorištenost poola, pragove i `reasons` niz; `warn` se aktivira na nedostupan pool, DB grešku, sporu probu, čekanje na konekciju ili previsoku iskorištenost. Ne loguju se podaci iz baze ni kredencijali.
- Dodane su privatne postavke `database.metrics.warn_latency_ms` (250), `database.metrics.warn_waiting_count` (1) i `database.metrics.warn_utilization_percent` (90), svaka s validiranim rasponom i UI detaljima. Nevažeće/nedostupne postavke padaju na sigurne default-e; greška settings store-a ne ruši scheduler.
- 21 novih unit testova pokriva validaciju pool konfiguracije, registry brojače, čistu evaluaciju pragova, servisne log signale, redoslijed čitanja brojača nakon probe i strukturirano obogaćivanje JSON logova. Nova PostgreSQL integracija `test:integration:postgres-metrics` postavlja `DATABASE_POOL_MAX=3`, koristi stvarni `PrismaService` i potvrđuje da se konfiguracija i live pool brojači zaista vide u `postgres_pool_latency` liniji. Prvi CI run `40400986820` pao je jer su se brojači čitali prije `SELECT 1` probe (`poolTotal=0`); ispravka `bbee7e5` čita pool stanje nakon probe, dodaje regression unit test i prolazi u run-u `40401867512` na svim backend/frontend/document-worker provjerama. Lokalno je potvrđeno 511/511 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### Redis connection health signal (P2 — implementation added)

- `RedisConnectionRegistry` prati procesni život shared ioredis klijenta: `connect`, `ready`, `reconnecting`, `error`, `close` i `end` događaji održavaju brojače i timestamp-e. Svi lifecycle logovi (`redis_client_connect`, `redis_client_ready`, `redis_client_reconnecting`, `redis_client_error`, `redis_client_close`, `redis_client_end`, `redis_client_shutdown`) su jedan red JSON-a preko novog `writeStructuredLog` helpera, bez hosta, lozinke ili keyPrefix detalja.
- `RedisMetricsService` svakih 30 sekundi kombinuje registry stanje sa ograničenom `PING` probom (1 s timeout). JSON događaj `redis_connection_health` nosi `ready`, `state`, `pingOk`, `pingMs`, reconnect/error brojače, vrijeme od posljednjeg ready stanja, pragove i `reasons` niz; `warn` se aktivira na nedostupan registry, klijenta van ready stanja, neuspješnu/sporu probu, predugi prekid ili previše reconnect pokušaja.
- Dodane su privatne postavke `redis.metrics.warn_ping_ms` (250), `redis.metrics.warn_disconnect_seconds` (60) i `redis.metrics.warn_reconnect_count` (3), svaka s validiranim rasponom i UI detaljima. Nevažeće/nedostupne postavke padaju na sigurne default-e; greška settings store-a se bilježi kao `redis_metrics_setting_fallback` bez tajni.
- `RedisService` više ne loguje imena ključeva u free-form warn porukama: `getJson`, `setJson`, `del`, `delByPrefix` i `releaseLock` koriste `redis_operation_failed` JSON događaj sa operacijom, redigovanim razlogom i sigurnim dodatnim poljima (`keyCount`, `impact`). `create-prisma-client.ts` također koristi novi structured helper za pool/connection greške.
- 22 nova unit testa pokriva structured log helper, registry događaje/brojače, `withTimeout`, čistu evaluaciju pragova, servisne signale, settings fallback i redigovana Redis upozorenja. Nova Redis integracija `test:integration:redis-metrics` koristi stvarni ioredis klijent, potvrđuje `ready` + `PING` snapshot i JSON `redis_connection_health` liniju, te registrira jedan `reconnecting` događaj. Hosted CI run `40407334471` je zelen na backend, frontend i document-worker jobovima, uključujući sve PostgreSQL/Redis integracije; lokalno je potvrđeno 533/533 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### Upload rejection metrics signal (P2 — implementation added)

- `UploadRejectRegistry` broji odbijene upload zahtjeve po operaciji (`signed_transfer_pdf`, `transfer_template_docx`, `multipart`) i po razlogu (`missing_file`, `invalid_mime`, `invalid_signature`, `size_limit`, `invalid_extension`, `invalid_template`, `missing_org_unit`, `access_denied`, `multipart_size_limit`, `multipart_reject`, `missing_document_warehouse`). Svaki reject odmah emituje jedan `upload_rejected` JSON red sa opcionalnim `correlationId`, bez imena datoteke, korisničkih ID-jeva ili sadržaja fajla.
- `UploadRejectMetricsService` svakih 30 sekundi loguje agregirani `upload_reject_metrics` JSON događaj sa lifetime i interval brojačima, posljednjim razlogom i `reasons` nizom. Periodični izvještaj resetuje samo interval brojače; `warn` se aktivira kada broj odbijanja u intervalu dosegne privatnu postavku `upload.metrics.warn_reject_count` (default 10, validirani raspon 1–10000).
- `SettingsLimitedFileInterceptor` sada hvata Multer greške prije `next.handle()` i klasifikuje ih po HTTP statusu/sigurnom kodu, bez logovanja korisnički kontrolisane poruke. `UploadsService` i `WarehouseTransferTemplateService` bilježe svoje validacijske razloge prije nego bace postojeće `BadRequestException`/`ForbiddenException` poruke; cleanup greška potpisanog PDF-a je `upload_cleanup_failed` JSON događaj.
- 28 novih unit testova pokriva registry brojače i interval drain, klasifikaciju multipart grešaka, evaluaciju praga, servisne log signale, settings fallback i stvarne rejection puteve oba upload servisa. Nije potrebna nova PostgreSQL/Redis integracija jer se signal oslanja isključivo na procesne brojače. Hosted CI run `40465018093` je zelen na backend, frontend i document-worker jobovima; lokalno je potvrđeno 561/561 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### HTTP request latency/error-rate signal (P2 — implementation added)

- `HttpRequestMetricsRegistry` broji svaki završeni HTTP zahtjev u procesu: statusna klasa (2xx/3xx/4xx/5xx/other), metoda, normalizirana ruta, fiksni latencijski histogram (`le_25` … `le_5000`, `over_5000`) i lifetime/interval totali. `normalizeRequestRoute()` odbacuje query string, rediguje osjetljive tekstove i zamjenjuje UUID/numeričke/hex/opaque segmente, imena fajlova i preduge segmente sa `:id`/`:value`; broj različitih ruta ograničen je na 128, a višak ide u `/:other` uz `overflowRequests`. Health probe rute (`/health`, `/health/live`, `/health/ready`, sa ili bez API prefixa) se ne broje da njihov 503 saobraćaj ne bi kvario stopu grešaka.
- Postojeći `correlationIdMiddleware` sada uz `http_request` log dodaje `route` (normaliziran, bez korisničkih ID-jeva) i na `res.finish` poziva recorder. Greška recordera nikad ne sprječava request log; bilježi se `http_request_metrics_record_failed`. `main.ts` i dalje koristi isti middleware, pa su sve rute pokrivene bez nove DI infrastrukture.
- `HttpRequestMetricsService` svakih 30 sekundi emituje jedan `http_request_metrics` JSON red sa interval/lifetime brojačima, prosječnom i maksimalnom latencijom, histogramskim `p95DurationMs`, stopom 5xx i 4xx, top rutama po broju zahtjeva i po 5xx greškama, te `reasons` nizom. `warn` se aktivira na apsolutni broj 5xx, stopu 5xx iznad praga (uz minimalan uzorak) ili p95 iznad praga. Periodični izvještaj resetuje samo interval brojače; greška settings store-a se bilježi kao `http_metrics_setting_fallback` bez tajni.
- Dodane su privatne postavke `http.metrics.warn_error_rate_percent` (5), `http.metrics.warn_p95_ms` (1000), `http.metrics.warn_5xx_count` (5) i `http.metrics.min_request_count` (20), svaka s validiranim rasponom i UI detaljima. Nevažeće/nedostupne vrijednosti padaju na sigurne default-e; `HttpRouteMetrics` ne sadrži query vrijednosti, tijela, headere ni korisničke ID-jeve.
- 13 unit testova pokriva normalizaciju ruta, klasifikaciju statusa, bounded kardinalnost, histogram/p95, interval drain, sanity malformiranih vrijednosti i izostavljanje health proba; 8 testova pokriva čistu evaluaciju pragova; 8 testova pokriva servisne signale, konfiguraciju, fallback, overlap guard i redakciju grešaka; 3 nova middleware testa potvrđuju `route` polje, otpornost na grešku recordera i stvarno povezivanje default middlewara sa registry-jem. Nova CI provjera `test:integration:http-request-metrics` pokreće pravi middleware (bez pokretanja Nest aplikacije), pravi `HttpRequestMetricsService` i `SETTINGS_REGISTRY`, te potvrđuje `warn` signal, p95=5000 ms, 95% 5xx i odsustvo tokena/UUID-a u log liniji; ne zahtijeva PostgreSQL/Redis. Hosted CI run `40469547725` je zelen na backend, frontend i document-worker jobovima, uključujući novi korak `Verify HTTP request latency/error metrics`; lokalno je potvrđeno 593/593 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### Inventory close job age/status signal (P2 — implementation added)

- `InventoryCloseMetricsService` svakih 30 sekundi čita isključivo agregirane DB podatke iz `InventorySessionCloseJob`: jedan `groupBy` po statusu sa `_count` i `_min(createdAt, startedAt, updatedAt)`, plus jedan `count` running poslova sa isteklim `leaseUntil`. Ne čitaju se `sessionId`, `lastError`, korisnički ID-jevi ni inventurne linije; greška upita se loguje kao redigovani `inventory_close_job_metrics_error`.
- JSON događaj `inventory_close_job_metrics` nosi `queued`, `running`, `failed`, `done`, `pending`, `expiredLeaseCount`, starost najstarijeg queued/running/failed posla, pragove i `reasons` niz. `warn` se aktivira na `pending_backlog`, `queued_age`, `running_age`, `expired_lease` (bilo koji istekli lease) i `failed_age` (neriješen failed posao kojem treba ručni administratorski retry). Signal prati trenutno DB stanje — popravka lease-a i opuštanje pragova daju ponovo tihi `log` izvještaj.
- BullMQ `bullmq_queue_metrics` i dalje mjeri dubinu reda, a ovaj signal pokriva drugačiji kvar: posao koji u bazi ostaje `queued`/`running`/`failed` iako u redu više nije vidljiv. Time je zatvorena preostala stavka „inventory close age/status“ iz health/observability plana.
- Dodane su privatne postavke `inventory.close.metrics.warn_pending_count` (10), `warn_queued_age_seconds` (300), `warn_running_age_seconds` (1800) i `warn_failed_age_seconds` (300), svaka s validiranim rasponom i UI detaljima. Nevažeće/nedostupne postavke padaju na default uz `inventory_close_metrics_setting_fallback` bez tajni.
- Čista util funkcija `buildInventoryCloseMetricsSnapshot()` izračunava brojače i starosti (sa sigurnim fallbackom za null/invalidne timestamp-e), a `evaluateInventoryCloseMetrics()` daje stabilan redoslijed razloga. 17 unit testova pokriva izračun, evaluaciju, mapiranje `groupBy` rezultata, servisne signale, settings/DB fallback, overlap guard i redakciju. Nova PostgreSQL integracija `test:integration:inventory-close-metrics` kreira 14 stvarnih close jobova (10 queued, 2 running sa jednim isteklim lease-om, 1 failed, 1 done), potvrđuje `warn` sa svih pet razloga, zatim popravlja lease i potvrđuje tihi signal, te provjerava konfiguraciju u `HealthModule` i settings registry-ju. Hosted CI run `40472185008` je zelen na backend, frontend i document-worker jobovima, uključujući novi korak `Verify inventory close job age/status metrics` nad stvarnom PostgreSQL bazom; lokalno je potvrđeno 610/610 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### Rate-limit decision/outage metrics signal (P2 — implementation added)

- `RedisRateLimitGuard` sada bilježi svaku odluku (`allowed`, `exceeded`, `fail_open`, `fail_closed`) u `RateLimitMetricsRegistry`. Registry drži samo tri ograničena labela: normalizirano ime politike (`login`, `public_equipment`, najviše 16 različitih uz `/:other` overflow), ishod i kategoriju kvara (`timeout`, `connection`, `invalid_counter`, `unknown`). Klijentske IP adrese, Redis ključevi i sirove poruke grešaka se ne pohranjuju.
- Dvije legacy free-form poruke guarda zamijenjene su jednim strukturiranim `rate_limit_check_failed` JSON redom (`policy`, `mode`, `reason`, redigovan `error`) na `warn` za fail-open i `error` za fail-closed. `sanitizeRateLimitError()` uklanja lozinke/tokene, IPv4 adrese, `ratelimit:` ključeve i ograničava poruku na 200 znakova. Greška recordera nikad ne mijenja allow/deny odluku (`rate_limit_metrics_record_failed`). `policyName` je eksplicitno dodan u `RedisRateLimitPolicy`, a `main.ts` i dalje postavlja `trust proxy` koji guard koristi za IP.
- Registry prati i `consecutiveFailures`/`maxConsecutiveFailures`: jedna uspješna Redis provjera resetuje niz, pa `sustained_outage` ne ostaje zakačen nakon oporavka. `consumeSnapshot()` resetuje samo interval; lifetime totali i trenutni niz ostaju vidljivi.
- `RateLimitMetricsService` svakih 30 sekundi emituje `rate_limit_metrics` sa interval/lifetime brojačima, `reasons` nizom i pragovima. `fail_closed` upozorava na svako odbijanje legitimnog zahtjeva; `sustained_outage`, `fail_open_burst` i `exceeded_burst` su pragovni. Privatne postavke: `rate_limit.metrics.warn_fail_open_count` (5), `warn_consecutive_failures` (3), `warn_exceeded_count` (25), svaka s validiranim rasponom i UI detaljima; nevažeće/nedostupne vrijednosti padaju na default uz `rate_limit_metrics_setting_fallback`.
- 31 novi unit test pokriva normalizaciju labela, klasifikaciju i redakciju grešaka, bounded kardinalnost, interval drain i niz uzastopnih kvarova, čistu evaluaciju pragova, servisne signale/fallback/overlap zaštitu, te stvarne guard puteve (429 bez logovanja po zahtjevu, fail-open/fail-closed JSON linije, zasebna politika javnog QR-a i oporavak niza). Nova CI provjera `test:integration:rate-limit-metrics` koristi stvarni ioredis klijent i `RedisService` Lua brojač za allowed/429 put, stubirani Redis kvar za fail-open/fail-closed, zatim pravi servisni `warn` izvještaj i tihi izvještaj nakon uspješne provjere; potvrđuje i settings registry, `HealthModule`, `trust proxy` i odsustvo `String(err)` u guardu. Hosted CI run `40478241036` je zelen na backend, frontend i document-worker jobovima, uključujući novi korak `Verify rate-limit decision/outage metrics` nad stvarnim Redis servisom; lokalno je potvrđeno 641/641 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### Business state-transition metrics signal (P2 — implementation added)

- `BusinessTransitionMetricsRegistry` broji pokušaje conditional `updateMany where status=...` write-ova: `applied` (predikat je pogodio tačno jedan red) ili `rejected` (stale/dupli pokušaj). Čuva se samo ograničen skup labela — operacija (najviše 24 uz `other` overflow), par `from->to` statusa (najviše 64), ishod i terminalni rezultat (`done`/`failed`). Nikakvi entity ID-jevi, korisnički ID-jevi, poruke grešaka ni poslovni payload-i se ne pohranjuju. Terminalni brojači rastu samo za `applied` tranzicije.
- Devet stvarnih compare-and-set tačaka je instrumentirano preko `recordConditionalTransition()`: `transfer_open_status`, `installed_part_status`, `disposal_approval_review`, `stock_lot_decrement`, `stock_lot_fifo_consume`, `document_job_running`, `document_job_terminal`, `notification_outbox_claim` i `inventory_close_claim`. `readTransitionTargetStatus()` iz Prisma update payload-a uzima samo običan string `status`; složeni `{ set: ... }` objekti se prijavljuju kao `unknown`. Recorder nikad ne baca grešku, pa ne može uticati na poslovnu transakciju.
- Registry prati i `consecutiveRejections` / `maxConsecutiveRejections` (resetuje ih prvi uspješan write), `lastRejectedOperation` i vrijeme od posljednjeg odbijanja — to otkriva race/double-submit i retry oluje, ne samo ukupan broj. Napomena: brojač se bilježi u trenutku conditional write-a unutar DB transakcije, pa rollback može ostaviti mali višak u `applied`; signal treba čitati kao broj **pokušaja** tranzicije.
- `BusinessTransitionMetricsService` svakih 30 sekundi emituje `business_state_transition_metrics` sa interval/lifetime brojačima, `rejectedRatePercent`, terminalnim ishodima, `byOperation`/`byTransition`, pragovima i `reasons` (`terminal_failures`, `rejected_burst`, `rejected_rate`). Četiri nove privatne postavke: `business.metrics.warn_rejected_count` (20), `warn_rejected_rate_percent` (10), `warn_failed_terminal_count` (10) i `min_transition_count` (20), svaka s validiranim rasponom i UI detaljima; nevažeće/nedostupne vrijednosti padaju na default uz `business_transition_metrics_setting_fallback`.
- 31 novi unit test pokriva normalizaciju labela, čitanje ciljnog statusa, bounded kardinalnost, terminalne brojače, niz odbijanja, interval drain, čistu evaluaciju pragova, servisne signale/fallback/overlap zaštitu i stvarno povezivanje u 5 domena (transfer, disposal approval, installed part, stock lot FIFO, DocumentJob). Nova CI provjera `test:integration:business-transition-metrics` pokreće prave util funkcije i `DocumentJobsService`, zatim servisni `warn` izvještaj i tihi izvještaj nakon uspješnog write-a, te potvrđuje 9 instrumentiranih tačaka, `HealthModule` i settings default-e bez vanjskih servisa. Hosted CI run `40486439959` je zelen na backend, frontend i document-worker jobovima, uključujući novi korak `Verify business state-transition metrics`; lokalno je potvrđeno 678/678 backend unit testova, 14 FE guard testova, lint, typecheck i build.

#### Structured operational logs (P2 — implementation added)

- Novi `logStructuredEvent(logger, level, payload)` helper koristi `formatStructuredLogLine` (jedan red JSON-a, autoritativni `level`, redakcija) i prosljeđuje liniju kroz Nest `Logger`, pa `CorrelationLogger` dodaje `correlationId`. `safeErrorText()` ograničava sirovu poruku greške na 500 znakova. `StructuredLogLevel` sada uključuje `debug`, a `writeStructuredLog('debug', …)` ide na stdout kao i `log`.
- Svih **52 preostalih free-form `logger.*(\`…\`)` / `logger.*('…')` poziva** u `backend/src` prebačeno je u strukturirane događaje sa stabilnim `event` imenom i sigurnim poljima. Obuhvaćeni su: bootstrap konfiguracija, refresh-token cleanup, Socket.IO Redis adapter, notification outbox relay/metrics, DocumentJob QueueEvents/reconcile/enqueue/retry, inventory close enqueue/worker/reconciler, inventory scheduler (lock, timezone, draft/auto-activate), setup cache invalidacija, transfer DOCX/PDF generacija i notifications gateway. Umjesto slobodnog teksta sa `String(error)` sada se šalju npr. `document_job_enqueue_failed`, `inventory_close_reconcile_enqueue_failed`, `transfer_docx_generation_failed`, `notification_outbox_delivery_failed`. Imena organizacionih jedinica i sesija zamijenjena su internim ID poljima; korisnički ID ostaje samo u WebSocket debug događajima.
- Ispravljen je i propust u `redactSensitiveText`: `PLAIN_SECRET_ASSIGNMENT` sada prepoznaje `password=`/`token=` i kada se nalazi unutar već serijalizovanog JSON stringa (iza navodnika, zagrade ili razmaka). Ranije bi poruka `{"error":"password=ci-secret"}` ostala neredigovana. Dodan je regression test koji parsira redigovani JSON i potvrđuje da tajna nije prošla.
- `notification-outbox-metrics.service.spec.ts` ažuriran je da umjesto `/collection failed/` tvrdi `event: 'notification_outbox_collection_failed'` i `level: 'error'`.
- 6 unit testova pokriva helper (rutiranje po nivoima, redakciju svih polja, fallback kada logger nema `debug`, cirkularni payload) plus 2 nova testna slučaja u postojećim logging specovima. Nova CI provjera `test:integration:structured-logs` statički skenira 363 izvorna fajla: zabranjuje free-form literal logger pozive i `${String(...)}` interpolacije, provjerava da svaki od 52 `logStructuredEvent` poziva ima `event`, te runtime pokreće pravi `InventorySessionCloseReconcilerService` sa DB/enqueue greškama i potvrđuje jedan parsabilan, redigovan JSON red po grešci. Hosted CI run `40481512849` je zelen na backend, frontend i document-worker jobovima, uključujući novi korak `Verify structured operational logs`; lokalno je potvrđeno 647/647 backend unit testova, 14 FE guard testova, lint, typecheck i build.

- Razdvojiti liveness (proces/event loop) i readiness (zavisnosti potrebne za prijem saobraćaja).
- Odrediti šta se smatra obaveznim za readiness: DB svakako; Redis/queue prema degradacijskom ugovoru pojedinih funkcija. Ne označavati cijeli servis unhealthy zbog opcionalnog feature-a ako aplikacija može sigurno degradirati.
- Health/observability talas je sada kompletan: svi legacy free-form logovi u `backend/src` su strukturirani JSON (CI provjera sprječava povratak); `CorrelationLogger` i `writeStructuredLog` dijele istu redakciju. Pokriveni signali: notification outbox backlog/age, BullMQ queue depth/lag, inventory close age/status, business state-transitioni (applied/rejected/terminalni ishodi), rate-limit odluke/kvarovi, PostgreSQL pool/latency, Redis ready/reconnect/PING, upload reject counts, osnovni HTTP request log i agregirana HTTP latencija/stopa grešaka. Preostali posao je izvan observabilityja (deployment TLS/ACL/proxy potvrde, dependency održavanje i odluke vlasnika procesa).
- Javne error poruke ostaju stabilan code/message; interni logovi imaju correlation ID i redigovan razlog. `CorrelationLogger` sada prepoznaje JSON događaje i dodaje im autoritativna `correlationId`/`level` polja umjesto `[cid=...]` prefiksa; Redis lifecycle, cache/lock upozorenja i upload rejection/cleanup događaji su već strukturirani JSON. Preostaje postepeno prebaciti preostale legacy free-form logove u potpuno strukturirani JSON format.

### 5.3 CI/release gate

Obavezni pipeline prije release-a:

1. `npm ci` iz lockfile-a.
2. Backend unit tests.
3. Postgres integration suite na čisto migriranoj bazi.
4. API/e2e auth-scope-DTO testovi.
5. Redis/BullMQ recovery integration tests za kritične jobove.
6. Backend i document-worker build.
7. `npm audit`/advisory review uz documented exceptions.
8. `prisma migrate deploy` rehearsal i schema drift test.

**Prihvatanje:** release se blokira na regresiji P1, migracijskom drift-u, scope/auth test failure-u, build failure-u ili neodobrenom critical/high runtime advisory-u.

## 9. Talas 6 — refaktor i performanse

Refaktor se radi tek poslije testova koji fiksiraju ponašanje.

### Predloženi red

1. `InventoryCountService`: odvojiti session lifecycle, committee workflow, disposal, pending actions i worker orchestration.
2. `TransfersService`: odvojiti policy/scope, status transition, numbering/document side effects i read/report query.
3. `WarehouseStockService` i `MaintenancePartsService`: lot accounting/use-case boundaries.
4. `EmployeeRelocationService`: preview/read model, case lifecycle i inventory/notification side effects.
5. `EquipmentService`/`NotificationsService`: query/export/recipient resolution i persistent delivery.

### Pravila za svaki refaktor

- Prvo characterization tests za postojeće očekivano ponašanje.
- Refaktor bez promjene API response/statusa/poslovnog pravila u istom PR-u.
- Mjeriti SQL query count i p95 na reprezentativnom dataset-u prije/poslije.
- Rješavati N+1 samo uz dokaz da utiče na kritični tok; uvesti batch query i sačuvati scope filter.
- Provjeriti Postgres pool budžet: broj replika × `DATABASE_POOL_MAX` + worker, migracije i maintenance procesi; `postgres_pool_latency` signal prati stvarnu iskorištenost nakon deploya.
- Uklanjati circular module dependency (`Settings ↔ Notifications`) tek uz jasan port/event contract.

**Prihvatanje:** javni API i poslovni ishodi ostaju isti; testovi prolaze; izmjerena performansa se ne pogoršava i ciljani query/latency budžet je zabilježen.

## 10. Za svaki implementacijski paket

Svaki PR/izdanje treba sadržavati:

- **Problem i referencu:** audit nalaz, konkretna putanja i reprodukcijski korak.
- **Očekivano ponašanje:** pravilo prije koda, posebno za djelimične greške i retry.
- **Testovi:** unit za čistu logiku, integration za DB/Redis, e2e za HTTP/role scope, race/fault-injection za konkurentne tokove.
- **Operativni uticaj:** migracije, env varijable/secrets, filesystem/queue zahtjevi, rollout redoslijed.
- **Rollback:** može li se vratiti samo app kod; treba li unaprijed kompatibilna migracija; kako oporaviti queued jobs/orphan fajlove.
- **Metrika i alert:** kako će se potvrditi da je fix aktivan i kako otkriti regresiju.
- **Korisnički uticaj:** promjena poruke, statusa, javnih podataka, limita ili retry ponašanja mora biti navedena.

## 11. Završni kriteriji za zatvaranje backend audita

Backend audit se može označiti kao implementiran kada su ispunjeni svi sljedeći uslovi ili je preostali rizik formalno prihvaćen:

- Critical/high runtime dependency nalazi riješeni ili dokumentovani sa vlasnikom i rokom.
- Upload veličina/sadržaj ograničeni prije parsiranja; storage ima cleanup/reconciliation.
- HTML/CSV output ne izvršava markup/formule iz poslovnih podataka.
- Setup, user assignment i refresh rotacija imaju atomarnost i race testove.
- Inventory close/critical queue poslovi imaju idempotency, retry/reconciliation i fault-injection dokaz.
- Kritični stock, transfer i inventory state transitions su conditional/transactional i testirani konkurentno.
- Public QR contract ima privatnosnu odluku, limit i rate-control.
- CORS, trust proxy, PostgreSQL TLS/CA, Redis TLS/ACL potvrđeni u staging/deployment konfiguraciji.
- CI izvršava unit + integration + e2e/scope + build + migration provjere; migration README je tačan.
- Health/telemetry mogu otkriti DB/queue/upload/state probleme bez izlaganja tajni/PII.
- Promjene velikih servisa imaju characterization tests i mjerljive performansne kriterije.

## 12. Odluke koje traže vlasnika poslovnog procesa

Prije implementacije ovih tačaka tražiti izričitu potvrdu:

> **Status 2026-10-27:** preostale deployment stavke (CA/SAN, live ACL, proxy
> lanac, staging p95 load test) vlasnik je preuzeo; u repou su zatvorene kao
> delegirane i provjerljive kroz `scripts/check-deployment-readiness.mjs`.
> Neovisni code-only audit: `docs/backend-code-audit-2026-10-27.md`, ocjena
> **8.1/10**. Kodna strana audita je završena; preostali nalazi N-5…N-15 su
> ocijenjeni i rangirani u §0.18.

1. **Riješeno:** inventurna sesija se zatvara i uz pending-action greške; svaka trajna/neispravljiva greška ostaje evidentirana kao failed.
2. Koji podaci i koliko historije treba javni QR prikazati neautentifikovanom korisniku?
3. Koje su maksimalne legitimne PDF/DOCX veličine i šta korisnik treba vidjeti pri odbijanju?
4. **Riješeno za transfer i inventory close:** korisnik odabrao trajni outbox za notification događaje, uz Socket.IO kao ponovljiv signal; transfer DOCX/PDF dokumentacijski rad ima trajni status i zaseban retry, a transfer poslovni commit pobjeđuje naknadni document/notification kvar.
5. **Riješeno:** automatski retry je ograničen na allowlistu prolaznih grešaka (maksimum 3 pokušaja, 250/500 ms backoff); ručni retry close joba dozvoljen je samo administratoru, traži razlog i audit zapis, i ne može ponovo otvoriti zatvorenu sesiju.
6. Koje vrijeme (timezone) je autoritativno za automatsko otvaranje/zatvaranje inventurnih perioda?
7. Koji je dozvoljeni recovery prozor za deaktiviran korisnički pristup preko postojećih WS konekcija i tokena?
