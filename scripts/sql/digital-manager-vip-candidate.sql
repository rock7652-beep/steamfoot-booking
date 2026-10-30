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
