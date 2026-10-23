import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),feature:vi.fn(),transaction:vi.fn(),audit:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,audit:m.audit}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {saveBeautyDisplayOrder} from '@/server/actions/beauty-display-order';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`CREATE TABLE "CourseDisplayOrder" ("storeId" text,kind text,ids text[],revision int,primary key("storeId",kind));CREATE TABLE "CourseRoom" (id text primary key,"storeId" text);INSERT INTO "CourseRoom" VALUES ('a','A'),('b','A'),('foreign','B');`);});
afterAll(async()=>db.close());
beforeEach(async()=>{vi.resetAllMocks();await db.exec('TRUNCATE "CourseDisplayOrder"');m.manager.mockResolvedValue({storeId:'A',userId:'owner',manager:true});m.transaction.mockImplementation(async(a:{storeId:string},work:(tx:unknown)=>unknown)=>db.transaction(async c=>{
 const raw=async(s:TemplateStringsArray,...v:unknown[])=>c.query(s.reduce((r,p,i)=>r+(i?`$${i}`:'')+p,''),v);
 const read=async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).rows;
 const own=async({where}:{where:{storeId:string}})=>where.storeId==='A'?[{id:'s1'},{id:'s2'}]:[{id:'other'}];
 return work({$queryRaw:read,$executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).affectedRows,beautyService:{findMany:own},beautyPlan:{findMany:async({where}:{where:{storeId:string}})=>where.storeId==='A'?[{id:'p1'}]:[]}});
}));});
it('commits and reloads real SQL order and revision, retaining omitted rows',async()=>{
 expect(await saveBeautyDisplayOrder({kind:'room',ids:['b'],revision:0})).toEqual({success:true,revision:1});
 expect((await db.query('SELECT * FROM "CourseDisplayOrder"')).rows).toEqual([{storeId:'A',kind:'room',ids:['b','a'],revision:1}]);
 expect(await saveBeautyDisplayOrder({kind:'room',ids:['a','b'],revision:1})).toEqual({success:true,revision:2});
 expect(m.manager).toHaveBeenCalledWith('business_hours.manage',true);
});
it('sorts only actual Beauty service and plan IDs without invented products or Course catalog writes',async()=>{
 expect(await saveBeautyDisplayOrder({kind:'subject',ids:['s2','s1'],revision:0})).toMatchObject({success:true});
 expect(await saveBeautyDisplayOrder({kind:'plan',ids:['plan:p1'],revision:0})).toMatchObject({success:true});
 expect((await db.query<{ids:string[]}>('SELECT ids FROM "CourseDisplayOrder" WHERE kind=\'plan\'')).rows[0].ids).toEqual(['plan:p1']);
 expect(m.manager).toHaveBeenCalledWith('plans.edit',true);expect(m.feature).toHaveBeenCalled();
});
it('rejects stale revision and foreign IDs without overwriting committed order',async()=>{
 await saveBeautyDisplayOrder({kind:'room',ids:['b','a'],revision:0});
 expect(await saveBeautyDisplayOrder({kind:'room',ids:['a','b'],revision:0})).toMatchObject({success:false});
 expect(await saveBeautyDisplayOrder({kind:'room',ids:['foreign'],revision:1})).toMatchObject({success:false});
 expect((await db.query('SELECT ids,revision FROM "CourseDisplayOrder"')).rows).toEqual([{ids:['b','a'],revision:1}]);
});
it('rejects duplicate, injected store, staff kind and foreign product IDs',async()=>{
 for(const d of [{kind:'plan',ids:['plan:p1','plan:p1']},{kind:'room',ids:['a'],storeId:'B'},{kind:'staff',ids:['a']},{kind:'plan',ids:['plan:other']},{kind:'plan',ids:['single:s1']},{kind:'plan',ids:['trial:s2']}])expect(await saveBeautyDisplayOrder({...d,revision:0})).toMatchObject({success:false});
 expect((await db.query('SELECT count(*) FROM "CourseDisplayOrder"')).rows).toEqual([{count:0}]);
});
it('rolls back the preference if audit fails, including its revision',async()=>{
 m.audit.mockRejectedValueOnce(Error('audit unavailable'));
 expect(await saveBeautyDisplayOrder({kind:'room',ids:['b'],revision:0})).toMatchObject({success:false});
 expect((await db.query('SELECT count(*) FROM "CourseDisplayOrder"')).rows).toEqual([{count:0}]);
});
it('does not enter a transaction after denied permission, read-only scope or feature',async()=>{
 m.manager.mockRejectedValueOnce(Error('沒有權限'));
 expect(await saveBeautyDisplayOrder({kind:'room',ids:['a'],revision:0})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.feature.mockRejectedValueOnce(Error('未開通'));
 expect(await saveBeautyDisplayOrder({kind:'plan',ids:['plan:p1'],revision:0})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
