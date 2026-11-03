import {syncSportsPermanentCalendar} from "@/server/actions/sports-series";
import {loadSportsCalendar} from "@/server/actions/sports-calendar";

const headers={"Cache-Control":"private, no-store"};
/** Synchronize before reading the complete month, within one browser round trip.
 * The write and read retain their independent current permissions and store checks. */
export async function POST(request:Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({success:false,error:"來源不正確"},{status:403,headers});
  try {
    const body=await request.text();
    if(body.length>200)return Response.json({success:false,error:"請求過長"},{status:400,headers});
    const data=JSON.parse(body);
    if(typeof data?.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(data.date))return Response.json({success:false,error:"日期不正確"},{status:400,headers});
    const started=performance.now();
    const sync=await syncSportsPermanentCalendar(data.date);
    const syncMs=Math.round(performance.now()-started);
    if(!sync.success)return Response.json(sync,{headers});
    const readStarted=performance.now();
    const result=await loadSportsCalendar(data.date);
    const readMs=Math.round(performance.now()-readStarted);
    const totalMs=Math.round(performance.now()-started);
    console.info("[COURSE_CALENDAR_SYNC_READ_PERF]",JSON.stringify({syncMs,readMs,totalMs,success:result.success}));
    return Response.json(result.success?{...result,warning:'warning' in sync?sync.warning:null}:result,{headers:{...headers,"Server-Timing":`sync;dur=${syncMs}, read;dur=${readMs}, calendar;dur=${totalMs}`}});
  } catch {return Response.json({success:false,error:"課表同步失敗，請重試"},{status:400,headers});}
}
