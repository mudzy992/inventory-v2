# Load-test harness i p95 SLO gate

## Zašto

U prethodnom auditu `docs/backend-code-audit-2026-10-27.md` performanse su bile
potvrđene samo statičkim budžetima (`docs/performance-budgets.md`): broj
upita, veličina batcha i capovi. To ne dokazuje p95 latenciju pod stvarnim
konkurentnim opterećenjem. Vlasnik i dalje izvodi **pravi staging p95 test na
produkcijski velikom datasetu** — sandbox ne može simulirati bazu, Redis ACL i
mrežu produkcije — ali sada su **harness, pragovi i matematika** u repozitoriju
i pod CI dokazom umjesto u nečijoj lokalnoj skripti.

## Alat

`scripts/load-test.mjs` je dependency-free (samo `node:` builtins + `fetch`,
Node 22). Pokreće fiksni broj konkurentnih workera kroz fiksno trajanje, mjeri
latenciju svakog zahtjeva, broji transportne greške i ne-2xx odgovore, računa
p50/p95/p99 i error rate, te odlučuje o SLO.

```bash
node scripts/load-test.mjs \
  --base-url https://staging.example \
  --endpoint /health \
  --duration 30 \
  --concurrency 20 \
  --p95-ms 500 \
  --error-rate 0.01 \
  --json /tmp/staging-p95.json
```

Izlazni kod `1` = SLO prekršen (ili nema uzoraka), pa se skripta može staviti
direktno u release pipeline. `--json` piše mašinski čitljiv izvještaj
(`report`, `slo`, `generatedAt`) koji treba arhivirati uz deployment zapis.

### Defaulti

| Parametar | Default | Napomena |
| --- | --- | --- |
| `--endpoint` | `/health` | Javni, read-only endpoint; ne koristiti write rute za smoke load. |
| `--duration` | `30` s | Kratko za smoke; vlasnik koristi duže za staging. |
| `--concurrency` | `20` | Broj istovremenih workera. |
| `--timeout-ms` | `5000` | Per-request `AbortSignal.timeout`. |
| `--p95-ms` | `500` | p95 budžet. |
| `--error-rate` | `0.01` | 1% dozvoljenih grešaka. |

`evaluateSlo()` odbija i run bez uzoraka (`minSamples >= 1`) — inače bi prazan
test lažno prošao. `latencies` sadrže samo uspješne uzorke; neuspjeli pokušaji
ulaze u `failures`, tako da je `errorRate = failures / (ok + failures)`.

## CI dokaz

`Verify staging load-test harness` u `.github/workflows/ci.yml` pokreće
`node --test scripts/load-test.spec.mjs`. Spec pokreće lokalni `node:http`
server i provjerava:

1. nearest-rank percentile (uključujući prazan uzorak),
2. `buildReport` p50/p95/p99/max + error rate,
3. prolaz i tri nezavisna načina pada SLO gate-a (p95, error rate, nula uzoraka),
4. stvarni HTTP load protiv lokalnog servera (200),
5. da se 503 odgovori broje kao SLO greške,
6. da se neispravna konfiguracija odbije prije ikakvog mrežnog I/O-a.

Time je **matematika i ponašanje gate-a** pokriveno testovima; stvarni staging
brojevi ostaju operaterski korak.

## Operaterski korak (vlasnik)

1. Postaviti staging na produkcijsku veličinu podataka, sa TLS-om na
   PostgreSQL i Redis (vlasnik je potvrdio da je TLS aktivan).
2. Pokrenuti gornju komandu s realnim `--duration`/`--concurrency` i
   arhivirati `--json` izvještaj.
3. Ako `SLO: FAIL`, prvo provjeriti `TRUST_PROXY_HOPS` (pogrešan broj hopova
   sve zahtjeve svodi na jednu rate-limit bucket IP adresu), zatim pool budžet
   (`replicas × DATABASE_POOL_MAX + 4`) i Redis ACL latenciju.
4. Za write-intenzivne scenarije koristiti zaseban staging token i nikad ne
   pokretati load test protiv produkcije.

## Povezano

- `docs/performance-budgets.md` — statički query/batch/cap budžeti.
- `docs/deployment-readiness.md` — `trust-proxy-hops`, `pool-budget`,
  `security-headers`, TLS i ACL provjere.
- `docs/backend-code-audit-2026-10-27.md` — nalaz zbog kojeg je harness dodan.
