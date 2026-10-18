import {readFileSync} from "node:fs";
import {afterEach,describe,expect,it,vi} from 'vitest';
import {sportsProductionEnabled,sportsProductionRulesEnvironment} from '../../scripts/sports-production-scope.mjs';
import {verifySportsProductionReadiness} from '../../scripts/sports-production-readiness.mjs';
import {sportsStagingEnabled,requireSportsStaging} from '@/lib/sports-staging';
import {sportsRulesAvailable} from '@/server/services/sports-production-readiness';
const production=()=>({SPORTS_REDESIGN_PRODUCTION:'1',SPORTS_REDESIGN_STORE_IDS:'pilot-store',VERCEL:'1',VERCEL_ENV:'production',NODE_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres.qijlnhtpbintanzpxkvf:placeholder@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',DIRECT_URL:'postgresql://postgres:placeholder@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'});
afterEach(()=>vi.unstubAllEnvs());
describe('sports production boundary',()=>{
 it('defaults off and requires an explicit store',()=>{
  expect(sportsProductionEnabled('pilot-store',{})).toBe(false);
  expect(sportsProductionEnabled('pilot-store',production())).toBe(true);
  expect(sportsProductionEnabled('other-store',production())).toBe(false);
  expect(sportsProductionEnabled(undefined,production())).toBe(false);
  expect(sportsProductionEnabled('pilot-store',{...production(),SPORTS_REDESIGN_STORE_IDS:''})).toBe(false);
 });
 it.each([['VERCEL','0'],['VERCEL_ENV','preview'],['NODE_ENV','development'],['VERCEL_GIT_COMMIT_REF','other'],['VERCEL_GIT_REPO_OWNER','other'],['VERCEL_GIT_REPO_SLUG','other'],['WORKERS_CI_BRANCH','main'],['CF_PAGES_BRANCH','main'],['SPORTS_REDESIGN_STAGING','1'],['SPORTS_REDESIGN_PREVIEW','1'],['SPORTS_LIVE_FLOW_QA','1'],['DATABASE_URL','postgresql://postgres@127.0.0.1:55438/sports_live_flow_test'],['DIRECT_URL','postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres'],['DIRECT_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/wrong_db'],['SPORTS_REDESIGN_STORE_IDS','*'],['SPORTS_REDESIGN_STORE_IDS','pilot-store,']])('rejects invalid metadata %s=%s',(key,value)=>{expect(()=>sportsProductionEnabled('pilot-store',{...production(),[key]:value})).toThrow();});
 it('keeps policy reading active when the UI is off',()=>{
  expect(sportsProductionRulesEnvironment({...production(),SPORTS_REDESIGN_PRODUCTION:undefined,SPORTS_REDESIGN_STORE_IDS:undefined})).toBe(true);
  expect(sportsProductionRulesEnvironment({VERCEL_ENV:'preview'})).toBe(false);
 });
 it('rejects direct entry without authorized store',()=>{
  for(const[key,value]of Object.entries(production()))vi.stubEnv(key,value);
  expect(sportsStagingEnabled('pilot-store')).toBe(true);
  expect(()=>requireSportsStaging('other-store')).toThrow();expect(()=>requireSportsStaging()).toThrow();
 });
});
describe('actual connection readiness',()=>{
 const row={schema_matches:true,ledger_ready:true,browser_blocked:true,app_can_use:true,application_role:'verified_backend_role'};
 it('returns actual role without database repairs',async()=>{
  const query=vi.fn().mockResolvedValue([row]);expect(await verifySportsProductionReadiness(query)).toEqual({ready:true,applicationRole:'verified_backend_role'});
  expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toMatch(/^WITH installed/);
 });
 it.each(['schema_matches','ledger_ready','browser_blocked','app_can_use'])('refuses %s=false',async key=>{await expect(verifySportsProductionReadiness(async()=>[{...row,[key]:false}])).rejects.toThrow('資料庫尚未就緒');});
 it('hides raw database errors and rejects absent metadata',async()=>{
  await expect(verifySportsProductionReadiness(async()=>{throw Error('secret connection error');})).rejects.toThrow('資料庫尚未就緒');await expect(verifySportsProductionReadiness(async()=>[])).rejects.toThrow('資料庫尚未就緒');
 });
});
it('retains persisted restrictions when the flag or UI allowlist is cleared',async()=>{
 for(const[key,value]of Object.entries(production()))vi.stubEnv(key,value);
 vi.stubEnv('SPORTS_REDESIGN_PRODUCTION',undefined);vi.stubEnv('SPORTS_REDESIGN_STORE_IDS',undefined);
 const tx={$queryRawUnsafe:vi.fn().mockResolvedValue([{present:true}]),$executeRawUnsafe:vi.fn()};
 expect(await sportsRulesAvailable(tx,'previously-enabled-store')).toBe(true);expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
 tx.$queryRawUnsafe.mockResolvedValue([{present:false}]);expect(await sportsRulesAvailable(tx,'legacy-store')).toBe(false);expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
});

it('keeps the Next server-action boundary on every changed action module',()=>{
 for(const name of ['course','course-members','sports-staging'])expect(readFileSync(`src/server/actions/${name}.ts`,'utf8').trimStart().startsWith('"use server";')).toBe(true);
});
