import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {hasEffectiveCourseDebit} from "@/lib/sports-move-policy";
import {sportsMoveBlockedReason} from "@/server/services/sports-move-eligibility";
import type {Prisma} from "../../generated/course-client";
const row=(kind:string,points=2,bookingId="b",cardId="c")=>({kind,points,bookingId,cardId});
it("fully reversed debits permit a move including repeated attendance cycles",()=>{
 expect(hasEffectiveCourseDebit([row("RESERVE"),row("RELEASE")])).toBe(false);
 expect(hasEffectiveCourseDebit([row("DEBIT"),row("CORRECT:NO_SHOW:RESERVED:a")])).toBe(false);
 expect(hasEffectiveCourseDebit([row("DEBIT"),row("CORRECT:ATTENDED:RESERVED:a"),row("DEBIT:b"),row("CORRECT:NO_SHOW:RESERVED:c")])).toBe(false);
 expect(hasEffectiveCourseDebit([row("DEBIT"),row("CORRECT:ATTENDED:NO_SHOW:a")])).toBe(true);
 expect(hasEffectiveCourseDebit([row("CORRECT:RESERVED:ATTENDED:a"),row("CORRECT:ATTENDED:CANCELLED:b")])).toBe(false);
});
it("do not net another learner/card, incomplete reversals, or unknown history",()=>{
 for(const rows of [[row("DEBIT"),row("CORRECT:NO_SHOW:RESERVED:a",1)],[row("DEBIT"),row("CORRECT:NO_SHOW:RESERVED:a",2,"other")],[row("DEBIT"),row("CORRECT:NO_SHOW:RESERVED:a",2,"b","other")],[row("GRANT")],[row("CORRECT:UNKNOWN:RESERVED:a")],[row("CORRECT:NO_SHOW:RESERVED:a")]])expect(hasEffectiveCourseDebit(rows)).toBe(true);
});
const tx={courseBooking:{findFirst:vi.fn()},coursePointEntry:{findMany:vi.fn()},courseTrialPayment:{findFirst:vi.fn()},courseFeePayment:{findFirst:vi.fn()}};
const session={id:"s",startsAt:new Date("2026-12-18T08:00:00Z")},now=new Date("2026-10-18T08:00:00Z");
beforeEach(()=>{vi.clearAllMocks();tx.courseBooking.findFirst.mockResolvedValue(null);tx.coursePointEntry.findMany.mockResolvedValue([row("DEBIT"),row("CORRECT:NO_SHOW:RESERVED:a")]);tx.courseTrialPayment.findFirst.mockResolvedValue(null);tx.courseFeePayment.findFirst.mockResolvedValue(null);});
const reason=()=>sportsMoveBlockedReason(tx as unknown as Prisma.TransactionClient,"sports-live-flow-store",session,now);
it("read preflight and transaction share scoped authoritative checks",async()=>{
 expect(await reason()).toBeNull();
 expect(tx.coursePointEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"sports-live-flow-store",booking:{sessionId:"s"}}}));
 expect(tx.courseFeePayment.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"sports-live-flow-store",sessionId:"s",voidedAt:null}}));
});
it.each([['courseBooking','出席'],['courseTrialPayment','體驗收款'],['courseFeePayment','授課費']] as const)("keeps effective %s protection",async(model,text)=>{tx[model].findFirst.mockResolvedValue({id:"record"});expect(await reason()).toContain(text);});
it("keeps the started-course guard even after attendance reversal without touching data",async()=>{
 expect(await sportsMoveBlockedReason(tx as unknown as Prisma.TransactionClient,"sports-live-flow-store",{...session,startsAt:now},now)).toContain("課程已開始");expect(tx.coursePointEntry.findMany).not.toHaveBeenCalled();
});
