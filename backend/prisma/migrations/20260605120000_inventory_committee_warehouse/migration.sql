-- Inventory committee scoped by warehouse + category

ALTER TABLE `inventory_committees` ADD COLUMN `warehouseId` VARCHAR(191) NULL;

-- Draft-session committees without warehouse cannot be migrated reliably; remove before NOT NULL enforcement in app.
DELETE ic FROM `inventory_committees` ic
INNER JOIN `inventory_sessions` s ON s.id = ic.sessionId
WHERE s.status = 'draft';

CREATE INDEX `inventory_committees_warehouseId_idx` ON `inventory_committees`(`warehouseId`);

CREATE UNIQUE INDEX `inventory_committees_sessionId_warehouseId_categoryId_key`
  ON `inventory_committees`(`sessionId`, `warehouseId`, `categoryId`);

ALTER TABLE `inventory_committees`
  ADD CONSTRAINT `inventory_committees_warehouseId_fkey`
  FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
