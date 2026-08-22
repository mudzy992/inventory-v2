-- AlterTable: monthly sequence per warehouse for transfer document numbers
ALTER TABLE `transfer_document_sequences`
    ADD COLUMN `month` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `transfer_document_sequences`
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`warehouseId`, `year`, `month`);
