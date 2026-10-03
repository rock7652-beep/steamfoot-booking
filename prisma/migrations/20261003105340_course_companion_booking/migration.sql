-- Guests occupy their own seat without creating a Customer or shared-card member.
ALTER TABLE "CourseBooking" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "CourseBooking"
  ADD COLUMN "companionIndex" integer,
  ADD COLUMN "reserverCustomerId" text,
  ADD COLUMN "reserverName" text,
  ADD COLUMN "reserverCardId" text,
  ADD COLUMN "groupKey" text,
  ADD CONSTRAINT "CourseBooking_companion_check" CHECK (
    ("customerId" IS NOT NULL OR "companionIndex" IS NOT NULL) AND
    ("companionIndex" IS NULL OR ("companionIndex" BETWEEN 1 AND 2 AND "reserverCustomerId" IS NOT NULL))
  );
CREATE INDEX "CourseBooking_storeId_reserverCustomerId_idx" ON "CourseBooking" ("storeId", "reserverCustomerId");
ALTER TABLE "CourseWaitlistEntry" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "CourseWaitlistEntry"
  ADD COLUMN "companionIndex" integer,
  ADD COLUMN "reserverCustomerId" text,
  ADD COLUMN "reserverName" text,
  ADD COLUMN "reserverCardId" text,
  ADD CONSTRAINT "CourseWaitlistEntry_companion_check" CHECK (
    ("customerId" IS NOT NULL OR "companionIndex" IS NOT NULL) AND
    ("companionIndex" IS NULL OR ("companionIndex" BETWEEN 1 AND 2 AND "reserverCustomerId" IS NOT NULL))
  );
CREATE INDEX "CourseWaitlistEntry_storeId_reserverCustomerId_idx" ON "CourseWaitlistEntry" ("storeId", "reserverCustomerId");

-- Preserve every previously accepted ledger kind and add the audited usage-change kind.
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT IF EXISTS "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (
  points > 0 AND (
    kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
    OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
    OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
    OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
    OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
  )
);
