# Staff session security — staged rollout

## Scope and behavior

This change validates ADMIN / OWNER / PARTNER sessions against current User and
Staff state on every auth call, before client-triggered session updates. A keyed
stamp is created only after credentials verification and retained only in the
encrypted JWT, never Session.user. Password resets, role changes, suspension,
Staff removal or transfer invalidate old sessions on their next authentication
check. Already-authorized in-flight requests are not retroactively cancelled.

The stamp includes User.updatedAt: reactivating a suspended account cannot revive
an earlier token. Any User record edit, including name/email changes, requires
that staff member to sign in again. Staff-only profile fields do not change the
stamp unless the identity, store or active status changes. No schema migration or
new secret is required; the existing Auth.js secret is reused with domain separation.

Existing staff tokens lack a stamp and require one sign-in after deployment.
Customer LINE/Google sessions retain the existing flow. No customer plans,
balances, payments, booking limits or staff permission grants are changed.
Customer tokens cannot gain a staff role through a client session update.

## Validation

Local callback tests exercise real auth callbacks with a mocked database; they
are not browser or production acceptance. They cover active credentials, invalid
password, suspension, reset, downgrade, reactivation, removed/moved/inactive Staff,
deleted User, legacy tokens, update forgery, a reset racing JWT issuance, ADMIN,
database outage, customer preservation and private stamp handling.

Before production: complete CI and Preview browser checks for HQ/owner login,
service-staff Demo login, customer LINE identity, booking and checkout. Measure
staff page latency: each auth call adds a narrow uncached User query; proxy and
server rendering may each call auth. Never cache successful authorization across
requests to mask a latency issue.

## Operations

1. This PR is Preview-only pending acceptance; do not merge as part of preparation.
2. Inform managers before production: one fresh sign-in is expected. Send no
   announcement from this PR. Choose a low-traffic period after checking bookings
   and notification schedules; no fixed maintenance window has been scheduled.
3. Record the current production deployment. Deploy the code separately from
   database changes, then verify valid login and one disposable test account's
   revoked session. Never disable a real manager to test this.
4. Code rollback restores the old vulnerability. If revocation is needed for an
   actual incident, do not treat code rollback as a secure recovery; retain the
   fix or coordinate incident-specific session invalidation.

## Separate database change (prepared, not applied)

Preview already has RLS on public.StoreLineNotificationRecipient; the production
inventory did not. Keep the no-public-grants/server-side-Prisma model. Recheck
the production state and backup evidence before using the separate SQL below.
Use a reviewed Prisma migration when scheduling deployment; do not silently edit
the migration ledger or introduce Supabase migration history for a Prisma change.

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public."StoreLineNotificationRecipient" ENABLE ROW LEVEL SECURITY;
COMMIT;
```

On lock timeout the transaction must roll back; do not increase the timeout
during customer traffic. Check current grants and policies, owner access and
notification recipient reads afterward. No permissive public policy is needed.

## Platform items still blocked on management access

- GitHub main currently reports unprotected; rulesets are empty. Prepare a rule
  requiring a PR, the existing Changed-file ESLint / Targeted tests / Typecheck
  checks, blocking force pushes and branch deletion. Start with zero required
  approvals for this single-maintainer repository so the author is not forced
  to approve their own PR. Review bypass actors explicitly. These settings have
  NOT been activated; current connector has no administration write endpoint.
- Verify MFA, members and recovery methods in GitHub/Google/Vercel/Supabase/domain
  accounts. No conclusion about MFA being disabled follows from limited access.
- Obtain latest successful backup, retention and PITR state. Restore to a fresh
  disposable destination with external notifications disabled, not the live
  database or shared Preview. Compare customer/booking/wallet/transaction counts
  and relations. Backup listing/restore evidence is not exposed by the current
  connector; no backup restoration has been performed.

The security audit remains incomplete until the above evidence and actual
two-store browser/API denial checks are recorded. Unit tests do not replace them.
