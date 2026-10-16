import {isMusicPreviewPage} from "./music-finance-sync";
const operations=new Set(["music-student-workspace","course-card","purchases","bookings","session-detail","roster-quick","revenue-totals","revenue-transactions","revenue-snapshot"]);
/** Independent read-only requests avoid the client Server Action queue. */
export async function musicPanelRead<T>(operation:string,args:unknown[],fallback:()=>Promise<T>):Promise<T>{
  if(!isMusicPreviewPage()||!operations.has(operation))return fallback();
  const query=new URLSearchParams({operation,args:JSON.stringify(args)});
  const endpoint=operation==="revenue-snapshot"?"music-revenue":"music-read";
  const started=performance.now();
  const response=await fetch(`/s/lubymusic/admin/dashboard/${endpoint}?${query}`,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("學員資料讀取失敗，請重試");
  const result=await response.json();
  if(operation==="purchases"||operation==="music-student-workspace")console.info(operation==="purchases"?"[music-payment-history]":"[music-student-overview]",JSON.stringify({requestMs:Math.round(performance.now()-started),serverTiming:response.headers.get("server-timing"),phases:response.headers.get("x-music-read-timing")}));
  if(typeof result?.success!=="boolean")throw new Error("讀取回應格式不符");
  return result as T;
}
