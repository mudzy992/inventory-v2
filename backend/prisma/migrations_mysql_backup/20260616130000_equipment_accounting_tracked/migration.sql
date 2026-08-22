-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `isAccountingTracked` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `equipment` MODIFY `inventoryNumber` VARCHAR(120) NULL;

-- CreateIndex
CREATE INDEX `equipment_isAccountingTracked_idx` ON `equipment`(`isAccountingTracked`);
