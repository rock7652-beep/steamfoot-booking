"use client";
import {useEffect,useRef} from "react";

/** Poll a small, authorized revision only while this learner view is visible.
 * This is a bounded fallback, not a real-time push channel. */
export function useMusicPurchaseRevision(customerId:string, revision:string|undefined, changed:()=>void, enabled=true) {
 const callback=useRef(changed);callback.current=changed;
 useEffect(()=>{
  if(!enabled||!customerId||revision===undefined)return;
  let alive=true,running=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  const schedule=()=>{if(alive&&document.visibilityState==='visible')timer=setTimeout(()=>void check(),failures?Math.min(60000,5000*2**Math.min(failures,4)):5000);};
  async function check(){
   if(!alive||running||document.visibilityState!=='visible')return;
   if(timer)clearTimeout(timer);running=true;controller=new AbortController();const deadline=setTimeout(()=>controller?.abort(),6000);
   try{
    const prefix=window.location.pathname.split('/dashboard')[0];
    const response=await fetch(`${prefix}/dashboard/courses/music-purchase-revision?customerId=${encodeURIComponent(customerId)}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('revision unavailable');
    const data:unknown=await response.json();
    if(!data||typeof data!=='object'||!('success' in data)||data.success!==true||!('revision' in data)||typeof data.revision!=='string'||data.revision.length>200)throw new Error('invalid revision');
    if(!alive||document.visibilityState!=='visible')return;
    failures=0;
    if(data.revision!==revision){alive=false;callback.current();return;}
   }catch{if(alive&&document.visibilityState==='visible')failures++;}
   finally{clearTimeout(deadline);running=false;schedule();}
  }
  const visibility=()=>{if(document.visibilityState==='visible')void check();else{if(timer)clearTimeout(timer);controller?.abort();}};
  document.addEventListener('visibilitychange',visibility);schedule();
  return()=>{alive=false;if(timer)clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);};
 },[customerId,revision,enabled]);
}
