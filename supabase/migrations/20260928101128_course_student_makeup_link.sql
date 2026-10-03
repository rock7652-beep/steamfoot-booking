-- A makeup retains its original leave even after cancellation. Only an active
-- booking (or a further leave in the same chain) holds the source reservation.
ALTER TABLE public."CourseBooking" ADD COLUMN "makeupForBookingId" text;
ALTER TABLE public."CourseBooking" ADD CONSTRAINT "CourseBooking_makeup_source_fk"
  FOREIGN KEY ("makeupForBookingId", "storeId") REFERENCES public."CourseBooking" (id, "storeId");
ALTER TABLE public."CourseBooking" ADD CONSTRAINT "CourseBooking_makeup_not_self"
  CHECK ("makeupForBookingId" IS DISTINCT FROM id);
CREATE UNIQUE INDEX "CourseBooking_one_makeup_per_leave"
  ON public."CourseBooking" ("storeId", "makeupForBookingId")
  WHERE "makeupForBookingId" IS NOT NULL AND (status <> 'CANCELLED' OR "absenceKind" = 'STUDENT_LEAVE');
CREATE INDEX "CourseBooking_makeup_source_idx" ON public."CourseBooking" ("makeupForBookingId", "storeId");
