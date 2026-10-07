import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(()=>({ customers:vi.fn(), stores:vi.fn(), bookings:vi.fn(), staff:vi.fn(), plans:vi.fn(), spaBookings:vi.fn() }));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.customers},store:{findMany:m.stores},booking:{findMany:m.bookings},staff:{findMany:m.staff},servicePlan:{findMany:m.plans}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{spaBooking:{findMany:m.spaBookings}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/permissions",()=>({PERMISSION_LABELS:{"audit.read":"查看操作紀錄"}}));
import { resolveAuditPresentation } from "@/server/services/audit-presentation";
import { auditChanges } from "@/lib/audit-presentation";
beforeEach(()=>{vi.clearAllMocks();Object.values(m).forEach(fn=>fn.mockResolvedValue([]));});
it("explains legacy granted and denied permission snapshots observed in Preview", async()=>{
  const row={id:"a",storeId:"own",targetType:"StaffPermission",targetId:"staff",action:"UPDATE",afterJson:{granted:["audit.read"],denied:["future.a","future.b"]}};
  const result=await resolveAuditPresentation([row]);
  expect(result.get("a")?.references["permission:audit.read"]).toBe("查看操作紀錄");
  expect(auditChanges(null,row.afterJson,result.get("a")?.references)).toEqual([{label:"",before:"",after:"異動內容未記錄"}]);
});
it("never resolves a snapshot's customer outside the evidence store",async()=>{
  await resolveAuditPresentation([{id:"a",storeId:"own",targetType:"Customer",targetId:"foreign",action:"UPDATE",afterJson:{customerId:"foreign"}}]);
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({where:{OR:[{id:"foreign",storeId:"own"}]}}));
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"own",id:{in:["foreign"]}}}));
  expect(m.stores).toHaveBeenCalledWith(expect.objectContaining({where:{id:{in:["own"]}}}));
});
it("labels current record context and uses saved names first",async()=>{
  m.customers.mockResolvedValue([{id:"c",storeId:"own",name:"改名後"}]);
  const result=await resolveAuditPresentation([
    {id:"a",storeId:"own",targetType:"Customer",targetId:"c",action:"UPDATE",afterJson:{name:"原名"}},
    {id:"b",storeId:"own",targetType:"Customer",targetId:"c",action:"UPDATE"},
  ]);
  expect(result.get("a")?.target).toBe("顧客資料 · 原名");
  expect(result.get("b")?.target).toBe("顧客資料 · 改名後（目前資料）");
});
it("does not guess names for missing or unscoped legacy evidence",async()=>{
  const result=await resolveAuditPresentation([{id:"a",storeId:null,targetType:"Customer",targetId:"secret",action:"UPDATE"}]);
  expect(m.customers).not.toHaveBeenCalled();
  expect(result.get("a")?.target).toContain("舊紀錄未保存辨識內容");
  expect(result.get("a")?.target).not.toContain("secret");
});
it("batches a page of bookings instead of querying each row",async()=>{
  const rows=Array.from({length:50},(_,i)=>({id:`a${i}`,storeId:"own",targetType:"Booking",targetId:`b${i}`,action:"UPDATE"}));
  await resolveAuditPresentation(rows);
  expect(m.bookings).toHaveBeenCalledTimes(1);
  expect(m.bookings.mock.calls[0][0].where.OR).toHaveLength(50);
});

it("resolves a cross-store view name only when the caller has HQ authority",async()=>{
  const row={id:"a",storeId:"own",targetType:"StoreView",targetId:"own",action:"HQ_VIEW_STORE",beforeJson:{viewedStoreId:"previous"}};
  await resolveAuditPresentation([row]);
  expect(m.stores.mock.calls[0][0].where.id.in).toEqual(["own"]);
  m.stores.mockClear();
  await resolveAuditPresentation([row],{hq:true});
  expect(m.stores.mock.calls[0][0].where.id.in).toEqual(["own","previous"]);
});

it("reads SPA target names only with the exact authorized store and target, without legacy booking reads",async()=>{
  await resolveAuditPresentation([{id:"a",storeId:"spa-own",targetType:"SpaBooking",targetId:"spa-booking",action:"UPDATE"}]);
  expect(m.spaBookings).toHaveBeenCalledWith(expect.objectContaining({where:{OR:[{id:"spa-booking",storeId:"spa-own"}]}}));
  expect(m.bookings).not.toHaveBeenCalled();
});
