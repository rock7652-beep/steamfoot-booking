vi.mock("@/server/services/course-store-notices",()=>({recordCourseStoreNotice:vi.fn()}));
import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:(storeId:string)=>storeId==="synthetic-store"}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
vi.mock("../../scripts/music-opening-preview-scope.mjs",()=>({assertMusicOpeningPreviewEnvironment:vi.fn()}));
import {settleCourseBooking,correctCourseAttendance} from "@/server/services/course-booking";
import {PILOT_EVIDENCE_HASH} from "@/server/services/music-pilot-policy";
import type {Prisma} from "../../generated/course-client";
// Transaction doubles contain only fields exercised by these lifecycle tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let card:any,booking:any,coupon:any;
const m={coursePurchase:{count:vi.fn()},courseBooking:{findFirst:vi.fn(),findMany:vi.fn(),count:vi.fn(),aggregate:vi.fn(),update:vi.fn()},coursePointCard:{findMany:vi.fn(),findFirst:vi.fn(),findUnique:vi.fn(),create:vi.fn(),update:vi.fn(),updateMany:vi.fn()},coursePointEntry:{create:vi.fn(),findUnique:vi.fn()},courseSession:{findFirst:vi.fn(),update:vi.fn()},courseTemplate:{findFirst:vi.fn()},$queryRaw:vi.fn(),$executeRaw:vi.fn()};
const tx=m as unknown as Prisma.TransactionClient;
const actor={storeId:"synthetic-store",userId:"synthetic-actor",name:"Synthetic"};
beforeEach(()=>{
 vi.resetAllMocks();m.coursePointCard.findMany.mockResolvedValue([]);m.coursePurchase.count.mockResolvedValue(1);vi.stubEnv("VERCEL","1");coupon=null;
 card={id:"synthetic-card",requestKey:"native-checkout:synthetic",unit:"SESSION",remaining:8,expiresAt:new Date("2027-01-10T15:59:59.999Z"),musicActivatedAt:new Date("2026-11-02T11:00:00Z"),musicValidityDays:70,planId:"synthetic-plan",templateIds:["synthetic-template"],nameSnapshot:"Synthetic group",members:[{customerId:"synthetic-student"}]};
 booking={id:"synthetic-booking",storeId:actor.storeId,cardId:card.id,card,customerId:"synthetic-student",sessionId:"synthetic-session",session:{id:"synthetic-session",templateId:"synthetic-template",startsAt:new Date("2026-11-02T11:00:00Z"),endsAt:new Date("2026-11-02T12:00:00Z"),capacity:3,teacherAttendance:"SCHEDULED",releasedAt:null},status:"RESERVED",absenceKind:null,pointCost:1,bookingKind:"CARD",makeupForBookingId:null};
 m.$queryRaw.mockResolvedValue([{featureKey:"business.music",afterJson:{contentHash:PILOT_EVIDENCE_HASH,cardIds:[card.id]}}]);
 m.courseBooking.findFirst.mockImplementation(async(args)=>typeof args.where.id === "string" ? booking : null);m.courseBooking.findMany.mockResolvedValue([]);m.courseBooking.count.mockResolvedValue(0);m.courseBooking.aggregate.mockResolvedValue({_sum:{pointCost:0}});
 m.courseBooking.update.mockImplementation(async({data})=>Object.assign(booking,data));
 m.coursePointCard.findFirst.mockImplementation(async()=>card);m.coursePointCard.findUnique.mockImplementation(async({where})=>where.storeId_requestKey.requestKey.startsWith("music-leave-makeup:")?coupon:null);
 m.coursePointCard.updateMany.mockImplementation(async({data})=>{card.remaining-=data.remaining.decrement;return {count:1};});
 m.coursePointCard.create.mockImplementation(async({data})=>{coupon={...data,members:[{customerId:"synthetic-student"}],closedAt:null};return coupon;});
 m.coursePointCard.update.mockImplementation(async({where,data})=>{if(where.id===card.id){if(data.remaining?.increment)card.remaining+=data.remaining.increment;}else Object.assign(coupon,data);return data;});
 m.courseTemplate.findFirst.mockResolvedValue({classType:"GROUP"});m.courseSession.findFirst.mockResolvedValue(null);
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
