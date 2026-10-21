/** Local production-runtime regression only. Never permits hosted deployment. */
export const BEAUTY_PRODUCTION_QA_ORIGIN = 'http://localhost:3115';
export function assertBeautyProductionQaEnvironment(env) {
  if (env.BEAUTY_PRODUCTION_QA !== '1' || env.NODE_ENV !== 'production' ||
      env.BEAUTY_LOCAL_QA || env.BEAUTY_SANDBOX_QA ||
      ['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'].some(k => Boolean(env[k])) ||
      env.AUTH_URL !== BEAUTY_PRODUCTION_QA_ORIGIN || env.NEXTAUTH_URL !== env.AUTH_URL ||
      env.BEAUTY_MODULE_ENABLED !== '0' || env.BEAUTY_NOTIFICATIONS_ENABLED !== '0' ||
      !env.AUTH_SECRET || env.LINE_CHANNEL_ACCESS_TOKEN || env.WEB_LINE_LOGIN_CHANNEL_SECRET) {
    throw new Error('Beauty production QA requires local production runtime, closed module, no hosted metadata or LINE credentials.');
  }
  for (const key of ['DATABASE_URL','DIRECT_URL']) {
    const u = new URL(env[key] ?? '');
    if (u.protocol !== 'postgresql:' || u.hostname !== '127.0.0.1' || u.port !== '32769' ||
        u.pathname !== '/beauty_1374_prodqa' || u.username !== 'beauty_1374_prodapp' || !u.password || u.search || u.hash ||
        /[\s\\\u0000-\u001f\u007f]/.test(env[key] ?? '')) {
      throw new Error('Beauty production QA requires its separate loopback database and restricted role.');
    }
  }
  if (env.DATABASE_URL !== env.DIRECT_URL) throw new Error('Beauty production QA connections must target the same isolated database.');
}
