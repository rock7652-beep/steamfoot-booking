'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { courseManager } from '@/server/services/course-access';
import { requireStoreFeature } from '@/lib/feature-gate';
import { FEATURES } from '@/lib/feature-flags';
import { handleActionError } from '@/lib/errors';
import { COACH_NOTICE_KINDS,coachNoticeSettingId,COACH_NOTICE_LABELS } from '@/lib/course-coach-notifications';
export async function setCoachNotification(input:unknown) {
 try {
  const data=z.object({kind:z.enum(COACH_NOTICE_KINDS),enabled:z.boolean()}).parse(input);
  const {storeId}=await courseManager('business_hours.manage');await requireStoreFeature(storeId,FEATURES.LINE_REMINDER);
  const id=coachNoticeSettingId(storeId,data.kind);
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
   await tx.messageTemplate.upsert({where:{id},create:{id,storeId,name:COACH_NOTICE_LABELS[data.kind],channel:'LINE',body:data.enabled?'enabled':'disabled'},update:{body:data.enabled?'enabled':'disabled'}});
   if(!data.enabled)await tx.$executeRaw`UPDATE "CourseCoachNotification" SET status='SKIPPED',"errorMessage"='通知開關已關閉' WHERE "storeId"=${storeId} AND kind=${data.kind} AND status IN ('READY','FAILED')`;
  });
  revalidatePath('/dashboard/courses/reminders');return {success:true as const};
 }catch(error){return handleActionError(error);}
}
