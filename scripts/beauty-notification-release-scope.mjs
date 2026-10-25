/** Non-secret release configuration; never returns connection strings. */
export function beautyNotificationActivationAt(env = process.env) {
    const value = env.BEAUTY_NOTIFICATIONS_ACTIVATED_AT;
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}
export function reviewedBeautyNotificationWorker(env = process.env) {
    if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' || env.VERCEL_GIT_COMMIT_REF !== 'main' ||
        env.VERCEL_GIT_REPO_OWNER !== 'rock7652-beep' || env.VERCEL_GIT_REPO_SLUG !== 'steamfoot-booking' ||
        env.BEAUTY_MODULE_ENABLED !== '1' || env.BEAUTY_DATABASE_MODE !== 'dedicated' ||
        env.BEAUTY_DATABASE_ROLE !== 'steamfoot_beauty_prod_20261025' ||
        env.BEAUTY_NOTIFICATION_WORKER_MODE !== 'shared-main-v1' || !beautyNotificationActivationAt(env) ||
        env.PRODUCTION_MIGRATION_TARGET || env.BEAUTY_HOSTED_PREVIEW ||
        Object.keys(env).some(k => /(?:_QA|_ACCEPTANCE)$/.test(k) && env[k] === '1'))
        return false;
    try {
        const u = new URL(env.DATABASE_URL), user = decodeURIComponent(u.username), project = 'qijlnhtpbintanzpxkvf';
        return ['postgres:', 'postgresql:'].includes(u.protocol) && u.pathname === '/postgres' &&
            (u.hostname === `db.${project}.supabase.co` && user === 'postgres' ||
                /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) && user === `postgres.${project}`);
    }
    catch {
        return false;
    }
}
