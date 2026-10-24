# Frontend — inventar, audit i fazni plan

**Pregled:** statički audit React/TypeScript frontend-a (kod, zavisnosti, test/build konfiguracija i frontend Docker/Nginx)  
**Datum pregleda:** 24.10.2026.  
**Izvor istine:** `frontend/src`, `frontend/package.json`/lockfile, `frontend/tsconfig.json`, Vite, Docker i Nginx konfiguracija.  
**Opseg:** analiza autentikacije/tokena, API klijenta, ruta i UI autorizacije, globalnog stanja, glavnih domena, HTML/print tokova, zavisnosti, testova, build-a i isporuke SPA-a. Nisu pregledani produkcijski response headers, CORS/TLS/firewall, browser telemetry niti izvršen penetration test.

> Ovo je preventivni plan na osnovu repozitorija; ne mijenja aplikacijski kod i ne potvrđuje ponašanje stvarnog deployment-a. Autoritativna kontrola pristupa i validacija moraju ostati na backendu.

## 1. Sažetak za odluku

Frontend je sadržajno bogat SPA: React 19, TypeScript sa `strict: true`, Vite 7, React Router 7 i Tailwind 4. Ima centralni API klijent sa Bearer tokenima, osvježavanje tokena sa single-flight zaštitom, lazy loading stranica i centralne UI role/feature guards. Uređeni DOM prikazi koriste React tekstualno renderovanje; inventory print helper zasebno escape-uje HTML vrijednosti — dobar obrazac koji treba primijeniti svuda gdje se pravi HTML string.

Najvažniji problemi su konkretni, ne samo stilski: dva `document.write()` print toka interpoliraju nepouzdane poslovne podatke bez HTML escaping-a; `TransfersPage` referencira neimportovane funkcije i nepostojeći setter, a TypeScript provjera trenutno prijavljuje **98 grešaka**. Vite produkcijski build ipak prolazi jer `vite build` transpilira TS, ali ne izvršava `tsc`. Nema frontend test/lint/typecheck skripte, a runtime dependency audit prijavljuje critical/high advisories.

### Ocjena

| Oblast | Ocjena | Obrazloženje |
|---|---:|---|
| Arhitektura i podjela UI domena | 6.5/10 | Oko 20 privatnih stranica i javni QR page su lazy-loaded i API/context/shared UI su izdvojeni; više stranica i komponenti i dalje ima 500–886 LOC. |
| Autentikacija i API klijent | 6.5/10 | Centralni Bearer klijent, refresh single-flight i čišćenje tokena pri logout-u su dobri; access i refresh token se čuvaju u `localStorage`, pa XSS ima visok uticaj. |
| UI route/role guards | 7.0/10 | Postoje centralni role i feature guards; to je samo UX sloj, ne security boundary. Server-side provjere su obavezne i auditovane odvojeno. |
| Sigurnost prikaza / XSS | 4.0/10 | Dva konkretna HTML print sink-a direktno interpoliraju DB/DTO podatke u `document.write()` prozor istog origin-a. |
| API ugovor i error handling | 5.5/10 | Jedan transport sloj i typed DTO-ovi postoje, ali podaci se cast-aju bez runtime shema; bootstrap namjerno hvata više API grešaka i vraća prazne liste. |
| Dependency sigurnost | 4.5/10 | `npm audit --omit=dev` prijavio je 6 nalaza: 1 critical, 4 high, 1 moderate; svi imaju dostupnu nadogradnju. |
| Type safety / build gate | 3.5/10 | `vite build` prolazi, ali `npx tsc --noEmit` pada sa 98 dijagnostika; build skripta ne pokreće typecheck. |
| Testovi | 3.0/10 | Nema `test`, lint ili typecheck npm skripte; postoji jedan `node:test` spec fajl (~10 testova), bez integracionih/browser testova. |
| UI performanse | 5.5/10 | Stranice se lazy-loaduju, ali `InventoryCountPage` chunk je oko 495 kB prije gzip-a / 157 kB poslije gzip-a; veliki page moduli otežavaju dalje cijepanje. |
| Isporuka / sigurnosni browser header-i | 5.0/10 | Docker multi-stage build je razumljiv; repo Nginx config ne postavlja CSP ni druge browser security headers. Edge/proxy može ih dodavati — potvrditi produkciju. |
| **Kompletan frontend** | **5.4/10** | Funkcionalno širok SPA sa korisnom osnovom; XSS sink-ovi, TypeScript/runtime greške i nedostatak automatske provjere su release rizici. |

Ocjene su heurističke i služe za prioritizaciju popravki, ne predstavljaju runtime pentest niti tvrdnju da je svaki npm advisory eksploatabilan u ovoj konfiguraciji.

## 2. Inventar frontend-a

- `frontend/src`: oko **254 source fajla**, **33.6k LOC**; 132 `.tsx` i 121 `.ts` fajl prema trenutnom inventaru.
- Root: `App.tsx`, `main.tsx`, provider composition i Vite/Tailwind entry point.
- API: **31** API/transport modul u `src/api`; svi koriste centralni `apiRequest()` ili `fetchAuthenticatedBlob()` osim auth-refresh toka koji direktno poziva isti base URL.
- UI: komponente podijeljene na top-level stranice, `components/ui`, domenske foldere (transfers, inventory-count, warehouses, registrar-stock, categories, maintenance-parts, user-management), hooks, contexts, helpers i guards.
- Routing: privatne stranice su lazy-loaded; javna QR oprema ima zasebnu javnu rutu. `RequireRole` i `RequirePageEnabled` sprečavaju neželjenu navigaciju u UI-ju.
- Testovi: jedan `src/helpers/guards/guards-phase-c.spec.ts` sa Node `node:test`; `package.json` nema `test`, `typecheck` ili `lint` script.

### Dobar postojeći obrazac

`inventory-print-document.util.ts` centralno escape-uje HTML vrijednosti prije `document.write()`. `AuthContext` i API klijent centralizuju login/refresh/logout, a `api/client.ts` dijeli refresh request među paralelnim 401 odgovorima. `AppRouter` lazy-loaduje stranice; `RequireRole`/`RequirePageEnabled` smanjuju slučajne UI izloženosti; kontrola backend endpointa ostaje konačna zaštita.

## 3. Nalazi po prioritetu

### P1 — riješiti prije narednog production release-a

1. **Stored XSS u printu zapisnika rashodovanja.** `DisposalReportSheet` sastavlja HTML string i šalje ga u novi `window.open()` prozor preko `document.write()`. U HTML bez escaping-a ulaze inventurni broj, kategorija, skladište, note/napomene, naziv komisije, predsjednik/članovi, naziv popisne sesije i org-jedinica. Npr. `reviewNote`/`lineNote` može završiti u `<td>`; HTML payload (`</td><script>…</script>` ili event-handler atribut) izvršava se u same-origin prozoru kada korisnik pritisne „Štampaj“. To može ugroziti token-e u `localStorage` i nalog korisnika koji pregleda izvještaj. Escape-ovati svaki tekstualni čvor/atribut sa jednom provjerenom funkcijom ili konstruisati DOM preko `textContent`; dodati testove sa script, closing-tag i image-onerror payload-ima.
2. **Stored XSS u QR printu opreme.** `EquipmentCard.handlePrintQR()` ubacuje `displayName`, `uniqueFieldsSummary`, `equipmentLabel`, `cat.name` i vrijednosti iz `qrFilenameLabel` u HTML koji ide u `printWindow.document.write()`. Dio vrijednosti dolazi iz kategorija i specifikacija opreme. Sve ove vrijednosti moraju se tretirati kao nepouzdane, čak i kad ih obično mijenja admin/evidentičar. Escape-ovati kontekstualno; ne interpolirati proizvoljne vrijednosti u `<title>` ili HTML; izbjegavati raw `innerHTML` kopiranje gdje je moguće. Dodati XSS regression tests.
3. **Transfers stranica ima TypeScript greške koje postaju runtime greške.** `TransfersPage.tsx:106,111,159,303,318` poziva `hasRegistrarModeAAssignment`/`hasRegistrarModeBAssignment` bez importa iz `helpers/registrar-scope.ts`. Kada `evidenticar` otvori stranicu, prvi render evaluira nepostojeći identifier i može srušiti stranicu. Handler promjene tipa transfera poziva `setSignerEmployee(null)` na liniji 300, ali takav state setter nije definisan; interakcija može baciti `ReferenceError`. Ovo je konkretan funkcionalni blocker, ne samo type-style upozorenje. Dodati tačne importe/ukloniti zastarjeli poziv, pa pokriti registrar workflow komponentnim testom.
4. **Production dependencies imaju critical/high advisories.** `npm audit --omit=dev` na lockfile-u prijavljuje **6 nalaza** (1 critical, 4 high, 1 moderate), sa dostupnim popravkama. Glavne stavke: transitive `dompurify@3.4.11` kroz `jspdf@4.2.1` (critical advisory range do 3.4.16), `react-router@7.17.0`/`react-router-dom@7.17.0`, `ws@8.20.1` kroz `socket.io-client`, te `socket.io-parser@4.2.6`. Potrebna je kontrolisana lockfile nadogradnja, provjera promjena i ponovni build/typecheck/audit; nemojte pretpostaviti da je RSC advisory direktno primjenjiv na SPA bez SSR-a. Puni audit (dev + production) prijavio je **13** (1 critical, 9 high, 2 moderate, 1 low), uključujući Vite 7.3.2/dev tooling.
5. **Build pipeline prešućuje TypeScript greške.** `npm run build` (`vite build`) je prošao, ali `npx tsc --noEmit` pao je sa **98 TypeScript dijagnostika** kroz API, stranice i lazy route loaders. Greške uključuju pogrešne DTO tipove, neispravne lazy loader tipove, obsolete/unresolved imports i nekonzistentne modele; gore opisani `TransfersPage` slučaj ima vidljiv runtime efekat. Dodati `typecheck` skriptu i obavezni CI gate koji pokreće `tsc --noEmit` prije build/deploy-a; popraviti greške po prioritetu, ne gasiti `strict` ili `noUnused*` da bi se dobio zeleni build.

### P2 — zatvoriti u narednom ciklusu

6. **Access i refresh tokeni se čuvaju dugoročno u `localStorage`.** `token-storage.ts` migrira vrijednosti iz `sessionStorage` u `localStorage`, a zatim čita/piše oba tokena u persistent storage. Browser JavaScript i svaki same-origin XSS mogu ih pročitati; migracija dodatno uklanja session-only ponašanje. Preferirati HttpOnly, Secure, SameSite cookie/BFF dizajn ako deployment to podržava. Ako se Bearer token model zadrži, smanjiti refresh token izloženost/TTL gdje je moguće, primijeniti strogi CSP i tretirati svaki HTML sink kao security-critical.
7. **Nginx frontend config ne postavlja browser security headers.** `frontend/nginx.conf` sadrži samo SPA fallback i statički `/health`; nema CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ni `frame-ancestors` zaštite. TLS/HSTS treba postavljati na TLS terminatoru, a CSP/ostale headere u Nginx-u ili provjerenom edge proxy-ju. Pošto proxy nije u scope-u, potvrditi stvarni production response headers prije klasifikacije kao aktivne izloženosti. CSP treba biti kompatibilan sa Vite buildom i ukloniti inline script iz QR print template-a.
8. **Bootstrap reference-data greške se tiho prikazuju kao uspješan prazan dataset.** `fetchBootstrap()` dodaje `.catch(() => [])` za org units, kategorije, obavijesti, lokacije i skladišta. API outage/403 tako može završiti kao prazan izbor/lista, a `DataContext` ne postavi error jer `fetchBootstrap` resolve-a. To otežava dijagnostiku i može dovesti do pogrešnog rada korisnika. Razlikovati obavezne od opcionalnih poziva, prikazati partial-load warning i zadržati razlog/endpoint/status; ne pretvarati sve greške u `[]`.
9. **Setup status failure se tretira kao „setup nije potreban“.** `App.tsx` hvata svaki `fetchSetupStatusApi()` error i postavlja `needsSetup=false`; backend outage, CORS greška ili 5xx zato izgledaju kao normalna login stranica, bez mogućnosti korisniku da razlikuje problem servisa. Dodati `status error` state/retry poruku umjesto lažnog uspjeha.
10. **Malo testova i nema UI/API ugovornog testa.** Jedini spec testira čiste guard/helper funkcije; nema testova za AuthContext/refresh races, route role matrix, form submit, print/XSS, API error/loading state, real browser, responsive layout ili end-to-end glavne tokove. Uvesti Vitest + React Testing Library za unit/component i Playwright smoke za login → zaduženje → print/upload, plus regresije za P1.
11. **Deployment base URL ima više podržanih oblika koji traže env test.** `api-base.ts` vraća `/backend` u dev-u i `VITE_API_URL`/fallback u productionu; compose production podešava same-origin `/backend`, dok Dockerfile default postavlja zasebni `api.evidens.ba101.top`. Socket origin/path se izvode iz istog URL-a, što je dobar obrazac, ali CORS, cookie/origin granice i socket putanja zavise od toga koji build/deployment preset je zaista aktivan. Uvesti smoke test za compose/proxy i fail-fast validaciju production `VITE_API_URL` umjesto tihog fallback-a.

### P3 — performanse i održivost

12. **Velike page komponente i chunkovi.** Top-level stranice uključuju `EquipmentByCategoryPage` (~886 LOC), `InventoryCountPage` (~862), `registrar-stock-page` (~857), `EquipmentPage` (~807), `EquipmentCard` (~761), `EmployeesPage` (~675), `OrganizationPage` (~621) i `CategoriesPage` (~535). Build generiše `InventoryCountPage` chunk od ~495 kB / ~157 kB gzip. Nastaviti code splitting po tabu/print/export flow-u i izvlačiti use-case/UI komponente uz testove i mjerenje bundle-a.
13. **API DTO-i su ručno duplirani bez contract check-a.** Frontend tipovi su lokalni, `apiRequest<T>` radi compile-time cast bez runtime validacije; veliki broj TS grešaka pokazuje drift/nekonzistentne DTO oblike. Razmotriti OpenAPI client generation ili zajednički schema contract, a za najvažnije write/read payload-e validirati granice runtime-om.
14. **Klijentske role guards su samo navigacijski sloj.** `RequireRole` i `RequirePageEnabled` pravilno ograničavaju UI i route, ali ne mogu zaštititi podatke ni endpoint. Svaki write/read endpoint mora server-side autorizovati request; frontend ne smije tretirati skriveni link ili feature flag kao dozvolu.
15. **Print implementacije nisu ujednačene.** Inventory print helper escape-uje vrijednosti, ali Disposal Report i QR print koriste inline template string/`document.write()`. Uvesti jednu testiranu print abstraction koja default-escape-uje tekst i ne prihvata raw HTML; svaku iznimku učiniti eksplicitnom.

### Tragovi u kodu za ključne nalaze

| Nalaz | Primarni izvor |
|---|---|
| HTML sink u Disposal Report printu | `frontend/src/components/inventory-count/disposal-report-sheet.tsx:19-86` (`${...}` polja iz report DTO-a, `window.open`, `document.write`). |
| HTML sink u Equipment QR printu | `frontend/src/components/EquipmentCard.tsx:172-178`, `:241-271`; `displayName`/unique field values u `helpers/equipment-display.util.ts:17-46`. |
| Neimportovani transfer helperi i setter | `frontend/src/components/TransfersPage.tsx:106-114`, `:159`, `:292-305`, `:318`; helper exports u `frontend/src/helpers/registrar-scope.ts:284-288`. |
| Persistent Bearer tokeni u browser storage | `frontend/src/api/token-storage.ts:1-42`; Authorization header u `frontend/src/api/client.ts:59-75`. |
| Bootstrap greške se svode na prazne liste | `frontend/src/api/data-api.ts:15-42`; potrošnja u `frontend/src/contexts/DataContext.tsx:46-68`. |
| Setup status fallback na false | `frontend/src/App.tsx:28-38`. |
| Typecheck se ne izvršava u build skripti | `frontend/package.json:6-10`; strict options u `frontend/tsconfig.json`; `frontend/vite.config.ts:17-53` nema TS checker plugin. |
| Versioni na dependency audit-u | `frontend/package.json:14-33`; resolved verzije preko `frontend/package-lock.json`; dependency stablo potvrđeno sa `npm ls`. |
| Nedostaju browser security headers u repo Nginx config-u | `frontend/nginx.conf:1-17`. |
| Različiti API base URL deployment režimi | `frontend/src/api/api-base.ts:1-11`; `frontend/Dockerfile:13-19`; `docker-compose.prod.yml:126-135`; Socket origin/path u `frontend/src/api/socket-client.ts:10-38`. |
| Inventory print helper koji escape-uje HTML | `frontend/src/components/inventory-count/inventory-print-document.util.ts:32-44`, `:181-223`. |

## 4. Ocjena po frontend modulu

Ocjene su za kvalitet implementacije u repozitoriju (sigurnost, ispravnost, pokrivenost i održivost), ne za poslovnu vrijednost modula.

| Modul / površina | Ocjena | Kratak nalaz |
|---|---:|---|
| Auth context + token storage | 5.5/10 | Refresh/clear flow centralizovan; storage u `localStorage` povećava XSS impact. |
| API client + refresh | 6.8/10 | Centralni fetch, Bearer header, single-flight refresh; DTO runtime validation nedostaje. |
| Routing + role guards | 7.0/10 | Lazy routing i centralna matrix su dobri; ostaju UX-only, ne server security. |
| App bootstrap + DataContext | 5.5/10 | Jednostavan provider model; bootstrap greške se maskiraju praznim kolekcijama. |
| Socket/notifications | 6.5/10 | Dijeljeni socket, reconnect i polling fallback; testovi/multi-session edge cases nedostaju. |
| Settings contexts + feature flags | 6.0/10 | Javni/privatni settings su odvojeni; fail-open fallback/default ponašanje treba prikazati kao degradaciju. |
| Setup wizard + login | 6.3/10 | Tokovi su jasni; setup-status network greška se maskira kao normalna login putanja. |
| Public equipment/QR view | 6.8/10 | Zasebna javna ruta i lazy page; privacy/access rate limits zavise od backend-a. |
| Dashboard | 6.5/10 | Paginirani summary API pozivi; veliki broj stranica nema izolovane loading/error tests. |
| Equipment + QR card | 4.5/10 | Glavna oprema UI radi kroz shared APIs, ali QR print ima stored-XSS sink. |
| Categories + equipment catalog | 6.5/10 | Domain UI i guard utili su izdvojeni; category editor polja traže contract/regression tests. |
| Employees + profiles | 6.0/10 | Autocomplete/profile/modal funkcije široke; neke state/type greške i test gap. |
| Transfers + document workflow | 4.8/10 | Bogat workflow, ali `TransfersPage` ima runtime missing identifiers; document preview/download testirati. |
| Inventory count + print | 5.8/10 | Velik, lazy chunk i značajan feature surface; inventory print je escape-ovan, disposal print nije. |
| Disposal commissions/report | 4.3/10 | Report HTML print direktno interpolira poslovne vrijednosti; XSS P1. |
| Warehouses + templates | 6.5/10 | Detail/stock/template UI podijeljen po komponentama; upload limit/provjera stvarnog fajla ostaje backend odgovornost. |
| Warehouse stock + registrar stock | 6.0/10 | Velik page i kompleksne forme; DTO type mismatches i integration testovi nedostaju. |
| Maintenance parts | 5.8/10 | Izdvojen domain folder, ali typecheck prijavljuje nedostajuće `ApiError` reference. |
| Org units + locations | 6.3/10 | Page-level CRUD i autocomplete; typecheck prijavljuje neispravne API import/use i unknown response. |
| User management + scope UI | 6.2/10 | Scope forme dobro izdvojene; type contract i end-to-end role matrix treba potvrditi. |
| Shared UI + accessibility | 6.3/10 | Reusable table/modal/button/layout primitives; formalni accessibility audit nije rađen. |
| Guards + helpers | 7.0/10 | Neki čisti policy/util helperi i jedini test suite; izolovani util testovi ne pokrivaju browser ponašanje. |
| Build + TypeScript gate | 3.5/10 | Produkcijski bundle se gradi, ali 98 grešaka ostaje van Vite build koraka. |
| Test infrastructure | 3.0/10 | Nema npm test/lint skripte, component/e2e suite ni CI evidence u frontend paketu. |
| Nginx + frontend image | 5.0/10 | Multi-stage static build i SPA fallback postoje; security headers nisu u verzionisanom Nginx config-u. |
| Bundle/performance | 5.5/10 | Lazy load je dobar početak, ali largest page chunk je ~495 kB i pages su prevelike. |

## 5. Fazni plan implementacije

Faze su inkrementalne; ne raditi dependency update, XSS fix i velike UI refaktore kao jedan neprovjerljiv paket.

### Faza 0 — baseline i reprodukcija

1. Zabilježiti `npm ci`, `npm run build`, `npx tsc --noEmit` i `npm audit` rezultate; sačuvati lockfile baseline.
2. Napraviti reprodukcijski test XSS-a u izolovanom browser testu za oba print prozora, bez pokretanja payload-a na produkciji.
3. Potvrditi stvarni `VITE_API_URL`, production origin, response security headers i edge TLS/CSP konfiguraciju.
4. Exit: frontend build/version/environment i trenutni 98 type errors reproduktivno zabilježeni.

### Faza 1 — XSS, route crash i dependency hardening

1. Ukloniti raw HTML interpolaciju iz Disposal Report printa i Equipment QR printa; koristiti text nodes ili centralni escape helper za HTML text/attribute kontekst; test payload-e.
2. Popraviti `TransfersPage` helper importe i nepostojeći `setSignerEmployee`, dodati test za `evidenticar`/admin osnovne transfer korake.
3. Kontrolisano ažurirati production vulnerable packages (`dompurify`, React Router, Socket.IO transitive `ws`/parser); zatim dev toolchain; pregledati lockfile diff i ponoviti audit/build/typecheck.
4. Dodati CSP i osnovne security headers na frontend server ili verificirani edge; ukloniti inline print script i utvrditi minimum CSP bez unsafe-inline ako je izvodljivo.
5. Odlučiti token arhitekturu: HttpOnly cookie/BFF preferirano; ako se zadrži localStorage, dokumentovati residual XSS risk i ograničiti refresh token lifetime/reuse.

**Exit kriterij:** nema raw stored-data HTML sink-a bez escaping/sanitization, ključni transfer page se renderuje za evidentičar/admin, nema critical/high production advisories bez dokumentovanog risk acceptance-a, i production headers su provjereni.

### Faza 2 — obavezna type/test CI zaštita

1. Dodati `typecheck` (`tsc --noEmit`) i CI gate; prvo riješiti direktne runtime greške, zatim sve compile greške po domenskim paketima.
2. Dodati `test` skriptu (Vitest/RTL ili Node test runner sa stabilnim TS loaderom) i pokrenuti postojeći guard spec.
3. Uvesti unit/component tests za API refresh/logout, `RequireRole` matrix, `fetchBootstrap` partial error, form guard funkcije i P1 print sanitization.
4. Dodati lint script s dogovorenim formatter/eslint pravilima; ne uvoditi auto-fix koji mijenja cijeli frontend zajedno sa funkcionalnim popravkama.

**Exit kriterij:** clean typecheck, deterministički unit/component suite u CI, `vite build` nakon testova.

### Faza 3 — pouzdanost podataka i browser tokovi

1. Razdvojiti obavezne od opcionalnih bootstrap poziva; partial errors prikazati sa retry akcijom i ne zamijeniti ih neprimjetno praznim podacima.
2. Dodati testove auth refresh race, logout tokom in-flight fetch-a, socket reconnect i korisničku promjenu; prekinuti/ignorirati stale fetch rezultate nakon unmount/logout-a gdje je potrebno.
3. Dodati Playwright smoke/e2e: login po rolama, list/detail, transfer, upload/preview, inventory print, disposal report, public QR.
4. Validirati role/feature route matrix kao UX; paralelno provjeriti backend endpoint matrix — sakrivanje rute nije autorizacija.

**Exit kriterij:** nema uncaught UI errors u definisanim top workflow-ima; bootstrap degradacija je vidljiva; browser smoke prolazi za glavne role.

### Faza 4 — operativna isporuka i performanse

1. Potvrditi nginx/edge CSP, HSTS na TLS terminatoru, `nosniff`, referrer/permissions/frame policy, static cache headers i `/health` semantics.
2. Validirati deployment mode (same-origin `/backend` ili API subdomain) za REST i Socket.IO, uz CORS/CSP/connect-src test iz production build-a.
3. Smanjiti Inventory Count route chunk odvajanjem rjeđe korištenih report/print/disposal flow-ova; pratiti gzip budgets i Web Vitals.
4. Postaviti route-level error boundary i telemetry/structured client errors bez tokena, PII ili request payload-a.

**Exit kriterij:** security headers dokazani na production URL-u; defined bundle budget; client errors/latency vidljivi bez osjetljivih podataka.

### Faza 5 — refaktor i dizajn sistema

1. Izdvajati stranice veće od ~500 LOC u feature podkomponente uz characterization tests, redom Transfers → Inventory Count → Equipment → Registrar Stock → Employees.
2. Standardizovati API DTO contract generation/runtime validation i shared query/pagination helpers.
3. Ujednačiti štampu/PDF/CSV eksport kroz testirane output builders i centralnu sanitization/escaping politiku.
4. Napraviti accessibility review: labels, keyboard focus, modal focus trap, screen-reader status/error najave, kontrast i responsive tablice.

**Exit kriterij:** refaktori nemaju promjenu poslovnog ponašanja bez specifičnog odobrenja; tests/typecheck prolaze, a chunk/UX baseline ostaje bez regresije.

## 6. Predloženi red rada po modulu

| Red | Modul(i) | Prva konkretna stavka | Prioritet |
|---:|---|---|---|
| 1 | Print/XSS | Disposal report i QR print escape/test; inventory print helper zadržati kao referentni obrazac. | P1 |
| 2 | Transfers | Import registrar helpera, ukloniti nedostajući setter, role-based component test. | P1 |
| 3 | Frontend dependencies | Patch runtime critical/high, pa dev advisories; `npm audit` + lockfile review. | P1 |
| 4 | TypeScript/CI | Dodati `typecheck`, popraviti 98 grešaka, zabraniti build bez typecheck-a. | P1 |
| 5 | Token/Auth | Procijeniti HttpOnly cookie/BFF ili smanjiti residual token exposure i uvesti CSP. | P2 |
| 6 | Bootstrap/API client | Partial-error model, retry i response DTO contract. | P2 |
| 7 | Nginx/deployment | Dokazati production response headers, URL mode i socket connectivity. | P2 |
| 8 | Test infrastructure | Test runner, component suite i Playwright smoke najvažnijih workflow-a. | P2 |
| 9 | Inventory/Equipment/Registrar pages | Chunk budget + page decomposition uz karakterizacione testove. | P2/P3 |
| 10 | Remaining UI modules | Accessibility i consistent loading/error/empty-state pregled. | P3 |

## 7. Kvalitet i ograničenja ovog audita

- `npm ci` je prošao iz zaključanog lockfile-a.
- `npm run build` je prošao: Vite 7.3.2 generisao produkcijski bundle; build **ne** radi TypeScript typecheck.
- `npx tsc --noEmit` pao je sa **98** dijagnostika kroz API, routes i komponente; puna lista trenutno je u `/tmp/frontend-tsc-errors.txt` u ovom sandboxu (privremeni fajl, nije dio deliverable-a).
- `npm audit --omit=dev`: **6** dependency advisories (1 critical, 4 high, 1 moderate), fixes su označeni kao dostupni. Cijeli dependency tree: **13** (1 critical, 9 high, 2 moderate, 1 low). Ponoviti audit nakon update-a.
- Paket nema `test`, `lint` ni `typecheck` npm skriptu. Jedan Node test fajl postoji, ali tokom ovog audita nije izvršen jer nema repo test runner skripte.
- Nisu izvršeni browser E2E, accessibility, live API, production response-header, CORS, performance/real-device ili penetration testovi.
- Osim repozitorijskog Nginx-a, reverse proxy/TLS termination konfiguracija nije dostupna u ovom scope-u; security-header i origin nalazi su provjere deployment-a gdje je tako označeno.

**Zaključna ocjena:** frontend ocjenjujem sa **5.4/10**. Brzi dobitak su XSS popravke na print tokovima, funkcionalni fix Transfers stranice, dependency update i obavezni typecheck/CI. Povećavati ocjenu tek nakon potvrđenog clean typecheck-a, regression/browser testova i pregleda stvarnih production security headers/origin podešavanja.
