# Calendar-owned complete rosters (PR #1479)

> Historical per-session preloading stage. The latest batch implementation and paired verification are recorded in [calendar-roster-batch-20261101.md](calendar-roster-batch-20261101.md).

## Acceptance boundary

The calendar prepares every non-rental session's full roster before returning its page/month result. Opening a class consumes that exact snapshot on the first render and issues no initial detail request. The prior draft's name-only preview and `核對中` layout were rejected and removed; their timings do not establish this requirement.

The preparation covers the selected calendar month, not the store's unbounded history. Native sports and music normal store schedules use the original authorized roster-only reader, with two concurrent workers. Beauty reads selected groups in one authorized batch, preserving members of those groups outside the month, then projects exact group/day rows. Cross-store and explicit read-only view contexts retain their existing read path and do not invoke the writable-store detail reader. Rentals keep their separate flow.

Financial query/projection logic and writes retain the original checks. Snapshots belong to the current authorized page/month and store; there is no persistent financial cache. Local writes invalidate the old calendar snapshot and fetch a replacement. Background/focus synchronization remains enabled, and the server still checks current rights, balances, seats and revisions on every mutation.

## Validation method

`scripts/qa/calendar-roster-preload-browser.mjs` uses normal owner login in three isolated synthetic stores. It records the calendar's first ready marker and total page-ready time separately from click-to-complete-roster time. For the first 500 ms after each click it aborts original detail endpoints and requires zero attempted reads. It compares the complete page-owned snapshot against the original authorized API response by SHA-256 (beauty omits only its independent `readVersion` fingerprint). No booking, purchase, attendance or payment is submitted.

The browser checks close/reopen, desktop 1366×900, landscape tablet 1024×768, portrait tablet 768×1024, and narrow viewport 390×844. A sports month switch checks the existing mixed trial/card fixture. Screenshots use synthetic accounts and customers. These are Chromium simulations, not physical Safari/iPad validation.

## Status

Source implementation: `0270b4fbb005e8d3316f2328f7b726e01b5fc749`. Isolated Preview: `dpl_FY2cA16YcR3TVCuJbR2NqUsRMV9x`, hnd1. Formal production remains unchanged by this PR.

The real-browser run completed for sports (61 classes), beauty (11 appointments), and music (149 classes, September 2026). All calendars first appeared with their full roster map ready. Across 19 openings, full roster DOM appeared in 12–493 ms with zero attempted initial detail requests. Original authoritative payload hashes matched, including the sports trial/card mixed fixture after switching months. All four viewport bounds checks passed in all three modules. Evidence is in the adjacent JSON and local screenshots under `/workspace/reports/calendar-roster-preload-20261101` and `/workspace/reports/calendar-roster-preload-music-final-20261101`.

| Module | Complete selected records | Initial calendar-ready | Full roster click-to-ready |
| --- | ---: | ---: | ---: |
| Sports | 61 | 7.575 s | 12–23 ms |
| Beauty | 11 | 2.998 s | 12–493 ms |
| Music | 149 | 18.271 s | 18–35 ms |

These are remote Chromium/proxy measurements, one initial-page sample per module, not production-user latency guarantees. The first complete beauty opening includes client chunk activation. Initial page cost grows with roster count: the implementation satisfies page-owned complete roster delivery, but **does not establish sub-second initial calendar load**. Keep this performance limitation visible when reviewing release readiness.

The cohosted music November dataset contains separate pilot imports restricted to another exact Preview branch. Preparing that month correctly hits its existing isolation guard; the calendar fails closed instead of inventing partial readiness. No guard was disabled, no pilot data altered, and no account was granted extra scope. September's existing synthetic group fixture has no such pilot records and was fully read with original API parity. November pilot behavior therefore remains an explicit integration limitation of this isolated branch.

Application source `0270b4fb`: CI lint, typecheck, targeted tests, full Vitest baseline (15,060 passed / 257 skipped), and isolated shared-card PostgreSQL acceptance all passed. A final narrow follow-up preserves child-store background month reads without invoking the writable-store roster reader; its six read/projection regressions passed locally. Later source and final CI status must be checked on the PR head rather than inferred from this older run.

Cleanup: all three QA users suspended with password hashes cleared, three QA staff inactive, private browser input files removed, and the older candidate share revoked. Scoped business counts before/after were unchanged: CoursePurchase 125, CoursePointEntry 933, CourseBooking 621, BeautyPayment 90, BeautyLedger 126. No formal production merge/promotion was performed. PR stays draft because initial calendar latency and the isolated November pilot integration remain visible review limitations.
