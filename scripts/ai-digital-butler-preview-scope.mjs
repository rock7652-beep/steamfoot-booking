import { isSelfBookingPreviewDatabaseUrl } from './course-self-booking-preview-scope.mjs';

export const AI_PREVIEW_BRANCH = 'feat/ai-digital-butler-core';
export const AI_PREVIEW_DATABASE_ROLE = 'steamfoot_ai_preview_20261125';

export function isAiPreviewDatabaseUrl(value) {
  if (isSelfBookingPreviewDatabaseUrl(value)) return true;
  try {
    const url = new URL(value);
    const direct = url.hostname === 'db.ttworfzgwejdeolegkxl.supabase.co';
    if (url.username !== AI_PREVIEW_DATABASE_ROLE + (direct ? '' : '.ttworfzgwejdeolegkxl')) return false;
    url.username = direct ? 'postgres' : 'postgres.ttworfzgwejdeolegkxl';
    return isSelfBookingPreviewDatabaseUrl(url.toString());
  } catch { return false; }
}

/** A claim in any provider must satisfy the complete Vercel tuple. */
export function claimsAiPreview(env = process.env) {
  return [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH].includes(AI_PREVIEW_BRANCH)
    || env.AI_DIGITAL_BUTLER_PREVIEW === '1';
}

export function assertAiPreview(env = process.env) {
  const fail = () => { throw new Error('AI Preview isolation is incomplete; no connection or delivery is allowed.'); };
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_GIT_COMMIT_REF !== AI_PREVIEW_BRANCH
    || env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep'
    || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking'
    || env.VERCEL_PROJECT_ID !== 'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'
    || env.PRODUCTION_MIGRATION_TARGET || env.BEAUTY_NOTIFICATIONS_ENABLED !== '0'
    || env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH
    || env.AI_DIGITAL_BUTLER_PREVIEW !== '1'
    || env.AI_EXTERNAL_DELIVERY_DISABLED !== '1') fail();
  if (env.AI_PREVIEW_POOLER_MODE !== undefined && !['shared-session-aws1', 'shared-transaction-aws1'].includes(env.AI_PREVIEW_POOLER_MODE)) fail();
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isAiPreviewDatabaseUrl)) fail();
  // Reject secondary clients inheriting production secrets, even when unused.
  if (env.BEAUTY_DATABASE_MODE !== 'legacy'
    || ['BEAUTY_DATABASE_URL', 'BEAUTY_DATABASE_PASSWORD', 'BEAUTY_DATABASE_ROLE',
      'ADDONS_DATABASE_URL', 'ADDONS_DATABASE_PASSWORD', 'ADDONS_DATABASE_ROLE'].some(key => Boolean(env[key]))) fail();
}

/** Called before cached clients are selected too. Other branches retain their policy. */
export function assertAiDatabaseConnection(base, env = process.env) {
  if (!claimsAiPreview(env)) return;
  assertAiPreview(env);
  if (!isAiPreviewDatabaseUrl(base)) throw new Error('AI Preview rejected a secondary database connection.');
}

/** Preserve write-only credentials while selecting the dashboard-confirmed endpoint.
 * No caller-supplied hostname or port can override the isolated destination.
 */
export function resolveAiPreviewDatabaseUrl(base, env = process.env) {
  assertAiDatabaseConnection(base, env);
  if (!claimsAiPreview(env) || env.AI_PREVIEW_POOLER_MODE === undefined) return base;
  const url = new URL(base);
  if (url.username !== AI_PREVIEW_DATABASE_ROLE + '.ttworfzgwejdeolegkxl') {
    throw new Error('AI Shared Pooler requires the isolated test role and project suffix.');
  }
  url.hostname = 'aws-1-ap-northeast-1.pooler.supabase.com';
  const transaction = env.AI_PREVIEW_POOLER_MODE === 'shared-transaction-aws1';
  url.port = transaction ? '6543' : '5432';
  url.searchParams.set('pgbouncer', transaction ? 'true' : 'false');
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  return url.toString();
}
