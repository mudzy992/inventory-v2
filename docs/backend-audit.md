# Backend — inventar, audit i fazni plan

**Pregled:** drugi, produbljeni prolaz statičkog audita (nakon prvog inventara)
**Datum pregleda:** 24.10.2026.
**Izvor istine:** kod u `backend/src`, `backend/prisma/schema.prisma`, PostgreSQL migracije, `backend/package.json`/lockfile, Docker konfiguracija.
**Opseg:** statički pregled backend arhitekture, modula, ključnih tokova, autorizacije, validacije, transakcija, background poslova, baze, Redis-a, upload-a, testova i deployment konfiguracije. Nisu pregledani produkcijski podaci, runtime konfiguracija Coolify-ja, mrežni firewall niti izvršen penetracijski test. Nalazi koji zavise od načina deploymenta označeni su kao provjere, a ne kao potvrđeni incidenti.

> Ovaj dokument je početni plan za buduće iterativne popravke. Ne mijenja ponašanje aplikacije. Prioritet je prvo zatvoriti sigurnosne i integritetske rizike, a tek zatim raditi veće refaktore.
>
> Detaljna implementacijska razrada, uključujući zavisnosti između paketa, kriterije prihvatanja, testne scenarije, rollout/rollback i poslovne odluke, nalazi se u [`backend-implementation-plan.md`](./backend-implementation-plan.md).

## 1. Sažetak za odluku

Backend je funkcionalno bogat, modularizovan NestJS 11 servis sa Prisma 7 i PostgreSQL-om. Dobar temelj čine tipizovani DTO-i, centralna autorizacija po rolama i scope-u, jasno izdvojeni domenski utili, trajni DB zapisi za važne asinhrone poslove, selektivno korištenje transakcija, Redis cache-aside i dosta testova za čiste poslovne funkcije.

Glavni dug nije nedostatak poslovne funkcionalnosti, nego **pouzdanost rubnih slučajeva i sigurnosna disciplina**: upload konfiguracija, neescape-ovan HTML/CSV izlaz, atomarnost nekih višekoračnih promjena, ciklična kategorijska hijerarhija, ponovni pokušaji i oporavak queue poslova, produkcijski defaulti, te neravnomjerna pokrivenost integracionim testovima. Najveći servis `InventoryCountService` ima oko 2.875 linija; više drugih domenskih servisa ima 500–1.100 linija. To otežava promjene koje prelaze granice domena.

### Ocjena

| Oblast | Ocjena | Obrazloženje |
|---|---:|---|
| Struktura i razdvajanje domena | 7.5/10 | Moduli su jasno imenovani, ali neki servisi su preveliki i međusobno povezani. |
| Autorizacija i scope | 7.5/10 | Dobra centralna osnova za role, registrar/moderator/warehouse scope; još treba standardizovati sve rubne tokove. |
| Validacija i API disciplina | 6.5/10 | Globalni `ValidationPipe` je uključen, ali `interface` i inline object tipovi na nekim `@Body()` parametrima zaobilaze class-validator validaciju. |
| Integritet transakcija / konkurentnost | 6.5/10 | Osjetljivi tokovi često koriste transakcije i unique indekse, ali postoje konkretni višekoračni tokovi van transakcije i queue race prozori. |
| Asinhroni poslovi i oporavak | 6.5/10 | Document Engine ima dobar DB/queue reconciliation obrazac; zatvaranje inventure nema isti nivo oporavka i ima nepodudaranje DB statusa sa BullMQ retry-jem. |
| Testovi | 6.5/10 | `npm run test:unit`: 261 test prošao u 53 suite-a kroz 36 fajlova. Repo sadrži 54 `*.spec.ts`, ali je većina testova util/scope funkcija, a malo je controller/DB/integration testova. |
| Sigurnost zavisnosti | 5.5/10 | `npm audit` na backend lockfile-u je prijavio 24 nalaza (1 critical, 17 high, 5 moderate, 1 low) u trenutno instaliranom stablu; postoje ispravke za prijavljene pakete. |
| Operativna vidljivost | 9.0/10 | `/health/ready` sada pokriva DB, Redis, BullMQ i Socket.IO; svi aplikacijski logovi su jedan red JSON-a sa request/job correlation ID i redakcijom (uključujući tajne unutar serijalizovanih poruka), uz strukturirane signale za notification outbox, BullMQ redove, inventory close age/status i istekle lease-ove, poslovne state-transitione (applied/rejected/terminalni ishodi), rate-limit odluke/Redis kvarove, PostgreSQL pool/latenciju, Redis ready/reconnect/PING stanje, odbijene upload zahtjeve te agregiranu HTTP latenciju/stopu grešaka po normaliziranim rutama. CI statički sprječava povratak free-form logova. Observability preporuke iz Faze 4 su implementirane; preostaje održavanje pragova na produkcijskom saobraćaju. |
| **Kompletan backend** | **6.6/10** | Dobar i aktivno korišten poslovni temelj; drugi prolaz je otkrio i stored-XSS put kroz HTML prenosnice, uz već navedene integritetske i upload rizike. |

Ocjene su heurističke, kodne ocjene za planiranje rada — nisu procjena dostupnosti produkcije niti potvrda eksploatabilnosti svakog nalaza.

## 2. Inventar backend-a

Root modul je `backend/src/app.module.ts`; globalni prefix je konfigurabilan preko `API_PREFIX`. Root uvozi sve top-level module. Zajednički sloj se nalazi u `common/`, Prisma infrastruktura u `prisma/`, Redis klijenti u `redis/`, a BullMQ konfiguracija u `queues/`.

| # | Modul | Glavna odgovornost / API površina |
|---:|---|---|
| 1 | `auth` | Login, refresh/logout tokena, trenutni profil. |
| 2 | `users` | Administracija naloga, uloga i dodjela scope-a. |
| 3 | `setup` | Jednokratna inicijalizacija organizacije i početnih naloga. |
| 4 | `settings` | Javni/privatni sistemski parametri i feature flags. |
| 5 | `health` | DB liveness/readiness odgovor. |
| 6 | `nav` | Brojači/bedževi za navigaciju. |
| 7 | `notifications` | Inbox, označavanje pročitanog i Socket.IO eventi. |
| 8 | `locations` | Kantoni i gradovi. |
| 9 | `org-units` | Hijerarhija organizacije, efektivne lokacije/potpisnici. |
| 10 | `employees` | Zaposleni, pretraga/profil, promjene statusa i organizacione jedinice. |
| 11 | `categories` | Hijerarhija kategorija, polja/specifikacije i validacija kategorije. |
| 12 | `equipment-catalog` | Šifrarnik artikala/opreme povezan sa kategorijama. |
| 13 | `equipment` | Evidencija pojedinačnih sredstava, pretraga, CSV, QR, status. |
| 14 | `warehouse-stock` | Prijem, lotovi, FIFO razduživanje/izdavanje i komisija opreme. |
| 15 | `maintenance-parts` | Rezervni dijelovi, potrošnja, ugradnja/zamjena i historija događaja. |
| 16 | `warehouses` | Skladišta, pristup skladištara, uništavanje i DOCX obrasci prenosnica. |
| 17 | `transfers` | Poslovni tok prenosnice, brojevi dokumenata, potpisivanje i generisanje. |
| 18 | `uploads` | Upload i download potpisanih PDF prenosnica. |
| 19 | `inventory-count` | Inventurne sesije, komisije, stavke, zatvaranje, disposal lista/odobrenja. |
| 20 | `inventory-scheduler` | Periodični zaključavanje/otvaranje/zatvaranje inventurnih sesija. |
| 21 | `disposal-commissions` | Pregled komisija za rashod uz moderator scope. |
| 22 | `employee-relocation` | Slučajevi premještanja zaposlenog/opreme, source/destination odluke i mapiranje kataloga. |
| 23 | `public-equipment` | Neautentifikovani QR javni pregled opreme. |
| 24 | `documents` | Generički DB/BullMQ sloj za konverziju DOCX/XLSX/ODT u PDF. |
| — | `common` | JWT/role/scope tipovi, paginacija, validatori, org/warehouse/signer/location resolution i inventory freeze. |
| — | `prisma` | `PrismaService`, `PrismaPg` adapter i konfiguracija DB konekcije. |
| — | `redis` | Cache/lock/rate-limit servis, Redis TLS config i Socket.IO adapter. |
| — | `queues` | Globalna BullMQ konekcija i default retry/backoff/retention opcije. |

**API route porodice:** `/auth`, `/users`, `/setup`, `/settings`, `/health`, `/nav`, `/notifications`, `/locations`, `/org-units`, `/employees`, `/categories`, `/equipment-catalog`, `/equipment`, `/warehouse-stock` i `/warehouses`, `/maintenance-parts`, `/transfers`, `/uploads`, `/inventory-count`, `/inventory-sessions`, `/inventory-warehouse-committees`, `/disposal-commissions`, `/employee-relocation` i `/public/equipment`. Većina privatnih kontrolera postavlja `JwtAuthGuard` i `RolesGuard`; izuzeci su namjerno javni `auth` login/refresh/logout, `setup`, `health`, javna podešavanja i QR lookup. Stvarni pristup podacima se dodatno provjerava kroz scope servise u domenskim servisima.

### Struktura i testni materijal

- `schema.prisma`: 46 modela, enums za statuse/uloge i PostgreSQL relacije/indeksi.
- PostgreSQL migracije: početna migracija plus dvije migracije za Document Engine; posljednja je partial unique index za aktivne document jobove. Migracioni README kaže da je folder namjerno prazan, što više nije tačno i treba ažurirati.
- 54 test fajla `*.spec.ts` u repou. npm skripta `test:unit` pokreće 36 fajlova; u ovoj sesiji prošlo je **261/261 testova**.
- Testovi su posebno korisni za scope, kategorije, FIFO lotove, inventory helper-e, relocation mapiranje, bootstrap validaciju. I dalje nedostaju reprezentativni Postgres integration testovi za konkurentne state transition-e, upload/HTTP pipeline, auth refresh race i queue oporavak.

## 3. Nalazi po prioritetu

### P1 — riješiti prije narednih većih nadogradnji

1. **Zavisnosti imaju neriješene sigurnosne advisories.** `npm audit` (backend lockfile, 24.10.2026) prijavljuje ukupno 24 nalaza: 1 critical, 17 high, 5 moderate i 1 low; audit označava dostupnu nadogradnju. Posebno je važan `proxy-addr` 2.0.7 / GHSA-jqcg-44mw-7w3h: aplikacija postavlja `trust proxy = 1` i zatim koristi `request.ip` za login rate-limit. Audit prijavljuje kritičnu mogućnost IP spoofing-a u ranjivom rasponu. `multer` je takođe u ranjivom rasponu, a koristi se na upload rutama. Potrebno je prvo napraviti kontrolisan lockfile update, pregledati diff i ponoviti build/test/audit; ne raditi slijepi `npm audit fix` bez provjere promjena.
2. **Multer prima fajlove prije aplikacijskog size check-a.** `FileInterceptor('file')` nema deklarisane `limits`/file-size granice. Servis provjerava `file.size` tek nakon što je Multer držao buffer u memoriji. To ostavlja put za potrošnju memorije / DoS prije business validacije. MIME se provjerava iz `file.mimetype` (vrijednost pod kontrolom klijenta), ne prema stvarnom potpisu sadržaja. Isto važi za PDF i DOCX upload.
3. **Korisničke scope dodjele se brišu izvan transakcije.** U `UsersService.update()` četiri `deleteMany` upita su prije `$transaction` koji ažurira korisnika i kreira dodjele. Ako update/insert padne nakon brisanja, nalog ostaje bez dodjela, a druge povezane promjene nisu atomske. Premjestiti brisanje i kreiranje dodjela u istu transakciju; invalidaciju cache-a obaviti nakon commit-a.
4. **Inventurna sesija može ostati zauvijek u `closing` bez BullMQ posla.** `closeSession()` promijeni DB status sesije u `closing` i upsertuje DB job kao `queued`, pa tek onda radi `queue.add()`. Redis/queue greška između tih koraka ostavlja DB red, a API odbija ponovni close jer sesija više nije `active`. U kodu nema startup reconciliation/re-enqueue toka za te DB close-jobove.
5. **BullMQ retry zatvaranja sesije je u konfliktu sa DB claim statusom.** Worker claim radi samo `status: 'queued'`; pri exception-u status postaje `failed`, zatim se greška baca radi BullMQ retry-a. Sljedeći BullMQ attempt vidi DB status `failed`, ne preuzima posao i završava ga bez stvarnog retry-a. Treba definisati jednu autoritativnu retry politiku i atomarni claim/state machine.
6. **DB TLS konfiguracija nije eksplicitna u vidljivom adapter kodu.** `parseDatabaseUrl()` iz `DATABASE_URL` izdvaja samo host/port/user/password/database; query parametri se odbacuju. `PrismaPg` se konstruiše bez `ssl`/CA opcije. Pošto je runtime TLS izvan koda moguć kroz drugi PG mehanizam, ovo je nalaz za provjeru, ne tvrdnja da produkcija trenutno nema TLS. Prije daljeg DB rada napraviti test koji dokazuje da se peer cert validira u stvarnom deploymentu i prenijeti TLS parametre eksplicitno kroz konfiguraciju/secret ako test to ne potvrdi.
7. **Početni setup je javno dostupan ako `SETUP_TOKEN` nije postavljen.** To je namjerna bootstrap mogućnost, ali inicijalizacija zavisi od javnog poziva. Provjera `user.count()` u `SetupService` je van bootstrap transakcije; unutrašnja provjera je u transakciji, ali bez zaključavanja/serializacije praznog users skupa dvije paralelne inicijalizacije sa različitim username-ima mogu proći count provjere. Učiniti setup token obaveznim u produkciji i zaštititi inicijalizaciju DB-level/advisory lock-om ili izolacijom koja garantuje jedan pobjednički bootstrap. Upis company settings-a nakon bootstrap transakcije takođe treba spojiti ili imati oporavak.
**Stored XSS provjera — P1 ako je isti browser origin.** `buildTransferRawDocumentHtml()` interpolira vrijednosti iz baze direktno u HTML tekst (`reason`, `notes`, imena, label-e i inventurni broj); transfer DTO dozvoljava slobodne stringove za `reason`/`notes`. Kontroler vraća rezultat kao `text/html`, bez vidljivog escaping-a ili attachment zaglavlja. Ako se ruta servira pod istim originom kao aplikacija, korisnik sa pravom kreiranja prenosnice može sačuvati HTML/JS, a skripta se izvršava u originu korisnika koji otvori dokument. Potvrditi origin/proxy u deployment-u; bez obzira na to, escape-ovati svaki tekstualni čvor (ili generisati bezbjedan PDF/attachment) i dodati regression test sa `<script>`, `</td><script>` i atributnim payload-ima.

### P2 — zatvoriti u narednom ciklusu

8. **DTO validacija ne pokriva sve write body-je.** `UpdateSettingBody` je TypeScript `interface`; inline tipovi `{ note?: string }` i `{ approved: boolean; note?: string }` imaju runtime tip `Object`. Nest `ValidationPipe`/class-validator nema metapodatke za njih pa ih `whitelist`/`forbidNonWhitelisted` ne štiti kao DTO klase. Napraviti DTO klase sa validatorima i limitima dužina, enum vrijednostima i transformacijom.
9. **WebSocket prihvata JWT bez provjere da li je user i dalje aktivan.** `NotificationsGateway.resolveUserId()` samo verifikuje potpis/expiry i pridružuje `user:<sub>` sobi. Ne radi lookup `isActive`, niti provjerava opoziv/sesiju. Deaktivacija naloga može ostaviti ranije otvorenu WebSocket konekciju aktivnom do expiry tokena. Employee deactivation put takođe deaktivira vezani User, ali ne invalidira `auth:user:<id>` Redis cache kako to radi `UsersService.update()`. Uvesti shared auth/session provjeru za WS i zajednički invalidation helper.
10. **Refresh-token rotacija nije atomska.** `AuthService.refresh()` prvo učita token, zatim posebno označi `revokedAt`, pa tek onda izda novi token. Dva simultana poziva mogu oba proći početnu provjeru i izdati dva refresh tokena. Zamijeniti sa conditional `updateMany where revokedAt=null` i provjerom `count === 1` unutar transakcije; dodati race test. Takođe planirati cleanup istečenih `RefreshToken` redova.
11. **Javni QR pregled vraća identitet i neograničenu historiju.** `PublicEquipmentService` eksplicitno vraća puno ime, titulu, put organizacione jedinice i sve transfere sa imenima strana. To može biti legitimno za poslovnu funkciju, ali je javno dostupno bez login-a; definisati privacy policy / minimalni DTO (npr. ograničiti historiju, maskirati osobe) i uvesti rate-limit/anti-enumeration. Komentar u kodu potvrđuje da transferi nisu ograničeni po broju, a učitava se i cijela org hijerarhija na cache miss.
12. **Public/operational readiness je preplitak.** Backend `/health` izvrši samo `SELECT 1`; ne signalizira Redis, BullMQ queue, Socket.IO adapter ili Document Worker. Coolify healthcheck stoga može prikazati backend healthy dok login-rate-limit, queue ili real-time događaji ne rade. Uvesti odvojene liveness/readiness provjere i jasno definisati da li Redis outage ruši readiness ili samo degradira pojedine funkcije.
13. **CORS je fail-open ako `CORS_ORIGIN` nedostaje.** `main.ts` postavlja `origin: true` i `credentials: true`; komentari kažu da je fallback namijenjen dev/debug, ali kod ga ne blokira u production. WebSocket CORS takođe reflektuje origin. Produkcijski startup treba odbiti praznu/široku allow-listu, osim ako je eksplicitni deployment režim dev.
14. **Cache invalidacija / side-effect granice nisu svugdje jedinstvene.** Settings/defaults se inicijalizuju pojedinačnim upisima na `OnModuleInit`; kod multi-instance starta moguće su konkurentne inicijalizacije. Redis cache je best-effort (što je ispravno za čitanja), ali autorizacijski cache zahtijeva dosljednu invalidaciju kroz sve puteve promjene usera.
15. **DB state transition-i često provjeravaju stanje pa ažuriraju kasnije.** Transfer `finalize`, inventory `closeCommittee/closeSession`, dio employee/org promjena i lot dekrementiranja čitaju status/balans prije write-a. Transakcije postoje na važnim tokovima, ali ne svuda su uslovi statusa/balansa ponovo provjereni u atomarnom `updateMany` ili zaključani. Treba concurrency testirati i dodati DB constraint/conditional update za tokove gdje dva istovremena zahtjeva mogu duplirati poslovni efekat.
16. **Fajl i DB nisu jedna transakcija.** Upload/template zapisuju fajl pa zatim DB metapodatke/status. DB greška ostavlja orphan fajl; write je direktan, ne temp+rename. Template upload validira DOCX strukturu i generated path koristi determinističku sanitizaciju, što je dobar početak, ali treba atomic file write/cleanup i reconciler za orphan-e.
17. **CSV export je ranjiv na formula injection i nema gornju granicu redova.** `escape()` štiti CSV delimitere/quote/newline, ali ne neutralizuje ćelije koje počinju sa `=`, `+`, `-`, `@` ili tabom; Excel/Calc može takvu vrijednost tretirati kao formulu. Uz to, export radi `findMany()` bez limit/paginacije i gradi cijeli CSV string u memoriji. Dodati spreadsheet-safe escaping i streaming ili obavezni server-side limit + paginaciju.
18. **DOCX template ZIP validacija nema dekompresijski budžet.** Template validator prima cijeli upload u memoriji, PizZip otvara ZIP i čita `word/document.xml`, pa radi dry-run render. Route nema eksplicitni Multer `limits`; čak i kada se postavi compressed file size limit, ZIP bomb može imati znatno veći uncompressed size. Dodati limite na veličinu prije bufferovanja, broj entries/uncompressed bytes/ratio i test sa kompresionim bomb payload-om.
19. **Numeric settings nisu strogo ograničene na finite i per-key opseg.** `serializeValue()` odbacuje samo `NaN`, ali prihvata `Infinity`/`-Infinity` i proizvoljne decimalne/ekstremne vrijednosti. Registry sadrži `upload.max_mb`, `lists.default_page_size` i `lists.max_page_size`, pa pogrešna admin vrijednost može ukloniti očekivane granice. Uvesti per-key min/max/integer constraints, `Number.isFinite()` i validaciju odnosa default/max page size.
20. **Kategorija može dobiti descendant kao parent i ciklizovati hijerarhiju.** `CategoriesService.update()` odbacuje samo self-parent, a ne provjerava da je novi parent izvan podstabla kategorije. Npr. `A.parent=B` pa `B.parent=A` može napraviti ciklus; parent postoji, ali `buildCategoryTree()` više nema root za taj ciklus i čvorovi mogu nestati iz tree response-a. Provjeriti ancestor chain unutar transakcijskog/zaštićenog update-a i dodati ciklus/regression test.

### P3 — održivost i kapacitet

21. **Nedostaje API-level/integration test sloj.** Većina od 261 testa pokriva čiste util-e i mock scope servise. Potrebni su testovi sa stvarnim PostgreSQL-om za migrations, unique constraint-e, transakcije i konkurentne zahtjeve; testovi Nest HTTP guards/DTO-a; Redis/BullMQ recovery testovi.
22. **Velike domenske klase su teško održive.** Posebno `InventoryCountService` (~2.875 LOC), `EmployeeRelocationService` (~989), `WarehouseStockService` (~865), `TransfersService` (~829), `NotificationsService` (~627), `EquipmentService` (~641), `MaintenancePartsService` (~564), `EmployeesService` (~539). Izdvajati use-case servise po odvojenim state transition-ima, ali tek uz karakterizacione testove.
23. **Dokumentacija migracija je zastarjela.** `backend/prisma/migrations/README.md` opisuje folder kao prazan, a postoje PostgreSQL migracije. Uskladiti README sa stvarnim istorijatom i dodati automatizovan schema/migration drift check.
24. **Opservabilnost je i dalje log-centric, ali je značajno ojačana.** Uvedeni su request/job correlation ID, redakcija tajni/PII, JSON log događaji za HTTP zahtjeve, notification outbox backlog, BullMQ queue depth/lag, PostgreSQL pool/latenciju, Redis ready/reconnect/PING stanje i odbijene upload zahtjeve; `DATABASE_POOL_MAX` je validirana deployment konfiguracija, a Redis lifecycle, cache/lock upozorenja i upload cleanup greške više nisu free-form. Preostaju strukturirani signali za poslovne state transition-e i postepeni prelazak preostalih legacy free-form logova u potpuno strukturirani JSON.

### Tragovi u kodu za glavne nalaze

| Nalaz | Primarni izvor |
|---|---|
| Trust proxy + IP rate-limit površina | `backend/src/main.ts:18-21`; `backend/src/redis/redis-rate-limit.guard.ts:24-69`; lock verzije u `backend/package-lock.json` (`proxy-addr`, `multer`, Express/Nest/Socket.IO paketi). |
| Multer bez route-level limits; app size provjera kasnije | `backend/src/modules/uploads/uploads.controller.ts:27-35`, `uploads.service.ts:32-56`; template upload: `backend/src/modules/warehouses/warehouses.controller.ts:100-109`, `warehouse-transfer-template.service.ts:56-88`. |
| User assignment delete izvan transakcije | `backend/src/modules/users/users.service.ts:308-313`; transakcija počinje nakon brisanja. |
| Inventory close DB state prije queue add | `backend/src/modules/inventory-count/inventory-count.service.ts:1914-1955`. |
| Inventory worker claim samo queued, pa failure status prije retry | `backend/src/modules/inventory-count/inventory-session-close-worker.service.ts:59-85`. |
| Setup token opcionalan i count provjera | `backend/src/modules/setup/setup.service.ts:35-48`; transakcijska bootstrap provjera `setup-bootstrap.service.ts:23-46`. |
| DATABASE_URL query/TLS parametri se ne prenose u adapter | `backend/src/prisma/create-prisma-client.ts:12-25`, `:48-58`. |
| WebSocket auth samo verifikuje token i pridružuje sobu | `backend/src/modules/notifications/notifications.gateway.ts:44-52`, `:119-145`. |
| Inline/interface DTO validacija | `backend/src/modules/settings/settings.controller.ts:8-32`; dodatni inline body parametri u `maintenance-parts.controller.ts` i `inventory-count.controller.ts`. |
| Javni QR vraća punu transfer historiju/lične podatke | `backend/src/modules/public-equipment/public-equipment.service.ts:140-168`, `:201-245`. |
| Health testira samo Postgres | `backend/src/modules/health/health.controller.ts:4-31`. |
| CORS fail-open default | `backend/src/main.ts:37-53`. |
| RAW HTML prenosnica interpolacija bez escape | `backend/src/modules/transfers/utils/transfer-raw-document.util.ts:15-65`; endpoint `transfers.controller.ts:77-81`; DTO `transfers/dto/create-transfer.dto.ts` (`reason`, `notes`). |
| CSV formula injection i neograničen export | `backend/src/modules/equipment/equipment.service.ts:578-627`; odgovor se sklapa cijeli u memoriji u `equipment.controller.ts:54-65`. |
| DOCX ZIP validation bez dekompresijskog budgeta | `backend/src/modules/warehouses/utils/validate-transfer-template.util.ts:35-74`; upload route `warehouses.controller.ts:100-109` (`FileInterceptor('file')` bez `limits`). |
| Category descendant-parent ciklus | `backend/src/modules/categories/categories.service.ts:87-107`. |
| Numeric settings dozvoljavaju non-finite i bez key-specific bounds | `backend/src/modules/settings/settings.service.ts:205-225`; registry numeric keys `settings.registry.ts:550-602`. |

## 4. Detaljna ocjena po modulu

Ocjene koriste isti kriterij: ispravnost/zaštita podataka, autorizacija, validacija, transakcije, testovi i održivost. Akcije u zadnjoj koloni su prijedlozi za roadmap, ne automatski odobrene izmjene.

### 4.1 Auth — **7.0/10**

**Uloga:** login, refresh/logout i `/me`. Bcrypt hash-evi, 48-byte random opaque refresh token, SHA-256 hash u bazi, JWT access token i DB provjera aktivnog usera kroz `JwtStrategy` su dobri izbori. Redis keš user scope-a ima kratak TTL i `UsersService` ga invalidira pri promjeni naloga. Login rate-limit je Redis-backed.

**Rizici:** refresh rotacija nije atomska (nalaz 10). `RedisRateLimitGuard` eksplicitno fail-open kada Redis padne; to čuva login dostupnost, ali smanjuje zaštitu baš pri incidentu. `INCR` i `EXPIRE` nisu jedna Lua operacija — prekid nakon prvog hit-a može ostaviti ključ bez expiry. Login endpoint nema DTO testove/service testove. Inaktivacija usera se reflektuje kroz 30s auth cache, a WS trenutno ne koristi isti auth path.

**Plan:** P1 atomarna refresh rotacija i concurrency test; P1 audit dependency/update `proxy-addr`; P2 atomic rate-limit Lua + konfigurabilna fail-open/fail-closed politika i metrička evidencija; P2 cleanup istečenih refresh redova; dodati auth integration testove.

### 4.2 Users — **6.5/10**

**Uloga:** CRUD i scope dodjele za admin/moderator/evidenticar/skladistar/koordinator. Ima validatore za kombinacije assignment-a, moderator scope ograničenja, filtriranje/paginaciju, bcrypt i invalidaciju auth cache-a.

**Rizik:** `UsersService.update()` briše četiri vrste assignment-a prije transakcije (nalaz 3), što je integritetski blocker. Validacija assignment-a i update imaju race window ako se org/warehouse scope promijeni paralelno; to treba zatvoriti constraint-ima ili transakcijskim re-check-om. Malo direktnih tests za create/update i privilege transitions.

**Plan:** P1 obuhvatiti brisanje + user update + assignment kreiranje u jednoj transakciji; P2 conditional/unique constraint testovi; test matrix admin vs moderator, self-change, downgrade, deaktivacija, cache invalidate.

### 4.3 Setup — **6.0/10**

**Uloga:** `GET /setup/status` i javni `POST /setup/initialize`; bootstrap kreira org jedinicu, zaposlene, početne naloge, kategoriju, šifrarnik i skladište.

**Dobro:** cijeli veliki bootstrap objekata se kreira unutar Prisma transakcije; username duplikati se provjeravaju prije kreiranja; password hash se računa bcrypt-om. Postoje unit testovi.

**Rizici:** `SETUP_TOKEN` je opcionalan; race prazne baze i settings upis nakon bootstrap transakcije su P1 (nalaz 7). Setup API je javni po dizajnu, pa prvi deployment mora biti zaštićen prije nego što se kreira admin.

**Plan:** P1 obavezni production token + atomic singleton/advisory lock + transakcijski upis settings-a; P2 smoke test dvije paralelne inicijalizacije i prekid usred setup-a.

### 4.4 Settings — **6.0/10**

**Uloga:** registry-driven javna/privatna podešavanja, feature flags, Redis cache-aside i socket event za javne promjene. Privatni GET i PATCH su admin-only.

**Dobro:** definicije vrijednosti centralizovane u registry-ju; key se ne može mijenjati ako nije registrovan/admin-editable; cache se invalidira na upis.

**Rizici:** PATCH koristi `interface UpdateSettingBody`, pa payload ne dobija standardnu class-validator validaciju (P2 nalaz 8). `serializeValue()` za boolean pretvara sve osim `true`/`"true"` u `false`; to može sakriti neispravan input umjesto da ga odbije. Numeric serializer dozvoljava `Infinity` i nema per-key opseg za upload/page-size settings (nalaz 19). `ensureDefaults()` radi mnogo pojedinačnih upisa bez jedne transakcije i može se takmičiti na startu više replika.

**Plan:** P1 DTO + stroga validacija po setting type-u; P2 transakcijski/upsert defaults i multi-instance startup test.

### 4.5 Health — **6.0/10**

**Uloga:** `/health` testira Postgres `SELECT 1` i vraća 503 ako DB nije dostupan.

**Dobro:** pravi DB round-trip, nije samo process-alive.

**Nedostatak:** readiness ne pokriva Redis, BullMQ queue, document worker ni migracije (nalaz 12). Backend container može biti označen zdravim dok funkcije zavisne od Redis-a nisu spremne.

**Plan:** P2 razdvojiti `/health/live` i `/health/ready`, uključiti obavezne zavisnosti u readiness uz degradacijski režim koji je jasno dokumentovan. Ne vraćati credentiale/connection string u payload.

### 4.6 Nav — **7.0/10**

**Uloga:** agregira nepročitane notification brojače, pending transfere i relocation alert-e.

**Dobro:** user-scoped notifications; scope servisi koriste se za transfer count; neuspjeh neobaveznih relocation alert-a ne ruši cijelu navigaciju.

**Rizici:** više zasebnih agregatnih upita i relocation servisni poziv na svaki učitani badge; nema testova za count/scope kombinacije. Catch-all `catch {}` skriva razlog neuspjeha.

**Plan:** P3 testovati role/page badge contract; dodati debug/metric umjesto tihog catch-a; optimizovati tek na osnovu mjerenja.

### 4.7 Notifications — **7.0/10**

**Uloga:** per-user notifikacije, recipient resolution za transfere/inventuru/relocation/stock i Socket.IO eventi. Redis adapter podržava horizontalni broadcast.

**Dobro:** persisted notification redovi, room `user:<id>`, recipient helper-i izdvojeni u utils, per-user eventi i feature flag.

**Rizici:** nema servisnih testova za recipient matrix i nema outbox mehanizma: DB promjena može uspjeti, a notifikacija/emit pasti, ili obrnuto. WS verifikuje JWT potpis i expiry, ali ne provjerava `isActive`/opoziv (nalaz 9). Gateway dopušta origin refleksiju.

**Plan:** P1 auth state check na WS; P2 outbox ili idempotent notification dispatcher za poslovno kritične događaje; testirati recipient scope i cross-tenant odsustvo.

### 4.8 Locations — **7.5/10**

**Uloga:** CRUD i autocomplete kantona/gradova; admin write, authenticated read; provjerava reference prije brisanja grada/kantona.

**Dobro:** search limit, check referenced entities i jasni domain errors.

**Rizici:** pretraga se može pozvati sa praznim `q` ako DTO ne odbije prazno; delete check pa delete ima race (DB FK ga vjerovatno sprečava, ali status/poruka može biti neuredna). Nema direktnih servisnih testova.

**Plan:** P3 DTO testovi za prazan/dugačak search; unique/foreign-key integration testovi; zadržati bazu kao konačni autoritet.

### 4.9 Org Units — **7.0/10**

**Uloga:** CRUD organizacione hijerarhije, ciklus/parent-child provjere, moderator scope, efektivni signer/location derived fields, counts.

**Dobro:** cycle check, validacija dopuštenih parent/child tipova, moderator ograničenje, osvježavanje derived signer/location izdvojeno u common services.

**Rizici:** org update i refresh derived fields su odvojeni upisi; ako refresh ne uspije, osnovna promjena ostane, a derived vrijednosti zastare. Cycle-check je read-then-write pa dva paralelna premještanja mogu napraviti ciklus bez DB constraint-a. Tree/flat čitanja su unbounded, što je prihvatljivo za male org hijerarhije, ali treba pratiti rast.

**Plan:** P2 transactionally refresh derived data ili queue/reconcile; concurrency test za dva parent change-a; P3 tree size/query metrika.

### 4.10 Employees — **7.0/10**

**Uloga:** list/search/profile, CRUD, deactivation zaštita zbog zadužene opreme/signer/relocation slučajeva; promjena org jedinice pokreće relocation logiku.

**Dobro:** role-dependent employee scope, paginacija, active employee check na dodjelu opreme, zaštita od brisanja zaposlenog sa poslovnim referencama, relocation util testovi.

**Rizici:** linked user deaktivacija ne invalidira JwtStrategy Redis cache (nalaz 9). Employee update se commit-uje prije `handleOrgUnitChange()`; ako relocation operacija padne, org update ostaje ali relocation case/event/notification može izostati. List/profile vraćaju lične podatke i treba osigurati da role scope matrix pokriva sve slučajeve.

**Plan:** P1 shared user-deactivation invalidator; P2 org change + relocation transactional/outbox ili retryable state; test profile privacy i deactivation.

### 4.11 Categories — **6.8/10**

**Uloga:** kategorijska hijerarhija, ASSET/MAINTENANCE tip, polja opreme/optional lot specifications, tree i search.

**Dobro:** normalizacija JSON fields kroz util-e; leaf category enforcement u domenima; admin-only CRUD; testovi za category fields.

**Rizici:** parent-cycle provjera u update-u pokriva self-parent, ali ne descendant-parent (nalaz 20); update može teorijski stvoriti ciklus. Takođe parent `categoryKind` kompatibilnost i promjena definicije polja kad postojeća sredstva već koriste stari JSON format traže migration policy.

**Plan:** P2 test/zaštita ciklusa i ASSET/MAINTENANCE nasljeđivanja; P2 versioning ili migracija specifikacija prije promjene polja; unique category semantics.

### 4.12 Equipment Catalog — **7.5/10**

**Uloga:** paginated katalog kod/naziv/kategorija, admin CRUD, resolve stavke za stock lot.

**Dobro:** leaf category check, aktivnost i category consistency provjera, unique code, whitelist sort fields i paginacija.

**Rizici:** `remove()` provjerava samo equipment references; treba potvrditi i stock lot/relocation/template references prije brisanja, oslanjajući se na FK kao sigurnosnu mrežu. Check-then-create duplikat treba završiti unique DB constraint-om (provjeriti schema). Bez direktnog service testa.

**Plan:** P2 pregled svih referenci/unique indeksa; test P2002 race i in-use delete.

### 4.13 Equipment — **6.3/10**

**Uloga:** centralni registar sredstava, role-aware read/write, search/summaries/CSV/QR/check endpoints, status/reactivation i custody.

**Dobro:** access helper jasno razlikuje admin, moderator, registrar, warehouse keeper i self-held user; unique spec validation i accounting upgrade util-i; inventory freeze integration.

**Rizici:** 641 LOC servis i 103 LOC access utility bez direktnog unit test fajla za glavne authorization grane; CSV export je neograničen u memoriji i ćelije nisu zaštićene od formula injection (nalaz 17); uniqueness check endpointi su samo UX provjera, ne zaštita od race-a — unique indeks mora biti finalna garancija. Create je namjerno blokiran/route-ovan kroz stock flow, što treba dokumentovati za API korisnike.

**Plan:** P1 test matrica access; P2 state mutation testovi/unique constraints; P3 razdvojiti query/report/export od write use-case-a.

### 4.14 Warehouse Stock — **7.5/10**

**Uloga:** lot prijem (uključujući bulk), šifrarnik/specifikacije, FIFO receipt consumption, issue/commission i cross-warehouse tokovi.

**Dobro:** izdvojeni transaction util-i, FIFO po receipt-u, kanonski lot helper-i i dosta ciljnih testova; critical issue/commission radnje rade transakcijski; inventory freeze i registrar/keeper/moderator scopes.

**Rizici:** najveći dio servisa je 865 LOC; quantity se validira prije transakcije i zatim dekrementira, pa treba testirati dva paralelna `issueUnit` zahtjeva za posljednju jedinicu. Bulk prijem može imati veliki niz item-a unutar duge transakcije bez DTO maksimalne dužine. Neki access check-ovi se rade na unaprijed učitanom stanju.

**Plan:** P1/P2 atomarni conditional decrement `quantityOnHand >= n`; unique/spec constraint testovi; bulk max; test cross-warehouse čitavog DB side-effect lanca.

### 4.15 Maintenance Parts — **7.0/10**

**Uloga:** host/maintenance kategorija linkovi, maintenance lot prijem, ugradnja, fault/remove/replace i event historija.

**Dobro:** state promjene part-a + audit event su u istoj transakciji; category kind i link check; equipment/warehouse scope i inventory freeze.

**Rizici:** controller ima inline `{ note?: string }` body-je (nalaz 8). Servis 564 LOC, nema izdvojenih direktnih service tests. `installPart`/`replacePart` provjeravaju `quantityOnHand` prije transakcije, pa concurrency može overspendati isti lot ukoliko DB update nije conditional; pregledati u cijelom toku. `listMaintenanceLots` filtrira registrar lotove sekvencijalnim `canAccessStockLot` pozivima (N+1).

**Plan:** P1 DTO; P2 atomarni lot decrement i concurrency tests; P3 batch-ovati scope query i testirati consumption reporting.

### 4.16 Warehouses — **7.0/10**

**Uloga:** skladišta, scope list, keeper assignment, oprema spremna za uništenje/uništenje, template DOCX upload/list/download/activation.

**Dobro:** moderator/keeper access check, transfer template validacija DOCX ZIP strukture, rotacija aktivnog obrasca kroz DB transakciju i relative paths.

**Rizici:** upload koristi neograničeni `FileInterceptor` prije size check-a (nalazi 2 i 18); PizZip/Docxtemplater obrađuju arhivu bez vidljivog uncompressed-size budžeta. Fajl se piše prije DB transakcije (nalaz 16). `resolveTemplateAbsolutePath()` samo `join()`-uje DB putanju sa upload root-om; sada se putanja generiše interno iz UUID-a, ali defense-in-depth containment check bi štitio od oštećenog DB reda. Keeper assignment delete/create pattern i destroy equipment flow zaslužuju transaction/concurrency testove.

**Plan:** P1 zajednički upload policy; P2 path containment + file/db reconciliation; test template rollback/activation paralelno.

### 4.17 Transfers — **6.3/10**

**Uloga:** prenosnice zaduženja/razduženja/prenosa, scope validation, document number allocation, statusne promjene, potpis, PDF upload policy i document generation.

**Dobro:** jaka domenska provjera warehouse/person/signer alignment; transfer broj se alocira u transakciji; promjena transfer + equipment na finalizaciji je transakcijska; document generation je odvojena i ima status/retry API; cross-service transfer ograničen.

**Rizici:** servis 829 LOC plus document service 299 LOC. Finalize/markPrinted/cancel prvo učitavaju status pa zatim ažuriraju; konkurentna finalizacija može proći dvije provjere prije prvog commita. RAW HTML dokument direktno interpolira DB/DTO vrijednosti bez escaping-a (P1 provjera istog browser origin-a, iznad). Post-create notification/document generation je izvan transfer DB create tx, pa job/notification failure može ostaviti validan transfer bez pratećeg side effect-a (Document Engine oporavlja neke tokove). Dodati state version/conditional write i outbox/retry.

**Plan:** P1 concurrency/idempotency tests i conditional status update; P2 outbox dla notification/document enqueue; P3 razdvojiti policy, status transitions i report queries.

### 4.18 Uploads — **5.5/10**

**Uloga:** upload potpisanog PDF-a, DB metadata, transfer path i download autorizacija.

**Dobro:** transfer access se provjeri prije write-a; relative path se pravi iz internog warehouse ID, godine i sanitizovanog broja dokumenta; download provjerava transfer scope.

**Rizici:** neograničeni Multer memory upload, MIME trust bez PDF magic-byte provjere, write fajl → DB metadata → transfer update → status update kao više odvojenih koraka, bez rollback/cleanup (nalazi 2 i 16). `findByEntity` prima `entityType/entityId` kao plain query strings i cast-a `entityType` umjesto stroge enum DTO validacije; trenutno route role je uska, ali treba allow-list i eksplicitna autorizacija za buduće entity type-e.

**Plan:** P1 globalni Multer size/count/field limiti, PDF header sniff i abort cleanup; P1 temp file + atomic rename + DB rollback/orphan cleanup; P2 entity DTO/allow-list i file download testovi.

### 4.19 Inventory Count — **6.0/10**

**Uloga:** najkompleksniji modul: session lifecycle, committee composition/scope, warehouse committees, inventory lines, pending actions, freeze, close worker, disposal approvals/reports.

**Dobro:** state i scope logika se dijelom izdvaja u util-e, postoje helper testovi, transfer freeze provjere, DB unique pair za line/session kombinacije, pending action claim pattern i concurrency zaštite za neke tokove. Asinhrono zatvaranje izvještava progress preko notification gateway-a.

**Rizici:** `InventoryCountService` je ~2.875 LOC; close session -> DB job/queue add/retry problem je P1 (nalazi 4–5). Kontroler ima inline approval body `{ approved: boolean; note?: string }` (nalaz 8). `recordLine()` provjerava committee open/session active prije transakcije, pa upsert akcije može race-ovati close; zatvaranje komisije isto radi status read pa update. Worker označi individualnu akciju `failed` pa nastavlja i na kraju može označiti sesiju `closed`; poslovno pravilo za djelimično neuspješan close mora biti jasno predstavljeno u UI/API. Puna retry semantika pending action-a je neujednačena.

**Plan:** P1 close queue state machine/reconciliation/idempotency; P1 ulazni DTO; P2 concurrency testovi za record vs close, disposal approval i pending actions; P2 razdvojiti session/committee/disposal/worker use-case-e uz karakterizacione testove.

### 4.20 Inventory Scheduler — **6.8/10**

**Uloga:** dnevni cron, production-mode/setting provjere, Redis distributed lock, draft/activate/close radnje.

**Dobro:** cron može biti eksplicitno isključen, lock koristi token i TTL, per-distribution errors se hvataju i loguju tako da jedna distribucija ne blokira sve ostale.

**Rizici:** lock TTL je fiksnih 15 min; ako posao traje duže, drugi scheduler može preuzeti lock dok prvi i dalje radi. `@Cron('5 0 * * *')` koristi server timezone, a calendar logic zatim koristi konfigurisani timezone; treba eksplicitno uskladiti schedule trigger i business timezone, posebno oko DST. Podešavanja se čitaju direktno iz Prisma umjesto Settings cache/API.

**Plan:** P2 lock renewal ili duži/izračunat TTL + idempotent job key; eksplicitna timezone odluka i fake-clock/DST tests; pratiti trajanje locka i preskočene jobove.

### 4.21 Disposal Commissions — **7.0/10**

**Uloga:** paginated list/detail aktivnih disposal komisija, moderator warehouse/org scope.

**Dobro:** scope filter u listi i detail ponovna provjera, pagination i allowed sort fields, feature flag.

**Rizici:** modul je read-only, što je čisto; nema direktnih testova za to da komisija van scope-a ne procuri kroz relacije/granice grada. `OR` scope zasnovan na gradu i warehouse/org relacijama traži fixture testove.

**Plan:** P2 moderator scope integration tests, poseban test city komisije bez linked inventory committee.

### 4.22 Employee Relocation — **7.2/10**

**Uloga:** preview promjene, otvoreni relocation slučajevi, source/destination accept/reject, equipment events, catalog mapping i admin alerts.

**Dobro:** testovi pokrivaju mapiranje kataloga, nasljeđivanje specifikacija, preview registrar scope i lot accounting; list query ima source/dest scope filters; inventory freeze i notifications su uključeni.

**Rizici:** servis ~989 LOC i dosta upita/side effect-a kroz employee→warehouse→registrar recipients. `handleOrgUnitChange()` se poziva nakon employee update commit-a (vidi Employees), pa failure ostavlja nepotpun proces. `preview()` za svaki kategorijski group može serijski raditi više registrar lookup-a (N+1 pri velikom broju kategorija). Potrebni su testovi za dvije istovremene source/dest odluke nad istom relocation line.

**Plan:** P2 poslovni tranzicijski testovi i retryable relocation event; optimizovati batch recipient lookup; razdvojiti preview/read, case lifecycle i lot/accounting.

### 4.23 Public Equipment — **6.0/10**

**Uloga:** javni QR endpoint, feature-gated i Redis cache TTL 60s.

**Dobro:** response DTO je eksplicitan, ne vraća cijeli Prisma model; specifikacije se labeliraju; Redis cache ublažava DB opterećenje.

**Rizici:** javno vraća holder puno ime/titulu/org put i cijelu historiju svih transfera; nema rate limit-a/anti-enumeration. Query učitava sve transfere i cijeli org unit set. Potencijalna privatnost i DoS/expensive query su P2.

**Remediation update:** odvojeni Redis rate limit po IP-u uveden je na javni QR endpoint (podrazumijevano 60 zahtjeva/60 sekundi, konfigurabilan i u Compose fajlovima); regression test pokriva 429 i outage policy. Historijska i dalje otvorena stavka: product/privacy odluka o identitetu i broju javno prikazanih transfera, anti-enumeration i performance/load testovi.

### 4.24 Documents — **8.0/10**

**Uloga:** DB document job zapis, BullMQ enqueue/retry, QueueEvents status update i restart reconciliation; koristi zaseban Document Worker.

**Dobro:** idempotentan `DocumentJob.id` / Bull jobId, partial unique index za aktivan source, DB stanje kao source of truth, startup reconciliation queued/running redova, sanitized greške i per-user Socket.IO event. Worker ne dodiruje Postgres.

**Rizici:** integration behavior zavisi od zajedničke verzije queue/prefix/env-a i shared filesystem-a; postojeći testovi su dominantno utils, bez fault-injection testa Redis outage između DB enqueue i queue add, worker restart, disk full, event stream reconnect. `QueueEvents` greške se loguju/auto retry-uju, ali operativni readiness to ne pokazuje.

**Plan:** P2 testirati retry/reconcile kroz Redis i worker; health metrike; zadržati postojeći obrazac kao šablon za inventory close queue.

## 5. Zajednički slojevi

### `common` — **7.5/10**

**Vrijednost:** najveća sigurnosna prednost backend-a je da scope nije samo decorator role check. `RegistrarScopeService`, `ModeratorScopeService`, `OrgScopeService`, `InventoryFreezeService`, `WarehouseResolutionService`, signer/location resolution i paginacija sadrže ponovnu upotrebljivu domensku logiku. Testovi pokrivaju velik broj role/scope slučajeva.

**Rizici:** scope check-i se ponekad rade u servisima nakon učitavanja podataka, ponekad se query ograničava direktno kroz Prisma where. Ova razlika treba biti standardizovana. Globalni `CommonModule` uvozi `SettingsModule`, a settings i notifications imaju `forwardRef`, što pokazuje dependency cycle koji treba postepeno ukloniti kroz event interface/outbox. `parsePagination()` caps page size, ali page number nije gornje ograničen — ekstremno velik `page` može napraviti ogromni `skip` u DB query-ju.

**Plan:** P2 contract tests za svaki `scopeWhere`; max skip/page offset limit ili cursor pagination za velike liste; P3 ukloniti circular module dependency i napraviti centralni API authorization cookbook.

### Prisma / PostgreSQL — **6.0/10**

**Vrijednost:** jedna Prisma service instanca, PostgreSQL adapter, relation models, enum statusi, FK/unique/indexi i transakcije u critical flows. U početnoj migraciji su svi osnovni modeli osim DocumentJob; taj model i unique index imaju zasebne migracije.

**Rizici:** Hard-coded pool `max: 10` treba provjeriti prema broju backend replika i Postgres connection limitu (sada je `DATABASE_POOL_MAX` 1–100 sa budžetnom formulom). Tri migracije naspram velikog živog schema-a nisu automatski loše (init migration pokriva većinu modela), ali schema-drift test mora potvrditi da ne postoje ručne promjene izvan migracija. Migracioni README je zastario.

**Plan:** ~~P1 dokazati TLS/CA u runtime~~ **(zatvoreno)**; P2 migracije na praznoj i kopiji baze u CI; schema diff check; pool budget formula = replicas × pool max + worker/maintenance.

**Remediation update:** `resolveDatabaseConfig()` više ne odbacuje TLS query parametre — podržani su `DATABASE_SSL_MODE`/`sslmode` (`disable`, `require`, `verify-ca`, `verify-full`) i `DATABASE_SSL_CA`/`sslrootcert`, pri čemu svaki uključeni mod znači verifikovan peer + hostname (`rejectUnauthorized: true`, `minVersion: TLSv1.2`, SNI za DNS host). Nesaglasnost `sslmode` iz URL-a i deployment moda oko uključenja TLS-a sada puca fail-closed umjesto tihe downgrade promjene. `createPrismaClientOptions()` eksplicitno prosljeđuje `ssl` u `pg.Pool`. P1 runtime dokaz je `backend/prisma/check-postgres-tls-handshake.ts`: pravi `openssl` CA/server lanac, TLS-only PostgreSQL wire stub i stvarni `pg.Client` koji kroz verificirani TLS izvršava `SELECT 1`, dok pogrešan CA, tuđi hostname i plaintext bivaju odbijeni (vidi `docs/backend-implementation-plan.md` §0.5). Stvarni CA mount i podudarnost certifikata sa `DATABASE_HOST` ostaju deployment potvrda.

### Redis / BullMQ / Socket.IO — **7.0/10**

**Vrijednost:** Redis config je centralizovan, TLS CA path je sada podržan za backend i document worker; shared ioredis options služe RedisService, BullMQ i QueueEvents; key prefix/BullMQ-native prefix su namjerno razdvojeni; cache-aside degradira na miss; lock ima safe token release.

**Rizici:** login rate-limit fail-open je konfigurabilan; auth scope cache mora biti invalidiran svim putanjama; `RedisIoAdapter` ima fallback na in-memory mode, ali readiness ne dokazuje da je adapter u shared Redis modu. Inventory close queue recovery trenutno slabiji od Documents. Ovaj audit ne provjerava live Redis ACL/ACL key pattern niti stvarno učitavanje Coolify secret-a.

**Remediation update:** `INCR` i TTL sada su atomski preko Lua; login guard je registrovan u `AuthModule`, a javni QR dobio je zaseban Redis IP bucket (60/min default). Fail-open/fail-closed odluke sada imaju procesne brojače, strukturirani `rate_limit_check_failed` log bez IP/ključeva i 30-sekundni `rate_limit_metrics` signal sa podešivim pragovima. P1 test Redis TLS sa stvarnim chain-om i Node hostname verification je **zatvoren**: `buildRedisTlsOptions` u backendu i document-workeru eksplicitno postavlja `rejectUnauthorized: true`, `minVersion: 'TLSv1.2'` i SNI za DNS host; `check-redis-tls-handshake.ts` u CI generiše pravi CA/server cert preko `openssl`, pokreće TLS-only RESP stub i dokazuje ispravan handshake, odbacivanje pogrešnog hostname-a/nepouzdanog CA/plaintexta i `ioredis` ready+PING kroz TLS (vidi `docs/backend-implementation-plan.md` §0.4; CI run `40491773900` zelen na sva tri joba). Stvarni CA mount, podudarnost `REDIS_HOST` sa cert SAN-om i Redis ACL i dalje traže deployment potvrdu; queue recovery integration i multi-instance Socket.IO room/key-prefix testovi ostaju otvoreni.

### API bootstrap / HTTP — **6.0/10**

**Dobro:** global `ValidationPipe` sa `whitelist`, `forbidNonWhitelisted`, `transform`; global prefix može biti prazan; trust proxy postavljen za Coolify/Traefik; CORS više origin-a podržan.

**Rizici:** CORS fail-open fallback (P2); trust proxy je numeric one-hop i sigurnost zavisi od toga da backend nije direktno izložen i da je ispred tačno pouzdan proxy; nema vidljivog Helmet niti global HTTP rate-limit policy-ja. Preporuka je testirati stvarni proxy lanac, ne samo promijeniti `trust proxy` naslijepo.

**Remediation update:** request/correlation ID, redakcija logova, `http_request` po zahtjevu i agregirani `http_request_metrics` signal (latencijski histogram, stopa 5xx, normalizirane rute) su implementirani; preostaje odluka o Helmetu i globalnom rate-limitu.

## 6. Fazni plan implementacije

Faze su namjerno inkrementalne. Svaka faza završava testovima i produkcijskim rollout-om koji može da se vrati nazad. **Ne kombinovati velike refaktore sa promjenom poslovnog ponašanja.**

### Faza 0 — potvrda baseline-a i sigurnosna priprema (kratka, bez behavior change-a)

1. Sačuvati trenutne test/build/audit rezultate i dobiti kopiju produkcijske konfiguracije bez tajni.
2. Potvrditi `DATABASE_URL`/PrismaPg TLS u runtime-u kroz handshake test; potvrditi Redis CA file mount, `REDIS_TLS=true`, hostname verification i ACL.
3. Na backup/staging bazi pokrenuti `prisma migrate deploy` i schema drift provjeru; uporediti broj migracija sa migration README.
4. Sačuvati migracijski backup i definisati rollback prije P1 izmjena.
5. Exit: staging start, DB+Redis TLS test, `test:unit`, backend/worker build, migration status bez drift-a.

### Faza 1 — P1 sigurnost i integritet (prije feature nadogradnji)

1. **Dependency hardening:** kontrolisano ažurirati vulnerable lockfile transitive/direct pakete; posebno Express/proxy-addr, Nest platform-express/Multer, Socket.IO/ws/parser, body-parser. Pregledati breaking changes, `npm audit` ponoviti i zabilježiti rezidualne advisories.
2. **Upload pipeline:** zajednički Multer limits (bytes, broj fajlova, field count/size), PDF/DOCX content sniffing, abort cleanup, temp path + atomic rename, DB failure cleanup/reconciler; test oversized payload-a i spoofovanog MIME-a.
3. **User update atomarnost:** assignment delete/recreate + user + linked employee promjene unutar jedne transakcije; invalidate cache nakon commit-a; rollback test.
4. **Setup zaštita:** mandatory `SETUP_TOKEN` u production; jedinstveni bootstrap lock; postavke uključiti u transakciju; dvije paralelne inicijalizacije testirati.
5. **Validated DTO contract:** zamijeniti inline/interface body-je sa class DTO-ima i testirati `whitelist/forbidNonWhitelisted`.
6. **WS identity:** provjera aktivnog usera i revocation/sesije; invalidacija iz employee deactivation; test da disabled user odmah gubi socket pristup.
7. **Database TLS proof:** eksplicitna SSL/CA konfiguracija ili dokumentovano odobrenje runtime mehanizma nakon testa; nikada isključiti cert verifikaciju.
8. **RAW HTML XSS:** potvrditi origin u produkcijskom reverse-proxy setup-u; escape-ovati sva interpolirana polja i dodati regression test, bez obzira na origin izolaciju.

**Exit kriterij:** nema critical/high dependency advisories bez dokumentovanog risk acceptance-a; P1 testovi prolaze; upload ima strogi hard limit prije bufferinga; assignment update i setup su atomarni; RAW dokument ne dopušta HTML/JS injection.

### Faza 2 — durable async state i recovery

1. Refaktorisati inventory close u eksplicitan state machine: `queued → running → done/failed`, uz `attempts`, next retry i claim token/lease; DB status i BullMQ attempts moraju biti usklađeni.
2. Uvesti reconciliation na backend startup ili periodični recovery za DB close jobs koji su queued/closing a nemaju Bull job.
3. Učiniti `closeSession` idempotentnim nakon `queue.add()` greške; session state ne smije blokirati retry/re-enqueue.
4. Testirati worker restart, Redis unavailable, duplicate Bull delivery, partial pending-action failure, API retry i više worker instanci.
5. Uvesti transactional outbox za kritične evente (notification/document enqueue) gdje DB commit mora garantovati eventualni side effect.

**Exit kriterij:** fault-injection testovi dokazuju da nijedan posao ne ostaje trajno `queued/running/closing` bez vlasnika i da retry ne duplira poslovnu promjenu.

### Faza 3 — poslovni concurrency i privatnost

1. Dodati optimistic concurrency/version ili conditional `updateMany where status/balance=expected` u transfer finalization, stock decrement, inventory committee close/recordLine i setup-sensitive reference.
2. Dodati unique constraint-e za svaku poslovnu uniqueness garanciju koja se trenutno radi samo check-then-create; mapirati P2002 u stabilne API poruke.
3. Dogovoriti javni QR data contract: koje lične podatke/historiju je dopušteno objaviti, koliko historije, rate limit i anti-enumeration.
4. Uskladiti feature flag enforcement za čitanje i pisanje; dokumentovati namjerne exceptions.
5. Neutralisati spreadsheet formula injection u CSV exportu i zaštititi category parent update od descendant ciklusa.
6. Validirati numeric setting opsege po ključu i enforce-ovati finite/integer/relational constraints.

**Exit kriterij:** race testovi paralelnih upisa daju jedan jedini uspješan state transition; privacy review odobrio public response; CSV ćelije ne izvršavaju formule i category tree ostaje acikličan.

### Faza 4 — testovi, health i observability

1. CI Postgres integration test suite sa migrate-from-empty i upgrade-from-previous schema scenarijem.
2. Nest HTTP test suite za auth/roles/DTO, upload i modul scope matrices; testirati 401/403/404 i no-data-leak ponašanje.
3. Redis/BullMQ integration test suite sa multi-instance worker/reconnect.
4. Readiness/liveness i dependency status (DB, Redis, queues, worker) uz definisana degraded behavior pravila.
5. Strukturirani logovi, request ID, metričke queue/duration/retry/error metrike; bez tokena, lozinki, ličnih dokumenata ili punih upload putanja u javnim errorima.
6. Ažurirati migrations README i dodati audit/build/test u release gate.

**Exit kriterij:** CI blokira release na migracijskom drift-u, P1 regresijama, neprolaznim scope/integration testovima i critical advisories.

### Faza 5 — održivost i performanse

1. Razdvajati velike servise po use-case/state machine, sa characterization testom prije svakog izdvajanja. Predloženi red: Inventory Count → Transfers → Warehouse Stock → Employee Relocation → Notifications/Equipment.
2. Pregledati query planove/indexe na produkcijski anonimizovanoj kopiji; batch-ovati N+1 scope/recipient lookup-e; ograničiti javnu historiju i `skip` paginaciju; cursor pagination za velike tabele; CSV export streaming/row limit implementirati prije velikih dataset-a.
3. Izračunati Postgres pool ukupno za broj replika i process-a; dodati load test za popularne list/search/export rute i QR endpoint.
4. Ukloniti `Settings ↔ Notifications` circular module dependency kroz port/event dispatcher/outbox.

**Exit kriterij:** izmjerena p95 latencija/DB query budget, bez regresije domena, servisi razdvojeni samo uz adekvatne tests.

## 7. Predloženi red rada po modulima

| Red | Modul(i) | Prva konkretna stavka | Prioritet |
|---:|---|---|---|
| 1 | Backend dependencies / HTTP | Patch npm advisories, posebno `proxy-addr` i Multer; provjeriti trusted proxy chain. | P1 |
| 2 | Uploads + Warehouses | File limits prije parsiranja, sadržajni validator, atomic file/DB workflow. | P1 |
| 3 | Users + Auth + Employees + Notifications WS | Atomarne scope dodjele, atomic refresh, disabled-user invalidation i WebSocket auth. | P1/P2 |
| 4 | Setup | Obavezna produkcijska zaštita i single-winner bootstrap. | P1 |
| 5 | Inventory Count + Scheduler | Close job state machine, queue recovery, concurrency testovi; zatim lock/timezone. | P1/P2 |
| 6 | Prisma/DB connection | Dokazati TLS/CA, migration drift i connection budget. | P1 |
| 7 | Settings + API DTO + Health | Validacija body-ja, secure CORS default, readiness. | P2 |
| 8 | Public Equipment | Privacy contract, list cap, rate limiting. | P2 |
| 9 | Transfers + Equipment + Categories + Warehouse Stock | RAW HTML escaping, CSV formula safety/streaming, category-cycle guard, atomarni state/balance checks i integration coverage. | P1/P2 |
| 10 | Remaining CRUD/read modules | Tests/constraints/response contracts. | P2/P3 |
| 11 | Refactor/performance | Tek nakon characterization tests + baseline metrics. | P3 |

## 8. Kvalitet i ograničenja ovog audita

- Unit testovi su pokrenuti: **261 pass, 0 fail** (`npm run test:unit`).
- Backend build nije verifikovan do kraja u sandboxu: Prisma generator nije mogao preuzeti `schema-engine` sa Prisma binary hosta. Ovo je ograničenje build okruženja; ciljano TypeScript provjeravanje pojedinih novih konfiguracijskih fajlova ranije je prolazilo, ali nije zamjena za production build.
- `npm audit` pregled je zavisan od advisory baze i lockfile snapshot-a tog datuma; nakon package update-a ponoviti audit.
- Nisu izvršeni live DB/Redis, load, chaos, backup restore ili penetration testovi.
- Svaki nalaz koji se tiče production konekcije/TLS treba potvrditi prema stvarnom deployment-u, jer kod može primati dodatne Node/PG env konfiguracije koje nisu dio repozitorija.

**Zaključna ocjena nakon drugog prolaza:** backend ima kvalitetnu poslovnu osnovu i značajan dio zaštitnih util-a već postoji; ukupnu ocjenu revidiram sa početnih 6.8 na **6.6/10** zbog dodatno potvrđenih HTML injection/CSV export rizika, ciklične kategorijske hijerarhije i slabih numeric-setting granica. Najveći brzi dobitak je zatvaranje dependency/upload/setup/assignment/queue/XSS rupa. Nakon Faza 1–3 i potvrde integration testovima, ponovna procjena bi trebala biti bliža **8/10**, uz pretpostavku da testovi potvrde DB/Redis TLS i state recovery.
