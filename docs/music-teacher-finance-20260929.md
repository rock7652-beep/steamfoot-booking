# Music teacher / finance integration — preview only

## Implemented
- Separate music 人員管理 (email store accounts) and 教師管理 (teacher profiles / linked LINE member account). New music managers cannot enable a combined teaching identity. Existing mixed identities are not silently migrated; preview store has zero mixed identities.
- Teacher → subject → plan compensation, with precedence: plan override → subject override → teacher default → product ratio. Explicit restore inheritance and whole-teacher restore; qualifications remain independently selected. Changes apply only to newly scheduled classes.
- New music class snapshots include calculationVersion=2 and rule source; substitution captures the actual substitute teacher's rule. Existing snapshots retain their prior rounding/version.
- Version 2 uses immutable purchase listPrice / (points − gifts), never discounted receipts/current catalogue; ambiguous historic prices are blocked for review. Per learner / lesson integer rounding before summing. Free trials use their captured base; teacher leave/no-show is zero, teacher makeup excluded, student no-show/group-forfeited leave counted.
- Monthly report, payment registration and business analysis share the same captured calculator. CLASS is once per session. Monthly details include ending time, per-learner basis and amount. Own-income whitelist includes ending time and paid/unpaid amounts, with no other person's rows or internal notes.
- Separate teacher compensation read/manage and settlement read/confirm/pay permissions; learner payment permissions do not imply these. Each store operator may be limited to selected teachers; payment, correction, notification, history and read paths resolve the teacher from store-scoped records rather than trusting the browser. Whole-store settlement confirmation remains available only to whole-store scope. Delegated staff cannot grant permissions or teacher scope they do not hold. Changes are audited and permission changes invalidate existing caches.
- Partial teacher fee payments: authoritative balance check, same-store transaction/session locking, unique request key replay, recorded expense and correction history retained. No actual bank transfers.
- Learner purchase history: periods, gifts, original/discount/recorded receipts, payment method/date and refunds, scoped to logged-in learner.

## Verification
- Targeted unit/service/UI suite: 150 tests (12 files) and TypeScript passed. Existing sidebar warnings remain, no ESLint errors.
- Preview PostgreSQL rollback transaction passed product/default/subject/plan inheritance, substitute ratio and retention of the earlier captured snapshot.
- Preview staff inventory: one store owner, ten teacher profiles, zero mixed staff/teacher accounts.
- New table has RLS enabled and no browser grants. Advisor reports informational no-policy because access is server-only. No new warning on this table. Existing extension-in-public warning is outside this migration.
- Browser acceptance: the first integration preview exposed separate 人員管理 and 教師管理 entries; final selected-teacher scope preview remains to be deployed at this checkpoint.

## Remaining acceptance / limits
- Teacher frontend remains own-only. Selected-teacher administrative scopes deliberately exclude store-wide analytics fee totals and whole-store settlement confirmation to prevent indirect disclosure.
- Existing mixed identities in other stores require a reviewed account split, not an automatic ID rewrite.
- Historical original price that cannot be proven from the purchase snapshot is deliberately pending review.
- Real LINE teacher/learner switching, multi-user concurrent browser operations and physical iPad use are not claimed as verified by unit tests.
- Production is not merged or migrated.

## Release / rollback
1. Apply `20260929042028_music_teacher_compensation_inheritance`, then `20260929044152_music_teacher_finance_scope`, to the target isolated database before this app version. Both are applied only to steamfoot-preview (`ttworfzgwejdeolegkxl`).
2. Deploy preview branch and verify teacher settings, monthly report and partial-payment UI.
3. Retain Draft PR #1134. No production changes in this task.
4. Rolling back the app to the earlier implementation would ignore v2 original-price rounding and partial payments. Do NOT use a blind app-only rollback after v2 classes/payments exist. Disable finance writes, retain all rows, and use a forward fix or compatible rollback build. Never re-add the prior unique active-payment index when partial payments exist.

## Follow-up verification — 2026-09-29
- Qualification editing and compensation editing now have independent UI controls. An operator with staff management and read-only compensation can update qualifications without submitting any salary fields.
- V2 fixed class fees now exclude free teacher makeup and non-chargeable leave-only sessions; chargeable no-shows / forfeited group leave still earn one class fee.
- Weekly and single-day teacher availability changes acquire the same Store row lock as scheduling, validate existing unfinished sessions, and roll back settings on conflict. The UI lists affected classes; no sessions are cancelled or moved.
- Teacher assignments and availability conflicts show both start and end time.
- This follow-up passed 142 distinct tests across 14 files, TypeScript and changed-file ESLint. No new migration or production data changes.
- Still not claimed: physical iPad, live LINE identity switching, simultaneous multi-user browser acceptance. Changes to rates currently apply to newly scheduled classes only; a future effective-date / already-scheduled bulk repricing flow is not implemented.
