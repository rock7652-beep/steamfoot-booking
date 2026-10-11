// @vitest-environment jsdom
import {act,createElement} from "react";
import {readFileSync} from "node:fs";
import {Blob as NodeBlob,File as NodeFile} from "node:buffer";
import {createRoot} from "react-dom/client";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),staff:vi.fn(),raw:vi.fn(),receipt:vi.fn(),record:vi.fn(),conflict:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseManagerRead:m.manager}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction,staff:{findFirst:m.staff},$queryRaw:m.raw}}));
vi.mock("@/server/services/course-availability",()=>({listOutsideTeacherAvailability:async()=>[],assertExistingTeacherAvailability:m.conflict}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/teachers"}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {saveCourseAvailabilityConfirmed,getCourseStaffAvailability} from "@/server/actions/course-availability";
import {CourseStaffAvailabilityEditor} from "@/app/(dashboard)/dashboard/courses/course-staff-availability-editor";
import {AppError} from "@/lib/errors";
let db:PGlite,client:Pick<PGlite,"query">;
const raw=async(s:TemplateStringsArray,...values:unknown[])=>{const sql=s.reduce((r,p,i)=>r+(i?`$${i}`:"")+p,"");const rows=(await client.query<Record<string,unknown>>(sql,values)).rows;for(const r of rows)if(typeof r.date==="string")r.date=new Date(r.date);return rows;};
beforeAll(async()=>{vi.stubGlobal("Blob",NodeBlob);vi.stubGlobal("File",NodeFile);db=new PGlite({fsBundle:new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob,pgliteWasmModule:await WebAssembly.compile(readFileSync("node_modules/@electric-sql/pglite/dist/pglite.wasm")),initdbWasmModule:await WebAssembly.compile(readFileSync("node_modules/@electric-sql/pglite/dist/initdb.wasm"))});client=db;await db.exec(`CREATE TABLE "Store" (id text primary key);INSERT INTO "Store" VALUES ('s');CREATE TABLE "CourseStaffAvailability" (id text,"storeId" text,"staffId" text,"dayOfWeek" int,segments jsonb,"createdAt" timestamp,"updatedAt" timestamp);CREATE TABLE "CourseStaffAvailabilityException" (id text,"storeId" text,"staffId" text,date date,type text,segments jsonb,reason text,"createdAt" timestamp,"updatedAt" timestamp,unique("storeId","staffId",date));CREATE TABLE "AuditLog" (id text primary key,"actorUserId" text,"targetId" text,"targetType" text,action text,"afterJson" jsonb);`);});
afterAll(async()=>db.close());beforeEach(async()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:"s",user:{id:"owner"}});m.staff.mockResolvedValue({id:"p",courseCoachEnabled:true});m.raw.mockImplementation(raw);m.conflict.mockReset();await db.exec('TRUNCATE "CourseStaffAvailability","CourseStaffAvailabilityException","AuditLog"');m.transaction.mockImplementation(async(work:(tx:unknown)=>unknown)=>db.transaction(async c=>{client=c;try{return await work({staff:{findFirst:m.staff},$queryRaw:raw,$executeRaw:raw,auditLog:{findUnique:async({where}:{where:{id:string}})=>(await client.query('SELECT * FROM "AuditLog" WHERE id=$1',[where.id])).rows[0]??null,create:async({data}:{data:{id:string;actorUserId:string;targetId:string;targetType:string;action:string;afterJson:unknown}})=>client.query('INSERT INTO "AuditLog" VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[data.id,data.actorUserId,data.targetId,data.targetType,data.action,JSON.stringify(data.afterJson)])}});}finally{client=db;}}));});
async function input(kind="weekly",values:Record<string,unknown>={staffId:"p",inheritStoreHours:false,days:[{dayOfWeek:1,periods:[{openTime:"09:00",closeTime:"12:00"}]}]}){return {kind,values,expectedStoreId:"s",expectedRevision:(await getCourseStaffAvailability("p")).revision,requestKey:crypto.randomUUID()};}
it("returns authority for all seven weekdays, with a changed revision; retry performs no additional write",async()=>{
 const receipt=await input(),result=await saveCourseAvailabilityConfirmed(receipt);expect(result).toMatchObject({success:true,storeId:"s",data:{inheritStoreHours:false,weekly:expect.arrayContaining([{dayOfWeek:1,periods:[{openTime:"09:00",closeTime:"12:00"}]}])}});if(!result.success)throw Error("no receipt");expect(result.data.revision).not.toBe(receipt.expectedRevision);expect((await db.query('SELECT count(*) FROM "CourseStaffAvailability"')).rows).toEqual([{count:7}]);expect(await saveCourseAvailabilityConfirmed(receipt)).toMatchObject({success:true});expect((await db.query('SELECT count(*) FROM "AuditLog"')).rows).toEqual([{count:1}]);
});
it("rejects stale versions and switched stores before changing availability",async()=>{
 const receipt=await input();expect(await saveCourseAvailabilityConfirmed({...receipt,expectedRevision:"f".repeat(64)})).toMatchObject({success:false,uncertain:false});expect(await saveCourseAvailabilityConfirmed({...receipt,expectedStoreId:"other"})).toMatchObject({success:false});expect((await db.query('SELECT count(*) FROM "CourseStaffAvailability"')).rows).toEqual([{count:0}]);
});
it("rolls back an exception when an existing class conflicts, then returns a committed exception without an extra client read",async()=>{
 const receipt=await input("exception",{staffId:"p",date:"2030-10-10",type:"UNAVAILABLE",reason:"請假",periods:[]});m.conflict.mockRejectedValueOnce(new AppError("CONFLICT","已排課程衝突"));expect(await saveCourseAvailabilityConfirmed(receipt)).toMatchObject({success:false});expect((await db.query('SELECT count(*) FROM "CourseStaffAvailabilityException"')).rows).toEqual([{count:0}]);expect(await saveCourseAvailabilityConfirmed(receipt)).toMatchObject({success:true,data:{exceptions:[{date:"2030-10-10",type:"UNAVAILABLE",reason:"請假"}]}});
});

// Bridge the real editor and save action through actual SQL, with synthetic
// authorization/Prisma adapters. No HTTP, session, Supabase, or advisory-lock
// integration is claimed by this single-connection PGlite harness.
it.each([false,true])("editor confirms committed SQL and survives remount (lost response: %s)",async(lostResponse)=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);
 let root=createRoot(host);
 const payloads:unknown[]=[];
 const transport=vi.fn(async(_url:unknown,init:RequestInit)=>{
  const payload=JSON.parse(init.body as string);payloads.push(payload);
  const result=await saveCourseAvailabilityConfirmed(payload);
  if(lostResponse&&payloads.length===1)throw Error("response lost after commit");
  return {json:async()=>result};
 });
 vi.stubGlobal("fetch",transport);
 const render=async()=>act(async()=>root.render(createElement(CourseStaffAvailabilityEditor,{storeId:"s",staffId:"p",fitness:true})));
 const click=async(label:string)=>act(async()=>{
  const button=[...host.querySelectorAll("button")].find(b=>b.textContent===label);
  expect(button).toBeTruthy();button!.click();
 });
 try{
  await render();
  const date=host.querySelector<HTMLInputElement>('input[type="date"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(date,"2030-10-10");date.dispatchEvent(new Event("input",{bubbles:true}));});
  await click("儲存單日例外");
  if(lostResponse){
   expect(host.textContent).toContain("尚未確認儲存結果");
   await click("重試確認儲存結果");
   expect(payloads[1]).toEqual(payloads[0]);
  }
  expect(host.textContent).toContain("2030-10-10 · 不可授課");
  expect((await db.query('SELECT count(*) FROM "CourseStaffAvailabilityException"')).rows).toEqual([{count:1}]);
  expect((await db.query('SELECT count(*) FROM "AuditLog"')).rows).toEqual([{count:1}]);
  expect(transport).toHaveBeenCalledTimes(lostResponse?2:1);
  await act(async()=>root.unmount());root=createRoot(host);
  await render();expect(host.textContent).toContain("2030-10-10 · 不可授課");
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
