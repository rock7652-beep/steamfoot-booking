-- REVIEW ONLY. Optional, explicit store/staff allowlist. Never infers plans.edit.
-- Operator must supply a TEMP table in the SAME connection after approval:
-- CREATE TEMP TABLE addons_permission_approval("storeId" text NOT NULL,"staffId" text PRIMARY KEY) ON COMMIT PRESERVE ROWS;
-- Empty allowlist is an explicit no-op. Existing grants and denials are retained.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_setting('addons_release.review_id',true) IS DISTINCT FROM 'addons-release-v1'
 OR current_setting('addons_release.expected_database',true) IS DISTINCT FROM current_database()
 THEN RAISE EXCEPTION 'Reviewed add-ons database marker required'; END IF;
 IF to_regclass('pg_temp.addons_permission_approval') IS NULL
 THEN RAISE EXCEPTION 'Explicit temporary staff approval list required'; END IF;
 -- Block concurrent staff reassignment until this narrow initialization commits.
 LOCK TABLE public."Staff" IN SHARE MODE;
 IF EXISTS(SELECT FROM pg_temp.addons_permission_approval a LEFT JOIN public."Staff" s ON s.id=a."staffId" AND s."storeId"=a."storeId" AND s.status::text='ACTIVE' WHERE s.id IS NULL)
 THEN RAISE EXCEPTION 'Approved staff must be active and belong to the approved store'; END IF;
END $$;
INSERT INTO public."StaffPermission"(id,"staffId",permission,granted)
SELECT gen_random_uuid()::text,a."staffId",'add_ons.manage',true
FROM pg_temp.addons_permission_approval a
JOIN public."Staff" s ON s.id=a."staffId" AND s."storeId"=a."storeId" AND s.status::text='ACTIVE'
ON CONFLICT("staffId",permission) DO NOTHING;
COMMIT;
