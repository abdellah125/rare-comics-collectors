-- Rows written by an early version with the status "done" are completed jobs.
UPDATE "Job" SET "status" = 'completed', "completedAt" = COALESCE("completedAt", "runAt") WHERE "status" = 'done';
