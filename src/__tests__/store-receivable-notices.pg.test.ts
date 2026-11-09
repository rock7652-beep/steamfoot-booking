import type {Prisma} from '@prisma/client';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({stores:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findMany:m.stores},$transaction:m.transaction}}));
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:()=>true}));
vi.mock('@/server/beauty/collection-intent',()=>({beautyCollectionIntentsEnabled:()=>true}));
import {readStoreReceivables,readReceivableNoticeState,reconcileStoreReceivableNotices} from '@/server/services/store-receivable-notices';
import {outstandingAmount,producesStoreNotice} from '@/lib/receivable-notice';
const db=new PGlite(),now=new Date('2026-11-01T12:00:00Z');
async function query(strings:TemplateStringsArray,...values:unknown[]){return db.query(strings.map((s,i)=>s+(i<values.length?`$${i+1}`:'')).join(''),values);}
const tx={$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await query(strings,...values)).rows,$executeRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await query(strings,...values)).affectedRows} as unknown as Prisma.TransactionClient;
beforeAll(async()=>{
 await db.exec(`
 CREATE TABLE "Store"(id text PRIMARY KEY); INSERT INTO "Store" VALUES ('steam'),('course'),('beauty');
 CREATE TABLE "Customer"(id text,"storeId" text,name text); INSERT INTO "Customer" VALUES ('c','steam','顧客甲'),('course-c','course','學員甲');
 CREATE TABLE "Booking"(id text,"storeId" text DEFAULT 'steam',"customerId" text DEFAULT 'c',"bookingStatus" text DEFAULT 'COMPLETED',"bookingType" text DEFAULT 'FIRST_TRIAL',"customerPlanWalletId" text,"expectedAmount" int DEFAULT 499,"attendedPeople" int,people int DEFAULT 1,"updatedAt" timestamptz DEFAULT '2026-11-01T10:00Z');
 INSERT INTO "Booking"(id) VALUES ('due'),('discount-paid'),('transfer'),('group'),('cancelled'),('partial-attendance');
 UPDATE "Booking" SET "bookingStatus"='CANCELLED' WHERE id='cancelled'; UPDATE "Booking" SET people=2,"attendedPeople"=1 WHERE id='partial-attendance';
 CREATE TABLE "Transaction"(id text,"storeId" text DEFAULT 'steam',"bookingId" text,"unregisteredParticipantId" text,"transactionType" text DEFAULT 'TRIAL_PURCHASE',amount int,"paymentStatus" text);
 INSERT INTO "Transaction"(id,"bookingId",amount,"paymentStatus") VALUES ('paid','discount-paid',300,'SUCCESS'),('pending','transfer',499,'PENDING');
 CREATE TABLE "BookingParticipantGroup"(id text,"storeId" text,"bookingId" text); INSERT INTO "BookingParticipantGroup" VALUES ('g','steam','group');
 CREATE TABLE "BookingParticipant"(id text,"groupId" text,"storeId" text,"customerId" text,status text,service text,"walletSessionId" text,"collectionTransactionId" text,"expectedAmount" int,"completedAt" timestamptz); INSERT INTO "BookingParticipant" VALUES ('person','g','steam','c','COMPLETED','SINGLE',NULL,NULL,450,'2026-11-01T10:00Z');
 CREATE TABLE "CourseSession"(id text,"storeId" text,"endsAt" timestamptz,"cancelledAt" timestamptz); INSERT INTO "CourseSession" VALUES ('session','course','2026-11-01T10:00Z',NULL);
 CREATE TABLE "CourseBooking"(id text,"storeId" text DEFAULT 'course',"sessionId" text DEFAULT 'session',"customerName" text DEFAULT '學員甲',status text DEFAULT 'ATTENDED',"bookingKind" text DEFAULT 'TRIAL',"cardId" text,"trialPrice" int DEFAULT 500);
 INSERT INTO "CourseBooking"(id) VALUES ('trial-due'),('trial-paid'),('card'),('absent'); UPDATE "CourseBooking" SET "cardId"='card' WHERE id='card'; UPDATE "CourseBooking" SET status='NO_SHOW' WHERE id='absent';
 CREATE TABLE "CourseTrialPayment"(id text,"storeId" text,"bookingId" text,status text,"voidedAt" timestamptz,amount int); INSERT INTO "CourseTrialPayment" VALUES ('trial-receipt','course','trial-paid','SUCCESS',NULL,300);
 CREATE TABLE "CoursePurchase"(id text,"storeId" text,status text,"voidedAt" timestamptz,"confirmedAt" timestamptz,price int); INSERT INTO "CoursePurchase" VALUES ('tuition','course','CONFIRMED',NULL,'2026-11-01T10:00Z',300);
 ALTER TABLE "CoursePurchase" ADD COLUMN "customerId" text DEFAULT 'course-c',ADD COLUMN "createdAt" timestamptz DEFAULT '2026-10-31T10:00Z';
 CREATE TABLE "CourseMusicTuition"("storeId" text,"purchaseId" text,due int); INSERT INTO "CourseMusicTuition" VALUES ('course','tuition',1000);
 CREATE TABLE "CourseMusicReceipt"("storeId" text,"purchaseId" text,amount int); INSERT INTO "CourseMusicReceipt" VALUES ('course','tuition',300);
 CREATE TABLE "BeautyAppointment"(id text,"storeId" text DEFAULT 'beauty',"personName" text DEFAULT '顧客乙',price int DEFAULT 1000,"endsAt" timestamptz DEFAULT '2026-11-01T10:00Z',status text DEFAULT 'COMPLETED',"cardId" text);
 INSERT INTO "BeautyAppointment"(id) VALUES ('partial'),('waived'),('paid-card'),('voided-receipt'),('in-flight'),('cancelled'); UPDATE "BeautyAppointment" SET "cardId"='card' WHERE id='paid-card'; UPDATE "BeautyAppointment" SET status='CANCELLED' WHERE id='cancelled';
 CREATE TABLE "BeautyEvent"(id text,"storeId" text,"appointmentId" text,kind text,status text,body text,"createdAt" timestamptz);
 INSERT INTO "BeautyEvent" VALUES ('discount','beauty','partial','SERVICE_DISCOUNT','AUDIT','{"kind":"AMOUNT","value":200,"price":1000}','2026-11-01T10:00Z'),('waive','beauty','waived','SERVICE_DISCOUNT','AUDIT','{"kind":"PERCENT","value":100,"price":1000}','2026-11-01T10:00Z');
 CREATE TABLE "BeautyPayment"(id text,"storeId" text,"appointmentId" text,kind text,amount int); INSERT INTO "BeautyPayment" VALUES ('partial-cash','beauty','partial','SALE',100),('partial-card','beauty','partial','SALE',200),('bad','beauty','voided-receipt','SALE',1000);
 CREATE TABLE "BeautyTransactionRevision"("storeId" text,"transactionId" text,"voidedAt" timestamptz); INSERT INTO "BeautyTransactionRevision" VALUES ('beauty','bad','2026-11-01T11:00Z');
 CREATE TABLE "BeautyCollectionIntentItem"("storeId" text,"requestKey" text,"appointmentId" text,active boolean); INSERT INTO "BeautyCollectionIntentItem" VALUES ('beauty','request','in-flight',true);
 CREATE TABLE "BeautyCollectionIntent"("storeId" text,"requestKey" text,status text); INSERT INTO "BeautyCollectionIntent" VALUES ('beauty','request','PREPARED');
 CREATE TABLE "DigitalManagerNotice"(id text PRIMARY KEY,"storeId" text,"eventKey" text,"eventType" text,"targetId" text,"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"createdAt" timestamptz,"publishedAt" timestamptz,"updatedAt" timestamptz,UNIQUE("storeId","eventKey"));
 CREATE FUNCTION publish_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW."publishedAt"=NEW."createdAt";RETURN NEW;END$$;
 CREATE TRIGGER publish_notice BEFORE INSERT ON "DigitalManagerNotice" FOR EACH ROW EXECUTE FUNCTION publish_notice();
 `);
 m.stores.mockResolvedValue([{id:'steam',industryModule:'STEAMFOOT'},{id:'course',industryModule:'COURSE'},{id:'beauty',industryModule:'BEAUTY'}]);
 m.transaction.mockImplementation(async fn=>fn(tx));
},30000);
afterAll(()=>db.close());
it('only treats proven whole-dollar balances as due',()=>{
 expect(outstandingAmount(1000,300)).toBe(700);expect(outstandingAmount(1000,1200)).toBe(0);
 expect(()=>outstandingAmount(1000,-1)).toThrow();expect(()=>outstandingAmount(NaN,0)).toThrow();
 for(const kind of ['COMPLETE','NO_SHOW','RESTORE'])expect(producesStoreNotice(kind)).toBe(false);
 for(const kind of ['CANCEL','MOVE','UPDATE','BOOKING'])expect(producesStoreNotice(kind)).toBe(true);
});
it('steam excludes negotiated final receipts, pending verification, partial attendance and duplicate group charges',async()=>{
 const result=await readStoreReceivables(tx,'steam','steamfoot',now);
 expect(result.map(v=>[v.key,v.amount])).toEqual([['steamfoot-receivable:booking:due',499],['steamfoot-receivable:participant:person',450]]);
 expect(await readStoreReceivables(tx,'other','steamfoot',now)).toEqual([]);
});
it('courses separate accepted trial pricing from genuine tuition instalments',async()=>{
 expect((await readStoreReceivables(tx,'course','course',now)).map(v=>[v.key,v.amount])).toEqual([['course-receivable:trial:trial-due',500],['course-receivable:tuition:tuition',700]]);
});
it('beauty uses discounts and split receipts, excludes voided receipts and suspends unknown collection results',async()=>{
 const result=await readStoreReceivables(tx,'beauty','beauty',now);
 expect(result.find(v=>v.targetId==='partial')?.amount).toBe(500);
 expect(result.find(v=>v.targetId==='voided-receipt')?.amount).toBe(1000);
 expect(result.find(v=>v.targetId==='in-flight')).toMatchObject({suspended:true,amount:1000});
 expect(result.some(v=>['waived','paid-card','cancelled'].includes(v.targetId))).toBe(false);
});
it('retries never duplicate or renew publication; settlement is hidden immediately and then resolved by reconciliation',async()=>{
 expect(await reconcileStoreReceivableNotices(now)).toEqual({stores:3,failed:0});
 const before=await db.query<{id:string;publishedAt:Date}>('SELECT id,"publishedAt" FROM "DigitalManagerNotice"');
 expect(before.rows).toHaveLength(6);
 await db.exec(`INSERT INTO "CourseMusicReceipt" VALUES ('course','tuition',200); UPDATE "CoursePurchase" SET price=500 WHERE id='tuition';`);
 expect([...await readReceivableNoticeState(tx,'course','course',now)].find(([,v])=>v.targetId==='tuition')?.[1].amount).toBe(500);
 await reconcileStoreReceivableNotices(new Date(+now+3600000));
 expect((await db.query('SELECT id,"publishedAt" FROM "DigitalManagerNotice"')).rows).toEqual(before.rows);
 const state=await readReceivableNoticeState(tx,'beauty','beauty',now);
 expect([...state.values()].find(v=>v.targetId==='partial')?.amount).toBe(500);
 await db.exec(`INSERT INTO "BeautyPayment" VALUES ('settled','beauty','partial','SALE',500); UPDATE "BeautyCollectionIntent" SET status='CANCELLED' WHERE "requestKey"='request';`);
 expect([...await readReceivableNoticeState(tx,'beauty','beauty',now)].some(([,v])=>v.targetId==='partial')).toBe(false);
 await reconcileStoreReceivableNotices(now);
 const settled=await db.query<{handledAt:Date}>('SELECT "handledAt" FROM "DigitalManagerNotice" WHERE "eventKey"=$1',['beauty-receivable:service:partial']);
 expect(settled.rows[0].handledAt).not.toBeNull();
 expect((await db.query('SELECT id FROM "DigitalManagerNotice" WHERE "eventKey"=$1',['beauty-receivable:service:in-flight'])).rows).toHaveLength(1);
});
it('expired obligations do not create fresh reminders or clear the underlying balance',async()=>{
 const later=new Date(+now+11*86400000);
 await reconcileStoreReceivableNotices(later);
 expect(await readReceivableNoticeState(tx,'course','course',later)).toEqual(new Map());
 expect((await db.query<{due:number}>('SELECT due FROM "CourseMusicTuition"')).rows[0].due).toBe(1000);
 expect((await db.query('SELECT id FROM "DigitalManagerNotice"')).rows).toHaveLength(7);
});
