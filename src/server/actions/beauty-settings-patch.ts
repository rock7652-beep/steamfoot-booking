'use server';
import {z} from 'zod';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {settings} from '@/server/beauty/booking';
import {AppError,handleActionError} from '@/lib/errors';
const input=z.object({storeId:z.string().min(1),key:z.enum(['selfBooking','selfCancel','selfReschedule','backendNoticesEnabled','notifications']),enabled:z.boolean(),previous:z.boolean()}).strict();
export async function saveBeautyOperationSwitch(raw:unknown){
 try{const d=input.parse(raw),a=await beautyManager('business_hours.manage',true);if(a.storeId!==d.storeId)throw new AppError('FORBIDDEN','店家已切換');
 if(d.key==='notifications')await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
 if(d.key==='backendNoticesEnabled')throw new AppError('VALIDATION','門市通知持續接收；提示音可在小鈴噹內調整');
 return await beautyTransaction(a,async tx=>{const current=await settings(tx,a.storeId);if(current[d.key]!==d.previous&&current[d.key]!==d.enabled)throw new AppError('CONFLICT','設定已更新，請重新整理');
 if(current[d.key]!==d.enabled){await tx.beautySetting.upsert({where:{storeId:a.storeId},create:{...current,[d.key]:d.enabled,revision:1},update:{[d.key]:d.enabled,revision:{increment:1}}});await audit(tx,a,'SETTINGS_SWITCH',JSON.stringify({key:d.key,enabled:d.enabled}));}
 return {success:true as const,data:{enabled:d.enabled}};});
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?'儲存失敗':r.error};}
}
