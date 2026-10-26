'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {TECHNICIAN_NOTICE_KINDS,technicianNoticeSettingId} from '@/lib/beauty/technician-notifications';
import {handleActionError} from '@/lib/errors';
export async function setBeautyTechnicianNotification(input:unknown) {
 try {
  const data=z.object({kind:z.enum(TECHNICIAN_NOTICE_KINDS),enabled:z.boolean()}).parse(input);
  const a=await beautyManager('business_hours.manage',true);await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
  const id=technicianNoticeSettingId(a.storeId,data.kind);
  await beautyTransaction(a,async tx=>{
   await tx.beautyEvent.upsert({where:{id},create:{id,storeId:a.storeId,kind:'TECH_SETTING',status:'AUDIT',userId:a.userId,body:data.enabled?'enabled':'disabled'},update:{body:data.enabled?'enabled':'disabled',userId:a.userId}});
   await audit(tx,a,'TECH_NOTIFICATION_SETTING',JSON.stringify(data));
   if(!data.enabled)await tx.$executeRaw`UPDATE "BeautyEvent" SET status='SKIPPED',body='技師通知已關閉' WHERE "storeId"=${a.storeId} AND kind=${data.kind} AND status IN ('PENDING','FAILED')`;
  });
  revalidatePath('/dashboard/beauty/reminders');return {success:true as const};
 }catch(e){return handleActionError(e);}
}
