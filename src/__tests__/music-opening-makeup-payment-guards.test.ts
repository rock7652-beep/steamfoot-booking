import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/server/services/cash-day",()=>({lockCashDay:vi.fn()}));
import { collectCourseTrialInTransaction, voidCourseTrialInTransaction } from "@/server/services/course-trial-payment";
import type { Prisma } from "../../generated/course-client";
const m={courseBooking:{findFirst:vi.fn()},courseTrialPayment:{findFirst:vi.fn(),findUnique:vi.fn(),create:vi.fn(),update:vi.fn()},$executeRaw:vi.fn()};
const tx=m as unknown as Prisma.TransactionClient;
const actor={storeId:"store",userId:"staff"};
beforeEach(()=>{
 vi.resetAllMocks();
 m.courseTrialPayment.findFirst.mockResolvedValue({id:"payment",bookingId:"booking",status:"SUCCESS",amount:500,paymentMethod:"CASH"});
});
it.each([{bookingKind:"OPENING_MAKEUP"},{bookingKind:"TRIAL",musicOpeningMakeupEntitlementId:"right"}])("rejects collection, replay and void before payment/cash/audit side effects: %j",async marker=>{
 m.courseBooking.findFirst.mockResolvedValue({id:"booking",...marker});
 m.courseTrialPayment.findUnique.mockResolvedValue({bookingId:"booking",amount:500,paymentMethod:"CASH",note:""});
 await expect(collectCourseTrialInTransaction(tx,actor,{bookingId:"booking",amount:500,paymentMethod:"CASH",requestKey:"request"})).rejects.toThrow("期初補課");
 await expect(voidCourseTrialInTransaction(tx,actor,"payment","correction")).rejects.toThrow("期初補課");
 for(const write of [m.courseTrialPayment.create,m.courseTrialPayment.update,m.$executeRaw])expect(write).not.toHaveBeenCalled();
});
