import {assertSportsSharedCardPreviewEnvironment} from './sports-shared-card-preview-scope.mjs';

/** Temporary acceptance scope. It never authorizes a request or changes LINE settings.
 * @param {Readonly<Record<string,string|undefined>>} env
 * @param {number} realNow
 */
export function digitalManagerCronPreviewScope(env=process.env,realNow=Date.now()) {
 const raw=env.DIGITAL_MANAGER_CRON_QA_WINDOW;
 if(!raw)return null;
 if(env.VERCEL!=='1'||env.VERCEL_GIT_COMMIT_REF!=='feat/store-manager-bell-20261030')throw new Error('Invalid cron acceptance environment');
 assertSportsSharedCardPreviewEnvironment(env);
 const config=JSON.parse(raw);
 if(!config||Array.isArray(config)||Object.keys(config).sort().join(',')!=='businessNow,expiresAt,issuedAt')throw new Error('Invalid cron acceptance window');
 const {issuedAt,expiresAt,businessNow}=config;
 if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(expiresAt)||expiresAt<=issuedAt||expiresAt-issuedAt>30*60_000||realNow<issuedAt||realNow>=expiresAt)throw new Error('Expired or invalid cron acceptance window');
 const now=new Date(businessNow);
 if(typeof businessNow!=='string'||!Number.isFinite(now.getTime())||Math.abs(now.getTime()-issuedAt)>36*60*60_000)throw new Error('Invalid cron acceptance business time');
 return {now,storeIds:['staging-store','dm-bell-sports','dm-bell-music','dm-bell-beauty']};
}

/** Block every other CRON_SECRET consumer while the temporary override exists.
 * @param {string} path
 * @param {Readonly<Record<string,string|undefined>>} env
 * @param {number} realNow
 */
export function digitalManagerCronPreviewPathAllowed(path,env=process.env,realNow=Date.now()) {
 if(!env.DIGITAL_MANAGER_CRON_QA_WINDOW)return true;
 try {
  digitalManagerCronPreviewScope(env,realNow);
  return ['/api/cron/incomplete-service-reminders','/api/cron/daily-action-digest','/api/cron/beauty-notifications'].includes(path);
 } catch { return false; }
}
