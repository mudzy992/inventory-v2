# HANDOFF — Klijentsko rutiranje + lot specifikacije

**Datum:** 2026-06-12  
**Repo:** `C:\Users\m.ceric\Documents\GitHub\inventory-v2`  
**Plan:** [routing_i_lot_spec_7311c176.plan.md](../routing_i_lot_spec_7311c176.plan.md)  
**Matrica:** [warehouse-stock/MATRIX.md](../../docs/matrices/warehouse-stock/MATRIX.md)

---

## Sažetak za sljedeću sesiju

Frontend je migriran na **React Router** s **lazy-loaded** stranicama i vendor chunk splitom. Evidentičar može **dodavati i mijenjati** lot specifikacije; kartica je **collapsible** (otvorena samo na `ceka_specifikaciju`).

**Sljedeći korak (dogovoreno):** ručna / sistematska **provjera API-ja** — posebno lot spec, performanse s ~2–3k opreme, bootstrap i paginacija.

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
| **API spec edit** | Frontend omogućava edit na `spremno_za_izdavanje`; potvrditi da backend ponašanje odgovara poslovnim pravilima (audit, issued units). |
| **2–3k opreme** | Bundle je optimizovan; **API/paginacija** na `EquipmentPage` / filteri treba provjeriti pod opterećenjem. |
| **Skladišta u bootstrapu** | `fetchAllPaginatedItems` za warehouses — može rasti; nije kritično kao oprema, ali vrijedi pogledati. |
| **Ručno testiranje rutiranja** | Korisnik testira routing u produkciji/dev — back/forward, deep link, role redirect, feature flag off. |
| **Nije commitovano** | Sve promjene su lokalne; prije deploya commit + push. |

---

## Next steps — provjera API (sljedeća sesija)

### A. Lot specifikacije (prioritet)

1. **`PATCH /stock-lots/:id/specifications`** kao `evidenticar` (Mode A assignment):
   - Lot `ceka_specifikaciju` → prvi save → status `spremno_za_izdavanje`
   - Lot `spremno_za_izdavanje` → izmjena polja → drugi save → spec ažuriran, status ostaje
   - Lot `zatvoreno` → očekivano **400**
2. **Scope:** evidentičar bez assignmenta za warehouse+category → **403**
3. **Freeze:** aktivni popis u gradu → save blokiran
4. **Issued units:** nakon izdavanja komada, promjena lot spec-a — provjeriti da **izdata oprema** zadrži snapshot (ne retroaktivno)

**Backend fajlovi:** `warehouse-stock.service.ts` → `defineSpecifications`  
**Controller:** `PATCH stock-lots/:id/specifications`

### B. Performanse / oprema (~2–3k zapisa)

1. **`GET /equipment`** (paginirani) — vrijeme odgovora, `pageSize`, filteri (`categoryId`, `status`, search)
2. **`GET /equipment/summary`** — dashboard brojači
3. **`GET /equipment-by-category`** / lot groups ako se koriste
4. Frontend: `EquipmentPage`, `EquipmentByCategoryPage` — samo paginirani API, bez punog učitavanja u Zustand
5. Network tab: nema višestrukih redundantnih poziva pri navigaciji (TanStack nije u upotrebi; React Query na pojedinim stranicama provjeriti)

### C. Bootstrap i referentni podaci

1. **`fetchBootstrap`** — šta tačno ide u payload (org units, categories flat, warehouses all-pages)
2. Veličina odgovora kategorija/org jedinica pri punom šifrarniku
3. Da li neki modul i dalje poziva deprecated `fetchAppState` punu listu

### D. Rutiranje (brza regresija uz API test)

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
