-- AlterTable
ALTER TABLE `inventory_committees` ADD COLUMN `membersConfigured` BOOLEAN NOT NULL DEFAULT false;

-- Backfill: committees that already have members are considered configured
UPDATE `inventory_committees` ic
SET `membersConfigured` = true
WHERE EXISTS (
  SELECT 1 FROM `inventory_committee_members` icm WHERE icm.`committeeId` = ic.`id`
);
