-- Reviewed standalone SPA schema change. Apply only to the verified test project.
CREATE TABLE "SpaReceipt" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "amount" DECIMAL(10,0) NOT NULL CHECK ("amount" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'TWD' CHECK ("currency" = 'TWD'),
  "paymentMethod" TEXT NOT NULL CHECK ("paymentMethod" IN ('CASH','CARD')),
  "recordedByUserId" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaReceipt_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SpaReceipt_bookingId_storeId_key" ON "SpaReceipt"("bookingId", "storeId");
CREATE INDEX "SpaReceipt_storeId_paidAt_idx" ON "SpaReceipt"("storeId", "paidAt");
ALTER TABLE "SpaReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SpaReceipt" FROM anon, authenticated;
