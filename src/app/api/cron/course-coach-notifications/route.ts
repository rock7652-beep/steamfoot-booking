import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enqueueCoachDigests,runCoachNotifications } from '@/server/services/course-coach-notifications';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:NextRequest){
 if(!process.env.CRON_SECRET)return NextResponse.json({error:'Cron secret not configured'},{status:500});
 if(request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const run=await prisma.cronRunLog.create({data:{jobName:'course-coach-notifications',status:'STARTED'}});
 try {
  const queued=await enqueueCoachDigests(),result=await runCoachNotifications();
  await prisma.cronRunLog.update({where:{id:run.id},data:{status:result.failed?'PARTIAL':result.sent?'OK':'OK_EMPTY',finishedAt:new Date(),sent:result.sent,skipped:result.skipped,failed:result.failed,summary:{queued,...result}}});
  return NextResponse.json({queued,...result});
 }catch(error){await prisma.cronRunLog.update({where:{id:run.id},data:{status:'FAILED',finishedAt:new Date(),errorMessage:error instanceof Error?error.message:'Unknown'}});return NextResponse.json({error:'教練通知處理失敗'},{status:500});}
}
