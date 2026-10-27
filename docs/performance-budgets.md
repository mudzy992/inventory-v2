# Performansni budžeti — mjerljivi kriteriji za čitanje i export

Posljednja stavka §11 audita traži „mjerljive performansne kriterije" za
velike servise. Umjesto flaky vremenskih pragova na dijeljenom CI runneru,
ugovor mjeri **jedinice posla**: broj DB upita, veličinu batcha, cap-ove i
gornje granice paginacije. To je deterministički i zato podobno za release
gate. Vrijeme se mjeri samo kao sekundarni, vrlo širok smoke signal.

Implementacija: `backend/src/common/performance/performance-budget.util.ts`
(budžeti + `QueryRecorder`), `backend/prisma/check-performance-budgets.ts`
(CI gate) i `backend/src/common/performance/performance-budget.util.spec.ts`.

## Budžeti

| Metrika | Vrijednost | Zašto |
|---|---|---|
| CSV export batch | **500** redova | `iterateCursorPages()` streama u cursor stranicama; nijedan upit ne smije vratiti cijelu tabelu |
| CSV export upiti za 1200 redova | **3** | `ceil(1200/500)` — dokaz da nema **N+1** obrasca |
| Maksimalna veličina stranice | **10 000** | `parsePagination()` + `lists.max_page_size` setting |
| Maksimalni OFFSET | **100 000** | duboka paginacija se odbija, ne pravi ogroman `skip` |
| Bulk stock receipt | **100** stavki | `@ArrayMaxSize(100)` u DTO-u |
| Javni QR historija | **200** default / **1000** hard cap | `PUBLIC_EQUIPMENT_MAX_MOVEMENTS` + `take` u Prisma include |
| Javni QR org-unit upiti | **≤ 20** | samo lanac predaka, nikad `orgUnit.findMany()` cijelog stabla |
| Javni QR ukupno upita | **≤ 25** | jedan equipment + settings + ≤ 20 org + disposal |
| List request upiti | **≤ 8** | 2 settinga + scope + findMany + count + batched disposal lookup |
| DocumentJob stale bound | **30 min** | mora biti > `DOCUMENT_WORKER_CONVERT_TIMEOUT_MS` (120 s) + 30 s lock slack |
| CSV escaping smoke | **2000 iteracija < 2000 ms** | vrlo širok **wall-clock** prag samo za katastrofalnu regresiju |

## Šta se provjerava

**Statički (izvorni kod):** `equipment.service.ts` koristi `iterateCursorPages`
sa 500; `cursor-pages.util.ts` odbija stranicu veću od `pageSize`;
`pagination.util.ts` ima `MAX_PAGE_OFFSET`; `public-equipment.service.ts`
koristi `take: this.movementLimit` i nema `orgUnit.findMany()`; javni QR
kontrakt ima hard cap 1000; bulk DTO ima `@ArrayMaxSize(100)`; settings
registry ima numeričke granice; `.env.example` dokumentuje sve timeout
varijable.

**Runtime (deterministički, bez baze):**

- 1200 sintetičkih redova kroz pravi `iterateCursorPages()` → tačno 3 upita,
  svaki `take = 500`, 1200 jedinstvenih redova bez duplikata.
- Simulirani list request → 6 upita (konstantno, ne zavisi od broja redova)
  unutar budžeta 8; `verifyQueryBudget()` odbija neograničen `findMany()` i
  `take > 10 000`.
- `parsePagination()` potvrđuje cap stranice i najdublji dozvoljeni offset.
- `QueryRecorder` broji upite po modelu/akciji i `maxTake()`.
- **wall-clock** smoke: 2000 `escapeCsvCell()` poziva; izmjereno vrijeme se
  ispisuje u izvještaju, a prag od 2000 ms postoji samo da uhvati katastrofalnu
  (npr. O(n²)) regresiju — ne kao mikro-benchmark.

**Unit scenarija (11):** konzistentnost budžeta, `QueryRecorder`,
`expectedCursorPageQueries`, `verifyQueryBudget`, `assertNoViolations`,
stvarni cursor paging 1200 redova, fail-closed na neispravan `pageSize`,
duboka paginacija, bulk DTO 100/101 stavka, javni QR sa 250 transfera (cap
200, ≤ 20 org upita, bez `findMany`, ≤ 25 ukupno), format izvještaja.

## Kako čitati neuspjeh

Ako `Verify performance budgets` padne, u logu je tabela:

```
Performance budgets: FAIL (5/6 within budget)
  [PASS] CSV export queries for 1200 rows: measured 3, budget 3
  [FAIL] list request DB queries: measured 9, budget 8
```

`[FAIL]` red kaže tačno koju jedinicu posla treba vratiti u okvire — to je
**query budget** (dozvoljeni broj aplikacijskih DB poziva po zahtjevu).
Obično je uzrok novi `findMany()` u petlji (N+1), uklonjeno `take`, ili
povećan cap.

## Ograničenja

- Ovo nije load test pod stvarnim saobraćajem. Ne mjeri se konkurentnost,
  latencija mreže ni PostgreSQL plan upita pod velikim datasetom. Za to je
  potreban zaseban staging test (preporuka: `k6`/`autocannon` protiv staging
  kopije sa realnim brojem redova).
- Wall-clock smoke namjerno nije tijesan: dijeljeni CI runneri variraju.
  Pravi SLO (npr. p95 < 300 ms za list) treba mjeriti u produkcijskim
  metrikama (`http_request_metrics`) koje već postoje.
- `QueryRecorder` mjeri instrumentisane pozive, ne sirove Postgres wire
  upite; Prisma može jedan `findMany` sa relacijama realizovati kroz više SQL
  upita. Budžet zato cilja na **broj aplikacijskih poziva**, što je dovoljno
  za otkrivanje N+1 regresija.
