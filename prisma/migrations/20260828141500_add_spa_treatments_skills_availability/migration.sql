-- SPA phase 1 is additive. Existing ServicePlan, CustomerPlanWallet,
-- DutyAssignment and Booking behavior remain valid while Demo adopts the new model.

CREATE TYPE "StaffAvailabilityExceptionType" AS ENUM ('UNAVAILABLE', 'AVAILABLE');

CREATE TABLE "ProfessionalSkill" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfessionalSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantLabel" TEXT,
    "price" DECIMAL(10,0) NOT NULL,
    "serviceMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publicVisible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentSkill" (
    "storeId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentSkill_pkey" PRIMARY KEY ("treatmentId", "skillId")
);

CREATE TABLE "StaffSkill" (
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffSkill_pkey" PRIMARY KEY ("staffId", "skillId")
);

CREATE TABLE "StaffWeeklyAvailability" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffWeeklyAvailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffWeeklyAvailability_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
    CONSTRAINT "StaffWeeklyAvailability_time_check" CHECK ("startTime" < "endTime")
);

CREATE TABLE "StaffAvailabilityException" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "StaffAvailabilityExceptionType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffAvailabilityException_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffAvailabilityException_time_check" CHECK (
      ("startTime" IS NULL AND "endTime" IS NULL)
      OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "startTime" < "endTime")
    )
);

ALTER TABLE "Booking"
  ADD COLUMN "treatmentId" TEXT,
  ADD COLUMN "treatmentNameSnapshot" TEXT,
  ADD COLUMN "treatmentVariantSnapshot" TEXT,
  ADD COLUMN "treatmentPriceSnapshot" DECIMAL(10,0),
  ADD COLUMN "treatmentServiceMinutesSnapshot" INTEGER,
  ADD COLUMN "treatmentBufferMinutesSnapshot" INTEGER;

CREATE UNIQUE INDEX "uq_professional_skill_store_name" ON "ProfessionalSkill"("storeId", "name");
CREATE UNIQUE INDEX "ProfessionalSkill_id_storeId_key" ON "ProfessionalSkill"("id", "storeId");
CREATE INDEX "ProfessionalSkill_storeId_isActive_idx" ON "ProfessionalSkill"("storeId", "isActive");

CREATE UNIQUE INDEX "uq_treatment_store_name_variant" ON "Treatment"("storeId", "name", "variantLabel");
CREATE UNIQUE INDEX "Treatment_id_storeId_key" ON "Treatment"("id", "storeId");
CREATE INDEX "Treatment_storeId_isActive_publicVisible_idx" ON "Treatment"("storeId", "isActive", "publicVisible");

CREATE INDEX "TreatmentSkill_storeId_idx" ON "TreatmentSkill"("storeId");
CREATE INDEX "TreatmentSkill_skillId_idx" ON "TreatmentSkill"("skillId");
CREATE INDEX "StaffSkill_storeId_idx" ON "StaffSkill"("storeId");
CREATE INDEX "StaffSkill_skillId_idx" ON "StaffSkill"("skillId");
CREATE UNIQUE INDEX "uq_staff_weekly_availability" ON "StaffWeeklyAvailability"("staffId", "dayOfWeek", "startTime", "endTime");
CREATE INDEX "StaffWeeklyAvailability_storeId_dayOfWeek_isActive_idx" ON "StaffWeeklyAvailability"("storeId", "dayOfWeek", "isActive");
CREATE INDEX "StaffWeeklyAvailability_staffId_dayOfWeek_idx" ON "StaffWeeklyAvailability"("staffId", "dayOfWeek");
CREATE INDEX "StaffAvailabilityException_storeId_date_idx" ON "StaffAvailabilityException"("storeId", "date");
CREATE INDEX "StaffAvailabilityException_staffId_date_idx" ON "StaffAvailabilityException"("staffId", "date");
CREATE INDEX "Booking_treatmentId_idx" ON "Booking"("treatmentId");

ALTER TABLE "ProfessionalSkill" ADD CONSTRAINT "ProfessionalSkill_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentSkill" ADD CONSTRAINT "TreatmentSkill_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentSkill" ADD CONSTRAINT "TreatmentSkill_treatmentId_storeId_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "Treatment"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentSkill" ADD CONSTRAINT "TreatmentSkill_skillId_storeId_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "ProfessionalSkill"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffSkill" ADD CONSTRAINT "StaffSkill_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffSkill" ADD CONSTRAINT "StaffSkill_staffId_storeId_fkey" FOREIGN KEY ("staffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffSkill" ADD CONSTRAINT "StaffSkill_skillId_storeId_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "ProfessionalSkill"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffWeeklyAvailability" ADD CONSTRAINT "StaffWeeklyAvailability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffWeeklyAvailability" ADD CONSTRAINT "StaffWeeklyAvailability_staffId_storeId_fkey" FOREIGN KEY ("staffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAvailabilityException" ADD CONSTRAINT "StaffAvailabilityException_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAvailabilityException" ADD CONSTRAINT "StaffAvailabilityException_staffId_storeId_fkey" FOREIGN KEY ("staffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- These tables are server-only. Do not expose them to Supabase Data API roles.
ALTER TABLE "ProfessionalSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Treatment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TreatmentSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffWeeklyAvailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAvailabilityException" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProfessionalSkill", "Treatment", "TreatmentSkill", "StaffSkill", "StaffWeeklyAvailability", "StaffAvailabilityException" FROM anon, authenticated;
