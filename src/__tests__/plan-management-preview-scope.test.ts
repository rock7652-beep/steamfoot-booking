import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {assertReviewedReleaseEnvironment} from '../../scripts/consultation-preview-scope.mjs';
const valid={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'fix/plan-card-management-20261029',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres',DIRECT_URL:'postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres'};
it('allows only the isolated no-migration review mode',()=>expect(assertReviewedReleaseEnvironment(valid)).toBe('module-roster-preview'));
it.each(['VERCEL_ENV','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','DATABASE_URL','DIRECT_URL'])('rejects missing or spoofed %s',key=>{
 expect(()=>assertReviewedReleaseEnvironment({...valid,[key]:undefined})).toThrow();
 expect(()=>assertReviewedReleaseEnvironment({...valid,[key]:'production'})).toThrow();
});
it.each(['WORKERS_CI_BRANCH','CF_PAGES_BRANCH'])('rejects conflicting provider %s',key=>expect(()=>assertReviewedReleaseEnvironment({...valid,[key]:valid.VERCEL_GIT_COMMIT_REF})).toThrow());
it('rejects database routing overrides and the production database',()=>{
 for(const key of ['DATABASE_URL','DIRECT_URL'] as const){
  expect(()=>assertReviewedReleaseEnvironment({...valid,[key]:valid[key]+'?host=production'})).toThrow();
  expect(()=>assertReviewedReleaseEnvironment({...valid,[key]:valid[key].replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')})).toThrow();
 }
});
it('exits the actual migration runner before database clients or subprocesses',()=>{
 const guard=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){const source=s==='@prisma/client'?"export class PrismaClient {constructor(){throw Error('FORBIDDEN_DATABASE')}}":s==='node:child_process'?"export function execFileSync(){throw Error('FORBIDDEN_MIGRATION')}":null;return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(s,c)}})`;
 const result=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),'scripts/ci-migrate.mjs'],{env:{PATH:process.env.PATH,NODE_ENV:'production',...valid},encoding:'utf8'});
 expect(result.error).toBeUndefined();expect(result.status).toBe(0);expect(result.stdout).toContain('migrations_skipped=true');expect(result.stdout+result.stderr).not.toMatch(/FORBIDDEN_DATABASE|FORBIDDEN_MIGRATION/);
});
