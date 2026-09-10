-- Run only against ttworfzgwejdeolegkxl. All test rows roll back.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('spa-schedule:store-spa-module-qa-20260903',0));
DO $$
DECLARE booking_id text := 'spa-checkout-check-' || gen_random_uuid();
DECLARE receipt_id text := 'spa-receipt-check-' || gen_random_uuid();
DECLARE target_store text := 'store-spa-module-qa-20260903';
BEGIN
 INSERT INTO "SpaBooking" (id,"storeId","customerId","serviceStaffId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
 SELECT booking_id,target_store,c.id,s.id,CURRENT_DATE,'00:00','01:00','COMPLETED','結帳約束驗證',1800,CURRENT_TIMESTAMP FROM "Customer" c CROSS JOIN "Staff" s WHERE c."storeId"=target_store AND s."storeId"=target_store LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing SPA test fixture'; END IF;
 INSERT INTO "SpaReceipt" (id,"storeId","bookingId",amount,"paymentMethod","recordedByUserId") VALUES(receipt_id,target_store,booking_id,1800,'CASH','test-only');
 BEGIN
  INSERT INTO "SpaReceipt" (id,"storeId","bookingId",amount,"paymentMethod","recordedByUserId") VALUES(receipt_id||'-duplicate',target_store,booking_id,1800,'CARD','test-only');
  RAISE EXCEPTION 'Duplicate receipt was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO "SpaReceipt" (id,"storeId","bookingId",amount,"paymentMethod","recordedByUserId") VALUES(receipt_id||'-foreign','wrong-store',booking_id,1800,'CASH','test-only');
  RAISE EXCEPTION 'Cross-store receipt was accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  UPDATE "SpaReceipt" SET amount=-1 WHERE id=receipt_id;
  RAISE EXCEPTION 'Negative amount was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "SpaReceipt" SET "paymentMethod"='ONLINE' WHERE id=receipt_id;
  RAISE EXCEPTION 'Invalid payment method was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 -- Simulate failure after a financial write, using a subtransaction rollback.
 BEGIN
  UPDATE "SpaReceipt" SET amount=1700 WHERE id=receipt_id;
  RAISE division_by_zero;
 EXCEPTION WHEN division_by_zero THEN NULL;
 END;
 IF (SELECT amount FROM "SpaReceipt" WHERE id=receipt_id) <> 1800 THEN RAISE EXCEPTION 'Rollback failed'; END IF;
 IF has_table_privilege('anon','"SpaReceipt"','SELECT') OR has_table_privilege('authenticated','"SpaReceipt"','INSERT') THEN RAISE EXCEPTION 'Unexpected client access'; END IF;
END $$;
ROLLBACK;
SELECT 'passed: uniqueness, store isolation, amount, payment method, rollback, client access' AS result;
