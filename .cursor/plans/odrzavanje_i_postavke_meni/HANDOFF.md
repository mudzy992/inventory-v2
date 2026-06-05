# HANDOFF — Postavke menija + oprema za održavanje

**Datum:** 2026-06-04 (ažurirano)  
**Planovi (referenca, ne mijenjati):**
- [održavanje_i_postavke_meni_b372a40e.plan.md](../održavanje_i_postavke_meni_b372a40e.plan.md) — originalni modul
- [child_host_maintenance_links_de446efe.plan.md](../child_host_maintenance_links_de446efe.plan.md) — **implementirano** (veza na child ASSET)

**Status:** Sav relevantan kod je implementiran. DB migracija `20260604160000_maintenance_parts` primijenjena. **Sljedeće:** ručna migracija linkova u adminu + end-to-end test.

---

## Za novu sesiju (copy-paste)

```
Nastavi iz HANDOFF: .cursor/plans/odrzavanje_i_postavke_meni/HANDOFF.md

Prioritet:
1) Ručno premapirati CategoryMaintenanceLink na child kategorije (vidi checklist ispod).
2) Ručno testirati Dio A (postavke/meni) i Dio B (SSD + printer toner flow).
3) Po potrebi: P3 serijski brojevi / transfer za zamjenu — izvan MVP.

Dev:
cd backend && npm run dev
cd frontend && npm run dev
```

---

## Model linkova (trenutno u kodu)

```
ASSET (oprema)
  Računarska oprema          ← samo folder, BEZ panela linkova
    ├── Radne stanice        ← HOST (leaf) → veže MAINTENANCE grupe/leaf
    ├── Monitori             ← HOST samo ako admin veže katalog
    └── Printeri             ← HOST → npr. Štampači/Toneri

MAINTENANCE (dijelovi)
  Računarski dijelovi        ← grupa (checkbox) → SSD, HDD, RAM…
  Periferije                 ← grupa → Tastature, Miševi…
  Štampači / Toneri          ← za Printeri host
```

| Pravilo | Detalj |
|---------|--------|
| `hostCategoryId` | ASSET **leaf** (mora biti podkategorija bez djece) |
| `maintenanceCategoryId` | MAINTENANCE **parent grupa ili leaf**; grupa se širi na leaf pri ugradnji |
| Oprema | Katalog samo ako postoji link na **`equipment.categoryId`** — nema walk-up na „Računarska oprema” |
| Registrar scope | Preporuka: dodjela **Radne stanice** + skladište, ne samo parent |

---

## Šta je urađeno (sve faze)

### Dio A — Postavke / meni

- `features.*` merge, `patchLocal`, `useIsPageEnabled`, gate Layout/Dashboard/freeze/podmeni
- Backend guards: disposal + inventory-count
- Matrica: [settings/MATRIX.md](../../docs/matrices/settings/MATRIX.md)

### Dio B — Modul održavanje (MVP)

- Prisma + migracija `20260604160000_maintenance_parts`
- Modul `maintenance-parts` (prijem, ugradnja, kvar, zamjena, potrošnja)
- UI: Kategorije, Skladište tab Održavanje, kartica opreme, mobile sheet zamjena
- `features.maintenance_parts` u registry; `SettingsModule` import u `MaintenancePartsModule` (fix dev DI)

### Child host linkovi (plan de446efe) — **NOVO**

| Oblast | Fajl |
|--------|------|
| Expand MAINTENANCE parent → leaf | [`backend/.../expand-maintenance-catalog.util.ts`](../../../backend/src/modules/maintenance-parts/utils/expand-maintenance-catalog.util.ts) |
| Host = ASSET leaf u `setCategoryLinks` | [`maintenance-parts.service.ts`](../../../backend/src/modules/maintenance-parts/maintenance-parts.service.ts) |
| Potrošnja po `equipment.categoryId` | isti servis |
| `GET linked-host-categories` | [`maintenance-parts.controller.ts`](../../../backend/src/modules/maintenance-parts/maintenance-parts.controller.ts) |
| Panel na **podkategoriji** | [`CategoriesPage.tsx`](../../../frontend/src/components/CategoriesPage.tsx), [`category-maintenance-links-panel.tsx`](../../../frontend/src/components/categories/category-maintenance-links-panel.tsx) |
| Frontend expand | [`frontend/.../expand-maintenance-catalog.util.ts`](../../../frontend/src/helpers/expand-maintenance-catalog.util.ts) |
| Oprema: jedan API po categoryId | [`equipment-installed-parts-panel.tsx`](../../../frontend/src/components/maintenance-parts/equipment-installed-parts-panel.tsx) |
| Matrica + changelog | [maintenance-parts/MATRIX.md](../../docs/matrices/maintenance-parts/MATRIX.md), [CHANGELOG.md](../../docs/matrices/maintenance-parts/CHANGELOG.md) |

---

## Ručna migracija linkova (OBAVEZNO prije testa B)

Stari linkovi na parent **Računarska oprema** više **ne rade**. Admin mora:

1. **Kategorije** → proširi „Računarska oprema” → na svakoj podkategoriji:
   - **Radne stanice:** označi grupe „Računarski dijelovi”, „Periferije” (ili pojedinačne SSD, RAM…)
   - **Printeri:** označi „Štampači” / „Toneri”
   - **Monitori:** ostaviti prazno ako nema ugradnje dijelova
2. Obriši stare veze na parentu (panel više nije na parentu — ako linkovi ostaju u DB, ugradnja neće raditi dok se ne premapira)
3. **Korisnici → evidentičar:** Registrar dodjela `(skladište, Radne stanice)` ne `(skladište, Računarska oprema)` ako želite granularni scope

SQL provjera (opcionalno):

```sql
SELECT h.name AS host, m.name AS maintenance
FROM category_maintenance_links l
JOIN categories h ON h.id = l.hostCategoryId
JOIN categories m ON m.id = l.maintenanceCategoryId;
```

---

## Ručni test plan

### Dio A — postavke

- [ ] Isključi **Inventurni popis** (`inventory_count`) → „Popis” nestaje (≠ „Popis skladišta”)
- [ ] Isključi **Komisija za rashod** → nestaje iz menija
- [ ] QR skener off/on
- [ ] API `GET /inventory-sessions`, `GET /disposal-commissions` → 400 kad modul off

### Dio B — child host (SSD + printer)

- [ ] Migracija linkova (gore)
- [ ] Postavke: `features.maintenance_parts` = uključeno
- [ ] Skladište → Održavanje → prijem 10× SSD (MAINTENANCE leaf)
- [ ] PC (Radne stanice) → Ugradi 1× SSD → lot −1
- [ ] Monitor bez linka → **nema** panela „Ugrađeni dijelovi”
- [ ] Printer → samo toner u katalogu; ugradnja/zamjena
- [ ] Tab Održavanje → tabela potrošnje, filter „Radne stanice”

---

## Dev / build

```bash
cd backend
npm install
npx prisma generate
npm run dev          # prebuild radi prisma generate

cd frontend
npm install
npm run dev
```

| Komanda | Očekivano |
|---------|-----------|
| `cd backend && npm run build` | OK |
| `cd frontend && npx tsc --noEmit` | OK |
| `cd frontend && npm run build` | OK |

**Poznati fix:** `MaintenancePartsModule` mora `imports: [SettingsModule, ...]` — bez toga `npm run dev` pada na `SettingsService` DI.

---

## API (maintenance)

| Metoda | Putanja | Napomena |
|--------|---------|----------|
| GET | `/maintenance-parts/linked-host-categories` | Host kategorije koje imaju link |
| GET/PUT | `/maintenance-parts/category-links/:hostCategoryId` | **hostCategoryId = ASSET leaf** |
| GET/POST | `/maintenance-parts/warehouses/:id/stock-lots` | Prijem MAINTENANCE lota |
| GET | `/maintenance-parts/equipment/:id/parts` | |
| POST | `/maintenance-parts/equipment/:id/install` | |
| POST | `/maintenance-parts/parts/:id/replace` | |
| GET | `/maintenance-parts/warehouses/:id/consumption-summary?hostCategoryId=` | Agregacija po tipu opreme |

Prefix deploy: `/backend/...`

---

## Otvoreno (niski prioritet)

| Tema | Status |
|------|--------|
| Serijski brojevi (`unique` na MAINTENANCE) | Van MVP |
| Transfer dokument za zamjenu dijela | Van MVP |
| Auto-migracija parent→child linkova u SQL | Namjerno **ne** — ručno |

---

## Rizici / napomene

- **Switch „Popis skladišta”** ≠ **„Inventurni popis”** u Postavkama.
- **P3018** (dugi index): vidi `rollback_partial.sql` u migraciji maintenance_parts.
- **Ne commitovati** `backend/dist/`.
- Ako ugradnja vraća 400 „not linked”: provjeri da je link na **child** kategoriji opreme, ne na parentu.

---

## Todo status (planovi)

| ID / faza | Status |
|-----------|--------|
| fix-nav-settings | completed |
| maintenance-schema + DB | completed |
| maintenance-category-links (MVP) | completed |
| maintenance-warehouse-receive | completed |
| maintenance-host-install + B5 sheet | completed |
| B6 potrošnja + P3 legacy spec UI | completed |
| **child host linkovi** (plan de446efe) | **completed u kodu** |
| Ručna migracija + E2E test | **pending (korisnik)** |
