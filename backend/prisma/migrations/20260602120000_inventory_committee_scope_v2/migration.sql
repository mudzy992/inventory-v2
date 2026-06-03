-- Inventory committee scope v2

CREATE TABLE `inventory_committee_categories` (
    `committeeId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    PRIMARY KEY (`committeeId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inventory_committees` ADD COLUMN `disposalCommissionId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `inventory_committees_disposalCommissionId_key` ON `inventory_committees`(`disposalCommissionId`);

ALTER TABLE `inventory_lines` DROP FOREIGN KEY `inventory_lines_newLocationCityId_fkey`;
ALTER TABLE `inventory_lines` DROP COLUMN `newLocationCityId`;

ALTER TABLE `inventory_lines` ADD COLUMN `relocationTargetType` ENUM('skladiste', 'osoba') NULL;
ALTER TABLE `inventory_lines` ADD COLUMN `relocationWarehouseId` VARCHAR(191) NULL;
ALTER TABLE `inventory_lines` ADD COLUMN `relocationToPersonId` VARCHAR(191) NULL;

DROP INDEX `inventory_sessions_cityId_year_key` ON `inventory_sessions`;
CREATE UNIQUE INDEX `inventory_sessions_committeeId_year_key` ON `inventory_sessions`(`committeeId`, `year`);

ALTER TABLE `inventory_committee_categories` ADD CONSTRAINT `inventory_committee_categories_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `inventory_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_committee_categories` ADD CONSTRAINT `inventory_committee_categories_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `inventory_committees` ADD CONSTRAINT `inventory_committees_disposalCommissionId_fkey` FOREIGN KEY (`disposalCommissionId`) REFERENCES `disposal_commissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_relocationWarehouseId_fkey` FOREIGN KEY (`relocationWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_relocationToPersonId_fkey` FOREIGN KEY (`relocationToPersonId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
