ALTER TABLE "CoursePointPlan"
  ADD COLUMN "customerPurchasable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowShared" BOOLEAN;

-- Existing plans already supported shared cards. Preserve that behaviour,
-- while making newly-created plans opt in explicitly.
UPDATE "CoursePointPlan" SET "allowShared" = true WHERE "allowShared" IS NULL;
ALTER TABLE "CoursePointPlan" ALTER COLUMN "allowShared" SET NOT NULL;
ALTER TABLE "CoursePointPlan" ALTER COLUMN "allowShared" SET DEFAULT false;
