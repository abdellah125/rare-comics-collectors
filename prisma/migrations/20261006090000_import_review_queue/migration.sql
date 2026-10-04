-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT;

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "rows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "priceChanges" INTEGER NOT NULL DEFAULT 0,
    "unavailable" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "logJson" TEXT NOT NULL DEFAULT '[]',
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceSeller" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "sourceImage" TEXT,
    "sourceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" INTEGER,
    "sourcePrice" INTEGER,
    "priceNote" TEXT,
    "markupBps" INTEGER NOT NULL DEFAULT 2500,
    "retailPrice" INTEGER,
    "priceManual" BOOLEAN NOT NULL DEFAULT false,
    "priceChangeNote" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL DEFAULT '',
    "issue" TEXT NOT NULL DEFAULT '',
    "publisher" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "era" TEXT NOT NULL DEFAULT '',
    "grader" TEXT NOT NULL DEFAULT '',
    "grade" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT 'Universal Blue',
    "variant" TEXT,
    "certNumber" TEXT,
    "keyIssue" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "highlightsJson" TEXT NOT NULL DEFAULT '[]',
    "attributesJson" TEXT NOT NULL DEFAULT '{}',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "slug" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "primaryKeyword" TEXT NOT NULL DEFAULT '',
    "secondaryKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "searchIntent" TEXT NOT NULL DEFAULT '',
    "internalLinksJson" TEXT NOT NULL DEFAULT '[]',
    "seoStatus" TEXT NOT NULL DEFAULT 'pending',
    "seoNotesJson" TEXT NOT NULL DEFAULT '[]',
    "seoManual" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "duplicateStatus" TEXT NOT NULL DEFAULT 'unique',
    "duplicateOf" TEXT,
    "problemsJson" TEXT NOT NULL DEFAULT '[]',
    "editedJson" TEXT NOT NULL DEFAULT '[]',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT,
    "runId" TEXT,
    "importFile" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_source_startedAt_idx" ON "ImportRun"("source", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItem_productId_key" ON "ImportItem"("productId");

-- CreateIndex
CREATE INDEX "ImportItem_source_status_idx" ON "ImportItem"("source", "status");

-- CreateIndex
CREATE INDEX "ImportItem_certNumber_idx" ON "ImportItem"("certNumber");

-- CreateIndex
CREATE INDEX "ImportItem_dedupeKey_idx" ON "ImportItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "ImportItem_seoStatus_idx" ON "ImportItem"("seoStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItem_source_sourceId_key" ON "ImportItem"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

