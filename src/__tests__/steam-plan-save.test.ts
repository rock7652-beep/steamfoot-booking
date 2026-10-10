import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),feature:vi.fn(),session:vi.fn(),writable:vi.fn(),transaction:vi.fn(),find:vi.fn(),create:vi.fn(),update:vi.fn(),tag:vi.fn()}));
vi.mock("next/cache",()=>({revalidateTag:m.tag,revalidatePath:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/lib/session",()=>({requireStaffSession:m.session}));
vi.mock("@/lib/feature-gate",()=>({checkCurrentStoreFeature:m.feature}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:m.writable}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
import {saveSteamPlan} from "@/server/services/steam-plan-save";
import {z} from "zod";
const values={name:"課程卡",category:"PACKAGE",price:1000,sessionCount:10,validityDays:90};
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
let row:Record<string,unknown>|null;
beforeEach(()=>{vi.resetAllMocks();row=null;m.session.mockResolvedValue({storeId:"store"});m.find.mockImplementation(async({where})=>where.id?.not?null:row);m.create.mockImplementation(async({data})=>row={description:null,sortOrder:0,...data,createdAt:new Date("2026-10-10T00:00:00Z"),updatedAt:new Date("2026-10-10T00:00:00Z"),_count:{wallets:0}});m.update.mockImplementation(async({data})=>{row={...row,...data,updatedAt:new Date("2026-10-10T01:00:00Z")};return {count:1};});m.transaction.mockImplementation(async work=>work({$queryRaw:vi.fn(),servicePlan:{findFirst:m.find,findFirstOrThrow:m.find,create:m.create,updateMany:m.update}}));});
it("returns the real plan, keeps downstream cuid compatibility and confirms create retries",async()=>{
 const input={operation:"CREATE",values,...receipt};const first=await saveSteamPlan(input);expect(first).toMatchObject({success:true,data:{storeId:"store",price:1000}});expect(z.string().cuid().safeParse(row!.id).success).toBe(true);
 expect(await saveSteamPlan(input)).toEqual(first);expect(m.create).toHaveBeenCalledTimes(1);expect((await saveSteamPlan({...input,values:{...values,price:2000}})).success).toBe(false);
});
it("confirms an applied edit, rejects stale edits and preserves category",async()=>{
 await saveSteamPlan({operation:"CREATE",values,...receipt});const input={operation:"UPDATE",id:row!.id,values:{price:2000,expectedUpdatedAt:"2026-10-10T00:00:00.000Z"},...receipt};const first=await saveSteamPlan(input);
 expect(first).toMatchObject({success:true,data:{price:2000,category:"PACKAGE"}});expect(await saveSteamPlan(input)).toEqual(first);expect(m.update).toHaveBeenCalledTimes(1);
 expect((await saveSteamPlan({...input,values:{...input.values,price:3000}})).success).toBe(false);expect(m.update).toHaveBeenCalledTimes(1);
});
it("guards store, rights, feature and subscription before writes; keeps committed cache failures successful",async()=>{
 const input={operation:"CREATE",values,...receipt};expect((await saveSteamPlan({...input,expectedStoreId:"other"})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
 m.permission.mockRejectedValueOnce(new Error("denied"));expect((await saveSteamPlan(input)).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
 m.tag.mockImplementation(()=>{throw new Error("cache failed");});expect(await saveSteamPlan(input)).toMatchObject({success:true,syncWarning:true});expect(m.feature).toHaveBeenCalled();expect(m.writable).toHaveBeenCalledWith("store");
});
