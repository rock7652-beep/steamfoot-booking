import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),industry:vi.fn(),spaGuard:vi.fn(),steamTx:vi.fn(),spaTx:vi.fn(),cache:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.steamTx}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:m.spaTx}}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.industry,requireSpaStore:m.spaGuard}));
vi.mock("@/lib/revalidation",()=>({revalidateShopConfigInRoute:m.cache}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/error-logger",()=>({logError:vi.fn(),categorizeError:()=>"UNKNOWN"}));
import {saveSteamBookingWindow} from "@/server/services/steam-booking-window-save";
import {saveSpaBookingWindow} from "@/server/services/spa-booking-window-save";
import {AppError} from "@/lib/errors";
let db:PGlite,client:Pick<PGlite,"query">;
async function query(sql:string,values:unknown[]=[]){return client.query<Record<string,unknown>>(sql,values.map(v=>v instanceof Date?v.toISOString():v));}
const raw=vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
 const result=await query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values);
 return result.rows.map(row=>{for(const key of ["bookableUntilDate","bookingOpensAt","updatedAt","bookingDate"])if(typeof row[key]==="string")row[key]=new Date(row[key] as string);return row;});
});
const write=vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
 const sql=strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,"");
 if(sql.includes("pg_advisory_xact_lock"))return 1; // PGlite is single-connection; lock scope asserted separately.
 return (await query(sql,values)).affectedRows;
});
const steamBookings=vi.fn(async()=>raw`SELECT "bookingDate","slotTime" FROM "Booking" WHERE "storeId"='s' AND "bookingStatus" IN ('PENDING','CONFIRMED') AND "bookingDate">=CURRENT_DATE`);
const spaBookings=vi.fn(async()=>raw`SELECT "bookingDate","startTime" FROM "SpaBooking" WHERE "storeId"='s' AND status IN ('PENDING','CONFIRMED') AND "bookingDate">=CURRENT_DATE`);
beforeAll(async()=>{db=new PGlite({parsers:{1114:value=>new Date(value.replace(" ","T")+"Z"),1082:value=>new Date(value+"T00:00:00Z")}});client=db;await db.exec(`
 CREATE TABLE "Store" (id text primary key);
 CREATE TABLE "ShopConfig" (id text primary key,"storeId" text unique references "Store", "bookableUntilDate" date,"bookingWindowDays" int DEFAULT 14,"bookingOpensAt" timestamp(3),"updatedAt" timestamp(3),"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE "Booking" ("storeId" text,"bookingDate" date,"slotTime" text,"bookingStatus" text);
 CREATE TABLE "SpaBooking" ("storeId" text,"bookingDate" date,"startTime" text,status text);
 `);});
afterAll(async()=>db.close());
beforeEach(async()=>{
 vi.clearAllMocks();m.cache.mockReset();m.permission.mockReset();m.permission.mockResolvedValue({id:"u"});m.store.mockResolvedValue("s");m.industry.mockResolvedValue("steamfoot");m.spaGuard.mockReset();m.spaGuard.mockResolvedValue(undefined);
 const tx={$queryRaw:raw,$executeRaw:write,booking:{findMany:steamBookings},spaBooking:{findMany:spaBookings}};
 for(const mock of [m.steamTx,m.spaTx])mock.mockReset().mockImplementation(async work=>db.transaction(async connection=>{client=connection;try{return await work(tx);}finally{client=db;}}));
 await db.exec(`TRUNCATE "ShopConfig","Store","Booking","SpaBooking";INSERT INTO "Store" VALUES ('s'),('other');INSERT INTO "ShopConfig" VALUES ('c','s',NULL,14,NULL,'2026-10-01'),('o','other',NULL,30,NULL,'2026-10-01');`);
});
const receipt={expectedStoreId:"s",requestKey:"123e4567-e89b-42d3-a456-426614174000",expectedRevision:JSON.stringify([null,14,null]),values:{mode:"rolling",days:7}};
it.each([saveSteamBookingWindow,saveSpaBookingWindow])("executes actual config SQL and confirms lost-response retry without rewriting",async save=>{
 expect(await save(receipt)).toMatchObject({success:true,storeId:"s",data:{date:null,days:7,opensAt:null}});
 const rows=(await db.query('SELECT * FROM "ShopConfig" ORDER BY id')).rows,count=write.mock.calls.length;
 expect(await save(receipt)).toMatchObject({success:true,data:{days:7}});expect(write.mock.calls.slice(count).filter(([s])=>s.join("").includes('UPDATE "ShopConfig"'))).toEqual([]);
 expect((await db.query('SELECT * FROM "ShopConfig" ORDER BY id')).rows).toEqual(rows);
 expect(m.permission).toHaveBeenCalledWith("business_hours.manage");
 if(save===saveSpaBookingWindow){expect(steamBookings).not.toHaveBeenCalled();expect(m.steamTx).not.toHaveBeenCalled();expect(write.mock.calls[0][1]).toBe("spa-schedule:s");}else{expect(spaBookings).not.toHaveBeenCalled();expect(m.spaTx).not.toHaveBeenCalled();}
});
it.each([saveSteamBookingWindow,saveSpaBookingWindow])("refuses stale revisions, wrong stores and invalid dates before writes",async save=>{
 await db.exec(`UPDATE "ShopConfig" SET "bookingOpensAt"='2030-10-01' WHERE "storeId"='s'`);
 expect(await save(receipt)).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("已被修改")});
 m.steamTx.mockClear();m.spaTx.mockClear();
 expect(await save({...receipt,expectedStoreId:"other"})).toMatchObject({success:false,uncertain:false});
 expect(await save({...receipt,values:{mode:"fixed",date:"2030-02-30"}})).toMatchObject({success:false,uncertain:false});expect(m.steamTx).not.toHaveBeenCalled();expect(m.spaTx).not.toHaveBeenCalled();
});
it("checks SPA bookings only and rolls back a shortened deadline",async()=>{
 await db.exec(`INSERT INTO "SpaBooking" VALUES ('s','2030-10-02','10:00','CONFIRMED');INSERT INTO "Booking" VALUES ('s','2030-10-03','10:00','CONFIRMED');`);
 expect(await saveSpaBookingWindow({...receipt,values:{mode:"fixed",date:"2030-10-01"}})).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("已有服務預約")});
 expect((await db.query('SELECT "bookingWindowDays","bookableUntilDate" FROM "ShopConfig" WHERE "storeId"=\'s\'')).rows[0]).toEqual({bookingWindowDays:14,bookableUntilDate:null});expect(steamBookings).not.toHaveBeenCalled();
});
it("retains Steamfoot bookings and includes the full Taipei cutoff day",async()=>{
 await db.exec(`INSERT INTO "Booking" VALUES ('s','2030-10-01','23:59','CONFIRMED'),('other','2030-10-02','10:00','CONFIRMED');`);
 expect(await saveSteamBookingWindow({...receipt,values:{mode:"fixed",date:"2030-10-01"}})).toMatchObject({success:true,data:{date:"2030-10-01"}});
 await db.exec(`INSERT INTO "Booking" VALUES ('s','2030-10-02','00:00','CONFIRMED');`);
 expect(await saveSteamBookingWindow({...receipt,values:{mode:"fixed",date:"2030-09-30"},expectedRevision:JSON.stringify(["2030-10-01",14,null])})).toMatchObject({success:false,error:expect.stringContaining("已有預約")});
});
it.each([saveSteamBookingWindow,saveSpaBookingWindow])("creates absent config and reports post-commit cache failure as saved",async save=>{
 await db.exec(`DELETE FROM "ShopConfig" WHERE "storeId"='s'`);m.cache.mockImplementation(()=>{throw Error("cache failed");});
 expect(await save(receipt)).toMatchObject({success:true,data:{days:7},syncWarning:true});expect((await db.query('SELECT * FROM "ShopConfig" WHERE "storeId"=\'s\'')).rows).toHaveLength(1);
});
it("rejects permissions/module mismatch and keeps unknown transaction failures uncertain",async()=>{
 m.permission.mockRejectedValue(new AppError("FORBIDDEN","無權操作"));expect(await saveSpaBookingWindow(receipt)).toMatchObject({success:false,uncertain:false});expect(m.spaTx).not.toHaveBeenCalled();
 m.permission.mockResolvedValue({id:"u"});m.industry.mockResolvedValue("spa");expect(await saveSteamBookingWindow(receipt)).toMatchObject({success:false,uncertain:false});expect(m.steamTx).not.toHaveBeenCalled();
 m.spaTx.mockRejectedValue(Error("lost reply"));expect(await saveSpaBookingWindow(receipt)).toMatchObject({success:false,uncertain:true});
});
