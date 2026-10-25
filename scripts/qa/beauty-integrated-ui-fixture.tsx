import {CardMaintenanceForm} from '../../src/app/(dashboard)/dashboard/courses/card-maintenance-form';
import {CourseStaffAvailabilityEditor} from '../../src/app/(dashboard)/dashboard/courses/course-staff-availability-editor';
// Synthetic component host only. Never imported by an application route.
import {Component,useState,type ComponentProps,type ReactNode,type ErrorInfo} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {BeautyFullFlowFixture,BeautyCareFlowFixture,flowFetch,flowAction} from './beauty-full-flow-fixture';
import {SharedPagesFixture} from './beauty-integrated-shared-fixture';
import {BeautyScheduleWorkspace} from '../../src/components/beauty/schedule-workspace';
import {BeautyCollectionPanel} from '../../src/components/beauty/collection-panel';
import {BeautyChargeEditor} from '../../src/components/beauty/charge-editor';
import {CoursePlanDraftForm} from '../../src/app/(dashboard)/dashboard/courses/course-profile-forms';
import {CourseAssignmentPayment} from '../../src/components/admin/course-assignment-payment';
import {CourseWorkspace} from '../../src/app/(dashboard)/dashboard/courses/workspace';
import {RentalPanel} from '../../src/app/(dashboard)/dashboard/courses/rental-panel';
import {CourseStaffWorkspace} from '../../src/app/(dashboard)/dashboard/courses/staff-workspace';
import {BeautyNativeAccountWorkspace} from '../../src/components/beauty/native-account-source';
import {BeautyNativeStaffWorkspace} from '../../src/components/beauty/native-staff-source';
import {CourseMemberWorkspace} from '../../src/app/(dashboard)/dashboard/courses/member-workspace';
import {ServiceReservationForm,type ServiceReservationSource} from '../../src/components/admin/service-reservation-form';
import type {BeautyDashboardData} from '../../src/server/beauty/queries';



const hoursSource={selectTimes:true,reasonEnabled:false,read:async()=>({revision:'a'.repeat(64),inheritStoreHours:false,weekly:Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,periods:[{openTime:'09:15',closeTime:'21:00'}]})),exceptions:[],retainedSessions:[]}),save:async()=>({success:false as const,error:'假資料驗收，不操作資料庫'})};
function CardMaintenanceFixture(){return <div className="mx-auto max-w-xl rounded-xl border bg-white p-4"><h2 className="font-semibold">測試五次方案</h2><p>剩餘 5 次・無待服務預約</p><CardMaintenanceForm storeId="synthetic" card={{id:'card-synthetic',remaining:5,expiresAt:'2099-01-01T15:59:59.999Z',closed:false,held:0}} save={async input=>{window.qaCalls.push({name:'maintainCard',args:[input]});await new Promise(done=>setTimeout(done,120));return {success:true};}} onSaved={noop} onPending={noop} onDirtyChange={noop} onUncertain={noop}/></div>;}
declare global{interface Window {qaCalls:{name:string;args:unknown[]}[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>}}
window.qaCalls=[];
window.qaAction=async(name,...args)=>{
 window.qaCalls.push({name,args});
 const flowResult=await flowAction(name,args);if(flowResult!==undefined)return flowResult;
 if(name==='readBeautyCollection'){await new Promise(done=>setTimeout(done,250));return {success:true,data:(args[0] as string[]).map(id=>({id,revision:1,personName:id==='a'?'合成甲':'合成乙',serviceName:'測試服務',price:id==='a'?1000:1500,discount:{kind:'AMOUNT',value:0},reduction:0,netPrice:id==='a'?1000:1500,collected:0,due:id==='a'?1000:1500}))};}
 if(name==='getCourseCheckoutCashStatus')return {success:true,status:'OPEN'};
 if(/read.*Teaching/i.test(name))return {success:true,version:'2026-10-25T00:00:00.000Z',qualificationIds:['s1'],fees:[],musicSettings:null,revision:1};
 if(/Availability/.test(name))return {revision:'a'.repeat(64),inheritStoreHours:true,weekly:[],exceptions:[],retainedSessions:[]};
 if(/browseCourseCards/.test(name))return {success:true,rows:[],hasMore:false,totals:[]};
 if(/searchCourseCustomers|loadCourseCustomerSearchIndex/.test(name))return {success:true,rows:[],customers:[]};
 if(/courseStatusImpact/.test(name))return {success:true,count:0};
 return {success:false,error:'合成驗收：未連接任何後端；輸入保留。',uncertain:false};
};
const services=Array.from({length:16},(_,i)=>({id:'s'+(i+1),name:`測試服務 ${i+1}・深層保養與肩頸舒壓長名稱`,active:true,duration:60,buffer:15,price:1000,trialPrice:600,revision:1,category:'保養'}));
const techs=Array.from({length:4},(_,i)=>({id:'t'+(i+1),name:`測試技師${i+1}`,gender:'FEMALE',active:true,revision:1,serviceIds:services.map(s=>s.id),rates:{},weekly:[],exceptions:{},grants:[],sort:i,userId:null}));
const rooms=techs.map((t,i)=>({id:'r'+(i+1),name:'測試床位'+(i+1),category:'服務區',isActive:true,capacity:1,rentalEnabled:true,rentalHourlyRate:600,rentalBufferMinutes:15}));
const customers=Array.from({length:28},(_,i)=>({id:'c'+(i+1),name:`測試顧客${i+1}・長姓名`,phone:'090000'+String(i+1).padStart(4,'0'),email:'',birthday:'',address:'',emergencyContactName:'',emergencyContactPhone:'',emergencyContactRelation:'',notes:'合成驗收顧客',serviceNote:'膚況注意事項',kind:'customer',customerStage:'ACTIVE',userStatus:null,mergedIntoCustomerId:null,validPackageSessions:0,sponsoredCount:0,assignedStaff:null,sponsor:null,labels:[],createdAt:'2026-10-25T00:00:00Z'}));
const noop=()=>{};
const fakeSave=async(input:unknown)=>{window.qaCalls.push({name:'synthetic-save',args:[input]});return {success:false as const,error:'合成驗收：輸入保留，未寫入資料庫。'};};
const reservation:ServiceReservationSource={services,technicians:techs,locations:rooms,customers,cards:[{id:'soon',name:'測試快到期五次方案',memberIds:['c1'],serviceIds:['s1'],remaining:5,held:0,expiresAt:'2099-11-01',closedAt:null},{id:'later',name:'測試較晚到期五次方案',memberIds:['c1'],serviceIds:['s1'],remaining:5,held:0,expiresAt:'2099-12-01',closedAt:null}],policyRevision:1,
 readAvailability:async intent=>({success:true,data:{slots:['09:00','10:30'],arrangement:intent.people.map((_,i)=>({technicianId:techs[i].id,technicianName:techs[i].name,locationId:rooms[i].id,locationName:rooms[i].name}))}}),submit:fakeSave};
const person={id:'t1',name:'測試人員長名稱',updatedAt:'2026-10-25T00:00:00Z',kind:'coach' as const,coachEnabled:true,qualificationIds:['s1'],qualificationsConfirmed:true,coachLoginReady:false,birthday:'',emergencyContactRelation:'家人',assignments:[],email:'',phone:'0900000000',emergencyContactName:'',emergencyContactPhone:'',active:true,memberEnabled:true,permissions:[],customerId:''};
const perms=[{label:'預約操作',codes:[{code:'booking.read',label:'查看預約'},{code:'booking.update',label:'修改預約'}]},{label:'收款操作',codes:[{code:'transaction.read',label:'查看交易'}]}];
const beautyCalendar={storeId:'synthetic',store:{id:'synthetic',slug:'synthetic'},date:'2099-10-26',month:'2099-10',calendar:'day',now:Date.parse('2099-10-26T01:00:00Z'),calendarDays:{},services,techs,locations:rooms,customers,cards:[],plans:[],rentals:[],assignmentStaff:[],access:{writeAccess:true,customerAccess:true},manage:{update:true,customer:false},policy:{revision:1},items:[{id:'a',groupId:'party',personName:customers[0].name,personPhone:customers[0].phone,customerId:'c1',serviceId:'s1',serviceName:services[0].name,startsAt:'2099-10-26T01:00:00Z',endsAt:'2099-10-26T02:00:00Z',occupiedEndsAt:'2099-10-26T02:15:00Z',technicianId:'t1',locationId:'r1',price:1000,status:'RESERVED',isTrial:false,revision:1,buffer:15,paymentStatus:'待收款',notes:''}]} as unknown as BeautyDashboardData;
window.fetch=async (request,init)=>{const url=String(request);const response=flowFetch(url,init);if(response)return response;if(url.startsWith('/api/beauty/calendar?')){window.qaCalls.push({name:'synthetic-calendar',args:[url]});return new Response(JSON.stringify({success:true,data:beautyCalendar}),{status:200,headers:{'Content-Type':'application/json'}});}throw Error('Network requests forbidden in synthetic UI: '+url);};
class FixtureBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(error:Error,info:ErrorInfo){console.error('QA COMPONENT STACK',info.componentStack,error.message);}render(){return this.state.failed?<p role="alert">元件發生錯誤，詳見驗收紀錄。</p>:this.props.children;}}
function Fixture(){
 const [view,setView]=useState('charge'),[module,setModule]=useState('beauty'),[open,setOpen]=useState(true),[message,setMessage]=useState('');
 const [collectionId,setCollectionId]=useState('a');
 const music=module==='music';
 const calendar={storeId:'synthetic',selectedDate:'2099-10-26',today:'2099-10-26',nowIso:'2099-10-26T01:00:00Z',calendarDays:{},rooms,templates:services.map(s=>({...s,isActive:true,durationMinutes:60,capacity:4,pointCost:1,defaultRoomId:'r1'})),sessions:[{id:'lesson',templateId:'s1',nameSnapshot:'測試服務／課程',startsAt:'2099-10-26T01:00:00Z',endsAt:'2099-10-26T02:00:00Z',coachId:'t1',roomId:'r1',capacity:4,pointCost:1,bookings:[]}],coaches:techs.map(t=>({id:t.id,displayName:t.name,phone:'',status:'ACTIVE',courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:['s1']})),cancelledBookings:[],canCreate:true,canEdit:true,view:'schedule',businessProfile:music?'MUSIC':'FITNESS',staffAvailability:[],staffAvailabilityExceptions:[]} as unknown as ComponentProps<typeof CourseWorkspace>;
 const staffData={storeId:'synthetic',techs:[...techs,{...techs[0],id:'disabled',name:'停用測試技師',active:false}],services,customers:[],technicianAssignments:[],access:{feeAccess:true}} as unknown as BeautyDashboardData;
 const source={automaticAllocation:true,singleServiceForm:(id:string|undefined,done:()=>void,guard:(dirty:boolean,pending:boolean)=>void)=><ServiceReservationForm source={{...reservation,cards:[]}} date="2099-10-26" seed={{time:"09:00",customerId:id}} onGuard={guard} onCreated={done}/>,confirmDiscard:false,previewEnabled:false,saveProfile:fakeSave,saveNote:fakeSave,browseCards:async()=>({success:true,rows:[],hasMore:false,totals:[]}),reservations:async()=>({success:true,rows:[],hasMore:false}),bookings:async()=>({success:true,rows:[],hasMore:false}),purchases:async()=>({success:true,rows:[],hasMore:false}),cashStatus:async()=>({success:true,status:'OPEN'}),assign:fakeSave,members:fakeSave,attribution:fakeSave,referrers:async()=>({success:true,rows:[]}),assignCustomers:fakeSave,choices:customers,canManageMembers:false,sessionUnitLabel:module==='beauty'?'次':'堂',basePath:'/dashboard/beauty?tab=顧客管理'};
 const member={source,previewStoreId:'synthetic',view:'customers',people:customers,templates:services.map(s=>({...s,isActive:true})),plans:[{id:'p',name:'測試五次方案',price:4500,storeCost:300,catalogSnapshot:{storeCost:300},points:5,validDays:90,unit:'SESSION',templateIds:['s1'],isActive:true,allowShared:false}],cards:[],canEdit:true,canCreate:true,canManageStaff:false,canAssign:true,canReadBookings:true,canReadTransactions:true,healthEnabled:false,customerRows:customers,canReadCards:true,assignmentStaff:[],canAssignManager:false,canDiscount:true,profitEnabled:false,sportsNative:!music,music} as unknown as ComponentProps<typeof CourseMemberWorkspace>;
 return <main className="min-w-0 p-3"><header className="mb-3 flex flex-wrap gap-3"><strong>整合版假資料驗收・無資料庫</strong><label>整合頁面<select aria-label="整合頁面" value={view} onChange={e=>{setView(e.target.value);setOpen(true);setMessage('');}}>{['card-maintenance','hours','full-flow','care-flow','charge','collection','purchase','calendar','reservation','rental','staff','personnel','customers','shared'].map(x=><option key={x}>{x}</option>)}</select></label><label>整合模組<select aria-label="整合模組" value={module} onChange={e=>{setModule(e.target.value);setOpen(true);}}>{['beauty','sports','music'].map(x=><option key={x}>{x}</option>)}</select></label></header><output role="status">{message}</output>
 <FixtureBoundary key={view+module}><OperationScope key={view+module} scope={'qa:'+view+module}><div className="min-w-0" data-qa-content>
 {view==='card-maintenance'&&<CardMaintenanceFixture/>}
 {view==='hours'&&<div className="mx-auto max-w-2xl rounded-xl border bg-white p-3"><CourseStaffAvailabilityEditor storeId="synthetic" staffId="t1" fitness source={hoursSource}/></div>}
 {view==='full-flow'&&<BeautyFullFlowFixture data={beautyCalendar}/>}
 {view==='care-flow'&&<BeautyCareFlowFixture/>}
 {view==='charge'&&(module==='beauty'?open?<BeautyChargeEditor storeId="synthetic" services={services} technicians={techs} onClose={()=>setOpen(false)} port={{perChargeTechnicians:true,save:fakeSave}}/>:<button onClick={()=>setOpen(true)}>重新開啟收費</button>:<CoursePlanDraftForm storeId="synthetic" plan={null} templates={services.map(s=>({...s,isActive:true,durationMinutes:60,musicSubjectId:s.id}))} subjects={services.map(s=>({...s,isActive:true}))} sportsData={music?undefined:{storeId:'synthetic',date:'2099-10-26',subjects:[],fees:[],lessons:[],students:[],customers:[],coaches:[],rooms:[]}} termSessions={[]} music={music} profitEnabled={false} onPending={noop} onSaved={noop}/>)}
 {view==='collection'&&<><button data-qa-target="a" onClick={()=>setCollectionId('a')}>合成甲</button><button data-qa-target="b" onClick={()=>setCollectionId('b')}>合成乙</button><BeautyCollectionPanel ids={[collectionId]} canDiscount onClose={noop} onSaved={noop} onGuard={noop} modal/></>}
 {view==='purchase'&&<form className="mx-auto max-w-3xl" onSubmit={e=>{e.preventDefault();setMessage('合成收款已核對；未寫入任何交易。');}}><CourseAssignmentPayment price={1000} canDiscount profitEnabled={false} cashReader={async()=>({success:true,status:'OPEN'})} musicPeriods={music?[4]:undefined}/><button className="min-h-11 rounded border p-2">確認合成收款</button></form>}
 {view==='calendar'&&(module==='beauty'?<BeautyScheduleWorkspace cashbookShortcut={<button>現金收支</button>} data={beautyCalendar} slug="synthetic" onOpen={id=>setMessage('開啟合成預約 '+id)} onRoster={()=>setMessage('合成清單')} onDateChange={noop} readOnly={false} onLoaded={noop}/>:<CourseWorkspace {...calendar}/>)}
 {view==='reservation'&&<ServiceReservationForm source={reservation} date="2099-10-26" seed={{time:'09:00',customerId:'c1',roomId:'r1',coachId:'t1'}} onGuard={noop} onCreated={noop}/>}
 {view==='rental'&&<div className="mx-auto flex h-[650px] max-h-[80vh] max-w-3xl flex-col"><RentalPanel module={module==='beauty'?'beauty':'course'} rooms={rooms} permissions={{create:true,edit:true,collect:true,correct:true,customerRead:true,customerCreate:true}} customers={customers} seed={{date:'2099-10-26',time:'09:00',roomId:'r1'}}/></div>}
 {view==='staff'&&(module==='beauty'?<BeautyNativeStaffWorkspace data={staffData} canManage/>:<CourseStaffWorkspace previewStoreId="synthetic" staff={[person,{...person,id:'off',active:false,name:'停用測試人員'}]} templates={services.map(s=>({id:s.id,name:s.name}))} customers={[]} maxStaff={10} canManage music={music} sportsNative={!music} permissionGroups={perms}/>)}
 {view==='personnel'&&(module==='beauty'?<BeautyNativeAccountWorkspace storeId="synthetic" staff={[{...person,kind:'manager',role:'STAFF',coachEnabled:false,email:'staff@example.invalid'}]} maxStaff={10} canManage canAssignRoles editablePermissions={perms.flatMap(g=>g.codes.map(c=>c.code))} rolePresets={{STAFF:['booking.read'],MANAGER:['booking.read','booking.update','transaction.read'],OWNER:['booking.read','booking.update','transaction.read']}} permissionGroups={perms}/>:<CourseStaffWorkspace previewStoreId="synthetic" staff={[{...person,kind:'manager',role:'STAFF',coachEnabled:false,email:'staff@example.invalid'}]} templates={[]} customers={[]} maxStaff={10} canManage canAssignRoles rolePresets={{STAFF:['booking.read'],MANAGER:['booking.read','booking.update','transaction.read'],OWNER:['booking.read','booking.update','transaction.read']}} music={music} accountKind="manager" permissionGroups={perms}/>)}
 {view==='customers'&&<CourseMemberWorkspace {...member}/>}
 {view==='shared'&&<SharedPagesFixture/>}
 </div></OperationScope></FixtureBoundary></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
