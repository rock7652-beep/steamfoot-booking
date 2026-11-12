// Real management components with synthetic records and explicitly blocked business writes.
import {useState,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {CourseMemberWorkspace} from '@/app/(dashboard)/dashboard/courses/member-workspace';
import {CourseStaffWorkspace} from '@/app/(dashboard)/dashboard/courses/staff-workspace';
import {CourseWorkspace} from '@/app/(dashboard)/dashboard/courses/workspace';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {CustomerLabelsProvider} from '@/components/customer-labels';
import '@/app/globals.css';
const win=window as unknown as {__qaAction:(name:string,args:unknown[])=>Promise<unknown>;__qaOrder:unknown};
win.__qaAction=async(name,args)=>{
 if(name==='saveCourseDisplayOrder'){win.__qaOrder=args[0];return {success:true,revision:1};}
 if(name==='getCourseStaffAvailability')return {revision:'v1',inheritStoreHours:true,weekly:[],exceptions:[],retainedSessions:[]};
 if(['searchCourseCustomers','loadCourseCustomerSearchIndex'].includes(name))return {success:true,rows:[],hasMore:false};
 throw Error(`Business operation disabled in synthetic fixture: ${name}`);
};
const templates=[{id:'template',name:'吉他團體班',musicSubjectId:'A',subjectName:'吉他團體班',category:'音樂',capacity:8,isActive:true,pointCost:1,durationMinutes:60,waitlistEnabled:false,waitlistLimit:0,waitlistStopMinutes:0}];
const plans=Array.from({length:23},(_,i)=>({id:`plan-${i}`,name:`吉他方案${String(i+1).padStart(2,'0')}`,points:4,price:3200,validDays:35,isActive:i<22,unit:'SESSION',templateIds:['template']}));
const teacher={updatedAt:'2026-11-12T00:00:00Z',id:'teacher',name:'合成老師',kind:'coach',coachEnabled:true,qualificationIds:['template'],qualificationsConfirmed:true,coachLoginReady:false,birthday:'',emergencyContactRelation:'',assignments:[],email:'',contactEmail:'',phone:'0900000000',emergencyContactName:'',emergencyContactPhone:'',active:true,memberEnabled:true,permissions:[],customerId:''};
function Fixture(){
 const [view,setView]=useState('plans');
 return <div className="flex min-h-screen"><aside className="hidden w-56 shrink-0 border-r border-earth-200 p-4 md:block">合成店家後台</aside><main className="min-w-0 flex-1 p-4"><nav className="mb-4 flex gap-2">{[['plans','收費方式預覽'],['teachers','教師管理預覽'],['rooms','空間管理預覽']].map(([id,name])=><button className="min-h-11 rounded border px-3" key={id} onClick={()=>setView(id)}>{name}</button>)}</nav>
 {view==='plans'&&<CourseMemberWorkspace {...{previewStoreId:'synthetic',view:'plans',music:true,templates,subjects:[{id:'A',name:'吉他團體班',category:'音樂',isActive:true}],people:[],customerRows:[],plans,cards:[],canEdit:true,canCreate:true,canManageStaff:false,canAssign:false,canReadBookings:false,canReadTransactions:false,healthEnabled:false,canReadCards:false,assignmentStaff:[],canAssignManager:false,displayOrder:{ids:plans.map(p=>p.id),revision:0}} as ComponentProps<typeof CourseMemberWorkspace>}/>}
 {view==='teachers'&&<CourseStaffWorkspace {...{previewStoreId:'synthetic',accountKind:'coach',music:true,staff:[teacher],maxStaff:10,templates,customers:[],canManage:true,feeEnabled:true,permissionGroups:[],teachingPlans:[{id:'A1',name:'吉他個別課800',subjectIds:['A'],active:true,defaults:{A:{mode:'SHARE',value:60}}}]} as ComponentProps<typeof CourseStaffWorkspace>}/>}
 {view==='rooms'&&<CourseWorkspace {...{storeId:'synthetic',view:'rooms',selectedDate:'2026-11-12',today:'2026-11-12',nowIso:'2026-11-12T00:00:00Z',calendarDays:{},staffAvailability:[],staffAvailabilityExceptions:[],rooms:[{id:'room',name:'合成教室',category:'音樂教室',capacity:8,isActive:true,rentalEnabled:false,rentalHourlyRate:0}],templates:[],sessions:[],coaches:[],cancelledBookings:[],canCreate:true,canEdit:true,canDelete:false,businessProfile:'MUSIC'} as ComponentProps<typeof CourseWorkspace>}/>}
 </main></div>;
}
createRoot(document.getElementById('root')!).render(<PanelReadProvider><CustomerLabelsProvider initial={{available:true,enabled:false,canEdit:false,canManage:false,categories:[],labels:[],assignments:{}}}><Fixture/></CustomerLabelsProvider></PanelReadProvider>);
