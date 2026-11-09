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
