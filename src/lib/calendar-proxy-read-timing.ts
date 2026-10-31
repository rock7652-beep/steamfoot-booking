import "server-only";
import {withMusicReadTiming} from "./music-read-timing";
import {databaseConnectionPoolInfo} from "./database-url";

/** Fixed operation labels only: no tenant, user, arguments, cookies or tokens. */
export function calendarProxyReadOperation(method:string,url:Pick<URL,"pathname"|"searchParams">){
  const path=url.pathname;
  if(method==="GET"&&path==="/api/beauty/roster")return "beauty-roster";
  const dashboard=/^(?:\/s\/[^/]+\/admin|\/hq)?\/dashboard\/(.+)$/.exec(path)?.[1];
  if(method==="POST"&&dashboard==="courses/session-detail")return "sports-roster";
  if(method==="GET"&&dashboard==="courses/schedule-options")return "sports-options";
  if(method==="GET"&&dashboard==="music-read"&&["session-detail","roster-quick"].includes(url.searchParams.get("operation")??""))return "music-roster";
  return null;
}

/** Separate from handler timing: Proxy is an independent request execution.
 * This scope stores durations only and does not reuse authorization decisions. */
export async function traceCalendarProxyRead<T>(operation:string,work:()=>T|Promise<T>):Promise<T>{
  const timings:Record<string,number>={},started=performance.now();
  return withMusicReadTiming(timings,async()=>{
    try{
      const response=await work();
      timings.total=Math.round(performance.now()-started);
      if(response instanceof Response){
        response.headers.set("X-Calendar-Proxy-Timing",JSON.stringify(timings));
        const pool=databaseConnectionPoolInfo();
        if(pool)response.headers.set("X-Calendar-DB-Pool",JSON.stringify(pool));
      }
      return response;
    }finally{
      console.info("[CALENDAR_PROXY_PERF]",JSON.stringify({operation,totalMs:Math.round(performance.now()-started),timings}));
    }
  });
}
