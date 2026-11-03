// Actual SQL persistence and rollback; authorization/Prisma transport are synthetic.
// Hosted session, pooler and RLS acceptance are tracked separately.
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),audit:vi.fn(),feature:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,audit:m.audit,beautyMember:vi.fn(),beautyWorker:vi.fn(),command:vi.fn(),requireBeauty:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:vi.fn(),checkPermission:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:vi.fn()}));
vi.mock('@/server/services/trial-booking-chat-link',()=>({resolveTrialBookingChatLink:vi.fn()}));
import {saveBeautyCustomerProfile} from '@/server/actions/beauty';
let db:PGlite;const before='2026-10-22T01:00:00.000Z';
const input={id:'customer',expectedUpdatedAt:before,name:'新姓名',phone:'0900000001',email:'new@example.invalid',gender:'female',birthday:'1990-03-04',address:'新地址',emergencyContactName:'家人',emergencyContactPhone:'0900000002'};
beforeAll(async()=>{db=new PGlite();await db.exec(`CREATE TABLE "Customer" (id text primary key,"storeId" text,"mergedIntoCustomerId" text,name text,phone text,email text,gender text,birthday date,address text,"emergencyContactName" text,"emergencyContactPhone" text,"updatedAt" timestamp(3),notes text,"serviceNote" text,"userId" text);`);});
afterAll(async()=>db.close());
beforeEach(async()=>{vi.resetAllMocks();await db.exec(`TRUNCATE "Customer";INSERT INTO "Customer" (id,"storeId",name,phone,"updatedAt",notes,"serviceNote","userId") VALUES ('customer','A','原姓名','0900000000','${before}','原備註','服務留意','member');`);m.manager.mockResolvedValue({storeId:'A',userId:'owner',manager:true});m.transaction.mockImplementation(async(_a:unknown,work:(tx:unknown)=>unknown)=>db.transaction(async c=>work({$executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await c.query(s.reduce((r,p,i)=>r+(i?`$${i}`:'')+p,''),v)).affectedRows})));});
it('commits all shared profile fields and reloads them without changing membership or notes',async()=>{
 expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:true});
 const r=(await db.query<Record<string,unknown>>('SELECT * FROM "Customer"')).rows[0];expect(r).toMatchObject({name:'新姓名',phone:'0900000001',email:'new@example.invalid',gender:'female',address:'新地址',emergencyContactName:'家人',emergencyContactPhone:'0900000002',notes:'原備註',serviceNote:'服務留意',userId:'member'});expect(new Date(r.birthday as string).toISOString().slice(0,10)).toBe('1990-03-04');expect(m.manager).toHaveBeenCalledWith('customer.update',true);
 expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:false});
});
it('rejects foreign store, stale version, missing version, merged customers and invalid birthday',async()=>{
 m.manager.mockResolvedValueOnce({storeId:'B'});expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:false});
 expect(await saveBeautyCustomerProfile({...input,expectedUpdatedAt:'2020-01-01T00:00:00.000Z'})).toMatchObject({success:false});
 expect(await saveBeautyCustomerProfile({...input,expectedUpdatedAt:undefined})).toMatchObject({success:false});
 expect(await saveBeautyCustomerProfile({...input,birthday:'2026-02-30'})).toMatchObject({success:false});
 await db.exec(`UPDATE "Customer" SET "mergedIntoCustomerId"='merged'`);expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:false});
 expect((await db.query('SELECT name FROM "Customer"')).rows).toEqual([{name:'原姓名'}]);
});
it('does not mutate on low permission or disabled feature and rolls back on audit failure',async()=>{
 m.manager.mockRejectedValueOnce(Error('權限不足'));expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.feature.mockRejectedValueOnce(Error('未開通'));expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.audit.mockRejectedValueOnce(Error('audit failure'));expect(await saveBeautyCustomerProfile(input)).toMatchObject({success:false});expect((await db.query('SELECT name FROM "Customer"')).rows).toEqual([{name:'原姓名'}]);
});
