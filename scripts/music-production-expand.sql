-- REVIEW DRAFT. Execute only after exact production fingerprint + backup checks.
-- No data import, no backfill, no cash/attendance/payroll writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(2026102301);
DO $guard$ BEGIN
 IF to_regclass('public."CourseMusicTuition"') IS NOT NULL
 OR to_regclass('public."CourseMusicReceipt"') IS NOT NULL
 OR to_regclass('public."CourseMusicLessonAssignment"') IS NOT NULL
 OR to_regclass('public."CourseScheduleSeries"') IS NOT NULL
 OR to_regclass('public."CourseMusicOpeningState"') IS NOT NULL
 OR to_regclass('public."CourseMusicOpeningMakeupEntitlement"') IS NOT NULL
 THEN RAISE EXCEPTION 'Music release already exists or is partial: reconcile, never replay'; END IF;
 IF EXISTS(SELECT 1 FROM public."CoursePointCard" WHERE "musicTermSizes" IS NULL)
 THEN RAISE EXCEPTION 'Invalid existing period metadata'; END IF;
 IF EXISTS(SELECT 1 FROM public."CourseBooking" WHERE "bookingKind" NOT IN ('CARD','TRIAL','TEACHER_MAKEUP'))
 THEN RAISE EXCEPTION 'Unexpected existing booking kind: reconcile before release'; END IF;
END $guard$;

ALTER TABLE public."CourseSession"
 ADD COLUMN "scheduleType" text NOT NULL DEFAULT 'LEGACY' CHECK ("scheduleType" IN ('LEGACY','SINGLE','FIXED','TRIAL')),
 ADD COLUMN "scheduleFrequency" text NOT NULL DEFAULT 'NONE' CHECK ("scheduleFrequency" IN ('NONE','WEEKLY','BIWEEKLY')),
 ADD COLUMN "enrollmentMode" text NOT NULL DEFAULT 'OPEN' CHECK ("enrollmentMode" IN ('OPEN','ASSIGNED')),
 ADD COLUMN "enrollmentFingerprint" text,
 ADD COLUMN "rescheduleShadowHidden" boolean NOT NULL DEFAULT false,
 ADD COLUMN "bookingAudience" text NOT NULL DEFAULT 'OPEN' CHECK ("bookingAudience" IN ('OPEN','ASSIGNED'));

-- Empty ORM-compatibility objects. Production historical imports remain disabled.
ALTER TABLE public."CoursePointCard"
 ADD COLUMN "musicOpeningStateRequired" boolean NOT NULL DEFAULT false CHECK (NOT "musicOpeningStateRequired");
ALTER TABLE public."CourseBooking"
 ADD COLUMN "musicOpeningMakeupEntitlementId" text CHECK ("musicOpeningMakeupEntitlementId" IS NULL),
 ADD COLUMN "musicOpeningTermKey" text CHECK ("musicOpeningTermKey" IS NULL),
 ADD COLUMN "musicOpeningLessonOrdinal" integer CHECK ("musicOpeningLessonOrdinal" IS NULL),
 ADD COLUMN "musicOpeningSourceLessonKey" text CHECK ("musicOpeningSourceLessonKey" IS NULL);
CREATE TABLE public."CourseMusicOpeningState" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "cardId" text NOT NULL, "customerId" text NOT NULL,
 "sourceKey" text NOT NULL UNIQUE, "contentHash" text NOT NULL, snapshot jsonb NOT NULL,
 "appliedBatchId" text NOT NULL, "teacherFeePolicy" text NOT NULL DEFAULT 'UNVERIFIED',
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), UNIQUE("cardId","storeId"),
 FOREIGN KEY("cardId","storeId") REFERENCES public."CoursePointCard"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("customerId","storeId") REFERENCES public."Customer"(id,"storeId") ON DELETE RESTRICT,
 CONSTRAINT "MusicProductionOpeningDisabled" CHECK (false)
);
CREATE TABLE public."CourseMusicOpeningMakeupEntitlement" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL, "templateId" text NOT NULL,
 "sourceKey" text NOT NULL UNIQUE, "sourceSlotKey" text NOT NULL UNIQUE, "contentHash" text NOT NULL,
 snapshot jsonb NOT NULL, "appliedBatchId" text NOT NULL, version integer NOT NULL DEFAULT 0,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(id,"storeId","customerId"),
 FOREIGN KEY("customerId","storeId") REFERENCES public."Customer"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("templateId","storeId") REFERENCES public."CourseTemplate"(id,"storeId") ON DELETE RESTRICT,
 CONSTRAINT "MusicProductionOpeningMakeupDisabled" CHECK (false)
);
CREATE TABLE public."CourseScheduleSeries" (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES public."Store"(id) ON DELETE RESTRICT,
 "requestKey" text NOT NULL, "templateId" text NOT NULL, "nameSnapshot" text NOT NULL,
 "roomId" text NOT NULL, "coachId" text NOT NULL,
 "startsAt" timestamptz(3) NOT NULL, "endsAt" timestamptz(3) NOT NULL,
 "pointCost" integer NOT NULL CHECK ("pointCost">0), capacity integer NOT NULL CHECK(capacity>0),
 frequency text NOT NULL CHECK(frequency IN ('WEEKLY','BIWEEKLY')),
 "enrollmentMode" text NOT NULL DEFAULT 'OPEN' CHECK("enrollmentMode" IN ('OPEN','ASSIGNED')),
 "learnerSnapshot" jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof("learnerSnapshot")='array'),
 "untilDate" date, "generatedThrough" date NOT NULL, "excludedDates" text[] NOT NULL DEFAULT '{}',
 "generationError" text, "cancelledAt" timestamptz(3), "createdById" text NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL,
 UNIQUE("storeId","requestKey"), CHECK("endsAt">"startsAt"),
 FOREIGN KEY("templateId","storeId") REFERENCES public."CourseTemplate"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("roomId","storeId") REFERENCES public."CourseRoom"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("coachId","storeId") REFERENCES public."Staff"(id,"storeId") ON DELETE RESTRICT
);
CREATE INDEX ON public."CourseScheduleSeries"("storeId","cancelledAt","startsAt");
CREATE INDEX ON public."CourseScheduleSeries"("storeId","roomId","startsAt");
CREATE INDEX ON public."CourseScheduleSeries"("storeId","coachId","startsAt");

CREATE TABLE public."CourseMusicTuition" (
 "purchaseId" text PRIMARY KEY, "storeId" text NOT NULL,
 due integer NOT NULL CHECK(due BETWEEN 0 AND 10000000),
 "discountTeacherFee" boolean NOT NULL DEFAULT false, "checkoutFingerprint" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("purchaseId","storeId"),
 FOREIGN KEY("purchaseId","storeId") REFERENCES public."CoursePurchase"(id,"storeId") ON DELETE RESTRICT
);
CREATE INDEX ON public."CourseMusicTuition"("storeId");
CREATE TABLE public."CourseMusicReceipt" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "purchaseId" text NOT NULL,
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 10000000), "paidAt" timestamptz NOT NULL,
 method text NOT NULL CHECK(method IN ('CASH','BANK_TRANSFER','CARD','OTHER')), "lastFour" text,
 "requestKey" text NOT NULL, "actorUserId" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("storeId","requestKey"),
 FOREIGN KEY("purchaseId","storeId") REFERENCES public."CourseMusicTuition"("purchaseId","storeId") ON DELETE RESTRICT,
 CHECK((method='BANK_TRANSFER' AND "lastFour" IS NOT NULL AND "lastFour" ~ '^[0-9]{4}$') OR (method<>'BANK_TRANSFER' AND "lastFour" IS NULL))
);
CREATE INDEX ON public."CourseMusicReceipt"("storeId","paidAt");
CREATE INDEX ON public."CourseMusicReceipt"("purchaseId");

CREATE TABLE public."CourseMusicLessonAssignment" (
 "bookingId" text PRIMARY KEY, "storeId" text NOT NULL, "cardId" text NOT NULL, "customerId" text NOT NULL,
 period integer NOT NULL CHECK(period BETWEEN 1 AND 1000), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 1000),
 kind text NOT NULL CHECK(kind IN ('REGULAR','MAKEUP')), "sourceBookingId" text,
 "releasedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY("bookingId","storeId") REFERENCES public."CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("cardId","storeId") REFERENCES public."CoursePointCard"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("customerId","storeId") REFERENCES public."Customer"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("sourceBookingId","storeId") REFERENCES public."CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 CHECK((kind='MAKEUP')=("sourceBookingId" IS NOT NULL)), CHECK("sourceBookingId" IS DISTINCT FROM "bookingId")
);
CREATE UNIQUE INDEX "MusicLesson_regular_slot" ON public."CourseMusicLessonAssignment"("storeId","cardId","customerId",period,ordinal) WHERE kind='REGULAR' AND "releasedAt" IS NULL;
CREATE UNIQUE INDEX "MusicLesson_active_makeup" ON public."CourseMusicLessonAssignment"("storeId","sourceBookingId") WHERE kind='MAKEUP' AND "releasedAt" IS NULL;

CREATE FUNCTION public.music_lesson_assignment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE b record; c record; src record; coupon record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lesson history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (NEW."bookingId",NEW."storeId",NEW."cardId",NEW."customerId",NEW.kind,NEW."sourceBookingId") IS DISTINCT FROM (OLD."bookingId",OLD."storeId",OLD."cardId",OLD."customerId",OLD.kind,OLD."sourceBookingId") THEN RAISE EXCEPTION 'Lesson identity cannot be replaced'; END IF;
 SELECT * INTO b FROM public."CourseBooking" WHERE id=NEW."bookingId" AND "storeId"=NEW."storeId";
 IF NOT FOUND THEN RAISE EXCEPTION 'Lesson booking missing'; END IF;
 SELECT * INTO c FROM public."CoursePointCard" WHERE id=NEW."cardId" AND "storeId"=NEW."storeId";
 IF NOT FOUND THEN RAISE EXCEPTION 'Lesson card missing'; END IF;
 IF b."customerId" IS DISTINCT FROM NEW."customerId" OR c."musicOpeningStateRequired"
 OR NOT EXISTS(SELECT 1 FROM public."CourseCardMember" WHERE "storeId"=NEW."storeId" AND "cardId"=NEW."cardId" AND "customerId"=NEW."customerId")
 THEN RAISE EXCEPTION 'Lesson ownership mismatch'; END IF;
 IF b."cardId" IS DISTINCT FROM NEW."cardId" THEN
  SELECT * INTO coupon FROM public."CoursePointCard" WHERE id=b."cardId" AND "storeId"=NEW."storeId";
  IF NOT FOUND OR NEW.kind<>'MAKEUP' OR coupon."requestKey" IS DISTINCT FROM ('music-leave-makeup:'||NEW."sourceBookingId") THEN RAISE EXCEPTION 'Lesson card mismatch'; END IF;
 END IF;
 IF COALESCE(cardinality(c."musicTermSizes"),0)=0 OR NEW.period>cardinality(c."musicTermSizes")+(CASE WHEN c."musicBonusLessons">0 THEN 1 ELSE 0 END) OR NEW.ordinal>(CASE WHEN NEW.period=cardinality(c."musicTermSizes")+1 THEN c."musicBonusLessons" ELSE c."musicTermSizes"[NEW.period] END) THEN RAISE EXCEPTION 'Lesson is outside purchased periods'; END IF;
 IF b.status='CANCELLED' AND b."absenceKind" IS NULL THEN NEW."releasedAt"=COALESCE(NEW."releasedAt",now()); END IF;
 IF NEW.kind='MAKEUP' THEN
  SELECT * INTO src FROM public."CourseMusicLessonAssignment" WHERE "bookingId"=NEW."sourceBookingId" AND "storeId"=NEW."storeId";
  IF NOT FOUND OR src."cardId"<>NEW."cardId" OR src."customerId"<>NEW."customerId" OR src.period<>NEW.period OR src.ordinal<>NEW.ordinal OR (b."cardId"=NEW."cardId" AND b."makeupForBookingId" IS DISTINCT FROM NEW."sourceBookingId") THEN RAISE EXCEPTION 'Makeup must retain its original lesson'; END IF;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER music_lesson_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public."CourseMusicLessonAssignment" FOR EACH ROW EXECUTE FUNCTION public.music_lesson_assignment_guard();
CREATE FUNCTION public.music_lesson_assignment_release() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 UPDATE public."CourseMusicLessonAssignment" SET "releasedAt"=CASE WHEN NEW.status='CANCELLED' AND NEW."absenceKind" IS NULL THEN COALESCE("releasedAt",now()) ELSE NULL END,"updatedAt"=now() WHERE "bookingId"=NEW.id AND "storeId"=NEW."storeId";
 RETURN NEW;
END $fn$;
CREATE TRIGGER music_lesson_assignment_release AFTER UPDATE OF status,"absenceKind" ON public."CourseBooking" FOR EACH ROW EXECUTE FUNCTION public.music_lesson_assignment_release();
REVOKE ALL ON FUNCTION public.music_lesson_assignment_guard(),public.music_lesson_assignment_release() FROM PUBLIC,anon,authenticated;

-- Preserve all live native shapes; historical OPENING_MAKEUP is deliberately absent.
ALTER TABLE public."CourseBooking" DROP CONSTRAINT "CourseBooking_values";
ALTER TABLE public."CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
 status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW') AND (
 ("bookingKind"='CARD' AND "cardId" IS NOT NULL AND "pointCost">0 AND "trialPrice" IS NULL) OR
 ("bookingKind"='TRIAL' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" BETWEEN 0 AND 1000000) OR
 ("bookingKind"='TEACHER_MAKEUP' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NULL) OR
 ("bookingKind"='UNPAID' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NULL AND "customerId" IS NOT NULL AND "operatorCustomerId" IS NULL AND "makeupForBookingId" IS NULL AND "companionIndex" IS NULL)
 ));
DO $private$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement','CourseScheduleSeries','CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',n);
 END LOOP;
END $private$;
COMMIT;
