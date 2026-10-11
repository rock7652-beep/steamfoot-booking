BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public."CourseBookingRule"
 ADD COLUMN "selfLeaveEnabled" boolean NOT NULL DEFAULT true,
 ADD COLUMN "selfRescheduleEnabled" boolean NOT NULL DEFAULT true,
 ADD COLUMN "backendNoticesEnabled" boolean NOT NULL DEFAULT false;
-- Preserve the previous rescheduling behavior when installing independent controls.
UPDATE public."CourseBookingRule" SET "selfRescheduleEnabled"="selfBookingEnabled";
CREATE TABLE public."CourseStoreNotice" (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES public."Store"(id),
 "subjectKey" text NOT NULL, kind text NOT NULL CHECK(kind IN ('BOOKING','LEAVE','CANCEL','MOVE','STOP','RESTORE')),
 "customerName" text NOT NULL, "courseName" text NOT NULL, "coachName" text NOT NULL,
 "previousCoachName" text, "startsAt" timestamptz(3) NOT NULL, "previousStartsAt" timestamptz(3),
 "affectedCount" integer NOT NULL DEFAULT 1 CHECK("affectedCount">=0), details jsonb NOT NULL,
 "handledAt" timestamptz(3), "handledById" text, "handledByName" text, revision integer NOT NULL DEFAULT 0,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE("storeId","subjectKey"),
 CHECK (("handledAt" IS NULL AND "handledById" IS NULL AND "handledByName" IS NULL) OR ("handledAt" IS NOT NULL AND "handledById" IS NOT NULL AND "handledByName" IS NOT NULL))
);
CREATE INDEX "CourseStoreNotice_storeId_handledAt_startsAt_idx" ON public."CourseStoreNotice"("storeId","handledAt","startsAt");
ALTER TABLE public."CourseStoreNotice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CourseStoreNotice" FROM anon, authenticated;
COMMIT;
