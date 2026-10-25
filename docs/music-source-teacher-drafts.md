# Music source-replica teacher draft contract

This code is a controlled staging contract only. It has no public route/action, source-reader, CLI, real-data fixture, activation route, schema migration, role, grant or permission expansion. No real teacher import has been performed by these tests.

## Persistent marker without DDL

- `Staff.id` and a separate `User.id` use the reserved `source-replica:music-teacher:` namespace, with a SHA-256 key over target store, source system, source tenant and explicit source teacher ID. The only accepted source is `YINJIAOYUN` and the verified source alias `www.injiaoyun.com:store-lubymusic` (this alias is not a native tenant ID). Names and source revision never determine identity.
- A deterministic existing `AuditLog` row records `source=SOURCE_REPLICA`, `targetType=MusicSourceTeacherDraft`, `action=STAGE`, the target store and a strict snapshot/hash in `afterJson` with `status=DRAFT`.
- The marker is never inferred from a display name. Missing, duplicate, altered or cross-store receipts and partial rows are HOLD, never adopted or repaired by import.
- An identical independently verified source snapshot and identical untouched draft state return NO_OP. Changed names/revisions, enabled/authenticated/linked state or added permissions, teaching fees, policies or classes return HOLD.

## Internal service boundary

`stageMusicSourceTeacherDraft` requires VERCEL=1 and reuses the exact music-opening Preview repository/branch/isolated DATABASE_URL + DIRECT_URL gate before loading clients. It then requires the ordinary authenticated `staff.manage` course-manager and staff-feature checks. The core Prisma transaction locks and rechecks the Course Store and active music entitlement. No `courseTransaction` notification kick is used.

The strict independent source-proof argument is evidence supplied by a future trusted, reviewed server-side reader; it is not a browser credential or a substitute for that reader. The current implementation does not fetch or independently authenticate the legacy source. Do not wire this service to a route, upload or general-purpose action, or use it on real data, until that reader and operator workflow are reviewed.

New rows are exclusively Staff INACTIVE, User CUSTOMER/SUSPENDED, no email/phone/password/auth, no permissions, no member/person links, no teaching qualifications/fees/policies and `courseCoachEnabled=false`. The original display name is an explicitly validated source field. Both Staff.displayName and the separate User.name use `[音教雲] ` plus that source name to distinguish the replica from an existing pilot. Names exceeding the 80-character limit after prefixing are rejected, never truncated. Tests use only synthetic values.

## Activation remains HOLD

Ordinary `saveCourseStaff` rejects these drafts, including attempts to link/sync an ordinary account into one. Deterministic Staff/User IDs remain blocked even if their receipt is missing. Existing ordinary personnel behavior and the emergency-contact requirement for all new music personnel are unchanged.

No activation is implemented in this phase. A separately reviewed future workflow must independently reverify source state and complete the existing backend contact, role, teaching qualification, fee, scope and permission validation before any activation. Adding contact fields or setting `active=true` alone cannot activate a draft.

## Verification scope

Synthetic pure-contract, mocked service and action regression tests cover exact-snapshot idempotency, conflicts/collisions, same-store proof, denied environments, authorization/feature gates, immutable inactive state, and ordinary-action activation/link guards. These tests do not establish live database, source-system, concurrent transaction or authenticated UI acceptance.

## Other mutation entrypoints reviewed

- `staff.ts`: the shared draft guard now runs before generic update (including roles, status, email, presets and permissions), activation, password reset, permission editing and deactivation writes.
- `course-batch.ts`: the same guard checks both Staff ID and User ID before raw batch status updates. Per-item batch reports the held item as failed.
- `course-staff.ts`: main-record and linked-counterpart checks run before writes, preventing ordinary accounts from linking/syncing into a draft.
- Existing course availability writes require an ACTIVE, coach-enabled Staff; per-teacher compensation requires coach enablement and qualification. The untouched draft fails those existing predicates.
- Existing OAuth linking, customer phone-login changes, central membership claim and central-user merge require ACTIVE User state. Ordinary password-reset issuance additionally requires existing contact/customer identity. Drafts are SUSPENDED with no contacts, customer, identity, OAuth account or session, so these cannot bootstrap authentication for the staged state.
- Taichung first activation resolves a non-null validated phone and Taichung Customer/OAuth context; the music draft has neither. SPA personnel writes require a SPA store; the target is verified COURSE. New-account registration/onboarding creates separate IDs rather than adopting this record by name.

This review protects the supported draft-state transitions and is not a database-level immutability policy. Internal scripts, direct SQL and future/new mutation entrypoints are not automatically guarded. Any future trusted importer, activation mechanism or identity-linking change still requires review. The dormant permission helper in `lib/permissions.ts` has no current mutation-action caller; it must not be introduced as a draft-activation bypass.
