import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),module:vi.fn(),staff:vi.fn(),terms:vi.fn(),preview:vi.fn(),visibility:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.store}));
vi.mock("@/lib/industry-module-server",()=>({requireSteamfootStore:m.module}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findMany:m.staff}}}));
vi.mock("@/lib/manager-visibility",()=>({getManagerReadFilter:m.visibility}));
vi.mock("@/server/services/steamfoot-rent",()=>({readRentTerms:m.terms}));
vi.mock("@/server/queries/staff-settlement",()=>({previewStaffSettlement:m.preview}));
import { readSteamfootMonthly } from "@/server/queries/steamfoot-monthly";
const person = (id:string,status="ACTIVE")=>({id,displayName:id,status,isOwner:false,monthlySpaceFee:5000,spaceFeeEnabled:true,user:{role:"PARTNER"}});
beforeEach(()=>{
 vi.clearAllMocks();m.permission.mockResolvedValue({role:"OWNER",staffId:"owner"});m.store.mockResolvedValue("s");m.module.mockResolvedValue(undefined);m.visibility.mockReturnValue({storeId:"s"});
 m.staff.mockResolvedValue([person("a"),person("b"),person("c","INACTIVE")]);
 m.preview.mockResolvedValue({summary:[{staffId:"a",countedAmount:12000,totalCount:4,needsReviewCount:1}],details:[{bookingId:"one",revenueStaffId:"a"},{bookingId:"house",revenueStaffId:null}]});
 m.terms.mockResolvedValue([{id:"r",staffId:"a",startMonth:"2026-07",endMonth:null,cycleMonths:6,monthlyAmount:5000,enabled:true}]);
});
describe("monthly service and rent separation",()=>{
 it("retains service amount without subtracting rent; includes staff with no service",async()=>{
  const result=await readSteamfootMonthly("s","2026-09");
  expect(result.people).toHaveLength(2);
  expect(result.people[0].summary?.countedAmount).toBe(12000);
  expect(result.people[0].rent?.total).toBe(30000);
  expect(result.people[1].rentLabel).toBe("待設定租期");
  expect(result.people[1].rent).toBeNull();
  expect(result.unassigned).toHaveLength(1);
  expect(m.preview).toHaveBeenCalledWith({activeStoreId:"s",startDate:"2026-09-01",endDate:"2026-09-30"});
 });
 it("includes disabled staff with an ongoing agreement",async()=>{
  m.terms.mockResolvedValue([{id:"r",staffId:"c",startMonth:"2026-07",endMonth:null,cycleMonths:6,monthlyAmount:5000,enabled:true}]);
  expect((await readSteamfootMonthly("s","2026-09")).people.find(p=>p.id==="c")?.rent?.total).toBe(30000);
 });
 it("scopes staff and agreements under SELF_ONLY visibility",async()=>{
  m.visibility.mockReturnValue({storeId:"s",staffId:"owner"});
  await readSteamfootMonthly("s","2026-09");
  expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"s",id:"owner"}}));
  expect(m.terms).toHaveBeenCalledWith("s","owner");
 });
 it.each(["PARTNER","CUSTOMER"])("rejects %s monthly access",async role=>{
  m.permission.mockResolvedValue({role});
  await expect(readSteamfootMonthly("s","2026-09")).rejects.toThrow();expect(m.preview).not.toHaveBeenCalled();
 });
 it("rejects a caller-provided foreign store",async()=>{
  await expect(readSteamfootMonthly("other","2026-09")).rejects.toThrow();expect(m.staff).not.toHaveBeenCalled();
 });
});
