'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/db';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {beautyManager} from '@/server/beauty/access';
import {TECHNICIAN_NOTICE_KINDS,technicianNoticeSettingId,TECHNICIAN_NOTICE_LABELS} from '@/lib/beauty/technician-notifications';
import {handleActionError} from '@/lib/errors';
export async function setBeautyTechnicianNotification(input:unknown) {
 try {
  const data=z.object({kind:z.enum(TECHNICIAN_NOTICE_KINDS),enabled:z.boolean()}).parse(input);
  const a=await beautyManager('business_hours.manage',true);await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
  const id=technicianNoticeSettingId(a.storeId,data.kind);
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} AND "industryModule"::text='BEAUTY' FOR UPDATE`;
   await tx.messageTemplate.upsert({where:{id},create:{id,storeId:a.storeId,name:TECHNICIAN_NOTICE_LABELS[data.kind],channel:'LINE',body:data.enabled?'enabled':'disabled'},update:{body:data.enabled?'enabled':'disabled'}});
   if(!data.enabled)await tx.$executeRaw`UPDATE "BeautyEvent" SET status='SKIPPED' WHERE "storeId"=${a.storeId} AND kind=${data.kind} AND status IN ('PENDING','FAILED')`;
  });
  revalidatePath('/dashboard/beauty/reminders');return {success:true as const};
 }catch(e){return handleActionError(e);}
}
