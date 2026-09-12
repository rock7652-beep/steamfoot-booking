# Preview e507aeff verification — 2026-09-12

Status: NOT READY for Production. No Production changes performed.

Deployment: dpl_5RUEYtaA4byPe9ASyo9d5fzKJAYV, READY, commit e507aeffabffb24158eda91c97464a69f6e4e704. Browser used the branch alias; rendered build footer 2026/09/12 15:45 staging.

## Verified

- Public pricing: paid monthly bookings unlimited; branch subscriptions explicitly separate.
- Branded HQ login renders; unauthenticated scoped revenue route redirects to HQ login retaining store context.
- Existing test OWNER session remains valid. SPA home, revenue, resources, plans and staff calendar load; customer details open in a same-page drawer.
- Complete release schema executed twice inside an isolated schema in the allowlisted test project ttworfzgwejdeolegkxl, followed by complete fingerprint. Passed and rolled back. Subsequent to_regnamespace confirmed rehearsal schema absent. This is an empty-schema replay, not a restored Production rehearsal.
- Created test booking cmty3k19r0001js04yu2i3gtq with note release-review-e507aeff-1600, 16:00–17:00, then rescheduled to 17:00–18:00. Browser remained on scoped SPA schedule; database confirmed times.
- Native time input fill alone did not update confirmation state. Keyboard ArrowUp and Tab produced matching confirmation summary; only then was the change submitted. Do not classify the fill limitation as a proven application defect.
- Cancel confirmation displayed resource release wording. Cancelled the test booking; DB status CANCELLED, cancelledAt 2026-09-12 08:04:45.391 UTC, historical serviceLocationId retained. No payment created in this round. Cancelled test history retained.

## Remaining release gates

Additional Steamfoot review: eight targeted test files passed, 48 tests total (route isolation, SPA model isolation, paid completion, attended-people completion, customer read/write synchronization, reschedule contract, external integration isolation and FEFO selection). These are automated tests, not authenticated browser-flow evidence.

Current branch-alias SPA OWNER cannot access /s/staging/admin/dashboard. Preview runtime logs explicitly report AppError FORBIDDEN, digest 889033938. Access isolation is enforced, but the UI renders a generic system-unavailable message; permission-error presentation remains a follow-up. The authenticated HQ tab is bound to the older kfr28ecai deployment (900bc946), so its session cannot establish current-version HQ/Steamfoot acceptance. No role or cookie manipulation performed.

Supabase connected project inventory exposes only steamfoot-preview and steamfoot, both healthy; no restored-copy project is available in that inventory. Connected tools provide no backup-list/download or backup-to-new-project restore operation. create_branch explicitly excludes production data and is not a valid substitute for backup restoration. restore_project must not be used as if it were backup restoration. Actual backup recovery evidence remains unavailable.

- Restore an actual Production backup into an isolated target; verify data and rehearse upgrade against that restored baseline.
- Integrated Steamfoot critical-flow regression on the current version with appropriate test authentication.
- Remaining current-version SPA write coverage (including refund/group/payment flows) must not be inferred from prior-version passes or read-only checks.
- Production migration scope, execution and rollback readiness remain subject to rollout gates; no merge or Production migration performed.
