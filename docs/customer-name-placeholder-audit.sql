-- READ-ONLY AUDIT TEMPLATE: Customer.name = '顧客'
-- Do not run on Production without confirming the exact production database target.
-- This file contains SELECT-only queries. No UPDATE/DELETE/INSERT/DDL.

-- 1) Total placeholder-name customers
SELECT COUNT(*) AS placeholder_customer_count
FROM "Customer"
WHERE "name" = '顧客';

-- 2) Breakdown by store
SELECT
  "storeId",
  COUNT(*) AS placeholder_customer_count
FROM "Customer"
WHERE "name" = '顧客'
GROUP BY "storeId"
ORDER BY placeholder_customer_count DESC;

-- 3) Created/updated month distribution
SELECT
  date_trunc('month', "createdAt") AS created_month,
  COUNT(*) AS placeholder_customer_count
FROM "Customer"
WHERE "name" = '顧客'
GROUP BY 1
ORDER BY 1;

SELECT
  date_trunc('month', "updatedAt") AS updated_month,
  COUNT(*) AS placeholder_customer_count
FROM "Customer"
WHERE "name" = '顧客'
GROUP BY 1
ORDER BY 1;

-- 4) Placeholder customers with a non-empty phone
SELECT COUNT(*) AS placeholder_with_phone_count
FROM "Customer"
WHERE "name" = '顧客'
  AND NULLIF(BTRIM(COALESCE("phone", '')), '') IS NOT NULL;

-- 5) Detect whether the same store + normalized phone has another Customer with a concrete name.
-- This is evidence for review only; it is NOT an automatic merge or repair rule.
WITH normalized AS (
  SELECT
    "id",
    "storeId",
    "name",
    regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') AS normalized_phone
  FROM "Customer"
), placeholder AS (
  SELECT *
  FROM normalized
  WHERE "name" = '顧客' AND normalized_phone <> ''
), concrete AS (
  SELECT *
  FROM normalized
  WHERE "name" <> '顧客'
    AND NULLIF(BTRIM(COALESCE("name", '')), '') IS NOT NULL
    AND normalized_phone <> ''
)
SELECT
  p."storeId",
  COUNT(DISTINCT p."id") AS placeholder_customers_with_same_store_phone_concrete_name
FROM placeholder p
JOIN concrete c
  ON c."storeId" = p."storeId"
 AND c.normalized_phone = p.normalized_phone
 AND c."id" <> p."id"
GROUP BY p."storeId"
ORDER BY 2 DESC;

-- 6) Duplicate-risk summary for placeholder customers by same-store normalized phone.
WITH normalized AS (
  SELECT
    "id",
    "storeId",
    "name",
    regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') AS normalized_phone
  FROM "Customer"
)
SELECT
  "storeId",
  COUNT(*) AS duplicate_phone_groups
FROM (
  SELECT "storeId", normalized_phone
  FROM normalized
  WHERE normalized_phone <> ''
  GROUP BY "storeId", normalized_phone
  HAVING COUNT(*) > 1
     AND BOOL_OR("name" = '顧客')
) q
GROUP BY "storeId"
ORDER BY duplicate_phone_groups DESC;

-- Any future source-based name recovery must be classified as:
-- A. safely recoverable: one unique same-store, provenance-backed concrete name source
-- B. manual review: multiple or conflicting same-store sources
-- C. unrecoverable: no verifiable source
-- Do not infer from fuzzy name matching, cross-store phone matches, or OAuth display name alone.
