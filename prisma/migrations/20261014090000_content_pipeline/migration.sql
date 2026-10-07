-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'guide',
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "primaryKeyword" TEXT,
ADD COLUMN     "secondaryJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "semanticJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "ogTitle" TEXT,
ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "imageAlt" TEXT,
ADD COLUMN     "wordCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seoScore" INTEGER,
ADD COLUMN     "qualityJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "searchVolume" INTEGER,
ADD COLUMN     "keywordDifficulty" DOUBLE PRECISION,
ADD COLUMN     "opportunityScore" INTEGER,
ADD COLUMN     "clusterKey" TEXT,
ADD COLUMN     "claimLevel" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "indexedAt" TIMESTAMP(3);

-- Articles that exist today were written and checked by hand (the seed batches and the admin form).
UPDATE "Article" SET "origin" = 'seed' WHERE "origin" = 'manual';
-- They are already known to search engines: nothing to submit again.
UPDATE "Article" SET "indexedAt" = COALESCE("publishedAt", "createdAt") WHERE "status" = 'published';

-- CreateIndex
CREATE INDEX "Article_category_status_publishedAt_idx" ON "Article"("category", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_origin_createdAt_idx" ON "Article"("origin", "createdAt");

-- CreateTable
CREATE TABLE "ContentTask" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'new',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "keyword" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "clusterKey" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "volume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreJson" TEXT NOT NULL DEFAULT '{}',
    "category" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "briefJson" TEXT NOT NULL DEFAULT '{}',
    "batchId" TEXT,
    "checkBatchId" TEXT,
    "draftJson" TEXT,
    "verdictJson" TEXT,
    "articleId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usageJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentTask_day_norm_key" ON "ContentTask"("day", "norm");

-- CreateIndex
CREATE INDEX "ContentTask_status_updatedAt_idx" ON "ContentTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ContentTask_batchId_idx" ON "ContentTask"("batchId");

-- CreateIndex
CREATE INDEX "ContentTask_checkBatchId_idx" ON "ContentTask"("checkBatchId");

-- CreateIndex
CREATE INDEX "ContentTask_norm_idx" ON "ContentTask"("norm");
