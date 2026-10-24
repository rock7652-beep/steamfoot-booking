import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({orders:vi.fn(),cards:vi.fn(),bookings:vi.fn(),tuition:vi.fn(),receipts:vi.fn(),assignments:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePurchase:{findMany:m.orders},coursePointCard:{findMany:m.cards},courseBooking:{findMany:m.bookings}}}));
vi.mock("@/server/services/music-tuition",()=>({readMusicTuition:m.tuition,readMusicReceipts:m.receipts}));
vi.mock("@/server/services/music-lesson-periods",()=>({readMusicLessonAssignments:m.assignments}));
import {getCourseMemberRecords} from "@/server/queries/course-member-records";
const date=new Date("2026-10-24T01:00:00Z");
const order={id:"order",cardId:"card",name:"吉他",templateIds:["t"],status:"CONFIRMED",unit:"SESSION",price:6400,points:8,createdAt:date,confirmedAt:date,paymentMethod:"CASH",refunds:[]};
const booking=(id:string,status:string)=>({id,cardId:"card",customerId:"child",customerName:"虛構學員",status,absenceKind:null,pointCost:1,session:{nameSnapshot:"吉他",startsAt:date,cancelledAt:null}});
beforeEach(()=>{vi.resetAllMocks();m.orders.mockResolvedValue([order]);m.cards.mockResolvedValue([{id:"card",musicTermSizes:[4,4],templateIds:["t"]}]);m.bookings.mockResolvedValue([booking("attended","ATTENDED"),booking("cancelled","CANCELLED"),booking("unknown","RESERVED")]);m.tuition.mockResolvedValue(new Map([["order",{due:6400}]]));m.receipts.mockResolvedValue([{id:"r1",purchaseId:"order",amount:3200,paidAt:date,method:"CASH"},{id:"r2",purchaseId:"order",amount:3200,paidAt:date,method:"BANK_TRANSFER"}]);m.assignments.mockResolvedValue([{bookingId:"attended",customerId:"child",period:1,ordinal:1},{bookingId:"cancelled",customerId:"child",period:2,ordinal:1}]);});
it("scopes purchases to the verified payer and rechecks store-scoped card membership",async()=>{
 const [r]=await getCourseMemberRecords("store","child",true);
 expect(m.orders.mock.calls[0][0].where).toEqual({storeId:"store",customerId:"child"});
 expect(m.cards.mock.calls[0][0].where).toEqual({storeId:"store",members:{some:{storeId:"store",customerId:"child"}}});
 expect(m.bookings.mock.calls[0][0].where).toEqual({storeId:"store",cardId:{in:["card"]},OR:[{customerId:"child"},{reserverCustomerId:"child"}]});
 expect(r.receipts.map(r=>r.amount)).toEqual([3200,3200]);expect(r.periods).toHaveLength(2);
 expect(r.lessons.map(l=>[l.id,l.period,l.ordinal,l.used])).toEqual([["attended",1,1,1],["cancelled",2,1,0],["unknown",null,null,0]]);
 expect(JSON.stringify(r)).not.toContain("actorUserId");
});
it("does not guess period ownership after cancellation or when several purchases share a legacy card",async()=>{
 m.orders.mockResolvedValue([order,{...order,id:"second"}]);const rows=await getCourseMemberRecords("store","child",true);
 expect(rows.every(r=>!r.lessonsAvailable&&r.lessons.length===0&&r.periods.length===0)).toBe(true);
});
it("retains actual zero receipts, partial tuition and refunds as separate amounts",async()=>{
 m.orders.mockResolvedValue([{...order,price:0,refunds:[{id:"refund",amount:100,method:"CASH",createdAt:date}]}]);m.receipts.mockResolvedValue([]);
 const [r]=await getCourseMemberRecords("store","child",true);expect(r.received).toBe(0);expect(r.receipts).toEqual([]);expect(r.periods.map(p=>p.outstanding)).toEqual([3200,3200]);expect(r.refunds[0].amount).toBe(100);
});
it("keeps sports units and attendance corrections without loading music tables",async()=>{
 m.orders.mockResolvedValue([{...order,unit:"POINT"}]);const [r]=await getCourseMemberRecords("store","child",false);
 expect(r.unit).toBe("POINT");expect(r.lessons.map(l=>l.used)).toEqual([1,0,0]);expect(r.periods).toEqual([]);expect(m.assignments).not.toHaveBeenCalled();expect(m.receipts).not.toHaveBeenCalled();
});

it("never labels a pending purchase request as money already received",async()=>{m.orders.mockResolvedValue([{...order,status:"PENDING",price:6400}]);m.receipts.mockResolvedValue([]);const [r]=await getCourseMemberRecords("store","child",true);expect(r.received).toBe(0);expect(r.due).toBe(6400);expect(r.receipts).toEqual([]);expect(r.periods.every(p=>p.received===0)).toBe(true);});
