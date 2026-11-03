-- REVIEW CANDIDATE ONLY: excluded from automatic migration runners.
-- Adds entitlement metadata only. No card conversion, ledger updates or role grants.
-- Apply to an isolated database first. Production execution is not authorized.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public."CoursePointPlan"
  ADD COLUMN "sportsMode" text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "sportsSubjectId" text,
  ADD COLUMN "sportsCost" integer,
  ADD CONSTRAINT "CoursePointPlan_sports_entitlement_check" CHECK (
    ("sportsMode" = 'LEGACY' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL)
    OR ("sportsMode" = 'OPEN' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL AND unit IN ('POINT', 'SESSION'))
    OR ("sportsMode" = 'ASSIGNED' AND "sportsSubjectId" IS NOT NULL
        AND length("sportsSubjectId") BETWEEN 1 AND 100
        AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
        AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1)))
  );
ALTER TABLE public."CoursePurchase"
  ADD COLUMN "sportsMode" text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "sportsSubjectId" text,
  ADD COLUMN "sportsCost" integer,
  ADD CONSTRAINT "CoursePurchase_sports_entitlement_check" CHECK (
    ("sportsMode" = 'LEGACY' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL)
    OR ("sportsMode" = 'OPEN' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL AND unit IN ('POINT', 'SESSION'))
    OR ("sportsMode" = 'ASSIGNED' AND "sportsSubjectId" IS NOT NULL
        AND length("sportsSubjectId") BETWEEN 1 AND 100
        AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
        AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1)))
  );
ALTER TABLE public."CoursePointCard"
  ADD COLUMN "sportsMode" text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "sportsSubjectId" text,
  ADD COLUMN "sportsCost" integer,
  ADD CONSTRAINT "CoursePointCard_sports_entitlement_check" CHECK (
    ("sportsMode" = 'LEGACY' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL)
    OR ("sportsMode" = 'OPEN' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL AND unit IN ('POINT', 'SESSION'))
    OR ("sportsMode" = 'ASSIGNED' AND "sportsSubjectId" IS NOT NULL
        AND length("sportsSubjectId") BETWEEN 1 AND 100
        AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
        AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1)))
  );
COMMIT;
