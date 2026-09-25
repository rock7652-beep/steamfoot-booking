-- Record restoration of a student leave as a correction without weakening
-- the existing accepted point-entry kinds for other course modules.
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (
  points > 0 AND (
    kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
    OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
    OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
    OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
  )
);
