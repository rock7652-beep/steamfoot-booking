-- Freeze sold-card provider agreements before new catalog rules stop limiting staff.
-- No prices, balances, qualifications, compensation or existing sessions are changed.
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
