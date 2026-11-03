import {beforeEach,expect,it,vi} from 'vitest';
import type {PrismaClient} from '@prisma/client';
// Loading this factory would resolve a web session before the probe reaches the DB.
vi.mock('@/lib/addons-client-factory',()=>{throw Error('A build probe must not load the request-context application factory');});
import {runAddOnsProductionReadiness,productionReadinessFailureCode} from '../../scripts/addons-production-readiness';
const env:NodeJS.ProcessEnv={NODE_ENV:'production',VERCEL_ENV:'production',ADDONS_DATABASE_PROJECT_REF:'qijlnhtpbintanzpxkvf',ADDONS_DATABASE_ROLE:'steamfoot_addons_prod_20261102',ADDONS_DATABASE_URL:'postgresql://steamfoot_addons_prod_20261102.qijlnhtpbintanzpxkvf:test-only@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require'};
const m={transaction:vi.fn(),disconnect:vi.fn(),execute:vi.fn(),raw:vi.fn(),catalog:vi.fn(),image:vi.fn()};
const client={$transaction:m.transaction,$disconnect:m.disconnect} as unknown as Pick<PrismaClient,'$transaction'|'$disconnect'>;
beforeEach(()=>{vi.resetAllMocks();m.transaction.mockImplementation(work=>work({$executeRawUnsafe:m.execute,$queryRawUnsafe:m.raw,serviceAddOnCatalog:{findFirst:m.catalog},serviceAddOnImage:{findFirst:m.image}}));m.raw.mockResolvedValue([{identityMatches:true,restrictedRole:true,storeVisible:true,rlsReady:true,requiredPrivileges:true}]);});
it('validates the dedicated Prisma connection without a Next.js login session',async()=>{
 const create=vi.fn<(url:string)=>typeof client>().mockReturnValue(client);expect(await runAddOnsProductionReadiness(env,create)).toMatchObject({status:'PASS',readonly:true});
 const url=new URL(create.mock.calls[0][0]);expect(url.searchParams.get('sslaccept')).toBe('strict');expect(url.searchParams.get('connection_limit')).toBe('1');
 expect(m.catalog).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store-soulife',module:'BEAUTY'}}));expect(m.disconnect).toHaveBeenCalledOnce();
});
it('disconnects and refuses a failed authentication or permission check',async()=>{
 const failure=Object.assign(Error('fake connection failure'),{code:'P1000'});m.transaction.mockRejectedValue(failure);
 await expect(runAddOnsProductionReadiness(env,()=>client)).rejects.toBe(failure);expect(m.disconnect).toHaveBeenCalledOnce();
});
it('does not construct a client for Preview or a mismatched project',async()=>{
 const create=vi.fn<(url:string)=>typeof client>().mockReturnValue(client);
 await expect(runAddOnsProductionReadiness({...env,VERCEL_ENV:'preview'},create)).rejects.toThrow('target');
 await expect(runAddOnsProductionReadiness({...env,ADDONS_DATABASE_PROJECT_REF:'ttworfzgwejdeolegkxl'},create)).rejects.toThrow('target');
 expect(create).not.toHaveBeenCalled();
});

it('reports only whitelisted Prisma engine codes, including initialization failures, without exposing error text',()=>{
 expect(productionReadinessFailureCode({errorCode:'P1011',message:'fake secret must never be logged'})).toBe('P1011');
 expect(productionReadinessFailureCode({code:'P1000'})).toBe('P1000');
 expect(productionReadinessFailureCode({code:'fake-password'})).toBe('CHECK');
});
