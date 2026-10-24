"use client";
import {useEffect,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {StoreMemberConnectionPanel} from '@/components/admin/store-member-connection-panel';
import {CustomerPanelAdvanced} from '../customers/_components/customer-panel-advanced';
import type {CourseCustomerSource} from './member-source';
type Reader=NonNullable<CourseCustomerSource['support']>;
export function DeferredCustomerSupport({customerId,load}:{customerId:string;load:Reader}){
 const [open,setOpen]=useState(false),[retry,setRetry]=useState(0),[result,setResult]=useState<{id:string;value:Awaited<ReturnType<Reader>>}|null>(null);
 const reader=usePanelReader('module-customer-support',load,'',0);
 useEffect(()=>{if(!open)return;let active=true;reader.read(customerId).then(value=>{if(active)setResult({id:customerId,value});}).catch(()=>{if(active)setResult({id:customerId,value:{success:false,error:'會員資料讀取失敗，請重試'}});});return()=>{active=false;};},[open,customerId,reader,retry]);
 const current=result?.id===customerId?result.value:null;
 return <details className="border-t border-earth-100 py-2" open={open} onToggle={e=>{setResult(null);setOpen(e.currentTarget.open);}}><summary className="min-h-11 cursor-pointer py-2 text-sm">會員與 LINE 資料</summary>{open&&(!current?<p role="status">讀取會員資料中…</p>:!current.success?<p role="alert">{current.error}<button type="button" className="min-h-11 px-3" onClick={()=>{reader.invalidate(customerId);setResult(null);setRetry(v=>v+1);}}>重試</button></p>:<>
  <StoreMemberConnectionPanel compact customerId={customerId} initial={{customerId,value:current.data.membership}}/>
  <CustomerPanelAdvanced managerSimple active customerId={customerId} readOnly canEdit={false} onMutated={()=>{reader.invalidate(customerId);setResult(null);setRetry(v=>v+1);}} initial={{customerId,value:current.data.advanced.data}}/>
 </>)}</details>;
}
