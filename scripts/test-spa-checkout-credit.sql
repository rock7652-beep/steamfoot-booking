-- Verified test project only. All fixtures and balance changes roll back.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('spa-schedule:store-spa-module-qa-20260903',0));
DO $$
DECLARE sid text := 'store-spa-module-qa-20260903';
DECLARE bid text := gen_random_uuid()::text;
DECLARE eid text := gen_random_uuid()::text;
DECLARE wid text;
DECLARE cid text;
DECLARE remaining numeric;
DECLARE affected int;
BEGIN
 SELECT id INTO cid FROM "Customer" WHERE "storeId"=sid LIMIT 1;
 INSERT INTO "SpaBooking" (id,"storeId","customerId","serviceStaffId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
 SELECT bid,sid,cid,s.id,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date,'00:00','01:00','COMPLETED','扣款回復驗證',1800,CURRENT_TIMESTAMP FROM "Staff" s WHERE s."storeId"=sid LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing test staff'; END IF;
 INSERT INTO "SpaStoredValueWallet" (id,"storeId","customerId",balance) VALUES(gen_random_uuid()::text,sid,cid,2000)
 ON CONFLICT ("storeId","customerId") DO UPDATE SET balance=2000,status='ACTIVE' RETURNING id INTO wid;
 UPDATE "SpaStoredValueWallet" SET balance=balance-1800,"updatedAt"=CURRENT_TIMESTAMP WHERE id=wid AND "storeId"=sid AND "customerId"=cid AND status='ACTIVE' AND balance>=1800 RETURNING balance INTO remaining;
 IF remaining<>200 THEN RAISE EXCEPTION 'Debit failed'; END IF;
 INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","bookingId","entryType",amount,"balanceAfter") VALUES(gen_random_uuid()::text,wid,sid,cid,bid,'DEBIT',-1800,remaining);
 INSERT INTO "SpaReceipt" (id,"storeId","bookingId",amount,"paymentMethod","recordedByUserId","sourceId","balanceAfter") VALUES(gen_random_uuid()::text,sid,bid,1800,'STORED_VALUE','test-only',wid,remaining);
 UPDATE "SpaStoredValueWallet" SET balance=balance-1800 WHERE id=wid AND "storeId"=sid AND "customerId"=cid AND status='ACTIVE' AND balance>=1800;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Overdraft accepted'; END IF;
 UPDATE "SpaStoredValueWallet" SET balance=balance-1 WHERE id=wid AND "storeId"='other-store' AND "customerId"=cid AND balance>=1;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Cross-store debit accepted'; END IF;
 BEGIN
  UPDATE "SpaStoredValueWallet" SET balance=balance-100 WHERE id=wid;
  INSERT INTO "SpaStoredValueEntry" (id,"walletId","storeId","customerId","bookingId","entryType",amount,"balanceAfter") VALUES(gen_random_uuid()::text,wid,sid,cid,bid,'DEBIT',-100,100);
  RAISE EXCEPTION 'Duplicate ledger accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT balance FROM "SpaStoredValueWallet" WHERE id=wid)<>200 THEN RAISE EXCEPTION 'Debit rollback failed'; END IF;
 INSERT INTO "SpaEntitlement" (id,"storeId","customerId","nameSnapshot","purchasedPrice","totalUses","remainingUses","startDate","updatedAt") VALUES(eid,sid,cid,'驗證方案',2000,2,2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date,CURRENT_TIMESTAMP);
 UPDATE "SpaEntitlement" SET "remainingUses"="remainingUses"-1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=eid AND "storeId"=sid AND "customerId"=cid AND status='ACTIVE' AND "remainingUses">=1 RETURNING "remainingUses" INTO remaining;
 IF remaining<>1 THEN RAISE EXCEPTION 'Entitlement debit failed'; END IF;
 INSERT INTO "SpaEntitlementUse" (id,"storeId","entitlementId","bookingId",uses,status,"completedAt") VALUES(gen_random_uuid()::text,sid,eid,bid,1,'COMPLETED',CURRENT_TIMESTAMP);
 BEGIN
  UPDATE "SpaEntitlement" SET "remainingUses"="remainingUses"-1 WHERE id=eid;
  INSERT INTO "SpaEntitlementUse" (id,"storeId","entitlementId","bookingId",uses,status,"completedAt") VALUES(gen_random_uuid()::text,sid,eid,bid,1,'COMPLETED',CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'Duplicate entitlement use accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT "remainingUses" FROM "SpaEntitlement" WHERE id=eid)<>1 THEN RAISE EXCEPTION 'Entitlement rollback failed'; END IF;
 BEGIN
  UPDATE "SpaReceipt" SET "paymentMethod"='ENTITLEMENT',uses=NULL WHERE "bookingId"=bid;
  RAISE EXCEPTION 'Missing uses accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
ROLLBACK;
SELECT 'PASS: wallet debit, insufficient funds, store isolation, ledger uniqueness, entitlement debit, rollback, receipt source constraints' AS result;
