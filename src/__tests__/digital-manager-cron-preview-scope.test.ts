import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {digitalManagerCronPreviewScope as scope,digitalManagerCronPreviewPathAllowed as allowed} from '../../scripts/digital-manager-cron-preview-scope.mjs';
const issuedAt=Date.parse('2026-10-30T12:00:00Z');
const config={issuedAt,expiresAt:issuedAt+15*60_000,businessNow:'2026-10-31T01:05:00Z'};
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/store-manager-bell-20261030',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres',DIRECT_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres',DIGITAL_MANAGER_CRON_QA_WINDOW:JSON.stringify(config)};
it('leaves ordinary deployments unchanged without an acceptance window',()=>{
 expect(scope({},issuedAt)).toBeNull();expect(allowed('/api/cron/reminders',{},issuedAt)).toBe(true);
});
it('limits the isolated review to four fixtures and a separate business clock',()=>{
 expect(scope(env,issuedAt)).toEqual({now:new Date(config.businessNow),storeIds:['staging-store','dm-bell-sports','dm-bell-music','dm-bell-beauty']});
 expect(allowed('/api/cron/beauty-notifications',env,issuedAt)).toBe(true);
 for(const path of ['/api/cron/reminders','/api/cron/beauty-notifications/','/api/health/reminders-cron'])expect(allowed(path,env,issuedAt)).toBe(false);
});
it.each([{VERCEL:'0'},{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_GIT_REPO_OWNER:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{CF_PAGES_BRANCH:'main'},{WORKERS_CI_BRANCH:'main'},{DATABASE_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'},{DIRECT_URL:env.DIRECT_URL+'?options=role%3Dpostgres'}])('rejects unsafe provenance %j',patch=>{
 expect(()=>scope({...env,...patch},issuedAt)).toThrow();expect(allowed('/api/cron/beauty-notifications',{...env,...patch},issuedAt)).toBe(false);
});
it.each([issuedAt-1,config.expiresAt,config.expiresAt+1])('rejects requests outside the real-time window %s',now=>expect(()=>scope(env,now)).toThrow());
it.each([{...config,expiresAt:issuedAt+31*60_000},{...config,businessNow:'bad'},{...config,businessNow:'2026-12-01T00:00:00Z'},{...config,storeIds:['other']}])('rejects unbounded or injected configuration %j',config=>expect(()=>scope({...env,DIGITAL_MANAGER_CRON_QA_WINDOW:JSON.stringify(config)},issuedAt)).toThrow());
it('runs the temporary boundary before legacy cron proxy exclusion',()=>{
 const source=readFileSync('src/proxy.ts','utf8');
 expect(source.indexOf('!digitalManagerCronPreviewPathAllowed')).toBeLessThan(source.indexOf('if (legacyProxyExclusion.test'));
});
