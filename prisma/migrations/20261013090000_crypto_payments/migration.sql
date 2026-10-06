-- CreateTable
CREATE TABLE "CryptoPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contract" TEXT,
    "decimals" INTEGER NOT NULL,
    "usdCents" INTEGER NOT NULL,
    "rate" TEXT NOT NULL,
    "rateSource" TEXT NOT NULL,
    "baseAtomic" TEXT NOT NULL,
    "expectedAtomic" TEXT NOT NULL,
    "expectedDisplay" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "txHash" TEXT,
    "txSource" TEXT,
    "receivedAtomic" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "requiredConfirmations" INTEGER NOT NULL,
    "note" TEXT,
    "quoteCount" INTEGER NOT NULL DEFAULT 1,
    "detectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPayment_paymentId_key" ON "CryptoPayment"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPayment_network_txHash_key" ON "CryptoPayment"("network", "txHash");

-- CreateIndex
CREATE INDEX "CryptoPayment_orderId_idx" ON "CryptoPayment"("orderId");

-- CreateIndex
CREATE INDEX "CryptoPayment_status_expiresAt_idx" ON "CryptoPayment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CryptoPayment_coin_network_status_idx" ON "CryptoPayment"("coin", "network", "status");

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
