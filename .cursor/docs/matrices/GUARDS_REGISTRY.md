# Guard registry — audit i status

Izvor istine za preconditions, backend/frontend guardove i UX poruke. Status: **BE ✓** = enforced na API; **FE ✓** = client guard prije poziva; **FE △** = djelomično (npr. samo disable dugmeta).

---

## auth-session

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| login | valjan username/password | AuthService | LoginPage forma | „Neispravni podaci” | BE ✓ FE ✓ |
| refresh | valjan refresh token | AuthService | client.ts retry | „Session expired” | BE ✓ FE ✓ |
| logout | autentificiran | AuthService | — | — | BE ✓ |

---

## roles-access

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| API pristup | uloga + scope | RolesGuard, RegistrarScope, InventoryCoordinatorScope | LayoutNavGate, page gates | 403 Forbidden | BE ✓ FE ✓ |
| registrar assignment | ekskluzivnost A/B, W+C valid | users-validation.util | UserFormModal, validateRegistrarScopes | BS iz validacije | BE ✓ FE ✓ |
| coordinator assignment | min 1 skladište | users-validation.util | UserFormModal | BS iz validacije | BE ✓ FE ✓ |

---

## settings

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| write API | feature enabled | SettingsService.assertFeatureEnabled | isSettingFlagEnabled, LayoutNavGate | Feature disabled | BE ✓ FE ✓ |
| PATCH setting | admin, registry key | SettingsService | SettingsPage | Opis iz registry-ja | BE ✓ FE ✓ |

---

## org-hierarchy

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| create/update | valid parent-child tip | org-hierarchy-validation.util | OrganizationPage forma | formatInvalidParentChildMessage | BE ✓ FE ✓ |
| delete | nema djece, nema zaposlenika | org-units.service + ORG_HIERARCHY_MESSAGES | canDeleteOrgUnit, tree delete btn | deleteHasChildren / deleteHasEmployees | BE ✓ FE ✓ |

---

## locations

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| delete canton | nema gradova | locations.service + LOCATION_MESSAGES | canDeleteCanton | deleteCantonHasCities | BE ✓ FE ✓ |
| delete city | nema org/skladište/komisiju ref | locations.service + LOCATION_MESSAGES | canDeleteCity | deleteCityReferenced | BE ✓ FE ✓ |
| write | features.locations | assertFeatureEnabled | LayoutNavGate | — | BE ✓ FE ✓ |

---

## warehouses

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| create | name, city, org, keepers | warehouses.service | canCreateWarehouse | WAREHOUSE_GUARD_MESSAGES | BE ✓ FE ✓ |
| destroy equipment | rashodovano, spremno_za_unistenje, keeper | warehouses.service + inventory freeze | WarehouseDetailView | BS iz API | BE ✓ FE △ |
| mutate during popis | nema aktivnog freeze | InventoryFreezeService | isFrozen hints | Popis aktivan | BE ✓ FE ✓ |

---

## categories-fields

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| delete | nema djece, nema opreme | categories.service + CATEGORY_MESSAGES | canDeleteCategory | deleteHasChildren / deleteHasEquipment | BE ✓ FE ✓ |
| equipment leaf | leaf kategorija | categories.assertLeafCategory | — | notLeaf | BE ✓ |
| save fields | unique/normalizacija | category-fields.util | CategoriesPage | BS iz API | BE ✓ FE ✓ |

---

## equipment-catalog

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| delete | nije na opremi | equipment-catalog.service | — (API message) | deleteInUse | BE ✓ FE △ |
| write | features.equipment_catalog | assertFeatureEnabled | PAGE gate | — | BE ✓ FE ✓ |

---

## equipment-status

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| update | scope + freeze | equipment.service | EquipmentPage disabled when frozen | BS iz API | BE ✓ FE ✓ |
| save skladiste | warehouseId obavezan | equipment.service | canSaveEquipmentWarehouse | warehouseRequired | BE ✓ FE ✓ |
| POST /equipment | zabranjen | 403 | nema UI | — | BE ✓ FE ✓ |
| reactivate | admin, rashodovano+unisteno | equipment.service | EquipmentCard | BS iz API | BE ✓ FE ✓ |

---

## employees (modul Radnici)

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| delete | nema user računa, potpisnik, transfer, zaduženje, relocation | employees.service + EMPLOYEE_MESSAGES | — (API) | EMPLOYEE_GUARD_MESSAGES | BE ✓ FE △ |
| update org | relocation preview | employee-relocation | EmployeesPage preview modal | BS iz API | BE ✓ FE ✓ |

---

## transfers

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| create | generation flags, signer, scope | transfers.service, transfer-validation | buildTransferCreatePayload, canCreateTransferType | TRANSFER_GUARD_MESSAGES | BE ✓ FE ✓ |
| sign | PDF ako require_signed | transfers.service | TransferDocumentPanel | BS iz API | BE ✓ FE ✓ |
| freeze | nema aktivnog popisa | InventoryFreezeService | disabled UI | — | BE ✓ FE ✓ |

---

## warehouse-stock

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| receive | keeper/admin, feature | warehouse-stock.service | receive page forma | BS iz API | BE ✓ FE ✓ |
| issue | lot qty, spec polja | warehouse-stock.service | issue UI | BS iz API | BE ✓ FE ✓ |
| cross-warehouse | coverage rules | cross-warehouse-issue.util | — | BS iz API | BE ✓ |

---

## maintenance-parts

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| install part | scope, kategorija link | maintenance-parts.service | installed parts panel | BS iz API | BE ✓ FE △ |
| consume stock | qty, lot | maintenance-parts.service | consumption panel | BS iz API | BE ✓ FE △ |

---

## employee-relocation

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| open case | org change, oprema map | employee-relocation.service | relocation page | BS iz API | BE ✓ FE ✓ |
| resolve line | status prelaz | employee-relocation.service | line actions | BS iz API | BE ✓ FE ✓ |

---

## inventory-count

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| create session | 1 po (distribucija, godina), nema otvorene | inventory-count.service | forma validacija | BS iz API | BE ✓ FE △ |
| delete session | draft only | inventory-count.service | canDeleteInventorySession | deleteSessionNotDraft | BE ✓ FE ✓ |
| delete committee | draft, membersConfigured | inventory-count.service | canDeleteInventoryCommittee, UI hide | deleteCommitteeNotConfigured | BE ✓ FE ✓ |
| activate | svi slotovi configured, disposal list | inventory-count.service | canActivateInventorySession | activateUnconfiguredSlots | BE ✓ FE ✓ |
| close | active session | inventory-count.service | confirm dialog | BS iz API | BE ✓ FE ✓ |
| line entry | član komisije, session active | inventory-count.service | session-lines-panel | BS iz API | BE ✓ FE ✓ |

---

## disposal-commission

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| vote | član komisije, pending | disposal-commissions.service | disposal inbox | BS iz API | BE ✓ FE ✓ |
| approve inventory | reviewer role | inventory disposal approvals | disposal tab | BS iz API | BE ✓ FE ✓ |

---

## notifications

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| list/read | autentificiran, own userId | notifications.service | NotificationsPage | — | BE ✓ FE ✓ |
| realtime | notifications.realtime | gateway | socket provider | polling fallback | BE ✓ FE ✓ |

---

## labels

| Akcija | Preconditions | Backend | Frontend | UX poruka | Status |
|--------|---------------|---------|----------|-----------|--------|
| QR | pristup opremi | equipment controller | EquipmentCard | — | BE ✓ FE ✓ |

---

## list-performance / install-setup / deploy-traefik

Infrastrukturne matrice — nema poslovnih guardova na akcijama korisnika osim deploy koraka (vidi deploy-traefik MATRIX).

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
| `helpers/run-mutation-with-refresh.util.ts` | toast/refresh pattern |

## Backend message moduli

| Fajl | Modul |
|------|-------|
| `common/utils/org-hierarchy-messages.util.ts` | org-hierarchy |
| `common/utils/category-messages.util.ts` | categories |
| `common/utils/location-messages.util.ts` | locations |
| `common/utils/employee-messages.util.ts` | employees |
| `common/utils/equipment-catalog-messages.util.ts` | equipment-catalog |

---

## API klijent (globalno)

| Problem | Fix | Status |
|---------|-----|--------|
| DELETE 200 prazan body → lažna greška | `apiRequest` parsira prazan text | FE ✓ |
| refresh nakon mutacije u istom catch | `refreshAfterMutation` | FE ✓ |
