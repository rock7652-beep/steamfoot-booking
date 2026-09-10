import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),context:vi.fn(),staff:vi.fn(),module:vi.fn(),transaction:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store-context",()=>({getStoreContext:m.context}));
vi.mock("@/lib/industry-module-server",()=>({requireSpaStore:m.module}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findFirst:m.staff}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:m.transaction}}));
import {saveSpaLocation,saveSpaStaffSchedule} from "@/server/actions/spa-resources";
describe("SPA resource authorization and validation",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({id:"user",role:"OWNER"});m.context.mockResolvedValue({storeId:"test-store"});m.staff.mockResolvedValue({id:"staff"});m.module.mockResolvedValue(undefined);});
 it("rejects another store's requested context before any SPA write",async()=>{m.staff.mockResolvedValue(null);const r=await saveSpaLocation({name:"床1",isActive:true,treatmentIds:[]});expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();});
 it("rejects non-SPA stores before any write",async()=>{m.module.mockRejectedValue(new Error("wrong module"));const r=await saveSpaLocation({name:"床1",isActive:true,treatmentIds:[]});expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();});
 it("rejects reversed shifts before mutation",async()=>{const r=await saveSpaStaffSchedule({staffId:"staff",skillIds:[],shifts:[{dayOfWeek:1,startTime:"18:00",endTime:"10:00"}]});expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();});
 it("rejects duplicate weekdays instead of silently replacing shifts",async()=>{const r=await saveSpaStaffSchedule({staffId:"staff",skillIds:[],shifts:[{dayOfWeek:1,startTime:"10:00",endTime:"12:00"},{dayOfWeek:1,startTime:"13:00",endTime:"18:00"}]});expect(r.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();});
});

describe("SPA calendar roster write safety",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({id:"user",role:"OWNER"});m.context.mockResolvedValue({storeId:"test-store"});m.staff.mockResolvedValue({id:"staff"});m.module.mockResolvedValue(undefined);});
 it("rejects overlapping date shifts before any mutation",async()=>{
  const {saveSpaDateRoster}=await import("@/server/actions/spa-resources");
  const result=await saveSpaDateRoster({staffId:"staff",date:"2026-09-11",shifts:[{startTime:"10:00",endTime:"14:00"},{startTime:"13:00",endTime:"18:00"}]});
  expect(result.success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
 });
 it("retains the roster when a new break would intersect an existing booking",async()=>{
  const remove=vi.fn();m.transaction.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),spaBooking:{findMany:vi.fn().mockResolvedValue([{startTime:"12:30",endTime:"14:30"}])},spaStaffAvailabilityException:{deleteMany:remove,createMany:vi.fn()}}));
  const {saveSpaDateRoster}=await import("@/server/actions/spa-resources");
  const result=await saveSpaDateRoster({staffId:"staff",date:"2026-09-11",shifts:[{startTime:"10:00",endTime:"13:00"},{startTime:"14:00",endTime:"18:00"}]});
  expect(result.success).toBe(false);expect(remove).not.toHaveBeenCalled();
 });
 it("scopes date replacement to the authorized store, staff and date",async()=>{
  const remove=vi.fn(),create=vi.fn();m.transaction.mockImplementation(async fn=>fn({$executeRaw:vi.fn(),spaBooking:{findMany:vi.fn().mockResolvedValue([])},spaStaffAvailabilityException:{deleteMany:remove,createMany:create}}));
  const {saveSpaDateRoster}=await import("@/server/actions/spa-resources");
  const result=await saveSpaDateRoster({staffId:"staff",date:"2026-09-11",shifts:[]});
  expect(result.success).toBe(true);expect(remove).toHaveBeenCalledWith({where:{storeId:"test-store",staffId:"staff",date:new Date("2026-09-11T00:00:00Z")}});
  expect(create.mock.calls[0][0].data).toEqual([expect.objectContaining({storeId:"test-store",staffId:"staff",type:"UNAVAILABLE",startTime:"00:00",endTime:"24:00"})]);
 });
});
