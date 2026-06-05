# HANDOFF — list performance (server-side paginacija)

**Plan:** [`.cursor/plans/backend_list_performance_1d30db39.plan.md`](../backend_list_performance_1d30db39.plan.md)  
**Matrica:** [`.cursor/docs/matrices/list-performance/MATRIX.md`](../../docs/matrices/list-performance/MATRIX.md)  
**Changelog:** [`.cursor/docs/matrices/list-performance/CHANGELOG.md`](../../docs/matrices/list-performance/CHANGELOG.md)  
**Datum handoffa:** 2026-06-05  
**Status:** Backend ~97% · Frontend ~97% · **Faza 5 cleanup gotov** · Testovi / ručni QA preostali

---

## Sažetak

Server-side paginacija (`{ items, meta }`) je implementirana za glavne list endpointe. Login koristi **`fetchBootstrap`** — `equipment`, `employees`, `transfers`, `users` u `AppState` su **prazni nizovi**. Kritične stranice i helperi više ne ovise o tim nizovima.

**Build (sesija 5):** `backend npm run build` ✅ · `frontend npm run build` ✅  
**E2E / ručni QA:** nije rađeno

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

### Prioritet 1 — testovi i QA

- [ ] Backend spec/e2e: paginacija + scope po roli (admin / evidentičar / user / skladistar)
- [ ] Ručni QA checklist: login payload size, scroll 1000+ opreme, evidentičar scope, QR → EquipmentCard, warehouse stock browse, inventory lazy load, notifications load-more, settings lists tab

### Prioritet 2 — manji UI gapovi (niski)

| Stavka | Stanje |
|--------|--------|
| **`registrar-stock-page`** | Nema `usePaginatedList` + `PaginationControls` ako lista raste |
| **`EquipmentByCategoryPage`** | Dinamički filteri na trenutnoj stranici (nije server-side) |
| **`WarehousesPage`** | Evidentičar client-side filter — `meta.total` može biti netačan |
| **Autocomplete cleanup** | `OrgUnitAutocomplete` još prima `orgUnits` prop |

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
| `pagination.util.spec.ts` | ✅ |
| E2e / ručni QA | ❌ |
| Scope regression (evidentičar) | ❌ |
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
