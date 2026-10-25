import { NextRequest,NextResponse } from "next/server";
import { runPlanActivationNotifications } from "@/server/services/plan-activation-notifications";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function GET(request:NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:"Cron secret not configured"},{status:500});
  if(request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const main=await runPlanActivationNotifications();
    const beauty=process.env.BEAUTY_MODULE_ENABLED==="1"?await runPlanActivationNotifications(undefined,true):null;
    return NextResponse.json({main,beauty},{status:main.failed||(beauty?.failed??0)?207:200});
  } catch {return NextResponse.json({error:"方案開通通知處理失敗"},{status:500});}
}
