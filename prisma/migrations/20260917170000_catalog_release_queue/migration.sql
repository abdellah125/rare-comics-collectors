-- Release queue for catalogue imports: drafts carry their source, CSV file and go-live day.
ALTER TABLE "Product" ADD COLUMN "importSource" TEXT;
ALTER TABLE "Product" ADD COLUMN "importFile" TEXT;
ALTER TABLE "Product" ADD COLUMN "releaseAt" TIMESTAMP(3);

CREATE INDEX "Product_importSource_releaseAt_idx" ON "Product"("importSource", "releaseAt");
