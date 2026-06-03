# CHECKLIST — Skladišni lot, evidentičar i popis skladišta

**Plan:** [skladišni_lot_i_evidentičar_02df641f.plan.md](../skladišni_lot_i_evidentičar_02df641f.plan.md)  
**Status:** ✅ **100% gotovo** (2026-06-03)

## 1. Schema i migracija
- [x] `WarehouseStockLot`, `WarehouseStockLotStatus`
- [x] `InventoryWarehouseCommittee`, `InventoryWarehouseCommitteeMember`, `InventoryWarehouseLine`
- [x] `Equipment.stockLotId`
- [x] Migracija `20260603170000_warehouse_stock_lots`
- [x] `validateLotSpecifications` / `validateIssueSpecifications` u `category-fields.util.ts`

## 2. Backend `warehouse-stock`
- [x] `POST /warehouses/:id/stock-lots` (skladištar)
- [x] `GET /warehouses/:id/stock-lots`
- [x] `GET /warehouse-stock/assigned` (evidentičar)
- [x] `GET /stock-lots/:id`
- [x] `PATCH /stock-lots/:id/specifications` (legacy / non-unique polja)
- [x] `POST /stock-lots/:id/issue` (unique polja + inv. broj + radnik)
- [x] `notifyWarehouseStockReceived`
- [x] Freeze: `stock_lot_create`, `stock_lot_issue`
- [x] Skladištar: zabranjen `POST /equipment`

## 3. Issue + transfer
- [x] Transakcija: `Equipment` + `zaduzenje` potpisan + `quantityOnHand -= 1`
- [x] `mergedSpecifications` = lot spec ∪ unique polja

## 4. Popis skladišta
- [x] Auto `InventoryWarehouseCommittee` pri `activateSession`
- [x] `GET /inventory-sessions/:id/warehouse-committees`
- [x] `GET /inventory-warehouse-committees/mine`
- [x] `GET .../scope`, `POST .../lines`, `PATCH .../close`
- [x] Scope: samo lotovi s `quantityOnHand > 0`

## 5. Frontend
- [x] `warehouse-stock-panel.tsx` — prijem lota (skladištar)
- [x] `RegistrarStockPage` — spec lota + izdaj komad
- [x] `WarehouseInventoryPage` — popis količine/prisutnosti
- [x] `warehouse-stock-api.ts`, `inventory-warehouse-api.ts`
- [x] Navigacija: Skladišna roba (evidentičar), Popis skladišta (skladištar)
- [x] Uklonjen puni prijem opreme za skladištara

## 6. Matrice i seed
- [x] `warehouse-stock/MATRIX.md` + CHANGELOG
- [x] Ažurirano: `warehouses`, `inventory-count`, `equipment-status`
- [x] Seed: demo lot umjesto direktnog `Equipment` na skladištu

## Deploy (DEV)

```bash
cd backend && npx prisma migrate deploy && npx prisma generate && npm run build
cd ../frontend && npm run build
```
