import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),permission:vi.fn(),url:vi.fn(),transaction:vi.fn(),execute:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/session',()=>({getCurrentUser:m.user}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.permission}));
vi.mock('@/lib/beauty-database-url',()=>({buildBeautyDatabaseUrl:m.url}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$transaction:m.transaction}}));
import {readHqBeautyAddOnsReleaseEvidence} from '@/server/services/hq-addons-release-evidence';
const role='steamfoot_beauty_prod_20261025';
const url=`postgresql://${role}:synthetic-only@db.qijlnhtpbintanzpxkvf.supabase.co/postgres?sslmode=verify-full`;
beforeEach(()=>{
 vi.clearAllMocks();
 for(const [key,value] of Object.entries({VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking'}))vi.stubEnv(key,value);
 m.user.mockResolvedValue({id:'hq',role:'ADMIN',staffId:null});m.permission.mockResolvedValue(true);m.url.mockReturnValue(url);
 m.query.mockResolvedValue([{databaseMatches:true,roleMatches:true,restrictedRole:true,schemaReady:true,historyProtected:true}]);
 m.transaction.mockImplementation(async(work:(tx:unknown)=>unknown)=>work({$executeRawUnsafe:m.execute,$queryRawUnsafe:m.query}));
});
afterEach(()=>vi.unstubAllEnvs());
it.each([null,{id:'owner',role:'OWNER'},{id:'staff',role:'STAFF'}])('denies a non-HQ actor before looking at connection configuration: %j',async user=>{
 m.user.mockResolvedValue(user);await expect(readHqBeautyAddOnsReleaseEvidence()).rejects.toMatchObject({code:'FORBIDDEN'});
 expect(m.url).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
});
it('requires HQ staff.manage as well as the ADMIN role',async()=>{
 m.permission.mockResolvedValue(false);await expect(readHqBeautyAddOnsReleaseEvidence()).rejects.toMatchObject({code:'FORBIDDEN'});
 expect(m.permission).toHaveBeenCalledWith('ADMIN',null,'staff.manage');expect(m.url).not.toHaveBeenCalled();
});
it('does not inspect secrets or open a client for Preview or a different production project',async()=>{
 vi.stubEnv('VERCEL_ENV','preview');expect(await readHqBeautyAddOnsReleaseEvidence()).toEqual({status:'UNAVAILABLE'});
 vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('VERCEL_PROJECT_ID','another-project');expect(await readHqBeautyAddOnsReleaseEvidence()).toEqual({status:'UNAVAILABLE'});
 expect(m.url).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
});
it('uses the actual Beauty client with fixed reviewed expectations and returns only bounded evidence',async()=>{
 const result=await readHqBeautyAddOnsReleaseEvidence();expect(result.status).toBe('PASS');
 expect(m.transaction).toHaveBeenCalledOnce();expect(m.query.mock.calls[0].slice(1)).toEqual(['postgres',role]);
 expect(m.execute.mock.calls.map(c=>c[0])).toEqual(['SET TRANSACTION READ ONLY',"SET LOCAL statement_timeout='5s'"]);
 expect(JSON.stringify(result)).not.toMatch(/synthetic|postgres|supabase|steamfoot/);
});
it('never falls back to the administrator client when legacy configuration is selected',async()=>{
 m.url.mockReturnValue(url.replace(role,'postgres'));expect((await readHqBeautyAddOnsReleaseEvidence()).status).toBe('UNAVAILABLE');expect(m.transaction).not.toHaveBeenCalled();
});
it('does not certify a runtime whose actual database identity is different',async()=>{
 m.query.mockResolvedValue([{databaseMatches:true,roleMatches:false,restrictedRole:true,schemaReady:true,historyProtected:true}]);
 expect((await readHqBeautyAddOnsReleaseEvidence()).status).toBe('BLOCKED');
});
it('redacts configuration failures without trying another connection',async()=>{
 m.url.mockImplementation(()=>{throw new Error(url);});expect(await readHqBeautyAddOnsReleaseEvidence()).toEqual({status:'UNAVAILABLE'});expect(m.transaction).not.toHaveBeenCalled();
});
