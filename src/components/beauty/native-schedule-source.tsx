"use client";
import type {SportsScheduleSource} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';
import type {SportsSnapshot} from '@/lib/sports-staging-types';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import {scheduleNativeBeautyService} from '@/server/actions/beauty-native-schedule';
import {createRentalCustomer} from '@/server/actions/course-rental';
import {bookBeautyParty,readBeautySlots} from '@/server/actions/beauty';
import {orderCourseRows} from '@/lib/course-display-order';
import {useState} from 'react';
import {SportsScheduleDialog} from '@/app/(dashboard)/dashboard/courses/sports-schedule-dialog';
import {SportsScheduleFields} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';

async function measureBooking<T>(operation:'availability'|'submit',work:()=>Promise<T>){
 const at=performance.now();try{return await work();}finally{try{performance.measure?.('beauty.booking.'+operation,{start:at,end:performance.now()});}catch{/* Observability cannot change the booking result. */}}
}
/** View data and core ports. The original form owns every field and action. */
export function beautyNativeScheduleSource(data:BeautyDashboardData):{initial:SportsSnapshot;source:SportsScheduleSource}{
 const locations=orderCourseRows(data.locations,data.displayOrders?.room?.ids??[]);
 const techs=orderCourseRows(data.techs,data.displayOrders?.staff?.ids??[]);
 const services=orderCourseRows(data.services,data.displayOrders?.subject?.ids??[]);
 return {
  initial:{storeId:data.storeId,date:data.date,
   subjects:services.map(s=>({id:s.id,templateId:s.id,name:s.name,category:s.category,active:s.active,updatedAt:String(s.revision)})),
   coaches:techs.filter(t=>t.active).map(t=>({id:t.id,name:t.name,templates:t.serviceIds})),
   rooms:locations.filter(r=>r.isActive).map(r=>({id:r.id,name:r.name,capacity:r.capacity,rental:!!r.rentalEnabled})),
   customers:data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone})),fees:[],lessons:[],
   students:data.cards.filter(c=>!c.closedAt&&c.remaining>c.held).flatMap(c=>c.memberIds.flatMap(customerId=>c.serviceIds.map(serviceId=>({id:customerId,name:data.customers.find(p=>p.id===customerId)?.name??'',subject:serviceId,fee:c.planId,cardId:c.id,available:c.remaining-c.held,sportsMode:'ASSIGNED'})))),
  },
  source:{catalogHref:'?tab=服務項目',
   reservation:{services:services.filter(s=>s.active),technicians:techs.filter(t=>t.active).map(t=>({id:t.id,name:t.name,serviceIds:t.serviceIds})),locations:locations.filter(r=>r.isActive).map(r=>({id:r.id,name:r.name})),customers:data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone})),cards:data.cards,policyRevision:data.policy.revision,
    readAvailability:intent=>measureBooking('availability',()=>readBeautySlots('manager','',intent)),submit:intent=>measureBooking('submit',()=>bookBeautyParty('manager',intent)),
    ...(data.manage.customer&&data.access.customerAccess?{createCustomer:(input:{name:string;phone:string})=>createRentalCustomer(input,'beauty')}:{}),
   },
   createCustomer:input=>createRentalCustomer(input,'beauty'),
   command:async input=>{
    const value=input as {payload?:{subject?:unknown}}|null;
    const revision=data.services.find(s=>s.id===value?.payload?.subject)?.revision??0;
    return scheduleNativeBeautyService({...((typeof input==='object'&&input!==null)?input:{}),expectedServiceRevision:revision});
   },
  },
 };
}

/** Data and request lifetime only; the shared scheduling form selects its service mode. */
export function BeautyNativeScheduleFields({data,date,seed,onGuard,onCreated}:{data:BeautyDashboardData;date:string;seed:{time?:string;coachId?:string;roomId?:string;customerId?:string};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void}){
 const [requestKey]=useState(()=>crypto.randomUUID());
 return <SportsScheduleFields {...beautyNativeScheduleSource(data)} date={date} seed={seed} requestKey={requestKey} onGuard={onGuard} onCreated={onCreated}/>;
}


export function BeautyNativeScheduleDialog({data,date,seed,onGuard,onCreated,onClose,busy}:{data:BeautyDashboardData;date:string;seed:{time?:string;coachId?:string;roomId?:string;customerId?:string};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void;onClose:()=>void;busy:boolean}){
 return <SportsScheduleDialog fitContent title="新增預約" busy={busy} onClose={onClose}><BeautyNativeScheduleFields data={data} date={date} seed={seed} onGuard={onGuard} onCreated={onCreated}/></SportsScheduleDialog>;
}
