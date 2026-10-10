-- Job leases, attempt history and a non-destructive archive. Additive only: no existing row or column is changed or removed.

ALTER TABLE "Job" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "lastErrorAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "Job" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "heartbeatAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "leaseUntil" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "Job" ADD COLUMN "result" TEXT;

CREATE INDEX "Job_status_leaseUntil_idx" ON "Job"("status", "leaseUntil");
-- Last success per type (health view, unresolved failures) and the newest-first list.
CREATE INDEX "Job_type_status_completedAt_idx" ON "Job"("type", "status", "completedAt");
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");
-- At most one waiting copy per dedupe key. Every existing row has a NULL key, so this cannot conflict with current data.
CREATE UNIQUE INDEX "Job_pending_dedupeKey_key" ON "Job"("dedupeKey") WHERE "status" = 'pending' AND "dedupeKey" IS NOT NULL;

CREATE TABLE "JobAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "worker" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'running',
    "errorKind" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "retryAt" TIMESTAMP(3),
    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JobAttempt_jobId_attempt_idx" ON "JobAttempt"("jobId", "attempt");
CREATE INDEX "JobAttempt_type_startedAt_idx" ON "JobAttempt"("type", "startedAt");
CREATE INDEX "JobAttempt_outcome_startedAt_idx" ON "JobAttempt"("outcome", "startedAt");

CREATE TABLE "JobArchive" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobArchive_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JobArchive_type_completedAt_idx" ON "JobArchive"("type", "completedAt");
