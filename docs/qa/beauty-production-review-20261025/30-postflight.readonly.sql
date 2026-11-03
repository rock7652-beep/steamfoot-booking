-- Metadata only. Run on the separately verified project/connection; no credentials or customer rows.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL search_path=pg_catalog;
WITH chosen AS (SELECT * FROM pg_roles WHERE rolname=current_setting('beauty_release.runtime_role',true))
SELECT jsonb_build_object(
 'database',current_database(),
 'runtimeRole',(SELECT jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication) FROM chosen),
 'memberships',(SELECT count(*) FROM pg_auth_members m JOIN chosen a ON a.oid=m.member),
 'beautyTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Beauty%' AND c.relkind='r'),
 'beautyRlsTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Beauty%' AND c.relkind='r' AND c.relrowsecurity),
 'unsafeTablePrivileges',(SELECT coalesce(jsonb_agg(c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN chosen a WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(a.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES')),
 'passwordHashReadable',(SELECT has_column_privilege(a.oid,'public."User"','passwordHash','SELECT') FROM chosen a),
 'runtimeOwnsSchema',(SELECT count(*) FROM pg_namespace n JOIN chosen a ON a.oid=n.nspowner WHERE n.nspname='public'),
 'runtimeOwnsTables',(SELECT count(*) FROM pg_class c JOIN chosen a ON a.oid=c.relowner WHERE c.relnamespace='public'::regnamespace),
 'policies',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'roles',roles,'kind',permissive,'command',cmd) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'beauty_release_v1_%')
) AS release_postflight;

WITH required(table_name,column_name,data_type) AS (VALUES
 ('BeautyService','singleChargeName','text'),('BeautyService','singlePriceConfigured','boolean'),
 ('BeautyService','chargeTechnicianRule','jsonb'),('BeautyPlan','chargeTechnicianRule','jsonb'),
 ('BeautyCard','chargeRuleSnapshot','jsonb'),('BeautyAppointment','chargeRuleSnapshot','jsonb'))
SELECT r.*,c.data_type AS actual_type,c.is_nullable,c.column_default,
       c.data_type=r.data_type AND c.is_nullable='YES' AND c.column_default IS NULL AS matches
FROM required r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
ORDER BY r.table_name,r.column_name;
ROLLBACK;
