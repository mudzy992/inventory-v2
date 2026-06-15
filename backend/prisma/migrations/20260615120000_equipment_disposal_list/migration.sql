-- AlterTable
ALTER TABLE `equipment_events` MODIFY `action` ENUM('unisteno', 'reaktivirano') NOT NULL;

-- CreateTable
CREATE TABLE `equipment_disposal_list_items` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `status` ENUM('listed', 'withdrawn', 'assigned', 'approved', 'rejected') NOT NULL DEFAULT 'listed',
    `note` TEXT NULL,
    `markedByUserId` VARCHAR(191) NOT NULL,
    `markedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `withdrawnByUserId` VARCHAR(191) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `withdrawalNote` TEXT NULL,
    `razduzenjeTransferId` VARCHAR(191) NULL,
    `disposalCommissionId` VARCHAR(191) NULL,
    `approvalId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `equipment_disposal_list_items_approvalId_key`(`approvalId`),
    INDEX `equip_disp_list_scope_idx`(`sessionId`, `warehouseId`, `categoryId`, `status`),
    UNIQUE INDEX `equip_disp_list_session_equip_uq`(`sessionId`, `equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_markedByUserId_fkey` FOREIGN KEY (`markedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_withdrawnByUserId_fkey` FOREIGN KEY (`withdrawnByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_razduzenjeTransferId_fkey` FOREIGN KEY (`razduzenjeTransferId`) REFERENCES `transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_disposalCommissionId_fkey` FOREIGN KEY (`disposalCommissionId`) REFERENCES `disposal_commissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_disposal_list_items` ADD CONSTRAINT `equipment_disposal_list_items_approvalId_fkey` FOREIGN KEY (`approvalId`) REFERENCES `disposal_inventory_approvals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
