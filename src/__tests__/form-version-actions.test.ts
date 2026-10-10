import {beforeEach,it,expect,vi} from "vitest";
import {AppError} from "@/lib/errors";
import {coursePlanSnapshot} from "@/lib/course-plan-snapshot";
const m=vi.hoisted(()=>({guard:vi.fn(),subscription:vi.fn(),access:vi.fn(),compareCustomer:vi.fn(),comparePlan:vi.fn(),compareSpa:vi.fn(),compareCourse:vi.fn(),customer:vi.fn(),plan:vi.fn(),legacy:vi.fn(),refresh:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.refresh,updateTag:vi.fn(),unstable_cache:(f:unknown)=>f}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.guard,requirePermission:m.guard}));
vi.mock("@/lib/session",()=>({requireStaffSession:m.guard,requireSession:m.guard}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:m.subscription}));
vi.mock("@/lib/manager-visibility",()=>({assertStoreAccess:m.access,getStoreFilter:()=>({storeId:"s"})}));
vi.mock("@/lib/feature-gate",()=>({checkCurrentStoreFeature:vi.fn()}));
vi.mock("@/lib/revalidation",()=>({revalidatePlans:m.refresh}));
vi.mock("@/server/actions/spa-resources",()=>({spaResourceStore:async()=>{await m.guard();return "s";}}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:async()=>null},customer:{findUnique:m.customer,findFirst:vi.fn(),updateMany:m.compareCustomer,update:m.legacy},servicePlan:{findUnique:m.plan,findFirst:vi.fn(),updateMany:m.comparePlan,update:m.legacy},storeModuleInstallation:{findUnique:async()=>({status:"ACTIVE"})}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$transaction:async(f:(tx:unknown)=>unknown)=>f({$executeRaw:vi.fn(),spaTreatment:{findFirst:async()=>({id:"t"})},spaPackage:{findFirst:m.plan,updateMany:m.compareSpa,update:m.legacy}})}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseTemplate:{count:async()=>1}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:async()=>{await m.guard();return {storeId:"s"};},courseTransaction:async(s:string,f:(tx:unknown)=>unknown)=>f({coursePointPlan:{findFirst:m.plan,updateMany:m.compareCourse}})}));
vi.mock("@/server/services/course-term",()=>({validateCourseTerm:async()=>[]}));
vi.mock("@/server/services/course-low-balance-schedule",()=>({scheduleCourseLowBalanceCheck:vi.fn()}));
vi.mock("@/server/services/course-assignment-checkout",()=>({assignCourseWithCheckout:vi.fn()}));
vi.mock("@/server/services/course-booking",()=>({}));
import {updateCustomer} from "@/server/actions/customer";
import {updatePlan} from "@/server/actions/plan";
import {saveSpaPackage} from "@/server/actions/spa-commerce";
import {saveCourseCustomer,saveCoursePointPlan} from "@/server/actions/course-members";
const stamp="2026-09-27T00:00:00.000Z";
const profile={name:"顧客",phone:"0912345678",expectedUpdatedAt:stamp};
const pack={id:"p",treatmentId:"t",name:"方案",price:100,uses:10,validityDays:90,isActive:true,expectedUpdatedAt:stamp};
const course={name:"課程方案",points:10,price:1000,validDays:90,isActive:true,unit:"SESSION",templateIds:[],termSessionIds:[]};
beforeEach(()=>{vi.resetAllMocks();m.guard.mockResolvedValue({id:"u",storeId:"s",role:"OWNER"});m.customer.mockResolvedValue({id:"c",storeId:"s",phone:profile.phone});m.plan.mockResolvedValue({...course,id:"p",storeId:"s",updatedAt:new Date(stamp)});for(const fn of [m.compareCustomer,m.comparePlan,m.compareSpa,m.compareCourse])fn.mockResolvedValue({count:1});});
it("customer forms compare the original version atomically inside the authorized store",async()=>{
 expect((await updateCustomer("c",profile)).success).toBe(true);
 expect(m.compareCustomer.mock.calls[0][0].where).toEqual({id:"c",storeId:"s",updatedAt:new Date(stamp)});expect(m.legacy).not.toHaveBeenCalled();
});
it("steamfoot plan edits compare versions and return the actual new version",async()=>{
 const result=await updatePlan("p",{price:200,expectedUpdatedAt:stamp});expect(result.success).toBe(true);
 const call=m.comparePlan.mock.calls[0][0];expect(call.where).toEqual({id:"p",storeId:"s",updatedAt:new Date(stamp)});expect(result).toMatchObject({data:{updatedAt:call.data.updatedAt.toISOString()}});expect(call.data).not.toHaveProperty("expectedUpdatedAt");
});
it("SPA and course retain their own stores and conflict predicates",async()=>{
 expect((await saveSpaPackage(pack)).success).toBe(true);expect(m.compareSpa.mock.calls[0][0].where).toEqual({id:"p",storeId:"s",updatedAt:new Date(stamp)});
 expect((await saveCourseCustomer({id:"c",...profile})).success).toBe(true);expect(m.compareCustomer.mock.calls[0][0].where).toMatchObject({id:"c",storeId:"s",updatedAt:new Date(stamp),mergedIntoCustomerId:null});
 const snapshot=coursePlanSnapshot(course);
 expect((await saveCoursePointPlan({id:"p",...course,expectedSnapshot:JSON.stringify(snapshot)})).success).toBe(true);expect(m.compareCourse.mock.calls[0][0].where).toMatchObject({id:"p",storeId:"s",price:1000,templateIds:{equals:[]},termSessionIds:{equals:[]}});
});
it.each(["customer","plan","spa","courseCustomer","coursePlan"])("rejects %s conflicts without a legacy overwrite or refresh",async(kind)=>{
 for(const fn of [m.compareCustomer,m.comparePlan,m.compareSpa,m.compareCourse])fn.mockResolvedValue({count:0});
 const call={customer:()=>updateCustomer("c",profile),plan:()=>updatePlan("p",{expectedUpdatedAt:stamp}),spa:()=>saveSpaPackage(pack),courseCustomer:()=>saveCourseCustomer({id:"c",...profile}),coursePlan:()=>saveCoursePointPlan({id:"p",...course,expectedSnapshot:JSON.stringify(coursePlanSnapshot(course))})}[kind]!;
 expect((await call()).success).toBe(false);expect(m.legacy).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();
});
it("permission or store denial prevents all versioned writes",async()=>{
 m.guard.mockRejectedValue(new AppError("FORBIDDEN","不可編輯"));expect((await updatePlan("p",{expectedUpdatedAt:stamp})).success).toBe(false);expect((await saveSpaPackage(pack)).success).toBe(false);expect((await saveCourseCustomer({id:"c",...profile})).success).toBe(false);
 m.guard.mockResolvedValue({id:"u",storeId:"s"});m.access.mockImplementation(()=>{throw new AppError("FORBIDDEN","跨店");});expect((await updateCustomer("c",profile)).success).toBe(false);
 for(const fn of [m.compareCustomer,m.comparePlan,m.compareSpa,m.compareCourse])expect(fn).not.toHaveBeenCalled();
});
