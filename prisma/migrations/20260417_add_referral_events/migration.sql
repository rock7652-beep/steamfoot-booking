-- CreateEnum
CREATE TYPE "ReferralEventType" AS ENUM ('SHARE', 'LINK_CLICK', 'LINE_JOIN', 'LINE_ENTRY', 'REGISTER', 'BOOKING_CREATED', 'BOOKING_COMPLETED');

-- CreateTable
CREATE TABLE "ReferralEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "referrerId" TEXT,
    "bookingId" TEXT,
    "type" "ReferralEventType" NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralEvent_storeId_idx" ON "ReferralEvent"("storeId");

-- CreateIndex
CREATE INDEX "ReferralEvent_customerId_idx" ON "ReferralEvent"("customerId");

-- CreateIndex
CREATE INDEX "ReferralEvent_referrerId_idx" ON "ReferralEvent"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralEvent_bookingId_idx" ON "ReferralEvent"("bookingId");

-- CreateIndex
CREATE INDEX "ReferralEvent_type_idx" ON "ReferralEvent"("type");

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
