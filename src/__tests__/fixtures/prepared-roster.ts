import type {CourseRosterData,NativeRosterBooking} from '@/app/(dashboard)/dashboard/courses/roster-source';
export function preparedRoster(id='prepared'):CourseRosterData{
 const row:NativeRosterBooking={
  openingIssue:null,openingImported:false,openingTuition:null,termUnscheduledOrdinals:[],termClosedBeforeCutoff:0,
  id,customerId:'synthetic-customer',customerName:'已預讀學員',customerPhone:'0912000000',companionIndex:null,reserverName:null,reserverCustomerId:null,operatorCustomerId:null,operatorName:'',createdAt:'2026-11-01T00:00:00Z',status:'RESERVED',absenceKind:null,checkedInAt:null,cardId:'synthetic-card',pointCost:1,bookingKind:'CARD',trialPrice:null,trialPayments:[],notes:'預讀的備註',requestKey:'',
  session:{startsAt:new Date('2026-11-08T02:00:00Z'),templateId:'t',requestKey:'',requestIndex:0,template:{classType:'PRIVATE',musicTermLessons:null}},unit:'SESSION',groupCohortProgress:null,termIndex:null,termCount:0,termNumber:null,bonusPeriod:false,bonusLessons:0,nextPaidLessons:null,termPayment:null,nextTerm:null,termLessons:[],termLeaveCount:0,termNoShowCount:0,termPrivateLeaves:[],termMakeups:[],sportsFixed:false,
  sportsBalance:{remaining:8,available:7,cost:1,unit:'SESSION',planName:'十堂方案',byUnit:[{remaining:8,available:7,cost:1,unit:'SESSION',planName:'十堂方案'}]},planName:'十堂方案',sharedCard:false,canAddCompanion:false,bookingSource:'',available:7,cardRemaining:8,assignedCoachId:null,assignedCoachName:'',expiresAt:'2027-01-01T00:00:00Z',absenceCount:0,absenceHistory:[],serviceNote:'',
 };
 return {roster:[row],sharedCardState:'ENABLED',canPurchase:false,pendingMakeups:[],waitlist:[],trial:null,cards:[],session:{templateId:'t',compatibleTemplateIds:[],startsAt:'2026-11-08T02:00:00Z',pointCost:1,teacherNote:'課表已讀好的備註',teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',teacherMakeupForSessionId:null,waitlistEnabled:false,waitlistStopMinutes:0}};
}
