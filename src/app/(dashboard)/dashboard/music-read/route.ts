import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";
import {z} from "zod";
import {getCourseReceiptTotals} from "@/server/queries/course-home";
import {readMusicStudentWorkspace} from "@/server/queries/music-student-workspace";
import {readCourseCards} from "@/server/queries/course-card-browser";
import {readCourseCustomerPurchases} from "@/server/queries/course-customer-purchases";
import {loadCourseCustomerBookings,loadCourseSessionDetail,loadCourseRosterQuick} from "@/server/actions/course-members";
import {loadMusicStudentMakeups} from "@/server/actions/music-student-makeups";
import {loadCourseCustomerSearchIndex} from "@/server/actions/course-browse";
import {courseManagerRead} from "@/server/services/course-access";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const started=performance.now();
  const operation=new URL(request.url).searchParams.get("operation");
  const timings:Record<string,number>={};
  const reply=(value:unknown,status=200)=>{console.info("[music-panel-read]",JSON.stringify({operation,status,totalMs:Math.round(performance.now()-started),timings}));return Response.json(value,{status,headers:{"Cache-Control":"private, no-store","Server-Timing":`musicread;dur=${Math.round(performance.now()-started)}`,"X-Music-Read-Timing":JSON.stringify(timings)}});};
  try{
    const params=new URL(request.url).searchParams,raw=params.get("args")??"[]";
    if(raw.length>4000)return reply({success:false,error:"參數過長"},400);
    const args=JSON.parse(raw);
    if(!Array.isArray(args)||args.length>3)return reply({success:false,error:"參數無效"},400);
    // Purchase reader performs both permissions and the preview/store gate itself.
    if(operation==="purchases")return reply(await readCourseCustomerPurchases(args[0],args[1],args[2],true,timings));
    if(operation==="music-student-workspace")return reply(await readMusicStudentWorkspace(args[0],true,timings,args[1]));
    if(operation==="course-card")return reply(await readCourseCards(args[0],true,timings));
    const {storeId}=await courseManagerRead(operation==="session-detail"||operation==="roster-quick"||operation==="music-student-makeups"?"booking.read":(operation==="revenue-totals"||operation==="revenue-transactions")?"transaction.read":"customer.read");
    if(!musicNativeWorkflowEnabled(storeId))return reply({success:false,error:"音樂功能未開通"},403);
    // Existing readers retain their per-resource permissions and store scope.
    switch(operation){
      case "revenue-transactions": {
        const date=z.string().date();
        const input=z.object({from:date,to:date,dataScope:z.enum(["operational","legacy"]).optional(),status:z.enum(["PENDING","CONFIRMED","REFUNDED","VOIDED"]).optional(),staff:z.string().max(100).optional(),page:z.string().regex(/^\d{1,6}$/).optional()}).parse(args[0]);
        if(input.from>input.to)return reply({success:false,error:"日期區間無效"},400);
        return reply({success:true,data:await getMusicRevenueTransactions(storeId,input)});
      }
      case "revenue-totals": {
        const date=z.string().date();
        const data=z.object({from:date,to:date,dataScope:z.enum(["operational","legacy"]).optional()}).parse(args[0]);
        if(data.from>data.to)return reply({success:false,error:"日期區間無效"},400);
        return reply({success:true,data:await getCourseReceiptTotals(storeId,data.from,data.to,data.dataScope)});
      }
      case "session-detail":return reply(await loadCourseSessionDetail(args[0],args[1]));
      case "roster-quick":return reply(await loadCourseRosterQuick(args[0]));
      case "music-student-makeups":return reply(await loadMusicStudentMakeups(args[0],args[1]));
      case "course-customer-search-index":return reply(await loadCourseCustomerSearchIndex());
      case "bookings":return reply(await loadCourseCustomerBookings(args[0],args[1],args[2]));
      default:return reply({success:false,error:"不支援的讀取"},400);
    }
  }catch{return reply({success:false,error:"讀取未完成，請重試"},400);}
}
