import "server-only";
import {musicDataSeparationEnabled} from "@/server/services/music-data-scope";

import {readMusicTuition,readMusicReceipts} from "@/server/services/music-tuition";
import {musicTuitionPeriods} from "@/lib/music-tuition";
import {checkPermission} from "@/lib/permissions";
import {toLocalDateStr} from "@/lib/date-utils";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { courseManagerRead } from "@/server/services/course-access";
import { courseHistoryRange } from "@/lib/course-history-range";

export async function readCourseCustomerPurchases(input: unknown, offset = 0, range: {from?:string;to?:string} = {}, previewOnly=false) {
  try {
    const skip = z.number().int().min(0).max(1000000).parse(offset);
    const customerId = z.string().min(1).max(100).parse(input);
    const [actor,financialActor] = await Promise.all([courseManagerRead("customer.read"),courseManagerRead("transaction.read")]);
    const {storeId,user}=actor;
    if(financialActor.storeId!==storeId)throw new AppError("FORBIDDEN","店家範圍不一致");
    if(previewOnly&&!musicDataSeparationEnabled(storeId))throw new AppError("FORBIDDEN","僅供音樂測試站");
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { id: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const orders = await coursePrisma.coursePurchase.findMany({
      where: { storeId, customerId, createdAt: courseHistoryRange(range) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: 11,
      select: {
        musicTermSizes:true, cardId:true, id: true, name: true, price: true, points: true, unit: true, status: true,
        listPrice: true, discountKind: true, discountValue: true, paymentMethod: true, transferLastFour: true,
        createdAt: true, confirmedAt: true, note: true, voidReason: true,
        refunds: { where: { storeId }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, method: true, reason: true, createdAt: true } },
      },
    });
    const [tuition,receipts]=await Promise.all([readMusicTuition(coursePrisma,storeId,orders.map(o=>o.id)),readMusicReceipts(coursePrisma,storeId,orders.map(o=>o.id))]);
    const [canReadBookings,canReceive]=tuition.size>0?await Promise.all([checkPermission(user.role,user.staffId,"booking.read"),checkPermission(user.role,user.staffId,"transaction.create")]):[false,false];
    const ledgerCardIds=orders.filter(o=>tuition.has(o.id)).flatMap(o=>o.cardId?[o.cardId]:[]);
    const [cards,lessons]=await Promise.all([
      ledgerCardIds.length?coursePrisma.coursePointCard.findMany({where:{storeId,id:{in:ledgerCardIds}},select:{id:true,expiresAt:true,musicActivatedAt:true,musicValidityDays:true}}):[],
      canReadBookings?coursePrisma.courseBooking.findMany({where:{storeId,customerId,cardId:{in:ledgerCardIds},OR:[{status:{not:"CANCELLED"}},{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}}]},select:{id:true,cardId:true,status:true,absenceKind:true,session:{select:{startsAt:true,nameSnapshot:true,coachId:true}}},orderBy:[{session:{startsAt:"asc"}},{id:"asc"}]}):[],
    ]);
    const teachers=lessons.length?await prisma.staff.findMany({where:{storeId,id:{in:[...new Set(lessons.map(l=>l.session.coachId))]}},select:{id:true,displayName:true}}):[];
    return { success: true as const, hasMore: orders.length > 10, data: orders.slice(0,10).map(order => ({
      ...order,
      tuition:tuition.has(order.id)?{canReceive,canReadBookings,expiry:(()=>{const c=cards.find(c=>c.id===order.cardId);return c?.musicValidityDays&&!c.musicActivatedAt?`首次扣堂起 ${c.musicValidityDays} 天`:c?.expiresAt?toLocalDateStr(c.expiresAt):"待核對";})(),lessons:lessons.filter(l=>l.cardId===order.cardId).map((l,i)=>({id:l.id,ordinal:i+1,date:l.session.startsAt.toISOString(),teacher:teachers.find(t=>t.id===l.session.coachId)?.displayName??"待核對",status:l.absenceKind==="STUDENT_LEAVE"?"請假／另給補課":l.absenceKind==="GROUP_LEAVE_FORFEITED"?"請假":l.status==="ATTENDED"?"已出席":l.status==="NO_SHOW"?"曠課":l.status==="CHECKED_IN"?"已報到":"待上課"})),due:tuition.get(order.id)!.due,discountTeacherFee:tuition.get(order.id)!.discountTeacherFee,periods:musicTuitionPeriods(order.musicTermSizes,tuition.get(order.id)!.due,order.price),receipts:receipts.filter(r=>r.purchaseId===order.id).map(r=>({id:r.id,amount:r.amount,method:r.method,lastFour:r.lastFour,paidAt:r.paidAt.toISOString()}))}:null,
      discountValue: order.discountValue == null ? null : Number(order.discountValue), createdAt: order.createdAt.toISOString(), confirmedAt: order.confirmedAt?.toISOString() ?? null,
      refunds: order.refunds.map(refund => ({ ...refund, createdAt: refund.createdAt.toISOString() })),
    })) };
  } catch (error) { const failure=handleActionError(error); return {success:false as const,error:failure.success?"讀取失敗":failure.error}; }
}
