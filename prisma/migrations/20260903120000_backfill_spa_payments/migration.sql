-- Preserve checkout and refund history when SPA operations move from the
-- shared Transaction ledger to the isolated SpaPayment ledger.
--
-- This repair is deliberately scoped to the isolated demo store whose live
-- acceptance flow created the legacy rows. IDs are derived from the legacy
-- transaction and target booking, making the migration safe to retry without
-- duplicating money movements. No production SPA tenant is modified.

WITH legacy_original AS (
  SELECT
    t.*,
    anchor."partyGroupId" AS "anchorPartyGroupId",
    anchor."notes" AS "anchorNotes",
    greatest(coalesce(t."grossAmount", t."originalAmount", t."amount", 0), 0) AS "legacyGross",
    greatest(coalesce(t."netAmount", t."amount", 0), 0) AS "legacyNet"
  FROM "Transaction" t
  JOIN "Store" s
    ON s."id" = t."storeId"
   AND s."industryModule" = 'SPA'
  JOIN "SpaBooking" anchor
    ON anchor."id" = t."bookingId"
   AND anchor."storeId" = t."storeId"
  WHERE t."transactionType"::text <> 'REFUND'
    AND t."storeId" = 'demo-store'
    AND t."status"::text IN ('SUCCESS', 'REFUNDED')
    AND t."paymentStatus"::text IN ('SUCCESS', 'CONFIRMED')
), expanded AS (
  SELECT
    t.*,
    target."id" AS "targetBookingId",
    target."customerId" AS "targetCustomerId",
    target."revenueStaffId" AS "targetRevenueStaffId",
    target."totalPriceSnapshot" AS "targetPrice",
    target."notes" AS "targetNotes",
    count(*) OVER (PARTITION BY t."id") AS "targetCount",
    sum(target."totalPriceSnapshot") OVER (PARTITION BY t."id") AS "targetPriceTotal",
    row_number() OVER (PARTITION BY t."id" ORDER BY target."guestIndex", target."id") AS "targetIndex"
  FROM legacy_original t
  JOIN "SpaBooking" target
    ON target."storeId" = t."storeId"
   AND (
     target."id" = t."bookingId"
     OR (
       t."anchorNotes" LIKE '%|checkout=GROUP|%'
       AND t."anchorPartyGroupId" IS NOT NULL
       AND target."partyGroupId" = t."anchorPartyGroupId"
     )
   )
), raw_allocations AS (
  SELECT
    e.*,
    CASE
      WHEN e."targetCount" = 1 THEN e."legacyGross"
      WHEN e."targetPriceTotal" > 0 THEN round(e."legacyGross" * e."targetPrice" / e."targetPriceTotal")
      ELSE 0
    END AS "rawGross",
    CASE
      WHEN e."targetCount" = 1 THEN e."legacyNet"
      WHEN e."targetPriceTotal" > 0 THEN round(e."legacyNet" * e."targetPrice" / e."targetPriceTotal")
      ELSE 0
    END AS "rawNet"
  FROM expanded e
), allocations AS (
  SELECT
    r.*,
    CASE
      WHEN r."targetIndex" = r."targetCount" THEN
        r."legacyGross" - coalesce(sum(r."rawGross") OVER (
          PARTITION BY r."id" ORDER BY r."targetIndex"
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)
      ELSE r."rawGross"
    END AS "allocatedGross",
    CASE
      WHEN r."targetIndex" = r."targetCount" THEN
        r."legacyNet" - coalesce(sum(r."rawNet") OVER (
          PARTITION BY r."id" ORDER BY r."targetIndex"
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)
      ELSE r."rawNet"
    END AS "allocatedNet"
  FROM raw_allocations r
)
INSERT INTO "SpaPayment" (
  "id", "storeId", "customerId", "bookingId", "revenueStaffId",
  "soldByStaffId", "grossAmount", "netAmount", "paymentMethod", "status",
  "quantity", "paidAt", "refundedAt", "refundReason", "note", "createdAt", "updatedAt"
)
SELECT
  'spa-cutover-' || a."id" || '-' || a."targetBookingId",
  a."storeId",
  a."targetCustomerId",
  a."targetBookingId",
  coalesce(a."targetRevenueStaffId", a."revenueStaffId"),
  a."soldByStaffId",
  greatest(a."allocatedGross", 0),
  greatest(a."allocatedNet", 0),
  CASE
    WHEN a."targetNotes" LIKE '%|settlement=STORED_VALUE|%' THEN 'STORED_VALUE'
    WHEN a."targetNotes" LIKE '%|settlement=PACKAGE|%' THEN 'ENTITLEMENT'
    WHEN a."paymentMethod"::text = 'UNPAID' THEN 'OTHER'
    ELSE a."paymentMethod"::text
  END::"SpaPaymentMethod",
  CASE WHEN EXISTS (
    SELECT 1
    FROM "Transaction" refund
    WHERE refund."refundOfTransactionId" = a."id"
      AND refund."bookingId" = a."targetBookingId"
      AND refund."transactionType"::text = 'REFUND'
      AND refund."status"::text = 'SUCCESS'
  ) THEN 'REFUNDED' ELSE 'SUCCESS' END::"SpaPaymentStatus",
  1,
  coalesce(a."paidAt", a."createdAt"),
  (
    SELECT max(refund."refundedAt")
    FROM "Transaction" refund
    WHERE refund."refundOfTransactionId" = a."id"
      AND refund."bookingId" = a."targetBookingId"
      AND refund."transactionType"::text = 'REFUND'
      AND refund."status"::text = 'SUCCESS'
  ),
  (
    SELECT refund."refundReason"
    FROM "Transaction" refund
    WHERE refund."refundOfTransactionId" = a."id"
      AND refund."bookingId" = a."targetBookingId"
      AND refund."transactionType"::text = 'REFUND'
      AND refund."status"::text = 'SUCCESS'
    ORDER BY refund."refundedAt" DESC NULLS LAST, refund."createdAt" DESC
    LIMIT 1
  ),
  coalesce(a."note", 'SPA payment cutover'),
  a."createdAt",
  a."updatedAt"
FROM allocations a
ON CONFLICT ("id") DO UPDATE SET
  "status" = EXCLUDED."status",
  "refundedAt" = EXCLUDED."refundedAt",
  "refundReason" = EXCLUDED."refundReason",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "SpaPayment" (
  "id", "storeId", "customerId", "bookingId", "revenueStaffId",
  "soldByStaffId", "grossAmount", "netAmount", "paymentMethod", "status",
  "quantity", "refundOfPaymentId", "paidAt", "refundedAt", "refundReason",
  "note", "createdAt", "updatedAt"
)
SELECT
  'spa-cutover-' || refund."id" || '-' || refund."bookingId",
  refund."storeId",
  refund."customerId",
  refund."bookingId",
  coalesce(sb."revenueStaffId", refund."revenueStaffId"),
  refund."soldByStaffId",
  abs(coalesce(refund."grossAmount", refund."originalAmount", refund."amount", 0)),
  abs(coalesce(refund."netAmount", refund."amount", 0)),
  CASE
    WHEN sb."notes" LIKE '%|settlement=STORED_VALUE|%' THEN 'STORED_VALUE'
    WHEN sb."notes" LIKE '%|settlement=PACKAGE|%' THEN 'ENTITLEMENT'
    WHEN refund."paymentMethod"::text = 'UNPAID' THEN 'OTHER'
    ELSE refund."paymentMethod"::text
  END::"SpaPaymentMethod",
  'SUCCESS'::"SpaPaymentStatus",
  1,
  'spa-cutover-' || refund."refundOfTransactionId" || '-' || refund."bookingId",
  coalesce(refund."paidAt", refund."refundedAt", refund."createdAt"),
  coalesce(refund."refundedAt", refund."createdAt"),
  refund."refundReason",
  coalesce(refund."note", 'SPA refund cutover'),
  refund."createdAt",
  refund."updatedAt"
FROM "Transaction" refund
JOIN "Store" s
  ON s."id" = refund."storeId"
 AND s."industryModule" = 'SPA'
JOIN "SpaBooking" sb
  ON sb."id" = refund."bookingId"
 AND sb."storeId" = refund."storeId"
JOIN "SpaPayment" original
  ON original."id" = 'spa-cutover-' || refund."refundOfTransactionId" || '-' || refund."bookingId"
WHERE refund."transactionType"::text = 'REFUND'
  AND refund."storeId" = 'demo-store'
  AND refund."status"::text = 'SUCCESS'
  AND refund."refundOfTransactionId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
