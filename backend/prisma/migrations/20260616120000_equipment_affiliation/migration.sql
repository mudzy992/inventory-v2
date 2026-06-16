-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `affiliation` ENUM('distribucija', 'snabdjevanje') NOT NULL DEFAULT 'distribucija';

-- CreateIndex
CREATE INDEX `equipment_affiliation_idx` ON `equipment`(`affiliation`);
