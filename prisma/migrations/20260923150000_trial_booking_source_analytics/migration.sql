-- Nullable by design: historical and unattributed bookings remain unrecorded.
ALTER TABLE "Booking" ADD COLUMN "bookingSource" VARCHAR(16);
CREATE INDEX "Booking_storeId_createdAt_bookingSource_idx"
  ON "Booking"("storeId", "createdAt", "bookingSource");
