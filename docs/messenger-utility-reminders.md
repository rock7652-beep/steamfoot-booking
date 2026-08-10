# Messenger Utility booking reminders

## Safety model

The daily Taiwan 18:00 reminder cron keeps the existing LINE route unchanged.
Messenger is a separate, opt-in route for `FIRST_TRIAL` bookings created from a
consumed Messenger chat link. `MESSENGER_UTILITY_REMINDERS_ENABLED` defaults to
`false`; it is deliberately not coupled to `line_reminder`.

The ordinary Messenger Send API path uses `messaging_type: RESPONSE`, which is
for an eligible conversation window. Scheduled next-day reminders must not use
that path. The Utility sender uses `POST /{page-id}/messages` with
`messaging_type: UTILITY` and a Page-approved template instead.

## Required per-environment configuration

For each enabled store, configure either the global safe defaults or the
`_<STORE_SLUG>` override:

- `MESSENGER_PAGE_ID_<STORE_SLUG>` and `MESSENGER_PAGE_ACCESS_TOKEN_<STORE_SLUG>`
- `MESSENGER_UTILITY_TEMPLATE_NAME[_<STORE_SLUG>]`
- `MESSENGER_UTILITY_TEMPLATE_LANGUAGE[_<STORE_SLUG>]`
- `MESSENGER_UTILITY_TEMPLATE_PARAMETER_ORDER[_<STORE_SLUG>]`

The parameter order must contain exactly `shopName,bookingDate,bookingTime,people,bookingLink`, in the order of the approved template's BODY placeholders. The safe action link opens the existing confirmation, one same-store reschedule, and cancellation page. No Page ID, token, PSID, phone, or raw Meta response is written to logs.

Meta requires a Page-scoped recipient ID, a Page access token, and the app user
granting `page_utility_messaging`. The Page must have a suitable Utility template
approved/available for its Page and the deployment region must be eligible. The
template must remain transactional—appointment reminders only, without offers or
marketing copy. Subscribe the webhook to `message_template_status_update` before
enabling the feature so template status changes are visible operationally.

## Outcome codes and retries

`MessageLog.status` remains the compatible persistence enum (`SENT`, `SKIPPED`,
`FAILED`). `errorMessage` carries only one of these safe Messenger codes:

- `SKIPPED_DISABLED`, `SKIPPED_MISSING_TEMPLATE`, `SKIPPED_MISSING_IDENTITY`
- `FAILED_META_REJECTED`, `FAILED_TRANSPORT`, `FAILED_CONFIGURATION`, `FAILED_IDENTITY_SCOPE`

Only Meta's explicit accepted HTTP response becomes `SENT`. A partial unique index
deduplicates only `SENT`; failures and skips are audit attempts and remain
retryable. The recipient is decrypted only from the exact consumed
`TrialBookingLink` for the same booking and store. A cross-store link is rejected.

## Preview verification

Use only Preview project ref `ttworfzgwejdeolegkxl`; never use Production data or
environment variables. Keep the feature flag `false` until Meta has approved the
template and a consenting controlled test account is ready. Then:

1. Configure Preview with non-production Page/template credentials and keep LINE's real sender disabled.
2. Create a Messenger-originated trial booking through the opaque webhook entry flow; verify its URL has no PSID or phone.
3. Run the cron against the Preview test booking for the next Taiwan date at the 18:00 path, then inspect only safe `MessageLog` codes.
4. Verify the Utility payload/template in Meta's controlled test account, then confirm, reschedule once, and cancel through the signed self-service link.
5. Repeat the cron and verify no second `SENT`; cancel/reschedule bookings must not be sent for their old/cancelled slot.
