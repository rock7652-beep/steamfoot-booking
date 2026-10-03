# Homepage usage snapshot

Verified with a read-only production aggregate query on 2026-10-03 (Asia/Taipei), covering booking dates through 2026-10-02. Only aggregate numbers are published. No public database endpoint or automatic refresh is added.

| Metric | Value | Definition |
| --- | ---: | --- |
| 正式使用門市 | 3 | Non-demo, operatingStatus ACTIVE, plan other than EXPERIENCE |
| 已服務顧客名單 | 328 | Distinct customerId with a qualifying completed booking, per-store records; not cross-store unique people |
| 累計完成服務 | 1,631 人次 | Sum attendedPeople, falling back to people when older records lack attendedPeople |

Earliest qualifying booking date: 2026-04-28. Latest: 2026-10-02. CourseBooking and SpaBooking currently contain no records. The trial course store is excluded. This snapshot covers completed Booking services only; revisit all module tables when updating it.

Read-only audit query (no names, phone numbers or individual IDs are returned):

```sql
WITH eligible AS (
  SELECT id FROM "Store"
  WHERE NOT "isDemo" AND "operatingStatus" = 'ACTIVE' AND plan <> 'EXPERIENCE'
), served AS (
  SELECT b.* FROM "Booking" b
  JOIN eligible s ON s.id = b."storeId"
  JOIN "Customer" c ON c.id = b."customerId"
  WHERE b."bookingStatus" = 'COMPLETED'
    AND b."bookingDate" < DATE '2026-10-03'
    AND c.name !~* '測試|驗收|test|demo'
    AND COALESCE(b.notes, '') !~* '驗收|測試預約|test booking|demo'
)
SELECT (SELECT count(*) FROM eligible) AS stores,
  count(DISTINCT "customerId") AS customer_records,
  sum(COALESCE("attendedPeople", people)) AS completed_people,
  min("bookingDate") AS earliest_service,
  max("bookingDate") AS latest_service
FROM served;
```

Update the snapshot and displayed date together only after rechecking production aggregates and module coverage. Do not replace the customer-record label with unique people without a reliable cross-store identity rule. Animation plays once per mount when visible, respects reduced motion, and exposes stable final numbers to assistive technology and server-rendered HTML.
