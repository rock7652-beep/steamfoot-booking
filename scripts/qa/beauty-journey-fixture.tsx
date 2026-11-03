import '../../src/app/(customer)/book/course-portal.css';
import '../../src/components/beauty/portal.css';
import {CourseScheduleBoard} from '../../src/app/(dashboard)/dashboard/courses/course-schedule-board';
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BeautyMemberBookingForm} from '../../src/components/beauty/member-booking-form';
import {ServiceReservationForm,type ServiceReservationSource} from '../../src/components/admin/service-reservation-form';
import {BeautyCollectionPanel} from '../../src/components/beauty/collection-panel';
import {expandServiceJourney} from '../../src/lib/beauty/expand-service-journey';
import {PanelReadProvider} from '../../src/components/operations/panel-read-cache';
import type {ServiceCharge} from '../../src/server/beauty/service-charges';
declare global{interface Window{qaIntent?:unknown;qaCharge?:ServiceCharge[]}}
const extra=(id:string,name:string,price:number,duration:number)=>[{id:'group-'+id,title:'加做（單次計費）',required:false,multiple:true,options:[{id,name,price,duration,active:true}]}];
const services=[{id:'A',name:'A 身體按摩',duration:60,buffer:10,price:1200,trialPrice:null,revision:1,addOnGroups:extra('1','1 頭部放鬆',300,20)},{id:'B',name:'B 臉部保養',duration:40,buffer:5,price:900,trialPrice:null,revision:1,addOnGroups:extra('2','2 保濕護理',200,10)}];
const cards=[{id:'card-A',name:'A 按摩方案',serviceIds:['A'],memberIds:['customer'],remaining:5,held:0,expiresAt:'2100-01-01T00:00:00Z',closed:false,closedAt:null},{id:'card-B',name:'B 保養方案',serviceIds:['B'],memberIds:['customer'],remaining:3,held:0,expiresAt:'2100-01-01T00:00:00Z',closed:false,closedAt:null}];
const techs=[{id:'one',name:'小美',serviceIds:['A','B'],gender:'FEMALE'},{id:'two',name:'小芳',serviceIds:['B'],gender:'FEMALE'}];
const charges:ServiceCharge[]=[{id:'charge',revision:1,personName:'範例顧客',serviceName:'A 身體按摩',basePrice:1200,baseCovered:true,price:500,netPrice:500,collected:0,due:500,reduction:0,discount:{kind:'AMOUNT',value:0},items:[{id:'1',name:'頭部放鬆',price:500,duration:20}]}];window.qaCharge=charges;
function CalendarFixture(){
 const servicesForDay=services.map((s,i)=>{const startsAt=i?'2099-10-20T07:10:00Z':'2099-10-20T06:00:00Z',endsAt=i?'2099-10-20T07:50:00Z':'2099-10-20T07:00:00Z';return {id:s.id,templateId:s.id,nameSnapshot:s.name,startsAt,endsAt,coachId:'one',roomId:'room',capacity:1,pointCost:1,servicePalette:true,bookings:[{id:'booking-'+s.id,customerId:'customer',customerName:'範例顧客',status:'RESERVED',bookingKind:'CARD'}],service:{groupId:'journey',personName:'範例顧客',status:'RESERVED',endsAt,occupiedEndsAt:i?'2099-10-20T07:55:00Z':'2099-10-20T07:10:00Z',buffer:s.buffer}};});
 return <CourseScheduleBoard serviceMode sportsNative businessProfile="FITNESS" mode="day" today="2099-10-20" selectedDate="2099-10-20" sessions={servicesForDay} rooms={[{id:'room',name:'床位 1',isActive:true}]} coaches={[{id:'one',displayName:'小美',status:'ACTIVE',courseCoachEnabled:true}]} templates={[]} storePeriods={[{openTime:'09:00',closeTime:'18:00'}]} staffAvailability={[]} staffAvailabilityExceptions={[]} onSelectDate={()=>{}} onOpenEmpty={()=>{}} onOpenSession={()=>{}}/>;
}
function Fixture(){
 const kind=new URLSearchParams(location.search).get('kind')??'member',single=new URLSearchParams(location.search).has('single');const [saved,setSaved]=useState(false);
 const source:ServiceReservationSource={services,technicians:techs,cards:single?cards.slice(0,1):cards,customers:[{id:'customer',name:'範例顧客',phone:'0900000000'}],locations:[{id:'room',name:'床位 1'}],policyRevision:0,itemEntitlements:true,
  readAvailability:async input=>({success:true,data:{slots:[input.time],arrangement:expandServiceJourney(input.people,services.map(s=>({...s,active:true})),false).map(p=>({technicianId:p.specifiedTechnicianId??'one',technicianName:techs.find(t=>t.id===p.specifiedTechnicianId)?.name??'小美',locationId:'room',locationName:'床位 1'}))}}),
  submit:async input=>{window.qaIntent=input;setSaved(true);return {success:true,data:{ids:['a','b']}};},
 };
 return <PanelReadProvider><div className={kind==='member'?'course-portal beauty-portal':undefined}><main className="mx-auto max-w-3xl p-4 [&_input:not([type=checkbox]):not([type=radio])]:appearance-none"><p className="mb-3 text-sm text-earth-600">隔離元件預覽 · 使用合成資料，不建立正式預約或收款</p><h1 className="mb-4 font-semibold">{kind==='desk'?'新增預約':kind==='payment'?'服務與加做收款':'預約服務'}</h1>{saved&&<p role="status">操作已完成（合成回覆）</p>}{kind==='member'&&<BeautyMemberBookingForm slug="qa" catalog={{services,techs,policy:{revision:0,selfBooking:true,selfCancel:true,selfReschedule:true,cancelDeduct:false,noShowDeduct:false,cancelLeadMinutes:240}}} cards={single?cards.slice(0,1):cards} customer={{id:'customer'}} onBooked={()=>setSaved(true)}/>} {kind==='desk'&&<ServiceReservationForm source={source} date="2099-10-20" seed={{customerId:'customer',time:'14:00'}} bookingType="regular" onGuard={()=>{}} onCreated={()=>setSaved(true)}/>} {kind==='calendar'&&<CalendarFixture/>} {kind==='payment'&&<BeautyCollectionPanel ids={['charge']} initialCharges={charges} storeId="qa" canDiscount={false} onClose={()=>{}} onSaved={()=>setSaved(true)} onGuard={()=>{}}/>}</main></div></PanelReadProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
