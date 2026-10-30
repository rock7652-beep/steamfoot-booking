-- REVIEW ONLY: not registered for automatic deployment.
-- Requires reviewed production preflight, dedicated Beauty grants, and explicit release authorization.
-- Do not apply without completing the release review.
BEGIN;

-- Source: scripts/sql/digital-manager-notice-candidate.sql
-- Candidate for isolated testing only. Production requires a reviewed migration.
-- Store-scoped event references contain no copied customer or payment details.
CREATE TABLE IF NOT EXISTS public."DigitalManagerNotice" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES public."Store"(id) ON DELETE RESTRICT,
  "eventKey" text NOT NULL,
  "eventType" text NOT NULL,
  "targetId" text NOT NULL,
  "handledAt" timestamptz,
  "handledById" text,
  "handledByName" text,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("storeId", "eventKey")
);
CREATE INDEX IF NOT EXISTS "DigitalManagerNotice_store_pending_created_idx"
  ON public."DigitalManagerNotice" ("storeId", "createdAt" DESC, id)
  WHERE "handledAt" IS NULL;
CREATE INDEX IF NOT EXISTS "DigitalManagerNotice_store_handled_idx"
  ON public."DigitalManagerNotice" ("storeId", "handledAt" DESC, id)
  WHERE "handledAt" IS NOT NULL;
ALTER TABLE public."DigitalManagerNotice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DigitalManagerNotice" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON public."DigitalManagerNotice" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;

-- Per-store activation prevents scheduled notices from backfilling old events.
CREATE TABLE IF NOT EXISTS public."DigitalManagerActivation" (
  "storeId" text PRIMARY KEY REFERENCES public."Store"(id) ON DELETE RESTRICT,
  "activatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."DigitalManagerActivation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DigitalManagerActivation" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON public."DigitalManagerActivation" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;

-- Source: scripts/sql/steamfoot-digital-manager-booking-candidate.sql
-- Isolated candidate only. Requires existing store-notice trigger; no historical backfill.
CREATE OR REPLACE FUNCTION public.record_steamfoot_store_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $notice$
DECLARE
 event_kind text;
 booking_start timestamptz;
 previous_start timestamptz;
 customer_name text;
 service_name text;
 staff_name text;
 previous_staff_name text;
 actor jsonb;
 informational boolean;
BEGIN
 -- Also serializes setting changes with capture; never lock another store.
 PERFORM id FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"='STEAMFOOT' FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."bookedByType"::text <> 'CUSTOMER' THEN RETURN NEW; END IF;
  event_kind := 'BOOKING';
 ELSE
  IF ROW(NEW."bookingDate",NEW."slotTime",NEW.people,NEW."bookingStatus",NEW."serviceStaffId",NEW."servicePlanId",NEW.notes)
     IS NOT DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime",OLD.people,OLD."bookingStatus",OLD."serviceStaffId",OLD."servicePlanId",OLD.notes) THEN RETURN NEW; END IF;
  event_kind := CASE
   WHEN NEW."bookingStatus"='CANCELLED' AND OLD."bookingStatus"<>'CANCELLED' THEN 'CANCEL'
   WHEN NEW."bookingStatus"='NO_SHOW' AND OLD."bookingStatus"<>'NO_SHOW' THEN 'NO_SHOW'
   WHEN NEW."bookingStatus"='COMPLETED' AND OLD."bookingStatus"<>'COMPLETED' THEN 'COMPLETE'
   WHEN OLD."bookingStatus" IN ('CANCELLED','NO_SHOW','COMPLETED') AND NEW."bookingStatus" IN ('PENDING','CONFIRMED') THEN 'RESTORE'
   WHEN ROW(NEW."bookingDate",NEW."slotTime") IS DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime") THEN 'MOVE'
   ELSE 'UPDATE' END;
  IF event_kind='MOVE' THEN previous_start := (OLD."bookingDate"::date + OLD."slotTime"::time) AT TIME ZONE 'Asia/Taipei'; END IF;
  IF NEW."serviceStaffId" IS DISTINCT FROM OLD."serviceStaffId" THEN
   SELECT "displayName" INTO previous_staff_name FROM public."Staff" WHERE id=OLD."serviceStaffId" AND "storeId"=NEW."storeId";
   previous_staff_name := coalesce(previous_staff_name,'未指派');
  END IF;
 END IF;
 booking_start := (NEW."bookingDate"::date + NEW."slotTime"::time) AT TIME ZONE 'Asia/Taipei';
 SELECT name INTO customer_name FROM public."Customer" WHERE id=NEW."customerId" AND "storeId"=NEW."storeId";
 SELECT name INTO service_name FROM public."ServicePlan" WHERE id=NEW."servicePlanId" AND "storeId"=NEW."storeId";
 SELECT "displayName" INTO staff_name FROM public."Staff" WHERE id=NEW."serviceStaffId" AND "storeId"=NEW."storeId";
 actor := nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
 informational := event_kind = 'COMPLETE' OR (event_kind = 'BOOKING' AND NOT (NEW."bookedByType"::text = 'CUSTOMER' AND (NEW."bookingDate"::date = (now() AT TIME ZONE 'Asia/Taipei')::date OR NEW."bookingType"::text = 'FIRST_TRIAL')));
 INSERT INTO public."SteamfootStoreNotice" ("storeId","bookingId",kind,"customerName","serviceName","staffName","previousStaffName","startsAt","previousStartsAt","affectedCount",details,"handledAt","handledById","handledByName")
 VALUES (NEW."storeId",NEW.id,event_kind,coalesce(customer_name,'顧客'),coalesce(service_name,CASE NEW."bookingType"::text WHEN 'FIRST_TRIAL' THEN '體驗預約' WHEN 'SINGLE' THEN '單次預約' ELSE '方案預約' END),coalesce(staff_name,'未指派'),previous_staff_name,booking_start,previous_start,NEW.people,jsonb_build_object('bookingStatus',NEW."bookingStatus",'people',NEW.people),CASE WHEN informational THEN now() ELSE NULL END,CASE WHEN informational THEN coalesce(actor->>'id','system') ELSE NULL END,CASE WHEN informational THEN coalesce(actor->>'name','系統') ELSE NULL END)
 ON CONFLICT ("storeId","bookingId") DO UPDATE SET
  kind=EXCLUDED.kind,"customerName"=EXCLUDED."customerName","serviceName"=EXCLUDED."serviceName","staffName"=EXCLUDED."staffName",
  "previousStaffName"=CASE WHEN "SteamfootStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN coalesce("SteamfootStoreNotice"."previousStaffName",EXCLUDED."previousStaffName") ELSE EXCLUDED."previousStaffName" END,
  "startsAt"=EXCLUDED."startsAt","previousStartsAt"=CASE WHEN "SteamfootStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN coalesce("SteamfootStoreNotice"."previousStartsAt",EXCLUDED."previousStartsAt") ELSE EXCLUDED."previousStartsAt" END,
  "affectedCount"=EXCLUDED."affectedCount",details=EXCLUDED.details,"handledAt"=EXCLUDED."handledAt","handledById"=EXCLUDED."handledById","handledByName"=EXCLUDED."handledByName",revision="SteamfootStoreNotice".revision+1,"updatedAt"=now();
 RETURN NEW;
END;
$notice$;

-- Source: scripts/sql/steamfoot-digital-manager-payment-candidate.sql
-- Isolated candidate; install only after the reviewed DigitalManagerNotice table.
-- Captures new plan payment events in the same transaction; no historical scan.
CREATE OR REPLACE FUNCTION public.record_steamfoot_plan_payment_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
DECLARE actor jsonb; event_key text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"::text='STEAMFOOT') THEN RETURN NEW; END IF;
 IF NEW."planId" IS NULL OR NEW."transactionType"::text NOT IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE') THEN RETURN NEW; END IF;
 event_key:='pending-payment:'||NEW.id;
 IF NEW."paymentStatus"::text='PENDING' AND NEW.status::text NOT IN ('CANCELLED','REFUNDED','VOIDED') THEN
  INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId")
  VALUES (gen_random_uuid()::text,NEW."storeId",event_key,'TRANSFER_PENDING_CONFIRMATION',NEW.id)
  ON CONFLICT ("storeId","eventKey") DO NOTHING;
 ELSIF TG_OP='UPDATE' AND OLD."paymentStatus"::text='PENDING' THEN
  actor:=nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
  UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"=coalesce(actor->>'id','system'),"handledByName"=coalesce(actor->>'name','系統'),revision=revision+1,"updatedAt"=now()
  WHERE "storeId"=NEW."storeId" AND "eventKey"=event_key AND "handledAt" IS NULL;
 END IF;
 RETURN NEW;
END;
$notice$;
REVOKE ALL ON FUNCTION public.record_steamfoot_plan_payment_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS steamfoot_plan_payment_notice ON public."Transaction";
CREATE TRIGGER steamfoot_plan_payment_notice AFTER INSERT OR UPDATE OF "paymentStatus",status ON public."Transaction" FOR EACH ROW EXECUTE FUNCTION public.record_steamfoot_plan_payment_notice();

-- Source: scripts/sql/digital-manager-lead-candidate.sql
-- Isolated candidate: capture store-owned inquiries inside the lead transaction.
CREATE OR REPLACE FUNCTION public.record_digital_manager_lead_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
DECLARE actor jsonb; event_key text; event_type text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"::text IN ('STEAMFOOT','COURSE')) THEN RETURN NEW; END IF;
 IF NEW."completionActionKey"='__human_support_handoff__' THEN
  event_key:='human-support-requested:'||NEW.id;event_type:='HUMAN_SUPPORT_REQUESTED';
 ELSIF NEW."phoneCiphertext" IS NOT NULL AND NEW."phoneIv" IS NOT NULL AND NEW."phoneAuthTag" IS NOT NULL THEN
  event_key:='digital-butler-lead:'||NEW.id;event_type:='DIGITAL_BUTLER_LEAD_CREATED';
 ELSE RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.status::text='NEW' THEN
  INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES (gen_random_uuid()::text,NEW."storeId",event_key,event_type,NEW.id) ON CONFLICT ("storeId","eventKey") DO NOTHING;
 ELSIF TG_OP='UPDATE' AND (NEW.status::text<>'NEW' OR (event_type='HUMAN_SUPPORT_REQUESTED' AND NEW."assignedStaffId" IS NOT NULL)) THEN
  actor:=nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
  UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"=coalesce(actor->>'id','system'),"handledByName"=coalesce(actor->>'name','系統'),revision=revision+1,"updatedAt"=now()
  WHERE "storeId"=NEW."storeId" AND ("eventKey"=event_key OR (event_type='HUMAN_SUPPORT_REQUESTED' AND "eventKey"='human-support-final-reminder:'||NEW.id)) AND "handledAt" IS NULL;
 END IF;
 RETURN NEW;
END;
$notice$;
REVOKE ALL ON FUNCTION public.record_digital_manager_lead_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS digital_manager_lead_notice ON public."DigitalButlerLead";
CREATE TRIGGER digital_manager_lead_notice AFTER INSERT OR UPDATE OF status,"assignedStaffId" ON public."DigitalButlerLead" FOR EACH ROW EXECUTE FUNCTION public.record_digital_manager_lead_notice();

-- Source: scripts/sql/digital-manager-vip-candidate.sql
-- Isolated candidate: record a customer's VIP interest atomically with their answer.
CREATE OR REPLACE FUNCTION public.record_digital_manager_vip_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
BEGIN
 IF NEW."responseAction"='VIP_INTEREST' AND OLD."responseAction" IS DISTINCT FROM 'VIP_INTEREST'
 AND EXISTS(SELECT 1 FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"::text='STEAMFOOT') THEN
  INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES (gen_random_uuid()::text,NEW."storeId",'vip-interest:'||NEW.id,'VIP_INTEREST',NEW."customerId") ON CONFLICT ("storeId","eventKey") DO NOTHING;
 END IF;
 RETURN NEW;
END;
$notice$;
REVOKE ALL ON FUNCTION public.record_digital_manager_vip_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS digital_manager_vip_notice ON public."SessionBalanceNotification";
CREATE TRIGGER digital_manager_vip_notice AFTER UPDATE OF "responseAction" ON public."SessionBalanceNotification" FOR EACH ROW EXECUTE FUNCTION public.record_digital_manager_vip_notice();

-- Source: scripts/sql/digital-manager-incomplete-resolution-candidate.sql
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

COMMIT;
