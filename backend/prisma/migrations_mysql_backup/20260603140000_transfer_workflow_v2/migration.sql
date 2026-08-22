-- AlterEnum (MySQL: extend status enum)
ALTER TABLE `transfers` MODIFY `status` ENUM('raw', 'printed', 'uploaded', 'potpisan', 'cancelled') NOT NULL;

-- AlterTable
ALTER TABLE `transfers` ADD COLUMN `fromWarehouseId` VARCHAR(191) NULL,
    ADD COLUMN `toWarehouseId` VARCHAR(191) NULL,
    ADD COLUMN `createdByUserId` VARCHAR(191) NULL,
    ADD COLUMN `finalizedByUserId` VARCHAR(191) NULL,
    ADD COLUMN `printedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `transfers_fromWarehouseId_idx` ON `transfers`(`fromWarehouseId`);
CREATE INDEX `transfers_toWarehouseId_idx` ON `transfers`(`toWarehouseId`);

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_fromWarehouseId_fkey` FOREIGN KEY (`fromWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_toWarehouseId_fkey` FOREIGN KEY (`toWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_finalizedByUserId_fkey` FOREIGN KEY (`finalizedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
