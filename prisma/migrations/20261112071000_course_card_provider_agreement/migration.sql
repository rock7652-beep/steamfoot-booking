BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
-- Freeze sold-card provider agreements before new catalog rules stop limiting staff.
-- No prices, balances, qualifications, rate values or existing sessions are changed.
ALTER TABLE "CoursePointCard" ADD COLUMN "chargeSettingsSnapshot" JSONB;
CREATE INDEX "CoursePointCard_storeId_planId_idx" ON "CoursePointCard"("storeId","planId");
UPDATE "CoursePointCard" card SET "chargeSettingsSnapshot"=plan."chargeSettings"
FROM "CoursePointPlan" plan
WHERE plan.id=card."planId" AND plan."storeId"=card."storeId"
 AND plan."chargeSettings" IS NOT NULL;
CREATE FUNCTION course_card_capture_charge_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT "chargeSettings" INTO NEW."chargeSettingsSnapshot" FROM "CoursePointPlan"
   WHERE id=NEW."planId" AND "storeId"=NEW."storeId";
 ELSIF NEW."chargeSettingsSnapshot" IS DISTINCT FROM OLD."chargeSettingsSnapshot" THEN
  RAISE EXCEPTION 'Purchased provider agreement is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER course_card_charge_settings_snapshot
BEFORE INSERT OR UPDATE OF "chargeSettingsSnapshot" ON "CoursePointCard"
FOR EACH ROW EXECUTE FUNCTION course_card_capture_charge_settings();
REVOKE ALL ON FUNCTION course_card_capture_charge_settings() FROM PUBLIC,anon,authenticated;

-- Preserve explicit person/tuition agreements under independent plan identities.
-- Equal tuition versions can no longer make later A1 edits change A2.
-- Rate values and the original rows stay unchanged; existing plan keys win.
INSERT INTO "CourseTeacherCompensationSetting" ("storeId","staffId","subjectRules",revision)
SELECT plan."storeId",fee."staffId",jsonb_object_agg('plan:'||plan.id,fee.rules->0),1
FROM "CoursePointPlan" plan
JOIN "CourseCompensation" fee ON fee."storeId"=plan."storeId" AND fee."templateId"=plan."templateIds"[1] AND fee."staffId"<>''
JOIN "Staff" staff ON staff.id=fee."staffId" AND staff."storeId"=fee."storeId"
WHERE EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" feature WHERE feature."storeId"=plan."storeId" AND feature."featureKey" IN ('business.music','business.fitness') AND feature.status::text='ENABLED')
 AND cardinality(plan."templateIds")=1 AND jsonb_array_length(fee.rules)=1
 AND fee.rules->0->>'mode' IN ('CLASS','SHARE','HOUR')
GROUP BY plan."storeId",fee."staffId"
ON CONFLICT ("storeId","staffId") DO UPDATE
SET "subjectRules"=EXCLUDED."subjectRules"||"CourseTeacherCompensationSetting"."subjectRules",
 revision="CourseTeacherCompensationSetting".revision+1,"updatedAt"=NOW();

COMMIT;
