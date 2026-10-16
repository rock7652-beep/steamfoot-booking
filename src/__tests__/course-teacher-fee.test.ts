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

it.each([
 {bookingKind:"OPENING_MAKEUP"},
 {musicOpeningMakeupEntitlementId:"opening-right"},
 {openingMakeupSource:true},
])("keeps opening makeup UNVERIFIED across fixed/share/legacy and zero shortcuts: %j", marker=>{
 const seats=[{...seat,...marker}];
 for(const mode of ["CLASS","SHARE"]){
  for(const teacherAttendance of ["SCHEDULED","LEAVE","NO_SHOW"]){
   expect(calculateTeacherFee({rule:{mode,value:60},teacherAttendance,seats})).toMatchObject({amount:null,issue:expect.stringContaining("UNVERIFIED")});
   for(const calculationVersion of [undefined,2])expect(capturedTeacherFee({rule:{mode,value:60,calculationVersion},revision:1,teacherAttendance,musicPricePerLesson:800},seats)).toMatchObject({amount:null,issue:expect.stringContaining("UNVERIFIED")});
  }
 }
 expect(calculateTeacherFee({rule:{mode:"CLASS",value:0},cancelled:true,seats}).amount).toBeNull();
 expect(capturedTeacherFee({rule:{mode:"CLASS",value:0},revision:0,cancelledAt:new Date()},seats).amount).toBeNull();
});

const tuitionSnapshot={revision:1,rule:{mode:"UNSET",calculationVersion:2,tuitionRuleVersion:1,tuitionRules:{a:{mode:"SHARE",value:60},b:{mode:"SHARE",value:70}}}};
const feeA={...seat,tuitionTemplateId:"a",originalUnitPrice:800};
const feeB={...seat,id:"b",customerName:"乙",tuitionTemplateId:"b",originalUnitPrice:640};
it("same subject pays each tuition share independently, including mixed class",()=>{
 expect(capturedTeacherFee(tuitionSnapshot,[feeA]).amount).toBe(480);
 expect(capturedTeacherFee(tuitionSnapshot,[feeB]).amount).toBe(448);
 expect(capturedTeacherFee(tuitionSnapshot,[feeA,feeB])).toMatchObject({amount:928,issue:null,details:[{id:"a",amount:480},{id:"b",amount:448}]});
});
it("tuition shares preserve leave, makeup attendance, pending and correction behavior",()=>{
 expect(capturedTeacherFee(tuitionSnapshot,[{...feeA,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"},feeB]).amount).toBe(448);
 expect(capturedTeacherFee(tuitionSnapshot,[{...feeA,status:"NO_SHOW"},feeB]).amount).toBe(928);
 expect(capturedTeacherFee(tuitionSnapshot,[{...feeA,status:"RESERVED"},feeB]).amount).toBeNull();
 expect(capturedTeacherFee(tuitionSnapshot,[{...feeA,id:"makeup"}]).amount).toBe(480);
 expect(capturedTeacherFee(tuitionSnapshot,[{...feeA,bookingKind:"TEACHER_MAKEUP"}]).amount).toBe(0);
});
it("never guesses a missing fee version or pays a fixed class fee per student",()=>{
 expect(capturedTeacherFee(tuitionSnapshot,[{...feeA,tuitionTemplateId:"unknown"}]).amount).toBeNull();
 const fixed={...tuitionSnapshot,rule:{...tuitionSnapshot.rule,tuitionRules:{a:{mode:"CLASS",value:600},b:{mode:"CLASS",value:600}}}};
 expect(capturedTeacherFee(fixed,[feeA,feeB]).amount).toBe(600);
 expect(capturedTeacherFee({...fixed,rule:{...fixed.rule,tuitionRules:{...fixed.rule.tuitionRules,b:{mode:"SHARE",value:70}}}},[feeA,feeB]).amount).toBeNull();
});
