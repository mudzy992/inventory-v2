-- AlterTable
ALTER TABLE `equipment` MODIFY `status` ENUM('skladiste', 'zaduzeno', 'za_rashod', 'rashodovano') NOT NULL;
