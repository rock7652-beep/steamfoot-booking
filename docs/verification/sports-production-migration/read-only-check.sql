BEGIN READ ONLY;
SELECT jsonb_build_object(
 'checked_at',now(),'postgres_version',current_setting('server_version'),
 'ledger_check',(SELECT jsonb_build_object('validated',convalidated,'definition',pg_get_constraintdef(oid),'expression',pg_get_expr(conbin,conrelid),'fingerprint',md5(pg_get_expr(conbin,conrelid)),'candidate_matches',md5(pg_get_expr(conbin,conrelid))='acff8c4c1a3c1701a7415f896b058364') FROM pg_constraint WHERE conrelid='public."CoursePointEntry"'::regclass AND conname='CoursePointEntry_values'),
 'metadata_table',to_regclass('public."SportsStagingSessionRule"'),
 'rental_table',to_regclass('public."CourseRental"'),
 'ledger_bytes',pg_total_relation_size('public."CoursePointEntry"'::regclass),
 'roles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 'fk_indexes',(SELECT jsonb_agg(jsonb_build_object('table',t.relname,'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'definition',pg_get_indexdef(i.indexrelid))) FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid WHERE i.indrelid IN ('public."CourseSession"'::regclass,'public."CoursePointPlan"'::regclass) AND i.indisunique),
 'ledger',(SELECT jsonb_build_object('rows',count(*),'cards',count(DISTINCT "cardId"),'invalid_values',count(*) FILTER(WHERE points<=0 OR points IS NULL OR kind IS NULL),'new_cancel_entries',count(*) FILTER(WHERE kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW|CANCELLED):CANCELLED:'),'coupon_reclaim_entries',count(*) FILTER(WHERE kind LIKE 'CANCEL_SOURCE:%'),'outside_original_constraint',count(*) FILTER(WHERE NOT (points>0 AND (
 kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID')
 OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'
 OR kind ~ '^CORRECT:CANCELLED:RESERVED:[0-9a-f-]{36}$'
 OR kind ~ '^(DEBIT|RELEASE|REFUND|RESERVE):USAGE:[0-9a-f-]{36}$'
 )))) FROM public."CoursePointEntry"),
 'cancelled_leave_bookings',(SELECT count(*) FROM public."CourseBooking" WHERE status='CANCELLED' AND "absenceKind" IN ('STUDENT_LEAVE','GROUP_LEAVE_FORFEITED')),
 'pending_target_locks',(SELECT count(*) FROM pg_locks WHERE NOT granted AND relation IN ('public."CoursePointEntry"'::regclass,'public."CourseSession"'::regclass,'public."CoursePointPlan"'::regclass))
) AS readiness;
COMMIT;
