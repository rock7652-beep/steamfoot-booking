import 'server-only';
import type {InitialStoreNoticeSummary,StoreNoticeLoadResult} from '@/lib/store-notices';

/** Reuse the complete existing reader authorization. Never persist counts,
 * derive scope from the client, or let an optional badge delay the layout. */
export async function readInitialStoreNoticeSummary(module:string,storeId:string):Promise<InitialStoreNoticeSummary|null>{
 if(!['course','steamfoot','beauty'].includes(module)||!storeId)return null;
 return boundedInitialNoticeSummary(storeId,async()=>{
  const input={storeId,handled:false,offset:0,summaryOnly:true};
  if(module==='course')return (await import('@/server/actions/course-digital-manager-notices')).loadCombinedCourseStoreNotices(input);
  if(module==='steamfoot')return (await import('@/server/actions/steamfoot-store-notices')).loadSteamfootStoreNotices(input);
  return (await import('@/server/actions/beauty-store-notices')).loadBeautyStoreNotices(input);
 });
}
export async function boundedInitialNoticeSummary(storeId:string,read:()=>Promise<StoreNoticeLoadResult>,budgetMs=250):Promise<InitialStoreNoticeSummary|null>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 const result=Promise.resolve().then(read).then(value=>{
  if(!value.success||!value.enabled||value.storeId!==storeId||!Number.isSafeInteger(value.count)||value.count<0)return null;
  return {storeId,count:value.count,latestAt:value.latestAt??null,...(value.readTiming?{readTiming:value.readTiming}:{})};
 }).catch(()=>null);
 try{return await Promise.race([result,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),budgetMs);})]);}
 finally{if(timer)clearTimeout(timer);}
}
