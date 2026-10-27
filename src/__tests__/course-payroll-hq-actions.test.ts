import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),pay:vi.fn(),void:vi.fn(),confirm:vi.fn(),preview:vi.fn(),finance:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:m.preview}));
vi.mock("@/server/services/music-finance-access",()=>({isMusicFinanceStore:async()=>false,requireMusicFinance:m.finance}));
vi.mock("@/server/services/course-fee-payment",()=>({recordCourseFeePayment:m.pay,voidCourseFeePayment:m.void}));
vi.mock("@/server/services/confirm-course-month",()=>({confirmCourseMonth:m.confirm}));
vi.mock("@/server/services/course-monthly-settlement",()=>({readSettlementSettings:vi.fn()}));
vi.mock("@/server/services/course-profit-payment",()=>({recordCourseProfitPayment:vi.fn(),voidCourseProfitPayment:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:vi.fn()}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:vi.fn()}));
import {payCourseFee,correctCourseFee} from "@/server/actions/course-fee-payment";
import {confirmCourseMonthlySettlement} from "@/server/actions/course-monthly-settlement";
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({user:{id:"hq",role:"ADMIN",staffId:null},storeId:"store-lubymusic"});m.preview.mockReturnValue(true);m.transaction.mockImplementation(async(_store,run)=>run({}));});
it.each([payCourseFee,correctCourseFee])("allows HQ payment mutations across modules after permission and store checks",async(action)=>{
 for(const rollout of [true,false]){
  m.preview.mockReturnValue(rollout);expect((await action({expectedStoreId:"store-lubymusic"})).success).toBe(true);
 }
 expect(m.manager).toHaveBeenCalledWith("cashbook.create");expect(m.preview).not.toHaveBeenCalled();expect(m.transaction).toHaveBeenCalledTimes(2);
 m.transaction.mockClear();expect((await action({expectedStoreId:"other"})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it("rejects ordinary staff even in preview",async()=>{m.manager.mockResolvedValue({user:{id:"staff",role:"STAFF"},storeId:"store-lubymusic"});expect((await payCourseFee({})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();});
it("cannot bypass base cashbook permission",async()=>{m.manager.mockRejectedValue(new Error("denied"));expect((await correctCourseFee({})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();});
it("requires the selected store and finance permission for HQ monthly confirmation independently of rollout",async()=>{
 const input={expectedStoreId:"store-lubymusic",month:"2026-10",fingerprint:"a".repeat(64),revision:0,reason:"測試"};
 expect((await confirmCourseMonthlySettlement(input)).success).toBe(true);expect(m.finance).toHaveBeenCalledWith(expect.objectContaining({role:"ADMIN"}),"store-lubymusic","teacher.settlement.confirm");
 m.transaction.mockClear();m.preview.mockReturnValue(false);expect((await confirmCourseMonthlySettlement(input)).success).toBe(true);expect(m.preview).not.toHaveBeenCalled();
 m.transaction.mockClear();expect((await confirmCourseMonthlySettlement({...input,expectedStoreId:"other"})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
