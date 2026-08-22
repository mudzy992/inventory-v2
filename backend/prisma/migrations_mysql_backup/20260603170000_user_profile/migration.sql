-- AlterTable
ALTER TABLE `users` ADD COLUMN `firstName` VARCHAR(120) NULL,
    ADD COLUMN `lastName` VARCHAR(120) NULL,
    ADD COLUMN `email` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);
