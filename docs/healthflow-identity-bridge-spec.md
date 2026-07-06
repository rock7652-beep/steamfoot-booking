# HealthFlow Identity Bridge Spec

This document defines the Steamfoot-side contract for safely linking a
HealthFlow profile back to a Steamfoot `Customer`.

This PR only adds the signed-state helper, callback validation helper, and
tests. It does not connect a production HealthFlow callback and does not write
`Customer.healthProfileId`.

## Goal

Steamfoot must not assume that "both apps use LINE login" means both systems
know the same customer. The bridge must use a signed customer context generated
by Steamfoot, then verify it before any HealthFlow profile can be linked.

## Proposed Flow

1. Steamfoot resolves the current `Customer`.
2. Steamfoot creates a signed HealthFlow bridge state containing:
   - `customerId`
   - `storeId`
   - `issuedAt`
   - `expiresAt`
   - `jti`
3. Steamfoot sends the customer to HealthFlow with that signed state.
4. HealthFlow completes the assessment.
5. HealthFlow calls back to Steamfoot with:
   - `profileId`
   - original signed `state`
6. Steamfoot verifies:
   - state signature is valid
   - state is not expired
   - customer exists
   - customer belongs to the signed store
   - `profileId` is present and valid
7. A future callback route may then write:
   - `Customer.healthProfileId = profileId`
   - `Customer.healthLinkStatus = "linked"`
   - `Customer.healthSyncedAt = now`

## Replay Protection

The signed payload includes `jti` so a future callback route can enforce
one-time use with a durable store such as DB, Redis, or runtime cache.

This PR intentionally does not add schema or storage. Until one-time consume is
implemented, callback wiring must not be treated as complete.

## Non-Goals

- No schema or migration.
- No production callback route.
- No HealthFlow API call.
- No LINE message.
- No automatic merge by name, phone, or email.
- No changes to existing health summary reads.
- No changes to LINE reminder behavior.

## Merge Rule For Future Callback PR

A future PR that writes `Customer.healthProfileId` must only do so after signed
state validation succeeds. Name, phone, and email may be shown as manual review
hints, but must not be used as the only automatic merge key.
