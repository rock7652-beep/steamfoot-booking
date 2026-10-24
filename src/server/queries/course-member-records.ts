import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { readMusicTuition, readMusicReceipts } from "@/server/services/music-tuition";
import { readMusicLessonAssignments } from "@/server/services/music-lesson-periods";
import { musicTuitionPeriods } from "@/lib/music-tuition";
import { courseBookingWasDebited } from "@/lib/course-debit-policy";
import { courseDisplayName } from "@/lib/course-template-presentation";

/** Called only with the authenticated portal identity (or authorized read-only preview).
 * Never accepts a browser-supplied member ID and never loads another payer's orders.
 */
export async function getCourseMemberRecords(storeId: string, customerId: string, music: boolean) {
  const [orders, cards] = await Promise.all([
    coursePrisma.coursePurchase.findMany({where:{storeId,customerId}, include:{refunds:{where:{storeId},orderBy:{createdAt:"asc"}}},orderBy:[{createdAt:"desc"},{id:"asc"}]}),
    coursePrisma.coursePointCard.findMany({where:{storeId,members:{some:{storeId,customerId}}},select:{id:true,musicTermSizes:true,templateIds:true}}),
  ]);
  const bookings = cards.length ? await coursePrisma.courseBooking.findMany({
    where:{storeId,cardId:{in:cards.map(c=>c.id)},OR:[{customerId},{reserverCustomerId:customerId}]},
    select:{id:true,cardId:true,customerId:true,customerName:true,status:true,absenceKind:true,pointCost:true,session:{select:{nameSnapshot:true,startsAt:true,cancelledAt:true}}},
    orderBy:[{session:{startsAt:"asc"}},{id:"asc"}],
  }) : [];
  const [tuition, receipts, assignments] = music ? await Promise.all([
    readMusicTuition(coursePrisma,storeId,orders.map(o=>o.id)),
    readMusicReceipts(coursePrisma,storeId,orders.map(o=>o.id)),
    readMusicLessonAssignments(coursePrisma,storeId,bookings.map(b=>b.id)),
  ]) : [new Map(),[],[]] as const;
  return orders.map(order=>{
    const card=cards.find(c=>c.id===order.cardId);
    const agreed=tuition.get(order.id)?.due as number|undefined;
    const received=order.status==="PENDING"?0:order.price;
    const paid=receipts.filter(r=>r.purchaseId===order.id);
    // Multiple purchases on one legacy card have no immutable purchase/lesson key.
    // Keep their financial records, but do not invent a lesson or period allocation.
    const uniqueCardPurchase=!!card && orders.filter(o=>o.cardId===card.id).length===1;
    const periods=music&&uniqueCardPurchase&&agreed!==undefined&&received<=agreed
      ? musicTuitionPeriods(card.musicTermSizes,agreed,received) : [];
    const lessons=uniqueCardPurchase ? bookings.filter(b=>b.cardId===card.id).map(b=>{
      const assignment=assignments.find(a=>a.bookingId===b.id&&a.customerId===b.customerId);
      return {id:b.id,name:courseDisplayName(b.session.nameSnapshot),date:b.session.startsAt.toISOString(),learner:b.customerName,status:b.session.cancelledAt?"停課":b.absenceKind==="STUDENT_LEAVE"||b.absenceKind==="GROUP_LEAVE_FORFEITED"?"請假":b.absenceKind==="TEACHER_ABSENT"?"教師未授課":({ATTENDED:"已出席",NO_SHOW:"未到",CANCELLED:"已取消",RESERVED:"待上課"}[b.status]??"待確認"),period:assignment?.period??null,ordinal:assignment?.ordinal??null,used:courseBookingWasDebited(b)?b.pointCost:0,unit:order.unit};
    }) : [];
    return {id:order.id,cardId:order.cardId,name:order.name,termSizes:order.musicTermSizes??[],templateIds:order.templateIds,date:order.createdAt.toISOString(),status:order.status,unit:order.unit,points:order.points,due:agreed??(order.status==="PENDING"?order.price:null),received,periods,lessons,
      lessonsAvailable:uniqueCardPurchase,
      receipts:paid.length?paid.map(r=>({id:r.id,amount:r.amount,date:r.paidAt.toISOString(),method:r.method}))
        : order.status!=="PENDING"&&order.price>0?[{id:order.id,amount:order.price,date:(order.confirmedAt??order.createdAt).toISOString(),method:order.paymentMethod??"OTHER"}]:[],
      refunds:order.refunds.map(r=>({id:r.id,amount:r.amount,date:r.createdAt.toISOString(),method:r.method})),
    };
  });
}
export type CourseMemberRecords = Awaited<ReturnType<typeof getCourseMemberRecords>>;
