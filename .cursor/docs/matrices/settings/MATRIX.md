# Matrica — Settings contract

## Registry (source: `backend/src/modules/settings/settings.registry.ts`)

### Branding & company (tab: Opšte)

| Key | Tip | Scope | Admin UI | Opis |
|-----|-----|-------|----------|------|
| `app.name` | string | public | da | Naziv aplikacije (sidebar, login) |
| `app.subtitle` | string | public | da | Podnaslov aplikacije |
| `company.name` | string | public | da | Naziv preduzeća (štampa) |
| `company.address` | string | public | da | Adresa |
| `company.city` | string | public | da | Grad |
| `company.postalCode` | string | public | da | Poštanski broj |
| `company.phone` | string | public | da | Telefon |
| `company.email` | string | public | da | Email |
| `company.taxId` | string | public | da | JIB/ID |

### Moduli (tab: Moduli) — `features.*`

| Key | Default | Nav / stranica |
|-----|---------|----------------|
| `features.dashboard` | true | `dashboard` |
| `features.organization` | true | `organization` |
| `features.locations` | true | `locations` |
| `features.categories` | true | `categories` |
| `features.user_management` | true | `user-management` |
| `features.employees` | true | `employees` |
| `features.warehouses` | true | `warehouses` |
| `features.registrar_stock` | true | `registrar-stock` |
| `features.warehouse_inventory` | true | `warehouse-inventory` |
| `features.equipment` | true | `equipment`, `equipment-by-category` |
| `features.equipment_labels` | true | UI naljepnica na opremi |
| `features.transfers` | true | `transfers` |
| `features.documents` | true | `documents` |
| `features.disposal_commissions` | true | `disposal-commissions` |
| `features.inventory_count` | true | `inventory-count` |
| `features.my_equipment` | true | `my-equipment` |
| `features.qr_scanner` | true | `qr-scanner` |
| `features.public_equipment_lookup` | true | Javni QR pregled |
| `features.maintenance_parts` | true | Skladište održavanje + ugrađeni dijelovi na opremi |

### Prenosi (tab: Prenosi)

| Key | Tip | Scope | Default |
|-----|-----|-------|---------|
| `features.cross_service_transfer` | boolean | private | true |
| `transfer.generation.enabled` | boolean | private | true |
| `transfer.generation.on_stock_lot_issue` | boolean | private | true |
| `transfer.generation.on_zaduzenje` | boolean | private | true |
| `transfer.generation.on_prenos` | boolean | private | true |
| `transfer.generation.on_razduzenje` | boolean | private | true |
| `transfer.generation.on_rashodovanje` | boolean | private | true |
| `transfer.generate_print_pdf` | boolean | private | true |
| `transfer.require_signed_pdf_upload` | boolean | private | true |
| `transfer.allow_finalize_without_upload` | boolean | private | false |
| `transfer.allow_evidenticar_cross_city` | boolean | private | false |
| `transfer.allow_admin_cross_warehouse_issue` | boolean | private | false |
| `transfer.require_upload_before_sign` | boolean | private | false (legacy, ne u UI) |
| `transfer.template_placeholders_help` | string | public | placeholder lista (read-only) |

### Upload (tab: Upload)

| Key | Tip | Scope | Default |
|-----|-----|-------|---------|
| `upload.max_mb` | number | private | 10 |

### Notifikacije (tab: Notifikacije)

| Key | Tip | Scope | Default |
|-----|-----|-------|---------|
| `notifications.enabled` | boolean | public | true |
| `notifications.realtime` | boolean | public | true |

### Sistem

| Key | Tip | Scope | Admin UI |
|-----|-----|-------|----------|
| `app.initialized` | boolean | private | ne (setup wizard) |

## Admin UI

- Stranica: **Postavke** (`settings`), samo admin.
- Tabovi: `frontend/src/constants/settings-ui-tabs.ts` — Opšte, Moduli, Prenosi, Upload, Notifikacije.
- Polje: `label` + `description` (ne prikazivati raw `key`).

## API

| Endpoint | Auth | Opis |
|----------|------|------|
| `GET /backend/settings/public` | — | Javne postavke |
| `GET /backend/settings/private` | admin | Privatne postavke |
| `PATCH /backend/settings/:key` | admin | Ažuriranje (`adminEditable` only) |

Setup wizard postavlja `company.*` i `app.name` preko `SettingsService.upsertValues`.

## Enforcement (backend)

| Ključ | Modul / servis |
|-------|----------------|
| `upload.max_mb` | `UploadsService` |
| `features.transfers` + `transfer.generation.*` + upload PDF | `TransfersService`, `WarehouseStockService`, `InventoryCountService`, `UploadsService` |
| `features.disposal_commissions` | `DisposalCommissionsService` (sve javne metode, uklj. read) |
| `features.inventory_count` | `InventoryCountService` (sesije, komiteti, freeze banner, izvještaji) |
| `features.warehouse_inventory` | `InventoryCountService` (warehouse committees, record/close warehouse lines) |
| `features.public_equipment_lookup` | `PublicEquipmentService` |
| `notifications.enabled` | `NotificationsService` |
| `features.organization` | `OrgUnitsService` |
| `features.locations` | `LocationsService` |
| `features.categories` | `CategoriesService` |
| `features.employees` | `EmployeesService` |
| `features.equipment` | `EquipmentService` |
| `features.user_management` | `UsersService` |
| `features.warehouses` | `WarehousesService` |
| `features.registrar_stock` | `WarehouseStockService` (receive/issue) |
| `features.maintenance_parts` | `MaintenancePartsService` |
| `inventory.production_mode` | `InventorySchedulerService`, `InventoryProductionModeService`, freeze proširenje |
| `inventory.lock_date` / `inventory.session_end_date` | Scheduler dnevni job (TZ iz `inventory.scheduler_timezone`) |
| `inventory.auto_*` | Auto draft / close / optional activate |
| `inventory.system_user_id` | `InventoryCountService.resolveSystemActorUserId` |

## Inventura (grupa `inventory`, tab Postavke)

| Ključ | Default | Opis |
|-------|---------|------|
| `inventory.production_mode` | false | Uključuje kalendar i scheduler |
| `inventory.lock_date` | `11-30` | MM-DD lock + auto draft |
| `inventory.session_end_date` | `12-31` | MM-DD pokušaj zatvaranja |
| `inventory.auto_create_draft_session` | true | |
| `inventory.auto_close_session` | true | Bez force ako pending rashod |
| `inventory.auto_activate_session` | false | |
| `inventory.scheduler_timezone` | `Europe/Sarajevo` | |
| `inventory.system_user_id` | `` | UUID admina za close job |

Env: `INVENTORY_SCHEDULER_ENABLED=true` za cron u Nest procesu.

| Mekanizam | Fajl |
|-----------|------|
| Nav gating | `Layout.tsx` + `showNavPage` / `SidebarNavButton` |
| Stranica blokirana | `layout-nav-gate.tsx`, `module-disabled-state.tsx` |
| Mapiranje stranica | `page-feature-settings.util.ts` |
| Public cache + socket patch | `public-settings-context.tsx`, `SocketContext` |
| Registry default merge | `public-feature-defaults.ts` — nedostajući `features.*` ≠ uključeno |
| Optimistički PATCH | `settings-page.tsx` → `patchLocal` za public ključeve |
| Hook | `use-is-page-enabled.ts` — Dashboard, freeze banner/hint |
| Admin cache | `admin-settings-context.tsx` |
| `notifications.realtime` | `SocketContext` — bez socket-a, polling ostaje |

## Pravila

- Nepoznat `key` → 404.
- `adminEditable: false` → PATCH odbijen.
- Vrijednosti u DB kao string; parsiranje prema `valueType`.
- `ensureDefaults()` na startu kreira nedostajuće ključeve.
- Public promjena emituje `settings.updated` (Socket.IO kad je realtime uključen).
- **Novi modul**: vidi `.cursor/rules/settings-registry.mdc`.
