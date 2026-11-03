import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
type Span={name:string;durationMs:number;ok:boolean};
const context=new AsyncLocalStorage<{spans:Span[]}>();
export async function beautyReadStep<T>(name:string,work:()=>Promise<T>):Promise<T>{
 const state=context.getStore();if(!state)return work();const at=performance.now();let ok=false;
 try{const value=await work();ok=true;return value;}finally{state.spans.push({name,durationMs:Math.round((performance.now()-at)*10)/10,ok});}
}
/** Only fixed operation names and timings are logged; no customer, store or payload values. */
export async function traceBeautyRead<T>(operation:string,work:()=>Promise<T>){
 const at=performance.now(),state={spans:[] as Span[]},traceId=randomUUID();let ok=false;
 try{const value=await context.run(state,work);ok=!(value&&typeof value==="object"&&"success" in value&&value.success===false);return {value,timing:{traceId,totalMs:Math.round((performance.now()-at)*10)/10,spans:state.spans}};}
 finally{console.info('[BEAUTY_READ_PERF]',JSON.stringify({operation,traceId,ok,totalMs:Math.round((performance.now()-at)*10)/10,spans:state.spans}));}
}
export function beautyReadTimingHeader(t:{totalMs:number;spans:Span[]}){
 return [`handler;dur=${t.totalMs}`,...t.spans.map(s=>`${s.name};dur=${s.durationMs}`)].join(', ');
}
