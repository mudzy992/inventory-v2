# HANDOFF — Klijentsko rutiranje + lot specifikacije

**Datum:** 2026-06-12  
**Repo:** `C:\Users\m.ceric\Documents\GitHub\inventory-v2`  
**Plan:** [routing_i_lot_spec_7311c176.plan.md](../routing_i_lot_spec_7311c176.plan.md)  
**Matrica:** [warehouse-stock/MATRIX.md](../../docs/matrices/warehouse-stock/MATRIX.md)

---

## Sažetak za sljedeću sesiju

Frontend je migriran na **React Router** s **lazy-loaded** stranicama i vendor chunk splitom. Evidentičar može **dodavati i mijenjati** lot specifikacije; kartica je **collapsible** (otvorena samo na `ceka_specifikaciju`).

**Sljedeći korak:** ručno testiranje rutiranja u browseru; opcionalno load test opreme na stagingu s punim šifrarnikom (~2–3k).

**Build status:** `cd frontend && npm run build` — **prolazi** (lazy chunkovi, bez circular chunk upozorenja).

**Git:** promjene **nisu commitovane** (lokalni working tree).

---

## Šta je urađeno

### 1. React Router (URL rutiranje)

| Komponenta | Fajl |
|------------|------|
| Registry ruta | `frontend/src/routes/app-routes.ts` |
| Router + route mapa | `frontend/src/routes/app-router.tsx` |
| RBAC + feature guard | `require-role.tsx`, `require-page-enabled.tsx`, `protected-route.tsx` |
| App shell | `frontend/src/App.tsx` (setup/login → `AppRouter`) |
| Bootstrap routera | `frontend/src/main.tsx` (`BrowserRouter`) |
| Javna oprema | `/equipment/:equipmentId` → `public-equipment-route.tsx` |

**URL konvencija:** `PAGE_PATHS` u `app-routes.ts` (npr. `/dashboard`, `/registrar-stock`, deep link `/registrar-stock/lots/:lotId`).

**Navigacija:** `NavLink` + `useNavigate` u sidebaru, layoutu, dashboardu, notifikacijama; uklonjen `onNavigate` callback pattern.

### 2. Lazy loading + profesionalni bundle

| Komponenta | Fajl |
|------------|------|
| Lazy helper | `frontend/src/routes/lazy-page.ts` |
| Page loaderi + prefetch | `frontend/src/routes/page-loaders.ts` |
| Lazy page komponente | `frontend/src/routes/lazy-pages.ts` |
| Guard + Suspense | `frontend/src/routes/lazy-route-page.tsx` |
| Skeleton fallback | `frontend/src/components/ui/route-page-fallback.tsx` |
| Vite vendor split | `frontend/vite.config.ts` (`vendor-react`, `vendor-router`, `vendor-icons`, `vendor-socket`) |

**Prefetch:** hover/focus na sidebar linku (`sidebar-nav-button.tsx`) učitava chunk prije klika.

**Build rezultat (aproks.):**
- Prije: jedan JS ~790 kB
- Poslije: inicijalni `index` ~95 kB + lazy chunk po ruti (npr. `EquipmentPage` ~19 kB, `InventoryCountPage` ~62 kB)

### 3. Lot specifikacije (evidentičar)

| Ponašanje | Implementacija |
|-----------|----------------|
| Dodavanje spec (`ceka_specifikaciju`) | `PATCH /stock-lots/:id/specifications` |
| Izmjena nakon definisanja (`spremno_za_izdavanje`) | Isti endpoint; UI forma vidljiva |
| Zatvoren lot (`zatvoreno`) | Read-only prikaz |
| Collapsible kartica | `lot-specification-section.tsx` |
| Deep link na lot | `registrar-stock-page.tsx` + `useParams` / `navigate` |

**Pravila collapsible kartice:**
- `ceka_specifikaciju` → automatski **otvorena**
- Nakon snimanja → **zatvara se**
- Sljedeći posjeti → **zatvorena**; korisnik proširi → izmjena → snimi → opet zatvorena
- Napomena kad postoje `issuedUnits`: izmjena ne mijenja već izdatu opremu

### 4. Dokumentacija

- `MATRIX.md` + `CHANGELOG.md` (warehouse-stock) ažurirani za routing, lazy bundle, spec edit, collapsible UI.

---

## Donesene odluke

1. **React Router v7** — standardni izbor; `PageId` tip zadržan za feature flags i module badges.
2. **Flat rute** za lot detail (`/registrar-stock/lots/:lotId`), ne puna browse hijerarhija u URL-u (parent/sub ostaje u lokalnom state-u).
3. **Backend bez promjena** za spec edit — `defineSpecifications` već dozvoljava update osim `zatvoreno`.
4. **Lazy po stranici** + prefetch na navigaciji — balans između performansi i UX-a bez route loadera (TanStack Router).
5. **Bootstrap ne učitava opremu** — `fetchBootstrap` vraća `equipment: []`; liste idu paginirano (`data-api.ts` komentar).

---

## Otvorena pitanja / rizici

| Tema | Napomena |
|------|----------|
| **API spec edit** | ✓ Potvrđeno skriptom — backend usklađen; `specDefinedAt` u response. |
| **2–3k opreme** | Paginacija OK na malom uzorku; puni load test još na stagingu. |
| **Skladišta u bootstrapu** | `fetchAllPaginatedItems` za warehouses — može rasti; nije kritično kao oprema, ali vrijedi pogledati. |
| **Ručno testiranje rutiranja** | Korisnik testira routing u produkciji/dev — back/forward, deep link, role redirect, feature flag off. |
| **Nije commitovano** | Sve promjene su lokalne; prije deploya commit + push. |

---

## API provjera — rezultati (2026-06-12)

**Skripta:** `cd backend && npm run test:api:lot-spec`  
**Preduvjet:** API na `localhost:3000/backend` (ili `SMOKE_API_BASE`). Auth: `SMOKE_ADMIN_PASSWORD` / `SMOKE_REGISTRAR_PASSWORD`, ili JWT potpis preko `JWT_SECRET` ako login lozinke nisu poznate.

**Rezultat: 15/15 PASS** (lokalna DB, ~5 komada opreme)

### A. Lot specifikacije — potvrđeno

| Scenarij | Očekivano | Rezultat |
|----------|-----------|----------|
| `ceka_specifikaciju` → prvi PATCH | 200, `spremno_za_izdavanje`, `specDefinedAt` | ✓ |
| `spremno_za_izdavanje` → drugi PATCH | 200, status ostaje, spec ažuriran | ✓ |
| `zatvoreno` → PATCH | 400 | ✓ |
| Lot izvan registrar scope-a | 403 | ✓ |
| Aktivni popis u gradu (freeze) | 400 | ✓ |
| Issue + promjena lot spec-a | Equipment zadrži snapshot | ✓ |

Backend `defineSpecifications` ponašanje **usklađeno** s matricom i frontend UI — nema potrebe za backend promjenom.

### B. Performanse / oprema

| Endpoint | Rezultat |
|----------|----------|
| `GET /equipment?page=1&pageSize=50` | 200, ~180–230 ms (5 zapisa) |
| `GET /equipment/summary` | 200, ~110–125 ms |
| Paginacija | `meta.total` + `items`; nema full dump |

**Napomena:** Lokalna DB ima malo opreme; load test s 2–3k zapisa treba na stagingu/produkcijskoj kopiji.

### C. Bootstrap

| Stavka | Rezultat |
|--------|----------|
| `fetchBootstrap` | `equipment: []` — potvrđeno u `data-api.ts` |
| Referentni pozivi | `/org-units`, `/categories`, `/warehouses?page=1` — ~70 KB ukupno |
| `fetchAppState` | Alias za `fetchBootstrap` — nema punog učitavanja opreme |

### D. Rutiranje (brza regresija — ručno)

- [ ] `/registrar-stock/lots/:id` — direktan ulaz, refresh stranice
- [ ] Browser back s lot detail na listu
- [ ] `/equipment/:uuid` bez auth
- [ ] Role redirect (skladistar → `/warehouses`, user → `/my-equipment`)
- [ ] Lazy chunk u Network (prva navigacija vs prefetch na hover)

### E. Opcionalno (ako API provjera otkrije gap)

- Audit polja `specDefinedAt` / `specDefinedBy` u API response + prikaz u UI
- Backend eksplicitna razlika create vs update spec (log/notification)
- Plan za smanjenje bootstrap warehouses (samo ID+name za picker)

---

## Ključni fajlovi (brzi pregled)

```
frontend/src/routes/
  app-routes.ts          # PAGE_PATHS, pathToPageId, getDefaultPathForRole
  app-router.tsx         # Route definicije + lazy pages
  lazy-pages.ts          # React.lazy importi
  page-loaders.ts        # prefetchPage(pageId)
  protected-route.tsx    # RBAC + feature flag

frontend/src/components/registrar-stock/
  registrar-stock-page.tsx
  lot-specification-section.tsx   # collapsible spec forma

frontend/vite.config.ts  # manualChunks

backend/src/modules/warehouse-stock/
  warehouse-stock.controller.ts
  warehouse-stock.service.ts      # defineSpecifications, issueUnit

backend/prisma/
  routing-lot-spec-api-verify.ts  # npm run test:api:lot-spec
```

---

## Test checklist (frontend — ako nije pokriveno)

- [ ] Collapsible spec: `ceka` otvorena → save → zatvorena
- [ ] `spremno` zatvorena → expand → edit → save → zatvorena
- [ ] `zatvoreno` read-only expand
- [ ] Lazy load: prvi ulaz na modul prikaže skeleton
- [ ] Prefetch: hover na meni → chunk u Network prije klika

---

## Reference

- Matrica: `.cursor/docs/matrices/warehouse-stock/MATRIX.md`
- Changelog: `.cursor/docs/matrices/warehouse-stock/CHANGELOG.md`
- Glavni project handoff: `.cursor/plans/inventory-v2/HANDOFF.md` (dodati link na ovaj fajl po potrebi)
