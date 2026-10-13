import {beforeEach,expect,it,vi} from "vitest";
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/lib/shop-config",()=>({resolveCustomerBookingWindow:vi.fn()}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:vi.fn()}));
vi.mock("@/server/services/course-store-notices",()=>({recordCourseStoreNotice:vi.fn()}));
import {reserveCourseInTransaction,settleCourseBooking} from "@/server/services/course-booking";
import type {Prisma} from "../../generated/course-client";
const actor={storeId:"s",userId:"owner",name:"店長"};
let tx:ReturnType<typeof fixture>;
function fixture(){return {$queryRaw:vi.fn(async(sql:TemplateStringsArray)=>{const text=sql.join("");return text.includes('StoreFeatureEntitlement')?[{featureKey:"business.music"}]:text.includes('Customer')?[{id:"a",name:"小安"}]:[{closed:false}];}),courseSession:{findFirst:vi.fn().mockResolvedValue({id:"lesson",templateId:"guitar",startsAt:new Date("2099-10-01T10:00:00Z"),endsAt:new Date("2099-10-01T11:00:00Z"),teacherAttendance:"SCHEDULED",releasedAt:null,enrollmentMode:"ASSIGNED",capacity:2,pointCost:1,template:{isActive:true,visibility:"PUBLIC"}})},coursePointCard:{findFirst:vi.fn()},courseBookingRule:{findUnique:vi.fn().mockResolvedValue({bookingLeadMinutes:0})},courseBooking:{findUnique:vi.fn().mockResolvedValue(null),findFirst:vi.fn().mockResolvedValue(null),count:vi.fn().mockResolvedValue(0),create:vi.fn(async({data})=>({id:"booking",...data})),update:vi.fn()},coursePointEntry:{create:vi.fn()}};}
const db=()=>tx as unknown as Prisma.TransactionClient;
const input={sessionId:"lesson",cardId:null,customerId:"a",deferredPayment:true,requestKey:"request"};
beforeEach(()=>{tx=fixture();});
it("creates a named unpaid music reservation with no trial fee or plan deduction",async()=>{const booking=await reserveCourseInTransaction(db(),actor,input,null);expect(booking).toMatchObject({bookingKind:"UNPAID",customerId:"a",customerName:"小安",cardId:null,pointCost:0});expect(booking.trialPrice).toBeUndefined();expect(tx.coursePointEntry.create).not.toHaveBeenCalled();});
it("rejects self-service deferred payments and prevents unnamed regular students",async()=>{await expect(reserveCourseInTransaction(db(),{...actor,customerId:"a"},input,null)).rejects.toThrow("僅限店家");await expect(reserveCourseInTransaction(db(),actor,{...input,customerId:null},null)).rejects.toThrow("已建檔學員");expect(tx.courseBooking.create).not.toHaveBeenCalled();});
it("does not permit this no-plan path in the fitness module",async()=>{tx.$queryRaw.mockResolvedValue([]);await expect(reserveCourseInTransaction(db(),actor,input,null)).rejects.toThrow("音樂模組");expect(tx.courseBooking.create).not.toHaveBeenCalled();});
it("keeps student collisions and capacity authoritative for unpaid reservations",async()=>{tx.courseBooking.count.mockResolvedValue(2);await expect(reserveCourseInTransaction(db(),actor,input,null)).rejects.toThrow("滿班");tx.courseBooking.count.mockResolvedValue(0);tx.courseBooking.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:"overlap"});await expect(reserveCourseInTransaction(db(),actor,input,null)).rejects.toThrow("同時段");});
it("requires individual payment before confirming a debit-bearing attendance",async()=>{tx.courseBooking.findFirst.mockResolvedValue({id:"booking",status:"RESERVED",bookingKind:"UNPAID",customerId:"a",cardId:null,session:{teacherAttendance:"SCHEDULED",startsAt:new Date("2099-10-01"),endsAt:new Date("2099-10-02")}});await expect(settleCourseBooking(db(),actor,"booking","ATTENDED")).rejects.toThrow("完成此學員繳費");expect(tx.courseBooking.update).not.toHaveBeenCalled();});
