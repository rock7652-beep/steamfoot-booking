-- Persist the selected Messaging API route for automatic LINE reminders.
-- Existing rows remain NULL because their historical route cannot be proven safely.
CREATE TYPE "ReminderLineRoute" AS ENUM ('CENTRAL', 'STORE');

ALTER TABLE "MessageLog"
ADD COLUMN "lineRoute" "ReminderLineRoute";

CREATE INDEX "MessageLog_lineRoute_idx"
ON "MessageLog"("lineRoute");
