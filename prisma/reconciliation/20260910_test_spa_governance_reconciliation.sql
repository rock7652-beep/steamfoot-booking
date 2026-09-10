-- Test database reconciliation only.
--
-- Context: this database has the earlier, independent Spa* schema from
-- 20260828141500_add_spa_treatments_skills_availability, but that migration
-- file is not part of this branch. Do NOT add or edit rows in _prisma_migrations
-- from this script. Do NOT reset the database.
--
-- This script is intentionally additive and idempotent. It creates only the
-- module-governance objects this branch needs and verifies that the pre-existing
-- SPA core is independent of legacy Booking, Transaction, and Treatment tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IndustryModule') THEN
    CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT', 'SPA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoreModuleInstallationStatus') THEN
    CREATE TYPE "StoreModuleInstallationStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'FAILED');
  END IF;
END
$$;

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "industryModule" "IndustryModule" NOT NULL DEFAULT 'STEAMFOOT';

CREATE INDEX IF NOT EXISTS "Store_industryModule_idx" ON "Store"("industryModule");

CREATE TABLE IF NOT EXISTS "StoreModuleInstallation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "module" "IndustryModule" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "StoreModuleInstallationStatus" NOT NULL DEFAULT 'PROVISIONING',
  "failureCode" TEXT,
  "failureDetail" TEXT,
  "provisionedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreModuleInstallation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreModuleInstallation_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreModuleInstallation_storeId_key"
  ON "StoreModuleInstallation"("storeId");
CREATE INDEX IF NOT EXISTS "StoreModuleInstallation_module_status_idx"
  ON "StoreModuleInstallation"("module", "status");

-- Preserve every existing store. Steamfoot rows are treated as already active;
-- pre-existing SPA rows remain PROVISIONING until the idempotent SPA provisioner
-- has created its starter configuration and explicitly marks them ACTIVE.
INSERT INTO "StoreModuleInstallation" (
  "id", "storeId", "module", "version", "status", "provisionedAt", "updatedAt"
)
SELECT
  'store-module-' || s."id",
  s."id",
  s."industryModule",
  1,
  CASE WHEN s."industryModule" = 'SPA' THEN 'PROVISIONING'::"StoreModuleInstallationStatus"
       ELSE 'ACTIVE'::"StoreModuleInstallationStatus" END,
  CASE WHEN s."industryModule" = 'SPA' THEN NULL ELSE CURRENT_TIMESTAMP END,
  CURRENT_TIMESTAMP
FROM "Store" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StoreModuleInstallation" i WHERE i."storeId" = s."id"
);

-- The current branch's SPA client may use these tables, but never legacy
-- Booking, Transaction, or Treatment. Abort rather than silently accepting an
-- incompatible database.
DO $$
DECLARE
  required_table TEXT;
  legacy_target TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'SpaBooking', 'SpaBookingItem', 'SpaTreatment', 'SpaSkill',
    'SpaTreatmentSkill', 'SpaStaffSkill', 'SpaStaffAvailability',
    'SpaStaffAvailabilityException'
  ] LOOP
    IF to_regclass(format('%I.%I', current_schema(), required_table)) IS NULL THEN
      RAISE EXCEPTION 'Required independent SPA table % is missing', required_table;
    END IF;
  END LOOP;

  SELECT ccu.table_name INTO legacy_target
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.constraint_schema = current_schema()
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name LIKE 'Spa%'
    AND ccu.table_name IN ('Booking', 'Transaction', 'Treatment')
  LIMIT 1;

  IF legacy_target IS NOT NULL THEN
    RAISE EXCEPTION 'SPA schema incorrectly depends on legacy table %', legacy_target;
  END IF;
END
$$;
