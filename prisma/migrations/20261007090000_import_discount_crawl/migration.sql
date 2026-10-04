-- Imported products sell at 25 % BELOW the source price (source × 0.75), not above it.
-- 1. Listings whose price still equals the formula price of their queue item follow the new formula.
--    A price that was changed by hand (it no longer equals the item's price) is left alone.
UPDATE "Product" p
SET "price" = ROUND(i."sourcePrice"::numeric * 7500 / 10000)::int, "updatedAt" = NOW()
FROM "ImportItem" i
WHERE i."productId" = p."id" AND i."markupBps" = 2500 AND i."priceManual" = false AND i."sourcePrice" IS NOT NULL AND p."price" = i."retailPrice";

-- 2. The queue items themselves.
UPDATE "ImportItem" SET "retailPrice" = ROUND("sourcePrice"::numeric * 7500 / 10000)::int WHERE "markupBps" = 2500 AND "priceManual" = false AND "sourcePrice" IS NOT NULL;
UPDATE "ImportItem" SET "markupBps" = -2500 WHERE "markupBps" = 2500;

-- AlterTable
ALTER TABLE "ImportItem" ALTER COLUMN "markupBps" SET DEFAULT -2500;

-- CreateTable
CREATE TABLE "ImportCrawl" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startPage" INTEGER NOT NULL,
    "endPage" INTEGER NOT NULL,
    "nextPage" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pagesDone" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failedPagesJson" TEXT NOT NULL DEFAULT '[]',
    "delaySeconds" INTEGER NOT NULL DEFAULT 6,
    "message" TEXT,
    "logJson" TEXT NOT NULL DEFAULT '[]',
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "startedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportCrawl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportCrawl_source_status_idx" ON "ImportCrawl"("source", "status");
