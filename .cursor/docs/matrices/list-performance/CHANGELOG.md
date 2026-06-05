# Changelog — list performance

## 2026-06-05 (sesija 5 — Faza 5 cleanup)

- **Store/helper cleanup:** uklonjeni `getEquipmentStats`, `getNextDocumentNumber`, `getCurrentEmployee`; transfer signer i cross-service bez `state.employees`.
- **`useCurrentEmployee` hook** — Layout/sidebar učitava profil preko `fetchEmployeeApi`.
- **`CategoriesPage`** — statistike kategorija preko `fetchEquipmentSummaryApi`.
- **`GET /org-units/:id/equipment-subtree-count`** — zamjena za `countEquipmentInOrgSubtree`.
- **Notifications:** load-more u headeru, `fetchUnreadNotificationsCountApi`, tačan badge.
- **Settings UI:** tab „Liste" za `lists.default_page_size` / `lists.max_page_size`.
- Obrisan mrtvi `get-city-equipment.ts`.

## 2026-06-05 (handoff sesija 4)

- HANDOFF ažuriran: UI regresije (prazan store) riješene; preostaje Faza 5 cleanup (`store.ts`, scope helperi, notifications, settings UI, testovi).
- Frontend procjena: ~92%.

## 2026-06-05 (session 4)

- `EquipmentByCategoryPage` — holder iz `currentHolder`; label print učitava odabrane stavke preko `fetchEquipmentApi`; save filter koristi `getCurrentUser()`.
- `WarehousesPage` — `usePaginatedList` + `PaginationControls` (`fetchWarehousesPageApi`).
- `session-lines-panel` — employee picker i holder lookup iz API-ja; scope equipment mapira `currentHolder`.

## 2026-06-05 (session 3)

- **Bugfix:** `warehouse-stock-browse-panel` — `lots is not iterable` (API vraća `{ items, meta }`, ne niz); ispravljen URL u `fetchWarehouseStockLotsPageApi`.
- `QRScannerPage` — pretraga i brzi pristup preko equipment API-ja.
- `OrganizationPage`, `registrar-stock-page`, `WarehousesPage`, `warehouse-context-panel`, `org-unit-warehouses-section` — employees/users iz API-ja.
- `CategoriesPage` — delete guard preko `fetchEquipmentPageApi({ categoryId, pageSize: 1 })`.
- `fetchSkladistarUsersApi` helper u `users-api.ts`.

## 2026-06-05 (session 2)

- `EquipmentCard`: `GET /equipment/:id` + paginirani transfers + employees picker preko API-ja (više ne ovisi o praznom store-u).
- `warehouse-detail-view`: transfers tab učitava `fetchTransfersPageApi({ warehouseId })`; backend dodao `warehouseId` filter na `GET /transfers`.
- `InventoryCountPage`: lazy load — sesije (`fetchInventorySessionsPageApi`), komisije po sesiji, linije + equipment-scope po komisiji; print scope samo na štampu.
- `fetchEquipmentApi` u `equipment-api.ts`.

## 2026-06-05 (handoff)

- HANDOFF za nastavak: `.cursor/plans/list-performance/HANDOFF.md`
- Frontend ~75%: preostaju `EquipmentCard`, warehouse detail, Organization, InventoryCount lazy UI, store cleanup.

## 2026-06-05 (implementacija)

- Zajednički `PaginatedQueryDto` / `PaginatedResponse` i helperi u `backend/src/common/`.
- Settings: `lists.default_page_size`, `lists.max_page_size`.
- Paginirani list endpointi: equipment, transfers, employees, users, warehouses, notifications, warehouse-stock, employee-relocation, disposal-commissions, equipment-catalog, inventory-count (lazy).
- Search API: org-units, categories, locations, employees.
- Scope filteri u SQL (`buildEquipmentWhere`, `buildEmployeeWhere`, `buildTransferWhere`, `buildStockLotWhere`).
- Frontend: `fetchBootstrap`, `usePaginatedList`, `PaginationControls`, migracija glavnih stranica.
- Quick wins: JSON spec unique check, transfer list light include, committee equipment SQL scope.
