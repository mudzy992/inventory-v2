# BACKLOG — šta je ostalo da se implementira (parcijalni pregled)

**Datum:** 2026-10-28 · Izvor: kod + CHECKLIST/HANDOFF/audit dokumenti (svaka stavka
ima dokaz gdje je zabilježena). Ovo je **parcijalni** pregled po temama i prioritetu —
ne linija-po-linija lista. Statusi svih modula: [STATUS.md](./STATUS.md).

Prioriteti: **P0** odmah (sigurnost) · **P1** sljedeća isporuka · **P2** planirani rad ·
**P3** prihvaćeni rizik / kad bude vremena.

---

## P0 — Sigurnost (nije implementacija, nego sanacija)

1. **Rotirati tajne commitovane u `fajl.md`/`fajl.txt`.** Fajlovi su obrisani
   2026-10-28, ali `DATABASE_PASSWORD` i `JWT_SECRET` i dalje postoje u git
   historiji (≤ `f58cf53`) i u GitHub klonovima.
   - Promijeniti lozinku PostgreSQL korisnika `evidens` i `JWT_SECRET` u Coolify env-u, redeploy.
   - Očistiti historiju (`git filter-repo` za `fajl.md`/`fajl.txt`) — koordinisano, uz force-push i obavijest svim klonovima.
   - Provjeriti da iste vrijednosti nisu korištene na drugim servisima istog servera.

## P1 — Funkcionalni ostaci (kod)

2. **Server-side PDF za zapisnike (popis/rashod).** Danas: HTML štampa iz browsera
   (`GET :id/report`, `:id/disposal-report` vraćaju podatke; print radi). Jedina
   otvorena stavka Full Effect CHECKLIST-a (49/50). Prenosnice su pokrivene
   Document Engine-om (DOCX → PDF) — ovo se odnosi samo na zapisnike.
3. **Inline disposal approval status na stranicama Popis / Prenosi.**
   Zabilježeno otvoreno u `.cursor/plans/inventory-v2/HANDOFF.md`; inbox za
   odobrenja postoji, fali statusni prikaz na listama.
4. **i18n infrastruktura.** U kodu **nema** i18n biblioteke ni prevodnih ključeva —
   UI je hardkodiran na bosanski. Stavka stoji otvorena od faze 4
   (`inventory-v2/CHECKLIST.md`). Ako EN ikad zatreba, ovo je zaseban projekt.
5. **OpenAPI / Postman kolekcija.** U backendu nema Swaggera (`SwaggerModule`
   ne postoji u `backend/src`). Otvoreno od faze 3. Koristilo bi za eksterne
   integracije i QA; interni rad ne zavisi od ovoga.

## P1 — QA dokazi (kod je gotov, potvrda u browseru/stagingu nije)

6. **Browser smoke — popis:** aktivacija sesije → unos linija → zatvaranje →
   close-job progress (Socket) → tab Rashod → zapisnik štampa.
   (`.cursor/plans/inventory-v2/HANDOFF.md`, `full-effect/HANDOFF.md` — nikad prođeno kao cjelina.)
7. **Evidentičar QA scenariji 1–15** (A/B ekskluzivnost, cross-issue 403,
   unija radnika A+B, lot drill-down). (`.cursor/plans/evidenticar-dodjele/HANDOFF.md`)
8. **Guard smoke protiv staging API-ja:** `npm run test:smoke:guards` +
   DevTools bypass provjera (FE zaobiđen → BE i dalje 400/403 s BS porukom).
   (`.cursor/plans/guard_audit_matrice/HANDOFF.md`)
9. **List-performance QA** s test korisnicima (4 uloge) + opcioni HTTP e2e
   (Supertest) — trenutno samo unit testovi. (`.cursor/plans/list-performance/`)
10. **Gap analysis dokumentacija ↔ kod** kao zaseban prolaz (faza 7 QA nikad
    formalno zatvorena). Ovaj registar je početak, ne zamjena.

## P2 — UX / performanse (svjesno odloženo u auditima)

11. **Dark mode — puni prelaz.** Tokeni su spremni, ali u produkcijskom kodu
    ima **0** `dark:` utilitija; djelimičan prelaz bi izgledao slomljeno.
    (`docs/frontend-code-audit-2026-10-28.md` §6.1)
12. **Redizajn poslovnih stranica na Evidens Surface.** Redizajnirani su omotač,
    prijava i 16 zajedničkih površina; poslovne stranice zadržavaju naslijeđeni
    izgled + 66 zaostalih `outline-none` koje globalni `:focus-visible` nadjačava.
13. **Virtualizacija / memoizacija velikih listi.** Nema `React.memo`; chunk
    `InventoryCountPage` je 495 kB (budžet 520 kB ga samo sprječava da raste).
    Traži profilisanje na produkcijskim podacima prije optimizacije.
14. **Kanonski frontend image.** Postoje dva: `frontend/Dockerfile` (nginx, :80,
    koriste ga oba compose fajla) i `frontend/Dockerfilefr` (`serve`, :3000,
    opisan u Coolify napomenama). Potvrditi koji se zaista deploya, drugi ukloniti.
15. **Sitnice iz list-performance HANDOFF-a:** NestJS `compression` middleware;
    signer preview fetch po ID-u u TransfersPage.

## P2 — Operativa / deployment (vlasnički koraci, alat postoji)

16. **MANUAL provjere iz deployment readinessa:** SAN certifikata za
    PostgreSQL/Redis hostname (`TLS_VERIFIED=true` kad se potvrdi), live
    `ACL GETUSER` za Redis kanale, `TRUST_PROXY_HOPS` prema stvarnoj topologiji,
    `BACKEND_REPLICAS` + `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` ako ikad bude
    više replika. (`docs/deployment-readiness.md`)
17. **Staging p95 load test na produkcijskom datasetu** (`scripts/load-test.mjs`) —
    CI provjerava harness i matematiku, ne stvarne brojeve.
18. **Podaci prije go-live popisa:** `Warehouse.orgUnitId` za svaku distribuciju;
    seed uskladiti s popisom v3; migracije na serverskoj bazi + prod smoke na
    `evidens.ba101.top`. (`.cursor/plans/inventory-v2/HANDOFF.md`)

## P3 — Prihvaćeni rizici (dokumentovano, ne dirati bez odluke)

19. **JWT u `localStorage`.** Prelaz na httpOnly cookie/memory traži izmjenu
    backend auth toka; ublaženo kratkim access TTL-om i rotacijom refresh tokena.
    (`docs/frontend-code-audit-2026-10-28.md` §6.5)
20. **Usklađivanje `popisni-rashod-faza5/CHECKLIST.md`.** Fajl tvrdi da scheduler,
    production-mode servis i migracija `20260615120000` nisu urađeni — u kodu
    postoje (`inventory-scheduler` modul, `InventoryProductionModeService`),
    a migracije su u međuvremenu svedene na PostgreSQL baseline. Ili ga
    uskladiti, ili ga označiti historijskim kao ostale planove.
