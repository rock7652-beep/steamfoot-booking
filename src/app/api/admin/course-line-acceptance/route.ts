import {auth} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {readPreviewLineAcceptance,withPreviewLineAcceptance} from "@/lib/preview-line-acceptance";
import {runCourseReminders} from "@/server/services/course-reminders";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function permitted(){
 if(process.env.VERCEL_ENV!=="preview" || process.env.VERCEL_GIT_COMMIT_REF!=="codex/course-scheduling-stage1" || !(process.env.DATABASE_URL??"").includes("ttworfzgwejdeolegkxl"))return false;
 const session=await auth();if(session?.user?.role!=="ADMIN")return false;
 return !!await prisma.user.findFirst({where:{id:session.user.id,role:"ADMIN",status:"ACTIVE"},select:{id:true}});
}
export async function GET(){
 if(!await permitted())return new Response(null,{status:404});
 const token=process.env.LINE_COURSE_A_CHANNEL_ACCESS_TOKEN;
 if(!token)return Response.json({error:"token_missing"},{status:503});
 const r=await fetch("https://api.line.me/v2/bot/info",{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000),cache:"no-store"});
 if(!r.ok)return Response.json({error:"bot_check_failed",status:r.status},{status:503});
 const b=await r.json();
 if(b.basicId!=="@196rdlvi")return Response.json({error:"wrong_bot"},{status:409});
 return Response.json({basicId:b.basicId,displayName:b.displayName,destination:b.userId,grantConfigured:!!readPreviewLineAcceptance()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 if(!await permitted())return new Response(null,{status:404});
 if(request.headers.get("origin")!==new URL(request.url).origin)return new Response(null,{status:403});
 const grant=readPreviewLineAcceptance();if(!grant)return Response.json({error:"acceptance_not_authorized"},{status:403});
 const body=await request.json().catch(()=>null);if(body?.confirm!=="SEND_ONE_TEST_REMINDER")return new Response(null,{status:400});
 // Actual current-day candidate selection; never advance the clock to send a future event.
 const result=await withPreviewLineAcceptance(grant,()=>runCourseReminders(new Date(),grant.storeId));
 return Response.json(result,{headers:{"Cache-Control":"no-store"}});
}
