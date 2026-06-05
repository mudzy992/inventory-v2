-- Maintenance parts module: category kind, stock lot kind, installed parts
-- Index/constraint names kept <= 64 chars (MySQL limit)

ALTER TABLE `categories` ADD COLUMN `categoryKind` ENUM('ASSET', 'MAINTENANCE') NOT NULL DEFAULT 'ASSET';
CREATE INDEX `categories_categoryKind_idx` ON `categories`(`categoryKind`);

CREATE TABLE `category_maintenance_links` (
    `id` VARCHAR(191) NOT NULL,
    `hostCategoryId` VARCHAR(191) NOT NULL,
    `maintenanceCategoryId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cat_maint_links_host_maint_uq`(`hostCategoryId`, `maintenanceCategoryId`),
    INDEX `cat_maint_links_maint_cat_idx`(`maintenanceCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `category_maintenance_links` ADD CONSTRAINT `cat_maint_links_host_fk` FOREIGN KEY (`hostCategoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `category_maintenance_links` ADD CONSTRAINT `cat_maint_links_maint_fk` FOREIGN KEY (`maintenanceCategoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `warehouse_stock_lots` ADD COLUMN `lotKind` ENUM('ISSUABLE', 'MAINTENANCE') NOT NULL DEFAULT 'ISSUABLE';
CREATE INDEX `wh_stock_lots_lotKind_idx` ON `warehouse_stock_lots`(`lotKind`);

CREATE TABLE `equipment_installed_parts` (
    `id` VARCHAR(191) NOT NULL,
    `hostEquipmentId` VARCHAR(191) NOT NULL,
    `stockLotId` VARCHAR(191) NULL,
    `maintenanceCategoryId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `legacySpecs` JSON NOT NULL,
    `status` ENUM('active', 'faulty', 'removed') NOT NULL DEFAULT 'active',
    `installedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,
    `replacedById` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `installedByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `equip_inst_parts_replaced_uq`(`replacedById`),
    INDEX `equip_inst_parts_host_idx`(`hostEquipmentId`),
    INDEX `equip_inst_parts_status_idx`(`status`),
    INDEX `equip_inst_parts_maint_cat_idx`(`maintenanceCategoryId`),
    INDEX `equip_inst_parts_lot_idx`(`stockLotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `equipment_installed_parts` ADD CONSTRAINT `equip_inst_parts_host_fk` FOREIGN KEY (`hostEquipmentId`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `equipment_installed_parts` ADD CONSTRAINT `equip_inst_parts_lot_fk` FOREIGN KEY (`stockLotId`) REFERENCES `warehouse_stock_lots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `equipment_installed_parts` ADD CONSTRAINT `equip_inst_parts_maint_fk` FOREIGN KEY (`maintenanceCategoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `equipment_installed_parts` ADD CONSTRAINT `equip_inst_parts_user_fk` FOREIGN KEY (`installedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `equipment_installed_parts` ADD CONSTRAINT `equip_inst_parts_repl_fk` FOREIGN KEY (`replacedById`) REFERENCES `equipment_installed_parts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `equipment_installed_part_events` (
    `id` VARCHAR(191) NOT NULL,
    `installedPartId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `action` ENUM('installed', 'marked_faulty', 'removed', 'replaced') NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `equip_inst_ev_part_idx`(`installedPartId`),
    INDEX `equip_inst_ev_actor_idx`(`actorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `equipment_installed_part_events` ADD CONSTRAINT `equip_inst_ev_part_fk` FOREIGN KEY (`installedPartId`) REFERENCES `equipment_installed_parts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `equipment_installed_part_events` ADD CONSTRAINT `equip_inst_ev_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
