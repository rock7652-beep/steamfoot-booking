-- SPA scheduling core. These tables are intentionally separate from legacy
-- Booking/Transaction/Treatment tables; only Store, Customer and Staff identity
-- keys are shared to retain HQ tenancy and permissions.
CREATE TYPE "SpaBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "SpaAvailabilityExceptionType" AS ENUM ('UNAVAILABLE', 'AVAILABLE');

CREATE TABLE "SpaBooking" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "serviceStaffId" TEXT NOT NULL,
  "bookingDate" DATE NOT NULL, "startTime" TEXT NOT NULL, "endTime" TEXT NOT NULL,
  "status" "SpaBookingStatus" NOT NULL DEFAULT 'CONFIRMED', "serviceNameSnapshot" TEXT NOT NULL,
  "totalPriceSnapshot" DECIMAL(10,0) NOT NULL, "requestKey" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpaBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaBooking_time_check" CHECK ("startTime" < "endTime")
);
CREATE TABLE "SpaBookingItem" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "treatmentId" TEXT NOT NULL,
  "treatmentNameSnapshot" TEXT NOT NULL, "priceSnapshot" DECIMAL(10,0) NOT NULL,
  "serviceMinutes" INTEGER NOT NULL, "bufferMinutes" INTEGER NOT NULL DEFAULT 0, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SpaBookingItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpaTreatment" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "name" TEXT NOT NULL, "variantLabel" TEXT,
  "price" DECIMAL(10,0) NOT NULL, "serviceMinutes" INTEGER NOT NULL, "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
  "publicVisible" BOOLEAN NOT NULL DEFAULT true, "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SpaTreatment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpaSkill" ("id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "name" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "SpaSkill_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SpaTreatmentSkill" ("storeId" TEXT NOT NULL, "treatmentId" TEXT NOT NULL, "skillId" TEXT NOT NULL, CONSTRAINT "SpaTreatmentSkill_pkey" PRIMARY KEY ("treatmentId", "skillId"));
CREATE TABLE "SpaStaffSkill" ("storeId" TEXT NOT NULL, "staffId" TEXT NOT NULL, "skillId" TEXT NOT NULL, CONSTRAINT "SpaStaffSkill_pkey" PRIMARY KEY ("staffId", "skillId"));
CREATE TABLE "SpaStaffAvailability" ("id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "staffId" TEXT NOT NULL, "dayOfWeek" INTEGER NOT NULL, "startTime" TEXT NOT NULL, "endTime" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "SpaStaffAvailability_pkey" PRIMARY KEY ("id"), CONSTRAINT "SpaStaffAvailability_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6), CONSTRAINT "SpaStaffAvailability_time_check" CHECK ("startTime" < "endTime"));
CREATE TABLE "SpaStaffAvailabilityException" ("id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "staffId" TEXT NOT NULL, "date" DATE NOT NULL, "type" "SpaAvailabilityExceptionType" NOT NULL, "startTime" TEXT, "endTime" TEXT, "reason" TEXT, CONSTRAINT "SpaStaffAvailabilityException_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "SpaBooking_storeId_requestKey_key" ON "SpaBooking"("storeId", "requestKey");
CREATE UNIQUE INDEX "SpaBooking_id_storeId_key" ON "SpaBooking"("id", "storeId");
CREATE INDEX "SpaBooking_storeId_bookingDate_startTime_idx" ON "SpaBooking"("storeId", "bookingDate", "startTime");
CREATE INDEX "SpaBooking_storeId_serviceStaffId_bookingDate_idx" ON "SpaBooking"("storeId", "serviceStaffId", "bookingDate");
CREATE UNIQUE INDEX "SpaBookingItem_bookingId_sortOrder_key" ON "SpaBookingItem"("bookingId", "sortOrder");
CREATE INDEX "SpaBookingItem_storeId_treatmentId_idx" ON "SpaBookingItem"("storeId", "treatmentId");
CREATE UNIQUE INDEX "SpaTreatment_id_storeId_key" ON "SpaTreatment"("id", "storeId");
CREATE UNIQUE INDEX "SpaTreatment_storeId_name_variantLabel_key" ON "SpaTreatment"("storeId", "name", "variantLabel");
CREATE INDEX "SpaTreatment_storeId_publicVisible_isActive_sortOrder_idx" ON "SpaTreatment"("storeId", "publicVisible", "isActive", "sortOrder");
CREATE UNIQUE INDEX "SpaSkill_id_storeId_key" ON "SpaSkill"("id", "storeId");
CREATE UNIQUE INDEX "SpaSkill_storeId_name_key" ON "SpaSkill"("storeId", "name");
CREATE INDEX "SpaTreatmentSkill_storeId_skillId_idx" ON "SpaTreatmentSkill"("storeId", "skillId");
CREATE INDEX "SpaStaffSkill_storeId_skillId_idx" ON "SpaStaffSkill"("storeId", "skillId");
CREATE UNIQUE INDEX "SpaStaffAvailability_storeId_staffId_dayOfWeek_key" ON "SpaStaffAvailability"("storeId", "staffId", "dayOfWeek");
CREATE INDEX "SpaStaffAvailability_storeId_staffId_isActive_idx" ON "SpaStaffAvailability"("storeId", "staffId", "isActive");
CREATE INDEX "SpaStaffAvailabilityException_storeId_staffId_date_idx" ON "SpaStaffAvailabilityException"("storeId", "staffId", "date");

ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT;
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_customerId_storeId_fkey" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE RESTRICT;
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_serviceStaffId_storeId_fkey" FOREIGN KEY ("serviceStaffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE RESTRICT;
ALTER TABLE "SpaBookingItem" ADD CONSTRAINT "SpaBookingItem_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE CASCADE;
ALTER TABLE "SpaTreatmentSkill" ADD CONSTRAINT "SpaTreatmentSkill_treatment_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "SpaTreatment"("id", "storeId") ON DELETE CASCADE;
ALTER TABLE "SpaTreatmentSkill" ADD CONSTRAINT "SpaTreatmentSkill_skill_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "SpaSkill"("id", "storeId") ON DELETE CASCADE;
ALTER TABLE "SpaStaffSkill" ADD CONSTRAINT "SpaStaffSkill_skill_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "SpaSkill"("id", "storeId") ON DELETE CASCADE;
