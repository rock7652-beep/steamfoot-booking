-- REVIEW CANDIDATE ONLY. Not discovered by Prisma/Supabase automatic migration runners.
-- Apply only after explicit approval of this single file. No test data is copied.
-- Operator must SET sports_migration.app_role to the actual server LOGIN role
-- in this same connection before BEGIN. Never put a password in this setting.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public."SportsScheduleSeries" (
 id text PRIMARY KEY,
 "storeId" text NOT NULL REFERENCES public."Store"(id) ON DELETE RESTRICT,
 "requestKey" text NOT NULL,
 "templateId" text NOT NULL,
 "nameSnapshot" text NOT NULL,
 "roomId" text NOT NULL,
 "coachId" text NOT NULL,
 "startsAt" timestamptz NOT NULL,
 "endsAt" timestamptz NOT NULL,
 "pointCost" integer NOT NULL,
 capacity integer NOT NULL,
 frequency text NOT NULL,
 "untilDate" date,
 "generatedThrough" date NOT NULL,
 "excludedDates" text[] NOT NULL DEFAULT ARRAY[]::text[],
 "generationError" text,
 "cancelledAt" timestamptz,
 "createdById" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "enrollmentMode" text NOT NULL DEFAULT 'OPEN',
 "learnerSnapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
 CONSTRAINT "SportsScheduleSeries_time_check" CHECK ("endsAt" > "startsAt"),
 CONSTRAINT "SportsScheduleSeries_frequency_check" CHECK (frequency IN ('WEEKLY','BIWEEKLY')),
 CONSTRAINT "SportsScheduleSeries_enrollment_check" CHECK ("enrollmentMode" IN ('OPEN','ASSIGNED')),
 CONSTRAINT "SportsScheduleSeries_learners_check" CHECK (jsonb_typeof("learnerSnapshot")='array'),
 CONSTRAINT "SportsScheduleSeries_capacity_check" CHECK (capacity > 0 AND "pointCost" > 0),
 CONSTRAINT "SportsScheduleSeries_store_request_key" UNIQUE ("storeId","requestKey")
);
CREATE INDEX "SportsScheduleSeries_store_active_start" ON public."SportsScheduleSeries" ("storeId","cancelledAt","startsAt");
CREATE INDEX "SportsScheduleSeries_store_room_start" ON public."SportsScheduleSeries" ("storeId","roomId","startsAt");
CREATE INDEX "SportsScheduleSeries_store_coach_start" ON public."SportsScheduleSeries" ("storeId","coachId","startsAt");
ALTER TABLE public."SportsScheduleSeries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SportsScheduleSeries" FROM PUBLIC, anon, authenticated, service_role;
DO $grant$
DECLARE app_role text := current_setting('sports_migration.app_role',true);
BEGIN
 IF app_role IS NULL OR app_role='' OR app_role IN ('anon','authenticated','service_role','PUBLIC')
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname=app_role AND rolcanlogin)
    OR pg_has_role('anon',app_role,'MEMBER') OR pg_has_role('authenticated',app_role,'MEMBER') THEN
  RAISE EXCEPTION 'Specify the verified server LOGIN role via sports_migration.app_role; browser roles are forbidden';
 END IF;
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',app_role);
 EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public."SportsScheduleSeries" TO %I',app_role);
 -- Only the trusted application LOGIN may access rows. Application store/actor
 -- authorization remains mandatory; no browser/Data API policy is installed.
 EXECUTE format('CREATE POLICY sports_series_app_select ON public."SportsScheduleSeries" FOR SELECT TO %I USING (true)',app_role);
 EXECUTE format('CREATE POLICY sports_series_app_insert ON public."SportsScheduleSeries" FOR INSERT TO %I WITH CHECK (true)',app_role);
 EXECUTE format('CREATE POLICY sports_series_app_update ON public."SportsScheduleSeries" FOR UPDATE TO %I USING (true) WITH CHECK (true)',app_role);
END $grant$;
-- Bind the exact installed version, defaults, constraints, indexes, policies and ACL.
DO $version$
DECLARE fingerprint text;
BEGIN
 SELECT md5(jsonb_build_object(
 'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'valid',k.convalidated) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)
)::text) INTO STRICT fingerprint FROM pg_class c
 WHERE c.oid='public."SportsScheduleSeries"'::regclass;
 EXECUTE format('COMMENT ON TABLE public."SportsScheduleSeries" IS %L','sports-permanent-series:v1:' || fingerprint);
END $version$;
COMMIT;
