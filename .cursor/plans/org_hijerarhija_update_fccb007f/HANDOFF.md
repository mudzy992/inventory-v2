# Org hijerarhija update — HANDOFF

**Datum handoffa:** 2026-06-04  
**Zadnje ažuriranje:** 2026-06-04  
**Plan:** [org_hijerarhija_update_fccb007f.plan.md](../org_hijerarhija_update_fccb007f.plan.md)  
**Matrica:** [.cursor/docs/matrices/org-hierarchy/MATRIX.md](../../docs/matrices/org-hierarchy/MATRIX.md)  
**Status:** **Faza završena** (implementacija + QA iteracije u sesiji). Git commit po želji vlasnika.

---

## Sažetak faze

| Oblast | Ishod |
|--------|--------|
| Tip `poslovna_jedinica` + matrica parent→child | ✅ Backend + frontend + testovi |
| OrganizationPage forma | ✅ Autocomplete, inherit potpisnik/grad, save UX |
| Validacija PATCH djece | ✅ `nextType`, ne `parent.type` |
| Refresh effective signer/location | ✅ Otvoreno podstablo, skip unchanged, batch |
| Skladište inherit | ✅ Walk-up bez filtra grada (`warehouses` matrica) |
| UI stabla | ✅ Samo krov otvoren na load |

---

## Dokumentacija (source of truth)

- `.cursor/docs/matrices/org-hierarchy/MATRIX.md`
- `.cursor/docs/matrices/org-hierarchy/CHANGELOG.md` (2026-06-04 do (5))
- `.cursor/docs/matrices/warehouses/MATRIX.md` + `CHANGELOG.md` (skladište inherit)

---

## Test status (zadnje)

| Komanda | Rezultat |
|---------|----------|
| `cd backend && npm run test:unit` | ✅ 89/89 |
| `cd backend && npm run build` | ✅ |
| `cd frontend && npm run build` | ✅ |
| `npx prisma migrate deploy` | ✅ (`inventory-v3`) |

---

## Rizici / operativa (i dalje važe)

| # | Tema |
|---|------|
| 1 | Legacy čvorovi koji krše matricu — audit prije produkcije |
| 2 | Više root `direkcija` nije eksplicitno zabranjeno |
| 3 | Rad nije commitovan dok vlasnik ne traži — bez `backend/dist/` |

---

## Ključni fajlovi

```
backend/src/common/utils/org-hierarchy-validation.util.ts
backend/src/common/utils/org-hierarchy-messages.util.ts
backend/src/common/utils/collect-open-org-subtree.util.ts
backend/src/common/services/signer-resolution.service.ts
backend/src/common/services/location-resolution.service.ts
backend/src/modules/org-units/org-units.service.ts
frontend/src/components/OrganizationPage.tsx
frontend/src/components/searchable-autocomplete.tsx
frontend/src/helpers/org-hierarchy.util.ts
frontend/src/helpers/org-warehouse.util.ts
```

---

## Sljedeći korak (izvan ove faze)

- Git commit kad korisnik traži: npr. `feat(org): hijerarhija poslovna_jedinica, forma, performanse`
- Nova faza / modul → novi plan ili HANDOFF
