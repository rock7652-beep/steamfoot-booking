# Messenger trial reminder delivery

This Draft PR owns scheduled Messenger delivery only. PR #705 keeps secure
Messenger booking-link attribution, but does not invoke this delivery path.

## Release invariants

- The feature remains disabled by default.
- A monthly quota slot must be reserved atomically before Meta is called.
- Concurrent workers cannot reserve the same final quota slot.
- A Meta-accepted delivery whose MessageLog finalization failed must reconcile
  exactly one quota charge on retry.
- Idempotent replays must not send again or consume another quota slot.
- Failed or rejected deliveries release a reservation safely.
- LINE and Messenger use the same Asia/Taipei monthly allowance.
- No raw PSID, access token, Meta response body, or booking action token is
  written to logs.

## Required test matrix

1. one remaining quota slot with two concurrent workers;
2. Meta success followed by MessageLog failure, then backup retry;
3. duplicate cron replay after a completed send;
4. Meta rejection and transport failure;
5. Taiwan month boundary;
6. LINE and Messenger contending for the shared final slot;
7. kill switch disabled and incomplete template configuration.

## Merge gate

Do not connect `sendMessengerUtilityReminder` to the reminder engine until the
reservation, reconciliation, and concurrency tests pass and Codex re-review has
no P1/P2 findings in this scope.
