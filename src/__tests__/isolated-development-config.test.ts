import {afterEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>({query:vi.fn(),disconnect:vi.fn()}));
vi.mock('@prisma/client',()=>({PrismaClient:class {$queryRawUnsafe=calls.query;$disconnect=calls.disconnect;}}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();vi.clearAllMocks();});
function setup(){
 for(const key of Object.keys(process.env)) if (/^(VERCEL(?:_|$)|WORKERS_CI_|CF_PAGES_|VITEST(?:_|$))/.test(key)) vi.stubEnv(key,'');
 const id='a'.repeat(32),name=`steamfoot_dev_${id}`,token='b'.repeat(64);
 const url=`postgresql://${name}:${'c'.repeat(64)}@127.0.0.1:15432/${name}`;
 for(const key of ['VERCEL','VERCEL_ENV','VERCEL_URL','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH','VITEST','VITEST_WORKER_ID']) vi.stubEnv(key,'');
 for(const [key,value] of Object.entries({NODE_ENV:'development',STEAMFOOT_ISOLATED_DEV:'1',STEAMFOOT_DEV_ID:id,STEAMFOOT_DEV_TOKEN:token,STEAMFOOT_DEV_SERVER_ADDRESS:'172.17.0.2',DATABASE_URL:url,DIRECT_URL:url}))vi.stubEnv(key,value);
 calls.query.mockResolvedValue([{database:name,role:name,address:'172.17.0.2',port:5432,token}]);
}
it('allows only Next development phase after connected database verification',async()=>{
 setup();const config=(await import('../../next.config')).default;
 await expect(config('phase-development-server')).resolves.toHaveProperty('redirects');
 expect(calls.query).toHaveBeenCalledOnce();expect(calls.disconnect).toHaveBeenCalledOnce();
});
it.each(['phase-production-build','phase-production-server','phase-export'])('rejects deployment phase %s before constructing a connection',async phase=>{
 setup();const config=(await import('../../next.config')).default;
 await expect(config(phase)).rejects.toThrow('cannot build or serve a deployment');expect(calls.query).not.toHaveBeenCalled();
});
it('refuses readiness when a loopback target lacks the provisioned database identity',async()=>{
 setup();calls.query.mockResolvedValue([]);const config=(await import('../../next.config')).default;
 await expect(config('phase-development-server')).rejects.toThrow('verification failed');expect(calls.disconnect).toHaveBeenCalledOnce();
});
it('keeps real outbound senders blocked in development without provider identity',async()=>{
 setup();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const {pushSteamButlerMessage}=await import('@/lib/line');
 const {sendMessengerMessages}=await import('@/lib/messenger');
 await expect(pushSteamButlerMessage('synthetic',[{type:'text',text:'Synthetic'}])).resolves.toMatchObject({success:false,errorType:'preview_blocked'});
 await expect(sendMessengerMessages({pageId:'synthetic',pageAccessToken:'',recipientId:'synthetic',messages:[{text:'Synthetic'}]})).resolves.toMatchObject({success:false});
 expect(fetch).not.toHaveBeenCalled();
});
it('preserves audit-context transactions and verifies before any business operation',async()=>{
 setup();
 const {guardedSportsSharedCardPreviewClient}=await import('@/lib/sports-shared-card-preview');
 const transaction=vi.fn().mockResolvedValue('audited');
 let operation: (input:{args:unknown;query:(args:unknown)=>Promise<unknown>})=>Promise<unknown> = async()=>null;
 const source={$queryRawUnsafe:calls.query,$transaction:transaction,$extends:(extension:{query:{$allOperations:typeof operation}})=>{operation=extension.query.$allOperations;return {$transaction:vi.fn()};}};
 const client=guardedSportsSharedCardPreviewClient(()=>{throw new Error('cached client must not be reused');},()=>source);
 expect(await client.$transaction()).toBe('audited');expect(transaction).toHaveBeenCalledOnce();expect(calls.query).toHaveBeenCalledOnce();
 const query=vi.fn().mockResolvedValue('data');await expect(operation({args:{},query})).resolves.toBe('data');expect(calls.query).toHaveBeenCalledOnce();
});
it('never reaches audit transaction or model query when server identity verification fails',async()=>{
 setup();calls.query.mockRejectedValue(new Error('database unavailable'));
 const {guardedSportsSharedCardPreviewClient}=await import('@/lib/sports-shared-card-preview');
 const transaction=vi.fn();let operation:(input:{args:unknown;query:(args:unknown)=>Promise<unknown>})=>Promise<unknown>=async()=>null;
 const source={$queryRawUnsafe:calls.query,$transaction:transaction,$extends:(extension:{query:{$allOperations:typeof operation}})=>{operation=extension.query.$allOperations;return {$transaction:vi.fn()};}};
 const client=guardedSportsSharedCardPreviewClient(()=>undefined,()=>source);
 await expect(client.$transaction()).rejects.toThrow('verification failed');expect(transaction).not.toHaveBeenCalled();
 const query=vi.fn();await expect(operation({args:{},query})).rejects.toThrow('verification failed');expect(query).not.toHaveBeenCalled();
});
