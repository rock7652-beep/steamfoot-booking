"use client";
import {useEffect,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {readBeautyCardHistory,readBeautyOwnIncome,readBeautyWorkRecords} from '@/server/actions/beauty-portal';
import {formatTWDateTime} from '@/lib/date-utils';
import {PersonalIncomePanel} from '@/components/personal-income-panel';
import {BeautyWorkCard} from './work-card';
import type {BeautyPortalData} from '@/server/beauty/queries';
function useDetail<Args extends unknown[],T>(name:string,fetcher:(...args:Args)=>Promise<T>,scope:string,args:Args){
 const reader=usePanelReader(name,fetcher,scope,0),argsKey=JSON.stringify(args),key=JSON.stringify([scope,args]);
 const [result,setResult]=useState<{key:string;value?:T;error?:string}>({key}),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;reader.read(...JSON.parse(argsKey) as Args).then(value=>{if(active)setResult({key,value});}).catch(()=>{if(active)setResult({key,error:'連線失敗，請重試。'});});return()=>{active=false;};},[reader,key,argsKey,retry]);
 return {value:result.key===key?result.value:undefined,error:result.key===key?result.error:undefined,retry:()=>{reader.clear();setResult({key});setRetry(n=>n+1);}};
}
function ReadState({error,retry}:{error?:string;retry:()=>void}){return error?<p role="alert">{error} <button onClick={retry}>重試</button></p>:<p role="status">讀取中…</p>;}
export function BeautyCardHistory({cardId,scope}:{cardId:string;scope:string}){
 const r=useDetail('beauty-card-history',readBeautyCardHistory,scope,[cardId]);
 if(!r.value?.success)return <ReadState error={r.error??(r.value&&!r.value.success?r.value.error:undefined)} retry={r.retry}/>;
 return r.value.data.length?<ul>{r.value.data.map(l=><li key={l.id}>{formatTWDateTime(new Date(l.createdAt))} · {l.kind==='GRANT'?'方案啟用':l.kind==='RESERVE'?'預約保留':'服務扣次／更正'} · {l.delta>0?'+':''}{l.delta} 次</li>)}</ul>:<p>尚無使用紀錄。</p>;
}
export function BeautyOwnIncome({scope,allowed,month,onMonth}:{scope:string;allowed:boolean;month:string;onMonth:(month:string)=>void}){
 return <><label>月份<input aria-label="收入月份" type="month" value={month} onChange={e=>{if(e.target.value)onMonth(e.target.value);}}/></label>{allowed?<IncomeDetails key={month} month={month} scope={scope}/>:<p>本人收入尚未開放，請洽店長。</p>}</>;
}
function IncomeDetails({month,scope}:{month:string;scope:string}){
 const r=useDetail('beauty-own-income',readBeautyOwnIncome,scope,[month]);
 if(!r.value?.success)return <ReadState error={r.error??(r.value&&!r.value.success?r.value.error:undefined)} retry={r.retry}/>;
 return !r.value.data.confirmed?<p role="status">本月收入待店長確認。</p>:<PersonalIncomePanel feeLabel="服務費" lines={r.value.data.lines.map(l=>({kind:'FEE',label:l.serviceName,date:l.date,endsAt:null,amount:l.fee,paid:l.paid,payments:l.payments}))}/>;
}
type Item=BeautyPortalData['items'][number];
export function BeautyWorkRecords({scope,month,pending,search,onMonth,onPending,onSearch,data,now,disabled,onChange,onMove}:{scope:string;month:string;pending:boolean;search:string;onMonth:(v:string)=>void;onPending:(v:boolean)=>void;onSearch:(v:string)=>void;data:BeautyPortalData;now:number;disabled:boolean;onChange:(item:Item,target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED')=>void;onMove:(item:Item)=>void}){
 const [page,setPage]=useState({filter:'',index:0}),filter=JSON.stringify([month,pending,search]),index=page.filter===filter?page.index:0;
 const [debounced,setDebounced]=useState(search);
 useEffect(()=>{const timer=setTimeout(()=>setDebounced(search),250);return()=>clearTimeout(timer);},[search]);
 const r=useDetail('beauty-work-records',readBeautyWorkRecords,scope,[{month,pending,search:debounced,page:index}]);
 const ready=r.value?.success&&debounced===search?r.value.data:undefined;
 return <><div className="cp-actions"><button className={!pending?'primary':''} onClick={()=>onPending(false)}>歷史紀錄</button><button className={pending?'primary':''} onClick={()=>onPending(true)}>待處理</button></div><div className="beauty-record-filters"><label>月份<input aria-label="紀錄月份" type="month" value={month} onChange={e=>{if(e.target.value)onMonth(e.target.value);}}/></label><label>顧客<input aria-label="搜尋顧客" type="search" value={search} onChange={e=>onSearch(e.target.value)} placeholder="搜尋姓名" maxLength={100}/></label></div>
  {!ready?<ReadState error={r.error??(r.value&&!r.value.success?r.value.error:undefined)} retry={r.retry}/>:<><section className="space-y-3">{!ready.items.length&&<p className="cp-empty">沒有符合條件的紀錄。</p>}{ready.items.map(item=><BeautyWorkCard key={item.id} item={item} now={now} showDate location={data.locations?.find(l=>l.id===item.locationId)?.name} grants={data.grants} disabled={disabled} onChange={target=>onChange(item,target)} onMove={()=>onMove(item)}/>)}</section><div className="cp-actions"><button disabled={!index} onClick={()=>setPage({filter,index:index-1})}>上一頁</button><span>第 {index+1} 頁</span><button disabled={!ready.hasMore} onClick={()=>setPage({filter,index:index+1})}>下一頁</button></div></>}
 </>;
}
