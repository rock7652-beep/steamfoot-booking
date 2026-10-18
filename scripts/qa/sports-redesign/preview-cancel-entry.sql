-- Preview acceptance prerequisite only. Never run automatically in production.
-- Keep every existing ledger constraint; add the cancellation correction
-- emitted by correctCourseAttendance without weakening positive point checks.
DO $$
DECLARE existing_check text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO existing_check
 FROM pg_constraint
 WHERE conrelid='public."CoursePointEntry"'::regclass
   AND conname='CoursePointEntry_values';
 IF existing_check IS NULL THEN RAISE EXCEPTION 'Expected ledger constraint missing'; END IF;
 IF position('CORRECT:(RESERVED|ATTENDED|NO_SHOW):CANCELLED:' IN existing_check)=0 THEN
  ALTER TABLE public."CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
  EXECUTE format('ALTER TABLE public."CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK ((%s) OR (points > 0 AND kind ~ %L))',
   existing_check, '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):CANCELLED:[0-9a-f-]{36}$');
 END IF;
END $$;
