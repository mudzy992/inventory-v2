# Settings matrica — CHANGELOG

## 2026-07-02

- `transfer.generation.enabled`, `on_zaduzenje`, `on_razduzenje` → **public** scope (UI forme prenosa i upozorenje bez prenosnice za sve uloge).

## 2026-06-23

- `features.registrar_mode_b_custody_pool` (public, default true) — Režim B pool vraćene opreme i zaduženje po inventurnom broju.
- `features.evidenticar_employee_ops` (public, default true) — evidentičar može kreirati/uređivati radnike u registrar opsegu i pokretati org. promjenu.

## 2026-06-20

- `features.moderator_role` (private, default true) — globalni kill-switch za moderator write API.

## 2026-06-18

- Prenos opreme vs. prenosnica: `features.transfers` = blok modula; `transfer.generation.*` = samo dokumenti.
- Uklonjeni ključevi: `transfer.generation.on_rashodovanje`, `transfer.require_upload_before_sign`.
- Ažurirani opisi registry-ja i UI metadata za transfers tab.

## 2026-06-17

## 2026-06-16 (profesionalni admin UI)

- `settings-ui-metadata.ts` — `dependsOn`, `display` (info/deprecated), `detail` za UI hijerarhiju.
- Admin Postavke: pretraga po tabu, zavisne opcije disabled, info/deprecated redovi, save na blur za tekst/broj.

## 2026-06-15 (guard registry)

- Dodani `INDEX.md` i `GUARDS_REGISTRY.md` — mapiranje feature flagova na BE/FE enforcement.

## 2026-06-15 (auto slotovi)

- `features.inventory_manual_committee_create` (private, default false).
- `inventory.auto_create_draft_session` opis proširen: lock dan + 1.1.

## 2026-06-15 (faza 5)

- `inventory.production_mode`, `inventory.lock_date`, `inventory.session_end_date`, auto flags, `inventory.scheduler_timezone`, `inventory.system_user_id`.
- Grupa `inventory` u admin Postavkama (tab Inventura).

## 2026-06-15

- `features.disposal_pre_list` — lista za rashod prije aktivacije sesije popisa.

## 2026-06-10 (cross-warehouse issue)

- Registry: `transfer.allow_admin_cross_warehouse_issue` — admin izdavanje iz lota na radnika u drugom efektivnom skladištu.

## 2026-06-04 (nav toggle fix)

- Frontend: `Layout` / `useIsPageEnabled` / `LayoutNavGate` sada koriste i `adminSettings`; `isSettingFlagEnabled` parsira string `"true"`/`"false"`; `patchLocal` za sve `features.*` ključeve; `publicSettingsToMap` normalizuje boolean po `valueType`.
- Backend: `ensureDefaults` usklađuje `scope`/`valueType` postojećih redova sa registry-jem (fix kad su moduli bili private u DB).

## 2026-06-04 (nav gating hardening)

- Frontend: merge `PUBLIC_FEATURE_DEFAULTS` pri učitavanju public postavki; `patchLocal` na snimanju u Postavkama; `useIsPageEnabled`; gate Dashboard/freeze/podmeni Oprema.
- Backend: `DisposalCommissionsService` guard na svim javnim metodama; `InventoryCountService` guard na read/mutate (warehouse inventory → `features.warehouse_inventory`).

## 2026-06-04 (prenosnice)

- Registry: `transfer.generation.*`, `transfer.generate_print_pdf`, `transfer.require_signed_pdf_upload`, `transfer.template_placeholders_help`.
- Enforcement: `TransfersService`, stock-lot issue, inventory draft transferi.

## 2026-06-03 (modularni registry + tabovi)

- Registry: svi `features.*` moduli (dashboard, organization, locations, categories, user_management, employees, warehouses, registrar_stock, warehouse_inventory, equipment, transfers, documents, my_equipment, …); `transfer.require_upload_before_sign`, `notifications.realtime`.
- Admin UI: tabovi (Opšte, Moduli, Prenosi, Upload, Notifikacije).
- Backend `assertFeatureEnabled` na org/locations/categories/employees/equipment/users/warehouses/warehouse-stock.
- Frontend: pun nav gating (`SidebarNavButton`), `LayoutNavGate`, `notifications.realtime` → polling bez socket-a.
- Projektno pravilo: `.cursor/rules/settings-registry.mdc`.

## 2026-06-03 (postavke UI)

- Registry: polje `label` za prikaz naslova u admin Postavkama; `description` kao podnaslov.

## 2026-06-03 (admin postavke)

- Registry: `group`, `adminEditable`; novi ključevi `features.equipment_labels`, `features.public_equipment_lookup`, `features.disposal_commissions`, `features.inventory_count`, `transfer.allow_evidenticar_cross_city`.
- Admin UI stranica Postavke; enforcement na uploads, disposal, inventory, public-equipment.
- Frontend feature gates (nav, QR, naljepnice, notifikacije).

## 2026-06-03

- Dodani `company.*` ključevi za header štampanih dokumenata i `app.initialized` za setup wizard.

## 2026-05-29

- Inicijalni registry i REST API (faza 1 backend foundation).
