-- Preview-only additive schema. No historical records are assigned or rewritten.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Store" WHERE id='store-lubymusic' AND slug='lubymusic')
 OR NOT EXISTS(SELECT 1 FROM "MusicOperationalArchive" WHERE "batchId"='music-operational-retirement-20261023' AND "storeId"='store-lubymusic')
 THEN RAISE EXCEPTION 'Isolated music preview and sealed archive required'; END IF;
END $$;
ALTER TABLE "CourseBookingRule" ADD COLUMN IF NOT EXISTS "selfLeaveEnabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "CourseBookingRule" ADD COLUMN IF NOT EXISTS "selfRescheduleEnabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "CourseBookingRule" ADD COLUMN IF NOT EXISTS "backendNoticesEnabled" boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS "CourseMusicLessonAssignment" (
 "bookingId" text PRIMARY KEY, "storeId" text NOT NULL, "cardId" text NOT NULL, "customerId" text NOT NULL,
 period integer NOT NULL CHECK(period BETWEEN 1 AND 1000), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 1000),
 kind text NOT NULL CHECK(kind IN ('REGULAR','MAKEUP')), "sourceBookingId" text,
 "releasedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY("bookingId","storeId") REFERENCES "CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("cardId","storeId") REFERENCES "CoursePointCard"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("sourceBookingId","storeId") REFERENCES "CourseBooking"(id,"storeId") ON DELETE RESTRICT,
 CHECK((kind='MAKEUP')=("sourceBookingId" IS NOT NULL)), CHECK("sourceBookingId" IS DISTINCT FROM "bookingId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MusicLesson_regular_slot" ON "CourseMusicLessonAssignment"("storeId","cardId","customerId",period,ordinal) WHERE kind='REGULAR' AND "releasedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "MusicLesson_active_makeup" ON "CourseMusicLessonAssignment"("storeId","sourceBookingId") WHERE kind='MAKEUP' AND "releasedAt" IS NULL;
ALTER TABLE "CourseMusicLessonAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseMusicLessonAssignment" FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.music_lesson_assignment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b record; c record; src record; coupon record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lesson history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (NEW."bookingId",NEW."storeId",NEW."cardId",NEW."customerId",NEW.kind,NEW."sourceBookingId") IS DISTINCT FROM (OLD."bookingId",OLD."storeId",OLD."cardId",OLD."customerId",OLD.kind,OLD."sourceBookingId") THEN RAISE EXCEPTION 'Lesson identity cannot be replaced'; END IF;
 SELECT * INTO b FROM public."CourseBooking" WHERE id=NEW."bookingId" AND "storeId"=NEW."storeId";
 SELECT * INTO c FROM public."CoursePointCard" WHERE id=NEW."cardId" AND "storeId"=NEW."storeId";
 IF b."customerId" IS DISTINCT FROM NEW."customerId"  OR c."musicOpeningStateRequired" THEN RAISE EXCEPTION 'Lesson ownership mismatch'; END IF;
 IF b."cardId" IS DISTINCT FROM NEW."cardId" THEN
  SELECT * INTO coupon FROM public."CoursePointCard" WHERE id=b."cardId" AND "storeId"=NEW."storeId";
  IF NEW.kind<>'MAKEUP' OR coupon."requestKey" IS DISTINCT FROM ('music-leave-makeup:'||NEW."sourceBookingId") THEN RAISE EXCEPTION 'Lesson card mismatch'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public."MusicOperationalArchive" a WHERE a."storeId"=NEW."storeId" AND a."entityType" IN ('CourseBooking','CoursePointCard','Customer') AND a."rowKey" IN (NEW."bookingId",NEW."cardId",NEW."customerId")) THEN RAISE EXCEPTION 'Archived records are immutable'; END IF;
 IF COALESCE(cardinality(c."musicTermSizes"),0)=0 OR NEW.period>cardinality(c."musicTermSizes")+(CASE WHEN c."musicBonusLessons">0 THEN 1 ELSE 0 END) OR NEW.ordinal>(CASE WHEN NEW.period=cardinality(c."musicTermSizes")+1 THEN c."musicBonusLessons" ELSE c."musicTermSizes"[NEW.period] END) THEN RAISE EXCEPTION 'Lesson is outside purchased periods'; END IF;
 IF b.status='CANCELLED' AND b."absenceKind" IS NULL THEN NEW."releasedAt"=COALESCE(NEW."releasedAt",now()); END IF;
 IF NEW.kind='MAKEUP' THEN
  SELECT * INTO src FROM public."CourseMusicLessonAssignment" WHERE "bookingId"=NEW."sourceBookingId";
  IF NOT FOUND OR src."cardId"<>NEW."cardId" OR src."customerId"<>NEW."customerId" OR src.period<>NEW.period OR src.ordinal<>NEW.ordinal OR (b."cardId"=NEW."cardId" AND b."makeupForBookingId" IS DISTINCT FROM NEW."sourceBookingId") THEN RAISE EXCEPTION 'Makeup must retain its original lesson'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS music_lesson_assignment_guard ON "CourseMusicLessonAssignment";
CREATE TRIGGER music_lesson_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON "CourseMusicLessonAssignment" FOR EACH ROW EXECUTE FUNCTION public.music_lesson_assignment_guard();
CREATE OR REPLACE FUNCTION public.music_lesson_assignment_release() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public."CourseMusicLessonAssignment" SET "releasedAt"=CASE WHEN NEW.status='CANCELLED' AND NEW."absenceKind" IS NULL THEN COALESCE("releasedAt",now()) ELSE NULL END,"updatedAt"=now() WHERE "bookingId"=NEW.id AND "storeId"=NEW."storeId";
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS music_lesson_assignment_release ON "CourseBooking";
CREATE TRIGGER music_lesson_assignment_release AFTER UPDATE OF status,"absenceKind" ON "CourseBooking" FOR EACH ROW EXECUTE FUNCTION public.music_lesson_assignment_release();
