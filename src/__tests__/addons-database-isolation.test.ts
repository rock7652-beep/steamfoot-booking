import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/addons-client-factory',()=>({createAddOnsClient:vi.fn()}));
import {addOnsDatabaseSelection} from '@/lib/addons-database-url';
import {lazyAddOnsClient} from '@/lib/addons-db';
const project='ttworfzgwejdeolegkxl',role='steamfoot_addons_test';
const url=`postgresql://${role}.${project}:test-only@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
function configure(){vi.stubEnv('ADDONS_DATABASE_URL',url);vi.stubEnv('ADDONS_DATABASE_ROLE',role);vi.stubEnv('ADDONS_DATABASE_PROJECT_REF',project);vi.stubEnv('VERCEL_ENV','preview');}
afterEach(()=>vi.unstubAllEnvs());
it('requires dedicated credentials without falling back to the main database',()=>{
 expect(()=>addOnsDatabaseSelection({DATABASE_URL:url})).toThrow('尚未完成');
});
it.each([
 url.replace(role,'postgres'),url.replace(project,'otherproject'),url+'?options=-c%20role=postgres',url+'?sslmode=disable',url+'?sslaccept=accept_invalid_certs',url.replace('/postgres','/other'),
])('rejects foreign, privileged or overridden connections without exposing credentials',bad=>{
 expect(()=>addOnsDatabaseSelection({ADDONS_DATABASE_URL:bad,ADDONS_DATABASE_ROLE:role,ADDONS_DATABASE_PROJECT_REF:project})).toThrow('尚未完成');
});
it('pins production to the production project and caps the separate pool',()=>{
 vi.stubEnv('DATABASE_CONNECTION_LIMIT','2');
 const env={ADDONS_DATABASE_URL:url+'?connection_limit=99&pgbouncer=false',ADDONS_DATABASE_ROLE:role,ADDONS_DATABASE_PROJECT_REF:project};
 const effective=new URL(addOnsDatabaseSelection(env).url);
 expect(effective.searchParams.get('connection_limit')).toBe('1');expect(effective.searchParams.get('pgbouncer')).toBe('true');
 expect(()=>addOnsDatabaseSelection({...env,VERCEL_ENV:'production'})).toThrow();
});
it('does not construct a client on import, property inspection, or missing config',async()=>{
 const factory=vi.fn(),client=lazyAddOnsClient(factory);
 expect(client.serviceAddOnCatalog).toBeDefined();expect(factory).not.toHaveBeenCalled();
 await expect(client.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:'s',module:'MUSIC'}}})).rejects.toThrow('尚未完成');
 expect(factory).not.toHaveBeenCalled();
});
it('verifies the actual role before allowing model access and shares the first check',async()=>{
 configure();const probe=vi.fn().mockResolvedValue([{valid:true}]),read=vi.fn().mockResolvedValue(null);
 const factory=vi.fn().mockReturnValue({$queryRaw:probe,serviceAddOnCatalog:{findUnique:read}});
 const client=lazyAddOnsClient(factory);const args={where:{storeId_module:{storeId:'s',module:'MUSIC'}}};
 await Promise.all([client.serviceAddOnCatalog.findUnique(args),client.serviceAddOnCatalog.findUnique(args)]);
 expect(factory).toHaveBeenCalledOnce();expect(probe).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledTimes(2);
 expect(probe.mock.calls[0][0].values).toContain(role);
});
it('fails closed and retries validation after a failed identity check',async()=>{
 configure();const read=vi.fn(),probe=vi.fn().mockResolvedValueOnce([{valid:false}]).mockResolvedValueOnce([{valid:true}]);
 const client=lazyAddOnsClient(vi.fn().mockReturnValue({$queryRaw:probe,serviceAddOnCatalog:{findUnique:read}}));
 const args={where:{storeId_module:{storeId:'s',module:'MUSIC'}}};
 await expect(client.serviceAddOnCatalog.findUnique(args)).rejects.toThrow('驗證失敗');expect(read).not.toHaveBeenCalled();
 await client.serviceAddOnCatalog.findUnique(args);expect(probe).toHaveBeenCalledTimes(2);
 vi.stubEnv('ADDONS_DATABASE_URL',url.replace('test-only','changed'));
 await expect(client.serviceAddOnCatalog.findUnique(args)).rejects.toThrow('已變更');expect(read).toHaveBeenCalledOnce();
});
it('passes the original transaction and options through, propagating rollback failures',async()=>{
 configure();const tx={marker:'same-tx'},failure=new Error('cashbook failed');
 const transaction=vi.fn(async(work:(value:unknown)=>Promise<unknown>)=>work(tx));
 const factory=vi.fn().mockReturnValue({$queryRaw:vi.fn().mockResolvedValue([{valid:true}]),$transaction:transaction});
 const client=lazyAddOnsClient(factory);
 const work=vi.fn(async(value)=>{expect(value).toBe(tx);throw failure;});
 await expect(client.$transaction(work,{timeout:1000})).rejects.toBe(failure);
 expect(transaction).toHaveBeenCalledWith(work,{timeout:1000});
});

it('requires certificate validation on the dedicated Prisma connection',()=>{
 const env={ADDONS_DATABASE_URL:url,ADDONS_DATABASE_ROLE:role,ADDONS_DATABASE_PROJECT_REF:project};
 const selected=new URL(addOnsDatabaseSelection(env).url);
 expect(selected.searchParams.get('sslmode')).toBe('require');expect(selected.searchParams.get('sslaccept')).toBe('strict');
 expect(()=>addOnsDatabaseSelection({...env,ADDONS_DATABASE_URL:url+'?sslaccept=strict'})).not.toThrow();
});
