-- PayPal invoice requests: who to invoice and where the request stands.
ALTER TABLE "Order" ADD COLUMN "invoiceName" TEXT;
ALTER TABLE "Order" ADD COLUMN "paypalEmail" TEXT;
ALTER TABLE "Order" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Order" ADD COLUMN "invoiceStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "invoiceRef" TEXT;
ALTER TABLE "Order" ADD COLUMN "invoiceSentAt" TIMESTAMP(3);

CREATE INDEX "Order_invoiceStatus_idx" ON "Order"("invoiceStatus");
