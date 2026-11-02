vi.mock("@/server/services/course-store-notices",()=>({recordCourseStoreNotice:vi.fn()}));
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:(storeId:string)=>storeId==="synthetic-store"}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
vi.mock("../../scripts/music-opening-preview-scope.mjs",()=>({assertMusicOpeningPreviewEnvironment:vi.fn()}));
import {settleCourseBooking,correctCourseAttendance,reserveCourseInTransaction} from "@/server/services/course-booking";
import {manageCourseCard} from "@/server/services/course-card-management";
import {isNativeMusicLeaveCard} from "@/server/services/music-native-leave";
import {PILOT_EVIDENCE_HASH} from "@/server/services/music-pilot-policy";
import type {Prisma} from "../../generated/course-client";
// Transaction doubles contain only fields exercised by these lifecycle tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let card:any,booking:any,coupon:any;
let expiryAudits:Array<{beforeJson:{musicValidityDays:number|null};afterJson:unknown}>=[];
const m={coursePurchase:{count:vi.fn(),findMany:vi.fn()},courseBookingRule:{findUnique:vi.fn()},courseBooking:{findUnique:vi.fn(),create:vi.fn(),findFirst:vi.fn(),findMany:vi.fn(),count:vi.fn(),aggregate:vi.fn(),update:vi.fn()},coursePointCard:{findMany:vi.fn(),findFirst:vi.fn(),findUnique:vi.fn(),create:vi.fn(),update:vi.fn(),updateMany:vi.fn()},coursePointEntry:{create:vi.fn(),findUnique:vi.fn()},courseSession:{findFirst:vi.fn(),findMany:vi.fn(),update:vi.fn()},courseTemplate:{findFirst:vi.fn(),findMany:vi.fn()},$queryRaw:vi.fn(),$executeRaw:vi.fn()};
const tx=m as unknown as Prisma.TransactionClient;
const actor={storeId:"synthetic-store",userId:"synthetic-actor",name:"Synthetic"};
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
beforeEach(()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
 vi.resetAllMocks();m.coursePointCard.findMany.mockResolvedValue([]);m.coursePurchase.count.mockResolvedValue(1);vi.stubEnv("VERCEL","1");coupon=null;expiryAudits=[];
 card={id:"synthetic-card",requestKey:"native-checkout:synthetic",unit:"SESSION",remaining:8,expiresAt:new Date("2027-01-10T15:59:59.999Z"),musicActivatedAt:new Date("2026-11-02T11:00:00Z"),musicValidityDays:70,planId:"synthetic-plan",templateIds:["synthetic-template"],nameSnapshot:"Synthetic group",members:[{customerId:"synthetic-student"}]};
 booking={id:"synthetic-booking",storeId:actor.storeId,cardId:card.id,card,customerId:"synthetic-student",sessionId:"synthetic-session",session:{id:"synthetic-session",templateId:"synthetic-template",startsAt:new Date("2026-11-02T11:00:00Z"),endsAt:new Date("2026-11-02T12:00:00Z"),capacity:3,teacherAttendance:"SCHEDULED",releasedAt:null},status:"RESERVED",absenceKind:null,pointCost:1,bookingKind:"CARD",makeupForBookingId:null};
 m.$queryRaw.mockImplementation(async (strings,...values)=>{
  const sql=strings.join("");
  if(sql.includes('CARD_EXPIRY'))return expiryAudits.filter(a=>!!a.beforeJson.musicValidityDays);
  if(sql.includes('FROM "AuditLog" WHERE id='))return [];
  if(sql.includes('SELECT "bookingId","cardId"'))return values[1]?.includes("synthetic-booking")?[{bookingId:"synthetic-booking",cardId:card.id,customerId:booking.customerId,period:1,ordinal:1,kind:"REGULAR",sourceBookingId:null,releasedAt:null}]:[];
  if(sql.includes('"CourseMusicLessonAssignment"')||sql.includes('PLAN_SESSION_ADJUSTMENT')||sql.includes('SportsSessionRule'))return [];
  if(sql.includes('FROM "Customer"'))return [{id:"synthetic-student",name:"Synthetic student"}];
  return [{featureKey:"business.music",afterJson:{contentHash:PILOT_EVIDENCE_HASH,cardIds:[card.id]}}];
 });
 m.$executeRaw.mockImplementation(async(strings,...values)=>{
  if(strings.join("").includes('CARD_EXPIRY')||values.includes('CARD_EXPIRY')){
   expiryAudits.push({beforeJson:JSON.parse(values[values.length-2]),afterJson:JSON.parse(values[values.length-1])});
  }
  return 1;
 });
 m.courseBooking.findFirst.mockImplementation(async(args)=>typeof args.where.id === "string" ? booking : null);m.courseBooking.findMany.mockResolvedValue([]);m.courseBooking.count.mockResolvedValue(0);m.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});
 m.courseBooking.update.mockImplementation(async({data})=>{Object.assign(booking,data);if(data.cardId===card.id)booking.card=card;return booking;});
 m.coursePointCard.findFirst.mockImplementation(async()=>card);m.coursePointCard.findUnique.mockImplementation(async({where})=>where.storeId_requestKey.requestKey.startsWith("music-leave-makeup:")?coupon:null);
 m.coursePointCard.updateMany.mockImplementation(async({data})=>{card.remaining-=data.remaining.decrement;return {count:1};});
 m.coursePointCard.create.mockImplementation(async({data})=>{coupon={...data,members:[{customerId:"synthetic-student"}],closedAt:null};return coupon;});
 m.coursePointCard.update.mockImplementation(async({where,data})=>{if(where.id===card.id){if(data.remaining?.increment)card.remaining+=data.remaining.increment;Object.assign(card,Object.fromEntries(Object.entries(data).filter(([key])=>key!=="remaining")));}else Object.assign(coupon,data);return data;});
 m.courseTemplate.findFirst.mockResolvedValue({classType:"GROUP",musicSubjectId:"synthetic-subject",musicTrialMode:null});m.courseSession.findFirst.mockResolvedValue(null);
 // The fixture's one current paid card is also the oldest eligible item card.
 // Include the ordinary-card reads introduced by legacy-binding reconciliation.
 card.musicTermSizes=[8];card.musicBonusLessons=0;card.musicOpeningStateRequired=false;card.termSessionIds=[];
 card.createdAt=new Date("2026-10-01");card.bookings=[];
 m.coursePointCard.findMany.mockImplementation(async()=>[card]);
 m.coursePurchase.findMany.mockResolvedValue([]);
 m.courseSession.findMany.mockResolvedValue([]);
 m.courseTemplate.findMany.mockResolvedValue([{id:"synthetic-template"}]);
});
describe("new music purchase leave policy",()=>{
 it("deducts ordinary once, issues one separate same-expiry makeup and ignores replay",async()=>{
  await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
  expect(card.remaining).toBe(7);expect(coupon.remaining).toBe(1);expect(coupon.expiresAt).toEqual(card.expiresAt);expect(coupon.musicValidityDays).toBeNull();expect(booking.absenceKind).toBe("STUDENT_LEAVE");
  await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");expect(card.remaining).toBe(7);expect(m.coursePointCard.create).toHaveBeenCalledTimes(1);
 });
 it("no-show deducts without issuing makeup",async()=>{await settleCourseBooking(tx,actor,booking.id,"NO_SHOW");expect(card.remaining).toBe(7);expect(m.coursePointCard.create).not.toHaveBeenCalled();});
 it("restoring unused leave closes the coupon and returns exactly one ordinary lesson",async()=>{
  await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
  await correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED");
  expect(card.remaining).toBe(8);expect(coupon.remaining).toBe(0);expect(coupon.closedAt).toBeInstanceOf(Date);expect(booking.status).toBe("RESERVED");
 });
 it("cannot restore ordinary credit while the corresponding makeup is reserved",async()=>{
  await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");m.courseBooking.count.mockResolvedValue(1);
  await expect(correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED")).rejects.toThrow("補課已預約或核銷");expect(card.remaining).toBe(7);expect(coupon.remaining).toBe(1);
 });
 it("a card without confirmed purchase keeps the legacy behavior",async()=>{
  m.coursePurchase.count.mockResolvedValue(0);
  await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");expect(booking.absenceKind).toBe("GROUP_LEAVE_FORFEITED");expect(m.coursePointCard.create).not.toHaveBeenCalled();
 });
 it("private lessons also deduct and issue separate makeup",async()=>{
  m.courseTemplate.findFirst.mockResolvedValue({classType:"PRIVATE"});
  await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");expect(card.remaining).toBe(7);expect(coupon.remaining).toBe(1);
 });
});

it("does not refund an already voided makeup again when attendance is later waived and restored",async()=>{
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 await correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED");
 expect(card.remaining).toBe(8);
 await settleCourseBooking(tx,actor,booking.id,"ATTENDED");
 expect(card.remaining).toBe(7);
 await correctCourseAttendance(tx,actor,booking.id,"CANCELLED","ATTENDED",{waiveAbsence:true,suppressNotice:true});
 expect(card.remaining).toBe(8);expect(booking.absenceKind).toBe("STUDENT_LEAVE");
 await correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED");
 expect(card.remaining).toBe(8);expect(booking.status).toBe("RESERVED");
 expect(m.coursePointCard.create).toHaveBeenCalledTimes(1);
});


function unpaid(){booking.cardId=null;booking.card=null;booking.bookingKind="UNPAID";booking.pointCost=0;}
it("settles a paid but unbound automatic lesson leave and ignores retry",async()=>{
 unpaid();
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(booking).toMatchObject({cardId:card.id,bookingKind:"CARD",pointCost:1,absenceKind:"STUDENT_LEAVE"});
 expect(card.remaining).toBe(7);expect(coupon?.remaining).toBe(1);
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(card.remaining).toBe(7);expect(m.coursePointCard.create).toHaveBeenCalledTimes(1);
 expect(m.coursePointEntry.create.mock.calls.filter(([a])=>a.data.kind==="RESERVE")).toHaveLength(1);
});
it.each(["no card","wrong item","expired","fully held"])("keeps unbound leave policy when %s",async reason=>{
 unpaid();
 if(reason==="no card")m.coursePointCard.findMany.mockResolvedValue([]);
 if(reason==="wrong item")card.templateIds=["other-item"];
 if(reason==="expired")card.expiresAt=new Date("2020-01-01");
 if(reason==="fully held")card.bookings=[{pointCost:8}];
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(booking.cardId).toBeNull();expect(card.remaining).toBe(8);expect(coupon).toBeNull();
});
it("fitness unbound leave never invokes music binding",async()=>{
 unpaid();m.$queryRaw.mockResolvedValue([]);
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(m.coursePointCard.findMany).not.toHaveBeenCalled();expect(card.remaining).toBe(8);expect(coupon).toBeNull();
});
async function adjustExpiry(expiresDate:string){
 await manageCourseCard(tx,actor,{expectedStoreId:actor.storeId,cardId:card.id,operation:"expiry",requestKey:crypto.randomUUID(),expectedRemaining:card.remaining,expectedExpiresAt:card.expiresAt.toISOString(),expiresDate,reason:"Synthetic reviewed expiry"});
}
async function reserveMakeup(at:Date){
 const source=booking;
 const session={...source.session,id:"makeup-session",startsAt:at,endsAt:new Date(at.getTime()+3600000),template:{isActive:true,visibility:"PUBLIC"}};
 m.courseSession.findFirst.mockResolvedValue(session);
 m.coursePointCard.findFirst.mockImplementation(async({where})=>where.id===coupon.id?coupon:card);
 m.courseBooking.findFirst.mockImplementation(async({where})=>where.id===source.id?source:null);
 m.courseBooking.create.mockImplementation(async({data})=>({...data,id:"makeup-booking",session,status:"RESERVED",card:coupon}));
 return reserveCourseInTransaction(tx,actor,{sessionId:session.id,cardId:coupon.id,customerId:source.customerId,requestKey:crypto.randomUUID()},null);
}
it.each(["2026-12-20","2027-02-01"])("keeps existing makeup bookable after source expiry becomes %s",async date=>{
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 const originalExpiry=coupon.expiresAt;
 await adjustExpiry(date);
 expect(card.musicValidityDays).toBeNull();expect(card.expiresAt).toEqual(new Date(date+"T15:59:59.999Z"));
 expect(coupon.expiresAt).toEqual(originalExpiry);
 expect(await isNativeMusicLeaveCard(tx,actor.storeId,card)).toBe(true);
 const makeup=await reserveMakeup(new Date("2026-12-01T11:00:00Z"));
 expect(makeup.cardId).toBe(coupon.id);
 // Repeated leave of the makeup preserves the same right without a second debit/grant.
 const source=booking;booking=makeup;m.courseBooking.findFirst.mockImplementation(async({where})=>where.id===source.id?source:booking);
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(card.remaining).toBe(7);expect(coupon.remaining).toBe(1);expect(m.coursePointCard.create).toHaveBeenCalledTimes(1);
});
it("still rejects makeup after its own expiry following source extension",async()=>{
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");await adjustExpiry("2027-03-01");
 await expect(reserveMakeup(new Date("2027-02-01T11:00:00Z"))).rejects.toThrow("方案已到期或不涵蓋上課日期");
});
it("manual expiry without native provenance does not authorize new leave rights",async()=>{
 card.musicValidityDays=null;
 expect(await isNativeMusicLeaveCard(tx,actor.storeId,card)).toBe(false);
});
it("future ordinary leave after manual expiry still deducts once and issues one right",async()=>{
 await adjustExpiry("2027-02-01");
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(card.remaining).toBe(7);expect(coupon?.remaining).toBe(1);expect(coupon?.expiresAt).toEqual(card.expiresAt);
 expect(m.coursePointCard.create).toHaveBeenCalledTimes(1);
});
it("does not retroactively bind a settled unpaid leave when a card is purchased later",async()=>{
 unpaid();m.coursePointCard.findMany.mockResolvedValue([]);
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 m.coursePointCard.findMany.mockResolvedValue([card]);
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(booking.cardId).toBeNull();expect(card.remaining).toBe(8);expect(coupon).toBeNull();
});
it("a manually fixed expiry is not replaced by first-use activation",async()=>{
 card.musicActivatedAt=null;await adjustExpiry("2027-02-01");
 await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
 expect(card.expiresAt).toEqual(new Date("2027-02-01T15:59:59.999Z"));
 expect(card.musicActivatedAt).toBeNull();expect(coupon?.expiresAt).toEqual(card.expiresAt);
});
