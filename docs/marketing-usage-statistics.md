# Homepage usage snapshot

Initial fallback verified with a read-only production aggregate query on 2026-10-03 (Asia/Taipei), covering booking dates through 2026-10-02. Only aggregate numbers are published. There is no public database endpoint. Production refreshes daily; Preview retains the verified fallback.

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

## Automatic daily refresh

`marketing-usage-server.ts` uses one parameterized read-only query to count all eligible stores and union completed Steamfoot bookings, attended course bookings whose sessions ended before the Taiwan cutoff, and completed SPA bookings. Customers are distinct storeId/customerId pairs across those records. Never replace this label with unique people without a reliable cross-store identity rule.

The daily cutoff is Taiwan midnight at the start of today; the displayed date is yesterday. The SQL was executed read-only against production and reproduced 3 / 328 / 1631 on 2026-10-03. The query returns no customer-identifying data.

Vercel cron runs at `0 17 * * *` UTC (01:00 Asia/Taipei). The endpoint requires the existing CRON_SECRET and skips Preview. A successful database check marks the 24-hour aggregate cache stale, warms it, and invalidates the marketing homepage. Refresh is stale-while-revalidate, so visitors may briefly see the previous result during the refresh. An hourly page revalidation and 24-hour data-cache TTL are a fallback when the cron is delayed.

Failed refreshes do not intentionally invalidate successful results. Next cache can serve the previous value; if no cached value is available, the verified fallback and its original date are returned. The frontend only displays the actual snapshot date; it does not pretend old values were updated today. The frontend statistical explanation has been removed at the user's request; methodology remains documented here. No database migration or schema writes are needed. Production scheduling activates after merge/deployment; it does not run on Preview.

Animation plays once per mount when visible, respects reduced motion, and exposes stable final numbers to assistive technology and server-rendered HTML.
