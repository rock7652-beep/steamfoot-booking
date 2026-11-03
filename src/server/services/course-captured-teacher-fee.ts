import {compensationRule} from "@/lib/course-compensation";
import {isMusicOpeningMakeupBooking,MUSIC_OPENING_MAKEUP_FEE_ISSUE} from "@/lib/music-opening-runtime";
import "server-only";
import {calculateSportsTeacherFee} from "@/lib/sports-teacher-fee";

/** Dispatch only by immutable calculationVersion; never use the current store profile. */
import { calculateLegacyTeacherFee } from "@/lib/course-legacy-teacher-fee";
import { calculateMusicTeacherFee } from "@/lib/music-teacher-fee";
import type { TeacherFeeSeat } from "@/lib/teacher-fee-types";
import { isTeacherFeeV2, type TeacherFeeResult } from "@/lib/course-teacher-fee";
export type CapturedTeacherFee = {
  rule:unknown;revision?:number;teacherAttendance?:string;cancelledAt?:Date|null;
  musicTrialMode?:string|null;musicTeacherFeeBase?:number|null;musicPricePerLesson?:number|null;
};
export function capturedTeacherFee(snapshot:CapturedTeacherFee,seats:TeacherFeeSeat[]):TeacherFeeResult {
  if (seats.some(s=>isMusicOpeningMakeupBooking(s)&&!s.verifiedOpeningMakeupFee)) return {amount:null,issue:MUSIC_OPENING_MAKEUP_FEE_ISSUE,details:[]};
  if (snapshot.cancelledAt || ["LEAVE","NO_SHOW"].includes(snapshot.teacherAttendance??"")) return {amount:0,issue:null,details:[]};
  if (seats.some(seat => seat.openingIssue)) return {amount:null,issue:seats.find(seat => seat.openingIssue)!.openingIssue!,details:[]};
  if (seats.some(seat => seat.openingPriceSource||seat.verifiedOpeningMakeupFee) && !isTeacherFeeV2(snapshot.rule)) return {amount:null,issue:"期初方案尚未核對此計薪版本",details:[]};
  if(snapshot.revision===0)return {amount:null,issue:"舊課次費率待核對",details:[]};
  if(snapshot.rule && typeof snapshot.rule==="object" && "calculationVersion" in snapshot.rule && snapshot.rule.calculationVersion===3)return calculateSportsTeacherFee(snapshot.rule,seats);
  const rule=snapshot.rule as {tuitionRules?:Record<string,unknown>;tuitionRuleVersion?:number;mode?:string;value?:number}|null;
  if(rule?.tuitionRules){
    if(seats.some(seat=>seat.status==="RESERVED"))return {amount:null,issue:"尚有學員待點名",details:[]};
    const due=seats.filter(seat=>seat.bookingKind!=="TEACHER_MAKEUP"&&(seat.status==="ATTENDED"||seat.status==="NO_SHOW"||seat.absenceKind==="GROUP_LEAVE_FORFEITED"));
    if(!due.length)return {amount:0,issue:null,details:[]};
    const selected=due.map(seat=>({seat,fee:seat.tuitionTemplateId&&rule.tuitionRules?.[seat.tuitionTemplateId]|| (rule.tuitionRuleVersion===1?{mode:"UNSET"}:rule)}));
    const parsed=selected.map(({fee})=>compensationRule.safeParse(fee));
    if(parsed.some(fee=>!fee.success||fee.data.mode==="HOUR"))return {amount:null,issue:"學員收費方式拆帳比例待核對",details:[]};
    const fixed=parsed.some(fee=>fee.success&&fee.data.mode==="CLASS");
    if(fixed){
      const keys=new Set(parsed.map(fee=>fee.success?`${fee.data.mode}:${fee.data.value}`:""));
      if(keys.size!==1)return {amount:null,issue:"同堂固定鐘點與拆帳規則不同，請核對",details:[]};
      return calculateMusicTeacherFee({rule:selected[0].fee,teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats});
    }
    // Round each learner using their captured tuition rule, then sum once per class.
    const results=selected.map(({seat,fee})=>calculateMusicTeacherFee({rule:fee,teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats:[seat]}));
    const details=results.flatMap(result=>result.details);
    const issue=results.find(result=>result.amount===null)?.issue;
    if(results.some(result=>result.amount===null))return {amount:null,issue:issue??"學員拆帳待核對",details};
    const amount=results.reduce((sum,result)=>sum+result.amount!,0);
    return Number.isSafeInteger(amount)?{amount,issue:null,details}:{amount:null,issue:"授課費超過可計算範圍",details};
  }
  if(isTeacherFeeV2(snapshot.rule))return calculateMusicTeacherFee({rule:snapshot.rule,teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats});
  const due=seats.filter(s=>s.bookingKind!=="TEACHER_MAKEUP"&&(s.status==="ATTENDED"||s.status==="NO_SHOW"||s.absenceKind==="GROUP_LEAVE_FORFEITED"));
  const free=due.filter(s=>s.bookingKind==="TRIAL"&&snapshot.musicTrialMode==="FREE").length;
  const amount=calculateLegacyTeacherFee(snapshot.rule,{paid:due.length-free,freeTrial:free,pending:seats.filter(s=>s.status==="RESERVED").length},{perLesson:snapshot.musicPricePerLesson??null,freeTrialBase:snapshot.musicTeacherFeeBase??null});
  return {amount,issue:amount===null?"舊課次費率或點名待核對":null,details:[]};
}
