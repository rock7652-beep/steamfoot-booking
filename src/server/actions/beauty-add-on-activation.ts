"use server";
import {z} from 'zod';
import {moduleAddOnGroups,addOnCatalogError} from '@/lib/add-ons';
import {beautyPrisma} from '@/lib/beauty-db';
import {validateBeautyGoodsServices} from '@/lib/beauty/shared-goods';
import {hasStoreFeature} from '@/lib/feature-gate';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {beautyManager} from '@/server/beauty/access';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {requireAddOnManagement} from '@/server/services/add-on-access';
import {AppError,handleActionError} from '@/lib/errors';
import {revalidatePath} from 'next/cache';
import {addOnCommand} from '@/server/services/service-add-ons';
import {recordOperationAudit} from '@/server/services/operation-audit';
export async function readBeautyAddOnActivation(){try{
 const a=await beautyManager('add_ons.manage');await requireStoreFeature(a.storeId,FEATURES.ADD_ONS);
 const [c,services,serviceAddOnsAvailable]=await Promise.all([prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:a.storeId,module:'BEAUTY'}}}),beautyPrisma.beautyService.findMany({where:{storeId:a.storeId},select:{id:true,name:true,active:true},orderBy:[{name:'asc'},{id:'asc'}]}),hasStoreFeature(a.storeId,FEATURES.BEAUTY_SERVICE_ADD_ONS)]);
 return {success:true as const,data:{storeId:a.storeId,subjects:services.map(s=>({id:s.id,name:s.name,isActive:s.active})),serviceAddOnsAvailable,revision:c?.revision??0,enabled:c?.enabled??false,groups:moduleAddOnGroups('BEAUTY',c?.groups??[])}};
}catch(e){return handleActionError(e);}}
export async function saveBeautyAddOnActivation(input:unknown){try{
 const a=await beautyManager('add_ons.manage',true);await requireStoreFeature(a.storeId,FEATURES.ADD_ONS);
 const d=z.object({storeId:z.string(),revision:z.number().int().nonnegative(),groups:z.unknown().optional(),requestKey:z.string().uuid()}).parse(input);
 if(d.storeId!==a.storeId||!a.userId)throw new AppError('FORBIDDEN','門市已切換');
 let groups;try{groups=d.groups===undefined?undefined:moduleAddOnGroups('BEAUTY',d.groups);if(groups?.some(g=>g.kind!=='SHARED_GOODS'))throw new Error('此處僅設定共同商品，個人加做請至服務項目');}catch(e){throw new AppError('VALIDATION',addOnCatalogError(e));}
 const actor={storeId:a.storeId,userId:a.userId,staffId:null};
 const data=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} FOR UPDATE`;await requireAddOnManagement(tx,a.storeId);
  return addOnCommand(tx,actor,d.requestKey,{module:'BEAUTY',...d},async()=>{
   const where={storeId_module:{storeId:a.storeId,module:'BEAUTY'}};
   const current=await tx.serviceAddOnCatalog.findUnique({where});
   if((current?.revision??0)!==d.revision)throw new AppError('CONFLICT','設定已更新，請重新開啟');
   if(groups){
    const ids=[...new Set(groups.flatMap(g=>g.subjectIds??[]))];
    const services=ids.length?await beautyPrisma.beautyService.findMany({where:{storeId:a.storeId,id:{in:ids}},select:{id:true,active:true}}):[];
    try{validateBeautyGoodsServices(groups,moduleAddOnGroups('BEAUTY',current?.groups??[]),services);}catch(error){throw new AppError('VALIDATION',error instanceof Error?error.message:'請核對適用服務');}
   }
   const images=(groups??[]).flatMap(g=>g.options.flatMap(o=>o.imageId?[o.imageId]:[]));
   if(images.length&&(await tx.serviceAddOnImage.count({where:{storeId:a.storeId,module:'BEAUTY',id:{in:[...new Set(images)]}}}))!==new Set(images).size)throw new AppError('FORBIDDEN','圖片不屬於本店');
   const saved=await tx.serviceAddOnCatalog.upsert({where,create:{storeId:a.storeId,module:'BEAUTY',groups:groups??[],enabled:true,revision:1},update:{...(groups===undefined?{}:{groups}),enabled:true,revision:{increment:1}}});
   await recordOperationAudit({actorUserId:actor.userId,storeId:a.storeId,module:'SHARED',targetType:'ServiceAddOnCatalog',targetId:a.storeId,action:'SET_BEAUTY_ADD_ONS_ENABLED',summary:'儲存美業加購商品',before:{enabled:current?.enabled??false,groups:current?.groups??[]},after:{enabled:saved.enabled,groups:saved.groups}},tx);
   return {revision:saved.revision};
  });
 });revalidatePath('/dashboard/add-ons');revalidatePath('/dashboard/beauty');return {success:true as const,data};
}catch(e){return handleActionError(e);}}
