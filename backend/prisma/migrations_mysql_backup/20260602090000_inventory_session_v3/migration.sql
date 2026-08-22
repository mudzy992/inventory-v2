-- DropForeignKey
ALTER TABLE `inventory_committees` DROP FOREIGN KEY `inventory_committees_cityId_fkey`;

-- DropForeignKey
ALTER TABLE `inventory_lines` DROP FOREIGN KEY `inventory_lines_sessionId_fkey`;

-- DropForeignKey
ALTER TABLE `inventory_sessions` DROP FOREIGN KEY `inventory_sessions_cityId_fkey`;

-- DropForeignKey
ALTER TABLE `inventory_sessions` DROP FOREIGN KEY `inventory_sessions_committeeId_fkey`;

-- DropIndex
DROP INDEX `inventory_committees_cityId_idx` ON `inventory_committees`;

-- DropIndex
DROP INDEX `inventory_lines_sessionId_equipmentId_key` ON `inventory_lines`;

-- DropIndex
DROP INDEX `inventory_lines_sessionId_idx` ON `inventory_lines`;

-- DropIndex
DROP INDEX `inventory_sessions_cityId_year_key` ON `inventory_sessions`;

-- DropIndex
DROP INDEX `inventory_sessions_cityId_idx` ON `inventory_sessions`;

-- AlterTable
ALTER TABLE `inventory_committees` DROP COLUMN `cityId`,
    DROP COLUMN `isActive`,
    ADD COLUMN `categoryId` VARCHAR(191) NOT NULL,
    ADD COLUMN `sessionId` VARCHAR(191) NOT NULL,
    MODIFY `name` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `inventory_lines` DROP COLUMN `sessionId`,
    ADD COLUMN `committeeId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `inventory_sessions` DROP COLUMN `cityId`,
    DROP COLUMN `committeeId`,
    ADD COLUMN `name` VARCHAR(255) NOT NULL,
    ADD COLUMN `orgUnitId` VARCHAR(191) NOT NULL,
    MODIFY `startDate` DATE NULL,
    MODIFY `endDate` DATE NULL;

-- DropTable
DROP TABLE IF EXISTS `inventory_committee_categories`;

-- CreateIndex
CREATE INDEX `inventory_committees_sessionId_idx` ON `inventory_committees`(`sessionId`);

-- CreateIndex
CREATE INDEX `inventory_committees_categoryId_idx` ON `inventory_committees`(`categoryId`);

-- CreateIndex
CREATE INDEX `inventory_lines_committeeId_idx` ON `inventory_lines`(`committeeId`);

-- CreateIndex
CREATE UNIQUE INDEX `inventory_lines_committeeId_equipmentId_key` ON `inventory_lines`(`committeeId`, `equipmentId`);

-- CreateIndex
CREATE INDEX `inventory_sessions_orgUnitId_idx` ON `inventory_sessions`(`orgUnitId`);

-- CreateIndex
CREATE UNIQUE INDEX `inventory_sessions_orgUnitId_year_key` ON `inventory_sessions`(`orgUnitId`, `year`);

-- AddForeignKey
ALTER TABLE `inventory_committees` ADD CONSTRAINT `inventory_committees_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_committees` ADD CONSTRAINT `inventory_committees_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `inventory_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
