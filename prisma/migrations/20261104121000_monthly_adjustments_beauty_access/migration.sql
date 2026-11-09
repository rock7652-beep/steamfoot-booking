-- Private payroll records: no Data API access, even when default grants exist.
REVOKE ALL ON "StaffMonthlyAdjustment", "StaffAdjustmentMonth" FROM PUBLIC;
DO $private$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE ALL ON "StaffMonthlyAdjustment", "StaffAdjustmentMonth" FROM %I',api_role);
    END IF;
  END LOOP;
END $private$;

-- The dedicated Beauty client reads its obligations and confirms/reopens its own
-- month; adjustment mutations still use the separately authorized shared action.
DO $beauty$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='steamfoot_beauty_prod_20261025') THEN
    GRANT SELECT ON "StaffMonthlyAdjustment" TO steamfoot_beauty_prod_20261025;
    GRANT SELECT, INSERT, UPDATE ON "StaffAdjustmentMonth" TO steamfoot_beauty_prod_20261025;
    CREATE POLICY monthly_adjustment_beauty_read ON "StaffMonthlyAdjustment"
      FOR SELECT TO steamfoot_beauty_prod_20261025
      USING ("technicianId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Store" s WHERE s.id="StaffMonthlyAdjustment"."storeId" AND s."industryModule"::text='BEAUTY'
      ));
    CREATE POLICY monthly_month_beauty_read ON "StaffAdjustmentMonth"
      FOR SELECT TO steamfoot_beauty_prod_20261025
      USING (EXISTS (SELECT 1 FROM "Store" s WHERE s.id="StaffAdjustmentMonth"."storeId" AND s."industryModule"::text='BEAUTY'));
    CREATE POLICY monthly_month_beauty_insert ON "StaffAdjustmentMonth"
      FOR INSERT TO steamfoot_beauty_prod_20261025
      WITH CHECK (EXISTS (SELECT 1 FROM "Store" s WHERE s.id="StaffAdjustmentMonth"."storeId" AND s."industryModule"::text='BEAUTY'));
    CREATE POLICY monthly_month_beauty_update ON "StaffAdjustmentMonth"
      FOR UPDATE TO steamfoot_beauty_prod_20261025
      USING (EXISTS (SELECT 1 FROM "Store" s WHERE s.id="StaffAdjustmentMonth"."storeId" AND s."industryModule"::text='BEAUTY'))
      WITH CHECK (EXISTS (SELECT 1 FROM "Store" s WHERE s.id="StaffAdjustmentMonth"."storeId" AND s."industryModule"::text='BEAUTY'));
  END IF;
END $beauty$;
