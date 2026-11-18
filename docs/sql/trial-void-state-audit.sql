-- Read-only candidates for review, never an automatic repair or historical backfill.
-- Run only against the explicitly selected environment; IDs identify review subjects.
BEGIN TRANSACTION READ ONLY;
SELECT 'STEAM_PARTICIPANT' AS source, p."storeId", p.id AS "serviceId", p."collectionTransactionId" AS "paymentId", p.status
FROM "BookingParticipant" p JOIN "Transaction" t ON t.id=p."collectionTransactionId" AND t."storeId"=p."storeId"
WHERE p.service='FIRST_TRIAL' AND p.status='COMPLETED' AND t.status::text IN ('VOIDED','CANCELLED');
SELECT 'STEAM_LEGACY' AS source, b."storeId", b.id AS "serviceId", t.id AS "paymentId", b."bookingStatus"::text AS status
FROM "Booking" b JOIN "Transaction" t ON t."bookingId"=b.id AND t."storeId"=b."storeId"
WHERE b."bookingType"::text='FIRST_TRIAL' AND b."bookingStatus"::text='COMPLETED' AND t."transactionType"::text='TRIAL_PURCHASE' AND t.status::text='VOIDED'
  AND NOT EXISTS (SELECT 1 FROM "BookingParticipantGroup" g WHERE g."bookingId"=b.id AND g."storeId"=b."storeId")
  AND NOT EXISTS (SELECT 1 FROM "Transaction" active WHERE active."bookingId"=b.id AND active."storeId"=b."storeId" AND active.status::text='SUCCESS');
SELECT 'COURSE' AS source, b."storeId", b.id AS "serviceId", p.id AS "paymentId", b.status
FROM "CourseBooking" b JOIN "CourseTrialPayment" p ON p."bookingId"=b.id AND p."storeId"=b."storeId"
WHERE b."bookingKind"='TRIAL' AND b."cardId" IS NULL AND b.status='ATTENDED' AND p.status='VOIDED'
  AND NOT EXISTS (SELECT 1 FROM "CourseTrialPayment" active WHERE active."bookingId"=b.id AND active."storeId"=b."storeId" AND active.status='SUCCESS');
SELECT 'BEAUTY' AS source, b."storeId", b.id AS "serviceId", p.id AS "paymentId", b.status
FROM "BeautyAppointment" b JOIN "BeautyPayment" p ON p."appointmentId"=b.id AND p."storeId"=b."storeId"
WHERE b."isTrial" AND b."cardId" IS NULL AND b.status='COMPLETED' AND p.kind='SALE'
  AND EXISTS (SELECT 1 FROM "BeautyTransactionRevision" r WHERE r."transactionId"=p.id AND r."storeId"=p."storeId" AND r."voidedAt" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "BeautyPayment" active WHERE active."appointmentId"=b.id AND active."storeId"=b."storeId" AND active.kind='SALE'
    AND NOT EXISTS (SELECT 1 FROM "BeautyTransactionRevision" r WHERE r."transactionId"=active.id AND r."storeId"=active."storeId" AND r."voidedAt" IS NOT NULL));
ROLLBACK;
