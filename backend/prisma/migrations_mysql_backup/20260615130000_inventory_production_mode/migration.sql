-- Faza 5: produkcijski režim popisa, uloga popis_koordinator, dodjele koordinatora
ALTER TABLE `users` MODIFY `role` ENUM(
  'admin',
  'evidenticar',
  'popis_koordinator',
  'user',
  'skladistar'
) NOT NULL;

CREATE TABLE `inventory_coordinator_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `warehouseId` VARCHAR(191) NOT NULL,
  `orgUnitId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `inventory_coordinator_assignments_userId_warehouseId_key`(`userId`, `warehouseId`),
  INDEX `inventory_coordinator_assignments_userId_idx`(`userId`),
  INDEX `inventory_coordinator_assignments_warehouseId_idx`(`warehouseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inventory_coordinator_assignments`
  ADD CONSTRAINT `inventory_coordinator_assignments_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `inventory_coordinator_assignments_warehouseId_fkey`
    FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `inventory_coordinator_assignments_orgUnitId_fkey`
    FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
  'inventory_draft_created',
  'inventory_close_blocked',
  'inventory_auto_closed',
  'info'
) NOT NULL;
