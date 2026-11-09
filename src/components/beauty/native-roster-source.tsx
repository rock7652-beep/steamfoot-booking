"use client";
import {usePanelReadCache} from '@/components/operations/panel-read-cache';
import {readBeautyCustomerDetail,beautyCustomerDetailScope} from '@/lib/beauty/customer-detail-read';
import {useIdleReadPreload} from '@/components/admin/use-calendar-month-preload';
import {useBeautyPersonnelText} from "@/components/course-personnel-label";
import {BeautyTechnicianRoster,type TechnicianReceipt} from './technician-roster';
import dynamic from "next/dynamic";
const BeautySharedGoodsPanel=dynamic(()=>import("./shared-goods-panel").then(m=>m.BeautySharedGoodsPanel));
const BeautyAddOnEditPanel=dynamic(()=>import("./add-on-edit-panel").then(m=>m.BeautyAddOnEditPanel));
import {addOnSnapshots} from "@/lib/beauty/add-ons";
import {useBeautyCustomerRevision} from "./use-customer-sync";
import type {BeautyAttendanceChoice} from '@/lib/beauty/contracts';
import {useMemo,useCallback,useState,useEffect,type ReactNode} from 'react';
import {CourseRoster} from '@/app/(dashboard)/dashboard/courses/roster';
import type {CourseRosterSource,CourseRosterData} from '@/app/(dashboard)/dashboard/courses/roster-source';
import {saveBeautyNativeRosterNote} from '@/server/actions/beauty-native-roster';
import {readBeautyRoster,syncBeautyRoster} from '@/lib/beauty/roster-reader';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {beautyRosterPaymentSummary,beautyRosterCanUsePlan} from '@/lib/beauty/roster-payment-summary';
import {formatTWDateTime,toLocalDateStr} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export function BeautyNativeRoster({allowPreparedSnapshot=true,onSnapshotInvalidated,onCommitted,data,bookingId,readOnly,busy=false,onBusyChange,onAttendance,onStatus,onMoney,onCustomer,pendingId,snapshot,expanded,onCut,onCopy,suspended=false,collectionRecoveryEnabled=false}:{allowPreparedSnapshot?:boolean;onSnapshotInvalidated?:()=>void;onCommitted?:()=>void;data:BeautyDashboardData;bookingId?:string|null;readOnly:boolean;busy?:boolean;onBusyChange:(value:boolean)=>void;onAttendance:(id:string,revision:number,choice:BeautyAttendanceChoice)=>void;onStatus:(id:string,revision:number,target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED')=>void;onMoney:(kind:'collect'|'card'|'move'|'link',ids:string[],initialCharges?:import('@/server/beauty/service-charges').ServiceCharge[])=>void;onCustomer:(id:string)=>void;suspended?:boolean;collectionRecoveryEnabled?:boolean;onCopy?:(id:string)=>void;onCut?:(id:string)=>void;pendingId?:string|null;snapshot?:{sessionId:string;data:CourseRosterData};expanded?:{ids:string[];content:ReactNode}}){
 const beautyText=useBeautyPersonnelText();

 const selectedGroupId=data.items.find(row=>row.id===bookingId)?.groupId;
 const compactSingle=!!bookingId&&data.items.filter(row=>selectedGroupId?row.groupId===selectedGroupId:row.id===bookingId).length===1;
 const [editAddOns,setEditAddOns]=useState<string|null>(null);
 const [technicianReceipts,setTechnicianReceipts]=useState<Record<string,TechnicianReceipt>>({});
 const [technicianBusy,setTechnicianBusy]=useState(false);
 const [rosterBusy,setRosterBusy]=useState(false);
 useEffect(()=>{onBusyChange(technicianBusy||rosterBusy);},[technicianBusy,rosterBusy,onBusyChange]);
 const [goods,setGoods]=useState<string|null>(null);
 const customerRevision=useBeautyCustomerRevision(busy||!!expanded||suspended);
 const readerScope=JSON.stringify([data.storeId,customerRevision]);
 const customerDetailReader=usePanelReadCache('beauty-customer-detail',readBeautyCustomerDetail,beautyCustomerDetailScope(data),15_000);
 const customerPreload=useMemo(()=>({read:customerDetailReader.load,get:customerDetailReader.get}),[customerDetailReader]);
 useIdleReadPreload({enabled:data.access.customerAccess,blocked:busy||technicianBusy||rosterBusy||!!expanded||!!suspended,keys:[...new Set(data.items.filter(row=>bookingId?row.groupId===selectedGroupId:toLocalDateStr(new Date(row.startsAt))===data.date).flatMap(row=>row.customerId?[row.customerId]:[]))].slice(0,5),reader:customerPreload});
 const fullReader=usePanelReader('beauty-roster-full',readBeautyRoster,readerScope,0);
 const versionReader=usePanelReader('beauty-roster-version',syncBeautyRoster,readerScope,0);
 const read=useCallback((id:string)=>fullReader.read(id,data.storeId),[fullReader,data.storeId]);
 const sync=useCallback((id:string,version?:string)=>versionReader.read(id,data.storeId,version),[versionReader,data.storeId]);
 const source=useMemo<CourseRosterSource>(()=>({compactSingle,header:rows=><>{rows.some(r=>r.customerId&&rows.filter(v=>v.customerId===r.customerId).length>1)&&<section aria-label="合併服務行程" className="mb-3 space-y-2 rounded-lg bg-primary-50 p-3"><h3 className="font-medium">同筆預約 · 依序服務</h3>{[...rows].sort((a,b)=>(a.service?.startsAt??'').localeCompare(b.service?.startsAt??'')).map(row=><p key={row.id}>{row.customerName} · {row.service?.serviceName} · {row.service&&formatTWDateTime(new Date(row.service.startsAt))}–{row.service&&formatTWDateTime(new Date(row.service.endsAt)).slice(11)} · {row.service?.technicianName}</p>)}</section>}<BeautyTechnicianRoster compact={compactSingle} rows={rows} storeId={data.storeId} canEdit={!readOnly&&data.manage.update&&!!data.manage.technician} busy={busy} onBusy={setTechnicianBusy} receipts={technicianReceipts} onMove={id=>onMoney('move',[id])} onSaved={value=>{setTechnicianReceipts(old=>({...old,[value.id]:value}));onSnapshotInvalidated?.();onCommitted?.();}}/></>,confirmDiscard:false,statusMenu:true,snapshot,readBlocked:busy||technicianBusy||!!goods||!!expanded||suspended,sync,onOpen:row=>{if(busy||technicianBusy)return;if(row.customerId&&data.access.customerAccess)onCustomer(row.customerId);else if(!readOnly&&!busy&&data.manage.update&&data.access.customerAccess)onMoney('link',[row.id]);},statusActions:row=>{const b=row.service;if(!b||readOnly||busy||technicianBusy||!data.manage.update||row.status==='CANCELLED')return [];return [{label:'恢復待服務',onSelect:()=>onAttendance(row.id,b.revision,'PENDING')},...(row.bookingKind==='CARD'&&row.cardId?[{label:'未出席扣次',onSelect:()=>onAttendance(row.id,b.revision,'NO_SHOW_DEDUCT')}]:[]),{label:'未出席不扣次',onSelect:()=>onAttendance(row.id,b.revision,'NO_SHOW_KEEP')}];},hideDetailAction:true,read,note:saveBeautyNativeRosterNote,labels:{owner:'位置',list:'預約名單',pending:'待服務',attended:'已完成',unit:'次'},...(!readOnly&&!busy&&!technicianBusy&&data.manage.collect?{batchAction:{label:'合併收款',selectable:row=>!beautyRosterCanUsePlan(row)&&row.status!=='CANCELLED'&&!!row.service?.payment&&row.service.payment.due>0,onSubmit:rows=>onMoney('collect',rows.map(row=>row.id),rows.flatMap(row=>row.service?.collectionQuote?[row.service.collectionQuote]:[]))}}:{}),actions:row=>{
  const b=row.service;if(!b)return [];
  const actions:{label:string;onSelect:()=>void;danger?:boolean}[]=[];
  if(row.customerId&&data.access.customerAccess)actions.push({label:'顧客資料',onSelect:()=>onCustomer(row.customerId!)});
  if(!busy&&!technicianBusy&&!goods&&data.access.financeAccess&&(data.sharedGoodsEnabled||data.sharedGoodsHistoryGroups?.includes(data.items.find(i=>i.id===row.id)?.groupId??'')))actions.push({label:'共同商品',onSelect:()=>setGoods(row.id)});
  if(readOnly||busy||technicianBusy||goods)return actions;
  if(data.manage.collect&&beautyRosterCanUsePlan(row))actions.push({label:'單次收款',onSelect:()=>onMoney('collect',[row.id],b.collectionQuote?[b.collectionQuote]:undefined)});
  if(data.manage.card&&row.customerId)actions.push({label:'購買方案',onSelect:()=>onMoney('card',[row.customerId!])});
  if(!compactSingle&&onCopy&&data.access.writeAccess&&row.customerId)actions.push({label:"複製預約",onSelect:()=>onCopy(row.id)});
  if(data.manage.update){if(row.status!=='CANCELLED'){
   if(row.status==='RESERVED'&&data.addOnsEnabled)actions.push({label:'修改加做服務',onSelect:()=>setEditAddOns(row.id)});
   if(row.status==='RESERVED')actions.push({label:beautyText('換技師／位置'),onSelect:()=>onMoney('move',[row.id])});
  }
   if(row.status!=='CANCELLED')actions.push({label:'取消預約',danger:true,onSelect:()=>onStatus(row.id,b.revision,'CANCELLED')});
   else actions.push({label:'恢復預約',onSelect:()=>onStatus(row.id,b.revision,'RESERVED')});
   if(!row.customerId&&data.access.customerAccess)actions.push({label:'補顧客資料',onSelect:()=>onMoney('link',[row.id])});
  }
  return actions;
 },row:row=>{
  const original=row.service;if(!original)return {};
  const receipt=technicianReceipts[row.id];const b=receipt&&receipt.revision>original.revision?{...original,revision:receipt.revision,technicianState:receipt}:original;
  const unavailable=b.technicianState&&b.technicianState.status!=='SCHEDULED';
  const usePlan=beautyRosterCanUsePlan(row);
  return {context:!compactSingle&&!readOnly&&!busy&&!technicianBusy&&row.status==='RESERVED'&&onCut?<button type="button" className="min-h-11 min-w-11 rounded text-primary-800 hover:bg-primary-50" aria-label={`${row.customerName} 剪下改期`} onClick={()=>onCut(row.id)}>✂</button>:undefined,pending:pendingId===row.id,expanded:expanded?.ids[0]===row.id?expanded.content:undefined,owner:b.locationName,status:row.status==='ATTENDED'?'已完成':row.status==='CANCELLED'?'已取消':row.status==='NO_SHOW'?(b.debit&&row.bookingKind==='CARD'?'未出席扣次':'未出席不扣次'):'已預約',mark:row.status==='ATTENDED'?'attended':row.status==='CANCELLED'?'cancelled':row.status==='NO_SHOW'?(b.debit&&row.bookingKind==='CARD'?'deducted':'leave'):'pending',statusTitle:'變更出席狀態',statusDisabled:readOnly||technicianBusy||!!unavailable||!data.manage.update||row.status==='CANCELLED',onStatus:()=>{if(unavailable||technicianBusy)return;if(row.status==='RESERVED'&&row.bookingKind!=='CARD'&&row.bookingKind!=='TRIAL'&&(!row.sportsBalance||row.sportsBalance.available<1)&&(!b.payment||b.payment.due>0)){if(data.manage.card&&row.customerId)onMoney('card',[row.customerId]);else if(data.manage.collect)onMoney('collect',[row.id],b.collectionQuote?[b.collectionQuote]:undefined);return;}onAttendance(row.id,b.revision,'ATTENDED');},feedback:compactSingle?undefined:<div>{addOnSnapshots.parse(b.addOnItems??[]).map(o=><p key={o.id}>＋{o.name} · {o.price?`$${o.price}`:"免費"} · {o.duration?`${o.duration} 分鐘`:"不增加時間"}</p>)}<p className="text-xs text-earth-600">{b.serviceName} · {formatTWDateTime(new Date(b.startsAt))}–{formatTWDateTime(new Date(b.endsAt)).split(' ').at(-1)}</p></div>,badge:null,cost:usePlan?'完成時扣1次':row.bookingKind==='CARD'&&!(addOnSnapshots.parse(b.addOnItems??[]).length>0&&b.payment&&b.payment.netPrice>0)?(row.cardId?(row.status==='RESERVED'||b.debit?'1次':'0次'):'—'):<span className="inline-flex flex-col items-center gap-1"><span className="whitespace-nowrap">{beautyRosterPaymentSummary(b)}</span>{!readOnly&&data.manage.collect&&(row.status!=='CANCELLED'||collectionRecoveryEnabled)&&(!b.payment||b.payment.due>0||collectionRecoveryEnabled)&&<button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50" disabled={busy||technicianBusy} onClick={()=>onMoney('collect',[row.id],b.collectionQuote?[b.collectionQuote]:undefined)}>{row.status!=='CANCELLED'&&b.payment&&b.payment.due>0?'收款':'核對收款'}</button>}</span>,balance:row.sportsBalance?`${row.sportsBalance.available} 次`:b.available??'—',balanceWarning:(row.sportsBalance?.available??b.available)===0};
 }}),[data,goods,read,sync,technicianReceipts,technicianBusy,onSnapshotInvalidated,onCommitted,suspended,collectionRecoveryEnabled,readOnly,busy,onStatus,onAttendance,onMoney,onCustomer,pendingId,snapshot,expanded,onCut,onCopy,compactSingle,beautyText]);
 const selectedGroup=bookingId?data.items.find(b=>b.id===bookingId)?.groupId:undefined;
 const previewBookings=data.items.filter(b=>bookingId?(selectedGroup?b.groupId===selectedGroup:b.id===bookingId):toLocalDateStr(new Date(b.startsAt))===data.date).map(b=>({id:b.id,customerName:b.personName,status:b.status}));
 const preparedId=bookingId?`booking:${bookingId}`:`day:${data.date}`;
 const prepared=allowPreparedSnapshot&&data.rosterSnapshots?.storeId===data.storeId?data.rosterSnapshots.details[preparedId]:undefined;
 return <>{goods&&<BeautySharedGoodsPanel key={data.storeId+goods} storeId={data.storeId} appointmentId={goods} canEdit={!readOnly&&data.manage.update} canCollect={!readOnly&&data.manage.collect} canRefund={!readOnly&&data.manage.refund} onBusy={onBusyChange} onClose={()=>setGoods(null)}/>} {editAddOns&&<BeautyAddOnEditPanel key={data.storeId+editAddOns} id={editAddOns} storeId={data.storeId} onClose={()=>setEditAddOns(null)}/>}<CourseRoster key={preparedId} onSnapshotInvalidated={onSnapshotInvalidated} onCommitted={onCommitted} initialSnapshot={prepared?{sessionId:preparedId,data:prepared}:undefined} source={source} previewBookings={previewBookings} sportsNative sessionId={bookingId?`booking:${bookingId}`:`day:${data.date}`} capacity={0} canCreate={false} canEdit={!readOnly&&!busy&&!technicianBusy&&data.manage.update} allowTrialActions={false} onBusyChange={setRosterBusy}/></>;
}
