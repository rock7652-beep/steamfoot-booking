-- PR-1.5: preserve the old binding fingerprint at request creation.
-- Nullable for pre-existing rows; dry-run must fail closed when it is absent.
ALTER TABLE "LineRebindRequest" ADD COLUMN "oldUserIdHash" TEXT;
