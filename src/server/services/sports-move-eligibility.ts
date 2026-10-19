import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {hasEffectiveCourseDebit} from "@/lib/sports-move-policy";
export async function sportsMoveBlockedReason(tx:Pick<Prisma.TransactionClient,"courseBooking"|"coursePointEntry"|"courseTrialPayment"|"courseFeePayment">,storeId:string,session:{id:string;startsAt:Date},now=new Date()) {
  if(session.startsAt<=now)return "課程已開始，無法變更時間或教練；請保留原鐘點紀錄。";
  const [attendance,entries,payment,fee]=await Promise.all([
    tx.courseBooking.findFirst({where:{storeId,sessionId:session.id,OR:[{status:{in:["ATTENDED","NO_SHOW"]}},{checkedInAt:{not:null}},{absenceKind:"GROUP_LEAVE_FORFEITED"}]},select:{id:true}}),
    tx.coursePointEntry.findMany({where:{storeId,booking:{sessionId:session.id}},select:{bookingId:true,cardId:true,kind:true,points:true}}),
    tx.courseTrialPayment.findFirst({where:{storeId,booking:{sessionId:session.id},status:"SUCCESS"},select:{id:true}}),
    tx.courseFeePayment.findFirst({where:{storeId,sessionId:session.id,voidedAt:null},select:{id:true}}),
  ]);
  if(attendance)return "本堂仍有出席或曠課紀錄，請先更正出席狀態。";
  if(hasEffectiveCourseDebit(entries))return "本堂仍有未沖回或待核對的扣抵，請先核對原紀錄。";
  if(payment)return "本堂已有體驗收款，請先核對收款紀錄。";
  if(fee)return "本堂授課費已付款，請先核對鐘點紀錄。";
  return null;
}
