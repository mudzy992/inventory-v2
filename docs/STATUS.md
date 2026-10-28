# STATUS — jedinstveni registar: šta je završeno, šta nije

**Datum registra:** 2026-10-28 · **Grana:** `arena/fee90785-inventory-v2` · **HEAD pri izradi:** `f58cf53`
Ovo je **jedini izvor istine za status**. Pojedinačni plan/HANDOFF fajlovi u
`.cursor/plans/` su historijski zapisi sesija — njihovi `[ ]` checkboxi se
**ne** ažuriraju retroaktivno; važeći status je ovdje + u CHECKLIST fajlovima
koji se aktivno održavaju ([full-effect CHECKLIST](../.cursor/plans/full-effect/CHECKLIST.md),
[matrice](../.cursor/docs/matrices/INDEX.md)). Preostali posao: [BACKLOG.md](./BACKLOG.md).

**Legenda:** ✅ završeno (dokaz u kodu/CI) · 🟡 djelimično / kod gotov, dokaz ili
operativni korak otvoren · ⬜ nije implementirano · 🗄 historijsko (ne dirati, samo referenca)

---

## 1. Aplikacija po domenima (backend + frontend + matrica)

| # | Domen | Backend modul | Frontend | Matrica | Status |
|---|-------|---------------|----------|---------|--------|
| 1 | Auth / sesija | `auth` | LoginPage | `auth-session` | ✅ |
| 2 | Uloge i pristup (admin, evidentičar A/B, moderator, skladištar, koordinator) | `users`, scope servisi | UserManagementPage | `roles-access`, `moderator` | ✅ |
| 3 | Postavke / feature flagovi | `settings` (+ `GET /settings/effective`) | settings-page | `settings` | ✅ |
| 4 | Org. hijerarhija + efektivni potpisnik/lokacija | `org-units` | OrganizationPage | `org-hierarchy` | ✅ |
| 5 | Lokacije (kantoni/gradovi) | `locations` | LocationsPage | `locations` | ✅ |
| 6 | Skladišta + skladištari | `warehouses` | WarehousesPage | `warehouses` | ✅ |
| 7 | Kategorije + dinamička polja | `categories` | CategoriesPage | `categories-fields` | ✅ |
| 8 | Oprema + statusi + QR | `equipment`, `equipment-catalog`, `public-equipment` | EquipmentPage, EquipmentByCategoryPage, MyEquipmentPage, QRScannerPage | `equipment-status`, `labels` | ✅ |
| 9 | Prenosnice (zaduženje/razduženje/rashod, potpis, RAW/scan dokument) | `transfers`, `uploads`, `documents` | TransfersPage, DocumentsPage | `transfers` | ✅ (server-PDF zapisnika: 🟡 v. BACKLOG) |
| 10 | Skladišna roba / lotovi (prijem, FIFO, izdavanje) | `warehouse-stock` | registrar-stock-page, warehouse-stock-receive-page | `warehouse-stock` | ✅ |
| 11 | Održavanje / ugrađeni dijelovi | `maintenance-parts` | (komponente `maintenance-parts`) | `maintenance-parts` | ✅ |
| 12 | Premještaj radnika | `employee-relocation` | employee-relocation-page | `employee-relocation` | ✅ |
| 13 | Radnici | `employees` | EmployeesPage | `employees` | ✅ |
| 14 | Godišnji popis (sesije, komisije, freeze, close job, rashod iz popisa) | `inventory-count`, `inventory-scheduler` | InventoryCountPage, warehouse-inventory-page | `inventory-count` | ✅ (ručni browser smoke: 🟡) |
| 15 | Komisija rashoda | `disposal-commissions` | DisposalCommissionsPage | `disposal-commission` | ✅ |
| 16 | Notifikacije (REST + Socket.IO + outbox) | `notifications` | zvono/toast u omotaču | `notifications` | ✅ |
| 17 | First-run setup / onboarding | `setup` | setup-wizard-page | `install-setup`, `setup-onboarding` | ✅ |
| 18 | Performanse listi (paginacija, prefetch, scope keš) | zajednički utils | liste svih stranica | `list-performance` | 🟡 kod ✅, ručni QA otvoren |
| 19 | Navigacija po ulozi | `nav` | routes/guards | `roles-access` | ✅ |
| 20 | Health / metrike / observability | `health` (9+ periodičnih signala) | — | — | ✅ |

Sve matrice: 22 modula u [.cursor/docs/matrices/](../.cursor/docs/matrices/INDEX.md)
(svaki `MATRIX.md` + `CHANGELOG.md`) + [GUARDS_REGISTRY.md](../.cursor/docs/matrices/GUARDS_REGISTRY.md) (636 linija).

## 2. Veliki implementacijski programi

| Program | Opseg | Status | Dokaz |
|---------|-------|--------|-------|
| Inventory v2 faze 0–12 | foundation → domain → transfers → frontend → realtime → deploy → lokacije → skladišta/naljepnice → rashod → popis | ✅ | `.cursor/plans/inventory-v2/CHECKLIST.md` (usklađen 2026-10-28) |
| Full Effect faze 13–18c | potpisnik, evidentičar A/B, transferi v2, uništenje, popisni rashod, UI | ✅ 49/50 | `.cursor/plans/full-effect/CHECKLIST.md`; jedino ⬜: server-PDF (opciono) |
| Skladišni lot + evidentičar (2026-06-03) | `WarehouseStockLot`, WH komisije popisa | ✅ 100% | `skladišni_lot_i_evidentičar/CHECKLIST.md` |
| Popisni rashod — faza 5 | scheduler, production mode, disposal lista | 🟡 kod postoji (`inventory-scheduler`, `InventoryProductionModeService`), CHECKLIST fajl je zastario i nije usklađen s baseline migracijama | v. BACKLOG §4 |
| Modul A (BM-1..BM-6) | poslovne nelogičnosti, `GET /settings/effective`, role/page matrica | ✅ sve faze 1–5 | `docs/module-a-business-matrix.md` (status ispravljen 2026-10-28) |
| Modul B (BM-B1..BM-B6) | print/QR modernizacija, Evidens Surface, bundle budžet | ✅ sve faze 1–4 | `docs/module-b-print-qr.md` (status ispravljen 2026-10-28) |
| Backend audit N-1..N-15 + N-5..N-15 zatvaranja | sigurnost, performanse, recovery, metrike | ✅ ocjena ~9.5/10 | `docs/backend-code-audit-2026-10-27.md` |
| Frontend audit F-1..F-12 | a11y, dizajn sistem (29 tokena), Vitest, bundle budžet | ✅ ocjena ~9.2/10 | `docs/frontend-code-audit-2026-10-28.md` |
| Redis + Socket.IO produkcijska priprema | BullMQ, Redis adapter, keševi, rate limit, ACL | ✅ | `CHANGES.md` + `docs/redis-acl.md` |
| Migracija MySQL → PostgreSQL | šema, adapter-pg, baseline migracije (7) | ✅ | `docs/migration-mysql-postgres.md` |
| Guard audit / matrice | BE/FE guardovi, BS poruke, smoke skripta | 🟡 kod ✅; browser/staging smoke ⬜ | `guard_audit_matrice/HANDOFF.md` |
| Evidentičar dodjele (cross-issue scope) | A/B dodjele, cross-warehouse izdavanje | 🟡 kod ✅; ručni QA 1–15 ⬜ | `evidenticar-dodjele/HANDOFF.md` |

## 3. Infrastruktura i isporuka

| Stavka | Status | Napomena |
|--------|--------|----------|
| Docker Compose — Coolify (`docker-compose.yml`: backend+frontend+document-worker) | ✅ | kanonski produkcijski put |
| Docker Compose — standalone Traefik (`docker-compose.prod.yml`) | ✅ | alternativni put, održavan |
| Document Engine (`document-worker/`, LibreOffice DOCX/XLSX/ODT → PDF, BullMQ) | ✅ | interni servis, bez javne domene |
| CI (`.github/workflows/ci.yml`, 3 joba, 40+ `Verify` gateova: TLS handshake, SIGKILL recovery, ACL, AST ugovori, bundle budžet…) | ✅ | status zadnjeg runa provjeriti na GitHubu (ovaj registar ga ne tvrdi) |
| Deployment readiness alat (`scripts/check-deployment-readiness.mjs`, 23 knoba) | ✅ PASS u repo modu (provjereno 2026-10-28) | `--env` mod na serveru: 🟡 vlasnički korak |
| Load-test harness (`scripts/load-test.mjs`, p95 SLO) | 🟡 harness ✅; mjerenje na stagingu ⬜ | `docs/load-testing.md` |
| Redis ACL kanonsko pravilo + TLS | 🟡 kod ✅; live `ACL GETUSER`/SAN potvrda ⬜ (MANUAL) | `docs/redis-acl.md` |

## 4. Dokumentacija — tematski raspored

| Tema | Gdje | Status |
|------|------|--------|
| **Ulaz / indeks** | `README.md` (root) → ovaj fajl → `docs/README.md` | ✅ (reorganizovano 2026-10-28) |
| Operativni vodiči (13, CI ih zahtijeva — ne premještati) | `docs/redis-acl.md`, `http-hardening`, `public-qr-privacy`, `upload-read-policy`, `transfer-document-security`, `queue-recovery`, `performance-budgets`, `load-testing`, `deployment-readiness`, `frontend-design-system`, auditi 2026-10-27/28, `module-b-print-qr` | ✅ |
| Moduli A/B (poslovni) | `docs/module-a-business-matrix.md`, `docs/module-b-print-qr.md` | ✅ statusi usklađeni s kodom |
| Coolify env (bez tajni) | `docs/coolify-env.md` | ✅ novo (objedinjuje bivše `fajl.txt`/`fajl.md`) |
| Migracija baze | `docs/migration-mysql-postgres.md` | ✅ premješteno iz root-a |
| Historijski snapshoti (🗄 ne ažurirati, samo referenca) | `docs/backend-audit.md`, `docs/frontend-audit.md`, `docs/backend-implementation-plan.md`, `docs/frontend-implementation-plan.md` | 🗄 |
| Dizajn | `.cursor/docs/design-tokens.md`, `docs/frontend-design-system.md` | ✅ |
| Matrice (poslovna pravila) | `.cursor/docs/matrices/` (22 modula + registar guardova) | ✅ |
| Planovi sesija (🗄 historijski; status se ne vodi u njima) | `.cursor/plans/` — katalog: `.cursor/plans/INDEX.md` | 🗄/✅ po katalogu |
| Izvorna specifikacija Full Effect | `.cursor/docs/full-effect.md` (936 lin.) | 🗄 implementirano po CHECKLIST-u 49/50 |
| Changelog isporuka | `CHANGES.md` (root, Redis/Socket.IO isporuka) | ✅ |

## 5. Reorganizacija 2026-10-28 — šta je urađeno

- ✅ `docs/README.md` prepisan kao tematski indeks (bio je vezan za staru granu/HEAD/CI run).
- ✅ Ovaj `STATUS.md` + `BACKLOG.md` + `.cursor/plans/INDEX.md` — jedinstveno mjesto za statuse.
- ✅ `fajl.md` + `fajl.txt` (sadržavali pravu DB lozinku i `JWT_SECRET`) → objedinjeni u
  redaktovani `docs/coolify-env.md`, originali obrisani. **Tajne su i dalje u git historiji
  do `f58cf53` → rotacija + purge su P0 u BACKLOG-u.**
- ✅ `migracija-mysql-postgres.md` → `docs/migration-mysql-postgres.md` (reference ažurirane).
- ✅ Obrisani bajt-identični duplikati planova s pokvarenim Unicode imenima (`#U010d…`, 11 fajlova/foldera).
- ✅ Obrisani zastarjeli `docker-compose copy.yml` (MySQL-era, pogrešan port) i `backend/Dockerfile copy`
  (wildcard lockfile — krši container policy); kanonski `Dockerfile`-i ostaju jedini.
- ✅ Zastarjele statusne linije u Modulima A/B i `inventory-v2/CHECKLIST.md` usklađene s kodom.
- ✅ Ispravljena zastarjela asercija u `scripts/check-deployment-readiness.spec.mjs` (očekivala 11, skripta radi 12 provjera — pad je postojao i na čistom `f58cf53`; sada 43/43 root script testova prolazi).
- ⚠️ Namjerno **nije** dirano: putanje 13 operativnih vodiča u `docs/` (CI gate
  `check-deployment-readiness.mjs` ih zahtijeva tačno tu), relativni linkovi unutar
  `.cursor/plans/`, te `frontend/Dockerfilefr` (v. BACKLOG §3 — prvo potvrditi koji
  image Coolify zaista builda).
