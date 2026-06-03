# HANDOFF — Inventory v2

> **Full Effect (faze 13–18):** nastavak u novoj sesiji → [`.cursor/plans/full-effect/HANDOFF.md`](../full-effect/HANDOFF.md) (2026-06-03). Faze 13–15 gotove; sljedeća **16**. Evidentičar više nije samo grad+kategorija — vidi `RegistrarAssignment`.

**Datum:** 2026-06-02 (ažurirano sesija 2026-06-02)  
**Repo:** `C:\Users\m.ceric\Documents\GitHub\inventory-v2`  
**Remote:** https://github.com/mudzy992/inventory-v2 (`main`)  
**Deploy:** `inventory-v2.ba101.top`, API prefix `/backend`

---

## Sažetak za sljedeću sesiju

Od zadnjeg handoffa implementirane su ove **ključne promjene**:

1. **Evidentičar scope**: opseg po **gradu + kategoriji** (`UserRegistrarScope`) — već integrisano kroz backend + frontend.
2. **Popis v3 (sesija po distribuciji + godini)**:
   - `InventorySession`: `{ name: "POPIS 2026", orgUnitId (distribucija), year }`
   - `InventoryCommittee`: unutar sesije, **tačno 1 kategorija** (`categoryId`) + popisni članovi + zasebni rashodni članovi
   - `InventoryLine`: vezana za `committeeId`
   - **Unos linija**: samo **članovi popisne komisije**; promjene se čuvaju kao **pending (temp)** tokom aktivne sesije
   - **Zatvaranje sesije (admin)**: `active` → `closing` + kreira se **async close-job** koji intervalno primjenjuje pending akcije; na kraju sesija ide u `closed`
3. **UI za članove komisije**:
   - nema biranja sesija/distribucije — prikazuje se automatski lista **aktivnih komisija**
   - klik komisije → evidencija + štampa
4. **Bugfix**: `print-scope` se prikazivao suženo (po `equipmentMatchesScope`) — uklonjeno; sada se prikazuje kompletan opseg za komisiju, uz backend guard da samo članovi komisije mogu dobiti `print-scope`.
5. **Popis UX + akcije + zaključavanje + zapisnik**:
   - master-detail layout za članove komisije (clean UI)
   - `nije_prisutna` → napomena obavezna (frontend + backend)
   - predsjednik može zaključati komisiju (read-only), ali **admin zatvaranje sesije** sada automatski zaključava sve komisije
   - zapisnik: `GET /inventory-sessions/committees/:id/report` (UI modal)
6. **Popis: razlog greške**:
   - ako primjena pending akcije padne, UI prikazuje link **Razlog** (iz `pendingAction.lastError`)

**Build:** `cd backend && npm run build` i `cd frontend && npm run build` — **prolaze** (provjereno u sesiji).

**Kritično prije testiranja:**
```bash
cd backend
npx prisma migrate deploy   # ✅ potvrđeno — schema up to date
npm run db:seed             # ✅ seed prolazi (fix: admin bez employeeId)
```
Migracije koje moraju biti na DB (redom):
- `20260529120000_locations_warehouses_commissions`
- `20260601120000_registrar_scope_city_commissions` — `UserRegistrarScope`, `cityId` na komisijama, drop `UserManagedOrgUnit`
- `20260602120000_inventory_committee_scope_v2` — kategorije komisije, disposal link, relocation polja, `@@unique([committeeId, year])`
- `20260602090000_inventory_session_v3` — **popis v3**: sesija po `orgUnitId+year`, komisija po `sessionId+categoryId`, linije po `committeeId`, drop `inventory_committee_categories`
- `20260602111000_inventory_committee_close_and_line_events` — zaključavanje komisije + audit events
- `20260602124000_inventory_pending_actions_and_close_job` — pending akcije + async close-job

Zatim restart dev servera i login **`admin`** / `admin123`.

**Git:** veliki necommitovan set (faze 1–11 + registrar + popis v2). Commit nije tražen od korisnika.

---

## Šta je urađeno u zadnjim sesijama (konkretno)

### A) Evidentičar — registrar scope

| Sloj | Fajlovi / promjena |
|------|-------------------|
| Prisma | `UserRegistrarScope`, komisije/sesije po `cityId`, migracija `20260601120000_*` |
| Backend | `backend/src/common/services/registrar-scope.service.ts` |
| Users/JWT | `registrarScopes` u DTO, `jwt.strategy`, `users.service` |
| Scope zamjena | `equipment`, `transfers`, `employees`, `notifications` |
| Frontend | `frontend/src/helpers/registrar-scope.ts`, zamjena `getManagedOrgUnitIds` na Dashboard, Equipment*, Transfers, Employees, User management |
| Matrice | `roles-access`, `locations`, `disposal-commission`, `inventory-count`, `warehouses` |

### B) Popis v3 (sesija po distribuciji)

| Sloj | Fajlovi / promjena |
|------|-------------------|
| Prisma | migracija `20260602090000_inventory_session_v3` + refaktor modela (sesija→komisije→linije) |
| Backend | `inventory-count.service.ts`: `createSession`, `createCommittee`, `recordLine` membership guard, `getPrintScopeForUser` guard |
| Backend | `inventory-count.controller.ts`: novi endpointi `POST /inventory-sessions/:id/committees`, `POST /inventory-sessions/committees/:id/lines`, `GET /inventory-sessions` i za `user` (filtrirano po članstvu) |
| Backend | `disposal-commissions.service.ts`: resolve komisije rashoda preko aktivne sesije + scope komisije |
| Frontend | `InventoryCountPage.tsx`: admin flow + simplified “active committees” flow za članove komisije |
| Frontend | `inventory-committee-wizard.tsx`: odvojeni pickeri (popis vs rashod), 1 kategorija |
| Frontend | `session-lines-panel.tsx`: radi sa `committeeId` |
| Matrice | `inventory-count/MATRIX.md` + `inventory-count/CHANGELOG.md` (v3) |

**Planovi (referenca, ne editovati):**
- `.cursor/plans/evidentičar_lokacija+kategorija_593b86b1.plan.md`
- `.cursor/plans/popis_komisija_v2_69e25cf7.plan.md`

---

## Gdje je šta u aplikaciji

### Admin — Popis (v3)

1. **Popis** → odaberi distribuciju → kreiraj sesiju: naziv (`POPIS 2026`) + godina.
2. Dok je sesija `draft`: dodaj komisije po kategorijama (svaka komisija ima popisne i rashodne članove — odvojeno).
3. Aktiviraj sesiju (`draft` → `active`). Dok je aktivna, transferi su blokirani za opremu u gradu distribucije (effective city).
4. Zatvori sesiju (`active` → `closing`) — kreira se async close-job koji intervalno primjenjuje pending promjene; nakon završetka sesija ide u `closed`.

### Admin — ostalo (nepromijenjeno iz HANDOFF 2026-05-29)

| Funkcija | Meni |
|----------|------|
| Lokacije | Administracija → Lokacije |
| Skladišta | Skladišta |
| Korisnici / evidentičar scope | Korisnici → dodjele **grad + kategorija** |
| Komisija rashod (standalone) | Komisija rashod |
| Naljepnice | Oprema → Štampaj naljepnice |

### Evidentičar

- Vidi opremu/radnike/prenose samo u **dodijeljenim parovima (grad, kategorija)**.
- **Popis:** može unositi samo ako je **član popisne komisije**; u popisu se prikazuje kompletan opseg komisije.
- **Komisija rashod:** glasanje ako je član; banner pri rashodu na Prenosima.

### Korisnik (user)

- Ako je član komisije: vidi svoje **aktivne komisije** u Popisu, klik komisije → evidencija + štampa.
- **Moja oprema** → kartice + pregled po kategorijama (read-only).

### Seed (nakon `db:seed`)

| Username | Lozinka | Uloga |
|----------|---------|-------|
| `admin` | `admin123` | admin |
| `adnan.sarajlic` | `admin123` | admin (predsjednik komisije u seedu) |
| `kenan.hodzic` | `user123` | evidentičar (Sarajevo + Računarska oprema) |
| `amir.skladistar` | `user123` | skladistar |

Seed: povezana komisija popisa + rashod za Sarajevo, 3 člana, demo oprema na skladištu.

---

## Donesene odluke (2026-06)

| # | Odluka |
|---|--------|
| 1 | Evidentičar: opseg = **grad** (`effectiveLocationCityId` / `warehouse.cityId`) + **kategorija** (s podkategorijama), ne org. jedinice |
| 2 | `UserManagedOrgUnit` uklonjen; `UserRegistrarScope` |
| 3 | Popis sesija vezana na **`orgUnitId` (distribucija)** + `year` |
| 4 | Komisije su unutar sesije i vezane su za **jednu kategoriju** (`categoryId`) |
| 5 | Popisna komisija i komisija rashoda su **odvojene** (članovi se biraju zasebno) |
| 6 | Unos linija može vršiti **svaki član popisne komisije** (ne samo predsjednik); admin ne unosi |
| 6 | `promjena_lokacije` na popisu = prenos na **skladište** ili **osobu**, ne promjena grada |
| 7 | `ostecena` na popisu = **obavezna napomena** |
| 8 | Sesija: `@@unique([committeeId, year])` — više komisija po gradu s različitim kategorijama |
| 9 | Stare aktivne komisije po gradu se **deaktiviraju** pri kreiranju novog popisa |
| 10 | Popis promjene su **pending** tokom aktivne sesije; primjena (transferi/statusi) se izvršava kroz async close-job na zatvaranje sesije |

---

## API — brza referenca (popis v3)

| Metoda | Putanja | Uloga |
|--------|---------|-------|
| POST | `/inventory-sessions` | `{ name, orgUnitId, year }` — admin |
| GET | `/inventory-sessions?orgUnitId=...` | admin, evidentičar, user (user: filtrirano po članstvu) |
| POST | `/inventory-sessions/:id/committees` | `{ categoryId, name?, inventoryMembers[], disposalMembers[] }` — admin |
| GET | `/inventory-sessions/committees/:id/print-scope` | admin, evidentičar, user (**samo članovi komisije**) |
| GET | `/inventory-sessions/committees/:id/report` | admin, evidentičar, user |
| POST | `/inventory-sessions/committees/:id/lines` | status + relocation (samo članovi komisije; admin ne može) |
| PATCH | `/inventory-sessions/:id/activate` | admin |
| PATCH | `/inventory-sessions/:id/close` | admin (enqueues close-job, session → `closing`) |
| GET | `/inventory-sessions/:id/close-job` | admin, evidentičar, user (progress) |

---

## Test status

| Test | Status |
|------|--------|
| `backend npm run build` | OK |
| `frontend npm run build` | OK |
| `prisma migrate deploy` na dev DB | **OK** (2026-06-01) |
| `npm run db:seed` | **OK** (fix duplog `employeeId` admin/adnan) |
| Ručni smoke (popis v3) | **Pending** — fokus: sesija+komisije po distribuciji, član komisije vidi full scope, evidencija, štampa |

### Smoke checklist (sljedeća sesija — popis v3)

- [ ] Admin: kreira sesiju `POPIS 2026` za distribuciju + doda 2 komisije (2 kategorije) + aktivira
- [ ] Član komisije (user): vidi listu aktivnih komisija → klik → vidi full scope + unos
- [ ] Štampa: grupe po radnicima, footer potpisi
- [ ] Sesija aktivna → blokada transfera u gradu distribucije (effective city)
- [ ] Linija `ostecena` bez napomene → greška
- [ ] Linija `nije_prisutna` bez napomene → greška
- [ ] Linija `promjena_lokacije` → skladište/osoba → snima se `pending` akcija (nema transfera odmah)
- [ ] Admin zatvori sesiju → session `closing` + close-job progress; nakon završetka kreirani transferi (RAW) za relocation akcije
- [ ] Rashod → `DisposalApproval` preko vezane komisije
- [ ] Evidentičar: i dalje scope grad+kategorija za ostale module; u popisu vidi full scope samo ako je član komisije
- [ ] User: pregled po kategorijama na Moja oprema

---

## Što je MVP / nedovršeno (sljedeći rad)

| Stavka | Stanje |
|--------|--------|
| Paginacija štampе **x/y** | **OK** (JS paginacija u `inventory-print-sheet.tsx`) |
| Zapisnik popisa PDF | Nije (plan spominje fazu 2) |
| Rashod link iz session-lines | Samo napomena „preko Prenosa“ — nema inline statusa |
| Pending→apply pokrivenost | `disposal` apply nije implementiran (trenutno baca grešku) |
| Evidentičar kreiranje komisije | Samo admin (namjerno) |
| i18n EN | Nije |
| Deploy produkcija | Pending |
| E2E / QA faza 7 | Pending |
| Commit + push | Korisnik nije tražio |
| `backend/dist/` u git status | Treba provjeriti `.gitignore` |

---

## Next steps (prioritet)

### 1. Operativno (odmah)
- [ ] `npx prisma migrate deploy` + `npm run db:seed` (seed treba prilagoditi popis v3)
- [ ] Smoke checklist gore (admin + član komisije + evidentičar)
- [ ] Konfiguracija skladišta: za svaku distribuciju postaviti `Warehouse.orgUnitId` (ili bar provjeriti da postoji aktivno skladište u gradu), zbog relocation→warehouse

### 2. UX polish (kratko)
- [x] Print: pouzdana numeracija stranica (JS paginacija 18 redova/str, `Stranica X / Y`)
- [x] DisposalCommissionsPage: employee picker usklađen s popis wizardom (predsjednik s User + min. 2 člana)
- [ ] Inline disposal approval status na Popis / Prenosi

### 3. Faza 6 — Deploy
- [ ] Sve tri migracije na server DB prije deploya
- [ ] `docker compose -f docker-compose.prod.yml build` + smoke na `inventory-v2.ba101.top`

### 4. Faza 7 — QA
- [ ] `08_phase-qa-matrices.md`
- [ ] Gap analysis ako docs ≠ kod

### 5. Git (kad korisnik traži)
- [ ] Commit(e): popis v3 + UI “aktivne komisije” + backend guards + matrice (preporuka: odvojiti u 2 commit-a: (1) prisma+backend, (2) frontend+docs)

---

## Otvorena pitanja / rizici

1. **Redoslijed migracija** — na staroj DB bez `20260601*` kod će pucati; uvijek `migrate deploy` od nule ili backup.
2. **Seed** — trenutni `backend/prisma/seed.ts` je pisan za stariji model; treba ga prebaciti na sesija→komisije v3.
3. **Domena: distribucija vs. city** — popis v3 se scopa preko effective city distribucije; provjeriti da li je to očekivano za org strukturu (službe fizički u gradu).
4. **`.env` / DATABASE_URL`** — konzistentno ime baze.
5. **Necommitovan `backend/dist/`** — ne uključivati u commit.
6. **Prisma migrate dev (shadow DB)** — može failati na starijim migracijama; za novu migraciju koristiti `migrate deploy` na dev/prod DB i izbjegavati `migrate dev` ako shadow nije čist.

---

## Korisne komande

```bash
cd backend && npm run build && npx prisma migrate status
cd frontend && npm run build
```

```bash
# Dev
cd backend && npm run dev
cd frontend && npm run dev
```

**Ne committati:** `.env`, `node_modules/`, po mogućnosti ne `backend/dist/`.

---

## Bugfix batch (2026-06-03) — manual test checklist

1. **Evidentičar (režim A i B):** vidi opremu u „Sva oprema“ i „Po kategorijama“; kategorije ne crashaju.
2. **Evidentičar iz detalja opreme:** prenos, razduženje (s resolved skladištem), rashod (raw + pending, ne finalize bez odobrenja).
3. **Skladištar:** login, učitavanje app state, oprema samo svog skladišta, warehouse detail/destruction.
4. **Admin:** nova oprema s odabranom skladištem (`status=skladiste`).
5. **Org inheritance:** skladište na Distribuciji → razduženje radnika u child službi ide na to skladište.
6. **Popis → Rashod tab:** evidentičar bez employee ne vidi error; predsjednik vidi inbox.
7. **Moja oprema:** poruka kad nalog nije povezan s radnikom.
8. **Kategorije breadcrumb:** modal se ne otvara odgođeno nakon navigacije.

**Napomena za skladištara:** admin mora dodati `WarehouseKeeper` vezu i `employeeId` na user zapisu.

---

## Kontekst za Cursor agenta

U novoj sesiji reci:

> „Nastavi prema `.cursor/plans/inventory-v2/HANDOFF.md`“

Konkretni zadaci:
- „Smoke test popis v3: sesija+komisije+full scope + evidencija (član) + print“
- „Smoke test pending+async close: recordLine → pending badge, admin close → close-job progress → transfers created“
- „Prilagodi seed na popis v3“
- „Deploy faza 6 s migracijama“
- „Commit popis v3“

**Izvori istine:**
- Project rule: `.cursor/rules/00_project.mdc`
- Plan folder: `.cursor/plans/inventory-v2/`
- Matrice: `.cursor/docs/matrices/*/MATRIX.md`
- Popis v2 matrica: `.cursor/docs/matrices/inventory-count/MATRIX.md`
