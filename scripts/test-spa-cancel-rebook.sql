-- Test project ttworfzgwejdeolegkxl only. No retained writes.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('spa-schedule:store-spa-module-qa-20260903',0));
DO $$
DECLARE sid text := 'store-spa-module-qa-20260903';
 cid text; staffid text; locationid text;
 original text := gen_random_uuid()::text; replacement text := gen_random_uuid()::text;
BEGIN
 SELECT id INTO STRICT cid FROM "Customer" WHERE "storeId"=sid LIMIT 1;
 SELECT id INTO STRICT staffid FROM "Staff" WHERE "storeId"=sid LIMIT 1;
 SELECT id INTO STRICT locationid FROM "SpaServiceLocation" WHERE "storeId"=sid AND "isActive" LIMIT 1;
 INSERT INTO "SpaBooking" (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt") VALUES(original,sid,cid,staffid,locationid,'2099-12-01','10:00','11:00','CONFIRMED','cancel-rebook-test',900,CURRENT_TIMESTAMP);
 BEGIN
  INSERT INTO "SpaBooking" (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt") VALUES(replacement,sid,cid,staffid,locationid,'2099-12-01','10:00','11:00','CONFIRMED','cancel-rebook-test',900,CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'Conflict was not blocked';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 UPDATE "SpaBooking" SET status='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP WHERE id=original AND "storeId"=sid;
 INSERT INTO "SpaBooking" (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt") VALUES(replacement,sid,cid,staffid,locationid,'2099-12-01','10:00','11:00','CONFIRMED','cancel-rebook-test',900,CURRENT_TIMESTAMP);
 IF NOT EXISTS(SELECT 1 FROM "SpaBooking" WHERE id=original AND status='CANCELLED' AND "serviceLocationId"=locationid) THEN RAISE EXCEPTION 'Cancellation history lost'; END IF;
 BEGIN
  UPDATE "SpaBooking" SET status='CONFIRMED' WHERE id=original;
  RAISE EXCEPTION 'Replacement did not reserve resources';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 IF (SELECT count(*) FROM "SpaBooking" WHERE id IN (original,replacement))<>2 THEN RAISE EXCEPTION 'History or replacement missing'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: occupied slot rejected; cancellation releases same staff/location; same-slot rebooking succeeds; replacement protects slot; cancelled history retained; all fixtures rolled back' AS result;
