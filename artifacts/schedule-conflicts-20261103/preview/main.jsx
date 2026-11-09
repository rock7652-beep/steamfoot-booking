import React from 'react';
import {createRoot} from 'react-dom/client';
import {ServiceReservationForm} from '@/components/admin/service-reservation-form';
import {SportsScheduleFields} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';
import '@/app/globals.css';
const noop=()=>{};
const conflict='2026-11-23 09:00 排課衝突：2026-11-23 09:00–2026-11-23 10:15 這個空間已有租借（含緩衝時間）；2026-11-30 09:00 排課衝突：2026-11-30 09:00–2026-11-30 10:15 這個空間已有租借（含緩衝時間）；尚未建立，請調整時間或空間';
window.fixtureCalls=[];window.fixtureCreated=[];
const sportSource={catalogHref:'#',command:async input=>{window.fixtureCalls.push(input);return input.payload.time==='09:00'?{success:false,error:conflict}:{success:true};},createCustomer:async()=>{throw Error('no writes');}};
const beautySource={itemEntitlements:true,services:[{id:'s',name:'驗收服務',duration:60,buffer:15,price:1000,trialPrice:500,revision:1}],technicians:[{id:'t',name:'驗收技師',serviceIds:['s']}],locations:[{id:'r',name:'驗收床位'}],customers:[{id:'c',name:'合成顧客',phone:'0900000000'}],cards:[],policyRevision:1,
 readAvailability:async intent=>intent.time==='09:00'?{success:true,data:{slots:['11:00'],arrangement:null,arrangementError:'2026-11-23 09:00 此時段無法安排：指定位置在服務或整理時間內已被占用，請換位置或時間（占用：2026-11-23 08:30–2026-11-23 10:15，含整理或租借緩衝時間）'}}:{success:true,data:{slots:[intent.time],arrangement:[{technicianId:'t',technicianName:'驗收技師',locationId:'r',locationName:'驗收床位'}]}},
 submit:async intent=>{window.fixtureCalls.push(intent);return {success:true};}};
const sports={storeId:'fixture',date:'2026-11-23',subjects:[{id:'s',templateId:'template',name:'合成運動項目',active:true,durationMinutes:60}],coaches:[{id:'t',name:'驗收教練',templates:['template']}],rooms:[{id:'r',name:'驗收教室',capacity:8,rental:true}],customers:[],fees:[],lessons:[],students:[]};
function App(){const beauty=new URLSearchParams(location.search).get('module')==='beauty';return <main className="mx-auto max-w-4xl p-4"><h1 className="mb-4 text-xl">隔離介面驗收 · {beauty?'美業':'運動'}</h1>{beauty?<ServiceReservationForm source={beautySource} date="2026-11-23" seed={{customerId:'c',time:'09:00'}} onGuard={noop} onCreated={date=>window.fixtureCreated.push(date)}/>:<SportsScheduleFields source={sportSource} initial={sports} date="2026-11-23" seed={{coachId:'t',time:'09:00'}} schedulingModes={{assignedSchedulingEnabled:false,selfBookingEnabled:true}} requestKey="00000000-0000-4000-8000-000000000001" onGuard={noop} onCreated={date=>window.fixtureCreated.push(date)}/>}</main>}
createRoot(document.getElementById('root')).render(<App/>);
