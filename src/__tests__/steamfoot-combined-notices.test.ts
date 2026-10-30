import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),active:vi.fn(),module:vi.fn(),permission:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.query}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.read,requireWritablePermission:vi.fn(),checkPermission:m.permission}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:m.active,resolveWriteStoreId:vi.fn()}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:m.module}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
import {loadSteamfootStoreNotices} from '@/server/actions/steamfoot-store-notices';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text);INSERT INTO "Store" VALUES ('a','STEAMFOOT'),('b','STEAMFOOT');CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,name text);INSERT INTO "Customer" VALUES ('c','a','顧客');CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,"displayName" text);CREATE TABLE "ServicePlan"(id text PRIMARY KEY,"storeId" text,name text);CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingDate" date,"slotTime" text,people int DEFAULT 1,"bookingStatus" text DEFAULT 'PENDING',"serviceStaffId" text,"servicePlanId" text,"bookingType" text DEFAULT 'PACKAGE_SESSION',notes text);`);
 await db.exec(readFileSync('prisma/migrations/20261021040000_steamfoot_store_notices/migration.sql','utf8'));await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await db.exec(`INSERT INTO "Booking" (id,"storeId","customerId","bookingDate","slotTime") VALUES ('booking','a','c','2026-10-31','10:00'); UPDATE "Booking" SET "slotTime"='11:00' WHERE id='booking';
 INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","createdAt") VALUES ('payment','a','pending-payment:1','TRANSFER_PENDING_CONFIRMATION','private-order','2026-10-30'),('foreign','b','pending-payment:2','TRANSFER_PENDING_CONFIRMATION','other-order','2026-10-30');`);
},30000);
afterAll(async()=>db.close());
beforeEach(()=>{m.read.mockResolvedValue({id:'u',role:'OWNER',storeId:'a',staffId:'s'});m.active.mockResolvedValue('a');m.module.mockResolvedValue('steamfoot');m.permission.mockResolvedValue(true);m.query.mockImplementation(async(strings:TemplateStringsArray,...args:unknown[])=>{let sql=strings[0];for(let i=0;i<args.length;i++)sql+=`$${i+1}${strings[i+1]}`;return (await db.query(sql,args)).rows;});});
it('combines only this store’s payment and booking notices without exposing payment details',async()=>{
 const result=await loadSteamfootStoreNotices({storeId:'a',handled:false});
 expect(result).toMatchObject({success:true,count:2,items:expect.arrayContaining([expect.objectContaining({id:'digital:payment',kind:'PAYMENT',canViewCourse:true}),expect.objectContaining({kind:'MOVE'})])});
 expect(JSON.stringify(result)).not.toContain('private-order');expect(JSON.stringify(result)).not.toContain('foreign');
 m.permission.mockImplementation(async(_r,_s,p)=>p!=='transaction.create');
 expect(await loadSteamfootStoreNotices({storeId:'a',handled:false})).toMatchObject({success:true,items:expect.arrayContaining([expect.objectContaining({id:'digital:payment',canViewCourse:false})])});
 expect(await loadSteamfootStoreNotices({storeId:'b',handled:false})).toMatchObject({success:false});
});
it('shows inquiries and human support without private identifiers',async()=>{
 await db.exec(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","createdAt") VALUES ('lead','a','digital-butler-lead:l','DIGITAL_BUTLER_LEAD_CREATED','private-lead','2026-10-30'),('support','a','human-support-requested:s','HUMAN_SUPPORT_REQUESTED','private-support','2026-10-30');`);
 const result=await loadSteamfootStoreNotices({storeId:'a',handled:false});
 expect(result).toMatchObject({success:true,count:4,items:expect.arrayContaining([expect.objectContaining({id:'digital:lead',kind:'LEAD'}),expect.objectContaining({id:'digital:support',kind:'SUPPORT'})])});
 expect(JSON.stringify(result)).not.toContain('private-lead');expect(JSON.stringify(result)).not.toContain('private-support');
});
