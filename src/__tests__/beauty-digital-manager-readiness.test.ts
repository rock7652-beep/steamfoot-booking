import {expect,it,vi} from 'vitest';
import {beautyDigitalManagerReadiness} from '../../scripts/beauty-digital-manager-readiness.mjs';
const env={NODE_ENV:'production' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres.qijlnhtpbintanzpxkvf:synthetic@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=public',BEAUTY_DATABASE_MODE:'dedicated',BEAUTY_DATABASE_ROLE:'steamfoot_beauty_prod_20261025',BEAUTY_DATABASE_PASSWORD:'a'.repeat(64),BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0'};
function fixture(patch:{role?:string;readonly?:string;unsafe?:boolean;access?:boolean;planFailure?:boolean}={}){
 const execute=vi.fn(),disconnect=vi.fn();
 const query=vi.fn(async(sql:string)=>{
  if(sql.startsWith('SELECT current_user'))return [{role:patch.role??env.BEAUTY_DATABASE_ROLE,database:'postgres',readonly:patch.readonly??'on'}];
  if(sql.includes('FROM pg_roles'))return [{rolcanlogin:true,rolsuper:patch.unsafe??false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false,rolreplication:false}];
  if(sql.includes('has_table_privilege'))return [{ok:patch.access??true}];
  if(sql.startsWith('EXPLAIN')&&patch.planFailure)throw Error('permission denied');
  return [];
 });
 const factory=vi.fn(async()=>({$connect:vi.fn(),$disconnect:disconnect,$transaction:async(work:(tx:unknown)=>Promise<unknown>)=>work({$executeRawUnsafe:execute,$queryRawUnsafe:query})}));
 return {factory,query,execute,disconnect};
}
it('verifies the actual restricted identity, grants and SQL plans without writing',async()=>{
 const m=fixture();expect(await beautyDigitalManagerReadiness(env,m.factory)).toBe('ready');
 expect(m.execute).toHaveBeenCalledExactlyOnceWith('SET TRANSACTION READ ONLY');
 expect(m.query.mock.calls.filter(([sql])=>sql.startsWith('EXPLAIN'))).toHaveLength(4);
 expect(m.query.mock.calls.every(([sql])=>sql.startsWith('SELECT')||sql.startsWith('EXPLAIN (FORMAT JSON) '))).toBe(true);
 expect(m.disconnect).toHaveBeenCalledOnce();
 expect(m.factory).toHaveBeenCalledWith({datasources:{db:{url:expect.stringContaining('steamfoot_beauty_prod_20261025.')}},log:[]});
});
it.each([{role:'postgres'},{readonly:'off'},{unsafe:true},{access:false},{planFailure:true}])('rejects unsafe or incomplete readiness %j',async patch=>{
 const m=fixture(patch);await expect(beautyDigitalManagerReadiness(env,m.factory)).rejects.toThrow();expect(m.disconnect).toHaveBeenCalledOnce();
});
it('never builds a client for previews or unverified production configuration',async()=>{
 const m=fixture();expect(await beautyDigitalManagerReadiness({...env,VERCEL_ENV:'preview'},m.factory)).toBe('skipped');
 await expect(beautyDigitalManagerReadiness({...env,VERCEL_GIT_COMMIT_REF:'other'},m.factory)).rejects.toThrow();
 await expect(beautyDigitalManagerReadiness({...env,PRODUCTION_MIGRATION_TARGET:'anything'},m.factory)).rejects.toThrow();
 expect(m.factory).not.toHaveBeenCalled();
});
