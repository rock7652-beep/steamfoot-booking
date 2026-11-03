import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";

// Closed diagnostic vocabulary: caller data, SQL and error messages never reach logs.
const stages = [
  "access", "access.permission", "access.permission.session", "access.permission.grant", "access.permission.subscription",
  "access.store.resolve", "access.store.verified", "access.store.module", "access.store.membership",
  "sports_scope", "module_entitlement", "booking_feature", "production_readiness",
  "month_scope", "subscription", "release_candidates", "release_transaction",
  "series", "series_scope", "series_readiness", "series_rows", "missing_plan", "missing_occurrences", "missing_batch", "materialize",
  "month_batch", "sessions", "rentals", "rules", "hours", "special_days", "availability_exceptions", "scheduling_modes",
  "month_details", "customers", "rosters", "labels", "recurrence", "presentation", "calendar_days", "response_projection",
] as const;
type Stage = typeof stages[number];
type Operation = "sports_sync" | "month_fitness" | "month_music";
type Count = "sessions" | "rentals" | "customers" | "series" | "release_candidates" | "missing_batches";
type Span = {name:Stage;startMs:number;durationMs:number|null;ok:boolean|null};
type State = {start:number;spans:Span[];counts:Partial<Record<Count,number>>;dropped:number};
const scope = new AsyncLocalStorage<State>();
const allowed = new Set<string>(stages);
const counts = new Set<string>(["sessions","rentals","customers","series","release_candidates","missing_batches"]);
const operations = new Set<string>(["sports_sync","month_fitness","month_music"]);
const round = (n:number) => Math.round(n*10)/10;
function startSpan(name:string) {
  const state=scope.getStore();
  if(!state||!allowed.has(name))return;
  if(state.spans.length>=96){state.dropped++;return;}
  const start=performance.now(),span:Span={name:name as Stage,startMs:round(start-state.start),durationMs:null,ok:null};
  state.spans.push(span);
  return {span,start};
}
/** Timings include pool/network waits; overlapping spans must not be added together. */
export async function calendarPhase<T>(name:Stage,work:()=>T|PromiseLike<T>):Promise<T> {
  const span=startSpan(name);
  try{const result=await work();if(span)span.span.ok=true;return result;}
  finally{if(span){span.span.durationMs=round(performance.now()-span.start);if(span.span.ok===null)span.span.ok=false;}}
}
export function calendarSyncPhase<T>(name:Stage,work:()=>T):T {
  const span=startSpan(name);
  try{const result=work();if(span)span.span.ok=true;return result;}
  finally{if(span){span.span.durationMs=round(performance.now()-span.start);if(span.span.ok===null)span.span.ok=false;}}
}
/** Adapter for existing permission/store timing callbacks. Unknown labels are ignored. */
export function calendarAccessPhase<T>(name:string,work:()=>Promise<T>):Promise<T> {
  return calendarPhase(("access."+name) as Stage,work);
}
export function calendarCount(name:Count,value:number) {
  const state=scope.getStore();
  if(state&&counts.has(name)&&Number.isSafeInteger(value)&&value>=0)state.counts[name]=value;
}
export async function traceCourseCalendar<T>(operation:Operation,work:()=>Promise<T>):Promise<T> {
  const state:State={start:performance.now(),spans:[],counts:{},dropped:0};
  let ok=false;
  try{
    const result=await scope.run(state,work);
    ok=!(result&&typeof result==="object"&&"success" in result&&result.success===false);
    return result;
  }finally{
    // Diagnostics cannot replace a result, rejection or framework redirect.
    try{console.info("[COURSE_CALENDAR_PHASE_PERF]",JSON.stringify({operation:operations.has(operation)?operation:"unknown",ok,totalMs:round(performance.now()-state.start),spans:state.spans,counts:state.counts,dropped:state.dropped}));}catch{}
  }
}
