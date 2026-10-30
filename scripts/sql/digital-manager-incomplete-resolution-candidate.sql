-- Isolated candidate: resolve only the changed store's already-created reminders.
CREATE OR REPLACE FUNCTION public.resolve_steamfoot_incomplete_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
DECLARE actor jsonb;
BEGIN
 IF NEW."bookingStatus"::text NOT IN ('PENDING','CONFIRMED') OR ROW(NEW."bookingDate",NEW."slotTime") IS DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime") THEN
  actor:=nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
  UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"=coalesce(actor->>'id','system'),"handledByName"=coalesce(actor->>'name','系統'),revision=revision+1,"updatedAt"=now()
  WHERE "storeId"=NEW."storeId" AND "targetId"=NEW.id AND "eventType"='INCOMPLETE_SERVICE_REMINDER' AND "eventKey" LIKE 'incomplete-service-reminder:%' AND "handledAt" IS NULL;
 END IF;
 RETURN NEW;
END;
$notice$;
CREATE OR REPLACE FUNCTION public.resolve_course_incomplete_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
DECLARE actor jsonb;
BEGIN
 IF NEW.status::text<>'RESERVED' OR NEW."sessionId" IS DISTINCT FROM OLD."sessionId" THEN
  actor:=nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
  UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"=coalesce(actor->>'id','system'),"handledByName"=coalesce(actor->>'name','系統'),revision=revision+1,"updatedAt"=now()
  WHERE "storeId"=NEW."storeId" AND "targetId"=NEW.id AND "eventType"='INCOMPLETE_SERVICE_REMINDER' AND "eventKey" LIKE 'course-incomplete-attendance:%' AND "handledAt" IS NULL;
 END IF;
 RETURN NEW;
END;
$notice$;
CREATE OR REPLACE FUNCTION public.resolve_course_session_incomplete_notices() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
DECLARE actor jsonb;
BEGIN
 IF ROW(NEW."startsAt",NEW."endsAt",NEW."cancelledAt") IS DISTINCT FROM ROW(OLD."startsAt",OLD."endsAt",OLD."cancelledAt") THEN
  actor:=nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
  UPDATE public."DigitalManagerNotice" n SET "handledAt"=now(),"handledById"=coalesce(actor->>'id','system'),"handledByName"=coalesce(actor->>'name','系統'),revision=revision+1,"updatedAt"=now()
  WHERE n."storeId"=NEW."storeId" AND n."eventType"='INCOMPLETE_SERVICE_REMINDER' AND n."eventKey" LIKE 'course-incomplete-attendance:%' AND n."handledAt" IS NULL AND EXISTS(SELECT 1 FROM public."CourseBooking" b WHERE b.id=n."targetId" AND b."storeId"=NEW."storeId" AND b."sessionId"=NEW.id);
 END IF;
 RETURN NEW;
END;
$notice$;
REVOKE ALL ON FUNCTION public.resolve_steamfoot_incomplete_notice(),public.resolve_course_incomplete_notice(),public.resolve_course_session_incomplete_notices() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS steamfoot_incomplete_notice_resolution ON public."Booking";
CREATE TRIGGER steamfoot_incomplete_notice_resolution AFTER UPDATE OF "bookingStatus","bookingDate","slotTime" ON public."Booking" FOR EACH ROW EXECUTE FUNCTION public.resolve_steamfoot_incomplete_notice();
DROP TRIGGER IF EXISTS course_incomplete_notice_resolution ON public."CourseBooking";
CREATE TRIGGER course_incomplete_notice_resolution AFTER UPDATE OF status,"sessionId" ON public."CourseBooking" FOR EACH ROW EXECUTE FUNCTION public.resolve_course_incomplete_notice();
DROP TRIGGER IF EXISTS course_session_incomplete_notice_resolution ON public."CourseSession";
CREATE TRIGGER course_session_incomplete_notice_resolution AFTER UPDATE OF "startsAt","endsAt","cancelledAt" ON public."CourseSession" FOR EACH ROW EXECUTE FUNCTION public.resolve_course_session_incomplete_notices();
