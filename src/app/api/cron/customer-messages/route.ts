import { NextRequest,NextResponse } from "next/server";
import { runCustomerMessages } from "@/server/services/customer-message-worker";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(request:NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:"Cron secret not configured"},{status:500});
  if(request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json({ok:true,...await runCustomerMessages()});}
  catch{console.error("[customer-messages] worker failed");return NextResponse.json({ok:false,error:"Worker failed"},{status:500});}
}
