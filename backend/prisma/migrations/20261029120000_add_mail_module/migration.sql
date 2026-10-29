CREATE TYPE "MailProvider" AS ENUM ('gmail', 'office365', 'custom');

CREATE TYPE "EmailLogStatus" AS ENUM ('sent', 'failed');

CREATE TABLE "mail_configurations" (
    "id" VARCHAR(36) NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" "MailProvider" NOT NULL DEFAULT 'custom',
    "host" VARCHAR(255) NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(255) NOT NULL DEFAULT '',
    "passwordEncrypted" TEXT,
    "fromEmail" VARCHAR(255) NOT NULL DEFAULT '',
    "fromName" VARCHAR(255) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "subject" VARCHAR(300) NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "variables" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");

CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "templateKey" VARCHAR(80),
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT,
    "bccAddresses" TEXT,
    "subject" VARCHAR(300) NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "transferId" VARCHAR(36),
    "sentByUserId" VARCHAR(36),
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");
CREATE INDEX "email_logs_transferId_idx" ON "email_logs"("transferId");
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "email_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
