# Customer portal required-field policy

## Purpose

Prevent optional profile data from blocking existing customers from booking or using other core customer-portal functions.

## Core completion gate

The shared customer-portal completion gate may require only fields that are necessary to identify and contact the customer:

- `name`
- `phone`

Fields such as birthday, email, gender, address, notes, marketing preferences, health information, and other profile enrichment data must remain outside the shared core gate unless a separately reviewed migration plan is approved.

## Rules for adding a new required field

Before a field can block customer-portal access, the change must include all of the following:

1. A written reason explaining why the field is essential to the blocked action.
2. A legacy-data audit showing how many existing customers have a null or invalid value.
3. A backfill or grace-period plan for existing customers.
4. A non-blocking path such as “later” or action-specific collection when the field is not essential to booking.
5. Regression tests for both legacy customers missing the field and customers who already have it.
6. Preview verification in every active store and at least one LINE WebView or mobile browser.

## Protected core functions

Missing optional profile data must not prevent customers from:

- signing in
- opening the booking calendar
- viewing available sessions
- viewing bookings
- viewing wallets or remaining sessions
- accessing their profile to add the optional data later

## Release checklist

Any pull request that changes `REQUIRED_CUSTOMER_FIELDS`, `missingRequiredFields`, customer-layout redirects, onboarding redirects, or profile completion behavior must verify:

- legacy customer with the new field missing
- customer with the field present
- no redirect loop between the requested page and `/profile`
- the original requested route remains reachable after profile save
- no schema or production-data dependency is being assumed silently

## Incident reference

On 2026-07-14, birthday was added to the shared completion gate. Existing customers with `birthday = null` were redirected away from `/book/new`, affecting all active stores. PR #428 restored the gate to `name` and `phone` and made birthday optional again.
