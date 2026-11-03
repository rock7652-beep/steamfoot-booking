import {receiveMusicTuition} from "./music-tuition";
import {toLocalDateStr} from "@/lib/date-utils";
import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { dayRange } from "@/lib/date-utils";
import { assignCourseWithCheckout } from "./course-assignment-checkout";
import { reserveCourseInTransaction, settleCourseBooking, correctCourseAttendance, type CourseActor } from "./course-booking";
import { readMusicPilotTuition } from "./music-pilot-policy";
import { NATIVE_MAKEUP_PREFIX } from "./music-native-leave";
import { readTeacherFeeSeats } from "./course-teacher-fee";
import { musicDataSeparationEnabled } from "./music-data-scope";
function ensure(ok:unknown,message:string):asserts ok {if(!ok)throw new AppError("CONFLICT",`新購課流程未通過：${message}`);}
/** Called only inside the authorized rollback harness. Future lessons exercise live booking rules;
 * the separate completed-lesson payroll harness exercises actual payment services. */
export async function testNativeMusicLifecycle(tx:Prisma.TransactionClient,actor:CourseActor) {
  ensure(musicDataSeparationEnabled(actor.storeId),"僅限指定隔離測試站");
  const students=await readMusicPilotTuition(tx,actor.storeId);
  ensure(students.length===10&&new Set(students.map(s=>s.customerId)).size===10,"十位來源學員不齊");
  const template=await tx.courseTemplate.findFirst({where:{storeId:actor.storeId,isActive:true,visibility:"PUBLIC",musicSubject:{isActive:true},musicSubjectId:{not:null},classType:"PRIVATE",musicTrialMode:null},orderBy:{id:"asc"}});
  const source=await tx.courseSession.findFirst({where:{storeId:actor.storeId,id:{startsWith:"yjy-pilot-session:"}},orderBy:{id:"asc"}});
  ensure(template&&source,"找不到測試項目及教室老師");
  const alternate=await tx.courseTemplate.create({data:{storeId:actor.storeId,musicSubjectId:template.musicSubjectId,name:"[自動復原] 同項目另一學費版本 "+crypto.randomUUID(),classType:template.classType,durationMinutes:60,capacity:1,pointCost:1}});
  const plan=await tx.coursePointPlan.create({data:{storeId:actor.storeId,name:"[自動復原] 新購課流程",unit:"SESSION",points:2,price:800,validDays:70,musicTerms:1,musicTermSizes:[2],templateIds:[alternate.id]}});
  const checks:string[]=[];
  let sequence=0;
  for(const student of students){
    const key=crypto.randomUUID();
    const input={planId:plan.id,customerId:student.customerId,expiresDate:"2099-12-31",requestKey:key,expectedListPrice:800,expectedStoreCost:0,revenueStaffId:"",discountKind:"AMOUNT" as const,discountValue:160,musicReceived:200,musicPaymentDate:toLocalDateStr(),musicDiscountTeacherFee:sequence%2===0,paymentMethod:"OTHER" as const,transferLastFour:""};
    const purchase=await assignCourseWithCheckout(tx,{...actor,music:true},input);
    const replay=await assignCourseWithCheckout(tx,{...actor,music:true},input);
    ensure(purchase.id===replay.id&&purchase.cardId,"購課重送產生重複交易");
    const receiptInput={purchaseId:purchase.id,amount:440,paymentDate:toLocalDateStr(),method:"OTHER",lastFour:"",requestKey:key+":topup",expectedReceived:200};
    await receiveMusicTuition(tx,actor,receiptInput);
    await receiveMusicTuition(tx,actor,receiptInput);
    const replayAfterPayment=await assignCourseWithCheckout(tx,{...actor,music:true},input);
    ensure(replayAfterPayment.id===purchase.id,"補繳後購課重送新增課卡");
    ensure(await tx.coursePointEntry.count({where:{storeId:actor.storeId,cardId:purchase.cardId,kind:"GRANT"}})===1,"補繳重複增加堂數");
    const makeSession=async(offset:number)=>{
      const startsAt=dayRange("2098-01-06").start;
      startsAt.setTime(startsAt.getTime()+(sequence*2+offset)*3600000);
      return tx.courseSession.create({data:{storeId:actor.storeId,templateId:template.id,roomId:source.roomId,coachId:source.coachId,nameSnapshot:"[自動復原] 新購課流程",startsAt,endsAt:new Date(startsAt.getTime()+3600000),pointCost:1,capacity:1,requestKey:key,requestIndex:offset,createdById:actor.userId}});
    };
    const original=await makeSession(0),makeup=await makeSession(1);sequence++;
    const booking=await reserveCourseInTransaction(tx,actor,{sessionId:original.id,cardId:purchase.cardId,customerId:student.customerId,requestKey:key+":reserve"},null);
    await settleCourseBooking(tx,actor,booking.id,"ATTENDED");
    await correctCourseAttendance(tx,actor,booking.id,"RESERVED","ATTENDED");
    await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
    await settleCourseBooking(tx,actor,booking.id,"STUDENT_LEAVE");
    const card=await tx.coursePointCard.findUniqueOrThrow({where:{id:purchase.cardId}});
    const coupon=await tx.coursePointCard.findUniqueOrThrow({where:{storeId_requestKey:{storeId:actor.storeId,requestKey:NATIVE_MAKEUP_PREFIX+booking.id}}});
    ensure(card.remaining===1&&coupon.remaining===1&&card.expiresAt?.getTime()===coupon.expiresAt?.getTime(),"請假扣堂或同期限補課不一致");
    const mb=await reserveCourseInTransaction(tx,actor,{sessionId:makeup.id,cardId:coupon.id,customerId:student.customerId,requestKey:key+":makeup"},null);
    let blocked=false;try{await correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED");}catch(e){if(e instanceof AppError&&e.message.includes("補課已預約"))blocked=true;else throw e;}
    ensure(blocked,"已安排補課仍能返還原堂數");
    await settleCourseBooking(tx,actor,mb.id,"ATTENDED");
    await settleCourseBooking(tx,actor,mb.id,"ATTENDED");
    const fees=await readTeacherFeeSeats(tx,actor.storeId,[original.id,makeup.id]);
    ensure(fees.get(original.id)?.[0].absenceKind==="STUDENT_LEAVE"&&fees.get(makeup.id)?.[0].originalUnitPrice===(input.musicDiscountTeacherFee?320:400),"補課鐘點未帶回原購課單價");
    await correctCourseAttendance(tx,actor,mb.id,"RESERVED","ATTENDED");
    await settleCourseBooking(tx,actor,mb.id,"CANCELLED");
    await correctCourseAttendance(tx,actor,booking.id,"RESERVED","CANCELLED");
    const restored=await tx.coursePointCard.findUniqueOrThrow({where:{id:card.id}});
    ensure(restored.remaining===2,"更正後堂數未復原");
    const cash=await tx.$queryRaw<Array<{count:bigint;amount:bigint}>>`SELECT count(*) AS count,sum(amount)::bigint AS amount FROM "CashbookEntry" WHERE "storeId"=${actor.storeId} AND id IN (SELECT 'music-receipt:'||id FROM "CourseMusicReceipt" WHERE "storeId"=${actor.storeId} AND "purchaseId"=${purchase.id})`;
    ensure(Number(cash[0].count)===2&&Number(cash[0].amount)===640,"購課收款重複或金額不符");
    checks.push(`${booking.customerName}：應收 640／首收 200／補繳 440、防重複發卡、同項目跨方案預約、出席更正、請假同期限補課及防重複通過`);
  }
  return checks;
}
