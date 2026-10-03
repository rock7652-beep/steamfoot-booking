import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission:vi.fn(), store:vi.fn(), module:vi.fn(), terms:vi.fn(), raw:vi.fn(), write:vi.fn(), staff:vi.fn(), transaction:vi.fn() }));
vi.mock("@/lib/permissions",()=>({requirePermission:mocks.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:mocks.store}));
vi.mock("@/lib/industry-module-server",()=>({requireSteamfootStore:mocks.module}));
vi.mock("@/server/services/steamfoot-rent",()=>({readRentTerms:mocks.terms}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/date-utils",()=>({toLocalMonthStr:()=>"2026-09"}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:mocks.transaction}}));
import { saveSteamfootRent } from "@/server/actions/steamfoot-rent";
import { AppError } from "@/lib/errors";
const input = {staffId:"p",startMonth:"2026-07",cycleMonths:6,monthlyAmount:5000,enabled:true,expectedTermId:null};
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.permission.mockResolvedValue({id:"owner",role:"OWNER",staffId:"owner-staff",storeId:"s"});
 mocks.store.mockResolvedValue("s");mocks.module.mockResolvedValue(undefined);mocks.terms.mockResolvedValue([]);
 mocks.staff.mockResolvedValue({id:"p",isOwner:false,user:{role:"PARTNER"}});
 mocks.transaction.mockImplementation(fn=>fn({$queryRaw:mocks.raw,$executeRaw:mocks.write,staff:{findFirst:mocks.staff}}));
});
describe("rent write boundaries",()=>{
 it("writes only a rent agreement scoped to the staff's store",async()=>{
  expect(await saveSteamfootRent(input)).toEqual({success:true});
  expect(mocks.permission).toHaveBeenCalledWith("staff.manage");
  expect(mocks.staff).toHaveBeenCalledWith(expect.objectContaining({where:{id:"p",storeId:"s"}}));
  expect(mocks.raw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
  expect(mocks.write).toHaveBeenCalledTimes(1);
  expect(mocks.write.mock.calls[0][0].join("")).toContain('INSERT INTO "StaffRentTerm"');
 });
 it.each(["PARTNER","CUSTOMER"])("rejects %s even with a supplied permission",async role=>{
  mocks.permission.mockResolvedValue({role});
  expect((await saveSteamfootRent(input)).success).toBe(false);expect(mocks.transaction).not.toHaveBeenCalled();
 });
 it("rejects staff from another store",async()=>{
  mocks.staff.mockResolvedValue(null);
  expect((await saveSteamfootRent(input)).success).toBe(false);expect(mocks.write).not.toHaveBeenCalled();
 });
 it("rejects view-mode or non-Steamfoot writes",async()=>{
  mocks.module.mockRejectedValue(new AppError("FORBIDDEN","wrong module"));
  expect((await saveSteamfootRent(input)).success).toBe(false);expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.module.mockResolvedValue(undefined);mocks.store.mockRejectedValue(new AppError("FORBIDDEN","read-only"));
  expect((await saveSteamfootRent(input)).success).toBe(false);expect(mocks.transaction).not.toHaveBeenCalled();
 });
 it("rejects duplicate first setup after another request wins the lock",async()=>{
  mocks.terms.mockResolvedValue([{...input,id:"saved",endMonth:null}]);
  expect((await saveSteamfootRent(input)).success).toBe(false);expect(mocks.write).not.toHaveBeenCalled();
 });
 it("cannot overwrite the current six-month agreement",async()=>{
  mocks.terms.mockResolvedValue([{...input,id:"saved",endMonth:null}]);
  expect((await saveSteamfootRent({...input,expectedTermId:"saved",startMonth:"2026-10"})).success).toBe(false);
  expect(mocks.write).not.toHaveBeenCalled();
 });
});
