-- CreateTable
CREATE TABLE `registrar_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `orgUnitId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `registrar_assignments_userId_idx`(`userId`),
    INDEX `registrar_assignments_warehouseId_idx`(`warehouseId`),
    INDEX `registrar_assignments_categoryId_idx`(`categoryId`),
    INDEX `registrar_assignments_orgUnitId_idx`(`orgUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate legacy city+category scopes to warehouse+category (mode A)
INSERT INTO `registrar_assignments` (`id`, `userId`, `warehouseId`, `categoryId`, `orgUnitId`, `createdAt`, `updatedAt`)
SELECT
    UUID(),
    urs.`userId`,
    wh.`id`,
    urs.`categoryId`,
    NULL,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `user_registrar_scopes` urs
INNER JOIN (
    SELECT `cityId`, MIN(`id`) AS `id`
    FROM `warehouses`
    WHERE `isActive` = true
    GROUP BY `cityId`
) wh ON wh.`cityId` = urs.`cityId`;

-- DropTable
DROP TABLE `user_registrar_scopes`;

-- AddForeignKey
ALTER TABLE `registrar_assignments` ADD CONSTRAINT `registrar_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrar_assignments` ADD CONSTRAINT `registrar_assignments_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrar_assignments` ADD CONSTRAINT `registrar_assignments_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrar_assignments` ADD CONSTRAINT `registrar_assignments_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `org_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
