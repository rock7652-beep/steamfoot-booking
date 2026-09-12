# Unified LIFF entry identity

## Problem and scope
Member home could read an existing cookie before verifying the current LINE subject.
Bookings and wallets checked only that an ID token existed. Health and profile
performed a token exchange first. Thus a stale session could make one entry appear
to work while another correctly required identity recovery.

## Changes
- Home, bookings, member booking, trial booking, wallets, profile and health use
  `refreshLiffSession` before initial member reads. Onboarding checks the same
  exchange before navigating after a successful bind.
- Exchange and the LIFF credentials provider share `resolveVerifiedLineCustomer`.
  Both verify the ID token against the configured channel before calling it.
- A central LINE Account may resolve only an existing verified store membership;
  conflicts, merged customers, wrong stores and inactive/staff accounts fail closed.
- Legacy LINE matches must be unique and owned by the resolved central member.
- No token/session success cache; no phone/name-based automatic account overwrite.
- Existing web OAuth and phone login remain separate authentication mechanisms;
  three-store parity tests compare their resulting membership with LIFF.

## Limits
This unifies entry behavior, not all historical LINE identities. An unknown new
LINE subject still needs the existing reviewed recovery process; this change does
not silently migrate every old customer. Public trial registration remains separate.
No schema, notification recipient, wallet, booking or health record mutation is added.
The initial identity check does not constitute multi-tab session isolation.

## Verification
- TypeScript and changed-file ESLint passed.
- Full Vitest: 455 files passed, 3 skipped; 4,114 tests passed, 32 skipped.
- Added behavioral coverage for malformed exchange, missing tokens, HTTP failures,
  changing identities/stores, central store membership and ownership conflicts.
- Existing web/LIFF parity and health/profile data-read gating tests passed.
- Preview and real LINE-device end-to-end verification tracked in the PR.
