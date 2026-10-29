"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {acknowledgeBeautyCollectionPurchaseIntent,cancelBeautyCollectionPurchaseIntent,prepareBeautyCollectionPurchaseIntent,readBeautyCollectionPurchaseIntent} from '@/server/actions/beauty-collection-intent';
import {collectBeautyPayment} from '@/server/actions/beauty';
import type {BeautyCollectionIntentStatus} from '@/server/beauty/collection-intent';
import {formatTWDateTime} from '@/lib/date-utils';

type Intent={status:BeautyCollectionIntentStatus;requestKey:string;appointmentIds:string[];appointments?:Array<{id:string;personName:string;serviceName:string;startsAt:string}>};
type IntentResult={success:true;data:Intent|null}|{success:false;error:string};
type State={kind:'checking'}|{kind:'ready'}|{kind:'uncertain'}|{kind:'intent';intent:Intent};
type Input=Record<string,unknown>&{ids:string[];requestKey:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const same=(a:string[],b:string[])=>a.length===b.length&&[...a].sort().every((x,i)=>x===[...b].sort()[i]);
const button='min-h-11 rounded-lg border border-earth-300 px-3 py-2 text-base disabled:opacity-50';
// A timeout only stops waiting. The original server operation may still commit,
// so its key remains stored and no request is retried automatically.
const REQUEST_TIMEOUT_MS=8_000;
function boundedRequest<T>(request:()=>Promise<T>):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('collection request timed out')),REQUEST_TIMEOUT_MS);Promise.resolve().then(request).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}

/** Only the random key is stored. Full payment data stays in the form and the
 * server uses an authorized keyed fingerprint for the exact original input. */
export function useBeautyCollectionRecovery(storeId:string|undefined,ids:string[],enabled:boolean){
 const sorted=JSON.stringify([...ids].sort()),scope=storeId&&ids.length?`beauty-collection:v1:${encodeURIComponent(storeId)}:${encodeURIComponent(sorted)}`:'';
 const [rendered,setRendered]=useState<{scope:string;value:State}>({scope:'',value:{kind:'checking'}}),[busy,setBusy]=useState(false);
 const state:State=!enabled?{kind:'ready'}:rendered.scope===scope?rendered.value:{kind:'checking'};
 const generation=useRef(0),readVersion=useRef(0),running=useRef(false),current=useRef<State>({kind:'checking'});
 current.current=state;
 const latest=useRef({scope,enabled});latest.current={scope,enabled};
 const change=useCallback((s:State)=>{current.current=s;setRendered({scope,value:s})},[scope]);
 const readKey=useCallback(()=>{try{const raw=sessionStorage.getItem(scope);if(raw===null)return null;const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid');const row=value as Record<string,unknown>;if(Object.keys(row).sort().join(',')!=='requestKey,v'||row.v!==1||typeof row.requestKey!=='string'||!uuid.test(row.requestKey))throw new Error('invalid');return row.requestKey;}catch{throw new Error('storage');}},[scope]);
 const remember=useCallback((key:string)=>{if(!uuid.test(key))throw new Error('invalid');const old=readKey();if(old&&old!==key)throw new Error('conflict');if(!old)sessionStorage.setItem(scope,JSON.stringify({v:1,requestKey:key}));if(readKey()!==key)throw new Error('storage');},[readKey,scope]);
 const alive=useCallback((version:number)=>generation.current===version&&latest.current.scope===scope&&latest.current.enabled===enabled,[scope,enabled]);
 const inspect=useCallback(async()=>{
  if(!enabled)return;if(!scope||!storeId){change({kind:'uncertain'});return;}
  const version=generation.current,read=++readVersion.current;change({kind:'checking'});
  try{const key=readKey(),result=await boundedRequest(()=>readBeautyCollectionPurchaseIntent({expectedStoreId:storeId,ids:JSON.parse(sorted),...(key?{requestKey:key}:{})}));
   if(!alive(version)||read!==readVersion.current)return;if(!result.success){change({kind:'uncertain'});return;}
   if(!result.data){change(key?{kind:'uncertain'}:{kind:'ready'});return;}
   if(key&&result.data.requestKey!==key){change({kind:'uncertain'});return;}
   remember(result.data.requestKey);change({kind:'intent',intent:result.data});
  }catch{if(alive(version)&&read===readVersion.current)change({kind:'uncertain'});}
 },[enabled,scope,storeId,sorted,readKey,remember,alive,change]);
 useEffect(()=>{const generationRef=generation,readRef=readVersion;++generationRef.current;running.current=false;setBusy(false);if(enabled)void inspect();else change({kind:'ready'});return()=>{++generationRef.current;++readRef.current;};},[enabled,scope,inspect,change]);
 const submit=useCallback(async(input:Input)=>{
  if(!enabled)return collectBeautyPayment(input);
  if(!scope||!storeId||running.current)return {success:false as const,error:'收款狀態尚未確認'};
  const version=generation.current;++readVersion.current;running.current=true;setBusy(true);
  try{
   const selected=JSON.parse(sorted) as string[],before=current.current;
   if(!same(input.ids,selected)||before.kind==='checking'||(before.kind==='intent'&&!same(before.intent.appointmentIds,selected)))throw new Error('scope');
   if(before.kind==='intent'&&before.intent.status!=='PREPARED')throw new Error('terminal');
   let key=readKey();if(!key){if(before.kind!=='ready')throw new Error('unconfirmed');key=crypto.randomUUID();remember(key);}
   const prepared=await boundedRequest(()=>{if(!alive(version))throw new Error('scope changed');return prepareBeautyCollectionPurchaseIntent({...input,requestKey:key,expectedStoreId:storeId});});
   if(!alive(version))return {success:false as const,error:'已切換服務，原收款狀態待核對'};
   if(!prepared.success||!same(prepared.data.appointmentIds,selected)){change({kind:'uncertain'});return {success:false as const,error:'收款狀態尚未確認，請勿再次收款'};}
   change({kind:'intent',intent:prepared.data});
   if(prepared.data.status!=='PREPARED')return {success:false as const,error:'已有原收款結果，請先核對'};
   const result=await boundedRequest(()=>{if(!alive(version))throw new Error('scope changed');return collectBeautyPayment({...input,requestKey:key});});
   if(!alive(version))return {success:false as const,error:'已切換服務，原收款狀態待核對'};
   // A response is not a substitute for reading the persistent intent.
   const checked=await boundedRequest(()=>readBeautyCollectionPurchaseIntent({expectedStoreId:storeId,ids:selected,requestKey:key}));
   if(!alive(version))return {success:false as const,error:'已切換服務，原收款狀態待核對'};
   if(!checked.success||!checked.data){change({kind:'uncertain'});return {success:false as const,error:'收款狀態尚未確認，請勿再次收款'};}
   change({kind:'intent',intent:checked.data});return result;
  }catch{if(alive(version))change({kind:'uncertain'});return {success:false as const,error:'收款狀態尚未確認，請勿再次收款；查無紀錄仍可能處理中'};}
  finally{if(alive(version)){running.current=false;setBusy(false);}}
 },[enabled,scope,storeId,sorted,readKey,remember,alive,change]);
 const cancel=useCallback(async()=>{if(!enabled||!scope||!storeId||running.current)return;const version=generation.current;++readVersion.current;running.current=true;setBusy(true);try{const key=readKey();if(!key)throw new Error('missing');const state=current.current;const original=state.kind==='intent'?state.intent.appointmentIds:JSON.parse(sorted) as string[];const result=await boundedRequest(()=>{if(!alive(version))throw new Error('scope changed');return cancelBeautyCollectionPurchaseIntent({expectedStoreId:storeId,ids:original,requestKey:key});});if(!alive(version))return;if(!result.success){change({kind:'uncertain'});return;}change({kind:'intent',intent:result.data});}catch{if(alive(version))change({kind:'uncertain'});}finally{if(alive(version)){running.current=false;setBusy(false);}}},[enabled,scope,storeId,sorted,readKey,alive,change]);
 const acknowledge=useCallback(async()=>{if(!enabled||!scope||!storeId||running.current)return false;const version=generation.current;++readVersion.current;running.current=true;setBusy(true);try{const key=readKey(),state=current.current;if(!key||state.kind!=='intent'||key!==state.intent.requestKey)throw new Error('missing');const original=state.intent.appointmentIds;const result=await boundedRequest<IntentResult>(()=>{if(!alive(version))throw new Error('scope changed');return state.intent.status==='CANCELLED'?readBeautyCollectionPurchaseIntent({expectedStoreId:storeId,ids:original,requestKey:key}):acknowledgeBeautyCollectionPurchaseIntent({expectedStoreId:storeId,ids:original,requestKey:key});});if(!alive(version))return false;if(!result.success||!result.data||result.data.requestKey!==key||!same(result.data.appointmentIds,original)||!['CANCELLED','ACKNOWLEDGED'].includes(result.data.status))throw new Error('unconfirmed');sessionStorage.removeItem(scope);if(readKey()!==null)throw new Error('storage');change({kind:'ready'});return true;}catch{if(alive(version))change({kind:'uncertain'});return false;}finally{if(alive(version)){running.current=false;setBusy(false);}}},[enabled,scope,storeId,readKey,alive,change]);
 const blocked=enabled&&(busy||state.kind==='checking'||state.kind==='uncertain'||(state.kind==='intent'&&(state.intent.status!=='PREPARED'||!same(state.intent.appointmentIds,ids))));
 return {enabled,state,busy,blocked,submit,inspect,cancel,acknowledge};
}

export function BeautyCollectionRecoveryNotice({recovery,disabled,onConfirmed}:{recovery:ReturnType<typeof useBeautyCollectionRecovery>;disabled:boolean;onConfirmed:()=>void}){
 if(!recovery.enabled||recovery.state.kind==='ready')return null;
 if(recovery.state.kind==='checking')return <p role="status">正在核對收款狀態…</p>;
 const pending=disabled||recovery.busy,state=recovery.state;
 if(state.kind==='uncertain')return <section role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-base"><p>收款結果尚未確認，查無紀錄不代表失敗，請勿再次收款。</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={pending} onClick={()=>void recovery.inspect()}>重新核對</button><button type="button" className={button} disabled={pending} onClick={()=>void recovery.cancel()}>安全取消原請求</button></div></section>;
 const details=state.intent.appointments?.length?<ul className="space-y-1">{state.intent.appointments.map(item=><li key={item.id}>{item.personName} · {item.serviceName} · {formatTWDateTime(new Date(item.startsAt))}</li>)}</ul>:null;
 if(state.intent.status==='PREPARED')return <section role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-base"><p>原請求涵蓋 {state.intent.appointmentIds.length} 筆服務；請核對原收款資料。安全取消會同時取消這筆請求中的全部服務。</p>{details}<button type="button" className={button} disabled={pending} onClick={()=>void recovery.cancel()}>安全取消原請求</button></section>;
 const cancelled=state.intent.status==='CANCELLED';return <section role="status" className="space-y-2 rounded-lg bg-primary-50 p-3 text-base"><p>{cancelled?'原收款請求已安全取消。':'本次服務收款或折抵已處理，請核對金額，勿再次收款。'}</p>{details}<button type="button" className={button} disabled={pending} onClick={()=>void recovery.acknowledge().then(ok=>{if(ok)onConfirmed();})}>確認並更新</button></section>;
}
