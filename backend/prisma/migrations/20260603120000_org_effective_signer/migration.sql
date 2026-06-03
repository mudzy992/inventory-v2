-- AlterTable
ALTER TABLE `org_units` ADD COLUMN `effectiveSignerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `org_units_effectiveSignerId_idx` ON `org_units`(`effectiveSignerId`);

-- AddForeignKey
ALTER TABLE `org_units` ADD CONSTRAINT `org_units_effectiveSignerId_fkey` FOREIGN KEY (`effectiveSignerId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
