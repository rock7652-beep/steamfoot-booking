-- Read-only checks after expand and before application promotion.
-- Keep results in the deployment record, never commit operational totals.
SELECT c.relname AS table_name,c.relrowsecurity AS rls
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('CourseScheduleSeries','CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment','CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement');
SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('CourseScheduleSeries','CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment','CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement') AND grantee IN ('PUBLIC','anon','authenticated');
-- All six counts must remain zero immediately after DDL, before any application writes.
SELECT 'CourseScheduleSeries' AS relation,count(*) FROM public."CourseScheduleSeries"
UNION ALL SELECT 'CourseMusicTuition',count(*) FROM public."CourseMusicTuition"
UNION ALL SELECT 'CourseMusicReceipt',count(*) FROM public."CourseMusicReceipt"
UNION ALL SELECT 'CourseMusicLessonAssignment',count(*) FROM public."CourseMusicLessonAssignment"
UNION ALL SELECT 'CourseMusicOpeningState',count(*) FROM public."CourseMusicOpeningState"
UNION ALL SELECT 'CourseMusicOpeningMakeupEntitlement',count(*) FROM public."CourseMusicOpeningMakeupEntitlement";
SELECT conname,convalidated FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname IN ('MusicProductionOpeningDisabled','MusicProductionOpeningMakeupDisabled','CourseBooking_values');
SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('music_lesson_assignment_guard','music_lesson_assignment_release');
