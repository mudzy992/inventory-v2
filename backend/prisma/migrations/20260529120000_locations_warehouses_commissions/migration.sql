-- AlterTable UserRole via enum extension handled by Prisma
-- MySQL: extend enums and add tables

ALTER TABLE `org_units` ADD COLUMN `locationCityId` VARCHAR(191) NULL,
    ADD COLUMN `effectiveLocationCityId` VARCHAR(191) NULL;

CREATE TABLE `cantons` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cities` (
    `id` VARCHAR(191) NOT NULL,
    `cantonId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `cities_cantonId_idx`(`cantonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `org_units` ADD INDEX `org_units_locationCityId_idx`(`locationCityId`),
    ADD INDEX `org_units_effectiveLocationCityId_idx`(`effectiveLocationCityId`);

ALTER TABLE `org_units` ADD CONSTRAINT `org_units_locationCityId_fkey` FOREIGN KEY (`locationCityId`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `org_units` ADD CONSTRAINT `org_units_effectiveLocationCityId_fkey` FOREIGN KEY (`effectiveLocationCityId`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `cities` ADD CONSTRAINT `cities_cantonId_fkey` FOREIGN KEY (`cantonId`) REFERENCES `cantons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `equipment` ADD COLUMN `warehouseId` VARCHAR(191) NULL,
    ADD COLUMN `warehouseCondition` ENUM('na_skladistu', 'unisteno') NULL;

CREATE TABLE `warehouses` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `cityId` VARCHAR(191) NOT NULL,
    `orgUnitId` VARCHAR(191) NULL,
    `address` VARCHAR(500) NOT NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `warehouses_cityId_idx`(`cityId`),
    INDEX `warehouses_orgUnitId_idx`(`orgUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `warehouse_keepers` (
    `warehouseId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    PRIMARY KEY (`warehouseId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `equipment` ADD INDEX `equipment_warehouseId_idx`(`warehouseId`);
ALTER TABLE `equipment` ADD CONSTRAINT `equipment_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `warehouses` ADD CONSTRAINT `warehouses_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warehouses` ADD CONSTRAINT `warehouses_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `warehouse_keepers` ADD CONSTRAINT `warehouse_keepers_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `warehouse_keepers` ADD CONSTRAINT `warehouse_keepers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `transfers` ADD COLUMN `inventoryLineId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `transfers_inventoryLineId_key` ON `transfers`(`inventoryLineId`);

ALTER TABLE `users` MODIFY `role` ENUM('admin', 'evidenticar', 'user', 'skladistar') NOT NULL;

ALTER TABLE `notifications` MODIFY `type` ENUM('transfer_pending', 'transfer_complete', 'equipment_assigned', 'disposal_pending_approval', 'disposal_approved', 'info') NOT NULL;

CREATE TABLE `disposal_commissions` (
    `id` VARCHAR(191) NOT NULL,
    `orgUnitId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `disposal_commissions_orgUnitId_idx`(`orgUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposal_commission_members` (
    `commissionId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `role` ENUM('predsjednik', 'clan') NOT NULL,
    PRIMARY KEY (`commissionId`, `employeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposal_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `transferId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `disposal_approvals_transferId_key`(`transferId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposal_approval_votes` (
    `id` VARCHAR(191) NOT NULL,
    `approvalId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `approved` BOOLEAN NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `disposal_approval_votes_approvalId_userId_key`(`approvalId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_committees` (
    `id` VARCHAR(191) NOT NULL,
    `orgUnitId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `inventory_committees_orgUnitId_idx`(`orgUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_committee_members` (
    `committeeId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `role` ENUM('predsjednik', 'clan') NOT NULL,
    PRIMARY KEY (`committeeId`, `employeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `orgUnitId` VARCHAR(191) NOT NULL,
    `committeeId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` ENUM('draft', 'active', 'closing', 'closed') NOT NULL DEFAULT 'draft',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `inventory_sessions_status_idx`(`status`),
    UNIQUE INDEX `inventory_sessions_orgUnitId_year_key`(`orgUnitId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_lines` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `status` ENUM('prisutna', 'ostecena', 'promjena_lokacije', 'nije_prisutna') NOT NULL,
    `note` TEXT NULL,
    `newLocationCityId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `inventory_lines_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `inventory_lines_sessionId_equipmentId_key`(`sessionId`, `equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `disposal_commissions` ADD CONSTRAINT `disposal_commissions_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposal_commission_members` ADD CONSTRAINT `disposal_commission_members_commissionId_fkey` FOREIGN KEY (`commissionId`) REFERENCES `disposal_commissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_commission_members` ADD CONSTRAINT `disposal_commission_members_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_approvals` ADD CONSTRAINT `disposal_approvals_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_approval_votes` ADD CONSTRAINT `disposal_approval_votes_approvalId_fkey` FOREIGN KEY (`approvalId`) REFERENCES `disposal_approvals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `disposal_approval_votes` ADD CONSTRAINT `disposal_approval_votes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_committees` ADD CONSTRAINT `inventory_committees_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_committee_members` ADD CONSTRAINT `inventory_committee_members_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `inventory_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_committee_members` ADD CONSTRAINT `inventory_committee_members_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_sessions` ADD CONSTRAINT `inventory_sessions_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `inventory_committees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_lines` ADD CONSTRAINT `inventory_lines_newLocationCityId_fkey` FOREIGN KEY (`newLocationCityId`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_inventoryLineId_fkey` FOREIGN KEY (`inventoryLineId`) REFERENCES `inventory_lines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
