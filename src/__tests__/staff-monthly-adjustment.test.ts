import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { adjustmentInput, adjustmentTotals } from "@/lib/staff-monthly-adjustment";
import { summarizeSettlement, type SettlementLine } from "@/lib/course-monthly-settlement";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),module:vi.fn(),music:vi.fn(),beauty:vi.fn(),feature:vi.fn(),client:{} as Record<string,unknown>}));
vi.mock("@/lib/db",()=>({prisma:m.client}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature}));
vi.mock("@/server/services/music-finance-access",()=>({requireMusicFinance:m.music}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/server/beauty/access",()=>({beautyManager:m.beauty}));
import { saveMonthlyAdjustment, deleteMonthlyAdjustment, changeAdjustmentMonthLock } from "@/server/actions/staff-monthly-adjustment";
import { readMonthlyAdjustments, readAdjustmentMonth } from "@/server/services/staff-monthly-adjustment";
const db=new PGlite();
let active:Pick<PGlite,"query">=db;
function sql(strings:TemplateStringsArray){return strings.reduce((q,s,i)=>q+(i?`$${i}`:"")+s,"");}
const raw=async(strings:TemplateStringsArray,...values:unknown[])=>(await active.query(sql(strings),values)).rows;
const exec=async(strings:TemplateStringsArray,...values:unknown[])=>(await active.query(sql(strings),values)).affectedRows;
const targetRoles=new Map<string,string>();
const tx={ $queryRaw:raw,$executeRaw:exec, staff:{findFirst:async({where}:{where:{id:string;storeId:string;status?:string}})=>(await active.query(`SELECT id FROM "Staff" WHERE id=$1 AND "storeId"=$2 AND ($3::text IS NULL OR status=$3)`,[where.id,where.storeId,where.status??null])).rows[0]?{id:where.id,user:{role:targetRoles.get(where.id)??"STAFF"}}:null}, auditLog:{create:async({data}:{data:unknown})=>{await active.query('INSERT INTO audit(data) VALUES ($1)',[JSON.stringify(data)]);}} };
Object.assign(m.client,tx,{$transaction:async(work:(t:typeof tx)=>Promise<unknown>)=>db.transaction(async t=>{active=t;try{return await work(tx);}finally{active=db;}})});
const input={id:"a3407c3e-4ed7-4b85-8a09-5aa4cb5ecdfa",expectedStoreId:"A",revision:0,staffId:"s1",month:"2026-11",date:"2026-11-04",direction:"ADD" as const,amount:2000,reason:"教學獎勵"};
beforeAll(async()=>{
 await db.exec(`CREATE TABLE "Store" (id text PRIMARY KEY,"operatingStatus" text); CREATE TABLE "Staff" (id text PRIMARY KEY,"storeId" text,status text,UNIQUE(id,"storeId")); CREATE TABLE "CourseMonthlySettlement" (id text,"storeId" text,month text); CREATE TABLE "BeautyTechnician" (id text,"storeId" text,active boolean,UNIQUE("storeId",id)); CREATE TABLE "BeautySettlement" (id text,"storeId" text,month text); CREATE TABLE audit(data jsonb);`);
 await db.exec(readFileSync(new URL("../../prisma/migrations/20261104120000_staff_monthly_adjustments/migration.sql",import.meta.url),"utf8"));
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{
 vi.resetAllMocks();targetRoles.clear();m.permission.mockResolvedValue({id:"owner",role:"OWNER"});m.store.mockResolvedValue("A");m.module.mockResolvedValue("steamfoot");m.beauty.mockResolvedValue({storeId:"A"});
 await db.exec(`TRUNCATE "BeautyTechnician","BeautySettlement","StaffMonthlyAdjustment","StaffAdjustmentMonth","CourseMonthlySettlement",audit,"Staff","Store"; INSERT INTO "Store" VALUES ('A','ACTIVE'),('B','ACTIVE'); INSERT INTO "Staff" VALUES ('s1','A','ACTIVE'),('s2','A','ACTIVE'),('foreign','B','ACTIVE');`);
});
it("validates actual dates, positive integers, required reason and direction",()=>{
 expect(adjustmentInput.safeParse(input).success).toBe(true);
 for(const change of [{date:"2026-02-30"},{amount:0},{amount:-500},{amount:1.5},{reason:" "},{direction:"OTHER"}])expect(adjustmentInput.safeParse({...input,...change}).success).toBe(false);
});
it("creates once on replay, edits once, moves month and soft-deletes with full audit",async()=>{
 expect((await saveMonthlyAdjustment(input)).success).toBe(true);
 expect((await saveMonthlyAdjustment(input)).success).toBe(true);
 expect(await readMonthlyAdjustments("A","2026-11")).toHaveLength(1);
 expect((await db.query('SELECT * FROM audit')).rows).toHaveLength(1);
 const changed={...input,revision:1,month:"2026-12",direction:"SUBTRACT",amount:500,reason:"出勤時數調整"};
 expect((await saveMonthlyAdjustment(changed)).success).toBe(true);
 expect((await saveMonthlyAdjustment(changed)).success).toBe(true);
 expect(await readMonthlyAdjustments("A","2026-11")).toHaveLength(0);
 expect(adjustmentTotals(await readMonthlyAdjustments("A","2026-12"))).toEqual({addition:0,deduction:500,net:-500});
 const deletion={id:input.id,expectedStoreId:"A",revision:2};
 expect((await deleteMonthlyAdjustment(deletion)).success).toBe(true);
 expect((await deleteMonthlyAdjustment(deletion)).success).toBe(true);
 expect(await readMonthlyAdjustments("A","2026-12")).toHaveLength(0);
 expect((await db.query('SELECT * FROM audit')).rows).toHaveLength(3);
 expect((await db.query('SELECT "deletedAt" FROM "StaffMonthlyAdjustment"')).rows[0]).toMatchObject({deletedAt:expect.any(Date)});
});
it("locks edits, deletion, insertion and moving from/to a confirmed month; reopens explicitly",async()=>{
 await saveMonthlyAdjustment(input);
 const lock=await readAdjustmentMonth("A",input.month);
 expect((await changeAdjustmentMonthLock({expectedStoreId:"A",month:input.month,revision:lock.revision,locked:true})).success).toBe(true);
 expect((await saveMonthlyAdjustment({...input,revision:1,amount:3000})).success).toBe(false);
 expect((await saveMonthlyAdjustment({...input,id:crypto.randomUUID()})).success).toBe(false);
 expect((await saveMonthlyAdjustment({...input,revision:1,month:"2026-12"})).success).toBe(false);
 expect((await deleteMonthlyAdjustment({id:input.id,expectedStoreId:"A",revision:1})).success).toBe(false);
 await db.exec(`INSERT INTO "StaffAdjustmentMonth" ("storeId",month,locked) VALUES ('A','2026-12',true)`);
 const now=await readAdjustmentMonth("A",input.month);
 expect((await changeAdjustmentMonthLock({expectedStoreId:"A",month:input.month,revision:now.revision,locked:false})).success).toBe(true);
 expect((await saveMonthlyAdjustment({...input,revision:1,month:"2026-12"})).success).toBe(false);
 expect((await saveMonthlyAdjustment({...input,revision:1,amount:2500})).success).toBe(true);
});
it("rejects stale edits and stale month completion after another adjustment",async()=>{
 await saveMonthlyAdjustment(input);
 expect((await saveMonthlyAdjustment({...input,amount:3000})).success).toBe(false);
 expect((await changeAdjustmentMonthLock({expectedStoreId:"A",month:input.month,revision:0,locked:true})).success).toBe(false);
});
it("blocks foreign store, switched store, insufficient role, feature and finance scope",async()=>{
 expect((await saveMonthlyAdjustment({...input,staffId:"foreign"})).success).toBe(false);
 expect((await saveMonthlyAdjustment({...input,expectedStoreId:"B"})).success).toBe(false);
 m.permission.mockResolvedValue({id:"staff",role:"STAFF"});expect((await saveMonthlyAdjustment(input)).success).toBe(false);
 m.permission.mockResolvedValue({id:"owner",role:"OWNER"});m.feature.mockRejectedValue(new Error("disabled"));expect((await saveMonthlyAdjustment(input)).success).toBe(false);
 m.feature.mockResolvedValue(undefined);m.module.mockResolvedValue("course");m.music.mockRejectedValue(new Error("scope"));expect((await saveMonthlyAdjustment(input)).success).toBe(false);
 expect(await readMonthlyAdjustments("A",input.month)).toHaveLength(0);
});
it("keeps legacy course confirmed months locked, permits manager and enforces composite FK",async()=>{
 m.module.mockResolvedValue("course");
 await db.exec(`INSERT INTO "CourseMonthlySettlement" VALUES ('old','A','2026-11')`);
 expect((await saveMonthlyAdjustment(input)).success).toBe(false);
 await db.exec('TRUNCATE "CourseMonthlySettlement"');
 m.permission.mockResolvedValue({id:"manager",role:"MANAGER"});expect((await saveMonthlyAdjustment(input)).success).toBe(true);
 await expect(db.query(`UPDATE "StaffMonthlyAdjustment" SET "staffId"='foreign'`)).rejects.toThrow();
});
it("rolls back adjustment when audit fails",async()=>{
 const audit=tx.auditLog.create;tx.auditLog.create=async()=>{throw new Error("audit unavailable");};
 try { expect((await saveMonthlyAdjustment(input)).success).toBe(false);expect(await readMonthlyAdjustments("A",input.month)).toHaveLength(0); } finally {tx.auditLog.create=audit;}
});
it("combines base, plus and minus without classifying adjustments as teaching fees",()=>{
 const base:SettlementLine={kind:"FEE",id:"base",staffId:"s1",name:"老師",label:"課程",date:input.date,amount:30000,paid:0,issue:null,payments:[]};
 const [p]=summarizeSettlement([base,{...base,id:"a",kind:"ADJUSTMENT",amount:2000},{...base,id:"b",kind:"ADJUSTMENT",amount:-800}]);
 expect(p).toMatchObject({fee:30000,addition:2000,deduction:800,adjustment:1200,remaining:31200});
});

it("supports independent beauty technician identities and same-store FK, with legacy month protection",async()=>{
 m.module.mockResolvedValue("beauty");
 await db.exec(`INSERT INTO "BeautyTechnician" VALUES ('tech','A',true),('foreign-tech','B',true),('inactive','A',false)`);
 expect((await saveMonthlyAdjustment({...input,staffId:"tech"})).success).toBe(true);
 expect((await saveMonthlyAdjustment({...input,staffId:"tech"})).success).toBe(true);
 expect((await db.query('SELECT "staffId","technicianId" FROM "StaffMonthlyAdjustment"')).rows).toEqual([{staffId:null,technicianId:"tech"}]);
 expect(await readMonthlyAdjustments("A","2026-11")).toMatchObject([{staffId:"tech",amount:2000}]);
 for(const staffId of ["s1","foreign-tech","inactive"])expect((await saveMonthlyAdjustment({...input,id:crypto.randomUUID(),staffId})).success).toBe(false);
 const lock=await readAdjustmentMonth("A","2026-11",undefined,"beauty");
 expect((await changeAdjustmentMonthLock({expectedStoreId:"A",month:"2026-11",revision:lock.revision,locked:true})).success).toBe(false);
 await db.exec(`INSERT INTO "BeautySettlement" VALUES ('old','A','2026-12')`);
 expect((await saveMonthlyAdjustment({...input,id:crypto.randomUUID(),month:"2026-12",staffId:"tech"})).success).toBe(false);
 expect((await saveMonthlyAdjustment({...input,revision:1,staffId:"tech",direction:"SUBTRACT",amount:300})).success).toBe(true);
 expect((await deleteMonthlyAdjustment({id:input.id,expectedStoreId:"A",revision:2})).success).toBe(true);
});
it("core migration does not require the optional beauty installation",async()=>{
 const core=new PGlite();try{
 await core.exec(`CREATE TABLE "Store" (id text PRIMARY KEY); CREATE TABLE "Staff" (id text,"storeId" text,UNIQUE(id,"storeId"));`);
 await core.exec(readFileSync(new URL("../../prisma/migrations/20261104120000_staff_monthly_adjustments/migration.sql",import.meta.url),"utf8"));
 expect((await core.query(`SELECT to_regclass('"StaffMonthlyAdjustment"') AS name`)).rows[0]).toMatchObject({name:"\"StaffMonthlyAdjustment\""});
 }finally{await core.close();}
});

it("enforces Owner/Manager/Staff hierarchy for both edits and deletion",async()=>{
 targetRoles.set("s1","OWNER");await saveMonthlyAdjustment(input);
 m.permission.mockResolvedValue({id:"manager",role:"MANAGER"});
 expect((await saveMonthlyAdjustment({...input,id:crypto.randomUUID()})).success).toBe(false);
 expect((await saveMonthlyAdjustment({...input,revision:1,staffId:"s2"})).success).toBe(false);
 expect((await deleteMonthlyAdjustment({id:input.id,expectedStoreId:"A",revision:1})).success).toBe(false);
 m.permission.mockResolvedValue({id:"owner",role:"OWNER"});targetRoles.set("s2","ADMIN");
 expect((await saveMonthlyAdjustment({...input,id:crypto.randomUUID(),staffId:"s2"})).success).toBe(false);
});
