-- CreateTable
CREATE TABLE `warehouse_stock_lots` (
    `id` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(255) NOT NULL,
    `quantityReceived` INTEGER NOT NULL,
    `quantityOnHand` INTEGER NOT NULL,
    `status` ENUM('ceka_specifikaciju', 'spremno_za_izdavanje', 'zatvoreno') NOT NULL,
    `specifications` JSON NOT NULL,
    `contractNumber` VARCHAR(120) NULL,
    `entryDate` DATE NOT NULL,
    `notes` TEXT NULL,
    `receivedByUserId` VARCHAR(191) NOT NULL,
    `specDefinedByUserId` VARCHAR(191) NULL,
    `specDefinedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `warehouse_stock_lots_warehouseId_idx`(`warehouseId`),
    INDEX `warehouse_stock_lots_categoryId_idx`(`categoryId`),
    INDEX `warehouse_stock_lots_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_warehouse_committees` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,
    `closedAt` DATETIME(3) NULL,
    `closedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `inventory_warehouse_committees_sessionId_idx`(`sessionId`),
    INDEX `inventory_warehouse_committees_warehouseId_idx`(`warehouseId`),
    UNIQUE INDEX `inventory_warehouse_committees_sessionId_warehouseId_key`(`sessionId`, `warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_warehouse_committee_members` (
    `committeeId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `role` ENUM('predsjednik', 'clan') NOT NULL,

    PRIMARY KEY (`committeeId`, `employeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_warehouse_lines` (
    `id` VARCHAR(191) NOT NULL,
    `committeeId` VARCHAR(191) NOT NULL,
    `stockLotId` VARCHAR(191) NOT NULL,
    `status` ENUM('prisutna', 'nije_prisutna', 'ostecena') NOT NULL,
    `quantityCounted` INTEGER NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `inventory_warehouse_lines_committeeId_idx`(`committeeId`),
    UNIQUE INDEX `inventory_warehouse_lines_committeeId_stockLotId_key`(`committeeId`, `stockLotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `stockLotId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `equipment_stockLotId_idx` ON `equipment`(`stockLotId`);

-- AddForeignKey
ALTER TABLE `warehouse_stock_lots` ADD CONSTRAINT `warehouse_stock_lots_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `warehouse_stock_lots` ADD CONSTRAINT `warehouse_stock_lots_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warehouse_stock_lots` ADD CONSTRAINT `warehouse_stock_lots_receivedByUserId_fkey` FOREIGN KEY (`receivedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warehouse_stock_lots` ADD CONSTRAINT `warehouse_stock_lots_specDefinedByUserId_fkey` FOREIGN KEY (`specDefinedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `equipment` ADD CONSTRAINT `equipment_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `warehouse_stock_lots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_warehouse_committees` ADD CONSTRAINT `inventory_warehouse_committees_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_warehouse_committees` ADD CONSTRAINT `inventory_warehouse_committees_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_warehouse_committees` ADD CONSTRAINT `inventory_warehouse_committees_closedByUserId_fkey` FOREIGN KEY (`closedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_warehouse_committee_members` ADD CONSTRAINT `inventory_warehouse_committee_members_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `inventory_warehouse_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_warehouse_committee_members` ADD CONSTRAINT `inventory_warehouse_committee_members_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `inventory_warehouse_lines` ADD CONSTRAINT `inventory_warehouse_lines_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `inventory_warehouse_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_warehouse_lines` ADD CONSTRAINT `inventory_warehouse_lines_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `warehouse_stock_lots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
