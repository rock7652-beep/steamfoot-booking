'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {readBeautyMemberPlanSnapshot} from '@/lib/beauty/member-plan-snapshot-read';
import type {BeautyMemberPlanSnapshot} from '@/server/beauty/member-plan-snapshot';

/** Poll only the foreground plans view. No transaction, navigation or form data
 * is touched; each read re-authorizes the current member and store. */
export function useBeautyMemberPlanSync({enabled,slug,storeId,customerId,scopeKey,revision,work}:{enabled:boolean;slug:string;storeId:string;customerId:string;scopeKey:string;revision:string;work:boolean}){
  const scope=JSON.stringify([storeId,customerId,scopeKey,revision,work]);
  const reader=usePanelReader('beauty-member-plan-snapshot',readBeautyMemberPlanSnapshot,scope,0);
  const [state,setState]=useState<{scope:string;data:BeautyMemberPlanSnapshot|null;issue:'none'|'network'|'denied'}>({scope,data:null,issue:'none'});
  const retryRef=useRef<()=>void>(()=>{});
  const retry=useCallback(()=>retryRef.current(),[]);
  useEffect(()=>{
    if(!enabled||!storeId||!customerId||!scopeKey)return;
    let alive=true,running=false,timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=()=>{if(alive&&document.visibilityState==='visible')timer=setTimeout(()=>void run(),10000);};
    const run=async()=>{
      if(!alive||running||document.visibilityState!=='visible')return;
      if(timer)clearTimeout(timer);
      running=true;
      try{
        const result=await reader.read(slug,storeId,customerId,scopeKey);
        if(!alive||document.visibilityState!=='visible')return;
        if(!result.success){setState(previous=>{const denied=result.denied||(previous.scope===scope&&previous.issue==='denied');return {scope,data:denied?null:previous.scope===scope?previous.data:null,issue:denied?'denied':'network'};});return;}
        setState(previous=>previous.scope===scope&&previous.issue==='none'&&JSON.stringify(previous.data)===JSON.stringify(result.data)?previous:{scope,data:result.data,issue:'none'});
      }catch{if(alive&&document.visibilityState==='visible')setState(previous=>{const denied=previous.scope===scope&&previous.issue==='denied';return {scope,data:denied?null:previous.scope===scope?previous.data:null,issue:denied?'denied':'network'};});}
      finally{running=false;schedule();}
    };
    const visible=()=>{if(document.visibilityState==='visible')void run();else if(timer)clearTimeout(timer);};
    retryRef.current=()=>void run();
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('focus',visible);
    void run();
    return()=>{alive=false;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);retryRef.current=()=>{};};
  },[enabled,slug,storeId,customerId,scopeKey,scope,reader]);
  return {snapshot:state.scope===scope?state.data:null,issue:state.scope===scope?state.issue:'none',retry};
}
