-- SPA application cutover: the dedicated tables were populated by the
-- preceding migration. Legacy shared objects intentionally remain during the
-- compatibility window. Their removal must ship in a later, standalone
-- migration only after the new application has been deployed and all three
-- Steamfoot stores have passed production verification.

-- Preserve the notification link before switching SPA reads.
UPDATE "MessageLog" m
SET "spaBookingId" = m."bookingId", "bookingId" = NULL
FROM "Booking" b
JOIN "Store" s ON s."id" = b."storeId" AND s."industryModule" = 'SPA'
WHERE m."bookingId" = b."id";

-- Do not remove the legacy tables, Booking columns, or enum here. Deploy the
-- application cutover first, observe production, then retire them separately.

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
