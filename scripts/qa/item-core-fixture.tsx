// Real UI components with synthetic action replies; no business data is read or written.
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {SportsScheduleFields} from '../../src/app/(dashboard)/dashboard/courses/sports-schedule-fields';
import {CourseRoster} from '../../src/app/(dashboard)/dashboard/courses/roster';
import {ServiceReservationForm} from '../../src/components/admin/service-reservation-form';
import type {SportsSnapshot} from '../../src/lib/sports-staging-types';
import '../../src/app/globals.css';
const music=new URLSearchParams(location.search).get('module')==='music';
const people=Array.from({length:100},(_,i)=>({id:`person-${i}`,name:i===0?'驗收學員':`長姓名學員 ${i}`,phone:`0900${String(i).padStart(6,'0')}`}));
const snapshot={storeId:'synthetic',date:'2026-10-28',subjects:[{id:'a',templateId:'item-a',name:'舞蹈常態／音樂項目A',category:'',active:true,updatedAt:'1',durationMinutes:90}],customers:people,coaches:[{id:'teacher',name:'合成老師',templates:['item-a']}],rooms:[{id:'room',name:'A教室',capacity:100,rental:false}],fees:[],students:[],lessons:[]} as SportsSnapshot;
let remaining=0,status='RESERVED';
const row=()=>({id:'b',customerId:'person-0',customerName:'驗收學員',customerPhone:people[0].phone,status,bookingKind:'UNPAID',cardId:null,pointCost:0,unit:'SESSION',cardRemaining:null,available:remaining,checkedInAt:null,absenceKind:null,sharedCard:false,canAddCompanion:false,bookingSource:'店長建立',operatorCustomerId:null,operatorName:'店長',notes:'',serviceNote:'',planName:'待繳費',sportsFixed:true,termIndex:null,termCount:0,termNumber:null,termLessons:[],termPrivateLeaves:[],termMakeups:[],termLeaveCount:0,termNoShowCount:0,termClosedBeforeCutoff:0,termUnscheduledOrdinals:[],bonusLessons:0,nextPaidLessons:null,termPayment:null,nextTerm:null,absenceCount:0,absenceHistory:[],trialPayments:[],openingImported:false,openingIssue:null,openingTuition:null,...(remaining?{sportsBalance:{remaining,available:remaining,cost:1,unit:'SESSION',planName:'同項目方案合計',byUnit:[{remaining,available:remaining,cost:1,unit:'SESSION',planName:'同項目方案合計'}]}}:{})});
const detail=()=>({success:true,data:{session:{templateId:'item-a',startsAt:'2026-10-28T01:00:00Z',pointCost:1,teacherNote:'',teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',teacherMakeupForSessionId:null,waitlistStopMinutes:0,waitlistEnabled:false},roster:[row()],cards:[],customers:people,canPurchase:true,sharedCardState:'ENABLED',waitlist:[],pendingMakeups:[],trial:null}});
window.qaCalls=[];
window.qaAction=async(name,...args)=>{
 window.qaCalls.push({name,args});
 if(name==='loadCourseSessionDetail'||name==='loadCourseRosterQuick')return detail();
 if(name==='loadCourseStudentPurchase')return {success:true,data:{customerId:'person-0',customerName:'驗收學員',canDiscount:false,music,profitEnabled:!music,revenueStaffOptions:music?[]:[{id:'owner',displayName:'合成店長'}],defaultRevenueStaffId:'',plans:[{id:'a2',name:'A2十堂',unit:'SESSION',points:10,price:1000,storeCost:0,validDays:90,musicTerms:1,musicTermSizes:[10],musicBonusLessons:0}]}};
 if(name==='assignCoursePointCard'){await new Promise(resolve=>setTimeout(resolve,300));remaining=12;return {success:true};}
 if(name==='updateCourseBookingStatus'){if(remaining<1)return {success:false,error:'請先完成繳費／購買適用方案，再點名；尚未記錄出席或扣堂'};remaining--;status='ATTENDED';return {success:true};}
 if(name==='readCustomerLabels')return {success:true,labels:[]};
 if(name==='sportsStagingCommand')return {success:false,error:'合成驗收：已保留排課草稿'};
 throw Error(`Unexpected fixture action ${name}`);
};
const nativeFetch=window.fetch;
window.fetch=async(input,init)=>{
 if(String(input).includes('/courses/session-detail'))return new Response(JSON.stringify(detail()),{headers:{'Content-Type':'application/json'}});
 return nativeFetch(input,init);
};
createRoot(document.getElementById('root')!).render(<OperationScope scope={`synthetic:item-core:${music}`}><main className="min-w-0 space-y-6 p-3">
 <p>元件預覽：虛構資料與模擬傳輸，非正式業務驗收</p>
 <section aria-label="運動排課"><SportsScheduleFields initial={snapshot} date="2026-10-28" seed={{coachId:'teacher'}} requestKey="00000000-0000-4000-8000-000000000001" onGuard={()=>{}} onCreated={()=>{}}/></section>
 <section aria-label="上課名單"><CourseRoster sessionId="session" capacity={100} courseName="項目A" canCreate canEdit sportsNative={!music} musicLayout={music}/></section>
 <section aria-label="美業項目排程"><ServiceReservationForm source={{itemEntitlements:true,services:[{id:'a',name:'服務A',duration:60,buffer:0,price:1000,trialPrice:500,revision:1}],customers:people,technicians:[{id:'tech',name:'合成技師',serviceIds:['a']}],locations:[{id:'location',name:'床位A'}],cards:[],policyRevision:1,readAvailability:async()=>({success:true,data:{slots:[]}}),submit:async()=>({success:false,error:'合成預覽'})}} date="2026-10-28" onGuard={()=>{}} onCreated={()=>{}}/></section>
 </main></OperationScope>);
