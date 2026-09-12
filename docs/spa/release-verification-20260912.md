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
