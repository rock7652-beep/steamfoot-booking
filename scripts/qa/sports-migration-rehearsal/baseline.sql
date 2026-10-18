-- Exact allowed formats observed by the production read-only audit (2026-10-18).
ALTER TABLE public."CoursePointEntry" DROP CONSTRAINT IF EXISTS "CoursePointEntry_values";
ALTER TABLE public."CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (
 points > 0 AND (
 kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
 OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
 OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
 ));
