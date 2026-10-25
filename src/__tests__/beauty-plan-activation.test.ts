import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({enqueue:vi.fn(),kick:vi.fn(),audit:vi.fn(),card:vi.fn(),payment:vi.fn(),raw:vi.fn(),execute:vi.fn(),ledger:vi.fn()}));
vi.mock("@/server/beauty/access",()=>({audit:m.audit,command:async(_tx:unknown,_a:unknown,_key:unknown,_intent:unknown,work:()=>unknown)=>work()}));
vi.mock("@/server/beauty/charge-runtime",()=>({beautyChargeRulesEnabled:()=>false}));
vi.mock("@/server/services/plan-activation-enqueue",()=>({enqueuePlanActivation:m.enqueue}));
vi.mock("@/server/services/plan-activation-notification-kick",()=>({kickPlanActivationNotifications:m.kick}));
import {issueCard} from "@/server/beauty/commerce";
const tx={beautyCard:{create:m.card},beautyPayment:{create:m.payment},beautyLedger:{create:m.ledger},$queryRaw:m.raw,$executeRaw:m.execute};
const actor={storeId:"store",userId:"manager",manager:true};
const input={requestKey:"request",customerId:"buyer",planId:"plan",memberIds:["shared-member"],paid:1000,method:"BANK_TRANSFER" as const};
const frozen={id:"plan",storeId:"store",name:"共享十次方案",sessions:10,price:1000,validDays:30,serviceIds:[],allowShared:true,revision:1};
beforeEach(()=>{
 vi.clearAllMocks();m.raw.mockResolvedValue([{id:"buyer",assignedStaffId:null},{id:"shared-member",assignedStaffId:null}]);
 m.card.mockImplementation(async({data})=>({id:"card",...data}));m.payment.mockResolvedValue({id:"sale",amount:1000,note:"方案"});
});
it("queues the purchaser exactly once through shared issuance, not shared members",async()=>{
 await issueCard(tx as unknown as Parameters<typeof issueCard>[0],actor,input,frozen);
 expect(m.enqueue).toHaveBeenCalledExactlyOnceWith(tx,expect.objectContaining({module:"BEAUTY",storeId:"store",customerId:"buyer",sourceId:"sale",entitlementId:"card",planName:frozen.name,quantity:10,unit:"次"}));expect(m.kick).toHaveBeenCalledWith("store",true);
});
it("does not queue an activation when card issuance fails validation",async()=>{
 await expect(issueCard(tx as unknown as Parameters<typeof issueCard>[0],actor,{...input,paid:1001},frozen)).rejects.toThrow();expect(m.enqueue).not.toHaveBeenCalled();expect(m.kick).not.toHaveBeenCalled();
});
