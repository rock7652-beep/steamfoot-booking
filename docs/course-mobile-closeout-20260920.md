# Course mobile closeout — 2026-09-20

## Scope and evidence

- User supplied nine iPhone screenshots: A owner navigation, September 18/22 day sheets, catalog and course details. These establish pre-change real-device browsing, not date saving or post-change acceptance.
- Below `sm`, calendar cells now show the filtered lesson count instead of truncated times/titles. Date accessible names and day-sheet actions are unchanged. Desktop retains lesson previews.
- Resource rows use a mobile stacked layout with category, duration, debit units, capacity, status and wrapping actions. Desktop retains the original table. Selection, status changes, copying and permissions reuse the existing handlers.
- No server actions, database migrations, subscription dates, A store records, existing bookings or debit rules changed.

## Verification

- TypeScript and focused workspace ESLint passed.
- 14 tests passed across course-workspace-responsive, course-batch2-resources, course-schedule-preview-duty and subscription-form-dates.
- Three new source-level regression checks are **not** browser/layout/transaction proof.
- Schedule create/copy already submits native FormData date values. This round does not claim live date save/reopen acceptance.
- Browser session available here remains at sign-in; the user's phone login is separate. Post-deployment owner browser acceptance and real-device layout verification remain pending.

## Release boundaries

- Retain prior unaffected tests and PR1051 evidence; do not repeat A expiry changes.
- Production restore remains blocked by the existing production PostgreSQL connection and access to the authorized offline restoration environment. No credential searches, password resets or secret extraction workflows.
- Before production: restore and integrity verification, migrations on restored copy, reconcile already-applied TrialCare history without replaying SQL, match migration package and application version. Do not merge main or claim release-ready before these gates pass.
