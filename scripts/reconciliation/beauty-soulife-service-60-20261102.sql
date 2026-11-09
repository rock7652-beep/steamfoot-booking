-- Authorized same-service correction: 全身按摩60 = 全身按摩60分鐘.
-- No money, quantity, expiry, booking assignment or historical service ID changes.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE
 shop constant text := 'store-soulife';
 old_id constant text := 'cmvnqg79e0003l107x1dblb29';
 canonical constant text := 'cmvylytr5001cjv07xi12f46q';
 audit_id constant text := 'beauty-service-60-unification-20261102';
 plans_before jsonb;cards_before jsonb;appointments_before jsonb;
 finance_before text;finance_after text;
BEGIN
 PERFORM id FROM "Store" WHERE id=shop AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store scope changed'; END IF;
 IF EXISTS(SELECT 1 FROM "BeautyEvent" WHERE id=audit_id AND "storeId"=shop) THEN RETURN; END IF;
 IF (SELECT count(*) FROM "BeautyService" WHERE "storeId"=shop AND id IN(old_id,canonical) AND duration=60 AND buffer=10)<>2 THEN RAISE EXCEPTION 'Service identity changed'; END IF;
 IF (SELECT count(*) FROM "BeautyPlan" WHERE "storeId"=shop AND old_id=ANY("serviceIds"))<>2 THEN RAISE EXCEPTION 'Plan impact changed'; END IF;
 IF (SELECT count(*) FROM "BeautyCard" WHERE "storeId"=shop AND old_id=ANY("serviceIds"))<>3 THEN RAISE EXCEPTION 'Card impact changed'; END IF;
 IF (SELECT count(*) FROM "BeautyAppointment" WHERE "storeId"=shop AND "serviceId"=old_id AND status='RESERVED')<>0 THEN RAISE EXCEPTION 'Active legacy bookings require review'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'serviceIds',"serviceIds",'rule',"chargeTechnicianRule",'revision',revision)) INTO plans_before FROM "BeautyPlan" WHERE "storeId"=shop AND old_id=ANY("serviceIds");
 SELECT jsonb_agg(jsonb_build_object('id',id,'serviceIds',"serviceIds",'rule',"chargeRuleSnapshot")) INTO cards_before FROM "BeautyCard" WHERE "storeId"=shop AND old_id=ANY("serviceIds");
 SELECT jsonb_agg(jsonb_build_object('id',a.id,'serviceId',a."serviceId",'rule',a."chargeRuleSnapshot")) INTO appointments_before FROM "BeautyAppointment" a WHERE a."storeId"=shop AND a."cardId" IN(SELECT c.id FROM "BeautyCard" c WHERE c."storeId"=shop AND old_id=ANY(c."serviceIds"));
 SELECT md5(jsonb_build_object('cards',(SELECT jsonb_agg(to_jsonb(c)-'serviceIds'-'chargeRuleSnapshot' ORDER BY c.id) FROM "BeautyCard" c WHERE c."storeId"=shop),'plans',(SELECT jsonb_agg(to_jsonb(p)-'serviceIds'-'chargeTechnicianRule'-'revision' ORDER BY p.id) FROM "BeautyPlan" p WHERE p."storeId"=shop),'appointments',(SELECT jsonb_agg(to_jsonb(a)-'chargeRuleSnapshot' ORDER BY a.id) FROM "BeautyAppointment" a WHERE a."storeId"=shop))::text) INTO finance_before;
 -- Existing used cards retain the old service for historical restore/correction.
 -- Every original entitlement gains the canonical ID; stored rule scopes match.
 UPDATE "BeautyCard" c SET "serviceIds"=v.ids,"chargeRuleSnapshot"=CASE WHEN c."chargeRuleSnapshot" IS NULL THEN NULL ELSE jsonb_set(c."chargeRuleSnapshot",'{rule,serviceIds}',to_jsonb(v.ids)) END
 FROM (SELECT x.id,CASE WHEN EXISTS(SELECT 1 FROM "BeautyAppointment" a WHERE a."storeId"=shop AND a."cardId"=x.id) THEN ARRAY[old_id,canonical] ELSE ARRAY[canonical] END AS ids FROM "BeautyCard" x WHERE x."storeId"=shop AND x."serviceIds"=ARRAY[old_id]) v WHERE c."storeId"=shop AND c.id=v.id;
 UPDATE "BeautyAppointment" a SET "chargeRuleSnapshot"=jsonb_set(a."chargeRuleSnapshot",'{rule,serviceIds}',to_jsonb(c."serviceIds")) FROM "BeautyCard" c WHERE a."storeId"=shop AND c."storeId"=shop AND a."cardId"=c.id AND c.id IN(SELECT value->>'id' FROM jsonb_array_elements(cards_before)) AND a."chargeRuleSnapshot" IS NOT NULL;
 UPDATE "BeautyPlan" SET "serviceIds"=ARRAY[canonical],revision=revision+1,"chargeTechnicianRule"=CASE WHEN "chargeTechnicianRule" IS NULL THEN NULL ELSE jsonb_set(jsonb_set("chargeTechnicianRule",'{rule,serviceIds}',jsonb_build_array(canonical)),'{rule,revision}',to_jsonb(revision+1)) END WHERE "storeId"=shop AND "serviceIds"=ARRAY[old_id];
 -- The duplicate remains in history with its original prices and pay settings.
 UPDATE "BeautyService" SET active=false,revision=revision+1,"chargeTechnicianRule"=CASE WHEN "chargeTechnicianRule" IS NULL THEN NULL ELSE jsonb_set("chargeTechnicianRule",'{rule,revision}',to_jsonb(revision+1)) END WHERE "storeId"=shop AND id=old_id;
 IF EXISTS(SELECT 1 FROM "BeautyPlan" WHERE "storeId"=shop AND old_id=ANY("serviceIds")) OR EXISTS(SELECT 1 FROM "BeautyCard" WHERE "storeId"=shop AND old_id=ANY("serviceIds") AND NOT canonical=ANY("serviceIds")) THEN RAISE EXCEPTION 'Incomplete scope correction'; END IF;
 SELECT md5(jsonb_build_object('cards',(SELECT jsonb_agg(to_jsonb(c)-'serviceIds'-'chargeRuleSnapshot' ORDER BY c.id) FROM "BeautyCard" c WHERE c."storeId"=shop),'plans',(SELECT jsonb_agg(to_jsonb(p)-'serviceIds'-'chargeTechnicianRule'-'revision' ORDER BY p.id) FROM "BeautyPlan" p WHERE p."storeId"=shop),'appointments',(SELECT jsonb_agg(to_jsonb(a)-'chargeRuleSnapshot' ORDER BY a.id) FROM "BeautyAppointment" a WHERE a."storeId"=shop))::text) INTO finance_after;
 IF finance_before IS DISTINCT FROM finance_after THEN RAISE EXCEPTION 'Financial or booking data changed'; END IF;
 INSERT INTO "BeautyEvent"(id,"storeId",kind,status,body,"createdAt") VALUES(audit_id,shop,'SERVICE_SCOPE_CORRECTION','AUDIT',jsonb_build_object('reason','User explicitly confirmed both 60 minute entries are the same service','canonicalServiceId',canonical,'retiredDuplicateId',old_id,'beforePlans',plans_before,'beforeCards',cards_before,'beforeAppointmentScopes',appointments_before,'financialChecksum',finance_before)::text,now());
END $$;
COMMIT;
