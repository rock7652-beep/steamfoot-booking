-- Append-only metadata; existing financial guards and original receipts remain untouched.
-- Apply only to the explicitly verified isolated Beauty database.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS "BeautyTransactionRevision" (
 "storeId" text NOT NULL,"transactionId" text NOT NULL,revision integer NOT NULL,
 note text NOT NULL,"revenueStaffId" text,"voidedAt" timestamptz(3),"voidReason" text,
 "actorUserId" text NOT NULL,"createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 PRIMARY KEY("storeId","transactionId",revision),CHECK(revision>0)
);
CREATE INDEX IF NOT EXISTS "BeautyTransactionRevision_storeId_voidedAt_idx" ON "BeautyTransactionRevision"("storeId","voidedAt");
CREATE OR REPLACE FUNCTION public.beauty_transaction_revision_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Beauty transaction revisions are immutable; append a revision'; END $$;
DROP TRIGGER IF EXISTS beauty_transaction_revision_immutable ON "BeautyTransactionRevision";
CREATE TRIGGER beauty_transaction_revision_immutable BEFORE UPDATE OR DELETE ON "BeautyTransactionRevision" FOR EACH ROW EXECUTE FUNCTION beauty_transaction_revision_immutable();
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conname='beauty_revision_store_fk' AND conrelid='public."BeautyTransactionRevision"'::regclass) THEN
  ALTER TABLE public."BeautyTransactionRevision" ADD CONSTRAINT beauty_revision_store_fk FOREIGN KEY("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
 END IF;
END $$;
ALTER TABLE "BeautyTransactionRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "BeautyTransactionRevision" FROM PUBLIC;
DO $$
DECLARE app_role text:=current_setting('beauty_migration.app_role',true);
BEGIN
 -- The isolated hosted Preview retains its existing postgres connection. Do not
 -- create an app role or grant browser access merely to install this table.
 IF app_role IS NULL
 AND current_setting('beauty_migration.connection_mode',true)='isolated-preview-legacy'
 AND current_user='postgres' AND current_database()='postgres' THEN RETURN; END IF;
 IF app_role IS NULL OR app_role IN ('anon','authenticated','service_role') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'Explicit existing backend app role required'; END IF;
 EXECUTE format('GRANT SELECT, INSERT ON "BeautyTransactionRevision" TO %I',app_role);
 IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND tablename='BeautyTransactionRevision' AND policyname='beauty_revision_read') THEN
  EXECUTE format('CREATE POLICY beauty_revision_read ON "BeautyTransactionRevision" FOR SELECT TO %I USING(true)',app_role);
  EXECUTE format('CREATE POLICY beauty_revision_insert ON "BeautyTransactionRevision" FOR INSERT TO %I WITH CHECK(true)',app_role);
 END IF;
END $$;
COMMIT;
