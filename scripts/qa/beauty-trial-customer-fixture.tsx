import {BeautyChargeWorkspace} from '@/components/beauty/charge-workspace';
import {BeautyTechnicianRoster,type TechnicianReceipt} from '@/components/beauty/technician-roster';
import {SportsMoveConfirm} from '@/app/(dashboard)/dashboard/courses/sports-move-confirm';
import type {NativeRosterBooking} from '@/app/(dashboard)/dashboard/courses/roster-source';
import {RightSheet} from '@/components/admin/right-sheet';
import {RentalPanel} from '@/app/(dashboard)/dashboard/courses/rental-panel';
// Synthetic UI only: every server action import is replaced by the browser runner.
import {BeautyNativeTransaction} from '@/components/beauty/native-transaction-source';
import {BeautyNativeCustomerWorkspace} from '@/components/beauty/native-customer-source';
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
 return <BeautyCollectionDialog ids={['collection']} initialCharges={[{id:'collection',revision:1,personName:'收款測試',serviceName:'30分鐘肩頸按摩',price:250,discount:{kind:'AMOUNT',value:0},reduction:0,netPrice:250,collected:0,due:250}]} storeId="synthetic" canDiscount={false} onGuard={guard} onClose={()=>setSaved(current=>current||'關閉')} onSaved={()=>setSaved('收款')}/>;
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
function ChargesPreview(){const data={...rentalData,services:[{...rentalData.services[0],category:'按摩',active:true,revision:1,trialPrice:150,price:250}],plans:[{id:'five',name:'肩頸五次方案',serviceIds:['service'],sessions:5,price:1000,validDays:180,revision:1,active:true},{id:'ten',name:'肩頸十次方案',serviceIds:['service'],sessions:10,price:1800,validDays:180,revision:1,active:true}],access:{...rentalData.access,planAccess:true,staffAccess:true},chargeRulesActive:true,chargeCatalog:{enabled:true,editingEnabled:true,singles:[],plans:[]},displayOrders:{plan:{ids:[],revision:0}}} as unknown as BeautyDashboardData;return <BeautyChargeWorkspace data={data} canEdit/>;}
function TechnicianPreview(){const [receipts,setReceipts]=useState<Record<string,TechnicianReceipt>>({}),[busy,setBusy]=useState(false);const rows=[{id:'tech-booking',status:'RESERVED',customerName:'測試顧客',service:{revision:1,technicianId:'tech',technicianName:'測試技師',serviceName:'肩頸按摩',locationName:'床位1'}}] as NativeRosterBooking[];return <BeautyTechnicianRoster rows={rows} storeId="synthetic" canEdit busy={busy} onBusy={setBusy} receipts={receipts} onSaved={value=>setReceipts({[value.id]:value})} onMove={()=>{(window as unknown as {qaReassign:boolean}).qaReassign=true;}}/>;}
function PastePreview({onClose}:{onClose:()=>void}){return <SportsMoveConfirm clipboard={{sessionId:'tech-booking',startsAt:'2026-11-03T03:00:00Z',templateId:'service',roomId:'bed',coachId:'tech',durationMinutes:60,scope:'SINGLE',label:'測試顧客 · 肩頸按摩'}} seed={{date:'2026-11-03',time:'11:00',roomId:'bed',coachId:'tech'}} rooms={[{id:'bed',name:'床位1'}]} coaches={[{id:'tech',displayName:'測試技師'}]} onClose={onClose} onSaved={onClose} source={{save:async()=>({success:true}),read:async()=>({success:true,data:{startsAt:'2026-11-03T03:00:00Z',endsAt:'2026-11-03T04:00:00Z',roomId:'bed',coachId:'tech'}})}}/>;}
function RentalDetailPreview({onClose}:{onClose:()=>void}){return <RightSheet open presentation="centered" width={640} maxHeight={680} fitContent onClose={onClose} labelledById="rental-fit-title"><header className="flex items-center justify-between border-b p-4"><h2 id="rental-fit-title">租借明細</h2><button onClick={onClose} className="min-h-11 px-3">關閉</button></header><div className="flex min-h-0 flex-1 flex-col p-4"><RentalPanel module="beauty" id="rental-fit" initialDetail={{id:'rental-fit',roomId:'bed',customerId:null,customerName:'租借測試顧客',customerPhone:'0900000001',startsAt:'2026-11-03T07:30:00Z',endsAt:'2026-11-03T08:30:00Z',amount:0,note:'',revision:1,cancelledAt:null,hourlyRateSnapshot:0,payment:null}} rooms={[{id:'bed',name:'床位1',isActive:true,rentalEnabled:true}]} seed={{}} permissions={{customerRead:true,customerCreate:false,collect:true,correct:true,edit:true}}/></div></RightSheet>;}
function ServiceCreatePreview(){
 const data={...rentalData,services:[],plans:[],techs:[{id:'tech',name:'測試技師',serviceIds:[]}],manage:{technician:true},access:{feeAccess:true},chargeRulesActive:true} as unknown as BeautyDashboardData;
 const tree=BeautyCourseCatalog({tab:'服務項目',data,canEdit:true});
 const port=tree.props.catalog??tree.props.children.find((node:{props?:{catalog?:unknown}})=>node?.props?.catalog)?.props.catalog;
 return <MusicSubjectCatalog initialCreate sportsNative sportsCoaches={[{id:'tech',name:'測試技師'}]} storeId="synthetic" subjects={[]} canCreate canEdit catalog={{...port,transport:async(input:Record<string,unknown>)=>{
  (window as unknown as {serviceSaved:unknown}).serviceSaved=input;
  return {success:true,storeId:'synthetic',data:nativeBeautyService({id:'service90',revision:1,name:input.name,category:input.category,duration:input.duration,buffer:input.buffer,active:true,price:0,trialPrice:null,defaultRate:null},['tech'])};
 }}}/>;
}
const qaCustomer={id:'purchase-customer',name:'購買測試顧客',phone:'0900000008',birthday:null,createdAt:new Date('2026-01-01'),updatedAt:new Date('2026-01-01'),lastVisitAt:null,lineLinkStatus:'UNLINKED',customerStage:'LEAD',assignedStaff:null,sponsor:null,_count:{sponsoredCustomers:0}};
const qaPurchasedCard={id:'purchased-card',planId:'plan:five',name:'全身按摩5次',unit:'SESSION' as const,remaining:5,held:0,available:5,expired:false,closed:false,expiresAt:'2099-01-01T15:59:59Z',templateIds:['service'],termSessionIds:[],allowShared:false,members:[qaCustomer],entries:[],musicValidityDays:null,musicActivatedAt:null};
const qaCards={success:true as const,rows:[qaPurchasedCard],hasMore:false,totals:[{unit:'SESSION',count:1,remaining:5,held:0,available:5}]};
let qaPurchaseIntent:{requestKey:string;purchaseId:string|null;status:'PREPARED'|'COMMITTED'|'ACKNOWLEDGED'}|null=null;
(window as unknown as {qaPlanAction:(name:string,input:Record<string,unknown>)=>Promise<unknown>}).qaPlanAction=async(name,input)=>{
 if(name==='prepareBeautyPlanPurchaseIntentAtomic'){qaPurchaseIntent={requestKey:String(input.requestKey),purchaseId:null,status:'PREPARED'};return {success:true,data:{kind:'prepared',intent:qaPurchaseIntent}};}
 if(name==='readBeautyPlanPurchaseIntent')return {success:true,data:qaPurchaseIntent?.status==='ACKNOWLEDGED'&&!input.requestKey?null:qaPurchaseIntent};
 if(name==='acknowledgeBeautyPlanPurchaseIntent'){qaPurchaseIntent={...qaPurchaseIntent!,status:'ACKNOWLEDGED'};return {success:true,data:qaPurchaseIntent};}
 if(name==='assignBeautyNativeCard'){qaPurchaseIntent={...qaPurchaseIntent!,purchaseId:'purchased-card',status:'COMMITTED'};(window as unknown as {qaPurchaseCount:number}).qaPurchaseCount=((window as unknown as {qaPurchaseCount:number}).qaPurchaseCount??0)+1;return {success:true,data:{cardId:'purchased-card'},checkoutCards:{customerId:qaCustomer.id,result:qaCards}};}
 throw Error('Unexpected plan operation');
};
(window as unknown as {qaReadCards:unknown}).qaReadCards=qaCards;
const qaPurchaseData={...rentalData,now:Date.now(),customers:[qaCustomer],cards:[],services:[{id:'service',name:'全身按摩60',category:'按摩',duration:60,buffer:10,price:1100,trialPrice:null,active:true,revision:1}],plans:[{id:'five',revision:1,name:'全身按摩5次',sessions:5,price:5500,validDays:180,serviceIds:['service'],active:true,allowShared:false,customerPurchasable:false}],assignmentStaff:[],manage:{card:true},access:{financeAccess:true,customerAccess:true,planAccess:true}} as unknown as BeautyDashboardData;
function PurchaseCompletionPreview(){
 const [phase,setPhase]=useState(0);
 const data=phase<2?qaPurchaseData:{...qaPurchaseData,cards:[{id:'purchased-card',planId:'five',name:'全身按摩5次',remaining:5,held:phase<3?0:1,expiresAt:'2099-01-01T15:59:59Z',closedAt:null,serviceIds:['service'],memberIds:[qaCustomer.id],allowShared:false}] } as unknown as BeautyDashboardData;
 return <><button onClick={()=>setPhase(value=>value+1)}>模擬方案背景更新</button><BeautyNativeCustomerWorkspace data={data} customerId={qaCustomer.id} initialAction="assign" planPurchaseRecoveryEnabled/></>;
}
(window as unknown as {qaVoid:(input:unknown)=>Promise<unknown>}).qaVoid=async input=>{(window as unknown as {voidSubmitted:unknown}).voidSubmitted=input;await new Promise(resolve=>setTimeout(resolve,200));return {success:true};};
function VoidPreview({pending=false}:{pending?:boolean}){return <BeautyNativeTransaction storeId="synthetic" order={{id:'synthetic-sale',name:'全身按摩5次',customerName:'作廢測試顧客',status:pending?'PENDING':'CONFIRMED',price:pending?5500:0,points:5,remaining:pending?null:5,reserved:0,attended:0,usedQuota:0,unit:'SESSION',expiresAt:'2099-01-01',transferLastFive:'',refunds:[],note:'',revenueStaffId:null,voidReason:null,revision:0}} canRefund={false} canConfirm={false} cardAccess canEdit={false} canVoid staffOptions={[]}/>;}
function Fixture(){
 const [view,setView]=useState('trial');
 return <><button onClick={()=>setView('charges')}>分組收費預覽</button><button onClick={()=>setView('technician')}>技師資訊預覽</button><button onClick={()=>setView('paste')}>貼上改期預覽</button><button onClick={()=>setView('voidPending')}>待核帳作廢預覽</button><button onClick={()=>setView('void')}>作廢預覽</button><button onClick={()=>{qaPurchaseIntent={requestKey:'00000000-0000-4000-8000-000000000009',purchaseId:'purchased-card',status:'COMMITTED'};setView('restoredPurchase');}}>恢復購買預覽</button><button onClick={()=>setView('purchaseCompletion')}>購買完成預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('calendar')}>卡片預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('planPayment')}>方案現金預覽</button><button onClick={()=>setView('rentalDetail' as typeof view)}>租借明細預覽</button><nav className="mx-auto mb-3 flex max-w-5xl flex-wrap gap-3"><button className="min-h-11 border px-3" onClick={()=>setView('trial')}>體驗預約預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('service')}>服務項目預覽</button><button className="min-h-11 border px-3" onClick={()=>setView('rental')}>空間出租預覽</button>{(["charge","move","collection"] as const).map(kind=><button key={kind} className="min-h-11 border px-3" onClick={()=>setView(kind)}>{kind==="charge"?"簡化收費預覽":kind==="move"?"改期預覽":"直接收款預覽"}</button>)}</nav><main className="mx-auto max-w-5xl rounded-xl border border-earth-200 bg-white p-4">{view==='charges'?<ChargesPreview/>:view==='technician'?<TechnicianPreview/>:view==='paste'?<PastePreview onClose={()=>setView('trial')}/>:view==='rentalDetail'?<RentalDetailPreview onClose={()=>setView("trial")}/>:view==='voidPending'?<VoidPreview key="pending" pending/>:view==='void'?<VoidPreview key="confirmed"/>:view==='restoredPurchase'?<PurchaseCompletionPreview key="restored"/>:view==='purchaseCompletion'?<PurchaseCompletionPreview key="new"/>:view==='planPayment'?<PlanPaymentPreview/>:view==='calendar'?<CalendarPreview/>:view==='trial'?<><h1 className="mb-3 font-semibold">新增預約 · 隔離測試</h1><ServiceScheduleFields rental={{module:'beauty',rooms:[],customers:[],permissions:{create:false,customerRead:false,customerCreate:false,collect:false,correct:false,edit:false}}} source={source} date={toLocalDateStr()} seed={{time:'12:00'}} onGuard={()=>{}} onCreated={()=>{}}/></>:view==='rental'?<RentalPreview/>:view==='charge'||view==='move'||view==='collection'?<CompactPreview key={view} kind={view}/>:<ServiceCreatePreview/>}</main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
