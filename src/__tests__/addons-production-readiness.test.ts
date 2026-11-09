import {beforeEach,expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import type {PrismaClient} from '@prisma/client';
import {checkAddOnsProductionReadiness} from '@/server/services/addons-production-readiness';
const expected={role:'steamfoot_addons_prod_20261102',storeId:'store-soulife'};
const good={identityMatches:true,restrictedRole:true,storeVisible:true,rlsReady:true,requiredPrivileges:true};
const m={raw:vi.fn(),execute:vi.fn(),catalog:vi.fn(),image:vi.fn(),transaction:vi.fn()};
const client={$transaction:m.transaction} as unknown as Pick<PrismaClient,'$transaction'>;
beforeEach(()=>{vi.resetAllMocks();m.raw.mockResolvedValue([good]);m.catalog.mockResolvedValue(null);m.image.mockResolvedValue(null);m.transaction.mockImplementation(work=>work({$queryRawUnsafe:m.raw,$executeRawUnsafe:m.execute,serviceAddOnCatalog:{findFirst:m.catalog},serviceAddOnImage:{findFirst:m.image}}));});
it('checks an empty catalog through the real scoped client without writing application data',async()=>{
 expect(await checkAddOnsProductionReadiness(client,expected)).toMatchObject({status:'PASS',readonly:true});
 expect(m.execute.mock.calls).toEqual([['SET TRANSACTION READ ONLY'],["SET LOCAL statement_timeout='5s'"]]);
 expect(m.execute.mock.invocationCallOrder[0]).toBeLessThan(m.raw.mock.invocationCallOrder[0]);
 expect(m.catalog).toHaveBeenCalledWith({where:{storeId:'store-soulife',module:'BEAUTY'},select:{groups:true,revision:true}});
 expect(m.image).toHaveBeenCalledWith({where:{storeId:'store-soulife',module:'BEAUTY'},select:{id:true}});
});
it.each(Object.keys(good))('blocks a failed %s check before reading business content',async key=>{
 m.raw.mockResolvedValue([{...good,[key]:false}]);await expect(checkAddOnsProductionReadiness(client,expected)).rejects.toThrow('not ready');expect(m.catalog).not.toHaveBeenCalled();
});
it('rejects administrator credentials before any connection',async()=>{
 await expect(checkAddOnsProductionReadiness(client,{...expected,role:'postgres'})).rejects.toThrow('target');expect(m.transaction).not.toHaveBeenCalled();
});
it('propagates actual catalog privilege errors rather than reporting readiness',async()=>{
 m.catalog.mockRejectedValue(Error('permission denied'));await expect(checkAddOnsProductionReadiness(client,expected)).rejects.toThrow('permission denied');
});
it('runs the actual SQL with a restricted Postgres role and denies a store outside its RLS scope',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE steamfoot_addons_prod_20261102 LOGIN NOINHERIT;
   CREATE TABLE "Store"(id text);CREATE TABLE "StoreFeatureEntitlement"("storeId" text,status text);
   CREATE TABLE "ServiceAddOnCatalog"("storeId" text,module text,groups jsonb,revision integer,enabled boolean);
   CREATE TABLE "ServiceAddOnImage"(id text,"storeId" text,module text,content bytea,thumbnail bytea,"createdAt" timestamptz);
   INSERT INTO "Store" VALUES ('store-soulife'),('outside');
   ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;ALTER TABLE "StoreFeatureEntitlement" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "ServiceAddOnCatalog" ENABLE ROW LEVEL SECURITY;ALTER TABLE "ServiceAddOnImage" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY scope ON "Store" TO steamfoot_addons_prod_20261102 USING(id='store-soulife');
   CREATE POLICY scope ON "StoreFeatureEntitlement" TO steamfoot_addons_prod_20261102 USING("storeId"='store-soulife');
   CREATE POLICY scope ON "ServiceAddOnCatalog" TO steamfoot_addons_prod_20261102 USING("storeId"='store-soulife');
   CREATE POLICY scope ON "ServiceAddOnImage" TO steamfoot_addons_prod_20261102 USING("storeId"='store-soulife');
   GRANT SELECT ON "Store","StoreFeatureEntitlement" TO steamfoot_addons_prod_20261102;
   GRANT SELECT,INSERT,UPDATE ON "ServiceAddOnCatalog" TO steamfoot_addons_prod_20261102;
   GRANT SELECT,INSERT ON "ServiceAddOnImage" TO steamfoot_addons_prod_20261102;
   SET ROLE steamfoot_addons_prod_20261102;`);
  const live={$transaction:async(work:(tx:unknown)=>Promise<unknown>)=>{
   await db.exec('BEGIN');try{return await work({$executeRawUnsafe:(sql:string)=>db.exec(sql),$queryRawUnsafe:async(sql:string,...args:unknown[])=>(await db.query(sql,args)).rows,serviceAddOnCatalog:{findFirst:async()=>null},serviceAddOnImage:{findFirst:async()=>null}});}finally{await db.exec('ROLLBACK');}
  }} as unknown as Pick<PrismaClient,'$transaction'>;
  expect(await checkAddOnsProductionReadiness(live,expected)).toMatchObject(good);
  await expect(checkAddOnsProductionReadiness(live,{...expected,storeId:'outside'})).rejects.toThrow('not ready');
  await db.exec('RESET ROLE; REVOKE INSERT ON "ServiceAddOnImage" FROM steamfoot_addons_prod_20261102; SET ROLE steamfoot_addons_prod_20261102;');
  await expect(checkAddOnsProductionReadiness(live,expected)).rejects.toThrow('not ready');
 }finally{await db.close();}
});
