-- Keep a durable reservation for fixed weekly/biweekly music lessons beyond
-- the materialized CourseSession rows shown on the calendar.
CREATE TABLE public."CourseScheduleSeries" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "pointCost" INTEGER NOT NULL,
  "capacity" INTEGER NOT NULL,
  "frequency" TEXT NOT NULL,
  "untilDate" DATE,
  "generatedThrough" DATE NOT NULL,
  "excludedDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "generationError" TEXT,
  "cancelledAt" TIMESTAMPTZ(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseScheduleSeries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseScheduleSeries_frequency_check" CHECK ("frequency" IN ('WEEKLY', 'BIWEEKLY')),
  CONSTRAINT "CourseScheduleSeries_time_check" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "CourseScheduleSeries_storeId_requestKey_key"
  ON public."CourseScheduleSeries"("storeId", "requestKey");
CREATE INDEX "CourseScheduleSeries_storeId_cancelledAt_startsAt_idx"
  ON public."CourseScheduleSeries"("storeId", "cancelledAt", "startsAt");
CREATE INDEX "CourseScheduleSeries_storeId_roomId_startsAt_idx"
  ON public."CourseScheduleSeries"("storeId", "roomId", "startsAt");
CREATE INDEX "CourseScheduleSeries_storeId_coachId_startsAt_idx"
  ON public."CourseScheduleSeries"("storeId", "coachId", "startsAt");

-- Existing fixed batches were stored as a rolling set of dates. Convert their
-- anchor and recurrence to a durable rule, preserving each existing session.
INSERT INTO public."CourseScheduleSeries" (
  "id", "storeId", "requestKey", "templateId", "nameSnapshot", "roomId", "coachId",
  "startsAt", "endsAt", "pointCost", "capacity", "frequency", "generatedThrough", "createdById"
)
SELECT
  'series_' || md5(s."storeId" || ':' || s."requestKey"),
  s."storeId", s."requestKey", s."templateId", MIN(s."nameSnapshot"), s."roomId", s."coachId",
  MIN(s."startsAt"),
  MIN(s."startsAt") + (MIN(s."endsAt") - MIN(s."startsAt")),
  MIN(s."pointCost"), MIN(s."capacity"),
  MIN(s."scheduleFrequency"),
  MAX(s."startsAt")::date,
  MIN(s."createdById")
FROM public."CourseSession" s
WHERE s."scheduleType" = 'FIXED'
  AND s."scheduleFrequency" IN ('WEEKLY', 'BIWEEKLY')
  AND s."cancelledAt" IS NULL
GROUP BY s."storeId", s."requestKey", s."templateId", s."roomId", s."coachId"
HAVING COUNT(*) > 1
   AND COUNT(DISTINCT s."scheduleFrequency") = 1
ON CONFLICT ("storeId", "requestKey") DO NOTHING;
