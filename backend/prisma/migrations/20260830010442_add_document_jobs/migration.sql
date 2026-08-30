-- Document Engine: perzistentni zapis poslova konverzije dokumenata
-- (DOCX/XLSX/ODT -> PDF), obrađenih na zasebnom Document Worker servisu
-- (LibreOffice) preko BullMQ `document-generation` reda. Vidi
-- backend/src/modules/documents/.

-- CreateEnum
CREATE TYPE "DocumentJobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "DocumentSourceFormat" AS ENUM ('docx', 'xlsx', 'odt');

-- CreateTable
CREATE TABLE "document_jobs" (
    "id" TEXT NOT NULL,
    "sourceType" VARCHAR(50) NOT NULL,
    "sourceId" VARCHAR(64) NOT NULL,
    "sourceFormat" "DocumentSourceFormat" NOT NULL,
    "targetFormat" VARCHAR(10) NOT NULL DEFAULT 'pdf',
    "sourceRelativePath" VARCHAR(500) NOT NULL,
    "resultRelativePath" VARCHAR(500) NOT NULL,
    "status" "DocumentJobStatus" NOT NULL DEFAULT 'queued',
    "bullJobId" VARCHAR(100),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_jobs_sourceType_sourceId_idx" ON "document_jobs"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "document_jobs_status_idx" ON "document_jobs"("status");
