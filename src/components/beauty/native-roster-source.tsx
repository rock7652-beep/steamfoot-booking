"use client";
import type {BeautyAttendanceChoice} from '@/lib/beauty/contracts';
import {useMemo} from 'react';
import {CourseRoster} from '@/app/(dashboard)/dashboard/courses/roster';
import type {CourseRosterSource} from '@/app/(dashboard)/dashboard/courses/roster-source';
import {readBeautyNativeRoster,saveBeautyNativeRosterNote} from '@/server/actions/beauty-native-roster';
import {formatTWDateTime} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export function BeautyNativeRoster({data,bookingId,readOnly,busy=false,onBusyChange,onAttendance,onStatus,onMoney,onCustomer}:{data:BeautyDashboardData;bookingId?:string|null;readOnly:boolean;busy?:boolean;onBusyChange:(value:boolean)=>void;onAttendance:(id:string,revision:number,choice:BeautyAttendanceChoice)=>void;onStatus:(id:string,revision:number,target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED')=>void;onMoney:(kind:'collect'|'card'|'move'|'link',ids:string[])=>void;onCustomer:(id:string)=>void}){
 const source=useMemo<CourseRosterSource>(()=>({statusMenu:true,hideDetailAction:true,read:readBeautyNativeRoster,note:saveBeautyNativeRosterNote,labels:{list:'預約名單',pending:'待服務',attended:'已完成',unit:'次'},...(!readOnly&&!busy&&data.manage.collect?{batchAction:{label:'合併收款',selectable:row=>row.bookingKind!=='CARD'&&row.status!=='CANCELLED',onSubmit:rows=>onMoney('collect',rows.map(row=>row.id))}}:{}),actions:row=>{
  const b=row.service;if(!b)return [];
  const actions:{label:string;onSelect:()=>void;danger?:boolean}[]=[];
  if(row.customerId&&data.access.customerAccess)actions.push({label:'顧客資料',onSelect:()=>onCustomer(row.customerId!)});
  if(readOnly||busy)return actions;
  if(data.manage.update){if(row.status!=='CANCELLED'){
   actions.push({label:'出席',onSelect:()=>onAttendance(row.id,b.revision,'ATTENDED')});
   if(row.bookingKind==='CARD')actions.push({label:'未出席扣次',onSelect:()=>onAttendance(row.id,b.revision,'NO_SHOW_DEDUCT')});
   actions.push({label:'未出席不扣次',onSelect:()=>onAttendance(row.id,b.revision,'NO_SHOW_KEEP')});
   if(row.status!=='RESERVED')actions.push({label:'恢復待服務',onSelect:()=>onAttendance(row.id,b.revision,'PENDING')});
   if(row.status==='RESERVED')actions.push({label:'改期／換技師位置',onSelect:()=>onMoney('move',[row.id])});
  }
   if(row.status!=='CANCELLED')actions.push({label:'取消預約',danger:true,onSelect:()=>onStatus(row.id,b.revision,'CANCELLED')});
   else actions.push({label:'恢復預約',onSelect:()=>onStatus(row.id,b.revision,'RESERVED')});
   if(!row.customerId&&data.access.customerAccess)actions.push({label:'補顧客資料',onSelect:()=>onMoney('link',[row.id])});
  }
  if(data.manage.card&&row.customerId)actions.push({label:'購買方案',onSelect:()=>onMoney('card',[row.customerId!])});
  return actions;
 },row:row=>{
  const b=row.service;if(!b)return {};
  return {owner:`${b.technicianName}／${b.locationName}`,status:row.status==='ATTENDED'?'已完成':row.status==='CANCELLED'?'已取消':row.status==='NO_SHOW'?(b.debit&&row.bookingKind==='CARD'?'未出席扣次':'未出席不扣次'):'已預約',mark:row.status==='ATTENDED'?'attended':row.status==='CANCELLED'?'cancelled':row.status==='NO_SHOW'?(b.debit&&row.bookingKind==='CARD'?'deducted':'leave'):'pending',statusTitle:'變更出席狀態',statusDisabled:readOnly||!data.manage.update||row.status!=='RESERVED',onStatus:()=>onStatus(row.id,b.revision,'COMPLETED'),feedback:<p className="text-xs text-earth-600">{b.serviceName} · {formatTWDateTime(new Date(b.startsAt))}–{formatTWDateTime(new Date(b.endsAt)).split(' ').at(-1)}</p>,badge:null,cost:row.bookingKind==='CARD'?(row.cardId?(row.status==='RESERVED'||b.debit?'1次':'0次'):'—'):<span className="inline-flex flex-col items-center gap-1"><span className="whitespace-nowrap">NT$ {b.price.toLocaleString()}</span>{!readOnly&&data.manage.collect&&row.status!=='CANCELLED'&&<button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50" disabled={busy} onClick={()=>onMoney('collect',[row.id])}>收款</button>}</span>,balance:b.available??'—',balanceWarning:b.available===0};
 }}),[data,readOnly,busy,onStatus,onAttendance,onMoney,onCustomer]);
 return <CourseRoster source={source} sportsNative sessionId={bookingId?`booking:${bookingId}`:`day:${data.date}`} capacity={0} canCreate={false} canEdit={!readOnly&&!busy&&data.manage.update} allowTrialActions={false} onBusyChange={onBusyChange}/>;
}
