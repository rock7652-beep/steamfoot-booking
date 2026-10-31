import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {NoticeReadTiming} from '@/lib/notice-read-performance';

type State={started:number;spans:NoticeReadTiming['spans']};
const scope=new AsyncLocalStorage<State>();
const round=(n:number)=>Math.round(n*10)/10;
export async function noticeReadStep<T>(name:string,work:()=>Promise<T>):Promise<T>{
 const state=scope.getStore();if(!state)return work();const at=performance.now();let ok=false;
 try{const value=await work();ok=true;return value;}finally{state.spans.push({name,startMs:round(at-state.started),durationMs:round(performance.now()-at),ok});}
}
export async function traceNoticeRead<T>(work:()=>Promise<T>){
 const state={started:performance.now(),spans:[] as NoticeReadTiming['spans']};
 const value=await scope.run(state,work);
 return {value,timing:{totalMs:round(performance.now()-state.started),spans:state.spans}};
}
export function noticeDiagnosticsEnabled(env:NodeJS.ProcessEnv=process.env){
 return env.NOTICE_READ_PERF_QA==='1'&&env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='perf/digital-manager-initial-count-20261031';
}
/** Normal action payloads are unchanged. Diagnostics are limited to the isolated Preview. */
export async function withNoticeDiagnostics<T>(work:()=>Promise<T>):Promise<T>{
 if(scope.getStore()||!noticeDiagnosticsEnabled())return work();
 const {value,timing}=await traceNoticeRead(work);return {...value,readTiming:timing};
}
