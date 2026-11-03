-- Candidate only. Install after all three notification tables are reviewed.
-- No scheduling, runtime LOGIN grants, or application DELETE grants are installed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $migration$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN "publishedAt" timestamptz(3), ADD COLUMN "readAt" timestamptz(3), ADD COLUMN "readById" text, ADD COLUMN "readByName" text',t);
  -- One-time rollout grace approved for expired, recently updated unresolved notices.
  -- Future read/resolve operations never refresh publication time.
  EXECUTE format('UPDATE public.%I SET "publishedAt"=CASE WHEN "createdAt"<=statement_timestamp()-interval ''240 hours'' AND "updatedAt">statement_timestamp()-interval ''240 hours'' AND "handledAt" IS NULL THEN statement_timestamp() ELSE "createdAt" END,"readAt"="handledAt","readById"="handledById","readByName"="handledByName"',t);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN "publishedAt" SET DEFAULT now(), ALTER COLUMN "publishedAt" SET NOT NULL',t);
  EXECUTE format('CREATE INDEX %I ON public.%I ("storeId","publishedAt" DESC,id DESC)',t||'_storeId_publishedAt_id_idx',t);
  EXECUTE format('CREATE INDEX %I ON public.%I ("storeId","publishedAt" DESC) WHERE "readAt" IS NULL',t||'_unread_published_idx',t);
  EXECUTE format('CREATE INDEX %I ON public.%I ("publishedAt",id)',t||'_retention_idx',t);
 END LOOP;
END $migration$;

-- Ordinary business writers (Prisma, steam trigger and beauty SQL) all pass here.
-- Trigger UPDATE column list detects a new event even when its snapshot is identical.
CREATE FUNCTION public.publish_store_notice() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $fn$
BEGIN
 NEW."publishedAt"=statement_timestamp();
 NEW."readAt"=NEW."handledAt";
 NEW."readById"=NEW."handledById";
 NEW."readByName"=NEW."handledByName";
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.publish_store_notice() FROM PUBLIC;
CREATE TRIGGER steam_notice_publish BEFORE INSERT OR UPDATE OF kind,"customerName","serviceName","staffName","previousStaffName","startsAt","previousStartsAt","affectedCount",details
 ON public."SteamfootStoreNotice" FOR EACH ROW EXECUTE FUNCTION public.publish_store_notice();
CREATE TRIGGER course_notice_publish BEFORE INSERT OR UPDATE OF kind,"customerName","courseName","coachName","previousCoachName","startsAt","previousStartsAt","affectedCount",details
 ON public."CourseStoreNotice" FOR EACH ROW EXECUTE FUNCTION public.publish_store_notice();

-- Insert initializes independent read state; no expiry receipt or deletion capability.
CREATE FUNCTION public.publish_digital_notice() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $fn$
BEGIN
 NEW."publishedAt"=NEW."createdAt";
 NEW."readAt"=NEW."handledAt";
 NEW."readById"=NEW."handledById";
 NEW."readByName"=NEW."handledByName";
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.publish_digital_notice() FROM PUBLIC;
CREATE TRIGGER digital_notice_publish BEFORE INSERT ON public."DigitalManagerNotice" FOR EACH ROW EXECUTE FUNCTION public.publish_digital_notice();
CREATE INDEX "DigitalManagerNotice_display_order_idx" ON public."DigitalManagerNotice" ("storeId","publishedAt" DESC,('digital:'||id) DESC);
CREATE INDEX "CourseStoreNotice_beauty_published_idx" ON public."CourseStoreNotice" ("storeId","publishedAt" DESC,id DESC) WHERE "subjectKey" LIKE 'beauty:%';
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='steamfoot_beauty_prod_20261025') THEN
  GRANT UPDATE ("readAt","readById","readByName") ON public."DigitalManagerNotice" TO steamfoot_beauty_prod_20261025;
 END IF;
END $grants$;
DO $acl$
DECLARE grantee_name text; f text;
BEGIN
 FOREACH f IN ARRAY ARRAY['publish_store_notice','publish_digital_notice'] LOOP
  FOR grantee_name IN SELECT r.rolname FROM pg_roles r JOIN LATERAL aclexplode((SELECT proacl FROM pg_proc WHERE oid=format('public.%I()',f)::regprocedure)) a ON a.grantee=r.oid WHERE r.oid<>(SELECT proowner FROM pg_proc WHERE oid=format('public.%I()',f)::regprocedure) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM %I',f,grantee_name);
  END LOOP;
 END LOOP;
END $acl$;
COMMIT;
