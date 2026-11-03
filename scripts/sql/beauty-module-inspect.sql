-- READ ONLY evidence collection, NOT an installer and NOT proof of activation.
-- Supply the proposed backend role using beauty_migration.app_role on this
-- direct session. Do not put credentials or customer data in the saved output.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT 'environment' AS section, jsonb_build_object(
 'database',current_database(),'serverVersion',current_setting('server_version'),
 'migrationRole',current_user,'searchPath',current_setting('search_path'),
 'proposedBackend',current_setting('beauty_migration.app_role',true)) AS evidence;
SELECT 'extension' AS section, jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) AS evidence
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist';
SELECT 'sharedTables' AS section, jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) AS evidence
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('Store','Customer','User','CourseRoom','CashbookEntry','CashDrawerSession') ORDER BY c.relname;
SELECT 'sharedColumns' AS section, jsonb_build_object('table',table_name,'column',column_name,'type',udt_name,'nullable',is_nullable) AS evidence
 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('Store','Customer','User','CourseRoom','CashbookEntry','CashDrawerSession') ORDER BY table_name,ordinal_position;
SELECT 'sharedKeys' AS section, jsonb_build_object('table',tablename,'index',indexname,'definition',indexdef) AS evidence
 FROM pg_indexes WHERE schemaname='public' AND tablename IN ('Store','Customer','CourseRoom') ORDER BY tablename,indexname;
SELECT 'industryEnum' AS section, jsonb_build_object('label',e.enumlabel,'order',e.enumsortorder) AS evidence
 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname='public' AND t.typname='IndustryModule' ORDER BY e.enumsortorder;
SELECT 'roles' AS section, jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb) AS evidence
 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role',current_setting('beauty_migration.app_role',true)) ORDER BY rolname;
SELECT 'backendMemberships' AS section, jsonb_build_object('role',r.rolname,'member',pg_has_role(a.oid,r.oid,'MEMBER'),'privileged',r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb) AS evidence
 FROM pg_roles a CROSS JOIN pg_roles r WHERE a.rolname=current_setting('beauty_migration.app_role',true) AND pg_has_role(a.oid,r.oid,'MEMBER') ORDER BY r.rolname;
SELECT 'beautyObjects' AS section, jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'acl',c.relacl) AS evidence
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Beauty%' ORDER BY c.relname;
SELECT 'beautyPolicies' AS section, to_jsonb(p) AS evidence FROM pg_policies p WHERE schemaname='public' AND tablename LIKE 'Beauty%' ORDER BY tablename,policyname;
SELECT 'beautyConstraints' AS section, jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) AS evidence
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname LIKE 'Beauty%' ORDER BY c.relname,k.conname;
SELECT 'beautyTriggers' AS section, jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) AS evidence
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname LIKE 'Beauty%' ORDER BY c.relname,t.tgname;
SELECT 'beautyFunctions' AS section, jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl) AS evidence
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='beauty_immutable_ledger';
ROLLBACK;
