-- Rehearsal rollback: only safe before any new-format ledger or metadata row.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='15s';
LOCK TABLE public."CoursePointEntry", public."SportsStagingSessionRule" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public."CoursePointEntry" WHERE NOT (
 points > 0 AND (
 kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
 OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
 OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
 ))) THEN RAISE EXCEPTION 'New-format ledger rows exist; preserve history'; END IF;
 IF EXISTS (SELECT 1 FROM public."SportsStagingSessionRule") THEN RAISE EXCEPTION 'Metadata rows exist; preserve history'; END IF;
END $$;
DROP TABLE public."SportsStagingSessionRule";
ALTER TABLE public."CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE public."CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (
 points > 0 AND (
 kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
 OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
 OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
 ));
COMMIT;
