-- Final SPA cutover: the dedicated tables were populated by the preceding
-- migration and the application no longer reads these shared SPA fields.

-- Preserve the notification link before retiring shared SPA bookings.
UPDATE "MessageLog" m
SET "spaBookingId" = m."bookingId", "bookingId" = NULL
FROM "Booking" b
JOIN "Store" s ON s."id" = b."storeId" AND s."industryModule" = 'SPA'
WHERE m."bookingId" = b."id";

-- These tables were SPA-only despite living in the shared Prisma client.
DROP TABLE IF EXISTS "StoredValueLedgerEntry" CASCADE;
DROP TABLE IF EXISTS "StoredValueWallet" CASCADE;
DROP TABLE IF EXISTS "TreatmentSkill" CASCADE;
DROP TABLE IF EXISTS "StaffSkill" CASCADE;
DROP TABLE IF EXISTS "StaffWeeklyAvailability" CASCADE;
DROP TABLE IF EXISTS "StaffAvailabilityException" CASCADE;
DROP TABLE IF EXISTS "Treatment" CASCADE;
DROP TABLE IF EXISTS "ProfessionalSkill" CASCADE;

ALTER TABLE "Booking"
  DROP COLUMN IF EXISTS "treatmentId",
  DROP COLUMN IF EXISTS "treatmentNameSnapshot",
  DROP COLUMN IF EXISTS "treatmentVariantSnapshot",
  DROP COLUMN IF EXISTS "treatmentPriceSnapshot",
  DROP COLUMN IF EXISTS "treatmentServiceMinutesSnapshot",
  DROP COLUMN IF EXISTS "treatmentBufferMinutesSnapshot";

DROP TYPE IF EXISTS "StaffAvailabilityExceptionType";

-- Database-level module firewall. It remains active throughout and after the
-- cutover, so an application regression cannot write a row into the other
-- module's operational tables.
CREATE OR REPLACE FUNCTION "assert_store_module"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_module "IndustryModule" := TG_ARGV[0]::"IndustryModule";
  actual_module "IndustryModule";
BEGIN
  SELECT s."industryModule" INTO actual_module
  FROM public."Store" s
  WHERE s."id" = NEW."storeId";

  IF actual_module IS NULL THEN
    RAISE EXCEPTION 'MODULE_FIREWALL_STORE_NOT_FOUND:%', NEW."storeId" USING ERRCODE = '23503';
  END IF;
  IF actual_module <> expected_module THEN
    RAISE EXCEPTION 'MODULE_FIREWALL_EXPECTED_%_GOT_%', expected_module, actual_module USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Booking', 'ServicePlan', 'CustomerPlanWallet', 'Transaction'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS module_firewall ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER module_firewall BEFORE INSERT OR UPDATE OF "storeId" ON %I FOR EACH ROW EXECUTE FUNCTION "assert_store_module"(''STEAMFOOT'')',
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'SpaBooking', 'SpaBookingItem', 'SpaEntitlement', 'SpaEntitlementUse',
    'SpaPayment', 'SpaStoredValueWallet', 'SpaStoredValueEntry',
    'SpaTreatment', 'SpaSkill', 'SpaTreatmentSkill', 'SpaStaffSkill',
    'SpaStaffAvailability', 'SpaStaffAvailabilityException', 'SpaStaffCompensation'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS module_firewall ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER module_firewall BEFORE INSERT OR UPDATE OF "storeId" ON %I FOR EACH ROW EXECUTE FUNCTION "assert_store_module"(''SPA'')',
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION "assert_store_module"() FROM PUBLIC, anon, authenticated;
