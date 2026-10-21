/** Strict local release rehearsal; never a hosted or production database mode. */
import { beautyDatabaseSelection } from './beauty-database-scope.mjs';
export const BEAUTY_RELEASE_QA_ORIGIN = 'http://localhost:3116';
export function assertBeautyReleaseQaEnvironment(env) {
  if (env.BEAUTY_RELEASE_QA !== '1' || env.NODE_ENV !== 'production' ||
      env.BEAUTY_LOCAL_QA || env.BEAUTY_SANDBOX_QA || env.BEAUTY_PRODUCTION_QA ||
      ['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'].some(k=>Boolean(env[k])) ||
      env.AUTH_URL !== BEAUTY_RELEASE_QA_ORIGIN || env.NEXTAUTH_URL !== env.AUTH_URL ||
      !['0','1'].includes(env.BEAUTY_MODULE_ENABLED) || env.BEAUTY_NOTIFICATIONS_ENABLED !== '0' ||
      !env.AUTH_SECRET || env.LINE_CHANNEL_ACCESS_TOKEN || env.WEB_LINE_LOGIN_CHANNEL_SECRET)
    throw Error('Beauty release QA requires isolated local production, no hosted metadata or notifications.');
  for (const key of ['DATABASE_URL','DIRECT_URL']) {
    const u=new URL(env[key]??'');
    if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='32770'||u.pathname!=='/beauty_1374_releaseqa'||u.username!=='beauty_1374_releaseapp'||!u.password||u.search||u.hash||/[\s\\\u0000-\u001f\u007f]/.test(env[key]??''))
      throw Error('Beauty release QA requires its fixed loopback DB and restricted role.');
  }
  if(env.DATABASE_URL!==env.DIRECT_URL)throw Error('Beauty release QA clients must share the isolated database.');
  const dedicated=beautyDatabaseSelection(env);
  if(dedicated!==undefined) {
    const u=new URL(dedicated);
    if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='32770'||u.pathname!=='/beauty_1374_releaseqa'||u.username!=='steamfoot_beauty_data_qa'||u.search||u.hash)
      throw Error('Dedicated Beauty release QA requires its fixed loopback DB and data role.');
  }
}
