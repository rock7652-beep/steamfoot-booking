-- Apply after shared-add-on-items-candidate.sql, only where course tables exist.
-- This migration does not enable the feature or change course/tuition data.
BEGIN;
CREATE OR REPLACE FUNCTION service_addon_course_booking_delete_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "ServiceAddOnOrder" WHERE "storeId"=OLD."storeId"
  AND module IN ('FITNESS','MUSIC') AND "participantId"=OLD.id)
 THEN RAISE EXCEPTION 'Course booking has add-on history; cancel instead of deleting'; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS service_addon_course_booking_history ON "CourseBooking";
CREATE TRIGGER service_addon_course_booking_history BEFORE DELETE ON "CourseBooking"
 FOR EACH ROW EXECUTE FUNCTION service_addon_course_booking_delete_guard();
REVOKE ALL ON FUNCTION service_addon_course_booking_delete_guard() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
