// Real management components with synthetic records and explicitly blocked business writes.
import {useState,useMemo,useCallback,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {CustomersListWithDrawer} from '@/app/(dashboard)/dashboard/customers/_components/customers-list-with-drawer';
import {CustomerInlineDetail} from '@/app/(dashboard)/dashboard/customers/_components/customer-inline-detail';
import {useCustomerPanelContextReader} from '@/components/admin/use-customer-panel-context-reader';
import {RosterCustomerPanel} from '@/app/(dashboard)/dashboard/courses/roster-customer-panel';
import {useRosterCustomerReader} from '@/components/admin/use-roster-customer-reader';
import {beautyCustomerReaders} from '@/lib/beauty/customer-reader';
import {useBeautyNativePlanProgressReader} from '@/components/beauty/use-native-plan-progress-reader';
import {BeautyPlanProgress} from '@/components/beauty/plan-progress';
import {CourseMemberWorkspace} from '@/app/(dashboard)/dashboard/courses/member-workspace';
import {CourseStaffWorkspace} from '@/app/(dashboard)/dashboard/courses/staff-workspace';
import {CourseWorkspace} from '@/app/(dashboard)/dashboard/courses/workspace';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {CustomerLabelsProvider} from '@/components/customer-labels';
import '@/app/globals.css';
const win=window as unknown as {__qaAction:(name:string,args:unknown[])=>Promise<unknown>;__qaOrder:unknown};
win.__qaAction=async(name,args)=>{
 if(name==='getCustomerDrawerDetailAction'){
  await new Promise(resolve=>setTimeout(resolve,100));
  const id=String(args[0]);
  return {success:true,data:{id,storeId:'synthetic',name:`合成學員${id.split('-')[1]}`,phone:'0900000000',lineUserId:'synthetic',lineLinkStatus:'LINKED',authSource:'MANUAL',customerStage:'ACTIVE',canReadWallets:true,canReadBookings:true,canAssignPlan:false,canBook:false,canAdjustWallet:false,planWallets:Array.from({length:6},(_,i)=>({id:`wallet-${i}`,storeId:'synthetic',status:'ACTIVE',plan:{id:'plan',name:`蒸足完整方案${i}`,sessionCount:10},purchasedPrice:8000,totalSessions:10,remainingSessions:9,expiryDate:new Date('2027-02-01'),startDate:new Date('2026-11-01'),createdAt:new Date('2026-11-01'),sessions:[],usageProgress:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z'}],voided:[]}})),_count:{planWallets:6,sponsoredCustomers:0,bookings:1},createdAt:new Date('2026-11-01'),updatedAt:new Date('2026-11-01'),recentConsumption:null,recentBookings:[],sponsor:null,panelSummary:{next:null,pending:[],healthEnabled:false,health:null,canConfirm:false}}};
 }
 if(name==='saveCourseDisplayOrder'){win.__qaOrder=args[0];return {success:true,revision:1};}
 if(name==='loadCourseCustomerBookings')return {success:true,data:[],hasMore:false};
 if(name==='loadMusicStudentWorkspace')return {success:true,data:{next:null,balance:null,canReadBookings:true}};
 if(name==='getCourseStaffAvailability')return {revision:'v1',inheritStoreHours:true,weekly:[],exceptions:[],retainedSessions:[]};
 if(['searchCourseCustomers','loadCourseCustomerSearchIndex'].includes(name))return {success:true,rows:[],hasMore:false};
 throw Error(`Business operation disabled in synthetic fixture: ${name}`);
};
const templates=[{id:'template',name:'吉他團體班',musicSubjectId:'A',subjectName:'吉他團體班',category:'音樂',capacity:8,isActive:true,pointCost:1,durationMinutes:60,waitlistEnabled:false,waitlistLimit:0,waitlistStopMinutes:0}];
const plans=Array.from({length:23},(_,i)=>({id:`plan-${i}`,name:`吉他方案${String(i+1).padStart(2,'0')}`,points:4,price:3200,validDays:35,isActive:i<22,unit:'SESSION',templateIds:['template']}));
const teacher={updatedAt:'2026-11-12T00:00:00Z',id:'teacher',name:'合成老師',kind:'coach',coachEnabled:true,qualificationIds:['template'],qualificationsConfirmed:true,coachLoginReady:false,birthday:'',emergencyContactRelation:'',assignments:[],email:'',contactEmail:'',phone:'0900000000',emergencyContactName:'',emergencyContactPhone:'',active:true,memberEnabled:true,permissions:[],customerId:''};
function SteamPreview(){
 const reader=useCustomerPanelContextReader('synthetic-booking');const [ready,setReady]=useState(false),[open,setOpen]=useState(false);
 return <section><button className="min-h-11 px-3" onClick={()=>reader.read('student').then(()=>setReady(true))}>{ready?'蒸足資料已備齊':'預讀蒸足顧客'}</button><button className="min-h-11 px-3" onClick={()=>setOpen(true)}>點開蒸足方案</button>{open&&<div className="fixed inset-4 z-50 overflow-auto rounded-xl bg-white p-4"><CustomerInlineDetail customerId="student" readScope="synthetic-booking" readOnly onBack={()=>setOpen(false)} onUpdated={()=>{}}/></div>}</section>;
}
function RosterPreview(){
 const reader=useRosterCustomerReader('session','synthetic');
 const [ready,setReady]=useState(false),[open,setOpen]=useState(false);
 return <section><button className="min-h-11 px-3" onClick={()=>reader.read(JSON.stringify(['student','card'])).then(()=>setReady(true))}>{ready?'名單方案已備齊':'預讀名單方案'}</button><button className="min-h-11 px-3" onClick={()=>setOpen(true)}>點開名單方案</button>{open&&<RosterCustomerPanel customer={{id:'student',name:'合成學員',phone:'0900000000',cardId:'card'}} sessionId="session" storeId="synthetic" onClose={()=>setOpen(false)}/>}</section>;
}
function CustomerEntry(){
 const module=new URLSearchParams(location.search).get('qaModule')??'music',beauty=module==='beauty';
 const ports=useMemo(()=>beautyCustomerReaders('synthetic'),[]),progress=useBeautyNativePlanProgressReader('synthetic');
 const preloadCardProgress=useCallback((id:string,card:string,revision:number)=>progress.read('synthetic',id,card,revision),[progress]);
 const getCardProgress=useCallback((id:string,card:string,revision:number)=>progress.get('synthetic',id,card,revision),[progress]);
 const source=beauty?{...ports,preloadCardDetails:true,preloadCardProgress,getCardProgress,cardProgress:(card:{id:string},context:{customerId:string;revision:number})=><BeautyPlanProgress cardId={card.id} customerId={context.customerId} storeId="synthetic" scope="synthetic" revision={context.revision}/>,sessionUnitLabel:'次',choices:[],canManageMembers:false,basePath:'/dashboard/beauty?tab=顧客管理'}:undefined;
 if(module==='steam')return <CustomersListWithDrawer rows={Array.from({length:6},(_,i)=>({id:`student-${i}`,name:`合成學員${i}`,phone:'0900000000',createdAt:'2026-11-01T00:00:00Z',status:'ACTIVE',planWallets:[],labels:[],_count:{bookings:0}})) as unknown as ComponentProps<typeof CustomersListWithDrawer>['rows']} hasActiveFilters={false} basePath='/dashboard/customers' plans={[]} staffOptions={[]} canAssign={false} canDiscount={false} canEditNote={false} readOnly/>;
 return <CourseMemberWorkspace {...{previewStoreId:'synthetic',view:'customers',music:true,sportsNative:true,templates:[],people:Array.from({length:6},(_,i)=>({id:`student-${i}`,name:`合成學員${i}`,phone:'0900000000',email:null,gender:null,serviceNote:null,address:null,emergencyContactName:null,emergencyContactPhone:null,birthday:'',notes:null})),customerRows:Array.from({length:6},(_,i)=>({id:`student-${i}`,name:`合成學員${i}`,phone:'0900000000',createdAt:'2026-11-01T00:00:00Z',status:'ACTIVE',planWallets:[],labels:[],_count:{bookings:0}})),plans:[],cards:[],canEdit:false,canCreate:false,canManageStaff:false,canAssign:false,canReadBookings:true,canReadTransactions:false,healthEnabled:false,canReadCards:true,assignmentStaff:[],canAssignManager:false} as unknown as ComponentProps<typeof CourseMemberWorkspace>} source={source as ComponentProps<typeof CourseMemberWorkspace>['source']} music={module==='music'} />;
}
function Fixture(){
 const [view,setView]=useState(new URLSearchParams(location.search).get('kind')==='customers'?'customers':'plans');
 return <div className="flex min-h-screen"><aside className="hidden w-56 shrink-0 border-r border-earth-200 p-4 md:block">合成店家後台</aside><main className="min-w-0 flex-1 p-4"><nav className="mb-4 flex gap-2">{[['plans','收費方式預覽'],['teachers','教師管理預覽'],['rooms','空間管理預覽'],['roster','名單方案預覽'],['steam','蒸足方案預覽']].map(([id,name])=><button className="min-h-11 rounded border px-3" key={id} onClick={()=>setView(id)}>{name}</button>)}</nav>
 {view==='customers'&&<CustomerEntry/>}
 {view==='steam'&&<SteamPreview/>}
 {view==='roster'&&<RosterPreview/>}
 {view==='plans'&&<CourseMemberWorkspace {...{previewStoreId:'synthetic',view:'plans',music:true,templates,subjects:[{id:'A',name:'吉他團體班',category:'音樂',isActive:true}],people:[],customerRows:[],plans,cards:[],canEdit:true,canCreate:true,canManageStaff:false,canAssign:false,canReadBookings:false,canReadTransactions:false,healthEnabled:false,canReadCards:false,assignmentStaff:[],canAssignManager:false,displayOrder:{ids:plans.map(p=>p.id),revision:0}} as ComponentProps<typeof CourseMemberWorkspace>}/>}
 {view==='teachers'&&<CourseStaffWorkspace {...{previewStoreId:'synthetic',accountKind:'coach',music:true,staff:[teacher],maxStaff:10,templates,customers:[],canManage:true,feeEnabled:true,permissionGroups:[],teachingPlans:[{id:'A1',name:'吉他個別課800',subjectIds:['A'],active:true,defaults:{A:{mode:'SHARE',value:60}}}]} as ComponentProps<typeof CourseStaffWorkspace>}/>}
 {view==='rooms'&&<CourseWorkspace {...{storeId:'synthetic',view:'rooms',selectedDate:'2026-11-12',today:'2026-11-12',nowIso:'2026-11-12T00:00:00Z',calendarDays:{},staffAvailability:[],staffAvailabilityExceptions:[],rooms:[{id:'room',name:'合成教室',category:'音樂教室',capacity:8,isActive:true,rentalEnabled:false,rentalHourlyRate:0}],templates:[],sessions:[],coaches:[],cancelledBookings:[],canCreate:true,canEdit:true,canDelete:false,businessProfile:'MUSIC'} as ComponentProps<typeof CourseWorkspace>}/>}
 </main></div>;
}
createRoot(document.getElementById('root')!).render(<PanelReadProvider><CustomerLabelsProvider initial={{available:true,enabled:false,canEdit:false,canManage:false,categories:[],labels:[],assignments:{}}}><Fixture/></CustomerLabelsProvider></PanelReadProvider>);
