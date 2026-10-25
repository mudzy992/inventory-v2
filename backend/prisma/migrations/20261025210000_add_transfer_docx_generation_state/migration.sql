CREATE TYPE "TransferDocxGenerationStatus" AS ENUM (
    'not_requested',
    'queued',
    'running',
    'done',
    'failed'
);

ALTER TABLE "transfers"
ADD COLUMN "generatedDocxStatus" "TransferDocxGenerationStatus" NOT NULL DEFAULT 'not_requested',
ADD COLUMN "generatedDocxAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "generatedDocxLeaseToken" TEXT,
ADD COLUMN "generatedDocxLeaseUntil" TIMESTAMP(3),
ADD COLUMN "generatedDocxError" TEXT;

UPDATE "transfers"
SET "generatedDocxStatus" = 'done'
WHERE "generatedDocxPath" IS NOT NULL;

UPDATE "transfers"
SET "generatedDocxStatus" = 'queued'
WHERE "documentWarehouseId" IS NOT NULL
  AND "generatedDocxPath" IS NULL
  AND status IN ('raw', 'printed', 'uploaded', 'potpisan');

CREATE INDEX "transfers_docx_status_lease_idx"
ON "transfers"("generatedDocxStatus", "generatedDocxLeaseUntil");
