-- REVIEW CANDIDATE. Dedicated Beauty database only; never run via main migrate deploy.
-- Explicit settings: beauty_goods.review_id='beauty-goods-v1', expected_database, app_role.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE role_name text:=current_setting('beauty_goods.app_role',true); BEGIN
 IF current_setting('beauty_goods.review_id',true) IS DISTINCT FROM 'beauty-goods-v1' OR current_setting('beauty_goods.expected_database',true) IS DISTINCT FROM current_database() THEN RAISE EXCEPTION 'Reviewed Beauty database marker required';END IF;
 IF role_name IS NULL OR role_name IN ('anon','authenticated','service_role','postgres') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN RAISE EXCEPTION 'Verified restricted Beauty role required';END IF;
 IF EXISTS(SELECT FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb) AND pg_has_role(role_name,r.oid,'MEMBER')) THEN RAISE EXCEPTION 'Beauty role inherits elevated rights';END IF;
 IF to_regclass('public."BeautyGroup"') IS NULL OR to_regclass('public."BeautyPayment"') IS NULL THEN RAISE EXCEPTION 'Beauty schema required';END IF;
END $$;
CREATE TABLE IF NOT EXISTS "BeautySharedGoodsOrder"(id TEXT PRIMARY KEY,"storeId" TEXT NOT NULL,"groupId" TEXT NOT NULL,items JSONB NOT NULL DEFAULT '[]',total INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE("storeId","groupId"),UNIQUE("storeId",id),FOREIGN KEY("storeId","groupId") REFERENCES "BeautyGroup"("storeId",id) ON DELETE RESTRICT);
ALTER TABLE "BeautyPayment" ADD COLUMN IF NOT EXISTS "sharedGoodsOrderId" TEXT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conname='beauty_goods_payment_order') THEN ALTER TABLE "BeautyPayment" ADD CONSTRAINT beauty_goods_payment_order FOREIGN KEY("storeId","sharedGoodsOrderId") REFERENCES "BeautySharedGoodsOrder"("storeId",id) ON DELETE RESTRICT;END IF;
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conname='beauty_goods_payment_shape') THEN ALTER TABLE "BeautyPayment" ADD CONSTRAINT beauty_goods_payment_shape CHECK("sharedGoodsOrderId" IS NULL OR (kind IN ('SALE','REFUND') AND "appointmentId" IS NULL AND "cardId" IS NULL AND "technicianId" IS NULL));END IF;
END $$;
CREATE INDEX IF NOT EXISTS "BeautyPayment_shared_goods_idx" ON "BeautyPayment"("storeId","sharedGoodsOrderId");
CREATE OR REPLACE FUNCTION beauty_shared_goods_values() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item jsonb; amount numeric:=0; collected numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW."storeId" IS DISTINCT FROM OLD."storeId" OR NEW."groupId" IS DISTINCT FROM OLD."groupId") THEN RAISE EXCEPTION 'Beauty goods owner is immutable';END IF;
 IF jsonb_typeof(NEW.items)<>'array' OR jsonb_array_length(NEW.items)>100 THEN RAISE EXCEPTION 'Invalid Beauty goods';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.items))<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.items)) THEN RAISE EXCEPTION 'Duplicate Beauty goods';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
  IF item->>'ownership' IS DISTINCT FROM 'RESERVATION' OR COALESCE(item->>'duration','-1')::numeric<>0 OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid Beauty goods snapshot';END IF;
  IF (item->>'quantity')::numeric NOT BETWEEN 1 AND 9999 OR mod((item->>'quantity')::numeric,1)<>0 OR (item->>'price')::numeric NOT BETWEEN 0 AND 10000000 OR mod((item->>'price')::numeric,1)<>0 THEN RAISE EXCEPTION 'Invalid Beauty goods quantity';END IF;
  amount:=amount+(item->>'quantity')::numeric*(item->>'price')::numeric;
 END LOOP;
 IF amount>10000000 OR NEW.total<>amount OR NEW.revision<1 THEN RAISE EXCEPTION 'Beauty goods total mismatch';END IF;
 SELECT COALESCE(sum(p.amount),0) INTO collected FROM "BeautyPayment" p WHERE p."storeId"=NEW."storeId" AND p."sharedGoodsOrderId"=NEW.id AND p.kind IN ('SALE','REFUND');
 IF NEW.total<collected THEN RAISE EXCEPTION 'Refund Beauty goods before reducing total';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION beauty_shared_goods_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE parent "BeautySharedGoodsOrder"%ROWTYPE; original "BeautyPayment"%ROWTYPE; collected numeric; refunded numeric;
BEGIN
 IF NEW."originalPaymentId" IS NOT NULL THEN SELECT * INTO original FROM "BeautyPayment" WHERE id=NEW."originalPaymentId" AND "storeId"=NEW."storeId";END IF;
 IF original."sharedGoodsOrderId" IS NOT NULL AND NEW."sharedGoodsOrderId" IS DISTINCT FROM original."sharedGoodsOrderId" THEN RAISE EXCEPTION 'Goods refund must retain original order';END IF;
 IF NEW."sharedGoodsOrderId" IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO parent FROM "BeautySharedGoodsOrder" WHERE "storeId"=NEW."storeId" AND id=NEW."sharedGoodsOrderId" FOR UPDATE;
 IF parent.id IS NULL THEN RAISE EXCEPTION 'Beauty goods order missing';END IF;
 SELECT COALESCE(sum(amount),0) INTO collected FROM "BeautyPayment" WHERE "storeId"=NEW."storeId" AND "sharedGoodsOrderId"=parent.id AND kind IN ('SALE','REFUND');
 IF NEW.kind='SALE' THEN
  IF NEW."originalPaymentId" IS NOT NULL OR NEW.amount<=0 OR collected+NEW.amount>parent.total THEN RAISE EXCEPTION 'Beauty goods collection exceeds balance';END IF;
  IF NOT EXISTS(SELECT FROM "BeautyAppointment" WHERE "storeId"=parent."storeId" AND "groupId"=parent."groupId" AND status NOT IN ('CANCELLED','NO_SHOW')) THEN RAISE EXCEPTION 'Beauty goods party cancelled';END IF;
 ELSIF NEW.kind='REFUND' THEN
  SELECT COALESCE(sum(amount),0) INTO refunded FROM "BeautyPayment" WHERE "storeId"=NEW."storeId" AND "originalPaymentId"=original.id AND kind='REFUND';
  IF original.id IS NULL OR original.kind<>'SALE' OR original."sharedGoodsOrderId" IS DISTINCT FROM parent.id OR NEW.amount>=0 OR -NEW.amount>original.amount+refunded OR collected+NEW.amount<0 THEN RAISE EXCEPTION 'Beauty goods refund exceeds original';END IF;
 ELSE RAISE EXCEPTION 'Invalid Beauty goods receipt kind';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION beauty_shared_goods_member_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 PERFORM id FROM "BeautyGroup" WHERE "storeId"=OLD."storeId" AND id=OLD."groupId" FOR UPDATE;
 IF EXISTS(SELECT FROM "BeautySharedGoodsOrder" WHERE "storeId"=OLD."storeId" AND "groupId"=OLD."groupId") AND NOT EXISTS(SELECT FROM "BeautyAppointment" WHERE "storeId"=OLD."storeId" AND "groupId"=OLD."groupId" AND id<>OLD.id) THEN RAISE EXCEPTION 'Last Beauty appointment has goods history';END IF;RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS beauty_shared_goods_values ON "BeautySharedGoodsOrder";
CREATE TRIGGER beauty_shared_goods_values BEFORE INSERT OR UPDATE ON "BeautySharedGoodsOrder" FOR EACH ROW EXECUTE FUNCTION beauty_shared_goods_values();
DROP TRIGGER IF EXISTS beauty_shared_goods_payment ON "BeautyPayment";
CREATE TRIGGER beauty_shared_goods_payment BEFORE INSERT ON "BeautyPayment" FOR EACH ROW EXECUTE FUNCTION beauty_shared_goods_payment();
DROP TRIGGER IF EXISTS beauty_shared_goods_member_delete ON "BeautyAppointment";
CREATE TRIGGER beauty_shared_goods_member_delete BEFORE DELETE ON "BeautyAppointment" FOR EACH ROW EXECUTE FUNCTION beauty_shared_goods_member_delete();
ALTER TABLE "BeautySharedGoodsOrder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "BeautySharedGoodsOrder" FROM PUBLIC;
DO $$ DECLARE role_name text:=current_setting('beauty_goods.app_role',true); BEGIN
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON "BeautySharedGoodsOrder" TO %I',role_name);
 IF NOT EXISTS(SELECT FROM pg_policies WHERE tablename='BeautySharedGoodsOrder' AND policyname='beauty_goods_backend') THEN EXECUTE format('CREATE POLICY beauty_goods_backend ON "BeautySharedGoodsOrder" FOR ALL TO %I USING(true) WITH CHECK(true)',role_name);END IF;
END $$;
REVOKE ALL ON FUNCTION beauty_shared_goods_values(),beauty_shared_goods_payment(),beauty_shared_goods_member_delete() FROM PUBLIC;
COMMIT;
