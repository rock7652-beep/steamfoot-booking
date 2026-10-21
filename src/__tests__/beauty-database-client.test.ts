import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({constructed:vi.fn()}));
vi.mock('@/lib/generated-prisma-runtime',()=>({loadBeautyPrismaRuntime:()=>({PrismaClient:class {constructor(options:unknown){m.constructed(options);}}})}));
const globalCache=globalThis as unknown as {beauty?:unknown;beautyDatabaseUrl?:string};
function environment(){
 const main='postgresql://beauty_1374_releaseapp:synthetic@127.0.0.1:32770/beauty_1374_releaseqa';
 const dedicated='postgresql://steamfoot_beauty_data_qa:separate@127.0.0.1:32770/beauty_1374_releaseqa';
 for(const [key,value] of Object.entries({DATABASE_URL:main,DIRECT_URL:main,NODE_ENV:'production',BEAUTY_RELEASE_QA:'1',AUTH_URL:'http://localhost:3116',NEXTAUTH_URL:'http://localhost:3116',AUTH_SECRET:'synthetic',BEAUTY_MODULE_ENABLED:'0',BEAUTY_NOTIFICATIONS_ENABLED:'0',BEAUTY_DATABASE_MODE:'dedicated',BEAUTY_DATABASE_URL:dedicated}))vi.stubEnv(key,value);
 return dedicated;
}
afterEach(()=>{delete globalCache.beauty;delete globalCache.beautyDatabaseUrl;vi.unstubAllEnvs();vi.resetModules();m.constructed.mockClear();});
it('passes dedicated secret only to Beauty constructor',async()=>{
 const url=environment();await import('@/lib/beauty-db');
 expect(m.constructed).toHaveBeenCalledOnce();
 const options=m.constructed.mock.calls[0][0] as {datasources:{db:{url:string}}};expect(new URL(options.datasources.db.url).username).toBe(new URL(url).username);
});
it('missing dedicated secret fails before constructing or reusing a cached client',async()=>{
 environment();globalCache.beauty={previous:true};globalCache.beautyDatabaseUrl='old';vi.stubEnv('BEAUTY_DATABASE_URL',undefined);
 await expect(import('@/lib/beauty-db')).rejects.toThrow('missing or invalid');expect(m.constructed).not.toHaveBeenCalled();
});
it('does not reuse a cached client for a different URL',async()=>{
 environment();globalCache.beauty={previous:true};globalCache.beautyDatabaseUrl='old';
 const {beautyPrisma}=await import('@/lib/beauty-db');expect(beautyPrisma).not.toBe(globalCache.beauty);expect(m.constructed).toHaveBeenCalledOnce();
});
