import {beforeEach,expect,it,vi} from "vitest";
const reserve=vi.hoisted(()=>vi.fn());
const bind=vi.hoisted(()=>vi.fn());
vi.mock("@/server/services/music-lesson-periods",()=>({bindMusicLesson:bind}));
vi.mock("@/server/services/course-booking",()=>({reserveCourseInTransaction:reserve}));
import {reserveScheduledMusicLearner,attachUnpaidMusicBookings} from "@/server/services/music-schedule-enrollment";
import type {Prisma} from "../../generated/course-client";
const actor={storeId:"store",userId:"manager",name:"店長"};
const input={sessionId:"lesson",customerId:"a",cardId:"card",requestKey:"request"};
let tx:ReturnType<typeof fixture>;
function fixture(){return {courseSession:{findFirst:vi.fn().mockResolvedValue({templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")})},coursePointCard:{update:vi.fn(),findFirst:vi.fn().mockResolvedValue({id:"card",unit:"SESSION",closedAt:null,templateIds:["guitar"],members:[{customerId:"a"}],termSessionIds:[],remaining:4,expiresAt:new Date("2099-12-31"),musicValidityDays:null})},courseBooking:{aggregate:vi.fn().mockResolvedValue({_sum:{pointCost:3}}),findFirst:vi.fn().mockResolvedValue(null),findMany:vi.fn(),update:vi.fn()},courseScheduleSeries:{findUnique:vi.fn().mockResolvedValue(null),update:vi.fn()},coursePointEntry:{create:vi.fn()}};}
const db=()=>tx as unknown as Prisma.TransactionClient;
beforeEach(()=>{vi.resetAllMocks();tx=fixture();});
it("uses the person's own paid plan when a lesson is covered",async()=>{await reserveScheduledMusicLearner(db(),actor,input,null);expect(reserve).toHaveBeenCalledWith(db(),actor,expect.objectContaining({customerId:"a",cardId:"card",deferredPayment:false}),null);});
it("keeps a future lesson after the paid period runs out without treating it as a trial",async()=>{tx.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:4}});await reserveScheduledMusicLearner(db(),actor,input,null);expect(reserve).toHaveBeenCalledWith(db(),actor,expect.objectContaining({customerId:"a",cardId:null,deferredPayment:true}),null);});
it("allows no-plan scheduling and preserves the original request key",async()=>{await reserveScheduledMusicLearner(db(),actor,{...input,cardId:null},100);expect(reserve).toHaveBeenCalledWith(db(),actor,{...input,cardId:null,deferredPayment:true},100);});
it("rejects another person's plan instead of silently treating it as unpaid",async()=>{tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),members:[{customerId:"b"}]});await expect(reserveScheduledMusicLearner(db(),actor,input,null)).rejects.toThrow("個人方案");expect(reserve).not.toHaveBeenCalled();});
it("keeps lessons outside the purchased validity as unpaid",async()=>{tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),expiresAt:new Date("2099-10-02")});await reserveScheduledMusicLearner(db(),actor,input,null);expect(reserve.mock.calls[0][2]).toMatchObject({cardId:null,deferredPayment:true});});
it("attaches checkout to the same person's existing booking IDs only while there is credit",async()=>{
 const session={requestKey:"series",templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")};
 tx.courseBooking.findFirst.mockResolvedValue({id:"source",customerId:"a",bookingKind:"UNPAID",status:"RESERVED",session});
 tx.courseBooking.findMany.mockResolvedValue([{id:"source",sessionId:"lesson",session},{id:"next",sessionId:"next",session:{...session,startsAt:new Date("2099-10-15T10:00:00Z")}}]);
 await attachUnpaidMusicBookings(db(),actor,"card","a","source");
 expect(tx.courseBooking.findMany.mock.calls[0][0].where.customerId).toBe("a");expect(tx.courseBooking.update).toHaveBeenCalledTimes(1);expect(tx.courseBooking.update).toHaveBeenCalledWith({where:{id:"source"},data:{cardId:"card",bookingKind:"CARD",pointCost:1}});expect(tx.coursePointEntry.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({bookingId:"source",kind:"RESERVE"})}));
});

it("keeps the other learner's plan when a renewal changes future fixed lessons",async()=>{
 const session={requestKey:"series",templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")};
 tx.courseBooking.findFirst.mockResolvedValue({id:"source",customerId:"a",bookingKind:"UNPAID",status:"RESERVED",session});tx.courseBooking.findMany.mockResolvedValue([]);
 tx.courseScheduleSeries.findUnique.mockResolvedValue({id:"series",cancelledAt:null,learnerSnapshot:[{customerId:"a",cardId:"old"},{customerId:"b",cardId:"other"}]});
 await attachUnpaidMusicBookings(db(),actor,"card","a","source");
 expect(tx.courseScheduleSeries.update).toHaveBeenCalledWith({where:{id:"series"},data:{learnerSnapshot:[{customerId:"a",cardId:"card"},{customerId:"b",cardId:"other"}]}});
});

it("keeps previously attended unpaid lessons and deducts them once when paid",async()=>{
 const session={requestKey:"series",templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")};
 tx.courseBooking.findFirst.mockResolvedValue({id:"source",customerId:"a",bookingKind:"UNPAID",status:"ATTENDED",session});
 tx.courseBooking.findMany.mockResolvedValue([{id:"source",sessionId:"lesson",status:"ATTENDED",session}]);
 await attachUnpaidMusicBookings(db(),actor,"card","a","source");
 expect(tx.courseBooking.update).toHaveBeenCalledWith({where:{id:"source"},data:{cardId:"card",bookingKind:"CARD",pointCost:1}});
 expect(tx.coursePointEntry.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({bookingId:"source",kind:"DEBIT",points:1})}));
 expect(tx.coursePointCard.update).toHaveBeenCalledWith({where:{id:"card"},data:{remaining:{decrement:1}}});
 tx.courseBooking.findFirst.mockResolvedValue({id:"source",customerId:"a",bookingKind:"CARD",status:"ATTENDED",session});
 await attachUnpaidMusicBookings(db(),actor,"card","a","source");expect(tx.coursePointEntry.create).toHaveBeenCalledTimes(1);
});

it("continues an ongoing lesson as unpaid after its personal plan has been closed",async()=>{
 tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),closedAt:new Date(),remaining:0});
 await reserveScheduledMusicLearner(db(),actor,input,null);
 expect(reserve.mock.calls[0][2]).toMatchObject({cardId:null,deferredPayment:true});
});

it("extends a paid group's reserved dates only within the same teaching series",async()=>{
 tx.courseSession.findFirst.mockResolvedValueOnce({templateId:"teaching:guitar",requestKey:"series",startsAt:new Date("2099-10-08T10:00:00Z")}).mockResolvedValueOnce({id:"first-paid-date"});
 tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),templateIds:["teaching:guitar"],termSessionIds:["first-paid-date"]});
 await reserveScheduledMusicLearner(db(),actor,input,null);expect(tx.coursePointCard.update).toHaveBeenCalledWith({where:{id:"card"},data:{termSessionIds:["first-paid-date","lesson"]}});expect(reserve.mock.calls[0][2]).toMatchObject({cardId:"card",deferredPayment:false});
});

it.each(["2099-10-07T12:00:00Z","2099-10-08T09:59:59Z"])("rejects a selected card before its start instead of creating unpaid: %s",async startsAt=>{
 tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),musicJoinSessionId:"join"});
 tx.courseSession.findFirst.mockResolvedValueOnce({templateId:"guitar",startsAt:new Date(startsAt)}).mockResolvedValueOnce({startsAt:new Date("2099-10-08T10:00:00Z")});
 await expect(reserveScheduledMusicLearner(db(),actor,input,null)).rejects.toThrow("尚未到課卡起始時間：2099-10-08 18:00");
 expect(reserve).not.toHaveBeenCalled();expect(tx.coursePointCard.update).not.toHaveBeenCalled();
});
it("allows the exact card start instant",async()=>{
 tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),musicJoinSessionId:"join"});
 tx.courseSession.findFirst.mockResolvedValueOnce({templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")}).mockResolvedValueOnce({startsAt:new Date("2099-10-08T10:00:00Z")});
 await reserveScheduledMusicLearner(db(),actor,input,null);expect(reserve.mock.calls[0][2]).toMatchObject({cardId:"card",deferredPayment:false});
});
it("fails clearly when the linked start session cannot be found in this store",async()=>{
 tx.coursePointCard.findFirst.mockResolvedValue({...await tx.coursePointCard.findFirst(),musicJoinSessionId:"join"});
 tx.courseSession.findFirst.mockResolvedValueOnce({templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")}).mockResolvedValueOnce(null);
 await expect(reserveScheduledMusicLearner(db(),actor,input,null)).rejects.toThrow("課卡起始課堂資料不完整");expect(reserve).not.toHaveBeenCalled();
});

it("binds each original unpaid booking to the purchased fixed period without creating replacement bookings",async()=>{
 const session={requestKey:"series",templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")};
 const source={id:"original-1",customerId:"a",bookingKind:"UNPAID",status:"RESERVED",session};
 tx.courseBooking.findFirst.mockResolvedValue(source);
 const rows=[source,{...source,id:"original-2",session:{...session,startsAt:new Date("2099-10-15T10:00:00Z")}}];
 tx.courseBooking.findMany.mockResolvedValue(rows);
 tx.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});
 await attachUnpaidMusicBookings(db(),actor,"card","a",source.id);
 expect(tx.courseBooking.update.mock.calls.map(([arg])=>arg.where.id)).toEqual(["original-1","original-2"]);
 expect(bind.mock.calls.map(args=>args[2])).toEqual(rows.map(row=>({...row,cardId:"card",customerId:"a"})));
 expect(tx.coursePointEntry.create.mock.calls.map(([arg])=>[arg.data.bookingId,arg.data.kind])).toEqual([["original-1","RESERVE"],["original-2","RESERVE"]]);
 expect(tx.coursePointCard.update).not.toHaveBeenCalled();
 tx.courseBooking.findFirst.mockResolvedValue({...source,bookingKind:"CARD"});
 await attachUnpaidMusicBookings(db(),actor,"card","a",source.id);
 expect(bind).toHaveBeenCalledTimes(2);expect(tx.coursePointEntry.create).toHaveBeenCalledTimes(2);
});
it("propagates fixed-period allocation failure so the purchase transaction can roll back instead of leaving an unassigned paid lesson",async()=>{
 const session={requestKey:"series",templateId:"guitar",startsAt:new Date("2099-10-08T10:00:00Z")};
 const row={id:"original",customerId:"a",bookingKind:"UNPAID",status:"RESERVED",session};
 tx.courseBooking.findFirst.mockResolvedValue(row);tx.courseBooking.findMany.mockResolvedValue([row]);
 bind.mockRejectedValue(new Error("期別無可用堂次"));
 await expect(attachUnpaidMusicBookings(db(),actor,"card","a",row.id)).rejects.toThrow("期別無可用堂次");
 expect(tx.coursePointEntry.create).not.toHaveBeenCalled();expect(tx.courseScheduleSeries.update).not.toHaveBeenCalled();
});
