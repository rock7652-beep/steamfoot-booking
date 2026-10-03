import { expect, it } from "vitest";
import { calculateTeacherFee, originalMusicUnitPrice, type TeacherFeeSeat } from "@/lib/course-teacher-fee";
const seat:TeacherFeeSeat={id:"a",customerName:"甲",status:"ATTENDED",bookingKind:"CARD",absenceKind:null,originalUnitPrice:650};
const rule={mode:"SHARE",value:65};
it("rounds each learner before summing",()=>expect(calculateTeacherFee({rule,seats:[seat,{...seat,id:"b"}]}).amount).toBe(846));
it("keeps original price when discounting or gifting",()=>expect(originalMusicUnitPrice({listPrice:9600,points:13,musicBonusLessons:1})).toBe(800));
it("does not guess an ambiguous or missing historical price",()=>{expect(originalMusicUnitPrice({listPrice:null,points:4,musicBonusLessons:0})).toBeNull();expect(originalMusicUnitPrice({listPrice:1000,points:3,musicBonusLessons:0})).toBeNull();});
it("different purchased prices remain independent",()=>expect(calculateTeacherFee({rule,seats:[seat,{...seat,id:"b",originalUnitPrice:800}]}).amount).toBe(943));
it("leave and no-show teachers earn zero",()=>{for(const teacherAttendance of ["LEAVE","NO_SHOW"])expect(calculateTeacherFee({rule,teacherAttendance,seats:[seat]}).amount).toBe(0);});
it("counts learner absence only when chargeable and excludes teacher makeup",()=>expect(calculateTeacherFee({rule,seats:[{...seat,status:"NO_SHOW"},{...seat,id:"b",status:"CANCELLED",absenceKind:"GROUP_LEAVE_FORFEITED"},{...seat,id:"c",status:"CANCELLED",absenceKind:"LEAVE"},{...seat,id:"d",bookingKind:"TEACHER_MAKEUP"}]}).amount).toBe(846));
it("pending, missing and zero are distinct",()=>{expect(calculateTeacherFee({rule,seats:[{...seat,status:"RESERVED"}]}).issue).toBe("尚有學員待點名");expect(calculateTeacherFee({rule,seats:[{...seat,originalUnitPrice:null}]}).amount).toBeNull();expect(calculateTeacherFee({rule,seats:[{...seat,originalUnitPrice:0}]}).amount).toBe(0);});
it("fixed class pay is not multiplied by headcount",()=>expect(calculateTeacherFee({rule:{mode:"CLASS",value:600},seats:Array(15).fill(seat)}).amount).toBe(600));
it("uses configured free trial base and substitute teacher rule",()=>expect(calculateTeacherFee({rule:{mode:"SHARE",value:55},trialMode:"FREE",trialBase:325,seats:[{...seat,bookingKind:"TRIAL"}]}).amount).toBe(179));
it("does not pay fixed class fees again for free teacher makeup or non-chargeable leave",()=>{
 const fixed={mode:"CLASS",value:1200};
 for(const seats of [[],[{...seat,bookingKind:"TEACHER_MAKEUP"}],[{...seat,status:"CANCELLED",absenceKind:"LEAVE"}]]) {
  expect(calculateTeacherFee({rule:fixed,seats}).amount).toBe(0);
 }
 expect(calculateTeacherFee({rule:fixed,seats:[{...seat,status:"NO_SHOW"}]}).amount).toBe(1200);
 expect(calculateTeacherFee({rule:fixed,seats:[{...seat,status:"CANCELLED",absenceKind:"GROUP_LEAVE_FORFEITED"}]}).amount).toBe(1200);
 expect(calculateTeacherFee({rule:fixed,seats:[seat,{...seat,id:"makeup",bookingKind:"TEACHER_MAKEUP"}]}).amount).toBe(1200);
});

import { capturedTeacherFee } from "@/server/services/course-teacher-fee";
it("keeps zero, fixed amount and unset fee distinct in a settlement snapshot",()=>{
 const attended=[seat];
 expect(capturedTeacherFee({rule:{mode:"CLASS",value:0},revision:1},attended)).toMatchObject({amount:0,issue:null});
 expect(capturedTeacherFee({rule:{mode:"CLASS",value:500},revision:1},attended)).toMatchObject({amount:500,issue:null});
 expect(capturedTeacherFee({rule:null,revision:1},attended).amount).toBeNull();
});
