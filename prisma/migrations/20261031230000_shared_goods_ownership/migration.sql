BEGIN;
-- No orders are moved, multiplied or backfilled from people counts.
ALTER TABLE IF EXISTS "ServiceAddOnOrder" ALTER COLUMN "participantId" DROP NOT NULL;
ALTER TABLE IF EXISTS "ServiceAddOnOrder" ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'PERSON';
ALTER TABLE IF EXISTS "ServiceAddOnOrder" ADD COLUMN IF NOT EXISTS "reservationKey" TEXT;
DO $$ BEGIN IF to_regclass('public."ServiceAddOnOrder"') IS NOT NULL THEN
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conname='ServiceAddOnOrder_owner_shape') THEN
 ALTER TABLE "ServiceAddOnOrder" ADD CONSTRAINT "ServiceAddOnOrder_owner_shape" CHECK ((ownership='PERSON' AND "participantId" IS NOT NULL AND "reservationKey" IS NULL) OR (ownership='RESERVATION' AND module IN ('STEAMFOOT','FITNESS','MUSIC') AND "participantId" IS NULL AND "reservationKey" IS NOT NULL));
 END IF;
 CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAddOnOrder_storeId_module_bookingId_reservationKey_key" ON "ServiceAddOnOrder"("storeId",module,"bookingId","reservationKey");
 CREATE INDEX IF NOT EXISTS "ServiceAddOnOrder_storeId_module_ownership_idx" ON "ServiceAddOnOrder"("storeId",module,ownership);
END IF; END $$;
CREATE OR REPLACE FUNCTION service_addon_shared_goods_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item jsonb; amount numeric:=0;
BEGIN
 IF NEW.ownership<>'RESERVATION' THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.items)<>'array' OR jsonb_array_length(NEW.items)>100 THEN RAISE EXCEPTION 'Invalid shared goods';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.items))<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.items)) THEN RAISE EXCEPTION 'Duplicate shared goods';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
  IF item->>'ownership' IS DISTINCT FROM 'RESERVATION' OR COALESCE(item->>'duration','-1')::numeric<>0 OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid shared goods snapshot';END IF;
  IF (item->>'quantity')::numeric NOT BETWEEN 1 AND 9999 OR mod((item->>'quantity')::numeric,1)<>0 OR (item->>'price')::numeric NOT BETWEEN 0 AND 10000000 OR mod((item->>'price')::numeric,1)<>0 THEN RAISE EXCEPTION 'Invalid shared quantity or price';END IF;
  amount:=amount+(item->>'quantity')::numeric*(item->>'price')::numeric;
 END LOOP;
 IF amount>10000000 OR NEW.total<>amount THEN RAISE EXCEPTION 'Shared goods total mismatch';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION service_addon_shared_parent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE parent_id text; owner_key text;
BEGIN
 IF NOT EXISTS(SELECT FROM "ServiceAddOnOrder" WHERE ownership='RESERVATION' AND "storeId"=(to_jsonb(OLD)->>'storeId')) THEN RETURN OLD;END IF;
 IF TG_TABLE_NAME='Booking' THEN
  IF EXISTS(SELECT FROM "ServiceAddOnOrder" WHERE "storeId"=OLD."storeId" AND module='STEAMFOOT' AND "bookingId"=OLD.id AND ownership='RESERVATION') THEN RAISE EXCEPTION 'Reservation has shared goods history; cancel instead of deleting';END IF;
 ELSIF TG_TABLE_NAME='CourseSession' THEN
  IF EXISTS(SELECT FROM "ServiceAddOnOrder" WHERE "storeId"=OLD."storeId" AND module IN ('FITNESS','MUSIC') AND "bookingId"=OLD.id AND ownership='RESERVATION') THEN RAISE EXCEPTION 'Session has shared goods history; cancel instead of deleting';END IF;
 ELSIF TG_TABLE_NAME='BookingParticipant' THEN
  SELECT "bookingId" INTO parent_id FROM "BookingParticipantGroup" WHERE id=OLD."groupId" AND "storeId"=OLD."storeId";
  IF EXISTS(SELECT FROM "ServiceAddOnOrder" WHERE "storeId"=OLD."storeId" AND module='STEAMFOOT' AND "bookingId"=parent_id AND ownership='RESERVATION') AND NOT EXISTS(SELECT FROM "BookingParticipant" WHERE "storeId"=OLD."storeId" AND "groupId"=OLD."groupId" AND id<>OLD.id) THEN RAISE EXCEPTION 'Last participant has shared goods history';END IF;
 ELSIF TG_TABLE_NAME='CourseBooking' THEN
  IF EXISTS(SELECT FROM "ServiceAddOnOrder" WHERE "storeId"=OLD."storeId" AND module IN ('FITNESS','MUSIC') AND "bookingId"=OLD."sessionId" AND ownership='RESERVATION' AND "reservationKey"='booking:'||OLD.id) THEN RAISE EXCEPTION 'Booking anchors shared goods history';END IF;
  owner_key:=CASE WHEN NULLIF(OLD."groupKey",'') IS NULL THEN 'booking:'||OLD.id ELSE 'group:'||OLD."groupKey" END;
  IF EXISTS(SELECT FROM "ServiceAddOnOrder" WHERE "storeId"=OLD."storeId" AND module IN ('FITNESS','MUSIC') AND "bookingId"=OLD."sessionId" AND "reservationKey"=owner_key AND ownership='RESERVATION') AND (NULLIF(OLD."groupKey",'') IS NULL OR NOT EXISTS(SELECT FROM "CourseBooking" WHERE "storeId"=OLD."storeId" AND "sessionId"=OLD."sessionId" AND "groupKey"=OLD."groupKey" AND id<>OLD.id)) THEN RAISE EXCEPTION 'Last booking has shared goods history';END IF;
 END IF;
 RETURN OLD;
END $$;
DO $$ DECLARE t text; BEGIN
 IF to_regclass('public."ServiceAddOnOrder"') IS NOT NULL THEN
  DROP TRIGGER IF EXISTS service_addon_shared_goods ON "ServiceAddOnOrder";
  CREATE TRIGGER service_addon_shared_goods BEFORE INSERT OR UPDATE ON "ServiceAddOnOrder" FOR EACH ROW EXECUTE FUNCTION service_addon_shared_goods_guard();
  FOREACH t IN ARRAY ARRAY['Booking','BookingParticipant','CourseSession','CourseBooking'] LOOP
   IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
    EXECUTE format('DROP TRIGGER IF EXISTS service_addon_shared_parent ON %I',t);
    EXECUTE format('CREATE TRIGGER service_addon_shared_parent BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION service_addon_shared_parent_guard()',t);
   END IF;
  END LOOP;
 END IF;
END $$;
REVOKE ALL ON FUNCTION service_addon_shared_goods_guard(),service_addon_shared_parent_guard() FROM PUBLIC;
COMMIT;
