# SPA scheduling acceptance — 2026-09-10

Scope: PR #970, `codex/hq-module-foundation`; Preview and test project only. No production deployment or legacy Booking/Transaction/Treatment writes.

## Delivered

- Dedicated create/update/cancel actions with store permission and ACTIVE installation checks.
- Service location compatibility across all selected treatments; automatic assignment only when one location is applicable.
- Staff skill, weekly availability and exception checks; service buffers included in occupation.
- Store-scoped transaction advisory lock plus PostgreSQL exclusion constraints for staff/location overlap.
- Optimistic timestamp check for edits/cancellation; atomic item replacement and rescheduling; cancellation retains history.
- Schedule with 15/30-minute intervals, Taipei current-time line, empty-cell creation, existing RightSheet component and service/time/customer/confirm flow.
- Existing null location values displayed as pending assignment; no backfill.

## Verified

- TypeScript and changed-file ESLint passed.
- 8 scheduling/isolation tests and 11 mocked action tests passed. Mocked action tests do not prove actual PostgreSQL concurrency.
- Test DB preflight: no invalid time ranges or active staff overlaps.
- `spa_booking_resource_constraints` applied through Supabase to test project `ttworfzgwejdeolegkxl`. Existing Prisma migration history was not edited. SQL is retained in `prisma/reconciliation/spa-booking-resource-constraints.sql`; review/apply this explicit reconciliation before any future production rollout, which is not authorized here.
- `scripts/test-spa-resource-constraints.sql` passed against a transaction-local copy of the actual table including its constraints: staff overlap, location overlap, adjacent booking, failed edit rollback, cancellation release, retained history. Transaction rolled back, leaving no probe bookings.
- Vercel Preview for application commit `90f7bfe1e0c06f703d22c4525282bb3bd83ef1fe` reached READY, target Preview.

## Test fixture

Only `store-spa-module-qa-20260903` was provisioned for acceptance: one named test service location, links to its three existing treatments, skills and seven weekly availability rows for its existing active staff. Existing customers/staff were not changed. Module installation became ACTIVE after fixture checks. `demo-store` was left unchanged. Fixture is retained so browser acceptance can continue.

## Not yet verified / remaining

- Cloud browser repeatedly returned `CDP operation refresh tabs timed out after 20000ms`, including a fresh tab and documented alternate DOM API. No authenticated Preview browser operation or screenshot was completed.
- Actual simultaneous application requests, Preview creation/edit/cancellation, input preservation in browser, and rendered desktop/iPad layout remain unverified.
- This stage holds one staff and one service location for the whole booking. Multi-guest and service-by-service resource switching are not claimed.
- Checkout, payments, customer front-end and complete five-page workflow are outside this scheduling acceptance and remain separate work.
- PR had existing base-branch conflicts and HQ onboarding review findings before this change; no merge attempted.
