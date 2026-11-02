import 'server-only';
import type {Prisma} from '@prisma/client';
import {FEATURES} from '@/lib/feature-flags';
import {resolveEffectiveEntitlement} from '@/lib/effective-entitlement';
import {prisma} from '@/lib/db';
import {addonsPrisma} from '@/lib/addons-db';
import {hasStoreFeature} from '@/lib/feature-gate';
import {AppError} from '@/lib/errors';
/** Use the caller's transaction connection; no cached grant or nested pool checkout. */
export async function requireAddOnManagement(tx:Prisma.TransactionClient,storeId:string){
 const grant=await tx.storeFeatureEntitlement.findUnique({where:{uq_store_feature_entitlement:{storeId,featureKey:FEATURES.ADD_ONS}},select:{status:true,startsAt:true,expiresAt:true}});
 if(!resolveEffectiveEntitlement(false,grant).enabled)throw new AppError('FORBIDDEN','附加項目尚未開通');
}
export async function requireAddOnSelection(tx:Prisma.TransactionClient,storeId:string,module:string){
 await requireAddOnManagement(tx,storeId);
 const catalog=await tx.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module}}});
 if(!catalog)throw new AppError('FORBIDDEN','尚未設定加購商品');
}

/** Beauty uses a separate domain client; read central entitlement and catalog availability here. */
export async function isAddOnSelectionEnabled(storeId:string,module:string){
 if(!await hasStoreFeature(storeId,FEATURES.ADD_ONS))return false;
 const catalog=await addonsPrisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module}},select:{storeId:true}});
 return !!catalog;
}
export async function requireBeautyAddOnSelection(storeId:string,tx?:BeautyFeatureReader){
 if(!await isBeautyServiceAddOnsEnabled(storeId,tx))throw new AppError('FORBIDDEN','附加選購已關閉，既有預約與款項保留');
}

export type BeautyFeatureReader={ $queryRaw<T=unknown>(query:TemplateStringsArray,...values:unknown[]):Promise<T> };
/** HQ controls service access; individual service options control availability. */
export async function isBeautyServiceAddOnsEnabled(storeId:string,tx:BeautyFeatureReader=prisma){
 const [grant]=await tx.$queryRaw<{industry:string;status:'ENABLED'|'DISABLED'|'LOCKED'|'HIDDEN'|null;startsAt:Date|null;expiresAt:Date|null}[]>`SELECT s."industryModule"::text AS industry,e.status,e."startsAt",e."expiresAt" FROM "Store" s LEFT JOIN "StoreFeatureEntitlement" e ON e."storeId"=s.id AND e."featureKey"=${FEATURES.BEAUTY_SERVICE_ADD_ONS} WHERE s.id=${storeId}`;
 return !!grant&&grant.industry==='BEAUTY'&&resolveEffectiveEntitlement(false,grant.status?{status:grant.status,startsAt:grant.startsAt,expiresAt:grant.expiresAt}:null).enabled;
}

export async function requireBeautyServiceAddOnManagement(storeId:string,tx:BeautyFeatureReader){
 const [row]=await tx.$queryRaw<{industry:string;status:'ENABLED'|'DISABLED'|'LOCKED'|'HIDDEN'|null;startsAt:Date|null;expiresAt:Date|null}[]>`SELECT s."industryModule"::text AS industry,e.status,e."startsAt",e."expiresAt" FROM "Store" s LEFT JOIN "StoreFeatureEntitlement" e ON e."storeId"=s.id AND e."featureKey"=${FEATURES.BEAUTY_SERVICE_ADD_ONS} WHERE s.id=${storeId}`;
 if(!row||row.industry!=='BEAUTY'||!resolveEffectiveEntitlement(false,row.status?{status:row.status,startsAt:row.startsAt,expiresAt:row.expiresAt}:null).enabled)throw new AppError('FORBIDDEN','加做服務尚未開通');
}
