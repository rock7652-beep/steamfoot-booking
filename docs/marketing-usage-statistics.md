# Homepage usage snapshot

The public homepage reads one production aggregate via Next's persistent Data Cache. It does not publish customer records or offer a public database endpoint. Preview and cold-cache failures use a separately verified historical fallback, with that fallback's original date. The numeric values are not UI constants.

## Metrics and cutoff

- 使用店家（間）: non-demo, non-archived, non-test ACTIVE stores on a non-EXPERIENCE plan, plus ACTIVE/TRIAL EXPERIENCE stores with an activated, currently valid TRIAL period. An expired or not-yet-activated trial is excluded.
- 服務顧客（位）: distinct (storeId, customerId) pairs with qualifying completed services. This is not every created customer and is not cross-store unique people. Renaming the label does not change the calculation.
- 完成服務（人次）: completed Steamfoot bookings use attendedPeople, falling back to people for older records; completed SPA bookings use people; attended course bookings whose non-cancelled sessions have ended count one each. Test-marked customers/bookings are excluded.
- 自動提醒（則）: recorded successful automatic customer appointment, class, plan-expiry and remaining/used-up balance reminders. A logical reminder counts once even when retried. SENT plus a non-null sentAt records platform acceptance, not receipt or reading.

Every metric uses the same eligible-store set. The service cutoff is the start of today in Asia/Taipei. Service dates must be before that date; course end timestamps and reminder sentAt must be before that exact Taiwan-midnight instant. The snapshot's asOf is the covered date (yesterday). The UI renders `每日更新｜資料更新至 YYYY/MM/DD` directly from that cached snapshot, never from the visitor's clock.

## Reminder producer allowlist

| Source | Required classification | Deduplication |
| --- | --- | --- |
| MessageLog: Steamfoot appointment | ruleId + bookingId + triggerAt; rule trigger CUSTOM, BEFORE_BOOKING_1D or BEFORE_BOOKING_2H | storeId + ruleId + bookingId + triggerAt |
| MessageLog: class appointment | course-reminder: stable ID, courseBookingId + triggerAt | stable ID |
| MessageLog: plan expiry | plan-expiry-14-days: or plan-expiry-7-days: stable ID | stable ID, including wallet |
| MessageLog: course expiry | course-expiry: stable ID + courseCardId | stable ID |
| MessageLog: course balance | course-low-balance: or course-used-up: stable ID + courseCardId | stable ID |
| SessionBalanceNotification | LAST_SESSION or PLAN_USED_UP | walletId + type |

CUSTOM is the existing relative appointment-rule type, not an unrestricted custom-message counter. Every included row must be SENT, have sentAt, precede the snapshot cutoff, and belong to an eligible store and a non-test customer. Test-marked booking notes are also excluded. A booking's later cancellation or a reminder setting's current disabled state does not erase a previously recorded send.

The producer allowlist excludes manual sends, template/smoke/booking tests, staff/manager notices, TrialCare return-marketing journeys and failed/skipped/pending/unknown delivery states. TrialCare, course coach and monthly staff notices can be mirrored into MessageLog, so they must not be summed as separate sources. SPA's demo-only notification producers are excluded; no production SPA reminder source is invented.

Coverage is deliberately limited to identifiable successful records. Earlier booking logs without triggerAt, deleted classification links, sends whose result was not persisted and waitlist notifications without a durable delivery log cannot be reconstructed reliably. MessageLog has no immutable historical test/environment marker: designated demo/test stores and marked test customers/bookings are filtered, and explicit test producer shapes are excluded. The public explanatory line was removed at the owner's request on 2026-10-08. The approved `自動提醒` metric and this documented limited-coverage methodology are unchanged; the UI does not add a replacement tooltip or explanation.

## Verified historical fallback

A read-only production aggregate on 2026-10-08 (Asia/Taipei), through 2026-10-07, verified:

| Stores | Served customer records | Completed people | Recorded automatic customer reminders |
| ---: | ---: | ---: | ---: |
| 5 | 338 | 1,698 | 641 |

The read-only audit reconciled the approved total against appointment, plan-expiry and balance records and checked retry de-duplication. It excluded marked test data, unsuccessful sends, sends after the daily cutoff and rows without the required automatic-reminder identity. Staff/manager and TrialCare sources are outside this metric. It does not claim production reminder history for a module without qualifying evidence. Only the approved public totals are preserved here; no names, phone numbers, message bodies, individual customer IDs or internal diagnostic counts are published.

These verified values only replace the historical outage/Preview fallback. Production continues calculating all four values dynamically. Do not turn missing/invalid reminder evidence into zero; a failed aggregate retains the verified fallback and its original date.

## Automatic daily refresh

`marketing-usage-server.ts` uses a single parameterized read-only SQL statement and caches the successful result with `unstable_cache`. Next's Data Cache persists results across requests and deployments. `marketing-usage-v4` isolates the four-metric snapshot from older three-metric cache entries.

The existing Vercel cron runs at `0 17 * * *` UTC (01:00 Asia/Taipei), requires CRON_SECRET, and skips Preview. It first verifies that the full aggregate succeeds, marks the tag stale with stale-while-revalidate, warms the cache and revalidates the marketing page. The existing hourly page revalidation and 24-hour data-cache TTL remain fallbacks if cron is delayed. A stale visitor may briefly see the previous snapshot and its unchanged date; the cron response is not proof that every visitor already sees a newer snapshot.

Failed refreshes do not intentionally invalidate successful results. If the cache is unavailable, the verified fallback is returned. No new migration, database write, scheduler, real notification or production DDL is introduced.

## UI verification

The metric component uses four desktop columns and a 2×2 mobile grid, with large numbers and smaller units. Server-rendered/accessibility text contains stable final values. Its existing once-per-mount animation respects reduced motion. Tests verify the persisted date, labels/units, unknown-count rejection and SQL semantics using synthetic in-memory data. Visual verification uses the real component and synthetic values; it is not a logged-in business-flow or real-device test.
