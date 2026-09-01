-- SPA operational cutover. All additions/backfills are completed before any
-- legacy shared SPA columns are retired in the follow-up cleanup migration.

ALTER TYPE "SpaPaymentMethod" ADD VALUE IF NOT EXISTS 'STORED_VALUE';
ALTER TYPE "SpaPaymentMethod" ADD VALUE IF NOT EXISTS 'ENTITLEMENT';

DO $$ BEGIN
  CREATE TYPE "SpaStoredValueEntryType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SpaAvailabilityExceptionType" AS ENUM ('UNAVAILABLE', 'AVAILABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "partyGroupId" TEXT;
ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "guestIndex" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "refundOfPaymentId" TEXT;
ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "refundReason" TEXT;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "spaBookingId" TEXT;
CREATE INDEX IF NOT EXISTS "MessageLog_spaBookingId_idx" ON "MessageLog"("spaBookingId");

CREATE TABLE IF NOT EXISTS "SpaTreatment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "variantLabel" TEXT,
  "price" DECIMAL(10,0) NOT NULL,
  "serviceMinutes" INTEGER NOT NULL,
  "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
  "publicVisible" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaTreatment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaTreatment_price_minutes_check" CHECK ("price" >= 0 AND "serviceMinutes" > 0 AND "bufferMinutes" >= 0)
);

CREATE TABLE IF NOT EXISTS "SpaSkill" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SpaTreatmentSkill" (
  "storeId" TEXT NOT NULL,
  "treatmentId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  CONSTRAINT "SpaTreatmentSkill_pkey" PRIMARY KEY ("treatmentId", "skillId")
);

CREATE TABLE IF NOT EXISTS "SpaStaffSkill" (
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  CONSTRAINT "SpaStaffSkill_pkey" PRIMARY KEY ("staffId", "skillId")
);

CREATE TABLE IF NOT EXISTS "SpaStaffAvailability" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaStaffAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SpaStaffAvailabilityException" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" "SpaAvailabilityExceptionType" NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaStaffAvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SpaStaffCompensation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "value" DECIMAL(10,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaStaffCompensation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaStaffCompensation_mode_check" CHECK ("mode" IN ('PERCENTAGE', 'FIXED')),
  CONSTRAINT "SpaStaffCompensation_value_check" CHECK ("value" >= 0)
);

CREATE TABLE IF NOT EXISTS "SpaStoredValueWallet" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "balance" DECIMAL(10,0) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaStoredValueWallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaStoredValueWallet_balance_check" CHECK ("balance" >= 0)
);

CREATE TABLE IF NOT EXISTS "SpaStoredValueEntry" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "bookingId" TEXT,
  "paymentId" TEXT,
  "entryType" "SpaStoredValueEntryType" NOT NULL,
  "amount" DECIMAL(10,0) NOT NULL,
  "balanceAfter" DECIMAL(10,0) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaStoredValueEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaStoredValueEntry_balance_check" CHECK ("balanceAfter" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "SpaBooking_id_storeId_key" ON "SpaBooking"("id", "storeId");
CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_partyGroupId_idx" ON "SpaBooking"("storeId", "partyGroupId");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaTreatment_id_storeId_key" ON "SpaTreatment"("id", "storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaTreatment_storeId_name_variantLabel_key" ON "SpaTreatment"("storeId", "name", "variantLabel");
CREATE INDEX IF NOT EXISTS "SpaTreatment_storeId_publicVisible_isActive_sortOrder_idx" ON "SpaTreatment"("storeId", "publicVisible", "isActive", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaSkill_id_storeId_key" ON "SpaSkill"("id", "storeId");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaSkill_storeId_name_key" ON "SpaSkill"("storeId", "name");
CREATE INDEX IF NOT EXISTS "SpaSkill_storeId_isActive_sortOrder_idx" ON "SpaSkill"("storeId", "isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "SpaTreatmentSkill_storeId_skillId_idx" ON "SpaTreatmentSkill"("storeId", "skillId");
CREATE INDEX IF NOT EXISTS "SpaStaffSkill_storeId_skillId_idx" ON "SpaStaffSkill"("storeId", "skillId");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaStaffAvailability_storeId_staffId_dayOfWeek_key" ON "SpaStaffAvailability"("storeId", "staffId", "dayOfWeek");
CREATE INDEX IF NOT EXISTS "SpaStaffAvailability_storeId_staffId_isActive_idx" ON "SpaStaffAvailability"("storeId", "staffId", "isActive");
CREATE INDEX IF NOT EXISTS "SpaStaffAvailabilityException_storeId_staffId_date_idx" ON "SpaStaffAvailabilityException"("storeId", "staffId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaStaffCompensation_staffId_key" ON "SpaStaffCompensation"("staffId");
CREATE INDEX IF NOT EXISTS "SpaStaffCompensation_storeId_isActive_idx" ON "SpaStaffCompensation"("storeId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueWallet_storeId_customerId_key" ON "SpaStoredValueWallet"("storeId", "customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueWallet_id_storeId_key" ON "SpaStoredValueWallet"("id", "storeId");
CREATE INDEX IF NOT EXISTS "SpaStoredValueWallet_storeId_status_idx" ON "SpaStoredValueWallet"("storeId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueEntry_storeId_bookingId_entryType_key" ON "SpaStoredValueEntry"("storeId", "bookingId", "entryType");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueEntry_storeId_paymentId_entryType_key" ON "SpaStoredValueEntry"("storeId", "paymentId", "entryType");
CREATE INDEX IF NOT EXISTS "SpaStoredValueEntry_storeId_customerId_createdAt_idx" ON "SpaStoredValueEntry"("storeId", "customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "SpaStoredValueEntry_walletId_createdAt_idx" ON "SpaStoredValueEntry"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "SpaPayment_refundOfPaymentId_idx" ON "SpaPayment"("refundOfPaymentId");

ALTER TABLE "SpaTreatmentSkill" ADD CONSTRAINT "SpaTreatmentSkill_treatmentId_storeId_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "SpaTreatment"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaTreatmentSkill" ADD CONSTRAINT "SpaTreatmentSkill_skillId_storeId_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "SpaSkill"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaStaffSkill" ADD CONSTRAINT "SpaStaffSkill_skillId_storeId_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "SpaSkill"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_walletId_storeId_fkey" FOREIGN KEY ("walletId", "storeId") REFERENCES "SpaStoredValueWallet"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_paymentId_storeId_fkey" FOREIGN KEY ("paymentId", "storeId") REFERENCES "SpaPayment"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaPayment" ADD CONSTRAINT "SpaPayment_refundOfPaymentId_fkey" FOREIGN KEY ("refundOfPaymentId") REFERENCES "SpaPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Copy catalog and staff configuration only for stores explicitly marked SPA.
INSERT INTO "SpaTreatment" ("id", "storeId", "name", "variantLabel", "price", "serviceMinutes", "bufferMinutes", "publicVisible", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT t."id", t."storeId", t."name", t."variantLabel", t."price", t."serviceMinutes", t."bufferMinutes", t."publicVisible", t."isActive", t."sortOrder", t."createdAt", t."updatedAt"
FROM "Treatment" t JOIN "Store" s ON s."id" = t."storeId" AND s."industryModule" = 'SPA'
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "SpaBookingItem" DROP CONSTRAINT IF EXISTS "SpaBookingItem_treatmentId_storeId_fkey";
ALTER TABLE "SpaBookingItem" ADD CONSTRAINT "SpaBookingItem_treatmentId_storeId_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "SpaTreatment"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SpaSkill" ("id", "storeId", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT p."id", p."storeId", p."name", p."isActive", p."sortOrder", p."createdAt", p."updatedAt"
FROM "ProfessionalSkill" p JOIN "Store" s ON s."id" = p."storeId" AND s."industryModule" = 'SPA'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "SpaTreatmentSkill" ("storeId", "treatmentId", "skillId")
SELECT x."storeId", x."treatmentId", x."skillId" FROM "TreatmentSkill" x
JOIN "Store" s ON s."id" = x."storeId" AND s."industryModule" = 'SPA'
ON CONFLICT DO NOTHING;

INSERT INTO "SpaStaffSkill" ("storeId", "staffId", "skillId")
SELECT x."storeId", x."staffId", x."skillId" FROM "StaffSkill" x
JOIN "Store" s ON s."id" = x."storeId" AND s."industryModule" = 'SPA'
ON CONFLICT DO NOTHING;

INSERT INTO "SpaStaffAvailability" ("id", "storeId", "staffId", "dayOfWeek", "startTime", "endTime", "isActive", "createdAt", "updatedAt")
SELECT x."id", x."storeId", x."staffId", x."dayOfWeek", x."startTime", x."endTime", x."isActive", x."createdAt", x."updatedAt"
FROM "StaffWeeklyAvailability" x JOIN "Store" s ON s."id" = x."storeId" AND s."industryModule" = 'SPA'
ON CONFLICT DO NOTHING;

INSERT INTO "SpaStaffAvailabilityException" ("id", "storeId", "staffId", "date", "type", "startTime", "endTime", "reason", "createdAt", "updatedAt")
SELECT x."id", x."storeId", x."staffId", x."date", x."type"::text::"SpaAvailabilityExceptionType", x."startTime", x."endTime", x."reason", x."createdAt", x."updatedAt"
FROM "StaffAvailabilityException" x JOIN "Store" s ON s."id" = x."storeId" AND s."industryModule" = 'SPA'
ON CONFLICT DO NOTHING;

-- Booking/payment/wallet backfill intentionally scopes to SPA stores only.
INSERT INTO "SpaBooking" ("id", "storeId", "customerId", "serviceStaffId", "revenueStaffId", "bookingDate", "startTime", "endTime", "status", "people", "serviceNameSnapshot", "totalPriceSnapshot", "requestKey", "partyGroupId", "guestIndex", "notes", "checkedInAt", "completedAt", "cancelledAt", "createdAt", "updatedAt")
SELECT b."id", b."storeId", b."customerId", b."serviceStaffId", b."revenueStaffId", b."bookingDate", b."slotTime",
       to_char((b."slotTime"::time + make_interval(mins => coalesce(b."treatmentServiceMinutesSnapshot", 60) + coalesce(b."treatmentBufferMinutesSnapshot", 0)))::time, 'HH24:MI'),
       CASE b."bookingStatus"::text WHEN 'PENDING' THEN 'PENDING' WHEN 'CONFIRMED' THEN 'CONFIRMED' WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'NO_SHOW' THEN 'NO_SHOW' ELSE 'PENDING' END::"SpaBookingStatus",
       b."people", coalesce(b."treatmentNameSnapshot", p."name", 'SPA 服務'), coalesce(b."treatmentPriceSnapshot", p."price", b."expectedAmount", 0),
       b."id", regexp_replace(b."id", '-guest-[0-9]+$', ''), coalesce(nullif(substring(b."id" from 'guest-([0-9]+)$'), '')::int, 1), b."notes",
       CASE WHEN b."isCheckedIn" THEN b."updatedAt" ELSE NULL END,
       CASE WHEN b."bookingStatus"::text = 'COMPLETED' THEN b."updatedAt" ELSE NULL END,
       CASE WHEN b."bookingStatus"::text = 'CANCELLED' THEN coalesce(b."customerCancelledAt", b."updatedAt") ELSE NULL END,
       b."createdAt", b."updatedAt"
FROM "Booking" b
JOIN "Store" s ON s."id" = b."storeId" AND s."industryModule" = 'SPA'
LEFT JOIN "ServicePlan" p ON p."id" = b."servicePlanId"
WHERE b."serviceStaffId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "SpaBookingItem" ("id", "storeId", "bookingId", "treatmentId", "treatmentNameSnapshot", "variantSnapshot", "priceSnapshot", "serviceMinutes", "bufferMinutes", "sortOrder", "createdAt")
SELECT b."id" || '-item-1', b."storeId", b."id", b."treatmentId", coalesce(b."treatmentNameSnapshot", t."name"), b."treatmentVariantSnapshot", coalesce(b."treatmentPriceSnapshot", t."price", 0), coalesce(b."treatmentServiceMinutesSnapshot", t."serviceMinutes", 60), coalesce(b."treatmentBufferMinutesSnapshot", t."bufferMinutes", 0), 0, b."createdAt"
FROM "Booking" b JOIN "Store" s ON s."id" = b."storeId" AND s."industryModule" = 'SPA'
JOIN "SpaTreatment" t ON t."id" = b."treatmentId" AND t."storeId" = b."storeId"
JOIN "SpaBooking" sb ON sb."id" = b."id" AND sb."storeId" = b."storeId"
ON CONFLICT DO NOTHING;

INSERT INTO "SpaEntitlement" ("id", "storeId", "customerId", "treatmentId", "nameSnapshot", "purchasedPrice", "totalUses", "remainingUses", "startDate", "expiryDate", "status", "sourceReference", "createdAt", "updatedAt")
SELECT w."id", w."storeId", w."customerId", NULL, p."name", w."purchasedPrice", w."totalSessions", w."remainingSessions", w."startDate", w."expiryDate",
       CASE w."status"::text WHEN 'ACTIVE' THEN 'ACTIVE' WHEN 'USED_UP' THEN 'EXHAUSTED' WHEN 'EXPIRED' THEN 'EXPIRED' ELSE 'VOIDED' END::"SpaEntitlementStatus",
       w."id", w."createdAt", w."updatedAt"
FROM "CustomerPlanWallet" w JOIN "Store" s ON s."id" = w."storeId" AND s."industryModule" = 'SPA'
JOIN "ServicePlan" p ON p."id" = w."planId"
ON CONFLICT ("id") DO NOTHING;

DO $$ BEGIN
  IF to_regclass('public."StoredValueWallet"') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO "SpaStoredValueWallet" ("id", "storeId", "customerId", "balance", "status", "createdAt", "updatedAt")
      SELECT w."id", w."storeId", w."customerId", w."balance", w."status", w."createdAt", w."updatedAt"
      FROM "StoredValueWallet" w JOIN "Store" s ON s."id" = w."storeId" AND s."industryModule" = 'SPA'
      ON CONFLICT ("id") DO NOTHING
    $sql$;
  END IF;
END $$;

-- SPA business tables are server-only. RLS is defense in depth and Data API
-- roles receive no grants.
ALTER TABLE "SpaTreatment" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaTreatment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaSkill" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaSkill" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaTreatmentSkill" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaTreatmentSkill" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffSkill" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaStaffSkill" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffAvailability" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaStaffAvailability" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffAvailabilityException" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaStaffAvailabilityException" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffCompensation" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaStaffCompensation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaStoredValueWallet" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaStoredValueWallet" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaStoredValueEntry" ENABLE ROW LEVEL SECURITY; ALTER TABLE "SpaStoredValueEntry" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SpaTreatment", "SpaSkill", "SpaTreatmentSkill", "SpaStaffSkill", "SpaStaffAvailability", "SpaStaffAvailabilityException", "SpaStaffCompensation", "SpaStoredValueWallet", "SpaStoredValueEntry" FROM anon, authenticated;
