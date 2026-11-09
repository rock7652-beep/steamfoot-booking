import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Manual, reviewed execution only. Never registered as a generic migrate deploy.
export const COURSE_AGREEMENTS_MIGRATIONS = [
  ['20261103153000_course_agreement_core', 'de63ab7244ea203e047f8c616683359d0d101afe3778b80cdf04bca32703f6b4'],
  ['20261103160000_course_agreement_signature_assets', '4b5b9431396363e527ff5cbe8bb1d5078610bc9c438c7abe7fe5e044fac305f8'],
  ['20261103170000_course_agreement_function_privileges', 'ffa4a81c9d04c757a5d02948a234ceea6bc61ae213a19c7f4c461f0401429418'],
];

/** One atomic PostgreSQL statement; preserves existing business rows and schema. */
export function buildCourseAgreementsMigrationSql() {
  const statements = COURSE_AGREEMENTS_MIGRATIONS.map(([name, checksum], index) => {
    const sql = readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
    if (createHash('sha256').update(sql).digest('hex') !== checksum) throw new Error('Agreement migration checksum mismatch.');
    const delimiter = `$agreement_migration_${index}$`;
    if (sql.includes(delimiter)) throw new Error('Agreement migration delimiter conflict.');
    return `EXECUTE ${delimiter}${sql}${delimiter};
INSERT INTO public._prisma_migrations (id,checksum,migration_name,started_at,finished_at,applied_steps_count)
VALUES (gen_random_uuid()::text,'${checksum}','${name}',now(),now(),1);`;
  });
  return `DO $course_agreements_release$
BEGIN
PERFORM set_config('lock_timeout','3s',true);
PERFORM set_config('statement_timeout','30s',true);
PERFORM pg_advisory_xact_lock(hashtextextended('course-agreements-reviewed-release',0));
IF to_regclass('public."Store"') IS NULL OR to_regclass('public."Customer"') IS NULL OR to_regclass('public._prisma_migrations') IS NULL THEN
 RAISE EXCEPTION 'Agreement migration dependencies missing';
END IF;
IF EXISTS (SELECT FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('CourseAgreementSetting','CourseAgreementVersion','CourseAgreementReview','CourseAgreementSignature','CourseAgreementSignatureAsset'))
 OR to_regprocedure('public.course_agreement_immutable()') IS NOT NULL
 OR EXISTS (SELECT FROM public._prisma_migrations WHERE migration_name IN (${COURSE_AGREEMENTS_MIGRATIONS.map(([name]) => `'${name}'`).join(',')})) THEN
 RAISE EXCEPTION 'Agreement migration partial or existing state rejected';
END IF;
${statements.join('\n')}
END $course_agreements_release$;`;
}
