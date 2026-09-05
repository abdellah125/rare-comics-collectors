-- Jobs finished before the status vocabulary was unified were stored as "done";
-- the admin panel and the cleanup job only know "completed".
UPDATE "Job" SET "status" = 'completed' WHERE "status" = 'done';
