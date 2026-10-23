import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {moveBeautyCustomerRelations,lockBeautyCustomerMerge} from '@/server/services/beauty-customer-merge';
import {beautyCareId} from '@/lib/beauty/care-id';
import {beautyPlanPreferenceId} from '@/lib/beauty/reminders';
let db:PGlite,client:Pick<PGlite,'query'>;
const compile=(s:TemplateStringsArray)=>s.reduce((r,p,i)=>r+(i?`$${i}`:'')+p,'');
const m={rebind:vi.fn(),review:vi.fn(),healthFail:false};
const raw=async(s:TemplateStringsArray,...values:unknown[])=>{const rows=(await client.query<Record<string,unknown>>(compile(s),values)).rows;for(const r of rows)if(typeof r.expiresAt==='string')r.expiresAt=new Date(r.expiresAt);return rows;};
const write=async(s:TemplateStringsArray,...values:unknown[])=>(await client.query(compile(s),values)).affectedRows??0;
const tx={$queryRaw:raw,$executeRaw:write,lineRebindRequest:{count:m.rebind},centralMemberLinkReviewRequest:{count:m.review},messageLog:{
 count:async()=>Number((await client.query<{n:string}>('SELECT count(*) AS n FROM "MessageLog" WHERE "storeId"=\'s\' AND "customerId" IN (\'src\',\'tgt\') AND status IN (\'PENDING\',\'FAILED\')')).rows[0].n),
 findMany:async()=> (await client.query('SELECT id,"templateId","renderedBody" FROM "MessageLog" WHERE "storeId"=\'s\' AND "customerId"=\'src\' AND "templateId" LIKE \'beauty-care-kind:s:%\'')).rows,
 upsert:async({create:c}: {create:Record<string,unknown>})=>client.query('INSERT INTO "MessageLog" (id,"storeId","customerId",channel,status,"renderedBody") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',[c.id,c.storeId,c.customerId,c.channel,c.status,c.renderedBody]),
 },messageTemplate:{findFirst:async({where}:{where:{id:string;storeId:string}})=>(await client.query('SELECT body FROM "MessageTemplate" WHERE id=$1 AND "storeId"=$2',[where.id,where.storeId])).rows[0]??null,upsert:async({create:c}:{create:Record<string,unknown>})=>client.query('INSERT INTO "MessageTemplate" (id,"storeId",name,channel,body) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body',[c.id,c.storeId,c.name,c.channel,c.body])},customerHealthRecord:{updateMany:async()=>{if(m.healthFail)throw Error('health failure');return {count:(await client.query('UPDATE "Health" SET "customerId"=\'tgt\' WHERE "storeId"=\'s\' AND "customerId"=\'src\'')).affectedRows};}},customerHealthHistoryGrant:{updateMany:async()=>({count:0})}};
const run=()=>db.transaction(async c=>{client=c;try{await lockBeautyCustomerMerge(tx as never,'s');return await moveBeautyCustomerRelations(tx as never,'s','src','tgt');}finally{client=db;}});
beforeAll(async()=>{db=new PGlite();client=db;await db.exec(`
 CREATE TABLE "Store" (id text primary key,"industryModule" text,"operatingStatus" text);
 INSERT INTO "Store" VALUES ('s','BEAUTY','ACTIVE'),('foreign','BEAUTY','ACTIVE');
 CREATE TABLE "Customer" (id text primary key,"storeId" text,"mergedIntoCustomerId" text);
 CREATE TABLE "BeautyCard" (id text primary key,"storeId" text,"customerId" text,"memberIds" text[],"expiresAt" timestamptz,remaining int,paid int);
 CREATE TABLE "BeautyAppointment" (id text primary key,"storeId" text,"customerId" text,"startsAt" timestamptz,"endsAt" timestamptz,status text,revision int,"isTrial" bool,rate jsonb,fee int,price int,"personName" text);
 CREATE TABLE "BeautyGroup" (id text primary key,"storeId" text,"customerId" text,"contactName" text);
 CREATE TABLE "BeautyPurchase" (id text primary key,"storeId" text,"customerId" text,status text,snapshot jsonb);
 CREATE TABLE "BeautyEvent" (id text primary key,"storeId" text,"customerId" text,status text);
 CREATE TABLE "TrialCarePreference" (id text primary key,"storeId" text,"customerId" text,token text unique,"stoppedAt" timestamptz,"lastEventAt" timestamptz,"createdAt" timestamptz,unique("storeId","customerId"));
 CREATE TABLE "TrialCareLog" (id text primary key,"storeId" text,"customerId" text,module text,stage int,body text,unique("storeId","customerId",stage));
 CREATE TABLE "MessageLog" (id text primary key,"storeId" text,"customerId" text,"templateId" text,"renderedBody" text,channel text,status text);
 CREATE TABLE "MessageTemplate" (id text primary key,"storeId" text,name text,channel text,body text);
 CREATE TABLE "Health" (id text primary key,"storeId" text,"customerId" text);
 CREATE TABLE "BeautyPayment" (id text primary key,paid int);
 CREATE TABLE "BeautyLedger" (id text primary key,delta int);
 `);});
afterAll(async()=>db.close());
beforeEach(async()=>{m.rebind.mockResolvedValue(0);m.review.mockResolvedValue(0);m.healthFail=false;await db.exec(`
 TRUNCATE "Customer","BeautyCard","BeautyAppointment","BeautyGroup","BeautyPurchase","BeautyEvent","TrialCarePreference","TrialCareLog","MessageLog","MessageTemplate","Health","BeautyPayment","BeautyLedger";
 INSERT INTO "Customer" VALUES ('src','s',null),('tgt','s',null),('older','s','src');
 INSERT INTO "BeautyCard" VALUES ('card','s','src',ARRAY['src','tgt'],'2030-11-01T00:00:00Z',5,4500),('outside','foreign','src',ARRAY['src'],'2030-11-01T00:00:00Z',9,8000);
 INSERT INTO "BeautyAppointment" VALUES ('booking','s','src','2030-10-23T09:00:00+08','2030-10-23T10:00:00+08','COMPLETED',3,true,'{"mode":"FIXED","value":300}',300,500,'保留姓名快照');
 INSERT INTO "BeautyGroup" VALUES ('group','s','src','保留聯絡人');
 INSERT INTO "BeautyPurchase" VALUES ('purchase','s','src','CONFIRMED','{"paid":4500}');
 INSERT INTO "BeautyEvent" VALUES ('event','s','src','AUDIT');
 INSERT INTO "Health" VALUES ('health','s','src');
 INSERT INTO "BeautyPayment" VALUES ('receipt',4500);INSERT INTO "BeautyLedger" VALUES ('debit',-1);
 `);});
it('moves scoped memberships and identity references while retaining balances, trial history and all financial snapshots',async()=>{
 const before=(await db.query('SELECT remaining,paid FROM "BeautyCard" WHERE id=\'card\'')).rows;
 expect(await run()).toMatchObject({beautyMembers:1,beautyBookings:1,beautyGroups:1,beautyPurchases:1,healthRecords:1});
 expect((await db.query('SELECT remaining,paid FROM "BeautyCard" WHERE id=\'card\'')).rows).toEqual(before);
 expect((await db.query('SELECT "customerId","memberIds" FROM "BeautyCard" WHERE id=\'card\'')).rows[0]).toEqual({customerId:'tgt',memberIds:['tgt']});expect((await db.query('SELECT "customerId","memberIds" FROM "BeautyCard" WHERE id=\'outside\'')).rows[0]).toEqual({customerId:'src',memberIds:['src']});
 expect((await db.query('SELECT "customerId",revision,"isTrial",rate,fee,price,"personName" FROM "BeautyAppointment"')).rows[0]).toEqual({customerId:'tgt',revision:4,isTrial:true,rate:{mode:'FIXED',value:300},fee:300,price:500,personName:'保留姓名快照'});
 expect((await db.query('SELECT * FROM "BeautyPayment"')).rows).toEqual([{id:'receipt',paid:4500}]);expect((await db.query('SELECT * FROM "BeautyLedger"')).rows).toEqual([{id:'debit',delta:-1}]);expect((await db.query('SELECT "mergedIntoCustomerId" FROM "Customer" WHERE id=\'older\'')).rows[0]).toEqual({mergedIntoCustomerId:'tgt'});
});
it('preserves original sent receipts and creates only skipped dedupe markers for the merged identity',async()=>{
 const old=beautyCareId('s','src','card','LOW_BALANCE');await db.query('INSERT INTO "MessageLog" VALUES ($1,\'s\',\'src\',\'beauty-care-kind:s:LOW_BALANCE\',\'已發送快照\',\'LINE\',\'SENT\')',[old]);
 await run();const marker=beautyCareId('s','tgt','card','LOW_BALANCE');expect((await db.query('SELECT status,"renderedBody" FROM "MessageLog" WHERE id=$1',[old])).rows[0]).toEqual({status:'SENT',renderedBody:'已發送快照'});expect((await db.query('SELECT status FROM "MessageLog" WHERE id=$1',[marker])).rows[0]).toEqual({status:'SKIPPED'});
});
it('keeps restrictive reminder preferences and stage history without deleting collision records',async()=>{
 await db.query('INSERT INTO "MessageTemplate" VALUES ($1,\'s\',\'source\',\'LINE\',\'stopped\'),($2,\'s\',\'target\',\'LINE\',\'receiving\')',[beautyPlanPreferenceId('s','src'),beautyPlanPreferenceId('s','tgt')]);
 await db.exec(`INSERT INTO "TrialCarePreference" VALUES ('p','s','src','token','2030-10-01',null,now());INSERT INTO "TrialCareLog" VALUES ('one','s','src','BEAUTY',1,'來源快照'),('two','s','src','BEAUTY',2,'來源第二次'),('target','s','tgt','BEAUTY',1,'目標快照');`);
 await run();expect((await db.query('SELECT body FROM "MessageTemplate" WHERE id=$1',[beautyPlanPreferenceId('s','tgt')])).rows[0]).toEqual({body:'stopped'});expect((await db.query('SELECT "stoppedAt" IS NOT NULL AS stopped FROM "TrialCarePreference" WHERE "customerId"=\'tgt\'')).rows[0]).toEqual({stopped:true});expect((await db.query('SELECT id,"customerId",body FROM "TrialCareLog" ORDER BY id')).rows).toEqual([{id:'one',customerId:'src',body:'來源快照'},{id:'target',customerId:'tgt',body:'目標快照'},{id:'two',customerId:'tgt',body:'來源第二次'}]);
});
it('rolls back every reference and dedupe marker if a late health write fails',async()=>{
 const old=beautyCareId('s','src','card','LOW_BALANCE');await db.query('INSERT INTO "MessageLog" VALUES ($1,\'s\',\'src\',\'beauty-care-kind:s:LOW_BALANCE\',\'body\',\'LINE\',\'SENT\')',[old]);m.healthFail=true;await expect(run()).rejects.toThrow('health failure');expect((await db.query('SELECT "customerId","memberIds" FROM "BeautyCard" WHERE id=\'card\'')).rows[0]).toEqual({customerId:'src',memberIds:['src','tgt']});expect((await db.query<{n:number}>('SELECT count(*) AS n FROM "MessageLog"')).rows[0].n).toBe(1);expect((await db.query<{revision:number}>('SELECT revision FROM "BeautyAppointment"')).rows[0].revision).toBe(3);
});
it.each(['rebind','review','pending','overlap','unknown-receipt'])('rejects unresolved %s before moving data',async kind=>{
 if(kind==='rebind')m.rebind.mockResolvedValue(1);if(kind==='review')m.review.mockResolvedValue(1);if(kind==='pending')await db.exec(`INSERT INTO "BeautyEvent" VALUES ('pending','s','src','PENDING')`);
 if(kind==='overlap')await db.exec(`UPDATE "BeautyAppointment" SET status='RESERVED';INSERT INTO "BeautyAppointment" (id,"storeId","customerId","startsAt","endsAt",status,revision) VALUES ('other','s','tgt','2030-10-23T09:30:00+08','2030-10-23T10:30:00+08','RESERVED',0)`);
 if(kind==='unknown-receipt')await db.exec(`INSERT INTO "MessageLog" VALUES ('invalid','s','src','beauty-care-kind:s:LOW_BALANCE','body','LINE','SENT')`);
 await expect(run()).rejects.toThrow();expect((await db.query('SELECT "customerId","memberIds" FROM "BeautyCard" WHERE id=\'card\'')).rows[0]).toEqual({customerId:'src',memberIds:['src','tgt']});
});
