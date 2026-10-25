-- Additive only: legacy plans/sessions retain NULL and their existing behavior.
ALTER TABLE "CoursePointPlan" ADD COLUMN "chargeSettings" JSONB;
ALTER TABLE "CourseSession" ADD COLUMN "chargeSnapshot" JSONB;
