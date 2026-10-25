// Test host only: real dashboard/care controllers, synthetic transports, no app route.
import {parseTaipeiDateTime} from '../../src/lib/date-utils';
import {useState} from 'react';
import {BeautyDashboard} from '../../src/components/beauty/dashboard';
import {CareWorkspace,type CareSectionData} from '../../src/app/(dashboard)/dashboard/growth/_components/care-workspace';
import type {CareItem} from '../../src/app/(dashboard)/dashboard/growth/_components/care-section';
import type {BeautyDashboardData} from '../../src/server/beauty/queries';
import type {CourseRosterData} from '../../src/app/(dashboard)/dashboard/courses/roster-source';

let current:BeautyDashboardData;
let moveAttempts=0,followAttempts=0;
const json=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
export function flowFetch(url:string,init?:RequestInit):Response|undefined{
 if(url.startsWith('/api/beauty/roster?')){
  const version=new URL(url,'https://synthetic.invalid').searchParams.get('version');
  window.qaCalls.push({name:version?'flow-roster-version':'flow-roster-full',args:[url]});
  return json({success:true,version:'flow-v1',unchanged:!!version,...(!version?{data:roster()}: {})});
 }
 if(url==='/api/beauty/customer-read'){
  const body=JSON.parse(String(init?.body));window.qaCalls.push({name:'flow-customer-read',args:[body]});
  if(body.operation==='cash')return json({success:true,status:'OPEN'});
  if(body.operation==='support')return json({success:false,error:'合成進階資料無後端連線'});
  return json({success:true,rows:[],totals:[],hasMore:false});
 }
 if(url.startsWith('/api/beauty/calendar?')&&current&&document.querySelector('[data-qa-full-flow]')){window.qaCalls.push({name:'flow-calendar-read',args:[url]});return json({success:true,data:current});}
}
export async function flowAction(name:string,args:unknown[]):Promise<unknown>{
 if(name==='moveBeautyAppointment'){
  moveAttempts++;const target=args[1] as {id:string;date:string;time:string;locationId:string;technicianId:string};
  if(moveAttempts===1)return {success:false,error:'合成衝突：此位置已有其他預約，原預約未變更'};
  const start=parseTaipeiDateTime(target.date,target.time)!;
  current={...current,items:current.items.map(row=>row.id===target.id?{...row,startsAt:start.toISOString(),endsAt:new Date(+start+Date.parse(row.endsAt)-Date.parse(row.startsAt)).toISOString(),occupiedEndsAt:new Date(+start+Date.parse(row.occupiedEndsAt)-Date.parse(row.startsAt)).toISOString(),locationId:target.locationId,technicianId:target.technicianId}:row)};
  return {success:true};
 }
 if(name==='createCustomerFollowUpAction'){
  followAttempts++;await new Promise(done=>setTimeout(done,150));
  if(followAttempts===1)return {success:false,error:'合成儲存失敗，請保留輸入'};
  return {success:true,data:{followUpId:'synthetic-follow-'+followAttempts}};
 }
 if(name==='loadCustomerLabels')return {success:true,labels:[],assignments:{},revision:0};
}
function roster():CourseRosterData{
 return {readVersion:'flow-v1',roster:current.items.map((b,i)=>({openingIssue:null,openingImported:false,openingTuition:null,termUnscheduledOrdinals:[],termClosedBeforeCutoff:0,id:b.id,customerId:b.customerId,customerName:b.personName,customerPhone:b.personPhone,companionIndex:null,reserverName:null,reserverCustomerId:null,operatorCustomerId:null,operatorName:'',createdAt:'2026-10-25T00:00:00Z',status:b.status==='COMPLETED'?'ATTENDED':b.status,absenceKind:null,checkedInAt:null,cardId:null,pointCost:0,bookingKind:'SINGLE',trialPrice:b.price,trialPayments:[],notes:'測試備註 '+i,requestKey:'',session:{startsAt:b.startsAt,templateId:b.serviceId,requestKey:'',requestIndex:0,template:{classType:'PRIVATE',musicTermLessons:null}},unit:'SESSION',groupCohortProgress:null,termIndex:null,termCount:0,termNumber:null,bonusPeriod:false,bonusLessons:0,nextPaidLessons:null,termPayment:null,nextTerm:null,termLessons:[],termLeaveCount:0,termNoShowCount:0,termPrivateLeaves:[],termMakeups:[],sportsFixed:false,planName:'單次服務',sharedCard:false,canAddCompanion:false,bookingSource:'',available:0,cardRemaining:null,assignedCoachId:null,assignedCoachName:'',expiresAt:null,absenceCount:0,absenceHistory:[],serviceNote:'合成店內備註',service:{revision:b.revision,startsAt:b.startsAt,endsAt:b.endsAt,occupiedEndsAt:b.occupiedEndsAt,serviceName:b.serviceName,technicianName:'測試技師1',locationName:'測試床位1',price:b.price,debit:false,available:null}})),sharedCardState:'ENABLED',canPurchase:false,pendingMakeups:[],waitlist:[],trial:null,session:{templateId:'',compatibleTemplateIds:[],startsAt:current.items[0].startsAt,pointCost:1,teacherNote:'',teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',teacherMakeupForSessionId:null,waitlistEnabled:false,waitlistStopMinutes:0},cards:[]} as unknown as CourseRosterData;
}
export function BeautyFullFlowFixture({data}:{data:BeautyDashboardData}){
 const [prepared]=useState(()=>{
  moveAttempts=0;followAttempts=0;
  current={...data,techs:data.techs.map(t=>({...t,weekly:Array.from({length:7},(_,day)=>({day,start:'09:00',end:'22:00'}))})),calendarDays:{[data.date]:{status:'open',periods:[{openTime:'09:00',closeTime:'22:00',slotInterval:30,defaultCapacity:1}],openTime:'09:00',closeTime:'22:00',dayOfWeek:1,dayName:'一',reason:null}},customerHealthEnabled:false,customers:data.customers.map(c=>({...c,_count:{sponsoredCustomers:0}})),plans:[{id:'p',storeId:data.storeId,chargeTechnicianRule:null,expiryReminder:null,name:'合成五次方案',sessions:5,price:4500,validDays:90,active:true,customerPurchasable:true,allowShared:false,serviceIds:['s1'],revision:1,lowBalanceEnabled:false,lowBalanceThreshold:null}],access:{...data.access,financeAccess:true,planAccess:true},manage:{...data.manage,collect:true,discount:true,card:true,customerEdit:true,customerAssign:false,members:true},items:data.customers.map((c,i)=>({...data.items[0],id:i?'b'+i:'a',customerId:c.id,personName:c.name,personPhone:c.phone}))} as BeautyDashboardData;
  return current;
 });
 return <div data-qa-full-flow><BeautyDashboard data={prepared} tab="班表" slug="synthetic" initialAppointmentId="a"/></div>;
}
export function BeautyCareFlowFixture(){
 const [readOnly,setReadOnly]=useState(false);
 const items:CareItem[]=Array.from({length:8},(_,i)=>({customerId:'c'+(i+1),name:`關懷顧客${i+1}・長姓名`,phoneLabel:'0900-000-001',reason:'方案即將到期，請協助安排剩餘服務',meta:'合成提醒摘要與長服務名稱',staffLabel:'所屬店長',staffName:'測試店長',lastFollowUpText:null,script:'您好，提醒您確認服務方案及安排時間。',module:'beauty',courseMode:true,readOnly,canFollowUp:true,canBook:true,careReason:'expiring',careYear:2099,state:'pending',label:'待關懷',nextBooking:null,planDetails:['合成服務方案 A：剩餘 2 次','合成服務方案 B：剩餘 3 次']}));
 const sections:CareSectionData[]=[{reason:'expiring',title:'方案快到期',description:'合成驗收',emptyText:'無',items}];
 return <><label><input aria-label="關懷唯讀" type="checkbox" checked={readOnly} onChange={e=>setReadOnly(e.target.checked)}/>唯讀</label><CareWorkspace sections={sections} history={[]} today="2099-10-26"/></>;
}
