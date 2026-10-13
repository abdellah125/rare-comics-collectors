-- Listing pages are read once per item for all photos and the listing's own details. Additive.
ALTER TABLE "ImportItem" ADD COLUMN "enrichedAt" TIMESTAMP(3);
ALTER TABLE "ImportItem" ADD COLUMN "enrichAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportItem" ADD COLUMN "enrichNote" TEXT;
CREATE INDEX "ImportItem_enrichedAt_idx" ON "ImportItem"("enrichedAt");

-- Photos shown from the source's address are copied into our storage; the original address is kept.
ALTER TABLE "ProductImage" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "copyAttempts" INTEGER NOT NULL DEFAULT 0;
