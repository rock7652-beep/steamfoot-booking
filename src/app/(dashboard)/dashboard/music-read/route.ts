import {loadMusicStudentWorkspace} from "@/server/actions/music-student-workspace";
import {browseCourseCards} from "@/server/actions/course-browse";
import {loadCourseCustomerPurchases} from "@/server/actions/course-customer-history";
import {loadCourseCustomerBookings} from "@/server/actions/course-members";
import {courseManagerRead} from "@/server/services/course-access";
import {musicDataSeparationEnabled} from "@/server/services/music-data-scope";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const started=performance.now();
  const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store","Server-Timing":`musicread;dur=${Math.round(performance.now()-started)}`}});
  try{
    const {storeId}=await courseManagerRead("customer.read");
    if(!musicDataSeparationEnabled(storeId))return reply({success:false,error:"僅供音樂測試站"},403);
    const params=new URL(request.url).searchParams,raw=params.get("args")??"[]";
    if(raw.length>4000)return reply({success:false,error:"參數過長"},400);
    const args=JSON.parse(raw);
    if(!Array.isArray(args)||args.length>3)return reply({success:false,error:"參數無效"},400);
    // Existing readers retain their per-resource permissions and store scope.
    switch(params.get("operation")){
      case "music-student-workspace":return reply(await loadMusicStudentWorkspace(args[0]));
      case "course-card":return reply(await browseCourseCards(args[0]));
      case "purchases":return reply(await loadCourseCustomerPurchases(args[0],args[1],args[2]));
      case "bookings":return reply(await loadCourseCustomerBookings(args[0],args[1],args[2]));
      default:return reply({success:false,error:"不支援的讀取"},400);
    }
  }catch{return reply({success:false,error:"讀取未完成，請重試"},400);}
}
