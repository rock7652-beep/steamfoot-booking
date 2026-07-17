-- AddTable
CREATE TABLE "BookingRecurrenceGroup" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "slotTime" TEXT NOT NULL,
    "totalOccurrences" INTEGER NOT NULL,
    "people" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRecurrenceGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN "recurrenceGroupId" TEXT,
  ADD COLUMN "recurrenceIndex" INTEGER;

-- AlterTable
ALTER TABLE "ShopConfig"
  ADD COLUMN "weeklyRecurrenceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weeklyRecurrenceMaxWeeks" INTEGER NOT NULL DEFAULT 8;

-- CreateIndex
CREATE INDEX "BookingRecurrenceGroup_storeId_idx" ON "BookingRecurrenceGroup"("storeId");
CREATE INDEX "BookingRecurrenceGroup_customerId_idx" ON "BookingRecurrenceGroup"("customerId");
CREATE INDEX "Booking_recurrenceGroupId_idx" ON "Booking"("recurrenceGroupId");
CREATE UNIQUE INDEX "Booking_recurrenceGroupId_recurrenceIndex_key" ON "Booking"("recurrenceGroupId", "recurrenceIndex");

-- AddForeignKey
ALTER TABLE "BookingRecurrenceGroup" ADD CONSTRAINT "BookingRecurrenceGroup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRecurrenceGroup" ADD CONSTRAINT "BookingRecurrenceGroup_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_recurrenceGroupId_fkey" FOREIGN KEY ("recurrenceGroupId") REFERENCES "BookingRecurrenceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
