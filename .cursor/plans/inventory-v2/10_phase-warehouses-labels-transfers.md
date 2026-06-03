# Faza 10 — Skladišta, naljepnice, prenosnice UI

**Status:** gotovo (2026-05-29)

## Cilj

Fizička skladišta, uloga skladistar, A4 naljepnice, standardizovan panel prenosnice.

## Isporuka

- `Warehouse`, `WarehouseKeeper`, `UserRole.skladistar`
- `WarehousesModule`, `WarehousesPage`, skladištar navigacija
- `LabelPrintSheet` na Equipment / ByCategory / MyEquipment
- `TransferDocumentPanel` na Documents, Transfers, EquipmentCard
- Upload `GET ?entityType&entityId` + download header

## Kriterij završetka

- [x] Admin: skladište + skladištar
- [x] Štampa naljepnica (batch)
- [x] RAW / pregled skena / download svuda
