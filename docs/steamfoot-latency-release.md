# Steamfoot latency backend — release gate

Status: DRAFT. Do not merge or promote until all gates below pass.

This backend PR is independent of UI PR #1122. It does not change SPA business
logic. It adds fixed-label timings (no customer payloads), parallel month-summary
enrichment, and durable session-balance delivery after completion responds.
Referral analytics and ledger/points checks remain awaited; no claim of zero
backend latency is made.

## Database gate

- Additive migration: `20260927154000_session_balance_delivery`.
- Old rows default to deliveryVersion=0 and must not be replayed.
- New rows are enqueued inside the completion transaction. Delivery uses a
  ten-minute lease, frozen route/content, and a stable LINE retry key. Retry is
  bounded to five attempts and a conservative 23-hour enqueue window.
- Verify the migration on an explicitly isolated test database first, including
  two concurrent claims, worker interruption, retry deadline, and legacy rows.
- The existing production migration script does NOT auto-apply this migration.
  Do not change its allowlist or use production credentials to bypass the gate.
- After separate user approval, apply/verify the additive migration through the
  approved production migration workflow BEFORE deploying this backend.
- Rollback: deploy the prior application; retain the additive columns. Do not
  delete pending notifications or roll back the database destructively.

## Delivery gate

- Preview dispatch is disabled. Cron rejects non-production environments and
  requires a nonempty CRON_SECRET with matching Bearer authorization.
- Configure/verify `/api/cron/session-balance-retry` at five-minute cadence.
- Do not test against real customer wallets or send real customer messages.
- Use isolated fixtures + mocked LINE for interruption/concurrency tests; a real
  LINE smoke test requires an explicitly approved test recipient.
- Confirm the existing LINE helper treats an accepted retry-key response as
  success. Do not retry outside the bounded window or change frozen recipients.

## Verification

- Focused unit tests, changed-file lint, generated Prisma client, and TypeScript
  checks run locally. No production SQL or customer mutation was performed.
- Browser testing of UI PR #1122 currently stops at the preview login screen.
- Migration/concurrency integration and authenticated preview end-to-end tests
  remain release blockers; a green build alone is insufficient.
- Compare `OPERATION_PERF` for `steamfoot.complete`,
  `steamfoot.complete.notifications`, `booking.detail`, `steamfoot.refresh`, and
  `steamfoot.month.compute`. Spans are not SQL query counts or cache-hit proofs.
- Existing 476–532ms page spans exclude prior authentication and browser/network
  overhead. Do not present them as total user-perceived load time.
