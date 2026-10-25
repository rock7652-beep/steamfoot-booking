-- REVIEW ONLY. Not executed. Metadata only; no DDL, business data or migration writes.
-- Resolve project/deployment and the explicit store outside SQL before running.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_database() AS database_name, current_user AS database_role,
       current_setting('transaction_read_only') AS read_only;

WITH required(name) AS (VALUES
 ('BeautyAppointment'), ('BeautyCard'), ('BeautyCommand'), ('BeautyEvent'),
 ('BeautyGroup'), ('BeautyLedger'), ('BeautyPayment'), ('BeautyPlan'),
 ('BeautyPurchase'), ('BeautyService'), ('BeautySetting'), ('BeautySettlement'),
 ('BeautyTechnician'), ('BeautyTransactionRevision'))
SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS present
FROM required ORDER BY name;

WITH required(table_name, column_name, expected_type) AS (VALUES
 ('BeautyService','singleChargeName','text'),
 ('BeautyService','singlePriceConfigured','boolean'),
 ('BeautyService','chargeTechnicianRule','jsonb'),
 ('BeautyPlan','chargeTechnicianRule','jsonb'),
 ('BeautyCard','chargeRuleSnapshot','jsonb'),
 ('BeautyAppointment','chargeRuleSnapshot','jsonb'))
SELECT r.*, c.data_type AS actual_type, c.is_nullable, c.column_default,
       CASE WHEN c.column_name IS NULL THEN 'ABSENT'
            WHEN c.data_type = r.expected_type AND c.is_nullable = 'YES'
                 AND c.column_default IS NULL THEN 'PRESENT_REQUIRES_REVIEW'
            ELSE 'DRIFT_STOP' END AS review_state
FROM required r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
ORDER BY r.table_name,r.column_name;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'Beauty%' AND c.relkind='r'
ORDER BY c.relname;

SELECT tablename, policyname, roles, cmd
FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename LIKE 'Beauty%'
ORDER BY tablename,policyname;
ROLLBACK;
