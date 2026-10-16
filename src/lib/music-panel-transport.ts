import {isMusicPreviewPage} from "./music-finance-sync";
const operations=new Set(["music-student-workspace","course-card","purchases","bookings","session-detail","roster-quick","revenue-totals","revenue-transactions"]);
/** Independent read-only requests avoid the client Server Action queue. */
export async function musicPanelRead<T>(operation:string,args:unknown[],fallback:()=>Promise<T>):Promise<T>{
  if(!isMusicPreviewPage()||!operations.has(operation))return fallback();
  const query=new URLSearchParams({operation,args:JSON.stringify(args)});
  const response=await fetch(`/s/lubymusic/admin/dashboard/music-read?${query}`,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("學員資料讀取失敗，請重試");
  const result=await response.json();
  if(typeof result?.success!=="boolean")throw new Error("讀取回應格式不符");
  return result as T;
}
