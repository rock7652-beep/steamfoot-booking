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
