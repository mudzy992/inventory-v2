-- AlterEnum: add spremno_za_unistenje to warehouse condition
ALTER TABLE `equipment` MODIFY `warehouseCondition` ENUM('na_skladistu', 'spremno_za_unistenje', 'unisteno') NULL;

-- CreateTable: equipment_events audit
CREATE TABLE `equipment_events` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `action` ENUM('unisteno') NOT NULL,
    `fromCondition` ENUM('na_skladistu', 'spremno_za_unistenje', 'unisteno') NULL,
    `toCondition` ENUM('na_skladistu', 'spremno_za_unistenje', 'unisteno') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `equipment_events_equipmentId_idx`(`equipmentId`),
    INDEX `equipment_events_warehouseId_idx`(`warehouseId`),
    INDEX `equipment_events_actorUserId_idx`(`actorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `equipment_events` ADD CONSTRAINT `equipment_events_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `equipment_events` ADD CONSTRAINT `equipment_events_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `equipment_events` ADD CONSTRAINT `equipment_events_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
