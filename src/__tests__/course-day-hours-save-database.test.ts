import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),hours:vi.fn(),specials:vi.fn(),entitlement:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{businessHours:{findMany:m.hours},specialBusinessDay:{findMany:m.specials},storeFeatureEntitlement:{findFirst:m.entitlement}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseManagerRead:m.manager,courseTransaction:m.transaction}));
vi.mock("@/lib/revalidation",()=>({revalidateBusinessHours:m.revalidate,revalidateSpecialDays:m.revalidate}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate,revalidateTag:m.revalidate}));
import type {z} from "zod";
import type {courseDayHoursValues} from "@/lib/course-day-hours-save";
import {saveCourseDayHours,getCourseDayHours} from "@/server/actions/course-business-hours";
let db:PGlite;
let client:Pick<PGlite,"query">;
const base={date:"2030-10-01",status:"closed" as const,mode:"copy" as const,weeks:2,reason:"公休",periods:[]};
async function query(sql:string,values:unknown[]=[]){
 const result=await (client??db).query<Record<string,unknown>>(sql,values.map(v=>v instanceof Date?v.toISOString():v));
 return result.rows.map(row=>{for(const key of ["date","startsAt","endsAt","createdAt","updatedAt"]){if(typeof row[key]==="string")row[key]=new Date(row[key] as string);}return row;});
}
const raw=vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values));
const write=vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{await raw(strings,...values);return 1;});
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 CREATE TABLE "BusinessHours" (id text primary key,"storeId" text,"dayOfWeek" int,"isOpen" boolean,"openTime" text,"closeTime" text,segments jsonb,"slotInterval" int,"defaultCapacity" int,"createdAt" timestamptz,"updatedAt" timestamptz,unique("storeId","dayOfWeek"));
 CREATE TABLE "SpecialBusinessDay" (id text primary key,"storeId" text,date date,type text,reason text,"openTime" text,"closeTime" text,segments jsonb,"slotInterval" int,"defaultCapacity" int,"createdAt" timestamptz,"updatedAt" timestamptz,unique("storeId",date));
 CREATE TABLE "ShopConfig" ("storeId" text,"dutySchedulingEnabled" boolean);
 CREATE TABLE "CourseSession" ("storeId" text,"startsAt" timestamptz,"endsAt" timestamptz,"cancelledAt" timestamptz,"coachId" text,"nameSnapshot" text);
 CREATE TABLE "DutyAssignment" ("storeId" text,date date,"slotTime" text,"staffId" text);
 `);
});
afterAll(async()=>db.close());
beforeEach(async()=>{
 vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"s"});m.entitlement.mockResolvedValue({id:"music"});
 m.hours.mockImplementation(()=>query('SELECT * FROM "BusinessHours" WHERE "storeId"=\'s\''));m.specials.mockImplementation(()=>query('SELECT * FROM "SpecialBusinessDay" WHERE "storeId"=\'s\''));
 raw.mockImplementation(async(strings,...values)=>query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values));write.mockImplementation(async(strings,...values)=>{await raw(strings,...values);return 1;});
 const tx={$queryRaw:raw,$executeRaw:write,courseSession:{findMany:async()=>query('SELECT "startsAt","endsAt" FROM "CourseSession" WHERE "storeId"=\'s\' AND "cancelledAt" IS NULL AND "startsAt">NOW()')}};
 m.transaction.mockImplementation(async(_store,work)=>db.transaction(async connection=>{client=connection;try{return await work(tx);}finally{client=db;}}));
 await db.exec(`TRUNCATE "BusinessHours","SpecialBusinessDay","ShopConfig","CourseSession","DutyAssignment";
 INSERT INTO "ShopConfig" VALUES ('s',false);
 INSERT INTO "BusinessHours" VALUES ('h','s',2,true,'09:00','18:00','[{"openTime":"09:00","closeTime":"18:00","slotInterval":30,"defaultCapacity":6}]',30,6,NOW(),NOW());`);
});
async function input(values:z.infer<typeof courseDayHoursValues>=base){return {...values,receipt:{expectedStoreId:"s",requestKey:"123e4567-e89b-42d3-a456-426614174000",expectedRevision:(await getCourseDayHours(values.date)).hoursRevision}};}
it("persists every copied date and confirms a lost-response retry without another SQL write",async()=>{
 const attempt=await input();const result=await saveCourseDayHours(attempt);
 expect(result).toMatchObject({success:true,storeId:"s",data:{date:base.date,day:{status:"closed"},specials:expect.arrayContaining([expect.objectContaining({date:"2030-10-15",type:"closed"})])}});
 const rows=await query('SELECT date,"slotInterval","updatedAt" FROM "SpecialBusinessDay" ORDER BY date');expect(rows).toHaveLength(3);expect(rows.every(r=>r.slotInterval===30)).toBe(true);
 const count=write.mock.calls.length;expect(await saveCourseDayHours(attempt)).toEqual(result);expect(write).toHaveBeenCalledTimes(count);expect(await query('SELECT date,"slotInterval","updatedAt" FROM "SpecialBusinessDay" ORDER BY date')).toEqual(rows);
});
it("rolls back the entire date batch if one future class would fall in a closure",async()=>{
 await db.exec(`INSERT INTO "CourseSession" VALUES ('s','2030-10-08T10:00:00+08:00','2030-10-08T11:00:00+08:00',NULL,'teacher','吉他');`);
 expect(await saveCourseDayHours(await input())).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("衝突")});expect(await query('SELECT * FROM "SpecialBusinessDay"')).toEqual([]);
});
it("checks stale revisions and store isolation before writing any affected date",async()=>{
 const attempt=await input();await db.exec(`UPDATE "BusinessHours" SET "openTime"='10:00',segments='[{"openTime":"10:00","closeTime":"18:00"}]'`);
 expect(await saveCourseDayHours(attempt)).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("已有更新")});expect(write).not.toHaveBeenCalled();
 m.transaction.mockClear();expect(await saveCourseDayHours({...attempt,receipt:{...attempt.receipt,expectedStoreId:"other"}})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("returns authoritative custom periods, and restores the weekly template atomically",async()=>{
 const custom={...base,status:"custom" as const,mode:"day" as const,weeks:0,periods:[{openTime:"10:00",closeTime:"12:00"},{openTime:"14:00",closeTime:"17:00"}]};
 expect(await saveCourseDayHours(await input(custom))).toMatchObject({success:true,data:{day:{status:"custom",periods:[{openTime:"10:00",slotInterval:30},{openTime:"14:00",slotInterval:30}]}}});
 const template={...custom,mode:"template" as const,weeks:2};expect(await saveCourseDayHours(await input(template))).toMatchObject({success:true,data:{day:{status:"open",specialDayId:null}}});
 expect(await query('SELECT * FROM "SpecialBusinessDay"')).toEqual([]);expect((await query('SELECT "openTime","closeTime" FROM "BusinessHours"'))[0]).toEqual({openTime:"10:00",closeTime:"17:00"});
});
it("does not report a committed batch as failed if cache invalidation fails",async()=>{
 m.revalidate.mockImplementation(()=>{throw new Error("cache failed");});
 expect(await saveCourseDayHours(await input())).toMatchObject({success:true,syncWarning:true});expect(await query('SELECT id FROM "SpecialBusinessDay"')).toHaveLength(3);
});
it("rolls back changed hours if the assigned teacher's duty no longer covers the class",async()=>{
 await db.exec(`UPDATE "ShopConfig" SET "dutySchedulingEnabled"=true;
 INSERT INTO "CourseSession" VALUES ('s','2030-10-01T10:00:00+08:00','2030-10-01T11:00:00+08:00',NULL,'teacher','吉他');`);
 const custom={...base,status:"custom" as const,mode:"day" as const,weeks:0,periods:[{openTime:"09:00",closeTime:"18:00"}]};
 expect(await saveCourseDayHours(await input(custom))).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("值班未涵蓋")});expect(await query('SELECT * FROM "SpecialBusinessDay"')).toEqual([]);
});
