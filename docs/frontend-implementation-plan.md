# Frontend — detaljan plan implementacije audita

**Status:** planirano; implementacija nije započeta ovim dokumentom
**Osnova:** [`frontend-audit.md`](./frontend-audit.md), koji sadrži nalaze, izvore u kodu i početnu faznu podjelu
**Opseg:** React/TypeScript SPA, API ugovor i error state, auth/session, notifications/socket, print/export, testovi, build/CI, deployment i UX pristupačnost.

> **Ažuriranje 2026-10-28:** većina ovog plana je realizirana kroz prethodne
> pakete, a preostali UX/a11y/dizajn dio kroz novi
> [`frontend-code-audit-2026-10-28.md`](./frontend-code-audit-2026-10-28.md) i
> [`frontend-design-system.md`](./frontend-design-system.md). Ovaj dokument
> zadržavamo kao historijsku razradu kriterija prihvatanja.

> Plan je zasnovan na statičkom pregledu koda. Ne mijenja ponašanje aplikacije i nije potvrda produkcijskog UX-a. Promjene korisničkih tokova/statusa treba prije implementacije potvrditi sa stvarnim korisnicima i uskladiti sa backend pravilima.

## 1. Cilj i načela

Cilj je smanjiti rizik od runtime rušenja i neispravnog prikaza, zatvoriti HTML injection, učiniti API greške vidljivim, te uvesti minimalnu automatsku zaštitu prije većih UX/refaktor promjena.

1. **Prvo sigurnost i dostupnost glavnih tokova.** Ne raditi širok vizuelni redesign dok print/XSS, runtime reference i typecheck nisu pod kontrolom.
2. **Greška nije prazno stanje.** UI mora razlikovati uspješno prazan rezultat, djelimično učitavanje i neuspješan API poziv.
3. **Server je autoritet.** UI guards su navigacijska pomoć; svi API podaci i dozvole potvrđuju se na backendu.
4. **Jedan API ugovor.** DTO, notification property names, enum-i i pagination/error envelope moraju biti zajednički dogovoreni ili generisani.
5. **State transition je idempotentan.** REST odgovor i Socket event mogu stići u različitom redoslijedu; UI ne smije duplo primijeniti istu promjenu.
6. **Testirati ponašanje koje korisnik osjeti.** Testirati role, loading/error/empty state, print output i ključne poslovne workflow-e, ne samo helper funkcije.
7. **Male promjene sa rollback-om.** Dependency update, type cleanup, XSS fix i page refaktor razdvojiti u pregledljive pakete.

## 2. Prioriteti i talasi

| Talas | Fokus | Očekivani rezultat |
|---:|---|---|
| 0 | Reproducibilan build/typecheck/test baseline | Broj grešaka i postojeći workflow-i mjerljivi; produkcijski env potvrđen. |
| 1 | XSS, crash i error handleri | Print siguran; Transfers i maintenance error paths ne ruše UI. |
| 2 | Dependency + typecheck/test CI gate | Ranljivosti kontrolisane, type errors postepeno ugašene, regresije blokuju release. |
| 3 | API state, auth multi-tab, notifications | Greške vidljive, logout konzistentan, unread count/DTO idempotentni. |
| 4 | Workflow i contract/browser testovi | Kritični tokovi rade za dogovorene role i degradacije. |
| 5 | Deployment, performanse i accessibility | Header/origin dokazi, razumni bundle budžeti i pristupačni osnovni tokovi. |
| 6 | Veći page refaktori | Stranice manje i održivije bez promjene poslovnog ponašanja. |

## 3. Talas 0 — baseline i reprodukcija

### 0.1 Uspostaviti frontend provjere

- Pokrenuti `npm ci`, `npm run build`, `npx tsc --noEmit --pretty false` i postojeći `guards-phase-c.spec.ts` na čistom checkout-u.
- Sačuvati tačne Node/npm verzije, lockfile hash, build output i typecheck broj/klase grešaka.
- Trenutni audit baseline: `vite build` prolazi; TypeScript prijavljuje **98 dijagnostika**; nema npm test/lint/typecheck skripti; jedan helper spec nije bio povezan sa standardnom test skriptom.
- Odvojiti postojeće compiler greške po grupama: unresolved imports/runtime reference, DTO mismatch, lazy loader, strict/nullability, unused/obsolete code. Ne gasiti `strict`/`noUnused*` radi zelenog CI-ja.

### 0.2 Potvrditi deploy konfiguraciju

- Utvrditi koja `VITE_API_URL`/same-origin `/backend` putanja se koristi u produkciji i koji host služi Socket.IO.
- Provjeriti response security headers i CSP na stvarnom edge/proxy sloju; repo Nginx config nije dokaz da production edge nema headere.
- Potvrditi da su API, Socket.IO, preview/download i print prozori na očekivanim origin-ima.
- Zabilježiti browser podršku, tip uređaja i osnovne role koje moraju raditi (admin, evidentičar, skladištar, moderator/ostale aktivne role).

**Kriteriji izlaza:** čist build/test način reprodukcije; typecheck baseline zabilježen; deployment origin i role matrica poznati; postojeći javni/privatni tokovi popisani.

## 4. Talas 1 — sigurnosni i runtime P1 popravci

### 1.1 Ukloniti raw HTML injection iz print tokova

- U `DisposalReportSheet` i `EquipmentCard` identifikovati svaku vrijednost koja se interpolira u tekst, atribute, `<title>`, URL ili CSS.
- Preferirati DOM konstrukciju i `textContent`; ako template string ostaje, koristiti jednu testiranu kontekstualnu escaping funkciju. Ne tretirati escape za HTML text kao siguran za atribute/URL/script kontekst.
- Izbjegavati kopiranje arbitrary DOM `innerHTML` u print prozor.
- Ujednačiti sa inventory print helper-om, ali provjeriti da helper ispravno pokriva sve kontekste i ne prihvata raw HTML bez eksplicitnog razloga.
- Testirati payload-e `</td><script>`, `img onerror`, quote/attribute, `&<>`, unicode i legitimne duge nazive.
- Provjeriti i backend generisani transfer HTML/PDF tok sa backend timom; frontend escaping nije zamjena za backend output escaping.

**Prihvatanje:** poslovni sadržaj se štampa identično i čitljivo, a injected markup se prikazuje kao tekst i ne izvršava se; nema raw business-data HTML sink-a u pregledanim print tokovima.

### 1.2 Popraviti stvarne UI runtime reference

- `TransfersPage`: uvesti ispravne registrar helper-e i ukloniti/definisati nepostojeći `setSignerEmployee`; razjasniti očekivano ponašanje pri promjeni transfer tipa.
- `equipment-installed-parts-panel`: importovati `ApiError` iz autoritativnog API modula ili koristiti zajednički type guard; catch handler ne smije bacati sekundarnu grešku.
- Provjeriti sve ostale `tsc` unresolved identifiers koje mogu biti evaluirane pri renderu/klik događaju.
- Dodati component testove za registrar render, promjenu transfer tipa i maintenance load/install/replace/error putanje.

**Prihvatanje:** nema `ReferenceError` u tim putanjama; originalni API error se čuva i prikazuje kontrolisano; testovi pokrivaju uspjeh i grešku.

### 1.3 Dependency nadogradnja

- Ponoviti `npm audit --omit=dev` i full audit na trenutnom lockfile-u prije promjene.
- Ažurirati prvo produkcijske critical/high lance (uključujući DOMPurify preko jsPDF, React Router i Socket.IO transitive pakete), zatim dev toolchain.
- Svaku grupu update-a držati odvojeno; pregledati lockfile diff, breaking changes, license/runtime size gdje relevantno.
- Ponoviti build, typecheck, testove, print/export regression i socket/auth testove.
- Advisory koji ostane dokumentovati sa affected path, exploitability za SPA konfiguraciju, workaround, risk owner i rok.

**Prihvatanje:** nema critical/high production advisory bez odobrenog izuzetka; lockfile diff je pregledan; ključni workflow testovi prolaze.

## 5. Talas 2 — type safety i test infrastruktura

### 2.1 Dodati obavezne skripte i CI gate

- Dodati stabilne `typecheck`, `test` i `lint` npm skripte. Koristiti postojeći lockfile i bez globalnog oslanjanja na `npx` koji može instalirati drugi compiler.
- Pokrenuti postojeći Node spec kroz standardnu `test` komandu.
- Dodati Vitest/React Testing Library samo ako se može održati sa postojećom Vite/React verzijom; dodati Playwright kao zaseban e2e job, ne u svaki lokalni build.
- CI redoslijed: install → lint/typecheck → unit/component → production build; e2e na staging/preview environmentu.
- Ne uključivati flaky visual/browser testove kao jedini gate prije nego što su stabilni; objaviti flaky rate i timeoutove.

### 2.2 Ugasiti compiler greške u kategorijama

Redoslijed popravke:

1. Runtime critical unresolved imports/identifiers (`TransfersPage`, `ApiError` i ostali slični nalazi).
2. API response/request DTO mismatch i lazy route loader tipovi.
3. `null`/`undefined`, narrowing i event-handler signature greške.
4. Obsolete imports, dead code i preostali strict/noUnused problemi.

Za svaku grupu:
- popravljati model/ugovor, ne ubacivati `any`, `as unknown as` ili `@ts-ignore` radi prolaska;
- ako je cast na granici API-ja nužan, izolovati ga u client parser sa runtime provjerom;
- dodati test kada greška dodiruje korisnički workflow.

**Prihvatanje:** `tsc --noEmit` prolazi bez isključivanja strogoće; svaki preostali suppression je lokalno objašnjen i vremenski ograničen.

### 2.3 Testna matrica

- Unit: guards, parsers, formatters, notification state reducer, escaping helper.
- Component: transfer form, maintenance parts panel, notifications panel, error/empty/loading state.
- API client: 401 refresh single-flight, refresh failure, token clear, abort/logout tokom in-flight requesta.
- Route matrix: role × page × feature flag; UI block potvrđuje UX, backend ostaje autorizacijski autoritet.
- Browser smoke: login, list/detail, transfer, warehouse issue/receipt, upload/download, inventory print/disposal report, public QR.

**Prihvatanje:** CI ima deterministične tests za kritične putanje i barem smoke suite za odobrene role; test podaci su synthetic i ne sadrže stvarne korisnike.

## 6. Talas 3 — API/error state, auth i notification konsistentnost

### 3.1 Uvesti zajednički UI error model

- Definisati standardne kategorije: validation, unauthorized/forbidden, not found/conflict, network/timeout, server error, partial load.
- API klijent treba izložiti stabilan error shape (`status`, `code`, request/correlation ID gdje backend podržava) bez raw secret/stack detalja u korisničkom UI-ju.
- `fetchBootstrap()` ne smije pretvarati sve greške u `[]`: odvojiti obavezne od opcionalnih resursa, vratiti partial-result state i razlog greške.
- `App.tsx` setup status grešku prikazati kao retryable service error, ne kao „setup nije potreban“.
- Napraviti reusable loading/error/empty/partial state pattern za liste i detalje; ne prepisivati postojeće rezultate praznim nizom dok novi fetch nije uspio.

**Prihvatanje:** outage/403 i validno prazan dataset imaju različit UI; korisnik može ponoviti zahtjev; postojeći validni sadržaj se ne briše tiho.

### 3.2 Cross-tab auth/session ponašanje

- Odabrati i dokumentovati ciljni model (kratkoročno Bearer token uz `storage`/`BroadcastChannel`; dugoročno procijeniti HttpOnly cookie/BFF).
- Na logout/expiry u jednoj kartici druge kartice moraju obrisati AuthContext, socket konekciju i privatni cache/state, zatim prikazati login/session expired poruku.
- Ne prenositi tokene kroz `BroadcastChannel`/storage event; prenositi samo invalidation signal. `storage` event ne radi u tabu koji je izvršio promjenu, zato lokalni event ostaje za current tab.
- Pokriti dva-tab browser test: logout, 401 expiry, token rotation race, stale API response nakon logout-a, ponovna prijava kao drugi user.
- Razmotriti čišćenje React Query/context cache-a ako se kasnije uvede query cache.

**Prihvatanje:** nakon logout-a nema vidljivog starog privatnog sadržaja u drugim tabovima; stale request ne vrati starog korisnika u state; token nikad nije broadcastan.

### 3.3 Notification API/socket ugovor

- Uskladiti DTO `message` i UI render property; tipovi moraju odgovarati stvarnom backend response-u. Ne praviti lokalni `body` alias bez centralne transformacije i testa.
- Za unread state definisati idempotentnu operaciju: ako se notification već read, drugi event ne smanjuje count; idealno state derive-ati iz notification map-e ili reconciliate sa server count-om.
- Backend nakon REST mark-read može emitovati Socket event prije/poslije HTTP response-a; testirati oba redoslijeda i ponovljene evente.
- Uskladiti metadata shape (`badgeClass`/`icon`/`label`) ili ukloniti UI očekivanje polja koje util ne daje.
- Dodati test da notification action otvara povezani zapis i ponašanje za izbrisan/nepristupačan target.

**Prihvatanje:** tekst se prikazuje; badge count je tačan nakon mark-read iz iste i druge kartice, duplog eventa i reconnect-a.

## 7. Talas 4 — API ugovor i ključni browser workflow-i

### 4.1 Uskladiti frontend/backend contract

- Za high-risk DTO-e (auth, transfers, inventory, equipment/stock, notifications, uploads) izabrati OpenAPI generation ili runtime schema validation. Ne uvoditi generisanje za cijeli API odjednom ako OpenAPI nije potpun.
- Definisati standardni error envelope, pagination shape, enum casing/date serialization i nullability.
- U CI dodati contract drift check; za trenutno ručno tipizirane dijelove dodati runtime parsiranje na API granici.
- Generisani fajlovi moraju biti deterministični i jasno odvojeni od ručno pisanih helpera.

### 4.2 Browser smoke po poslovnom toku i roli

Za svaki tok dogovoriti fixture, očekivane API pozive i status transitions:

1. Login/logout i unauthorized expiry.
2. Oprema: pretraga → detalj → QR/print.
3. Transfer: create → review → sign/finalize/cancel → document upload/download.
4. Skladište: prijem lota → izdavanje/komisija → potvrda količine.
5. Inventura: sesija/komisija → unos stavke → zatvaranje → rezultat/greška posla.
6. Maintenance: lot → install/replace/fault/remove → historija.
7. Notifications: primanje → otvaranje targeta → mark-read.
8. Public QR: prikaz samo backend-odobrenih podataka.

E2E potvrđuje UX i cross-service tok; detaljno autorizacijsko testiranje ostaje backend suite-u.

### 4.3 UX standardizacija bez redizajna

- Tabele: isti search/filter/sort/page pattern, URL-om sačuvani filteri gdje korisno, jasan broj rezultata i reset filtera.
- Forme: čuvati unos nakon server greške, mapirati field validation errors na polja, spriječiti dupli submit i dati razumljiv uspjeh/next step.
- Destruktivne akcije: prikazati šta će se tačno obrisati/zatvoriti i posljedice; potvrda ne smije sakriti grešku nakon API response-a.
- Loading/empty/partial/error: jedinstveni pattern po listama i dashboard widgetima; skeleton samo za prvi load, stale data uz refresh indikator gdje je smisleno.
- Workflow status: status label, dozvoljene akcije i audit trail moraju biti usklađeni sa backend state machine-om.

**Prihvatanje:** korisnik može završiti odobrene ključne tokove po ulozi uz razumljive greške; UI ne sugeriše uspjeh kada backend posao nije završio.

## 8. Talas 5 — deployment, pristupačnost i performanse

### 5.1 Security headers i origin

- Potvrditi response headers na produkcijskom URL-u, ne samo `frontend/nginx.conf`.
- Uvesti CSP bez `unsafe-eval`; izbjeći `unsafe-inline` gdje je moguće; print window/script treba podržati bez slabljenja glavnog origin CSP-a.
- Uskladiti CSP `connect-src` sa API, Socket.IO i deployment base URL-om; `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` prema arhitekturi.
- Smoke testirati same-origin `/backend` i API subdomain build preset koji se stvarno koristi.

### 5.2 Performanse

- Sačuvati bundle analyzer i gzip baseline; postaviti route/chunk budžet i upozorenje u CI.
- Veliki Inventory Count chunk cijepati samo ako analiza pokaže rjeđe korištene report/print/disposal dijelove koji se mogu lazy-loadovati bez UX regresije.
- Mjeriti Core Web Vitals na glavnim listama i slabijem uređaju/vezi prije i poslije.
- Izbjegavati memoization/refactor bez profiling dokaza; prvo smanjiti nepotrebne refetch-e i prevelike payload-e.

### 5.3 Accessibility i responsive review

- Provjeriti keyboard-only tokove, vidljiv focus, modal focus trap/return, semantičke label-e, table headers, status/error screen-reader announcements i kontrast.
- Testirati najvažnije forme/tabele na mobilnoj širini; odrediti gdje horizontal scroll prihvatljiv, a gdje kartični prikaz bolji.
- Ne mijenjati kompleksan layout bez testiranja sa stvarnim ulogama i poslovnim podacima anonimizovanim.

**Prihvatanje:** deployment headers i API/socket origins su dokazani; nema critical accessibility prepreke u top workflows; chunk budžet i performance baseline su dokumentovani.

## 9. Talas 6 — refaktor velikih komponenti

Refaktor samo nakon typecheck-a i karakterizacijskih testova, bez promjene poslovnog pravila u istom paketu.

### Predloženi red

1. `TransfersPage`: ispraviti runtime/type probleme, zatim razdvojiti form state, scope policy i document/status panels.
2. `InventoryCountPage`: odvojiti sesiju, komisije, line entry i report/print tabove; lazy-load rijetke akcije.
3. `EquipmentCard`/Equipment pages: izdvojiti display/print, custody actions, specs i query state.
4. Registrar stock / warehouse stock: form schemas, lot table/actions i shared quantity validators.
5. Employees/Org Units: list query, editor modal, hierarchy visualization i validation.

### Kriteriji refaktora

- Komponenta/feature test pokriva postojeće poslovno ponašanje prije izdvajanja.
- Props/state ownership je jasniji; ne uvoditi global state samo radi smanjenja props-a.
- Build output i UX latency nisu pogoršani; testirati memory/large-list ponašanje gdje relevantno.
- Accessibility/i18n tekst se ne gubi prilikom izvlačenja shared komponenti.

**Prihvatanje:** refaktor nema neodobrenu promjenu toka; testovi/typecheck prolaze; bundle i UI baseline nisu regresirali.

## 10. Release gate i definicija završenog paketa

Svaki implementacijski PR mora dokumentovati:

- Audit nalaz i reprodukciju; korisnički uticaj i role/module scope.
- Testove: unit/component/API/browser po riziku; bez tokena/PII u fixture-u.
- API/DTO promjene i backend koordinaciju; migracija nije frontend-only kada mijenja ugovor.
- Deployment/env/header/socket uticaj, rollback i feature flag ako je potreban.
- Mjerljiv acceptance criterion, na primjer: greška se vidi kao retry state, message tekst renderuje se, unread count ostaje tačan u oba event reda.

Minimalni release gate:

1. `npm ci`.
2. ESLint/lint.
3. `tsc --noEmit`.
4. Unit/component testovi.
5. Vite production build.
6. npm audit review.
7. API contract/smoke testovi.
8. Playwright smoke za odobrene role i glavni deployment URL.

Release se blokira na failing typecheck, critical test failure, stored HTML injection regression ili neodobren critical/high production advisory.

## 11. Završni kriteriji za zatvaranje frontend audita

- Print sink-ovi koji prikazuju poslovne podatke escape-uju ih; nema izvršivog markup-a.
- Transfers i maintenance error putanje nemaju unresolved runtime reference.
- Production dependency advisories riješeni ili formalno prihvaćeni.
- Typecheck i test gate su obavezni u CI.
- API greška, djelimično učitavanje i uspješno prazno stanje se jasno razlikuju.
- Cross-tab logout čisti private UI/socket/cache state; token se ne propagira među tabovima.
- Notification DTO/text/badge su usklađeni i idempotentni na REST/socket evente.
- Kritični role-based workflow-i imaju browser smoke; backend autorizacija je zasebno testirana.
- Produkcijski CSP/headers/origins su potvrđeni na live/staging response-u.
- Bundle, accessibility i responsive baseline-i su dokumentovani; veliki refaktori ne mijenjaju tok bez odobrenja.

## 12. Poslovne/UX odluke prije implementacije

1. Koje role moraju podržavati svaki od navedenih E2E tokova i koji su namjerno zabranjeni?
2. Koji je očekivani tekst/akcija za djelimično neuspjelu inventuru, transfer dokument ili upload?
3. Da li korisnik smije nastaviti rad sa stale bootstrap podacima dok se retry dešava, ili se akcije moraju blokirati?
4. Koja notification vrsta mora imati duboki link i koje informacije su sigurne u preview-u?
5. Koje maksimalne veličine/formatu printa i upload-a korisnici stvarno trebaju pristup?
6. Koje su najčešće mobilne/terenske situacije i koji workflow-i moraju biti upotrebljivi bez desktop ekrana?
7. Koji jezici/termini/statusi su autoritativni i treba li UX jezik formalno ujednačiti kroz module?
