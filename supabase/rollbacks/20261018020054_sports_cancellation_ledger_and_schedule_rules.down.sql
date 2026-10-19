-- Rehearsal rollback: only safe before any new-format ledger or metadata row.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog,public;
LOCK TABLE public."CoursePointEntry", public."SportsStagingSessionRule" IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE installed_fingerprint text; installed_marker text;
BEGIN
 SELECT obj_description('public."SportsStagingSessionRule"'::regclass,'pg_class') INTO installed_marker;
 SELECT md5(jsonb_build_object(
  'ledgerCheck', (SELECT jsonb_build_object('oid',oid,'definition',pg_get_constraintdef(oid),'validated',convalidated)
    FROM pg_constraint WHERE conrelid='public."CoursePointEntry"'::regclass AND conname='CoursePointEntry_values'),
  'metadata', jsonb_build_object('oid',c.oid,'owner',c.relowner,'kind',c.relkind,
    'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl),
  'columns', (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
    'type',a.atttypid,'typmod',a.atttypmod,'notNull',a.attnotnull,'identity',a.attidentity,
    'generated',a.attgenerated,'collation',a.attcollation,'dropped',a.attisdropped,
    'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=c.oid AND a.attnum>0),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
    'validated',k.convalidated) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
  'indexes', (SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),
    'valid',i.indisvalid,'ready',i.indisready) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),
  'triggers', (SELECT jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),
    'enabled',t.tgenabled) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid),
  'policies', (SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
    'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
    'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)
 )::text) INTO installed_fingerprint
 FROM pg_class c WHERE c.oid='public."SportsStagingSessionRule"'::regclass;
 IF installed_marker IS DISTINCT FROM ('sports-cancel-migration-rehearsal:v1:' || installed_fingerprint) THEN
  RAISE EXCEPTION 'Rollback schema/version drift; preserve current schema';
 END IF;
 IF EXISTS (SELECT 1 FROM public."CoursePointEntry" WHERE NOT (
 points > 0 AND (
 kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
 OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
 OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
 ))) THEN RAISE EXCEPTION 'New-format ledger rows exist; preserve history'; END IF;
 IF EXISTS (SELECT 1 FROM public."SportsStagingSessionRule") THEN RAISE EXCEPTION 'Metadata rows exist; preserve history'; END IF;
END $$;
DROP TABLE public."SportsStagingSessionRule";
ALTER TABLE public."CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE public."CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (
 points > 0 AND (
 kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
 OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
 OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
 ));
COMMIT;
