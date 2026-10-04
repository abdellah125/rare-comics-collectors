-- AlterTable
ALTER TABLE "ImportItem" ADD COLUMN     "auction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceBasis" TEXT;

-- Items that were held back only because the source sells them by auction.
UPDATE "ImportItem" SET "auction" = true WHERE "problemsJson" LIKE '%auction listing%';
