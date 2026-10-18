-- Registered for review only; execution requires separate authorization.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog,public;
LOCK TABLE public."CoursePointEntry" IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE old_check text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO old_check FROM pg_constraint
 WHERE conrelid='public."CoursePointEntry"'::regclass AND conname='CoursePointEntry_values' AND convalidated;
 IF old_check IS NULL OR md5(old_check)<>'acff8c4c1a3c1701a7415f896b058364' THEN RAISE EXCEPTION 'Ledger constraint drift; stop migration'; END IF;
 IF to_regclass('public."SportsStagingSessionRule"') IS NOT NULL THEN RAISE EXCEPTION 'Metadata already exists; stop migration'; END IF;
 ALTER TABLE public."CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
 EXECUTE format('ALTER TABLE public."CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK ((%s) OR (points > 0 AND (kind ~ %L OR kind ~ %L)))',
 old_check,'^CORRECT:(RESERVED|ATTENDED|NO_SHOW|CANCELLED):CANCELLED:[0-9a-f-]{36}$','^CANCEL_SOURCE:[^[:cntrl:]]+$');
END $$;
-- Test station only. Installed by the guarded seed script, never ci-migrate.
CREATE TABLE public."SportsStagingSessionRule" (
 "sessionId" text PRIMARY KEY,
 "storeId" text NOT NULL,
 frequency text NOT NULL CHECK (frequency IN ('SINGLE','WEEKLY','BIWEEKLY')),
 enrollment text NOT NULL CHECK (enrollment IN ('ASSIGNED','OPEN')),
 "planId" text,
 "trialPrice" integer NOT NULL CHECK ("trialPrice">=0),
 payload jsonb NOT NULL,
 FOREIGN KEY ("sessionId","storeId") REFERENCES public."CourseSession"(id,"storeId") ON DELETE CASCADE,
 FOREIGN KEY ("planId","storeId") REFERENCES public."CoursePointPlan"(id,"storeId")
);
CREATE INDEX "SportsStagingSessionRule_store" ON public."SportsStagingSessionRule"("storeId");
ALTER TABLE public."SportsStagingSessionRule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SportsStagingSessionRule" FROM PUBLIC, anon, authenticated;

-- Installation identity + schema fingerprint; no row/statistics fields are hashed.
DO $$
DECLARE installed_fingerprint text;
BEGIN
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
 EXECUTE format('COMMENT ON TABLE public."SportsStagingSessionRule" IS %L',
  'sports-cancel-migration-rehearsal:v1:' || installed_fingerprint);
END $$;
COMMIT;
