ALTER TABLE `inventory_committees` DROP FOREIGN KEY `inventory_committees_warehouseId_fkey`;
DROP INDEX `inventory_committees_sessionId_warehouseId_categoryId_key` ON `inventory_committees`;
DROP INDEX `inventory_committees_warehouseId_idx` ON `inventory_committees`;
ALTER TABLE `inventory_committees` DROP COLUMN `warehouseId`;
