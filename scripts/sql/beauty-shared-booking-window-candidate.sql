-- Candidate only; enables the existing fixed/rolling booking-window editor.
BEGIN;
ALTER TABLE "BeautySetting" ADD COLUMN IF NOT EXISTS "bookableUntilDate" text;
COMMIT;
