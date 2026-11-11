-- Additive multi-subject snapshots. No card conversion, ledger writes or permission changes.
-- Apply only after isolated rehearsal and explicit database release authorization.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public."CoursePointPlan"
  ADD COLUMN IF NOT EXISTS "sportsSubjectIds" text[] NOT NULL DEFAULT '{}',
  DROP CONSTRAINT "CoursePointPlan_sports_entitlement_check",
  ADD CONSTRAINT "CoursePointPlan_sports_entitlement_check" CHECK (
    (cardinality("sportsSubjectIds") = 0 AND (
      ("sportsMode" = 'LEGACY' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL)
      OR ("sportsMode" = 'OPEN' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL AND unit IN ('POINT', 'SESSION'))
      OR ("sportsMode" = 'ASSIGNED' AND "sportsSubjectId" IS NOT NULL
          AND length("sportsSubjectId") BETWEEN 1 AND 100
          AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
          AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1)))
    )) OR (
      "sportsMode" = 'SUBJECTS' AND "sportsSubjectId" IS NULL
      AND cardinality("sportsSubjectIds") BETWEEN 1 AND 200
      AND array_ndims("sportsSubjectIds") = 1
      AND array_position("sportsSubjectIds", NULL) IS NULL
      AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
      AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1))
    )
  );

ALTER TABLE public."CoursePurchase"
  ADD COLUMN IF NOT EXISTS "sportsSubjectIds" text[] NOT NULL DEFAULT '{}',
  DROP CONSTRAINT "CoursePurchase_sports_entitlement_check",
  ADD CONSTRAINT "CoursePurchase_sports_entitlement_check" CHECK (
    (cardinality("sportsSubjectIds") = 0 AND (
      ("sportsMode" = 'LEGACY' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL)
      OR ("sportsMode" = 'OPEN' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL AND unit IN ('POINT', 'SESSION'))
      OR ("sportsMode" = 'ASSIGNED' AND "sportsSubjectId" IS NOT NULL
          AND length("sportsSubjectId") BETWEEN 1 AND 100
          AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
          AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1)))
    )) OR (
      "sportsMode" = 'SUBJECTS' AND "sportsSubjectId" IS NULL
      AND cardinality("sportsSubjectIds") BETWEEN 1 AND 200
      AND array_ndims("sportsSubjectIds") = 1
      AND array_position("sportsSubjectIds", NULL) IS NULL
      AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
      AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1))
    )
  );

ALTER TABLE public."CoursePointCard"
  ADD COLUMN IF NOT EXISTS "sportsSubjectIds" text[] NOT NULL DEFAULT '{}',
  DROP CONSTRAINT "CoursePointCard_sports_entitlement_check",
  ADD CONSTRAINT "CoursePointCard_sports_entitlement_check" CHECK (
    (cardinality("sportsSubjectIds") = 0 AND (
      ("sportsMode" = 'LEGACY' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL)
      OR ("sportsMode" = 'OPEN' AND "sportsSubjectId" IS NULL AND "sportsCost" IS NULL AND unit IN ('POINT', 'SESSION'))
      OR ("sportsMode" = 'ASSIGNED' AND "sportsSubjectId" IS NOT NULL
          AND length("sportsSubjectId") BETWEEN 1 AND 100
          AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
          AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1)))
    )) OR (
      "sportsMode" = 'SUBJECTS' AND "sportsSubjectId" IS NULL
      AND cardinality("sportsSubjectIds") BETWEEN 1 AND 200
      AND array_ndims("sportsSubjectIds") = 1
      AND array_position("sportsSubjectIds", NULL) IS NULL
      AND "sportsCost" IS NOT NULL AND "sportsCost" BETWEEN 1 AND 10000
      AND (unit = 'POINT' OR (unit = 'SESSION' AND "sportsCost" = 1))
    )
  );

COMMIT;
