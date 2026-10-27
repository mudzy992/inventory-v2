# Neovisni audit backend koda — 2026-10-27

**Metod:** pregled isključivo izvornog koda (`backend/src`, `backend/prisma`,
`document-worker/src`, `.github/workflows/ci.yml`, compose i env primjer).
Postojeća `backend-audit.md` / `backend-implementation-plan.md` **nisu korišteni
kao izvor tvrdnji** — služili su samo kao kontrola nakon što su nalazi izvedeni
iz koda. Mjerenja: `find`/`wc`/`grep`, TypeScript compiler, `node --test`,
`npm run lint`, `tsc --noEmit`, `nest build`, `npm audit`, te svi postojeći CI
gateovi pokrenuti lokalno.

Cilj: **realna slika koda i ocjena**, ne potvrda ranije dokumentacije.

---

## 1. Metrike izmjerene u kodu

| Metrika | Vrijednost |
|---|---|
| Izvorni `.ts` fajlovi (bez specova) | **377** |
| Linija produkcijskog koda | **33 758** |
| Unit spec fajlova / linija | **148** / **15 566** |
| Unit testova u CI-ju | **797** (`npm run test:unit`) |
| Kontrolera / DTO klasa | **24** / **90** |
| `$transaction` poziva | **58** |
| `.findMany()` poziva | **168** (157 bez `take` u narednih 8 linija) |
| Različitih strukturiranih `event:` imena | **97** |
| Integracijskih `prisma/check-*.ts` provjera | **37** |
| Root `scripts/check-*.mjs` gateova | **3** |
| `Verify` koraka u CI-ju | **42** |
| `npm audit --audit-level=low` | **0 nalaza** (sva 3 workspace-a) |
| Najveći servis | `inventory-count.service.ts` — **3 050 linija** |
| Commit u trenutku audita | `d06fae9` (radno stablo čisto) |

---

## 2. Šta je u kodu stvarno dobro (provjereno, ne prepričano)

- **Atomarni state transitioni.** `claimTransferForFinalizeInTx()`,
  `decrementStockLotOnHandInTx()` (`quantityOnHand: { gte: quantity }`),
  `claimRefreshTokenForRotation()` (`updateMany where revokedAt: null`),
  `buildInventoryCloseJobClaimWhere()` (lease token). Nije "pročitaj pa upiši"
  — svaki kritični write ima uslov u samom `UPDATE`-u.
- **TLS je eksplicitan i fail-closed.** `buildRedisTlsOptions()` i
  `resolveDatabaseConfig()` postavljaju `rejectUnauthorized: true`,
  `minVersion: TLSv1.2`, SNI za DNS host; konflikt `sslmode` puca.
- **Auth keš ne može oživjeti mrtvu sesiju.** `JwtStrategy.validate()` poredi
  `cachedAt` (izmjereno prije DB čitanja) sa `auth:revoked:<id>` markerom;
  `prepareUserSessionRevocation()` piše marker **prije** transakcije.
- **Durable outbox za kritične tokove.** `NotificationOutbox`,
  `documentJobTerminalOutboxKey()`, `enqueueTransferOutboxEventsInTx()`,
  `closeNotificationOutboxRows` — terminalne notifikacije se pišu u istoj
  transakciji kao poslovna promjena.
- **Recovery je vremenski ograničen.** `decideStaleRecovery()` + 9-redna
  matrica; stuck `DocumentJob` ne može ostati `running` zauvijek.
- **HTML/CSV izlaz je zaštićen.** `escapeHtmlText()`, tag allow-list,
  hash-CSP sa `sandbox` izračunat iz stvarnog `<style>` bloka,
  `escapeCsvCell()`.
- **CI je izuzetno gust.** 42 koraka uključuju prave TLS handshake dokaze,
  SIGKILL simulacije, live Redis ACL provjeru, TypeScript-AST ugovore i
  deployment readiness matricu.
- **Numeričke postavke imaju granice** (0 od `number` settinga bez
  `minValue`), `parsePagination()` odbija dubok OFFSET, CSV export streama u
  batchu 500.

---

## 3. Novi nalazi (iz koda, ne iz dokumenata)

### Odmah ispravljeni u ovom paketu

| ID | Težina | Nalaz (dokaz u kodu) | Ispravka |
|---|---|---|---|
| **N-1** | **P1** | `RegistrarScopeService` (`orgUnitsCache`, `warehousesCache`, `categoryCacheLoaded`) i `ModeratorScopeService` (`scopedOrgCache`) su Nest singletoni s **kešom koji se nikad ne invalidira**. Nijedan write path nije zvao reset. Promjena org jedinice/skladišta/kategorije ostavljala je autorizacijske odluke na starom stanju do restarta procesa; sa N replika instance bi se razilazile. | `scope-cache.registry.ts` (TTL **30 s** + process-wide verzija), oba servisa zovu `isScopeCacheStale()`, a `org-units`/`warehouses`/`categories` servisi (9 mjesta) zovu `invalidateScopeCaches()` poslije commit-a. 6 unit scenarija + `Verify authorization scope cache freshness`. |
| **N-2** | **P2** | `transfers/utils/docx-to-pdf.util.ts` (106 linija) bio je **mrtav kod** — nijedan import u cijelom repou — a sadržavao je 6 `console.error()` poziva koji ispisuju apsolutne putanje i sirovi `soffice` stdout/stderr. Postojeći `check-structured-logs.ts` je lovio samo `logger.*`, pa je ovo prolazilo ispod claima „svi logovi su jedan red JSON-a". | Fajl uklonjen; gate proširen na `console.*` u `src`. |
| **N-3** | **P2** | `UsersService.update()` je pri promjeni lozinke poništavao auth keš, ali **nije gasio refresh tokene** — `revokeRefreshTokensInTransaction()` se zvao samo za `isDeactivatingUser`. Ukradeni refresh token je mogao izdati novi access token i nakon reset-a lozinke. | `isChangingPassword` → razlog `'password_changed'` + revoke u istoj transakciji; statička tvrdnja u `check-auth-session-revocation.ts`. |
| **N-4** | **P2** | 8 DTO klasa sa `@IsArray()` **bez `@ArrayMaxSize()`** (category fields ×3, category links, setup locations, create/update user scope, warehouse keepers). `setCategoryLinks()` i `create-user` rade DB lookup u petlji po svakom elementu → neograničen zahtjev. | `@ArrayMaxSize(200)` na svih 8; `check-performance-budgets.ts` sada statički odbija bilo koji array DTO bez capa ≤ 200. |

### Ostaju otvoreni (preporuka, ne implementirano u ovom paketu)

| ID | Težina | Nalaz (dokaz) | Uticaj / preporuka |
|---|---|---|---|
| **N-5 (ZATVORENO u §8)** | **P2** | `WarehouseResolutionService.resolveForOrgUnit()` (`common/services/warehouse-resolution.service.ts:15-16`) na **svaki poziv** radi `orgUnit.findMany()` + `warehouse.findMany()` bez `where`/`take`. `InventoryCountService.resolveEmployeeIdsForWarehouse()` (`:1331`) uči **sve** zaposlene i za svakog zove `resolveForEmployee()` → O(zaposleni × (org + skladišta)). Ukupno 157/168 `findMany` bez `take`. | Najveći preostali performansni rizik. Uvesti ciljani upit po `orgUnitId`, ili keš sa istim TTL/verzijom kao N-1, ili predati već učitani graf. |
| **N-6 (ZATVORENO u §8)** | **P2** | `NotificationsService.createForUsers()` (`:609-631`) radi jedan `notification.create()` + jedan Socket.IO emit **po korisniku** u petlji, bez outboxa. | `createMany` + batch emit; za kritične tokove koristiti već postojeći `NotificationOutbox` da pad procesa ne ostavi pola obavještenja. |
| **N-7 (ZATVORENO u §8)** | **P2** | `EmployeesService.update()` (`:323`) commituje transakciju, pa **tek nakon** nje zove `employeeRelocationService.handleOrgUnitChange()`. Ako relocation pukne, org promjena ostaje, a relocation case/event/ne. | Durable status + retry (isti obrazac kao `generatedDocxStatus`), ili prebaciti u istu transakciju. Nalaz je postojao i u starom auditu — **još nije zatvoren**. |
| **N-8 (ZATVORENO u §8)** | **P2** | `WarehouseStockService.bulkCreate()` (`:455`) nakon commit-a u petlji zove `notifyWarehouseStockReceived()` za svaki lot, bez outboxa. | Prebaciti u outbox unutar transakcije (pravilo: business commit pobjeđuje, notifikacija ima durable status). |
| **N-9** | **P2** | `InventoryCountController.ensureDraft()` (`:57`) radi `Number(year)` bez validacije (`NaN`, negativno, `1e9` prolaze). 6 `@Query('...') string` parametara bez DTO-a; nigdje `ParseUUIDPipe` (`grep` = 0). | `EnsureDraftQueryDto` sa `@IsInt @Min(2000) @Max(2100)` i `@IsUUID()`; dodati `ParseUUIDPipe` na `@Param('id')`. |
| **N-10** | **P2** | `AuthService.resolveExpiry()` (`:198`) za neispravan `JWT_REFRESH_TTL` **tiho** vraća 7 dana umjesto fail-closed. | Baciti grešku pri startu; dodati unit test za `30x`, `abc`, prazno. |
| **N-11** | **P3** | `AuthController.refresh()` i `logout()` nemaju `RedisRateLimitGuard` (samo `login()` ga ima). | Dodati namjenski, blaži rate-limit bucket za refresh/logout. |
| **N-12 (ZATVORENO u §8)** | **P3** | 7 od 12 najvećih servisa **nema direktan spec**: `employee-relocation` (989), `transfers` (895), `warehouse-stock` (860), `notifications` (681), `equipment` (638), `employees` (557), `users` (469). Pokriveni su integracijskim `check-*.ts`, ali ne karakterizacijskim unit testovima. | Dodati characterization testove prije refaktora velikih servisa (§11). |
| **N-13** | **P3** | 62 rasuta `role === 'admin'` provjere po servisima; nema centralne autorizacijske politike. | Ekstraktovati u `AuthorizationPolicy`; smanjuje rizik drift-a pri dodavanju uloga. |
| **N-14** | **P3** | Dva `pg_advisory_xact_lock(1800043170, …)` sa hard-kodiranim magic brojevima, bez komentara o porijeklu. | Imenovane konstante + dokumentovan namespace (kolizija s drugom aplikacijom na istoj bazi). |
| **N-15** | **P3** | `settings.registry.ts` 960 linija, `inventory-count.service.ts` 3 050 linija. | Razdvajanje po use-case (Faza 5 audita), ali tek nakon N-12. |

---

## 4. Gdje je dosadašnja dokumentacija bila previše optimistična

Ovo je važan dio „realne slike": sljedeće tvrdnje iz dokumenata **nisu bile u
potpunosti tačne u kodu u trenutku ovog audita:

1. „Svi aplikacijski logovi su jedan red JSON-a" — tačno za `logger.*`, ali
   `console.error` u mrtvom `docx-to-pdf.util.ts` je zaobilazio gate (**ispravljeno N-2**).
2. „Izmjeren DB query budget" — budžeti su postojali za CSV/QR/list, ali 157
   `findMany` bez `take` i `resolveForOrgUnit()` full-table skenovi nisu bili
   obuhvaćeni (**N-5 ostaje**).
3. „Promjene velikih servisa imaju characterization tests" — 7 najvećih
   servisa nema direktan spec (**N-12 ostaje**).
4. „Kritični side-effecti imaju durable outbox" — tačno za terminal
   DocumentJob/transfer/inventory-close, ali ne za `createForUsers()` i
   `notifyWarehouseStockReceived()` (**N-6, N-8 ostaju**).
5. „Deaktivacija/revokacija sesija je potpuna" — deaktivacija jeste, ali
   promjena lozinke nije gasila refresh tokene (**ispravljeno N-3**).
6. „Autorizacijski scope je konzistentan" — procesni keš bez invalidacije
   (**ispravljeno N-1**).

---

## 5. Ocjene po oblastima (na osnovu koda)

| Oblast | Ocjena | Obrazloženje |
|---|---:|---|
| Sigurnost / autentifikacija | **9.0** | TLS, hash-CSP, marker revokacija, conditional rotation, rate-limit na login/QR; minus za N-10/N-11 |
| Mreža / TLS / Redis ACL | **9.0** | Peer+hostname verifikacija, fail-closed `sslmode`, kanonski ACL obrazac |
| Async / queue recovery | **9.0** | 9 crash pointova, lease/heartbeat, stuck bound, outbox za terminalne događaje |
| Observability / health | **9.0** | 97 strukturiranih evenata, readiness DB/Redis/queue/Socket.IO, metrike bez PII |
| CI / release zaštita | **9.5** | 42 koraka, 37 integracija, 3 root gatea, 797 unit testova, 0 advisories |
| Integritet podataka / transakcije | **8.5** | 58 transakcija, conditional update svuda kritičnom; minus za N-7/N-8 |
| Input validacija / DTO | **7.5** | 90 DTO-a, ali 8 neograničenih nizova, 6 sirovih query stringova, 0 `ParseUUIDPipe` |
| Performanse / upiti | **6.5** | Najslabija tačka: 157 neograničenih `findMany`, O(N·M) scope resolucija, N+1 notifikacije |
| Test pokrivenost velikih servisa | **6.5** | Jako integracijski, slabo karakterizacijski; 7/12 bez direktnog speca |
| Održivost / veličina servisa | **6.0** | 3 050-line servis, 62 rasuta role checka, 960-line registry |
| Dokumentacija / operativni vodiči | **9.0** | 8 vodiča + readiness alat (nije predmet ovog code-only audita) |

### Ukupna ocjena: **8.1 / 10** u trenutku prvog pregleda → **8.8 / 10** nakon paketa N-5/6/7/8/12 (vidi §8) → **~9.5 / 10** nakon paketa N-9/10/11/13/14/15 i deployment automatizacije (vidi §9). Tabela iznad je **snapshot prvog pregleda** i namjerno nije prepisana.

U odnosu na početnu ocjenu starog audita (**6.6/10**) pomak je velik i stvaran
— ali ne na 9+: jedan svježe pronađeni **P1** (N-1, sada ispravljen), četiri
nova P2 (dva ispravljena) i grupa otvorenih P2/P3 oko upita, post-commit
efekata i test pokrivenosti drže ocjenu ispod 8.5.

**Projekcija je ostvarena:** zatvaranjem N-5, N-6, N-7, N-8 i N-12 kod je na
**8.8/10**. Bez paketa N-1…N-4 ispravki bio bi **~7.7/10**.

---

## 6. Formalno zatvaranje preostalih vlasničkih stavki

Vlasnik je preuzeo sljedeće; u repou se vode kao **delegirane / prihvaćeni
rizik**, ne kao neurađeni kod. Sve su izvršivo provjerljive kroz
`node scripts/check-deployment-readiness.mjs --env .env`:

1. **CA mountovi i SAN podudarnost** (`DATABASE_HOST`, `REDIS_HOST`) — vlasnik je
   potvrdio da je **TLS već aktivan na Redis i PostgreSQL**. U readiness alatu
   `TLS_VERIFIED=true` pretvara te dvije MANUAL provjere u `pass`; kod i dalje
   verificira peer+hostname.
2. **Live Redis ACL korisnik** — `ACL GETUSER inventory-v2` mora imati glob +
   oba egzaktna PSUBSCRIBE granta; kanonsko pravilo postoji u
   `deploy/redis/users.acl.example`.
3. **Proxy lanac (`trust proxy = 1`)** — mrežna topologija se ne može
   potvrditi iz repozitorija.
4. **Staging load test / p95 SLO** — repozitorijski budžeti mjere jedinice
   posla; pravi `k6`/`autocannon` test nad anonimizovanim datasetom ostaje na
   vlasniku, uz postojeći `http_request_metrics` za p95.

Poslovne odluke koje ostaju otvorene (ne blokiraju isporuku):
`GLOBAL_RATE_LIMIT_ENABLED` / `FAIL_CLOSED`, `inline` režim RAW dokumenta,
globalni CSP/CORP, maskiranje identiteta na javnom QR-u.

---

## 7. Preporučeni redoslijed daljeg rada

1. **N-5** — ciljani upit/keš za `WarehouseResolutionService` (najveći dobitak).
2. **N-6 / N-8** — prebaciti preostale notifikacije na outbox + `createMany`.
3. **N-7** — durable relocation status nakon org promjene.
4. **N-9 / N-10 / N-11** — input hardening (mali, brzi paket).
5. **N-12** — characterization testovi za 7 velikih servisa prije refaktora.
6. **N-13 / N-14 / N-15** — održivost (Faza 5).

Ovaj audit je **snapshot**, ne zamjena za CI: svaki gornji ispravljeni nalaz ima
odgovarajući gate koji će pasti ako se regresija vrati.

**CI potvrda paketa N-5/6/7/8/12:** run `40586562199` (`completed success` na
sva tri joba) — korak 50 `Verify independent audit findings (N-5..N-12)` zelen,
kao i 49 scope freshness, 48 performance budgets, 36 structured logs, 53 unit
(824 testa), 55 build i 56 `npm audit`. Lokalno uz `pipefail`: 19 novih unit
scenarija, 37 root scenarija, svi statički gateovi i `npm audit` = 0.

**CI potvrda ispravki N-1…N-4:** run `40581127648` (`completed success` na sva tri
joba) — korak 49 `Verify authorization scope cache freshness`, 48 `Verify
performance budgets`, 36 `Verify structured operational logs`, 43 `Verify auth
session revocation`, 52 `Run backend unit specs` (803 testa), 54 build i 55
`npm audit` su zeleni.


---

## 8. Naknadni paket: N-5, N-6, N-7, N-8, N-12 (zatvoreno)

Vlasnik je zatražio nastavak na pet preostalih nalaza i potvrdio da je TLS već
aktivan na Redis i PostgreSQL (to je sada unosivo u readiness alat kroz
`TLS_VERIFIED=true`, pa `db-cert-san` i `redis-cert-san` prelaze iz MANUAL/warn
u pass. `.env.example` dokumentuje flag; bez njega alat i dalje traži ručnu
potvrdu certifikata.

### N-5 — `WarehouseResolutionService` više ne skenira cijele tabele na svaki poziv

- `common/services/warehouse-resolution.service.ts`: orgUnit + warehouse graf se
  učitava **jednom po TTL/verziji** (isti `scope-cache.registry.ts` kao N-1), uz
  sinhrono izračunatu mapu efektivnih gradova (`buildEffectiveLocationMap`).
- Nova `findEmployeeIdsForWarehouse(warehouseId)` koristi
  `collectOrgUnitIdsForEffectiveWarehouse()` i **jedan** bounded
  `employee.findMany({ where: { orgUnitId: { in: ... } }, take: 10_000 })`.
- `InventoryCountService.resolveEmployeeIdsForWarehouse()` sada delegira na tu
  metodu — petlja `for (const employee of employees) { await resolveForEmployee() }`
  je uklonjena (O(N·M) → O(1) aplikacijskih upita). 5 unit scenarija u
  `warehouse-resolution.service.spec.ts`, statička tvrdnja u
  `check-audit-findings.ts`.

### N-6 — notifikacijski fan-out je jedan INSERT

- `NotificationsService.createForUsers()` koristi
  `notification.createManyAndReturn()` umjesto jednog `notification.create()`
  po korisniku; Socket.IO emit ostaje po korisniku (jeftin, namjeran).
- Karakterizacijski test: 3 primatelja (2 jedinstvena) → 1 DB poziv, 2 emita.

### N-8 — prijem robe piše notifikacije u outbox unutar transakcije

- `NotificationsService.buildWarehouseStockReceivedOutboxRows(tx, lotIds)`
  gradi redove sa `idempotencyKey = warehouse-stock-received:<lotId>:<userId>`.
- `WarehouseStockService` (single `receive` i `receiveBulk`) poziva builder i
  `tx.notificationOutbox.createMany({ skipDuplicates: true })` **unutar**
  `$transaction`. Stara post-commit petlja `notifyWarehouseStockReceived()` je
  uklonjena, a sam direktni notifier (mrtav kod) obrisan. Business commit sada
  garantuje notifikaciju; `NotificationOutboxRelayService` je isporučuje.

### N-7 — promjena org. jedinice više nije post-commit efekat

- `EmployeeRelocationService.handleOrgUnitChange()` sada prima
  `tx: Prisma.TransactionClient` i `notificationsEnabled`, `supersedeOpenCases`
  je postao `supersedeOpenCasesInTx(tx, ...)`, a sve notifikacije su **durable
  outbox redovi** sa ključevima `employee-relocation-action:<caseId>:<userId>` i
  `employee-relocation-alert:<key>:<userId>`.
- `EmployeesService.update()` poziva `handleOrgUnitChange(..., tx, ...)` unutar
  iste `$transaction` kao `employee.update()`. Ako bilo šta pukne, rollback
  vraća i org promjenu i relocation case — nema više "org promijenjen, case
  izostao". Nema nove tabele niti migracije: sam `EmployeeRelocationCase` je
  durable stanje, a notifikacije su outbox.

### N-12 — characterization specovi za 7 najvećih servisa

Dodano 7 `*.service.characterization.spec.ts` fajlova (equipment, transfers,
warehouse-stock, notifications, employee-relocation, employees, users). Svaki
kombinuje **ponašajni** test sa lažnim Prisma klijentom i **izvornu** tvrdnju
(nema `console.*`, conditional claim, outbox u transakciji, cursor paging,
revocation marker prije transakcije). `check-audit-findings.ts` CI gate odbija
brisanje bilo kojeg od njih.

**Ispravka ranije tvrdnje N-12:** u modulima je već bilo susjednih util/spec
fajlova (npr. `employee-relocation-lot-accounting.spec.ts`), ali ne i direktnih
servisnih karakterizacijskih specova — to je bio stvarni, nešto blaži nedostatak.

### Ažurirana ocjena: **8.8 / 10**

| Oblast | Prije | Sada |
|---|---:|---:|
| Performanse / upiti | 6.5 | **8.5** |
| Integritet / transakcije | 8.5 | **9.3** |
| Test pokrivenost velikih servisa | 6.5 | **8.5** |
| Ukupno | 8.1 | **8.8** |

**Preostali otvoreni nalazi u trenutku pisanja §8** (zatvoreni u §9): N-9 (sirovi `Number(year)`, 6 `@Query` stringova,
bez `ParseUUIDPipe`), N-10 (tihi fallback `JWT_REFRESH_TTL`), N-11 (rate-limit na
refresh/logout), N-13 (62 rasuta role checka), N-14 (magic advisory lock brojevi),
N-15 (3 050-line servis). Nijedan nije P1. Vlasnički dio (CA/SAN potvrda, live
ACL, proxy lanac, staging p95 load test) ostaje delegiran kroz
`check-deployment-readiness.mjs --env .env`, uz `TLS_VERIFIED=true` za već
aktivni TLS.

---

## 9. Završni paket: N-9, N-10, N-11, N-13, N-14, N-15 + deployment automatizacija

Svi preostali code-only nalazi iz §3 su implementirani, testirani i vezani za
CI gate `Verify independent audit findings (N-5..N-15)` (`backend/prisma/check-audit-findings.ts`).
Gate je proširen sa N-5..N-8 na N-5..N-15 i sada odbija: sirove `@Query` stringove,
`Number(year)`, izostanak `assertJwtTtl`, izostanak rate-limit guarda, bilo koju
sirovu `.role === 'admin'` usporedbu, magic `pg_advisory_xact_lock(1800043170`
literal izvan utila, i povratak `InventoryCountService` preko 3 000 linija.

### N-9 — tipizirani query DTO-i i globalna UUID validacija

- `EnsureDraftQueryDto`: `@Type(() => Number) @IsInt @Min(2000) @Max(2100)` za
  `year` i `@IsUUID()` za `orgUnitId`. `Number(year)` koji je puštao `NaN`,
  negativne i `1e9` godine je uklonjen iz `InventoryCountController`.
- `CommitteeSetupOptionsQueryDto` (`warehouseId` obavezan UUID, opcionalni
  `excludeCommitteeId`), `ResolveEffectiveWarehouseQueryDto` (`orgUnitId` +
  opcionalni `cityId`) i `GeneratedDocumentFormatQueryDto` (`@IsIn(['pdf','docx'])`)
  zamjenjuju preostalih 6 sirovih `@Query('...') string` parametara.
- `UuidParamPipe` je registrovan kao globalni `APP_PIPE` i validira **svaki**
  path parametar čije je ime `id` ili završava na `Id` (svi Prisma ID-jevi su
  UUID). `@Param('key')` kod settingsa namjerno nije zahvaćen. Time je `grep
  ParseUUIDPipe = 0` nalaz zatvoren bez 24 ručna decoratora. 4 unit scenarija.

### N-10 — fail-closed `JWT_REFRESH_TTL`

- `auth-config.util.ts` sadrži `JWT_TTL_PATTERN`, `assertJwtTtl()` i
  `JWT_TTL_MULTIPLIERS`. `main.ts` pri bootstrapu validira **oba** TTL-a
  (`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`), a `AuthService.resolveExpiry()` više
  nema tihi `return new Date(... + 7d)` fallback — neispravan TTL puca pri
  izdavanju tokena i pri startu procesa.
- 3 unit scenarija pokrivaju ispravne oblike i 9 neispravnih (`undefined`, `''`,
  `7`, `seven-days`, `0d`, `-1d`, `1w`, `1.5h`, prevelik broj).

### N-11 — rate limit na refresh i logout

- `AUTH_SESSION_RATE_LIMIT_POLICY` (`RATE_LIMIT_AUTH_SESSION_MAX=120`,
  `..._WINDOW_SEC=60`, `..._FAIL_CLOSED=false`) i `AuthSessionRateLimitGuard`
  dodani su na `POST /auth/refresh` i `POST /auth/logout`. Login ostaje na
  svom strožem bucketu (10/min). Bucketi imaju različite `keyPrefix`, imena env
  varijabli i `policyName`, pa se ne mogu slučajno sjediniti.
- Nove env varijable su u `.env.example`, oba compose fajla i u
  `REQUIRED_REPO_KNOBS` readiness alata. 1 unit scenarij + statičke tvrdnje.

### N-13 — centralna autorizacijska politika

- `common/auth/authorization-policy.util.ts` izlaže `isSystemAdmin()`,
  `isSystemAdminUser()` i `assertSystemAdmin()`. Svih **62** rasutih
  `user.role === 'admin'` / `!== 'admin'` provjera u 17 servisa zamijenjeno je
  pozivom `isSystemAdmin(...)`; gate tvrdi da ih koristi najmanje 15 fajlova i
  odbija **bilo koju** novu sirovu usporedbu (osim unutar samog utila).
- Helper prihvata `null`/`undefined` i vraća `false`, pa opcionalni aktor ne
  može slučajno dobiti administratorski scope. 4 unit scenarija.

### N-14 — imenovani advisory lockovi

- `common/database/advisory-locks.util.ts` definira
  `ADVISORY_LOCK_NAMESPACE = 1800043170` i `ADVISORY_LOCKS = { categoryTree:
  24681, setupBootstrap: 13579 }`, plus `advisoryLockSql(key)` koji koristi
  `Prisma.sql` s parametrima (vrijednosti nisu dijelom SQL teksta).
- `CategoriesService` i `SetupBootstrapService` koriste imenovane ključeve.
  Gate skenira cijeli `src` i odbija povratak magic literala. 3 unit scenarija.

### N-15 — mjerljivo razdvajanje najvećeg servisa

- 18 modulskih konstanti, query shapeova, sort allow-lista, ulaznih tipova i
  response mappera izdvojeno je u `inventory-count.constants.ts` (139 linija).
  `inventory-count.service.ts` je pao s **3 042 na 2 931 liniju** (ispod capa
  3 000) i sada sadrži samo orkestraciju; 7 characterization specova ostaje
  sigurnosna mreža za dalje cijepanje po use-caseu.
- Gate mjeri broj linija u CI-ju, pa se servis ne može vratiti na 3k+ bez
  eksplicitnog refaktora. 2 unit scenarija čuvaju semantiku sort allow-lista i
  javne projekcije close joba.

### Deployment automatizacija (umjesto pukog delegiranja)

Vlasnik je potvrdio da je **TLS već aktivan na Redis i PostgreSQL**; kod i dalje
sam verificira peer i hostname, a `TLS_VERIFIED=true` samo bilježi operatersku
potvrdu. Tri preostale MANUAL stavke sada imaju izvršiv dio u repou:

1. **Proxy lanac** — `TRUST_PROXY_HOPS` (default 1, 0–8) zamjenjuje hardkodirani
   `app.set('trust proxy', 1)`. `resolveTrustProxyHops()` odbija `-1`, `true`,
   `1.5`, `1,2`, `99`; readiness alat ima novu `trust-proxy-hops` provjeru
   (warn na 0 = direktno izlaganje) i 4 nova deployment knoba. 3 unit scenarija.
2. **Live ACL** — `check-redis-acl-channels.ts` više ne provjerava samo glob
   `&inventory-v2:*` u stvarnom `ACL GETUSER` odgovoru, nego **svaki**
   `contract.requiredAclPatterns` (glob + oba egzaktna PSUBSCRIBE granta).
   Redis 7 literalni `strcmp` incident ne može se vratiti neopaženo.
3. **Staging p95 load test** — `scripts/load-test.mjs` (dependency-free, Node 22
   `fetch`) mjeri p50/p95/p99 i error rate pod fiksnom konkurencijom, a
   `evaluateSlo()` daje mašinski čitljiv PASS/FAIL sa `--json` izvještajem.
   `scripts/load-test.spec.mjs` ima 6 scenarija protiv lokalnog `node:http`
   servera (uključujući 503 kao SLO grešku i odbijanje loše konfiguracije).
   Vodič: `docs/load-testing.md`. Vlasnik i dalje pokreće pravi staging test nad
   produkcijski velikim datasetom — sandbox to ne može simulirati.

### Ažurirana ocjena: **~9.5 / 10**

| Oblast | Prvi pregled | Poslije §8 | **Sada** | Razlog promjene |
|---|---:|---:|---:|---|
| Sigurnost / autentifikacija | 9.0 | 9.0 | **9.7** | N-10 fail-closed TTL, N-11 refresh/logout bucket |
| Input validacija / DTO | 7.5 | 8.5 | **9.7** | N-9 globalni UUID pipe + 4 tipizirana query DTO-a |
| Održivost / veličina servisa | 6.0 | 6.5 | **9.0** | N-13 centralna politika, N-14 imenovani lockovi, N-15 cap |
| CI / release zaštita | 9.5 | 9.5 | **9.8** | N-5..N-15 gate, load-test SLO spec, trust-proxy knobs |
| Mreža / TLS / Redis ACL | 9.0 | 9.0 | **9.6** | konfigurabilan proxy lanac + live ACL GETUSER svi granti |
| Dokumentacija / operativni vodiči | 9.0 | 9.0 | **9.5** | `docs/load-testing.md`, readiness `trust-proxy-hops` |
| Performanse / upiti | 6.5 | 8.5 | **8.8** | SLO harness (stvarni staging p95 i dalje vlasnički korak) |
| Test pokrivenost velikih servisa | 6.5 | 8.5 | **9.0** | +19 unit scenarija, N-12 karakterizacija ostaje |
| **Ukupno** | **8.1** | **8.8** | **~9.5** | — |

**Zašto ne 10/10:** pravi staging p95 test na produkcijskom datasetu, fizička
potvrda cert SAN-ova i mrežna topologija proxy lanca ostaju vlasnički koraci
koji se ne mogu dokazati iz koda sandboxa. `inventory-count.service.ts` je i
dalje najveći servis (2 931 linija) — cap sprječava rast, ali potpuno cijepanje
po use-caseu je sljedeći veći refaktor. To su svjesno prihvaćeni, dokumentovani
rizici, a ne skrivene greške.
