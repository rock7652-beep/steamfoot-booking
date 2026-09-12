# SPA release verification — 2026-09-12

Verdict: NOT READY for Production. Assessed application commit 5312b1c5e8fbd13849e1783221f1bcb75667018d; no Production changes or database writes during this run.

## Current evidence
- Preview was READY at the assessed commit. Authenticated store sidebar opened the scoped SPA schedule.
- 15-minute mode exposed the 10:15 slot; switching back to 30 minutes worked.
- Existing booking opened the right-side detail panel. Cancellation confirmation displayed resource-release wording and Confirm/Keep controls. Keep was chosen; the booking was not cancelled or charged.
- Targeted command: npx vitest run src/__tests__/spa-*.test.ts src/__tests__/industry-booking-route-isolation.test.ts. Result: 37 files passed, 2 failed; 257 tests passed, 2 failed.

## Blocking findings
1. industry-booking-route-isolation.test.ts still requires redirect("/dashboard/spa-schedule") from the home page. The approved SPA daily overview intentionally replaced this redirect. Update the contract to verify isolated SPA overview rendering and preserve Steamfoot routing, not restore the removed redirect.
2. spa-shared-import-freeze.test.ts detects two unreviewed shared dependencies: dashboard/page.tsx -> spa-home and lib/database-url.ts -> spa-preview-pool. Review both module boundaries and preserve the isolation gate; do not blindly expand its allowlist.
3. A non-mutating git merge-tree against fetched origin/main reports conflicts in six files: src/app/(auth)/login/page.tsx; src/app/(dashboard)/dashboard/customers/[id]/edit/page.tsx; src/app/(dashboard)/dashboard/revenue/page.tsx; src/app/hq/login/page.tsx; src/app/page.tsx; src/components/sidebar.tsx. No merge was applied or pushed.

## Remaining acceptance
Latest-commit create/reschedule/cancel-rebook/settlement/refund/group write acceptance, iPad viewport recheck, and live Steamfoot regression are not passed by this run. Historical acceptance stays attributed to the commits in commerce-preview.md and the PR body. Stop at these failed gates before adding financial fixtures.

## Release preparation
Resolve conflicts while preserving current Steamfoot changes and approved SPA behavior, repair the two failing gates, then verify the resulting Preview. The release runner documented in docs/spa-release-readiness-20260911.md is test-project guarded; Production schema rollout, backup/recovery readiness and HQ provisioning still require explicit evidence. Cloudflare remains excluded per user scope. Do not use schema reset, ledger rewriting or table removal as rollback.

## Integration repair — 2026-09-12
- Integrated main `0f91a605c9f22c1031b5ce4bfc3cb04cf2af70d1` into the PR branch in an isolated worktree. The six conflicts are resolved, preserving SPA scoped navigation and approved login branding alongside main's navigation feedback, HQ mobile positioning, authorized customer edit query and Steamfoot cashbook shortcut.
- Replaced the obsolete SPA-home redirect assertion with the approved separate-home contract. Reviewed the two shared boundaries explicitly; the import freeze remains exhaustive. Added runtime home tests covering denied permissions, authorized store scoping, identity restriction and unavailable-data display. Added shared database-URL negative tests for Production/development/other branches without connecting to a database.
- Main's three older brand-copy assertions now check the approved Logo component and login headings/copy.
- Targeted SPA/industry suite: 40 files, 266 tests passed. Full Vitest: 469 files passed, 3 skipped; 4,245 tests passed, 32 skipped. ESLint on conflict resolutions and new boundary tests passed. Typecheck passed after generating the isolated SPA client (generation only; no migration).
- No database writes, credentials changes, Production deployment or PR merge. Preview runtime checks follow the pushed integration commit; this section alone is not a Production-readiness approval.
