'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {readBeautyMemberPlanSnapshot} from '@/lib/beauty/member-plan-snapshot-read';
import type {BeautyMemberPlanSnapshot} from '@/server/beauty/member-plan-snapshot';

// Only recently observed pending applications use the short cadence. A result
// still needs a fresh authorized server read; polling is not a push channel.
const FAST_POLL_MS=2_000, FAST_WINDOW_MS=60_000, NORMAL_POLL_MS=10_000, MAX_BACKOFF_MS=60_000;

/** Poll only the foreground plans view. No transaction, navigation or form data
 * is touched; each read re-authorizes the current member and store. */
export function useBeautyMemberPlanSync({enabled,slug,storeId,customerId,scopeKey,revision,work}:{enabled:boolean;slug:string;storeId:string;customerId:string;scopeKey:string;revision:string;work:boolean}){
  const scope=JSON.stringify([storeId,customerId,scopeKey,revision,work]);
  const identity=JSON.stringify([storeId,customerId,scopeKey,work]);
  const reader=usePanelReader('beauty-member-plan-snapshot',readBeautyMemberPlanSnapshot,scope,0);
  const [state,setState]=useState<{scope:string;data:BeautyMemberPlanSnapshot|null;issue:'none'|'network'|'denied'}>({scope,data:null,issue:'none'});
  const retryRef=useRef<()=>void>(()=>{});
  const fast=useRef<{identity:string;seen:Set<string>;until:number}>({identity,seen:new Set(),until:0});
  const retry=useCallback(()=>retryRef.current(),[]);
  useEffect(()=>{
    if(!enabled||!storeId||!customerId||!scopeKey)return;
    if(fast.current.identity!==identity)fast.current={identity,seen:new Set(),until:0};
    let alive=true,running=false,pending=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=()=>{
      if(!alive||document.visibilityState!=='visible')return;
      const delay=failures?Math.min(MAX_BACKOFF_MS,NORMAL_POLL_MS*2**Math.min(failures-1,3)):
        pending&&Date.now()<fast.current.until?FAST_POLL_MS:NORMAL_POLL_MS;
      timer=setTimeout(()=>void run(),delay);
    };
    const run=async()=>{
      if(!alive||running||document.visibilityState!=='visible')return;
      if(timer)clearTimeout(timer);
      running=true;
      try{
        const result=await reader.read(slug,storeId,customerId,scopeKey);
        if(!alive||document.visibilityState!=='visible')return;
        if(!result.success){failures++;setState(previous=>{const denied=result.denied||(previous.scope===scope&&previous.issue==='denied');return {scope,data:denied?null:previous.scope===scope?previous.data:null,issue:denied?'denied':'network'};});return;}
        failures=0;
        const pendingIds=result.data.purchases.filter(p=>p.status==='PENDING').map(p=>p.id);
        pending=pendingIds.length>0;
        if(pendingIds.some(id=>!fast.current.seen.has(id))){
          for(const id of pendingIds)fast.current.seen.add(id);
          fast.current.until=Date.now()+FAST_WINDOW_MS;
        }
        setState(previous=>previous.scope===scope&&previous.issue==='none'&&JSON.stringify(previous.data)===JSON.stringify(result.data)?previous:{scope,data:result.data,issue:'none'});
      }catch{if(alive&&document.visibilityState==='visible'){failures++;setState(previous=>{const denied=previous.scope===scope&&previous.issue==='denied';return {scope,data:denied?null:previous.scope===scope?previous.data:null,issue:denied?'denied':'network'};});}}
      finally{running=false;schedule();}
    };
    const visible=()=>{if(document.visibilityState==='visible')void run();else if(timer)clearTimeout(timer);};
    retryRef.current=()=>void run();
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('focus',visible);
    void run();
    return()=>{alive=false;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);retryRef.current=()=>{};};
  },[enabled,slug,storeId,customerId,scopeKey,scope,identity,reader]);
  return {snapshot:state.scope===scope?state.data:null,issue:state.scope===scope?state.issue:'none',retry};
}
