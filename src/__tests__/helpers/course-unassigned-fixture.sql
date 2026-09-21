"Customer" AS (
  SELECT id, CASE WHEN id='foreign' THEN 'b' ELSE 'a' END AS "storeId",
    CASE WHEN id IN ('suspended','coach') THEN id ELSE NULL END::text AS "userId",
    CASE WHEN id='merged' THEN 'new' ELSE NULL END::text AS "mergedIntoCustomerId",
    CASE WHEN id='other-manager' THEN 'other' ELSE 'manager' END AS "assignedStaffId",
    id AS name,'0900000123'::text AS phone,'2026-09-21'::timestamptz AS "createdAt"
  FROM unnest(ARRAY['new','trial','shared','expired','exhausted','closed','pending','confirmed-no-card','refunded','cancelled-pending','voided-issued','removed-shared','suspended','coach','merged','foreign','other-manager','foreign-only-card']) id
  UNION ALL SELECT 'page-'||lpad(n::text,2,'0'),'a',NULL,NULL,'manager','page-'||n,'0900000123','2026-09-22'::timestamptz FROM generate_series(1,35) n
), "User" AS (
  SELECT * FROM (VALUES ('suspended','SUSPENDED'),('coach','ACTIVE')) AS t(id,status)
), "Staff" AS (
  SELECT 'manager'::text id,'a'::text "storeId",'測試店長'::text "displayName"
), "StaffMemberLink" AS (
  SELECT 'a'::text "storeId",'coach'::text "userId",false "courseMemberEnabled"
), "CoursePointCard" AS (
  SELECT id,'a'::text "storeId" FROM unnest(ARRAY['shared','expired','exhausted','closed']) id
  UNION ALL SELECT 'foreign-card','b'
), "CourseCardMember" AS (
  SELECT id "cardId",'a'::text "storeId",id "customerId" FROM unnest(ARRAY['shared','expired','exhausted','closed']) id
  UNION ALL SELECT 'foreign-card','b','foreign-only-card'
), "CoursePurchase" AS (
  SELECT 'a'::text "storeId",id "customerId",status,card "cardId"
  FROM (VALUES ('pending','PENDING',NULL::text),('confirmed-no-card','CONFIRMED',NULL),('refunded','REFUNDED',NULL),('cancelled-pending','CANCELLED',NULL),('voided-issued','VOIDED','old-card')) AS t(id,status,card)
), "CourseBooking" AS (
  SELECT * FROM (VALUES ('a','trial',NULL::text),('a','removed-shared','old-shared')) AS t("storeId","customerId","cardId")
)
