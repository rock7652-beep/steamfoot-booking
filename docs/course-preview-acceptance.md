# Course Stage 1 Preview acceptance

2026-09-15: Desktop scheduling acceptance passed. Draft PR only; no production merge.

Verified code: d49c84fb9597695e06e5ab75f59cb70f3240c503.
Deployment: dpl_2DPB823MFZQZE3FxoYGB5Utb17aU, Vercel READY.
Preview: https://steamfoot-booking-git-codex-cour-7f6935-rock7652-2111s-projects.vercel.app/hq/dashboard/courses
Select 課程排課驗收店 using the test HQ account.

## Fixed during acceptance

- Switching from course to a non-course store left the course URL showing 404. Non-course requests now return to the dashboard.
- Switching into course with router.refresh left a blank layout during the module redirect. Successful HQ store switching now loads a fresh document. The course dashboard also renders the course workspace.
- Re-tested course -> steamfoot -> course -> SPA -> course on the final deployment: all main views rendered correctly.

## Real browser and database evidence

- Secure HQ login verified as Staging Admin.
- Created 2 rooms and 2 templates through the UI.
- Single session created and shown in day details.
- Weekly scheduling created 4 sessions: Sep 16, 23, 30 and Oct 7, 18:00 Taipei.
- Month navigation displayed the October session. Refresh retained data.
- Different coach in occupied room rejected with a room conflict.
- Same coach in a different room rejected with a coach conflict.
- Adjacent 19:00 session accepted after an 18:00-19:00 session.
- Batch starting Sep 9 and conflicting Sep 16 rejected completely; SQL verified zero Sep 9 rows.
- Double-click create on Sep 17 produced exactly one session, verified in UI and SQL.
- Seven total test sessions, all in the dedicated COURSE store. Two synthetic coaches; no real contact identities.
- Steamfoot booking calendar and SPA schedule rendered with existing data. These were read-only smoke checks, not a repeat of their entire booking/payment acceptance.
- Desktop viewport had no horizontal document overflow.
- Vitest: course-actions, course-scheduling, preview-external-integration-isolation (12 passed); industry-booking-route-isolation (7 passed).
- Earlier real SQL checks passed room/coach exclusion, adjacency, idempotency uniqueness, and cross-store foreign key protection.
- Build preflight verifies both DB URLs identify isolated steamfoot-preview ttworfzgwejdeolegkxl and CourseSession can be read. No credentials logged.

## Scope and release limits

This is Stage 1 staff scheduling. Points purchases, shared cards, learner bookings and attendance deductions remain later work. Mobile end-to-end acceptance and complete legacy payment/deduction regression are not claimed by this report. A production release requires its own final integration check against current main.

No production migration, merge, real customer notification or production data mutation was performed by this course task.
