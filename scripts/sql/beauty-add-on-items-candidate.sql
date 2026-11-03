-- Candidate only: apply after independent migration authorization.
BEGIN;
ALTER TABLE "BeautyService" ADD COLUMN IF NOT EXISTS "addOnGroups" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "BeautyAppointment" ADD COLUMN IF NOT EXISTS "addOnItems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "BeautyAppointment" ADD COLUMN IF NOT EXISTS "baseServiceDuration" INTEGER;
ALTER TABLE "BeautyAppointment" ADD COLUMN IF NOT EXISTS "serviceImageId" TEXT;
ALTER TABLE "BeautyService" ADD COLUMN IF NOT EXISTS "imageId" TEXT;
CREATE TABLE IF NOT EXISTS "BeautyServiceImage" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, content BYTEA NOT NULL, thumbnail BYTEA NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "BeautyServiceImage_storeId_idx" ON "BeautyServiceImage"("storeId");
DO $$
DECLARE app_role text := current_setting('beauty_migration.app_role',true);
BEGIN
 IF app_role IS NULL OR app_role IN ('anon','authenticated','service_role') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
  RAISE EXCEPTION 'Set beauty_migration.app_role to a confirmed restricted backend LOGIN role';
 END IF;
 IF pg_has_role(app_role,current_user,'MEMBER') OR EXISTS(SELECT FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb) AND pg_has_role(app_role,r.oid,'MEMBER')) THEN RAISE EXCEPTION 'Backend role must not inherit elevated privileges'; END IF;
 ALTER TABLE "BeautyServiceImage" ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON "BeautyServiceImage" FROM PUBLIC,anon,authenticated,service_role;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON "BeautyServiceImage" TO %I',app_role);
 IF NOT EXISTS(SELECT FROM pg_policies WHERE tablename='BeautyServiceImage' AND policyname='beauty_backend') THEN
  EXECUTE format('CREATE POLICY beauty_backend ON "BeautyServiceImage" FOR ALL TO %I USING (true) WITH CHECK (true)',app_role);
 END IF;
END $$;
COMMIT;
