-- UserRegistrarScope replaces UserManagedOrgUnit
CREATE TABLE `user_registrar_scopes` (
    `userId` VARCHAR(191) NOT NULL,
    `cityId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    INDEX `user_registrar_scopes_cityId_idx`(`cityId`),
    INDEX `user_registrar_scopes_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`userId`, `cityId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_registrar_scopes` ADD CONSTRAINT `user_registrar_scopes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `user_registrar_scopes` ADD CONSTRAINT `user_registrar_scopes_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `user_registrar_scopes` ADD CONSTRAINT `user_registrar_scopes_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE `user_managed_org_units`;

-- Disposal commissions: orgUnitId -> cityId
ALTER TABLE `disposal_commissions` ADD COLUMN `cityId` VARCHAR(191) NULL;

UPDATE `disposal_commissions` dc
INNER JOIN `org_units` ou ON ou.id = dc.orgUnitId
SET dc.cityId = COALESCE(ou.effectiveLocationCityId, ou.locationCityId)
WHERE dc.cityId IS NULL;

DELETE FROM `disposal_commissions` WHERE `cityId` IS NULL;

ALTER TABLE `disposal_commissions` DROP FOREIGN KEY `disposal_commissions_orgUnitId_fkey`;
ALTER TABLE `disposal_commissions` DROP INDEX `disposal_commissions_orgUnitId_idx`;
ALTER TABLE `disposal_commissions` DROP COLUMN `orgUnitId`;
ALTER TABLE `disposal_commissions` MODIFY `cityId` VARCHAR(191) NOT NULL;
CREATE INDEX `disposal_commissions_cityId_idx` ON `disposal_commissions`(`cityId`);
ALTER TABLE `disposal_commissions` ADD CONSTRAINT `disposal_commissions_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Inventory committees: orgUnitId -> cityId
ALTER TABLE `inventory_committees` ADD COLUMN `cityId` VARCHAR(191) NULL;

UPDATE `inventory_committees` ic
INNER JOIN `org_units` ou ON ou.id = ic.orgUnitId
SET ic.cityId = COALESCE(ou.effectiveLocationCityId, ou.locationCityId)
WHERE ic.cityId IS NULL;

DELETE FROM `inventory_committees` WHERE `cityId` IS NULL;

ALTER TABLE `inventory_committees` DROP FOREIGN KEY `inventory_committees_orgUnitId_fkey`;
ALTER TABLE `inventory_committees` DROP INDEX `inventory_committees_orgUnitId_idx`;
ALTER TABLE `inventory_committees` DROP COLUMN `orgUnitId`;
ALTER TABLE `inventory_committees` MODIFY `cityId` VARCHAR(191) NOT NULL;
CREATE INDEX `inventory_committees_cityId_idx` ON `inventory_committees`(`cityId`);
ALTER TABLE `inventory_committees` ADD CONSTRAINT `inventory_committees_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Inventory sessions: orgUnitId -> cityId
ALTER TABLE `inventory_sessions` ADD COLUMN `cityId` VARCHAR(191) NULL;

UPDATE `inventory_sessions` ins
INNER JOIN `org_units` ou ON ou.id = ins.orgUnitId
SET ins.cityId = COALESCE(ou.effectiveLocationCityId, ou.locationCityId)
WHERE ins.cityId IS NULL;

DELETE FROM `inventory_sessions` WHERE `cityId` IS NULL;

ALTER TABLE `inventory_sessions` DROP FOREIGN KEY `inventory_sessions_orgUnitId_fkey`;
DROP INDEX `inventory_sessions_orgUnitId_year_key` ON `inventory_sessions`;
ALTER TABLE `inventory_sessions` DROP COLUMN `orgUnitId`;
ALTER TABLE `inventory_sessions` MODIFY `cityId` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `inventory_sessions_cityId_year_key` ON `inventory_sessions`(`cityId`, `year`);
CREATE INDEX `inventory_sessions_cityId_idx` ON `inventory_sessions`(`cityId`);
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
