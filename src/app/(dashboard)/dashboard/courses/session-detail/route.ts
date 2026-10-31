import {getCurrentUser} from "@/lib/session";
import {getActiveStoreForRead} from "@/lib/store";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {loadCourseSessionDetail} from "@/server/actions/course-members";
import {withReadRequestMemo} from "@/server/services/read-request-memo";
import {withMusicReadTiming,measureMusicRead} from "@/lib/music-read-timing";
const headers={"Cache-Control":"private, no-store"};
/** Scoped read transport; avoids blocking editor reads behind unrelated Server Actions. */
export async function POST(request:Request){
 return withReadRequestMemo(()=>read(request));
}
async function read(request:Request){
 const started=performance.now();
 const timings:Record<string,number>={};
 if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({success:false,error:"來源不正確"},{status:403,headers});
 try{
  return await withMusicReadTiming(timings,async()=>{
  const user=await measureMusicRead("identity",()=>getCurrentUser());if(!user)return Response.json({success:false,error:"請先登入"},{status:401,headers});
  const storeId=await measureMusicRead("scope",()=>getActiveStoreForRead(user));if(!storeId||!(await sportsNativePreview(storeId)))return Response.json({success:false,error:"此入口僅適用運動模組"},{status:403,headers});
  const body=await request.text();if(body.length>2000)return Response.json({success:false,error:"請求過長"},{status:400,headers});
  const data=JSON.parse(body);if(typeof data.sessionId!=="string"||data.sessionId.length>100)return Response.json({success:false,error:"課程不正確"},{status:400,headers});
  const result=await loadCourseSessionDetail(data.sessionId,data.rosterOnly===true,data.trialOnly===true);
  return Response.json(result,{headers:{...headers,"Server-Timing":`sessiondetail;dur=${Math.round(performance.now()-started)}`+Object.entries(timings).filter(([key])=>!key.endsWith(".count")).map(([key,value])=>`, ${key};dur=${value}`).join("")}});
  });
 }catch{return Response.json({success:false,error:"讀取失敗，請重試"},{status:400,headers});}
}
