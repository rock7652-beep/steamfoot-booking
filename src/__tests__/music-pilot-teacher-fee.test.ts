import { describe,it,expect } from "vitest";
import { verifiedMusicPilotFeeBasis,type PilotFeeProof,type PilotFeeRow } from "@/server/services/music-pilot-teacher-fee";
import { capturedTeacherFee } from "@/server/services/course-teacher-fee";
import type { TeacherFeeSeat } from "@/lib/course-teacher-fee";
const proof={enrollments:[{cardId:"verified-card",customerId:"student",templateId:"guitar",originalUnitPrice:800}],oldMakeup:{id:"verified-right",contentHash:"verified-hash",customerId:"student",templateId:"guitar",originalUnitPrice:800},trial:{customerId:"trial-student",templateId:"trial",base:800}} as PilotFeeProof;
const row:PilotFeeRow={cardId:"verified-card",cardRequestKey:"verified-card",customerId:"student",templateId:"guitar",bookingKind:"CARD",purchaseCount:BigInt(0)};
const seat:TeacherFeeSeat={id:"seat",customerName:"synthetic learner",status:"ATTENDED",bookingKind:"CARD",absenceKind:null,originalUnitPrice:800,openingPriceSource:true};
const snapshot={rule:{mode:"SHARE",value:50,calculationVersion:2},revision:1,musicTrialMode:"FREE",musicTeacherFeeBase:800};
describe("verified pilot source payroll",()=>{
 it("requires the exact persisted card, customer and template; a receipt cannot also be a paid order",()=>{
  expect(verifiedMusicPilotFeeBasis(proof,row)).toEqual({price:800,makeup:false});
  for(const bad of [{cardId:"yjy-pilot-card:forged"},{customerId:"another-store"},{templateId:"another-template"},{purchaseCount:BigInt(1)},{cardRequestKey:"renamed"}])expect(verifiedMusicPilotFeeBasis(proof,{...row,...bad})).toBeNull();
 });
 it("new makeup requires the deducted original leave and same student/enrollment",()=>{
  const makeup={...row,cardId:"new-card",cardRequestKey:"yjy-pilot-makeup:source",sourceCardId:"verified-card",sourceCustomerId:"student",sourceTemplateId:"guitar",sourceStatus:"CANCELLED",sourceAbsenceKind:"STUDENT_LEAVE"};
  expect(verifiedMusicPilotFeeBasis(proof,makeup)).toEqual({price:800,makeup:true});
  for(const bad of [{sourceStatus:"RESERVED"},{sourceCustomerId:"other"},{sourceAbsenceKind:"NO_SHOW"},{sourceCardId:"forged"}])expect(verifiedMusicPilotFeeBasis(proof,{...makeup,...bad})).toBeNull();
 });
 it("old right requires its pinned source hash and matching ownership",()=>{
  const makeup={...row,cardId:null,musicOpeningMakeupEntitlementId:"verified-right",makeupContentHash:"verified-hash",makeupCustomerId:"student",makeupTemplateId:"guitar"};
  expect(verifiedMusicPilotFeeBasis(proof,makeup)).toEqual({price:800,makeup:true});
  expect(verifiedMusicPilotFeeBasis(proof,{...makeup,makeupContentHash:"changed"})).toBeNull();
 });
 it("pays free trial at the configured original class base",()=>expect(capturedTeacherFee(snapshot,[{...seat,bookingKind:"TRIAL",originalUnitPrice:0}]).amount).toBe(400));
 it("pays no fee on the deducted original leave and exactly one fee after makeup attendance",()=>{
  expect(capturedTeacherFee(snapshot,[{...seat,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"}]).amount).toBe(0);
  expect(capturedTeacherFee(snapshot,[{...seat,status:"NO_SHOW"}]).amount).toBe(400);
  const makeup={...seat,bookingKind:"OPENING_MAKEUP",openingMakeupSource:true,verifiedOpeningMakeupFee:true};
  expect(capturedTeacherFee(snapshot,[{...makeup,status:"RESERVED"}]).amount).toBeNull();
  expect(capturedTeacherFee(snapshot,[makeup]).amount).toBe(400);
  expect(capturedTeacherFee(snapshot,[{...makeup,status:"CANCELLED"}]).amount).toBe(0);
  expect(capturedTeacherFee({...snapshot,teacherAttendance:"LEAVE"},[makeup]).amount).toBe(0);
  expect(capturedTeacherFee(snapshot,[{...makeup,verifiedOpeningMakeupFee:false}]).issue).toContain("UNVERIFIED");
  expect(capturedTeacherFee({...snapshot,rule:{mode:"SHARE",value:50}},[makeup]).amount).toBeNull();
 });
 it("keeps source group price despite discounted tuition, and sums only participating students",()=>{
  const group={...snapshot,rule:{mode:"SHARE",value:70,calculationVersion:2}};
  expect(capturedTeacherFee(group,[{...seat,originalUnitPrice:450}]).amount).toBe(315);
  const four=Array.from({length:4},(_,i)=>({...seat,id:String(i),originalUnitPrice:450}));
  expect(capturedTeacherFee({...group,rule:{mode:"SHARE",value:60,calculationVersion:2}},four).amount).toBe(1080);
 });
});
