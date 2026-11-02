// Synthetic UI only: every server action import is replaced by the browser runner.
import {BeautyCourseCatalog} from '@/components/beauty/catalog-adapter';
import {nativeBeautyService} from '@/lib/beauty/native-service';
import {CourseAssignmentPayment} from '@/components/admin/course-assignment-payment';
import {BeautyMoveDialog} from '@/components/beauty/move-dialog';
import {BeautyChargeEditor} from '@/components/beauty/charge-editor';
import {BeautyCollectionDialog} from '@/components/beauty/collection-dialog';
import {BeautyNativeScheduleDialog} from '@/components/beauty/native-schedule-source';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import {useCallback,useState,type ComponentProps} from 'react';
import {CourseScheduleBoard} from '@/app/(dashboard)/dashboard/courses/course-schedule-board';
import {ServiceScheduleFields} from '@/components/admin/service-schedule-fields';
import {MusicSubjectCatalog} from '@/app/(dashboard)/dashboard/courses/music-subject-catalog';
import {createRoot} from 'react-dom/client';
import {type ServiceReservationSource} from '@/components/admin/service-reservation-form';
import {toLocalDateStr} from '@/lib/date-utils';
const source:ServiceReservationSource={
 itemEntitlements:true,services:[{id:'service',name:'30分鐘肩頸按摩',duration:30,trialDuration:20,buffer:5,price:250,trialPrice:150,revision:1}],
 technicians:[{id:'tech',name:'測試技師',serviceIds:['service']}],locations:[{id:'bed',name:'床位1'}],customers:[{id:'existing',name:'既有測試顧客',phone:'0900000001'}],cards:[],policyRevision:1,
 createCustomer:async input=>({success:true,customer:{id:'synthetic-new',...input}}),
 readAvailability:async()=>({success:true,data:{slots:['12:00'],arrangement:[{technicianId:'tech',technicianName:'測試技師',locationId:'bed',locationName:'床位1'}]}}),
 submit:async intent=>{(window as unknown as {submitted:unknown}).submitted=intent;return {success:true};},
};
const rentalData={storeId:'synthetic',date:'2026-11-03',services:source.services.map(s=>({...s,active:true,category:''})),techs:source.technicians.map(t=>({...t,active:true})),locations:[{id:'bed',name:'床位1',isActive:true,rentalEnabled:true,rentalHourlyRate:0,capacity:1},{id:'off',name:'床位2',isActive:true,rentalEnabled:false,rentalHourlyRate:0,capacity:1}],cards:[],customers:source.customers,policy:{revision:1},manage:{customer:true,collect:false,refund:false,update:true},access:{writeAccess:true,customerAccess:true}} as unknown as BeautyDashboardData;
(window as unknown as {qaRentalSave:(input:unknown,module:string)=>Promise<unknown>}).qaRentalSave=async(input,module)=>{
 (window as unknown as {rentalSubmitted:unknown}).rentalSubmitted={input,module};return {success:true,id:'synthetic-rental'};
};
function RentalPreview(){
 const [saved,setSaved]=useState(''),[busy,setBusy]=useState(false);
 const guard=useCallback((_dirty:boolean,pending:boolean)=>setBusy(pending),[]);
 return saved?<p role="status">租借已儲存：{saved}</p>:<BeautyNativeScheduleDialog data={rentalData} date="2026-11-03" seed={{time:'12:30',roomId:'bed'}} onGuard={guard} onCreated={setSaved} onClose={()=>setSaved('已關閉')} busy={busy}/>;
}
function CompactPreview({kind}:{kind:'charge'|'move'|'collection'}){
 const [saved,setSaved]=useState('');const guard=useCallback(()=>{},[]);
 if(saved)return <p role="status">操作完成：{saved}</p>;
 if(kind==='charge')return <BeautyChargeEditor storeId="synthetic" services={rentalData.services} technicians={rentalData.techs} initialDraft={{expectedStoreId:'synthetic',kind:'single',serviceId:'service',name:'30分鐘肩頸按摩',price:250,sessions:1,trialPrice:250,trialMinutes:null,storeCost:null,trialStoreCost:null,technicianIds:['tech']}} port={{perChargeTechnicians:true,save:async draft=>{(window as unknown as {chargeSaved:unknown}).chargeSaved=draft;return {success:true};}}} onSaved={()=>setSaved('收費設定')} onClose={()=>setSaved(current=>current||'關閉')}/>;
 if(kind==='move')return <BeautyMoveDialog startsAt="2026-11-03T04:30:00Z" date="2026-11-03" technicians={source.technicians} locations={source.locations} pending={false} onClose={()=>setSaved(current=>current||'關閉')} onSubmit={input=>{(window as unknown as {moveSaved:unknown}).moveSaved=input;setSaved('改期');}}/>;
 return <BeautyCollectionDialog ids={['collection']} storeId="synthetic" canDiscount={false} onGuard={guard} onClose={()=>setSaved(current=>current||'關閉')} onSaved={()=>setSaved('收款')}/>;
}
function CalendarPreview(){
 const [mode,setMode]=useState<'day'|'week'>('day');
 const sessions:ComponentProps<typeof CourseScheduleBoard>['sessions']=[20,30,60].map((duration,i)=>({id:`card-${duration}`,templateId:'service',nameSnapshot:`${duration}分鐘肩頸按摩`,startsAt:['2026-11-03T00:00:00Z','2026-11-03T01:30:00Z','2026-11-03T09:00:00Z'][i],endsAt:new Date(Date.parse(['2026-11-03T00:00:00Z','2026-11-03T01:30:00Z','2026-11-03T09:00:00Z'][i])+duration*60000).toISOString(),coachId:'tech',roomId:i===0?'bed':'bed7',capacity:1,pointCost:1,servicePalette:true,bookings:[],service:{personName:`測試顧客${duration}`,status:'RESERVED',endsAt:new Date(Date.parse(['2026-11-03T00:00:00Z','2026-11-03T01:30:00Z','2026-11-03T09:00:00Z'][i])+duration*60000).toISOString(),occupiedEndsAt:new Date(Date.parse(['2026-11-03T00:00:00Z','2026-11-03T01:30:00Z','2026-11-03T09:00:00Z'][i])+(duration+5)*60000).toISOString(),buffer:5,paymentStatus:'待收款'}}));
 return <><button onClick={()=>setMode(mode==='day'?'week':'day')}>切換日週</button><CourseScheduleBoard serviceMode sportsNative businessProfile="FITNESS" mode={mode} today="2026-11-03" selectedDate="2026-11-03" sessions={sessions} rooms={Array.from({length:7},(_,i)=>({id:i===0?'bed':`bed${i+1}`,name:`床位${i+1}`,isActive:true}))} coaches={[{id:'tech',displayName:'測試技師',status:'ACTIVE',courseCoachEnabled:true}]} templates={[]} storePeriods={[{openTime:'08:00',closeTime:'18:00'}]} staffAvailability={[]} staffAvailabilityExceptions={[]} onSelectDate={()=>{}} onOpenEmpty={()=>{(window as unknown as {emptyClicks:number}).emptyClicks=((window as unknown as {emptyClicks:number}).emptyClicks??0)+1;}} onOpenSession={id=>{(window as unknown as {cardClicks:string[]}).cardClicks=[...((window as unknown as {cardClicks:string[]}).cardClicks??[]),id];}}/></>;
}
const planCashReader=async()=>({success:true as const,status:'OPEN'});
function PlanPaymentPreview(){
 const [summary,setSummary]=useState({paid:null as number|null,valid:false});const [saved,setSaved]=useState(false);
 return saved?<p role="status">現金購買表單確認完成（隔離）</p>:<form onSubmit={event=>{event.preventDefault();(window as unknown as {planPaymentSaved:unknown}).planPaymentSaved=Object.fromEntries(new FormData(event.currentTarget));setSaved(true);}}><CourseAssignmentPayment defaultPaymentMethod="CASH" cashReader={planCashReader} profitEnabled={false} price={5500} canDiscount={false} onSummary={setSummary}/><button className="min-h-11 border px-3" disabled={!summary.valid}>確認方案表單</button></form>;
}
function ServiceCreatePreview(){
 const data={...rentalData,services:[],plans:[],techs:[{id:'tech',name:'測試技師',serviceIds:[]}],manage:{technician:true},access:{feeAccess:true},chargeRulesActive:true} as unknown as BeautyDashboardData;
 const port=BeautyCourseCatalog({tab:'服務項目',data,canEdit:true}).props.catalog;
 return <MusicSubjectCatalog initialCreate sportsNative sportsCoaches={[{id:'tech',name:'測試技師'}]} storeId="synthetic" subjects={[]} canCreate canEdit catalog={{...port,transport:async(input:Record<string,unknown>)=>{
  (window as unknown as {serviceSaved:unknown}).serviceSaved=input;
  return {success:true,storeId:'synthetic',data:nativeBeautyService({id:'service90',revision:1,name:input.name,category:input.category,duration:input.duration,buffer:input.buffer,active:true,price:0,trialPrice:null,defaultRate:null},['tech'])};
 }}}/>;
}
function Fixture(){
 const [view,setView]=useState('trial');
 return <><button className="min-h-11 border px-3" onClick={()=>setView('calendar')}>卡片預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('planPayment')}>方案現金預覽</button><nav className="mx-auto mb-3 flex max-w-5xl flex-wrap gap-3"><button className="min-h-11 border px-3" onClick={()=>setView('trial')}>體驗預約預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('service')}>服務項目預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('rental')}>空間出租預覽</button>{(["charge","move","collection"] as const).map(kind=><button key={kind} className="min-h-11 border px-3" onClick={()=>setView(kind)}>{kind==="charge"?"簡化收費預覽":kind==="move"?"改期預覽":"直接收款預覽"}</button>)}</nav><main className="mx-auto max-w-5xl rounded-xl border border-earth-200 bg-white p-4">{view==='planPayment'?<PlanPaymentPreview/>:view==='calendar'?<CalendarPreview/>:view==='trial'?<><h1 className="mb-3 font-semibold">新增預約 · 隔離測試</h1><ServiceScheduleFields rental={{module:'beauty',rooms:[],customers:[],permissions:{create:false,customerRead:false,customerCreate:false,collect:false,correct:false,edit:false}}} source={source} date={toLocalDateStr()} seed={{time:'12:00'}} onGuard={()=>{}} onCreated={()=>{}}/></>:view==='rental'?<RentalPreview/>:view==='charge'||view==='move'||view==='collection'?<CompactPreview key={view} kind={view}/>:<ServiceCreatePreview/>}</main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
