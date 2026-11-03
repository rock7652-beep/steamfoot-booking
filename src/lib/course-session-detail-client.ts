import type {loadCourseSessionDetail} from "@/server/actions/course-members";
export async function readCourseSessionDetailClient(sessionId:string,rosterOnly=false,trialOnly=false):Promise<Awaited<ReturnType<typeof loadCourseSessionDetail>>>{
 const prefix=window.location.pathname.split("/dashboard")[0];
 const response=await fetch(`${prefix}/dashboard/courses/session-detail`,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId,rosterOnly,trialOnly})});
 if(!response.ok)throw new Error("讀取失敗");
 return response.json();
}
