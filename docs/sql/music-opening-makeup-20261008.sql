-- REVIEW DRAFT ONLY. Do not execute against a remote database without separate
-- approval of the exact environment and this SQL. Not an automatic migration.
-- One empty entitlement table, one nullable booking link and a guarded extension
-- of CourseBooking_values preserving all existing booking branches; no source data,
-- backfills, ledger/finance/payroll writes, notifications or card balance changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $makeup_preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."Store" WHERE id='store-lubymusic' AND slug='lubymusic' AND "industryModule"::text='COURSE') THEN
    RAISE EXCEPTION 'Opening make-up target tenant is not the reviewed music store';
  END IF;
  IF to_regclass('public."CourseMusicOpeningMakeupEntitlement"') IS NOT NULL OR EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='CourseBooking' AND column_name='musicOpeningMakeupEntitlementId'
  ) THEN RAISE EXCEPTION 'Opening make-up schema exists or is partial; reconcile before retry'; END IF;
END
$makeup_preflight$;

-- Compare PostgreSQL's parsed expressions on the SAME table rather than assume
-- that a historical migration still describes the deployed custom constraint.
-- The temporary probe constraint is removed in this transaction; any mismatch
-- aborts the entire draft before changing the original constraint or creating data.
DO $makeup_booking_constraint_preflight$
DECLARE
  actual_expression text;
  expected_expression text;
BEGIN
  SELECT pg_catalog.pg_get_expr(conbin,conrelid) INTO actual_expression
    FROM pg_catalog.pg_constraint
    WHERE conrelid='public."CourseBooking"'::regclass AND conname='CourseBooking_values'
      AND contype='c' AND convalidated;
  IF actual_expression IS NULL THEN
    RAISE EXCEPTION 'Reviewed CourseBooking_values constraint is missing or unvalidated';
  END IF;
  ALTER TABLE public."CourseBooking" ADD CONSTRAINT "CourseBooking_opening_makeup_expected_old" CHECK (
    status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW')
    AND (("bookingKind" = 'CARD' AND "cardId" IS NOT NULL AND "pointCost" > 0 AND "trialPrice" IS NULL)
         OR ("bookingKind" = 'TRIAL' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" BETWEEN 0 AND 1000000)
         OR ("bookingKind" = 'TEACHER_MAKEUP' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" IS NULL))
  ) NOT VALID;
  SELECT pg_catalog.pg_get_expr(conbin,conrelid) INTO expected_expression
    FROM pg_catalog.pg_constraint
    WHERE conrelid='public."CourseBooking"'::regclass AND conname='CourseBooking_opening_makeup_expected_old';
  IF actual_expression IS DISTINCT FROM expected_expression THEN
    RAISE EXCEPTION 'CourseBooking_values differs from the reviewed original; reconcile before extending';
  END IF;
  ALTER TABLE public."CourseBooking" DROP CONSTRAINT "CourseBooking_opening_makeup_expected_old";
END
$makeup_booking_constraint_preflight$;

CREATE TABLE public."CourseMusicOpeningMakeupEntitlement" (
  id text PRIMARY KEY CHECK (id<>''),
  "storeId" text NOT NULL REFERENCES public."Store"(id) ON DELETE RESTRICT,
  "customerId" text NOT NULL,
  "templateId" text NOT NULL,
  "sourceKey" text NOT NULL UNIQUE CHECK ("sourceKey"<>''),
  "sourceSlotKey" text NOT NULL UNIQUE CHECK ("sourceSlotKey"<>''),
  "contentHash" text NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL,
  "appliedBatchId" text NOT NULL CHECK ("appliedBatchId"<>''),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "CourseMusicOpeningMakeupEntitlement_identity_key" UNIQUE(id,"storeId","customerId"),
  CONSTRAINT "CourseMusicOpeningMakeupEntitlement_customer_fk"
    FOREIGN KEY ("customerId","storeId") REFERENCES public."Customer"(id,"storeId") ON DELETE RESTRICT,
  CONSTRAINT "CourseMusicOpeningMakeupEntitlement_template_fk"
    FOREIGN KEY ("templateId","storeId") REFERENCES public."CourseTemplate"(id,"storeId") ON DELETE RESTRICT,
  -- Strict Zod verification and canonical hash checks remain server requirements.
  -- SQL independently rejects accidental exclusion/native/overlap source rows.
  CONSTRAINT "CourseMusicOpeningMakeupEntitlement_snapshot_shape" CHECK (COALESCE(
    jsonb_typeof(snapshot)='object'
    AND snapshot->>'sourceStatus'='OUTSTANDING'
    AND snapshot->>'type' IN ('STUDENT_LEAVE','TEACHER_ABSENT')
    AND snapshot->>'balanceTreatment'='SEPARATE_VERIFIED'
    AND snapshot->'nativeSourceBooking'='null'::jsonb
    AND snapshot->'completedPair'='null'::jsonb
    AND snapshot->'scope'->>'version'='1'
    AND snapshot->'scope'->>'sourceSystem'='YINJIAOYUN'
    AND snapshot->'scope'->>'timeZone'='Asia/Taipei'
    AND snapshot->'scope'->>'targetStoreId'="storeId"
    AND snapshot->'mapping'->>'status'='VERIFIED'
    AND snapshot->'mapping'->>'customerId'="customerId"
    AND snapshot->'mapping'->>'templateId'="templateId"
    AND snapshot->'mapping'->>'classType' IN ('PRIVATE','SELF_ORGANIZED','GROUP')
    AND NOT (snapshot->>'type'='STUDENT_LEAVE' AND snapshot->'mapping'->>'classType'='GROUP')
    AND snapshot->'sourceDate'->>'verification'='VERIFIED'
    AND snapshot->'sourceDate'->>'value' ~ '^\d{4}-\d{2}-\d{2}$'
    AND snapshot->'scope'->>'cutoffBusinessDate' ~ '^\d{4}-\d{2}-\d{2}$'
    AND snapshot->'sourceDate'->>'value' < snapshot->'scope'->>'cutoffBusinessDate'
    AND snapshot->'expiry'->>'verification'='VERIFIED'
    AND (snapshot->'expiry'->'value'='null'::jsonb OR (
      snapshot->'expiry'->>'value' ~ '^\d{4}-\d{2}-\d{2}$'
      AND snapshot->'expiry'->>'value' >= snapshot->'sourceDate'->>'value'
    )), false))
);
CREATE INDEX "CourseMusicOpeningMakeupEntitlement_member_idx"
  ON public."CourseMusicOpeningMakeupEntitlement"("storeId","customerId","templateId");

ALTER TABLE public."CourseBooking"
  DROP CONSTRAINT "CourseBooking_values",
  ADD CONSTRAINT "CourseBooking_values" CHECK (
    status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW')
    AND (("bookingKind" = 'CARD' AND "cardId" IS NOT NULL AND "pointCost" > 0 AND "trialPrice" IS NULL)
         OR ("bookingKind" = 'TRIAL' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" BETWEEN 0 AND 1000000)
         OR ("bookingKind" = 'TEACHER_MAKEUP' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" IS NULL)
         OR ("bookingKind" = 'OPENING_MAKEUP' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" IS NULL))
  ),
  ADD COLUMN "musicOpeningMakeupEntitlementId" text,
  ADD CONSTRAINT "CourseBooking_opening_makeup_entitlement_fk"
    FOREIGN KEY ("musicOpeningMakeupEntitlementId","storeId","customerId")
    REFERENCES public."CourseMusicOpeningMakeupEntitlement"(id,"storeId","customerId") ON DELETE RESTRICT,
  ADD CONSTRAINT "CourseBooking_opening_makeup_shape" CHECK (
    ("musicOpeningMakeupEntitlementId" IS NULL AND "bookingKind"<>'OPENING_MAKEUP') OR
    ("musicOpeningMakeupEntitlementId" IS NOT NULL
      AND "bookingKind"='OPENING_MAKEUP' AND "customerId" IS NOT NULL
      AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NULL
      AND "makeupForBookingId" IS NULL AND "companionIndex" IS NULL
      AND "musicOpeningTermKey" IS NULL AND "musicOpeningLessonOrdinal" IS NULL
      AND "musicOpeningSourceLessonKey" IS NULL
      AND status IN ('RESERVED','ATTENDED','CANCELLED')
      AND ("absenceKind" IS NULL OR (status='CANCELLED' AND "absenceKind" IN ('STUDENT_LEAVE','TEACHER_ABSENT'))))
  );
-- A cancelled attempt releases the SAME right. Attended attempts still occupy it.
CREATE UNIQUE INDEX "CourseBooking_opening_makeup_active_key"
  ON public."CourseBooking"("musicOpeningMakeupEntitlementId")
  WHERE "musicOpeningMakeupEntitlementId" IS NOT NULL AND status<>'CANCELLED';

CREATE FUNCTION public."guard_music_opening_makeup_source"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $immutable$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Opening make-up source deletion is not supported';
  END IF;
  IF (to_jsonb(NEW)-'version'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'version'-'updatedAt') THEN
    RAISE EXCEPTION 'Opening make-up source is immutable';
  END IF;
  IF NEW.version<>OLD.version+1 OR NEW."updatedAt"<OLD."updatedAt" THEN
    RAISE EXCEPTION 'Opening make-up lifecycle requires the next version';
  END IF;
  RETURN NEW;
END
$immutable$;
CREATE TRIGGER "CourseMusicOpeningMakeupEntitlement_immutable"
  BEFORE UPDATE OR DELETE ON public."CourseMusicOpeningMakeupEntitlement"
  FOR EACH ROW EXECUTE FUNCTION public."guard_music_opening_makeup_source"();
ALTER TABLE public."CourseMusicOpeningMakeupEntitlement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CourseMusicOpeningMakeupEntitlement" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public."guard_music_opening_makeup_source"() FROM PUBLIC, anon, authenticated;
-- No client policies or access grants. Lifecycle transaction order: store lock,
-- entitlement row lock/CAS, booking + version + dedicated AuditLog receipt.
-- Source correction is deliberately unsupported in v1.
COMMIT;
