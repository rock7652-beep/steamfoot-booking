-- Course-only, opt-in per plan. Existing plans remain disabled and data is preserved.
ALTER TABLE "CoursePointPlan"
  ADD COLUMN "lowBalanceEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "lowBalanceThreshold" integer,
  ADD CONSTRAINT "CoursePointPlan_low_balance_check" CHECK (
    ("lowBalanceThreshold" IS NULL OR "lowBalanceThreshold" >= 0)
    AND (NOT "lowBalanceEnabled" OR "lowBalanceThreshold" IS NOT NULL)
  );
CREATE TABLE "CourseBalanceReminderPreference" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id),
  "customerId" text NOT NULL,
  "stoppedAt" timestamptz(3),
  "lastEventAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT NOW(),
  UNIQUE ("storeId", "customerId"),
  FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"(id,"storeId")
);
ALTER TABLE "CourseBalanceReminderPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseBalanceReminderPreference" FROM anon, authenticated;
-- Roll back application first. Prefer leaving this additive schema in place.
-- Export preference rows before any later approved removal; never discard opt-outs.
