import type {SettlementDetailRow} from '@/server/queries/staff-settlement';
import type {SettlementLine} from './course-monthly-settlement';
/** Presentation only: use the original counted flag; rent never participates. */
export function steamfootMonthlyLines(people:readonly {id:string;name:string;details:readonly SettlementDetailRow[]}[]):SettlementLine[]{
 return people.flatMap(person=>person.details.map(row=>{
  const amount=row.needsReview?null:row.counted?row.amount:0;
  const date=row.bookingDate.toISOString().slice(0,10);
  const type=row.isMakeup?'補課':row.bookingType==='FIRST_TRIAL'?'體驗':row.bookingType==='SINGLE'?'單次':'方案';
  return {kind:'FEE' as const,id:row.bookingId,staffId:person.id,name:person.name,label:`${row.customerName} · ${row.planName??type}`,date:`${date}T${row.slotTime.slice(0,5)}:00+08:00`,amount,paid:0,issue:row.needsReview?'服務收入待核對':null,payments:[],feeDetails:[{name:'服務人員',base:row.amount,amount,reason:`${row.serviceStaffName} · ${type}${row.counted?'':row.needsReview?' · 待核對':' · 未計入人員收入'}`},...(row.purchasedPrice!==undefined&&row.totalSessions?[{name:row.planName??'方案',base:row.purchasedPrice,amount:row.amount,reason:`方案總價 ÷ ${row.totalSessions} 堂`}]:[])]};
 }));
}
