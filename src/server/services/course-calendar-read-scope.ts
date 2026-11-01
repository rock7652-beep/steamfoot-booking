import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {coursePrisma} from '@/lib/course-db';

type CalendarRead={storeId:string;sessionIds:readonly string[];once:<T>(key:string,load:()=>Promise<T>)=>Promise<T>;sharedReadCount:()=>number};
const calendars=new AsyncLocalStorage<CalendarRead>();
/** One freshly authorized calendar read only. Never wrap actions or transactions.
 * Financial rows are read now and discarded with this request, not cached across requests. */
export function withCourseCalendarRead<T>(storeId:string,sessionIds:readonly string[],read:()=>Promise<T>):Promise<T>{
 const values=new Map<string,Promise<unknown>>();
 const once=<T>(key:string,load:()=>Promise<T>):Promise<T>=>{
  const previous=values.get(key);if(previous)return previous as Promise<T>;
  const result=Promise.resolve().then(load);values.set(key,result);return result;
 };
 return calendars.run({storeId,sessionIds:[...new Set(sessionIds)],once,sharedReadCount:()=>values.size},read);
}
/** Ordinary read client + exact store/session only; transaction/custom clients never reuse it. */
export function courseCalendarRead(reader:object,storeId:string,sessionId?:string){
 const scope=calendars.getStore();
 return reader===coursePrisma&&scope?.storeId===storeId&&(!sessionId||scope.sessionIds.includes(sessionId))?scope:undefined;
}
