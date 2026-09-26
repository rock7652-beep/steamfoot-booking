CREATE TABLE "CourseStaffAvailability" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "segments" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseStaffAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseStaffAvailability_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6)
);

CREATE TABLE "CourseStaffAvailabilityException" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" TEXT NOT NULL,
  "segments" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseStaffAvailabilityException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseStaffAvailabilityException_type_check" CHECK ("type" IN ('UNAVAILABLE','CUSTOM'))
);

CREATE UNIQUE INDEX "CourseStaffAvailability_storeId_staffId_dayOfWeek_key"
ON "CourseStaffAvailability"("storeId","staffId","dayOfWeek");
CREATE INDEX "CourseStaffAvailability_storeId_dayOfWeek_idx"
ON "CourseStaffAvailability"("storeId","dayOfWeek");
CREATE INDEX "CourseStaffAvailability_staffId_idx"
ON "CourseStaffAvailability"("staffId");

CREATE UNIQUE INDEX "CourseStaffAvailabilityException_storeId_staffId_date_key"
ON "CourseStaffAvailabilityException"("storeId","staffId","date");
CREATE INDEX "CourseStaffAvailabilityException_storeId_date_idx"
ON "CourseStaffAvailabilityException"("storeId","date");
CREATE INDEX "CourseStaffAvailabilityException_staffId_date_idx"
ON "CourseStaffAvailabilityException"("staffId","date");

ALTER TABLE "CourseStaffAvailability"
ADD CONSTRAINT "CourseStaffAvailability_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseStaffAvailability"
ADD CONSTRAINT "CourseStaffAvailability_staffId_storeId_fkey"
FOREIGN KEY ("staffId","storeId") REFERENCES "Staff"("id","storeId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseStaffAvailabilityException"
ADD CONSTRAINT "CourseStaffAvailabilityException_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseStaffAvailabilityException"
ADD CONSTRAINT "CourseStaffAvailabilityException_staffId_storeId_fkey"
FOREIGN KEY ("staffId","storeId") REFERENCES "Staff"("id","storeId") ON DELETE CASCADE ON UPDATE CASCADE;
