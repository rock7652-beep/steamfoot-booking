import { planMusicOpeningBatch, type MusicOpeningEnrollment, type MusicOpeningScope } from "@/lib/music-opening-state";

export const syntheticOpeningScope: MusicOpeningScope = {
  version:1,targetStoreId:"synthetic-music-store",sourceSystem:"YINJIAOYUN",sourceTenantKey:"synthetic-tenant",
  timeZone:"Asia/Taipei",cutoffBusinessDate:"2026-10-01",
};
export function syntheticOpeningRecord(): MusicOpeningEnrollment {
  return {
    entityKind:"MUSIC_ENROLLMENT",sourceRecordKey:"synthetic-enrollment",sourceRevision:"synthetic-r1",
    sourceStudentKey:"synthetic-source-student",sourcePlanKey:"synthetic-source-plan",paidLessons:4,giftLessons:0,
    terms:[{sourceTermKey:"synthetic-term-7",originalTermNumber:7,totalLessons:4,closedBeforeCutoff:2}],
    balance:{consumedBeforeCutoff:2,remainingAtCutoff:2,reservedAtCutoff:0,unresolvedMakeupLessons:0},
    originalUnitPrice:800,activatedAt:"2026-09-15T02:00:00.000Z",expiresAt:"2026-11-30T15:59:59.999Z",
    tuition:{currency:"TWD",originalListPrice:3200,agreedTuition:3200,paidBeforeCutoff:2000,receivableAtCutoff:1200},
  };
}
export function syntheticOpeningRow(record = syntheticOpeningRecord(), teacherFeePolicy = "UNVERIFIED") {
  const plan=planMusicOpeningBatch({batchId:"synthetic-batch",scope:syntheticOpeningScope,records:[record]},[]);
  if(plan.status!=="READY")throw new Error(JSON.stringify(plan.issues));
  return {storeId:syntheticOpeningScope.targetStoreId,cardId:"synthetic-card",customerId:"synthetic-student",
    sourceKey:plan.entries[0].key,contentHash:plan.entries[0].contentHash,snapshot:{scope:syntheticOpeningScope,record},
    appliedBatchId:"synthetic-batch",teacherFeePolicy};
}
export function syntheticOpeningCard(record = syntheticOpeningRecord()) {
  return {
    id:"synthetic-card",storeId:syntheticOpeningScope.targetStoreId,unit:"SESSION",musicOpeningStateRequired:true,
    musicOpeningState:syntheticOpeningRow(record),musicActivatedAt:record.activatedAt?new Date(record.activatedAt):null,
    expiresAt:record.expiresAt?new Date(record.expiresAt):new Date("2099-12-31T15:59:59.999Z"),
    members:[{customerId:"synthetic-student"}],remaining:2,closedAt:null,musicValidityDays:35,
    musicTermSizes:[4],musicBonusLessons:0,musicJoinSessionId:null,templateIds:["synthetic-template"],termSessionIds:[],
    plan:{points:99,musicTerms:1,allowShared:false,templateIds:["synthetic-template"]},entries:[],
    nameSnapshot:"Synthetic enrollment",createdAt:new Date("2026-10-01T00:00:00.000Z"),
  };
}
export function syntheticOpeningBooking(status = "RESERVED") {
  const card=syntheticOpeningCard(); if(status==="ATTENDED"||status==="NO_SHOW")card.remaining=1;
  return {
    id:"synthetic-booking",storeId:syntheticOpeningScope.targetStoreId,sessionId:"synthetic-session",
    cardId:card.id,card,customerId:"synthetic-student",customerName:"Synthetic learner",
    bookingKind:"CARD",pointCost:1,status,absenceKind:null as string|null,checkedInAt:null,
    companionIndex:null,makeupForBookingId:null,operatorCustomerId:null,operatorName:"Synthetic operator",
    musicOpeningTermKey:"synthetic-term-7",musicOpeningLessonOrdinal:3,musicOpeningSourceLessonKey:"synthetic-source-lesson-3",
    createdAt:new Date("2026-10-01T00:00:00.000Z"),trialPrice:null,trialPayments:[],notes:"",
    session:{id:"synthetic-session",templateId:"synthetic-template",startsAt:new Date("2026-10-01T02:00:00.000Z"),
      endsAt:new Date("2026-10-01T03:00:00.000Z"),cancelledAt:null,teacherAttendance:"SCHEDULED",capacity:3,
      requestKey:"synthetic-series",requestIndex:0,template:{classType:"PRIVATE",musicTermLessons:4,isActive:true,visibility:"PUBLIC",musicSubject:null}},
  };
}
