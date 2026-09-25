-- Additive course-only reschedule history. Existing sessions remain unchanged.
ALTER TABLE "CourseSession"
  ADD COLUMN IF NOT EXISTS "rescheduledFromStartsAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "rescheduledFromEndsAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "rescheduleKind" TEXT,
  ADD COLUMN IF NOT EXISTS "rescheduledAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "rescheduledById" TEXT;

CREATE TABLE IF NOT EXISTS "CourseSessionMove" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "fromStartsAt" TIMESTAMPTZ(3) NOT NULL,
  "fromEndsAt" TIMESTAMPTZ(3) NOT NULL,
  "fromRoomId" TEXT NOT NULL,
  "fromCoachId" TEXT NOT NULL,
  "toStartsAt" TIMESTAMPTZ(3) NOT NULL,
  "toEndsAt" TIMESTAMPTZ(3) NOT NULL,
  "toRoomId" TEXT NOT NULL,
  "toCoachId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSessionMove_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CourseSessionMove_storeId_createdAt_idx"
  ON "CourseSessionMove"("storeId","createdAt");
CREATE INDEX IF NOT EXISTS "CourseSessionMove_storeId_sessionId_idx"
  ON "CourseSessionMove"("storeId","sessionId");

DO $$ BEGIN
  ALTER TABLE "CourseSessionMove"
    ADD CONSTRAINT "CourseSessionMove_sessionId_storeId_fkey"
    FOREIGN KEY ("sessionId","storeId") REFERENCES "CourseSession"("id","storeId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CourseSessionMove"
    ADD CONSTRAINT "CourseSessionMove_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CourseSessionMove"
    ADD CONSTRAINT "CourseSessionMove_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CourseSession"
    ADD CONSTRAINT "CourseSession_rescheduledById_fkey"
    FOREIGN KEY ("rescheduledById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CourseSessionMove" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CourseSession"
  DROP CONSTRAINT IF EXISTS "CourseSession_reschedule_kind_check";
ALTER TABLE "CourseSession"
  ADD CONSTRAINT "CourseSession_reschedule_kind_check"
  CHECK ("rescheduleKind" IS NULL OR "rescheduleKind" IN ('SINGLE','WEEKS'));

ALTER TABLE "CourseSessionMove"
  DROP CONSTRAINT IF EXISTS "CourseSessionMove_scope_check";
ALTER TABLE "CourseSessionMove"
  ADD CONSTRAINT "CourseSessionMove_scope_check"
  CHECK ("scope" IN ('SINGLE','WEEKS','FUTURE'));
