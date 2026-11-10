import { fileURLToPath } from 'node:url';
import { assertCoursePhoneAPreview, COURSE_PHONE_A_STORE } from './course-phone-a-preview-scope.mjs';

export async function coursePhoneAPreviewPreflight(env = process.env) {
  if (!assertCoursePhoneAPreview(env)) return;
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } }, log: [] });
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const rows = await tx.$queryRawUnsafe(`SELECT
        EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Customer' AND column_name='contactPhone') AS contact_ready,
        EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public."CoursePhoneViewGrant"') AND relrowsecurity) AS grant_ready,
        NOT EXISTS(SELECT FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='CoursePhoneViewGrant' AND grantee IN ('PUBLIC','anon','authenticated')) AS private_ready,
        EXISTS(SELECT FROM public."Store" WHERE id=$1 AND slug='course-start-0918-a' AND "industryModule"::text='COURSE' AND "operatingStatus"::text='ACTIVE' AND "liffId"='2010761154-2BkMDceh') AS store_ready`, COURSE_PHONE_A_STORE);
      if (rows.length !== 1 || Object.values(rows[0]).some(value => value !== true)) throw Error('A-store phone Preview schema is not ready');
    });
    console.info('[course-phone-a-preview] isolated_database=true schema_ready=true migrations_skipped=true notifications_blocked=true');
  } finally { await db.$disconnect(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) coursePhoneAPreviewPreflight().catch(() => {
  console.error('[course-phone-a-preview] blocked: verify isolated connections, schema and A-store configuration; no migrations applied');
  process.exitCode = 1;
});
