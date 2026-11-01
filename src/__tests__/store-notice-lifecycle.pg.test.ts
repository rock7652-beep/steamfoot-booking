import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({raw:vi.fn(),execute:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.raw,$transaction:m.transaction}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{$queryRaw:m.raw}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw}}));
vi.mock('@/lib/permissions',()=>({requirePermission:vi.fn(async()=>({id:'u',name:'店長',role:'OWNER',storeId:'s'})),requireWritablePermission:vi.fn(async()=>({id:'u',name:'店長',role:'OWNER',storeId:'s'})),checkPermission:vi.fn(async()=>true)}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:vi.fn(async()=>'s'),resolveWriteStoreId:vi.fn(async()=>'s')}));
vi.mock('@/lib/industry-module-server',()=>({getStoreIndustryModule:vi.fn(async()=>'steamfoot')}));
vi.mock('@/server/services/operation-audit',()=>({recordOperationAudit:vi.fn()}));
vi.mock('@/server/services/operation-audit-outbox',()=>({enqueueOperationAudit:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:vi.fn(async()=>({storeId:'s',user:{id:'u',role:'OWNER'},isChildStoreView:false})),courseManager:vi.fn(async()=>({storeId:'s',user:{id:'u',name:'店長'}})),courseTransaction:m.transaction}));
vi.mock('@/server/beauty/access',()=>({beautyManager:vi.fn(async()=>({storeId:'s',userId:'u',name:'店長'})),beautyTransaction:m.transaction,audit:vi.fn()}));
vi.mock('@/lib/session',()=>({getCurrentUser:vi.fn(async()=>({id:'u',role:'OWNER'}))}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:vi.fn(async()=>true)}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:vi.fn(async()=>null)}));
vi.mock('@/lib/store-read-only',()=>({isReadOnlyStoreTarget:vi.fn(()=>false)}));
import {loadSteamfootStoreNotices,markSteamfootStoreNotice,markAllSteamfootStoreNotices} from '@/server/actions/steamfoot-store-notices';
import {loadCombinedCourseStoreNotices,markAllCourseStoreNotices} from '@/server/actions/course-digital-manager-notices';
import {loadBeautyStoreNotices,markAllBeautyStoreNotices} from '@/server/actions/beauty-store-notices';
import {verifyStoreNoticeLifecycleReadiness} from '../../scripts/store-notice-lifecycle-readiness.mjs';
import {noticeWindow} from '@/lib/store-notice-lifecycle';
const db=new PGlite();
const tx={$queryRaw:m.raw,$executeRaw:m.execute};
const day=86400000;
async function queryTag(strings:TemplateStringsArray,...values:unknown[]){return db.query(strings.map((part,i)=>part+(i<values.length?`$${i+1}`:'')).join(''),values);}
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE ordinary_notice; CREATE ROLE steamfoot_beauty_prod_20261025;
 CREATE TABLE "Store"(id text PRIMARY KEY); INSERT INTO "Store" VALUES ('s'),('other');
 CREATE TABLE "SteamfootStoreNotice"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"storeId" text,"bookingId" text,kind text DEFAULT 'MOVE',"customerName" text DEFAULT '顧客',"serviceName" text DEFAULT '服務',"staffName" text DEFAULT '店長',"previousStaffName" text,"startsAt" timestamptz DEFAULT now(),"previousStartsAt" timestamptz,"affectedCount" int DEFAULT 1,details jsonb DEFAULT '{}',"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now());
 CREATE TABLE "CourseStoreNotice"(LIKE "SteamfootStoreNotice" INCLUDING ALL);
 ALTER TABLE "CourseStoreNotice" RENAME "bookingId" TO "subjectKey"; ALTER TABLE "CourseStoreNotice" RENAME "serviceName" TO "courseName"; ALTER TABLE "CourseStoreNotice" RENAME "staffName" TO "coachName"; ALTER TABLE "CourseStoreNotice" RENAME "previousStaffName" TO "previousCoachName";
 CREATE TABLE "DigitalManagerNotice"(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"storeId" text,"eventKey" text,"eventType" text,"targetId" text DEFAULT 'target',"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now(),UNIQUE("storeId","eventKey"));
 INSERT INTO "SteamfootStoreNotice"(id,"storeId","createdAt","handledAt","handledByName") VALUES ('backfill','s',now()-interval '5 days',now()-interval '4 days','原處理者');`);
 for(const table of ['SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice']){
  await db.query(`INSERT INTO "${table}" (id,"storeId","createdAt","updatedAt","handledAt") VALUES ('grace','s',now()-interval '11 days',now()-interval '1 day',NULL),('old-unread','s',now()-interval '11 days',now()-interval '11 days',NULL),('old-read','s',now()-interval '11 days',now()-interval '1 day',now()-interval '1 day')`);
 }
 await db.exec('ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon,authenticated; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated');
 await db.exec(readFileSync('scripts/sql/store-notice-lifecycle-phase1.sql','utf8'));
 m.raw.mockImplementation(async(...args:Parameters<typeof queryTag>)=>(await queryTag(...args)).rows);
 m.execute.mockImplementation(async(...args:Parameters<typeof queryTag>)=>(await queryTag(...args)).affectedRows??0);
 m.transaction.mockImplementation(async(...args:unknown[])=>{
  const work=args.find(a=>typeof a==='function') as (tx:unknown)=>unknown;
  return work(tx);
 });
},30000);
afterAll(()=>db.close());
async function ordinary(table:string,id:string,days:number,subject='booking:x',store='s'){
 const key=table==='CourseStoreNotice'?'subjectKey':'bookingId';
 await db.query<Record<string,unknown>>(`INSERT INTO "${table}"(id,"storeId","${key}") VALUES ($1,$2,$3)`,[id,store,subject]);
 await db.query<Record<string,unknown>>(`UPDATE "${table}" SET "publishedAt"=$2 WHERE id=$1`,[id,new Date(Date.now()-days*day)]);
}
async function digital(id:string,days:number,key='digest:',store='s'){
 await db.query<Record<string,unknown>>(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","createdAt") VALUES ($1,$2,$3,'DAILY_ACTION_DIGEST',$4)`,[id,store,key+id,new Date(Date.now()-days*day)]);
}
it('backfills historical read state without treating marking time as a fresh event',async()=>{
 const row=(await db.query<Record<string,unknown>>(`SELECT * FROM "SteamfootStoreNotice" WHERE id='backfill'`)).rows[0];
 expect(row.publishedAt).toEqual(row.createdAt);expect(row.readAt).toEqual(row.handledAt);expect(row.readByName).toBe('原處理者');
});
it.each(['SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice'])('gives %s rollout grace only to expired recently updated unread messages',async table=>{
 const rows=(await db.query<{id:string;publishedAt:Date;createdAt:Date}>(`SELECT id,"publishedAt","createdAt" FROM "${table}" WHERE id IN ('grace','old-unread','old-read') ORDER BY id`)).rows;
 expect(rows).toHaveLength(3);
 const grace=rows.find(r=>r.id==='grace')!;expect(new Date(grace.publishedAt).getTime()).toBeGreaterThan(Date.now()-60000);expect(new Date(grace.createdAt).getTime()).toBeLessThan(Date.now()-10*day);
 for(const row of rows.filter(r=>r.id!=='grace'))expect(row.publishedAt).toEqual(row.createdAt);
});
it('accepts only the exact lifecycle schema and safe effective privileges',async()=>{
 const metadata={$queryRawUnsafe:async(sql:string)=>(await db.query(sql)).rows};
 expect(await verifyStoreNoticeLifecycleReadiness(metadata)).toBe(true);
 await db.exec('ALTER FUNCTION public.publish_digital_notice() SECURITY DEFINER');
 await expect(verifyStoreNoticeLifecycleReadiness(metadata)).rejects.toThrow('schema_rejected');
 await db.exec('ALTER FUNCTION public.publish_digital_notice() SECURITY INVOKER');
 await db.exec('GRANT UPDATE ("publishedAt") ON public."DigitalManagerNotice" TO steamfoot_beauty_prod_20261025');
 await expect(verifyStoreNoticeLifecycleReadiness(metadata)).rejects.toThrow('access_rejected');
 await db.exec('REVOKE UPDATE ("publishedAt") ON public."DigitalManagerNotice" FROM steamfoot_beauty_prod_20261025');
 expect(await verifyStoreNoticeLifecycleReadiness(metadata)).toBe(true);
});
it.each([
 ['steamfoot',loadSteamfootStoreNotices,markAllSteamfootStoreNotices,'SteamfootStoreNotice','booking:x','digest:'],
 ['course',loadCombinedCourseStoreNotices,markAllCourseStoreNotices,'CourseStoreNotice','session:x','digest:'],
 ['beauty',loadBeautyStoreNotices,markAllBeautyStoreNotices,'CourseStoreNotice','beauty:x','beauty-digest:'],
] as const)('reads %s latest/history independently of read state and excludes expired/other-store rows',async(label,load,markAll,table,subject,key)=>{
 await db.exec(`TRUNCATE "SteamfootStoreNotice","CourseStoreNotice","DigitalManagerNotice"`);
 await ordinary(table,'recent',1,subject);await ordinary(table,'history',4,subject);await ordinary(table,'expired',11,subject);await ordinary(table,'foreign',1,subject,'other');
 await digital('digital-recent',2,key);await digital('digital-history',8,key);await digital('digital-expired',11,key);
 const latest=await load({storeId:'s',handled:false,offset:0});
 expect(latest).toMatchObject({success:true,count:4,more:false});
 if(!latest.success)throw Error(latest.error);
 expect(latest.items.map(n=>n.id)).toEqual(['recent','digital:digital-recent']);
 const history=await load({storeId:'s',handled:true,offset:0});
 if(!history.success)throw Error(history.error);
 expect(history.items.map(n=>n.id)).toEqual(['history','digital:digital-history']);
 const before=(await db.query<Record<string,unknown>>(`SELECT "publishedAt" FROM "${table}" WHERE id='recent'`)).rows;
 expect(await markAll({storeId:'s'})).toMatchObject({success:true,count:4});
 const marked=await load({storeId:'s',handled:false,offset:0});
 expect(marked).toMatchObject({success:true,count:0});
 if(!marked.success)throw Error(marked.error);
 expect(marked.items.map(n=>n.id)).toEqual(latest.items.map(n=>n.id));expect(marked.items.every(n=>n.handledAt)).toBe(true);
 expect((await db.query<Record<string,unknown>>(`SELECT "publishedAt" FROM "${table}" WHERE id='recent'`)).rows).toEqual(before);
 expect((await db.query<Record<string,unknown>>(`SELECT "readAt","handledAt" FROM "${table}" WHERE id IN ('expired','foreign')`)).rows.every(r=>r.readAt===null&&r.handledAt===null)).toBe(true);
});
it('a new business event refreshes merged notices; marking and automatic resolution do not',async()=>{
 await db.exec(`TRUNCATE "SteamfootStoreNotice","CourseStoreNotice","DigitalManagerNotice"`);
 await ordinary('SteamfootStoreNotice','merge',8);
 const before=(await db.query<Record<string,unknown>>(`SELECT * FROM "SteamfootStoreNotice" WHERE id='merge'`)).rows[0];
 expect(await markSteamfootStoreNotice({storeId:'s',id:'merge',handled:true,revision:0})).toMatchObject({success:true});
 const marked=(await db.query<Record<string,unknown>>(`SELECT * FROM "SteamfootStoreNotice" WHERE id='merge'`)).rows[0];
 expect(marked.publishedAt).toEqual(before.publishedAt);expect(marked.handledAt).toBeNull();expect(marked.readAt).not.toBeNull();
 await db.exec(`UPDATE "SteamfootStoreNotice" SET "handledAt"=now() WHERE id='merge'`);
 expect((await db.query<Record<string,unknown>>(`SELECT "publishedAt" FROM "SteamfootStoreNotice" WHERE id='merge'`)).rows[0].publishedAt).toEqual(before.publishedAt);
 await db.exec(`UPDATE "SteamfootStoreNotice" SET kind='MOVE',"handledAt"=NULL,revision=revision+1 WHERE id='merge'`);
 const fresh=(await db.query<Record<string,unknown>>(`SELECT * FROM "SteamfootStoreNotice" WHERE id='merge'`)).rows[0];
 expect(new Date(fresh.publishedAt as string).getTime()).toBeGreaterThan(Date.now()-10000);expect(fresh.readAt).toBeNull();
});
it('uses one disjoint cutoff at exactly 72 and 240 hours in SQL',async()=>{
 const now=new Date();const latest=noticeWindow(false,now),history=noticeWindow(true,now);
 const values=[new Date(now.getTime()-3*day+1),new Date(now.getTime()-3*day),new Date(now.getTime()-10*day+1),new Date(now.getTime()-10*day)];
 for(const [i,date] of values.entries()){
  const r=(await db.query<{latest:boolean;history:boolean}>(`SELECT $1::timestamptz>$2 AND $1<=$3 AS latest,$1::timestamptz>$4 AND $1<=$2 AS history`,[date,latest.after,latest.through,history.after])).rows[0];
  expect(r).toEqual({latest:i===0,history:i===1||i===2});
 }
});
it.each([
 ['steamfoot',loadSteamfootStoreNotices,'SteamfootStoreNotice','bookingId','booking:','digest:'],
 ['course',loadCombinedCourseStoreNotices,'CourseStoreNotice','subjectKey','session:','digest:'],
 ['beauty',loadBeautyStoreNotices,'CourseStoreNotice','subjectKey','beauty:','beauty-digest:'],
] as const)('keeps %s combined pagination stable across sources with identical timestamps',async(_label,load,table,key,subject,eventPrefix)=>{
 await db.exec(`TRUNCATE "SteamfootStoreNotice","CourseStoreNotice","DigitalManagerNotice"`);
 await db.query(`INSERT INTO "${table}"(id,"storeId","${key}") SELECT 't-'||lpad(g::text,3,'0'),'s',$1||g FROM generate_series(1,120) g`,[subject]);
 const published=new Date(Date.now()-day);
 await db.query(`UPDATE "${table}" SET "publishedAt"=$1`,[published]);
 await db.query(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","createdAt") SELECT 'd-'||lpad(g::text,3,'0'),'s',$1||g,'DAILY_ACTION_DIGEST',$2 FROM generate_series(1,120) g`,[eventPrefix,published]);
 const expected=(await db.query<{id:string}>(`SELECT id FROM (SELECT id,"publishedAt" FROM "${table}" UNION ALL SELECT 'digital:'||id,"publishedAt" FROM "DigitalManagerNotice") n ORDER BY "publishedAt" DESC,id DESC`)).rows.map(r=>r.id);
 const actual:string[]=[];
 for(const offset of [0,50,100,150,200]){
  const result=await load({storeId:'s',handled:false,offset});if(!result.success)throw Error(result.error);
  expect(result.items.map(r=>r.id)).toEqual(expected.slice(offset,offset+50));expect(result.more).toBe(offset+50<240);actual.push(...result.items.map(r=>r.id));
 }
 expect(new Set(actual).size).toBe(240);expect(actual).toEqual(expected);
});
it('installs no deletion function, maintenance role, or expiry table',async()=>{
 expect((await db.query(`SELECT to_regprocedure('public.maintain_store_notice_retention()') IS NULL AS function_absent,to_regclass('public."StoreNoticeExpiryReceipt"') IS NULL AS table_absent,NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='store_notice_retention_maintainer') AS role_absent`)).rows).toEqual([{function_absent:true,table_absent:true,role_absent:true}]);
});
