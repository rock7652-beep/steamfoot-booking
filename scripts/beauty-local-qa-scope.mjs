/** Opt-in for PR #1374's synthetic, loopback-only integration database.
 * Never grants an exception to a hosted build or a remote database. */
export function assertBeautyLocalQaEnvironment(env) {
  if (env.BEAUTY_LOCAL_QA !== '1' || env.NODE_ENV !== 'development' ||
      ['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'].some(k => Boolean(env[k])) ||
      !['http://127.0.0.1:3114','http://localhost:3114'].includes(env.AUTH_URL ?? '') || env.NEXTAUTH_URL !== env.AUTH_URL ||
      env.BEAUTY_MODULE_ENABLED !== '1' || env.BEAUTY_NOTIFICATIONS_ENABLED !== '0') {
    throw new Error('Beauty QA requires explicit local development and disabled notifications.');
  }
  for (const key of ['DATABASE_URL','DIRECT_URL']) {
    const u = new URL(env[key] ?? '');
    if (u.protocol !== 'postgresql:' || u.hostname !== '127.0.0.1' || u.port !== '32768' ||
        u.pathname !== '/beauty_1374_qa' || u.username !== 'beauty_1374_app' || !u.password || u.search || u.hash ||
        /[\s\\\u0000-\u001f\u007f]/.test(env[key] ?? '')) {
      throw new Error('Beauty QA requires its dedicated loopback database and non-superuser app role.');
    }
  }
}
