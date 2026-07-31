# PR #634 implementation brief

Implement the remaining production-safe wiring for the all-store central User resolver.

## Required changes

1. In `src/lib/auth.ts`, import and use `resolveCentralUserForStoreCustomer` inside the `customer-phone` Credentials provider.
   - Find the store-scoped Customer by `storeId + normalized phone` through the shared resolver.
   - Do not filter `CustomerIdentityLink` to `provider = phone`.
   - Require `status = resolved`, central User role `CUSTOMER`, status `ACTIVE`, and a password hash.
   - Verify the password against the resolved central User.
   - Keep the session context on the current store Customer (`customerId`, `storeId`, `storeSlug`).
   - Only run legacy `repairCustomerIdentityOnLogin` when `hasDirectUser` is true.
   - Preserve `syncVerifiedCentralIdentity` behavior after successful password verification.

2. In the `line-taichung-coordinator` Credentials provider in `src/lib/auth.ts`, stop requiring `Customer.userId === bridge.userId`.
   - Resolve by `customerId + storeId` with the shared resolver.
   - Require the resolved central User id to equal `bridge.userId`.
   - Require central User role `CUSTOMER` and status `ACTIVE`.
   - Return the current store Customer context.

3. Tests
   - Add behavioral/unit coverage for direct-user, identity-link-only, conflicting links, merged Customer, wrong store, and coordinator bridge ownership mismatch.
   - Avoid source-string-only tests where a behavior test is practical.

## Safety constraints

- No schema or migration changes.
- No Production data writes.
- No Customer merge, password reset, wallet, booking, transaction, or LINE account movement.
- Fail closed on any identity conflict.
- Keep the solution store-agnostic; no Taichung-specific identity rules beyond the existing coordinator provider name.

After implementation, run targeted tests, lint/typecheck as appropriate, and production build. Keep the PR Draft until all checks are green.