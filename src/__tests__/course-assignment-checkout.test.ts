import {beforeEach,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {assignCourseWithCheckout} from "@/server/services/course-assignment-checkout";
import {calculateCourseCheckout} from "@/lib/course-checkout";
import type {Prisma} from "../../generated/course-client";
const tx={courseSession:{findFirst:vi.fn(),count:vi.fn()},coursePurchase:{findUnique:vi.fn(),create:vi.fn()},coursePointPlan:{findFirst:vi.fn()},coursePointCard:{findUnique:vi.fn(),findFirst:vi.fn(),create:vi.fn()},$queryRaw:vi.fn(),$executeRaw:vi.fn()};
const db=tx as unknown as Prisma.TransactionClient;
const actor={storeId:"A",userId:"manager"};
const input={revenueStaffId:"developer",expectedStoreCost:0,planId:"plan",customerId:"customer",expiresDate:"2099-01-01",requestKey:"key",discountKind:"AMOUNT" as const,discountValue:200,paymentMethod:"BANK_TRANSFER" as const,transferLastFour:"0123",expectedListPrice:1000};
beforeEach(()=>{vi.resetAllMocks();tx.coursePurchase.findUnique.mockResolvedValue(null);tx.coursePointCard.findUnique.mockResolvedValue(null);tx.coursePointPlan.findFirst.mockResolvedValue({id:"plan",name:"十堂",unit:"SESSION",points:10,price:1000,validDays:30,templateIds:[],storeCost:0,termSessionIds:[]});tx.$queryRaw.mockResolvedValue([{id:"customer",displayName:"開發人"}]);tx.coursePointCard.create.mockResolvedValue({id:"card",termSessionIds:[]});tx.coursePurchase.create.mockImplementation(async({data})=>({id:"order",...data}));});
it.each([["AMOUNT",200,800],["PERCENT",20,800],["PERCENT",100,0]] as const)("calculates %s %s",(kind,value,paid)=>expect(calculateCourseCheckout(1000,kind,value).paid).toBe(paid));
it.each([["AMOUNT",1001],["PERCENT",101],["AMOUNT",-1]] as const)("rejects invalid %s %s",(kind,value)=>expect(()=>calculateCourseCheckout(1000,kind,value)).toThrow());
it("saves discounted paid amount, method and four digits with one linked income",async()=>{const order=await assignCourseWithCheckout(db,actor,input);expect(order.price).toBe(800);expect(tx.coursePurchase.create).toHaveBeenCalledWith({data:expect.objectContaining({status:"CONFIRMED",cardId:"card",price:800,paymentMethod:"BANK_TRANSFER",transferLastFour:"0123",listPrice:1000})});expect(tx.$executeRaw).toHaveBeenCalledTimes(2);expect(tx.$executeRaw.mock.calls[0].slice(1)).toContain(800);});
it("full discount needs no payment reference and writes audit but no income",async()=>{const order=await assignCourseWithCheckout(db,actor,{...input,discountValue:1000,transferLastFour:""});expect(order.paymentMethod).toBe("DISCOUNT");expect(order.price).toBe(0);expect(tx.$executeRaw).toHaveBeenCalledTimes(1);});
it("rejects missing transfer digits before writing",async()=>{await expect(assignCourseWithCheckout(db,actor,{...input,transferLastFour:"123"})).rejects.toThrow("後四碼");expect(tx.coursePointCard.create).not.toHaveBeenCalled();});
it("rejects a stale listed price and foreign customer",async()=>{tx.coursePointPlan.findFirst.mockResolvedValueOnce({price:1200});await expect(assignCourseWithCheckout(db,actor,input)).rejects.toThrow("售價已變更");tx.$queryRaw.mockResolvedValueOnce([]);await expect(assignCourseWithCheckout(db,actor,input)).rejects.toThrow("本店");expect(tx.coursePointCard.create).not.toHaveBeenCalled();});
it("cash requires an open drawer before issuing quota",async()=>{await expect(assignCourseWithCheckout(db,actor,{...input,paymentMethod:"CASH"})).rejects.toThrow("現金抽屜");expect(tx.coursePointCard.create).not.toHaveBeenCalled();});
it("same request returns existing order, changed checkout is rejected",async()=>{const previous={revenueStaffId:"developer",id:"order",cardId:"card",customerId:input.customerId,planId:input.planId,listPrice:1000,discountKind:"AMOUNT",discountValue:200,price:800,paymentMethod:"BANK_TRANSFER",transferLastFour:"0123"};tx.coursePurchase.findUnique.mockResolvedValue(previous);tx.coursePointCard.findFirst.mockResolvedValue({expiresAt:new Date("2099-01-01T15:59:59.999Z")});expect(await assignCourseWithCheckout(db,actor,input)).toEqual(previous);expect(tx.coursePointCard.create).not.toHaveBeenCalled();expect(tx.$executeRaw).not.toHaveBeenCalled();await expect(assignCourseWithCheckout(db,actor,{...input,discountValue:100})).rejects.toThrow("請求已使用");});

function musicPlan(){return {id:"plan",name:"團班八堂",unit:"SESSION",points:9,price:3600,validDays:70,templateIds:["guitar"],storeCost:0,termSessionIds:[],musicTerms:1,musicTermSizes:[8],musicBonusLessons:1};}
it("freezes periods and bonus without extending validity or changing tuition",async()=>{
 tx.coursePointPlan.findFirst.mockResolvedValue(musicPlan());
 await assignCourseWithCheckout(db,{...actor,music:true},{...input,expectedListPrice:3600,musicManualBonus:2});
 expect(tx.coursePointCard.create).toHaveBeenCalledWith({data:expect.objectContaining({remaining:11,musicTermSizes:[11],musicBonusLessons:3,musicValidityDays:70})});
 expect(tx.coursePurchase.create).toHaveBeenCalledWith({data:expect.objectContaining({points:11,price:3400,musicTermSizes:[11],musicBonusLessons:3,musicManualBonus:2})});
});
it("prices a third-class join as six lessons and preserves discounts",async()=>{
 tx.coursePointPlan.findFirst.mockResolvedValue(musicPlan());
 tx.courseSession.findFirst.mockResolvedValue({templateId:"guitar",requestKey:"series",requestIndex:2,template:{classType:"GROUP",musicTermLessons:8}});
 tx.courseSession.count.mockResolvedValue(6);
 await assignCourseWithCheckout(db,{...actor,music:true},{...input,expectedListPrice:2700,musicJoinSessionId:"third"});
 expect(tx.courseSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:"third",storeId:"A",cancelledAt:null}}));
 expect(tx.coursePurchase.create).toHaveBeenCalledWith({data:expect.objectContaining({points:7,price:2500,musicTermSizes:[7],musicJoinSessionId:"third"})});
});
it("rejects foreign or incomplete joining sessions before collecting money",async()=>{
 tx.coursePointPlan.findFirst.mockResolvedValue(musicPlan());
 tx.courseSession.findFirst.mockResolvedValue(null);
 await expect(assignCourseWithCheckout(db,{...actor,music:true},{...input,musicJoinSessionId:"foreign"})).rejects.toThrow("團班課次");
 tx.courseSession.findFirst.mockResolvedValue({templateId:"guitar",requestKey:"series",requestIndex:2,template:{classType:"GROUP",musicTermLessons:8}});
 tx.courseSession.count.mockResolvedValue(5);
 await expect(assignCourseWithCheckout(db,{...actor,music:true},{...input,musicJoinSessionId:"third"})).rejects.toThrow("尚未排齊");
 expect(tx.coursePointCard.create).not.toHaveBeenCalled();
});
it("does not reuse a checkout key with a different bonus or joining selection",async()=>{
 tx.coursePurchase.findUnique.mockResolvedValue({musicManualBonus:1,musicJoinSessionId:"third"});
 await expect(assignCourseWithCheckout(db,{...actor,music:true},{...input,musicManualBonus:2,musicJoinSessionId:"third"})).rejects.toThrow("請求已使用");
 expect(tx.coursePointCard.create).not.toHaveBeenCalled();
});

it("buys three four-lesson periods with a first-period gift and a single first-use expiry",async()=>{
 tx.coursePointPlan.findFirst.mockResolvedValue({...musicPlan(),points:4,price:3200,validDays:35,musicTermSizes:[4],musicBonusLessons:0});
 await assignCourseWithCheckout(db,{...actor,music:true},{...input,expectedListPrice:9600,musicPurchaseTerms:3,musicManualBonus:1});
 expect(tx.coursePointCard.create).toHaveBeenCalledWith({data:expect.objectContaining({remaining:13,musicTermSizes:[5,4,4],musicBonusLessons:1,musicValidityDays:105,expiresAt:new Date("2099-12-31T15:59:59.999Z")})});
 expect(tx.coursePurchase.create).toHaveBeenCalledWith({data:expect.objectContaining({points:13,price:9400,validDays:105,listPrice:9600,musicTermSizes:[5,4,4]})});
});
it("rejects forged purchase terms before issuing quota",async()=>{
 tx.coursePointPlan.findFirst.mockResolvedValue({...musicPlan(),points:4,price:3200,validDays:35,musicTermSizes:[4],musicBonusLessons:0});
 await expect(assignCourseWithCheckout(db,{...actor,music:true},{...input,expectedListPrice:3200,musicPurchaseTerms:6})).rejects.toThrow("售價已變更");
 expect(tx.coursePointCard.create).not.toHaveBeenCalled();
});
