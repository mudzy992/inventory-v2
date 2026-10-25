CREATE TYPE "NotificationOutboxStatus" AS ENUM ('pending', 'running', 'delivered');

ALTER TABLE "notifications"
ADD COLUMN "outboxId" TEXT;

CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "relatedId" VARCHAR(36),
    "sessionId" TEXT,
    "refreshDisposalInbox" BOOLEAN NOT NULL DEFAULT false,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_session_close_retry_audits" (
    "id" TEXT NOT NULL,
    "closeJobId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_session_close_retry_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_outboxId_key" ON "notifications"("outboxId");
CREATE UNIQUE INDEX "notification_outbox_idempotencyKey_key" ON "notification_outbox"("idempotencyKey");
CREATE INDEX "notification_outbox_status_lease_idx" ON "notification_outbox"("status", "leaseUntil");
CREATE INDEX "notification_outbox_status_next_attempt_idx" ON "notification_outbox"("status", "nextAttemptAt");
CREATE INDEX "notification_outbox_createdAt_idx" ON "notification_outbox"("createdAt");
CREATE INDEX "inventory_session_close_retry_audits_closeJobId_createdAt_idx" ON "inventory_session_close_retry_audits"("closeJobId", "createdAt");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_outboxId_fkey"
FOREIGN KEY ("outboxId") REFERENCES "notification_outbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_outbox"
ADD CONSTRAINT "notification_outbox_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_session_close_retry_audits"
ADD CONSTRAINT "inventory_session_close_retry_audits_closeJobId_fkey"
FOREIGN KEY ("closeJobId") REFERENCES "inventory_session_close_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_session_close_retry_audits"
ADD CONSTRAINT "inventory_session_close_retry_audits_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
