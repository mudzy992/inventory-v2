# Guard registry — audit i status

Izvor istine za preconditions, backend/frontend guardove i UX poruke po akciji.

**Legenda:** BE/FE **✓** enforced | **△** djelomično | **✗** nedostaje

## Sažetak prioriteta (nakon audita 2026-06-15)

| Modul | P0 | P1 | P2 | Napomena |
|-------|----|----|-----|----------|
| auth-session | 0 | 0 | 0 | Kompletno |
| roles-access | 0 | 0 | 1 | Scope tabele u MATRIX |
| settings | 0 | 0 | 1 | Enforcement referenca |
| install-setup | 0 | 0 | 0 | Dodano u registry |
| org-hierarchy | 0 | 0 | 2 | create/update FE |
| locations | 0 | 0 | 2 | EN poruke na nekim endpointima |
| warehouses | 0 | 0 | 2 | destroy FE ✓ nakon implementacije |
| categories-fields | 0 | 0 | 1 | create/update FE |
| equipment-status | 0 | 0 | 2 | reactivate FE hint |
| transfers | 0 | 0 | 1 | rashodovanje blokirano FE+BE |
| warehouse-stock | 0 | 0 | 1 | define_spec BE ✓ |
| maintenance-parts | 0 | 0 | 0 | FE guardi dodani |
| employee-relocation | 0 | 0 | 0 | FE guardi dodani |
| inventory-count | 0 | 0 | 1 | close_committee predsjednik |
| disposal-commission | 0 | 0 | 0 | FE guardi na withdraw |
| notifications | 0 | 0 | 0 | |
| labels | 0 | 0 | 1 | rate limit (ops) |
| list-performance | — | — | — | Nema write guardova |
| deploy-traefik | — | — | — | Infra |
| employees (appendix) | 0 | 0 | 0 | FE ✓ |
| equipment-catalog (appendix) | 0 | 0 | 0 | FE ✓ |

---

## auth-session

### auth-session.login
- **Opis:** Prijava korisnika
- **Preconditions:** Valjan username/password
- **Backend guard:** `auth.service.ts:login` — ✓
- **Frontend guard:** `LoginPage` forma — ✓
- **UX poruka (BS):** Neispravni podaci za prijavu
- **Gap:** —
- **Prioritet:** —
- **Napomena:** JWT access + refresh rotacija

### auth-session.refresh
- **Opis:** Silent refresh access tokena
- **Preconditions:** Valjan refresh token u bazi, nije revokovan
- **Backend guard:** `auth.service.ts:refresh` — ✓
- **Frontend guard:** `client.ts` / `auth-refresh.ts` mutex retry — ✓
- **UX poruka (BS):** Sesija istekla (event `auth:session-expired`)
- **Gap:** —
- **Prioritet:** —

### auth-session.logout
- **Opis:** Eksplicitna odjava
- **Preconditions:** Autentificiran
- **Backend guard:** `auth.service.ts:logout` — ✓
- **Frontend guard:** `clearTokens()` — ✓
- **UX poruka (BS):** —
- **Gap:** —
- **Prioritet:** —

---

## roles-access

### roles-access.api_access
- **Opis:** Pristup API endpointu po ulozi
- **Preconditions:** JWT + `@Roles()` na controlleru
- **Backend guard:** `RolesGuard`, `RegistrarScopeService`, `InventoryCoordinatorScope` — ✓
- **Frontend guard:** `role-page-access.ts`, `LayoutNavGate` — ✓
- **UX poruka (BS):** 403 Forbidden
- **Gap:** —
- **Prioritet:** —

### roles-access.registrar_assignment
- **Opis:** Admin dodjeljuje evidentičaru scope (W+C, režim A/B)
- **Preconditions:** Ekskluzivnost A/B po W+C; org↔warehouse za B; bez duplikata
- **Backend guard:** `registrar-assignment-validation.util.ts` — ✓
- **Frontend guard:** `UserFormModal`, `registrar-assignment-rules.ts` — ✓
- **UX poruka (BS):** BS iz validacije
- **Gap:** —
- **Prioritet:** —

### roles-access.coordinator_assignment
- **Opis:** Dodjela koordinatora popisa
- **Preconditions:** Min 1 skladište
- **Backend guard:** `users-validation.util` — ✓
- **Frontend guard:** `UserFormModal` — ✓
- **UX poruka (BS):** BS iz validacije
- **Gap:** —
- **Prioritet:** —

### roles-access.moderator_assignment
- **Opis:** Admin dodjeljuje moderatoru org root(ove) i warehouse dodjele za popisne komisije
- **Preconditions:** Min 1 org root; warehouse.orgUnitId u org scope; `@@unique([warehouseId])` na warehouse dodjeli
- **Backend guard:** `users-validation.util` + `ModeratorScopeService` — ✓
- **Frontend guard:** `UserFormModal` moderator assignment UI — ✓
- **UX poruka (BS):** BS iz validacije
- **Gap:** —
- **Prioritet:** —

### roles-access.moderator_scoped_write
- **Opis:** Moderator mutira users/org/employees/warehouses/inventory committees u scope
- **Preconditions:** `features.moderator_role`; target u scope; ne smije dodijeliti admin/moderator
- **Backend guard:** `ModeratorScopeService` per-servis — ✓
- **Frontend guard:** `role-page-access.ts`, scoped forms — ✓
- **UX poruka (BS):** 403 Forbidden
- **Gap:** —
- **Prioritet:** —

---

## settings

### settings.patch
- **Opis:** Admin mijenja postavku iz registry-ja
- **Preconditions:** Admin; `adminEditable`; poznat ključ
- **Backend guard:** `settings.service.ts:upsert` — ✓
- **Frontend guard:** `SettingsPage` — ✓
- **UX poruka (BS):** Opis iz registry-ja
- **Gap:** —
- **Prioritet:** —

### settings.feature_enforcement
- **Opis:** Write API poziva `assertFeatureEnabled` za modul
- **Preconditions:** Vidi [settings/MATRIX.md](./settings/MATRIX.md) enforcement tabelu
- **Backend guard:** Per-servis (`EmployeesService`, `TransfersService`, …) — ✓
- **Frontend guard:** `PAGE_FEATURE_SETTING_KEY`, `LayoutNavGate` — ✓
- **UX poruka (BS):** Modul onemogućen
- **Gap:** P2 — cross-check svih `features.*` ključeva
- **Prioritet:** P2

---

## install-setup

### install-setup.initialize
- **Opis:** Jednokratni setup wizard
- **Preconditions:** Nema korisnika u bazi; opcionalno `SETUP_TOKEN`
- **Backend guard:** `setup.service` 409 ako user postoji — ✓
- **Frontend guard:** `SetupWizardPage` kad `needsSetup` — ✓
- **UX poruka (BS):** Setup već izvršen
- **Gap:** —
- **Prioritet:** —

---

## org-hierarchy

### org-hierarchy.create_org_unit
- **Opis:** Admin kreira org. jedinicu
- **Preconditions:** `features.organization`; valid parent-child tip
- **Backend guard:** `org-units.service.ts:create` — ✓
- **Frontend guard:** Forma — △ (API toast)
- **UX poruka (BS):** `ORG_HIERARCHY_MESSAGES.formatInvalidParentChildMessage`
- **Gap:** Nema inline FE guarda za tip
- **Prioritet:** P2

### org-hierarchy.update_org_unit
- **Opis:** Izmjena org. jedinice
- **Preconditions:** Nema ciklusa; tip kompatibilan s djecom
- **Backend guard:** `org-units.service.ts:update` — ✓
- **Frontend guard:** — ✗
- **UX poruka (BS):** Ciklus / tip poruke iz BE
- **Gap:** FE pre-check
- **Prioritet:** P2

### org-hierarchy.delete_org_unit
- **Opis:** Brisanje org. jedinice
- **Preconditions:** Nema djece; nema zaposlenika
- **Backend guard:** `org-units.service.ts:remove` + `ORG_HIERARCHY_MESSAGES` — ✓
- **Frontend guard:** `canDeleteOrgUnit` / `OrganizationPage` — ✓
- **UX poruka (BS):** `deleteHasChildren`, `deleteHasEmployees`
- **Gap:** —
- **Prioritet:** —

---

## locations

### locations.create_canton / create_city / update_*
- **Opis:** CRUD kantona i gradova (admin)
- **Preconditions:** `features.locations`
- **Backend guard:** `locations.service.ts` — ✓
- **Frontend guard:** — △
- **UX poruka (BS):** `LOCATION_MESSAGES` (djelimično EN na update)
- **Gap:** P2 lokalizacija EN poruka
- **Prioritet:** P2

### locations.delete_canton
- **Opis:** Brisanje kantona
- **Preconditions:** `features.locations`; nema gradova
- **Backend guard:** `locations.service.ts:deleteCanton` — ✓ (feature flag dodan)
- **Frontend guard:** `canDeleteCanton` — ✓
- **UX poruka (BS):** `deleteCantonHasCities`
- **Gap:** —
- **Prioritet:** —

### locations.delete_city
- **Opis:** Brisanje grada
- **Preconditions:** Nije referenciran od org/skladišta/komisije rashoda
- **Backend guard:** `locations.service.ts:deleteCity` — ✓
- **Frontend guard:** `canDeleteCity` + `disposalCommissionCount` — ✓
- **UX poruka (BS):** `deleteCityReferenced`
- **Gap:** —
- **Prioritet:** —

---

## warehouses

### warehouses.create_warehouse
- **Opis:** Kreiranje skladišta
- **Preconditions:** `features.warehouses`; admin; city, orgUnit, keeper skladištar
- **Backend guard:** `warehouses.service.ts:create` — ✓
- **Frontend guard:** `canCreateWarehouse` — ✓
- **UX poruka (BS):** `WAREHOUSE_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### warehouses.destroy_equipment
- **Opis:** Finalno uništenje rashodovane opreme
- **Preconditions:** `rashodovano` + `spremno_za_unistenje`; keeper/admin; nema freeze
- **Backend guard:** `warehouses.service.ts:destroyEquipment` — ✓
- **Frontend guard:** `canDestroyEquipment` / `WarehouseDestructionPanel` — ✓
- **UX poruka (BS):** `WAREHOUSE_MESSAGES.destroyNotReady`
- **Gap:** —
- **Prioritet:** —

### warehouses.upload_activate_template
- **Opis:** Upload/aktivacija DOCX obrasca prenosnice
- **Preconditions:** Skladište ima `orgUnitId`; .docx; `upload.max_mb`
- **Backend guard:** `warehouse-transfer-template.service.ts` — ✓
- **Frontend guard:** — △
- **UX poruka (BS):** Org jedinica obavezna
- **Gap:** P2 FE mime/size
- **Prioritet:** P2

---

## categories-fields

### categories-fields.delete_category
- **Opis:** Brisanje kategorije
- **Preconditions:** Nema djece; nema opreme
- **Backend guard:** `categories.service.ts:remove` — ✓
- **Frontend guard:** `canDeleteCategory` — ✓
- **UX poruka (BS):** `CATEGORY_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### categories-fields.create_update_category
- **Opis:** CRUD kategorija i polja
- **Preconditions:** `features.categories`; leaf za opremu; unique normalizacija
- **Backend guard:** `categories.service.ts` — ✓
- **Frontend guard:** — △
- **UX poruka (BS):** API
- **Gap:** P2 inline validacija
- **Prioritet:** P2

---

## equipment-status

### equipment-status.update_equipment
- **Opis:** PATCH opreme
- **Preconditions:** `features.equipment`; scope; freeze; leaf; warehouseId za skladiste
- **Backend guard:** `equipment.service.ts:update` — ✓
- **Frontend guard:** `canSaveEquipmentWarehouse` — △
- **UX poruka (BS):** `warehouseRequired`
- **Gap:** P2 spec/freeze hint
- **Prioritet:** P2

### equipment-status.reactivate
- **Opis:** Admin reaktivacija rashodovane+uništene
- **Preconditions:** admin; `rashodovano`+`unisteno`; obrazloženje
- **Backend guard:** `equipment.service.ts:reactivate` — ✓
- **Frontend guard:** `EquipmentCard` — △
- **UX poruka (BS):** API
- **Gap:** P2 `canReactivate` helper
- **Prioritet:** P2

### equipment-status.post_forbidden
- **Opis:** POST /equipment zabranjen
- **Backend guard:** 403 — ✓
- **Frontend guard:** Nema UI — ✓
- **Gap:** —
- **Prioritet:** —

---

## transfers

### transfers.create_transfer
- **Opis:** Prenos opreme (dokument ili direktno)
- **Preconditions:** `features.transfers`; scope; freeze; `isTransferDocumentEnabled` za dokument flow; signer samo za dokument
- **Backend guard:** `transfers.service.ts:create` — ✓
- **Frontend guard:** `canPerformEquipmentTransfer`, `canCreateCrossServiceTransfer` — ✓
- **UX poruka (BS):** `TRANSFER_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### transfers.create_rashodovanje
- **Opis:** Legacy rashodovanje prenosnicom — **blokirano**
- **Preconditions:** Uvijek odbijeno
- **Backend guard:** `transfers.service.ts:create` BadRequest — ✓
- **Frontend guard:** Dugme disabled + `rashodovanjeBlocked` — ✓
- **UX poruka (BS):** Rashod ide preko liste za rashod u nacrtu sesije
- **Gap:** —
- **Prioritet:** —

### transfers.sign_transfer
- **Opis:** Finalizacija / upload PDF
- **Preconditions:** `require_signed_pdf_upload` ili admin bypass
- **Backend guard:** `transfers.service.ts:finalize` — ✓
- **Frontend guard:** `canSignTransfer` — ✓
- **UX poruka (BS):** `uploadRequiredBeforeSign`
- **Gap:** —
- **Prioritet:** —

---

## warehouse-stock

### warehouse-stock.receive_lot
- **Opis:** Prijem ISSUABLE lota (skladištar/admin)
- **Preconditions:** `features.registrar_stock`; keeper; freeze; leaf; ne MAINTENANCE
- **Backend guard:** `warehouse-stock.service.ts:receive` — ✓
- **Frontend guard:** Freeze hint — △
- **UX poruka (BS):** API
- **Gap:** P2 dedicated receive guard
- **Prioritet:** P2

### warehouse-stock.define_specifications
- **Opis:** Popuna lot specifikacije
- **Preconditions:** `features.registrar_stock`; status ≠ zatvoreno; freeze
- **Backend guard:** `warehouse-stock.service.ts:defineSpecifications` — ✓
- **Frontend guard:** `canEditLotSpecifications` — ✓
- **UX poruka (BS):** `WAREHOUSE_STOCK_GUARD_MESSAGES.lotClosed`
- **Gap:** —
- **Prioritet:** —

### warehouse-stock.issue_unit / commission_unit
- **Opis:** Izdavanje / kolaudacija komada
- **Preconditions:** `features.registrar_stock`, `features.transfers`; `spremno_za_izdavanje`; qty>0; freeze; `isTransferDocumentEnabled` za prenosnicu
- **Backend guard:** `warehouse-stock.service.ts` — ✓
- **Frontend guard:** `canIssueFromLot` — ✓
- **UX poruka (BS):** `WAREHOUSE_STOCK_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### warehouse-stock.cross_warehouse_issue
- **Opis:** Admin cross-warehouse izdavanje
- **Preconditions:** `transfer.allow_admin_cross_warehouse_issue`; admin; catalogItemId
- **Backend guard:** `warehouse-stock.service.ts:issueUnit` — ✓
- **Frontend guard:** `canCrossWarehouseIssue` — ✓ (helper)
- **UX poruka (BS):** `crossWarehouseAdminOnly`
- **Gap:** Wire u UI kad cross-flow postoji
- **Prioritet:** P2

---

## maintenance-parts

### maintenance-parts.install_part
- **Opis:** Ugradnja dijela na opremu
- **Preconditions:** `features.maintenance_parts`; category link; host nije rashodovana
- **Backend guard:** `maintenance-parts.service.ts:installPart` — ✓
- **Frontend guard:** `canInstallMaintenancePart` — ✓
- **UX poruka (BS):** `MAINTENANCE_PARTS_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### maintenance-parts.mark_faulty / remove / replace
- **Opis:** Upravljanje ugrađenim dijelovima
- **Preconditions:** Status prelazi (active/faulty/removed)
- **Backend guard:** `maintenance-parts.service.ts` — ✓
- **Frontend guard:** `canMarkPartFaulty`, `canRemoveMaintenancePart`, `canReplaceMaintenancePart` — ✓
- **UX poruka (BS):** `MAINTENANCE_PARTS_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

---

## employee-relocation

### employee-relocation.resolve_source
- **Opis:** Prebaci / razduži na izvoru
- **Preconditions:** Source registrar; catalog za transfer; freeze (admin izuzetak)
- **Backend guard:** `employee-relocation.service.ts:resolveSource` — ✓
- **Frontend guard:** `canTransferRelocationLine`, `canResolveRelocationWhileFrozen` — ✓
- **UX poruka (BS):** `EMPLOYEE_RELOCATION_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### employee-relocation.resolve_dest
- **Opis:** Prihvati / odbij na cilju
- **Preconditions:** Dest registrar; freeze
- **Backend guard:** `employee-relocation.service.ts:resolveDest` — ✓
- **Frontend guard:** `canResolveRelocationWhileFrozen` — ✓
- **UX poruka (BS):** API
- **Gap:** —
- **Prioritet:** —

### employee-relocation.map_catalog
- **Opis:** Admin mapira šifrarnik (legacy)
- **Preconditions:** admin; case open; leaf catalog
- **Backend guard:** `employee-relocation.service.ts:mapLineCatalog` — ✓
- **Frontend guard:** Admin UI — ✓
- **UX poruka (BS):** API
- **Gap:** —
- **Prioritet:** —

---

## inventory-count

### inventory-count.create_session
- **Opis:** Nova popisna sesija
- **Preconditions:** 1× (distribucija, godina); nema otvorene globalno
- **Backend guard:** `inventory-count.service.ts:createSession` — ✓
- **Frontend guard:** Forma — △
- **UX poruka (BS):** API
- **Gap:** P2 distribucija tip FE
- **Prioritet:** P2

### inventory-count.activate_session
- **Opis:** Aktivacija sesije
- **Preconditions:** Svi slotovi configured; listed bez komisije; keeper employeeId
- **Backend guard:** `inventory-count.service.ts:activateSession` — ✓
- **Frontend guard:** `canActivateInventorySession` — ✓
- **UX poruka (BS):** `INVENTORY_GUARD_MESSAGES`
- **Gap:** P2 keeper employeeId hint
- **Prioritet:** P2

### inventory-count.delete_session / delete_committee
- **Opis:** Brisanje draft sesije/komisije
- **Preconditions:** Draft; committee rules
- **Backend guard:** `inventory-count.service.ts` — ✓
- **Frontend guard:** `canDeleteInventorySession`, `canDeleteInventoryCommittee` — ✓
- **UX poruka (BS):** `INVENTORY_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### inventory-count.record_line
- **Opis:** Unos popisne linije
- **Preconditions:** Član komisije; session active; admin excluded
- **Backend guard:** `inventory-count.service.ts:recordLine` — ✓
- **Frontend guard:** `session-lines-panel` — ✓
- **UX poruka (BS):** API
- **Gap:** —
- **Prioritet:** —

### inventory-count.close_session
- **Opis:** Zatvaranje sesije (async job)
- **Preconditions:** Active session; admin
- **Backend guard:** `inventory-count.service.ts:closeSession` — ✓
- **Frontend guard:** Confirm dialog — ✓
- **UX poruka (BS):** API
- **Gap:** —
- **Prioritet:** —

---

## disposal-commission

### disposal-commission.mark_disposal_list
- **Opis:** Dodaj opremu na listu za rashod (draft)
- **Preconditions:** `features.disposal_pre_list`; `features.inventory_count`; draft; `equipment.status === skladiste` + `warehouseId`
- **Backend guard:** `equipment-disposal-list.service.ts:markForDisposal` — ✓
- **Frontend guard:** `canMarkDisposalList` — ✓ (helper)
- **UX poruka (BS):** `DISPOSAL_GUARD_MESSAGES.disposalRequiresWarehouse`, `sessionNotDraft`
- **Gap:** —
- **Prioritet:** —

### disposal-commission.withdraw_disposal_list
- **Opis:** Admin povlači sa liste
- **Preconditions:** admin; draft; status listed
- **Backend guard:** `equipment-disposal-list.service.ts:withdrawFromList` — ✓
- **Frontend guard:** `canWithdrawDisposalList` / `DisposalListPanel` — ✓
- **UX poruka (BS):** `DISPOSAL_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### disposal-commission.review_disposal_approval
- **Opis:** Predsjednik approve/reject
- **Preconditions:** pending; predsjednik komisije
- **Backend guard:** `inventory-count.service.ts:reviewDisposalApproval` — ✓
- **Frontend guard:** `canReviewDisposalApproval` — ✓ (helper)
- **UX poruka (BS):** `presidentOnlyReview`
- **Gap:** P2 inbox UI skrivanje za non-predsjednike
- **Prioritet:** P2

---

## notifications

### notifications.list / mark_read / mark_all_read
- **Opis:** In-app notifikacije
- **Preconditions:** JWT; own userId
- **Backend guard:** `notifications.service.ts` — ✓
- **Frontend guard:** `NotificationsPanel` — ✓
- **UX poruka (BS):** —
- **Gap:** —
- **Prioritet:** —

### notifications.realtime
- **Opis:** Socket.IO refresh
- **Preconditions:** `notifications.realtime`; `notifications.enabled`
- **Backend guard:** Gateway + service — ✓
- **Frontend guard:** `SocketContext` polling fallback — ✓
- **UX poruka (BS):** —
- **Gap:** —
- **Prioritet:** —

---

## labels

### labels.qr_print
- **Opis:** Štampa QR naljepnica
- **Preconditions:** Pristup opremi po ulozi/scope
- **Backend guard:** Equipment read scope — ✓
- **Frontend guard:** `EquipmentCard`, role gates — ✓
- **UX poruka (BS):** —
- **Gap:** P2 public endpoint rate limit (ops)
- **Prioritet:** P2

---

## list-performance / deploy-traefik

Infrastrukturne matrice — **nema poslovnih write guardova** na korisničkim akcijama. Paginacija: `lists.max_page_size` clamp na BE.

---

## Appendix: employees

### employees.delete
- **Opis:** Admin briše radnika
- **Preconditions:** Nema user računa; nije signer; nema potpisanih transfera; nema zaduženja; nema open relocation
- **Backend guard:** `employees.service.ts:remove` + `EMPLOYEE_MESSAGES` — ✓
- **Frontend guard:** `canDeleteEmployee` / `EmployeesPage` — ✓
- **UX poruka (BS):** `EMPLOYEE_GUARD_MESSAGES`
- **Gap:** —
- **Prioritet:** —

### employees.update_org_unit
- **Opis:** Promjena org. jedinice → relocation preview
- **Preconditions:** `features.employees`; org postoji
- **Backend guard:** `employees.service.ts:update` + relocation trigger — ✓
- **Frontend guard:** Preview modal — ✓
- **UX poruka (BS):** Warnings iz preview API
- **Gap:** —
- **Prioritet:** —

### employees.deactivate
- **Opis:** Admin deaktivira radnika (`isActive=false`)
- **Preconditions:** Nema zadužene opreme (`status=zaduzeno`); admin-only
- **Backend guard:** `employee-deactivation.util.ts` + `employees.service.ts:update` — ✓
- **Frontend guard:** Potvrda + upozorenje o ulozi povezanog korisnika — ✓
- **UX poruka (BS):** `EMPLOYEE_MESSAGES.deactivateHasHeldEquipment`
- **Notifikacija:** `employee_deactivation_equipment_required` → evidentičari po kategoriji
- **Sync:** `User.isActive=false` ako postoji račun
- **Anti-bypass:** `users.service.ts:update` ista provjera
- **Gap:** —
- **Prioritet:** —

---

## Appendix: equipment-catalog

### equipment-catalog.delete
- **Opis:** Brisanje stavke šifrarnika
- **Preconditions:** `features.equipment_catalog`; admin; `inUseCount === 0`
- **Backend guard:** `equipment-catalog.service.ts:remove` — ✓
- **Frontend guard:** `canDeleteCatalogItem` / `EquipmentCatalogPanel` — ✓
- **UX poruka (BS):** `EQUIPMENT_CATALOG_GUARD_MESSAGES.deleteInUse`
- **Gap:** —
- **Prioritet:** —

### equipment-catalog.write
- **Opis:** Create/update catalog item
- **Preconditions:** `features.equipment_catalog`; admin; leaf; unique code
- **Backend guard:** `equipment-catalog.service.ts` — ✓
- **Frontend guard:** `CategoriesPage` catalog tab + `catalogEnabled` — ✓
- **UX poruka (BS):** Šifra već postoji
- **Gap:** —
- **Prioritet:** —

---

## Frontend guard moduli

| Fajl | Modul |
|------|-------|
| `helpers/guards/org-unit-guards.ts` | org-hierarchy |
| `helpers/guards/category-guards.ts` | categories-fields |
| `helpers/guards/employee-guards.ts` | employees |
| `helpers/guards/location-guards.ts` | locations |
| `helpers/guards/equipment-catalog-guards.ts` | equipment-catalog |
| `helpers/guards/equipment-guards.ts` | equipment-status |
| `helpers/guards/warehouse-guards.ts` | warehouses |
| `helpers/guards/inventory-guards.ts` | inventory-count |
| `helpers/guards/transfer-guards.ts` | transfers |
| `helpers/guards/warehouse-stock-guards.ts` | warehouse-stock |
| `helpers/guards/maintenance-parts-guards.ts` | maintenance-parts |
| `helpers/guards/employee-relocation-guards.ts` | employee-relocation |
| `helpers/guards/disposal-guards.ts` | disposal-commission |
| `helpers/run-mutation-with-refresh.util.ts` | toast/refresh pattern |

## Backend message moduli

| Fajl | Modul |
|------|-------|
| `common/utils/org-hierarchy-messages.util.ts` | org-hierarchy |
| `common/utils/category-messages.util.ts` | categories |
| `common/utils/location-messages.util.ts` | locations |
| `common/utils/employee-messages.util.ts` | employees |
| `common/utils/equipment-catalog-messages.util.ts` | equipment-catalog |
| `common/utils/warehouse-messages.util.ts` | warehouses |
| `common/utils/transfer-messages.util.ts` | transfers |
| `common/utils/warehouse-stock-messages.util.ts` | warehouse-stock |
| `common/utils/maintenance-parts-messages.util.ts` | maintenance-parts |
| `common/utils/employee-relocation-messages.util.ts` | employee-relocation |
| `common/utils/disposal-messages.util.ts` | disposal-commission |

## API klijent (globalno)

| Problem | Fix | Status |
|---------|-----|--------|
| DELETE 200 prazan body → lažna greška | `apiRequest` parsira prazan text | FE ✓ |
| refresh nakon mutacije u istom catch | `refreshAfterMutation` | FE ✓ |
