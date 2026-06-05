-- Equipment catalog + employee relocation workflow

ALTER TABLE `notifications` MODIFY `type` ENUM(
  'transfer_pending',
  'transfer_signed_upload_pending',
  'transfer_complete',
  'equipment_assigned',
  'disposal_pending_approval',
  'disposal_approved',
  'inventory_transfer_upload_pending',
  'inventory_session_closed',
  'disposal_approval_pending',
  'warehouse_stock_received',
  'employee_relocation_action_required',
  'employee_relocation_incoming',
  'employee_relocation_admin_alert',
  'employee_relocation_resolved',
  'info'
) NOT NULL;

CREATE TABLE `equipment_catalog_items` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `equipment_catalog_items_code_key`(`code`),
    INDEX `equipment_catalog_items_categoryId_idx`(`categoryId`),
    INDEX `equipment_catalog_items_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `equipment_catalog_items` ADD CONSTRAINT `equipment_catalog_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `equipment` ADD COLUMN `catalogItemId` VARCHAR(191) NULL;
ALTER TABLE `equipment` ADD INDEX `equipment_catalogItemId_idx`(`catalogItemId`);
ALTER TABLE `equipment` ADD CONSTRAINT `equipment_catalogItemId_fkey` FOREIGN KEY (`catalogItemId`) REFERENCES `equipment_catalog_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `warehouse_stock_lots` ADD COLUMN `catalogItemId` VARCHAR(191) NULL,
    ADD COLUMN `incomingRelocation` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `warehouse_stock_lots` ADD INDEX `warehouse_stock_lots_catalogItemId_idx`(`catalogItemId`);
ALTER TABLE `warehouse_stock_lots` ADD CONSTRAINT `warehouse_stock_lots_catalogItemId_fkey` FOREIGN KEY (`catalogItemId`) REFERENCES `equipment_catalog_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `employee_relocation_cases` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `fromOrgUnitId` VARCHAR(191) NOT NULL,
    `toOrgUnitId` VARCHAR(191) NOT NULL,
    `fromWarehouseId` VARCHAR(191) NOT NULL,
    `toWarehouseId` VARCHAR(191) NOT NULL,
    `status` ENUM('open', 'resolved', 'cancelled') NOT NULL DEFAULT 'open',
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `resolvedAt` DATETIME(3) NULL,
    INDEX `employee_relocation_cases_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `employee_relocation_cases_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_relocation_lines` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending_source', 'pending_dest', 'accepted', 'rejected', 'discharged') NOT NULL DEFAULT 'pending_source',
    `sourceAction` ENUM('transfer', 'discharge') NULL,
    `sourceResolvedByUserId` VARCHAR(191) NULL,
    `destResolvedByUserId` VARCHAR(191) NULL,
    `destStockLotId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_relocation_lines_caseId_equipmentId_key`(`caseId`, `equipmentId`),
    INDEX `employee_relocation_lines_caseId_status_idx`(`caseId`, `status`),
    INDEX `employee_relocation_lines_equipmentId_idx`(`equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_relocation_events` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `lineId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `action` ENUM('case_opened', 'source_transfer', 'source_discharge', 'dest_accepted', 'dest_rejected', 'case_resolved', 'case_cancelled', 'superseded') NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `employee_relocation_events_caseId_idx`(`caseId`),
    INDEX `employee_relocation_events_actorUserId_idx`(`actorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_relocation_cases` ADD CONSTRAINT `employee_relocation_cases_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_relocation_cases` ADD CONSTRAINT `employee_relocation_cases_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `employee_relocation_lines` ADD CONSTRAINT `employee_relocation_lines_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `employee_relocation_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_relocation_lines` ADD CONSTRAINT `employee_relocation_lines_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_relocation_lines` ADD CONSTRAINT `employee_relocation_lines_sourceResolvedByUserId_fkey` FOREIGN KEY (`sourceResolvedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `employee_relocation_lines` ADD CONSTRAINT `employee_relocation_lines_destResolvedByUserId_fkey` FOREIGN KEY (`destResolvedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `employee_relocation_lines` ADD CONSTRAINT `employee_relocation_lines_destStockLotId_fkey` FOREIGN KEY (`destStockLotId`) REFERENCES `warehouse_stock_lots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `employee_relocation_events` ADD CONSTRAINT `employee_relocation_events_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `employee_relocation_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_relocation_events` ADD CONSTRAINT `employee_relocation_events_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
