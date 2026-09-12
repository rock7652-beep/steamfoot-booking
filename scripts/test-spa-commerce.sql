-- Verified Preview DB only; every fixture and balance change is rolled back.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('spa-schedule:store-spa-module-qa-20260903',0));
DO $$
DECLARE sid text := 'store-spa-module-qa-20260903'; cid text; wid text;
 saleid text := gen_random_uuid()::text; refundid text := gen_random_uuid()::text;
 gid text := gen_random_uuid()::text; req text := gen_random_uuid()::text;
BEGIN
 SELECT id INTO STRICT cid FROM "Customer" WHERE "storeId"=sid LIMIT 1;
 INSERT INTO "SpaStoredValueWallet" (id,"storeId","customerId",balance,"updatedAt") VALUES(gen_random_uuid()::text,sid,cid,2000,CURRENT_TIMESTAMP)
 ON CONFLICT("storeId","customerId") DO UPDATE SET balance=2000,status='ACTIVE' RETURNING id INTO wid;
 INSERT INTO "SpaCreditSale" (id,"storeId","customerId","requestKey",fingerprint,kind,name,amount,"paymentMethod","sourceId","recordedByUserId") VALUES(saleid,sid,cid,req,'test','TOPUP','test',2000,'CASH',wid,'test');
 INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","entryType",amount,"balanceAfter") VALUES(saleid,wid,sid,cid,'CREDIT',2000,2000);
 BEGIN
  UPDATE "SpaStoredValueWallet" SET balance=balance+2000 WHERE id=wid;
  INSERT INTO "SpaCreditSale" (id,"storeId","customerId","requestKey",fingerprint,kind,name,amount,"paymentMethod","sourceId","recordedByUserId") VALUES(gen_random_uuid()::text,sid,cid,req,'test','TOPUP','test',2000,'CASH',wid,'test');
  RAISE EXCEPTION 'Duplicate sale accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF (SELECT balance FROM "SpaStoredValueWallet" WHERE id=wid)<>2000 THEN RAISE EXCEPTION 'Sale rollback failed'; END IF;
 UPDATE "SpaStoredValueWallet" SET balance=balance-2000 WHERE id=wid AND balance>=2000;
 INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","entryType",amount,"balanceAfter") VALUES(refundid,wid,sid,cid,'VOID',-2000,0);
 INSERT INTO "SpaRefund" (id,"storeId","customerId","saleId",amount,"paymentMethod",reason,"recordedByUserId") VALUES(refundid,sid,cid,saleid,2000,'CASH','test','test');
 BEGIN
  UPDATE "SpaStoredValueWallet" SET balance=100 WHERE id=wid;
  INSERT INTO "SpaRefund" (id,"storeId","customerId","saleId",amount,"paymentMethod",reason,"recordedByUserId") VALUES(gen_random_uuid()::text,sid,cid,saleid,2000,'CASH','retry','test');
  RAISE EXCEPTION 'Duplicate refund accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF (SELECT balance FROM "SpaStoredValueWallet" WHERE id=wid)<>0 THEN RAISE EXCEPTION 'Refund rollback failed'; END IF;
 BEGIN
  INSERT INTO "SpaRefund" (id,"storeId","customerId",amount,"paymentMethod",reason,"recordedByUserId") VALUES(gen_random_uuid()::text,sid,cid,1,'CASH','test','test');
  RAISE EXCEPTION 'Missing source accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO "SpaBookingGroup" (id,"storeId","customerId","requestKey",fingerprint) VALUES(gid,sid,cid,req,'test');
  INSERT INTO "SpaBookingGroup" (id,"storeId","customerId","requestKey",fingerprint) VALUES(gen_random_uuid()::text,sid,cid,req,'test');
  RAISE EXCEPTION 'Duplicate group accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM "SpaBookingGroup" WHERE id=gid) THEN RAISE EXCEPTION 'Group rollback failed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: sale/refund uniqueness, balance rollback, refund source check, group request rollback; no fixtures retained' AS result;
