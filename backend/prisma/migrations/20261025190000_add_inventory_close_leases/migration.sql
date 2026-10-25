ALTER TABLE "inventory_pending_actions"
ADD COLUMN "leaseToken" TEXT;

ALTER TABLE "inventory_session_close_jobs"
ADD COLUMN "leaseToken" TEXT,
ADD COLUMN "leaseUntil" TIMESTAMP(3);

CREATE INDEX "inventory_session_close_jobs_status_lease_idx"
ON "inventory_session_close_jobs"("status", "leaseUntil");
