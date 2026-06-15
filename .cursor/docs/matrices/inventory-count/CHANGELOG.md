# Changelog — inventory-count

## 2026-06-15 (auto slotovi)

- `InventoryCommittee.membersConfigured` — auto slotovi (skladište × ASSET kategorija) pri kreiranju draft sesije.
- Koordinator/admin konfigurišu članove putem `PATCH committees/:id`; `POST` samo uz `features.inventory_manual_committee_create`.
- Aktivacija zahtijeva sve slotove konfigurisane; rashod provjerava postojanje slota + `GET eligible-for-equipment`.
- Scheduler: auto draft + slotovi i na **1.1.** (uz postojeći lock dan).

## 2026-06-15 (faza 5)

- Produkcijski režim: scheduler (`INVENTORY_SCHEDULER_ENABLED`), auto draft na lock datum, auto-close na end datum (bez force ako pending rashod).
- Production freeze proširen na warehouse-stock; freeze-banner vraća `productionLockSessions`.
- Uloga `popis_koordinator` + `InventoryCoordinatorAssignment`; CRUD komisija u draft sesiji.

## 2026-06-15

- Lista za rashod (`EquipmentDisposalListItem`) u draft sesiji; API disposal-list; dodjela pri `createCommittee`.
- Aktivacija sesije blokirana dok postoje nedodijeljene stavke liste.

## 2026-06-05 (c)

- `session-warehouses` i validacija komisije: skladišta po org stablu distribucije (ne samo grad distribucije); opseg opreme/kategorija po gradu skladišta.
- Wizard korak 2: sve ASSET roditeljske kategorije (i s 0 opreme); kandidati opreme po org opsegu skladišta.

## 2026-06-05 (b)

- Admin Popis: automatska krovna distribucija (bez dropdowna); brisanje draft sesije bez komisija; brisanje/izmjena komisija u draft sesiji.

## 2026-06-05

- `InventoryCommittee.warehouseId`: popisna komisija vezana za skladište + kategoriju.
- Unique `(sessionId, warehouseId, categoryId)`; wizard 5 koraka; opseg opreme sužen na skladište.
- API: `session-warehouses`, `committees/setup-options`; admin UI restrukturiran (empty state, liste, detalj).
- Legacy komisije bez `warehouseId`: city-wide opseg (read-only).

## 2026-06-03

- Auto `InventoryWarehouseCommittee` pri aktivaciji sesije (po skladištu u gradu distribucije).
- `InventoryWarehouseLine`: popis lotova (prisutnost + količina); skladištari kao članovi.

## 2026-06-02

- Pending actions i close job za kategorijske komisije.
