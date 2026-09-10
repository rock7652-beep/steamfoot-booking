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
