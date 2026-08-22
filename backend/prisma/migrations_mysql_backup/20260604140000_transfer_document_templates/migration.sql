-- AlterTable
ALTER TABLE `transfers` ADD COLUMN `documentWarehouseId` VARCHAR(191) NULL,
    ADD COLUMN `generatedDocxPath` VARCHAR(500) NULL,
    ADD COLUMN `generatedPdfPath` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `warehouse_transfer_templates` (
    `id` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `templatePath` VARCHAR(500) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `uploadedByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `warehouse_transfer_templates_warehouseId_isActive_idx`(`warehouseId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfer_document_sequences` (
    `warehouseId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `rashodLastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`warehouseId`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `transfers_documentWarehouseId_idx` ON `transfers`(`documentWarehouseId`);

-- AddForeignKey
ALTER TABLE `warehouse_transfer_templates` ADD CONSTRAINT `warehouse_transfer_templates_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouse_transfer_templates` ADD CONSTRAINT `warehouse_transfer_templates_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_document_sequences` ADD CONSTRAINT `transfer_document_sequences_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_documentWarehouseId_fkey` FOREIGN KEY (`documentWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
