import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),module:vi.fn(),steam:vi.fn(),spa:vi.fn(),cache:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.steam}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:m.spa}}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/lib/revalidation",()=>({revalidateBusinessHoursInRoute:m.cache}));
vi.mock("@/lib/error-logger",()=>({logError:vi.fn(),categorizeError:()=>"UNKNOWN"}));
import {saveServiceHours} from "@/server/services/service-hours-save";
import {readServiceHoursState,serviceHoursRevision} from "@/server/services/service-hours-state";
import {savedServiceHours} from "@/lib/service-hours-save";
let db:PGlite,client:Pick<PGlite,"query">;
const sql=(s:TemplateStringsArray)=>s.reduce((r,p,i)=>r+(i?`$${i}`:"")+p,"");
const raw=vi.fn(async(s:TemplateStringsArray,...values:unknown[])=>{const rows=(await client.query(sql(s),values)).rows as Record<string,unknown>[];for(const row of rows)for(const key of ["date","bookingDate"])if(typeof row[key]==="string")row[key]=new Date(row[key] as string);return rows;});
const write=vi.fn(async(s:TemplateStringsArray,...values:unknown[])=>s.join("").includes("pg_advisory_xact_lock")?1:(await client.query(sql(s),values)).affectedRows);
const tx={$queryRaw:raw,$executeRaw:write};
beforeAll(async()=>{db=new PGlite();client=db;await db.exec(`
 CREATE TABLE "BusinessHours" (id text primary key,"storeId" text,"dayOfWeek" int,"isOpen" bool,"openTime" text,"closeTime" text,"slotInterval" int,"defaultCapacity" int,segments jsonb,"updatedAt" timestamp NOT NULL,unique("storeId","dayOfWeek"));
 CREATE TABLE "SpecialBusinessDay" (id text primary key,"storeId" text,date date,type text,reason text,"openTime" text,"closeTime" text,"slotInterval" int,"defaultCapacity" int,segments jsonb,"updatedAt" timestamp NOT NULL,unique("storeId",date));
 CREATE TABLE "SlotOverride" (id text primary key,"storeId" text,date date,"startTime" text,type text,capacity int,reason text,"updatedAt" timestamp NOT NULL,unique("storeId",date,"startTime"));
 CREATE TABLE "AuditLog" (id text primary key,"actorUserId" text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamp);
 CREATE TABLE "Booking" ("storeId" text,"bookingDate" date,"slotTime" text,people int,"bookingStatus" text);
 CREATE TABLE "SpaBooking" ("storeId" text,"bookingDate" date,"startTime" text,"endTime" text,people int,status text);
 `);});
afterAll(async()=>db.close());
beforeEach(async()=>{
 vi.clearAllMocks();m.permission.mockResolvedValue({id:"owner"});m.store.mockResolvedValue("s");m.module.mockResolvedValue("steamfoot");m.cache.mockReset();
 const transaction=async(work:(tx:unknown)=>unknown)=>db.transaction(async c=>{client=c;try{return await work(tx);}finally{client=db;}});
 m.steam.mockImplementation(transaction);m.spa.mockImplementation(transaction);
 await db.exec(`TRUNCATE "BusinessHours","SpecialBusinessDay","SlotOverride","AuditLog","Booking","SpaBooking";INSERT INTO "BusinessHours" VALUES ('h','s',4,true,'10:00','18:00',60,6,NULL,now()),('other','other',4,true,'09:00','22:00',30,9,NULL,now());`);
});
const values={date:"2030-10-10",status:"custom",mode:"day",weeks:0,reason:"調整營業",periods:[{openTime:"11:00",closeTime:"17:00",slotInterval:60,defaultCapacity:6}]};
async function input(extra:Record<string,unknown>={}){return {expectedStoreId:"s",requestKey:crypto.randomUUID(),expectedRevision:serviceHoursRevision(await readServiceHoursState(tx as never,"s")),values:{...values,...extra}};}
it("returns actual day/month/slot authority and a lost-response retry does not write twice",async()=>{
 const receipt=await input(),result=await saveServiceHours(receipt);expect(result).toMatchObject({success:true,storeId:"s",data:{day:{status:"custom",openTime:"11:00",slots:[{startTime:"11:00"},{startTime:"12:00"},{startTime:"13:00"},{startTime:"14:00"},{startTime:"15:00"},{startTime:"16:00"}]}}});if(result.success)expect(savedServiceHours.safeParse(result.data).success).toBe(true);
 const count=write.mock.calls.length;expect(await saveServiceHours(receipt)).toMatchObject({success:true});expect(write.mock.calls.slice(count).filter(([s])=>!s.join("").includes("pg_advisory"))).toEqual([]);expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "AuditLog"')).rows[0].count).toBe(1);
});
it("stale revisions, wrong stores and module mismatch cannot mutate",async()=>{
 const receipt=await input();expect(await saveServiceHours({...receipt,expectedRevision:"f".repeat(64)})).toMatchObject({success:false,uncertain:false});expect(await saveServiceHours({...receipt,expectedStoreId:"other"})).toMatchObject({success:false});m.module.mockResolvedValue("course");expect(await saveServiceHours(receipt)).toMatchObject({success:false});expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "SpecialBusinessDay"')).rows[0].count).toBe(0);
});
it("rejects existing Steam bookings outside hours or exceeding reduced capacity, atomically",async()=>{
 await db.exec(`INSERT INTO "Booking" VALUES ('s','2030-10-10','10:00',2,'CONFIRMED');`);expect(await saveServiceHours(await input())).toMatchObject({success:false});expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "SpecialBusinessDay"')).rows[0].count).toBe(0);
 expect(await saveServiceHours(await input({periods:[{openTime:"10:00",closeTime:"18:00",slotInterval:60,defaultCapacity:1}]}))).toMatchObject({success:false});
});
it("uses only SPA bookings and schedule lock, rejecting appointments extending past closing",async()=>{
 m.module.mockResolvedValue("spa");await db.exec(`INSERT INTO "SpaBooking" VALUES ('s','2030-10-10','16:30','17:30',1,'CONFIRMED');INSERT INTO "Booking" VALUES ('s','2030-10-10','11:00',999,'CONFIRMED');`);
 expect(await saveServiceHours(await input({periods:[{openTime:"11:00",closeTime:"17:00",slotInterval:30,defaultCapacity:6}]}))).toMatchObject({success:false});expect(m.steam).not.toHaveBeenCalled();expect(raw.mock.calls.some(([s])=>s.join("").includes('FROM "Booking"'))).toBe(false);expect(write.mock.calls.some(c=>c[1]==="spa-schedule:s")).toBe(true);
 expect(await saveServiceHours(await input({periods:[{openTime:"11:00",closeTime:"18:00",slotInterval:30,defaultCapacity:6}]}))).toMatchObject({success:true});
});
it("copies arbitrary dates with skip, retains source overrides, and undoes from database snapshots",async()=>{
 await db.exec(`INSERT INTO "SpecialBusinessDay" VALUES ('existing','s','2030-10-12','closed','原公休',NULL,NULL,NULL,NULL,NULL,now());INSERT INTO "SlotOverride" VALUES ('override','s','2030-10-10','12:00','capacity_change',4,NULL,now());`);
 const result=await saveServiceHours(await input({mode:"dates",targetDates:["2030-10-11","2030-10-12"],conflictMode:"skip",includeSlotOverrides:true}));expect(result).toMatchObject({success:true,data:{count:1,skipped:[{date:"2030-10-12"}],operationId:expect.any(String)}});
 if(!result.success)throw Error("missing receipt");expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "SlotOverride"')).rows[0].count).toBe(2);
 const undo={...await input({mode:"undo",operationId:result.data.operationId,periods:[]}),expectedRevision:result.data.day.hoursRevision};expect(await saveServiceHours(undo)).toMatchObject({success:true});expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "SlotOverride"')).rows[0].count).toBe(1);expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "SpecialBusinessDay"')).rows[0].count).toBe(1);
});
it("template copies overrides while retaining closed exceptions; weekly edits preserve source special dates",async()=>{
 await db.exec(`INSERT INTO "SpecialBusinessDay" VALUES ('closed','s','2030-10-17','closed','保留',NULL,NULL,NULL,NULL,NULL,now());INSERT INTO "SlotOverride" VALUES ('override','s','2030-10-10','12:00','disabled',NULL,NULL,now());`);
 expect(await saveServiceHours(await input({mode:"template",weeks:1}))).toMatchObject({success:true,data:{count:1}});expect((await db.query<Record<string,unknown>>('SELECT reason FROM "SpecialBusinessDay"')).rows).toEqual([{reason:"保留"}]);expect((await db.query<Record<string,unknown>>('SELECT count(*) FROM "SlotOverride"')).rows[0].count).toBe(2);
 expect(await saveServiceHours(await input({mode:"weekly",dayOfWeek:1}))).toMatchObject({success:true});expect((await db.query<Record<string,unknown>>('SELECT "openTime" FROM "BusinessHours" WHERE "storeId"=\'s\' AND "dayOfWeek"=1')).rows).toEqual([{openTime:"11:00"}]);
});
it("closed and training copies retain future slot overrides for reopening",async()=>{
 for(const status of ["closed","training"]){
  await db.exec(`TRUNCATE "SpecialBusinessDay","SlotOverride";INSERT INTO "SlotOverride" VALUES ('source','s','2030-10-10','12:00','disabled',NULL,NULL,now()),('future','s','2030-10-17','12:00','capacity_change',4,'保留',now());`);
  expect(await saveServiceHours(await input({mode:"copy",weeks:1,status,periods:[]}))).toMatchObject({success:true,data:{count:1}});
  expect((await db.query<Record<string,unknown>>('SELECT capacity,reason FROM "SlotOverride"')).rows).toEqual([{capacity:4,reason:"保留"}]);
 }
});
it("single-slot reductions protect bookings; committed cache failure returns a warning",async()=>{
 await db.exec(`INSERT INTO "Booking" VALUES ('s','2030-10-10','12:00',3,'CONFIRMED');`);expect(await saveServiceHours(await input({mode:"slots",changes:[{startTime:"12:00",action:"capacity",capacity:2}]}))).toMatchObject({success:false});m.cache.mockImplementation(()=>{throw Error("cache down");});expect(await saveServiceHours(await input({mode:"slots",changes:[{startTime:"12:00",action:"capacity",capacity:4}]}))).toMatchObject({success:true,syncWarning:true,data:{day:{slots:expect.arrayContaining([expect.objectContaining({startTime:"12:00",capacity:4})])}}});
});
