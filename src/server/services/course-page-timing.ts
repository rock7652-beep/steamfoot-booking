import 'server-only';
type Stage = 'access'|'profile'|'ensure_month'|'pre_calendar'|'calendar_batch'|'post_calendar'|'presentation'|'rentals'|'rental_customers'|'cancelled_bookings'|'rooms'|'templates'|'sessions'|'coaches'|'business_hours'|'special_days'|'availability'|'availability_exceptions'|'roster_customers'|'waitlist_feature'|'waitlist_setting'|'display_orders'|'sports_rules'|'labels'|'plans'|'scheduling_modes';
/** Request-local wall time, including connection/permission waits; never SQL-engine-only time. */
export function createCoursePageTiming(now:()=>number=()=>performance.now()) {
 const start=now();let checkpoint=start;
 const phases:Array<{name:Stage;startMs:number;durationMs:number}>=[],reads:Array<{name:Stage;startMs:number;durationMs:number;ok:boolean}>=[];
 const round=(n:number)=>Math.round(n*10)/10;
 return {
  mark(name:Stage){const end=now();phases.push({name,startMs:round(checkpoint-start),durationMs:round(end-checkpoint)});checkpoint=end;},
  async read<T>(name:Stage,work:()=>Promise<T>):Promise<T>{const at=now();let ok=false;try{const value=await work();ok=true;return value;}finally{reads.push({name,startMs:round(at-start),durationMs:round(now()-at),ok});}},
  snapshot(){return {totalMs:round(now()-start),phases:[...phases],reads:[...reads]};},
 };
}
/** Diagnostics only on the approved isolated sports Preview, after the page's normal authorization. */
export function coursePageTimingVisible(requested:string|undefined,storeId:string,role:string,env:NodeJS.ProcessEnv=process.env) {
 return requested==='1'&&storeId==='sports-live-flow-store'&&role==='OWNER'&&env.VERCEL==='1'&&env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='perf/sports-course-loading';
}
