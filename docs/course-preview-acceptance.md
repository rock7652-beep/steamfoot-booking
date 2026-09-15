# Course Stage 1 Preview acceptance

Status: INCOMPLETE — do not merge or describe as browser accepted.

Verified deployment: dpl_RcPt6oWx4jc7g2urVnMnAgr1aEmR, commit 8b3845f4028d1786618ddcbed6b11937ca643b18. Vercel READY.

## Completed

- Build-side read-only verification: DATABASE_URL and DIRECT_URL both identify steamfoot-preview (ttworfzgwejdeolegkxl); CourseSession is readable. No credential values or raw DB errors logged.
- Stage 1 additive SQL applied through Supabase to this test project only. Three course tables have RLS enabled; all 15 constraints validated. Prisma migration ledger was not rewritten.
- Dedicated COURSE test store: slug course-qa-20260915, id course-qa-3635bb5a-1265-4977-bcd1-0471d4755bc7. Two synthetic coaches with no passwords, email, phone or external messaging identity. Existing stores were not converted.
- Real PostgreSQL checks passed: create session, room overlap rejected, coach overlap rejected, adjacent interval accepted, duplicate request key rejected, cross-store room rejected. All test catalogue/session inserts rolled back. Test store/coaches persist for browser acceptance.
- Targeted Vitest: course-actions, course-scheduling, preview-external-integration-isolation: 12 tests passed.
- Build preflight mock tests: expected test URL accepted; missing/production URL rejected without reads; production environment and other branches skipped without reads.

## Remaining

- Browser is at /hq/login on the course branch Preview; authenticated UI acceptance has not started. Need authorized test HQ sign-in, then select the dedicated test store.
- Verify room/template creation, single and weekly schedule, cross-month navigation, double submit, refresh persistence, actual UI conflicts, and desktop/mobile behavior.
- Verify existing STEAMFOOT/SPA critical flows in the test environment.
- PR has a merge conflict against newer main; resolve before eventual release, preserving both changes.
- No production migration, merge, real customer notification, or production data mutation performed in this course task.
