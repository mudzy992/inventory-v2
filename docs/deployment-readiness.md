# Deployment readiness — jedna provjera za sve preostale stavke

Prethodni audit paketi (Redis/PostgreSQL TLS, Redis ACL, Socket.IO adapter,
auth revocation, javni QR, upload read policy, HTTP hardening) su kodno
zatvoreni, ali svaki je ostavio mali **deployment rep**: stvarni CA fajl,
podudarnost certifikata sa hostname-om, ACL korisnik, proxy/CORS, tajne,
replike, cap-ovi. Ovaj dokument i alat
`scripts/check-deployment-readiness.mjs` pretvaraju taj rep u jedan izvršiv
izvještaj.

Alat koristi samo `node:` builtine — može se pokrenuti prije `npm install`, u
CI-ju, ili direktno na serveru. **Nikad ne ispisuje vrijednosti tajni**, samo
PASS / WARN / FAIL i uputu za ispravku.

## Pokretanje

```sh
# 1) CI / repo politika — bez ikakvih tajni (provjerava compose, .env.example, docs)
node scripts/check-deployment-readiness.mjs

# 2) Na serveru — pročitaj stvarni .env i ocijeni ga
node scripts/check-deployment-readiness.mjs --env .env

# 3) Strogi režim: upozorenja (ručne provjere) tretiraj kao greške
node scripts/check-deployment-readiness.mjs --env .env --strict

# 4) Za automatizaciju / ticketing
node scripts/check-deployment-readiness.mjs --env .env --json > readiness.json
```

`--env` čita običan `.env` fajl (`KEY=value`, podržava `export`, navodnike i
komentare). Ne radi shell interpolaciju — ako koristiš Compose varijable,
proslijedi već razriješene vrijednosti ili pokreni prvo repo modu.

`--strict` je koristan kao release gate: tada i `MANUAL` provjere (koje alat ne
može izvršiti umjesto čovjeka) moraju biti potvrđene prije nego se prebace u
`pass` (npr. dodavanjem `BACKEND_REPLICAS=1` kada je zaista jedna replika).

## Šta se provjerava (repo moda)

- `.env.example` i `docker-compose.yml` sadrže svih 19 deployment varijabli.
- Oba compose fajla imaju sigurne default-e: `DATABASE_SSL_MODE=verify-full`,
  `GLOBAL_RATE_LIMIT_ENABLED=false`, `SECURITY_HEADERS_ENABLED=true`,
  `PUBLIC_EQUIPMENT_MAX_MOVEMENTS=200`, `SOCKETIO_REQUIRE_SHARED_ADAPTER=false`,
  `DATABASE_POOL_MAX=10`, te `NODE_ENV=production`.
- Oba compose fajla izlažu `REDIS_CA_CERT_PATH` i `DATABASE_SSL_CA`.
- Kanonski `deploy/redis/users.acl.example` ima `&<PREFIX>:*`, oba **egzaktna**
  `&<PREFIX>:#/#*` / `&<PREFIX>:#/notifications#*` granta i `+info`.
- Postoje svi operator guides (`redis-acl`, `http-hardening`,
  `public-qr-privacy`, `upload-read-policy`, `transfer-document-security`,
  `queue-recovery`, ovaj fajl).
- `REDIS_KEY_PREFIX` default se poklapa s ACL namespace-om.

## Šta se provjerava (`--env` moda)

| ID | Provjera |
|---|---|
| `node-env` | `NODE_ENV=production` (ako nije u fajlu, compose ga postavlja) |
| `jwt-secret` | `JWT_SECRET` ≥ 32 znaka, nije placeholder |
| `setup-token` | `SETUP_TOKEN` ≥ 16 znakova — javni `/setup/initialize` |
| `cors-origin` | eksplicitne HTTPS origin liste, bez `*`, putanje ili trailing slasha |
| `cors-frontend-match` | `VITE_APP_URL` origin je u `CORS_ORIGIN` |
| `db-ssl-mode` | `require` / `verify-ca` / `verify-full` (nikad `disable`) |
| `db-url-ssl-conflict` | `sslmode` u `DATABASE_URL` ne smije biti u konfliktu (app fail-closed) |
| `db-ca-mount` | `DATABASE_SSL_CA` apsolutni put ispod `/run/secrets/` ili `/etc/ssl/` |
| `db-cert-san` | **MANUAL:** SAN certifikata odgovara `DATABASE_HOST` |
| `redis-tls` | uz `REDIS_TLS=true`: CA mount + DNS `REDIS_HOST` (SNI ne radi sa IP) |
| `redis-cert-san` | **MANUAL:** SAN certifikata odgovara `REDIS_HOST` |
| `redis-acl-prefix` | `REDIS_KEY_PREFIX` bez dvotačke |
| `redis-acl-channels` | **MANUAL:** `ACL GETUSER` ima glob + oba egzaktna `&` granta |
| `socketio-shared-adapter` | `BACKEND_REPLICAS > 1` zahtijeva `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` |
| `pool-budget` | `replicas × DATABASE_POOL_MAX + 4` ispod ~90 konekcija |
| `security-headers` | headeri nisu isključeni |
| `hsts` | `HSTS_MAX_AGE_SECONDS` 0–31 536 000 |
| `global-rate-limit` | granice 1–100 000 / 1–3600 s (uključeno je odluka vlasnika) |
| `global-rate-limit-fail-open` | upozorenje kad limit koristi fail-open |
| `public-qr-cap` | `PUBLIC_EQUIPMENT_MAX_MOVEMENTS` 1–1000 |
| `transfer-raw-disposition` | `TRANSFER_RAW_DOCUMENT_DISPOSITION` — `attachment` (pass) / `inline` (warn) / neispravno (fail) |
| `document-job-stale-bound` | `DOCUMENT_JOB_STALE_TIMEOUT_MS` (300000–86400000) mora biti > `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS` + 30 s |

## Kako riješiti MANUAL upozorenja

1. **PostgreSQL cert SAN** — `openssl s_client -starttls postgres -connect "$DATABASE_HOST:$DATABASE_PORT" -showcerts`, provjeriti `Subject Alternative Name`. Ako je privatni CA, montirati ga read-only i postaviti `DATABASE_SSL_CA`.
2. **Redis cert SAN** — isto za `REDIS_HOST:$REDIS_PORT` (TLS), uz `REDIS_CA_CERT_PATH` u oba kontejnera (backend + document-worker).
3. **ACL kanali** — `ACL GETUSER inventory-v2`; `channels` mora sadržavati `&inventory-v2:*`, `&inventory-v2:#/#*` i `&inventory-v2:#/notifications#*`. Kanonsko pravilo: `deploy/redis/users.acl.example`, vodič: `docs/redis-acl.md`.
4. **Replike** — postaviti `BACKEND_REPLICAS` u env-u koji prosljeđuješ alatu, pa `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` i istovremeni restart svih replika.
5. **Proxy lanac** — potvrditi da je pred backendom tačno jedan pouzdan proxy (`trust proxy = 1`); alat ne može vidjeti stvarnu mrežnu topologiju.

## CI

Korak `Verify deployment readiness contract` pokreće repo modu i
`scripts/check-deployment-readiness.spec.mjs` (unit scenarija za svako
pravilo). Tu je i `Verify queue recovery contract` koji održava matricu iz
`docs/queue-recovery.md`. Time se sprječava da neko slučajno promijeni sigurni default u
compose fajlu ili izbaci neki operator guide, a da CI ne javi.
