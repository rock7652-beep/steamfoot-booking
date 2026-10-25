-- Reviewed additive schema for the explicitly authorized isolated music pilot.
-- Kept outside prisma/migrations: never execute via build or apply other pending migrations.
-- Target: verified steamfoot-preview only. Preserve existing values; no source data.
-- Never run via build or ci-migrate. Contains no imported records/backfills.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $opening_preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public."Store" WHERE id='store-lubymusic' AND slug='lubymusic' AND "industryModule"::text='COURSE') THEN
    RAISE EXCEPTION 'Opening migration target tenant is not the reviewed music store';
  END IF;
  IF to_regclass('public."CourseMusicOpeningState"') IS NOT NULL OR EXISTS(
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND column_name IN
      ('musicOpeningStateRequired','musicOpeningTermKey','musicOpeningLessonOrdinal','musicOpeningSourceLessonKey')
  ) THEN RAISE EXCEPTION 'Opening schema already exists or is partial; reconcile before retry'; END IF;
END
$opening_preflight$;
ALTER TABLE "CoursePointCard"
  ADD COLUMN "musicOpeningStateRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE "CourseBooking"
  ADD COLUMN "musicOpeningTermKey" text,
  ADD COLUMN "musicOpeningLessonOrdinal" integer,
  ADD COLUMN "musicOpeningSourceLessonKey" text,
  ADD CONSTRAINT "CourseBooking_opening_identity_complete" CHECK (
    ("musicOpeningTermKey" IS NULL AND "musicOpeningLessonOrdinal" IS NULL AND "musicOpeningSourceLessonKey" IS NULL)
    OR ("musicOpeningTermKey" IS NOT NULL AND "musicOpeningTermKey"<>''
        AND "musicOpeningLessonOrdinal" IS NOT NULL AND "musicOpeningLessonOrdinal" BETWEEN 1 AND 100000
        AND "musicOpeningSourceLessonKey" IS NOT NULL AND "musicOpeningSourceLessonKey"<>''
        AND "cardId" IS NOT NULL AND "customerId" IS NOT NULL)
  );
-- The card namespaces source system, source tenant and source enrollment.
CREATE UNIQUE INDEX "CourseBooking_opening_source_key"
  ON "CourseBooking"("storeId","cardId","musicOpeningSourceLessonKey");
-- Version one supports one authoritative booking per source ordinal. Linked makeup
-- chains are blocked until separately designed; canceled rows retain their identity.
CREATE UNIQUE INDEX "CourseBooking_opening_ordinal_key"
  ON "CourseBooking"("storeId","cardId","musicOpeningTermKey","musicOpeningLessonOrdinal");
CREATE TABLE "CourseMusicOpeningState" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
  "cardId" text NOT NULL,
  "customerId" text NOT NULL,
  "sourceKey" text NOT NULL UNIQUE,
  "contentHash" text NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  "appliedBatchId" text NOT NULL CHECK ("appliedBatchId"<>''),
  "teacherFeePolicy" text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK ("teacherFeePolicy" IN ('UNVERIFIED','MUSIC_V2_ORIGINAL_PRICE')),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "CourseMusicOpeningState_cardId_storeId_key" UNIQUE("cardId","storeId"),
  FOREIGN KEY ("cardId","storeId") REFERENCES "CoursePointCard"(id,"storeId") ON DELETE RESTRICT,
  FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT,
  FOREIGN KEY ("cardId","customerId") REFERENCES "CourseCardMember"("cardId","customerId") ON DELETE RESTRICT
);
CREATE INDEX "CourseMusicOpeningState_storeId_customerId_idx" ON "CourseMusicOpeningState"("storeId","customerId");
ALTER TABLE "CourseMusicOpeningState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseMusicOpeningState" FROM PUBLIC, anon, authenticated;
-- Future authorized importer must atomically insert state+source mappings and set
-- the card discriminator, verify hash/scope/customer and original dates, and ensure
-- every opening reservation/makeup is reconciled. No importer exists in this patch.
COMMIT;
