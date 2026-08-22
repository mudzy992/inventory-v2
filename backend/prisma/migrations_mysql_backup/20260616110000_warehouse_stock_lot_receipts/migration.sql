-- CreateTable
CREATE TABLE `warehouse_stock_lot_receipts` (
  `id` VARCHAR(191) NOT NULL,
  `stockLotId` VARCHAR(191) NOT NULL,
  `quantityReceived` INTEGER NOT NULL,
  `quantityRemaining` INTEGER NOT NULL,
  `entryDate` DATE NOT NULL,
  `contractNumber` VARCHAR(120) NULL,
  `notes` TEXT NULL,
  `receivedByUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `wh_stock_lot_receipts_lot_created_idx`(`stockLotId`, `createdAt`),
  INDEX `wh_stock_lot_receipts_received_by_idx`(`receivedByUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `warehouse_stock_lot_receipts`
  ADD CONSTRAINT `warehouse_stock_lot_receipts_stockLotId_fkey`
  FOREIGN KEY (`stockLotId`) REFERENCES `warehouse_stock_lots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouse_stock_lot_receipts`
  ADD CONSTRAINT `warehouse_stock_lot_receipts_receivedByUserId_fkey`
  FOREIGN KEY (`receivedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill existing stock lots into receipt batches (FIFO source of truth)
INSERT INTO `warehouse_stock_lot_receipts` (
  `id`,
  `stockLotId`,
  `quantityReceived`,
  `quantityRemaining`,
  `entryDate`,
  `contractNumber`,
  `notes`,
  `receivedByUserId`,
  `createdAt`
)
SELECT
  UUID(),
  `id`,
  `quantityReceived`,
  `quantityOnHand`,
  `entryDate`,
  `contractNumber`,
  `notes`,
  `receivedByUserId`,
  `createdAt`
FROM `warehouse_stock_lots`
WHERE `quantityReceived` > 0 OR `quantityOnHand` > 0;

