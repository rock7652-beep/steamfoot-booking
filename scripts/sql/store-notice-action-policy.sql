-- Candidate only. Does not deploy, delete history, change business status or send LINE.
-- Apply with the reviewed beauty runtime role in beauty_migration.app_role.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Business follow-up state is not proof that a person has read the message.
-- New business events must start unread now that read messages enter history.
CREATE OR REPLACE FUNCTION public.publish_store_notice() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $publish$
BEGIN
 NEW."publishedAt"=statement_timestamp();
 NEW."readAt"=NULL;
 NEW."readById"=NULL;
 NEW."readByName"=NULL;
 RETURN NEW;
END $publish$;
REVOKE ALL ON FUNCTION public.publish_store_notice() FROM PUBLIC,anon,authenticated;

ALTER TABLE public."CourseStoreNotice" DROP CONSTRAINT IF EXISTS "CourseStoreNotice_kind_check";
ALTER TABLE public."CourseStoreNotice" ADD CONSTRAINT "CourseStoreNotice_kind_check"
 CHECK (kind IN ('BOOKING','LEAVE','CANCEL','MOVE','STOP','RESTORE','UPDATE') OR ("subjectKey" LIKE 'beauty:%' AND kind IN ('COMPLETE','NO_SHOW')));

CREATE OR REPLACE FUNCTION public.suppress_informational_store_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NEW.kind IN ('COMPLETE','NO_SHOW','RESTORE') THEN RETURN NULL; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.suppress_informational_store_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS action_only_steam_notice ON public."SteamfootStoreNotice";
CREATE TRIGGER action_only_steam_notice BEFORE INSERT OR UPDATE OF kind ON public."SteamfootStoreNotice"
 FOR EACH ROW EXECUTE FUNCTION public.suppress_informational_store_notice();
DROP TRIGGER IF EXISTS action_only_course_notice ON public."CourseStoreNotice";
CREATE TRIGGER action_only_course_notice BEFORE INSERT OR UPDATE OF kind ON public."CourseStoreNotice"
 FOR EACH ROW EXECUTE FUNCTION public.suppress_informational_store_notice();

-- Note edits can use updateMany directly; recording here keeps the business edit
-- and its notification atomic without changing the existing conflict handling.
CREATE OR REPLACE FUNCTION public.record_course_booking_content_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $content$
DECLARE session_row record; staff_name text;
BEGIN
 IF NEW.notes IS NOT DISTINCT FROM OLD.notes AND NEW."customerName" IS NOT DISTINCT FROM OLD."customerName" THEN RETURN NEW; END IF;
 SELECT s.id,s."nameSnapshot",s."coachId",s."startsAt" INTO session_row FROM public."CourseSession" s WHERE s.id=NEW."sessionId" AND s."storeId"=NEW."storeId";
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT "displayName" INTO staff_name FROM public."Staff" WHERE id=session_row."coachId" AND "storeId"=NEW."storeId";
 INSERT INTO public."CourseStoreNotice" (id,"storeId","subjectKey",kind,"customerName","courseName","coachName","startsAt","affectedCount",details,"createdAt","updatedAt")
 VALUES (gen_random_uuid()::text,NEW."storeId",'booking:'||NEW.id,'UPDATE',NEW."customerName",session_row."nameSnapshot",coalesce(staff_name,'未指派'),session_row."startsAt",1,'{}'::jsonb,now(),now())
 ON CONFLICT ("storeId","subjectKey") DO UPDATE SET kind='UPDATE',"customerName"=EXCLUDED."customerName","courseName"=EXCLUDED."courseName","coachName"=EXCLUDED."coachName","startsAt"=EXCLUDED."startsAt","previousStartsAt"=NULL,"previousCoachName"=NULL,details='{}'::jsonb,"handledAt"=NULL,"handledById"=NULL,"handledByName"=NULL,revision="CourseStoreNotice".revision+1,"updatedAt"=now();
 RETURN NEW;
END $content$;
REVOKE ALL ON FUNCTION public.record_course_booking_content_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS course_booking_content_notice ON public."CourseBooking";
CREATE TRIGGER course_booking_content_notice AFTER UPDATE OF notes,"customerName" ON public."CourseBooking"
 FOR EACH ROW EXECUTE FUNCTION public.record_course_booking_content_notice();

-- Isolated candidate: capture store-owned inquiries inside the lead transaction.
CREATE OR REPLACE FUNCTION public.record_digital_manager_lead_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
DECLARE actor jsonb; event_key text; event_type text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"::text IN ('STEAMFOOT','COURSE','BEAUTY')) THEN RETURN NEW; END IF;
 IF NEW."completionActionKey"='__human_support_handoff__' THEN
  event_key:='human-support-requested:'||NEW.id;event_type:='HUMAN_SUPPORT_REQUESTED';
 ELSIF NEW."submittedAnswers"->>'requestType' IN ('VIP_INTEREST','RENEWAL_INTEREST','續購需求','續購','VIP／續購方案') THEN
  event_key:='renewal-interest:'||NEW.id||':'||NEW."conversationId";event_type:='VIP_INTEREST';
 ELSIF NEW."phoneCiphertext" IS NOT NULL AND NEW."phoneIv" IS NOT NULL AND NEW."phoneAuthTag" IS NOT NULL THEN
  event_key:='digital-butler-lead:'||NEW.id;event_type:='DIGITAL_BUTLER_LEAD_CREATED';
 ELSE RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.status::text='NEW' THEN
  INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES (gen_random_uuid()::text,NEW."storeId",event_key,event_type,NEW.id) ON CONFLICT ("storeId","eventKey") DO NOTHING;
 ELSIF TG_OP='UPDATE' AND (NEW.status::text<>'NEW' OR (event_type='HUMAN_SUPPORT_REQUESTED' AND NEW."assignedStaffId" IS NOT NULL)) THEN
  actor:=nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
  UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"=coalesce(actor->>'id','system'),"handledByName"=coalesce(actor->>'name','系統'),revision=revision+1,"updatedAt"=now()
  WHERE "storeId"=NEW."storeId" AND (("eventKey"=event_key OR (event_type='HUMAN_SUPPORT_REQUESTED' AND "eventKey"='human-support-final-reminder:'||NEW.id)) OR ("eventType"='VIP_INTEREST' AND "targetId"=NEW.id AND "eventKey" LIKE 'renewal-interest:%')) AND "handledAt" IS NULL;
 END IF;
 RETURN NEW;
END;
$notice$;
REVOKE ALL ON FUNCTION public.record_digital_manager_lead_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS digital_manager_lead_notice ON public."DigitalButlerLead";
CREATE TRIGGER digital_manager_lead_notice AFTER INSERT OR UPDATE OF status,"assignedStaffId" ON public."DigitalButlerLead" FOR EACH ROW EXECUTE FUNCTION public.record_digital_manager_lead_notice();

-- Isolated candidate: record a customer's VIP interest atomically with their answer.
CREATE OR REPLACE FUNCTION public.record_digital_manager_vip_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $notice$
BEGIN
 IF NEW."responseAction"='VIP_INTEREST' AND OLD."responseAction" IS DISTINCT FROM 'VIP_INTEREST'
 AND EXISTS(SELECT 1 FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"::text IN ('STEAMFOOT','COURSE','BEAUTY')) THEN
  INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES (gen_random_uuid()::text,NEW."storeId",'vip-interest:'||NEW.id,'VIP_INTEREST',NEW."customerId") ON CONFLICT ("storeId","eventKey") DO NOTHING;
 END IF;
 RETURN NEW;
END;
$notice$;
REVOKE ALL ON FUNCTION public.record_digital_manager_vip_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS digital_manager_vip_notice ON public."SessionBalanceNotification";
CREATE TRIGGER digital_manager_vip_notice AFTER UPDATE OF "responseAction" ON public."SessionBalanceNotification" FOR EACH ROW EXECUTE FUNCTION public.record_digital_manager_vip_notice();

-- Keep one visible support task for already-existing follow-ups as well.
-- Resolve only notice metadata; the lead, assignment and publication date stay intact.
UPDATE public."DigitalManagerNotice" initial
 SET "handledAt"=now(),"handledById"='system',"handledByName"='系統',revision=revision+1,"updatedAt"=now()
 WHERE initial."eventType"='HUMAN_SUPPORT_REQUESTED' AND initial."handledAt" IS NULL
 AND EXISTS(SELECT 1 FROM public."DigitalManagerNotice" followup WHERE followup."storeId"=initial."storeId" AND followup."targetId"=initial."targetId" AND followup."eventType"='HUMAN_SUPPORT_FINAL_REMINDER' AND followup."handledAt" IS NULL);

-- Preserve the existing permissions and add only a store-owned receivable reference.
-- The scheduler writes these notices through its existing backend connection.
DO $policy$
DECLARE app_role text:=current_setting('beauty_migration.app_role',true); old_predicate text; new_predicate text;
BEGIN
 IF app_role IS NULL OR app_role !~ '^steamfoot_beauty_(data_[a-z][a-z0-9_]{0,34}|prod_[0-9]{8})$'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'A dedicated non-bypass Beauty runtime role is required';
 END IF;
 SELECT qual INTO old_predicate FROM pg_policies WHERE schemaname='public' AND tablename='DigitalManagerNotice' AND policyname='beauty_digital_manager_read' AND app_role=ANY(roles::text[]);
 IF old_predicate IS NULL THEN RAISE EXCEPTION 'Reviewed beauty notice policy is required'; END IF;
 new_predicate:='(("eventType"=''DIGITAL_BUTLER_LEAD_CREATED'' AND "eventKey" LIKE ''digital-butler-lead:%'') OR ("eventType"=''HUMAN_SUPPORT_REQUESTED'' AND "eventKey" LIKE ''human-support-requested:%'') OR ("eventType"=''HUMAN_SUPPORT_FINAL_REMINDER'' AND "eventKey" LIKE ''human-support-final-reminder:%'') OR ("eventType"=''VIP_INTEREST'' AND ("eventKey" LIKE ''renewal-interest:%'' OR "eventKey" LIKE ''vip-interest:%'')) OR ("eventType"=''TRANSFER_PENDING_CONFIRMATION'' AND "eventKey" LIKE ''beauty-purchase-pending:%'') OR ("eventType"=''INCOMPLETE_SERVICE_REMINDER'' AND "eventKey" LIKE ''beauty-incomplete:%'') OR ("eventType"=''DAILY_ACTION_DIGEST'' AND "eventKey" LIKE ''beauty-digest:%'') OR ("eventType"=''OUTSTANDING_PAYMENT'' AND "eventKey" LIKE ''beauty-receivable:%'')) AND EXISTS(SELECT 1 FROM public."Store" s WHERE s.id="DigitalManagerNotice"."storeId" AND s."industryModule"::text=''BEAUTY'')';
 EXECUTE format('ALTER POLICY beauty_digital_manager_read ON public."DigitalManagerNotice" TO %I USING (%s)',app_role,new_predicate);
 EXECUTE format('ALTER POLICY beauty_digital_manager_update ON public."DigitalManagerNotice" TO %I USING (%s) WITH CHECK (%s)',app_role,new_predicate,new_predicate);
END $policy$;
CREATE INDEX IF NOT EXISTS "Booking_receivable_idx" ON public."Booking" ("storeId","updatedAt") WHERE "bookingStatus"='COMPLETED' AND "expectedAmount">0;
CREATE INDEX IF NOT EXISTS "BeautyAppointment_receivable_idx" ON public."BeautyAppointment" ("storeId","endsAt") WHERE status='COMPLETED' AND "cardId" IS NULL;
CREATE INDEX IF NOT EXISTS "BookingParticipant_receivable_idx" ON public."BookingParticipant" ("storeId","completedAt") WHERE status='COMPLETED' AND "expectedAmount">0;
CREATE INDEX IF NOT EXISTS "Transaction_receivable_booking_idx" ON public."Transaction" ("storeId","bookingId") WHERE "transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE');
CREATE INDEX IF NOT EXISTS "Transaction_receivable_participant_idx" ON public."Transaction" ("storeId","unregisteredParticipantId") WHERE "transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE');
CREATE INDEX IF NOT EXISTS "CourseSession_receivable_idx" ON public."CourseSession" ("storeId","endsAt") WHERE "cancelledAt" IS NULL;
CREATE INDEX IF NOT EXISTS "CourseTrialPayment_receivable_idx" ON public."CourseTrialPayment" ("storeId","bookingId") WHERE status='SUCCESS' AND "voidedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "CoursePurchase_receivable_idx" ON public."CoursePurchase" ("storeId","confirmedAt") WHERE status='CONFIRMED' AND "voidedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "BeautyPayment_receivable_idx" ON public."BeautyPayment" ("storeId","appointmentId") WHERE kind IN ('SALE','REFUND');
COMMIT;
