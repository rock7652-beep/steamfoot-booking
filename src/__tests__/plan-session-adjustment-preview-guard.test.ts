import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {assertReviewedReleaseEnvironment} from '../../scripts/consultation-preview-scope.mjs';
const metadata={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/plan-session-adjustment-20261030',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking'};
it.each(['ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf'])('review branch cannot access or migrate project %s',ref=>{
  const env={...metadata,DATABASE_URL:`postgresql://postgres:test@db.${ref}.supabase.co:5432/postgres`,DIRECT_URL:`postgresql://postgres:test@db.${ref}.supabase.co:5432/postgres`};
  expect(()=>assertReviewedReleaseEnvironment(env)).toThrow('exact authorized Preview branch');
  const guard=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){const source=s==='@prisma/client'?"export class PrismaClient {constructor(){throw Error('FORBIDDEN_DATABASE')}}":s==='node:child_process'?"export function execFileSync(){throw Error('FORBIDDEN_MIGRATION')}":null;return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(s,c)}})`;
  const result=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),'scripts/ci-migrate.mjs'],{env:{PATH:process.env.PATH,NODE_ENV:'production',...env},encoding:'utf8'});
  expect(result.error).toBeUndefined();expect(result.status).not.toBe(0);expect(result.stdout+result.stderr).toContain('exact authorized Preview branch');expect(result.stdout+result.stderr).not.toMatch(/FORBIDDEN_DATABASE|FORBIDDEN_MIGRATION/);
});
