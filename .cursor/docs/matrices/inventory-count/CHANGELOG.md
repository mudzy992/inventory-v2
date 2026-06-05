# Changelog — inventory-count

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
