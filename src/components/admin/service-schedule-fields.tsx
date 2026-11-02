"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {ServiceReservationForm,type ServiceReservationSource} from './service-reservation-form';
import {RentalPanel,type RentalRoom,type RentalCustomer,type RentalPermissions} from '@/app/(dashboard)/dashboard/courses/rental-panel';
import type {RentalModule} from '@/server/services/rental-module';

export type ServiceRentalSource={module:RentalModule;rooms:RentalRoom[];customers:RentalCustomer[];permissions:RentalPermissions};
type Guard={dirty:boolean;pending:boolean};
/** Share the existing service and rental forms, preserving each draft when switching. */
export function ServiceScheduleFields({source,rental,date,seed={},onGuard,onCreated}:{source:ServiceReservationSource;rental:ServiceRentalSource;date:string;seed?:{time?:string;roomId?:string;coachId?:string;customerId?:string;durationMinutes?:number};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string,sessions?:import("@/app/(dashboard)/dashboard/courses/workspace").Session[])=>void}){
 const [mode,setMode]=useState<'service'|'trial'|'rental'>('service');
 const [rentalOpened,setRentalOpened]=useState(false);
 const [serviceGuard,setServiceGuard]=useState<Guard>({dirty:false,pending:false});
 const [rentalGuard,setRentalGuard]=useState<Guard>({dirty:false,pending:false});
 const savedDate=useRef(date);
 const serviceChange=useCallback((dirty:boolean,pending:boolean)=>setServiceGuard(old=>old.dirty===dirty&&old.pending===pending?old:{dirty,pending}),[]);
 // RentalPanel's guard arguments use pending first.
 const rentalChange=useCallback((pending:boolean,dirty:boolean)=>setRentalGuard(old=>old.dirty===dirty&&old.pending===pending?old:{dirty,pending}),[]);
 const positionChange=useCallback((position:{date:string})=>{savedDate.current=position.date;},[]);
 const pending=serviceGuard.pending||rentalGuard.pending;
 const dirty=serviceGuard.dirty||rentalGuard.dirty;
 useEffect(()=>{onGuard(dirty,pending);},[dirty,pending,onGuard]);
 useEffect(()=>()=>onGuard(false,false),[onGuard]);
 const availableRooms=rental.rooms.filter(room=>room.isActive&&room.rentalEnabled);
 const canRent=rental.permissions.create===true&&availableRooms.length>0;
 const rentalRoom=availableRooms.find(room=>room.id===seed.roomId)??availableRooms[0];
 return <div className="flex min-h-0 min-w-0 flex-col gap-3">
  <label className="block text-sm">安排類型<select aria-label="安排類型" className="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base" disabled={pending} value={mode} onChange={event=>{
   if(pending)return;
   if(event.target.value==='rental'&&canRent){setRentalOpened(true);setMode('rental');}else setMode(event.target.value==='trial'?'trial':'service');
  }}><option value="service">{source.itemEntitlements?'一般服務':'一般服務／體驗'}</option>{source.itemEntitlements&&<option value="trial" disabled={!source.services.some(s=>s.trialPrice!=null)}>體驗</option>}<option value="rental" disabled={!canRent}>空間出租</option></select></label>
  {!canRent&&<p role="status" className="text-sm text-earth-600">{rental.permissions.create!==true?'目前沒有新增空間出租的權限。':'尚無開放出租的位置，請到位置管理設定。'}</p>}
  <div className={mode!=='rental'?'min-w-0':'hidden'}><ServiceReservationForm bookingType={source.itemEntitlements?(mode==='trial'?'trial':'regular'):undefined} source={source} date={date} seed={seed} onGuard={serviceChange} onCreated={onCreated}/></div>
  {rentalOpened&&<div className={`${mode==='rental'?'flex':'hidden'} min-h-0 min-w-0 flex-col`}>
   <RentalPanel module={rental.module} rooms={rental.rooms} customers={rental.customers} permissions={rental.permissions} seed={{date,time:seed.time,roomId:rentalRoom?.id,durationMinutes:seed.durationMinutes}} onGuard={rentalChange} onPositionChange={positionChange} onSaved={()=>onCreated(savedDate.current)}/>
  </div>}
 </div>;
}
