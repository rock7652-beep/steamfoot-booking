"use client";
import {useEffect,useEffectEvent,useRef,useState} from 'react';
/** Confirmed writes invalidate live labels once editing closes, without replacing an active draft. */
export function useBeautyCustomerRevision(blocked:boolean){
 const [revision,setRevision]=useState(0),dirty=useRef(false);
 const onChanged=useEffectEvent(()=>{if(blocked)dirty.current=true;else{dirty.current=false;setRevision(value=>value+1);}});
 useEffect(()=>{
  const changed=()=>onChanged();
  window.addEventListener('customer-search-invalidated',changed);
  return()=>window.removeEventListener('customer-search-invalidated',changed);
 },[]);
 const flush=useEffectEvent(()=>{if(!blocked&&dirty.current){dirty.current=false;setRevision(value=>value+1);}});
 // Let the closing editor commit before starting the deferred external read.
 useEffect(()=>{if(blocked||!dirty.current)return;let active=true;queueMicrotask(()=>{if(active)flush();});return()=>{active=false;};},[blocked]);
 return revision;
}
