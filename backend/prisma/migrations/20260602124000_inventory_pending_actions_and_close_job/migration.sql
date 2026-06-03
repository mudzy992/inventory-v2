-- CreateTable
CREATE TABLE `inventory_pending_actions` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `committeeId` VARCHAR(191) NOT NULL,
  `equipmentId` VARCHAR(191) NOT NULL,
  `inventoryLineId` VARCHAR(191) NOT NULL,
  `kind` ENUM('mark_present', 'mark_damaged', 'mark_missing', 'relocate_to_warehouse', 'relocate_to_person', 'disposal') NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('pending', 'running', 'applied', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `appliedAt` DATETIME(3) NULL,
  `createdByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `inventory_pending_actions_inventoryLineId_key`(`inventoryLineId`),
  INDEX `inventory_pending_actions_sessionId_status_idx`(`sessionId`, `status`),
  INDEX `inventory_pending_actions_committeeId_status_idx`(`committeeId`, `status`),
  INDEX `inventory_pending_actions_equipmentId_idx`(`equipmentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_session_close_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `status` ENUM('queued', 'running', 'done', 'failed') NOT NULL DEFAULT 'queued',
  `totalCount` INTEGER NOT NULL DEFAULT 0,
  `appliedCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `startedAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `inventory_session_close_jobs_sessionId_key`(`sessionId`),
  INDEX `inventory_session_close_jobs_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventory_pending_actions`
  ADD CONSTRAINT `inventory_pending_actions_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_pending_actions`
  ADD CONSTRAINT `inventory_pending_actions_committeeId_fkey`
  FOREIGN KEY (`committeeId`) REFERENCES `inventory_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_pending_actions`
  ADD CONSTRAINT `inventory_pending_actions_equipmentId_fkey`
  FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_pending_actions`
  ADD CONSTRAINT `inventory_pending_actions_inventoryLineId_fkey`
  FOREIGN KEY (`inventoryLineId`) REFERENCES `inventory_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_pending_actions`
  ADD CONSTRAINT `inventory_pending_actions_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_session_close_jobs`
  ADD CONSTRAINT `inventory_session_close_jobs_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `inventory_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

