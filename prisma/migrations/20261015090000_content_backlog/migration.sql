-- AlterTable
ALTER TABLE "ContentTask" ADD COLUMN     "title" TEXT,
ADD COLUMN     "secondaryJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "source" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'low';

-- CreateIndex
CREATE INDEX "ContentTask_day_status_score_idx" ON "ContentTask"("day", "status", "score");
