-- AlterEnum: add moderator to UserRole
ALTER TABLE `users` MODIFY `role` ENUM('admin', 'moderator', 'evidenticar', 'popis_koordinator', 'user', 'skladistar') NOT NULL;

CREATE TABLE `moderator_org_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `orgUnitId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `moderator_org_assignments_userId_idx`(`userId`),
    INDEX `moderator_org_assignments_orgUnitId_idx`(`orgUnitId`),
    UNIQUE INDEX `moderator_org_assignments_userId_orgUnitId_key`(`userId`, `orgUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `moderator_warehouse_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `moderator_warehouse_assignments_warehouseId_key`(`warehouseId`),
    INDEX `moderator_warehouse_assignments_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `moderator_org_assignments` ADD CONSTRAINT `moderator_org_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `moderator_org_assignments` ADD CONSTRAINT `moderator_org_assignments_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `moderator_warehouse_assignments` ADD CONSTRAINT `moderator_warehouse_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `moderator_warehouse_assignments` ADD CONSTRAINT `moderator_warehouse_assignments_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
