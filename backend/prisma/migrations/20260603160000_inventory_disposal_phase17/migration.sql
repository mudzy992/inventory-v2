-- AlterEnum: predlozen_rashod line status
ALTER TABLE `inventory_lines` MODIFY `status` ENUM('prisutna', 'ostecena', 'promjena_lokacije', 'nije_prisutna', 'predlozen_rashod') NOT NULL;

-- CreateTable: disposal_inventory_approvals
CREATE TABLE `disposal_inventory_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `disposalCommissionId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `inventoryLineId` VARCHAR(191) NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `reviewedByUserId` VARCHAR(191) NULL,
    `reviewNote` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `disp_inv_appr_line_uq`(`inventoryLineId`),
    UNIQUE INDEX `disp_inv_appr_equip_comm_uq`(`equipmentId`, `disposalCommissionId`),
    INDEX `disp_inv_appr_comm_st_idx`(`disposalCommissionId`, `status`),
    INDEX `disp_inv_appr_session_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `disposal_inventory_approvals` ADD CONSTRAINT `disp_inv_appr_equip_fk` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_inventory_approvals` ADD CONSTRAINT `disp_inv_appr_comm_fk` FOREIGN KEY (`disposalCommissionId`) REFERENCES `disposal_commissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_inventory_approvals` ADD CONSTRAINT `disp_inv_appr_session_fk` FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_inventory_approvals` ADD CONSTRAINT `disp_inv_appr_line_fk` FOREIGN KEY (`inventoryLineId`) REFERENCES `inventory_lines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `disposal_inventory_approvals` ADD CONSTRAINT `disp_inv_appr_reviewer_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
