# HTTP hardening — sigurnosni headeri i globalni rate limit

Implementacija: `backend/src/common/http/http-hardening.util.ts`, registrirano u
`backend/src/main.ts`. Namjerno **bez nove vanjske zavisnosti** — Helmet nije
uveden jer bi njegov default CSP slomio `text/html` prenosnicu sa inline
stilovima; umjesto toga je napravljen eksplicitan, reverzibilan policy sloj.

## Sigurnosni headeri (uključeno po defaultu)

| Header | Vrijednost |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `X-DNS-Prefetch-Control` | `off` |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), payment=()` |
| `Strict-Transport-Security` | `max-age=<HSTS_MAX_AGE_SECONDS>` — **samo** za HTTPS zahtjeve |
| `Cache-Control` / `Pragma` | `no-store` / `no-cache` na `/auth/*` i `/setup/*` |

`X-Powered-By` se uklanja (Express ga inače dodaje). Header se može potpuno
isključiti sa `SECURITY_HEADERS_ENABLED=false`, a HSTS sa
`HSTS_MAX_AGE_SECONDS=0` (0–31 536 000; default 15 552 000 = 180 dana).

**Globalni CSP se namjerno ne postavlja.** `buildTransferRawDocumentHtml()`
vraća `text/html` sa inline stilovima; globalna politika bi bila krhka. Umjesto
toga taj endpoint sada računa **vlastiti hash-based CSP + sandbox** iz stvarnog
`<style>` bloka (vidi `docs/transfer-document-security.md`), pa je ranija
odluka o CSP-ju zatvorena za tu površinu. `Cross-Origin-Resource-Policy` i
eventualni globalni CSP ostaju odluka vlasnika: API se poziva sa druge
subdomene, pa bi `same-origin` mogao blokirati legitimne `no-cors` resurse.

HSTS se šalje samo kad `X-Forwarded-Proto: https` (prva vrijednost) ili kada je
socket TLS — lokalni/plain-HTTP development nikad ne dobija browser pin koji se
ne može poništiti. Header se ne uključuje na `http://` čak i kad je policy
uključen.

## Globalni rate limit — **opt-in**

`GLOBAL_RATE_LIMIT_ENABLED=false` je default: uvođenje globalnog limita mijenja
ponašanje svih ruta i zato ostaje svjesna odluka vlasnika. Postojeći per-route
guardovi (login, javni QR) i dalje važe neovisno o ovoj opciji.

| Varijabla | Default | Opseg |
|---|---|---|
| `GLOBAL_RATE_LIMIT_ENABLED` | `false` | `true` / `false` |
| `GLOBAL_RATE_LIMIT_MAX` | `300` | 1 – 100 000 |
| `GLOBAL_RATE_LIMIT_WINDOW_SEC` | `60` | 1 – 3600 |
| `GLOBAL_RATE_LIMIT_FAIL_CLOSED` | `false` | `true` / `false` |

- Brojač je isti atomarni Lua `INCR` + `EXPIRE` iz
  `RedisService.incrementRateLimitCounter()`; nema race prozora između brojača i
  TTL-a. Ključ je SHA-256 hash klijentskog IP-a (nikad se IP ne sprema u Redis
  ključ ni u logove).
- `/health` i sve `/health/*` rute (liveness/readiness) su **uvijek izuzete** —
  Coolify healthcheck ne smije biti blokiran.
- Odgovor na prekoračenje: `429` + `Retry-After`, `RateLimit-Limit` i
  `RateLimit-Remaining` headeri. Odluke se bilježe u postojeći
  `rate_limit_metrics` registar pod politikom `global_http` (bez IP-ova).
- Ako Redis padne: `false` = **fail-open** (propusti zahtjev, dostupnost ispred
  zaštite), `true` = **fail-closed** (`503`). Greška se loguje kao strukturirani
  `global_rate_limit_check_failed` sa klasificiranim, redigovanim razlogom.

Sve env varijable su u `.env.example`, `docker-compose.yml` i
`docker-compose.prod.yml`. Pri startu se loguje `http_hardening_config` sa
efektivnim vrijednostima (bez tajni).

## Dokazi

- 11 unit scenarija: strogo parsiranje svih granica, izostanak CSP/CORP,
  HSTS samo uz HTTPS, `health` izuzeća, `no-store` putevi, hashirani ključevi,
  `429` + `Retry-After`, `503`/propust kod Redis kvara.
- `backend/prisma/check-http-hardening.ts` pokreće **pravi `node:http` server**
  sa oba middleware-a preko `fetch()` i potvrđuje headere, izostanak
  `X-Powered-By`, HSTS uslov, health izuzeće, 429 prag, no-store i
  fail-open/fail-closed ponašanje; uz statički gate nad `main.ts`, env,
  compose i ovim vodičem. CI korak: `Verify HTTP hardening policy`.

## Preostale odluke vlasnika

- ~~CSP strategija za generirani HTML dokument~~ **(zatvoreno: hash-based CSP +
  sandbox + attachment u `docs/transfer-document-security.md`)**; eventualni
  globalni CSP i `Cross-Origin-Resource-Policy` i dalje ostaju otvoreni.
- Hoće li se `GLOBAL_RATE_LIMIT_ENABLED` uključiti u produkciji i s kojim
  pragom (preporuka: početi sa 300/60 s i pratiti `rate_limit_metrics`).
- `GLOBAL_RATE_LIMIT_FAIL_CLOSED=true` samo ako je dostupnost žrtvovana zarad
  zaštite pri Redism outage-u.
