# Course pre-merge review — 2026-09-16

Status: NOT ready to merge. No production mutations or deployment.

## Verified
- User accepted latest test-site UI; this is user acceptance, not an automated browser replay.
- 52 targeted booking, attendance correction, purchase action, access and LIFF routing tests passed on 5d852f8.
- Preview SQL found no negative card balance or holds exceeding remaining, and no cross-store booking/session references.
- Main 5eea05ce integrated into the course branch locally. Sidebar conflict resolved retaining operation-guide feature and course module type.
- Guide module type now accepts course; existing steamfoot/SPA guides are not presented as course instructions.
- Integrated TypeScript passed after regenerating main and SPA Prisma clients.
- Trial-care plans/delivery and guide catalog: 30 tests passed. The two new main-branch SPA imports have explicit module/store gates; reviewed freeze baseline updated and its test passed.

## Remaining gates
- CDP tabs refresh still times out after 20 seconds; no authenticated end-to-end replay on this revision.
- CoursePurchase currently has zero Preview orders. Purchase → confirmation → card issuance has action tests but NO real transaction acceptance evidence.
- Actual LIFF login on LINE and full cancellation → rebooking → attendance correction/batch replay remain outstanding for the newly integrated portal.
- operation-guide DOM tests could not start because this local shared node_modules lacks jsdom. This is an environment failure, not a pass.
- Production read-only schema check returned no CoursePointPlan, CoursePointCard, CoursePurchase or StaffMemberLink.courseMemberEnabled. Production schema rollout must precede enabling courses; production migration allowlist is not silently expanded.
- Course DDL is split between prisma/migrations (base scheduling and points) and four supabase/migrations patches (categories, details, attendance/contacts, portal purchases). Release execution must account for both histories and order.
- Cloudflare excluded by user instruction; not marked passed.

## Passwords
21 explicitly identified staging/course/SPA demo accounts were reset and hash verification passed. Other accounts without confirmed test provenance were left unchanged after automatic approval review rejected a database-wide reset. Passwords are communicated privately, not committed here.
