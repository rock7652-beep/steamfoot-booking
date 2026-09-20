-- Additive course-only change. Existing card bookings remain CARD and retain all balances.
BEGIN;
ALTER TABLE "CourseBooking" ALTER COLUMN "cardId" DROP NOT NULL;
ALTER TABLE "CourseBooking" ADD COLUMN "bookingKind" TEXT NOT NULL DEFAULT 'CARD', ADD COLUMN "trialPrice" INTEGER;
ALTER TABLE "CourseBooking" DROP CONSTRAINT "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
 status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW') AND
 (("bookingKind"='CARD' AND "cardId" IS NOT NULL AND "pointCost">0 AND "trialPrice" IS NULL)
 OR ("bookingKind"='TRIAL' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NOT NULL AND "trialPrice" BETWEEN 0 AND 1000000))
);
CREATE TABLE "CourseTrialPayment" (
 id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "bookingId" TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 1000000),
 "paymentMethod" TEXT NOT NULL CHECK ("paymentMethod" IN ('CASH','TRANSFER','LINE_PAY','CREDIT_CARD','OTHER')),
 "paymentSplits" JSONB, status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS','VOIDED')),
 note TEXT NOT NULL DEFAULT '', "requestKey" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMPTZ(3), "voidReason" TEXT,
 CONSTRAINT "CourseTrialPayment_bookingId_storeId_fkey" FOREIGN KEY ("bookingId","storeId") REFERENCES "CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 CONSTRAINT "CourseTrialPayment_storeId_requestKey_key" UNIQUE ("storeId","requestKey"),
 CONSTRAINT "CourseTrialPayment_void_consistency" CHECK ((status='SUCCESS' AND "voidedAt" IS NULL AND "voidReason" IS NULL) OR (status='VOIDED' AND "voidedAt" IS NOT NULL AND length("voidReason")>0))
);
CREATE UNIQUE INDEX "CourseTrialPayment_one_success" ON "CourseTrialPayment"("bookingId") WHERE status='SUCCESS';
CREATE INDEX "CourseTrialPayment_storeId_createdAt_idx" ON "CourseTrialPayment"("storeId","createdAt");
ALTER TABLE "CourseTrialPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseTrialPayment" FROM anon, authenticated;
COMMIT;
