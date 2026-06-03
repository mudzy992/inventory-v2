-- AlterTable
ALTER TABLE `inventory_committees`
  ADD COLUMN `isClosed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `closedAt` DATETIME(3) NULL,
  ADD COLUMN `closedByUserId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `inventory_line_events` (
  `id` VARCHAR(191) NOT NULL,
  `inventoryLineId` VARCHAR(191) NULL,
  `committeeId` VARCHAR(191) NOT NULL,
  `equipmentId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NOT NULL,
  `action` ENUM('create', 'update') NOT NULL,
  `fromStatus` ENUM('prisutna', 'ostecena', 'promjena_lokacije', 'nije_prisutna') NULL,
  `toStatus` ENUM('prisutna', 'ostecena', 'promjena_lokacije', 'nije_prisutna') NOT NULL,
  `fromNote` TEXT NULL,
  `toNote` TEXT NULL,
  `fromRelocationTarget` ENUM('skladiste', 'osoba') NULL,
  `toRelocationTarget` ENUM('skladiste', 'osoba') NULL,
  `fromRelocationWarehouseId` VARCHAR(191) NULL,
  `toRelocationWarehouseId` VARCHAR(191) NULL,
  `fromRelocationToPersonId` VARCHAR(191) NULL,
  `toRelocationToPersonId` VARCHAR(191) NULL,
  `generatedTransferId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `inventory_line_events_committeeId_idx`(`committeeId`),
  INDEX `inventory_line_events_equipmentId_idx`(`equipmentId`),
  INDEX `inventory_line_events_actorUserId_idx`(`actorUserId`),
  INDEX `inventory_line_events_inventoryLineId_idx`(`inventoryLineId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventory_committees`
  ADD CONSTRAINT `inventory_committees_closedByUserId_fkey`
  FOREIGN KEY (`closedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_line_events`
  ADD CONSTRAINT `inventory_line_events_inventoryLineId_fkey`
  FOREIGN KEY (`inventoryLineId`) REFERENCES `inventory_lines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_line_events`
  ADD CONSTRAINT `inventory_line_events_committeeId_fkey`
  FOREIGN KEY (`committeeId`) REFERENCES `inventory_committees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_line_events`
  ADD CONSTRAINT `inventory_line_events_equipmentId_fkey`
  FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_line_events`
  ADD CONSTRAINT `inventory_line_events_actorUserId_fkey`
  FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_line_events`
  ADD CONSTRAINT `inventory_line_events_generatedTransferId_fkey`
  FOREIGN KEY (`generatedTransferId`) REFERENCES `transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

