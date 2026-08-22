-- Inventory committee scope v2 (after session v3: committees have sessionId + categoryId)

ALTER TABLE `inventory_committees` ADD COLUMN `disposalCommissionId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `inventory_committees_disposalCommissionId_key` ON `inventory_committees`(`disposalCommissionId`);

ALTER TABLE `inventory_lines` DROP FOREIGN KEY `inventory_lines_newLocationCityId_fkey`;
ALTER TABLE `inventory_lines` DROP COLUMN `newLocationCityId`;

ALTER TABLE `inventory_lines` ADD COLUMN `relocationTargetType` ENUM('skladiste', 'osoba') NULL;
ALTER TABLE `inventory_lines` ADD COLUMN `relocationWarehouseId` VARCHAR(191) NULL;
ALTER TABLE `inventory_lines` ADD COLUMN `relocationToPersonId` VARCHAR(191) NULL;

ALTER TABLE `inventory_committees` ADD CONSTRAINT `inventory_committees_disposalCommissionId_fkey` FOREIGN KEY (`disposalCommissionId`) REFERENCES `disposal_commissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_relocationWarehouseId_fkey` FOREIGN KEY (`relocationWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_relocationToPersonId_fkey` FOREIGN KEY (`relocationToPersonId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
