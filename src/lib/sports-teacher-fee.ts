import { sportsCompensation } from "./sports-staging-types";
import type { TeacherFeeSeat, TeacherFeeResult } from "./teacher-fee-types";
/** Version 3 is only captured for newly scheduled sports classes. Never reinterpret legacy rules. */
export function calculateSportsTeacherFee(rule: unknown, seats: TeacherFeeSeat[]): TeacherFeeResult {
  const fail = (issue:string):TeacherFeeResult=>({amount:null,issue,details:[]});
  const parsed=sportsCompensation.safeParse(rule);
  if(!parsed.success)return fail("運動計酬設定待核對");
  if(seats.some(s=>s.status==="RESERVED"))return fail("尚有學員待點名");
  const due=seats.filter(s=>s.bookingKind!=="TEACHER_MAKEUP"&&(s.status==="ATTENDED"||s.status==="NO_SHOW"||s.absenceKind==="GROUP_LEAVE_FORFEITED"));
  if(!due.length)return {amount:0,issue:null,details:[]};
  if(parsed.data.mode==="HOUR"){
    const minutes=(rule as {durationMinutes?:number}).durationMinutes;
    if(!Number.isInteger(minutes)||minutes!<=0)return fail("授課時長待核對");
    const amount=Math.round(parsed.data.value*minutes!/60);
    return Number.isSafeInteger(amount)?{amount,issue:null,details:[]}:fail("授課費超過可計算範圍");
  }
  const details=due.map(s=>{
    const base=s.sportsCharge ?? null;
    return {id:s.id,name:s.customerName,base,amount:base===null?null:Math.round(base*parsed.data.value/100),reason:"運動原價使用額度拆帳"};
  });
  if(details.some(d=>d.amount===null))return {amount:null,issue:"原購買價格或使用額度待核對",details};
  const amount=details.reduce((sum,d)=>sum+d.amount!,0);
  return Number.isSafeInteger(amount)?{amount,issue:null,details}:fail("授課費超過可計算範圍");
}
