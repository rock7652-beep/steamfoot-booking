-- Staging repair: preserve every existing booking shape; add deferred music bookings.
ALTER TABLE "CourseBooking" DROP CONSTRAINT "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
 status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW') AND (
 ("bookingKind"='CARD' AND "cardId" IS NOT NULL AND "pointCost">0 AND "trialPrice" IS NULL) OR
 ("bookingKind"='TRIAL' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" BETWEEN 0 AND 1000000) OR
 ("bookingKind" IN ('TEACHER_MAKEUP','OPENING_MAKEUP') AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NULL) OR
 ("bookingKind"='UNPAID' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NULL AND "customerId" IS NOT NULL AND "operatorCustomerId" IS NULL AND "makeupForBookingId" IS NULL AND "companionIndex" IS NULL)
 ));
