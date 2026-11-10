// Actual course roster and customer panels; all records/actions are synthetic.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CourseRoster} from '../../src/app/(dashboard)/dashboard/courses/roster';
import {RightSheet} from '../../src/components/admin/right-sheet';
import {preparedRoster} from '../../src/__tests__/fixtures/prepared-roster';
import {EMPTY_LABELS} from '../../src/lib/customer-labels';
const qa=window as unknown as {qaCalls:{name:string;args:unknown[]}[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>};
qa.qaCalls=[];
const person={id:'synthetic-customer',name:'合成學員',phone:'0912000000',email:null,gender:null,birthday:'',height:null,lineName:null,serviceNote:null,address:null,notes:null,emergencyContactName:null,emergencyContactPhone:null};
const card={id:'synthetic-card',name:'舞蹈十堂方案',planId:'plan',unit:'SESSION',templateIds:['t'],termSessionIds:[],allowShared:false,remaining:8,held:0,available:8,expired:false,closed:false,expiresAt:'2027-01-01T00:00:00Z',members:[{id:person.id,name:person.name,phone:person.phone}],entries:[]};
const props={view:'customers',templates:[],people:[person],plans:[],cards:[],canEdit:false,canCreate:false,canManageStaff:false,canAssign:false,canReadBookings:true,canReadTransactions:false,healthEnabled:false,customerRows:[],canReadCards:true,assignmentStaff:[],canAssignManager:false,sportsNative:true,previewStoreId:'synthetic',initialCustomerId:person.id};
qa.qaAction=async(name,...args)=>{
 qa.qaCalls.push({name,args});
 if(name==='loadCourseSessionDetail')return {success:true,data};
 if(name==='loadCourseRosterCustomer')return {success:true,data:{workspaceProps:props,labelSnapshot:EMPTY_LABELS,storeId:'synthetic',recoveryEnabled:false}};
 if(name==='loadCourseCardProgress')return {success:true,data:{available:true,total:10,shared:false,completed:[{id:'first',date:'2026-11-03T08:30:00Z',customerName:person.name,courseName:'舞蹈基礎課'},{id:'second',date:'2026-11-10T08:30:00Z',customerName:person.name,courseName:'舞蹈基礎課'}]}};
 if(name==='browseCourseCards')return {success:true,rows:[card],hasMore:false,totals:[]};
 if(name==='loadCourseCustomerBookings'){
  if((args[2] as {mode?:string})?.mode==='upcoming')return {success:true,hasMore:false,data:[]};
  if((args[2] as {cardId?:string})?.cardId!==card.id)throw Error('History must be scoped to the selected card');
  return {success:true,hasMore:false,data:[{id:'history',sessionId:'prior-class',name:'舞蹈基礎課',date:'2026-11-10T08:30:00Z',status:'ATTENDED',checkedIn:true,plan:card.name,points:1,unit:'SESSION',notes:'合成紀錄',operator:'測試人員',coachName:'合成老師',expiresAt:card.expiresAt}]};
 }
 if(name==='loadMusicStudentMakeups')return {success:true,data:null};
 throw Error('Blocked server action '+name);
};
const data=preparedRoster();data.roster[0]={...data.roster[0],customerName:person.name,planName:card.name,status:'ATTENDED',sportsBalance:{remaining:99,available:98,cost:1,unit:'SESSION',planName:'多方案合計',byUnit:[{remaining:99,available:98,cost:1,unit:'SESSION',planName:'多方案合計'}]}};
function Fixture(){const[open,setOpen]=useState(true);return <><main data-calendar-state="2026-11-16:month:teacher-all" className="p-6"><h1>課表排程</h1><p>2026-11-16 · 月表 · 全部授課老師</p></main>{open&&<RightSheet open presentation="centered" width={1000} labelledById="fixture-roster-title" onClose={()=>setOpen(false)}><header className="flex items-center justify-between border-b border-earth-200 p-3"><h2 id="fixture-roster-title">上課名單</h2><button className="min-h-11 px-3" onClick={()=>setOpen(false)}>關閉名單</button></header><div className="min-h-0 flex-1 overflow-auto p-3"><CourseRoster storeId="synthetic" sessionId="session" capacity={2} canCreate={false} canEdit sportsNative initialSnapshot={{sessionId:'session',data}}/></div></RightSheet>}</>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
