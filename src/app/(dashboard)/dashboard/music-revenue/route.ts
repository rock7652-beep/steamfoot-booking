import {withMusicReadTiming} from "@/lib/music-read-timing";
import {z} from "zod";
import {courseManagerRead} from "@/server/services/course-access";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";
import {getCourseReceiptTotals} from "@/server/queries/course-home";
import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";

export const dynamic="force-dynamic";
const inputSchema=z.object({
 from:z.string().date(),to:z.string().date(),dataScope:z.enum(["operational","legacy"]).optional(),
 status:z.enum(["PENDING","CONFIRMED","REFUNDED","VOIDED"]).optional(),staff:z.string().max(100).optional(),
 page:z.string().regex(/^\d{1,6}$/).optional(),
});
export async function GET(request:Request){
 const detail:Record<string,number>={};
 return withMusicReadTiming(detail,()=>readRevenue(request,detail));
}
async function readRevenue(request:Request,detail:Record<string,number>){
 const start=performance.now();
 let authMs=0,totalsMs=0,transactionsMs=0;
 const authorization:Record<string,number>={};
 const timing={measure:async<T>(name:string,work:()=>Promise<T>)=>{const started=performance.now();try{return await work();}finally{authorization[name]=Math.round(performance.now()-started);}}};
 const reply=(value:Record<string,unknown>,status=200)=>{
  const timing={authMs,totalsMs,transactionsMs,totalMs:Math.round(performance.now()-start),authorization,detail};
  console.info("[music-revenue-read]",{status,...timing});
  return Response.json({...value,timing},{status,headers:{"Cache-Control":"private, no-store","Server-Timing":`auth;dur=${authMs}, totals;dur=${totalsMs}, transactions;dur=${transactionsMs}, revenue;dur=${timing.totalMs}`}});
 };
 try{
  const raw=new URL(request.url).searchParams.get("args")??"[]";
  if(raw.length>4000)return reply({success:false,error:"參數過長"},400);
  const args=z.tuple([inputSchema]).parse(JSON.parse(raw)),input=args[0];
  if(input.from>input.to)return reply({success:false,error:"日期區間無效"},400);
  const {storeId}=await courseManagerRead("transaction.read",{reuseVerifiedStore:true,timing});
  authMs=Math.round(performance.now()-start);
  if(!musicNativeWorkflowEnabled(storeId))return reply({success:false,error:"音樂功能未開通"},403);
  const queriesStart=performance.now();
  const [totals,transactions]=await Promise.all([
   getCourseReceiptTotals(storeId,input.from,input.to,input.dataScope).then(value=>{totalsMs=Math.round(performance.now()-queriesStart);return value;}),
   getMusicRevenueTransactions(storeId,input).then(value=>{transactionsMs=Math.round(performance.now()-queriesStart);return value;}),
  ]);
  return reply({success:true,data:{totals,transactions}});
 }catch{return reply({success:false,error:"營收讀取未完成，請重試"},400);}
}
