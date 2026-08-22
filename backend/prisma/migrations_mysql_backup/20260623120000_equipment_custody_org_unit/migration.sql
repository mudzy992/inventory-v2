-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `custodyOrgUnitId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `equipment_custodyOrgUnitId_idx` ON `equipment`(`custodyOrgUnitId`);

-- AddForeignKey
ALTER TABLE `equipment` ADD CONSTRAINT `equipment_custodyOrgUnitId_fkey` FOREIGN KEY (`custodyOrgUnitId`) REFERENCES `org_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
