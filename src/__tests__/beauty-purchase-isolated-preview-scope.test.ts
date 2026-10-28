import {afterEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {assertBeautyPurchaseIsolatedPreview,BEAUTY_PURCHASE_QA_BRANCH,BEAUTY_PURCHASE_QA_STORE,validateBeautyPurchaseIsolatedPreview,verifyBeautyPurchaseIsolatedFixture} from '../../scripts/beauty-purchase-isolated-preview-scope.mjs';

const ref='abcdefghijklmnopqrst';
const connection=`postgresql://postgres.${ref}:synthetic@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require`;
const env={NODE_ENV:'test' as const,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:BEAUTY_PURCHASE_QA_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',BEAUTY_ISOLATED_PURCHASE_QA:'1',BEAUTY_ISOLATED_QA_STORE_ID:BEAUTY_PURCHASE_QA_STORE,BEAUTY_MODULE_ENABLED:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_NOTIFICATIONS_ENABLED:'0',BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED:'1',BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED:'1',AUTH_SECRET:'synthetic',DATABASE_URL:connection,DIRECT_URL:connection};

describe('dedicated Beauty purchase Preview safety gate',()=>{
  it('stays blocked until a fresh project ref is source-pinned, even with apparently valid environment data',async()=>{
    expect(validateBeautyPurchaseIsolatedPreview(env,ref)).toEqual({storeId:BEAUTY_PURCHASE_QA_STORE});
    await expect(assertBeautyPurchaseIsolatedPreview(env)).rejects.toThrow('not pinned');
  });
  it('the real build gate fails before migrations or database access while the ref is unpinned',()=>{
    const result=spawnSync(process.execPath,[resolve('scripts/ci-migrate.mjs')],{encoding:'utf8',env:{...process.env,...env}});
    expect(result.status).not.toBe(0);expect(result.stderr).toContain('project ref is not pinned');
    expect(result.stdout).not.toContain('migrations_skipped=true');expect(result.stderr).not.toContain('synthetic@');
  });
  it.each([null,'', 'qijlnhtpbintanzpxkvf','ttworfzgwejdeolegkxl','forged-ref'])('refuses an unpinned or known non-isolated project %s',value=>expect(()=>validateBeautyPurchaseIsolatedPreview(env,value)).toThrow());
  it.each([
    {VERCEL_ENV:'production'}, {VERCEL_GIT_COMMIT_REF:'main'}, {VERCEL_GIT_REPO_OWNER:'other'}, {WORKERS_CI_BRANCH:'other'},
    {BEAUTY_ISOLATED_PURCHASE_QA:'0'}, {BEAUTY_ISOLATED_QA_STORE_ID:'other'}, {BEAUTY_DATABASE_MODE:'dedicated'}, {BEAUTY_DATABASE_URL:'other'},
    {BEAUTY_NOTIFICATIONS_ENABLED:'1'}, {LINE_CHANNEL_ACCESS_TOKEN:'blocked'}, {WEB_LINE_LOGIN_CHANNEL_SECRET:'blocked'}, {RESEND_API_KEY:'blocked'},
    {BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED:'0'}, {BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED:'0'}, {BEAUTY_COLLECTION_INTENTS_ENABLED:'1'}, {COURSE_PURCHASE_INTENTS_ENABLED:'1'},
    {DATABASE_URL:connection.replace(ref,'ttworfzgwejdeolegkxl')}, {DIRECT_URL:connection.replace(ref,'qijlnhtpbintanzpxkvf')},
    {DIRECT_URL:connection+'&host=db.example.com'}, {DIRECT_URL:connection.replace('sslmode=require','sslmode=disable')}, {PRODUCTION_MIGRATION_TARGET:'anything'},
  ])('rejects unsafe deployment override %j',patch=>expect(()=>validateBeautyPurchaseIsolatedPreview({...env,...patch},ref)).toThrow());
  it('uses read-only fixture inspection and accepts only the one designated synthetic store',async()=>{
    const client={connect:vi.fn(),end:vi.fn(),query:vi.fn(async(sql:string)=>sql.startsWith('SELECT')?{rows:[{id:BEAUTY_PURCHASE_QA_STORE,module:'BEAUTY'}]}:{rows:[]})};
    await expect(verifyBeautyPurchaseIsolatedFixture(env,ref,async()=>client)).resolves.toEqual({storeId:BEAUTY_PURCHASE_QA_STORE});
    expect(client.query.mock.calls.map(([sql])=>sql)).toEqual(['BEGIN READ ONLY','SELECT id,"industryModule"::text AS module FROM "Store" ORDER BY id LIMIT 2','ROLLBACK']);
    expect(client.end).toHaveBeenCalledOnce();
  });
  it.each([{rows:[]},{rows:[{id:'other',module:'BEAUTY'}]},{rows:[{id:BEAUTY_PURCHASE_QA_STORE,module:'BEAUTY'},{id:'other',module:'BEAUTY'}]},{rows:[{id:BEAUTY_PURCHASE_QA_STORE,module:'COURSE'}]}])('rejects absent, wrong or multiple stores',async ({rows})=>{
    const client={connect:vi.fn(),end:vi.fn(),query:vi.fn(async(sql:string)=>sql.startsWith('SELECT')?{rows}:{rows:[]})};
    await expect(verifyBeautyPurchaseIsolatedFixture(env,ref,async()=>client)).rejects.toThrow('fixture scope');expect(client.end).toHaveBeenCalledOnce();
  });
});
afterEach(()=>vi.unstubAllEnvs());
