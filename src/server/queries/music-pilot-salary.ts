import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { courseManagerRead } from "@/server/services/course-access";
import { requireMusicFinance } from "@/server/services/music-finance-access";
import { readMusicPilotFeeProof } from "@/server/services/music-pilot-teacher-fee";
import { capturedTeacherFee,readTeacherFeeSeats,type CapturedTeacherFee } from "@/server/services/course-teacher-fee";
import { toLocalDateStr,formatTWDateTime } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import { PILOT_EVIDENCE_HASH,PILOT_EVIDENCE_ID } from "@/server/services/music-pilot-policy";
import { musicOpeningMakeupHash } from "@/lib/music-opening-makeup";
export async function readMusicPilotSalary(){
  const a=await courseManagerRead("teacher.settlement.read");
  await requireMusicFinance(a.user,a.storeId,"teacher.settlement.read");
  return coursePrisma.$transaction(async tx=>{
    const proof=await readMusicPilotFeeProof(tx,a.storeId);
    if(!proof)throw new AppError("VALIDATION","樣本鐘點來源尚未完成核對");
    const sessions=await tx.$queryRaw<Array<CapturedTeacherFee&{id:string;staffId:string;staffName:string;name:string;startsAt:Date;endsAt:Date;cancelledAt:Date|null}>>`SELECT s.id,s."nameSnapshot" AS name,s."startsAt",s."endsAt",s."cancelledAt",s."teacherAttendance",c."staffId",f."displayName" AS "staffName",c.rule,c.revision,c."musicPricePerLesson",c."musicTeacherFeeBase",c."musicTrialMode" FROM "CourseSession" s JOIN "CourseCompensationSnapshot" c ON c."sessionId"=s.id AND c."storeId"=s."storeId" JOIN "Staff" f ON f.id=c."staffId" AND f."storeId"=s."storeId" WHERE s."storeId"=${a.storeId} AND s."cancelledAt" IS NULL AND EXISTS(SELECT 1 FROM "CourseBooking" b WHERE b."sessionId"=s.id AND b."storeId"=s."storeId" AND b."customerId"=ANY(${[...proof.enrollments.map(e=>e.customerId),proof.trial.customerId]}::text[]) AND b.status<>'CANCELLED') ORDER BY s."startsAt",s.id`;
    const seats=await readTeacherFeeSeats(tx,a.storeId,sessions.map(s=>s.id));
    const rows=sessions.map(s=>{
      const all=seats.get(s.id)??[];
      // Full teacher fees remain authoritative; the sample report never hides an
      // unverified/non-sample seat in a class and silently calls it a full salary.
      const attended=all.map(b=>b.status==="RESERVED"?{...b,status:"ATTENDED"}:b);
      const first=attended.find(b=>b.status==="ATTENDED");
      const leave=attended.map(b=>b.id===first?.id?{...b,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"}:b);
      const noShow=attended.map(b=>b.id===first?.id?{...b,status:"NO_SHOW",absenceKind:null}:b);
      const scenarios={LIVE:capturedTeacherFee(s,all),ATTEND:capturedTeacherFee({...s,teacherAttendance:"SCHEDULED"},attended),LEAVE:capturedTeacherFee({...s,teacherAttendance:"SCHEDULED"},leave),NO_SHOW:capturedTeacherFee({...s,teacherAttendance:"SCHEDULED"},noShow),TEACHER_LEAVE:capturedTeacherFee({...s,teacherAttendance:"LEAVE"},attended)};
      const rule=s.rule as {mode?:string;value?:number};
      return {id:s.id,staffId:s.staffId,teacher:s.staffName,name:s.name,date:toLocalDateStr(s.startsAt),dateTime:formatTWDateTime(s.startsAt),future:s.endsAt>new Date(),rate:rule.mode==="SHARE"?`${rule.value}%`:rule.mode==="CLASS"?`${rule.value} 元／堂`:"待核對",students:all.filter(b=>b.status!=="CANCELLED").map(b=>b.customerName).join("、"),firstStudent:first?.customerName??"首位學員",scenarios};
    });
    const staff=await tx.$queryRaw<Array<{id:string;displayName:string}>>`SELECT id,"displayName" FROM "Staff" WHERE "storeId"=${a.storeId} AND id=ANY(${proof.teachers.map(t=>t.staffId)}::text[])`;
    const originals=await tx.$queryRaw<Array<{payload:unknown;contentHash:string}>>`SELECT payload,"contentHash" FROM "MusicSourceImportBatch" WHERE id=${PILOT_EVIDENCE_ID} AND "storeId"=${a.storeId}`;
    if(originals.length!==1||originals[0].contentHash!==PILOT_EVIDENCE_HASH||musicOpeningMakeupHash(originals[0].payload)!==PILOT_EVIDENCE_HASH)throw new AppError("VALIDATION","來源歷史核對碼不一致");
    const cell=z.object({text:z.string()});
    const original=z.object({students:z.array(z.object({id:z.string(),name:z.string()})),histories:z.array(z.object({studentId:z.string(),fees:z.object({groups:z.array(z.object({periods:z.array(z.object({fee:z.array(z.string()),lessons:z.array(z.object({tables:z.array(z.array(z.array(cell)))}))}))}))})}))}).parse(originals[0].payload);
    const historical=original.histories.flatMap(h=>h.fees.groups.flatMap(g=>g.periods.flatMap(p=>p.lessons[0].tables[1].slice(1).map(c=>{
      const teacher=c[2].text,sourceName=teacher==="李筱婧"?"李筱靖":teacher;
      const rate=proof.teachers.find(t=>staff.find(s=>s.id===t.staffId)?.displayName===sourceName)?.percent??null;
      const leave=c[0].text.includes("學生請假"),trial=c[0].text.includes("體驗")&&p.fee[2]==="吉他單人體驗課$800";
      return {student:original.students.find(s=>s.id===h.studentId)!.name,date:c[0].text,teacher:teacher||"來源簽到未列老師",rate,base:trial?800:null,amount:leave?0:trial&&rate!==null?800*rate/100:null};
    }))));
    return {rows,historical,oldMakeupPrice:proof.oldMakeup.originalUnitPrice,oldMakeupPercent:proof.teachers.find(t=>t.staffId==="music-luby-staff-li")!.percent};
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
export type MusicPilotSalaryReport=Awaited<ReturnType<typeof readMusicPilotSalary>>;
