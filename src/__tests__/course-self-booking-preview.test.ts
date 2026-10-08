import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";
import { assertCourseSelfBookingPreviewEnvironment, assertCourseSelfBookingPreviewSchema, COURSE_SELF_BOOKING_PREVIEW_BRANCH, isSelfBookingPreviewDatabaseUrl } from "../../scripts/course-self-booking-preview-scope.mjs";
const direct="postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool="postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:COURSE_SELF_BOOKING_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:pool,DIRECT_URL:direct};
const snapshot={columns_ready:true,rls_enabled:true,browser_access:false,store_ready:true};
const unsafe=[undefined,"", "invalid", direct.replace("ttworfzgwejdeolegkxl","qijlnhtpbintanzpxkvf"), pool.replace("aws-0-","aws-2-"),direct.replace("/postgres","/other"),direct.replace(":5432",":6543"),...['?host=elsewhere','?options=-csearch_path=private','?schema=private','?schema=public&schema=public','?sslmode=disable','?sslaccept=accept_invalid_certs','?connection_limit=0','?socket_timeout=301','#fragment'].map(x=>direct+x)];
function run(overrides:Record<string,string|undefined>={},schema=snapshot){
 const stub=`export class PrismaClient { async $queryRaw(){return [${JSON.stringify(schema)}];} async $disconnect(){} }`;
 const trap='SELF_BOOKING_UNAUTHORIZED_SUBPROCESS';
 const hook=`import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){const code=s==='@prisma/client'?${JSON.stringify(stub)}:s==='node:child_process'?${JSON.stringify(`export function execFileSync(){throw new Error('${trap}');}`)}:null;return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:n(s,c);}});`;
 const env:NodeJS.ProcessEnv={...process.env,...valid,NODE_ENV:'production',GUIDE_UI_PREVIEW:'',WORKERS_CI_BRANCH:'',CF_PAGES_BRANCH:'',CONSULTATION_PREVIEW_INTAKE_ENABLED:'',PRODUCTION_MIGRATION_TARGET:'unrelated-migration',...overrides};
 const r=spawnSync(process.execPath,['--import',`data:text/javascript,${encodeURIComponent(hook)}`,'scripts/ci-migrate.mjs'],{env,encoding:'utf8',timeout:10000});
 const output=r.stdout+r.stderr;expect(r.error).toBeUndefined();expect(output).not.toContain(trap);for(const url of [env.DATABASE_URL,env.DIRECT_URL])if(url)expect(output).not.toContain(url);return {status:r.status,output};
}
describe('student self-booking exact Preview gate',()=>{
 it('uses its own explicit mode with no borrowed consultation flags',()=>{
  expect(assertReviewedReleaseEnvironment(valid)).toBe('course-self-booking-preview');
  const result=run();expect(result.status).toBe(0);expect(result.output).toContain('schema_ready=true');expect(result.output).toContain('migrations_skipped=true');expect(result.output).not.toContain('migration_deploy');
 });
 it.each(['DATABASE_URL','DIRECT_URL'])('rejects wrong or overridable %s before migration',key=>{
  for(const value of unsafe){expect(isSelfBookingPreviewDatabaseUrl(value)).toBe(false);expect(()=>assertCourseSelfBookingPreviewEnvironment({...valid,[key]:value})).toThrow('isolated database');expect(run({[key]:value}).status).not.toBe(0);}
 });
 it.each(['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG'])('requires exact %s',key=>{
  for(const value of [undefined,'','wrong']){expect(()=>assertCourseSelfBookingPreviewEnvironment({...valid,[key]:value})).toThrow('exact Vercel Preview');expect(run({[key]:value}).status).not.toBe(0);}
 });
 it.each(['WORKERS_CI_BRANCH','CF_PAGES_BRANCH'])('rejects conflicting %s',key=>{expect(()=>assertCourseSelfBookingPreviewEnvironment({...valid,[key]:'main'})).toThrow('exact Vercel Preview');});
 it.each(['columns_ready','rls_enabled','browser_access','store_ready'] as const)('fails closed for invalid %s with no migration repair',key=>{
  const bad={...snapshot,[key]:!snapshot[key]};expect(()=>assertCourseSelfBookingPreviewSchema(bad)).toThrow('not ready');expect(run({},bad).status).not.toBe(0);
 });
 it('keeps production path strict and does not require isolated URLs there',()=>{
  expect(assertReviewedReleaseEnvironment({...valid,VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',DATABASE_URL:'production',DIRECT_URL:'production'})).toBe('production');
  expect(()=>assertReviewedReleaseEnvironment({...valid,VERCEL_ENV:'production'})).toThrow();
 });
 it('disables automatic deployment before the first branch publication',()=>{expect(JSON.parse(readFileSync('vercel.json','utf8')).git.deploymentEnabled[COURSE_SELF_BOOKING_PREVIEW_BRANCH]).toBe(false);});
});
