# Settings matrica — CHANGELOG

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
