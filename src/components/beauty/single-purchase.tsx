"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {CourseCustomerPicker} from '@/components/admin/course-customer-picker';
import {ServiceReservationForm} from '@/components/admin/service-reservation-form';
import {readBeautySingleServices} from '@/lib/beauty/customer-reader';
import {formatTWDateTime,toLocalDateStr} from '@/lib/date-utils';
import {beautyNativeScheduleSource} from './native-schedule-source';
import {BeautyCollectionPanel} from './collection-panel';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CourseCustomerSource} from '@/app/(dashboard)/dashboard/courses/member-source';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 disabled:opacity-50';
type Props=Parameters<NonNullable<CourseCustomerSource['purchaseService']>>[0]&{data:BeautyDashboardData;collectionRecoveryEnabled?:boolean};
export function BeautySinglePurchase({data,customerId,onGuard,onSaved,onClose,collectionRecoveryEnabled=false}:Props){
 const [selected,setSelected]=useState(customerId??''),[busy,setBusy]=useState(false);
 const guard=useCallback((dirty:boolean,pending:boolean)=>{setBusy(pending);onGuard(dirty,pending);},[onGuard]);
 const activeCustomer=customerId??selected;
 return <div className="min-w-0 space-y-3">
  {!customerId&&<label className="block">顧客<CourseCustomerPicker choices={data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone,lineName:c.lineName??null}))} name="singleCustomerId" enabled={!busy} onChange={rows=>setSelected(rows[0]?.id??'')}/></label>}
  {activeCustomer?<SingleDraft key={data.storeId+':'+activeCustomer} data={data} customerId={activeCustomer} collectionRecoveryEnabled={collectionRecoveryEnabled} onSaved={onSaved} onClose={onClose} onGuard={guard}/>:<p>請先選擇顧客，再核對單次或體驗服務。</p>}
 </div>;
}
function SingleDraft({data,customerId,onGuard,onSaved,onClose,collectionRecoveryEnabled=false}:Props&{customerId:string}){
 const load=useCallback((offset:number)=>readBeautySingleServices(data.storeId,customerId,offset),[data.storeId,customerId]);
 const reader=usePanelReader('beauty-single-services',load,data.storeId+':'+customerId,0);
 type Result=Extract<Awaited<ReturnType<typeof load>>,{success:true}>;
 const [response,setResponse]=useState<{key:string;snapshot?:Result;error?:string}|null>(null),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0),[booking,setBooking]=useState(false),[collect,setCollect]=useState<string[]|null>(null),[pending,setPending]=useState(false),[missingReceipt,setMissingReceipt]=useState(false);
 const readKey=offset+':'+retry,current=response?.key===readKey?response:null,snapshot=current?.snapshot??null,error=current?.error??'',loading=!current;
 const guard=useCallback((dirty:boolean,busy:boolean)=>{setPending(busy);onGuard(dirty,busy);},[onGuard]);
 useEffect(()=>{
  let active=true;reader.clear();
  reader.read(offset).then(result=>{if(!active)return;if(!result.success){setResponse({key:readKey,error:result.error});return;}if(result.storeId!==data.storeId||result.customerId!==customerId){setResponse({key:readKey,error:'收款顧客或門市已變更，請重新開啟'});return;}setResponse({key:readKey,snapshot:result});}).catch(()=>{if(active)setResponse({key:readKey,error:'讀取本次服務失敗，請重試'});});
  return()=>{active=false;};
 },[reader,offset,readKey,data.storeId,customerId]);
 const source=useMemo(()=>{
  const original=beautyNativeScheduleSource(data).source.reservation!;
  const catalog=snapshot?.catalog;
  return {...original,maxPeople:1,cards:[],customers:original.customers.filter(c=>c.id===customerId),createCustomer:undefined,services:original.services.filter(s=>!catalog||catalog.some(row=>row.id===s.id&&row.configured!==false)).map(s=>({...s,name:catalog?.find(row=>row.id===s.id)?.name||s.name})),submit:async(intent:Parameters<typeof original.submit>[0])=>{
   const result=await original.submit(intent);
   if(result.success){const ids=result.data?.ids;setBooking(false);if(Array.isArray(ids)&&ids.length===1&&ids.every(id=>typeof id==='string'&&!!id))setCollect(ids);else setMissingReceipt(true);}
   return result;
  }};
 },[data,snapshot,customerId]);
 const refresh=()=>{setBooking(false);setCollect(null);setMissingReceipt(false);setRetry(n=>n+1);};
 const collection=collect?<BeautyCollectionPanel modal ids={collect} storeId={data.storeId} collectionRecoveryEnabled={collectionRecoveryEnabled} canDiscount={!!data.manage.discount} onGuard={guard} onSaved={onSaved} onClose={refresh}/>:null;
 if(missingReceipt)return <div role="status"><p>預約已成立，收款資料尚待核對。請從預約清單開啟該筆收款，勿重新建立預約。</p><button className={button} onClick={refresh}>核對既有服務</button></div>;
 if(booking)return <div className="space-y-3"><button type="button" className={button} disabled={pending} onClick={()=>setBooking(false)}>返回既有服務</button><ServiceReservationForm source={source} date={toLocalDateStr()} seed={{customerId}} onGuard={guard} onCreated={()=>{}}/></div>;
 return <>{collection}<section className="min-w-0 space-y-3" aria-label="單次與體驗服務">
  <p className="text-sm text-earth-600">已有預約直接收款；新服務先安排時間，再核對收款。</p>
  {loading&&<p role="status">核對這位顧客的既有服務…</p>}
  {error&&<div role="alert"><p>{error}</p><button type="button" className={button} onClick={()=>setRetry(n=>n+1)}>重新讀取</button></div>}
  {snapshot&&<>{snapshot.rows.length?<ul className="divide-y divide-earth-100">{snapshot.rows.map(row=><li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0 break-words"><p>{row.name} · {row.isTrial?'體驗':'單次'}</p><p className="text-sm text-earth-600">{formatTWDateTime(new Date(row.startsAt))} · 未收 NT$ {row.due.toLocaleString()}</p></div><button type="button" className={button} onClick={()=>setCollect([row.id])}>收款</button></li>)}</ul>:<p>這一頁沒有待收款的單次／體驗服務。</p>}
   {(offset>0||snapshot.hasMore)&&<div className="flex gap-2"><button type="button" className={button} disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-20))}>上一頁</button><button type="button" className={button} disabled={!snapshot.hasMore} onClick={()=>setOffset(v=>v+20)}>下一頁</button></div>}
   <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} onClick={onClose}>返回多次方案</button>{data.access.writeAccess&&<button type="button" className={button+' bg-primary-700 text-white'} disabled={!source.services.length} onClick={()=>{setBooking(true);}}>新增單次／體驗服務</button>}</div>
   {data.access.writeAccess&&!source.services.length&&<p>尚無已設定收費的服務，請先至收費方式設定。</p>}
  </>}
 </section></>;
}
