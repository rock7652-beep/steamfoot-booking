import {courseSettingsSectionSaveInput,courseSettingsSectionRevision,courseSettingsSectionSchema} from '@/lib/course-settings-sections';
import {settingsSavePOST} from '@/server/services/settings-save-route';
import {beautyManager} from '@/server/beauty/access';
import {enqueueOperationAudit} from '@/server/services/operation-audit-outbox';
import {prisma} from '@/lib/db';
import {AppError,handleActionError} from '@/lib/errors';
import {revalidateShopConfigInRoute} from '@/lib/revalidation';
import {assertStoreSubscriptionWritable} from '@/lib/subscription-guard';
export const POST=settingsSavePOST(courseSettingsSectionSaveInput,async input=>{
 try{
  if(input.values.section!=='store')throw new AppError('FORBIDDEN','此入口只供店家資料');
  const a=await beautyManager('business_hours.manage',true),d=input.values;
  if(input.expectedStoreId!==a.storeId)throw new AppError('FORBIDDEN','店家已切換');
  await assertStoreSubscriptionWritable(a.storeId);
  const values=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} FOR UPDATE`;
   const store=await tx.store.findUniqueOrThrow({where:{id:a.storeId},select:{name:true}}),config=await tx.shopConfig.findUnique({where:{storeId:a.storeId}});
   const current=courseSettingsSectionSchema.parse({section:'store',name:store.name,address:config?.address??'',shopPhone:config?.shopPhone??'',mapUrl:config?.mapUrl??'',lineOfficialId:config?.lineOfficialId??'',lineOfficialUrl:config?.lineOfficialUrl??''});
   if(courseSettingsSectionRevision(current)!==input.expectedRevision){if(courseSettingsSectionRevision(current)===courseSettingsSectionRevision(d))return current;throw new AppError('CONFLICT','設定已有更新，請重新開啟核對。');}
   const {section:_,name,...fields}=d;void _;
   await tx.store.update({where:{id:a.storeId},data:{name}});
   await tx.shopConfig.upsert({where:{storeId:a.storeId},create:{storeId:a.storeId,shopName:name,...fields},update:{shopName:name,...fields}});
   await enqueueOperationAudit({actorUserId:a.userId!,storeId:a.storeId,module:'SHARED',targetType:'ShopConfig',targetId:a.storeId,action:'UPDATE_BEAUTY_STORE_SETTINGS',summary:'更新美業店家資料',before:current,after:d},tx);
   return d;
  });
  let syncWarning=false;try{revalidateShopConfigInRoute();}catch{syncWarning=true;}
  return {success:true,storeId:a.storeId,data:{values,revision:courseSettingsSectionRevision(values)},syncWarning};
 }catch(e){const r=handleActionError(e);return {success:false,error:r.success?'儲存失敗':r.error};}
});
