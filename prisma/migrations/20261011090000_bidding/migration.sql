-- AlterTable
ALTER TABLE "ImportItem" ADD COLUMN     "auctionEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "auctionEndsAt" TIMESTAMP(3),
ADD COLUMN     "bidCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "saleType" TEXT NOT NULL DEFAULT 'fixed';

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bid_productId_amount_idx" ON "Bid"("productId", "amount");

-- CreateIndex
CREATE INDEX "Bid_status_createdAt_idx" ON "Bid"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Bid_email_idx" ON "Bid"("email");

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Products the source sells by bidding stay bidding products here: the price shown is the current
-- bid, not a suggested Buy It Now price. A price an admin typed by hand is left alone.
UPDATE "ImportItem" SET "retailPrice" = "sourcePrice", "priceBasis" = 'Sold by bidding at the source: the price shown is the current bid. Visitors place bids; nothing is bought outright.'
WHERE "auction" = true AND "priceManual" = false AND "sourcePrice" IS NOT NULL AND "status" <> 'released';

UPDATE "Product" p SET "saleType" = 'auction', "price" = CASE WHEN i."priceManual" = false AND i."sourcePrice" IS NOT NULL THEN i."sourcePrice" ELSE p."price" END, "updatedAt" = NOW()
FROM "ImportItem" i WHERE i."productId" = p."id" AND i."auction" = true;

UPDATE "ImportItem" SET "retailPrice" = "sourcePrice", "priceBasis" = 'Sold by bidding at the source: the price shown is the current bid. Visitors place bids; nothing is bought outright.'
WHERE "auction" = true AND "priceManual" = false AND "sourcePrice" IS NOT NULL AND "status" = 'released';
