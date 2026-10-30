"use client";
import {useBeautyCustomerRevision} from "./use-customer-sync";
import type {BeautyAttendanceChoice} from '@/lib/beauty/contracts';
import {useMemo,useCallback,type ReactNode} from 'react';
import {CourseRoster} from '@/app/(dashboard)/dashboard/courses/roster';
import type {CourseRosterSource,CourseRosterData} from '@/app/(dashboard)/dashboard/courses/roster-source';
import {saveBeautyNativeRosterNote} from '@/server/actions/beauty-native-roster';
import {readBeautyRoster,syncBeautyRoster} from '@/lib/beauty/roster-reader';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {beautyRosterPaymentSummary} from '@/lib/beauty/roster-payment-summary';
import {formatTWDateTime} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export function BeautyNativeRoster({data,bookingId,readOnly,busy=false,onBusyChange,onAttendance,onStatus,onMoney,onCustomer,pendingId,snapshot,expanded,onCut,suspended=false,collectionRecoveryEnabled=false}:{data:BeautyDashboardData;bookingId?:string|null;readOnly:boolean;busy?:boolean;onBusyChange:(value:boolean)=>void;onAttendance:(id:string,revision:number,choice:BeautyAttendanceChoice)=>void;onStatus:(id:string,revision:number,target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED')=>void;onMoney:(kind:'collect'|'card'|'move'|'link',ids:string[])=>void;onCustomer:(id:string)=>void;suspended?:boolean;collectionRecoveryEnabled?:boolean;onCut?:(id:string)=>void;pendingId?:string|null;snapshot?:{sessionId:string;data:CourseRosterData};expanded?:{ids:string[];content:ReactNode}}){
 const customerRevision=useBeautyCustomerRevision(busy||!!expanded||suspended);
 const readerScope=JSON.stringify([data.storeId,customerRevision]);
 const fullReader=usePanelReader('beauty-roster-full',readBeautyRoster,readerScope,0);
 const versionReader=usePanelReader('beauty-roster-version',syncBeautyRoster,readerScope,0);
 const read=useCallback((id:string)=>fullReader.read(id,data.storeId),[fullReader,data.storeId]);
 const sync=useCallback((id:string,version?:string)=>versionReader.read(id,data.storeId,version),[versionReader,data.storeId]);
 const source=useMemo<CourseRosterSource>(()=>({confirmDiscard:false,statusMenu:true,snapshot,readBlocked:busy||!!expanded||suspended,sync,onOpen:row=>{if(row.customerId&&data.access.customerAccess)onCustomer(row.customerId);else if(!readOnly&&!busy&&data.manage.update&&data.access.customerAccess)onMoney('link',[row.id]);},statusActions:row=>{const b=row.service;if(!b||readOnly||busy||!data.manage.update||row.status==='CANCELLED')return [];return [{label:'恢復待服務',onSelect:()=>onAttendance(row.id,b.revision,'PENDING')},...(row.bookingKind==='CARD'&&row.cardId?[{label:'未出席扣次',onSelect:()=>onAttendance(row.id,b.revision,'NO_SHOW_DEDUCT')}]:[]),{label:'未出席不扣次',onSelect:()=>onAttendance(row.id,b.revision,'NO_SHOW_KEEP')}];},hideDetailAction:true,read,note:saveBeautyNativeRosterNote,labels:{list:'預約名單',pending:'待服務',attended:'已完成',unit:'次'},...(!readOnly&&!busy&&data.manage.collect?{batchAction:{label:'合併收款',selectable:row=>row.bookingKind!=='CARD'&&row.status!=='CANCELLED'&&!!row.service?.payment&&row.service.payment.due>0,onSubmit:rows=>onMoney('collect',rows.map(row=>row.id))}}:{}),actions:row=>{
  const b=row.service;if(!b)return [];
  const actions:{label:string;onSelect:()=>void;danger?:boolean}[]=[];
  if(row.customerId&&data.access.customerAccess)actions.push({label:'顧客資料',onSelect:()=>onCustomer(row.customerId!)});
  if(readOnly||busy)return actions;
  if(data.manage.card&&row.customerId)actions.push({label:'購買方案',onSelect:()=>onMoney('card',[row.customerId!])});
  if(data.manage.update){if(row.status!=='CANCELLED'){
   if(row.status==='RESERVED')actions.push({label:'換技師／位置',onSelect:()=>onMoney('move',[row.id])});
  }
   if(row.status!=='CANCELLED')actions.push({label:'取消預約',danger:true,onSelect:()=>onStatus(row.id,b.revision,'CANCELLED')});
   else actions.push({label:'恢復預約',onSelect:()=>onStatus(row.id,b.revision,'RESERVED')});
   if(!row.customerId&&data.access.customerAccess)actions.push({label:'補顧客資料',onSelect:()=>onMoney('link',[row.id])});
  }
  return actions;
 },row:row=>{
  const b=row.service;if(!b)return {};
  return {context:!readOnly&&!busy&&row.status==='RESERVED'&&onCut?<button type="button" className="min-h-11 min-w-11 rounded text-primary-800 hover:bg-primary-50" aria-label={`${row.customerName} 剪下改期`} onClick={()=>onCut(row.id)}>✂</button>:undefined,pending:pendingId===row.id,expanded:expanded?.ids[0]===row.id?expanded.content:undefined,owner:`${b.technicianName}／${b.locationName}`,status:row.status==='ATTENDED'?'已完成':row.status==='CANCELLED'?'已取消':row.status==='NO_SHOW'?(b.debit&&row.bookingKind==='CARD'?'未出席扣次':'未出席不扣次'):'已預約',mark:row.status==='ATTENDED'?'attended':row.status==='CANCELLED'?'cancelled':row.status==='NO_SHOW'?(b.debit&&row.bookingKind==='CARD'?'deducted':'leave'):'pending',statusTitle:'變更出席狀態',statusDisabled:readOnly||!data.manage.update||row.status==='CANCELLED',onStatus:()=>{if(row.status==='RESERVED'&&row.bookingKind!=='CARD'&&row.bookingKind!=='TRIAL'&&(!row.sportsBalance||row.sportsBalance.available<1)&&(!b.payment||b.payment.due>0)){if(data.manage.card&&row.customerId)onMoney('card',[row.customerId]);else if(data.manage.collect)onMoney('collect',[row.id]);return;}onAttendance(row.id,b.revision,'ATTENDED');},feedback:<p className="text-xs text-earth-600">{b.serviceName} · {formatTWDateTime(new Date(b.startsAt))}–{formatTWDateTime(new Date(b.endsAt)).split(' ').at(-1)}</p>,badge:null,cost:row.bookingKind==='CARD'?(row.cardId?(row.status==='RESERVED'||b.debit?'1次':'0次'):'—'):<span className="inline-flex flex-col items-center gap-1"><span className="whitespace-nowrap">{beautyRosterPaymentSummary(b)}</span>{!readOnly&&data.manage.collect&&(row.status!=='CANCELLED'||collectionRecoveryEnabled)&&(!b.payment||b.payment.due>0||collectionRecoveryEnabled)&&<button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50" disabled={busy} onClick={()=>onMoney('collect',[row.id])}>{row.status!=='CANCELLED'&&b.payment&&b.payment.due>0?'收款':'核對收款'}</button>}</span>,balance:row.sportsBalance?`${row.sportsBalance.remaining} 次`:b.available??'—',balanceWarning:b.available===0};
 }}),[data,read,sync,suspended,collectionRecoveryEnabled,readOnly,busy,onStatus,onAttendance,onMoney,onCustomer,pendingId,snapshot,expanded,onCut]);
 return <CourseRoster source={source} sportsNative sessionId={bookingId?`booking:${bookingId}`:`day:${data.date}`} capacity={0} canCreate={false} canEdit={!readOnly&&!busy&&data.manage.update} allowTrialActions={false} onBusyChange={onBusyChange}/>;
}
