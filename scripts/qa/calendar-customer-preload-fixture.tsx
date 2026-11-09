import {useCallback,useMemo,useState,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {CourseWorkspace,type CourseCalendarSnapshot} from '@/app/(dashboard)/dashboard/courses/workspace';
import {CourseMemberWorkspace} from '@/app/(dashboard)/dashboard/courses/member-workspace';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {CustomerLabelsProvider} from '@/components/customer-labels';
import '@/app/globals.css';
const query=new URLSearchParams(location.search),profile=query.get('profile')??'sports',kind=query.get('kind')??'calendar';
const initial={month:'2026-11',storeId:'synthetic',sessions:[{id:'2026-11',nameSnapshot:'合成 2026-11 課程',templateId:'template',startsAt:'2026-11-04T01:00:00Z',endsAt:'2026-11-04T02:00:00Z',roomId:'room',coachId:'coach',capacity:1,pointCost:1,bookings:[],...(profile==='beauty'?{service:{groupId:'group',status:'PENDING',personName:'合成顧客',endsAt:'2026-11-04T02:00:00Z',occupiedEndsAt:'2026-11-04T02:00:00Z',buffer:0}}:{})}],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[]} satisfies CourseCalendarSnapshot;
const rooms=[{id:'room',name:'合成教室',category:'教室',capacity:8,isActive:true}];
const templates=[{id:'template',name:'合成課程',category:'課程',isActive:true,capacity:8,pointCost:1,durationMinutes:60,defaultRoomId:'room'}];
async function readFixture(operation:string,input:unknown){const r=await fetch('/__qa/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(!r.ok)throw Error('synthetic failure');return r.json();}
Object.assign(globalThis,{__qaReadCards:(input:unknown)=>readFixture('cards',input),__qaOverview:(id:string)=>readFixture('overview',{customerId:id}),__qaOrders:(id:string)=>readFixture('orders',{customerId:id})});
function Calendar(){
 const [source,setSource]=useState(initial as CourseCalendarSnapshot),[sourceDate,setSourceDate]=useState('2026-11-04');
 const read=useCallback(async(date:string)=>{const result=await readFixture('beauty-month',{date});return {...result,onAccepted:(acceptedDate?:string)=>{setSource(result.data);setSourceDate(acceptedDate??date);return result.data.month;}};},[]);
 const calendarSource=useMemo(()=>profile==='beauty'?{snapshotVersion:source.month,assignmentStaff:[],read,onDateChange:()=>{},onOpen:()=>{},onRoster:()=>{},schedule:{} as never}:undefined,[source.month,read]);
 return <CourseWorkspace storeId="synthetic" selectedDate={profile==='beauty'?sourceDate:'2026-11-04'} today="2026-11-04" nowIso="2026-11-04T00:00:00Z" calendarDays={source.calendarDays} rooms={rooms} templates={templates} sessions={source.sessions} cancelledBookings={[]} coaches={[{id:'coach',displayName:'合成人員',phone:'',status:'ACTIVE',courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:['template']}]} staffAvailability={[]} staffAvailabilityExceptions={[]} canCreate canEdit view="schedule" businessProfile={profile==='music'?'MUSIC':'FITNESS'} sportsNative={profile!=='music'} calendarSource={calendarSource}/>;
}
function Customers(){
 const people=[{id:'customer-a',name:'合成顧客甲',phone:'0900000001',serviceNote:null,userId:null,assignedStaff:null,sponsor:null},{id:'customer-b',name:'合成顧客乙',phone:'0900000002',serviceNote:null,userId:null,assignedStaff:null,sponsor:null}];
 const source=useMemo(()=>profile==='beauty'?{browseCards:(input:unknown)=>readFixture('cards',input),basePath:'/dashboard/beauty?tab=顧客管理',sessionUnitLabel:'次',confirmDiscard:false,support:async()=>({success:false,error:'synthetic support disabled'})} as never:undefined,[]);
 const props={source,previewStoreId:'synthetic',sportsNative:profile!=='music',music:profile==='music',view:'customers',templates,people,plans:[],cards:[],customerRows:people.map(p=>({...p,mergedIntoCustomerId:null,userStatus:null,validPackageSessions:0,sponsoredCount:0})),canEdit:false,canCreate:false,canManageStaff:false,canAssign:false,canReadBookings:true,canReadTransactions:profile==='music',healthEnabled:false,canReadCards:true,assignmentStaff:[],canAssignManager:false} as unknown as ComponentProps<typeof CourseMemberWorkspace>;
 return <CourseMemberWorkspace {...props}/>;
}
const labels={available:true,enabled:false,canEdit:false,canManage:false,categories:[],labels:[],assignments:{}};
createRoot(document.getElementById('root')!).render(<PanelReadProvider><CustomerLabelsProvider initial={labels}><main className="min-w-0 p-4"><p>隔離預覽・合成資料・業務寫入停用</p>{kind==='calendar'?<Calendar/>:<Customers/>}</main></CustomerLabelsProvider></PanelReadProvider>);
