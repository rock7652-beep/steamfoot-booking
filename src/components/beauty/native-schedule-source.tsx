"use client";
import type {SportsScheduleSource} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';
import type {SportsSnapshot} from '@/lib/sports-staging-types';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import {scheduleNativeBeautyService} from '@/server/actions/beauty-native-schedule';
import {createRentalCustomer} from '@/server/actions/course-rental';
import {useState} from 'react';
import {SportsScheduleDialog} from '@/app/(dashboard)/dashboard/courses/sports-schedule-dialog';
import {SportsScheduleFields} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';

/** View data and core ports. The original form owns every field and action. */
export function beautyNativeScheduleSource(data:BeautyDashboardData):{initial:SportsSnapshot;source:SportsScheduleSource}{
 return {
  initial:{storeId:data.storeId,date:data.date,
   subjects:data.services.map(s=>({id:s.id,templateId:s.id,name:s.name,category:s.category,active:s.active,updatedAt:String(s.revision)})),
   coaches:data.techs.filter(t=>t.active).map(t=>({id:t.id,name:t.name,templates:t.serviceIds})),
   rooms:data.locations.filter(r=>r.isActive).map(r=>({id:r.id,name:r.name,capacity:r.capacity,rental:!!r.rentalEnabled})),
   customers:data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone})),fees:[],lessons:[],
   students:data.cards.filter(c=>!c.closedAt&&c.remaining>c.held).flatMap(c=>c.memberIds.flatMap(customerId=>c.serviceIds.map(serviceId=>({id:customerId,name:data.customers.find(p=>p.id===customerId)?.name??'',subject:serviceId,fee:c.planId,cardId:c.id,available:c.remaining-c.held,sportsMode:'ASSIGNED'})))),
  },
  source:{catalogHref:'?tab=服務項目',
   createCustomer:input=>createRentalCustomer(input,'beauty'),
   command:async input=>{
    const value=input as {payload?:{subject?:unknown}}|null;
    const revision=data.services.find(s=>s.id===value?.payload?.subject)?.revision??0;
    return scheduleNativeBeautyService({...((typeof input==='object'&&input!==null)?input:{}),expectedServiceRevision:revision});
   },
  },
 };
}

/** Only bridges data and the request lifetime; renders the unchanged native form. */
export function BeautyNativeScheduleFields({data,date,seed,onGuard,onCreated}:{data:BeautyDashboardData;date:string;seed:{time?:string;coachId?:string;roomId?:string};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void}){
 const [requestKey]=useState(()=>crypto.randomUUID());
 return <SportsScheduleFields {...beautyNativeScheduleSource(data)} date={date} seed={seed} requestKey={requestKey} onGuard={onGuard} onCreated={onCreated}/>;
}


export function BeautyNativeScheduleDialog({data,date,seed,onGuard,onCreated,onClose,busy}:{data:BeautyDashboardData;date:string;seed:{time?:string;coachId?:string;roomId?:string};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void;onClose:()=>void;busy:boolean}){
 return <SportsScheduleDialog title="新增預約" busy={busy} onClose={onClose}><BeautyNativeScheduleFields data={data} date={date} seed={seed} onGuard={onGuard} onCreated={onCreated}/></SportsScheduleDialog>;
}
