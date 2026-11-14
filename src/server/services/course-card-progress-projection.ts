import type {Prisma} from '../../../generated/course-client';
import type {SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
import {activeSessionAdjustments} from '@/lib/plan-session-adjustment';
import {courseDisplayName} from '@/lib/course-template-presentation';
import {parseTaipeiDateTime} from '@/lib/date-utils';
import type {CompletedLesson} from '@/components/admin/lesson-progress-grid';
type PurchaseInfo={canReadPrice:boolean;purchasePrice:number|null;purchasedAt:string|null};
const unavailable=(reason:string,purchase?:PurchaseInfo)=>({success:true as const,data:{available:false as const,reason,...purchase}});
export const progressCardSelect={id:true,unit:true,requestKey:true,musicOpeningStateRequired:true,members:{select:{customerId:true}},entries:{where:{kind:'GRANT'},select:{points:true}}} satisfies Prisma.CoursePointCardSelect;
export const progressBookingSelect={id:true,customerId:true,customerName:true,pointCost:true,status:true,absenceKind:true,session:{select:{startsAt:true,nameSnapshot:true}}} satisfies Prisma.CourseBookingSelect;
/** Only settled debits: deducted leave is proven by its current settlement ledger. */
export function progressBookingWhere(deductedLeaveIds:string[]):Prisma.CourseBookingWhereInput {
 return {pointCost:{gt:0},bookingKind:{not:'OPENING_MAKEUP'},OR:[{status:{in:['ATTENDED','NO_SHOW']}},{status:'CANCELLED',absenceKind:'GROUP_LEAVE_FORFEITED'},...(deductedLeaveIds.length?[{id:{in:deductedLeaveIds},status:'CANCELLED' as const,absenceKind:'STUDENT_LEAVE' as const}]:[])]};
}
type Card=Prisma.CoursePointCardGetPayload<{select:typeof progressCardSelect}>;
type Booking=Prisma.CourseBookingGetPayload<{select:typeof progressBookingSelect}>;
/** Shared projection: the single-card and batch readers keep identical bounds and privacy rules. */
export async function projectCourseCardProgress(card:Card,customerId:string,readUsage:()=>Promise<{bookings:Booking[];adjustments:SessionAdjustmentRecord[]}>,readPeople:(ids:string[])=>Promise<Array<{id:string;name:string}>>,readPurchase:(ids:string[])=>Promise<PurchaseInfo>){
   if(card.unit!=='SESSION'){
    const ids=[...new Set([customerId,...card.members.map(member=>member.customerId)])];
    const people=await readPeople(ids);
    if(ids.some(id=>!people.some(person=>person.id===id)))return unavailable('此共用方案的金額需由有權限的人員核對。');
    return unavailable('',await readPurchase(ids));
   }
   if(card.musicOpeningStateRequired||card.requestKey.startsWith('yjy-'))return unavailable('來源方案請由完整紀錄核對上課進度。');
   const total=card.entries.reduce((sum,e)=>sum+e.points,0);
   if(!Number.isInteger(total)||total<1||total>2000)return unavailable('方案總堂數待核對，請查看完整紀錄。');
   const {bookings,adjustments}=await readUsage();
   const backfills=activeSessionAdjustments(adjustments).filter(r=>r.operation==='BACKFILL');
   const voids=activeSessionAdjustments(adjustments).filter(r=>r.operation==='VOID');
   const ids=[...new Set([...card.members.map(m=>m.customerId),...bookings.map(b=>b.customerId),...backfills.map(r=>r.customerId),...voids.map(r=>r.customerId)].filter((id):id is string=>!!id))];
   const people=await readPeople(ids);
   const visible=new Map(people.map(p=>[p.id,p.name]));
   if(ids.some(id=>!visible.has(id))||bookings.some(b=>!b.customerId))return unavailable('此共用方案含其他學員的紀錄，請查看你有權限讀取的完整紀錄。');
   if(bookings.length>2000||bookings.some(b=>b.pointCost!==1)||backfills.some(r=>!r.occurredOn||!parseTaipeiDateTime(r.occurredOn,'00:00')))return unavailable('部分上課資料需核對，請查看完整紀錄。');
   if(voids.some(r=>!Number.isSafeInteger(r.quantity)||r.quantity<1||!Number.isFinite(Date.parse(r.recordedAt)))||bookings.length+backfills.reduce((sum,r)=>sum+r.quantity,0)+voids.reduce((sum,r)=>sum+r.quantity,0)>total)return unavailable('使用紀錄與方案總堂數待核對，請查看完整紀錄。');
   const completed:CompletedLesson[]=[...bookings.map(b=>({id:b.id,date:b.session.startsAt.toISOString(),customerName:visible.get(b.customerId!)!,courseName:courseDisplayName(b.session.nameSnapshot),...(b.status==='NO_SHOW'?{usageKind:'NO_SHOW' as const}:b.status==='CANCELLED'?{usageKind:'LEAVE' as const}:{})})),...backfills.flatMap(r=>Array.from({length:r.quantity},(_,i)=>({id:`${r.id}:${i}`,date:parseTaipeiDateTime(r.occurredOn!,'00:00')!.toISOString(),customerName:visible.get(r.customerId)!})))];
   if(completed.length>total)return unavailable('上課筆數與方案總堂數待核對，請查看完整紀錄。');
   completed.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
   const voided:CompletedLesson[]=voids.flatMap(r=>Array.from({length:r.quantity},(_,i)=>({id:`void:${r.id}:${i}`,date:r.recordedAt,customerName:visible.get(r.customerId)!})));
   const purchase=await readPurchase(ids);
   return {success:true as const,data:{available:true as const,total,completed,voided,shared:ids.length>1,...purchase}};
}
