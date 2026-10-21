-- READ ONLY. Management inspection role is NOT proof of application role.
-- Set beauty_runtime.role_name on this same session; never include credentials.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog;
WITH chosen AS (SELECT * FROM pg_roles WHERE rolname=current_setting('beauty_runtime.role_name',true))
SELECT jsonb_build_object(
 'database',current_database(),'inspectionRole',current_user,
 'readOnly',current_setting('transaction_read_only'),
 'proposedRole',(SELECT jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'superuser',rolsuper,'bypassRls',rolbypassrls,'createDb',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication) FROM chosen),
 'memberships',(SELECT coalesce(jsonb_agg(r.rolname),'[]'::jsonb) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN chosen a ON a.oid=m.member),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname),'[]'::jsonb) FROM pg_policies p CROSS JOIN chosen a WHERE p.schemaname='public' AND a.rolname=ANY(p.roles)),
 'publicTablePrivileges',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'select',has_table_privilege(a.oid,c.oid,'SELECT'),'insert',has_table_privilege(a.oid,c.oid,'INSERT'),'update',has_table_privilege(a.oid,c.oid,'UPDATE'),'delete',has_table_privilege(a.oid,c.oid,'DELETE'),'truncate',has_table_privilege(a.oid,c.oid,'TRUNCATE')) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN chosen a WHERE n.nspname='public' AND c.relkind IN ('r','p'))
) AS evidence;
ROLLBACK;
