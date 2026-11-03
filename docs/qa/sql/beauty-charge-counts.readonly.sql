-- REVIEW ONLY. Not executed. Replace the sentinel with the separately verified Store ID.
-- Run only after ALL four tables below and public.Store are confirmed present.
-- An empty result means the target was NOT verified; it is NOT evidence of zero rows.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH target AS (
 SELECT id FROM public."Store" WHERE id='__EXPLICIT_REVIEWED_STORE_ID__'
)
SELECT t.id AS store_id,
 (SELECT count(*) FROM public."BeautyService" s WHERE s."storeId"=t.id) AS services,
 (SELECT count(*) FROM public."BeautyPlan" p WHERE p."storeId"=t.id) AS plans,
 (SELECT count(*) FROM public."BeautyCard" c WHERE c."storeId"=t.id) AS cards,
 (SELECT count(*) FROM public."BeautyAppointment" a WHERE a."storeId"=t.id) AS appointments
FROM target t;
ROLLBACK;
