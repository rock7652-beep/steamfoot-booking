-- Additive course links on the mature delivery log. Existing steam/SPA rows stay null.
ALTER TABLE "MessageLog"
  ADD COLUMN "courseBookingId" TEXT,
  ADD COLUMN "courseCardId" TEXT;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_courseBooking_store_fkey"
  FOREIGN KEY ("courseBookingId", "storeId") REFERENCES "CourseBooking" (id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_courseCard_store_fkey"
  FOREIGN KEY ("courseCardId", "storeId") REFERENCES "CoursePointCard" (id, "storeId") ON DELETE RESTRICT;
CREATE INDEX "MessageLog_courseBookingId_idx" ON "MessageLog" ("courseBookingId");
CREATE INDEX "MessageLog_courseCardId_idx" ON "MessageLog" ("courseCardId");
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_course_source_check"
  CHECK (("courseBookingId" IS NULL AND "courseCardId" IS NULL) OR ("bookingId" IS NULL AND "spaBookingId" IS NULL));
