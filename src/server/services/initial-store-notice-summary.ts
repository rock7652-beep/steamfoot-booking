import 'server-only';
import type {InitialStoreNoticeSummary,StoreNoticeLoadResult} from '@/lib/store-notices';
import {noticeDiagnosticsEnabled,noticeReadStep,withNoticeDiagnostics} from './notice-read-timing';

/** Reuse the complete existing reader authorization. Never persist counts,
 * derive scope from the client, or let an optional badge delay the layout. */
export async function readInitialStoreNoticeSummary(module:string,storeId:string):Promise<InitialStoreNoticeSummary|null>{
 return prefetchInitialStoreNoticeSummary(module,storeId)();
}

/** Start while the rest of the layout loads. Apply the extra wait budget only
 * when the layout needs the result, so completed work is not discarded early. */
export function prefetchInitialStoreNoticeSummary(module:string,storeId:string):()=>Promise<InitialStoreNoticeSummary|null>{
 if(!['course','steamfoot','beauty'].includes(module)||!storeId)return async()=>null;
 return prefetchInitialNoticeSummary(storeId,()=>withNoticeDiagnostics(async()=>{
  const input={storeId,handled:false,offset:0,summaryOnly:true};
  const reader=await noticeReadStep('reader.import',async()=>{
   if(module==='course')return (await import('@/server/actions/course-digital-manager-notices')).loadCombinedCourseStoreNotices;
   if(module==='steamfoot')return (await import('@/server/actions/steamfoot-store-notices')).loadSteamfootStoreNotices;
   return (await import('@/server/actions/beauty-store-notices')).loadBeautyStoreNotices;
  });
  return noticeReadStep('reader.execute',()=>reader(input));
 }));
}
export async function boundedInitialNoticeSummary(storeId:string,read:()=>Promise<StoreNoticeLoadResult>,budgetMs=250):Promise<InitialStoreNoticeSummary|null>{
 return prefetchInitialNoticeSummary(storeId,read,budgetMs)();
}

export function prefetchInitialNoticeSummary(storeId:string,read:()=>Promise<StoreNoticeLoadResult>,budgetMs=250):()=>Promise<InitialStoreNoticeSummary|null>{
 const started=performance.now();let settled=false;let expired=false;
 const report=(phase:'settled'|'consumed',fields:Record<string,unknown>)=>{
  if(noticeDiagnosticsEnabled())console.info('[NOTICE_PREFETCH_PERF]',JSON.stringify({phase,elapsedMs:Math.round((performance.now()-started)*10)/10,...fields}));
 };
 const result=Promise.resolve().then(read).then(value=>{
  if(!value.success||!value.enabled||value.storeId!==storeId||!Number.isSafeInteger(value.count)||value.count<0)return null;
  return {storeId,count:value.count,latestAt:value.latestAt??null,...(value.readTiming?{readTiming:value.readTiming}:{})};
 }).catch(()=>null).then(value=>{
  settled=true;report('settled',{valid:value!==null,afterTimeout:expired,...(value?.readTiming?{readTiming:value.readTiming}:{})});return value;
 });
 let consumed:Promise<InitialStoreNoticeSummary|null>|undefined;
 return ()=>consumed??=(async()=>{
  const readyBeforeConsume=settled;const waitingAt=performance.now();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const value=await Promise.race([result,new Promise<null>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(null);},budgetMs);})]);
   report('consumed',{readyBeforeConsume,waitMs:Math.round((performance.now()-waitingAt)*10)/10,timedOut:expired,valid:value!==null});return value;
  }finally{if(timer)clearTimeout(timer);}
 })();
}
