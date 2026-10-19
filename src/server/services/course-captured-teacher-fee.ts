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
  if (snapshot.cancelledAt || ["LEAVE","NO_SHOW"].includes(snapshot.teacherAttendance??"")) return {amount:0,issue:null,details:[]};
  if(snapshot.revision===0)return {amount:null,issue:"舊課次費率待核對",details:[]};
  if(snapshot.rule && typeof snapshot.rule==="object" && "calculationVersion" in snapshot.rule && snapshot.rule.calculationVersion===3)return calculateSportsTeacherFee(snapshot.rule,seats);
  if(isTeacherFeeV2(snapshot.rule))return calculateMusicTeacherFee({rule:snapshot.rule,teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats});
  const due=seats.filter(s=>s.bookingKind!=="TEACHER_MAKEUP"&&(s.status==="ATTENDED"||s.status==="NO_SHOW"||s.absenceKind==="GROUP_LEAVE_FORFEITED"));
  const free=due.filter(s=>s.bookingKind==="TRIAL"&&snapshot.musicTrialMode==="FREE").length;
  const amount=calculateLegacyTeacherFee(snapshot.rule,{paid:due.length-free,freeTrial:free,pending:seats.filter(s=>s.status==="RESERVED").length},{perLesson:snapshot.musicPricePerLesson??null,freeTrialBase:snapshot.musicTeacherFeeBase??null});
  return {amount,issue:amount===null?"舊課次費率或點名待核對":null,details:[]};
}
