# Complete calendar roster batch reads — PR #1479

The calendar prepares every selected course's full roster before appearing, then opens classes directly from that page-owned data. Each learner retains their own trial, purchase, period and balance; teaching-item titles remain independent of purchases. The previous per-session implementation repeatedly executed the full detail reader and store authorization. This update replaces those database reads with a fresh batch owned by one authorized calendar request.

## Implementation and boundaries

- `preloadCourseCalendarRosters` freshly authorizes `booking.read` once and verifies the exact store before entering `withCourseCalendarRead`. Its server-only detail projection is shared with the original single-session action, which still authorizes every independent call.
- The scope batches selected sessions, bookings, waitlists, teaching-item versions and sports session rules. Customer metadata, attendance history, confirmed purchases, renewals, native leave evidence and lesson assignments are read once for the selected participants. The original per-booking DTO/financial/period projection is retained.
- Sports and music balance providers read a superset of participant cards once, then retain each learner's membership, item, date, expiry, join date, reservation holds and period rules. Transaction/custom clients and calls outside the exact scope do not reuse the batch.
- There is no global, persistent or cross-request financial cache. Ordinary mutation entry points still check current rights, store policies, revisions and balances under their original transactions. Series expansion remains outside the read scope; writes invalidate the old client snapshot and prepare a new one.
- Beauty already batches roster groups. This update runs independent final dashboard reads concurrently, preserving permission/feature gates and all returned fields. The full-page measurement does not demonstrate a meaningful beauty speedup.

## Source and test environments

Baseline: `26323a8ffdd137a0628d88bf64a46b055c4b60bd`, `dpl_E7G9RTfvZ41x9P6JoMgS35vCXXsy`.

Application candidate: `07d5202a9a410ec7d4f5140ce90ef3d14266a338`, `dpl_AemBiWFJwHy6dCamRrsikwo57KMT`, READY. Both immutable deployments were accessed through normal owner login using the same three isolated stores. No booking, attendance, purchase or payment was submitted. Formal production was not promoted.

`scripts/qa/calendar-roster-batch-browser.mjs` runs three paired navigations per module, alternating deployment order. Calendar-ready requires its first ready marker to indicate that the complete map exists. All prepared payloads are compared with baseline using canonical object-key ordering (array order and every value preserved): 61 sports classes, 149 music classes, and all 101 beauty group/day snapshots covering 11 visible appointments. This is full-map comparison, not just the one class opened for timing.

## Results

All three paired complete maps matched in all modules. Candidate open/reopen/responsive/month-switch checks produced 22 complete roster openings in **11–472 ms**, with **zero initial detail requests** in the first 500 ms after each click. A cross-month trial/card mixed roster matched the original independently authorized detail API. Dialog bounds passed at 1366×900, 1024×768, 768×1024 and 390×844; these are Chromium simulations, not physical Safari/iPad acceptance.

| Module | Selected records | Baseline page-ready (3 samples, ms) | Batch page-ready (3 samples, ms) | Median change |
| --- | ---: | --- | --- | --- |
| Sports | 61 | 7181 / 6810 / 6690 | 1484 / 1368 / 2387 | 6810 → 1484 ms, 78.2% lower |
| Music | 149 | 22741 / 22453 / 23104 | 2782 / 2401 / 2474 | 22741 → 2474 ms, 89.1% lower |
| Beauty | 11 | 2312 / 2213 / 2057 | 2213 / 2085 / 2201 | 2213 → 2201 ms, effectively unchanged |

The backend batch stage logged 166–222 ms for 61 sports classes (20 shared read operations) and 432–559 ms for 149 music classes (37 shared read operations). These stage times begin **after authorization** and exclude the remaining page work, transport, client code and rendering. Shared operations are not a physical SQL-statement count. A sampled sports page request logged one `course-manager` authorization, replacing per-class authorization.

The full initial page is **not consistently under one second**. Three paired runs, including the first sample, are limited evidence through a remote browser/proxy, not an SLA. Beauty's previous ~3-second result also included the rest of its dashboard; this small paired run supports no meaningful beauty page speedup.

## Verification, isolation and cleanup

Application-source CI [#3688](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41267652332) passed ESLint, typecheck, targeted tests and full Vitest: **15,066 passed / 257 skipped**. Isolated sports shared-card/notification PostgreSQL acceptance and music makeup database audit also passed. New regressions cover full roster/period/payment parity across classes, changing expiry/join dates, holds, learner isolation, custom transaction clients, denied scopes, rejected reads, concurrent stores and fresh subsequent requests.

The cohosted music November dataset still contains pilot imports restricted to another exact Preview branch. That guard was retained. September's existing group fixture was used for the complete 149-class comparison. A production **read-only count** confirmed zero `yjy-pilot-card:` records in `store-lubymusic`; this is not authenticated production UI acceptance.

After testing: three QA users suspended with password hashes cleared, three QA staff inactive, private browser input removed, obsolete baseline share revoked, and only the candidate share retained with 23-hour expiry. Scoped business counts before/after were unchanged: CoursePurchase 125, CoursePointEntry 933, CourseBooking 621, BeautyPayment 90, BeautyLedger 126.

The adjacent JSON contains timings, full-map hashes, checks and limits. Local synthetic screenshots are under `/workspace/reports/calendar-roster-batch-20261101/`. Evidence/QA-only follow-up commits do not change the tested application source; final PR-head checks remain authoritative for merge readiness.
