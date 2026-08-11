-- Only a confirmed delivery consumes the reminder idempotency key.  Failed or
-- intentionally skipped attempts are audit rows and must not prevent a later
-- safe retry.  This is backward-compatible: no existing booking data changes.
DROP INDEX IF EXISTS "uniq_rule_booking_trigger";

CREATE UNIQUE INDEX "uniq_sent_rule_booking_trigger"
  ON "MessageLog"("ruleId", "bookingId", "triggerAt")
  WHERE "status" = 'SENT';

CREATE INDEX "idx_rule_booking_trigger"
  ON "MessageLog"("ruleId", "bookingId", "triggerAt");
