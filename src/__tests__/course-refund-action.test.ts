import {beforeEach,expect,it,vi} from "vitest";
import {courseRefundReference} from "@/lib/course-refund-display";
const m=vi.hoisted(()=>({permission:vi.fn(),manager:vi.fn(),transaction:vi.fn(),refund:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:m.permission}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/server/services/course-refund",()=>({refundUnusedCoursePurchase:m.refund}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {refundCoursePurchase} from "@/server/actions/course-refund";
const input={purchaseId:"purchase",amount:400,method:"BANK_TRANSFER",reason:"協商",requestKey:"11111111-1111-4111-a111-111111111111",expectedRemaining:6,expectedRefundedAmount:0};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({user:{id:"manager"},storeId:"own"});m.transaction.mockImplementation(async(_store,work)=>work("locked-tx"));m.refund.mockResolvedValue({id:"refund"});});
it("requires refund permission and fixes store and actor from authorization",async()=>{
 expect(await refundCoursePurchase({...input,storeId:"foreign",userId:"other"})).toMatchObject({success:true,refundId:"refund"});
 expect(m.permission).toHaveBeenCalledWith("transaction.refund");expect(m.manager).toHaveBeenCalledWith("transaction.refund");
 expect(m.transaction).toHaveBeenCalledWith("own",expect.any(Function));expect(m.refund).toHaveBeenCalledWith("locked-tx",{storeId:"own",userId:"manager"},input);
});
it("denies forbidden managers before starting a transaction",async()=>{
 m.manager.mockRejectedValue(new Error("denied"));expect(await refundCoursePurchase(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it.each([{amount:0},{amount:1.5},{method:""},{reason:" "},{expectedRemaining:-1},{expectedRefundedAmount:-1}])("rejects invalid input %j",async override=>{
 expect(await refundCoursePurchase({...input,...override})).toMatchObject({success:false});expect(m.refund).not.toHaveBeenCalled();
});
it("uses the confirmed gift example only as an unrounded reference",()=>{
 expect(courseRefundReference(1000,10,6,2)).toBe(400);
 expect(courseRefundReference(800,10,6,0)).toBe(480);
 expect(courseRefundReference(100,6,6,0)).toBe(100);
 expect(courseRefundReference(1000,10,6,7)).toBeNull();
});
