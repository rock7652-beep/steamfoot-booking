import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),reserve:vi.fn(),collect:vi.fn(),voidPayment:vi.fn(),settings:vi.fn(),upsert:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/revalidation",()=>({revalidateShopConfig:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{shopConfig:{upsert:m.upsert}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/server/services/course-booking",()=>({reserveTrialCourse:m.reserve}));
vi.mock("@/server/services/course-trial-payment",()=>({collectCourseTrialInTransaction:m.collect,voidCourseTrialInTransaction:m.voidPayment}));
vi.mock("@/lib/shop-config",()=>({getTrialSettings:m.settings,clampTrialTotal:(price:number)=>price??499}));
import {collectCourseTrial,createCourseTrial,saveCourseTrialSettings,voidCourseTrialPayment} from "@/server/actions/course-trial";
const key="f34a8337-9380-4bc4-b218-c450bb3c7aca";
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"authorized-store",user:{id:"manager",name:"店長"}});m.transaction.mockImplementation(async(_store,work)=>work({}));m.settings.mockResolvedValue({trialEnabled:true,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000});});
it("uses the authenticated store and does not accept caller attendance or store overrides",async()=>{
 const result=await collectCourseTrial({bookingId:"trial",requestKey:key,amount:499,paymentMethod:"CASH",storeId:"other",completeService:true});
 expect(result.success).toBe(true);expect(m.manager).toHaveBeenCalledWith("trial.confirm");
 expect(m.transaction).toHaveBeenCalledWith("authorized-store",expect.any(Function));
 expect(m.collect.mock.calls[0][1]).toEqual({storeId:"authorized-store",userId:"manager"});
 expect(m.collect.mock.calls[0][2]).not.toHaveProperty("completeService");expect(m.collect.mock.calls[0][2]).not.toHaveProperty("storeId");
});
it("denies correction before writing if transaction void permission is absent",async()=>{
 m.manager.mockImplementation(async permission=>{if(permission==="transaction.void")throw new Error("permission denied");return {storeId:"s",user:{id:"manager"}};});
 expect((await collectCourseTrial({bookingId:"trial",requestKey:key,amount:450,paymentMethod:"CASH",originalPaymentId:"old",reason:"更正"})).success).toBe(false);
 expect(m.transaction).not.toHaveBeenCalled();
});
it("requires create permissions and respects a disabled trial setting",async()=>{
 m.settings.mockResolvedValue({trialEnabled:false});
 expect((await createCourseTrial({sessionId:"class",customerId:"learner",requestKey:key})).success).toBe(false);
 expect(m.manager.mock.calls.map(c=>c[0])).toEqual(["trial.create","booking.create"]);expect(m.reserve).not.toHaveBeenCalled();
});
it("requires void permission and scopes reversals to the authorized store",async()=>{
 expect((await voidCourseTrialPayment({paymentId:"receipt",reason:"原單作廢",storeId:"other"})).success).toBe(true);
 expect(m.manager).toHaveBeenCalledWith("transaction.void");expect(m.voidPayment.mock.calls[0].slice(1)).toEqual([{storeId:"authorized-store",userId:"manager"},"receipt","原單作廢"]);
});
it("rejects inconsistent price settings without saving",async()=>{
 expect((await saveCourseTrialSettings({trialEnabled:true,trialDefaultPrice:499,trialAllowPriceEdit:true,trialMinPrice:500,trialMaxPrice:1000})).success).toBe(false);
 expect(m.manager).toHaveBeenCalledWith("trial.manage");expect(m.upsert).not.toHaveBeenCalled();
});
