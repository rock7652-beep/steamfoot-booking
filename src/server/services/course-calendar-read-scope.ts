import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {coursePrisma} from '@/lib/course-db';

// Only fixed operation labels may reach logs, never caller-supplied keys or row data.
const diagnosticStages=new Set(['sessions','roster-bookings','roster-customers','roster-absence-history','roster-confirmed-purchases','roster-native-purchases','roster-native-leave-ids','roster-pilot-evidence','roster-lesson-assignments','roster-renewal-cards','roster-group-term-counts','trial-settings','detail-permissions','waitlist-settings','waitlist-rows','waitlist-mode','teaching-template-versions','shared-card-state','sports-rules','sports-rules-available','sports-rules-ready','sports-rules-booking-read-ready','sports-balance-cards','music-balance-cards','music-balance-purchases','music-balance-joins']);
type ReadTiming={stage:string;startMs:number;durationMs:number|null;uses:number;ok:boolean|null};
type CalendarRead={storeId:string;sessionIds:readonly string[];once:<T>(key:string,load:()=>Promise<T>)=>Promise<T>;sharedReadCount:()=>number;sharedReadTimings:()=>ReadTiming[]};
const calendars=new AsyncLocalStorage<CalendarRead>();
/** One freshly authorized calendar read only. Never wrap actions or transactions.
 * Financial rows are read now and discarded with this request, not cached across requests. */
export function withCourseCalendarRead<T>(storeId:string,sessionIds:readonly string[],read:()=>Promise<T>):Promise<T>{
 const values=new Map<string,Promise<unknown>>();
 const timings=new Map<string,ReadTiming>(),started=performance.now();
 const round=(value:number)=>Math.round(value*10)/10;
 const once=<T>(key:string,load:()=>Promise<T>):Promise<T>=>{
  const previous=values.get(key);if(previous){timings.get(key)!.uses++;return previous as Promise<T>;}
  const timing:ReadTiming={stage:diagnosticStages.has(key)?key:'other',startMs:round(performance.now()-started),durationMs:null,uses:1,ok:null};
  timings.set(key,timing);
  const result=Promise.resolve().then(async()=>{
   const at=performance.now();timing.startMs=round(at-started);
   try{const result=await load();timing.ok=true;return result;}
   catch(error){timing.ok=false;throw error;}
   finally{timing.durationMs=round(performance.now()-at);}
  });values.set(key,result);return result;
 };
 return calendars.run({storeId,sessionIds:[...new Set(sessionIds)],once,sharedReadCount:()=>values.size,sharedReadTimings:()=>[...timings.values()].map(row=>({...row}))},read);
}
/** Ordinary read client + exact store/session only; transaction/custom clients never reuse it. */
export function courseCalendarRead(reader:object,storeId:string,sessionId?:string){
 const scope=calendars.getStore();
 return reader===coursePrisma&&scope?.storeId===storeId&&(!sessionId||scope.sessionIds.includes(sessionId))?scope:undefined;
}
