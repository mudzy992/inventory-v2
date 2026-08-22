-- Run ONLY if migrate deploy failed on this migration before CREATE TABLE succeeded.
-- Then: npx prisma migrate resolve --rolled-back 20260604160000_maintenance_parts
-- Then: npx prisma migrate deploy

DROP INDEX `categories_categoryKind_idx` ON `categories`;
ALTER TABLE `categories` DROP COLUMN `categoryKind`;
