import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {recordBeautyStoreNotice} from '@/server/beauty/store-notices';
import type {Prisma} from '../../generated/beauty-client';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`CREATE ROLE beauty_notice_test;CREATE TABLE "BeautySetting"("storeId" text PRIMARY KEY,notifications boolean NOT NULL DEFAULT false);CREATE TABLE "CourseStoreNotice"(id text PRIMARY KEY,"storeId" text,"subjectKey" text,kind text,"customerName" text,"courseName" text,"coachName" text,"previousCoachName" text,"startsAt" timestamptz,"previousStartsAt" timestamptz,"affectedCount" int,details jsonb,"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int,"createdAt" timestamptz,"updatedAt" timestamptz,UNIQUE("storeId","subjectKey"));INSERT INTO "BeautySetting" VALUES('store',false);SET beauty_migration.app_role='beauty_notice_test';`);const sql=readFileSync('scripts/sql/beauty-backend-notices-candidate.sql','utf8');await db.exec(sql);await db.exec(sql);},30000);
afterAll(async()=>db.close());
function adapter(sql:{query:(s:string,args?:unknown[])=>Promise<unknown>}){return {beautyTechnician:{findMany:async()=>[{id:'tech',name:'技師'}]},$executeRaw:async(strings:TemplateStringsArray,...args:unknown[])=>{let text=strings[0];for(let i=0;i<args.length;i++)text+='$'+(i+1)+strings[i+1];return sql.query(text,args);}} as unknown as Prisma.TransactionClient;}
const actor={storeId:'store',userId:'owner',name:'店長',manager:true},b={id:'booking',personName:'顧客',serviceName:'做臉',technicianId:'tech',startsAt:new Date('2099-01-01T02:00Z'),isTrial:false};
it('adds only notice configuration/privileges, preserves LINE off, and grants no deletion',async()=>{expect((await db.query('SELECT * FROM "BeautySetting"')).rows[0]).toMatchObject({notifications:false,backendNoticesEnabled:true});const permissions=await db.query<{privilege_type:string}>("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='beauty_notice_test'");expect(permissions.rows.map(r=>r.privilege_type).sort()).toEqual(['INSERT','SELECT','UPDATE']);});
it('captures a customer same-day booking despite the legacy disabled setting',async()=>{
 await expect(db.transaction(async sql=>{await recordBeautyStoreNotice(adapter(sql),{storeId:'store',userId:'customer-user',customerId:'customer'},false,{...b,id:'disabled-setting',startsAt:new Date()},'BOOKING');expect((await sql.query(`SELECT "handledAt" FROM "CourseStoreNotice" WHERE "subjectKey"='beauty:disabled-setting'`)).rows).toEqual([{handledAt:null}]);throw Error('rollback test fixture');})).rejects.toThrow('rollback test fixture');
 expect((await db.query('SELECT * FROM "CourseStoreNotice"')).rows).toHaveLength(0);
});
it('uses the shared table, coalesces one item and preserves the first move origin',async()=>{const tx=adapter(db);await recordBeautyStoreNotice(tx,{...actor,manager:false,customerId:'customer'},true,b,'BOOKING');expect((await db.query('SELECT * FROM "CourseStoreNotice"')).rows[0]).toMatchObject({subjectKey:'beauty:booking',kind:'BOOKING',handledByName:'店長',revision:0});const next={...b,startsAt:new Date('2099-01-02T02:00Z')};await recordBeautyStoreNotice(tx,actor,true,next,'MOVE',{startsAt:b.startsAt,technicianId:'tech'});await recordBeautyStoreNotice(tx,actor,true,{...next,startsAt:new Date('2099-01-03T02:00Z')},'MOVE',{startsAt:next.startsAt,technicianId:'tech'});const rows=(await db.query<Record<string,unknown>>('SELECT * FROM "CourseStoreNotice"')).rows;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:'MOVE',revision:2,handledAt:null});expect(new Date(rows[0].previousStartsAt as string).getTime()).toBe(+b.startsAt);});
it('rolls notice creation back with the caller transaction',async()=>{await expect(db.transaction(async sql=>{await recordBeautyStoreNotice(adapter(sql),actor,true,{...b,id:'rolled-back'},'MOVE');throw Error('booking failed');})).rejects.toThrow('booking failed');expect((await db.query('SELECT id FROM "CourseStoreNotice" WHERE "subjectKey"=\'beauty:rolled-back\'')).rows).toHaveLength(0);});
it('notifies customer same-day bookings without notifying manager-created bookings',async()=>{
 const tx=adapter(db),now=new Date();
 await recordBeautyStoreNotice(tx,{storeId:'store',userId:'customer-user',customerId:'customer'},true,{...b,id:'today-customer',startsAt:now},'BOOKING');
 await recordBeautyStoreNotice(tx,actor,true,{...b,id:'today-manager',startsAt:now},'BOOKING');
 const rows=await db.query<{subjectKey:string;handledAt:Date|null}>(`SELECT "subjectKey","handledAt" FROM "CourseStoreNotice" WHERE "subjectKey" IN ('beauty:today-customer','beauty:today-manager') ORDER BY "subjectKey"`);
 expect(rows.rows[0]).toMatchObject({subjectKey:'beauty:today-customer',handledAt:null});
 expect(rows.rows).toHaveLength(1);
});
it('keeps a public trial pending even when it is not today',async()=>{
 await recordBeautyStoreNotice(adapter(db),{storeId:'store',userId:null,actorKey:'public'},true,{...b,id:'public-trial',isTrial:true},'BOOKING');
 expect((await db.query(`SELECT "handledAt" FROM "CourseStoreNotice" WHERE "subjectKey"='beauty:public-trial'`)).rows[0]).toMatchObject({handledAt:null});
});

it('accepts Beauty completion/no-show outcomes while retaining the existing course-kind boundary',async()=>{
 const tx=adapter(db);await recordBeautyStoreNotice(tx,actor,true,{...b,id:'completed'},'COMPLETE');await recordBeautyStoreNotice(tx,actor,true,{...b,id:'missed'},'NO_SHOW');
 expect((await db.query("SELECT kind FROM \"CourseStoreNotice\" WHERE \"subjectKey\" IN ('beauty:completed','beauty:missed') ORDER BY kind")).rows).toEqual([{kind:'COMPLETE'},{kind:'NO_SHOW'}]);
 await expect(db.query("INSERT INTO \"CourseStoreNotice\" (id,\"storeId\",\"subjectKey\",kind) VALUES ('invalid-course','store','course:one','COMPLETE')")).rejects.toThrow();
});
