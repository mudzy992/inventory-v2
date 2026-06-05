# HANDOFF — list performance (server-side paginacija)

**Plan:** [`.cursor/plans/backend_list_performance_1d30db39.plan.md`](../backend_list_performance_1d30db39.plan.md)  
**Matrica:** [`.cursor/docs/matrices/list-performance/MATRIX.md`](../../docs/matrices/list-performance/MATRIX.md)  
**Changelog:** [`.cursor/docs/matrices/list-performance/CHANGELOG.md`](../../docs/matrices/list-performance/CHANGELOG.md)  
**Datum handoffa:** 2026-06-05  
**Status:** Backend ~98% · Frontend ~97% · **Unit testovi scope/paginacija** ✅ · Ručni QA preostaje

---

## Sažetak

Server-side paginacija (`{ items, meta }`) je implementirana za glavne list endpointe. Login koristi **`fetchBootstrap`** — `equipment`, `employees`, `transfers`, `users` u `AppState` su **prazni nizovi**. Kritične stranice i helperi više ne ovise o tim nizovima.

**Build (sesija 6):** `backend npm run build` ✅ · `frontend npm run build` ✅ · `npm run test:unit` ✅ (121 testova)  
**E2E / ručni QA:** checklist spreman, nije izvršen — v. [`QA_CHECKLIST.md`](./QA_CHECKLIST.md)

---

## Šta je urađeno u sesiji 6

### Unit testovi ✅

| Fajl | Pokriva |
|------|---------|
| `registrar-scope.service.spec.ts` | `buildEquipmentWhere` / `buildEmployeeWhere` / `buildStockLotWhere` / `buildTransferWhere` po roli (admin, user, skladistar, evidenticar mode A/B); `canAccessEquipment`; `canCreateTransferType` |
| `pagination.util.spec.ts` | Dodan u `test:unit`; `resolveListPageSize` + settings cap |

Pokretanje: `cd backend && npm run test:unit` → **121 pass**

### Ručni QA checklist

- [`.cursor/plans/list-performance/QA_CHECKLIST.md`](./QA_CHECKLIST.md) — koraci za login bootstrap, paginaciju, scope, notifikacije, settings

---

## Šta je urađeno u sesiji 5

### Faza 5 — cleanup store-a i helpera ✅

| Promjena | Detalj |
|----------|--------|
| `store.ts` | Uklonjeni `getNextDocumentNumber`, `getEquipmentStats`, `getCurrentEmployee`; `isCrossServiceTransfer` koristi org unit ID-eve |
| `helpers.ts` | `getSignerIdForOrgUnit`, `resolveSignerEmployee`; stari `getSignerForEmployee` deprecated |
| `create-transfer-payload.util.ts` | Signer iz org-unit lanca; `toPersonOrgUnitId` umjesto `state.employees[0]` |
| `registrar-scope.ts` | Holder iz `equipment.currentHolder`; fallback na store samo ako postoji |
| `transfer-warehouse.util.ts` | Holder org unit iz `currentHolder` |
| `org-warehouse.util.ts` | Uklonjeni `countEquipmentInOrgSubtree`, `filterTransfersForWarehouse` (mrtav) |
| `get-city-equipment.ts` | Obrisan (nekorišten) |
| `useCurrentEmployee` hook | Layout + sidebar — `fetchEmployeeApi` po loginu |
| `CategoriesPage` | Statistike preko `fetchEquipmentSummaryApi` |
| `TransfersPage` / `EquipmentCard` | `toPersonOrgUnitId`, cross-service po org unit ID-u |

### Backend

| Promjena | Fajl |
|----------|------|
| `GET /org-units/:id/equipment-subtree-count` | `org-units.controller.ts`, `org-units.service.ts` |

### Notifications paginacija ✅

- `SocketContext`: `loadMoreNotifications`, `hasMoreNotifications`, tačan `unreadCount` preko API-ja
- `NotificationsPanel`: dugme „Učitaj više"
- `fetchUnreadNotificationsCountApi` (`unread=true`, `meta.total`)

### Settings UI za `lists.*` ✅

- Grupa `lists` u `settings-ui-groups.ts`
- Tab **Liste** u postavkama (`lists.default_page_size`, `lists.max_page_size`)

---

## Šta NIJE gotovo (sljedeća sesija)

### Prioritet 1 — ručni QA

- [ ] Proći [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) s test korisnicima (admin / evidentičar / user / skladistar)
- [ ] Opciono: HTTP e2e (Supertest) protiv seed baze — trenutno samo unit testovi

### Prioritet 2 — manji UI gapovi

| Stavka | Stanje |
|--------|--------|
| **`registrar-stock-page`** | ✅ `usePaginatedList` + `PaginationControls` |
| **`EquipmentByCategoryPage`** | ✅ Info banner: filteri/CSV samo na trenutnoj stranici |
| **`WarehousesPage`** | ✅ Evidentičar scope u SQL (`buildListWhere`); uklonjen client filter |
| **`OrgUnitAutocomplete`** | ✅ Čita `orgUnits` iz store-a; API search za ≥2 znaka |

### Prioritet 3 — opciono

- [ ] NestJS `compression` middleware
- [ ] Signer preview u TransfersPage: fetch signer employee po ID ako nije u search rezultatima

---

## Poznati rizici (nepromijenjeno)

1. **Evidentičar scope u SQL** — nema paralelnog testa sa starim post-filterom.
2. **Employees search** — global search bez evidentičar scope (autocomplete).
3. **Employee relocation** — source/dest dijele isti `page` query param.
4. **Inventory** — stari vs novi inventory-count controller — uskladiti ako treba.

---

## Brzi start u novoj sesiji

```bash
cd backend && npm run build
cd ../frontend && npm run build

# Provjera da nema store ovisnosti (samo fallbacki u deprecated helperima)
rg "state\.(equipment|employees|transfers|users)" frontend/src

# Referentne implementacije
# frontend/src/hooks/use-current-employee.ts
# frontend/src/helpers/create-transfer-payload.util.ts
# frontend/src/contexts/SocketContext.tsx
# frontend/src/constants/settings-ui-tabs.ts  (tab "Liste")
```

**Prompt za nastavak:**

> Nastavi list-performance HANDOFF. Prioritet: backend scope testovi + ručni QA checklist; opciono registrar-stock paginacija i WarehousesPage evidentičar scope na backendu.

---

## Test status

| Test | Rezultat |
|------|----------|
| `backend npm run build` | ✅ (sesija 5) |
| `frontend npm run build` | ✅ (sesija 5) |
| `npm run test:unit` | ✅ 121/121 (sesija 6) |
| `registrar-scope.service.spec.ts` | ✅ |
| `pagination.util.spec.ts` | ✅ |
| E2e / ručni QA | ❌ (checklist spreman) |
| Scope regression (evidentičar) | ⚠️ unit only, nije HTTP e2e |
| Store/helper cleanup (Faza 5) | ✅ |
| Notifications load-more | ✅ (implementirano, nije ručno testirano) |
| Settings UI `lists.*` | ✅ |

---

## Arhiva — Prioritet 1 komponente (završeno)

<details>
<summary>Klik za punu listu migriranih komponenti</summary>

- EquipmentCard, warehouse-detail-view, QRScannerPage
- OrganizationPage, registrar-stock-page, CategoriesPage
- WarehousesPage (+ paginacija), DisposalCommissionsPage
- EquipmentByCategoryPage, InventoryCountPage, session-lines-panel
- warehouse-stock-browse-panel (bugfix)
- Layout/sidebar (useCurrentEmployee), org-unit-warehouses-section (subtree count API)

</details>
