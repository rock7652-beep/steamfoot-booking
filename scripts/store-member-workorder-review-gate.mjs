export const STORE_MEMBER_WORKORDER_REVIEW_BRANCH = 'feat/store-member-link-workorder-line-20261012';
import { isSelfBookingPreviewDatabaseUrl } from './course-self-booking-preview-scope.mjs';

/** This schema-dependent review must not auto-deploy or run migrations before
 * separate authorization for the exact isolated database and SQL. */
/** @param {Record<string, string | undefined>} env */
export function assertStoreMemberWorkorderReviewOnly(env = process.env) {
  if ([env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(STORE_MEMBER_WORKORDER_REVIEW_BRANCH)) {
    if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== STORE_MEMBER_WORKORDER_REVIEW_BRANCH ||
        env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' || env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH ||
        env.CONSULTATION_PREVIEW_INTAKE_ENABLED !== 'false' || ![env.DATABASE_URL,env.DIRECT_URL].every(isSelfBookingPreviewDatabaseUrl)) {
      throw new Error('Store member/work-order Preview requires its exact authorized branch, repository, isolated connections and disabled public intake.');
    }
  }
}

/** Read-only readiness after checking both connections; never repairs schema. */
export async function verifyStoreMemberWorkorderSchema(env = process.env) {
  assertStoreMemberWorkorderReviewOnly(env);
  if (env.VERCEL_GIT_COMMIT_REF !== STORE_MEMBER_WORKORDER_REVIEW_BRANCH) throw new Error('Member Preview readiness requires its exact branch.');
  const { PrismaClient } = await import('@prisma/client');
  const url = new URL(env.DATABASE_URL);
  for (const [key,value] of Object.entries({connection_limit:'1',connect_timeout:'10',pool_timeout:'10',socket_timeout:'10'})) url.searchParams.set(key,value);
  if(url.hostname.endsWith('.pooler.supabase.com'))url.searchParams.set('pgbouncer','true');
  const db=new PrismaClient({datasources:{db:{url:url.toString()}},log:[]});
  try {
    const [row]=await db.$queryRaw`SELECT
      (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('StoreMemberConnection','WorkOrderReadyNotification') AND c.relrowsecurity) AS rls_ready,
      NOT EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('StoreMemberConnection','WorkOrderReadyNotification') AND grantee IN ('PUBLIC','anon','authenticated')) AS browser_blocked,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ShopConfig' AND column_name='workOrderReadyNotificationEnabled' AND column_default='false' AND is_nullable='NO') AS setting_ready,
      (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND (table_name='StoreMemberConnection' AND column_name='verificationCode' OR table_name='WorkOrderReadyNotification' AND column_name='snapshot')) AS columns_ready,
      EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='WorkOrderReadyNotification' AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%("storeId", "orderId")%') AS dedupe_ready,
      (SELECT count(*)>=2 FROM pg_constraint WHERE contype='f' AND conrelid='public."WorkOrderReadyNotification"'::regclass) AS scoped_fk_ready`;
    if(!row||Object.values(row).some(value=>value!==true))throw new Error('Member/work-order Preview schema not ready; no migration or repair was run.');
    console.info('[member-workorder-preview] isolated_database=true schema_ready=true notifications_blocked=true public_intake_disabled=true migrations_skipped=true');
  } finally {await db.$disconnect();}
}
