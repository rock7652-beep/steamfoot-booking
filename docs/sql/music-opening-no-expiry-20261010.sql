-- REVIEWED FILE / SYNTHETIC TEST ONLY until separately approved for a named DB.
-- Never run from build, ci-migrate, or against production. No rows are backfilled.
-- Applying this changes the table for the WHOLE database, not only one store.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public."Store" WHERE id='store-lubymusic' AND slug='lubymusic' AND "industryModule"::text='COURSE') THEN
    RAISE EXCEPTION 'No-expiry target tenant is not the reviewed music store';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
    AND table_name='CoursePointCard' AND column_name='musicOpeningStateRequired' AND is_nullable='NO')
    OR to_regclass('public."CourseMusicOpeningState"') IS NULL THEN
    RAISE EXCEPTION 'Reviewed opening schema must already exist';
  END IF;
  IF EXISTS(SELECT 1 FROM public."CoursePointCard" WHERE "expiresAt" IS NULL) THEN
    RAISE EXCEPTION 'Unexpected existing null expiry; reconcile before migration';
  END IF;
END
$preflight$;
ALTER TABLE public."CoursePointCard"
  ALTER COLUMN "expiresAt" DROP NOT NULL,
  ADD CONSTRAINT "CoursePointCard_opening_no_expiry" CHECK (
    "expiresAt" IS NOT NULL OR (
      "musicOpeningStateRequired" AND unit='SESSION'
      AND "musicValidityDays" IS NULL AND "musicActivatedAt" IS NOT NULL
    )
  );
-- The existing atomic importer must additionally validate the associated hashed
-- snapshot's explicit NO_EXPIRY evidence. A missing/corrupt/UNKNOWN snapshot is
-- blocked by every authoritative opening projection; null alone grants nothing.
-- No grants, policies, ownership, defaults, paid terms or existing dates change.
COMMIT;

-- Rollback procedure (not automatically executable): stop new no-expiry imports.
-- Reverting NOT NULL is allowed only after a read confirms ZERO null expiry rows.
-- Then, in a bounded transaction, SET NOT NULL and drop only the named CHECK.
-- If verified no-expiry cards exist, keep the nullable-compatible application and
-- schema. Never invent a date, delete entitlement history or roll back to a reader
-- that assumes DateTime is always populated just to make rollback succeed.
